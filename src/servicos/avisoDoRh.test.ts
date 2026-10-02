/**
 * O AVISO DO RH E OS LEMBRETES — executando a função de servidor de verdade
 *
 * Mesma montagem de `avisoDoPonto.test.ts`: o arquivo que o Elias cola no
 * painel, rodando no Bun com `Deno`, banco, Google e Firebase de mentira.
 *
 * As travas: só quem cuida de pessoas avisa de documento do RH (o banco
 * responde, pela sessão de quem chama); quem recebe é o dono do
 * documento, tirado da linha; e a entrega agendada só abre com o segredo.
 */
import { test, expect, mock, beforeEach, afterAll } from 'bun:test';

type Linha = Record<string, any>;
let tabelas: Record<string, Linha[]>;
/** Quem cuida de pessoas, pela sessão (é o que o banco responderia). */
let cuidaDePessoas: Record<string, boolean>;
/** De quais grupos cada sessão é admin (o que `sou_admin_do_grupo` responderia). */
let adminDeGrupo: Record<string, string[]>;

const consulta = (tabela: string) => {
  const filtros: Array<(l: Linha) => boolean> = [];
  const linhas = () => (tabelas[tabela] ||= []).filter((l) => filtros.every((f) => f(l)));
  const construtor: any = {
    select: () => construtor,
    eq: (c: string, v: any) => (filtros.push((l) => l[c] === v), construtor),
    in: (c: string, vs: any[]) => (filtros.push((l) => vs.includes(l[c])), construtor),
    maybeSingle: async () => ({ data: linhas()[0] ?? null, error: null }),
    delete: () => construtor,
    then: (resolver: (r: any) => void) => resolver({ data: linhas(), error: null }),
  };
  return construtor;
};

const SESSOES: Record<string, string> = { 'jwt-da-dani': 'auth-dani', 'jwt-da-ana': 'auth-ana' };

mock.module('jsr:@supabase/supabase-js@2', () => ({
  createClient: (_url: string, chave: string, opcoes?: any) => {
    if (chave !== 'chave-publica-de-teste') {
      return {
        from: (t: string) => consulta(t),
        auth: {
          getUser: async (jwt: string) =>
            SESSOES[jwt] ? { data: { user: { id: SESSOES[jwt] } } } : { data: { user: null } },
        },
      };
    }
    const jwt = String(opcoes?.global?.headers?.Authorization || '').replace('Bearer ', '');
    return {
      from: (t: string) => consulta(t),
      rpc: async (nome: string, args?: any) => ({
        data:
          nome === 'cuido_de_pessoas'
            ? !!cuidaDePessoas[jwt]
            : nome === 'sou_admin_do_grupo'
              ? (adminDeGrupo[jwt] || []).includes(args?.alvo)
              : null,
        error: null,
      }),
    };
  },
}));

