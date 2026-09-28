-- ============================================================
-- CONECTA — A FOTO DE PERFIL PASSA A VIVER NO BALDE
--
-- O QUE ESTE ARQUIVO FAZ
--
-- Acrescenta o prefixo `perfil/` às regras do balde `anexos`: quem sobe
-- e quem apaga a foto de alguém.
--
-- Não cria balde nem coluna. A foto continua saindo de
-- `colaboradores.foto` — o que muda é o que está escrito nela: antes o
-- JPEG inteiro em base64, agora o caminho `perfil/<id>/<hora>.jpg`.
--
-- ------------------------------------------------------------
-- POR QUE A FOTO SAIU DA COLUNA
-- ------------------------------------------------------------
--
-- Ela era gravada como TEXTO dentro da ficha, em base64. Três
-- consequências, e a terceira é a que custava caro:
--
--   1. contava no limite do BANCO, não no do Storage
--   2. não tinha cache de navegador: não era endereço, era conteúdo
--   3. VIAJAVA INTEIRA a cada sincronização de colaboradores — e essa
--      roda ao entrar e a cada alteração em QUALQUER ficha, porque o
--      tempo real avisa todos os aparelhos
--
-- Estimado com as 89 pessoas e duas entradas por dia: 15,7 GB por mês,
-- três vezes o limite de tráfego do plano gratuito, só para mostrar as
-- caras na lista de conversas.
--
-- ------------------------------------------------------------
-- O QUE CADA REGRA DECIDE
-- ------------------------------------------------------------
--
-- LER continua aberto a quem está autenticado. É o rosto do colega na
-- lista de conversas e no organograma — se cada um só enxergasse o
-- próprio, a foto não serviria para nada.
--
-- SUBIR e APAGAR ficam com o DONO da pasta, ou com quem administra. O
-- caminho carrega o id da pessoa (`perfil/<id>/...`), e é ele que a
-- regra confere. Sem isto, qualquer pessoa autenticada poderia subir um
-- arquivo na pasta de outra — e a foto que a rede inteira veria no
-- lugar do rosto dela seria a que o invasor pôs lá.
--
-- APAGAR importa porque cada troca cria um arquivo NOVO, com a hora no
-- nome. Sobrescrever o mesmo caminho exigiria permissão de UPDATE no
-- balde, que não existe — as regras cobrem select, insert e delete.
-- Sem poder apagar o anterior, cada troca deixaria o arquivo velho
-- ocupando espaço para sempre.
-- ============================================================

-- ------------------------------------------------------------
-- SUBIR
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
        -- A foto é da pessoa: `perfil/<id dela>/<hora>.jpg`
        when split_part(name, '/', 1) = 'perfil'
          then split_part(name, '/', 2) = public.meu_colaborador_id()
            or public.cuido_de_pessoas()
        else true
      end
    )
  );

-- ------------------------------------------------------------
-- APAGAR
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
        -- Cada troca cria arquivo novo; o dono apaga o anterior
        when split_part(name, '/', 1) = 'perfil'
          then split_part(name, '/', 2) = public.meu_colaborador_id()
            or public.cuido_de_pessoas()
        else public.sou_admin()
      end
    )
  );

-- ============================================================
-- CONFERÊNCIA
--
-- As duas regras têm de citar `perfil`, e a de LEITURA não — ela
-- continua aberta de propósito.
--
-- envio_conhece_perfil ....... true
-- remocao_conhece_perfil ..... true
-- leitura_segue_aberta ....... true
-- fotos_ainda_em_base64 ...... quantas faltam converter
-- ============================================================
/* `with_check` guarda a regra do INSERT e `qual` a do DELETE; somar os
   dois evita conferir a coluna errada e concluir que falta o que está lá */
select
  (select count(*) > 0 from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'anexos_envio'
      and coalesce(qual, '') || coalesce(with_check, '') like '%perfil%')
    as envio_conhece_perfil,

  (select count(*) > 0 from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'anexos_remocao'
      and coalesce(qual, '') || coalesce(with_check, '') like '%perfil%')
    as remocao_conhece_perfil,

  (select count(*) > 0 from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'anexos_leitura')
    as leitura_segue_aberta,

  (select count(*) from public.colaboradores where foto like 'data:image%')
    as fotos_ainda_em_base64,

  (select count(*) from public.colaboradores where foto like 'perfil/%')
    as fotos_ja_no_balde;
