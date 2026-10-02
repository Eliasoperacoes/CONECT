/**
 * AS TRAVAS DA ASSINATURA, lidas do SQL que vai para o banco.
 *
 * A assinatura do holerite substitui a via em papel. O que a faz valer
 * não é a tela: é o banco gravar com a hora DELE, conferir a senha LÁ, e
 * ninguém — nem o RH — conseguir escrever ou apagar um recebimento por
 * fora das funções.
 */
import { test, expect } from 'bun:test';

const sql = await Bun.file(new URL('../../supabase/assinatura-holerite.sql', import.meta.url)).text();

/** O corpo de uma função do arquivo, entre os dois $$. */
const corpoDe = (nome: string): string => {
  const inicio = sql.indexOf(`create or replace function public.${nome}`);
  expect(inicio).toBeGreaterThan(-1);
  const abre = sql.indexOf('$$', inicio);
  return sql.slice(abre, sql.indexOf('$$', abre + 2));
};

test('ninguém escreve nas tabelas da assinatura pela API: só as funções gravam', () => {
  for (const tabela of ['assinaturas', 'recebimentos_holerite', 'tentativas_de_assinatura']) {
    expect(sql).toContain(`alter table public.${tabela}`);
    // Nenhuma regra de inserir, atualizar ou apagar nestas tabelas
    const regras = [...sql.matchAll(new RegExp(`create policy \\w+ on public\\.${tabela}\\s+for (\\w+)`, 'g'))].map((m) => m[1]);
    expect(regras.filter((r) => r !== 'select')).toEqual([]);
  }
});

test('a leitura é da própria pessoa e de quem cuida de pessoas, como o holerite', () => {
  for (const regra of [...sql.matchAll(/for select to authenticated\s+using \(([^;]+)\);/g)].map((m) => m[1])) {
    expect(regra).toContain('colaborador_id = public.meu_colaborador_id()');
    expect(regra).toContain('public.cuido_de_pessoas()');
  }
});

test('a senha é conferida NO BANCO, contra a de login, e o erro conta como tentativa', () => {
  const assinar = corpoDe('assinar_holerite');
  expect(assinar).toContain('extensions.crypt(');
  expect(assinar).toContain('from auth.users u');
  expect(assinar).toContain('where u.id = auth.uid()');
  // Errou: registra a tentativa e DEVOLVE (um raise desfaria o registro)
  const errou = assinar.slice(assinar.indexOf('if not coalesce(senha_ok, false)'));
  expect(errou.slice(0, 300)).toContain('insert into public.tentativas_de_assinatura');
  expect(errou.slice(0, 300)).not.toContain('raise');
  // E o limite vem antes da conferência
  expect(assinar.indexOf("'bloqueado'")).toBeLessThan(assinar.indexOf('extensions.crypt('));
});

test('assinar só o próprio holerite, com a assinatura vigente e a hora do banco', () => {
  const assinar = corpoDe('assinar_holerite');
  expect(assinar).toContain('dono <> eu');
  expect(assinar).toContain('order by criada_em desc limit 1');
  // A hora é o default da coluna (now() do banco): o aparelho não manda hora
  expect(assinar).not.toMatch(/assinado_em\s*[,)]\s*values/);
  expect(sql).toContain('assinado_em     timestamptz not null default now()');
});

test('holerite assinado não muda pelo sistema; pelo SQL Editor (sem usuário) passa', () => {
  const trava = corpoDe('holerite_assinado_nao_muda');
  expect(trava).toContain('auth.uid() is not null');
  expect(trava).toContain('raise exception');
  expect(sql).toMatch(/before update or delete on public\.holerites/);
});

test('quem não entrou no sistema não chama as funções', () => {
  expect(sql).toContain('revoke all on function public.cadastrar_assinatura(text, text) from public, anon;');
  expect(sql).toContain('revoke all on function public.assinar_holerite(text, text, text, text) from public, anon;');
});
