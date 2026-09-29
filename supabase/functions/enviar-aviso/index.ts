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
 *  SUPABASE_URL, SUPABASE_ANON_KEY e SUPABASE_SERVICE_ROLE_KEY o
 *  Supabase já entrega sozinho.
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

// ---------------------------------------------------------------
// A FUNÇÃO
// ---------------------------------------------------------------

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return responder({ erro: 'Só POST.' }, 405);

  const segredo = Deno.env.get('FCM_CONTA_SERVICO');
  if (!segredo) {
    // Sem a chave, nada a fazer — e não é erro de quem enviou a mensagem
    return responder({ erro: 'FCM_CONTA_SERVICO não configurado.' }, 503);
  }

  let mensagemId: string;
  let previa: string;
  try {
    const corpo = await req.json();
    mensagemId = String(corpo.mensagemId || '');
    previa = String(corpo.previa || '').slice(0, 240);
  } catch {
    return responder({ erro: 'Corpo inválido.' }, 400);
  }
  if (!mensagemId) return responder({ erro: 'Falta mensagemId.' }, 400);

  const url = Deno.env.get('SUPABASE_URL')!;

  // Quem chama: pela sessão que veio no cabeçalho, e não pelo corpo
  const chamador = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  });
  const { data: sessao } = await chamador.auth.getUser();
  if (!sessao?.user) return responder({ erro: 'Sem sessão.' }, 401);

  // Daqui para baixo, a chave de serviço: passa por cima da RLS, que é o
  // que permite ler os aparelhos dos OUTROS — coisa que ninguém no
  // aplicativo pode.
  const banco = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  const { data: eu } = await banco
    .from('colaboradores')
    .select('id, nome')
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
    .select('id, tipo, nome')
    .eq('id', mensagem.conversa_id)
    .maybeSingle();
  if (!conversa) return responder({ erro: 'Conversa não encontrada.' }, 404);

  const { data: participantes } = await banco
    .from('participantes')
    .select('colaborador_id, removida')
    .eq('conversa_id', conversa.id)
    .neq('colaborador_id', eu.id);

  const candidatos = (participantes ?? [])
    .filter((p) => p.removida !== true)
    .map((p) => p.colaborador_id as string);
  if (candidatos.length === 0) return responder({ entregues: 0 });

  const { data: ativos } = await banco
    .from('colaboradores')
    .select('id')
    .in('id', candidatos)
    .eq('ativo', true);
  const destinatarios = (ativos ?? []).map((c) => c.id as string);
  if (destinatarios.length === 0) return responder({ entregues: 0 });

  const { data: aparelhos } = await banco
    .from('aparelhos')
    .select('token')
    .in('colaborador_id', destinatarios);
  if (!aparelhos || aparelhos.length === 0) return responder({ entregues: 0 });

  // O mesmo título e corpo do aviso do navegador (App.tsx)
  const ehGrupo = conversa.tipo === 'grupo';
  const titulo = ehGrupo ? conversa.nome : eu.nome;
  const corpo = ehGrupo ? `${eu.nome}: ${previa}` : previa;

  const conta = JSON.parse(segredo) as ContaDeServico;
  const acesso = await obterTokenDoGoogle(conta);
  const endereco = `https://fcm.googleapis.com/v1/projects/${conta.project_id}/messages:send`;

  let entregues = 0;
  const vencidos: string[] = [];

  await Promise.all(
    aparelhos.map(async ({ token }) => {
      const resposta = await fetch(endereco, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${acesso}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: {
            token,
            notification: { title: titulo, body: corpo },
            // O Firebase só carrega texto aqui. É o que `destinoDoPush`
            // traduz, no aparelho, para abrir a conversa certa.
            data: { tipo: 'conversa', conversaId: conversa.id },
            android: {
              priority: 'HIGH',
              // Mesma conversa, um aviso só: a mensagem nova substitui a
              // anterior em vez de empilhar trinta na tela de bloqueio
              notification: { tag: conversa.id },
            },
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

  return responder({ entregues, removidos: vencidos.length });
});
