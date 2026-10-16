/**
 * CHAMAR QUEM NÃO BATEU (16/10/2026): um toque manda o recado e abre a
 * conversa — e o recado sai uma vez por dia, não a cada toque.
 */
import { test, expect, beforeEach } from 'bun:test';

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

const { bancoDados } = await import('./bancoDados');
const { chamarQuemNaoBateu, recadoDeQuemNaoBateu } = await import('./chamarQuemNaoBateu');
const { dataDeHoje } = await import('./ponto');

const pessoa = (id: string, nome: string, setor: string, nivel: number) => ({
  id, nome, login: id, cargo: 'x', setor, loja: 'Pirassununga', nivel,
  foto: '', presenca: 'disponivel', vistoPorUltimo: '', ativo: true,
});

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem(
    'conecta_v4_colaboradores',
    JSON.stringify([pessoa('fabio', 'Fabio Gerente', 'Gerência', 3), pessoa('abner', 'ABNER SOUSA BORGES', 'Balcão', 1)])
  );
  localStorage.setItem('conecta_v4_colaborador_atual', 'fabio');
});

const recadosDoFabio = (conversaId: string) =>
  bancoDados.obterMensagens(conversaId).filter((m) => m.remetenteId === 'fabio');

test('o recado chama pelo primeiro nome e diz o dia', () => {
  expect(recadoDeQuemNaoBateu('ABNER SOUSA BORGES', '2026-10-16')).toBe(
    'Oi, Abner! Ainda não vi o seu ponto de hoje (16/10). Se esqueceu, bata agora; se é folga ou atestado, me avise.'
  );
});

test('o toque manda o recado na conversa da pessoa', async () => {
  const r = await chamarQuemNaoBateu('abner');
  expect(r.enviada).toBe(true);
  expect(recadosDoFabio(r.conversaId).map((m) => m.texto)).toEqual([
    recadoDeQuemNaoBateu('ABNER SOUSA BORGES', dataDeHoje()),
  ]);
});

test('o segundo toque no mesmo dia só abre a conversa', async () => {
  const primeiro = await chamarQuemNaoBateu('abner');
  const segundo = await chamarQuemNaoBateu('abner');
  expect(segundo).toEqual({ conversaId: primeiro.conversaId, enviada: false });
  expect(recadosDoFabio(primeiro.conversaId)).toHaveLength(1);
});
