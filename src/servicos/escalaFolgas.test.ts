/**
 * Verificação da escala de folgas — CONECTA
 *
 * O que motivou: com 23 pessoas numa loja, a tela em cartões desalinhava e
 * a lista de quem não marcou ocupava mais espaço do que a própria escala. E
 * o documento impresso — que vai para o quadro de avisos da loja — saía com
 * cara de relatório, incluindo a relação de quem NÃO marcou folga.
 */
import { test, expect } from 'bun:test';

const lerTela = async (): Promise<string> =>
  Bun.file(new URL('../componentes/EscalaDeFolgas.tsx', import.meta.url)).text();

/**
 * O quadro que se arrasta, onde a grade dos sábados passou a morar.
 *
 * A tela continua sendo a dona do mês, do documento e da fila; o quadro
 * é só a parte que se manipula. Separados porque a tela já tinha 700
 * linhas, e arrastar traz estado que não interessa a nenhuma delas.
 */
const lerQuadro = async (): Promise<string> =>
  Bun.file(new URL('../componentes/QuadroEscalaFolgas.tsx', import.meta.url)).text();

/** O código sem os comentários, para a verificação não achar a explicação. */
const semComentarios = (fonte: string): string =>
  fonte.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

test('a escala e uma grade de colunas alinhadas, nao cartoes que quebram', async () => {
  const quadro = await lerQuadro();

  /**
   * Com 23 pessoas escolhendo folga, uns sábados ficam cheios e outros
   * vazios. As quatro colunas precisam ler-se como um quadro de escala —
   * mesma largura, altura mínima igual, sem quebra de linha.
   */
  expect(quadro).toContain('xl:grid-cols-4');
  expect(quadro).toContain('min-h-[220px]');
});

test('cada sabado diz quantos FICAM, e nao so quantos saem', async () => {
  const quadro = await lerQuadro();

  /**
   * "3 de folga" sozinho não decide nada. "3 de folga, 20 na loja" decide —
   * é o número que o gestor precisa para autorizar mais uma no mesmo dia.
   *
   * Quase se perdeu na troca da grade pelo quadro: este teste é que
   * acusou. E o desenho novo falava em "6 de 6 vagas" — a rede não tem
   * limite de vagas por sábado em lugar nenhum, e inventar um seria
   * criar regra de negócio por conta própria.
   */
  expect(quadro).toContain('Math.max(equipe.length - gente.length, 0)');
  expect(quadro).toContain('na loja');

  // E a proporção, para ler de relance
  expect(quadro).toContain('const proporcaoFora =');
});

test('a folga recusada nao ocupa lugar na escala', async () => {
  const codigo = semComentarios(await lerTela());

  /**
   * Recusada não vale e não conta para "quantos ficam na loja" — deixá-la
   * na contagem faria o gestor recusar a próxima sem motivo.
   */
  /**
   * A exclusão agora acontece em UM lugar — `porSabado`, que é a fonte
   * que a tela e o quadro leem — em vez de repetida na grade e no
   * documento. Antes eram duas cópias da mesma condição, e este teste
   * contava as duas.
   *
   * O quadro NÃO refaz o filtro: ele recebe `porSabado` pronto. Repetir
   * a condição lá seria a terceira cópia, e a que divergiria primeiro.
   */
  expect(codigo).toContain("j.estado === 'recusada'");
  expect((codigo.match(/estado !== 'recusada'/g) || []).length).toBeGreaterThanOrEqual(1);

  const quadro = semComentarios(await lerQuadro());
  expect(quadro).not.toContain("'recusada'");
});

test('a lista de quem nao marcou comeca fechada', async () => {
  const tela = await lerTela();

  /**
   * São 23 nomes numa loja como Pirassununga. Abertos, ocupam mais espaço
   * do que a escala inteira e empurram para baixo o que se veio olhar.
   */
  expect(tela).toContain('useState(false)');
  expect(tela).toContain('setSemFolgaAberta((v) => !v)');
  expect(tela).toContain('{semFolgaAberta && (');

  // O número continua à vista mesmo fechada: é ele que é o aviso
  expect(tela).toContain('{semFolga.length} sem folga marcada em');
});

