/**
 * Verificação do RESET DA SENHA INICIAL — CONECTA
 *
 * O que motivou: quem esquecia a senha dependia do TI abrir o Supabase,
 * achar `resetar-acesso.sql`, trocar um login no meio do script e rodar.
 * Virou botão na ficha do colaborador.
 *
 * E botão que apaga conta de acesso precisa de trava que não se contorne.
 * É disso que este arquivo cuida: a decisão de quem pode resetar quem tem
 * que morar NO BANCO, porque trava de tela se contorna abrindo o console.
 */
import { test, expect } from 'bun:test';
import { SENHA_PADRAO_PRIMEIRO_ACESSO } from '../tipos';

const lerSql = async (): Promise<string> =>
  Bun.file('supabase/resetar-senha-inicial.sql').text();

const lerPonte = async (): Promise<string> =>
  Bun.file(new URL('./nuvem.ts', import.meta.url)).text();

const lerTela = async (): Promise<string> =>
  Bun.file(new URL('../componentes/PainelAdministrativo.tsx', import.meta.url)).text();

/** O SQL sem os comentários, para a verificação não achar a explicação. */
const semComentarios = (fonte: string): string =>
  fonte.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*--.*$/gm, '');

test('A SENHA PADRÃO É UMA SÓ, e a tela lê dela', async () => {
  /**
   * `123456` está escrito no gatilho de primeiro acesso, no SQL do reset
   * e na tela. Se divergirem, o TI avisa uma senha e o banco espera
   * outra — e a pessoa fica do lado de fora achando que digitou errado.
   */
  expect(SENHA_PADRAO_PRIMEIRO_ACESSO).toBe('123456');

  const sql = semComentarios(await lerSql());
  expect(sql).toContain("'123456'");

  const tela = await lerTela();
  expect(tela).toContain('{SENHA_PADRAO_PRIMEIRO_ACESSO}');
  // A tela não escreve o número na mão
  expect(tela).not.toContain('senha 123456');
});

test('AS TRÊS TRAVAS MORAM NO BANCO', async () => {
  /**
   * A função apaga linha de `auth.users` — é `security definer`, roda com
   * privilégio de dono. Sem trava, qualquer sessão autenticada apagaria a
   * conta de qualquer pessoa.
   *
   * 1. Só quem cuida de ficha chama — a MESMA regra de cadastrar e editar
   *    colaborador, não uma permissão nova.
   * 2. Ninguém reseta alguém acima de si. Sem isso o RH resetaria o
   *    Administrador, entraria com 123456 e viraria Administrador.
   * 3. Ninguém reseta a si mesmo — se desloga e volta ao primeiro acesso.
   */
  const sql = semComentarios(await lerSql());

  expect(sql).toContain('security definer');
  expect(sql).toContain('if not public.cuido_de_pessoas() then');
  expect(sql).toContain('if ficha.nivel > public.meu_nivel() then');
  expect(sql).toContain('if ficha.id = public.meu_colaborador_id() then');

  // Cada trava aborta — não é aviso que o chamador possa ignorar
  expect((sql.match(/raise exception/g) || []).length).toBeGreaterThanOrEqual(4);
});

test('quem nao entrou NAO alcanca a funcao', async () => {
  /**
   * Função no Postgres nasce executável por `public`. Sem revogar, a
   * chave anônima do navegador — que está no pacote publicado, à vista de
   * qualquer um — apagaria conta de acesso.
   */
  const sql = semComentarios(await lerSql());

  expect(sql).toContain(
    'revoke execute on function public.resetar_senha_inicial(text) from public, anon'
  );
  expect(sql).toContain(
    'grant  execute on function public.resetar_senha_inicial(text) to authenticated'
  );
});

test('A FICHA NÃO É TOCADA — só a conta de acesso', async () => {
  /**
   * Resetar senha não pode custar o histórico de ninguém. O que a função
   * mexe em `colaboradores` são três colunas de acesso; ponto, banco de
   * horas, organograma e mensagens ficam onde estão.
   *
   * Um `delete from public.colaboradores` aqui apagaria a pessoa junto
   * com a senha.
   */
  const sql = semComentarios(await lerSql());

  expect(sql).toContain('set auth_user_id         = null');
  expect(sql).toContain('senha_ativacao       = null');
  expect(sql).toContain('precisa_trocar_senha = true');

  expect(sql).not.toContain('delete from public.colaboradores');
  expect(sql).not.toContain('delete from public.registros_ponto');
  expect(sql).not.toContain('delete from public.mensagens');
});

test('FICA REGISTRADO QUEM RESETOU O ACESSO DE QUEM', async () => {
  /**
   * É mexer no acesso de outra pessoa. Sem registro não há como apurar
   * depois quem derrubou a conta de quem — e a auditoria é imutável de
   * propósito: não há política de update nem de delete nela.
   */
  const sql = semComentarios(await lerSql());

  expect(sql).toContain('insert into public.auditoria');
  expect(sql).toContain("'seguranca'");
  expect(sql).toContain('public.meu_colaborador_id()');
});

test('o script termina recarregando o esquema e conferindo', async () => {
  /**
   * Sem o `notify`, a API continua servindo o catálogo velho e a função
   * nova não existe para o navegador. E "Success" no editor do Supabase
   * aparece igual quando se roda um arquivo antigo por engano — a
   * conferência no fim é o que distingue.
   */
  const sql = await lerSql();

  expect(sql).toContain("notify pgrst, 'reload schema'");
  expect(sql).toContain('funcao_existe');
  expect(sql).toContain('roda_como_dono');
  expect(sql).toContain('anon_nao_alcanca');
});

test('a ponte chama a funcao do banco, e nao mexe em auth pela tela', async () => {
  const ponte = await lerPonte();

  expect(ponte).toContain("supabase.rpc('resetar_senha_inicial'");
  expect(ponte).toContain('colaborador_alvo: colaboradorId');

  /**
   * E o cache local é refeito: a ficha voltou a "primeiro acesso", e a
   * lista na tela mostraria o estado antigo até alguém atualizar a página.
   */
  expect(ponte).toContain('await this.sincronizarColaboradores()');
});

test('O BOTÃO NÃO APARECE ONDE NÃO FAZ SENTIDO', async () => {
  /**
   * Em cadastro NOVO não há conta para resetar. E sobre si mesmo o reset
   * derruba a própria sessão — num TI que é o único nível 5, seria se
   * trancar do lado de fora.
   *
   * Esconder é conveniência; quem impede de verdade é o banco.
   */
  const tela = await lerTela();

  expect(tela).toContain(
    '{colabEditando && colabEditando.id !== colaboradorAtual.id && ('
  );
});

test('resetar PEDE CONFIRMAÇÃO antes', async () => {
  /**
   * Um clique derruba o acesso de alguém que pode estar no meio do
   * expediente, batendo ponto pelo celular. O aviso diz o que acontece e
   * o que NÃO acontece — ficha, ponto e mensagens ficam.
   */
  const tela = await lerTela();

  expect(tela).toContain('confirmandoReset');
  expect(tela).toContain('Confirmar reset');
  expect(tela).toContain('Ficha, ponto e mensagens não são');

  // E o botão trava enquanto a chamada está no ar, para não resetar duas vezes
  expect(tela).toContain('disabled={resetando}');
});
