/**
 * PREENCHER DIAS VAZIOS PELO TURNO: SÓ RH E TI, NO BANCO
 * (preencher-so-rh-e-ti.sql, 14/10/2026).
 *
 * A tela e o serviço já recusam; aqui é a trava que vale — a política
 * `ponto_batida`, contra quem fala direto com a API.
 */
import { test, expect, beforeAll } from 'bun:test';
import { montarBancoLocal, lerSql, type BancoLocal } from '../../scripts/bancoLocal';
import { preenchePeloTurno } from '../tipos';

let banco: BancoLocal;
const LIDER = '00000000-0000-0000-0000-0000000000b1';
const RH = '00000000-0000-0000-0000-0000000000b2';
const DIRETOR = '00000000-0000-0000-0000-0000000000b3';

beforeAll(async () => {
  banco = await montarBancoLocal();
  await banco.db.exec(lerSql('preencher-so-rh-e-ti.sql'));
  await banco.db.exec(`
    alter table auth.users disable trigger all;
    insert into auth.users (id) values ('${LIDER}'), ('${RH}'), ('${DIRETOR}');
    insert into public.colaboradores (id, auth_user_id, nome, login, setor, loja, nivel, ativo, responsavel_id) values
      ('lider', '${LIDER}', 'Lia', 'lia', 'Balcão', 'Pirassununga', 2, true, null),
      ('rh', '${RH}', 'Dani', 'dani', 'RH', 'Pirassununga', 4, true, null),
      ('diretor', '${DIRETOR}', 'Davi', 'davi', 'Diretoria', 'Pirassununga', 4, true, null),
      ('ana', null, 'Ana', 'ana', 'Balcão', 'Pirassununga', 1, true, 'lider');
  `);
}, 120_000);

/** Grava uma marcação da Ana como a pessoa; devolve null se o banco aceitou */
const gravar = async (uid: string, metodo: string, id: string, tipo = 'entrada'): Promise<string | null> => {
  await banco.como(uid);
  try {
    await banco.db.query(
      `insert into public.registros_ponto (id, colaborador_id, data, tipo, horario, hora_formatada, metodo, loja)
       values ('${id}', 'ana', '2026-09-15', '${tipo}', '2026-09-15T10:30:00Z', '07:30', '${metodo}', 'Pirassununga')`
    );
    return null;
  } catch (e: any) {
    return e.message;
  } finally {
    await banco.como(null);
  }
};

test('o líder da Ana corrige o dia dela, mas não preenche pelo turno', async () => {
  expect(await gravar(LIDER, 'ajuste_lider', 'l1')).toBeNull();
  expect(await gravar(LIDER, 'preenchimento_turno', 'l2')).toContain('row-level security');
});

test('a Diretoria corrige, mas não preenche; o RH preenche', async () => {
  expect(await gravar(DIRETOR, 'ajuste_rh', 'd1', 'saida_almoco')).toBeNull();
  expect(await gravar(DIRETOR, 'preenchimento_turno', 'd2', 'retorno_almoco')).toContain('row-level security');
  expect(await gravar(RH, 'preenchimento_turno', 'r1', 'saida')).toBeNull();
});

test('a regra da tela é a mesma do banco: RH e TI', () => {
  expect(preenchePeloTurno({ setor: 'RH', nivel: 2 })).toBe(true);
  expect(preenchePeloTurno({ setor: 'TI', nivel: 5 })).toBe(true);
  expect(preenchePeloTurno({ setor: 'Diretoria', nivel: 4 })).toBe(false);
  expect(preenchePeloTurno({ setor: 'Gerência', nivel: 3 })).toBe(false);
  expect(preenchePeloTurno({ setor: 'Balcão', nivel: 2 })).toBe(false);
});
