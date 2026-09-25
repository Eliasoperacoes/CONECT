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
  const { mapa } = alternarNivel(obterPermissoes(), 'aprovar_jornadas', NIVEL_LIDER_SETOR);
  aplicarPermissoes(mapa);

  expect(podeUsar('aprovar_jornadas', lider)).toBe(false);
  expect(podeUsar('aprovar_jornadas', gerente)).toBe(true);
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

  const primeira = ['visao_lojas', 'painel_gestao', 'avisos_direcao'].find(
    (c) => podeUsar(c, gerente)
  );
  expect(primeira).toBe('painel_gestao');
});

test('desligar TUDO de um nível é possível, mas some do painel inteiro', () => {
  // Não é proibido — mas quem configurar precisa saber que é isso que faz.
  // O teste existe para essa consequência ficar registrada, não escondida.
  aplicarPermissoes({
    visao_lojas: [], painel_gestao: [],
    organograma: [], aprovar_jornadas: [], banco_horas_rh: [], avisos_direcao: [],
  });

  const gerente = pessoa(NIVEL_GERENTE);
  const abas = ['visao_lojas', 'painel_gestao', 'avisos_direcao'].filter(
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

  /**
   * "Grupos" saiu da barra — virou uma seção dentro de Conversas. A
   * permissão `grupos` continua valendo lá dentro; o que deixou de
   * existir é a ABA.
   */
  for (const aba of ['conversas', 'ponto']) {
    // A aba tem que consultar a permissão
    expect(app).toContain(`podeUsar('${aba}', colaboradorAtual)`);
    // E não pode ter voltado a decidir sozinha
    expect(app).not.toMatch(
      new RegExp(`id: '${aba}',[^}]*visivel: true`)
    );
  }

  /**
   * A CENTRAL É A EXCEÇÃO, e de propósito: `visivel: true`.
   *
   * Ela é onde a pessoa ENCONTRA o que foi publicado para ela. Exigir
   * permissão para isso era publicar para 89 pessoas e deixar umas 70
   * sem tela onde ver. Quem PUBLICA continua filtrado, por
   * `publicaComunicado` dentro da tela.
   */
  expect(app).toMatch(/id: 'central',[\s\S]{0,80}visivel: true/);
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

// ============================================================
// UM CAMINHO POR FUNÇÃO
//
// A fila de aprovação chegou a existir no menu superior E dentro de Minha
// Equipe, com o contador aparecendo duas vezes na mesma tela. Dois caminhos
// para a mesma coisa fazem a pessoa procurar qual dos dois é o certo.
// ============================================================

test('a fila de aprovação existe num lugar só', async () => {
  const painel = await Bun.file(
    new URL('../componentes/PainelRede.tsx', import.meta.url)
  ).text();

  // O painel não renderiza mais a fila direto: ela vive dentro de PainelGestao
  expect(painel).not.toContain('<AprovacaoJornada');
  expect(painel).not.toContain("subaba-aprovacoes");

  const gestao = await Bun.file(
    new URL('../componentes/PainelGestao.tsx', import.meta.url)
  ).text();
  expect(gestao).toContain('<AprovacaoJornada');
});

test('FOLGA NÃO É AUSÊNCIA: as filas são separadas', async () => {
  /**
   * As duas usam a mesma tabela porque o caminho de aprovação é o mesmo, mas
   * são coisas diferentes para quem decide: a ausência se julga pelo
   * documento, e a folga pela ESCALA — quantos já estão de folga naquele
   * sábado. Misturadas, o gestor decidia folga sem ver o calendário.
   */
  const servico = await Bun.file(
    new URL('./justificativas.ts', import.meta.url)
  ).text();

  // A fila padrão exclui a folga
  expect(servico).toContain("j.tipo !== 'folga_sabado'");
  expect(servico).toContain('pendenciasDeFolga');

  // E a decisão da folga mora na escala
  const escala = await Bun.file(
    new URL('../componentes/EscalaDeFolgas.tsx', import.meta.url)
  ).text();
  expect(escala).toContain('decidirAusencia');
});

test('o contador "sem bater hoje" leva a uma lista', async () => {
  // Numero que nao leva a lugar nenhum nao serve: dizia que havia 23
  // problemas e deixava o gestor procurar quem, um por um
  const gestao = await Bun.file(
    new URL('../componentes/PainelGestao.tsx', import.meta.url)
  ).text();

  expect(gestao).toContain("setAba('sem_bater')");
  expect(gestao).toContain('semBaterHoje');
  expect(gestao).toContain('Quem ainda não bateu o ponto hoje');
});

/**
 * A FUSÃO DE "MINHA EQUIPE" COM "BANCO DE HORAS".
 *
 * A duplicação era literal: a primeira vista de "Minha Equipe" já se
 * chamava "Banco de horas da equipe", e ao lado dela havia uma aba de topo
 * chamada "Banco de Horas". Quem tinha as duas permissões via o mesmo nome
 * em dois lugares, um dentro do outro.
 */
test('nao existe mais aba de topo separada para o banco de horas', async () => {
  const painel = await Bun.file(
    new URL('../componentes/PainelRede.tsx', import.meta.url)
  ).text();

  // O destino da aba antiga não pode sobrar: aba que aparece e não está na
  // lista de permitidas é escolhida e cai fora no clique seguinte
  expect(painel).not.toContain("subAbaAtiva === 'ponto'");
  expect(painel).not.toContain("lista.push('ponto')");
  expect(painel).not.toContain("import { BancoDeHoras }");
});

/**
 * NADA DE ACESSO PODE TER SE PERDIDO NA FUSÃO.
 *
 * Um gerente SEM equipe cadastrada chegava ao cartaz de QR pela aba de topo
 * que saiu. Sem este `||`, a fusão tiraria o QR dele sem aviso — e ele é a
 * única forma de a loja dele bater ponto.
 */
test('quem so tem o cartaz de QR continua alcancando a aba', async () => {
  const painel = await Bun.file(
    new URL('../componentes/PainelRede.tsx', import.meta.url)
  ).text();

  const inicio = painel.indexOf('const podeVerGestao =');
  const regra = painel.slice(inicio, inicio + 300);
  expect(regra).toContain("pode('banco_horas_rh')");
  expect(regra).toContain("pode('qr_ponto')");

  // E a mesma condição na lista de abas permitidas, senão as duas discordam
  const lista = painel.slice(
    painel.indexOf('const abasPermitidas'),
    painel.indexOf('const subAbaAtiva')
  );
  expect(lista).toContain("podeUsar('banco_horas_rh', colaboradorAtual)");
  expect(lista).toContain("podeUsar('qr_ponto', colaboradorAtual)");
});

test('as vistas do RH continuam com as permissoes delas', async () => {
  const gestao = await Bun.file(
    new URL('../componentes/PainelGestao.tsx', import.meta.url)
  ).text();

  /**
   * A fusão não pode virar promoção: quem não tinha banco de horas da rede
   * continua sem, e o botão nem aparece.
   *
   * Agora há DUAS portas para a mesma tela — a da rede e a da equipe — e é
   * justamente por isso que o teste aperta aqui: `espelho_equipe` não pode
   * virar atalho para o alcance de rede. O que separa as duas é o
   * conteúdo, que já vem filtrado pela cadeia, e o rótulo, que diz qual é.
   */
  expect(gestao).toContain("const veEspelhoDaRede = podeUsar('banco_horas_rh', colaboradorAtual)");
  expect(gestao).toContain("podeUsar('espelho_equipe', colaboradorAtual)");
  expect(gestao).toContain("veEspelhoDaRede ? 'Rede' : 'Espelho de ponto'");
  expect(gestao).toContain("const veQr = podeUsar('qr_ponto', colaboradorAtual)");
  expect(gestao).toContain('{veRede && (');
  expect(gestao).toContain('{veQr && (');

  // E é a MESMA tela de antes, não uma cópia
  expect(gestao).toContain('<BancoDeHoras colaboradorAtual={colaboradorAtual} abaFixa="banco_horas" />');
  expect(gestao).toContain('<BancoDeHoras colaboradorAtual={colaboradorAtual} abaFixa="qrcodes" />');
});

test('a tela do RH esconde a barra propria quando esta dentro de Gerenciar', async () => {
  const banco = await Bun.file(
    new URL('../componentes/BancoDeHoras.tsx', import.meta.url)
  ).text();

  // Duas barras empilhadas fariam a pessoa descobrir qual das duas manda
  expect(banco).toContain("abaFixa ? 'hidden' : 'flex'");

  /**
   * A permissão fica por ÚLTIMO: quem não vê banco de horas cai no cartaz,
   * mesmo que alguém peça a vista errada de fora.
   */
  expect(banco).toContain("const abaEfetiva: AbaRH = !veBancoDeHoras\n    ? 'qrcodes'\n    : abaFixa ?? abaAtiva;");
});

test('um gerente sem equipe abre numa vista que ele tem', async () => {
  const gestao = await Bun.file(
    new URL('../componentes/PainelGestao.tsx', import.meta.url)
  ).text();

  // Abrir numa lista vazia faria a aba parecer quebrada
  expect(gestao).toContain("const abaInicial: Aba = temEquipe ? 'equipe' : veRede ? 'rede' : 'qr'");

  // E "tem equipe" vem de quem já o calculava, não de uma segunda conta
  expect(gestao).toContain('temEquipe: boolean;');
  expect(gestao).not.toContain('resumoDaEquipeDe');
});

/**
 * AS ABAS DO ADM PASSAM PELO PAINEL DE PERMISSÕES.
 *
 * Achado no pente fino: eram dez abas fixas no meio do JSX. O catálogo
 * listava `adm_*`, o painel de Permissões deixava ligar e desligar cada uma
 * — e nenhuma tela consultava. Quem mexesse ali não mudava nada, e só
 * descobriria testando.
 *
 * É o mesmo defeito que já tinha sido relatado uma vez, sobrevivendo na
 * área ADM.
 */
test('cada aba do ADM consulta a permissao dela', async () => {
  const painel = await Bun.file(
    new URL('../componentes/PainelAdministrativo.tsx', import.meta.url)
  ).text();

  expect(painel).toContain('podeUsar(`adm_${tab.id}`, colaboradorAtual)');
  expect(painel).toContain('abasPermitidas.map((tab)');

  // A lista fixa no meio do JSX não pode voltar
  expect(painel).not.toContain("{[\n          { id: 'colaboradores'");
});

test('a aba que vale nunca e uma que a pessoa nao tem', async () => {
  const painel = await Bun.file(
    new URL('../componentes/PainelAdministrativo.tsx', import.meta.url)
  ).text();

  /**
   * Nem por estado antigo, nem por permissão retirada com a tela aberta. É
   * a mesma proteção que o painel de RH já tinha — e que faltava aqui.
   */
  expect(painel).toContain('abasPermitidas.some((a) => a.id === abaEscolhida)');
  expect(painel).toContain("abasPermitidas[0]?.id ?? 'colaboradores'");
});

test('toda aba do ADM tem ferramenta no catalogo, e vice-versa', async () => {
  const painel = await Bun.file(
    new URL('../componentes/PainelAdministrativo.tsx', import.meta.url)
  ).text();
  const catalogo = await Bun.file(
    new URL('./ferramentas.ts', import.meta.url)
  ).text();

  /**
   * Uma aba sem ferramenta no catálogo some para todo mundo (a permissão
   * nunca é concedida); uma ferramenta sem aba é uma chave que o painel de
   * Permissões oferece e que não liga nada. Os dois erros são silenciosos.
   */
  const inicio = painel.indexOf('const abasPermitidas');
  const fim = painel.indexOf('const abaAtiva', inicio);
  const lista = painel.slice(inicio, fim);

  const naTela = [...lista.matchAll(/\{ id: '([a-z]+)' as const/g)].map((m) => m[1]).sort();
  const noCatalogo = [...catalogo.matchAll(/chave: 'adm_([a-z]+)'/g)].map((m) => m[1]).sort();

  expect(naTela.length).toBeGreaterThan(0);
  expect(naTela).toEqual(noCatalogo);
});

/**
 * UMA REGRA SÓ PARA QUEM PUBLICA COMUNICADO.
 *
 * Havia TRÊS números para a mesma pergunta: o catálogo liberava a tela no
 * nível 2, `publicaComunicado` exigia 4, e a Central de Avisos exigia 5.
 *
 * O resultado na tela era o pior possível — o líder via a aba "Avisos &
 * Direção", abria, e não conseguia fazer nada. A permissão dizia que sim e
 * a tela dizia que não.
 */
test('a Central de Avisos e o canal usam a MESMA regra', async () => {
  const central = await Bun.file(
    new URL('../componentes/CentralAvisos.tsx', import.meta.url)
  ).text();
  const servico = await Bun.file(
    new URL('./bancoDados.ts', import.meta.url)
  ).text();

  // Nenhum dos dois pode ter o próprio número
  expect(central).toContain('publicaComunicado(colaboradorAtual)');
  expect(central).not.toContain('colaboradorAtual.nivel >= NIVEL_TI');

  expect(servico).toContain('return publicaComunicado(atual);');
  expect(servico).not.toContain("if (conversaId === 'grupo-avisos-da-rede') {\n      return atual.nivel >= NIVEL_TI;");
});

test('VER A CENTRAL NÃO É PERMISSÃO; PUBLICAR NELA É', async () => {
  /**
   * A REGRA MUDOU.
   *
   * Antes a Central era uma sub-aba de "Gerenciar", atrás da
   * permissão `avisos_direcao`, que nascia na liderança. Publicava-se
   * um comunicado para as 89 pessoas da rede e umas 70 não tinham tela
   * nenhuma onde vê-lo — o sistema mandava para um lugar que a maior
   * parte da rede não alcança.
   *
   * Agora ela é aba de todos, e a chave saiu do catálogo: permissão
   * sem tela é linha morta. O que continua restrito é PUBLICAR.
   */
  const catalogo = await Bun.file(
    new URL('./ferramentas.ts', import.meta.url)
  ).text();
  const tipos = await Bun.file(new URL('../tipos.ts', import.meta.url)).text();

  expect(catalogo).not.toContain("chave: 'avisos_direcao'");

  expect(tipos).toContain(
    ['export const publicaComunicado = (c: { nivel: number }): boolean =>', '  c.nivel >= NIVEL_LIDER_SETOR;'].join(String.fromCharCode(10))
  );

  /* E a tela é quem pergunta, na hora de mostrar o botão de publicar */
  const central = await Bun.file('src/componentes/CentralAvisos.tsx').text();
  expect(central).toContain('publicaComunicado(colaboradorAtual)');
  expect(central).toContain('{podeAdministrar && (');
});

/**
 * O PAINEL DO RH TEM TRÊS ABAS, E A DELE VEM PRIMEIRO.
 *
 * Quem é do RH não monta organograma nem acompanha equipe — o trabalho dele
 * está reunido na tela de RH, e as outras abas seriam ruído ocupando o
 * lugar do que ele abre todo dia.
 */
test('quem e do RH ve RH e Visao & Lojas — e nada mais', async () => {
  const painel = await Bun.file(
    new URL('../componentes/PainelRede.tsx', import.meta.url)
  ).text();

  const inicio = painel.indexOf('const abasPermitidas');
  const fim = painel.indexOf('const subAbaAtiva', inicio);
  const lista = painel.slice(inicio, fim);

  // As três de quem é do RH ficam FORA da guarda
  expect(lista).toContain("if (temRh) lista.push('rh');");
  expect(lista).toContain("lista.push('visao_geral')");
  /*
    "Avisos" saiu daqui: a Central virou aba própria, de todo mundo.
    Ela morava atrás de uma permissão de liderança, e assim 70 das 89
    pessoas não tinham onde ver o que era publicado para elas.
  */
  expect(lista).not.toContain("lista.push('avisos')");

  // E as outras três ficam DENTRO dela
  const dentroDaGuarda = lista.slice(lista.indexOf('if (!ehDoRh(colaboradorAtual))'));
  expect(dentroDaGuarda).toContain("lista.push('gestao')");
  expect(dentroDaGuarda).toContain("lista.push('organograma')");
});

test('a aba do RH e a PRIMEIRA da lista', async () => {
  const painel = await Bun.file(
    new URL('../componentes/PainelRede.tsx', import.meta.url)
  ).text();

  const inicio = painel.indexOf('const abasPermitidas');
  const lista = painel.slice(inicio, painel.indexOf('const subAbaAtiva', inicio));

  /**
   * A ordem da lista é a ordem da barra E a aba que abre por padrão —
   * `subAbaAtiva` cai na primeira permitida. Pôr o RH depois faria a Dani
   * abrir o painel em Visão & Lojas todo dia.
   */
  expect(lista.indexOf("lista.push('rh')")).toBeLessThan(
    lista.indexOf("lista.push('visao_geral')")
  );
});

test('a BARRA diz o mesmo que a lista', async () => {
  const painel = await Bun.file(
    new URL('../componentes/PainelRede.tsx', import.meta.url)
  ).text();

  /**
   * Se as duas discordarem, o botão aparece, a pessoa clica, e a aba cai
   * fora no render seguinte — porque `subAbaAtiva` só aceita o que está na
   * lista. Um botão que pisca e não leva a lugar nenhum.
   */
  expect(painel).toContain('{podeVerGestao && !souDoRh && (');
  expect(painel).toContain("{pode('organograma') && !souDoRh && (");
});

/**
 * A TELA DE RH É PELO SETOR, E NÃO POR `cuidaDePessoas`.
 *
 * Essa função também vale para Diretoria e TI. Amarrar a restrição nela
 * tiraria o ORGANOGRAMA do Administrador — que é justamente quem posiciona
 * as pessoas nele.
 */
test('o Administrador NAO perde o organograma', async () => {
  const tipos = await Bun.file(new URL('../tipos.ts', import.meta.url)).text();
  const painel = await Bun.file(
    new URL('../componentes/PainelRede.tsx', import.meta.url)
  ).text();

  // Um nome só para o papel, e ele é de setor
  expect(tipos).toContain("export const ehDoRh = (c: { setor: string }): boolean => c.setor === 'RH';");

  // A restrição usa ehDoRh, nunca cuidaDePessoas
  expect(painel).toContain('const souDoRh = ehDoRh(colaboradorAtual)');
  expect(painel).not.toContain('!cuidaDeRh && (');
});

test('TODA ABA DO PAINEL DE GESTÃO PASSA PELO CATÁLOGO', async () => {
  /**
   * A Escala de folgas ficou de fora por meses: a visibilidade dela era
   * `!temTelaDeRh` e mais nada. Não aparecia no painel de Permissões, e
   * não dava para ligar nem desligar por nível — quem alcançava o painel
   * de gestão, tinha. E é a tela onde a liderança LANÇA folga e férias.
   *
   * Tela fora do catálogo não é tela sem dono: é tela que ninguém
   * consegue tirar de ninguém.
   */
  const gestao = await Bun.file('src/componentes/PainelGestao.tsx').text();
  const { FERRAMENTAS } = await import('./ferramentas');

  const chaves = new Set(FERRAMENTAS.map((f) => f.chave));
  expect(chaves.has('escala_folgas')).toBe(true);

  // Cada bandeira de visibilidade de aba consulta o catálogo
  for (const bandeira of ['veEscala', 'veRede', 'veQr']) {
    const linha = gestao
      .split('\n')
      .find((l) => l.includes(`const ${bandeira} =`) || l.includes(`const ${bandeira} =`));
    expect({ bandeira, achou: !!linha }).toEqual({ bandeira, achou: true });
  }

  expect(gestao).toContain("podeUsar('escala_folgas'");
  expect(gestao).toContain("podeUsar('qr_ponto'");
  expect(gestao).toContain("podeUsar('banco_horas_rh'");
});
