-- ============================================================
-- CONECTA — O ARQUIVO DO HOLERITE TAMBÉM PRECISA SER PROTEGIDO
--
-- O QUE ESTAVA ERRADO
--
-- A regra do balde era `bucket_id = 'anexos'` e nada mais: QUALQUER PESSOA
-- AUTENTICADA LIA QUALQUER ARQUIVO.
--
-- Para anexo de conversa isso passava, porque o caminho leva o id aleatório
-- da mensagem e ninguém adivinha. Para holerite NÃO passa: o caminho é
-- `holerites/<id-do-colaborador>/2026-09.pdf`, e os ids dos colegas
-- aparecem na lista de equipe. Bastava montar o endereço.
--
-- A proteção das tabelas `holerites` e `advertencias` vale para a LINHA.
-- Esta aqui vale para o ARQUIVO — e sem as duas, a primeira não protege
-- nada.
--
-- Pode rodar mais de uma vez sem quebrar nada.
-- ============================================================

-- ------------------------------------------------------------
-- LEITURA
--
-- Documento pessoal: só o dono e quem cuida de pessoas.
-- Anexo de conversa: como sempre foi.
--
-- O caminho é `<pasta>/<id-do-colaborador>/<arquivo>`, e é o segundo
-- pedaço que diz de quem o documento é.
-- ------------------------------------------------------------
drop policy if exists anexos_leitura on storage.objects;
create policy anexos_leitura on storage.objects
  for select to authenticated
  using (
    bucket_id = 'anexos'
    and (
      case
        when split_part(name, '/', 1) in ('holerites', 'advertencias') then
          split_part(name, '/', 2) = public.meu_colaborador_id()
          or public.cuido_de_pessoas()
        else true
      end
    )
  );

-- ------------------------------------------------------------
-- ENVIO
--
-- Documento pessoal só é publicado por quem cuida de pessoas. Sem isto,
-- qualquer pessoa poderia subir um arquivo na pasta de outra — e o holerite
-- que a vítima abrisse seria o que o invasor pôs lá.
-- ------------------------------------------------------------
drop policy if exists anexos_envio on storage.objects;
create policy anexos_envio on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'anexos'
    and (
      case
        when split_part(name, '/', 1) in ('holerites', 'advertencias')
          then public.cuido_de_pessoas()
        else true
      end
    )
  );

-- ------------------------------------------------------------
-- REMOÇÃO
--
-- O expurgo de histórico continua sendo da administração. O que muda é que
-- o RH passa a apagar os documentos pessoais que ele mesmo publicou —
-- antes não conseguia, e a linha sumia da tabela deixando o arquivo órfão
-- no balde para sempre.
-- ------------------------------------------------------------
drop policy if exists anexos_remocao on storage.objects;
create policy anexos_remocao on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'anexos'
    and (
      case
        when split_part(name, '/', 1) in ('holerites', 'advertencias')
          then public.cuido_de_pessoas()
        else public.sou_admin()
      end
    )
  );

-- ============================================================
-- CONFERÊNCIA
--
-- Tem que aparecer TRÊS linhas, e nenhuma delas pode ser só
-- "bucket_id = 'anexos'" — é exatamente isso que deixava o holerite aberto.
-- ============================================================
select
  policyname as regra,
  cmd        as operacao,
  case
    when coalesce(qual, with_check) like '%holerites%' then 'protegido'
    else 'ABERTO — confira'
  end        as estado
from pg_policies
where schemaname = 'storage'
  and tablename = 'objects'
  and policyname like 'anexos_%'
order by cmd;
