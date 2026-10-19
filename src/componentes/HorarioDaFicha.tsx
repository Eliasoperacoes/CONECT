/**
 * O HORÁRIO E O SÁBADO DE UMA PESSOA — um componente, três telas.
 *
 * A ficha funcional, o "Novo Colaborador" e o "Editar Colaborador" usam
 * estes mesmos campos (Elias, 19/10/2026: as opções novas "deveriam se
 * replicar" nas duas telas de cadastro). Antes cada tela tinha o seu
 * seletor de turno, e o do painel só oferecia A e B — foi onde o horário
 * próprio "não apareceu". Uma tela a mais que precise disto importa daqui.
 */
import React, { useState } from 'react';
import {
  HorarioProprio,
  TURNOS,
  TURNO_PROPRIO,
  Turno,
  turnosDoPerfil,
  minutosDoTurno,
  problemaNoHorarioProprio,
  turnoDoHorarioProprio,
} from '../tipos';
import { formatarMinutos } from '../servicos/ponto';

/** A opção do seletor para a carga própria antiga, que não é turno */
export const CARGA_PROPRIA = '__carga_propria__';

/**
 * OS HORÁRIOS DIGITADOS (turno 'P', 17/10/2026): o mesmo de segunda a
 * sexta. O erro aparece enquanto se digita, e a jornada que o horário
 * fecha fica à vista — com aviso quando não é a de A e B (8h10), porque
 * para o Elias "só muda o horário, a carga é a mesma".
 */
export const HorarioProprioCampos: React.FC<{
  horario?: HorarioProprio;
  aoMudar: (h: HorarioProprio) => void;
  ehEstagio: boolean;
  campo: string;
  rotuloCampo: string;
}> = ({ horario, aoMudar, ehEstagio, campo, rotuloCampo }) => {
  const h: HorarioProprio = horario || { entrada: '', saida: '' };
  const [direto, setDireto] = useState(!!horario && !horario.intervaloSaida && !horario.intervaloRetorno);
  const muda = (campoDoHorario: keyof HorarioProprio, valor: string) => aoMudar({ ...h, [campoDoHorario]: valor || undefined } as HorarioProprio);
  const problema = problemaNoHorarioProprio(h);
  const jornada = problema ? null : minutosDoTurno(turnoDoHorarioProprio(h, ehEstagio));
  const doIntegral = minutosDoTurno(TURNOS[0]);

  const hora = (id: string, rotulo: string, valor: string | undefined, chave: keyof HorarioProprio) => (
    <div>
      <label htmlFor={id} className={rotuloCampo}>
        {rotulo}
      </label>
      <input id={id} type="time" value={valor || ''} onChange={(e) => muda(chave, e.target.value)} className={campo} />
    </div>
  );

  return (
    <div id="horario-proprio" className="mt-2 rounded-lg border border-[var(--c-acento)]/40 bg-[var(--c-canvas)] p-3 flex flex-col gap-2.5">
      <div className="grid grid-cols-2 gap-2">
        {hora('hp-entrada', 'Entrada', h.entrada, 'entrada')}
        {!direto && hora('hp-intervalo-saida', 'Sai p/ intervalo', h.intervaloSaida, 'intervaloSaida')}
        {!direto && hora('hp-intervalo-retorno', 'Volta', h.intervaloRetorno, 'intervaloRetorno')}
        {hora('hp-saida', 'Saída', h.saida, 'saida')}
      </div>
      <label className="flex items-center gap-2 text-[12px] text-[var(--c-texto-2)] cursor-pointer w-fit">
        <input
          type="checkbox"
          checked={direto}
          onChange={(e) => {
            setDireto(e.target.checked);
            if (e.target.checked) aoMudar({ entrada: h.entrada, saida: h.saida });
          }}
          className="w-4 h-4 accent-[var(--c-acento)]"
        />
        Sem intervalo — vai direto (duas batidas)
      </label>
      {problema ? (
        <p className="text-[11px] text-amber-600">{problema}</p>
      ) : (
        <p className="text-[11px] text-[var(--c-texto-2)]">
          Fecha <strong className="text-[var(--c-texto)]">{formatarMinutos(jornada!)}</strong> por dia, de segunda a sexta. O
          sábado, quando a pessoa vem, é 08:00 às 12:00.
          {!ehEstagio && jornada !== doIntegral && (
            <span className="block text-amber-600 mt-1">
              Os turnos A e B fecham {formatarMinutos(doIntegral)}. Confira: este horário muda a carga, não só o horário.
            </span>
          )}
        </p>
      )}
    </div>
  );
};

