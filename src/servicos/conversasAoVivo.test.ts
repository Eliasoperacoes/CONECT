/**
 * O EVENTO AO VIVO DAS CONVERSAS, APLICADO (21/10/2026)
 *
 * Cada mensagem, edição, reação ou "lida" recarregava TUDO em cada aparelho
 * (mensagens e leituras a ~175 ms, quase 2 mil vezes por dia). Agora o
 * evento é aplicado ao que o aparelho tem — e quando não basta, a carga
 * completa volta. Aqui: aplica certo, e recarrega quando deve.
 */
import { test, expect } from 'bun:test';

class ArmazenamentoFalso {
  private dados = new Map<string, string>();
  get length() { return this.dados.size; }
  key(i: number) { return [...this.dados.keys()][i] ?? null; }
  getItem(k: string) { return this.dados.has(k) ? this.dados.get(k)! : null; }
  setItem(k: string, v: string) { this.dados.set(k, String(v)); }
  removeItem(k: string) { this.dados.delete(k); }
  clear() { this.dados.clear(); }
}
(globalThis as any).localStorage = new ArmazenamentoFalso();

const { aplicarMensagemAoVivo, aplicarLeituraAoVivo, paraMensagemDaLinha } = await import('./nuvemComunicacao');

const linha = (id: string, extra: Record<string, unknown> = {}) =>
  ({
    id, conversa_id: 'c1', remetente_id: 'ana', tipo: 'texto', texto: `oi ${id}`, audio_url: null, audio_duracao: null,
    arquivo_nome: null, arquivo_tamanho: null, arquivo_url: null, imagem_url: null, legenda: null, eh_encaminhada: false,
    eh_aviso_direcao: false, responde_a: null, reacoes: null, editada_em: null, fixada_em: null, fixada_por_id: null,
    anexo_caminho: null, publicacao_id: null, criado_em: `2026-10-21T10:0${id.slice(-1)}:00.000Z`, ...extra,
  }) as any;

const conversas = () => [{ id: 'c1', tipo: 'individual', nome: 'x', participantesIds: ['ana', 'bia'], naoLidas: 0, atualizadoEm: '2026-10-20T00:00:00.000Z' }] as any[];
const base = () => [paraMensagemDaLinha(linha('m1'), ['ana', 'bia'])];

test('mensagem nova entra no fim, e a prévia da conversa passa a ser ela', () => {
  const r = aplicarMensagemAoVivo(base(), conversas(), { eventType: 'INSERT', new: linha('m2') });
  expect(r.recarregar).toBe(false);
  expect(r.mensagens.map((m) => m.id)).toEqual(['m1', 'm2']);
  expect(r.conversas[0].ultimaMensagem?.texto).toBe('oi m2');
  expect(r.conversas[0].atualizadoEm).toBe('2026-10-21T10:02:00.000Z');
});

test('a que estava "enviando" é substituída pela confirmada, sem duplicar', () => {
  const enviando = { ...paraMensagemDaLinha(linha('m2'), []), envio: 'enviando' } as any;
  const r = aplicarMensagemAoVivo([...base(), enviando], conversas(), { eventType: 'INSERT', new: linha('m2') });
  expect(r.mensagens.filter((m) => m.id === 'm2')).toHaveLength(1);
  expect((r.mensagens.find((m) => m.id === 'm2') as any).envio).toBeUndefined();
});

test('editar ou reagir troca a mensagem e mantém quem já leu', () => {
  const r = aplicarMensagemAoVivo(base(), conversas(), {
    eventType: 'UPDATE',
    new: linha('m1', { texto: 'editada', editada_em: '2026-10-21T11:00:00.000Z', reacoes: { '👍': ['bia'] } }),
  });
  const m = r.mensagens[0];
  expect([m.texto, m.editadaEm, m.reacoes, m.lidaPor]).toEqual(['editada', '2026-10-21T11:00:00.000Z', { '👍': ['bia'] }, ['ana', 'bia']]);
});

