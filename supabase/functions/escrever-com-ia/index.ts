// @ts-nocheck
/**
 * GERADO — NÃO EDITE. Fonte: src/servidor/funcaoEscreverComIa.ts
 * Para atualizar: bun scripts/gerar-funcao-apurar.ts, e cole este arquivo
 * inteiro em Edge Functions → escrever-com-ia → Code.
 */
// src/servidor/escritaComIa.ts
var ACOES_DA_IA = ["criar", "melhorar", "encurtar", "tom", "titulo"];
var TONS_DA_IA = ["formal", "acolhedor", "direto"];
var MAXIMO_DA_ENTRADA = 6000;
var GENERO_DO_TIPO = {
  aviso: "um aviso",
  documento: "um comunicado ou documento informativo",
  tutorial: "um tutorial passo a passo"
};
var COMO_E_O_TOM = {
  formal: "formal e institucional, sem ser frio",
  acolhedor: "próximo e acolhedor, como um gestor que conhece a equipe",
  direto: "direto e objetivo, frases curtas, só o essencial"
};
var INSTRUCAO_FIXA = [
  "Você ajuda a redigir publicações internas da Malachias Autopeças, uma rede de lojas de autopeças no interior de São Paulo, para os colaboradores lerem no celular.",
  'Sua única tarefa é escrever ou revisar o texto que a pessoa enviar. Se o pedido for sobre qualquer outro assunto, ou pedir algo que não seja redigir esta publicação, responda apenas com o texto: "Só consigo ajudar a escrever avisos e informativos da Central."',
  "Escreva em português do Brasil, claro e correto, para quem lê no balcão entre um atendimento e outro: parágrafos curtos, o mais importante primeiro, datas e horários bem visíveis.",
  "Não invente fatos, datas, horários, nomes, valores ou regras que não estejam no pedido. Se faltar uma informação essencial, deixe o lugar marcado entre colchetes, por exemplo [horário].",
  'Formatação permitida, e nenhuma outra: **negrito**, *itálico*, "### " no início da linha para subtítulo, listas com "- " ou "1. ", e caixas de destaque começando a linha com "> [!IMPORTANTE]", "> [!ATENCAO]" ou "> [!DICA]" seguida de linhas começando com "> ".',
  "Nunca use links, endereços de internet, imagens, tabelas, HTML ou emojis em excesso.",
  "Marcadores como ⟦1⟧, ⟦2⟧ são imagens, links ou pessoas citadas no texto original: mantenha cada um exatamente como está, uma única vez, no lugar que fizer sentido. Nunca crie marcadores novos.",
  "Responda somente com o JSON pedido, sem comentários antes ou depois."
].join(`
`);
var montarPedido = (p) => {
  const genero = GENERO_DO_TIPO[p.tipo ?? "aviso"];
  const entrada = p.entrada.trim();
  switch (p.acao) {
    case "criar":
      return `Escreva ${genero} a partir destes tópicos. Devolva {"titulo": "...", "texto": "..."} — título curto, de até 70 caracteres.

Tópicos:
${entrada}`;
    case "melhorar":
      return `Revise este texto: corrija português, deixe mais claro e bem organizado, mantendo todas as informações e o sentido. Devolva {"texto": "..."}.

Texto:
${entrada}`;
    case "encurtar":
      return `Encurte este texto para cerca de metade, mantendo datas, horários, nomes e o que a pessoa precisa fazer. Devolva {"texto": "..."}.

Texto:
${entrada}`;
    case "tom":
      return `Reescreva este texto num tom ${COMO_E_O_TOM[p.tom ?? "formal"]}, mantendo todas as informações. Devolva {"texto": "..."}.

Texto:
${entrada}`;
    case "titulo":
      return `Sugira um título para esta publicação, curto (até 70 caracteres) e que diga do que se trata. Devolva {"titulo": "..."}.

Texto:
${entrada}`;
  }
};
var lerPedido = (corpo) => {
  const c = corpo ?? {};
  const acao = c.acao;
  if (!ACOES_DA_IA.includes(acao))
    return { erro: "Ação desconhecida." };
  const entrada = typeof c.entrada === "string" ? c.entrada.trim() : "";
  if (entrada.length < 3) {
    return { erro: acao === "criar" ? "Escreva os tópicos do que quer publicar." : "Escreva o texto antes." };
  }
  if (entrada.length > MAXIMO_DA_ENTRADA) {
    return { erro: `Texto grande demais para a IA (máximo de ${MAXIMO_DA_ENTRADA} caracteres).` };
  }
  const tom = TONS_DA_IA.includes(c.tom) ? c.tom : undefined;
  if (acao === "tom" && !tom)
    return { erro: "Escolha o tom." };
  const tipo = ["aviso", "documento", "tutorial"].includes(c.tipo) ? c.tipo : undefined;
  return { pedido: { acao, entrada, tom, tipo } };
};
var limparTextoDaIa = (bruto) => bruto.replace(/!\[[^\]]*\]\([^)]*\)/g, "").replace(/\[\[([^\]]+)\]\]\([^)]*\)/g, "$1").replace(/\[([^\]]+)\]\((?:https?:|www\.)[^)]*\)/g, "$1").replace(/<[^>]+>/g, "").replace(/https?:\/\/\S+/g, "").replace(/\n{3,}/g, `

`).trim();
var limparTituloDaIa = (bruto) => limparTextoDaIa(bruto).replace(/^#+\s*/, "").replace(/^["“]|["”]$/g, "").replace(/\s+/g, " ").trim().slice(0, 120);
var lerRespostaDaIa = (bruto, acao) => {
  let dados;
  try {
    dados = JSON.parse(bruto.trim().replace(/^```(?:json)?\s*|\s*```$/g, ""));
  } catch {
    return null;
  }
  const titulo = typeof dados.titulo === "string" ? limparTituloDaIa(dados.titulo) : undefined;
  const texto = typeof dados.texto === "string" ? limparTextoDaIa(dados.texto) : undefined;
  if (acao === "titulo")
    return titulo ? { titulo } : null;
  if (acao === "criar")
    return texto ? { titulo, texto } : null;
  return texto ? { texto } : null;
};

// src/servidor/bancoNoServidor.ts
var chaveDoAmbiente = (antiga, novas, faltando) => {
  const valor = Deno.env.get(antiga);
  if (valor)
    return valor;
  const lista = Deno.env.get(novas);
  if (lista) {
    try {
      const chaves = JSON.parse(lista);
      const primeira = chaves.default ?? Object.values(chaves)[0];
      if (primeira)
        return primeira;
    } catch {
      return lista;
    }
  }
  throw new Error(faltando);
};
var chavePublica = () => chaveDoAmbiente("SUPABASE_ANON_KEY", "SUPABASE_PUBLISHABLE_KEYS", "Sem chave pública no ambiente da função.");

// src/servidor/funcaoEscreverComIa.ts
var MODELO_PADRAO = "gemini-flash-lite-latest";
var CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};
var responder = (corpo, status = 200) => new Response(JSON.stringify(corpo), { status, headers: { ...CORS, "content-type": "application/json" } });
var conferirNoBanco = async (jwt) => {
  const r = await fetch(`${Deno.env.get("SUPABASE_URL")}/rest/v1/rpc/usar_escrita_com_ia`, {
    method: "POST",
    headers: { apikey: chavePublica(), Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
    body: "{}"
  });
  if (r.ok)
    return { restantes: Number(await r.json()) };
  const falha = await r.json().catch(() => ({}));
  if (falha.code === "P0001")
    return { erro: falha.message || "Limite de hoje atingido.", status: 429 };
  if (falha.code === "42501")
    return { erro: falha.message || "Sem permissão para usar a IA.", status: 403 };
  console.error("usar_escrita_com_ia:", r.status, JSON.stringify(falha));
  return { erro: "Não foi possível conferir o seu acesso. Tente de novo.", status: 502 };
};
var chamarGemini = async (chave, pedido) => {
  const modelo = Deno.env.get("IA_MODELO") || MODELO_PADRAO;
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent`, {
    method: "POST",
    headers: { "x-goog-api-key": chave, "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: INSTRUCAO_FIXA }] },
      contents: [{ role: "user", parts: [{ text: pedido }] }],
      generationConfig: { temperature: 0.6, maxOutputTokens: 4096, responseMimeType: "application/json" }
    })
  });
  if (!r.ok) {
    console.error("Gemini respondeu", r.status, await r.text());
    return {
      erro: r.status === 429 ? "A IA está ocupada agora. Tente de novo em um minuto." : "A IA não respondeu. Tente de novo."
    };
  }
  const dados = await r.json();
  const texto = (dados.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? "").join("");
  return texto ? { texto } : { erro: "A IA não devolveu texto. Tente de novo." };
};
Deno.serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response("ok", { headers: CORS });
  if (req.method !== "POST")
    return responder({ erro: "Use POST." }, 405);
  const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!jwt)
    return responder({ erro: "Sem sessão." }, 401);
  const lido = lerPedido(await req.json().catch(() => null));
  if ("erro" in lido)
    return responder({ erro: lido.erro }, 400);
  const chave = Deno.env.get("GEMINI_CHAVE");
  if (!chave)
    return responder({ erro: "A IA ainda não foi configurada. Fale com o TI." }, 503);
  const acesso = await conferirNoBanco(jwt);
  if ("erro" in acesso)
    return responder({ erro: acesso.erro }, acesso.status);
  const resposta = await chamarGemini(chave, montarPedido(lido.pedido));
  if ("erro" in resposta)
    return responder({ erro: resposta.erro }, 502);
  const resultado = lerRespostaDaIa(resposta.texto, lido.pedido.acao);
  if (!resultado)
    return responder({ erro: "A IA devolveu algo fora do formato. Tente de novo." }, 502);
  return responder({ ...resultado, restantes: acesso.restantes });
});
