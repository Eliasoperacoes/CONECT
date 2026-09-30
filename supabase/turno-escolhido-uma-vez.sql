-- ============================================================
-- O HORÁRIO ESCOLHIDO UMA VEZ, NA PRIMEIRA BATIDA (30/09/2026)
--
-- As 91 fichas estavam no Turno A. Quem entra às 08:20 era cobrado como
-- atrasado 50 minutos, e a batida ficava segurada na tela do motivo — a
-- da Maria Clara se perdeu assim. Agora a pessoa diz o próprio horário
-- uma vez, e depois só RH e TI mudam.
--
-- Este arquivo é o delta; o esquema inteiro está em esquema.sql.
-- ============================================================

alter table public.colaboradores
  add column if not exists turno_confirmado_em timestamptz;

-- Quem já está num turno diferente do padrão foi escolhido por alguém
-- (a Lyvia, no E3): não pergunta de novo.
update public.colaboradores
   set turno_confirmado_em = now()
 where turno <> 'A'
   and turno_confirmado_em is null;

-- O HORÁRIO, ESCOLHIDO UMA VEZ.
--
-- Todas as fichas nasceram no Turno A, e o turno B era cobrado como
-- atrasado todo dia. A pessoa diz o próprio horário na primeira batida —
-- uma vez, e só entre os do perfil dela; depois, só RH e TI mudam.
--
-- E a jornada inteira fica fora do alcance da própria pessoa: turno,
-- cargas, sábado, intervalo e cargo (que decide se ela é de estágio). A
-- política de UPDATE deixa cada um gravar a própria linha, e sem isto
-- bastava encurtar a própria carga para nunca mais dever hora.
--
-- Como no organograma, o campo protegido volta ao valor antigo em vez de
-- recusar: o app grava a linha inteira ao trocar a foto.
--
-- O perfil (estágio ou integral) repete `ehDeEstagio` e os turnos repetem
-- `turnosParaEscolher` (tipos.ts). Mudou lá, mude aqui.
create or replace function public.turno_escolhido_uma_vez()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  estagio boolean;
begin
  -- Sem usuário (`auth.uid()` nulo) é o SQL Editor do TI: sem isto, a
  -- correção de turno feita por script voltaria ao valor antigo calada
  if auth.uid() is null or public.cuido_de_pessoas() then
    -- RH e TI escolhendo o turno de alguém: está confirmado
    if tg_op = 'INSERT' then
      if new.turno <> 'A' then
        new.turno_confirmado_em := coalesce(new.turno_confirmado_em, now());
      end if;
    elsif new.turno is distinct from old.turno then
      new.turno_confirmado_em := now();
    end if;
    return new;
  end if;

  if tg_op = 'INSERT' then
    return new;
  end if;

  new.cargo                        := old.cargo;
  new.carga_horaria_diaria_minutos := old.carga_horaria_diaria_minutos;
  new.carga_semanal_minutos        := old.carga_semanal_minutos;
  new.trabalha_sabado              := old.trabalha_sabado;
  new.tem_intervalo                := old.tem_intervalo;

  estagio := lower(old.setor) like '%está%'
          or lower(old.setor) like '%esta%'
          or lower(old.cargo) like '%estagi%';

  -- A única troca aceita: quem nunca confirmou, confirmando agora um
  -- turno do próprio perfil. Qualquer outra coisa volta ao que era.
  if old.turno_confirmado_em is null
     and new.turno_confirmado_em is not null
     and (
       (estagio and new.turno in ('E1', 'E2', 'E3'))
       or (not estagio and new.turno in ('A', 'B'))
     )
  then
    new.turno_confirmado_em := now();
  else
    new.turno               := old.turno;
    new.turno_confirmado_em := old.turno_confirmado_em;
  end if;

  return new;
end;
$$;

drop trigger if exists colaboradores_turno_escolhido_uma_vez on public.colaboradores;
create trigger colaboradores_turno_escolhido_uma_vez
  before insert or update on public.colaboradores
  for each row execute function public.turno_escolhido_uma_vez();

notify pgrst, 'reload schema';

-- Conferência: a coluna existe, o gatilho está ligado, e quantos ainda
-- vão ser perguntados na próxima batida.
select
  (select count(*) from information_schema.columns
    where table_name = 'colaboradores' and column_name = 'turno_confirmado_em') as coluna_criada,
  (select count(*) from pg_trigger
    where tgname = 'colaboradores_turno_escolhido_uma_vez') as gatilho_ligado,
  (select count(*) from public.colaboradores
    where ativo and turno_confirmado_em is null) as vao_escolher,
  (select count(*) from public.colaboradores
    where ativo and turno_confirmado_em is not null) as ja_confirmados;
