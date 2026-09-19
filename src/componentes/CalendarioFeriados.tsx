/**
 * Calendário de feriados — CONECTA / Malachias Autopeças
 *
 * A tela onde o RH diz em que dias a rede não abre.
 *
 * O botão de importar os nacionais é o que faz esta tela ser usada: doze
 * datas digitadas à mão todo dezembro é trabalho que ninguém faz — e o
 * calendário vazio é exatamente o estado em que o feriado vira débito
 * para a rede inteira.
 *
 * Os estaduais e municipais continuam na mão, com a loja marcada. Não há
 * como calculá-los, e as cinco unidades ficam em cidades diferentes.
 */

import React, { useEffect, useMemo, useState } from 'react';
import {
  CalendarDays,
  Plus,
  Trash2,
  Download,
  AlertTriangle,
  Building2,
} from 'lucide-react';
import { Colaborador, Feriado, Loja, INFORMACOES_LOJAS } from '../tipos';
import {
  feriadosDoAno,
  salvarFeriado,
  removerFeriado,
  importarFeriadosNacionais,
  podeCuidarDoCalendario,
  assinarFeriados,
} from '../servicos/feriados';

interface Props {
  colaboradorAtual: Colaborador;
}

const NOMES_DOS_MESES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

const formatarDia = (data: string): string => {
  const [ano, mes, dia] = data.split('-').map(Number);
  const semana = new Date(ano, mes - 1, dia, 12).toLocaleDateString('pt-BR', {
    weekday: 'short',
  });
  return `${String(dia).padStart(2, '0')} de ${NOMES_DOS_MESES[mes - 1]} · ${semana}`;
};

const emHoras = (minutos: number): string =>
  minutos === 0
    ? 'Fechado'
    : `Meio expediente · ${Math.floor(minutos / 60)}h${String(minutos % 60).padStart(2, '0')}`;

