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
 * Os caminhos: a mensagem enviada pelo aplicativo, a resposta vinda da
 * notificação (o vale), o PONTO — ajuste de jornada, ausência e folga
 * quando entram na fila e quando são decididos (`avisosDePonto.ts`) —, a
 * PUBLICAÇÃO DIRIGIDA, que avisa só quem ela alcança, o DOCUMENTO DO RH
 * (holerite publicado, advertência registrada) e a ENTREGA AGENDADA dos
 * lembretes diários (`lembrar-pendencias`, com o segredo dos agendamentos).
 * O ponto lê o pedido com a sessão de quem chama, então também usa a
 * chave pública (`SUPABASE_ANON_KEY`), que o Supabase já entrega.
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

// ---------------------------------------------------------------
// A FOTO DE QUEM MANDOU, NO AVISO (Elias, 07/10/2026)
//
// O aviso do Firebase leva no máximo 4 KB, e a foto da ficha tem até
// 60 KB: ela não viaja junto. Vai um ENDEREÇO, e o aparelho a baixa ao
// desenhar o aviso (ServicoDeAvisos.java). Sem sessão — o aplicativo
// pode estar fechado —, o endereço é assinado como o vale: de quem é a
// foto e até quando vale. Vence em 48 horas, e só abre a foto, que todo
// colaborador já vê no CONECTA.
// ---------------------------------------------------------------

const chaveDaFoto = async () =>
  crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(`${chaveDeServico()}:foto-do-aviso`),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );

const assinaturaDaFoto = async (colaboradorId: string, ate: number): Promise<string> =>
  base64url(
    new Uint8Array(
      await crypto.subtle.sign('HMAC', await chaveDaFoto(), new TextEncoder().encode(`${colaboradorId}:${ate}`))
    )
  );

/**
 * O endereço da foto para o aviso, ou nada se a pessoa não tem foto.
 *
 * A FOTO NUNCA SEGURA O AVISO: qualquer falha aqui e a mensagem sai com
 * a logo, como antes.
 */
const enderecoDaFoto = async (banco: Banco, colaboradorId: string): Promise<Record<string, string>> => {
  try {
    // Só pergunta SE tem: a foto em si (até 60 KB) não precisa sair do banco aqui
    const { data } = await banco
      .from('colaboradores')
      .select('id')
      .eq('id', colaboradorId)
      .not('foto', 'is', null)
      .neq('foto', '')
      .maybeSingle();
    if (!data) return {};
    const ate = Date.now() + VALIDADE_DO_VALE_MS;
    const ass = await assinaturaDaFoto(colaboradorId, ate);
    const base = `${Deno.env.get('SUPABASE_URL')}/functions/v1/enviar-aviso`;
    return { foto: `${base}?foto=${encodeURIComponent(colaboradorId)}&ate=${ate}&ass=${ass}` };
  } catch (erro) {
    console.warn('Foto do aviso:', erro);
    return {};
  }
};

