/**
 * Verificação da central de notificações — CONECTA
 *
 * O que estes testes prendem são as coisas que já deram errado aqui:
 *
 *  1. O AVISO É DE QUEM RESPONDE PELA PESSOA. O Elias, que é TI, recebeu
 *     o pedido de folga da Dani — que tem responsável próprio. Com 89
 *     pessoas em 5 lojas, cada administrador receberia a rede inteira.
 *  2. DISPENSAR TIRA O AVISO, NÃO O TRABALHO. A decisão continua
 *     esperando na tela dela; o sino é o aviso, não a fila.
 *  3. O ID É ESTÁVEL. Foi o id sorteado a cada leitura que fez a mesma
 *     notificação antiga voltar a cada login — o laço original.
 */
import { test, expect, mock, beforeEach } from 'bun:test';

class ArmazenamentoFalso {
  private dados = new Map<string, string>();
  getItem(k: string) { return this.dados.has(k) ? this.dados.get(k)! : null; }
  setItem(k: string, v: string) { this.dados.set(k, String(v)); }
  removeItem(k: string) { this.dados.delete(k); }
  clear() { this.dados.clear(); }
}
const armazenamento = new ArmazenamentoFalso();
(globalThis as any).localStorage = armazenamento;

/**
 * A rede do teste, montada como a de verdade:
 *
 *   TI (Elias)        — cuida de pessoas, enxerga tudo, responde por ninguém
 *   GERENTE           — responsável da LIDER
 *     └ LIDER         — responsável da DANI
 *         └ DANI      — quem faz os pedidos
 *   SOLTO             — nunca foi posicionado na cadeia
 */
const BASE = {
  cargo: 'Balconista', setor: 'Balcão', loja: 'Pirassununga', foto: '',
  presenca: 'disponivel', vistoPorUltimo: 'agora', ativo: true,
};
const TI = { ...BASE, id: 'ti', nome: 'Elias', login: 'elias', setor: 'TI', nivel: 5 };
const GERENTE = { ...BASE, id: 'gerente', nome: 'Gerente', login: 'ger', nivel: 3 };
const LIDER = { ...BASE, id: 'lider', nome: 'Líder', login: 'lid', nivel: 2, responsavelId: 'gerente' };
const DANI = { ...BASE, id: 'dani', nome: 'Dani', login: 'dani', nivel: 1, responsavelId: 'lider' };
const SOLTO = { ...BASE, id: 'solto', nome: 'Solto', login: 'solto', nivel: 1 };

const REDE = [TI, GERENTE, LIDER, DANI, SOLTO];

let logado: any = LIDER;
let porLer: any[] = [];
let jornadas: any[] = [];
let ausencias: any[] = [];
let folgas: any[] = [];
/** O que `justificativas` responderia sobre avisar de uma ausência. */
let avisaAusencia = true;

mock.module('./bancoDados', () => ({
  bancoDados: {
    obterColaboradorAtual: () => logado,
    obterColaboradorPorId: (id: string) => REDE.find((c) => c.id === id),
    obterColaboradores: () => REDE,
    obterMensagensPorLer: () => porLer,
    obterConversaPorId: (id: string) => ({ id, tipo: 'individual', nome: 'Conversa' }),
  },
}));
mock.module('./ponto', () => ({
  servicoPonto: { obterPendenciasParaDecidir: () => jornadas },
  formatarDataBR: (d: string) => d,
}));
mock.module('./justificativas', () => ({
  pendenciasParaDecidir: () => ausencias,
  pendenciasDeFolga: () => folgas,
  /**
   * Atestado é do RH, e o aviso dele também — mas essa regra mora em
   * `justificativas`, com teste próprio lá. O que cabe a ESTE arquivo
   * provar é que ele PERGUNTA e OBEDECE, e por isso a resposta aqui é
   * uma chave que os testes viram.
   */
  deveSerAvisadoDeAusencia: () => avisaAusencia,
}));
mock.module('./nuvemComunicacao', () => ({
  montarPreviaDaMensagem: (m: any) => m.texto || '',
}));

const {
  listarNotificacoes,
  contarNotificacoes,
  limparNotificacoes,
  dispensarNotificacao,
  assinarNotificacoes,
} = await import('./centralDeNotificacoes');

/**
 * As filas chegam JÁ com a alçada aplicada — é assim na vida real, porque
 * `pendenciasParaDecidir` filtra por `podeDecidirSobre`. Aqui elas vêm
 * cheias de propósito: o que se testa é o filtro DO SINO, que é mais
 * estreito que o da alçada.
 */
