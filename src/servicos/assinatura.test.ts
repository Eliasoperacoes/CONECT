/**
 * AS TRAVAS DA ASSINATURA, lidas do SQL que vai para o banco.
 *
 * A assinatura do holerite substitui a via em papel. O que a faz valer
 * não é a tela: é o banco gravar com a hora DELE, conferir a senha LÁ, e
 * ninguém — nem o RH — conseguir escrever ou apagar um recebimento por
 * fora das funções.
 */
import { test, expect } from 'bun:test';

/** O arquivo SQL, com o fim de linha do Git (o checkout no Windows pode trazer CRLF). */
const lerSql = async (nome: string): Promise<string> =>
  (await Bun.file(new URL(`../../supabase/${nome}`, import.meta.url)).text()).replace(/\r\n/g, '\n');

const sql = await lerSql('assinatura-holerite.sql');

/** O corpo de uma função do arquivo, entre os dois $$. */
const corpoDe = (nome: string): string => {
  const inicio = sql.indexOf(`create or replace function public.${nome}`);
  expect(inicio).toBeGreaterThan(-1);
  const abre = sql.indexOf('$$', inicio);
  return sql.slice(abre, sql.indexOf('$$', abre + 2));
};

test('ninguém escreve nas tabelas da assinatura pela API: só as funções gravam', () => {
  for (const tabela of [
    'assinaturas',
    'recebimentos_holerite',
    'tentativas_de_assinatura',
    'espelhos_assinados',
    'assinaturas_do_responsavel',
  ]) {
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
  const conferir = corpoDe('conferir_senha_de_quem_assina');
  expect(conferir).toContain('extensions.crypt(');
  expect(conferir).toContain('from auth.users u');
  expect(conferir).toContain('where u.id = auth.uid()');
  // Errou: registra a tentativa e DEVOLVE (um raise desfaria o registro)
  const errou = conferir.slice(conferir.indexOf('if not coalesce(senha_ok, false)'));
  expect(errou.slice(0, 300)).toContain('insert into public.tentativas_de_assinatura');
  expect(conferir).not.toContain('raise');
  // E o limite vem antes da conferência
  expect(conferir.indexOf("'bloqueado'")).toBeLessThan(conferir.indexOf('extensions.crypt('));
  // Ninguém a chama pela API: seria uma porta para testar senhas
  expect(sql).toContain(
    'revoke all on function public.conferir_senha_de_quem_assina(text, text) from public, anon, authenticated;'
  );
});

test('UMA CONFERÊNCIA DE SENHA: holerite e espelho chamam a mesma, e nenhum confere sozinho', () => {
  for (const nome of ['assinar_holerite', 'assinar_espelho']) {
    const corpo = corpoDe(nome);
    expect(corpo).toContain('public.conferir_senha_de_quem_assina(eu, p_senha)');
    expect(corpo).not.toContain('crypt(');
    // A senha vem antes de qualquer gravação
    expect(corpo.indexOf('conferir_senha_de_quem_assina')).toBeLessThan(corpo.indexOf('insert into'));
  }
});

test('ESPELHO: só o da própria pessoa, só de mês fechado, uma vez por mês', () => {
  const assinar = corpoDe('assinar_espelho');
  // A pessoa é a da sessão: não há parâmetro de colaborador para trocar
  expect(assinar).toContain('values (eu, p_mes, vigente, p_hash');
  expect(assinar).not.toContain('p_colaborador');
  // Mês fechado pelo relógio do banco, em Brasília
  expect(assinar).toContain("p_mes >= to_char(now() at time zone 'America/Sao_Paulo', 'YYYY-MM')");
  expect(assinar.indexOf("'mes_aberto'")).toBeLessThan(assinar.indexOf('conferir_senha_de_quem_assina'));
  expect(sql).toContain('primary key (colaborador_id, mes)');
  expect(sql).toContain('revoke all on function public.assinar_espelho(text, text, text, text) from public, anon;');
});

test('O DELTA É CÓPIA FIEL DA FONTE: as funções saem iguais nos dois arquivos', async () => {
  const delta = await lerSql('assinatura-espelho.sql');
  const corpoNo = (texto: string, nome: string): string => {
    const inicio = texto.indexOf(`create or replace function public.${nome}`);
    expect(inicio).toBeGreaterThan(-1);
    const abre = texto.indexOf('$$', inicio);
    return texto.slice(inicio, texto.indexOf('$$', abre + 2));
  };
  for (const nome of ['conferir_senha_de_quem_assina', 'assinar_holerite', 'assinar_espelho']) {
    expect(corpoNo(delta, nome)).toBe(corpoNo(sql, nome));
  }
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

test('RESPONSÁVEL: só quem cuida de pessoas, com a senha, e antes de gravar qualquer coisa', () => {
  const assinar = corpoDe('assinar_como_responsavel');
  expect(assinar).toContain('if not public.cuido_de_pessoas() then');
  expect(assinar).toContain('public.conferir_senha_de_quem_assina(eu, p_senha)');
  expect(assinar).not.toContain('crypt(');
  const primeiraGravacao = assinar.indexOf('insert into');
  expect(assinar.indexOf('cuido_de_pessoas')).toBeLessThan(primeiraGravacao);
  expect(assinar.indexOf('conferir_senha_de_quem_assina')).toBeLessThan(primeiraGravacao);
  expect(sql).toContain(
    'revoke all on function public.assinar_como_responsavel(text, text[]) from public, anon;'
  );
});

test('RESPONSÁVEL: só o espelho que o colaborador JÁ assinou, nunca o próprio, e o código vem do banco', () => {
  const assinar = corpoDe('assinar_como_responsavel');
  // O espelho sai da tabela do que o colaborador assinou
  expect(assinar).toContain('from public.espelhos_assinados e');
  // Ninguém assina como responsável o próprio espelho
  expect(assinar).toContain('and e.colaborador_id <> eu');
  // O código é o que o colaborador assinou — o aparelho não manda código
  expect(assinar).toContain('e.conteudo_hash');
  expect(assinar).not.toContain('p_hash');
  // Assinar de novo não troca quem assinou primeiro
  expect(assinar.match(/on conflict \(documento, referencia\) do nothing/g)).toHaveLength(1);
});

test('O HOLERITE NÃO TEM ASSINATURA DO RESPONSÁVEL — só a do funcionário (Elias, 05/10/2026)', () => {
  const assinar = corpoDe('assinar_como_responsavel');
  expect(assinar).not.toContain('holerite');
  expect(sql).toContain("check (documento in ('espelho'))");
});

test('o colaborador lê a assinatura do responsável SÓ no próprio documento', () => {
  const regra = sql.slice(sql.indexOf('create policy assinaturas_leitura'));
  expect(regra.slice(0, 500)).toContain('r.assinatura_id = assinaturas.id');
  expect(regra.slice(0, 500)).toContain('r.colaborador_id = public.meu_colaborador_id()');
  // Uma regra só: a leitura de `assinaturas` não está escrita duas vezes
  expect(sql.match(/create policy assinaturas_leitura/g)).toHaveLength(1);
});

test('O DELTA DO RESPONSÁVEL É CÓPIA FIEL DA FONTE', async () => {
  const delta = await lerSql('assinatura-responsavel.sql');
  const trecho = (texto: string, inicio: string, fim: string) =>
    texto.slice(texto.indexOf(inicio), texto.indexOf(fim, texto.indexOf(inicio)));
  for (const [inicio, fim] of [
    ['create table if not exists public.assinaturas_do_responsavel', ');'],
    ['create policy assinaturas_leitura', ');\n'],
    ['create or replace function public.assinar_como_responsavel', '$$;'],
  ]) {
    expect(delta).toContain(inicio);
    expect(trecho(delta, inicio, fim)).toBe(trecho(sql, inicio, fim));
  }
});
