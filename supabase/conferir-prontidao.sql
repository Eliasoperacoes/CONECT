-- ============================================================
-- CONECTA — O BANCO ESTÁ PRONTO PARA A LOJA INTEIRA?
--
-- ESTE ARQUIVO NÃO ALTERA NADA. São quatro consultas.
--
-- ------------------------------------------------------------
-- POR QUE ELE EXISTE
-- ------------------------------------------------------------
--
-- O chat da rede parou por UMA coluna. Toda mensagem passou a levar
-- `publicacao_id`, o script que a cria ficou por rodar, e o PostgREST
-- recusou CADA envio — inclusive um "bom dia", que manda a coluna como
-- nula do mesmo jeito. A tela dizia "Verifique a conexão".
--
-- Antes de abrir para 89 pessoas, a pergunta tem de ser feita de uma vez
-- e para TODAS as tabelas: o banco tem tudo o que o código manda?
--
-- A lista da consulta 1 é gerada a partir dos próprios mapeadores do
-- código (`paraLinha`, `paraLinhaPonto`, `paraLinhaMensagem`...), e há um
-- teste na suíte que reprova se ela sair de sincronia com eles. Coluna
-- nova no código sem coluna nova aqui não passa da revisão.
-- ============================================================

-- ============================================================
-- 1. FALTA ALGUMA COLUNA?
--
-- O resultado ESPERADO é NENHUMA LINHA. Cada linha que aparecer é uma
-- função que vai falhar em produção, com a tabela e a coluna a criar.
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
  ('avisos_rede', 'titulo')
)
select
  e.tabela,
  e.coluna,
  'FALTA NO BANCO' as situacao
  from esperadas e
  left join information_schema.columns c
    on c.table_schema = 'public'
   and c.table_name   = e.tabela
   and c.column_name  = e.coluna
 where c.column_name is null
 order by e.tabela, e.coluna;

-- ============================================================
-- 2. AS TABELAS QUE O SISTEMA ESCREVE TÊM POLÍTICA PARA ESCREVER?
--
-- RLS ligada sem política de UPDATE não dá erro: o update afeta ZERO
-- linhas e devolve sucesso. A tela diz "salvo" e o banco não mudou —
-- já aconteceu aqui, e é o pior tipo de falha porque ninguém procura.
--
-- Esperado: `tem_update` e `tem_insert` verdadeiros em todas.
-- `rls_ligada` falso numa tabela de dados também merece atenção: quer
-- dizer que qualquer pessoa autenticada lê tudo.
-- ============================================================
select
  t.tabela,
  c.relrowsecurity as rls_ligada,
  count(*) filter (where p.cmd in ('SELECT', 'ALL')) > 0 as tem_select,
  count(*) filter (where p.cmd in ('INSERT', 'ALL')) > 0 as tem_insert,
  count(*) filter (where p.cmd in ('UPDATE', 'ALL')) > 0 as tem_update,
  count(*) filter (where p.cmd in ('DELETE', 'ALL')) > 0 as tem_delete,
  count(p.polname)                                       as politicas
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
 order by t.tabela;

-- ============================================================
-- 3. O QUE JÁ ESTÁ LÁ DENTRO
--
-- O retrato antes de abrir para a loja inteira: quanta gente, quantos
-- já bateram ponto, quanta conversa existe.
-- ============================================================
select
  (select count(*) from public.colaboradores where ativo)            as pessoas_ativas,
  (select count(distinct colaborador_id) from public.registros_ponto) as ja_bateram_ponto,
  (select count(*) from public.registros_ponto)                       as marcacoes,
  (select count(*) from public.ajustes_jornada)                       as apuracoes,
  (select count(*) from public.ajustes_jornada where estado = 'pendente')
                                                                      as apuracoes_na_fila,
  (select count(*) from public.conversas)                             as conversas,
  (select count(*) from public.mensagens)                             as mensagens,
  (select count(*) from public.avisos_rede)                           as publicacoes;

-- ============================================================
-- 4. QUEM TEM SALDO SEM NUNCA TER BATIDO PONTO
--
-- É lixo do período de testes: apuração gravada para quem não tem
-- marcação nenhuma. Antes de abrir para a loja, o saldo dessa gente tem
-- de começar em zero — senão a primeira coisa que a pessoa vê ao entrar
-- é um débito que ela não fez.
--
-- Quem limpa é `zerar-saldo-sem-ponto.sql`.
-- ============================================================
select
  c.nome,
  c.setor,
  c.loja,
  count(*)                                                     as apuracoes,
  sum(case when a.tipo = 'debito' then -a.minutos else a.minutos end)
    filter (where a.estado = 'aprovado')                       as saldo_min,
  min(a.data)                                                  as primeira,
  max(a.data)                                                  as ultima
  from public.ajustes_jornada a
  join public.colaboradores c on c.id = a.colaborador_id
 where not exists (
   select 1 from public.registros_ponto r where r.colaborador_id = a.colaborador_id
 )
 group by c.nome, c.setor, c.loja
 order by c.nome;