const folgaDe = (colaborador: any, id = 'f1') => ({
  justificativa: { id, tipo: 'folga_sabado', dataInicio: '2026-09-26', criadoEm: '2026-09-21T08:00:00.000Z' },
  colaborador,
});
const jornadaDe = (colaborador: any, id = 'a1') => ({
  ajuste: { id, tipo: 'hora_extra', data: '2026-09-21', criadoEm: '2026-09-21T10:00:00.000Z' },
  colaborador,
});
const umaMensagem = (id: string, conversaId = 'c1', criadoEm = '2026-09-21T09:00:00.000Z') => ({
  id, conversaId, remetenteId: 'dani', texto: 'Oi', criadoEm,
});

beforeEach(() => {
  armazenamento.clear();
  logado = LIDER;
  porLer = [];
  jornadas = [];
  ausencias = [];
  folgas = [];
  avisaAusencia = true;
});

// ---------------------------------------------------------------
// 1. O aviso é de quem responde pela pessoa
// ---------------------------------------------------------------

test('o TI NÃO é avisado do pedido de quem já tem responsável', () => {
  folgas = [folgaDe(DANI)];

  // Foi exatamente isto que o Elias viu: o pedido da Dani chegando nele
  logado = TI;
  expect(contarNotificacoes()).toBe(0);
});

test('o responsável direto É avisado', () => {
  folgas = [folgaDe(DANI)];

  logado = LIDER;
  expect(contarNotificacoes()).toBe(1);
});

test('quem está acima na cadeia também é avisado', () => {
  folgas = [folgaDe(DANI)];

  // O gerente responde pela líder, que responde pela Dani
  logado = GERENTE;
  expect(contarNotificacoes()).toBe(1);
});

test('quem não está na cadeia não é avisado, mesmo podendo decidir', () => {
  folgas = [folgaDe(DANI)];

  // A líder de outro ramo: a alçada pode até alcançar, o aviso não
  logado = { ...LIDER, id: 'outra', responsavelId: 'gerente' };
  expect(contarNotificacoes()).toBe(0);
});

test('pedido de quem NÃO tem ninguém acima cai para quem cuida de pessoas', () => {
  folgas = [folgaDe(SOLTO)];

  // Sem esta rede de segurança o pedido não seria avisado a NINGUÉM, e é
  // justamente o TI quem pode consertar o organograma
  logado = TI;
  expect(contarNotificacoes()).toBe(1);

  logado = LIDER;
  expect(contarNotificacoes()).toBe(0);
});

test('a regra da cadeia vale para jornada, não só para folga', () => {
  jornadas = [jornadaDe(DANI)];

  logado = TI;
  expect(contarNotificacoes()).toBe(0);

  logado = LIDER;
  expect(contarNotificacoes()).toBe(1);
});

test('a ausência obedece a quem manda nela, e não à cadeia', () => {
  /**
   * Atestado mudou de dono: quem decide — e quem é avisado — é o RH, e
   * não a cadeia. A regra mora em `justificativas`, porque é lá que
   * ficam todas as regras de ausência.
   *
   * O que se prende AQUI é que o sino pergunta e obedece. Uma segunda
   * cópia da regra dentro deste arquivo seria a quinta vez que este
   * sistema se contradiz sozinho.
   */
  ausencias = [{
    justificativa: {
      id: 'j1',
      tipo: 'atestado',
      dataInicio: '2026-09-21',
      criadoEm: '2026-09-21T07:00:00.000Z',
    },
    colaborador: DANI,
  }];

  // A líder responde pela Dani — e ainda assim não é avisada do atestado
  logado = LIDER;
  avisaAusencia = false;
  expect(contarNotificacoes()).toBe(0);

  avisaAusencia = true;
  expect(contarNotificacoes()).toBe(1);
});

test('mensagem NÃO passa pelo filtro de cadeia', () => {
  porLer = [umaMensagem('m1')];

  // Mensagem já chega endereçada: filtrar por organograma calaria o chat
  // de quem não é da equipe de ninguém
  logado = TI;
  expect(contarNotificacoes()).toBe(1);
});

// ---------------------------------------------------------------
// 2. Dispensar tira o aviso, não o trabalho
// ---------------------------------------------------------------

test('dispensar UMA tira só ela, e as outras ficam', () => {
  jornadas = [jornadaDe(DANI, 'a1'), jornadaDe(DANI, 'a2')];

  const primeira = listarNotificacoes()[0];
  dispensarNotificacao(primeira.id);

  const sobrando = listarNotificacoes();
  expect(sobrando).toHaveLength(1);
  expect(sobrando[0].id).not.toBe(primeira.id);
});

