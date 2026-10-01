/**
 * PONTOS INCOMPLETOS — os dias que começaram e não fecharam.
 *
 * Pedido do Elias: "o espelho não pode fechar incompleto", numa sub-aba de
 * Equipe e ponto só para isso, e cada dia dito com todas as letras — "Yan
 * bateu 2 de 4, não fechou o dia".
 *
 * O DESENHO, depois do Elias achar a primeira versão "horrível": um botão
 * por batida que faltava enchia a linha de botões e quebrava o layout. Agora
 * a linha é limpa — quem, quando, e quatro marcas mostrando o que foi feito
 * — com UMA ação: "Completar dia". Ela abre o dia inteiro, as batidas na
 * ordem: as feitas com o horário e um ✓, as que faltam com o campo em
 * destaque e o horário do turno como referência. Uma justificativa e um
 * "Salvar" lançam tudo (`servicoPonto.completarDia`).
 *
 * A regra de quem aparece é `obterPontosIncompletos` (ponto.ts): a mesma
 * do aviso no espelho e do "sem bater" do painel do RH.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Check, CheckCircle2, ChevronRight, Clock, Loader2 } from 'lucide-react';
import { Colaborador, TipoMarcacao, ROTULO_MARCACAO } from '../tipos';
import {
  servicoPonto,
  dataDeHoje,
  deDataLocal,
  paraDataLocal,
  formatarDataBR,
  formatarDiaCurto,
  marcacoesEsperadas,
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

/** As batidas do dia, na ordem, cada uma com o horário feito (ou nenhum). */
const batidasDoDia = (p: PontoIncompleto): Array<{ tipo: TipoMarcacao; hora: string | null }> => {
  const feitas = new Map(
    servicoPonto.obterMarcacoesDoDia(p.colaborador.id, p.data).map((r) => [r.tipo, r.horaFormatada])
  );
  return marcacoesEsperadas(p.data, p.colaborador).map((tipo) => ({ tipo, hora: feitas.get(tipo) || null }));
};

/** As quatro marcas da linha: cheia = batida feita; vazada = falta. */
const MarcasDoDia: React.FC<{ batidas: Array<{ tipo: TipoMarcacao; hora: string | null }> }> = ({ batidas }) => (
  <span className="flex items-center gap-1.5" aria-label={batidas.map((b) => `${ROTULO_MARCACAO[b.tipo]}: ${b.hora || 'falta'}`).join(', ')}>
    {batidas.map((b) => (
      <span
        key={b.tipo}
        title={`${ROTULO_MARCACAO[b.tipo]}: ${b.hora || 'falta'}`}
        className={`w-2.5 h-2.5 rounded-full ${
          b.hora ? 'bg-emerald-500' : 'border-2 border-amber-500 bg-transparent'
        }`}
      />
    ))}
  </span>
);

