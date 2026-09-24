/**
 * Verificação da PROCURA POR PESSOA — CONECTA
 *
 * O "Quadro de Equipe" era uma tela inteira: 89 cartões, filtro de loja,
 * filtro de setor e busca. Ninguém a usava, e os filtros já não achavam
 * quem se procurava. Mas a IDEIA era certa — numa rede de cinco cidades,
 * achar alguém pelo nome exige saber o nome.
 *
 * A procura por pessoa acontece na hora de chamar um colega. Os filtros
 * foram para lá e a tela saiu do sistema. Este arquivo protege as duas
 * pontas: que o quadro não volte, e que o que ele tinha de bom esteja
 * onde passou a morar.
 */
import { test, expect } from 'bun:test';
import { FERRAMENTAS } from './ferramentas';

const lerModal = async (): Promise<string> =>
  Bun.file(new URL('../componentes/ModalNovaConversa.tsx', import.meta.url)).text();

/** O código sem os comentários, para a verificação não achar a explicação. */
const semComentarios = (fonte: string): string =>
  fonte.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

test('O QUADRO DE EQUIPE SAIU DO SISTEMA — inclusive do catálogo', async () => {
  /**
   * Não basta tirar a aba. Permissão de uma tela que não existe é linha
   * morta no painel de Permissões, e alguém um dia a lê como se ainda
   * valesse alguma coisa — foi assim que "gerente não bate ponto" ficou
   * escrito no catálogo e sem efeito por meses.
   */
  expect(FERRAMENTAS.some((f) => f.chave === 'quadro_equipe')).toBe(false);

  const painel = await Bun.file(
    new URL('../componentes/PainelRede.tsx', import.meta.url)
  ).text();

  expect(painel).not.toContain('QuadroFuncionarios');
  expect(painel).not.toContain("setSubAbaAtiva('quadro')");
  expect(painel).not.toContain("lista.push('quadro')");

  // E o arquivo não existe mais
  expect(
    await Bun.file('src/componentes/QuadroFuncionarios.tsx').exists()
  ).toBe(false);
});

test('O BOTÃO SE CHAMA "NOVA CONVERSA", como a janela que ele abre', async () => {
  /**
   * O botão dizia "Chamar um colega" e abria uma janela intitulada "Nova
   * conversa". Dois nomes para a mesma coisa é o que faz alguém procurar
   * a segunda achando que é outra tela.
   */
  const lista = await Bun.file(
    new URL('../componentes/PainelConversas.tsx', import.meta.url)
  ).text();

  expect(lista).toContain("'Nova conversa'");
  expect(lista).not.toContain('Chamar um colega');

  const modal = await lerModal();
  expect(modal).toContain('Nova conversa');
});

test('DÁ PARA FILTRAR POR CIDADE E POR CARGO', async () => {
  /**
   * É o que veio do quadro: numa rede de cinco cidades, quem não lembra
   * o nome precisa chegar pela unidade e pela função.
   */
  const modal = semComentarios(await lerModal());

  expect(modal).toContain("if (cidade !== 'todas' && c.loja !== cidade) return false;");
  expect(modal).toContain("if (cargo !== 'todos' && c.cargo !== cargo) return false;");

  expect(modal).toContain('Todas as cidades');
  expect(modal).toContain('Todos os cargos');
});

test('AS OPÇÕES SAEM DE QUEM ESTÁ NA LISTA, e não de uma tabela fixa', async () => {
  /**
   * Era o defeito do quadro: as listas vinham de tipos.ts inteiras, e o
   * filtro oferecia cidade sem ninguém e setor que ninguém ocupava.
   * Filtro que devolve lista vazia ensina a desconfiar do filtro.
   *
   * E é também o que impede a terceira cópia da lista de setores — a que
   * já custou caro aqui: as pessoas entravam em Logística e o filtro não
   * as achava.
   */
  const modal = semComentarios(await lerModal());

  expect(modal).toContain('[...new Set(colegas.map((c) => c.loja)');
  expect(modal).toContain('[...new Set(colegas.map((c) => c.cargo)');

  expect(modal).not.toContain('INFORMACOES_LOJAS');
  expect(modal).not.toContain('SETORES');
});

test('OS FILTROS NASCEM RECOLHIDOS', async () => {
  /**
   * O pedido foi não poluir a tela do chat. Quem já sabe o nome digita e
   * pronto; quem não sabe abre. Dois seletores sempre à vista roubariam
   * altura da lista, que é o que a pessoa veio ver.
   */
  const modal = await lerModal();

  expect(modal).toContain('const [filtrosAbertos, setFiltrosAbertos] = useState(false)');
  expect(modal).toContain('{filtrosAbertos && (');
});

test('FILTRO LIGADO E ESCONDIDO PRECISA SE ANUNCIAR', async () => {
  /**
   * Com os filtros fechados, uma lista filtrada não teria explicação: a
   * pessoa procuraria alguém que está na rede, não acharia, e concluiria
   * que o colega não tem cadastro.
   *
   * São dois avisos: o contador no botão e o total que muda de
   * "89 colaboradores na rede" para "4 de 89".
   */
  const modal = semComentarios(await lerModal());

  expect(modal).toContain('const filtrosLigados =');
  expect(modal).toContain('{filtrosLigados > 0 && !filtrosAbertos && (');
  expect(modal).toContain('de ${colegas.length} colaboradores');
});

test('A SAÍDA FICA JUNTO DO BECO SEM SAÍDA', async () => {
  /**
   * Lista vazia com filtro ligado é onde a pessoa trava. O "Limpar
   * filtros" aparece ali mesmo, em vez de obrigá-la a lembrar sozinha de
   * reabrir o painel de filtros.
   */
  const modal = semComentarios(await lerModal());

  const inicio = modal.indexOf('Nenhum colega encontrado');
  expect(inicio).toBeGreaterThan(-1);

  const vazio = modal.slice(inicio, inicio + 600);
  expect(vazio).toContain('Limpar filtros');
  expect(vazio).toContain('limparFiltros');
});

test('sem filtro de cidade, a lista vem AGRUPADA por cidade', async () => {
  /**
   * É o que o quadro fazia de melhor, e o que uma fila de 89 nomes em
   * ordem alfabética não faz: a rede se lê por unidade.
   *
   * Com uma cidade já escolhida o agrupamento sai — o cabeçalho repetiria
   * em cada bloco o que o filtro já diz.
   */
  const modal = semComentarios(await lerModal());

  expect(modal).toContain("if (cidade !== 'todas') return [{ cidade: '', pessoas: colegasFiltrados }];");
  expect(modal).toContain('const porCidade = new Map<string, Colaborador[]>()');
  expect(modal).toContain('grupos.map((grupo)');
});

test('a busca continua achando por cargo, setor e ramal', async () => {
  /**
   * Quem lembra "o rapaz da logística de Descalvado" acha digitando, sem
   * abrir filtro nenhum. Restringir a busca ao nome empurraria todo mundo
   * para os seletores.
   */
  const modal = semComentarios(await lerModal());

  for (const campo of ['c.nome', 'c.cargo', 'c.loja', 'c.setor', "c.ramal || ''"]) {
    expect(modal).toContain(campo);
  }
});
