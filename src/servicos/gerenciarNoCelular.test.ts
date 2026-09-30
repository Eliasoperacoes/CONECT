/**
 * O GERENCIAR NO CELULAR — pedido do Elias: "layout estourado, texto
 * empilhado, não é possível utilizar todas as funções".
 */
import { expect, test } from 'bun:test';

const ler = (nome: string) => Bun.file(new URL(`../componentes/${nome}`, import.meta.url)).text();

test('as abas dos três níveis são as mesmas abas que deslizam, e nunca quebram linha', async () => {
  const componente = await ler('AbasRolaveis.tsx');
  expect(componente).toContain('overflow-x-auto no-scrollbar');
  expect(componente).toContain('whitespace-nowrap');
  // A aba escolhida rola para a vista: chegar por um aviso na quarta aba e não vê-la
  expect(componente).toContain("scrollIntoView({ block: 'nearest', inline: 'center'");

  for (const tela of ['PainelRede.tsx', 'PainelRH.tsx', 'PainelGestao.tsx', 'Organograma.tsx']) {
    expect({ tela, usa: (await ler(tela)).includes('<AbasRolaveis') }).toEqual({ tela, usa: true });
  }
});

test('o ORGANOGRAMA se edita por toque: arrastar não funciona com o dedo', async () => {
  const organograma = await ler('Organograma.tsx');
  // Um botão em cada pessoa, e um toque em quem está sem responsável
  expect(organograma).toContain('setMovendo(c)');
  expect(organograma).toContain("onClick={() => podeEditar && setMovendo(c)}");
  // A escolha passa pela MESMA regra do arrasto, e diz por que não pode
  expect(organograma).toContain('const regra = podeSerResponsavelDe(c, movendo, todos);');
  expect(organograma).toContain('disabled={!regra.pode || atual}');
  expect(organograma).toContain('mover(movendo, c.id)');
});

test('em Equipe e ponto, as abas vêm antes dos cartões, e os cartões só na vista da equipe', async () => {
  const gestao = await ler('PainelGestao.tsx');
  expect(gestao.indexOf('<AbasRolaveis')).toBeLessThan(gestao.indexOf('titulo="Equipe"'));
  expect(gestao).toContain("{aba === 'equipe' && (");
});