/**
 * O DOCUMENTO IMPRESSO É UM CARTAZ, e não um relatório.
 *
 * Ele é pregado no quadro de avisos. Quem lê está em pé, de passagem,
 * procurando o próprio nome.
 */
test('o cartaz NAO leva a relacao de quem ficou sem marcar', async () => {
  const codigo = semComentarios(await lerTela());

  const inicio = codigo.indexOf('const montarEscala');
  const fim = codigo.indexOf('const imprimir', inicio);
  expect(inicio).toBeGreaterThan(-1);
  const documento = codigo.slice(inicio, fim);

  /**
   * Pregar no quadro os nomes de quem não marcou expõe as pessoas sem
   * servir para nada: quem lê quer saber quem folga, não quem faltou
   * marcar. Na tela a lista continua — lá é cobrança do gestor.
   */
  expect(documento).not.toContain('semFolga');

  // E a tela continua com ela
  expect(codigo).toContain('semFolga.map((c) => (');
});

test('A ESCALA SAI NO PADRÃO DOS DOCUMENTOS DO SISTEMA', async () => {
  /**
   * A REGRA MUDOU, a pedido do dono do sistema.
   *
   * Este papel era um cartaz de mural: título de 30px, cinzas claros,
   * etiquetas arredondadas, cores chapadas. Lido de longe, funcionava —
   * mas na mesa do RH, ao lado do espelho de ponto, os dois não pareciam
   * sair do mesmo sistema. E documento de pessoal é assinado e arquivado:
   * um conjunto que não se parece perde a cara de documento oficial.
   *
   * Agora os dois montam a folha pelo mesmo módulo. O que este teste
   * protege é isso: a escala não pode voltar a ter HTML e estilo próprios,
   * porque foi assim que os dois divergiram da primeira vez.
   */
  const codigo = semComentarios(await lerTela());
  const documento = codigo.slice(
    codigo.indexOf('const montarEscala'),
    codigo.indexOf('const imprimir')
  );

  // A folha vem do módulo comum, com cabeçalho, assinaturas e rodapé
  expect(documento).toContain('montarDocumento({');
  expect(documento).toContain('cabecalho({');
  expect(documento).toContain('assinaturas(');
  expect(documento).toContain('rodape(');

  // Papel definido, ainda: sem isto o navegador escolhe margem e orientação
  expect(documento).toContain("orientacao: 'retrato'");

  /**
   * E NADA DE FOLHA PRÓPRIA AQUI.
   *
   * Era exatamente isto que fazia os documentos divergirem: cada tela
   * montando o seu `<html>` com o seu `<style>`.
   */
  expect(documento).not.toContain('<!doctype html>');
  expect(documento).not.toContain('@page');
  expect(documento).not.toContain('font-family');
});

test('o estilo dos documentos mora num lugar só', async () => {
  const documento = await Bun.file('src/servicos/documento.ts').text();

  // As cores precisam sair na impressora, senão o papel sai cinza
  expect(documento).toContain('print-color-adjust: exact');
  // A régua preta do cabeçalho é o que dá cara de documento
  expect(documento).toContain('border-bottom: 2px solid #111');

  // E o espelho de ponto, que é o documento mais impresso, usa o mesmo
  const ponto = await Bun.file('src/servicos/ponto.ts').text();
  expect(ponto).toContain('montarDocumento({');
  expect(ponto).not.toContain('<!doctype html>');
});