test('apagar tira a mensagem e a prévia volta para a anterior', () => {
  const duas = aplicarMensagemAoVivo(base(), conversas(), { eventType: 'INSERT', new: linha('m2') });
  const r = aplicarMensagemAoVivo(duas.mensagens, duas.conversas, { eventType: 'DELETE', old: { id: 'm2' } });
  expect(r.mensagens.map((m) => m.id)).toEqual(['m1']);
  expect(r.conversas[0].ultimaMensagem?.texto).toBe('oi m1');
});

test('anexo novo pede o endereço; o mesmo anexo já assinado fica', () => {
  const comAnexo = aplicarMensagemAoVivo(base(), conversas(), {
    eventType: 'INSERT', new: linha('m3', { tipo: 'imagem', anexo_caminho: 'conv/c1/foto.jpg' }),
  });
  expect(comAnexo.anexoParaAssinar).toBe('conv/c1/foto.jpg');
  const assinada = comAnexo.mensagens.map((m) => (m.id === 'm3' ? { ...m, imagemUrl: 'https://assinado' } : m));
  const reacao = aplicarMensagemAoVivo(assinada, conversas(), {
    eventType: 'UPDATE', new: linha('m3', { tipo: 'imagem', anexo_caminho: 'conv/c1/foto.jpg', reacoes: { '❤️': ['bia'] } }),
  });
  expect(reacao.anexoParaAssinar).toBeUndefined();
  expect(reacao.mensagens.find((m) => m.id === 'm3')?.imagemUrl).toBe('https://assinado');
});

test('na dúvida, recarrega tudo: conversa desconhecida, evento sem a linha, tipo estranho', () => {
  expect(aplicarMensagemAoVivo(base(), conversas(), { eventType: 'INSERT', new: linha('m9', { conversa_id: 'nova' }) }).recarregar).toBe(true);
  expect(aplicarMensagemAoVivo(base(), conversas(), { eventType: 'INSERT', new: null }).recarregar).toBe(true);
  expect(aplicarMensagemAoVivo(base(), conversas(), { eventType: 'DELETE', old: {} }).recarregar).toBe(true);
  expect(aplicarMensagemAoVivo(base(), conversas(), { eventType: 'TRUNCATE' }).recarregar).toBe(true);
});

test('"lida": marca quem leu uma vez só, e ignora mensagem que o aparelho não tem', () => {
  const so = [paraMensagemDaLinha(linha('m1'), ['ana'])];
  expect(so[0].lida).toBe(false);
  const r = aplicarLeituraAoVivo(so, { eventType: 'INSERT', new: { mensagem_id: 'm1', colaborador_id: 'bia' } });
  expect([r.mensagens[0].lidaPor, r.mensagens[0].lida, r.recarregar]).toEqual([['ana', 'bia'], true, false]);
  const deNovo = aplicarLeituraAoVivo(r.mensagens, { eventType: 'INSERT', new: { mensagem_id: 'm1', colaborador_id: 'bia' } });
  expect(deNovo.mensagens).toBe(r.mensagens);
  const outra = aplicarLeituraAoVivo(so, { eventType: 'INSERT', new: { mensagem_id: 'nao-tenho', colaborador_id: 'bia' } });
  expect([outra.mensagens, outra.recarregar]).toEqual([so, false]);
  expect(aplicarLeituraAoVivo(so, { eventType: 'INSERT', new: null }).recarregar).toBe(true);
});

test('o tempo real aplica mensagens e leituras; conversas e participantes seguem pela carga completa', async () => {
  const fonte = await Bun.file(new URL('./nuvemComunicacao.ts', import.meta.url)).text();
  expect(fonte).toContain("this.aplicarAoVivo('mensagens', evento as EventoAoVivo<any>)");
  expect(fonte).toContain("this.aplicarAoVivo('leituras_mensagem', evento as EventoAoVivo<any>)");
  expect(fonte).toContain("table: 'conversas' }, recarregarConversas)");
  // E a carga completa usa a mesma conversão que o evento ao vivo
  expect(fonte).toContain('paraMensagemDaLinha(linha, lidaPorMensagem.get(linha.id) || [])');
  // Evento no meio de uma carga não é aplicado: viraria dado perdido
  expect(fonte).toContain('if (this.cargasEmCurso > 0 || this.sincronizando || this.sincronizacaoAgendada) {');
});
