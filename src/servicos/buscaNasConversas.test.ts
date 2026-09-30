import { expect, test } from 'bun:test';
import {
  buscarNasConversas,
  mensagemCasaComBusca,
  normalizarBusca,
  trechoEmVolta,
} from './buscaNasConversas';

const msg = (id: string, conversaId: string, texto: string, criadoEm: string, extra: any = {}) =>
  ({ id, conversaId, remetenteId: 'x', tipo: 'texto', texto, criadoEm, horaFormatada: '10:00', lida: true, ...extra }) as any;

const CONVERSAS: any[] = [
  { id: 'c1', nome: 'Fábio Engle', tipo: 'individual' },
  { id: 'c2', nome: 'Balcão Pirassununga', tipo: 'grupo' },
];
const MENSAGENS: Record<string, any[]> = {
  c1: [msg('m1', 'c1', 'A peça do Gol chegou', '2026-09-20T10:00:00Z'), msg('m2', 'c1', 'ok', '2026-09-21T10:00:00Z')],
  c2: [
    msg('m3', 'c2', 'Quem viu a PECA do Uno?', '2026-09-22T10:00:00Z'),
    msg('m4', 'c2', '', '2026-09-23T10:00:00Z', { tipo: 'arquivo', arquivoNome: 'nota-peça.pdf' }),
    msg('m5', 'c2', '', '2026-09-24T10:00:00Z', { tipo: 'recado_voz' }),
  ],
};
const buscar = (termo: string) => buscarNasConversas(termo, CONVERSAS, (id) => MENSAGENS[id] || []);

test('sem acento e sem diferenciar maiúscula: "peca" acha "peça", "PECA" e o arquivo', () => {
  expect(normalizarBusca('  Peça do CAMINHÃO ')).toBe('peca do caminhao');
  const r = buscar('peca');
  expect(r.mensagens.map((x) => x.mensagem.id)).toEqual(['m4', 'm3', 'm1']);
});

test('as mensagens vêm da mais recente para a mais antiga, com a conversa de cada uma', () => {
  const r = buscar('peça');
  expect(r.mensagens[0].conversa.id).toBe('c2');
  expect(r.mensagens.at(-1)!.conversa.nome).toBe('Fábio Engle');
});

test('o nome da conversa também é encontrado', () => {
  expect(buscar('fabio').conversas.map((c) => c.id)).toEqual(['c1']);
  expect(buscar('balcao').conversas.map((c) => c.id)).toEqual(['c2']);
});

test('recado de voz não tem texto para achar; termo vazio não busca nada', () => {
  expect(mensagemCasaComBusca(MENSAGENS.c2[2], 'peça')).toBe(false);
  expect(buscar('   ')).toEqual({ conversas: [], mensagens: [] });
});

test('há teto de resultados: palavra comum demais pede refinar', () => {
  const muitas = Array.from({ length: 80 }, (_, i) => msg(`k${i}`, 'c1', 'ok', `2026-09-01T00:${String(i % 60).padStart(2, '0')}:00Z`));
  const r = buscarNasConversas('ok', CONVERSAS, (id) => (id === 'c1' ? muitas : []));
  expect(r.mensagens).toHaveLength(50);
});

test('o trecho mostra a palavra, e não só o começo de uma mensagem longa', () => {
  const longa = 'Bom dia pessoal, conferindo o estoque de hoje: faltam filtros, pastilhas e a correia dentada do Corsa que o cliente pediu';
  const t = trechoEmVolta(longa, 'correia', 50);
  expect(t).toContain('correia');
  expect(t.startsWith('…')).toBe(true);
});

test('a lupa dentro da conversa usa a MESMA regra da busca da lista', async () => {
  const tela = await Bun.file(new URL('../componentes/TelaConversa.tsx', import.meta.url)).text();
  expect(tela).toContain('mensagens.filter((m) => mensagemCasaComBusca(m, termoBusca))');
});
