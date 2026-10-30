/**
 * O CHAT PELO QUE MUDOU — a carga de verdade (nuvemComunicacao.sincronizarConversas, 30/10/2026).
 *
 * As linhas das quatro tabelas ficam guardadas como o banco as devolveu, e a
 * montagem do chat (participantes, quem leu, a prévia de cada conversa) é a
 * de sempre, sobre a lista inteira guardada. O que se prova: nada mudou,
 * nada desce; o que mudou chega à tela igual chegaria pela carga completa.
 */
import { test, expect, mock, beforeEach } from 'bun:test';

class ArmazenamentoFalso {
  dados = new Map<string, string>();
  getItem(k: string) { return this.dados.has(k) ? this.dados.get(k)! : null; }
  setItem(k: string, v: string) { this.dados.set(k, String(v)); }
  removeItem(k: string) { this.dados.delete(k); }
  clear() { this.dados.clear(); }
  get length() { return this.dados.size; }
  key(i: number) { return [...this.dados.keys()][i] ?? null; }
}
const armazenamento = new ArmazenamentoFalso();
(globalThis as any).localStorage = armazenamento;

type Tabela = 'conversas' | 'participantes' | 'mensagens' | 'leituras_mensagem';
const CHAVE: Record<Tabela, string[]> = {
  conversas: ['id'],
  participantes: ['conversa_id', 'colaborador_id'],
  mensagens: ['id'],
  leituras_mensagem: ['mensagem_id', 'colaborador_id'],
};

// --- O banco falso ---
let banco: Record<Tabela, any[]>;
let temResumo = true;
/** Linhas que desceram, por tabela */
let desceram: Record<string, number> = {};
let relogio = 0;
const carimbo = () => new Date(Date.parse('2026-10-30T12:00:00.000Z') + (relogio += 10) * 60_000).toISOString();

const chaveDe = (t: Tabela, l: any) => CHAVE[t].map((c) => l[c]).join('|');

const consulta = (tabela: Tabela, colunas: string) => {
  const condicoes: Array<(l: any) => boolean> = [];
  const q: any = {
    gte: (c: string, v: string) => {
      condicoes.push((l) => (c === 'alterado_em' ? Date.parse(l[c]) >= Date.parse(v) : l[c] >= v));
      return q;
    },
    in: (c: string, vs: string[]) => {
      condicoes.push((l) => vs.includes(l[c]));
      return q;
    },
    order: () => q,
    range: (de: number, ate: number) => {
      const todas = banco[tabela]
        .filter((l) => condicoes.every((f) => f(l)))
        .sort((a, b) => (chaveDe(tabela, a) < chaveDe(tabela, b) ? -1 : 1));
      const pagina = todas.slice(de, ate + 1);
      desceram[tabela] = (desceram[tabela] ?? 0) + pagina.length;
      const cols = colunas.split(',').map((c) => c.trim());
      const dados = colunas === '*' ? pagina.map((l) => ({ ...l })) : pagina.map((l) => Object.fromEntries(cols.map((c) => [c, l[c]])));
      return Promise.resolve({ data: dados, error: null });
    },
  };
  return q;
};

const sha = (chaves: string[]) => new Bun.CryptoHasher('sha256').update([...chaves].sort().join(',')).digest('hex');

/** Como o banco responde à gravação da leitura: grava, a rede caiu, ou recusa de vez */
let gravacaoDaLeitura: 'grava' | 'sem-rede' | 'recusa' = 'grava';

const gravarLeituras = async (linhas: Array<{ mensagem_id: string; colaborador_id: string }>) => {
  if (gravacaoDaLeitura === 'sem-rede') return { error: { message: 'TypeError: Failed to fetch', code: '' } };
  if (gravacaoDaLeitura === 'recusa') return { error: { message: 'new row violates row-level security policy', code: '42501' } };
  for (const l of linhas) {
    const ja = banco.leituras_mensagem.some((x) => x.mensagem_id === l.mensagem_id && x.colaborador_id === l.colaborador_id);
    if (!ja) banco.leituras_mensagem.push(leitura(l.mensagem_id, l.colaborador_id));
  }
  return { error: null };
};

mock.module('./supabase', () => ({
  supabase: {
    from: (tabela: Tabela) => ({
      select: (colunas: string) => consulta(tabela, colunas),
      upsert: (linhas: any[]) => gravarLeituras(linhas),
    }),
    rpc: async (_nome: string, args: { p_tabela: Tabela }) => {
      if (!temResumo) return { data: null, error: { message: 'Could not find the function' } };
      const linhas = banco[args.p_tabela];
      const marca = linhas.map((l) => l.alterado_em).sort().at(-1) ?? null;
      return {
        data: [{ quantidade: linhas.length, marca, assinatura: sha(linhas.map((l) => chaveDe(args.p_tabela, l))) }],
        error: null,
      };
    },
  },
  usandoNuvem: () => true,
  temSessaoViva: () => true,
}));

