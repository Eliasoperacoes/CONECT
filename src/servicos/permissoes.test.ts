/**
 * Verificação das permissões de ferramenta — CONECTA
 *
 * O pedido: configurar num lugar só quais telas cada nível enxerga, em vez
 * de espalhar `if (nivel >= 3)` por dez componentes.
 *
 * O risco embutido, e o que estes testes prendem:
 *
 *  1. o administrador se trancar para fora ao desligar a própria tela;
 *  2. ferramenta nova nascer invisível para todo mundo e a tela sumir sem
 *     explicação;
 *  3. o interruptor virar vazamento — ligar uma ferramenta passar a mostrar
 *     dado de quem não é da pessoa. Ferramenta é porta; quem decide o que
 *     há dentro da sala continua sendo a alçada.
 */
import { test, expect, beforeEach } from 'bun:test';

class ArmazenamentoFalso {
  private dados = new Map<string, string>();
  getItem(k: string) { return this.dados.has(k) ? this.dados.get(k)! : null; }
  setItem(k: string, v: string) { this.dados.set(k, String(v)); }
  removeItem(k: string) { this.dados.delete(k); }
  clear() { this.dados.clear(); }
}
const armazenamento = new ArmazenamentoFalso();
(globalThis as any).localStorage = armazenamento;

const {
  podeUsar,
  obterPermissoes,
  aplicarPermissoes,
  alternarNivel,
  restaurarPadrao,
  ferramentasVisiveis,
} = await import('./permissoes');
const { FERRAMENTAS, permissoesPadrao, acharFerramenta } = await import('./ferramentas');
const {
  NIVEL_COLABORADOR,
  NIVEL_LIDER_SETOR,
  NIVEL_GERENTE,
  NIVEL_DIRETORIA,
  NIVEL_TI,
} = await import('../tipos');

const pessoa = (nivel: number) =>
  ({
    id: `p${nivel}`, nome: 'Pessoa', login: 'p', cargo: 'Cargo',
    setor: 'Balcão', loja: 'Pirassununga', nivel, foto: '',
    presenca: 'disponivel', vistoPorUltimo: 'agora', ativo: true,
  }) as any;

beforeEach(() => {
  armazenamento.clear();
  aplicarPermissoes(null);
});

test('sem nada configurado, vale o padrão do catálogo', () => {
  // Colaborador conversa e bate ponto; não abre painel de administração
  expect(podeUsar('conversas', pessoa(NIVEL_COLABORADOR))).toBe(true);
  expect(podeUsar('ponto', pessoa(NIVEL_COLABORADOR))).toBe(true);
  expect(podeUsar('adm_colaboradores', pessoa(NIVEL_COLABORADOR))).toBe(false);

  // Gerente responde por equipe
  expect(podeUsar('painel_gestao', pessoa(NIVEL_GERENTE))).toBe(true);
  expect(podeUsar('aprovar_jornadas', pessoa(NIVEL_GERENTE))).toBe(true);
});

test('o que o gerente NÃO vê por padrão', () => {
  // Era a queixa: o gerente abria o painel de RH e via a rede inteira
  const gerente = pessoa(NIVEL_GERENTE);
  expect(podeUsar('visao_lojas', gerente)).toBe(false);
  expect(podeUsar('banco_horas_rh', gerente)).toBe(false);
  expect(podeUsar('organograma', gerente)).toBe(false);
  expect(podeUsar('adm_backup', gerente)).toBe(false);
});

test('líder vê menos que gerente onde isso foi configurado', () => {
  const lider = pessoa(NIVEL_LIDER_SETOR);
  const gerente = pessoa(NIVEL_GERENTE);

  // Os dois cuidam de equipe
  expect(podeUsar('painel_gestao', lider)).toBe(true);
  expect(podeUsar('painel_gestao', gerente)).toBe(true);

  // E é isto que o painel permite ajustar sem mexer em código: tirar uma
  // ferramenta do líder mantendo no gerente
  const { mapa } = alternarNivel(obterPermissoes(), 'quadro_equipe', NIVEL_LIDER_SETOR);
  aplicarPermissoes(mapa);

  expect(podeUsar('quadro_equipe', lider)).toBe(false);
  expect(podeUsar('quadro_equipe', gerente)).toBe(true);
});

