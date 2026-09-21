-- ===================================================================
-- ATESTADO É DO RH. FOLGA É DA CADEIA.
-- ===================================================================
--
-- O DEFEITO: a Aline mandou um atestado e a LEIGISLAINE recusou. Ela não
-- deveria ter podido — atestado é documento, e documento é do RH.
--
-- A causa: a política de decisão perguntava `posso_decidir_jornada`, a
-- mesma da hora extra. Faz sentido para folga de sábado, que se decide
-- olhando a escala da loja; não faz nenhum para um atestado, que o líder
-- não tem como julgar e nem deveria LER — é dado de saúde de um colega,
-- e a LGPD pede que fique com quem precisa dele para trabalhar.
--
-- Esta mudança faz o BANCO saber a diferença. A tela já sabe; sem isto a
-- regra valeria só no botão, e bastaria uma chamada direta à API para
-- passar por cima.
--
-- O QUE MUDA, por tipo:
--
--   atestado, falta_justificada, comparecimento, outro  -> RH/Diretoria/TI
--   folga_sabado, ferias                                -> a cadeia
--
-- Diretoria e TI entram no primeiro grupo de propósito: sem eles, um
-- atestado ficaria parado para sempre se o RH estivesse de férias, e não
-- haveria quem destravasse.
--
-- Roda quantas vezes quiser: só recria políticas.
-- ===================================================================

-- ---------------------------------------------------------------
-- 1. LEITURA — o líder deixa de enxergar atestado de quem é dele
-- ---------------------------------------------------------------
--
-- Não é detalhe de permissão: enquanto a linha voltava na consulta, o
-- atestado aparecia na tela do líder mesmo sem botão de decidir. Esconder
-- o botão e entregar o documento não protege dado nenhum.
drop policy if exists justificativas_leitura on public.justificativas_ausencia;
create policy justificativas_leitura on public.justificativas_ausencia
  for select to authenticated
  using (
    -- A própria pessoa sempre vê o que ela mesma mandou
    colaborador_id = public.meu_colaborador_id()
    -- Quem cuida de pessoas vê tudo: é o trabalho dele
    or public.cuido_de_pessoas()
    -- A cadeia vê apenas o que a cadeia decide
    or (
      tipo in ('folga_sabado', 'ferias')
      and public.posso_decidir_jornada(colaborador_id)
    )
  );

-- ---------------------------------------------------------------
-- 2. DECISÃO — cada tipo com o seu dono
-- ---------------------------------------------------------------
--
-- `posso_decidir_jornada` já recusa a si mesmo. No ramo do RH a trava é
-- explícita: quem é do RH mandando o próprio atestado não se aprova.
drop policy if exists justificativas_decisao on public.justificativas_ausencia;
create policy justificativas_decisao on public.justificativas_ausencia
  for update to authenticated
  using (
    (
      tipo in ('folga_sabado', 'ferias')
      and public.posso_decidir_jornada(colaborador_id)
    )
    or (
      tipo not in ('folga_sabado', 'ferias')
      and public.cuido_de_pessoas()
      and colaborador_id <> public.meu_colaborador_id()
    )
    -- O dono corrige a própria solicitação enquanto ninguém decidiu
    or (colaborador_id = public.meu_colaborador_id() and estado = 'pendente')
  )
  with check (
    (
      tipo in ('folga_sabado', 'ferias')
      and public.posso_decidir_jornada(colaborador_id)
    )
    or (
      tipo not in ('folga_sabado', 'ferias')
      and public.cuido_de_pessoas()
      and colaborador_id <> public.meu_colaborador_id()
    )
    or (colaborador_id = public.meu_colaborador_id() and estado = 'pendente')
  );

-- ---------------------------------------------------------------
-- 3. CRIAÇÃO — inalterada na prática, repetida para ficar junto
-- ---------------------------------------------------------------
--
-- A liderança continua montando a escala de férias e sábados de quem
-- responde a ela, já aprovada: planejar não parte de pedido de ninguém.
-- O que ela NÃO faz é abrir atestado em nome de outro — isso é do RH,
-- que recebe o papel na mão.
drop policy if exists justificativas_abertura on public.justificativas_ausencia;
create policy justificativas_abertura on public.justificativas_ausencia
  for insert to authenticated
  with check (
    (colaborador_id = public.meu_colaborador_id() and estado = 'pendente')
    or public.cuido_de_pessoas()
    or (
      tipo in ('folga_sabado', 'ferias')
      and public.posso_decidir_jornada(colaborador_id)
    )
  );

notify pgrst, 'reload schema';

-- ===================================================================
-- CONFERÊNCIA
-- ===================================================================
--
-- Deve devolver TRÊS linhas: abertura, decisao e leitura. A coluna
-- `separa_por_tipo` precisa dizer "sim" nas três — é ela que mostra que a
-- política nova entrou no lugar da antiga.
select
  policyname                                   as politica,
  cmd                                          as operacao,
  case
    when coalesce(qual, '') || coalesce(with_check, '') like '%folga_sabado%'
      then 'sim'
    else 'NÃO — política antiga ainda no lugar'
  end                                          as separa_por_tipo
from pg_policies
where schemaname = 'public'
  and tablename = 'justificativas_ausencia'
order by policyname;
