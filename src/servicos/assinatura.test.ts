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
  for (const tabela of ['assinaturas', 'recebimentos_holerite', 'tentativas_de_assinatura', 'espelhos_assinados']) {
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
  const delta = await Bun.file(new URL('../../supabase/assinatura-espelho.sql', import.meta.url)).text();
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
