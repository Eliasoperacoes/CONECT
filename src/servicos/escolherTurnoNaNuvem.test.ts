/**
 * A ESCOLHA DO TURNO QUE O BANCO DESFEZ NÃO VIRA "SALVO".
 *
 * O gatilho `turno_escolhido_uma_vez` não recusa: devolve o valor antigo
 * e o update "passa". Update calado já custou caro aqui (RLS sem policy de
 * UPDATE afetava 0 linhas e respondia sucesso). Então o que vale é o que
 * o banco devolve, e não o que foi pedido.
 */
import { test, expect, mock, beforeEach } from 'bun:test';

/** A linha que o banco devolve depois do update. */
let linhaDevolvida: any = null;
let erroDoBanco: any = null;
const pedidos: any[] = [];

const clienteFalso = {
  from: (tabela: string) => ({
    update: (valores: any) => ({
      eq: (coluna: string, valor: string) => ({
        select: () => ({
          maybeSingle: async () => {
            pedidos.push({ tabela, valores, coluna, valor });
            return { data: linhaDevolvida, error: erroDoBanco };
          },
        }),
      }),
    }),
  }),
};

mock.module('./supabase', () => ({
  supabase: clienteFalso,
  usandoNuvem: () => true,
  temSessaoViva: () => true,
  loginParaEmailInterno: (l: string) => `${l}@interno`,
  normalizarLogin: (l: string) => l,
}));

const { nuvem } = await import('./nuvem');

beforeEach(() => {
  linhaDevolvida = null;
  erroDoBanco = null;
  pedidos.length = 0;
});

test('pede o turno junto com a confirmação, na linha da pessoa', async () => {
  linhaDevolvida = { turno: 'B', turno_confirmado_em: '2026-09-30T11:00:00+00:00' };

  const res = await nuvem.escolherMeuTurno('maria', 'B');

  expect(res).toEqual({ sucesso: true, confirmadoEm: '2026-09-30T11:00:00+00:00' });
  expect(pedidos).toHaveLength(1);
  expect(pedidos[0].tabela).toBe('colaboradores');
  expect(pedidos[0].coluna).toBe('id');
  expect(pedidos[0].valor).toBe('maria');
  expect(pedidos[0].valores.turno).toBe('B');
  expect(pedidos[0].valores.turno_confirmado_em).toBeTruthy();
});

test('o gatilho devolveu o turno antigo: é falha, não sucesso', async () => {
  // Já confirmado antes — o banco manteve o A e a data de antes
  linhaDevolvida = { turno: 'A', turno_confirmado_em: '2026-09-29T11:00:00+00:00' };

  const res = await nuvem.escolherMeuTurno('maria', 'B');

  expect(res.sucesso).toBe(false);
  expect(res.erro).toContain('RH');
});

test('nenhuma linha voltou (a segurança escondeu): é falha', async () => {
  linhaDevolvida = null;
  expect((await nuvem.escolherMeuTurno('maria', 'B')).sucesso).toBe(false);
});

test('turno igual mas sem confirmação gravada: é falha', async () => {
  // Ninguém tinha confirmado e o gatilho não aceitou: tudo ficou como era
  linhaDevolvida = { turno: 'A', turno_confirmado_em: null };
  expect((await nuvem.escolherMeuTurno('maria', 'A')).sucesso).toBe(false);
});
