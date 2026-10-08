/**
 * MARCAÇÕES FORA DA JORNADA — a quarta parte de Pendências do ponto.
 *
 * A Portaria 671/2021 proíbe recusar a marcação (marcacao-original.sql):
 * domingo, quinta batida, fora de ordem e repetida ficam registradas como
 * originais e esperam aqui quem responde pela pessoa. A decisão:
 *
 *   · INCLUIR NA JORNADA como entrada, saída...: vira correção, com a hora
 *     da original, e o dia é reapurado — domingo trabalhado vira hora extra
 *     para aprovar, como sempre.
 *   · DESCONSIDERAR: fica registrado que foi vista e não conta.
 *
 * O mesmo desenho de "Pontos incompletos": a linha limpa — quem, quando e
 * por quê — e UMA ação, que abre a folha da decisão. Quem pode decidir e
 * se a marcação já existe no dia, quem diz é o banco (`tratar_marcacao`).
 */
import React, { useEffect, useState } from 'react';
import { CheckCircle2, ChevronRight, Inbox, Loader2 } from 'lucide-react';
import { Colaborador, ORDEM_MARCACOES, ROTULO_FORA_DA_JORNADA, ROTULO_MARCACAO, TipoMarcacao } from '../tipos';
import { servicoPonto, formatarDataBR, formatarDiaCurto, MarcacaoParaTratar } from '../servicos/ponto';
import { FotoPresenca } from './FotoPresenca';
import { FolhaInferior } from './FolhaInferior';

type Decisao = 'incluida' | 'desconsiderada';

