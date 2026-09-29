/**
 * ENVIAR AVISO — função de servidor do CONECTA (Supabase Edge Function)
 *
 * ===================================================================
 * O QUE ELA FAZ
 * ===================================================================
 *
 * O aparelho que enviou uma mensagem chama esta função com o id dela.
 * A função acha quem participa da conversa, pega os aparelhos dessas
 * pessoas na tabela `aparelhos`, e pede ao Firebase para acordá-los.
 *
 * É o passo 3 do caminho descrito em `src/servicos/pushNativo.ts`: o
 * único que precisa de uma chave que não pode estar no aplicativo.
 *
 * ===================================================================
 * O QUE ELA CONFERE — e por quê
 * ===================================================================
 *
 *  · QUEM CHAMA É O REMETENTE. Sem isso, qualquer sessão faria qualquer
 *    mensagem de qualquer conversa tocar no bolso de todo mundo.
 *
 *  · O TÍTULO SAI DO BANCO — o nome do remetente e o da conversa. O
 *    aparelho manda só a prévia do próprio texto; ninguém consegue
 *    fazer um aviso aparecer com o nome de outra pessoa.
 *
 *  · QUEM REMOVEU A CONVERSA NÃO É AVISADO. Remover é "não volta
 *    sozinha" (`conversa-removida.sql`): a mensagem não a traz de volta
 *    à lista, então um aviso levaria a uma conversa que não está lá.
 *    Arquivar é diferente — volta na próxima mensagem, e avisa.
 *
 *  · QUEM ESTÁ INATIVO NÃO É AVISADO. Saiu da empresa; o aparelho pode
 *    ter ficado com outra pessoa.
 *
 * ===================================================================
 * COMO PUBLICAR (sem instalar nada)
 * ===================================================================
 *
 *  Supabase → Edge Functions → Deploy a new function → Via Editor
 *    nome: enviar-aviso            (o mesmo de FUNCAO_DE_AVISO)
 *    colar este arquivo inteiro
 *
 *  Supabase → Edge Functions → Secrets
 *    FCM_CONTA_SERVICO = o JSON INTEIRO da conta de serviço do Firebase
 *    (Firebase → Configurações do projeto → Contas de serviço →
 *     Gerar nova chave privada)
 *
 *  SUPABASE_URL e a chave de serviço o Supabase já entrega sozinho.
 *
 *  "Verify JWT" DESLIGADO nos detalhes da função. A resposta rápida vem
 *  da notificação, com o aplicativo fechado e sem sessão; quem prova
 *  quem é, ali, é o vale. O outro caminho confere a sessão por conta
 *  própria (`auth.getUser`). Ligado, o Supabase recusaria a resposta
 *  antes de ela chegar aqui.
 *
 *  O editor abre com um MODELO de exemplo (withSupabase, "Hello"):
 *  apague tudo e cole este arquivo no lugar.
 *
 *  A chave da conta de serviço é o que ENVIA aviso para qualquer
 *  aparelho do projeto. Ela mora só aqui, nunca no repositório nem no
 *  aplicativo — o `google-services.json` do APK é outra coisa, e não
 *  envia nada.
 */
import { createClient } from 'jsr:@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const responder = (corpo: unknown, status = 200) =>
  new Response(JSON.stringify(corpo), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });

// ---------------------------------------------------------------
// O TOKEN DE ACESSO DO GOOGLE
//
// O Firebase não aceita a chave direto: ela assina um pedido, o Google
// devolve um token que vale uma hora. Guardado enquanto a instância
// vive — pedir um novo a cada mensagem seria uma ida a mais ao Google
// por aviso.
// ---------------------------------------------------------------

interface ContaDeServico {
  project_id: string;
  client_email: string;
  private_key: string;
}

let tokenGuardado: { valor: string; venceEm: number } | null = null;