/** GET ?foto=…: devolve a imagem, se a assinatura confere e não venceu. */
const entregarFoto = async (banco: Banco, parametros: URLSearchParams): Promise<Response> => {
  const id = parametros.get('foto') || '';
  const ate = Number(parametros.get('ate'));
  const ass = parametros.get('ass') || '';
  if (!id || !Number.isFinite(ate) || ate < Date.now() || ass !== (await assinaturaDaFoto(id, ate))) {
    return new Response('Endereço inválido ou vencido.', { status: 403 });
  }

  const { data } = await banco.from('colaboradores').select('foto').eq('id', id).maybeSingle();
  const foto = String(data?.foto || '');
  // Foto por endereço externo (a opção "colar um link"): o aparelho vai até lá
  if (foto.startsWith('https://')) return Response.redirect(foto, 302);

  const partes = foto.match(/^data:(image\/[a-z+.-]+);base64,(.+)/);
  if (!partes) return new Response('Sem foto.', { status: 404 });
  const bytes = Uint8Array.from(atob(partes[2]), (c) => c.charCodeAt(0));
  return new Response(bytes, {
    headers: { 'Content-Type': partes[1], 'Cache-Control': 'private, max-age=3600' },
  });
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

type Banco = ReturnType<typeof createClient>;

// ---------------------------------------------------------------
// ENTREGAR AOS APARELHOS
//
// A parte que não muda entre um aviso e outro: achar os aparelhos das
// pessoas, falar com o Firebase, e tirar da tabela o aparelho que não
// existe mais. A conversa e o ponto chegam aqui com os dados prontos.
// ---------------------------------------------------------------

const entregarAosAparelhos = async (
  banco: Banco,
  pessoas: string[],
  dados: Record<string, string>,
  /** O que muda de uma pessoa para outra — o vale de resposta. */
  dadosDaPessoa?: (colaboradorId: string) => Promise<Record<string, string>>
): Promise<{ entregues: number; removidos?: number; erro?: string }> => {
  const segredo = Deno.env.get('FCM_CONTA_SERVICO');
  // Sem a chave, nada a fazer — e não é erro de quem pediu o aviso
  if (!segredo) return { entregues: 0, erro: 'FCM_CONTA_SERVICO não configurado.' };
  if (pessoas.length === 0) return { entregues: 0 };

  // QUEM ESTÁ INATIVO NÃO É AVISADO: saiu da empresa, e o aparelho pode
  // ter ficado com outra pessoa
  const { data: ativos } = await banco
    .from('colaboradores')
    .select('id')
    .in('id', pessoas)
    .eq('ativo', true);
  const destinatarios = (ativos ?? []).map((c) => c.id as string);
  if (destinatarios.length === 0) return { entregues: 0 };

  // O dono de cada aparelho vem junto: o vale de resposta é de UMA pessoa
  const { data: aparelhos } = await banco
    .from('aparelhos')
    .select('token, colaborador_id')
    .in('colaborador_id', destinatarios);
  if (!aparelhos || aparelhos.length === 0) return { entregues: 0 };

  const conta = JSON.parse(segredo) as ContaDeServico;
  const acesso = await obterTokenDoGoogle(conta);
  const endereco = `https://fcm.googleapis.com/v1/projects/${conta.project_id}/messages:send`;

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
       */
      const deste = dadosDaPessoa ? await dadosDaPessoa(colaborador_id as string) : {};

      const resposta = await fetch(endereco, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${acesso}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: {
            token,
            data: { ...dados, ...deste },
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
       * aviso, para sempre, para um aparelho que não existe mais.
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
// AVISAR UMA CONVERSA
//
// Um caminho só, para os dois pedidos: a mensagem que o aplicativo
// enviou e a resposta que veio da notificação. A resposta é mensagem
// nova, e os outros participantes precisam saber dela igual.
// ---------------------------------------------------------------

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
  const eu = remetente;

  const { data: participantes } = await banco
    .from('participantes')
    // A linha inteira: `saiu_em` só existe depois de grupos-de-todos.sql
    .select('*')
    .eq('conversa_id', conversa.id)
    .neq('colaborador_id', eu.id);

  // Quem tirou a conversa da lista, ou SAIU do grupo, não é avisado
  const candidatos = (participantes ?? [])
    .filter((p) => p.removida !== true && !p.saiu_em)
    .map((p) => p.colaborador_id as string);

  /**
   * QUEM FALOU, O QUE DISSE, E EM QUE GRUPO — separados.
   *
   * O aparelho monta o aviso no estilo do WhatsApp (ServicoDeAvisos):
   * "Malachias" no cabeçalho (é o nome do aplicativo), a conversa como
   * título e cada mensagem empilhada como "Nome: texto". Para empilhar,
   * ele precisa das partes, e não de um título já montado aqui.
   */
  const ehGrupo = conversa.tipo === 'grupo';

  const respondivel = aceitaRespostaRapida(conversa);
  const respostaUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/enviar-aviso`;
  const venceEm = Date.now() + VALIDADE_DO_VALE_MS;

  // `tipo` e `conversaId` são o que `destinoDoPush` lê no toque
  return entregarAosAparelhos(
    banco,
    candidatos,
    {
      tipo: 'conversa',
      conversaId: conversa.id,
      mensagemId,
      remetente: eu.nome,
      texto: previa,
      conversa: conversa.nome,
      ehGrupo: ehGrupo ? 'true' : 'false',
      // A foto de quem mandou: trocou a foto, o próximo aviso já leva a nova
      ...(await enderecoDaFoto(banco, eu.id)),
    },
    respondivel
      ? async (colaboradorId) => ({
          vale: await assinarVale({ c: colaboradorId, v: conversa.id, m: mensagemId, e: venceEm }),
          respostaUrl,
        })
      : undefined
  );
};

// ---------------------------------------------------------------
// OS AVISOS DO PONTO
//
// Ajuste de jornada, ausência e folga: quando entram na fila (avisa
// quem decide) e quando são decididos (avisa quem pediu). Antes eles só
// apareciam no sino, que saiu.
//
// O APARELHO DESENHA COMO CONVERSA. `ServicoDeAvisos.java` só sabe
// desenhar "Nome: texto" empilhado — e é exatamente o que serve: as
// pendências de uma seção se empilham num aviso só, com o título da
// seção. Um formato novo exigiria um APK novo para as 89 pessoas.
// `conversaId` leva a SEÇÃO: é o que empilha, e é o que o toque abre
// (`destinoDoPush`).
// ---------------------------------------------------------------

const TABELAS_DE_PONTO = ['ajustes_jornada', 'justificativas_ausencia'];
const SECOES_DO_PEDIDO = ['aprovar_jornadas', 'escala_folgas'];
/** Uma cadeia de verdade tem poucos degraus; mais que isto é abuso. */
const MAXIMO_DE_DESTINATARIOS = 30;
/**
 * A rede inteira tem ~89 pessoas; a publicação dirigida é uma parte
 * dela. O teto só impede que o caminho vire alto-falante de outra coisa.
 */
const MAXIMO_DA_PUBLICACAO = 150;

/**
 * Os lembretes de um dia: até três por pessoa (holerite, advertência,
 * publicação), para a rede de ~90 pessoas, com folga.
 */
const MAXIMO_DA_ENTREGA_AGENDADA = 500;
const TIPOS_DA_ENTREGA_AGENDADA = ['secao', 'publicacao'];

const MESES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];
/** "2026-09" -> "Setembro de 2026" */
const mesPorExtenso = (competencia: string): string => {
  const [ano, mes] = competencia.split('-');
  return `${MESES[Number(mes) - 1] || mes} de ${ano}`;
};

/**
 * A CHAVE PÚBLICA, nos dois formatos do Supabase — a mesma história da
 * chave de serviço. É com ela, mais a sessão de quem chama, que a função
 * lê o pedido COMO aquela pessoa, sob a RLS.
 */
const chavePublica = (): string => {
  const antiga = Deno.env.get('SUPABASE_ANON_KEY');
  if (antiga) return antiga;

  const novas = Deno.env.get('SUPABASE_PUBLISHABLE_KEYS');
  if (novas) {
    try {
      const lista = JSON.parse(novas) as Record<string, string>;
      const primeira = lista.default ?? Object.values(lista)[0];
      if (primeira) return primeira;
    } catch {
      return novas;
    }
  }
  throw new Error('Sem chave pública no ambiente da função.');
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

  // A foto de quem mandou, baixada pelo aparelho ao desenhar o aviso
  const parametros = new URL(req.url).searchParams;
  if (req.method === 'GET' && parametros.has('foto')) {
    return entregarFoto(createClient(Deno.env.get('SUPABASE_URL')!, chaveDeServico()), parametros);
  }

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
  // CAMINHO 0 — A ENTREGA AGENDADA (os lembretes das 9h)
  //
  // Quem chama é a função `lembrar-pendencias`, todo dia: ela decide QUEM
  // lembrar de QUÊ (com as regras do aplicativo embutidas) e entrega aqui,
  // onde mora o Firebase. Sem sessão — prova quem é pelo segredo dos
  // agendamentos, o mesmo da apuração da madrugada.
  //
  // Só leva a SEÇÃO ou a PUBLICAÇÃO como destino: um lembrete não abre
  // conversa nem carrega vale de resposta.
  // =============================================================
  if (Array.isArray(pedido.entregaAgendada)) {
    const segredo = Deno.env.get('APURAR_SEGREDO');
    if (!segredo || req.headers.get('x-apurar-segredo') !== segredo) {
      return responder({ erro: 'Sem autorização.' }, 401);
    }

    const itens = (pedido.entregaAgendada as unknown[]).slice(0, MAXIMO_DA_ENTREGA_AGENDADA);
    let entregues = 0;
    let recusados = 0;
    for (const item of itens) {
      const i = (item ?? {}) as Record<string, unknown>;
      const colaboradorId = String(i.colaboradorId || '');
      const dados = (i.dados ?? {}) as Record<string, unknown>;
      if (!colaboradorId || !TIPOS_DA_ENTREGA_AGENDADA.includes(String(dados.tipo))) {
        recusados++;
        continue;
      }
      // O Firebase só carrega texto, e o aviso não precisa de mais que isto
      const limpos = Object.fromEntries(
        Object.entries(dados).map(([chave, valor]) => [chave, String(valor).slice(0, 240)])
      );
      const r = await entregarAosAparelhos(banco, [colaboradorId], limpos);
      if (r.erro) return responder(r, 503);
      entregues += r.entregues;
    }
    return responder({ pedidos: itens.length, entregues, recusados });
  }

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
      .select('*')
      .eq('conversa_id', conversa.id)
      .eq('colaborador_id', eu.id)
      .maybeSingle();
    // Quem saiu do grupo não responde mais pela notificação antiga
    if (!participa || participa.saiu_em) return responder({ erro: 'Não participa mais da conversa.' }, 403);

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

  // Daqui para baixo quem chama é o APLICATIVO ABERTO: pela sessão que
  // veio no cabeçalho, e não pelo corpo
  const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  const { data: sessao } = await banco.auth.getUser(jwt);
  if (!sessao?.user) return responder({ erro: 'Sem sessão.' }, 401);

  const { data: eu } = await banco
    .from('colaboradores')
    .select('id, nome, loja')
    .eq('auth_user_id', sessao.user.id)
    .maybeSingle();
  if (!eu) return responder({ erro: 'Sessão sem colaborador.' }, 403);

  // =============================================================
  // CAMINHO 3 — UM PEDIDO DO PONTO ENTROU NA FILA, OU FOI DECIDIDO
  //
  // O QUE A FUNÇÃO CONFERE, e o que ela não precisa conferir:
  //
  //  · O PEDIDO É LIDO COM A SESSÃO DE QUEM CHAMA. Se a RLS não deixa
  //    ler, quem chama não é o dono nem está na alçada dele — e para
  //    aí. A regra de quem enxerga o quê é a do banco (`posso_decidir_
  //    jornada`), sem uma cópia aqui.
  //
  //  · NA DECISÃO, quem chama tem de ser quem decidiu, e quem recebe é
  //    o dono — tirado do banco, nunca do corpo.
  //
  //  · NO PEDIDO, quem recebe vem do aparelho, calculado pela regra do
  //    organograma (que não mora no banco). A função não refaz a conta,
  //    e não precisa: o aviso só fala de um pedido que QUEM CHAMA pode
  //    ver, com o nome do dono tirado do banco. Forjar a lista só
  //    serviria para contar a alguém o que ele poderia mandar por
  //    mensagem. O teto de destinatários impede usar isto de alto-falante.
  // =============================================================
  if (pedido.ponto && typeof pedido.ponto === 'object') {
    const p = pedido.ponto as Record<string, unknown>;
    const tabela = String(p.tabela || '');
    const id = String(p.id || '');
    const evento = String(p.evento || '');
    const texto = String(p.texto || '').trim().slice(0, 240);
    if (!TABELAS_DE_PONTO.includes(tabela) || !id || !texto) {
      return responder({ erro: 'Pedido de aviso do ponto incompleto.' }, 400);
    }

    const comoQuemChama = createClient(url, chavePublica(), {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
      auth: { persistSession: false },
    });
    const { data: linha } = await comoQuemChama
      .from(tabela)
      .select('id, colaborador_id, estado, aprovador_id')
      .eq('id', id)
      .maybeSingle();
    if (!linha) return responder({ erro: 'Pedido fora do seu alcance.' }, 404);

    let pessoas: string[];
    let remetente: string;
    let titulo: string;
    let secao: string;

    if (evento === 'pedido') {
      if (linha.estado !== 'pendente') return responder({ erro: 'O pedido já foi decidido.' }, 409);
      secao = String(p.secao || '');
      if (!SECOES_DO_PEDIDO.includes(secao)) return responder({ erro: 'Seção inválida.' }, 400);

      const lista = Array.isArray(p.destinatarios) ? p.destinatarios : [];
      pessoas = [...new Set(lista.map(String))]
        .filter((c) => c && c !== eu.id)
        .slice(0, MAXIMO_DE_DESTINATARIOS);

      const { data: dono } = await banco
        .from('colaboradores')
        .select('nome')
        .eq('id', linha.colaborador_id)
        .maybeSingle();
      remetente = (dono?.nome as string) || 'Colaborador';
      titulo = 'Aguardando sua decisão';
    } else if (evento === 'decisao') {
      if (linha.estado === 'pendente') return responder({ erro: 'O pedido ainda não foi decidido.' }, 409);
      if (linha.aprovador_id !== eu.id) {
        return responder({ erro: 'Só quem decidiu avisa da decisão.' }, 403);
      }
      pessoas = [linha.colaborador_id as string].filter((c) => c !== eu.id);
      remetente = eu.nome;
      titulo = 'Seu ponto';
      secao = 'meu_ponto';
    } else {
      return responder({ erro: 'Evento desconhecido.' }, 400);
    }

    const aviso = await entregarAosAparelhos(banco, pessoas, {
      tipo: 'secao',
      conversaId: secao,
      mensagemId: `ponto-${evento}-${id}`,
      remetente,
      texto,
      conversa: titulo,
      ehGrupo: 'true',
    });
    return responder(aviso, aviso.erro ? 503 : 200);
  }

  // =============================================================
  // CAMINHO 7 — O COMPROVANTE DE UMA BATIDA, para quem bateu
  //
  //  · A BATIDA É LIDA COM A SESSÃO de quem chama, e tem de ser DELA:
  //    ninguém pede o comprovante da batida de outro.
  //  · SÓ A BATIDA DO SERVIDOR tem comprovante: sem NSR não há o que
  //    comprovar (a lançada pelo RH é ajuste, não marcação).
  //  · O texto vem do aparelho (`textoDoAvisoDoComprovante`), montado dos
  //    mesmos dados do PDF. Vai só para a própria pessoa: forjá-lo só
  //    enganaria a ela mesma.
  //  · `tipo: 'comprovante'` e o id da batida em `conversaId`: é o que o
  //    toque abre (`destinoDoPush`), e o que faz o aparelho desenhar o
  //    aviso calado, mesmo com o CONECTA na tela (ServicoDeAvisos).
  // =============================================================
  if (pedido.comprovante && typeof pedido.comprovante === 'object') {
    const p = pedido.comprovante as Record<string, unknown>;
    const id = String(p.id || '');
    const texto = String(p.texto || '').trim().slice(0, 240);
    if (!id || !texto) return responder({ erro: 'Pedido de comprovante incompleto.' }, 400);

    const comoQuemChama = createClient(url, chavePublica(), {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
      auth: { persistSession: false },
    });
    const { data: batida } = await comoQuemChama
      .from('registros_ponto')
      .select('id, colaborador_id, nsr')
      .eq('id', id)
      .maybeSingle();
    if (!batida || batida.colaborador_id !== eu.id) {
      return responder({ erro: 'Batida fora do seu alcance.' }, 404);
    }
    if (batida.nsr == null) return responder({ erro: 'Batida sem comprovante.' }, 409);

    const aviso = await entregarAosAparelhos(banco, [eu.id], {
      tipo: 'comprovante',
      conversaId: id,
      mensagemId: `comprovante-${id}`,
      remetente: 'Ponto',
      texto,
      conversa: 'Comprovante de batida',
      ehGrupo: 'true',
    });
    return responder(aviso, aviso.erro ? 503 : 200);
  }

  // =============================================================
  // CAMINHO 5 — UM DOCUMENTO DO RH: holerite publicado, advertência
  // registrada
  //
  //  · QUEM CHAMA CUIDA DE PESSOAS — perguntado ao banco com a sessão
  //    dele (`cuido_de_pessoas()`), a mesma regra que deixa publicar.
  //  · OS DOCUMENTOS SÃO LIDOS COM A SESSÃO dele, e quem recebe é o dono
  //    de cada um, tirado da linha — nunca do corpo.
  //  · O TEXTO NÃO DIZ O QUE É: o aviso aparece na tela bloqueada, e
  //    "advertência" ali seria contar a quem estiver do lado.
  // =============================================================
  if (pedido.documentoRh && typeof pedido.documentoRh === 'object') {
    const p = pedido.documentoRh as Record<string, unknown>;
    const tipo = String(p.tipo || '');
    const ids = Array.isArray(p.ids) ? [...new Set(p.ids.map(String))].slice(0, MAXIMO_DA_PUBLICACAO) : [];
    if (!['holerite', 'advertencia'].includes(tipo) || ids.length === 0) {
      return responder({ erro: 'Pedido de aviso do RH incompleto.' }, 400);
    }

    const comoQuemChama = createClient(url, chavePublica(), {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
      auth: { persistSession: false },
    });
    const { data: cuida } = await comoQuemChama.rpc('cuido_de_pessoas');
    if (cuida !== true) return responder({ erro: 'Só quem cuida de pessoas avisa de documento do RH.' }, 403);

    const ehHolerite = tipo === 'holerite';
    const { data: documentos } = await comoQuemChama
      .from(ehHolerite ? 'holerites' : 'advertencias')
      .select(ehHolerite ? 'id, colaborador_id, competencia' : 'id, colaborador_id')
      .in('id', ids);

    let entregues = 0;
    for (const d of documentos ?? []) {
      const r = await entregarAosAparelhos(banco, [d.colaborador_id as string], {
        tipo: 'secao',
        conversaId: ehHolerite ? 'meus_holerites' : 'minhas_advertencias',
        mensagemId: `${tipo}-${d.id}`,
        remetente: 'RH',
        texto: ehHolerite
          ? `Seu holerite de ${mesPorExtenso(String(d.competencia))} está disponível. Toque para ver e assinar.`
          : 'Há um documento do RH aguardando a sua ciência. Toque para abrir.',
        conversa: ehHolerite ? 'Holerite disponível' : 'Documento do RH',
        ehGrupo: 'true',
      });
      if (r.erro) return responder(r, 503);
      entregues += r.entregues;
    }
    return responder({ documentos: (documentos ?? []).length, entregues });
  }

  // =============================================================
  // CAMINHO 6 — "FULANO ADICIONOU VOCÊ AO GRUPO"
  //
  // Quem foi adicionado (ou entrou num grupo novo) não tinha aviso nenhum:
  // o grupo só aparecia quando a pessoa abria o aplicativo.
  //
  //  · QUEM PEDE ADMINISTRA O GRUPO — perguntado ao banco com a sessão
  //    dele (`sou_admin_do_grupo`), a mesma regra que deixa adicionar.
  //  · SÓ RECEBE QUEM ESTÁ NO GRUPO AGORA — a linha de participante sem
  //    saída, tirada do banco; um id qualquer no corpo não vira aviso.
  // =============================================================
  if (pedido.entradaNoGrupo && typeof pedido.entradaNoGrupo === 'object') {
    const p = pedido.entradaNoGrupo as Record<string, unknown>;
    const conversaId = String(p.conversaId || '');
    const ids = Array.isArray(p.ids) ? [...new Set(p.ids.map(String))].slice(0, MAXIMO_DA_PUBLICACAO) : [];
    if (!conversaId || ids.length === 0) return responder({ erro: 'Pedido de aviso de entrada incompleto.' }, 400);

    const comoQuemChama = createClient(url, chavePublica(), {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
      auth: { persistSession: false },
    });
    const { data: administra } = await comoQuemChama.rpc('sou_admin_do_grupo', { alvo: conversaId });
    if (administra !== true) return responder({ erro: 'Só o administrador do grupo avisa quem entrou.' }, 403);

    const { data: conversa } = await banco.from('conversas').select('id, nome').eq('id', conversaId).maybeSingle();
    if (!conversa) return responder({ erro: 'Grupo não encontrado.' }, 404);

    const { data: dentro } = await banco
      .from('participantes')
      .select('*')
      .eq('conversa_id', conversaId)
      .in('colaborador_id', ids);
    const pessoas = (dentro ?? [])
      .filter((l) => !l.saiu_em && l.colaborador_id !== eu.id)
      .map((l) => l.colaborador_id as string);

    const aviso = await entregarAosAparelhos(banco, pessoas, {
      tipo: 'conversa',
      conversaId,
      mensagemId: `entrada-${conversaId}`,
      remetente: eu.nome,
      texto: 'Adicionou você ao grupo',
      conversa: conversa.nome as string,
      ehGrupo: 'true',
    });
    return responder(aviso, aviso.erro ? 503 : 200);
  }

  // =============================================================
  // CAMINHO 4 — UMA PUBLICAÇÃO DIRIGIDA
  //
  // Publicação para a rede toda avisa pelo grupo de avisos (caminho 2).
  // A dirigida a uma loja, um setor ou algumas pessoas avisa só quem ela
  // alcança — e quem ela alcança é regra de `mural.ts`, que o aparelho
  // do autor aplica. Aqui se confere que QUEM PEDE É O AUTOR, com o autor
  // tirado do banco; o nome no aviso também sai do banco.
  // =============================================================
  if (pedido.publicacao && typeof pedido.publicacao === 'object') {
    const p = pedido.publicacao as Record<string, unknown>;
    const id = String(p.id || '');
    const texto = String(p.texto || '').trim().slice(0, 240);
    if (!id || !texto) return responder({ erro: 'Pedido de aviso da publicação incompleto.' }, 400);

    const { data: publicacao } = await banco
      .from('avisos_rede')
      .select('id, autor_id')
      .eq('id', id)
      .maybeSingle();
    if (!publicacao) return responder({ erro: 'Publicação não encontrada.' }, 404);
    if (publicacao.autor_id !== eu.id) {
      return responder({ erro: 'Só quem publicou avisa da publicação.' }, 403);
    }

    const lista = Array.isArray(p.destinatarios) ? p.destinatarios : [];
    const pessoas = [...new Set(lista.map(String))]
      .filter((c) => c && c !== eu.id)
      .slice(0, MAXIMO_DA_PUBLICACAO);

    /**
     * `conversaId` leva a PUBLICAÇÃO: é o único campo além do tipo que o
     * aparelho repassa no toque (`ServicoDeAvisos`), e é o que empilha —
     * uma publicação, um aviso.
     */
    const aviso = await entregarAosAparelhos(banco, pessoas, {
      tipo: 'publicacao',
      conversaId: publicacao.id as string,
      publicacaoId: publicacao.id as string,
      mensagemId: `publicacao-${publicacao.id}`,
      remetente: eu.nome,
      texto,
      conversa: 'Central',
      ehGrupo: 'true',
    });
    return responder(aviso, aviso.erro ? 503 : 200);
  }

  // =============================================================
  // CAMINHO 2 — O APLICATIVO ENVIOU UMA MENSAGEM
  // =============================================================
  const mensagemId = String(pedido.mensagemId || '');
  const previa = String(pedido.previa || '').slice(0, 240);
  if (!mensagemId) return responder({ erro: 'Falta mensagemId.' }, 400);

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
