/**
 * A PONTE DA MARCAÇÃO ORIGINAL NO APARELHO (marcacao-original.sql).
 *
 * O que o `nuvem.ts` faz com a resposta da `registrar_marcacao` e com a
 * exclusão recusada de quem já bateu ponto. O banco em si é provado no
 * Postgres local (marcacaoOriginal.test.ts); aqui, a tradução.
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
(globalThis as any).localStorage = new ArmazenamentoFalso();

let respostaRpc: { data: unknown; error: unknown } = { data: null, error: null };
let rpcPedido: { nome: string; args: any } | null = null;
let erroDoDelete: unknown = null;

mock.module('./supabase', () => ({
  supabase: {
    rpc: async (nome: string, args: any) => {
      rpcPedido = { nome, args };
      return respostaRpc;
    },
    from: () => ({
      delete: () => ({ eq: async () => ({ error: erroDoDelete }) }),
    }),
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

/** A original como o banco a devolve: 12:00 UTC = 09:00 em Brasília. */
const ORIGINAL = {
  nsr: '793', colaborador_id: 'ana', registrado_em: '2026-10-11T12:00:00+00:00', data: '2026-10-11',
  loja: 'Pirassununga', metodo: 'qrcode', cnpj_empregador: '11222333000144', codigo_verificacao: 'ab12',
  registro_id: null, tipo_pedido: 'entrada', fora_da_jornada: 'domingo',
};

beforeEach(() => {
  respostaRpc = { data: null, error: null };
  rpcPedido = null;
  erroDoDelete = null;
});

test('chama a registrar_marcacao com o que o aparelho leu — e o tipo pode ir vazio', async () => {
  respostaRpc = { data: { registro: null, original: ORIGINAL, fora_da_jornada: 'jornada_completa' }, error: null };
  await nuvem.registrarMarcacao({ codigo: 'ABC123', loja: 'Pirassununga', tipo: null });
  expect(rpcPedido).toEqual({ nome: 'registrar_marcacao', args: { p_codigo: 'ABC123', p_loja: 'Pirassununga', p_tipo: null } });
});

test('FORA DA JORNADA: volta o comprovante da original, com a hora de Brasília', async () => {
  respostaRpc = { data: { registro: null, original: ORIGINAL, fora_da_jornada: 'domingo' }, error: null };
  const r = await nuvem.registrarMarcacao({ codigo: 'ABC123', loja: 'Pirassununga', tipo: 'entrada' });
  expect(r.sucesso).toBe(true);
  expect(r.registro).toBeUndefined();
  expect(r.foraDaJornada).toBe('domingo');
  expect(r.comprovante).toMatchObject({
    nsr: 793,
    horaFormatada: '09:00',
    registradoEm: ORIGINAL.registrado_em,
    codigoVerificacao: 'ab12',
    cnpjEmpregador: '11222333000144',
    foraDaJornada: 'domingo',
    metodo: 'qrcode',
  });
  // O comprovante sabe que é de uma marcação de verdade
  const { temComprovante } = await import('./comprovanteDeBatida');
  expect(temComprovante(r.comprovante!)).toBe(true);
});

test('NA JORNADA: volta a linha do tratamento, como a bater_ponto', async () => {
  respostaRpc = {
    data: {
      registro: {
        id: 'ponto-1', colaborador_id: 'ana', data: '2026-10-07', tipo: 'entrada', horario: '2026-10-07T10:31:00Z',
        hora_formatada: '07:31', metodo: 'qrcode', loja: 'Pirassununga', ajustado_por_id: null, ajustado_por_nome: null,
        justificativa: null, criado_em: '2026-10-07T10:31:00Z', nsr: '793', registrado_em: '2026-10-07T10:31:00Z',
        cnpj_empregador: '11222333000144', codigo_verificacao: 'ab12',
      },
      original: { ...ORIGINAL, registro_id: 'ponto-1', fora_da_jornada: null },
      fora_da_jornada: null,
    },
    error: null,
  };
  const r = await nuvem.registrarMarcacao({ codigo: 'ABC123', loja: 'Pirassununga', tipo: 'entrada' });
  expect(r.sucesso).toBe(true);
  expect(r.comprovante).toBeUndefined();
  expect(r.registro).toMatchObject({ id: 'ponto-1', tipo: 'entrada', nsr: 793 });
});

test('banco sem a função (SQL não rodado): semFuncao, e quem chama volta à bater_ponto', async () => {
  respostaRpc = { data: null, error: { code: 'PGRST202', message: 'Could not find the function' } };
  expect(await nuvem.registrarMarcacao({ codigo: 'X', loja: null, tipo: 'entrada' })).toEqual({ sucesso: false, semFuncao: true });
});

test('a recusa escrita pelo banco (código da loja errado) vai como está', async () => {
  respostaRpc = { data: null, error: { code: 'P0001', message: 'Código não reconhecido. Use o QR afixado na sua loja.' } };
  const r = await nuvem.registrarMarcacao({ codigo: 'X', loja: null, tipo: 'entrada' });
  expect(r).toEqual({ sucesso: false, erro: 'Código não reconhecido. Use o QR afixado na sua loja.' });
});

test('EXCLUIR QUEM JÁ BATEU PONTO: a orientação de desativar, e não o erro de chave', async () => {
  erroDoDelete = {
    code: '23503',
    message: 'update or delete on table "colaboradores" violates foreign key constraint "marcacoes_originais_colaborador_id_fkey" on table "marcacoes_originais"',
  };
  const r = await nuvem.removerColaborador('ana');
  expect(r.sucesso).toBe(false);
  expect(r.temPonto).toBe(true);
  expect(r.erro).toContain('Desative o cadastro');

  // Outra chave estrangeira continua com a mensagem do banco
  erroDoDelete = { code: '23503', message: 'violates foreign key constraint "outra_fkey" on table "outra"' };
  const outra = await nuvem.removerColaborador('ana');
  expect(outra.temPonto).toBeUndefined();
  expect(outra.erro).toContain('outra_fkey');
});
