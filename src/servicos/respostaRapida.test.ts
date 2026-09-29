/**
 * A RESPOSTA RÁPIDA — executando a função de servidor de verdade
 *
 * `enviar-aviso` roda no Deno do Supabase. Aqui ela roda no Bun, com o
 * `Deno` de mentira, um banco em memória e o Google e o Firebase
 * trocados por um `fetch` que só anota. O código é o MESMO arquivo que o
 * Elias cola no painel — nada reescrito para o teste.
 *
 * Por que rodar, e não só ler o código: o vale é uma trava de segurança.
 * Ele decide quem escreve em nome de quem com o aparelho fechado. "O
 * texto contém `lerVale`" não prova que um vale adulterado é recusado.
 */
import { test, expect, mock, beforeEach, afterAll } from 'bun:test';

// ---------------------------------------------------------------
// O banco de mentira
// ---------------------------------------------------------------

type Linha = Record<string, any>;
let tabelas: Record<string, Linha[]>;

const consulta = (tabela: string) => {
  const filtros: Array<(l: Linha) => boolean> = [];
  let operacao: 'select' | 'delete' = 'select';

  const linhas = () => (tabelas[tabela] ||= []).filter((l) => filtros.every((f) => f(l)));

  const construtor: any = {
    select: () => construtor,
    eq: (c: string, v: any) => (filtros.push((l) => l[c] === v), construtor),
    neq: (c: string, v: any) => (filtros.push((l) => l[c] !== v), construtor),
    in: (c: string, vs: any[]) => (filtros.push((l) => vs.includes(l[c])), construtor),
    maybeSingle: async () => ({ data: linhas()[0] ?? null, error: null }),
    delete: () => ((operacao = 'delete'), construtor),
    insert: async (linha: Linha) => {
      (tabelas[tabela] ||= []).push(linha);
      return { error: null };
    },
    upsert: async (novas: Linha[]) => {
      (tabelas[tabela] ||= []).push(...novas);
      return { error: null };
    },
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

const bancoFalso = {
  from: consulta,
  auth: {
    getUser: async (jwt: string) =>
      jwt === 'jwt-da-ana' ? { data: { user: { id: 'auth-ana' } } } : { data: { user: null } },
  },
};

mock.module('jsr:@supabase/supabase-js@2', () => ({ createClient: () => bancoFalso }));

// ---------------------------------------------------------------
// O Deno, o Google e o Firebase de mentira
// ---------------------------------------------------------------

const ambiente: Record<string, string> = {
  SUPABASE_URL: 'https://projeto.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'chave-de-servico-de-teste',
};
let atender: (req: Request) => Promise<Response>;
(globalThis as any).Deno = {
  env: { get: (k: string) => ambiente[k] },
  serve: (fn: (req: Request) => Promise<Response>) => {
    atender = fn;
  },
};

/** Uma conta de serviço com chave RSA de verdade, gerada para o teste. */
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

/** O que foi entregue ao Firebase. */
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

/* Caminho numa variável: o `tsc` do projeto não segue, e a função Deno
   (com `Deno.serve`) fica fora da checagem do navegador, como no tsconfig */
const FUNCAO = '../../supabase/functions/enviar-aviso/index.ts';
await import(FUNCAO);

const chamar = (corpo: unknown, jwt?: string) =>
  atender(
    new Request('https://x/functions/v1/enviar-aviso', {
      method: 'POST',
      headers: jwt ? { Authorization: `Bearer ${jwt}` } : {},
      body: JSON.stringify(corpo),
    })
  );

beforeEach(() => {
  entregas = [];
  tabelas = {
    colaboradores: [
      { id: 'ana', nome: 'Ana', loja: 'Pirassununga', auth_user_id: 'auth-ana', ativo: true },
      { id: 'bia', nome: 'Bia', loja: 'Descalvado', auth_user_id: 'auth-bia', ativo: true },
      { id: 'caio', nome: 'Caio', loja: 'Palmeiras', auth_user_id: 'auth-caio', ativo: true },
    ],
    conversas: [
      { id: 'conv-ana-bia', tipo: 'individual', nome: 'Ana e Bia', apenas_gestores_publicam: false },
      { id: 'grupo-avisos-da-rede', tipo: 'grupo', nome: 'Avisos', apenas_gestores_publicam: false },
      { id: 'grupo-gerentes', tipo: 'grupo', nome: 'Gerentes', apenas_gestores_publicam: true },
    ],
    participantes: [
      { conversa_id: 'conv-ana-bia', colaborador_id: 'ana' },
      { conversa_id: 'conv-ana-bia', colaborador_id: 'bia' },
      { conversa_id: 'grupo-avisos-da-rede', colaborador_id: 'ana' },
      { conversa_id: 'grupo-avisos-da-rede', colaborador_id: 'bia' },
      { conversa_id: 'grupo-gerentes', colaborador_id: 'ana' },
      { conversa_id: 'grupo-gerentes', colaborador_id: 'bia' },
    ],
    mensagens: [
      { id: 'm1', conversa_id: 'conv-ana-bia', remetente_id: 'ana' },
      { id: 'm2', conversa_id: 'grupo-avisos-da-rede', remetente_id: 'ana' },
      { id: 'm3', conversa_id: 'grupo-gerentes', remetente_id: 'ana' },
    ],
    aparelhos: [
      { token: 'celular-ana', colaborador_id: 'ana' },
      { token: 'celular-bia', colaborador_id: 'bia' },
    ],
    leituras_mensagem: [],
  };
});

/** A Ana manda "chegou a peça" à Bia; devolve o vale que o celular da Bia recebeu. */
const valeDaBia = async (mensagemId = 'm1'): Promise<string> => {
  const r = await chamar({ mensagemId, previa: 'chegou a peça' }, 'jwt-da-ana');
  expect(r.status).toBe(200);
  const daBia = entregas.find((e) => e.token === 'celular-bia');
  return daBia?.data?.vale;
};

// ===============================================================
// O AVISO
// ===============================================================

test('o aviso vai SÓ COM DADOS, para o aparelho montar o "Responder"', async () => {
  /* Com `notification`, o Android desenha sozinho com o app fechado — e
     o desenho dele não tem campo de resposta */
  await valeDaBia();

  expect(entregas).toHaveLength(1);
  const [aviso] = entregas;
  expect(aviso.token).toBe('celular-bia');
  expect(aviso.notification).toBeUndefined();
  expect(aviso.android.priority).toBe('HIGH');
  expect(aviso.data.remetente).toBe('Ana');
  expect(aviso.data.texto).toBe('chegou a peça');
  expect(aviso.data.ehGrupo).toBe('false');
  expect(aviso.data.conversaId).toBe('conv-ana-bia');
  for (const valor of Object.values(aviso.data)) expect(typeof valor).toBe('string');
});

test('no grupo de avisos e no grupo de gestores o aviso chega SEM "Responder"', async () => {
  /* Lá quem publica depende do nível — regra que mora no aplicativo. O
     servidor não a reescreve: simplesmente não oferece o botão */
  await chamar({ mensagemId: 'm2', previa: 'comunicado' }, 'jwt-da-ana');
  await chamar({ mensagemId: 'm3', previa: 'reunião' }, 'jwt-da-ana');

  expect(entregas).toHaveLength(2);
  for (const aviso of entregas) {
    expect(aviso.data.vale).toBeUndefined();
    expect(aviso.data.remetente).toBe('Ana');
    expect(aviso.data.ehGrupo).toBe('true');
  }
});

test('sem sessão válida, ninguém pede aviso', async () => {
  const r = await chamar({ mensagemId: 'm1', previa: 'x' }, 'jwt-falso');
  expect(r.status).toBe(401);
  expect(entregas).toEqual([]);
});

// ===============================================================
// A RESPOSTA
// ===============================================================

test('A BIA RESPONDE PELA NOTIFICAÇÃO: grava em nome dela e avisa a Ana', async () => {
  const vale = await valeDaBia();
  entregas = [];

  const r = await chamar({ vale, texto: '  já vou buscar  ' });
  expect(r.status).toBe(200);

  const gravada = tabelas.mensagens.find((m) => m.texto === 'já vou buscar');
  expect(gravada).toBeTruthy();
  expect(gravada!.remetente_id).toBe('bia');
  expect(gravada!.conversa_id).toBe('conv-ana-bia');
  expect(gravada!.tipo).toBe('texto');
  expect(gravada!.id).toMatch(/^msg-\d+-[a-z0-9]+$/);

  /* Quem respondeu leu: a própria resposta e a mensagem da Ana */
  const lidas = tabelas.leituras_mensagem.filter((l) => l.colaborador_id === 'bia').map((l) => l.mensagem_id);
  expect(lidas).toContain(gravada!.id);
  expect(lidas).toContain('m1');

  /* E a Ana é avisada da resposta, pelo mesmo caminho */
  expect(entregas).toHaveLength(1);
  expect(entregas[0].token).toBe('celular-ana');
  expect(entregas[0].data.remetente).toBe('Bia');
  expect(entregas[0].data.texto).toBe('já vou buscar');
});

test('VALE ADULTERADO é recusado: trocar o nome não passa na assinatura', async () => {
  /* O Caio pega o vale da Bia e troca "bia" por "caio" — ou por "ana",
     para escrever em nome da Ana */
  const vale = await valeDaBia();
  const [carga, assinatura] = vale.split('.');
  const dados = JSON.parse(Buffer.from(carga, 'base64url').toString());
  const forjada = Buffer.from(JSON.stringify({ ...dados, c: 'ana' })).toString('base64url');

  const antes = tabelas.mensagens.length;
  const r = await chamar({ vale: `${forjada}.${assinatura}`, texto: 'pode demitir' });

  expect(r.status).toBe(403);
  expect(tabelas.mensagens.length).toBe(antes);
});

test('vale sem assinatura, ou lixo, é recusado', async () => {
  for (const vale of ['', 'abc', 'abc.def', `${Buffer.from('{"c":"ana","v":"conv-ana-bia","m":"m1","e":9999999999999}').toString('base64url')}.xxx`]) {
    const r = await chamar({ vale, texto: 'oi' });
    expect({ vale, status: r.status }).toEqual({ vale, status: 403 });
  }
});

test('VALE VENCIDO é recusado: aviso esquecido na barra não vira porta', async () => {
  const vale = await valeDaBia();
  const agoraDeVerdade = Date.now;
  Date.now = () => agoraDeVerdade() + 49 * 60 * 60 * 1000;
  try {
    const r = await chamar({ vale, texto: 'oi' });
    expect(r.status).toBe(403);
  } finally {
    Date.now = agoraDeVerdade;
  }
});

test('quem SAIU da conversa depois do aviso não responde mais', async () => {
  const vale = await valeDaBia();
  tabelas.participantes = tabelas.participantes.filter(
    (p) => !(p.conversa_id === 'conv-ana-bia' && p.colaborador_id === 'bia')
  );

  const r = await chamar({ vale, texto: 'oi' });
  expect(r.status).toBe(403);
});

test('quem foi DESLIGADO depois do aviso não responde mais', async () => {
  const vale = await valeDaBia();
  tabelas.colaboradores.find((c) => c.id === 'bia')!.ativo = false;

  const r = await chamar({ vale, texto: 'oi' });
  expect(r.status).toBe(403);
});

// ===============================================================
// O LADO ANDROID
//
// Java não roda aqui; o que dá para cobrar é que as peças estão
// ligadas. A compilação é conferida gerando o APK.
// ===============================================================

const JAVA = 'android/app/src/main/java/br/com/malachiasautopecas/conecta';

test('QUEM RECEBE O AVISO é o nosso serviço, e o do plugin sai', async () => {
  /* Com os dois declarados, o Android escolhe UM — e sem o nosso não há
     "Responder". Com o do plugin removido e o nosso sem estendê-lo, o
     token deixaria de ser guardado */
  const manifesto = await Bun.file('android/app/src/main/AndroidManifest.xml').text();
  expect(manifesto).toMatch(
    /android:name="com\.capacitorjs\.plugins\.pushnotifications\.MessagingService"\s+tools:node="remove"/
  );
  expect(manifesto).toContain('android:name=".ServicoDeAvisos"');
  expect(manifesto).toContain('android:name=".RespostaRapida"');

  const servico = await Bun.file(`${JAVA}/ServicoDeAvisos.java`).text();
  expect(servico).toContain('extends MessagingService');
  expect(servico).toContain('super.onMessageReceived(mensagem);');
});

test('com o CONECTA na tela, o aviso não desce por cima', async () => {
  const servico = await Bun.file(`${JAVA}/ServicoDeAvisos.java`).text();
  const atividade = await Bun.file(`${JAVA}/MainActivity.java`).text();
  expect(servico).toContain('if (MainActivity.naTela) return;');
  expect(atividade).toContain('naTela = true;');
  expect(atividade).toContain('naTela = false;');
});

test('TUDO QUE O SERVIDOR MANDA, o aparelho sabe ler e devolve no "Responder"', async () => {
  /* Um campo que o servidor manda e o Java não lista some no caminho do
     "Responder" — e o aviso redesenhado depois da resposta sai sem ele */
  await valeDaBia();
  const servico = await Bun.file(`${JAVA}/ServicoDeAvisos.java`).text();
  const lista = servico.match(/static final String\[\] CHAVES = \{([^}]+)\}/)?.[1] ?? '';
  const chavesDoJava = [...lista.matchAll(/"([a-zA-Z]+)"/g)].map((m) => m[1]);

  const enviadas = Object.keys(entregas[0].data);
  expect(enviadas.length).toBeGreaterThan(5);
  expect(enviadas.filter((c) => !chavesDoJava.includes(c))).toEqual([]);
});

test('AS MENSAGENS SE EMPILHAM na conversa, e não trocam a anterior', async () => {
  const servico = await Bun.file(`${JAVA}/ServicoDeAvisos.java`).text();
  /* Dentro de `estiloAtual`: é ela que devolve as mensagens que já estão
     no aviso, e não uma pilha nova a cada mensagem */
  const inicio = servico.indexOf('static NotificationCompat.MessagingStyle estiloAtual(');
  const estiloAtual = servico.slice(inicio, servico.indexOf('static StatusBarNotification avisoAtivo(', inicio));
  expect(estiloAtual.length).toBeGreaterThan(0);
  expect(estiloAtual).toContain('extractMessagingStyleFromNotification(ativo.getNotification())');
  expect(estiloAtual).toContain('if (existente != null) return existente;');
  expect(servico).toContain('estilo.addMessage(dados.get("texto")');
  /* A resposta entra na mesma pilha, como "Você" */
  const resposta = await Bun.file(`${JAVA}/RespostaRapida.java`).text();
  expect(resposta).toContain('ServicoDeAvisos.estiloAtual(contexto, id)');
});

test('COM DUAS CONVERSAS OU MAIS existe o aviso principal, que não toca de novo', async () => {
  const servico = await Bun.file(`${JAVA}/ServicoDeAvisos.java`).text();
  expect(servico).toContain('if (conversas.size() < 2)');
  expect(servico).toContain('.setGroupSummary(true)');
  expect(servico).toContain('" mensagens") + " de " + conversas.size() + " conversas"');
  /* Sem isto o aparelho avisa duas vezes a mesma mensagem */
  expect(servico.split('GROUP_ALERT_CHILDREN').length - 1).toBeGreaterThanOrEqual(2);
});

test('o cabeçalho do aviso diz "Malachias", e o ícone continua "CONECTA"', async () => {
  const textos = await Bun.file('android/app/src/main/res/values/strings.xml').text();
  expect(textos).toContain('<string name="app_name">Malachias</string>');
  expect(textos).toContain('<string name="title_activity_main">CONECTA</string>');
  const manifesto = await Bun.file('android/app/src/main/AndroidManifest.xml').text();
  expect(manifesto).toContain('android:label="@string/title_activity_main"');
});

test('o "Responder" só aparece quando veio vale, e o toque abre a conversa', async () => {
  const servico = await Bun.file(`${JAVA}/ServicoDeAvisos.java`).text();
  expect(servico).toContain('if (dados.get("vale") == null || dados.get("respostaUrl") == null) return;');
  /* O plugin só dispara o toque para o sistema com este extra */
  expect(servico).toContain('abrir.putExtra("google.message_id"');
  expect(servico).toContain('abrir.putExtra("conversaId"');
  /* Sem MUTABLE o Android não consegue escrever o texto digitado */
  expect(servico).toContain('PendingIntent.FLAG_MUTABLE');
});

test('depois de enviar, o aviso é redesenhado — senão o campo gira para sempre', async () => {
  const resposta = await Bun.file(`${JAVA}/RespostaRapida.java`).text();
  expect(resposta).toContain('goAsync()');
  expect(resposta).toContain('redesenhar(app, dados, resposta, enviou)');
  expect(resposta).toContain('corpo.put("vale", vale)');
});

test('o app e o plugin usam a MESMA versão do Firebase', async () => {
  const app = await Bun.file('android/app/build.gradle').text();
  const variaveis = await Bun.file('android/variables.gradle').text();
  expect(app).toContain('firebase-messaging:$firebaseMessagingVersion');
  expect(variaveis).toMatch(/firebaseMessagingVersion = '[\d.]+'/);
});

test('resposta vazia não grava mensagem em branco', async () => {
  const vale = await valeDaBia();
  const antes = tabelas.mensagens.length;

  const r = await chamar({ vale, texto: '   ' });
  expect(r.status).toBe(400);
  expect(tabelas.mensagens.length).toBe(antes);
});