test('A ESCALA NÃO EXCLUI QUEM A ABRE', async () => {
  /**
   * A lista da escala vinha com um `filter` tirando o próprio da relação,
   * escrito quando ninguém decidia sobre a própria jornada. A regra
   * mudou, o filtro ficou — e a líder abria a escala, via só a
   * subordinada e não tinha por onde marcar as férias dela.
   *
   * Quem decide isso é `podeDecidirSobre`, a MESMA função da fila de
   * aprovação e da relação semanal. Escrever aqui um critério próprio é
   * o que produziu o defeito da primeira vez.
   */
  const codigo = semComentarios(await lerTela());

  expect(codigo).toContain('.filter((c) => servicoPonto.podeDecidirSobre(c))');
  // O critério escrito à mão não pode voltar
  expect(codigo).not.toContain('c.id !== colaboradorAtual.id');
});

// ============================================================
// O QUADRO QUE SE ARRASTA
// ============================================================

test('o quadro NAO escreve regra de alcada nenhuma', async () => {
  /**
   * Quem pode ser escalado por quem, o limite de uma folga por mês, só
   * sábado — tudo isso é do serviço. A tela recebe a equipe já filtrada
   * pela alçada e pergunta; o banco responde.
   *
   * Uma segunda regra aqui divergiria da primeira no primeiro ajuste, e
   * o gerente acabaria escalando gente de outra loja. É o defeito que já
   * apareceu quatro vezes nesta base.
   */
  const quadro = semComentarios(await lerQuadro());

  expect(quadro).not.toContain('podeDecidirSobre');
  expect(quadro).not.toContain('cuidaDePessoas');
  expect(quadro).not.toContain('ehSabado');
  expect(quadro).not.toContain('folgaDoMes');
  expect(quadro).not.toContain('lancarAusenciaPelaLideranca');
});

test('arrastar leva a SELECAO inteira, e nao so o item', async () => {
  /**
   * Quem marcou cinco pessoas e arrasta uma delas quer as cinco no dia —
   * é o que o gesto diz. Arrastar alguém de FORA da seleção leva só ele,
   * porque aí a seleção não era sobre ele.
   */
  const quadro = await lerQuadro();

  expect(quadro).toContain('selecionados.has(colaboradorId)');
  expect(quadro).toContain('[...selecionados]');
});

test('o rascunho guarda UMA folga por pessoa', async () => {
  /**
   * `aAdicionar` é colaborador → sábado, e não sábado → lista. A pessoa
   * tem uma folga por mês; com ela como chave, duplicar fica impossível
   * por construção, e arrastar quem já está em outro dia MOVE.
   */
  const quadro = await lerQuadro();

  expect(quadro).toContain('useState<Map<string, string>>(new Map())');
});

test('o pedido PENDENTE continua tendo como ser aprovado', async () => {
  /**
   * A grade antiga era a única porta de aprovação da tela. Ao trocá-la
   * pelo quadro, essa porta quase foi junto — e os pedidos ficariam
   * parados sem ninguém notar, que é o pior tipo de regressão: não
   * quebra nada, só para de acontecer.
   *
   * Folga pendente é pedido do colaborador; rascunho é a escala que o
   * gestor desenha. Os dois convivem no mesmo sábado e pedem ações
   * diferentes.
   */
  const quadro = await lerQuadro();
  const tela = await lerTela();

  expect(quadro).toContain("justificativa?.estado === 'pendente'");
  expect(quadro).toContain('aoAprovar(justificativa)');
  expect(quadro).toContain('aoRecusar(justificativa)');

  // E a tela liga as duas pontas no serviço que decide
  expect(tela).toContain('aoAprovar={(j) => decidir(j, true)}');
  expect(tela).toContain('aoRecusar={(j) => setRecusando(j)}');
});

test('salvar o rascunho passa pelo servico, e nao grava direto', async () => {
  const tela = await lerTela();

  expect(tela).toContain('salvarEscalaDeFolgas(alteracoes)');

  /**
   * E o aviso diz QUEM ficou de fora. O lote não é tudo-ou-nada; um
   * "algumas falharam" obrigaria a conferir as doze pessoas na mão.
   */
  expect(tela).toContain('res.falhas');
  expect(tela).toContain('f.nome');
});
