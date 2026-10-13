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

test('A ENTREGA É POR CIDADE — e Pirassununga por setor (Elias, 13/10/2026)', async () => {
  const { gruposDeCupons, cuponsDoGrupo } = await import('./cuponsDeAcesso');
  const pessoa = (nome: string, loja: string, setor: string) => ({ nome, login: nome.toLowerCase(), loja, setor, senha: 'abc23def' });
  const lista = [
    pessoa('Ana', 'Leme', 'Balcão'),
    pessoa('Bia', 'Leme', 'Estoque'),
    pessoa('Caio', 'Pirassununga', 'Balcão'),
    pessoa('Davi', 'Pirassununga', 'Estoque'),
    pessoa('Eva', 'Pirassununga', 'Balcão'),
    pessoa('Fabi', 'Descalvado', 'Balcão'),
  ];
  const grupos = gruposDeCupons(lista);
  expect(grupos.map((g) => [g.rotulo, g.quantos])).toEqual([
    ['Descalvado', 1],
    ['Leme', 2],
    ['Pirassununga · Balcão', 2],
    ['Pirassununga · Estoque', 1],
  ]);
  // Cada leva imprime só os seus: Leme inteiro, e só o Balcão de Pirassununga
  expect(cuponsDoGrupo(lista, grupos[1]).map((c) => c.nome)).toEqual(['Ana', 'Bia']);
  expect(cuponsDoGrupo(lista, grupos[2]).map((c) => c.nome)).toEqual(['Caio', 'Eva']);
  // Nenhum cupom fica fora de grupo, nem aparece em dois
  expect(grupos.reduce((s, g) => s + g.quantos, 0)).toBe(lista.length);
});
