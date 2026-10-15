-- ============================================================
-- "FOI INTERVALO?" — A VOLTA DE QUEM NÃO TEM INTERVALO (15/10/2026)
--
-- O estagiário não tem intervalo: bate entrada e saída. No dia em que faz
-- hora extra autorizada, ele almoça e volta — e a saída do almoço já
-- entrou como SAÍDA, fechando o dia. A volta e a saída de verdade caem
-- fora da jornada, e até hoje só o RH arrumava, pelo espelho.
--
-- Agora o líder vê "Saiu às 12:30 e voltou às 13:30. Foi intervalo?" e,
-- num toque, `tratar_como_intervalo` faz o dia inteiro EM NOME DELE
-- (decisão do Elias: a correção é do empregador, não do colaborador):
--
--   · a saída vira saída para almoço — como CORREÇÃO, com autor e motivo
--     (a batida do QR não muda de tipo por baixo: `carimbar_batida`);
--   · a primeira marcação 15 min ou mais depois da saída entra como volta;
--   · a última, 2 min ou mais depois da volta, entra como saída.
--
-- 15 MINUTOS: o intervalo mínimo da CLT de quem trabalha mais de 4 e até
-- 6 horas (art. 71, §1º). Abaixo disso é batida repetida, não almoço —
-- e o caso do Yan (a mesma batida duas vezes) não vira intervalo. A mesma
-- regra mora em `voltaDoIntervalo.ts`, que só SUGERE; a que vale é esta.
--
-- A marcação ORIGINAL de cada batida não muda (Portaria 671/2021).
-- Pode rodar de novo.
-- ============================================================

create or replace function public.tratar_como_intervalo(
  p_colaborador text,
  p_data date,
  p_justificativa text default null
) returns integer
language plpgsql volatile security definer set search_path = public as $$
declare
  eu public.colaboradores;
  s public.registros_ponto;
  volta public.marcacoes_originais;
  final public.marcacoes_originais;
  v_motivo text := coalesce(nullif(trim(p_justificativa), ''), 'Saída e volta no mesmo dia: intervalo');
  incluidas integer := 1;
begin
  select * into eu from public.colaboradores where id = public.meu_colaborador_id();
  if eu.id is null then
    raise exception 'Sessão sem cadastro. Saia e entre de novo.' using errcode = 'P0001';
  end if;
  if not (public.cuido_de_pessoas() or public.posso_decidir_jornada(p_colaborador)) then
    raise exception 'Você não responde pela jornada desta pessoa.' using errcode = 'P0001';
  end if;

  select * into s from public.registros_ponto
   where colaborador_id = p_colaborador and data = p_data and tipo = 'saida';
  if s.id is null then
    raise exception 'Este dia não tem saída para virar intervalo.' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from public.registros_ponto
     where colaborador_id = p_colaborador and data = p_data and tipo in ('saida_almoco', 'retorno_almoco')
  ) then
    raise exception 'Este dia já tem intervalo.' using errcode = 'P0001';
  end if;

  -- A volta: a primeira marcação fora da jornada, ainda não tratada,
  -- 15 minutos ou mais depois da saída
  select o.* into volta from public.marcacoes_originais o
   where o.colaborador_id = p_colaborador and o.data = p_data
     and o.fora_da_jornada is not null
     and o.registrado_em >= s.horario + interval '15 minutes'
     and not exists (select 1 from public.tratamento_marcacao t where t.cnpj = o.cnpj_empregador and t.nsr = o.nsr)
   order by o.registrado_em
   limit 1;
  if volta.nsr is null then
    raise exception 'Não há volta 15 minutos ou mais depois da saída: não foi intervalo.' using errcode = 'P0001';
  end if;

  -- A saída de verdade: a última, 2 minutos ou mais depois da volta (se já houver)
  select o.* into final from public.marcacoes_originais o
   where o.colaborador_id = p_colaborador and o.data = p_data
     and o.fora_da_jornada is not null
     and o.registrado_em >= volta.registrado_em + interval '2 minutes'
     and not exists (select 1 from public.tratamento_marcacao t where t.cnpj = o.cnpj_empregador and t.nsr = o.nsr)
   order by o.registrado_em desc
   limit 1;

  -- 1. A saída vira saída para almoço, como correção de quem decidiu
  update public.registros_ponto
     set tipo = 'saida_almoco',
         metodo = case when public.cuido_de_pessoas() then 'ajuste_rh' else 'ajuste_lider' end,
         ajustado_por_id = eu.id,
         ajustado_por_nome = eu.nome,
         justificativa = 'Saída das ' || s.hora_formatada || ' tratada como saída para almoço: ' || v_motivo
   where id = s.id;

  -- 2 e 3. A volta e a saída entram pela decisão de sempre (`tratar_marcacao`)
  perform public.tratar_marcacao(volta.nsr, 'incluida', 'retorno_almoco', v_motivo, volta.cnpj_empregador);
  if final.nsr is not null then
    perform public.tratar_marcacao(final.nsr, 'incluida', 'saida', v_motivo, final.cnpj_empregador);
    incluidas := 2;
  end if;

  return incluidas;
end;
$$;

revoke all on function public.tratar_como_intervalo(text, date, text) from public, anon;
grant execute on function public.tratar_como_intervalo(text, date, text) to authenticated;

notify pgrst, 'reload schema';

-- ============================================================
-- CONFERÊNCIA — o esperado:
--   funcao_existe .............. true
--   so_quem_entrou ............. true   (o anônimo não chama)
-- ============================================================
select
  exists (select 1 from pg_proc where proname = 'tratar_como_intervalo'
           and pronamespace = 'public'::regnamespace)                                        as funcao_existe,
  not has_function_privilege('anon', 'public.tratar_como_intervalo(text, date, text)', 'execute') as so_quem_entrou;
