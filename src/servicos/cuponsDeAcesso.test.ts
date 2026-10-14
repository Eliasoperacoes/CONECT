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


test('A ENTREGA É POR CIDADE — e Pirassununga por responsável (Elias, 14/10/2026)', async () => {
  const { gruposDeCupons, cuponsDoGrupo } = await import('./cuponsDeAcesso');
  const pessoa = (nome: string, loja: string, responsavel = '') =>
    ({ nome, login: nome.toLowerCase(), loja, setor: 'Balcão', senha: 'abc23def', responsavel });
  const lista = [
    pessoa('Ana', 'Leme', 'Rui'),
    pessoa('Bia', 'Leme'),
    pessoa('Caio', 'Pirassununga', 'Gi'),
    pessoa('Davi', 'Pirassununga', 'Fabio'),
    pessoa('Eva', 'Pirassununga', 'Gi'),
    pessoa('Gil', 'Pirassununga'),
    pessoa('Fabi', 'Descalvado'),
  ];
  const grupos = gruposDeCupons(lista);
  expect(grupos.map((g) => [g.rotulo, g.quantos])).toEqual([
    ['Descalvado', 1],
    // Fora de Pirassununga a cidade é uma leva só, tenha ou não chefe
    ['Leme', 2],
    ['Pirassununga · equipe de Fabio', 1],
    ['Pirassununga · equipe de Gi', 2],
    ['Pirassununga · sem responsável no cadastro', 1],
  ]);
  expect(cuponsDoGrupo(lista, grupos[3]).map((c) => c.nome)).toEqual(['Caio', 'Eva']);
  expect(cuponsDoGrupo(lista, grupos[4]).map((c) => c.nome)).toEqual(['Gil']);
  // Nenhum cupom fica fora de grupo, nem aparece em dois
  expect(grupos.reduce((s, g) => s + g.quantos, 0)).toBe(lista.length);
});

test('"A DANI COM O RESTANTE": várias levas numa impressão, sem repetir ninguém', async () => {
  const { gruposDeCupons, cuponsDosGrupos } = await import('./cuponsDeAcesso');
  const pessoa = (nome: string, responsavel: string) =>
    ({ nome, login: nome, loja: 'Pirassununga', setor: 'Balcão', senha: 'x', responsavel });
  const lista = [pessoa('Caio', 'Gi'), pessoa('Davi', 'Fabio'), pessoa('Eva', 'Fernanda'), pessoa('Gil', 'Raul'), pessoa('Ivo', '')];
  const grupos = gruposDeCupons(lista);
  // O restante: todas as equipes menos Gi, Fernanda e Fabio
  const restante = grupos.filter((g) => !['Gi', 'Fernanda', 'Fabio'].includes(g.responsavel!));
  expect(cuponsDosGrupos(lista, restante).map((c) => c.nome)).toEqual(['Gil', 'Ivo']);
  // Marcar a mesma leva duas vezes não imprime cupom em dobro
  expect(cuponsDosGrupos(lista, [grupos[0], grupos[0]])).toHaveLength(1);
});

test('o chefe sai do cadastro, ao montar a lista dos cupons', () => {
  const tela = require('node:fs').readFileSync('src/componentes/PainelAdministrativo.tsx', 'utf8');
  expect(tela).toContain('const chefeId = bancoDados.obterColaboradorPorId(c.colaborador_id)?.responsavelId;');
  expect(tela).toContain('const leva = cuponsDosGrupos(cuponsParaEntregar, grupos);');
});
