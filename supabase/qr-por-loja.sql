-- ============================================================
-- CONECTA — O CARTAZ DE QR PASSA A SER DO GERENTE DA LOJA
--
-- Rode este arquivo no SQL Editor. Pode rodar mais de uma vez.
--
-- ANTES: só RH, Diretoria e TI publicavam ou trocavam o código do cartaz.
-- AGORA: o gerente cuida do cartaz da PRÓPRIA loja também.
--
-- Preso à loja de propósito: trocar o código de outra unidade derrubaria o
-- ponto de gente por quem o gerente não responde — o QR antigo para de
-- valer no instante em que o novo nasce.
--
-- O líder de setor continua de fora: o cartaz é da loja, não do setor, e a
-- liderança de Compras atua nas cinco.
--
-- Isto NÃO dá banco de horas ao gerente. São ferramentas separadas: o
-- espelho de ponto e o saldo seguem com RH e TI.
-- ============================================================

create or replace function public.cuido_do_qr_da_loja(alvo text)
returns boolean language sql stable security definer set search_path = public as $$
  select
    public.cuido_de_pessoas()
    or exists (
      select 1 from public.colaboradores
       where id = public.meu_colaborador_id()
         and nivel >= 3
         and loja = alvo
    );
$$;

drop policy if exists codigos_escrita on public.codigos_ponto_loja;
create policy codigos_escrita on public.codigos_ponto_loja
  for all to authenticated
  using (public.cuido_do_qr_da_loja(loja))
  with check (public.cuido_do_qr_da_loja(loja));

notify pgrst, 'reload schema';

-- ============================================================
-- CONFERÊNCIA — as duas colunas têm que vir true
-- ============================================================
select
  exists (select 1 from pg_proc where proname = 'cuido_do_qr_da_loja') as funcao_existe,
  exists (
    select 1 from pg_policies
     where tablename = 'codigos_ponto_loja'
       and policyname = 'codigos_escrita'
       and qual ilike '%cuido_do_qr_da_loja%'
  ) as politica_atualizada;
