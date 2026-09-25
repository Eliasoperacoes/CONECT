/**
 * Verificação da ABA EU no celular — CONECTA
 *
 * O que motivou: sete blocos, todos abertos, um debaixo do outro —
 * quatro telas de rolagem num celular. E o mais alto deles, a ficha
 * cadastral, é o que menos se usa: é consulta, não tem um botão sequer.
 *
 * A aba vai crescer (holerite, documentos, o que vier), então o
 * recolher virou PEÇA, e não sete cópias do mesmo `useState` — que é
 * como este sistema já foi mordido quatro vezes.
 *
 * O risco de recolher é esconder o que pede ação. É disso que a maior
 * parte deste arquivo cuida.
 */
import { test, expect } from 'bun:test';
import { ROTULO_PRESENCA } from '../tipos';
import { ROTULO_TEMA } from './tema';

const lerSecao = async (): Promise<string> =>
  Bun.file(new URL('../componentes/SecaoRecolhivel.tsx', import.meta.url)).text();

const lerAba = async (): Promise<string> =>
  Bun.file(new URL('../componentes/AbaEu.tsx', import.meta.url)).text();

const lerDocumentos = async (): Promise<string> =>
  Bun.file(new URL('../componentes/MeusDocumentos.tsx', import.meta.url)).text();

/** O código sem os comentários, para a verificação não achar a explicação. */
const semComentarios = (fonte: string): string =>
  fonte.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

test('O RECOLHER É UMA PEÇA, e não sete cópias', async () => {
  /**
   * A aba vai ganhar seções. Escrito à mão em cada bloco, seriam sete
   * versões do mesmo estado, e a oitava sairia diferente.
   */
  const aba = semComentarios(await lerAba());
  const documentos = semComentarios(await lerDocumentos());

  expect(aba).toContain("import { SecaoRecolhivel } from './SecaoRecolhivel'");
  expect(documentos).toContain("import { SecaoRecolhivel } from './SecaoRecolhivel'");

  // Pelo menos quatro seções na aba: dados, presença, preferências, admin
  expect((aba.match(/<SecaoRecolhivel/g) || []).length).toBeGreaterThanOrEqual(4);
});

test('A SEÇÃO NASCE FECHADA por padrão', async () => {
  /**
   * Numa tela de celular, cada bloco aberto empurra o seguinte para
   * fora da primeira dobra. Abrir é a exceção, e quem a quer pede.
   */
  const secao = semComentarios(await lerSecao());

  expect(secao).toContain('abertaDeInicio = false');
  expect(secao).toContain('useState(abertaDeInicio)');
});

test('A FICHA CADASTRAL NASCE FECHADA', async () => {
  /**
   * Era o bloco mais alto da aba e não tem um botão sequer: ninguém
   * volta ali depois de conferir uma vez.
   */
  const aba = semComentarios(await lerAba());

  const inicio = aba.indexOf('titulo="Meus dados"');
  expect(inicio).toBeGreaterThan(-1);

  const bloco = aba.slice(inicio, inicio + 400);
  expect(bloco).not.toContain('abertaDeInicio');
});

test('FECHADA, A SEÇÃO AINDA DIZ ALGUMA COISA', async () => {
  /**
   * Uma seção recolhida sem resumo é uma gaveta sem etiqueta: a pessoa
   * abre todas para achar a que queria, e aí recolher não economizou
   * nada.
   *
   * O resumo some quando a seção abre — o conteúdo já o repete.
   */
  const secao = semComentarios(await lerSecao());

  expect(secao).toContain('{!aberta && resumo && (');

  const aba = semComentarios(await lerAba());
  expect(aba).toContain('resumo={`${colaboradorAtual.cargo} · ${colaboradorAtual.loja}`}');
  expect(aba).toContain('resumo={ROTULO_PRESENCA[colaboradorAtual.presenca]');
});

test('ADVERTÊNCIA SEM CIÊNCIA NASCE ABERTA', async () => {
  /**
   * É a única seção da aba que pede uma ação da pessoa, e com prazo.
   * Recolhida, viraria mais uma linha entre as outras — e "não vi" é
   * exatamente a defesa que a ciência existe para tirar de cena.
   *
   * Com todas assinadas, recolhe como o resto.
   */
  const documentos = semComentarios(await lerDocumentos());

  expect(documentos).toContain('abertaDeInicio={semCiencia.length > 0}');
  expect(documentos).toContain('alerta={semCiencia.length > 0}');
  expect(documentos).toContain('`${semCiencia.length} sem ciência`');
});

test('o holerite mais recente aparece no resumo', async () => {
  /**
   * É o que se procura. Com doze meses publicados, a lista aberta seria
   * doze linhas de coisa antiga na frente da única que interessa.
   */
  const documentos = semComentarios(await lerDocumentos());
  expect(documentos).toContain('porExtenso(holerites[0].competencia)');
});

test('TRÊS BLOCOS DE PREFERÊNCIA VIRARAM UM', async () => {
  /**
   * "Notificações e Sons", "Tema" e "Avisos de Mensagem" respondiam à
   * mesma pergunta: como este aparelho se comporta. Separados, ocupavam
   * três cabeçalhos para o que cabe num, e ninguém sabia em qual
   * procurar o som da mensagem.
   */
  const aba = semComentarios(await lerAba());

  expect(aba).toContain('titulo="Preferências"');
  expect(aba).not.toContain('Notificações e Sons');

  // E o resumo diz o tema e se o som está ligado
  expect(aba).toContain('ROTULO_TEMA[temaEscolhido]');
  expect(aba).toContain("comSom ? 'com som' : 'sem som'");
});

test('OS RÓTULOS DE PRESENÇA E TEMA TÊM UM DONO', () => {
  /**
   * "Disponível" estava escrito dentro da lista de botões da aba, e o
   * resumo do cabeçalho seria a segunda cópia. `Record` exaustivo:
   * estado novo não compila sem nome.
   */
  expect(ROTULO_PRESENCA.disponivel).toBe('Disponível');
  expect(ROTULO_PRESENCA.ocupado).toBe('Ocupado');
  expect(ROTULO_PRESENCA.ausente).toBe('Ausente');
  expect(ROTULO_PRESENCA.desconectado).toBe('Desconectado');

  expect(ROTULO_TEMA.sistema).toBe('Automático');
  expect(ROTULO_TEMA.claro).toBe('Claro');
  expect(ROTULO_TEMA.escuro).toBe('Escuro');
});

test('a lista de presença LÊ do rótulo, em vez de repeti-lo', async () => {
  const aba = semComentarios(await lerAba());

  expect(aba).toContain('{ROTULO_PRESENCA[item.valor]}');
  // O nome não está escrito de novo na lista de botões
  expect(aba).not.toContain("rotulo: 'Disponível'");
});

test('o alvo de toque tem 52px', async () => {
  /**
   * É o mínimo para o dedo acertar sem mirar, e a medida que o resto da
   * aba já usa. Um alvo menor aqui faria a pessoa abrir a seção errada.
   */
  const secao = await lerSecao();
  expect(secao).toContain('min-h-[52px]');
  expect(secao).toContain('aria-expanded={aberta}');
});
