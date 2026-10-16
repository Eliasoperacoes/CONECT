-- ============================================================================
-- NINGUÉM DÁ UM NÍVEL ACIMA DO PRÓPRIO (15/10/2026)
--
-- O RH ganhou a tela Colaboradores: cria e altera cadastro. A política de
-- inserção e a de edição liberam quem cuida de pessoas — mas não olhavam o
-- NÍVEL gravado. A Dani (nível 4) podia criar uma conta nível 5, e o nível 5
-- é o sistema inteiro: permissões, exclusão, tudo.
--
-- A regra: só o TI dá qualquer nível; os demais, até o próprio. É a mesma
-- que `resetar_senha_inicial` já usa para a senha. Na tela, a lista de níveis
-- do cadastro mostra só o que a pessoa pode dar — mas a trava é esta.
--
-- Sem sessão (auth.uid() nulo) passa: é o próprio banco agindo, como o
-- primeiro acesso de uma rede vazia, que cria o Administrador.
-- ============================================================================

create or replace function public.nivel_ate_o_meu()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Quem não cuida de pessoas nem chega a mudar nível: o gatilho do
  -- organograma devolve o antigo. Recusar aqui derrubaria a troca de foto de
  -- quem foi rebaixado e ainda tem o nível velho em cache.
  if auth.uid() is null or public.sou_admin() or not public.cuido_de_pessoas() then
    return new;
  end if;
  if tg_op = 'UPDATE' and new.nivel is not distinct from old.nivel then
    return new;
  end if;
  if new.nivel > public.meu_nivel() then
    raise exception 'Nao e possivel dar um nivel acima do seu'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke execute on function public.nivel_ate_o_meu() from public, anon;

drop trigger if exists colaboradores_nivel_ate_o_meu on public.colaboradores;
create trigger colaboradores_nivel_ate_o_meu
  before insert or update of nivel on public.colaboradores
  for each row execute function public.nivel_ate_o_meu();

notify pgrst, 'reload schema';

-- Conferência: as duas `true`
select
  exists (select 1 from pg_proc where proname = 'nivel_ate_o_meu')           as funcao_existe,
  exists (select 1 from pg_trigger
           where tgname = 'colaboradores_nivel_ate_o_meu'
             and tgrelid = 'public.colaboradores'::regclass)                  as gatilho_ligado;
