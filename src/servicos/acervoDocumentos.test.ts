/**
 * Verificação do ACERVO DE DOCUMENTOS DE AUSÊNCIA — CONECTA
 *
 * O que motivou: a tela de atestados entrava tudo que não fosse folga de
 * sábado — férias, recusas, pedidos sem papel nenhum — e virou um mural
 * de avisos de coisa recusada. A pergunta que o RH faz ali é outra: qual
 * colaborador justificou a ausência, com qual documento e de quando.
 */
import { test, expect } from 'bun:test';
import { SE_COMPROVA_COM_DOCUMENTO, ROTULO_TIPO_AUSENCIA } from '../tipos';
import { quemDecide } from './justificativas';

const lerTela = async (): Promise<string> =>
  Bun.file(new URL('../componentes/AbaAtestados.tsx', import.meta.url)).text();

/** O código sem os comentários, para a verificação não achar a explicação. */
const semComentarios = (fonte: string): string =>
  fonte.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

test('FÉRIAS E FOLGA DE SÁBADO NÃO SÃO DOCUMENTO', async () => {
  /**
   * Era o defeito: a tela filtrava `tipo !== 'folga_sabado'`, então
   * férias entrava — e uma recusa de férias aparecia no arquivo de
   * atestados como se fosse atestado recusado.
   *
   * As duas se decidem por calendário e têm tela própria. Não há papel
   * nenhum para arquivar nelas.
   */
  expect(SE_COMPROVA_COM_DOCUMENTO.ferias).toBe(false);
  expect(SE_COMPROVA_COM_DOCUMENTO.folga_sabado).toBe(false);

  expect(SE_COMPROVA_COM_DOCUMENTO.atestado).toBe(true);
  expect(SE_COMPROVA_COM_DOCUMENTO.falta_justificada).toBe(true);
  expect(SE_COMPROVA_COM_DOCUMENTO.comparecimento).toBe(true);
});

test('todo tipo de ausencia PRECISA declarar se tem papel', () => {
  /**
   * `Record` exaustivo: tipo novo não compila sem que alguém decida se
   * entra no acervo. Sem isso, o tipo novo cairia no acervo por omissão —
   * que é como férias entrou da primeira vez.
   */
  for (const tipo of Object.keys(ROTULO_TIPO_AUSENCIA)) {
    expect(typeof SE_COMPROVA_COM_DOCUMENTO[tipo as keyof typeof SE_COMPROVA_COM_DOCUMENTO]).toBe(
      'boolean'
    );
  }
});

test('quem guarda o papel e quem decide sobre ele — UMA linha so', () => {
  /**
   * A tela do RH e a fila de aprovação precisam concordar sobre o que é
   * assunto do RH. Escritas separadas, divergem no primeiro tipo novo: o
   * documento apareceria no acervo e a decisão iria para o líder, ou o
   * contrário — e o pedido ficaria esperando uma tela que ninguém abre.
   */
  for (const tipo of Object.keys(SE_COMPROVA_COM_DOCUMENTO) as (keyof typeof SE_COMPROVA_COM_DOCUMENTO)[]) {
    expect(quemDecide(tipo)).toBe(SE_COMPROVA_COM_DOCUMENTO[tipo] ? 'rh' : 'cadeia');
  }
});

test('a tela le a lista da FONTE, e nao escreve a dela', async () => {
  const tela = semComentarios(await lerTela());

  expect(tela).toContain('SE_COMPROVA_COM_DOCUMENTO[j.tipo]');

  // E não volta a filtrar por tipo na mão
  expect(tela).not.toContain("j.tipo !== 'folga_sabado'");
  expect(tela).not.toContain("j.tipo === 'atestado'");
});

test('O DOCUMENTO É O ASSUNTO DA LINHA, e não um link perdido', async () => {
  /**
   * "Ver documento" abrindo outra aba é lista de links, não acervo. A
   * foto do atestado — que é o caso comum, a pessoa fotografa o papel no
   * celular — aparece em miniatura na própria linha e amplia aqui
   * dentro, sem sair do sistema.
   */
  const tela = await lerTela();

  expect(tela).toContain('const Miniatura');
  expect(tela).toContain('const VisorDocumento');
  expect(tela).toContain('<img');
  // PDF não vira miniatura, mas abre no visor sem sair do sistema
  expect(tela).toContain('<iframe');
});

test('A AUSÊNCIA SEM PAPEL FICA MARCADA', async () => {
  /**
   * Ausência abonada sem documento no arquivo é o que gera autuação na
   * fiscalização. Por isso ela NÃO some da lista — some seria o RH
   * descobrir na hora errada — e ainda vira um número no topo, para
   * cobrar antes de virar problema.
   */
  const tela = semComentarios(await lerTela());

  expect(tela).toContain('Sem documento');
  expect(tela).toContain('semDocumento');
  expect(tela).toContain('Sem papel no arquivo');
});

test('O RECUSADO SAI DA FRENTE, mas não some', async () => {
  /**
   * A queixa foi esta: a tela parecia notificação de coisa recusada.
   * Recado é trabalho do sino. Mas apagar o recusado seria apagar
   * histórico de uma decisão sobre a ausência de alguém — ele fica, atrás
   * de um botão que diz quantos são.
   */
  const tela = semComentarios(await lerTela());

  expect(tela).toContain('useState(false)');
  expect(tela).toContain("verRecusados ? true : j.estado !== 'recusada'");
  expect(tela).toContain('Ver recusados (${recusados.length})');

  // O acervo inteiro continua tendo os recusados — o filtro é só da vista
  expect(tela).toContain("acervo.filter((j) => j.estado === 'recusada')");
});

test('O NÚMERO DO PAINEL APONTA PARA O QUE ESTÁ NA TELA', async () => {
  /**
   * "N pedidos aguardam sua decisão" contava tudo que estivesse pendente
   * — férias e folga de sábado inclusive — e o clique levava à aba de
   * documentos, onde essas duas nem aparecem. O RH clicava num 4 e caía
   * numa lista de 1.
   */
  const painel = semComentarios(
    await Bun.file(new URL('../componentes/PainelRH.tsx', import.meta.url)).text()
  );

  expect(painel).toContain(
    "(j) => j.estado === 'pendente' && SE_COMPROVA_COM_DOCUMENTO[j.tipo]"
  );

  // E o clique continua indo para a aba que mostra esses documentos
  expect(painel).toContain("aoAbrir: () => setSecao('atestados')");
});

test('a linha diz QUEM, DE QUANDO e QUANDO ENTREGOU', async () => {
  /**
   * "Entregou a tempo?" é a segunda pergunta do RH, e ela não se responde
   * pelo período do atestado — se responde pela data em que o papel
   * chegou. Eram informações diferentes e só uma aparecia.
   */
  const tela = await lerTela();

  expect(tela).toContain('formatarData(j.criadoEm)');
  expect(tela).toContain('entregue em ');
  expect(tela).toContain('formatarData(j.dataInicio)');
  expect(tela).toContain('pessoa?.nome');
});
