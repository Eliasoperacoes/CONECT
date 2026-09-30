/**
 * O AVISO DO PONTO — executando a função de servidor de verdade
 *
 * Mesma montagem de `respostaRapida.test.ts`: o arquivo que o Elias cola
 * no painel, rodando no Bun com `Deno`, banco, Google e Firebase de
 * mentira.
 *
 * O que se testa aqui são as travas: o pedido é lido COM A SESSÃO de
 * quem chama (a RLS decide se ele pode), a decisão só é avisada por quem
 * decidiu, e quem recebe a decisão sai do banco, nunca do corpo.
 */
import { test, expect, mock, beforeEach, afterAll } from 'bun:test';

type Linha = Record<string, any>;
let tabelas: Record<string, Linha[]>;
/** Quem enxerga cada pedido pela RLS: sessão -> ids visíveis. */
let visiveisPara: Record<string, string[]>;

const consulta = (tabela: string, visivel: (l: Linha) => boolean = () => true) => {
  const filtros: Array<(l: Linha) => boolean> = [visivel];
  let operacao: 'select' | 'delete' = 'select';
  const linhas = () => (tabelas[tabela] ||= []).filter((l) => filtros.every((f) => f(l)));

  const construtor: any = {
    select: () => construtor,
    eq: (c: string, v: any) => (filtros.push((l) => l[c] === v), construtor),
    neq: (c: string, v: any) => (filtros.push((l) => l[c] !== v), construtor),
    in: (c: string, vs: any[]) => (filtros.push((l) => vs.includes(l[c])), construtor),
    maybeSingle: async () => ({ data: linhas()[0] ?? null, error: null }),
    delete: () => ((operacao = 'delete'), construtor),
    then: (resolver: (r: any) => void) => {
      if (operacao === 'delete') {
        const fora = new Set(linhas());
        tabelas[tabela] = tabelas[tabela].filter((l) => !fora.has(l));
        return resolver({ error: null });
      }
      return resolver({ data: linhas(), error: null });
    },
  };
  return construtor;
};

const SESSOES: Record<string, string> = {
  'jwt-da-ana': 'auth-ana',
  'jwt-da-bia': 'auth-bia',
  'jwt-do-caio': 'auth-caio',
};

const bancoDeServico = {
  from: (t: string) => consulta(t),
  auth: {
    getUser: async (jwt: string) =>
      SESSOES[jwt] ? { data: { user: { id: SESSOES[jwt] } } } : { data: { user: null } },
  },
};

/**
 * Com a chave pública e a sessão de alguém, o cliente vê o banco COMO
 * aquela pessoa: só os pedidos que `visiveisPara` lhe dá. É a RLS.
 */
