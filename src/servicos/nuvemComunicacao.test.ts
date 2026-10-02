/**
 * Verificação da ponte de comunicação — CONECTA
 *
 * O caso que derrubou o celular em producão, medido no banco de verdade:
 *
 *   insert simples, sem Prefer    -> OK
 *   insert com ignore-duplicates  -> new row violates row-level security
 *   insert com merge-duplicates   -> new row violates row-level security
 *
 * Upsert vira `ON CONFLICT` no Postgres, e isso exige poder enxergar a linha
 * em conflito. A regra de `conversas` só deixa ler quem já participa dela —
 * então entrar num canal que outra pessoa criou era recusado, e com ele ia
 * embora o envio da mensagem inteiro.
 *
 * O cliente do Supabase aqui é falso, mas reproduz essa regra.
 */
import { test, expect, mock, beforeEach } from 'bun:test';

(globalThis as any).localStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
};

let linhasConversas: any[] = [];
let linhasParticipantes: { conversa_id: string; colaborador_id: string }[] = [];
let euSou = 'colab-ana';

const souParticipante = (conversaId: string) =>
  linhasParticipantes.some((p) => p.conversa_id === conversaId && p.colaborador_id === euSou);

const ERRO_RLS = {
  code: '42501',
  message: 'new row violates row-level security policy',
};
const ERRO_DUPLICADA = { code: '23505', message: 'duplicate key value violates unique constraint' };

/**
 * Colunas que o script do Supabase ainda não criou.
 *
 * Existe porque isto derrubou o chat da rede inteira: toda mensagem
 * passou a levar `publicacao_id`, o `aviso-no-chat.sql` não tinha sido
 * rodado, e o banco recusava CADA envio.
 */
let colunasQueFaltam = new Set<string>();

const clienteFalso = {
  from(tabela: string) {
    const gravar = (dados: any, ehUpsert: boolean) => {
      const linhas = Array.isArray(dados) ? dados : [dados];

      if (tabela === 'conversas') {
        for (const linha of linhas) {
          const jaExiste = linhasConversas.some((c) => c.id === linha.id);

          // ON CONFLICT precisa enxergar a linha alvo, e só participante lê
          if (ehUpsert && !souParticipante(linha.id)) {
            return Promise.resolve({ error: ERRO_RLS, data: null });
          }
          if (jaExiste) {
            if (ehUpsert) continue;
            return Promise.resolve({ error: ERRO_DUPLICADA, data: null });
          }
          linhasConversas.push({ ...linha });
        }
        return Promise.resolve({ error: null, data: null });
      }

      if (tabela === 'participantes') {
        for (const linha of linhas) {
          const repetida = linhasParticipantes.some(
            (p) =>
              p.conversa_id === linha.conversa_id && p.colaborador_id === linha.colaborador_id
          );
          if (repetida) {
            if (ehUpsert) continue;
            return Promise.resolve({ error: ERRO_DUPLICADA, data: null });
          }
          linhasParticipantes.push({ ...linha });
        }
        return Promise.resolve({ error: null, data: null });
      }

      /**
       * A COLUNA QUE O BANCO AINDA NÃO TEM.
       *
       * É assim que o PostgREST responde quando o código manda uma
       * coluna criada por um script que ficou por rodar: `PGRST204`,
       * com o nome da coluna na mensagem. Não é permissão, não é
       * conexão, e tentar de novo não muda nada.
       */
      for (const linha of linhas) {
        const faltando = Object.keys(linha).find((c) => colunasQueFaltam.has(c));
        if (faltando) {
          return Promise.resolve({
            error: {
              code: 'PGRST204',
              message: `Could not find the '${faltando}' column of '${tabela}' in the schema cache`,
            },
            data: null,
          });
        }
      }

      return Promise.resolve({ error: null, data: null });
    };

    return {
      insert: (dados: any) => gravar(dados, false),
      upsert: (dados: any) => gravar(dados, true),
      select: () => ({
        // Só enxerga os participantes de conversa da qual já participa —
        // fora isso, apenas as próprias linhas
        eq: (_coluna: string, valor: string) =>
          Promise.resolve({
            data: linhasParticipantes.filter(
              (p) =>
                p.conversa_id === valor &&
                (souParticipante(valor) || p.colaborador_id === euSou)
            ),
            error: null,
          }),
      }),
    };
  },
};

mock.module('./supabase', () => ({
  supabase: clienteFalso,
  usandoNuvem: () => true,
  temSessaoViva: () => true,
}));

const { nuvemComunicacao } = await import('./nuvemComunicacao');

