/**
 * OS GRUPOS DE TODOS, NUM POSTGRES DE VERDADE (PGlite).
 *
 * `supabase/grupos-de-todos.sql` muda quem entra em conversa, quem lê e
 * quem escreve. Lê-lo não basta: aqui ele roda por cima das regras que o
 * banco tinha antes (copiadas do esquema, o essencial destas tabelas), e
 * cada pessoa tenta cada coisa — criar, adicionar, sair, se promover,
 * entrar escondido num grupo alheio.
 *
 * A porta que este SQL fecha: a regra de `participantes` deixava qualquer
 * pessoa logada se inscrever em qualquer conversa, e quem participa lê
 * tudo. Com a regra antiga, "quem não está no grupo não lê" falha.
 */
import { test, expect } from 'bun:test';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'fs';

const SQL_NOVO = readFileSync('supabase/grupos-de-todos.sql', 'utf8');
const db = new PGlite();

// ---------- O banco como está hoje (o essencial destas tabelas) ----------
await db.exec(`
create schema auth;
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('teste.uid', true), '')::uuid
$$;
create role authenticated; create role anon;

create table public.colaboradores (id text primary key, nome text not null, nivel smallint not null default 1,
  setor text not null default 'Balcão', ativo boolean not null default true, auth_user_id uuid unique);
create table public.conversas (
  id text primary key, tipo text not null check (tipo in ('individual', 'grupo')), nome text not null,
  foto text, descricao text, criado_por_id text references public.colaboradores(id) on delete set null,
  apenas_gestores_publicam boolean not null default false, eh_sistema_padrao boolean not null default false,
  atualizado_em timestamptz not null default now(), criado_em timestamptz not null default now());
create table public.participantes (
  conversa_id text not null references public.conversas(id) on delete cascade,
  colaborador_id text not null references public.colaboradores(id) on delete cascade,
  entrou_em timestamptz not null default now(), fixada boolean default false, oculta_desde timestamptz,
  removida boolean not null default false, primary key (conversa_id, colaborador_id));
create table public.mensagens (
  id text primary key, conversa_id text not null references public.conversas(id) on delete cascade,
  remetente_id text not null references public.colaboradores(id) on delete cascade,
  tipo text not null check (tipo in ('texto', 'recado_voz', 'arquivo', 'imagem')), texto text,
  criado_em timestamptz not null default now());

create function public.meu_colaborador_id() returns text language sql stable security definer set search_path = public as $$
  select id from public.colaboradores where auth_user_id = auth.uid() limit 1; $$;
create function public.meu_nivel() returns smallint language sql stable security definer set search_path = public as $$
  select coalesce((select nivel from public.colaboradores where auth_user_id = auth.uid() limit 1), 0); $$;
create function public.sou_admin() returns boolean language sql stable security definer set search_path = public as $$
  select public.meu_nivel() >= 5; $$;
create function public.participo_da_conversa(alvo text) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.participantes where conversa_id = alvo and colaborador_id = public.meu_colaborador_id()); $$;

alter table public.conversas enable row level security;
alter table public.participantes enable row level security;
alter table public.mensagens enable row level security;
create policy conversas_leitura on public.conversas for select to authenticated using (public.participo_da_conversa(id));
create policy conversas_insercao on public.conversas for insert to authenticated with check (auth.uid() is not null);
create policy conversas_edicao on public.conversas for update to authenticated using (public.participo_da_conversa(id) or public.sou_admin());
create policy participantes_leitura on public.participantes for select to authenticated
  using (colaborador_id = public.meu_colaborador_id() or public.participo_da_conversa(conversa_id));
create policy participantes_insercao on public.participantes for insert to authenticated with check (auth.uid() is not null);
create policy participantes_remocao on public.participantes for delete to authenticated
  using (colaborador_id = public.meu_colaborador_id() or public.sou_admin());
create policy participantes_atualizacao on public.participantes for update to authenticated
  using (colaborador_id = public.meu_colaborador_id()) with check (colaborador_id = public.meu_colaborador_id());
create policy mensagens_leitura on public.mensagens for select to authenticated using (public.participo_da_conversa(conversa_id));
create policy mensagens_insercao on public.mensagens for insert to authenticated
  with check (remetente_id = public.meu_colaborador_id() and public.participo_da_conversa(conversa_id));
create policy mensagens_edicao on public.mensagens for update to authenticated using (public.participo_da_conversa(conversa_id));
grant usage on schema public, auth to authenticated, anon;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant execute on function auth.uid() to authenticated;

insert into public.colaboradores (id, nome, nivel, auth_user_id, ativo) values
  ('ana', 'Ana', 1, '00000000-0000-0000-0000-00000000000a', true),
  ('bia', 'Bia', 1, '00000000-0000-0000-0000-00000000000b', true),
  ('caio', 'Caio', 1, '00000000-0000-0000-0000-00000000000c', true),
  ('davi', 'Davi', 1, '00000000-0000-0000-0000-00000000000d', true),
  ('zeca', 'Zeca', 1, '00000000-0000-0000-0000-00000000000e', false),
  ('ti', 'Elias', 5, '00000000-0000-0000-0000-0000000000ff', true);
-- Um grupo antigo, criado pelo TI, e um canal oficial
insert into public.conversas (id, tipo, nome, criado_por_id) values ('grupo-antigo', 'grupo', 'Compras', 'ti');
insert into public.participantes (conversa_id, colaborador_id) values ('grupo-antigo', 'ti'), ('grupo-antigo', 'ana');
insert into public.conversas (id, tipo, nome, eh_sistema_padrao) values ('canal-loja', 'grupo', 'Pirassununga', true);
`);

