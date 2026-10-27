/**
 * "ESTA MENSAGEM FOI APAGADA", NO BANCO DE VERDADE (mensagem-apagada.sql,
 * 21/10/2026). Apagar tirava a linha, e a mensagem sumia da conversa dos
 * outros sem rastro. Agora a linha fica e o conteúdo sai — e quem limpa o
 * conteúdo é o banco, não o aparelho.
 */
import { test, expect, beforeAll } from 'bun:test';
import { montarBancoLocal, lerSql, type BancoLocal } from '../../scripts/bancoLocal';
import { montarPreviaDaMensagem } from './nuvemComunicacao';

let banco: BancoLocal;
const ANA = '00000000-0000-0000-0000-0000000000c1';
const BIA = '00000000-0000-0000-0000-0000000000c2';
const TI = '00000000-0000-0000-0000-0000000000c3';

beforeAll(async () => {
  banco = await montarBancoLocal();
  await banco.db.exec(lerSql('mensagem-apagada.sql'));
  await banco.db.exec(`
    alter table auth.users disable trigger all;
    insert into auth.users (id) values ('${ANA}'), ('${BIA}'), ('${TI}');
    insert into public.colaboradores (id, auth_user_id, nome, login, setor, loja, nivel, ativo) values
      ('ana', '${ANA}', 'Ana', 'ana', 'Balcão', 'Pirassununga', 1, true),
      ('bia', '${BIA}', 'Bia', 'bia', 'Balcão', 'Pirassununga', 1, true),
      ('ti', '${TI}', 'Elias', 'elias', 'TI', 'Pirassununga', 5, true);
    insert into public.conversas (id, tipo, nome) values ('g1', 'grupo', 'Balcão sábado');
    insert into public.participantes (conversa_id, colaborador_id) values ('g1', 'ana'), ('g1', 'bia');
    insert into public.mensagens (id, conversa_id, remetente_id, tipo, texto, legenda, anexo_caminho, reacoes) values
      ('m1', 'g1', 'ana', 'imagem', null, 'a peça chegou', 'g1/m1.jpg', '{"👍": ["bia"]}'),
      ('m2', 'g1', 'bia', 'texto', 'bom dia', null, null, '{}'),
      ('m3', 'g1', 'bia', 'texto', 'até amanhã', null, null, '{}');
  `);
}, 120_000);

const como = async (uid: string, sql: string): Promise<{ erro?: string; dados?: any[] }> => {
  await banco.como(uid);
  try {
    return { dados: (await banco.db.query<any>(sql)).rows };
  } catch (e: any) {
    return { erro: e.message };
  } finally {
    await banco.como(null);
  }
};

const linha = async (id: string) =>
  (await banco.db.query<any>(`select * from public.mensagens where id = '${id}'`)).rows[0];

test('o autor apaga: a linha fica, o conteúdo sai, e volta o caminho do anexo', async () => {
  const r = await como(ANA, `select public.apagar_mensagem('m1') as caminho`);
  expect(r.erro).toBeUndefined();
  expect(r.dados![0].caminho).toBe('g1/m1.jpg');
  const m = await linha('m1');
  expect(m.apagada_em).not.toBeNull();
  expect([m.texto, m.legenda, m.anexo_caminho, m.reacoes]).toEqual([null, null, null, {}]);
});

test('a Bia não apaga a da Ana — nem pela função, nem marcando direto', async () => {
  expect((await como(BIA, `select public.apagar_mensagem('m1')`)).erro).toContain('autor');
  await banco.db.exec(`insert into public.mensagens (id, conversa_id, remetente_id, tipo, texto) values ('m4', 'g1', 'ana', 'texto', 'oi')`);
  expect((await como(BIA, `update public.mensagens set apagada_em = now() where id = 'm4'`)).erro).toContain('autor');
  expect((await linha('m4')).texto).toBe('oi');
});

test('o TI apaga a de qualquer um, mesmo fora da conversa', async () => {
  expect((await como(TI, `select public.apagar_mensagem('m2')`)).erro).toBeUndefined();
  expect((await linha('m2')).texto).toBeNull();
});

test('a apagada não volta e não ganha reação', async () => {
  await como(ANA, `update public.mensagens set apagada_em = null, texto = 'voltei' where id = 'm1'`);
  await como(BIA, `update public.mensagens set reacoes = '{"😂": ["bia"]}' where id = 'm1'`);
  const m = await linha('m1');
  expect(m.apagada_em).not.toBeNull();
  expect([m.texto, m.reacoes]).toEqual([null, {}]);
});

test('a regra de antes continua: só o autor reescreve, qualquer um da conversa reage', async () => {
  expect((await como(ANA, `update public.mensagens set texto = 'forjado' where id = 'm3'`)).erro).toContain('autor');
  await como(ANA, `update public.mensagens set reacoes = '{"👍": ["ana"]}' where id = 'm3'`);
  expect((await linha('m3')).reacoes).toEqual({ '👍': ['ana'] });
});

test('a prévia da lista diz que foi apagada', () => {
  const base = { id: 'x', conversaId: 'g1', remetenteId: 'ana', criadoEm: '', horaFormatada: '', lida: false };
  expect(montarPreviaDaMensagem({ ...base, tipo: 'imagem', apagadaEm: '2026-10-21T12:00:00Z' })).toBe('🚫 Mensagem apagada');
});