export const PontosIncompletos: React.FC<Props> = ({ colaboradorAtual }) => {
  const [versao, setVersao] = useState(0);
  const [carregando, setCarregando] = useState(true);
  const [aberto, setAberto] = useState<PontoIncompleto | null>(null);
  const [horarios, setHorarios] = useState<Partial<Record<TipoMarcacao, string>>>({});
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

  const abrir = (p: PontoIncompleto) => {
    setAberto(p);
    setHorarios({});
    setJustificativa('');
    setErro(null);
  };

  const preenchidas = aberto ? aberto.faltam.filter((t) => !!horarios[t]).length : 0;

  const salvar = async () => {
    if (!aberto) return;
    setGravando(true);
    setErro(null);
    const res = await servicoPonto.completarDia({
      colaboradorId: aberto.colaborador.id,
      data: aberto.data,
      horarios,
      justificativa,
    });
    setGravando(false);
    if (!res.sucesso) return setErro(res.erro || 'Não foi possível salvar.');
    setAviso(
      `${res.lancadas} batida${res.lancadas > 1 ? 's' : ''} de ${aberto.colaborador.nome} em ${formatarDataBR(
        aberto.data
      )} ${res.lancadas > 1 ? 'lançadas' : 'lançada'}.`
    );
    setTimeout(() => setAviso(null), 5000);
    setAberto(null);
    setVersao((v) => v + 1);
  };

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h3 className="text-sm font-bold text-[var(--c-texto)]">Pontos incompletos</h3>
        <p className="text-xs text-[var(--c-texto-3)] leading-relaxed">
          Dias que começaram e não fecharam, de {formatarDataBR(periodo.inicio)} até ontem. O
          espelho não pode fechar assim: complete o dia com as batidas que a pessoa esqueceu.
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
        <ul className="rounded-2xl border border-[var(--c-borda)] bg-[var(--c-superficie)] divide-y divide-[var(--c-borda)] overflow-hidden">
          {pontos.map((p) => (
            <li key={`${p.colaborador.id}-${p.data}`}>
              <button
                type="button"
                id={`incompleto-${p.colaborador.id}-${p.data}`}
                onClick={() => abrir(p)}
                className="w-full px-4 py-3 flex items-center gap-3 text-left hover:bg-[var(--c-superficie-2)] active:bg-[var(--c-superficie-2)] transition-colors"
              >
                <FotoPresenca
                  foto={p.colaborador.foto}
                  nome={p.colaborador.nome}
                  presenca={p.colaborador.presenca}
                  tamanho="w-10 h-10"
                />
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-bold text-[var(--c-texto)] truncate">
                    {p.colaborador.nome}
                  </span>
                  <span className="block text-xs text-[var(--c-texto-3)] truncate">
                    Bateu {p.feitas} de {p.esperadas} — não fechou o dia
                  </span>
                </span>
                <span className="hidden sm:block text-xs font-semibold text-[var(--c-texto-2)] tabular-nums w-24 text-right">
                  {formatarDiaCurto(p.data)}
                </span>
                <span className="hidden sm:flex w-16 justify-center">
                  <MarcasDoDia batidas={batidasDoDia(p)} />
                </span>
                <span className="flex flex-col items-end gap-1 sm:hidden">
                  <span className="text-[11px] font-semibold text-[var(--c-texto-2)] tabular-nums">
                    {formatarDiaCurto(p.data)}
                  </span>
                  <MarcasDoDia batidas={batidasDoDia(p)} />
                </span>
                <span className="hidden md:inline-flex h-9 px-3.5 rounded-xl bg-[var(--c-acento)] text-[var(--c-sobre-acento)] text-xs font-bold items-center">
                  Completar dia
                </span>
                <ChevronRight className="w-4 h-4 text-[var(--c-texto-3)] md:hidden flex-shrink-0" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <FolhaInferior
        aberto={!!aberto}
        titulo="Completar o dia"
        subtitulo={aberto ? `${aberto.colaborador.nome} · ${formatarDiaCurto(aberto.data)}` : undefined}
        aoFechar={() => setAberto(null)}
        rodape={
          <button
            type="button"
            id="botao-completar-dia"
            onClick={salvar}
            disabled={gravando || preenchidas === 0}
            className="w-full h-12 rounded-2xl bg-[var(--c-acento)] text-[var(--c-sobre-acento)] text-sm font-bold disabled:opacity-40"
          >
            {gravando
              ? 'Salvando…'
              : preenchidas === 0
                ? 'Preencha o horário que falta'
                : `Salvar ${preenchidas} batida${preenchidas > 1 ? 's' : ''}`}
          </button>
        }
      >
        {aberto && (
          <div className="p-4 flex flex-col gap-4">
            <ol className="flex flex-col gap-2">
              {batidasDoDia(aberto).map((b) => {
                const previsto = servicoPonto.horarioPrevistoDaBatida(aberto.colaborador, aberto.data, b.tipo);
                return (
                  <li
                    key={b.tipo}
                    className={`flex items-center gap-3 p-3 rounded-xl border ${
                      b.hora
                        ? 'border-[var(--c-borda)] bg-[var(--c-canvas)]'
                        : 'border-amber-500/40 bg-amber-500/8'
                    }`}
                  >
                    <span
                      className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                        b.hora ? 'bg-emerald-500/15 text-emerald-600' : 'bg-amber-500/15 text-amber-600'
                      }`}
                    >
                      {b.hora ? <Check className="w-4 h-4" /> : <Clock className="w-4 h-4" />}
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm font-semibold text-[var(--c-texto)]">
                        {ROTULO_MARCACAO[b.tipo]}
                      </span>
                      <span className="block text-[11px] text-[var(--c-texto-3)]">
                        {b.hora ? 'Batida feita' : previsto ? `Faltou · turno: ${previsto}` : 'Faltou'}
                      </span>
                    </span>
                    {b.hora ? (
                      <span className="text-base font-bold text-[var(--c-texto)] tabular-nums">{b.hora}</span>
                    ) : (
                      <input
                        id={`hora-${b.tipo}`}
                        type="time"
                        aria-label={`Horário de ${ROTULO_MARCACAO[b.tipo].toLowerCase()}`}
                        value={horarios[b.tipo] || ''}
                        onChange={(e) => {
                          setHorarios((h) => ({ ...h, [b.tipo]: e.target.value }));
                          setErro(null);
                        }}
                        className="h-11 w-28 px-2.5 rounded-xl bg-[var(--c-superficie)] border border-amber-500/50 text-[15px] font-semibold text-[var(--c-texto)] focus:outline-none focus:ring-2 focus:ring-[var(--c-acento)]"
                      />
                    )}
                  </li>
                );
              })}
            </ol>

            <div>
              <label htmlFor="justificativa-completar-dia" className="text-[13px] font-semibold text-[var(--c-texto-2)] mb-1.5 block">
                Justificativa
              </label>
              <textarea
                id="justificativa-completar-dia"
                rows={2}
                value={justificativa}
                onChange={(e) => {
                  setJustificativa(e.target.value);
                  setErro(null);
                }}
                placeholder="Ex.: esqueceu de bater a saída; horário confirmado com a pessoa"
                className="w-full px-3.5 py-2.5 rounded-xl bg-[var(--c-canvas)] border border-[var(--c-borda)] text-[15px] text-[var(--c-texto)] resize-none"
              />
              <span className="text-[11px] text-[var(--c-texto-3)]">
                As batidas ficam marcadas como correção, com o seu nome, e vão para a auditoria.
              </span>
            </div>

            {erro && (
              <div role="alert" className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-xs font-semibold text-red-600">
                {erro}
              </div>
            )}
          </div>
        )}
      </FolhaInferior>
    </div>
  );
};