const base64url = (dados: Uint8Array | string): string => {
  const bytes = typeof dados === 'string' ? new TextEncoder().encode(dados) : dados;
  let binario = '';
  for (const b of bytes) binario += String.fromCharCode(b);
  return btoa(binario).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

const obterTokenDoGoogle = async (conta: ContaDeServico): Promise<string> => {
  const agora = Math.floor(Date.now() / 1000);
  // Um minuto de folga: token que vence no meio do envio é aviso perdido
  if (tokenGuardado && tokenGuardado.venceEm - 60 > agora) return tokenGuardado.valor;

  const cabecalho = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const pedido = base64url(
    JSON.stringify({
      iss: conta.client_email,
      scope: 'https://www.googleapis.com/auth/firebase.messaging',
      aud: 'https://oauth2.googleapis.com/token',
      iat: agora,
      exp: agora + 3600,
    })
  );

  const pem = conta.private_key
    .replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g, '');
  const der = Uint8Array.from(atob(pem), (c) => c.charCodeAt(0));
  const chave = await crypto.subtle.importKey(
    'pkcs8',
    der,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const assinatura = new Uint8Array(
    await crypto.subtle.sign(
      'RSASSA-PKCS1-v1_5',
      chave,
      new TextEncoder().encode(`${cabecalho}.${pedido}`)
    )
  );

  const resposta = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: `${cabecalho}.${pedido}.${base64url(assinatura)}`,
    }),
  });
  if (!resposta.ok) {
    throw new Error(`O Google recusou a conta de serviço: ${await resposta.text()}`);
  }

  const { access_token, expires_in } = await resposta.json();
  tokenGuardado = { valor: access_token, venceEm: agora + (expires_in ?? 3600) };
  return access_token;
};

/**
 * A CHAVE DE SERVIÇO, nos dois formatos que o Supabase usa.
 *
 * Projeto antigo entrega `SUPABASE_SERVICE_ROLE_KEY`; o sistema novo de
 * chaves entrega `SUPABASE_SECRET_KEYS`, um JSON com as `sb_secret_...`.
 * Aceitar só um faria a função morrer no dia em que o painel migrar o
 * projeto — com todo aviso sumindo, calado.
 */
const chaveDeServico = (): string => {
  const antiga = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (antiga) return antiga;

  const novas = Deno.env.get('SUPABASE_SECRET_KEYS');
  if (novas) {
    try {
      const lista = JSON.parse(novas) as Record<string, string>;
      const primeira = lista.default ?? Object.values(lista)[0];
      if (primeira) return primeira;
    } catch {
      /* não era JSON: é a própria chave */
      return novas;
    }
  }
  throw new Error('Sem chave de serviço no ambiente da função.');
};

// ---------------------------------------------------------------
// O VALE DE RESPOSTA
//
// A resposta rápida sai da notificação, com o aplicativo FECHADO: não há
// sessão, e o aparelho não guarda senha nem sessão de ninguém. O que ele
// leva é este vale, que a função assina para CADA destinatário:
//
//     quem responde · em que conversa · a que mensagem · até quando
//
// Assinado com HMAC a partir da chave de serviço, que só a função tem.
// Um vale adulterado (outra pessoa, outra conversa) não confere. E ele
// vence em 48 horas: um aviso esquecido na barra não vira, semanas
// depois, um jeito de escrever em nome de alguém.
//
// Ele NÃO é de uso único: responder duas vezes à mesma notificação é
// coisa normal ("ok" e depois "chego às 3"). O que o limita é a
// conversa e o prazo.
// ---------------------------------------------------------------

const VALIDADE_DO_VALE_MS = 48 * 60 * 60 * 1000;

interface Vale {
  /** quem responde */ c: string;
  /** em que conversa */ v: string;
  /** a mensagem avisada, que passa a contar como lida */ m: string;
  /** vence em (ms) */ e: number;
}

const chaveDoVale = async () =>
  crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(`${chaveDeServico()}:vale-de-resposta`),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );

const assinarVale = async (vale: Vale): Promise<string> => {
  const carga = base64url(JSON.stringify(vale));
  const assinatura = new Uint8Array(
    await crypto.subtle.sign('HMAC', await chaveDoVale(), new TextEncoder().encode(carga))
  );
  return `${carga}.${base64url(assinatura)}`;
};

