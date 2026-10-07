-- ============================================================
-- A PRÓPRIA FICHA: A PESSOA TROCA A FOTO, E SÓ O QUE É DELA — CONECTA
--
-- Um colaborador tentou trocar a foto e ouviu "new row violates
-- row-level security policy for table colaboradores" (07/10/2026). O app
-- gravava a ficha com UPSERT, que o Postgres trata como INSERT ... ON
-- CONFLICT — e a regra de INSERT é só de quem cuida de pessoas. A regra de
-- editar a própria ficha nunca chegava a valer: nem a foto nem a
-- presença de quem não é RH saíam do aparelho. O app passa a gravar com
-- UPDATE (nuvem.ts, atualizarFicha).
--
-- COM ISSO A REGRA DE EDITAR A PRÓPRIA LINHA PASSA A VALER DE VERDADE, e a
-- trava por coluna precisa cobrir tudo o que não é da pessoa. Ela já
-- devolvia o organograma (responsável, nível, loja, setor); passa a
-- devolver também nome, login, matrícula, CNPJ, departamento, data de
-- admissão e "ativo" — o CNPJ vai no comprovante da batida, a admissão
-- decide o espelho, e "ativo" é quem entra no sistema. Fica com a pessoa
-- o que o app já deixa (CAMPOS_PROPRIOS em bancoDados.ts): foto,
-- presença, ramal, telefone, e-mail e observações.
--
-- Devolve o valor antigo em vez de recusar: o app grava a linha toda, e a
-- troca de foto não pode morrer por um campo velho do cache.
-- Pode rodar de novo.
-- ============================================================

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

  -- O organograma: quem aprova a hora, a autorização e o alcance
  new.responsavel_id := old.responsavel_id;
  new.nivel          := old.nivel;
  new.loja           := old.loja;
  new.setor          := old.setor;

  -- A ficha funcional: é do RH, e a pessoa não a muda em si mesma
  new.nome           := old.nome;
  new.login          := old.login;
  new.matricula      := old.matricula;
  new.cnpj           := old.cnpj;
  new.departamento   := old.departamento;
  new.data_admissao  := old.data_admissao;
  new.ativo          := old.ativo;

  return new;
end;
$$;

drop trigger if exists colaboradores_organograma_protegido on public.colaboradores;
create trigger colaboradores_organograma_protegido
  before update on public.colaboradores
  for each row execute function public.apenas_rh_move_o_organograma();

notify pgrst, 'reload schema';

-- ============================================================
-- CONFERÊNCIA — o que esperar
--
-- protege_organograma .... true
-- protege_ficha .......... true   (CNPJ, admissão e "ativo" entre eles)
-- gatilho ................ true
-- ============================================================
select
  pg_get_functiondef('public.apenas_rh_move_o_organograma'::regproc) like '%new.nivel          := old.nivel%' as protege_organograma,
  pg_get_functiondef('public.apenas_rh_move_o_organograma'::regproc) like '%new.cnpj           := old.cnpj%'
    and pg_get_functiondef('public.apenas_rh_move_o_organograma'::regproc) like '%new.data_admissao  := old.data_admissao%'
    and pg_get_functiondef('public.apenas_rh_move_o_organograma'::regproc) like '%new.ativo          := old.ativo%' as protege_ficha,
  exists (select 1 from pg_trigger where tgname = 'colaboradores_organograma_protegido') as gatilho;
