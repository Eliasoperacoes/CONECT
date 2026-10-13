/**
 * OS CUPONS DE PRIMEIRO ACESSO (cuponsDeAcesso.ts): cada pessoa com o seu
 * login e a sua senha, o endereço do sistema, e nada de HTML injetado por
 * um nome com "<" — o nome vem da planilha.
 */
import { test, expect } from 'bun:test';
import { documentoDosCupons } from './cuponsDeAcesso';

const CUPONS = [
  { nome: 'Ana Conceição', login: 'ana', loja: 'Pirassununga', setor: 'Balcão', senha: 'k7m2xq9p' },
  { nome: 'Bruno <b>', login: 'bruno', loja: 'Leme', setor: 'Estoque', senha: 'ab3cd4ef' },
];

test('um cupom por pessoa, com login, senha e o endereço sem "https://"', () => {
  const html = documentoDosCupons(CUPONS, 'https://conectamalachias.vercel.app/');
  expect(html.match(/class="cupom"/g)?.length).toBe(2);
  expect(html).toContain('>ana<');
  expect(html).toContain('>k7m2xq9p<');
  expect(html).toContain('>ab3cd4ef<');
  expect(html).toContain('>conectamalachias.vercel.app<');
  expect(html).toContain('2 pessoas');
  // Nada de senha padrão no papel
  expect(html).not.toContain('123456');
});

test('o nome que vem da planilha não vira HTML', () => {
  const html = documentoDosCupons(CUPONS, 'https://x.app');
  expect(html).toContain('Bruno &lt;b&gt;');
  expect(html).not.toContain('Bruno <b>');
});
