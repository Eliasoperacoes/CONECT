/**
 * "FULANO REAGIU 👍 À SUA MENSAGEM" (21/10/2026). Elias: "as reações não
 * chegam notificação". Executa o caminho 7 da função de servidor de verdade
 * (mesma montagem de `avisoDoRh.test.ts`) e a regra do aviso do navegador.
 */
import { test, expect, mock, beforeEach, afterAll } from 'bun:test';
import { reacoesNovasDeOutros } from './avisoDeReacao';
import type { Mensagem } from '../tipos';

type Linha = Record<string, any>;
let tabelas: Record<string, Linha[]>;

const consulta = (tabela: string) => {
  const filtros: Array<(l: Linha) => boolean> = [];
  const linhas = () => (tabelas[tabela] ||= []).filter((l) => filtros.every((f) => f(l)));
  const construtor: any = {
    select: () => construtor,
    eq: (c: string, v: any) => (filtros.push((l) => l[c] === v), construtor),
    in: (c: string, vs: any[]) => (filtros.push((l) => vs.includes(l[c])), construtor),
    // A foto do aviso: ninguém aqui tem foto
    not: () => (filtros.push(() => false), construtor),
    neq: () => construtor,
    maybeSingle: async () => ({ data: linhas()[0] ?? null, error: null }),
    delete: () => construtor,
    then: (resolver: (r: any) => void) => resolver({ data: linhas(), error: null }),
  };
  return construtor;
};

const SESSOES: Record<string, string> = { 'jwt-da-ana': 'auth-ana', 'jwt-da-bia': 'auth-bia' };

mock.module('jsr:@supabase/supabase-js@2', () => ({
  createClient: () => ({
    from: (t: string) => consulta(t),
    auth: {
      getUser: async (jwt: string) =>
        SESSOES[jwt] ? { data: { user: { id: SESSOES[jwt] } } } : { data: { user: null } },
    },
  }),
}));

const ambiente: Record<string, string> = {
  SUPABASE_URL: 'https://projeto.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'chave-de-servico-de-teste',
  SUPABASE_ANON_KEY: 'chave-publica-de-teste',
};
let atender: (req: Request) => Promise<Response>;
(globalThis as any).Deno = {
  env: { get: (k: string) => ambiente[k] },
  serve: (fn: (req: Request) => Promise<Response>) => {
    atender = fn;
  },
};