test('dispensar não resolve a pendência: ela volta se o aviso for reposto', () => {
  jornadas = [jornadaDe(DANI, 'a1')];
  dispensarNotificacao(listarNotificacoes()[0].id);
  expect(contarNotificacoes()).toBe(0);

  // A fila de verdade continua com a jornada — o sino é o aviso, não ela
  expect(jornadas).toHaveLength(1);
});

test('limpar todas esvazia o sino sem calar o que chegar depois', () => {
  jornadas = [jornadaDe(DANI, 'a1')];
  limparNotificacoes();
  expect(contarNotificacoes()).toBe(0);

  // Limpar é esvaziar a caixa, não desligar o sino
  jornadas = [jornadaDe(DANI, 'a1'), jornadaDe(DANI, 'a2')];
  expect(contarNotificacoes()).toBe(1);
});

test('pendência decidida some sozinha, sem passar por dispensar', () => {
  jornadas = [jornadaDe(DANI)];
  expect(contarNotificacoes()).toBe(1);

  jornadas = [];
  expect(contarNotificacoes()).toBe(0);
});

test('o que uma pessoa dispensou não some da outra', () => {
  folgas = [folgaDe(DANI)];

  logado = LIDER;
  limparNotificacoes();
  expect(contarNotificacoes()).toBe(0);

  // Mesmo aparelho, outra conta: o aviso é dela e continua de pé
  logado = GERENTE;
  expect(contarNotificacoes()).toBe(1);
});

// ---------------------------------------------------------------
// 3. O id é estável — o laço não volta
// ---------------------------------------------------------------

test('o id da notificação não muda entre leituras', () => {
  jornadas = [jornadaDe(DANI)];
  expect(listarNotificacoes()[0].id).toBe(listarNotificacoes()[0].id);
});

test('dispensar sobrevive a uma releitura', () => {
  jornadas = [jornadaDe(DANI)];
  dispensarNotificacao(listarNotificacoes()[0].id);
  expect(contarNotificacoes()).toBe(0);
});

test('mensagem dispensada volta a avisar quando chega outra na conversa', () => {
  logado = TI;
  porLer = [umaMensagem('m1', 'c1')];
  dispensarNotificacao(listarNotificacoes()[0].id);
  expect(contarNotificacoes()).toBe(0);

  // A conversa se mexeu de novo: é novidade de novo
  porLer = [umaMensagem('m1', 'c1'), umaMensagem('m2', 'c1', '2026-09-21T09:30:00.000Z')];
  expect(contarNotificacoes()).toBe(1);
});

// ---------------------------------------------------------------
// As fontes e o destino
// ---------------------------------------------------------------

test('mensagens da mesma conversa viram UMA linha, com a contagem', () => {
  logado = TI;
  porLer = [umaMensagem('m1'), umaMensagem('m2'), umaMensagem('m3')];

  const itens = listarNotificacoes();
  expect(itens).toHaveLength(1);
  expect(itens[0].detalhe).toBe('3 mensagens novas');
});

test('conversas diferentes não se misturam', () => {
  logado = TI;
  porLer = [umaMensagem('m1', 'c1'), umaMensagem('m2', 'c2')];
  expect(listarNotificacoes()).toHaveLength(2);
});

test('cada fonte leva ao lugar onde ela se resolve', () => {
  jornadas = [jornadaDe(DANI)];
  folgas = [folgaDe(DANI)];
  porLer = [umaMensagem('m1', 'c9')];

  const porTipo = Object.fromEntries(listarNotificacoes().map((n) => [n.tipo, n.destino]));

  // Jornada se decide em "Aprovar jornadas"; folga, na Escala — decidir
  // folga sem ver o calendário foi o que separou as duas filas
  expect(porTipo.jornada).toEqual({ tipo: 'secao', secao: 'aprovar_jornadas' });
  expect(porTipo.folga).toEqual({ tipo: 'secao', secao: 'escala_folgas' });
  expect(porTipo.mensagem).toEqual({ tipo: 'conversa', conversaId: 'c9' });
});

test('a lista vem da mais recente para a mais antiga', () => {
  porLer = [umaMensagem('m1', 'c1', '2026-09-20T08:00:00.000Z')];
  jornadas = [jornadaDe(DANI)]; // 21/09, mais nova

  expect(listarNotificacoes().map((n) => n.tipo)).toEqual(['jornada', 'mensagem']);
});

test('quem assina é avisado quando algo muda', () => {
  jornadas = [jornadaDe(DANI)];
  let avisos = 0;
  const parar = assinarNotificacoes(() => { avisos += 1; });

  limparNotificacoes();
  expect(avisos).toBe(1);

  // Sem isto o número do sino só cairia no próximo desenho da tela
  parar();
  limparNotificacoes();
  expect(avisos).toBe(1);
});