const CANAL_LOJA = {
  id: 'grupo-loja-pirassununga',
  tipo: 'grupo' as const,
  nome: 'Loja Pirassununga',
  participantesIds: ['colab-elias', 'colab-ana'],
  naoLidas: 0,
  atualizadoEm: '2026-09-15T08:00:00.000Z',
  ehSistemaPadrao: true,
};

beforeEach(() => {
  linhasConversas = [];
  linhasParticipantes = [];
  euSou = 'colab-ana';
  colunasQueFaltam = new Set();
});

test('conversa nova é criada e os participantes entram junto', async () => {
  const res = await nuvemComunicacao.salvarConversa(CANAL_LOJA, 'colab-ana');

  expect(res.sucesso).toBe(true);
  expect(linhasConversas).toHaveLength(1);
  expect(linhasParticipantes).toHaveLength(2);
});

test('CELULAR: entra em canal que o computador já criou, sem participar ainda', async () => {
  // O computador criou o canal e só ele está dentro
  euSou = 'colab-elias';
  await nuvemComunicacao.salvarConversa(
    { ...CANAL_LOJA, participantesIds: ['colab-elias'] },
    'colab-elias'
  );
  expect(linhasParticipantes).toHaveLength(1);

  // Agora o celular da Ana, que ainda não participa de nada
  euSou = 'colab-ana';
  expect(souParticipante(CANAL_LOJA.id)).toBe(false);

  const res = await nuvemComunicacao.salvarConversa(CANAL_LOJA, 'colab-ana');

  // Era aqui que dava "violates row-level security policy"
  expect(res.sucesso).toBe(true);
  expect(souParticipante(CANAL_LOJA.id)).toBe(true);
});

test('conversa que já existe não é recriada nem reescrita', async () => {
  euSou = 'colab-elias';
  await nuvemComunicacao.salvarConversa(
    { ...CANAL_LOJA, participantesIds: ['colab-elias'] },
    'colab-elias'
  );

  euSou = 'colab-ana';
  await nuvemComunicacao.salvarConversa(
    { ...CANAL_LOJA, nome: 'Nome trocado pelo celular' },
    'colab-ana'
  );

  expect(linhasConversas).toHaveLength(1);
  expect(linhasConversas[0].nome).toBe('Loja Pirassununga');
});

test('entrar de novo não duplica nem falha', async () => {
  await nuvemComunicacao.salvarConversa(CANAL_LOJA, 'colab-ana');
  const res = await nuvemComunicacao.salvarConversa(CANAL_LOJA, 'colab-ana');

  expect(res.sucesso).toBe(true);
  expect(linhasParticipantes).toHaveLength(2);
  expect(linhasConversas).toHaveLength(1);
});

test('inscreve só quem falta quando alguém já está dentro', async () => {
  euSou = 'colab-elias';
  await nuvemComunicacao.salvarConversa(
    { ...CANAL_LOJA, participantesIds: ['colab-elias'] },
    'colab-elias'
  );

  euSou = 'colab-ana';
  const res = await nuvemComunicacao.salvarConversa(
    { ...CANAL_LOJA, participantesIds: ['colab-elias', 'colab-ana', 'colab-jose'] },
    'colab-ana'
  );

  expect(res.sucesso).toBe(true);
  expect(linhasParticipantes.map((p) => p.colaborador_id).sort()).toEqual([
    'colab-ana',
    'colab-elias',
    'colab-jose',
  ]);
});

test('conversa individual põe as duas pessoas dentro', async () => {
  const res = await nuvemComunicacao.salvarConversa(
    {
      id: 'conv-ind-colab-ana-colab-elias',
      tipo: 'individual',
      nome: 'Elias',
      participantesIds: ['colab-ana', 'colab-elias'],
      naoLidas: 0,
      atualizadoEm: '2026-09-15T08:00:00.000Z',
    },
    'colab-ana'
  );

  expect(res.sucesso).toBe(true);
  expect(linhasParticipantes.map((p) => p.colaborador_id).sort()).toEqual([
    'colab-ana',
    'colab-elias',
  ]);
});

/**
 * A MENSAGEM EM TRÂNSITO SOBREVIVE À SINCRONIZAÇÃO.
 *
 * `sincronizarConversas` reescrevia o cache inteiro com o que veio do banco.
 * Quem tivesse uma mensagem ainda subindo a via SUMIR no instante em que
 * qualquer pessoa da rede mandasse qualquer coisa — porque o evento de tempo
 * real chega para todo mundo e dispara a reescrita. Ela voltava um segundo
 * depois, mas quem olhava já tinha mandado de novo.
 */
