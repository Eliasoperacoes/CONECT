/**
 * A FUNÇÃO DE SERVIDOR `escrever-com-ia` (Supabase Edge Function, Deno).
 *
 * O botão "Escrever com IA" do editor da Central chama esta função; ela
 * chama o Gemini, do Google, e devolve só o texto. A regra do que a IA faz
 * e do que ela recebe está em `escritaComIa.ts`.
 *
 * NÃO EDITE O ARQUIVO DA PASTA `supabase/functions/escrever-com-ia`.
 * Ele é GERADO a partir deste (`bun scripts/gerar-funcao-apurar.ts`).
 *
 * A ORDEM É A TRAVA:
 *   1. o pedido é conferido (ação, tamanho) antes de gastar qualquer uso;
 *   2. o BANCO decide se esta pessoa pode e se ainda tem uso hoje
 *      (`usar_escrita_com_ia`, chamada COM A SESSÃO DE QUEM PEDE). A regra
 *      é a de quem publica na Central — a mesma da inserção, sem cópia aqui;
 *   3. só então o Google recebe a instrução fixa e o texto da pessoa.
 *      Nada do banco vai junto.
 *
 * A CHAVE DO GOOGLE fica no segredo GEMINI_CHAVE do Supabase — nunca no
 * aplicativo nem no repositório. O modelo pode ser trocado pelo segredo
 * IA_MODELO sem gerar a função de novo.
 */
import { INSTRUCAO_FIXA, lerPedido, lerRespostaDaIa, montarPedido } from './escritaComIa';
import { chavePublica } from './bancoNoServidor';

declare const Deno: {
  env: { get(nome: string): string | undefined };
  serve(tratar: (req: Request) => Promise<Response>): void;
};

/**
 * O FLASH-LITE, e não o Flash (14/10/2026).
 *
 * O Flash "pensa" antes de responder: segundos de raciocínio calado, bom
 * para problema difícil e desperdício para redigir aviso. O Elias mediu
 * os dois no uso real: o Lite "muito mais rápido", com texto equivalente.
 */
const MODELO_PADRAO = 'gemini-flash-lite-latest';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const responder = (corpo: unknown, status = 200) =>
  new Response(JSON.stringify(corpo), { status, headers: { ...CORS, 'content-type': 'application/json' } });

/**
 * O BANCO DIZ SE PODE, como quem pede. Devolve quantos usos restam hoje,
 * ou o motivo da recusa — a mensagem é a que o próprio banco escreveu.
 */
const conferirNoBanco = async (jwt: string): Promise<{ restantes: number } | { erro: string; status: number }> => {
  const r = await fetch(`${Deno.env.get('SUPABASE_URL')}/rest/v1/rpc/usar_escrita_com_ia`, {
    method: 'POST',
    headers: { apikey: chavePublica(), Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' },
    body: '{}',
  });
  if (r.ok) return { restantes: Number(await r.json()) };

  const falha = (await r.json().catch(() => ({}))) as { message?: string; code?: string };
  if (falha.code === 'P0001') return { erro: falha.message || 'Limite de hoje atingido.', status: 429 };
  if (falha.code === '42501') return { erro: falha.message || 'Sem permissão para usar a IA.', status: 403 };
  console.error('usar_escrita_com_ia:', r.status, JSON.stringify(falha));
  return { erro: 'Não foi possível conferir o seu acesso. Tente de novo.', status: 502 };
};

/** O Google, com a instrução fixa e o texto da pessoa — e nada mais */
const chamarGemini = async (chave: string, pedido: string): Promise<{ texto: string } | { erro: string }> => {
  const modelo = Deno.env.get('IA_MODELO') || MODELO_PADRAO;
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent`, {
    method: 'POST',
    headers: { 'x-goog-api-key': chave, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: INSTRUCAO_FIXA }] },
      contents: [{ role: 'user', parts: [{ text: pedido }] }],
      generationConfig: { temperature: 0.6, maxOutputTokens: 4096, responseMimeType: 'application/json' },
    }),
  });
  if (!r.ok) {
    console.error('Gemini respondeu', r.status, await r.text());
    return {
      erro: r.status === 429 ? 'A IA está ocupada agora. Tente de novo em um minuto.' : 'A IA não respondeu. Tente de novo.',
    };
  }
  const dados = (await r.json()) as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
  const texto = (dados.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? '').join('');
  return texto ? { texto } : { erro: 'A IA não devolveu texto. Tente de novo.' };
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return responder({ erro: 'Use POST.' }, 405);

  const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!jwt) return responder({ erro: 'Sem sessão.' }, 401);

  const lido = lerPedido(await req.json().catch(() => null));
  if ('erro' in lido) return responder({ erro: lido.erro }, 400);

  const chave = Deno.env.get('GEMINI_CHAVE');
  if (!chave) return responder({ erro: 'A IA ainda não foi configurada. Fale com o TI.' }, 503);

  const acesso = await conferirNoBanco(jwt);
  if ('erro' in acesso) return responder({ erro: acesso.erro }, acesso.status);

  const resposta = await chamarGemini(chave, montarPedido(lido.pedido));
  if ('erro' in resposta) return responder({ erro: resposta.erro }, 502);

  const resultado = lerRespostaDaIa(resposta.texto, lido.pedido.acao);
  if (!resultado) return responder({ erro: 'A IA devolveu algo fora do formato. Tente de novo.' }, 502);

  return responder({ ...resultado, restantes: acesso.restantes });
});
