-- ============================================================
-- CONECTA — O BANCO ESTÁ PRONTO PARA A LOJA INTEIRA?
--
-- ESTE ARQUIVO NÃO ALTERA NADA. É UMA CONSULTA SÓ.
--
-- ------------------------------------------------------------
-- POR QUE UMA SÓ
-- ------------------------------------------------------------
--
-- O SQL Editor do Supabase mostra o resultado da ÚLTIMA instrução. Um
-- arquivo com quatro `select` devolve quatro respostas e deixa três
-- invisíveis — e foi o que aconteceu três vezes seguidas aqui: o
-- resultado que chegava era sempre o do fim, e o que decidia o rollout
-- ficava para trás.
--
-- Então tudo vem numa tabela só, com uma coluna `secao` dizendo do que
-- cada linha trata. Rolar a lista é mais barato do que rodar de novo.
--
-- ------------------------------------------------------------
-- COMO LER
-- ------------------------------------------------------------
--
-- `1. COLUNA FALTANDO`  Se aparecer QUALQUER linha aqui, o rollout
--                       para: é uma função que vai falhar, com a
--                       tabela e a coluna a criar. É o que teria pego
--                       o `publicacao_id` antes de o chat parar.
--
-- `2. POLÍTICA`         `tem_insert` e `tem_update` precisam dizer
--                       "sim". RLS ligada sem política de UPDATE não
--                       dá erro: afeta zero linhas e devolve sucesso.
--
-- `3. RETRATO`          Quanta gente, quanto ponto, quanta conversa.
--
-- `4. SALDO SEM PONTO`  Quem tem apuração sem marcação nenhuma — lixo
--                       do piloto. Limpa com `zerar-saldo-sem-ponto.sql`.
--
-- A lista de colunas da seção 1 é gerada dos mapeadores do código, e um
-- teste na suíte reprova se ela sair de sincronia com eles.
-- ============================================================

with esperadas (tabela, coluna) as (values
('colaboradores', 'ativo'),
  ('colaboradores', 'carga_horaria_diaria_minutos'),
  ('colaboradores', 'carga_semanal_minutos'),
  ('colaboradores', 'cargo'),
  ('colaboradores', 'cnpj'),
  ('colaboradores', 'data_admissao'),
  ('colaboradores', 'departamento'),
  ('colaboradores', 'email'),
  ('colaboradores', 'foto'),
  ('colaboradores', 'id'),
  ('colaboradores', 'login'),
  ('colaboradores', 'loja'),
  ('colaboradores', 'matricula'),
  ('colaboradores', 'nivel'),
  ('colaboradores', 'nome'),
  ('colaboradores', 'observacoes'),
  ('colaboradores', 'presenca'),
  ('colaboradores', 'ramal'),
  ('colaboradores', 'responsavel_id'),
  ('colaboradores', 'setor'),
  ('colaboradores', 'telefone'),
  ('colaboradores', 'tem_intervalo'),
  ('colaboradores', 'trabalha_sabado'),
  ('colaboradores', 'turno'),
  ('colaboradores', 'visto_por_ultimo'),
  ('registros_ponto', 'ajustado_por_id'),
  ('registros_ponto', 'ajustado_por_nome'),
  ('registros_ponto', 'colaborador_id'),
  ('registros_ponto', 'data'),
  ('registros_ponto', 'hora_formatada'),
  ('registros_ponto', 'horario'),
  ('registros_ponto', 'id'),
  ('registros_ponto', 'justificativa'),
  ('registros_ponto', 'loja'),
  ('registros_ponto', 'metodo'),
  ('registros_ponto', 'tipo'),
  ('ajustes_jornada', 'anexo_caminho'),
  ('ajustes_jornada', 'aprovador_id'),
  ('ajustes_jornada', 'aprovador_nome'),
  ('ajustes_jornada', 'colaborador_id'),
  ('ajustes_jornada', 'data'),
  ('ajustes_jornada', 'decidido_em'),
  ('ajustes_jornada', 'estado'),
  ('ajustes_jornada', 'id'),
  ('ajustes_jornada', 'minutos'),
  ('ajustes_jornada', 'minutos_previstos'),
  ('ajustes_jornada', 'minutos_trabalhados'),
  ('ajustes_jornada', 'motivo_colaborador'),
  ('ajustes_jornada', 'observacao'),
  ('ajustes_jornada', 'origem'),
  ('ajustes_jornada', 'tipo'),
  ('justificativas_ausencia', 'anexo_caminho'),
  ('justificativas_ausencia', 'anexo_nome'),
  ('justificativas_ausencia', 'aprovador_id'),
  ('justificativas_ausencia', 'aprovador_nome'),
  ('justificativas_ausencia', 'colaborador_id'),
  ('justificativas_ausencia', 'data_fim'),
  ('justificativas_ausencia', 'data_inicio'),
  ('justificativas_ausencia', 'decidido_em'),
  ('justificativas_ausencia', 'estado'),
  ('justificativas_ausencia', 'id'),
  ('justificativas_ausencia', 'motivo_recusa'),
  ('justificativas_ausencia', 'observacao'),
  ('justificativas_ausencia', 'tipo'),
  ('mensagens', 'anexo_caminho'),
  ('mensagens', 'arquivo_nome'),
  ('mensagens', 'arquivo_tamanho'),
  ('mensagens', 'arquivo_url'),
  ('mensagens', 'audio_duracao'),
  ('mensagens', 'audio_url'),
  ('mensagens', 'conversa_id'),
  ('mensagens', 'criado_em'),
  ('mensagens', 'editada_em'),
  ('mensagens', 'eh_aviso_direcao'),
  ('mensagens', 'eh_encaminhada'),
  ('mensagens', 'fixada_em'),
  ('mensagens', 'fixada_por_id'),
  ('mensagens', 'id'),
  ('mensagens', 'imagem_url'),
  ('mensagens', 'legenda'),
  ('mensagens', 'publicacao_id'),
  ('mensagens', 'reacoes'),
  ('mensagens', 'remetente_id'),
  ('mensagens', 'responde_a'),
  ('mensagens', 'texto'),
  ('mensagens', 'tipo'),
  ('conversas', 'apenas_gestores_publicam'),
  ('conversas', 'atualizado_em'),
  ('conversas', 'criado_por_id'),
  ('conversas', 'descricao'),
  ('conversas', 'eh_sistema_padrao'),
  ('conversas', 'foto'),
  ('conversas', 'id'),
  ('conversas', 'nome'),
  ('conversas', 'tipo'),
  ('auditoria', 'acao'),
  ('auditoria', 'categoria'),
  ('auditoria', 'data_hora'),
  ('auditoria', 'detalhes'),
  ('auditoria', 'id'),
  ('auditoria', 'usuario_nome'),
  ('avisos_rede', 'anexo_caminho'),
  ('avisos_rede', 'anexo_nome'),
  ('avisos_rede', 'autor_cargo'),
  ('avisos_rede', 'autor_id'),
  ('avisos_rede', 'autor_nome'),
  ('avisos_rede', 'categoria'),
  ('avisos_rede', 'conteudo'),
  ('avisos_rede', 'criado_em'),
  ('avisos_rede', 'destinos'),
  ('avisos_rede', 'exige_confirmacao'),
  ('avisos_rede', 'fixado_no_topo'),
  ('avisos_rede', 'id'),
  ('avisos_rede', 'loja_destino'),
  ('avisos_rede', 'prioridade'),
  ('avisos_rede', 'tipo'),
  ('avisos_rede', 'titulo')),

