/**
 * A IA DE ESCRITA DA CENTRAL (14/10/2026): a regra e o arquivo que vai
 * para o Supabase, testado como ele é — com um Deno, um banco e um
 * Google de mentira.
 *
 * O pedido do Elias: "limitar ela somente a essa tarefa, sem que ela
 * tenha acesso a código, informações e etc".
 */
import { test, expect, beforeAll, beforeEach } from 'bun:test';
import { readFileSync } from 'fs';
import { gerarFuncaoEscrita, DESTINO_ESCRITA } from '../../scripts/gerar-funcao-apurar';
import { INSTRUCAO_FIXA, lerPedido, lerRespostaDaIa, limparTextoDaIa, montarPedido, MAXIMO_DA_ENTRADA } from './escritaComIa';

test('o arquivo colado no Supabase está em dia com o código', async () => {
  // Mudou uma regra e esqueceu de gerar? Rode: bun scripts/gerar-funcao-apurar.ts
  expect(readFileSync(DESTINO_ESCRITA, 'utf8').replace(/\r\n/g, '\n')).toBe(await gerarFuncaoEscrita());
});

test('a chave do Google não está no código: só o nome do segredo', () => {
  const gerado = readFileSync(DESTINO_ESCRITA, 'utf8');
  expect(gerado).toContain('Deno.env.get("GEMINI_CHAVE")');
  expect(gerado).not.toMatch(/AIza[0-9A-Za-z_-]{20,}/);
  expect(gerado).not.toMatch(/supabase\.co/);
});

// ---------------------------------------------------------------- a regra

test('só as cinco ações, com tamanho máximo — não é um chat livre', () => {
  expect('erro' in lerPedido({ acao: 'conversar', entrada: 'oi, tudo bem?' })).toBe(true);
  expect('erro' in lerPedido({ acao: 'criar', entrada: 'x'.repeat(MAXIMO_DA_ENTRADA + 1) })).toBe(true);
  expect('erro' in lerPedido({ acao: 'criar', entrada: '  ' })).toBe(true);
  expect('erro' in lerPedido({ acao: 'tom', entrada: 'Texto do aviso' })).toBe(true); // tom sem o tom
  expect(lerPedido({ acao: 'tom', entrada: 'Texto do aviso', tom: 'direto' })).toEqual({
    pedido: { acao: 'tom', entrada: 'Texto do aviso', tom: 'direto', tipo: undefined },
  });
});

test('a instrução fixa prende a IA à tarefa e proíbe inventar', () => {
  expect(INSTRUCAO_FIXA).toContain('Sua única tarefa é escrever ou revisar o texto');
  expect(INSTRUCAO_FIXA).toContain('Não invente fatos');
  expect(INSTRUCAO_FIXA).toContain('Nunca use links');
  // O pedido leva só o texto da pessoa e a ação
  expect(montarPedido({ acao: 'melhorar', entrada: 'reuniao sabado 8h' })).toContain('reuniao sabado 8h');
});

