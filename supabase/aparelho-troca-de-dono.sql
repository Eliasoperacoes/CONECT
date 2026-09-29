-- ============================================================
-- CONECTA — O APARELHO QUE TROCA DE DONO
--
-- O QUE ESTE ARQUIVO CONSERTA
--
-- `aparelhos-para-push.sql` tratava a troca de dono assim: o insert
-- bate no 23505, e o aplicativo faz UPDATE na linha. Só que a política
-- de UPDATE exige que a linha JÁ SEJA da pessoa:
--
--   using (colaborador_id = public.meu_colaborador_id())
--
-- Na troca de dono ela ainda é do dono anterior. O update afeta ZERO
-- linhas e devolve sucesso — a falha calada que o próprio arquivo dizia
-- evitar. O celular do balcão seguiria entregando os avisos da pessoa
-- da manhã depois de a da tarde entrar, as mensagens de chat inclusive.
--
-- ------------------------------------------------------------
-- POR QUE UMA FUNÇÃO, E NÃO UMA POLÍTICA MAIS FROUXA
-- ------------------------------------------------------------
--
-- Abrir a política de UPDATE para "qualquer linha" deixaria qualquer
-- pessoa tomar o aparelho de qualquer outra — bastaria conhecer o token.
-- A função faz UMA coisa só: grava o token no nome de QUEM CHAMA. Ela
-- não recebe o colaborador por parâmetro, então não há como registrar o
-- aparelho no nome de outro.
--
-- E quem tem o token na mão É o aparelho: o Firebase só o entrega ao
-- aplicativo instalado nele. Tomar a linha para si é exatamente o que
-- acontece quando alguém entra com outro login naquele celular.
--
-- Pode rodar mais de uma vez sem quebrar nada.
-- ============================================================

create or replace function public.registrar_aparelho(
  p_token      text,
  p_plataforma text default 'android'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  eu text := public.meu_colaborador_id();
begin
  if eu is null then
    raise exception 'Sem colaborador para esta sessão.' using errcode = '42501';
  end if;

  if coalesce(trim(p_token), '') = '' then
    raise exception 'Token vazio.' using errcode = '22023';
  end if;

  insert into public.aparelhos (token, colaborador_id, plataforma, visto_em)
  values (p_token, eu, coalesce(p_plataforma, 'android'), now())
  on conflict (token) do update
    set colaborador_id = excluded.colaborador_id,
        plataforma     = excluded.plataforma,
        visto_em       = now();
end;
$$;

-- Só quem entrou. Sem sessão não há "quem chama" a quem dar o aparelho.
revoke all on function public.registrar_aparelho(text, text) from public, anon;
grant execute on function public.registrar_aparelho(text, text) to authenticated;

notify pgrst, 'reload schema';

-- ============================================================
-- CONFERÊNCIA — as três têm de vir TRUE
--
-- funcao_existe ........ true
-- security_definer ..... true   (sem ela, a RLS barra a troca de novo)
-- anon_nao_chama ....... true   (quem não entrou não registra aparelho)
-- ============================================================
select
  exists (
    select 1 from pg_proc
     where proname = 'registrar_aparelho'
       and pronamespace = 'public'::regnamespace
  ) as funcao_existe,

  coalesce((
    select prosecdef from pg_proc
     where proname = 'registrar_aparelho'
       and pronamespace = 'public'::regnamespace
  ), false) as security_definer,

  not has_function_privilege(
    'anon', 'public.registrar_aparelho(text, text)', 'execute'
  ) as anon_nao_chama;