politicas as (
  select
    t.tabela,
    c.relrowsecurity as rls,
    count(*) filter (where p.cmd in ('INSERT', 'ALL')) > 0 as tem_insert,
    count(*) filter (where p.cmd in ('UPDATE', 'ALL')) > 0 as tem_update,
    count(*) filter (where p.cmd in ('SELECT', 'ALL')) > 0 as tem_select,
    count(p.polname) as quantas
    from (values
      ('colaboradores'), ('registros_ponto'), ('ajustes_jornada'),
      ('justificativas_ausencia'), ('mensagens'), ('conversas'),
      ('participantes'), ('avisos_rede'), ('auditoria')
    ) as t(tabela)
    join pg_class c on c.relname = t.tabela
     and c.relnamespace = 'public'::regnamespace
    left join (
      select polrelid, polname,
             case polcmd when 'r' then 'SELECT' when 'a' then 'INSERT'
                         when 'w' then 'UPDATE' when 'd' then 'DELETE'
                         else 'ALL' end as cmd
        from pg_policy
    ) p on p.polrelid = c.oid
   group by t.tabela, c.relrowsecurity
)

select ordem, secao, item, valor, observacao from (

  -- 1. O QUE FALTA NO BANCO — nenhuma linha aqui é o resultado esperado
  select 1 as ordem, '1. COLUNA FALTANDO' as secao,
         e.tabela || '.' || e.coluna as item,
         'CRIAR NO BANCO' as valor,
         'o código manda esta coluna e o banco não tem' as observacao
    from esperadas e
    left join information_schema.columns c
      on c.table_schema = 'public'
     and c.table_name = e.tabela
     and c.column_name = e.coluna
   where c.column_name is null

  union all

  -- 2. AS POLÍTICAS DE ESCRITA
  select 2, '2. POLÍTICA', p.tabela,
         case when p.tem_insert and p.tem_update then 'ok'
              else 'ATENÇÃO' end,
         'rls ' || case when p.rls then 'ligada' else 'DESLIGADA' end ||
         ' · insert ' || case when p.tem_insert then 'sim' else 'NÃO' end ||
         ' · update ' || case when p.tem_update then 'sim' else 'NÃO' end ||
         ' · select ' || case when p.tem_select then 'sim' else 'NÃO' end ||
         ' · ' || p.quantas || ' política(s)'
    from politicas p

  union all

  -- 3. O RETRATO DE HOJE
  select 3, '3. RETRATO', x.item, x.valor::text, ''
    from (
      select 'pessoas ativas' as item,
             (select count(*) from public.colaboradores where ativo) as valor
      union all select 'já bateram ponto',
             (select count(distinct colaborador_id) from public.registros_ponto)
      union all select 'marcações', (select count(*) from public.registros_ponto)
      union all select 'apurações', (select count(*) from public.ajustes_jornada)
      union all select 'apurações na fila',
             (select count(*) from public.ajustes_jornada where estado = 'pendente')
      union all select 'conversas', (select count(*) from public.conversas)
      union all select 'mensagens', (select count(*) from public.mensagens)
      union all select 'publicações', (select count(*) from public.avisos_rede)
    ) x

  union all

  -- 4. SALDO DE QUEM NUNCA BATEU PONTO
  select 4, '4. SALDO SEM PONTO', c.nome,
         count(*) || ' apuração(ões)',
         'saldo aprovado: ' ||
           coalesce(sum(case when a.tipo = 'debito' then -a.minutos else a.minutos end)
             filter (where a.estado = 'aprovado'), 0) || ' min · ' ||
           c.setor || ' · ' || c.loja
    from public.ajustes_jornada a
    join public.colaboradores c on c.id = a.colaborador_id
   where not exists (
     select 1 from public.registros_ponto r where r.colaborador_id = a.colaborador_id
   )
   group by c.nome, c.setor, c.loja

) tudo
order by ordem, item;