/**
 * O SELETOR DO HORÁRIO: os turnos do contrato (estágio ou integral) e o
 * horário próprio. A carga própria antiga, de quem já tem uma, aparece
 * como opção para não sumir calada, e sai quando se escolhe um turno.
 */
export const SeletorDeHorario: React.FC<{
  id: string;
  turno: string;
  horarioProprio?: HorarioProprio;
  ehEstagio: boolean;
  aoMudar: (mudou: { turno: string; horarioProprio?: HorarioProprio }) => void;
  campo: string;
  rotuloCampo: string;
  /** A carga própria antiga da ficha, se houver (só o painel a mostra) */
  cargaPropriaMinutos?: number;
}> = ({ id, turno, horarioProprio, ehEstagio, aoMudar, campo, rotuloCampo, cargaPropriaMinutos }) => (
  <div>
    <label htmlFor={id} className={rotuloCampo}>
      Horário (turno da escala)
    </label>
    <select
      id={id}
      className={campo}
      value={cargaPropriaMinutos != null ? CARGA_PROPRIA : turno}
      onChange={(e) => {
        if (e.target.value === CARGA_PROPRIA) return;
        aoMudar({ turno: e.target.value, horarioProprio });
      }}
    >
      {/* SÓ OS TURNOS DESTE CONTRATO: a jornada de 8h10 a um estagiário é convite ao erro */}
      {turnosDoPerfil(ehEstagio).map((t) => (
        <option key={t.chave} value={t.chave}>
          {t.nome} · {formatarMinutos(minutosDoTurno(t))}
        </option>
      ))}
      {/* Quem não cabe em nenhum: o RH digita (horário próprio, 17/10/2026) */}
      <option value={TURNO_PROPRIO}>Horário próprio · digitar os horários</option>
      {cargaPropriaMinutos != null && (
        <option value={CARGA_PROPRIA}>
          Carga própria da ficha · {formatarMinutos(cargaPropriaMinutos)} (sem horário: só o limite do dia)
        </option>
      )}
    </select>
    {turno === TURNO_PROPRIO && cargaPropriaMinutos == null && (
      <HorarioProprioCampos
        horario={horarioProprio}
        aoMudar={(h) => aoMudar({ turno: TURNO_PROPRIO, horarioProprio: h })}
        ehEstagio={ehEstagio}
        campo={campo}
        rotuloCampo={rotuloCampo}
      />
    )}
  </div>
);

/**
 * O SÁBADO, junto do horário (17/10/2026): é a mesma pergunta — quando
 * esta pessoa trabalha. Vazio segue o turno, e a opção diz o que é.
 */
export const SeletorDeSabado: React.FC<{
  id: string;
  trabalhaSabado?: boolean;
  turnoEscolhido: Turno;
  aoMudar: (valor: boolean | undefined) => void;
  campo: string;
  rotuloCampo: string;
}> = ({ id, trabalhaSabado, turnoEscolhido, aoMudar, campo, rotuloCampo }) => (
  <div>
    <label htmlFor={id} className={rotuloCampo}>
      Trabalha aos sábados
    </label>
    <select
      id={id}
      value={trabalhaSabado === undefined ? '' : String(trabalhaSabado)}
      onChange={(e) => aoMudar(e.target.value === '' ? undefined : e.target.value === 'true')}
      className={campo}
    >
      <option value="">Como o turno · {turnoEscolhido.sabado ? 'vem, 08:00 às 12:00' : 'não vem'}</option>
      <option value="true">Sim · 08:00 às 12:00</option>
      <option value="false">Não trabalha aos sábados</option>
    </select>
  </div>
);