const lerVale = async (texto: string): Promise<Vale | null> => {
  const [carga, assinatura] = texto.split('.');
  if (!carga || !assinatura) return null;

  const deBase64url = (s: string) =>
    Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));

  try {
    const confere = await crypto.subtle.verify(
      'HMAC',
      await chaveDoVale(),
      deBase64url(assinatura),
      new TextEncoder().encode(carga)
    );
    if (!confere) return null;

    const vale = JSON.parse(new TextDecoder().decode(deBase64url(carga))) as Vale;
    if (!vale.c || !vale.v || typeof vale.e !== 'number' || vale.e < Date.now()) return null;
    return vale;
  } catch {
    return null;
  }
};

/**
 * ONDE A RESPOSTA RÁPIDA É OFERECIDA.
 *
 * Só onde QUALQUER participante pode escrever: conversa individual e
 * grupo aberto. No grupo de avisos da rede e nos grupos só de gestores,
 * quem pode publicar é decidido pelo nível da pessoa — regra que mora em
 * `podePublicarNaConversa` (bancoDados.ts) e não no banco. Reescrevê-la
 * aqui seria a segunda cópia; então lá o aviso chega sem "Responder", e
 * quem pode publicar abre o aplicativo.
 *
 * É um SUBCONJUNTO da regra do aplicativo: nunca deixa responder onde o
 * aplicativo não deixaria.
 */
const aceitaRespostaRapida = (conversa: {
  id: string;
  tipo: string;
  apenas_gestores_publicam: boolean | null;
}): boolean =>
  conversa.tipo === 'individual' ||
  (conversa.id !== 'grupo-avisos-da-rede' && conversa.apenas_gestores_publicam !== true);

// ---------------------------------------------------------------
// AVISAR UMA CONVERSA
//
// Um caminho só, para os dois pedidos: a mensagem que o aplicativo
// enviou e a resposta que veio da notificação. A resposta é mensagem
// nova, e os outros participantes precisam saber dela igual.
// ---------------------------------------------------------------

type Banco = ReturnType<typeof createClient>;

interface Conversa {
  id: string;
  tipo: string;
  nome: string;
  apenas_gestores_publicam: boolean | null;
}