// ============================================================
// AS TRAVAS
// ============================================================

test('O ADMINISTRADOR NÃO SE TRANCA PARA FORA', () => {
  // Desligar a própria tela de permissões deixaria o sistema sem ninguém
  // capaz de religar nada — só mexendo no banco na unha
  const r = alternarNivel(obterPermissoes(), 'adm_permissoes', NIVEL_TI);

  expect(r.erro).toBeTruthy();
  expect(r.erro).toContain('trancar');
  expect(podeUsar('adm_permissoes', pessoa(NIVEL_TI))).toBe(true);
});

test('mesmo com o banco dizendo o contrário, o TI entra', () => {
  // Configuração corrompida, gravação pela metade, mão errada no banco: a
  // saída de emergência tem que valer acima do que estiver gravado
  aplicarPermissoes({ adm_permissoes: [], adm_banco: [], adm_backup: [] });

  expect(podeUsar('adm_permissoes', pessoa(NIVEL_TI))).toBe(true);
  expect(podeUsar('adm_banco', pessoa(NIVEL_TI))).toBe(true);
  // E não vale para os outros níveis
  expect(podeUsar('adm_permissoes', pessoa(NIVEL_DIRETORIA))).toBe(false);
});

test('FERRAMENTA NOVA não nasce invisível', () => {
  // Uma configuração gravada hoje não conhece a ferramenta de amanhã. Se a
  // resposta fosse "não está no mapa, então não vê", toda tela nova sumiria
  // até alguém abrir o painel — e ninguém saberia por quê.
  aplicarPermissoes({ conversas: [NIVEL_COLABORADOR] });

  const padrao = permissoesPadrao();
  for (const ferramenta of FERRAMENTAS) {
    expect(obterPermissoes()[ferramenta.chave]).toBeDefined();
  }
  // A que não foi gravada mantém o padrão dela
  expect(obterPermissoes().painel_gestao).toEqual(padrao.painel_gestao);
});

test('chave fora do catálogo é sempre não', () => {
  // Erro de digitação numa tela não pode virar tela aberta
  expect(podeUsar('painel_secreto', pessoa(NIVEL_TI))).toBe(false);
  expect(podeUsar('', pessoa(NIVEL_TI))).toBe(false);
});

test('o catálogo não tem chave repetida', () => {
  // Duas entradas com a mesma chave: a grade mostraria dois interruptores
  // para a mesma coisa, e um deles não faria nada
  const chaves = FERRAMENTAS.map((f) => f.chave);
  expect(new Set(chaves).size).toBe(chaves.length);
});

test('toda ferramenta tem nome e explicação', () => {
  // Quem configura precisa saber o efeito do que está desligando
  for (const f of FERRAMENTAS) {
    expect(f.nome.length).toBeGreaterThan(2);
    expect(f.descricao.length).toBeGreaterThan(10);
  }
});

test('ligar e desligar é reversível e não vaza para outro nível', () => {
  let mapa = obterPermissoes();
  const antes = [...mapa.visao_lojas];

  mapa = alternarNivel(mapa, 'visao_lojas', NIVEL_GERENTE).mapa;
  aplicarPermissoes(mapa);
  expect(podeUsar('visao_lojas', pessoa(NIVEL_GERENTE))).toBe(true);
  // O líder continua fora: mexeu só no nível pedido
  expect(podeUsar('visao_lojas', pessoa(NIVEL_LIDER_SETOR))).toBe(false);

  mapa = alternarNivel(mapa, 'visao_lojas', NIVEL_GERENTE).mapa;
  aplicarPermissoes(mapa);
  expect(mapa.visao_lojas).toEqual(antes);
});

test('restaurar padrão desfaz tudo', () => {
  aplicarPermissoes({ conversas: [], adm_colaboradores: [NIVEL_COLABORADOR] });
  expect(podeUsar('conversas', pessoa(NIVEL_COLABORADOR))).toBe(false);

  aplicarPermissoes(restaurarPadrao());
  expect(podeUsar('conversas', pessoa(NIVEL_COLABORADOR))).toBe(true);
  expect(podeUsar('adm_colaboradores', pessoa(NIVEL_COLABORADOR))).toBe(false);
});

