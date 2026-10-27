/**
 * LISTA VAZIA NÃO FICA GUARDADA (26/10/2026). A economia da agência voltou a
 * publicar, mas o Início seguiu "As notícias não chegaram agora": a resposta
 * vazia da manhã estava guardada por meia hora no aparelho.
 */
import { test, expect, beforeEach } from 'bun:test';
import { buscarNoticiasDaArea } from './noticiasDaArea';

const guardado = new Map<string, string>();
(globalThis as any).sessionStorage = {
  getItem: (k: string) => guardado.get(k) ?? null,
  setItem: (k: string, v: string) => void guardado.set(k, v),
};

let respostas: any[] = [];
let pedidos = 0;
globalThis.fetch = (async () => {
  pedidos++;
  return new Response(JSON.stringify(respostas.shift()), { headers: { 'content-type': 'application/json' } });
}) as any;

const noticia = { titulo: 'Dólar cai', link: 'https://agenciabrasil.ebc.com.br/x', editoria: 'economia', publicadaEm: '', resumo: '' };

beforeEach(() => {
  guardado.clear();
  pedidos = 0;
});

test('vazia: a próxima abertura pede de novo, e já vê as que chegaram', async () => {
  respostas = [
    { area: 'Tecnologia', daArea: false, noticias: [], fonte: 'Agência Brasil' },
    { area: 'Tecnologia', daArea: false, noticias: [noticia], fonte: 'Agência Brasil' },
  ];
  expect((await buscarNoticiasDaArea('TI'))?.noticias).toEqual([]);
  expect((await buscarNoticiasDaArea('TI'))?.noticias).toHaveLength(1);
  expect(pedidos).toBe(2);
});

test('com notícia: guarda, e a próxima abertura não pede de novo', async () => {
  respostas = [{ area: 'Tecnologia', daArea: false, noticias: [noticia], fonte: 'Agência Brasil' }];
  await buscarNoticiasDaArea('TI');
  expect((await buscarNoticiasDaArea('TI'))?.noticias).toHaveLength(1);
  expect(pedidos).toBe(1);
});

test('uma vazia que ficou guardada na aba (pela versão antiga) é ignorada', async () => {
  guardado.set('conecta:noticias:TI', JSON.stringify({ em: Date.now(), dados: { area: 'Tecnologia', daArea: false, noticias: [], fonte: 'Agência Brasil' } }));
  respostas = [{ area: 'Tecnologia', daArea: false, noticias: [noticia], fonte: 'Agência Brasil' }];
  expect((await buscarNoticiasDaArea('TI'))?.noticias).toHaveLength(1);
  expect(pedidos).toBe(1);
});