// ---------- O SQL novo ----------
await db.exec(SQL_NOVO.replace(/notify pgrst, 'reload schema';/g, ''));

const UID: Record<string, string> = {
  ana: '00000000-0000-0000-0000-00000000000a', bia: '00000000-0000-0000-0000-00000000000b',
  caio: '00000000-0000-0000-0000-00000000000c', davi: '00000000-0000-0000-0000-00000000000d',
  ti: '00000000-0000-0000-0000-0000000000ff',
};
const como = async <T>(quem: string, sql: string, params: unknown[] = []): Promise<{ linhas?: T[]; erro?: string }> => {
  try {
    const r = await db.transaction(async (tx) => {
      await tx.query(`select set_config('teste.uid', $1, true)`, [UID[quem]]);
      await tx.exec('set local role authenticated');
      return tx.query<T>(sql, params);
    });
    return { linhas: r.rows };
  } catch (e) {
    return { erro: (e as Error).message };
  }
};
const resultados: Array<{ nome: string; ok: boolean; detalhe: string }> = [];
const confere = (nome: string, ok: boolean, detalhe = '') => resultados.push({ nome, ok, detalhe });
const comoSuper = (sql: string, p: unknown[] = []) => db.query<any>(sql, p).then((r) => r.rows);

// O grupo antigo ganhou administrador: quem o criou
confere('grupo antigo: quem criou virou admin',
  (await comoSuper(`select papel from participantes where conversa_id='grupo-antigo' and colaborador_id='ti'`))[0]?.papel === 'admin');

// 1. Ana (nível 1) cria um grupo com Bia, Caio e o Zeca (inativo)
const criado = await como<{ criar_grupo: string }>('ana', `select public.criar_grupo('Balcão sábado', '', array['bia','caio','zeca'])`);
const g = criado.linhas?.[0]?.criar_grupo || '';
confere('nível 1 cria grupo', !!g, criado.erro);
const membros = await comoSuper(`select colaborador_id, papel from participantes where conversa_id=$1 order by 1`, [g]);
confere('quem cria é admin; inativo não entra', JSON.stringify(membros) === JSON.stringify([
  { colaborador_id: 'ana', papel: 'admin' }, { colaborador_id: 'bia', papel: 'membro' }, { colaborador_id: 'caio', papel: 'membro' }]), JSON.stringify(membros));

// 2. Bia (membro) tenta adicionar o Davi: pela função e direto na tabela
const biaAdiciona = await como('bia', `select public.adicionar_ao_grupo($1, array['davi'])`, [g]);
confere('membro não adiciona pela função', !!biaAdiciona.erro, 'passou');
const biaDireto = await como('bia', `insert into participantes (conversa_id, colaborador_id) values ($1, 'davi')`, [g]);
confere('membro não adiciona direto na tabela', !!biaDireto.erro, 'passou');

// 3. A PORTA QUE FECHOU: o Davi se inscreve sozinho no grupo alheio
const daviEntra = await como('davi', `insert into participantes (conversa_id, colaborador_id) values ($1, 'davi')`, [g]);
confere('ninguém entra sozinho em grupo alheio', !!daviEntra.erro, 'passou');
const daviLe = await como<any>('davi', `select * from mensagens where conversa_id = $1`, [g]);
confere('quem não está no grupo não lê', (daviLe.linhas || []).length === 0, JSON.stringify(daviLe));