const { nuvemComunicacao, lerLeiturasPendentes } = await import('./nuvemComunicacao');

const conversa = (id: string, nome: string) => ({
  id, tipo: 'grupo', nome, foto: null, descricao: null, criado_por_id: 'ana',
  apenas_gestores_publicam: false, eh_sistema_padrao: false,
  atualizado_em: '2026-10-30T08:00:00.000Z', criado_em: '2026-10-30T08:00:00.000Z', alterado_em: carimbo(),
});
const participante = (conversa_id: string, colaborador_id: string, extra: any = {}) => ({
  conversa_id, colaborador_id, papel: 'membro', saiu_em: null, alterado_em: carimbo(), ...extra,
});
const mensagem = (id: string, remetente_id: string, texto: string, criado_em: string) => ({
  id, conversa_id: 'g1', remetente_id, tipo: 'texto', texto, audio_url: null, audio_duracao: null,
  arquivo_nome: null, arquivo_tamanho: null, arquivo_url: null, imagem_url: null, legenda: null,
  eh_encaminhada: false, eh_aviso_direcao: false, responde_a: null, reacoes: {}, editada_em: null,
  fixada_em: null, fixada_por_id: null, criado_em, alterado_em: carimbo(),
});
const leitura = (mensagem_id: string, colaborador_id: string) => ({ mensagem_id, colaborador_id, alterado_em: carimbo() });

const lerChat = () => ({
  conversas: JSON.parse(armazenamento.getItem('conecta_v4_conversas') || '[]'),
  mensagens: JSON.parse(armazenamento.getItem('conecta_v4_mensagens') || '[]'),
});
const zerar = () => { desceram = {}; };
const total = () => Object.values(desceram).reduce((a, b) => a + b, 0);

beforeEach(() => {
  armazenamento.clear();
  armazenamento.setItem('conecta_v4_colaborador_atual', 'ana');
  relogio = 0;
  temResumo = true;
  gravacaoDaLeitura = 'grava';
  banco = {
    conversas: [conversa('g1', 'Balcão')],
    participantes: [participante('g1', 'ana'), participante('g1', 'bia')],
    mensagens: [
      mensagem('m1', 'bia', 'bom dia', '2026-10-30T08:00:00.000Z'),
      mensagem('m2', 'ana', 'oi', '2026-10-30T08:05:00.000Z'),
    ],
    leituras_mensagem: [leitura('m1', 'ana')],
  };
  // As linhas de base ficam bem antes da marca: dentro da folga, desceriam de novo
  relogio = 100;
  zerar();
});

test('a primeira carga monta o chat como sempre: participantes, quem leu e a prévia', async () => {
  expect(await nuvemComunicacao.sincronizarConversas()).toBe(true);
  const { conversas, mensagens } = lerChat();
  expect(conversas.map((c: any) => [c.id, c.participantesIds, c.ultimaMensagem?.texto])).toEqual([
    ['g1', ['ana', 'bia'], 'oi'],
  ]);
  expect(mensagens.map((m: any) => [m.id, m.lidaPor])).toEqual([['m1', ['ana']], ['m2', []]]);
});

test('NADA MUDOU, NADA DESCE: a segunda carga não traz uma linha das quatro tabelas', async () => {
  await nuvemComunicacao.sincronizarConversas();
  const antes = lerChat();
  zerar();
  expect(await nuvemComunicacao.sincronizarConversas()).toBe(true);
  expect(desceram).toEqual({});
  expect(lerChat()).toEqual(antes);
});

test('mensagem nova: desce ela (e a da folga), e vira a prévia da conversa', async () => {
  await nuvemComunicacao.sincronizarConversas();
  banco.mensagens.push(mensagem('m3', 'bia', 'chegou a peça', '2026-10-30T09:00:00.000Z'));
  zerar();
  await nuvemComunicacao.sincronizarConversas();
  // A nova, e a que estava na marca anterior (os cinco minutos de folga)
  expect(desceram).toEqual({ mensagens: 2 });
  const { conversas, mensagens } = lerChat();
  expect(mensagens.map((m: any) => m.id)).toEqual(['m1', 'm2', 'm3']);
  expect(conversas[0].ultimaMensagem.texto).toBe('chegou a peça');
});

test('leitura nova chega a quem enviou', async () => {
  await nuvemComunicacao.sincronizarConversas();
  banco.leituras_mensagem.push(leitura('m2', 'bia'));
  zerar();
  await nuvemComunicacao.sincronizarConversas();
  expect(desceram).toEqual({ leituras_mensagem: 2 });
  const m2 = lerChat().mensagens.find((m: any) => m.id === 'm2');
  expect([m2.lidaPor, m2.lida]).toEqual([['bia'], true]);
});