test('o que volta da IA chega ao editor sem link, imagem nem HTML', () => {
  const limpo = limparTextoDaIa(
    'Veja [o formulário](https://golpe.com) e [[Abrir]](https://x.com)\n\n\n\n![foto](https://x.com/a.png)<script>alert(1)</script> fim https://solto.com'
  );
  expect(limpo).toBe('Veja o formulário e Abrir\n\nalert(1) fim');
  expect(limpo).not.toMatch(/https?:|<|>|!\[/);
});

test('a resposta tem de vir no formato pedido, e cada ação devolve só o que lhe cabe', () => {
  expect(lerRespostaDaIa('{"titulo": "Reunião no sábado", "texto": "**Sábado**, às 8h."}', 'criar')).toEqual({
    titulo: 'Reunião no sábado',
    texto: '**Sábado**, às 8h.',
  });
  // Bloco de código em volta do JSON também é lido
  expect(lerRespostaDaIa('```json\n{"titulo": "# Feriado"}\n```', 'titulo')).toEqual({ titulo: 'Feriado' });
  // Melhorar não troca o título que a pessoa escreveu
  expect(lerRespostaDaIa('{"titulo": "Outro", "texto": "Corrigido."}', 'melhorar')).toEqual({ texto: 'Corrigido.' });
  expect(lerRespostaDaIa('Aqui está o seu aviso!', 'criar')).toBeNull();
});

// ---------------------------------------------------------------- a função

let tratar: (req: Request) => Promise<Response>;
let chaveDoGoogle: string | undefined;
let respostaDoBanco: { status: number; corpo: unknown };
let respostaDoGoogle: { status: number; corpo: unknown };
let chamadas: Array<{ url: string; cabecalhos: Record<string, string>; corpo: any }>;

beforeAll(async () => {
  (globalThis as any).Deno = {
    env: {
      get: (n: string) =>
        ({ SUPABASE_URL: 'https://projeto.exemplo', SUPABASE_ANON_KEY: 'chave-publica', GEMINI_CHAVE: chaveDoGoogle })[n],
    },
    serve: (f: typeof tratar) => (tratar = f),
  };
  (globalThis as any).fetch = async (url: string, init: RequestInit) => {
    const corpo = init.body ? JSON.parse(String(init.body)) : null;
    chamadas.push({ url, cabecalhos: init.headers as Record<string, string>, corpo });
    const r = url.includes('/rest/v1/rpc/usar_escrita_com_ia') ? respostaDoBanco : respostaDoGoogle;
    return new Response(JSON.stringify(r.corpo), { status: r.status });
  };
  await import(`../../${DESTINO_ESCRITA}`);
});

beforeEach(() => {
  chaveDoGoogle = 'chave-do-google';
  chamadas = [];
  respostaDoBanco = { status: 200, corpo: 29 };
  respostaDoGoogle = {
    status: 200,
    corpo: { candidates: [{ content: { parts: [{ text: '{"titulo": "Reunião", "texto": "Sábado às 8h."}' }] } }] },
  };
});

const pedir = (corpo: unknown, sessao = 'jwt-da-lia') =>
  tratar(
    new Request('https://projeto.exemplo/functions/v1/escrever-com-ia', {
      method: 'POST',
      headers: sessao ? { Authorization: `Bearer ${sessao}` } : {},
      body: JSON.stringify(corpo),
    })
  );

test('o caminho certo: o banco confere COM A SESSÃO de quem pede, e só depois o Google', async () => {
  const r = await pedir({ acao: 'criar', entrada: 'reunião sábado 8h na matriz', tipo: 'aviso' });
  expect(r.status).toBe(200);
  expect(await r.json()).toEqual({ titulo: 'Reunião', texto: 'Sábado às 8h.', restantes: 29 });

  expect(chamadas.map((c) => new URL(c.url).hostname)).toEqual(['projeto.exemplo', 'generativelanguage.googleapis.com']);
  expect(chamadas[0].cabecalhos.Authorization).toBe('Bearer jwt-da-lia');
  expect(chamadas[1].cabecalhos['x-goog-api-key']).toBe('chave-do-google');
});

test('O GOOGLE RECEBE SÓ A INSTRUÇÃO FIXA E O TEXTO DA PESSOA — sem ferramenta, sem dado do banco', async () => {
  await pedir({ acao: 'melhorar', entrada: 'reuniao sabado as 8 na matriz' });
  const google = chamadas[1].corpo;
  expect(Object.keys(google).sort()).toEqual(['contents', 'generationConfig', 'systemInstruction']);
  expect(google.tools).toBeUndefined();
  expect(google.systemInstruction.parts[0].text).toBe(INSTRUCAO_FIXA);
  expect(google.contents).toEqual([
    { role: 'user', parts: [{ text: montarPedido({ acao: 'melhorar', entrada: 'reuniao sabado as 8 na matriz' }) }] },
  ]);
  // Nem a sessão nem a chave do banco vão para o Google
  expect(JSON.stringify(chamadas[1])).not.toContain('jwt-da-lia');
  expect(JSON.stringify(chamadas[1])).not.toContain('chave-publica');
});

test('o banco recusa (não publica na Central, ou passou do limite): o Google nem é chamado', async () => {
  respostaDoBanco = { status: 403, corpo: { code: '42501', message: 'A IA de escrita é de quem publica na Central.' } };
  let r = await pedir({ acao: 'titulo', entrada: 'Texto do aviso de feriado' });
  expect(r.status).toBe(403);
  expect((await r.json()).erro).toBe('A IA de escrita é de quem publica na Central.');

  respostaDoBanco = { status: 400, corpo: { code: 'P0001', message: 'Você já usou a IA 30 vezes hoje. Amanhã libera de novo.' } };
  r = await pedir({ acao: 'titulo', entrada: 'Texto do aviso de feriado' });
  expect(r.status).toBe(429);

  expect(chamadas.some((c) => c.url.includes('googleapis'))).toBe(false);
});

test('pedido fora da regra, sem sessão ou sem chave configurada não gasta uso', async () => {
  expect((await pedir({ acao: 'conversar', entrada: 'me conte uma piada' })).status).toBe(400);
  expect((await pedir({ acao: 'criar', entrada: 'reunião sábado' }, '')).status).toBe(401);
  chaveDoGoogle = undefined;
  expect((await pedir({ acao: 'criar', entrada: 'reunião sábado' })).status).toBe(503);
  expect(chamadas).toEqual([]);
});

test('resposta do Google fora do formato vira erro claro, e não texto estranho no editor', async () => {
  respostaDoGoogle = { status: 200, corpo: { candidates: [{ content: { parts: [{ text: 'Claro! Aqui vai:' }] } }] } };
  const r = await pedir({ acao: 'criar', entrada: 'reunião sábado 8h' });
  expect(r.status).toBe(502);
  expect((await r.json()).erro).toContain('fora do formato');
});

test('o navegador pode chamar: a pergunta prévia (CORS) é respondida', async () => {
  const r = await tratar(new Request('https://projeto.exemplo/functions/v1/escrever-com-ia', { method: 'OPTIONS' }));
  expect(r.headers.get('Access-Control-Allow-Origin')).toBe('*');
});