test('a sincronizacao nao apaga a mensagem que ainda esta subindo', async () => {
  const ponte = await Bun.file(
    new URL('./nuvemComunicacao.ts', import.meta.url)
  ).text();

  // A reescrita crua do cache é o que não pode voltar
  expect(ponte).not.toContain(
    'localStorage.setItem(CHAVE_MENSAGENS, JSON.stringify(comAnexos));'
  );

  // Só escapa o que o banco AINDA não conhece e está declaradamente em trânsito
  expect(ponte).toContain('const jaNoBanco = new Set(comAnexos.map((m) => m.id))');
  expect(ponte).toContain("m.envio === 'enviando'");
  expect(ponte).toContain('!jaNoBanco.has(m.id)');
});

/**
 * OS EVENTOS DE TEMPO REAL VIRAM UMA SINCRONIZAÇÃO SÓ.
 *
 * Cada evento disparava uma sincronização completa, e completa quer dizer
 * TODAS as mensagens da rede. Abrir uma conversa com trinta não lidas grava
 * trinta marcações de leitura, que viram trinta eventos — e cada aparelho
 * conectado baixava o histórico inteiro trinta vezes por causa disso.
 */
test('os eventos de tempo real nao disparam uma sincronizacao cada', async () => {
  const ponte = await Bun.file(
    new URL('./nuvemComunicacao.ts', import.meta.url)
  ).text();

  const inicio = ponte.indexOf('iniciarTempoReal');
  const fim = ponte.indexOf('limparCache', inicio);
  expect(inicio).toBeGreaterThan(-1);
  expect(fim).toBeGreaterThan(inicio);
  const corpo = ponte.slice(inicio, fim);

  // Nenhum ouvinte do canal chama a sincronização direto
  expect(corpo).not.toContain('this.sincronizarConversas()');
  expect(corpo).toContain('this.agendarSincronizacao()');

  // E duas sincronizações não podem correr ao mesmo tempo: a mais antiga
  // responderia por último e reescreveria o cache com dado velho
  expect(ponte).toContain('if (this.sincronizando)');
  expect(ponte).toContain('this.pedidoDurante = true');
});

/**
 * A JANELA NÃO PODE ATRASAR A PRIMEIRA MENSAGEM.
 *
 * Segurar todo evento trocaria o atraso do envio, que acabou de ser tirado,
 * por um atraso no recebimento. O primeiro evento depois de uma calmaria vai
 * na hora; a janela só junta o que vem grudado nele.
 */
test('o primeiro evento depois de uma calmaria nao espera', async () => {
  const ponte = await Bun.file(
    new URL('./nuvemComunicacao.ts', import.meta.url)
  ).text();

  expect(ponte).toContain('const desdeAUltima = Date.now() - this.ultimaSincronizacao');
  expect(ponte).toContain('>= ESPERA_PARA_JUNTAR_EVENTOS_MS\n        ? 0');
  // Espera fixa é justamente o que este teste existe para impedir
  expect(ponte).not.toContain('}, ESPERA_PARA_JUNTAR_EVENTOS_MS);');
});

// ============================================================
// COLUNA QUE O BANCO AINDA NÃO TEM
// ============================================================

test('COLUNA QUE FALTA é explicada como script por rodar, e não como conexão', async () => {
  /**
   * O caso que parou o chat da rede inteira.
   *
   * Toda mensagem passou a levar `publicacao_id` — a coluna do botão
   * "Abrir publicação" —, o `aviso-no-chat.sql` não tinha sido rodado, e
   * o PostgREST recusava CADA envio com `PGRST204`. A tela dizia
   * "Verifique a conexão e tente de novo", que é a única coisa que não
   * resolvia: a conexão estava ótima.
   *
   * A mensagem tem de sair daqui dizendo QUAL coluna e O QUE fazer —
   * quem lê é quem roda o script.
   */
  colunasQueFaltam = new Set(['publicacao_id']);

  const res = await nuvemComunicacao.salvarMensagem({
    id: 'msg-1',
    conversaId: CANAL_LOJA.id,
    remetenteId: 'colab-ana',
    tipo: 'texto',
    texto: 'teste',
    criadoEm: '2026-09-28T01:08:00.000Z',
    horaFormatada: '01:08',
    lida: false,
    lidaPor: ['colab-ana'],
  } as any);

  expect(res.sucesso).toBe(false);
  expect(res.erro).toContain('publicacao_id');
  expect(res.erro).toContain('script no Supabase');

  // NÃO é permissão, e a mensagem não pode sugerir que seja
  expect(res.erro).not.toContain('Sem permissão');
  // E não manda a pessoa entrar de novo, que também não resolve
  expect(res.erro).not.toContain('sessão terminou');
});