export const CalendarioFeriados: React.FC<Props> = ({ colaboradorAtual }) => {
  const [ano, setAno] = useState(new Date().getFullYear());
  const [versao, setVersao] = useState(0);
  const [aviso, setAviso] = useState<{ texto: string; erro: boolean } | null>(null);
  const [ocupado, setOcupado] = useState(false);

  // Formulário do feriado avulso
  const [data, setData] = useState('');
  const [nome, setNome] = useState('');
  const [loja, setLoja] = useState<'' | Loja>('');
  const [horas, setHoras] = useState('0');

  useEffect(() => assinarFeriados(() => setVersao((v) => v + 1)), []);

  const podeEditar = podeCuidarDoCalendario();

  const lista = useMemo(() => {
    void versao;
    return feriadosDoAno(ano);
  }, [ano, versao]);

  const mostrar = (texto: string, erro = false) => {
    setAviso({ texto, erro });
    setTimeout(() => setAviso(null), 5000);
  };

  const importar = async () => {
    setOcupado(true);
    const res = await importarFeriadosNacionais(ano);
    setOcupado(false);

    if (!res.sucesso) return mostrar(res.erro || 'Não foi possível importar.', true);
    mostrar(
      res.acrescentados === 0
        ? `Os feriados nacionais de ${ano} já estavam cadastrados.`
        : `${res.acrescentados} feriado(s) de ${ano} acrescentados.`
    );
  };

  const acrescentar = async () => {
    setOcupado(true);
    const res = await salvarFeriado({
      data,
      nome,
      loja: loja || undefined,
      minutosPrevistos: Math.round(Number(horas) * 60) || 0,
    });
    setOcupado(false);

    if (!res.sucesso) return mostrar(res.erro || 'Não foi possível salvar.', true);

    setData('');
    setNome('');
    setLoja('');
    setHoras('0');
    mostrar('Feriado cadastrado. O espelho de ponto já considera.');
  };

  const apagar = async (f: Feriado) => {
    const res = await removerFeriado(f.id);
    if (!res.sucesso) return mostrar(res.erro || 'Não foi possível remover.', true);
    mostrar(`${f.nome} removido do calendário.`);
  };

  return (
    <div className="w-full flex flex-col gap-4 p-4 sm:p-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold text-[var(--c-texto)] flex items-center gap-2">
            <CalendarDays className="w-4 h-4" />
            Calendário de feriados
          </h2>
          <p className="text-xs text-[var(--c-texto-3)]">
            Dia cadastrado aqui deixa de cobrar jornada e aparece nomeado no espelho de
            ponto.
          </p>
        </div>

        <div className="flex items-center gap-1.5">
          <select
            value={ano}
            onChange={(e) => setAno(Number(e.target.value))}
            className="px-2.5 py-2 rounded-xl bg-[var(--c-canvas)] border border-[var(--c-borda)] text-xs font-bold text-[var(--c-texto)] outline-none"
          >
            {[ano - 1, ano, ano + 1].map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>

          {podeEditar && (
            <button
              type="button"
              onClick={importar}
              disabled={ocupado}
              className="px-3 py-2 rounded-xl border border-[var(--c-acento)] text-xs font-bold text-[var(--c-acento)] hover:bg-[var(--c-acento-suave)] disabled:opacity-50 transition-colors flex items-center gap-1.5"
              title="Traz os 12 feriados nacionais deste ano, sem tocar no que já existe"
            >
              <Download className="w-3.5 h-3.5" />
              Trazer nacionais
            </button>
          )}
        </div>
      </div>

      {aviso && (
        <div
          className={`p-3 rounded-xl text-xs font-semibold ${
            aviso.erro
              ? 'bg-red-500/10 border border-red-500/20 text-red-600'
              : 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-700'
          }`}
        >
          {aviso.texto}
        </div>
      )}

      {/*
        O AVISO DO CALENDÁRIO VAZIO.
        Calendário vazio não parece defeito — parece uma tela nova. Só que
        é nele que todo feriado vira um dia de débito para a rede inteira.
      */}
      {lista.length === 0 && (
        <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/25 flex items-start gap-2.5">
          <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
          <div className="text-xs text-amber-800 dark:text-amber-300 leading-snug">
            <strong>Nenhum feriado cadastrado em {ano}.</strong> Enquanto estiver assim,
            cada feriado conta como dia inteiro de débito no banco de horas de todo
            mundo, e o espelho mostra o dia como se a pessoa não tivesse batido.
          </div>
        </div>
      )}

      {podeEditar && (
        <div className="rounded-xl bg-[var(--c-superficie)] border border-[var(--c-borda)] p-3 flex flex-col gap-3">
          <span className="text-xs font-bold text-[var(--c-texto)]">
            Acrescentar feriado
          </span>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <label className="flex flex-col gap-1">
              <span className="text-[11px] font-semibold text-[var(--c-texto-2)]">Data</span>
              <input
                type="date"
                value={data}
                onChange={(e) => setData(e.target.value)}
                className="px-2.5 py-2 rounded-xl bg-[var(--c-canvas)] border border-[var(--c-borda)] text-sm text-[var(--c-texto)] outline-none focus:border-[var(--c-acento)]"
              />
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-[11px] font-semibold text-[var(--c-texto-2)]">Nome</span>
              <input
                type="text"
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                placeholder="Ex.: Aniversário de Pirassununga"
                className="px-2.5 py-2 rounded-xl bg-[var(--c-canvas)] border border-[var(--c-borda)] text-sm text-[var(--c-texto)] outline-none focus:border-[var(--c-acento)]"
              />
            </label>

            <label className="flex flex-col gap-1">
              {/*
                Feriado municipal é de UMA cidade. Sem esta escolha, o
                aniversário de Pirassununga perdoaria o dia de quem é de
                Leme — ou cobraria falta de quem não trabalhou.
              */}
              <span className="text-[11px] font-semibold text-[var(--c-texto-2)]">
                Vale para
              </span>
              <select
                value={loja}
                onChange={(e) => setLoja(e.target.value as '' | Loja)}
                className="px-2.5 py-2 rounded-xl bg-[var(--c-canvas)] border border-[var(--c-borda)] text-sm text-[var(--c-texto)] outline-none focus:border-[var(--c-acento)]"
              >
                <option value="">A rede inteira</option>
                {INFORMACOES_LOJAS.map((i) => (
                  <option key={i.nome} value={i.nome}>
                    Só {i.nome}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-[11px] font-semibold text-[var(--c-texto-2)]">
                Horas previstas
              </span>
              <input
                type="number"
                min={0}
                max={10}
                step={0.5}
                value={horas}
                onChange={(e) => setHoras(e.target.value)}
                className="px-2.5 py-2 rounded-xl bg-[var(--c-canvas)] border border-[var(--c-borda)] text-sm font-mono text-[var(--c-texto)] outline-none focus:border-[var(--c-acento)]"
              />
              <span className="text-[10px] text-[var(--c-texto-3)] leading-tight">
                Zero fecha o dia. Acima de zero é meio expediente.
              </span>
            </label>
          </div>

          <button
            type="button"
            onClick={acrescentar}
            disabled={ocupado || !data || !nome.trim()}
            className="self-start px-4 py-2 rounded-xl bg-[var(--c-acento)] text-[var(--c-sobre-acento)] text-xs font-bold disabled:opacity-50 hover:brightness-110 transition-all flex items-center gap-1.5"
          >
            <Plus className="w-3.5 h-3.5" />
            Acrescentar
          </button>
        </div>
      )}

      {lista.length > 0 && (
        <div className="rounded-xl bg-[var(--c-superficie)] border border-[var(--c-borda)] overflow-hidden">
          <div className="px-4 py-2.5 border-b border-[var(--c-borda)] flex items-center justify-between">
            <span className="text-xs font-bold text-[var(--c-texto)]">
              {lista.length} dia(s) em {ano}
            </span>
          </div>

          <div className="divide-y divide-[var(--c-borda)]">
            {lista.map((f) => (
              <div
                key={f.id}
                className="px-4 py-2.5 flex items-center justify-between gap-3 flex-wrap"
              >
                <div className="min-w-0">
                  <span className="text-xs font-semibold text-[var(--c-texto)] block">
                    {f.nome}
                  </span>
                  <span className="text-[11px] text-[var(--c-texto-3)] block">
                    {formatarDia(f.data)} · {emHoras(f.minutosPrevistos)}
                  </span>
                </div>

                <div className="flex items-center gap-2 flex-shrink-0">
                  {f.loja ? (
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-sky-500/10 text-sky-700 border border-sky-500/20 flex items-center gap-1">
                      <Building2 className="w-3 h-3" />
                      {f.loja}
                    </span>
                  ) : (
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-[var(--c-superficie-2)] text-[var(--c-texto-3)] border border-[var(--c-borda)]">
                      rede inteira
                    </span>
                  )}

                  {podeEditar && (
                    <button
                      type="button"
                      onClick={() => apagar(f)}
                      className="p-1.5 rounded-lg text-[var(--c-texto-3)] hover:text-red-600 hover:bg-red-500/10 transition-colors"
                      title="Remover do calendário"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {!podeEditar && (
        <p className="text-[11px] text-[var(--c-texto-3)] px-1">
          Você enxerga o calendário porque ele decide o seu espelho de ponto. Cadastrar e
          remover é do RH.
        </p>
      )}

      <p className="text-[11px] text-[var(--c-texto-3)] px-1">
        Os nacionais são calculados — inclusive Carnaval, Sexta-feira Santa e Corpus
        Christi, que mudam de data todo ano. Os estaduais e municipais precisam ser
        cadastrados à mão, marcando a loja: {colaboradorAtual.loja} tem feriados que as
        outras unidades não têm.
      </p>
    </div>
  );
};