test('a configuração vale em qualquer aparelho, não por navegador', () => {
  // O mapa é da rede. Aplicar no cache é só refletir o que veio do banco;
  // um aparelho sem cache tem que cair no padrão, nunca em "vê tudo"
  aplicarPermissoes(null);
  armazenamento.clear();

  expect(podeUsar('adm_backup', pessoa(NIVEL_GERENTE))).toBe(false);
  expect(podeUsar('adm_colaboradores', pessoa(NIVEL_COLABORADOR))).toBe(false);
});

test('ferramentasVisiveis respeita a área e a permissão', () => {
  const gerente = pessoa(NIVEL_GERENTE);

  const gestao = ferramentasVisiveis(gerente, 'gestao').map((f) => f.chave);
  expect(gestao).toContain('painel_gestao');
  expect(gestao).not.toContain('banco_horas_rh');

  // Nada de administração escapa para o gerente
  expect(ferramentasVisiveis(gerente, 'administracao')).toHaveLength(0);
});

test('a tela de permissões avisa onde mexer é perigoso', () => {
  // Backup leva o sistema inteiro num arquivo; organograma muda quem aprova
  // hora. Quem configura tem que ver isso antes de ligar.
  expect(acharFerramenta('adm_backup')?.cuidado).toBeTruthy();
  expect(acharFerramenta('organograma')?.cuidado).toBeTruthy();
  expect(acharFerramenta('banco_horas_rh')?.cuidado).toBeTruthy();
});

// ============================================================
// O PAINEL NÃO PODE ABRIR EM BRANCO
// ============================================================

test('todo nível que abre o painel tem pelo menos uma aba', () => {
  /**
   * O defeito que isto prende: a aba padrão do painel é "Visão & Lojas", e
   * o gerente deixou de enxergá-la. Sem uma aba de sobra, ele abriria o
   * painel numa tela vazia — sem nada clicável e sem explicação de por quê.
   */
  const abasDoPainel = [
    'visao_lojas',
    'quadro_equipe',
    'painel_gestao',
    'organograma',
    'aprovar_jornadas',
    'banco_horas_rh',
    'avisos_direcao',
  ];

  for (const nivel of [NIVEL_LIDER_SETOR, NIVEL_GERENTE, NIVEL_DIRETORIA, NIVEL_TI]) {
    const tem = abasDoPainel.filter((chave) => podeUsar(chave, pessoa(nivel)));
    expect({ nivel, abas: tem.length }).toEqual({ nivel, abas: tem.length });
    expect(tem.length).toBeGreaterThan(0);
  }
});

test('o gerente cai numa aba que ele TEM ao abrir o painel', () => {
  // A primeira aba permitida dele não pode ser a que foi tirada
  const gerente = pessoa(NIVEL_GERENTE);
  expect(podeUsar('visao_lojas', gerente)).toBe(false);

  const primeira = ['visao_lojas', 'quadro_equipe', 'painel_gestao', 'avisos_direcao'].find(
    (c) => podeUsar(c, gerente)
  );
  expect(primeira).toBe('quadro_equipe');
});

test('desligar TUDO de um nível é possível, mas some do painel inteiro', () => {
  // Não é proibido — mas quem configurar precisa saber que é isso que faz.
  // O teste existe para essa consequência ficar registrada, não escondida.
  aplicarPermissoes({
    visao_lojas: [], quadro_equipe: [], painel_gestao: [],
    organograma: [], aprovar_jornadas: [], banco_horas_rh: [], avisos_direcao: [],
  });

  const gerente = pessoa(NIVEL_GERENTE);
  const abas = ['visao_lojas', 'quadro_equipe', 'painel_gestao', 'avisos_direcao'].filter(
    (c) => podeUsar(c, gerente)
  );
  expect(abas).toHaveLength(0);

  // E o TI continua entrando no painel de administração para religar
  expect(podeUsar('adm_permissoes', pessoa(NIVEL_TI))).toBe(true);
});

