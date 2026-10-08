/**
 * O AFD EM BYTES (arquivosFiscais.ts): ISO 8859-1, cada registro com CRLF —
 * inclusive o último — e o nome "AFD" + INPI + CNPJ + "REP_P", tirado do
 * próprio cabeçalho. O conteúdo é do banco (arquivoFonteDeDados.test.ts).
 */
import { test, expect } from 'bun:test';
import { bytesDoArquivo, nomeDoAfd } from './arquivosFiscais';

/** Um cabeçalho com o CNPJ (12-25) e o INPI (190-206) nas posições do leiaute. */
const cabecalho = (inpi: string) =>
  '000000000' + '1' + '1' + '05041606000199' + ' '.repeat(14) + 'MALACHIAS AUTO PECAS LTDA'.padEnd(150, ' ') + inpi.padEnd(17, ' ');

test('ISO 8859-1, um byte por caractere — "ç" é 0xE7 — e o que a tabela não tem vira "?"', () => {
  const b = bytesDoArquivo(['Conceição', 'a—b']);
  expect([...b.slice(0, 11)]).toEqual([...Buffer.from('Conceição\r\n', 'latin1')]);
  expect(b[6]).toBe(0xe7);
  expect([...b.slice(11)]).toEqual([0x61, 0x3f, 0x62, 13, 10]);
});

test('CADA registro termina com 13 e 10, inclusive o último; e não há linha em branco', () => {
  const texto = Buffer.from(bytesDoArquivo(['1', '2', '9'])).toString('latin1');
  expect(texto).toBe('1\r\n2\r\n9\r\n');
  expect(texto.includes('\r\n\r\n')).toBe(false);
});

test('O NOME: "AFD" + INPI + CNPJ + "REP_P" — sem o INPI ainda, sai sem ele', () => {
  expect(nomeDoAfd(cabecalho('0000512022123456Y'.replace('Y', '7')))).toBe('AFD5120221234567' + '05041606000199REP_P.txt');
  expect(nomeDoAfd(cabecalho(''))).toBe('AFD05041606000199REP_P.txt');
});

test('o cartão do AFD fica no banco de horas, só para quem cuida de pessoas e com o período da tela', async () => {
  const tela = await Bun.file(new URL('../componentes/BancoDeHoras.tsx', import.meta.url)).text();
  expect(tela).toContain('{cuidaDePessoas(colaboradorAtual) && usandoNuvem() && (\n              <ArquivoFonteDeDados inicio={dataInicio} fim={dataFim} />');
  const cartao = await Bun.file(new URL('../componentes/ArquivoFonteDeDados.tsx', import.meta.url)).text();
  // O que falta para valer é dito, não escondido
  expect(cartao).toContain('falta o registro do sistema no INPI');
  expect(cartao).toContain("baixarArquivo(r.bytes, r.nome, 'text/plain;charset=ISO-8859-1');");
});
