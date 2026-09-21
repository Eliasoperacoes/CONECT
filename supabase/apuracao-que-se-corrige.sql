-- ============================================================
-- A APURAÇÃO PRECISA CONSEGUIR SE CORRIGIR
-- CONECTA / Malachias Autopeças
--
-- RODE `ponto-do-lider-completo.sql` ANTES DESTE.
--
-- ------------------------------------------------------------
-- O SINTOMA
-- ------------------------------------------------------------
--
-- A líder corrigiu a batida de um sábado — entrada 08:00, saída 12:01 —
-- e a fila continuou dizendo "trabalhou 2h28 de 4h00 previstos", com
-- débito de 1h32. Dois lugares do sistema mostrando dias diferentes do
-- MESMO dia.
--
-- ------------------------------------------------------------
-- DUAS REGRAS FALTANDO, AS DUAS SILENCIOSAS
-- ------------------------------------------------------------
--
-- 1. APURAÇÃO APROVADA PELA TOLERÂNCIA NÃO GRAVAVA.
--
--    Quando a diferença do dia cabe na tolerância, a apuração nasce
--    APROVADA — não por decisão de ninguém, mas pela regra. Só que a
--    política de criação só aceitava a própria pessoa gravando estado
--    'pendente'.
--
--    Resultado: todo dia que fechava dentro da tolerância era recusado
--    pelo banco e existia apenas no aparelho de quem bateu. Ninguém
--    percebia, porque a tela lia o próprio cache.
--
-- 2. NINGUÉM CONSEGUIA REMOVER A PRÓPRIA PENDÊNCIA.
--
--    Dia corrigido que passa a fechar certo não tem mais o que decidir,
--    e a apuração sai da fila. Só que apagar era exclusividade do RH —
--    então a linha ficava no banco e voltava na sincronização seguinte.
--    O débito "corrigido" reaparecia sozinho.
--
-- ------------------------------------------------------------
-- O QUE ISTO NÃO ABRE
-- ------------------------------------------------------------
--
-- Ninguém passa a aprovar a própria hora extra. A permissão nova exige
-- `origem = 'tolerancia_automatica'` E `aprovador_id is null`: é a
-- regra carimbando, não uma pessoa. Pendência de verdade continua
-- nascendo 'pendente' e só muda de estado por quem responde pela pessoa.
--
-- E a remoção continua limitada ao que está PENDENTE. Apagar dia já
-- decidido segue sendo do RH — decisão tomada não se desfaz sozinha.
-- ============================================================

-- ------------------------------------------------------------
-- 1. CRIAÇÃO
-- ------------------------------------------------------------
drop policy if exists ajustes_abertura on public.ajustes_jornada;
create policy ajustes_abertura on public.ajustes_jornada
  for insert to authenticated
  with check (
    -- A própria pessoa: pendência, ou o carimbo automático da tolerância
    (
      colaborador_id = public.meu_colaborador_id()
      and (
        estado = 'pendente'
        or (estado = 'aprovado' and origem = 'tolerancia_automatica' and aprovador_id is null)
      )
    )
    or public.cuido_de_pessoas()
    -- A liderança levanta o dia da equipe, sempre pendente
    or (public.posso_decidir_jornada(colaborador_id) and estado = 'pendente')
  );

-- ------------------------------------------------------------
-- 2. DECISÃO E REESCRITA
--
-- O `with check` ganha o mesmo caso: reapurar um dia que passou a caber
-- na tolerância reescreve a linha para 'aprovado', e sem isto a
-- reescrita era recusada — deixando o número velho na fila.
-- ------------------------------------------------------------
drop policy if exists ajustes_decisao on public.ajustes_jornada;
create policy ajustes_decisao on public.ajustes_jornada
  for update to authenticated
  using (
    public.posso_decidir_jornada(colaborador_id)
    or (colaborador_id = public.meu_colaborador_id() and estado = 'pendente')
  )
  with check (
    public.posso_decidir_jornada(colaborador_id)
    or (
      colaborador_id = public.meu_colaborador_id()
      and (
        estado = 'pendente'
        or (estado = 'aprovado' and origem = 'tolerancia_automatica' and aprovador_id is null)
      )
    )
  );

-- ------------------------------------------------------------
-- 3. APAGAR SEGUE SÓ DO RH
--
-- A tentação era deixar a pessoa remover a própria pendência quando o
-- dia passa a fechar certo. Seria um buraco: bastaria apagar a linha
-- para o débito sumir, e a apuração só é refeita quando alguém bate ou
-- corrige.
--
-- O dia que zera é REESCRITO como aprovado pela tolerância — diferença
-- zero cabe em qualquer tolerância —, o que tira da fila sem apagar
-- nada e preserva o histórico.
--
-- Não há nada a rodar aqui. A regra continua como está.
-- ------------------------------------------------------------

notify pgrst, 'reload schema';

-- ============================================================
-- CONFERÊNCIA — UMA CONSULTA SÓ
--
-- As três primeiras linhas conferem as regras. As duas últimas olham os
-- dois dias da Fernanda que motivaram este arquivo.
-- ============================================================
with conferencia as (
  select 1 as ordem, 'Tolerância automática consegue gravar' as verificacao,
    coalesce(
      (select case when with_check like '%tolerancia_automatica%' then 'OK' else 'FALTA' end
         from pg_policies
        where schemaname = 'public' and tablename = 'ajustes_jornada' and cmd = 'INSERT'),
      'FALTA'
    ) as situacao

  union all
  select 2, 'Reescrever para aprovado pela tolerância',
    coalesce(
      (select case when with_check like '%tolerancia_automatica%' then 'OK' else 'FALTA' end
         from pg_policies
        where schemaname = 'public' and tablename = 'ajustes_jornada' and cmd = 'UPDATE'),
      'FALTA'
    )

  union all
  select 3, 'Apagar apuração segue só do RH (tem de continuar assim)',
    coalesce(
      (select case
         when qual like '%posso_decidir_jornada%' or qual like '%meu_colaborador_id%'
           then 'ATENÇÃO · alguém além do RH apaga apuração'
         else 'OK · só o RH'
       end
         from pg_policies
        where schemaname = 'public' and tablename = 'ajustes_jornada' and cmd = 'DELETE'),
      'FALTA · a regra não existe'
    )

  union all
  select 4, 'As apurações da Fernanda que estão na fila',
    coalesce(
      (select string_agg(
         to_char(a.data, 'DD/MM') || ': ' || a.tipo || ' ' || a.minutos || 'min' ||
         ' (trab ' || a.minutos_trabalhados || ' de ' || a.minutos_previstos || ')' ||
         ' · ' || a.estado || ' · ' || coalesce(a.origem, '?'),
         E'\n' order by a.data)
         from public.ajustes_jornada a
         join public.colaboradores c on c.id = a.colaborador_id
        where c.nome ilike '%fernanda%' and a.estado = 'pendente'),
      'nenhuma pendente'
    )

  union all
  select 5, 'As batidas dela nesses dias',
    coalesce(
      (select string_agg(
         to_char(r.data, 'DD/MM') || ' ' || r.tipo || ' ' || r.hora_formatada ||
         ' (' || r.metodo || ')',
         E'\n' order by r.data, r.horario)
         from public.registros_ponto r
         join public.colaboradores c on c.id = r.colaborador_id
        where c.nome ilike '%fernanda%'
          and r.data in (
            select a.data from public.ajustes_jornada a
             where a.colaborador_id = c.id and a.estado = 'pendente'
          )),
      'nenhuma batida nesses dias'
    )
)
select verificacao, situacao from conferencia order by ordem;
