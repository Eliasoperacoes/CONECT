/**
 * PONTOS INCOMPLETOS — os dias que começaram e não fecharam.
 *
 * Pedido do Elias: "o espelho não pode fechar incompleto", numa sub-aba de
 * Equipe e ponto só para isso, e cada dia dito com todas as letras — "Yan
 * bateu 2 de 4, não fechou o dia". O líder resolve LANÇANDO A BATIDA
 * esquecida, com justificativa (fica como correção, na auditoria).
 *
 * "Aprovar jornadas" ficou com o que é decisão: hora extra, débito e falta.
 * O dia pela metade não é decisão — é um horário que falta no documento.
 *
 * A regra de quem aparece é `obterPontosIncompletos` (ponto.ts): a mesma
 * do aviso no espelho e do "sem bater" do painel do RH.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Clock, Loader2, Plus } from 'lucide-react';
import { Colaborador, TipoMarcacao, ROTULO_MARCACAO } from '../tipos';
import {
  servicoPonto,
  dataDeHoje,
  deDataLocal,
  paraDataLocal,
  formatarDataBR,
  formatarDiaCurto,
  descreverPontoIncompleto,
  descreverBatidasQueFaltam,
  PontoIncompleto,
} from '../servicos/ponto';
import { FotoPresenca } from './FotoPresenca';
import { FolhaInferior } from './FolhaInferior';

interface Props {
  colaboradorAtual: Colaborador;
}

/**
 * O período olhado: do 1º dia do mês passado até ontem. No começo do mês é
 * o mês que acabou de fechar que mais importa — é o espelho que vai sair.
 */
export const periodoDosPontosIncompletos = (hoje: string): { inicio: string; fim: string } => {
  const inicio = deDataLocal(hoje);
  inicio.setDate(1);
  inicio.setMonth(inicio.getMonth() - 1);
  const ontem = deDataLocal(hoje);
  ontem.setDate(ontem.getDate() - 1);
  return { inicio: paraDataLocal(inicio), fim: paraDataLocal(ontem) };
};

