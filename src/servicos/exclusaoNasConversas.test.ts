/**
 * EXCLUIR NAS CONVERSAS, NO BANCO DE VERDADE (exclusao-nas-conversas.sql,
 * 14/10/2026). Auditoria pedida pelo Elias: "essas funções devem estar
 * 100% funcionais".
 *
 * Cada pessoa tenta cada exclusão — a própria mensagem, a dos outros, o
 * próprio arquivo, o dos outros, o grupo inteiro — e o banco tem de fazer
 * exatamente o que a tela promete.
 */
import { test, expect, beforeAll } from 'bun:test';
import { readFileSync } from 'node:fs';
import { montarBancoLocal, lerSql, type BancoLocal } from '../../scripts/bancoLocal';

let banco: BancoLocal;
const ANA = '00000000-0000-0000-0000-0000000000c1';
const BIA = '00000000-0000-0000-0000-0000000000c2';
const TI = '00000000-0000-0000-0000-0000000000c3';

beforeAll(async () => {
  banco = await montarBancoLocal();
  await banco.db.exec(lerSql('exclusao-nas-conversas.sql'));
  await banco.db.exec(`
    alter table auth.users disable trigger all;
    insert into auth.users (id) values ('${ANA}'), ('${BIA}'), ('${TI}');
    insert into public.colaboradores (id, auth_user_id, nome, login, setor, loja, nivel, ativo) values
      ('ana', '${ANA}', 'Ana', 'ana', 'Balcão', 'Pirassununga', 1, true),
      ('bia', '${BIA}', 'Bia', 'bia', 'Balcão', 'Pirassununga', 1, true),
      ('ti', '${TI}', 'Elias', 'elias', 'TI', 'Pirassununga', 5, true);
    insert into public.conversas (id, tipo, nome, eh_sistema_padrao) values
      ('g1', 'grupo', 'Balcão sábado', false),
      ('oficial', 'grupo', 'Avisos da Rede', true);
    insert into public.participantes (conversa_id, colaborador_id) values
      ('g1', 'ana'), ('g1', 'bia'), ('oficial', 'ana');
    insert into public.mensagens (id, conversa_id, remetente_id, tipo, texto, anexo_caminho) values
      ('m1', 'g1', 'ana', 'imagem', null, 'g1/m1.jpg'),
      ('m2', 'g1', 'bia', 'arquivo', null, 'g1/m2.pdf'),
      ('m3', 'g1', 'bia', 'texto', 'bom dia', null);
    insert into storage.objects (bucket_id, name, owner_id) values
      ('anexos', 'g1/m1.jpg', '${ANA}'),
      ('anexos', 'g1/m2.pdf', '${BIA}'),
      ('anexos', 'holerites/ana/2026-09.pdf', '${ANA}');
  `);
}, 120_000);

/** Roda como a pessoa; devolve quantas linhas o comando afetou, ou o erro */
const como = async (uid: string, sql: string): Promise<{ linhas: number; erro?: string; dados?: any[] }> => {
  await banco.como(uid);
  try {
    const r = await banco.db.query<any>(sql);
    return { linhas: r.affectedRows ?? r.rows.length, dados: r.rows };
  } catch (e: any) {
    return { linhas: 0, erro: e.message };
  } finally {
    await banco.como(null);
  }
};

test('mensagem: a Bia não apaga a da Ana — e o banco não dá erro, apaga zero linhas', async () => {
  // É por isso que o aplicativo confere com `.select()` quantas saíram
  expect((await como(BIA, `delete from public.mensagens where id = 'm1' returning id`)).linhas).toBe(0);
  expect((await como(ANA, `delete from public.mensagens where id = 'm1' returning id`)).linhas).toBe(1);
});

test('arquivo: quem enviou apaga o próprio; o do colega e o holerite, não', async () => {
  expect((await como(BIA, `delete from storage.objects where name = 'g1/m1.jpg' returning name`)).linhas).toBe(0);
  expect((await como(ANA, `delete from storage.objects where name = 'g1/m1.jpg' returning name`)).linhas).toBe(1);
  // Holerite é do RH, mesmo sendo dela
  expect((await como(ANA, `delete from storage.objects where name = 'holerites/ana/2026-09.pdf' returning name`)).linhas).toBe(0);
});

test('grupo para todos: só o TI, nunca o canal oficial, e devolve os arquivos que ficaram', async () => {
  expect((await como(ANA, `select public.excluir_conversa('g1')`)).erro).toContain('Excluir canal ou grupo é do TI.');
  expect((await como(TI, `select public.excluir_conversa('oficial')`)).erro).toContain('Canal oficial da rede não se exclui.');

  const r = await como(TI, `select public.excluir_conversa('g1') as caminhos`);
  expect(r.erro).toBeUndefined();
  // Só o arquivo que restava (o m1 a Ana já apagou) — e nenhuma mensagem
  expect(r.dados![0].caminhos).toEqual(['g1/m2.pdf']);

  const sobrou = (await banco.db.query<{ c: number; m: number; p: number }>(`
    select (select count(*)::int from public.conversas where id = 'g1') as c,
           (select count(*)::int from public.mensagens where conversa_id = 'g1') as m,
           (select count(*)::int from public.participantes where conversa_id = 'g1') as p`)).rows[0];
  expect(sobrou).toEqual({ c: 0, m: 0, p: 0 });
});

test('o TI apaga do armazenamento os arquivos que a exclusão devolveu', async () => {
  expect((await como(TI, `delete from storage.objects where name = 'g1/m2.pdf' returning name`)).linhas).toBe(1);
});

test('o aplicativo confere a exclusão e leva o arquivo junto', () => {
  const nuvem = readFileSync('src/servicos/nuvemComunicacao.ts', 'utf8');
  expect(nuvem).toContain("await supabase.from('mensagens').delete().eq('id', id).select('id');");
  expect(nuvem).not.toContain("from('conversas').delete()");
  const banco = readFileSync('src/servicos/bancoDados.ts', 'utf8');
  // Apagar deixa o lugar (mensagem-apagada.sql); o caminho do anexo volta da função do banco
  expect(banco).toContain('const caminho = res.caminho || alvo.anexoCaminho;');
  expect(banco).toContain('if (caminho) await apagarAnexos([caminho]);');
  expect(banco).toContain('arquivos = await apagarAnexos(res.caminhos || []);');
});