const avisarConversa = async (
  banco: Banco,
  remetente: { id: string; nome: string; loja: string },
  conversa: Conversa,
  mensagemId: string,
  previa: string
): Promise<{ entregues: number; removidos?: number; erro?: string }> => {
  const segredo = Deno.env.get('FCM_CONTA_SERVICO');
  // Sem a chave, nada a fazer — e não é erro de quem enviou a mensagem
  if (!segredo) return { entregues: 0, erro: 'FCM_CONTA_SERVICO não configurado.' };

  const eu = remetente;

  const { data: participantes } = await banco
    .from('participantes')
    .select('colaborador_id, removida')
    .eq('conversa_id', conversa.id)
    .neq('colaborador_id', eu.id);

  const candidatos = (participantes ?? [])
    .filter((p) => p.removida !== true)
    .map((p) => p.colaborador_id as string);
  if (candidatos.length === 0) return { entregues: 0 };

  const { data: ativos } = await banco
    .from('colaboradores')
    .select('id')
    .in('id', candidatos)
    .eq('ativo', true);
  const destinatarios = (ativos ?? []).map((c) => c.id as string);
  if (destinatarios.length === 0) return { entregues: 0 };

  // O dono de cada aparelho vem junto: o vale de resposta é de UMA pessoa
  const { data: aparelhos } = await banco
    .from('aparelhos')
    .select('token, colaborador_id')
    .in('colaborador_id', destinatarios);
  if (!aparelhos || aparelhos.length === 0) return { entregues: 0 };

  /**
   * QUEM FALOU, O QUE DISSE, E EM QUE GRUPO — separados.
   *
   * O aparelho monta o aviso no estilo do WhatsApp (ServicoDeAvisos):
   * "Malachias" no cabeçalho (é o nome do aplicativo), a conversa como
   * título e cada mensagem empilhada como "Nome: texto". Para empilhar,
   * ele precisa das partes, e não de um título já montado aqui.
   */
  const ehGrupo = conversa.tipo === 'grupo';

  const conta = JSON.parse(segredo) as ContaDeServico;
  const acesso = await obterTokenDoGoogle(conta);
  const endereco = `https://fcm.googleapis.com/v1/projects/${conta.project_id}/messages:send`;

  const respondivel = aceitaRespostaRapida(conversa);
  const respostaUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/enviar-aviso`;
  const venceEm = Date.now() + VALIDADE_DO_VALE_MS;

  let entregues = 0;
  const vencidos: string[] = [];

  await Promise.all(
    aparelhos.map(async ({ token, colaborador_id }) => {
      /**
       * SÓ DADOS, SEM `notification`.
       *
       * Com `notification`, o próprio Android desenha o aviso quando o
       * aplicativo está fechado — e o desenho dele não tem campo de
       * resposta. Só com dados o aviso passa pelo nosso código
       * (`ServicoDeAvisos.java`), que monta o "Responder".
       *
       * O Firebase só carrega TEXTO aqui: todo valor vai como string.
       * `tipo` e `conversaId` são o que `destinoDoPush` lê no toque.
       */
      const dados: Record<string, string> = {
        tipo: 'conversa',
        conversaId: conversa.id,
        mensagemId,
        remetente: eu.nome,
        texto: previa,
        conversa: conversa.nome,
        ehGrupo: ehGrupo ? 'true' : 'false',
      };
      if (respondivel) {
        dados.vale = await assinarVale({
          c: colaborador_id as string,
          v: conversa.id,
          m: mensagemId,
          e: venceEm,
        });
        dados.respostaUrl = respostaUrl;
      }

      const resposta = await fetch(endereco, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${acesso}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: {
            token,
            data: dados,
            // ALTA: sem ela, o Android segura a mensagem de dados até o
            // aparelho acordar sozinho — minutos, no modo de economia
            android: { priority: 'HIGH' },
          },
        }),
      });

      if (resposta.ok) {
        entregues++;
        return;
      }

      /**
       * TOKEN VENCIDO SAI DA TABELA.
       *
       * Aplicativo desinstalado, aparelho restaurado: o Firebase responde
       * UNREGISTERED. Deixar a linha é pagar uma ida ao Google por
       * mensagem, para sempre, para um aparelho que não existe mais.
       */
      const erro = await resposta.json().catch(() => ({}));
      const codigos: string[] = (erro?.error?.details ?? []).map(
        (d: { errorCode?: string }) => d.errorCode
      );
      if (resposta.status === 404 || codigos.includes('UNREGISTERED')) {
        vencidos.push(token);
      } else {
        console.error('Firebase recusou o aviso:', resposta.status, JSON.stringify(erro));
      }
    })
  );

  if (vencidos.length > 0) {
    await banco.from('aparelhos').delete().in('token', vencidos);
  }

  return { entregues, removidos: vencidos.length };
};

// ---------------------------------------------------------------
// A FUNÇÃO
// ---------------------------------------------------------------

const COLUNAS_DA_CONVERSA = 'id, tipo, nome, apenas_gestores_publicam';

/** O mesmo formato de id do aplicativo (`enviarMensagem`, bancoDados.ts). */
const novoIdDeMensagem = () =>
  `msg-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

/** Resposta rápida é texto curto; mais que isto é colagem acidental. */
const LIMITE_DA_RESPOSTA = 2000;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return responder({ erro: 'Só POST.' }, 405);

  let pedido: Record<string, unknown>;
  try {
    pedido = await req.json();
  } catch {
    return responder({ erro: 'Corpo inválido.' }, 400);
  }

  const url = Deno.env.get('SUPABASE_URL')!;

  // A chave de serviço: passa por cima da RLS, que é o que permite ler os
  // aparelhos dos OUTROS — coisa que ninguém no aplicativo pode.
  const banco = createClient(url, chaveDeServico());

  // =============================================================
  // CAMINHO 1 — A RESPOSTA RÁPIDA, vinda da notificação
  //
  // Sem sessão: quem prova quem é, é o vale. Por isso a função roda com
  // "Verify JWT" DESLIGADO — o aparelho fechado não tem JWT para mandar,
  // e cada caminho confere a própria identidade.
  // =============================================================
  if (typeof pedido.vale === 'string') {
    const vale = await lerVale(pedido.vale);
    if (!vale) return responder({ erro: 'Vale inválido ou vencido.' }, 403);

    const texto = String(pedido.texto ?? '').trim().slice(0, LIMITE_DA_RESPOSTA);
    if (!texto) return responder({ erro: 'Resposta vazia.' }, 400);

    const { data: eu } = await banco
      .from('colaboradores')
      .select('id, nome, loja, ativo')
      .eq('id', vale.c)
      .maybeSingle();
    if (!eu || eu.ativo === false) return responder({ erro: 'Colaborador inativo.' }, 403);

    const { data: conversa } = await banco
      .from('conversas')
      .select(COLUNAS_DA_CONVERSA)
      .eq('id', vale.v)
      .maybeSingle();
    if (!conversa) return responder({ erro: 'Conversa não encontrada.' }, 404);

    // A conversa pode ter mudado desde o aviso: virou só de gestores, ou
    // a pessoa saiu dela. O vale diz quem é; isto diz se ainda pode.
    if (!aceitaRespostaRapida(conversa)) {
      return responder({ erro: 'Esta conversa não aceita resposta pela notificação.' }, 403);
    }
    const { data: participa } = await banco
      .from('participantes')
      .select('colaborador_id')
      .eq('conversa_id', conversa.id)
      .eq('colaborador_id', eu.id)
      .maybeSingle();
    if (!participa) return responder({ erro: 'Não participa mais da conversa.' }, 403);

    const id = novoIdDeMensagem();
    const { error } = await banco.from('mensagens').insert({
      id,
      conversa_id: conversa.id,
      remetente_id: eu.id,
      tipo: 'texto',
      texto,
      criado_em: new Date().toISOString(),
    });
    if (error) {
      console.error('A resposta não foi gravada:', error.message);
      return responder({ erro: 'Não foi possível gravar a resposta.' }, 500);
    }

    /**
     * QUEM RESPONDEU, LEU. A própria resposta e a mensagem avisada
     * contam como lidas — senão ela abriria o aplicativo e veria como
     * "não lida" a conversa que acabou de responder.
     */
    await banco
      .from('leituras_mensagem')
      .upsert(
        [id, vale.m].filter(Boolean).map((mensagem_id) => ({ mensagem_id, colaborador_id: eu.id })),
        { ignoreDuplicates: true }
      );

    const aviso = await avisarConversa(banco, eu, conversa, id, texto);
    return responder({ gravada: id, ...aviso });
  }

  // =============================================================
  // CAMINHO 2 — O APLICATIVO ENVIOU UMA MENSAGEM
  // =============================================================
  const mensagemId = String(pedido.mensagemId || '');
  const previa = String(pedido.previa || '').slice(0, 240);
  if (!mensagemId) return responder({ erro: 'Falta mensagemId.' }, 400);

  // Quem chama: pela sessão que veio no cabeçalho, e não pelo corpo
  const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  const { data: sessao } = await banco.auth.getUser(jwt);
  if (!sessao?.user) return responder({ erro: 'Sem sessão.' }, 401);

  const { data: eu } = await banco
    .from('colaboradores')
    .select('id, nome, loja')
    .eq('auth_user_id', sessao.user.id)
    .maybeSingle();
  if (!eu) return responder({ erro: 'Sessão sem colaborador.' }, 403);

  const { data: mensagem } = await banco
    .from('mensagens')
    .select('id, conversa_id, remetente_id')
    .eq('id', mensagemId)
    .maybeSingle();
  if (!mensagem) return responder({ erro: 'Mensagem não encontrada.' }, 404);
  if (mensagem.remetente_id !== eu.id) {
    return responder({ erro: 'Só quem enviou pede o aviso.' }, 403);
  }

  const { data: conversa } = await banco
    .from('conversas')
    .select(COLUNAS_DA_CONVERSA)
    .eq('id', mensagem.conversa_id)
    .maybeSingle();
  if (!conversa) return responder({ erro: 'Conversa não encontrada.' }, 404);

  const aviso = await avisarConversa(banco, eu, conversa, mensagemId, previa);
  return responder(aviso, aviso.erro ? 503 : 200);
});