export const MarcacoesForaDaJornada: React.FC<{
  colaboradorAtual: Colaborador;
  /** Quantas esperam — para o número da parte sem uma segunda consulta. */
  aoMudarTotal?: (total: number) => void;
}> = ({ colaboradorAtual, aoMudarTotal }) => {
  const [versao, setVersao] = useState(0);
  const [carregando, setCarregando] = useState(true);
  const [marcacoes, setMarcacoes] = useState<MarcacaoParaTratar[]>([]);
  const [aberta, setAberta] = useState<MarcacaoParaTratar | null>(null);
  const [decisao, setDecisao] = useState<Decisao>('incluida');
  const [tipo, setTipo] = useState<TipoMarcacao | null>(null);
  const [justificativa, setJustificativa] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [gravando, setGravando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  // Perguntado ao banco, que filtra pela alçada; volta a perguntar quando o ponto muda
  useEffect(() => servicoPonto.assinarAlteracoes(() => setVersao((v) => v + 1)), []);
  useEffect(() => {
    let vivo = true;
    servicoPonto.buscarMarcacoesParaTratar().then((lista) => {
      if (!vivo) return;
      setMarcacoes(lista);
      setCarregando(false);
      aoMudarTotal?.(lista.length);
    });
    return () => {
      vivo = false;
    };
  }, [versao, colaboradorAtual.id]);

  const abrir = (m: MarcacaoParaTratar) => {
    setAberta(m);
    setDecisao('incluida');
    // A que o aplicativo esperava, quando havia, já vem marcada
    setTipo(m.tipoPedido);
    setJustificativa('');
    setErro(null);
  };

  const pronto = !!justificativa.trim() && (decisao === 'desconsiderada' || !!tipo);

  const salvar = async () => {
    if (!aberta) return;
    setGravando(true);
    setErro(null);
    const res = await servicoPonto.tratarMarcacao({ marcacao: aberta, decisao, tipo, justificativa });
    setGravando(false);
    if (!res.sucesso) return setErro(res.erro || 'Não foi possível salvar a decisão.');
    setAviso(
      decisao === 'incluida'
        ? `Marcação de ${aberta.colaborador.nome} incluída como ${ROTULO_MARCACAO[tipo!].toLowerCase()} em ${formatarDataBR(aberta.data)}.`
        : `Marcação de ${aberta.colaborador.nome} em ${formatarDataBR(aberta.data)} desconsiderada.`
    );
    setTimeout(() => setAviso(null), 5000);
    setAberta(null);
    setVersao((v) => v + 1);
  };

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h3 className="text-sm font-bold text-[var(--c-texto)]">Marcações fora da jornada</h3>
        <p className="text-xs text-[var(--c-texto-3)] leading-relaxed">
          A marcação não é recusada: o que não coube nas quatro do dia ficou registrado e espera a sua decisão.
          Inclua na jornada ou desconsidere, com a justificativa.
        </p>
      </div>

      {aviso && (
        <div role="status" className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/25 text-xs font-semibold text-emerald-700 dark:text-emerald-400 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
          {aviso}
        </div>
      )}

      {carregando && marcacoes.length === 0 ? (
        <div className="py-10 flex items-center justify-center gap-2 text-xs text-[var(--c-texto-3)]">
          <Loader2 className="w-4 h-4 animate-spin" />
          Buscando as marcações…
        </div>
      ) : marcacoes.length === 0 ? (
        <div className="py-10 px-6 rounded-2xl border border-[var(--c-borda)] bg-[var(--c-superficie)] text-center flex flex-col items-center gap-2">
          <CheckCircle2 className="w-7 h-7 text-emerald-600" />
          <span className="text-sm font-bold text-[var(--c-texto)]">Nenhuma marcação esperando</span>
          <span className="text-xs text-[var(--c-texto-3)]">Toda marcação da sua equipe entrou na jornada ou já foi tratada.</span>
        </div>
      ) : (
        <ul className="rounded-2xl border border-[var(--c-borda)] bg-[var(--c-superficie)] divide-y divide-[var(--c-borda)] overflow-hidden">
          {marcacoes.map((m) => (
            <li key={`${m.cnpj}-${m.nsr}`}>
              <button
                type="button"
                id={`fora-da-jornada-${m.cnpj}-${m.nsr}`}
                onClick={() => abrir(m)}
                className="w-full px-4 py-3 flex items-center gap-3 text-left hover:bg-[var(--c-superficie-2)] active:bg-[var(--c-superficie-2)] transition-colors"
              >
                <FotoPresenca foto={m.colaborador.foto} nome={m.colaborador.nome} presenca={m.colaborador.presenca} tamanho="w-10 h-10" />
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-bold text-[var(--c-texto)] truncate">{m.colaborador.nome}</span>
                  <span className="block text-xs text-[var(--c-texto-3)] truncate">{ROTULO_FORA_DA_JORNADA[m.motivo]}</span>
                </span>
                <span className="flex flex-col items-end gap-0.5 flex-shrink-0">
                  <span className="text-sm font-bold text-[var(--c-texto)] tabular-nums">{m.hora}</span>
                  <span className="text-[11px] font-semibold text-[var(--c-texto-3)] tabular-nums">{formatarDiaCurto(m.data)}</span>
                </span>
                <span className="hidden md:inline-flex h-9 px-3.5 rounded-xl bg-[var(--c-acento)] text-[var(--c-sobre-acento)] text-xs font-bold items-center">
                  Tratar
                </span>
                <ChevronRight className="w-4 h-4 text-[var(--c-texto-3)] md:hidden flex-shrink-0" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <FolhaInferior
        aberto={!!aberta}
        titulo="Tratar a marcação"
        subtitulo={aberta ? `${aberta.colaborador.nome} · ${formatarDiaCurto(aberta.data)} às ${aberta.hora}` : undefined}
        aoFechar={() => setAberta(null)}
        rodape={
          <button
            type="button"
            id="botao-tratar-marcacao"
            onClick={salvar}
            disabled={gravando || !pronto}
            className="w-full h-12 rounded-2xl bg-[var(--c-acento)] text-[var(--c-sobre-acento)] text-sm font-bold disabled:opacity-40"
          >
            {gravando
              ? 'Salvando…'
              : decisao === 'desconsiderada'
                ? 'Desconsiderar a marcação'
                : tipo
                  ? `Incluir como ${ROTULO_MARCACAO[tipo].toLowerCase()}`
                  : 'Escolha como entra na jornada'}
          </button>
        }
      >
        {aberta && (
          <div className="p-4 flex flex-col gap-4">
            {/* A original, como foi registrada */}
            <div className="flex items-center gap-3 p-3 rounded-xl border border-amber-500/40 bg-amber-500/8">
              <span className="w-9 h-9 rounded-full bg-amber-500/15 text-amber-600 flex items-center justify-center flex-shrink-0">
                <Inbox className="w-4 h-4" />
              </span>
              <span className="flex-1 min-w-0">
                <span className="block text-sm font-semibold text-[var(--c-texto)]">{ROTULO_FORA_DA_JORNADA[aberta.motivo]}</span>
                <span className="block text-[11px] text-[var(--c-texto-3)] tabular-nums">
                  Loja {aberta.loja} · NSR {String(aberta.nsr).padStart(9, '0')}
                </span>
              </span>
              <span className="text-base font-bold text-[var(--c-texto)] tabular-nums">{aberta.hora}</span>
            </div>

            {/* A decisão: duas partes do mesmo tamanho */}
            <div role="radiogroup" aria-label="Decisão" className="grid grid-cols-2 gap-1 p-1 rounded-2xl bg-[var(--c-superficie-2)]">
              {(['incluida', 'desconsiderada'] as const).map((d) => (
                <button
                  key={d}
                  type="button"
                  role="radio"
                  id={`decisao-${d}`}
                  aria-checked={decisao === d}
                  onClick={() => {
                    setDecisao(d);
                    setErro(null);
                  }}
                  className={`h-10 rounded-xl text-xs font-bold transition-all ${
                    decisao === d
                      ? 'bg-[var(--c-superficie)] shadow-[var(--s-1)] text-[var(--c-texto)]'
                      : 'text-[var(--c-texto-3)] hover:text-[var(--c-texto-2)]'
                  }`}
                >
                  {d === 'incluida' ? 'Incluir na jornada' : 'Desconsiderar'}
                </button>
              ))}
            </div>

            {decisao === 'incluida' && (
              <div>
                <span className="text-[13px] font-semibold text-[var(--c-texto-2)] mb-1.5 block">Entra na jornada como</span>
                <div role="radiogroup" aria-label="Como entra na jornada" className="grid grid-cols-2 gap-2">
                  {ORDEM_MARCACOES.map((t) => (
                    <button
                      key={t}
                      type="button"
                      role="radio"
                      id={`incluir-como-${t}`}
                      aria-checked={tipo === t}
                      onClick={() => {
                        setTipo(t);
                        setErro(null);
                      }}
                      className={`h-11 px-3 rounded-xl border text-[13px] font-semibold transition-all ${
                        tipo === t
                          ? 'border-[var(--c-acento)] bg-[var(--c-acento)]/10 text-[var(--c-texto)]'
                          : 'border-[var(--c-borda)] bg-[var(--c-canvas)] text-[var(--c-texto-2)] hover:bg-[var(--c-superficie-2)]'
                      }`}
                    >
                      {ROTULO_MARCACAO[t]}
                    </button>
                  ))}
                </div>
                <span className="mt-1.5 block text-[11px] text-[var(--c-texto-3)]">
                  Entra com a hora da marcação ({aberta.hora}), como correção com o seu nome, e o dia é reapurado.
                </span>
              </div>
            )}

            <div>
              <label htmlFor="justificativa-tratar-marcacao" className="text-[13px] font-semibold text-[var(--c-texto-2)] mb-1.5 block">
                Justificativa
              </label>
              <textarea
                id="justificativa-tratar-marcacao"
                rows={2}
                value={justificativa}
                onChange={(e) => {
                  setJustificativa(e.target.value);
                  setErro(null);
                }}
                placeholder={
                  decisao === 'incluida'
                    ? 'Ex.: trabalhou no inventário de domingo, combinado com a gerência'
                    : 'Ex.: marcou duas vezes por engano'
                }
                className="w-full px-3.5 py-2.5 rounded-xl bg-[var(--c-canvas)] border border-[var(--c-borda)] text-[15px] text-[var(--c-texto)] resize-none"
              />
              <span className="text-[11px] text-[var(--c-texto-3)]">
                A decisão fica registrada e não se desfaz. A marcação original continua no registro da pessoa.
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
