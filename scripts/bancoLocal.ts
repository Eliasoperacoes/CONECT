/**
 * UM POSTGRES DE VERDADE, LOCAL, COM O ESQUEMA INTEIRO — para provar regra
 * de banco sem tocar na produção (PGlite, em memória).
 *
 * O Supabase traz coisas que o Postgres puro não tem: os papéis
 * (`authenticated`), o login (`auth.uid()`), o balde (`storage`) e o
 * pgcrypto no esquema `extensions`. Aqui vai o mínimo de cada um.
 *
 * O `esquema.sql` foi escrito para rodar sobre o banco que já existia, e
 * num banco vazio alguns comandos chegam antes do que usam. Ele roda
 * COMANDO A COMANDO, em passadas, até estabilizar — como a produção, que
 * cresceu assim. A última passada tem de terminar sem erro nenhum.
 *
 * `auth.uid()` lê a variável `teste.uid`: `como(uid)` entra no papel de
 * quem está logado (com RLS valendo); `como(null)` volta ao dono do banco,
 * que faz o papel da chave de serviço.
 */
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { readFileSync } from 'fs';
import { join } from 'path';

const PASTA = join(import.meta.dir, '../supabase');

/** Separa um arquivo SQL em comandos, respeitando aspas, comentários e $$. */
export const comandosDoSql = (sql: string): string[] => {
  const lista: string[] = [];
  let atual = '';
  let i = 0;
  while (i < sql.length) {
    const resto = sql.slice(i);
    let ate = -1;
    if (resto.startsWith('--')) {
      const fim = sql.indexOf('\n', i);
      ate = fim === -1 ? sql.length : fim;
    } else if (resto.startsWith('/*')) {
      const fim = sql.indexOf('*/', i + 2);
      ate = fim === -1 ? sql.length : fim + 2;
    } else if (sql[i] === "'") {
      let j = i + 1;
      while (j < sql.length && !(sql[j] === "'" && sql[j + 1] !== "'")) j += sql[j] === "'" ? 2 : 1;
      ate = j + 1;
    } else {
      const tag = resto.match(/^\$[A-Za-z_]*\$/);
      if (tag) {
        const fim = sql.indexOf(tag[0], i + tag[0].length);
        ate = fim === -1 ? sql.length : fim + tag[0].length;
      }
    }
    if (ate !== -1) {
      atual += sql.slice(i, ate);
      i = ate;
      continue;
    }
    if (sql[i] === ';') {
      if (atual.trim()) lista.push(`${atual.trim()};`);
      atual = '';
    } else {
      atual += sql[i];
    }
    i++;
  }
  if (atual.replace(/--.*/g, '').trim()) lista.push(atual.trim());
  return lista;
};

export const lerSql = (arquivo: string): string =>
  readFileSync(join(PASTA, arquivo), 'utf8').replace(/notify pgrst, 'reload schema';/g, '');

export interface BancoLocal {
  db: PGlite;
  /** Erros da última passada do esquema — tem de ser vazio. */
  errosDoEsquema: string[];
  /** Entra no papel de quem está logado com este uid, ou volta ao dono (null). */
  como: (uid: string | null) => Promise<void>;
}

export const montarBancoLocal = async (passadas = 4): Promise<BancoLocal> => {
  const db = new PGlite({ extensions: { pgcrypto } });
  await db.exec(`
    create role authenticated; create role anon; create role service_role;
    create schema auth;
    create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb, created_at timestamptz default now());
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('teste.uid', true), '')::uuid $$;
    create function auth.role() returns text language sql stable as $$ select 'authenticated' $$;
    create schema extensions;
    create extension pgcrypto schema extensions;
    create schema storage;
    create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
    create table storage.objects (id uuid default gen_random_uuid(), bucket_id text, name text, owner uuid);
    alter table storage.objects enable row level security;
    create function storage.foldername(name text) returns text[] language sql immutable as $$ select string_to_array(name, '/') $$;
  `);

  const lista = comandosDoSql(lerSql('esquema.sql'));
  let errosDoEsquema: string[] = [];
  for (let p = 0; p < passadas; p++) {
    errosDoEsquema = [];
    for (const c of lista) {
      try {
        await db.exec(c);
      } catch (e) {
        errosDoEsquema.push(`${(e as Error).message} :: ${c.replace(/\s+/g, ' ').slice(0, 110)}`);
      }
    }
    if (errosDoEsquema.length === 0) break;
  }

  // Os privilégios que o Supabase dá a quem está logado
  await db.exec(`
    grant usage on schema public, extensions, auth to authenticated;
    grant all on all tables in schema public to authenticated;
    grant execute on all functions in schema public, extensions to authenticated;
  `);

  const como = async (uid: string | null) => {
    await db.exec(`reset role; select set_config('teste.uid', '${uid ?? ''}', false);`);
    if (uid) await db.exec('set role authenticated;');
  };

  return { db, errosDoEsquema, como };
};
