/**
 * A TELA SÓ CONFIRMA DEPOIS QUE O BANCO CONFIRMOU — CONECTA
 *
 * Este arquivo existe porque o mesmo defeito voltou quatro vezes: uma ação
 * gravava no aparelho, mandava para o banco SEM ESPERAR, e a tela dizia que
 * deu certo. Quando o banco recusava, a informação existia só naquele
 * navegador — e o erro só aparecia dias depois, quando alguém não conseguia
 * entrar, ou via a lista de conversas voltar sozinha.
 *
 * Custou três rodadas no cadastro do Raphael e duas na exclusão de
 * conversas. O sinal é sempre o mesmo: uma chamada a `nuvem.` ou
 * `nuvemComunicacao.` cujo retorno ninguém lê.
 */
import { test, expect } from 'bun:test';

const lerServico = async (): Promise<string> =>
  Bun.file(new URL('./bancoDados.ts', import.meta.url)).text();

/**
 * O trecho de um método, do nome dele até o PRÓXIMO método.
 *
 * Recortar por número de caracteres já reprovou código certo aqui: um
 * comentário novo empurra o fim do método para fora da janela, e o teste
 * falha apontando para o lugar errado.
 */
const corpoDe = (fonte: string, nome: string): string => {
  const i = fonte.indexOf(nome);
  if (i === -1) throw new Error(`nao achei ${nome}`);

  // O próximo método começa numa linha com dois espaços de recuo
  const resto = fonte.slice(i + nome.length);
  const proximo = resto.search(/\n  (?:async )?[a-zA-Z_][a-zA-Z0-9_]*\(/);
  return proximo === -1 ? resto : resto.slice(0, proximo);
};

test('editar a ficha espera o banco', async () => {
  const s = await lerServico();
  const corpo = corpoDe(s, 'async atualizarColaborador');

  /**
   * Aqui se mexe em nível, loja, responsável e na JORNADA — carga semanal,
   * sábado, intervalo. Uma jornada que não sobe deixa a pessoa sendo
   * cobrada pela errada, e ninguém desconfia porque a tela mostrou o valor
   * certo.
   */
  expect(corpo).toContain('const res = await nuvem.salvarColaborador(');
  expect(corpo).toContain('não foi gravada no banco');
  expect(s).not.toContain('if (usandoNuvem()) nuvem.salvarColaborador(colaboradores[indice]);');
});

test('mudar o responsavel espera o banco', async () => {
  const s = await lerServico();
  const corpo = corpoDe(s, 'async definirResponsavel');

  /**
   * O organograma decide QUEM APROVA hora. Uma mudança que fica só num
   * navegador põe a fila de aprovação de duas pessoas diferentes em dois
   * aparelhos diferentes.
   */
  expect(corpo).toContain('await this.atualizarColaborador(');
});

test('a IMPORTACAO DA PLANILHA nao pode falhar em silencio', async () => {
  const s = await lerServico();
  const corpo = corpoDe(s, 'async importarColaboradoresEmLote');

  /**
   * É o caminho das 88 pessoas. Antes o erro ia só para o console: a tela
   * dizia "88 criados" e o banco podia não ter recebido nenhum. Só
   * apareceria no dia em que elas tentassem entrar.
   */
  expect(corpo).toContain('const res = await nuvem.salvarColaboradoresEmLote(enviados)');
  expect(corpo).toContain('A importação não chegou ao banco');
  expect(corpo).not.toContain("console.error('Importação não chegou ao banco:'");
});

test('cadastrar e excluir colaborador continuam esperando', async () => {
  const s = await lerServico();

  expect(corpoDe(s, 'async criarColaborador')).toContain(
    'const res = await nuvem.salvarColaborador('
  );
  expect(corpoDe(s, 'async removerColaborador')).toContain(
    'const res = await nuvem.removerColaborador(id)'
  );
});

/**
 * O QUE PODE continuar sem esperar, e por quê.
 *
 * Nem toda gravação precisa segurar a tela. O critério é o estrago: se a
 * informação perdida faz alguém tomar decisão errada ou ficar sem acesso,
 * espera. Se ela se corrige sozinha na próxima sincronização, não.
 */
test('presenca e leitura de mensagem podem subir sem esperar', async () => {
  const s = await lerServico();

  // Presença se corrige sozinha no próximo sinal de vida
  expect(s).toContain('nuvem.salvarColaborador(todos[indice]).catch(() => {})');

  // Marcação de leitura idem: no pior caso a mensagem fica como não lida
  expect(s).toContain('nuvemComunicacao.marcarLeitura(recemLidas, atual.id).catch(() => {})');
});