// 4. Ana adiciona o Davi
const anaAdiciona = await como<any>('ana', `select public.adicionar_ao_grupo($1, array['davi'])`, [g]);
confere('admin adiciona', !anaAdiciona.erro, anaAdiciona.erro);

// 5. Bia tenta virar admin mudando a própria linha
await como('bia', `update participantes set papel='admin' where conversa_id=$1 and colaborador_id='bia'`, [g]);
confere('ninguém se promove pela própria linha',
  (await comoSuper(`select papel from participantes where conversa_id=$1 and colaborador_id='bia'`, [g]))[0].papel === 'membro');
// ...mas mexe nas preferências dela
await como('bia', `update participantes set fixada=true where conversa_id=$1 and colaborador_id='bia'`, [g]);
confere('a pessoa ainda fixa o grupo dela',
  (await comoSuper(`select fixada from participantes where conversa_id=$1 and colaborador_id='bia'`, [g]))[0].fixada === true);

// Uma mensagem antes de a Bia sair
const antes = await como('caio', `insert into mensagens (id, conversa_id, remetente_id, tipo, texto) values ('m1', $1, 'caio', 'texto', 'oi')`, [g]);
confere('participante escreve', !antes.erro, antes.erro);
const forja = await como('caio', `insert into mensagens (id, conversa_id, remetente_id, tipo, texto) values ('m-falsa', $1, 'caio', 'sistema', 'Ana saiu')`, [g]);
confere('ninguém forja mensagem de sistema', !!forja.erro, 'passou');

// 6. Bia sai
await new Promise((r) => setTimeout(r, 20));
const biaSai = await como('bia', `select public.sair_do_grupo($1)`, [g]);
confere('qualquer um sai', !biaSai.erro, biaSai.erro);
await new Promise((r) => setTimeout(r, 20));
await como('caio', `insert into mensagens (id, conversa_id, remetente_id, tipo, texto) values ('m2', $1, 'caio', 'texto', 'depois')`, [g]);
const biaLe = await como<any>('bia', `select id from mensagens where conversa_id = $1 and tipo = 'texto' order by criado_em`, [g]);
confere('quem saiu lê o que veio antes, e não o depois', JSON.stringify((biaLe.linhas || []).map((m) => m.id)) === '["m1"]', JSON.stringify(biaLe));
const biaEscreve = await como('bia', `insert into mensagens (id, conversa_id, remetente_id, tipo, texto) values ('m3', $1, 'bia', 'texto', 'oi')`, [g]);
confere('quem saiu não escreve', !!biaEscreve.erro, 'passou');
await como('bia', `update participantes set saiu_em=null where conversa_id=$1 and colaborador_id='bia'`, [g]);
confere('quem saiu não volta sozinho',
  (await comoSuper(`select saiu_em from participantes where conversa_id=$1 and colaborador_id='bia'`, [g]))[0].saiu_em !== null);
const biaVeOGrupo = await como<any>('bia', `select id from conversas where id = $1`, [g]);
confere('quem saiu ainda vê o grupo (para apagar da lista)', (biaVeOGrupo.linhas || []).length === 1);
const biaApaga = await como<any>('bia', `delete from participantes where conversa_id=$1 and colaborador_id='bia' returning 1`, [g]);
confere('quem saiu apaga o grupo da própria lista', (biaApaga.linhas || []).length === 1, JSON.stringify(biaApaga));

// 7. Ana (única admin) sai: o mais antigo assume
const anaSai = await como('ana', `select public.sair_do_grupo($1)`, [g]);
confere('a última admin sai', !anaSai.erro, anaSai.erro);
const admins = await comoSuper(`select colaborador_id from participantes where conversa_id=$1 and papel='admin' and saiu_em is null`, [g]);
confere('o grupo não fica sem admin', admins.length === 1 && admins[0].colaborador_id === 'caio', JSON.stringify(admins));

