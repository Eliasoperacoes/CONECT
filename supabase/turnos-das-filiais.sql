-- ============================================================
-- OS HORÁRIOS DAS FILIAIS (28/10/2026) — ALTERA
--
-- Nenhum dos dois horários de Pirassununga serve nas outras lojas. Entram
-- dois turnos das filiais, com almoço de 1h30 às 11:00 ou às 12:30,
-- conforme a pessoa (o almoço é medido pela duração, a partir da saída):
--
--   C  08:00 às 17:40
--   D  08:20 às 18:00
--
-- Na primeira batida cada um escolhe só entre os da própria loja:
-- Pirassununga (e a central) entre A e B; Porto Ferreira, Palmeiras,
-- Descalvado e Santa Rita entre C e D. O RH continua podendo pôr qualquer
-- turno na ficha.
--
-- DEPOIS DE RODAR: republicar apurar-ponto e lembrar-pendencias (os
-- arquivos gerados em supabase/functions/), que levam os turnos novos.
-- ============================================================

alter table public.colaboradores drop constraint if exists colaboradores_turno_check;
alter table public.colaboradores
  add constraint colaboradores_turno_check
  check (turno in ('A', 'B', 'C', 'D', 'E0', 'E1', 'E2', 'E3', 'P'));

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
-- `turnosParaEscolher` (tipos.ts). Mudou lá, mude aqui. As filiais
-- (turnos-das-filiais.sql, 28/10/2026) repetem as lojas 'Filial' de
-- INFORMACOES_LOJAS: Pirassununga e a central escolhem A ou B; as
-- filiais, C ou D.
create or replace function public.turno_escolhido_uma_vez()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  estagio boolean;
  filial  boolean;
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
  -- O horário digitado é do RH, como o turno (horario-proprio.sql)
  new.horario_proprio              := old.horario_proprio;

  estagio := lower(old.setor) like '%está%'
          or lower(old.setor) like '%esta%'
          or lower(old.cargo) like '%estagi%';
  filial  := old.loja in ('Porto Ferreira', 'Palmeiras', 'Descalvado', 'Santa Rita');

  -- A única troca aceita: quem nunca confirmou, confirmando agora um
  -- turno do próprio perfil e da própria loja. Qualquer outra coisa volta
  -- ao que era.
  if old.turno_confirmado_em is null
     and new.turno_confirmado_em is not null
     and (
       (estagio and new.turno in ('E1', 'E2', 'E3'))
       or (not estagio and not filial and new.turno in ('A', 'B'))
       or (not estagio and filial and new.turno in ('C', 'D'))
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

-- Conferência: as duas true
select
  (select pg_get_constraintdef(oid) like '%''C''%' and pg_get_constraintdef(oid) like '%''D''%'
     from pg_constraint where conname = 'colaboradores_turno_check')                as aceita_c_e_d,
  (select prosrc like '%filial and new.turno in (''C'', ''D'')%'
     from pg_proc where proname = 'turno_escolhido_uma_vez')                      as filiais_escolhem_c_ou_d;
