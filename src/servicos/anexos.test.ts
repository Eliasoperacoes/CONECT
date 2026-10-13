/**
 * A ASSINATURA QUE AINDA VALE É REAPROVEITADA (anexos.ts, 13/10/2026).
 *
 * A lista de colaboradores sincroniza a cada mudança em qualquer ficha —
 * a presença de quem abre o app basta — e reassinava as fotos de todos:
 * endereço novo a cada vez, e o navegador baixava a foto de novo. Aqui se
 * mede o que importa: quantas vezes o armazenamento é chamado, e se o
 * endereço devolvido continua o MESMO.
 */
import { test, expect, mock, beforeEach, setSystemTime } from 'bun:test';

class ArmazenamentoFalso {
  private dados = new Map<string, string>();
  getItem(k: string) { return this.dados.has(k) ? this.dados.get(k)! : null; }
  setItem(k: string, v: string) { this.dados.set(k, String(v)); }
  removeItem(k: string) { this.dados.delete(k); }
  clear() { this.dados.clear(); }
}
(globalThis as any).localStorage = new ArmazenamentoFalso();

let assinaturasPedidas: string[][] = [];
let rodada = 0;
mock.module('./supabase', () => ({
  supabase: {
    storage: {
      from: () => ({
        createSignedUrls: async (caminhos: string[]) => {
          assinaturasPedidas.push(caminhos);
          rodada++;
          return { data: caminhos.map((p) => ({ path: p, signedUrl: `https://balde/${p}?token=${rodada}` })), error: null };
        },
        createSignedUrl: async (caminho: string) => {
          assinaturasPedidas.push([caminho]);
          rodada++;
          return { data: { signedUrl: `https://balde/${caminho}?token=${rodada}` }, error: null };
        },
      }),
    },
  },
}));

const { resolverCaminhos, resolverCaminho, esquecerAssinaturas } = await import('./anexos');

const INICIO = new Date('2026-10-13T12:00:00Z');
beforeEach(() => {
  (globalThis as any).localStorage.clear();
  assinaturasPedidas = [];
  setSystemTime(INICIO);
});

const FOTOS = ['perfil/elias/1.jpg', 'perfil/ana/2.jpg'];

test('A SEGUNDA SINCRONIZAÇÃO não vai à rede, e o endereço da foto é o MESMO', async () => {
  const primeira = await resolverCaminhos(FOTOS);
  setSystemTime(new Date(INICIO.getTime() + 5 * 60_000)); // a presença de alguém mudou 5 min depois
  const segunda = await resolverCaminhos(FOTOS);
  expect(assinaturasPedidas).toEqual([FOTOS]);
  expect([...segunda]).toEqual([...primeira]);
});

test('foto TROCADA (caminho novo) é assinada na hora; a que não mudou fica como estava', async () => {
  const antes = await resolverCaminhos(FOTOS);
  const depois = await resolverCaminhos(['perfil/elias/3.jpg', 'perfil/ana/2.jpg']);
  expect(assinaturasPedidas).toEqual([FOTOS, ['perfil/elias/3.jpg']]);
  expect(depois.get('perfil/ana/2.jpg')).toBe(antes.get('perfil/ana/2.jpg'));
  expect(depois.get('perfil/elias/3.jpg')).toBeTruthy();
});

test('perto de vencer (menos de 1 h das 8 h), assina de novo — a foto nunca quebra', async () => {
  const antes = await resolverCaminhos(FOTOS);
  setSystemTime(new Date(INICIO.getTime() + 7.5 * 3600_000));
  const depois = await resolverCaminhos(FOTOS);
  expect(assinaturasPedidas).toHaveLength(2);
  expect(depois.get(FOTOS[0])).not.toBe(antes.get(FOTOS[0]));
});

test('a assinatura avulsa (um anexo) também é reaproveitada', async () => {
  const a = await resolverCaminho('conversa/x/foto.jpg');
  const b = await resolverCaminho('conversa/x/foto.jpg');
  expect(a).toBe(b);
  expect(assinaturasPedidas).toHaveLength(1);
});

test('AO SAIR, as assinaturas somem do aparelho: quem entrar depois assina as dele', async () => {
  await resolverCaminhos(FOTOS);
  esquecerAssinaturas();
  await resolverCaminhos(FOTOS);
  expect(assinaturasPedidas).toHaveLength(2);
});

test('o Sair do sistema chama o esquecimento', async () => {
  const nuvem = await Bun.file(new URL('./nuvem.ts', import.meta.url)).text();
  const sair = nuvem.slice(nuvem.indexOf('async sair(): Promise<void> {'), nuvem.indexOf('async temSessao()'));
  expect(sair).toContain('esquecerAssinaturas();');
});