// 8. Editar o grupo: só admin
const daviRenomeia = await como('davi', `update conversas set nome='Hackeado' where id=$1`, [g]);
const nome1 = (await comoSuper(`select nome from conversas where id=$1`, [g]))[0].nome;
confere('membro não renomeia', !!daviRenomeia.erro || nome1 === 'Balcão sábado', nome1);
const caioRenomeia = await como('caio', `update conversas set nome='Balcão sábado 2' where id=$1`, [g]);
confere('admin renomeia', !caioRenomeia.erro && (await comoSuper(`select nome from conversas where id=$1`, [g]))[0].nome === 'Balcão sábado 2', caioRenomeia.erro);

// 9. Remover e promover
const caioPromove = await como('caio', `select public.definir_admin_do_grupo($1, 'davi', true)`, [g]);
confere('admin promove outro', !caioPromove.erro, caioPromove.erro);
const daviRemoveCaio = await como('davi', `select public.remover_do_grupo($1, 'caio')`, [g]);
confere('admin remove outro', !daviRemoveCaio.erro, daviRemoveCaio.erro);

// 10. Conversa individual: só as duas pessoas dela
const indAna = await como('ana', `insert into conversas (id, tipo, nome) values ('conv-ind-ana-bia', 'individual', 'x')`);
const indEu = await como('ana', `insert into participantes values ('conv-ind-ana-bia', 'ana')`);
const indOutra = await como('ana', `insert into participantes values ('conv-ind-ana-bia', 'bia')`);
confere('individual: as duas pessoas entram', !indAna.erro && !indEu.erro && !indOutra.erro, `${indAna.erro} ${indEu.erro} ${indOutra.erro}`);
const indIntruso = await como('ana', `insert into participantes values ('conv-ind-ana-bia', 'caio')`);
confere('individual: terceiro não entra', !!indIntruso.erro, 'passou');
const indDavi = await como('davi', `insert into participantes values ('conv-ind-ana-bia', 'davi')`);
confere('individual: ninguém se põe na conversa dos outros', !!indDavi.erro, 'passou');

// 11. Canal oficial: a inscrição segue aberta, e ninguém sai pela função
const canal = await como('davi', `insert into participantes values ('canal-loja', 'davi')`);
confere('canal oficial: a pessoa se inscreve, como hoje', !canal.erro, canal.erro);
const saiCanal = await como('davi', `select public.sair_do_grupo('canal-loja')`);
confere('canal oficial: ninguém sai pela função', !!saiCanal.erro, 'passou');

// 12. As mensagens de sistema que ficaram no grupo, na ordem
const sis = await comoSuper(`select texto from mensagens where conversa_id=$1 and tipo='sistema' order by criado_em`, [g]);
confere('nomes em lista', (await comoSuper(`select public.nomes_em_lista(array['davi','bia','caio']) as n`))[0].n === 'Bia, Caio e Davi');

test('cada pessoa só faz o que o papel dela deixa', () => {
  expect(resultados.filter((r) => !r.ok).map((r) => `${r.nome} → ${r.detalhe}`)).toEqual([]);
  expect(resultados.length).toBeGreaterThanOrEqual(30);
});

test('o grupo conta a própria história', () => {
  expect(sis.map((m: any) => m.texto)).toEqual([
    'Ana criou o grupo',
    'Ana adicionou Davi',
    'Bia saiu',
    'Ana saiu',
    'Caio agora é administrador',
    'Davi agora é administrador',
    'Davi removeu Caio',
  ]);
});

test('o SQL roda de novo sem quebrar nada', async () => {
  await db.exec(SQL_NOVO.replace(/notify pgrst, 'reload schema';/g, ''));
  const admins = await comoSuper(`select count(*)::int as n from participantes where papel = 'admin'`);
  expect(admins[0].n).toBeGreaterThan(0);
});

test('o esquema diz o mesmo que o grupos-de-todos.sql: cada função e cada regra, igual', () => {
  // Uma regra em dois arquivos divergindo foi como o login criou cadastro duplicado
  const esquema = readFileSync('supabase/esquema.sql', 'utf8').replace(/\r\n/g, '\n');
  const delta = SQL_NOVO.replace(/\r\n/g, '\n');
  const blocos = [
    ...delta.matchAll(/create or replace function public\.[a-z_]+\([^)]*\)[\s\S]*?\$\$;/g),
    ...delta.matchAll(/create policy [a-z_]+ on public\.[a-z_]+[\s\S]*?\);\n/g),
  ].map((m) => m[0]);
  expect(blocos.length).toBeGreaterThan(15);
  const faltando = blocos.filter((b) => !esquema.includes(b)).map((b) => b.split('\n')[0]);
  expect(faltando).toEqual([]);
});
