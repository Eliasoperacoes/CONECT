-- ============================================================
-- O LÍDER CONSEGUE DECIDIR A JORNADA DE QUEM RESPONDE POR ELE
-- CONECTA / Malachias Autopeças
--
-- Sintoma: "new row violates row-level security policy for table
-- ajustes_jornada" na aba Aprovar jornadas.
--
-- São DUAS regras diferentes desalinhadas, e cada uma sozinha já quebra
-- a tela. Por isso as duas estão neste arquivo.
--
-- ------------------------------------------------------------
-- 1. CRIAR A PENDÊNCIA (o que causou o erro da tela)
-- ------------------------------------------------------------
--
-- Quando o líder abre "Aprovar jornadas", o sistema varre os dias da
-- equipe e ABRE uma linha de pendência para cada dia que fechou pela
-- metade. Quem está gravando é o líder; a linha é de outra pessoa.
--
-- Só que a política de criação conhecia dois casos:
--
--     a própria pessoa (estado pendente)   ou   RH / Diretoria / TI
--
-- Líder e gerente não são nenhum dos dois. O banco recusava, e a aba
-- mostrava o erro em vermelho.
--
-- Repare que a LEITURA e a DECISÃO já sabiam de líder — as duas chamam
-- `posso_decidir_jornada`. Só a criação tinha a regra escrita à mão, e
-- foi ela que ficou para trás. É o mesmo tropeço que este sistema já
-- levou quatro vezes: a mesma decisão em dois lugares, divergindo depois.
--
-- ------------------------------------------------------------
-- 2. O LÍDER DECIDE TAMBÉM A PRÓPRIA JORNADA
-- ------------------------------------------------------------
--
-- Foi combinado que o líder aprova as próprias horas. A tela já faz
-- isso; o banco continuava com "ninguém decide sobre a própria hora, em
-- nível nenhum". Então a fila mostrava o dia dele e o botão recusava.
--
-- ATENÇÃO, PORQUE ISTO AFROUXA UMA TRAVA: quem responde por alguém passa
-- a carimbar a própria hora. Quem NÃO responde por ninguém continua sem
-- poder — é o que impede o balconista de aprovar a si mesmo.
-- ============================================================

-- ------------------------------------------------------------
-- QUEM DECIDE SOBRE A JORNADA DE QUEM
-- ------------------------------------------------------------
create or replace function public.posso_decidir_jornada(alvo text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    -- O LÍDER DECIDE A PRÓPRIA JORNADA.
    -- Condicionado a responder por alguém: sem isso, qualquer pessoa
    -- aprovaria as próprias horas e a fila deixaria de existir.
    (
      alvo = public.meu_colaborador_id()
      and exists (
        select 1 from public.colaboradores
         where responsavel_id = public.meu_colaborador_id()
      )
    )

    or (
      -- Os demais casos seguem exigindo que o alvo seja outra pessoa
      alvo is distinct from public.meu_colaborador_id()
      and (
        -- RH, Diretoria e TI seguem por fora da cadeia: o controle é deles
        public.cuido_de_pessoas()

        -- POSICIONADO NO ORGANOGRAMA: só a cadeia dele decide. O alcance
        -- automático por setor e por loja deixa de valer para esta pessoa —
        -- é isto que faz o organograma ser regra, e não desenho.
        or (
          exists (
            select 1 from public.colaboradores
             where id = alvo and responsavel_id is not null
          )
          and public.estou_na_cadeia_de(alvo)
        )

        -- AINDA NÃO POSICIONADO: a regra automática de antes, que impede as
        -- horas de quem falta posicionar de ficarem paradas na fila
        or exists (
          select 1
            from public.colaboradores solicitante,
                 public.colaboradores eu
           where solicitante.id = alvo
             and solicitante.responsavel_id is null
             and eu.id = public.meu_colaborador_id()
             -- A decisão sobe: quem está no mesmo degrau não aprova o colega
             and eu.nivel > solicitante.nivel
             and (
               -- Gerente responde pela loja inteira
               (eu.nivel >= 3 and eu.loja = solicitante.loja)
               -- O alcance por setor é do líder, e só dele: se valesse acima,
               -- um gerente de outra loja decidiria sobre quem não é dele só
               -- por partilharem o setor
               or (eu.nivel = 2 and eu.setor = solicitante.setor)
             )
        )
      )
    );
$$;

-- ------------------------------------------------------------
-- CRIAÇÃO DA PENDÊNCIA
--
-- Agora com os três casos, e o terceiro escrito pela MESMA função que a
-- leitura e a decisão usam — não repetido à mão, que foi o que permitiu
-- a divergência.
--
-- O líder só abre linha PENDENTE. Ele levanta o dia para decidir; não
-- pode inserir um dia já carimbado como aprovado, que seria aprovar sem
-- passar pela fila.
-- ------------------------------------------------------------
drop policy if exists ajustes_abertura on public.ajustes_jornada;
create policy ajustes_abertura on public.ajustes_jornada
  for insert to authenticated
  with check (
    (colaborador_id = public.meu_colaborador_id() and estado = 'pendente')
    or public.cuido_de_pessoas()
    or (public.posso_decidir_jornada(colaborador_id) and estado = 'pendente')
  );

notify pgrst, 'reload schema';

-- ============================================================
-- CONFERÊNCIA
--
-- "Success" aparece igual ao rodar um arquivo antigo. O que vale é o que
-- estas linhas mostram.
-- ============================================================

-- 1. A regra de criação tem de citar posso_decidir_jornada
select
  policyname as politica,
  case
    when with_check like '%posso_decidir_jornada%' then 'OK — o líder consegue abrir a pendência'
    else 'AINDA NÃO — rodou o arquivo certo?'
  end as situacao
from pg_policies
where schemaname = 'public'
  and tablename = 'ajustes_jornada'
  and cmd = 'INSERT';

-- 2. A função tem de conhecer o caso do próprio líder
select
  case
    when pg_get_functiondef(p.oid) like '%alvo = public.meu_colaborador_id()%'
      then 'OK — o líder decide a própria jornada'
    else 'AINDA NÃO — a função é a antiga'
  end as situacao
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'posso_decidir_jornada';
