/**
 * AS AUSÊNCIAS E OS FERIADOS NO ESQUEMA (09/10/2026).
 *
 * As duas tabelas existiam só nos deltas: o esquema.sql rodado num banco
 * vazio criava um sistema sem atestado, férias, folga e calendário. Aqui
 * se trava que o esquema traz as regras QUE VALEM — cada `create policy`
 * igual ao do último delta que a definiu, condição por condição (sem
 * comentários nem espaços) — e que as tabelas nascem num banco vazio.
 */
import { test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { montarBancoLocal } from '../../scripts/bancoLocal';

const ler = (arquivo: string) => readFileSync(`supabase/${arquivo}`, 'utf8');
const esquema = ler('esquema.sql');

/** O `create policy <nome> ... ;` sem comentários e com os espaços colapsados. */
const politica = (sql: string, nome: string): string | null => {
  const i = sql.indexOf(`create policy ${nome} `);
  if (i === -1) return null;
  return sql
    .slice(i, sql.indexOf(';', i) + 1)
    .replace(/--[^\n]*/g, '')
    .replace(/\s+/g, ' ')
    .replace(/\( /g, '(')
    .replace(/ \)/g, ')')
    .trim();
};

// A versão que vale de cada regra: o último delta, na ordem do OPERACAO.md, que a redefiniu
const QUE_VALEM: Array<[string, string]> = [
  ['justificativas_leitura', 'atestado-e-do-rh.sql'],
  ['justificativas_decisao', 'atestado-e-do-rh.sql'],
  ['justificativas_abertura', 'atestado-e-do-rh.sql'],
  ['justificativas_remocao', 'ponto-tolerancia-justificativas.sql'],
  ['feriados_leitura', 'calendario-feriados.sql'],
  ['feriados_escrita', 'calendario-feriados.sql'],
  ['feriados_edicao', 'calendario-feriados.sql'],
  ['feriados_remocao', 'calendario-feriados.sql'],
];

test('cada regra de acesso do esquema é a do delta que vale, condição por condição', () => {
  for (const [nome, delta] of QUE_VALEM) {
    const doDelta = politica(ler(delta), nome);
    expect({ nome, existeNoDelta: doDelta !== null }).toEqual({ nome, existeNoDelta: true });
    expect({ nome, esquema: politica(esquema, nome) }).toEqual({ nome, esquema: doDelta });
    // Uma definição só no esquema: uma regra, um lugar
    expect({ nome, vezes: esquema.split(`create policy ${nome} `).length - 1 }).toEqual({ nome, vezes: 1 });
  }
});

test('num banco vazio, o esquema cria as duas tabelas, com RLS e as quatro regras de cada', async () => {
  const banco = await montarBancoLocal();
  expect(banco.errosDoEsquema).toEqual([]);
  const r = await banco.db.query<{ tabela: string; rls: boolean; regras: number }>(`
    select c.relname as tabela, c.relrowsecurity as rls,
           (select count(*)::int from pg_policies p where p.tablename = c.relname) as regras
      from pg_class c
     where c.relname in ('justificativas_ausencia', 'feriados') and c.relkind = 'r'
     order by c.relname`);
  expect(r.rows).toEqual([
    { tabela: 'feriados', rls: true, regras: 4 },
    { tabela: 'justificativas_ausencia', rls: true, regras: 4 },
  ]);
  // A lista de tipos inclui férias e folga de sábado
  const tipos = await banco.db.query<{ d: string }>(
    `select pg_get_constraintdef(oid) as d from pg_constraint where conname = 'justificativas_ausencia_tipo_check'`
  );
  expect(tipos.rows[0].d).toContain('ferias');
  expect(tipos.rows[0].d).toContain('folga_sabado');
}, 120_000);