const par = await crypto.subtle.generateKey(
  { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
  true,
  ['sign', 'verify']
);
const pkcs8 = Buffer.from(await crypto.subtle.exportKey('pkcs8', par.privateKey)).toString('base64');
ambiente.FCM_CONTA_SERVICO = JSON.stringify({
  project_id: 'conecta-teste',
  client_email: 'teste@conecta.iam',
  private_key: `-----BEGIN PRIVATE KEY-----\n${pkcs8}\n-----END PRIVATE KEY-----\n`,
});

let entregas: any[] = [];
const fetchOriginal = globalThis.fetch;
globalThis.fetch = (async (endereco: string, opcoes: any) => {
  if (String(endereco).includes('oauth2.googleapis.com')) {
    return new Response(JSON.stringify({ access_token: 'acesso', expires_in: 3600 }));
  }
  entregas.push(JSON.parse(opcoes.body).message);
  return new Response('{}');
}) as any;
afterAll(() => {
  globalThis.fetch = fetchOriginal;
});

// Numa constante, para o tsc não seguir até o arquivo Deno (como em avisoDoPonto.test.ts)
const FUNCAO = '../../supabase/functions/enviar-aviso/index.ts';
await import(FUNCAO);

const reagir = (jwt: string, mensagemId: string, emoji: string) =>
  atender(
    new Request('https://x/functions/v1/enviar-aviso', {
      method: 'POST',
      headers: { Authorization: `Bearer ${jwt}` },
      body: JSON.stringify({ reacao: { mensagemId, emoji, previa: 'a peça chegou' } }),
    })
  );

const quemRecebeu = () => entregas.map((e) => e.token.replace('token-', '')).sort();

beforeEach(() => {
  entregas = [];
  tabelas = {
    colaboradores: [
      { id: 'ana', nome: 'Ana', loja: 'Pirassununga', auth_user_id: 'auth-ana', ativo: true },
      { id: 'bia', nome: 'Bia', loja: 'Pirassununga', auth_user_id: 'auth-bia', ativo: true },
      { id: 'caio', nome: 'Caio', loja: 'Pirassununga', auth_user_id: 'auth-caio', ativo: true },
    ],
    aparelhos: ['ana', 'bia', 'caio'].map((c) => ({ token: `token-${c}`, colaborador_id: c })),
    conversas: [{ id: 'g1', tipo: 'grupo', nome: 'Balcão sábado', apenas_gestores_publicam: false }],
    participantes: [
      { conversa_id: 'g1', colaborador_id: 'ana', saiu_em: null },
      { conversa_id: 'g1', colaborador_id: 'bia', saiu_em: null },
      { conversa_id: 'g1', colaborador_id: 'caio', saiu_em: null },
    ],
    mensagens: [{ id: 'm1', conversa_id: 'g1', remetente_id: 'ana', reacoes: { '👍': ['bia'] } }],
  };
});

test('a Bia reage à mensagem da Ana: só a Ana é avisada, com o nome da Bia', async () => {
  const r = await reagir('jwt-da-bia', 'm1', '👍');
  expect(r.status).toBe(200);
  expect(quemRecebeu()).toEqual(['ana']);
  expect(entregas[0].data.remetente).toBe('Bia');
  expect(entregas[0].data.texto).toBe('Reagiu 👍 à sua mensagem: "a peça chegou"');
  expect(entregas[0].data.conversaId).toBe('g1');
});

test('quem não reagiu não pede aviso de reação', async () => {
  // O Caio está no grupo, mas o 👍 da linha é da Bia
  const r = await reagir('jwt-da-ana', 'm1', '👍');
  expect(r.status).toBe(403);
  tabelas.mensagens[0].remetente_id = 'caio';
  expect((await reagir('jwt-da-ana', 'm1', '❤️')).status).toBe(403);
  expect(entregas).toEqual([]);
});

test('o autor que saiu do grupo, ou o tirou da lista, não é avisado', async () => {
  tabelas.participantes[0].saiu_em = '2026-10-20T10:00:00Z';
  await reagir('jwt-da-bia', 'm1', '👍');
  tabelas.participantes[0].saiu_em = null;
  tabelas.participantes[0].removida = true;
  await reagir('jwt-da-bia', 'm1', '👍');
  expect(entregas).toEqual([]);
});

const msg = (reacoes: Record<string, string[]>, remetenteId = 'ana'): Mensagem => ({
  id: 'm1',
  conversaId: 'g1',
  remetenteId,
  tipo: 'texto',
  texto: 'a peça chegou',
  criadoEm: '2026-10-21T12:00:00Z',
  horaFormatada: '09:00',
  lida: true,
  reacoes,
});

test('no navegador: avisa só a reação nova de outra pessoa na MINHA mensagem', () => {
  const antes = msg({ '👍': ['bia'] });
  expect(reacoesNovasDeOutros(antes, msg({ '👍': ['bia', 'caio'], '😂': ['ana'] }), 'ana')).toEqual([
    { emoji: '👍', quem: 'caio' },
  ]);
  // A de outra pessoa não me avisa; a que já estava, e a minha, também não
  expect(reacoesNovasDeOutros(msg({}, 'bia'), msg({ '👍': ['caio'] }, 'bia'), 'ana')).toEqual([]);
  expect(reacoesNovasDeOutros(antes, msg({ '👍': ['bia'] }), 'ana')).toEqual([]);
  // Mensagem que o aparelho não tinha: é nova, não reação
  expect(reacoesNovasDeOutros(undefined, msg({ '👍': ['bia'] }), 'ana')).toEqual([]);
});
