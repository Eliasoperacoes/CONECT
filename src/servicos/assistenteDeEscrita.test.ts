/**
 * O QUE NÃO VAI PARA A IA DA CENTRAL (14/10/2026): imagens, links, botões
 * e pessoas citadas saem do aparelho como marcadores e voltam no lugar.
 */
import { test, expect } from 'bun:test';
import { devolverElementos, protegerElementos } from './assistenteDeEscrita';

const AVISO = [
  '![capa](central/abc.jpg "capa")',
  'Reuniao sabado com @[Ana Souza](pessoa:colab-123) as 8h.',
  'Confirme em [[Responder formulário]](https://forms.exemplo/x) ou veja [o regulamento](https://exemplo.com/r).',
].join('\n');

test('a IA não recebe nome, código de pessoa nem endereço — só marcadores', () => {
  const { texto, elementos } = protegerElementos(AVISO);
  expect(texto).toBe(
    ['⟦1⟧', 'Reuniao sabado com ⟦2⟧ as 8h.', 'Confirme em ⟦3⟧ ou veja ⟦4⟧.'].join('\n')
  );
  expect(texto).not.toMatch(/Ana|colab-123|https?:|central\//);
  expect(elementos).toHaveLength(4);
});

test('a resposta volta com cada elemento no lugar que a IA deu a ele', () => {
  const { elementos } = protegerElementos(AVISO);
  const daIa = '⟦1⟧\n\n**Reunião no sábado**, às 8h, com ⟦2⟧.\n\nConfirme pelo botão: ⟦3⟧ (regulamento: ⟦4⟧)';
  expect(devolverElementos(daIa, elementos)).toBe(
    '![capa](central/abc.jpg "capa")\n\n**Reunião no sábado**, às 8h, com @[Ana Souza](pessoa:colab-123).\n\n' +
      'Confirme pelo botão: [[Responder formulário]](https://forms.exemplo/x) (regulamento: [o regulamento](https://exemplo.com/r))'
  );
});

test('o que a IA deixou cair volta no fim; marcador inventado ou repetido some', () => {
  const { elementos } = protegerElementos(AVISO);
  const resultado = devolverElementos('Reunião sábado às 8h com ⟦2⟧ e ⟦2⟧. ⟦9⟧', elementos);
  // A pessoa citada aparece uma vez só; o ⟦9⟧ inventado sumiu
  expect(resultado.match(/pessoa:colab-123/g)).toHaveLength(1);
  expect(resultado).not.toContain('⟦');
  // A capa, o botão e o link não se perderam
  expect(resultado).toContain('![capa](central/abc.jpg "capa")');
  expect(resultado).toContain('[[Responder formulário]](https://forms.exemplo/x)');
  expect(resultado).toContain('[o regulamento](https://exemplo.com/r)');
});

test('texto sem nada a proteger passa igual', () => {
  expect(protegerElementos('Feriado na segunda.')).toEqual({ texto: 'Feriado na segunda.', elementos: [] });
  expect(devolverElementos('Feriado na segunda.', [])).toBe('Feriado na segunda.');
});

test('o pedido sai do aparelho já protegido, e não o texto original', async () => {
  const fonte = await Bun.file('src/servicos/assistenteDeEscrita.ts').text();
  expect(fonte).toContain('const { texto: entrada, elementos } = protegerElementos(pedido.entrada);');
  expect(fonte).toContain('body: { ...pedido, entrada },');
});
