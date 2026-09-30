-- ============================================================
-- A CIÊNCIA DA ADVERTÊNCIA: O ADVERTIDO SÓ ASSINA (30/09/2026)
--
-- A aba Eu ganhou "Meu RH", e a ciência da advertência é dada lá. A
-- política de UPDATE deixava a pessoa reescrever a advertência inteira —
-- motivo, tipo, data — e apagar a ciência. Agora ela só assina, uma vez.
--
-- Este arquivo é o delta; o esquema inteiro está em esquema.sql.
-- ============================================================

-- A CIÊNCIA DA ADVERTÊNCIA: a pessoa só assina, uma vez.
--
-- A política de UPDATE deixa quem recebeu a advertência gravar na linha
-- dela — é assim que a ciência entra. Só que deixava a linha INTEIRA: o
-- motivo, o tipo, a data, e até apagar a ciência já dada. Advertência que
-- o advertido reescreve não é registro de nada.
--
-- Fora do RH e do TI (e do SQL Editor, sem usuário), tudo volta ao que
-- era, menos a ciência — e ela só entra se ainda não havia, com a hora do
-- banco, não a do aparelho.
--
-- A tabela nasce em `rh-holerite-advertencia.sql`; por isso o gatilho só
-- é ligado quando ela existe.
create or replace function public.advertido_so_da_ciencia()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  ciencia timestamptz;
begin
  if auth.uid() is null or public.cuido_de_pessoas() then
    return new;
  end if;

  ciencia := case
    when old.ciencia_em is null and new.ciencia_em is not null then now()
    else old.ciencia_em
  end;

  new := old;
  new.ciencia_em := ciencia;
  return new;
end;
$$;

do $$
begin
  if to_regclass('public.advertencias') is not null then
    drop trigger if exists advertencias_so_ciencia on public.advertencias;
    create trigger advertencias_so_ciencia
      before update on public.advertencias
      for each row execute function public.advertido_so_da_ciencia();
  end if;
end;
$$;

notify pgrst, 'reload schema';

-- Conferência: a função existe e o gatilho está ligado na tabela.
select
  (select count(*) from pg_proc where proname = 'advertido_so_da_ciencia') as funcao_criada,
  (select count(*) from pg_trigger where tgname = 'advertencias_so_ciencia') as gatilho_ligado,
  (select count(*) from public.advertencias where ciencia_em is null) as aguardando_ciencia;