mock.module('jsr:@supabase/supabase-js@2', () => ({
  createClient: (_url: string, chave: string, opcoes?: any) => {
    if (chave !== 'chave-publica-de-teste') return bancoDeServico;
    const jwt = String(opcoes?.global?.headers?.Authorization || '').replace('Bearer ', '');
    const pode = new Set(visiveisPara[jwt] || []);
    return { from: (t: string) => consulta(t, (l) => pode.has(l.id)) };
  },
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

const FUNCAO = '../../supabase/functions/enviar-aviso/index.ts';
await import(FUNCAO);

const chamar = (ponto: Record<string, unknown>, jwt?: string) =>
  atender(
    new Request('https://x/functions/v1/enviar-aviso', {
      method: 'POST',
      headers: jwt ? { Authorization: `Bearer ${jwt}` } : {},
      body: JSON.stringify({ ponto }),
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
      { id: 'zeca', nome: 'Zeca', loja: 'Pirassununga', auth_user_id: 'auth-zeca', ativo: false },
    ],
    aparelhos: ['ana', 'bia', 'caio', 'zeca'].map((c) => ({
      token: `token-${c}`,
      colaborador_id: c,
    })),
    ajustes_jornada: [
      { id: 'aj-pendente', colaborador_id: 'ana', estado: 'pendente', aprovador_id: null },
      { id: 'aj-aprovado', colaborador_id: 'ana', estado: 'aprovado', aprovador_id: 'bia' },
    ],
    justificativas_ausencia: [
      { id: 'folga-ana', colaborador_id: 'ana', estado: 'pendente', aprovador_id: null },
    ],
  };
  // A Ana vê os próprios pedidos; a Bia, líder dela, também; o Caio não
  visiveisPara = {
    'jwt-da-ana': ['aj-pendente', 'aj-aprovado', 'folga-ana'],
    'jwt-da-bia': ['aj-pendente', 'aj-aprovado', 'folga-ana'],
    'jwt-do-caio': [],
  };
});

test('o pedido novo chega a quem acompanha, com o nome do dono tirado do banco', async () => {
  const r = await chamar(
    {
      evento: 'pedido',
      tabela: 'ajustes_jornada',
      id: 'aj-pendente',
      destinatarios: ['bia', 'caio', 'ana', 'zeca', 'bia'],
      secao: 'aprovar_jornadas',
      texto: 'Hora extra de 1h20 em 28/09/2026 · aguarda sua decisão',
    },
    'jwt-da-ana'
  );

  expect(r.status).toBe(200);
  // Quem pediu não recebe o próprio aviso; o desligado também não; repetido, uma vez
  expect(quemRecebeu()).toEqual(['bia', 'caio']);

  const dados = entregas[0].data;
  expect(dados.tipo).toBe('secao');
  expect(dados.conversaId).toBe('aprovar_jornadas');
  expect(dados.remetente).toBe('Ana');
  expect(dados.ehGrupo).toBe('true');
  // Aviso do ponto não se responde pela notificação
  expect(dados.vale).toBeUndefined();
});

test('PEDIDO FORA DO ALCANCE não avisa ninguém: a RLS de quem chama decide', async () => {
  const r = await chamar(
    {
      evento: 'pedido',
      tabela: 'ajustes_jornada',
      id: 'aj-pendente',
      destinatarios: ['bia'],
      secao: 'aprovar_jornadas',
      texto: 'qualquer coisa',
    },
    'jwt-do-caio'
  );
  expect(r.status).toBe(404);
  expect(entregas).toEqual([]);
});

test('pedido já decidido não volta a avisar como pendente', async () => {
  const r = await chamar(
    {
      evento: 'pedido',
      tabela: 'ajustes_jornada',
      id: 'aj-aprovado',
      destinatarios: ['bia'],
      secao: 'aprovar_jornadas',
      texto: 'x',
    },
    'jwt-da-ana'
  );
  expect(r.status).toBe(409);
  expect(entregas).toEqual([]);
});

test('tabela ou seção fora da lista é recusada', async () => {
  const base = { evento: 'pedido', id: 'aj-pendente', destinatarios: ['bia'], texto: 'x' };
  expect((await chamar({ ...base, tabela: 'colaboradores', secao: 'aprovar_jornadas' }, 'jwt-da-ana')).status).toBe(400);
  expect((await chamar({ ...base, tabela: 'ajustes_jornada', secao: 'meu_ponto' }, 'jwt-da-ana')).status).toBe(400);
  expect(entregas).toEqual([]);
});

test('sem sessão, nada', async () => {
  const r = await chamar({ evento: 'pedido', tabela: 'ajustes_jornada', id: 'aj-pendente', destinatarios: ['bia'], secao: 'aprovar_jornadas', texto: 'x' });
  expect(r.status).toBe(401);
});

test('A DECISÃO VAI PARA O DONO, e só para ele — a lista do corpo é ignorada', async () => {
  const r = await chamar(
    {
      evento: 'decisao',
      tabela: 'ajustes_jornada',
      id: 'aj-aprovado',
      destinatarios: ['caio'],
      secao: 'aprovar_jornadas',
      texto: 'Aprovado: Hora extra de 1h20 em 28/09/2026',
    },
    'jwt-da-bia'
  );
  expect(r.status).toBe(200);
  expect(quemRecebeu()).toEqual(['ana']);
  expect(entregas[0].data.remetente).toBe('Bia');
  // O toque leva ao ponto de quem pediu, seja qual for a seção enviada
  expect(entregas[0].data.conversaId).toBe('meu_ponto');
});

test('só quem decidiu avisa da decisão', async () => {
  // A Ana enxerga o próprio pedido, mas não foi ela quem decidiu
  const r = await chamar(
    { evento: 'decisao', tabela: 'ajustes_jornada', id: 'aj-aprovado', texto: 'Aprovado: tudo' },
    'jwt-da-ana'
  );
  expect(r.status).toBe(403);
  expect(entregas).toEqual([]);
});

test('decisão de pedido ainda pendente é recusada', async () => {
  const r = await chamar(
    { evento: 'decisao', tabela: 'justificativas_ausencia', id: 'folga-ana', texto: 'x' },
    'jwt-da-bia'
  );
  expect(r.status).toBe(409);
});

test('a lista de destinatários tem teto: não vira alto-falante', async () => {
  for (let i = 0; i < 50; i++) {
    tabelas.colaboradores.push({ id: `p${i}`, nome: `P${i}`, loja: 'X', ativo: true });
    tabelas.aparelhos.push({ token: `token-p${i}`, colaborador_id: `p${i}` });
  }
  await chamar(
    {
      evento: 'pedido',
      tabela: 'ajustes_jornada',
      id: 'aj-pendente',
      destinatarios: Array.from({ length: 50 }, (_, i) => `p${i}`),
      secao: 'aprovar_jornadas',
      texto: 'x',
    },
    'jwt-da-ana'
  );
  expect(entregas.length).toBe(30);
});