const ambiente: Record<string, string> = {
  SUPABASE_URL: 'https://projeto.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'chave-de-servico-de-teste',
  SUPABASE_ANON_KEY: 'chave-publica-de-teste',
  APURAR_SEGREDO: 'segredo-dos-agendamentos',
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

const chamar = (corpo: Record<string, unknown>, cabecalhos: Record<string, string> = {}) =>
  atender(
    new Request('https://x/functions/v1/enviar-aviso', {
      method: 'POST',
      headers: cabecalhos,
      body: JSON.stringify(corpo),
    })
  );

const comoDani = { Authorization: 'Bearer jwt-da-dani' };
const quemRecebeu = () => entregas.map((e) => e.token.replace('token-', '')).sort();

beforeEach(() => {
  entregas = [];
  cuidaDePessoas = { 'jwt-da-dani': true };
  adminDeGrupo = { 'jwt-da-ana': ['grupo-balcao'] };
  tabelas = {
    colaboradores: [
      { id: 'dani', nome: 'Dani', loja: 'Pirassununga', auth_user_id: 'auth-dani', ativo: true },
      { id: 'ana', nome: 'Ana', loja: 'Pirassununga', auth_user_id: 'auth-ana', ativo: true },
      { id: 'bia', nome: 'Bia', loja: 'Pirassununga', auth_user_id: 'auth-bia', ativo: true },
      { id: 'zeca', nome: 'Zeca', loja: 'Pirassununga', auth_user_id: 'auth-zeca', ativo: false },
    ],
    aparelhos: ['dani', 'ana', 'bia', 'zeca'].map((c) => ({ token: `token-${c}`, colaborador_id: c })),
    holerites: [
      { id: 'hol-ana-2026-09', colaborador_id: 'ana', competencia: '2026-09' },
      { id: 'hol-bia-2026-09', colaborador_id: 'bia', competencia: '2026-09' },
      { id: 'hol-zeca-2026-09', colaborador_id: 'zeca', competencia: '2026-09' },
    ],
    advertencias: [{ id: 'adv-1', colaborador_id: 'bia' }],
    conversas: [{ id: 'grupo-balcao', nome: 'Balcão sábado' }],
    participantes: [
      { conversa_id: 'grupo-balcao', colaborador_id: 'ana', saiu_em: null },
      { conversa_id: 'grupo-balcao', colaborador_id: 'bia', saiu_em: null },
      // A Dani saiu do grupo: não é avisada de nada dele
      { conversa_id: 'grupo-balcao', colaborador_id: 'dani', saiu_em: '2026-10-03T12:00:00Z' },
    ],
  };
});

test('holerite publicado: cada dono é avisado do dele, e o toque leva aos holerites', async () => {
  const r = await chamar({ documentoRh: { tipo: 'holerite', ids: ['hol-ana-2026-09', 'hol-bia-2026-09'] } }, comoDani);
  expect(r.status).toBe(200);
  expect(quemRecebeu()).toEqual(['ana', 'bia']);
  const daAna = entregas.find((e) => e.token === 'token-ana').data;
  expect(daAna).toMatchObject({ tipo: 'secao', conversaId: 'meus_holerites', conversa: 'Holerite disponível' });
  expect(daAna.texto).toContain('Setembro de 2026');
});

test('quem saiu da empresa não é avisado, mesmo com holerite publicado', async () => {
  await chamar({ documentoRh: { tipo: 'holerite', ids: ['hol-zeca-2026-09'] } }, comoDani);
  expect(quemRecebeu()).toEqual([]);
});

test('advertência: o aviso não diz o que é — aparece na tela bloqueada', async () => {
  await chamar({ documentoRh: { tipo: 'advertencia', ids: ['adv-1'] } }, comoDani);
  expect(quemRecebeu()).toEqual(['bia']);
  const dados = entregas[0].data;
  expect(dados.conversaId).toBe('minhas_advertencias');
  expect(`${dados.texto} ${dados.conversa}`.toLowerCase()).not.toContain('advert');
});

test('só quem cuida de pessoas avisa de documento do RH — o banco é quem diz', async () => {
  // A Ana tem sessão, mas o banco responde que ela não cuida de pessoas
  const r = await chamar(
    { documentoRh: { tipo: 'holerite', ids: ['hol-bia-2026-09'] } },
    { Authorization: 'Bearer jwt-da-ana' }
  );
  expect(r.status).toBe(403);
  expect(entregas).toEqual([]);
  // Sem sessão nenhuma, nem chega a perguntar
  expect((await chamar({ documentoRh: { tipo: 'holerite', ids: ['hol-bia-2026-09'] } })).status).toBe(401);
});

test('a entrega agendada só abre com o segredo dos agendamentos', async () => {
  const lembrete = {
    entregaAgendada: [
      {
        colaboradorId: 'ana',
        dados: { tipo: 'secao', conversaId: 'meus_holerites', mensagemId: 'x', remetente: 'RH', texto: 't', conversa: 'c', ehGrupo: 'true' },
      },
    ],
  };
  expect((await chamar(lembrete)).status).toBe(401);
  expect((await chamar(lembrete, { 'x-apurar-segredo': 'chute' })).status).toBe(401);
  // Sessão de RH não substitui o segredo: é outro caminho
  expect((await chamar(lembrete, comoDani)).status).toBe(401);
  expect(entregas).toEqual([]);

  const r = await chamar(lembrete, { 'x-apurar-segredo': 'segredo-dos-agendamentos' });
  expect(await r.json()).toEqual({ pedidos: 1, entregues: 1, recusados: 0 });
  expect(quemRecebeu()).toEqual(['ana']);
});

test('a entrega agendada não abre conversa: tipo fora da lista é recusado', async () => {
  const r = await chamar(
    {
      entregaAgendada: [
        { colaboradorId: 'ana', dados: { tipo: 'conversa', conversaId: 'qualquer', texto: 't' } },
        { colaboradorId: '', dados: { tipo: 'secao', conversaId: 'meus_holerites', texto: 't' } },
      ],
    },
    { 'x-apurar-segredo': 'segredo-dos-agendamentos' }
  );
  expect(await r.json()).toEqual({ pedidos: 2, entregues: 0, recusados: 2 });
  expect(entregas).toEqual([]);
});

test('"Ana adicionou você ao grupo": avisa quem está no grupo, e o toque abre o grupo', async () => {
  const comoAna = { Authorization: 'Bearer jwt-da-ana' };
  const r = await chamar({ entradaNoGrupo: { conversaId: 'grupo-balcao', ids: ['bia', 'dani', 'caio'] } }, comoAna);
  expect(r.status).toBe(200);
  // A Dani saiu, e o Caio nem está no grupo: só a Bia
  expect(quemRecebeu()).toEqual(['bia']);
  expect(entregas[0].data).toMatchObject({
    tipo: 'conversa',
    conversaId: 'grupo-balcao',
    remetente: 'Ana',
    conversa: 'Balcão sábado',
    texto: 'Adicionou você ao grupo',
  });
});

test('só o admin do grupo avisa quem entrou — o banco é quem diz', async () => {
  // A Dani tem sessão (e cuida de pessoas), mas não administra este grupo
  const r = await chamar({ entradaNoGrupo: { conversaId: 'grupo-balcao', ids: ['bia'] } }, comoDani);
  expect(r.status).toBe(403);
  expect(entregas).toEqual([]);
});