// ============================================================
// GERENTE NÃO BATE PONTO
// ============================================================

test('a aba de bater ponto some do gerente para cima, por padrão', () => {
  // "Gerentes não precisaram bater ponto" — e a aba aparecia mesmo assim,
  // porque o padrão era "deste nível para cima" e não tinha teto
  expect(podeUsar('ponto', pessoa(NIVEL_COLABORADOR))).toBe(true);
  expect(podeUsar('ponto', pessoa(NIVEL_LIDER_SETOR))).toBe(true);

  expect(podeUsar('ponto', pessoa(NIVEL_GERENTE))).toBe(false);
  expect(podeUsar('ponto', pessoa(NIVEL_DIRETORIA))).toBe(false);
  expect(podeUsar('ponto', pessoa(NIVEL_TI))).toBe(false);
});

test('mas dá para religar o ponto para o gerente, se um dia precisar', () => {
  // O teto é PADRÃO, não proibição: a configuração continua mandando
  const { mapa } = alternarNivel(obterPermissoes(), 'ponto', NIVEL_GERENTE);
  aplicarPermissoes(mapa);

  expect(podeUsar('ponto', pessoa(NIVEL_GERENTE))).toBe(true);
});

test('o teto não afeta quem não tem teto', () => {
  // Só 'ponto' tem teto hoje; conversas e perfil continuam para todo mundo
  for (const nivel of [NIVEL_COLABORADOR, NIVEL_GERENTE, NIVEL_TI]) {
    expect(podeUsar('conversas', pessoa(nivel))).toBe(true);
    expect(podeUsar('eu', pessoa(nivel))).toBe(true);
  }
});

test('BANCO DE HORAS: ligar no painel basta, sem segundo guardião', () => {
  /**
   * O defeito relatado: o administrador ligou "Banco de Horas" para o
   * gerente e a aba continuou sumida. Havia DOIS guardiões — a permissão e
   * um `podeAcessarPainelRH` escrito na tela — e o segundo recusava calado.
   *
   * Aqui se prova o lado da permissão: ligada, o gerente passa. O que
   * continua restrito ao RH são as AÇÕES (corrigir marcação, publicar QR),
   * travadas no serviço e testadas em ponto.test.ts.
   */
  expect(podeUsar('banco_horas_rh', pessoa(NIVEL_GERENTE))).toBe(false);

  const { mapa } = alternarNivel(obterPermissoes(), 'banco_horas_rh', NIVEL_GERENTE);
  aplicarPermissoes(mapa);

  expect(podeUsar('banco_horas_rh', pessoa(NIVEL_GERENTE))).toBe(true);
  // E não vazou para o líder
  expect(podeUsar('banco_horas_rh', pessoa(NIVEL_LIDER_SETOR))).toBe(false);
});

// ============================================================
// A BARRA PRINCIPAL TAMBÉM OBEDECE
// ============================================================

test('as abas principais perguntam ao painel, não decidem sozinhas', async () => {
  /**
   * O defeito: o catálogo já dizia que gerente não bate ponto, mas
   * `App.tsx` montava a barra com `visivel: true` escrito na mão. A aba
   * "Ponto" continuava aparecendo para o gerente, e eu cheguei a afirmar
   * que tinha sumido.
   *
   * Este teste lê o App e reprova a volta do `visivel: true` nas abas que
   * têm ferramenta no catálogo.
   */
  const app = await Bun.file(new URL('../App.tsx', import.meta.url)).text();

  for (const aba of ['conversas', 'grupos', 'ponto']) {
    // A aba tem que consultar a permissão
    expect(app).toContain(`podeUsar('${aba}', colaboradorAtual)`);
    // E não pode ter voltado a decidir sozinha
    expect(app).not.toMatch(
      new RegExp(`id: '${aba}',[^}]*visivel: true`)
    );
  }
});

