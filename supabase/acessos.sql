-- ============================================================
-- CONECTA — Malachias Autopeças
-- Regras de criação de acesso
--
-- ESTE ARQUIVO NÃO PRECISA MAIS SER RODADO.
--
-- O que ele fazia foi para dentro de supabase/esquema.sql, na seção
-- "ATIVAÇÃO DE ACESSO". Rode só o esquema.
--
-- POR QUE ELE FICOU VAZIO, E NÃO FOI APAGADO
--
-- Este arquivo e o esquema definiam a MESMA função —
-- `criar_colaborador_do_usuario()` — com comportamentos opostos:
--
--   aqui         → ligava a conta de acesso a uma ficha que já existe
--   no esquema   → criava uma ficha nova a cada primeiro acesso
--
-- Em Postgres, `create or replace function` não reclama de conflito: vale a
-- última versão executada. Como o esquema foi rodado várias vezes depois
-- deste arquivo, era a versão errada que estava valendo no banco.
--
-- O efeito prático: o gerente de Pirassununga tentava entrar e, em vez de
-- assumir a ficha dele — nível 3, loja, CNPJ, tudo vindo da planilha —
-- nascia um segundo cadastro, nível 1, Balcão, em branco. A ficha boa ficava
-- órfã, sem ninguém conseguindo acessá-la.
--
-- Se este arquivo fosse apagado, o texto antigo continuaria em qualquer aba
-- ou anotação salva, e um dia alguém o rodaria de novo. Ele fica aqui, vazio
-- e inofensivo, dizendo o que aconteceu.
-- ============================================================

-- Confere o que está valendo no banco agora. O esperado é uma função só,
-- e que ela ADOTE a ficha existente em vez de criar outra.
select
  exists (
    select 1 from pg_proc
     where proname = 'criar_colaborador_do_usuario'
       and prosrc ilike '%Login nao cadastrado na rede%'
  ) as gatilho_adota_ficha_existente,
  (select count(*) from public.colaboradores)                       as fichas_cadastradas,
  (select count(*) from public.colaboradores where auth_user_id is not null) as acessos_ativados;