test('quem saiu do grupo sai da lista de participantes', async () => {
  await nuvemComunicacao.sincronizarConversas();
  banco.participantes[1] = participante('g1', 'bia', { saiu_em: '2026-10-30T10:00:00.000Z' });
  zerar();
  await nuvemComunicacao.sincronizarConversas();
  expect(desceram).toEqual({ participantes: 1 });
  expect(lerChat().conversas[0].participantesIds).toEqual(['ana']);
});

test('a hora em que EU entrei vem da minha linha de participação, não da dos outros', async () => {
  banco.participantes = [
    participante('g1', 'ana', { entrou_em: '2026-10-28T12:00:00.000Z' }),
    participante('g1', 'bia', { entrou_em: '2026-10-01T08:00:00.000Z' }),
  ];
  await nuvemComunicacao.sincronizarConversas();
  expect(lerChat().conversas[0].euEntreiEm).toBe('2026-10-28T12:00:00.000Z');
});

test('mensagem apagada de vez no banco some da tela, sem baixar o chat de novo', async () => {
  await nuvemComunicacao.sincronizarConversas();
  banco.mensagens = banco.mensagens.filter((m) => m.id !== 'm2');
  banco.leituras_mensagem = banco.leituras_mensagem.filter((l) => l.mensagem_id !== 'm2');
  zerar();
  await nuvemComunicacao.sincronizarConversas();
  const { conversas, mensagens } = lerChat();
  expect(mensagens.map((m: any) => m.id)).toEqual(['m1']);
  expect(conversas[0].ultimaMensagem.texto).toBe('bom dia');
  // Só a lista de ids das mensagens desceu
  expect(desceram).toEqual({ mensagens: 1 });
});

test('SEM O SCRIPT NO BANCO, a carga completa de antes monta o mesmo chat', async () => {
  await nuvemComunicacao.sincronizarConversas();
  const pelaMudanca = lerChat();
  armazenamento.clear();
  armazenamento.setItem('conecta_v4_colaborador_atual', 'ana');
  temResumo = false;
  zerar();
  await nuvemComunicacao.sincronizarConversas();
  expect(total()).toBe(6);
  expect(lerChat()).toEqual(pelaMudanca);
});

/*
  A LEITURA QUE NÃO SUBIU (30/10/2026). Abrir a conversa marcava a leitura no
  aparelho e mandava ao banco uma vez; com a rede da loja falhando naquele
  instante, a carga seguinte trazia o banco sem ela e a mensagem voltava a
  contar como não lida — o número que aparece e não tem nada de novo.
*/
const naoLidaPelaAna = (id: string) => !lerChat().mensagens.find((m: any) => m.id === id).lidaPor.includes('ana');

test('A LEITURA QUE NÃO SUBIU não volta como não lida, e sobe quando a rede volta', async () => {
  banco.mensagens.push(mensagem('m3', 'bia', 'chegou a peça', '2026-10-30T09:00:00.000Z'));
  await nuvemComunicacao.sincronizarConversas();
  expect(naoLidaPelaAna('m3')).toBe(true);

  // A Ana abre a conversa com a rede caída
  gravacaoDaLeitura = 'sem-rede';
  expect(await nuvemComunicacao.marcarLeitura(['m3'], 'ana')).toBe(false);
  expect(lerLeiturasPendentes().map((p) => p.m)).toEqual(['m3']);

  // A carga seguinte, ainda sem rede para gravar: segue lida na tela
  await nuvemComunicacao.sincronizarConversas();
  expect(naoLidaPelaAna('m3')).toBe(false);

  // A rede volta: a próxima carga reenvia, o banco grava e a fila esvazia
  gravacaoDaLeitura = 'grava';
  await nuvemComunicacao.sincronizarConversas();
  expect(banco.leituras_mensagem.some((l) => l.mensagem_id === 'm3' && l.colaborador_id === 'ana')).toBe(true);
  expect(lerLeiturasPendentes()).toEqual([]);
  expect(naoLidaPelaAna('m3')).toBe(false);
});

test('recusa definitiva (saiu da conversa, mensagem apagada) tira a leitura da fila', async () => {
  gravacaoDaLeitura = 'recusa';
  expect(await nuvemComunicacao.marcarLeitura(['m1'], 'ana')).toBe(false);
  expect(lerLeiturasPendentes()).toEqual([]);
});

test('a fila é de quem está no aparelho: a leitura de outra pessoa não conta para esta', async () => {
  banco.mensagens.push(mensagem('m3', 'bia', 'chegou a peça', '2026-10-30T09:00:00.000Z'));
  gravacaoDaLeitura = 'sem-rede';
  await nuvemComunicacao.marcarLeitura(['m3'], 'cris');
  await nuvemComunicacao.sincronizarConversas();
  expect(naoLidaPelaAna('m3')).toBe(true);
});