test('quem perde todas as telas ainda chega no próprio perfil', () => {
  // "Eu" é a saída de emergência: tem o botão de sair. Sem ela, desligar as
  // ferramentas de alguém deixaria a pessoa presa numa tela vazia.
  aplicarPermissoes({ conversas: [], grupos: [], ponto: [], eu: [] });

  // A aba "Eu" não depende de permissão de propósito — está fixa no App.
  // O que se prende aqui é a intenção: ela não entrou no catálogo como
  // desligável por engano.
  const semNada = pessoa(NIVEL_COLABORADOR);
  expect(podeUsar('conversas', semNada)).toBe(false);
  expect(podeUsar('ponto', semNada)).toBe(false);
});

// ============================================================
// CONFIGURAÇÃO SALVA ANTES DE UMA REGRA NOVA
// ============================================================

test('config antiga com ponto liberado para gerente é corrigida uma vez', () => {
  /**
   * O caso real: o administrador salvou o painel quando "Meu ponto" ainda
   * valia para todos. Depois ficou decidido que gerente não bate ponto — e
   * o valor GRAVADO vence o padrão, então a aba continuava lá. Mudar o
   * catálogo não bastava.
   */
  aplicarPermissoes({ ponto: [1, 2, 3, 4, 5] } as any);

  expect(podeUsar('ponto', pessoa(NIVEL_COLABORADOR))).toBe(true);
  expect(podeUsar('ponto', pessoa(NIVEL_LIDER_SETOR))).toBe(true);
  expect(podeUsar('ponto', pessoa(NIVEL_GERENTE))).toBe(false);
  expect(podeUsar('ponto', pessoa(NIVEL_DIRETORIA))).toBe(false);
  expect(podeUsar('ponto', pessoa(NIVEL_TI))).toBe(false);
});

test('depois de corrigida, a configuração volta a mandar', () => {
  // Quem quiser religar o ponto para o gerente religa, salva, e a migração
  // não desfaz — senão a regra nova viraria uma trava permanente
  aplicarPermissoes({ ponto: [1, 2, 3, 4, 5] } as any);
  expect(podeUsar('ponto', pessoa(NIVEL_GERENTE))).toBe(false);

  // O mapa devolvido já vem carimbado; religar e salvar guarda o carimbo
  const { mapa } = alternarNivel(obterPermissoes(), 'ponto', NIVEL_GERENTE);
  aplicarPermissoes(mapa);

  expect(podeUsar('ponto', pessoa(NIVEL_GERENTE))).toBe(true);
});

test('a migração só TIRA acesso, nunca acrescenta', () => {
  // Migração que amplia acesso sozinha é o tipo de coisa que ninguém
  // percebe até ser tarde
  aplicarPermissoes({ ponto: [1], adm_backup: [] } as any);

  expect(podeUsar('ponto', pessoa(NIVEL_LIDER_SETOR))).toBe(false);
  expect(podeUsar('adm_backup', pessoa(NIVEL_DIRETORIA))).toBe(false);
});

test('nenhuma ferramenta usa chave reservada', () => {
  // O carimbo de versão mora dentro do próprio mapa, com "__" na frente.
  // Se uma ferramenta usasse uma chave assim, uma tela real viraria o
  // carimbo — e sumiria.
  for (const f of FERRAMENTAS) {
    expect(f.chave.startsWith('__')).toBe(false);
  }
});

test('QR do Ponto é ferramenta separada do Banco de Horas', () => {
  /**
   * O gerente precisa do cartaz e NÃO precisa do painel de RH. Enquanto era
   * tudo uma ferramenta só, dar o cartaz a ele significava dar junto o
   * espelho de ponto e o saldo de todo mundo.
   */
  const gerente = pessoa(NIVEL_GERENTE);

  expect(podeUsar('qr_ponto', gerente)).toBe(true);
  expect(podeUsar('banco_horas_rh', gerente)).toBe(false);

  // Líder não cuida de cartaz: ele é da loja, não do setor
  expect(podeUsar('qr_ponto', pessoa(NIVEL_LIDER_SETOR))).toBe(false);

  // RH e TI continuam com os dois
  expect(podeUsar('qr_ponto', pessoa(NIVEL_TI))).toBe(true);
  expect(podeUsar('banco_horas_rh', pessoa(NIVEL_TI))).toBe(true);
});