test('com a coluna no lugar, a mensagem passa', async () => {
  /**
   * A guarda do teste acima: se `salvarMensagem` passasse a recusar
   * sempre, ele continuaria verde e o chat estaria morto.
   */
  const res = await nuvemComunicacao.salvarMensagem({
    id: 'msg-2',
    conversaId: CANAL_LOJA.id,
    remetenteId: 'colab-ana',
    tipo: 'texto',
    texto: 'teste',
    criadoEm: '2026-09-28T01:08:00.000Z',
    horaFormatada: '01:08',
    lida: false,
    lidaPor: ['colab-ana'],
  } as any);

  expect(res.sucesso).toBe(true);
});

test('TODA MENSAGEM leva `publicacao_id`, mesmo sem publicação nenhuma', async () => {
  /**
   * É o que torna a coluna obrigatória na prática, e é o que fez o
   * estrago ser total em vez de parcial: não são só os avisos da Central
   * que mandam o campo — um "bom dia" manda `publicacao_id: null`.
   *
   * Sem esta asserção alguém poderia concluir que só o recado de aviso
   * quebraria, e subestimar o tamanho de uma coluna que falta.
   */
  colunasQueFaltam = new Set(['publicacao_id']);

  const res = await nuvemComunicacao.salvarMensagem({
    id: 'msg-3',
    conversaId: CANAL_LOJA.id,
    remetenteId: 'colab-ana',
    tipo: 'texto',
    texto: 'bom dia',
    criadoEm: '2026-09-28T01:08:00.000Z',
    horaFormatada: '01:08',
    lida: false,
    lidaPor: ['colab-ana'],
    // sem publicacaoId nenhum
  } as any);

  expect(res.sucesso).toBe(false);
  expect(res.erro).toContain('publicacao_id');
});

/**
 * A CONVERSA A DOIS QUE AINDA ESTÁ SUBINDO NÃO TROCA DE CARA.
 *
 * "O nome do colaborador fica oscilando por alguns segundos" (Elias,
 * 03/10/2026). Criar a conversa no banco são três gravações, e a
 * sincronização que caísse no meio reescrevia o cache com o banco pela
 * metade: a conversa sumia, ou ficava só comigo dentro — e o cabeçalho
 * mostrava o MEU nome no lugar do colega.
 */
test('a sincronizacao nao troca a conversa nova pela metade que o banco ja tem', async () => {
  const { juntarConversasEmTransito } = await import('./nuvemComunicacao');
  const nova = {
    id: 'conv-ind-colab-ana-colab-elias',
    tipo: 'individual' as const,
    nome: 'Elias',
    participantesIds: ['colab-ana', 'colab-elias'],
    naoLidas: 0,
    atualizadoEm: '2026-10-03T10:00:00.000Z',
  };

  // 1. O banco ainda não tem a conversa: ela continua na tela
  expect(juntarConversasEmTransito([], [nova], 'colab-ana').map((c) => c.id)).toEqual([nova.id]);

  // 2. O banco tem a conversa só comigo dentro: o colega continua nela
  const pelaMetade = { ...nova, participantesIds: ['colab-ana'] };
  const [junta] = juntarConversasEmTransito([pelaMetade], [nova], 'colab-ana');
  expect(junta.participantesIds).toEqual(['colab-ana', 'colab-elias']);

  // 3. Conversa que o banco JÁ conheceu e não devolve mais foi apagada: não volta
  const original = (globalThis as any).localStorage.getItem;
  (globalThis as any).localStorage.getItem = (k: string) =>
    k === 'conecta_v4_conversas_no_banco' ? JSON.stringify([nova.id]) : null;
  try {
    expect(juntarConversasEmTransito([], [nova], 'colab-ana')).toEqual([]);
  } finally {
    (globalThis as any).localStorage.getItem = original;
  }

  // Grupo não entra nessa: quem inscreve ali é o banco
  const grupo = { ...CANAL_LOJA, ehSistemaPadrao: false };
  expect(juntarConversasEmTransito([], [grupo], 'colab-ana')).toEqual([]);

  // E é por ela que a sincronização grava o cache — senão nada disso vale
  const ponte = await Bun.file(new URL('./nuvemComunicacao.ts', import.meta.url)).text();
  expect(ponte).toContain('juntarConversasEmTransito(listaConversas, lerConversasDoAparelho(), meuId)');
  expect(ponte).not.toContain('localStorage.setItem(CHAVE_CONVERSAS, JSON.stringify(listaConversas));');
});