export const PontosIncompletos: React.FC<Props> = ({ colaboradorAtual }) => {
  const [versao, setVersao] = useState(0);
  const [carregando, setCarregando] = useState(true);
  const [lancando, setLancando] = useState<{ ponto: PontoIncompleto; tipo: TipoMarcacao } | null>(null);
  const [hora, setHora] = useState('');
  const [justificativa, setJustificativa] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [gravando, setGravando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  const periodo = useMemo(() => periodoDosPontosIncompletos(dataDeHoje()), []);

  // As batidas do período vêm do banco: o cache do aparelho pode ser outro
  useEffect(() => {
    let vivo = true;
    servicoPonto
      .garantirBatidasDoPeriodo(periodo.inicio, periodo.fim)
      .finally(() => vivo && setCarregando(false));
    const cancelar = servicoPonto.assinarAlteracoes(() => setVersao((v) => v + 1));
    return () => {
      vivo = false;
      cancelar();
    };
  }, [periodo.inicio, periodo.fim]);

  const pontos = useMemo(() => {
    void versao;
    return servicoPonto.obterPontosIncompletos(periodo.inicio, periodo.fim);
  }, [versao, periodo.inicio, periodo.fim, colaboradorAtual.id]);

  const abrir = (ponto: PontoIncompleto, tipo: TipoMarcacao) => {
    setLancando({ ponto, tipo });
    setHora('');
    setJustificativa('');
    setErro(null);
  };

  const lancar = async () => {
    if (!lancando) return;
    if (!/^\d{2}:\d{2}$/.test(hora)) return setErro('Informe o horário.');
    if (!justificativa.trim()) return setErro('Escreva a justificativa: ela vai para a auditoria.');
    setGravando(true);
    const res = await servicoPonto.ajustarMarcacao({
      colaboradorId: lancando.ponto.colaborador.id,
      data: lancando.ponto.data,
      tipo: lancando.tipo,
      hora,
      justificativa: justificativa.trim(),
    });
    setGravando(false);
    if (!res.sucesso) return setErro(res.erro || 'Não foi possível lançar a batida.');
    setAviso(
      `${ROTULO_MARCACAO[lancando.tipo]} de ${lancando.ponto.colaborador.nome} em ${formatarDataBR(
        lancando.ponto.data
      )} lançada às ${hora}.`
    );
    setTimeout(() => setAviso(null), 5000);
    setLancando(null);
    setVersao((v) => v + 1);
  };

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h3 className="text-sm font-bold text-[var(--c-texto)]">Pontos incompletos</h3>
        <p className="text-xs text-[var(--c-texto-3)] leading-relaxed">
          Dias que começaram e não fecharam, de {formatarDataBR(periodo.inicio)} até ontem. O
          espelho não pode fechar assim: lance a batida que a pessoa esqueceu, com a justificativa.
        </p>
      </div>

      {aviso && (
        <div role="status" className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/25 text-xs font-semibold text-emerald-700 dark:text-emerald-400 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
          {aviso}
        </div>
      )}

      {carregando && pontos.length === 0 ? (
        <div className="py-10 flex items-center justify-center gap-2 text-xs text-[var(--c-texto-3)]">
          <Loader2 className="w-4 h-4 animate-spin" />
          Buscando as batidas do período…
        </div>
      ) : pontos.length === 0 ? (
        <div className="py-10 px-6 rounded-2xl border border-[var(--c-borda)] bg-[var(--c-superficie)] text-center flex flex-col items-center gap-2">
          <CheckCircle2 className="w-7 h-7 text-emerald-600" />
          <span className="text-sm font-bold text-[var(--c-texto)]">Nenhum ponto incompleto</span>
          <span className="text-xs text-[var(--c-texto-3)]">
            Todo dia que começou neste período tem as batidas completas.
          </span>
        </div>
      ) : (
        <ul className="flex flex-col gap-2.5">
          {pontos.map((p) => (
            <li
              key={`${p.colaborador.id}-${p.data}`}
              id={`incompleto-${p.colaborador.id}-${p.data}`}
              className="p-3.5 rounded-2xl border border-amber-500/30 bg-[var(--c-superficie)] flex flex-col sm:flex-row sm:items-center gap-3"
            >
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <FotoPresenca
                  foto={p.colaborador.foto}
                  nome={p.colaborador.nome}
                  presenca={p.colaborador.presenca}
                  tamanho="w-10 h-10"
                />
                <div className="min-w-0">
                  <span className="block text-sm font-bold text-[var(--c-texto)] leading-snug">
                    {descreverPontoIncompleto(p)}
                  </span>
                  <span className="block text-xs text-[var(--c-texto-3)]">
                    <Clock className="w-3 h-3 inline -mt-0.5 mr-1" />
                    {formatarDiaCurto(p.data)} · {descreverBatidasQueFaltam(p.faltam)}
                  </span>
                </div>
              </div>
              <div className="flex flex-wrap gap-2 sm:justify-end">
                {p.faltam.map((tipo) => (
                  <button
                    key={tipo}
                    type="button"
                    id={`lancar-${p.colaborador.id}-${p.data}-${tipo}`}
                    onClick={() => abrir(p, tipo)}
                    className="h-9 px-3 rounded-xl bg-[var(--c-acento)] text-[var(--c-sobre-acento)] text-xs font-bold flex items-center gap-1.5 hover:brightness-110 active:scale-[0.98] transition-all"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Lançar {ROTULO_MARCACAO[tipo].toLowerCase()}
                  </button>
                ))}
              </div>
            </li>
          ))}
        </ul>
      )}

      <FolhaInferior
        aberto={!!lancando}
        titulo={lancando ? `Lançar ${ROTULO_MARCACAO[lancando.tipo].toLowerCase()}` : ''}
        subtitulo={
          lancando ? `${lancando.ponto.colaborador.nome} · ${formatarDiaCurto(lancando.ponto.data)}` : undefined
        }
        aoFechar={() => setLancando(null)}
        rodape={
          <button
            type="button"
            id="botao-gravar-batida-esquecida"
            onClick={lancar}
            disabled={gravando}
            className="w-full h-12 rounded-2xl bg-[var(--c-acento)] text-[var(--c-sobre-acento)] text-sm font-bold disabled:opacity-50"
          >
            {gravando ? 'Lançando…' : 'Lançar a batida'}
          </button>
        }
      >
        <div className="p-4 flex flex-col gap-3">
          <div>
            <label htmlFor="hora-batida-esquecida" className="text-[13px] font-semibold text-[var(--c-texto-2)] mb-1.5 block">
              Horário
            </label>
            <input
              id="hora-batida-esquecida"
              type="time"
              value={hora}
              onChange={(e) => setHora(e.target.value)}
              className="w-full h-12 px-3.5 rounded-xl bg-[var(--c-canvas)] border border-[var(--c-borda)] text-[15px] text-[var(--c-texto)]"
            />
          </div>
          <div>
            <label htmlFor="justificativa-batida-esquecida" className="text-[13px] font-semibold text-[var(--c-texto-2)] mb-1.5 block">
              Justificativa
            </label>
            <textarea
              id="justificativa-batida-esquecida"
              rows={3}
              value={justificativa}
              onChange={(e) => setJustificativa(e.target.value)}
              placeholder="Ex.: esqueceu de bater a saída; horário confirmado com a pessoa"
              className="w-full px-3.5 py-2.5 rounded-xl bg-[var(--c-canvas)] border border-[var(--c-borda)] text-[15px] text-[var(--c-texto)] resize-none"
            />
            <span className="text-[11px] text-[var(--c-texto-3)]">
              A batida fica marcada como correção, com o seu nome, e vai para a auditoria.
            </span>
          </div>
          {erro && (
            <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-xs font-semibold text-red-600">
              {erro}
            </div>
          )}
        </div>
      </FolhaInferior>
    </div>
  );
};
