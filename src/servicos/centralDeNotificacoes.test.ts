/**
 * Verificação da central de notificações — CONECTA
 *
 * O que estes testes prendem são as três coisas que já deram errado aqui,
 * ou que dariam:
 *
 *  1. LIMPAR NÃO RESOLVE. Uma jornada esperando decisão continua na lista
 *     depois de limpa. Se limpar apagasse, um toque errado sumiria com
 *     cinco decisões pendentes da vista de quem precisa tomá-las.
 *  2. O "VISTO" É DE CADA PESSOA. O balcão tem aparelho compartilhado; o
 *     que um viu não pode calar o aviso do outro.
 *  3. O ID É ESTÁVEL. Foi o id sorteado a cada leitura que fez a mesma
 *     notificação antiga voltar a cada login — o laço de que o Elias
 *     reclamou.
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

const CHEFE = {
  id: 'chefe', nome: 'Chefe', login: 'chefe', cargo: 'Gerente', setor: 'Gerência',
  loja: 'Pirassununga', nivel: 3, foto: '', presenca: 'disponivel',
  vistoPorUltimo: 'agora', ativo: true,
};
const ANA = { ...CHEFE, id: 'ana', nome: 'Ana', login: 'ana', nivel: 1, responsavelId: 'chefe' };

let logado: any = CHEFE;
let porLer: any[] = [];
let jornadas: any[] = [];
let ausencias: any[] = [];
let folgas: any[] = [];

mock.module('./bancoDados', () => ({
  bancoDados: {
    obterColaboradorAtual: () => logado,
    obterColaboradorPorId: (id: string) => [CHEFE, ANA].find((c) => c.id === id),
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
}));
mock.module('./nuvemComunicacao', () => ({
  montarPreviaDaMensagem: (m: any) => m.texto || '',
}));

const {
  listarNotificacoes,
  contarNaoVistas,
  limparNotificacoes,
  marcarVista,
  assinarNotificacoes,
} = await import('./centralDeNotificacoes');

const umaJornada = (id = 'a1') => ({
  ajuste: { id, tipo: 'hora_extra', data: '2026-09-21', criadoEm: '2026-09-21T10:00:00.000Z' },
  colaborador: ANA,
});

const umaMensagem = (id: string, conversaId = 'c1', criadoEm = '2026-09-21T09:00:00.000Z') => ({
  id, conversaId, remetenteId: 'ana', texto: 'Oi', criadoEm,
});

beforeEach(() => {
  armazenamento.clear();
  logado = CHEFE;
  porLer = [];
  jornadas = [];
  ausencias = [];
  folgas = [];
});

// ---------------------------------------------------------------
// 1. Limpar não resolve
// ---------------------------------------------------------------

test('limpar zera o contador mas NÃO tira a pendência da lista', () => {
  jornadas = [umaJornada()];
  expect(contarNaoVistas()).toBe(1);

  limparNotificacoes();

  // O contador some...
  expect(contarNaoVistas()).toBe(0);
  // ...mas a jornada continua esperando decisão, porque continua pendente
  expect(listarNotificacoes()).toHaveLength(1);
  expect(listarNotificacoes()[0].vista).toBe(true);
});

test('pendência decidida sai da lista sozinha, sem passar por limpar', () => {
  jornadas = [umaJornada()];
  expect(listarNotificacoes()).toHaveLength(1);

  // Quem resolve é a decisão, e não o sino
  jornadas = [];
  expect(listarNotificacoes()).toHaveLength(0);
});

test('pendência NOVA volta a contar depois de limpar', () => {
  jornadas = [umaJornada('a1')];
  limparNotificacoes();
  expect(contarNaoVistas()).toBe(0);

  // Limpar não pode calar o que ainda nem existia
  jornadas = [umaJornada('a1'), umaJornada('a2')];
  expect(contarNaoVistas()).toBe(1);
});

// ---------------------------------------------------------------
// 2. O "visto" é de cada pessoa
// ---------------------------------------------------------------

test('o que uma pessoa limpou não silencia a notificação da outra', () => {
  jornadas = [umaJornada()];

  logado = CHEFE;
  limparNotificacoes();
  expect(contarNaoVistas()).toBe(0);

  // Mesmo aparelho, outra conta: o aviso é dela e continua de pé
  logado = ANA;
  expect(contarNaoVistas()).toBe(1);
});

// ---------------------------------------------------------------
// 3. O id é estável — o laço não volta
// ---------------------------------------------------------------

test('o id da notificação não muda entre leituras', () => {
  jornadas = [umaJornada()];

  const primeira = listarNotificacoes()[0].id;
  const segunda = listarNotificacoes()[0].id;

  // Id sorteado a cada leitura faria tudo voltar a ser novidade a cada
  // abertura do sistema: é o laço que o sino veio desfazer
  expect(primeira).toBe(segunda);
});

test('marcar vista sobrevive a uma releitura', () => {
  jornadas = [umaJornada()];
  marcarVista(listarNotificacoes()[0].id);

  expect(contarNaoVistas()).toBe(0);
});

// ---------------------------------------------------------------
// As fontes e o destino
// ---------------------------------------------------------------

test('mensagens da mesma conversa viram UMA linha, com a contagem', () => {
  porLer = [umaMensagem('m1'), umaMensagem('m2'), umaMensagem('m3')];

  const itens = listarNotificacoes();
  // Três linhas iguais empilhadas seriam três vezes o mesmo recado
  expect(itens).toHaveLength(1);
  expect(itens[0].detalhe).toBe('3 mensagens novas');
});

test('conversas diferentes não se misturam', () => {
  porLer = [umaMensagem('m1', 'c1'), umaMensagem('m2', 'c2')];
  expect(listarNotificacoes()).toHaveLength(2);
});

test('cada fonte leva ao lugar onde ela se resolve', () => {
  jornadas = [umaJornada()];
  folgas = [{
    justificativa: { id: 'f1', tipo: 'folga_sabado', dataInicio: '2026-09-26', criadoEm: '2026-09-21T08:00:00.000Z' },
    colaborador: ANA,
  }];
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
  jornadas = [umaJornada()]; // 21/09, mais nova

  expect(listarNotificacoes().map((n) => n.tipo)).toEqual(['jornada', 'mensagem']);
});

test('quem assina é avisado quando algo muda', () => {
  jornadas = [umaJornada()];
  let avisos = 0;
  const parar = assinarNotificacoes(() => { avisos += 1; });

  limparNotificacoes();
  expect(avisos).toBe(1);

  // Sem isto o número do sino só cairia no próximo desenho da tela
  parar();
  limparNotificacoes();
  expect(avisos).toBe(1);
});
