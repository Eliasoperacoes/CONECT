-- ============================================================
-- "PONTO DESDE" NA FICHA (15/10/2026)
--
-- O ponto entra na rede por grupos: as 23 pessoas de Pirassununga do
-- Fabio e da Dani ainda batiam no papel, e desde 01/10 cada dia útil sem
-- batida virou falta na fila. A admissão não serve de corte — é dado
-- trabalhista e sai no AEJ. Agora cada ficha diz a partir de quando o ponto
-- vale para a pessoa; antes disso não há falta, dia vazio, "não bateu" nem
-- espelho a assinar (`inicioDoPontoDe`, tipos.ts).
--
-- Quem grava: RH, Diretoria e TI — a pessoa não muda o dela (o gatilho
-- devolve o valor antigo, como faz com setor e loja). Quem lê: todos, como
-- cargo e setor; é só uma data, e o líder precisa dela para a equipe.
--
-- Só ESTRUTURA. Gravar a data das pessoas é o reset, em arquivo próprio.
-- Pode rodar de novo.
-- ============================================================

alter table public.colaboradores add column if not exists ponto_desde date;

-- A pessoa não muda o próprio "ponto desde"
create or replace function public.apenas_rh_move_o_organograma()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.cuido_de_pessoas() then
    return new;
  end if;

  -- Devolve o valor antigo em vez de recusar a gravação inteira: o app
  -- grava a LINHA TODA ao salvar qualquer coisa (ver esquema.sql)
  new.responsavel_id := old.responsavel_id;
  new.nivel          := old.nivel;
  new.loja           := old.loja;
  new.setor          := old.setor;

  new.nome           := old.nome;
  new.login          := old.login;
  new.matricula      := old.matricula;
  new.cnpj           := old.cnpj;
  new.departamento   := old.departamento;
  new.data_admissao  := old.data_admissao;
  new.ponto_desde    := old.ponto_desde;
  new.ativo          := old.ativo;

  return new;
end;
$$;

-- Todos leem a coluna, como cargo e setor
create or replace function public.travar_colunas_da_ficha()
returns void
language plpgsql
set search_path = public
as $$
begin
  revoke select on public.colaboradores from authenticated, anon;
  grant select (
    id, nome, cargo, setor, loja, nivel, foto, presenca, visto_por_ultimo,
    ramal, responsavel_id, ativo, criado_em, ponto_desde
  ) on public.colaboradores to authenticated;
end;
$$;
revoke all on function public.travar_colunas_da_ficha() from public, anon, authenticated;
select public.travar_colunas_da_ficha();

notify pgrst, 'reload schema';

-- ============================================================
-- CONFERÊNCIA — o esperado:
--   coluna_existe .............. true
--   todos_leem ................. true
--   pessoa_nao_muda_a_dela ..... true
-- ============================================================
select
  exists (select 1 from information_schema.columns
           where table_schema = 'public' and table_name = 'colaboradores'
             and column_name = 'ponto_desde')                                   as coluna_existe,
  has_column_privilege('authenticated', 'public.colaboradores', 'ponto_desde', 'select') as todos_leem,
  (select prosrc like '%new.ponto_desde    := old.ponto_desde%'
     from pg_proc where proname = 'apenas_rh_move_o_organograma')               as pessoa_nao_muda_a_dela;
