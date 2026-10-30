/**
 * OS CADASTROS SÓ QUANDO ALGUMA FICHA MUDOU (nuvem.sincronizarColaboradores, 30/10/2026).
 *
 * A carga dos cadastros roda a cada abertura do aplicativo e a cada volta
 * depois de o celular derrubar a conexão — 34 vezes por pessoa por dia,
 * medido em 30/10 — e trazia a rede inteira com as fichas reservadas. O
 * banco já conta as mudanças nas fichas (`colaboradores_versao`): contador
 * igual, nada desce.
 */
import { test, expect, mock, beforeEach, setSystemTime, afterEach } from 'bun:test';

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

let versao: number | null = 7;
let fichas: any[] = [];
/** O que foi pedido ao banco, na ordem */
let pedidos: string[] = [];

const ficha = (id: string, nome: string) => ({
  id, nome, cargo: 'Vendedor', setor: 'Vendas', loja: 'Pirassununga', nivel: 1, foto: null,
  presenca: 'disponivel', visto_por_ultimo: 'Agora', ramal: null, responsavel_id: null, ativo: true,
  criado_em: '2026-10-01T00:00:00.000Z', ponto_desde: null,
});

const resposta = (data: any) => ({ data, error: null });

mock.module('./supabase', () => ({
  supabase: {
    from: (tabela: string) => {
      const q: any = {
        select: () => q,
        order: () => q,
        limit: () => {
          pedidos.push(tabela);
          return Promise.resolve(
            versao === null ? { data: null, error: { message: 'sem a tabela' } } : resposta([{ versao }])
          );
        },
        then: (f: any) => {
          pedidos.push(tabela);
          return Promise.resolve(resposta(fichas)).then(f);
        },
      };
      return q;
    },
    rpc: async (nome: string) => {
      pedidos.push(nome);
      return resposta(fichas.map((f) => ({ id: f.id, login: f.nome.toLowerCase() })));
    },
  },
  usandoNuvem: () => true,
  temSessaoViva: () => true,
  loginParaEmailInterno: (login: string) => `${login}@conecta.local`,
  normalizarLogin: (login: string) => login.trim().toLowerCase(),
}));
mock.module('./nuvemComunicacao', () => ({
  nuvemComunicacao: {
    sincronizarConversas: async () => true,
    sincronizarAvisos: async () => true,
    sincronizarConfiguracoes: async () => true,
    sincronizarAuditoria: async () => true,
    assinarAtualizacoes: () => () => {},
  },
}));

const { nuvem } = await import('./nuvem');

const AGORA = Date.parse('2026-10-30T13:00:00.000Z');
const cadastros = () => JSON.parse(armazenamento.getItem('conecta_v4_colaboradores') || '[]').map((c: any) => c.nome);
/** A lista inteira desceu: o diretório e as fichas reservadas */
const BAIXOU_TUDO = ['colaboradores_versao', 'colaboradores', 'fichas_reservadas'];

beforeEach(() => {
  armazenamento.clear();
  armazenamento.setItem('conecta_v4_colaborador_atual', 'ana');
  versao = 7;
  fichas = [ficha('ana', 'Ana'), ficha('bia', 'Bia')];
  pedidos = [];
  setSystemTime(new Date(AGORA));
});
afterEach(() => setSystemTime());

test('a primeira carga baixa a rede inteira', async () => {
  expect(await nuvem.sincronizarColaboradores()).toBe(true);
  expect(pedidos.sort()).toEqual([...BAIXOU_TUDO].sort());
  expect(cadastros()).toEqual(['Ana', 'Bia']);
});

test('CONTADOR IGUAL, NADA DESCE: a segunda carga só pergunta o número', async () => {
  await nuvem.sincronizarColaboradores();
  pedidos = [];
  expect(await nuvem.sincronizarColaboradores()).toBe(true);
  expect(pedidos).toEqual(['colaboradores_versao']);
  expect(cadastros()).toEqual(['Ana', 'Bia']);
});

test('alguma ficha mudou (contador subiu): baixa de novo', async () => {
  await nuvem.sincronizarColaboradores();
  versao = 8;
  fichas.push(ficha('cris', 'Cris'));
  pedidos = [];
  await nuvem.sincronizarColaboradores();
  expect(pedidos.sort()).toEqual([...BAIXOU_TUDO].sort());
  expect(cadastros()).toEqual(['Ana', 'Bia', 'Cris']);
});

test('OUTRA PESSOA NO MESMO CELULAR baixa tudo — as fichas reservadas são por quem vê', async () => {
  await nuvem.sincronizarColaboradores();
  armazenamento.setItem('conecta_v4_colaborador_atual', 'bia');
  pedidos = [];
  await nuvem.sincronizarColaboradores();
  expect(pedidos.sort()).toEqual([...BAIXOU_TUDO].sort());
});

test('passadas seis horas baixa tudo: a assinatura das fotos vence em oito', async () => {
  await nuvem.sincronizarColaboradores();
  setSystemTime(new Date(AGORA + 5 * 3600_000));
  pedidos = [];
  await nuvem.sincronizarColaboradores();
  expect(pedidos).toEqual(['colaboradores_versao']);
  setSystemTime(new Date(AGORA + 6 * 3600_000 + 1));
  pedidos = [];
  await nuvem.sincronizarColaboradores();
  expect(pedidos.sort()).toEqual([...BAIXOU_TUDO].sort());
});

test('sem conseguir ler o contador, baixa tudo — sempre', async () => {
  versao = null;
  await nuvem.sincronizarColaboradores();
  pedidos = [];
  await nuvem.sincronizarColaboradores();
  expect(pedidos.sort()).toEqual([...BAIXOU_TUDO].sort());
});

test('a lista sumiu do aparelho: baixa tudo, mesmo com o contador igual', async () => {
  await nuvem.sincronizarColaboradores();
  armazenamento.removeItem('conecta_v4_colaboradores');
  pedidos = [];
  await nuvem.sincronizarColaboradores();
  expect(cadastros()).toEqual(['Ana', 'Bia']);
});
