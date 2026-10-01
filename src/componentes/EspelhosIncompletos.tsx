/**
 * QUEM ESTÁ COM O ESPELHO INCOMPLETO — o aviso no alto de Espelhos de ponto.
 *
 * A primeira versão era uma fileira de botões, um por pessoa. Com seis
 * nomes já quebrava em duas linhas; com a rede inteira (89 pessoas) viraria
 * uma parede de botões em cima da tela. O Elias reprovou.
 *
 * O DESENHO AGORA: recolhido, é UMA linha — quantas pessoas e quantos dias,
 * separados pelo que há para fazer (sem batida / sem fechar). Aberto, é uma
 * tabela com busca, ordenada de quem tem mais dias para quem tem menos, e
 * com rolagem própria: a tela de baixo continua no lugar. Cada linha abre o
 * espelho da pessoa no mês do dia incompleto mais recente.
 *
 * A conta é de `servicoPonto.buscarEspelhosIncompletos` — a tela não calcula.
 */
import React, { useMemo, useState } from 'react';
import { AlertTriangle, ChevronDown, ChevronRight, Search } from 'lucide-react';
import { EspelhoIncompleto } from '../servicos/ponto';

interface Props {
  espelhos: EspelhoIncompleto[];
  aoAbrir: (espelho: EspelhoIncompleto) => void;
}

/** Os totais da linha recolhida. */
export const resumirEspelhosIncompletos = (espelhos: EspelhoIncompleto[]) => ({
  pessoas: espelhos.length,
  semBatida: espelhos.reduce((t, e) => t + e.semBatida.length, 0),
  semFechar: espelhos.reduce((t, e) => t + e.semFechar.length, 0),
});

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

/** Acima disto a lista ganha busca: abaixo, ler é mais rápido que digitar. */
const BUSCA_A_PARTIR_DE = 8;

export const EspelhosIncompletos: React.FC<Props> = ({ espelhos, aoAbrir }) => {
  const [aberto, setAberto] = useState(false);
  const [busca, setBusca] = useState('');

  const resumo = resumirEspelhosIncompletos(espelhos);
  const visiveis = useMemo(() => {
    const termo = busca.trim().toLocaleLowerCase('pt-BR');
    if (!termo) return espelhos;
    return espelhos.filter((e) =>
      `${e.colaborador.nome} ${e.colaborador.loja} ${e.colaborador.cargo}`.toLocaleLowerCase('pt-BR').includes(termo)
    );
  }, [espelhos, busca]);

  if (espelhos.length === 0) return null;

  const numero = (n: number) =>
    n === 0 ? (
      <span className="text-[var(--c-texto-3)]">—</span>
    ) : (
      <span className="text-[var(--c-texto)]">{n}</span>
    );

  return (
    <section
      id="espelhos-incompletos"
      aria-label="Espelhos incompletos"
      className="rounded-2xl border border-amber-500/40 bg-amber-500/[0.07] overflow-hidden"
    >
      <button
        type="button"
        id="espelhos-incompletos-alternar"
        aria-expanded={aberto}
        onClick={() => setAberto((a) => !a)}
        className="w-full flex items-center gap-3 p-3.5 text-left hover:bg-amber-500/[0.06] transition-colors"
      >
        <span className="w-9 h-9 rounded-xl bg-amber-500/15 flex items-center justify-center flex-shrink-0">
          <AlertTriangle className="w-[18px] h-[18px] text-amber-600 dark:text-amber-400" />
        </span>
        <span className="flex-1 min-w-0">
          <span className="block text-sm font-bold text-[var(--c-texto)]">
            {plural(resumo.pessoas, 'colaborador com espelho incompleto', 'colaboradores com espelho incompleto')}
          </span>
          <span className="block text-xs text-[var(--c-texto-2)] truncate">
            {[
              resumo.semBatida > 0 && plural(resumo.semBatida, 'dia sem batida', 'dias sem batida'),
              resumo.semFechar > 0 && plural(resumo.semFechar, 'dia sem fechar', 'dias sem fechar'),
            ]
              .filter(Boolean)
              .join(' · ')}
            <span className="hidden sm:inline"> — deste mês e do anterior</span>
          </span>
        </span>
        <span className="flex items-center gap-1 text-xs font-bold text-[var(--c-acento)] flex-shrink-0">
          <span className="hidden sm:inline">{aberto ? 'Recolher' : 'Ver lista'}</span>
          <ChevronDown className={`w-4 h-4 transition-transform ${aberto ? 'rotate-180' : ''}`} />
        </span>
      </button>

      {aberto && (
        <div className="border-t border-amber-500/25 bg-[var(--c-superficie)]">
          {espelhos.length >= BUSCA_A_PARTIR_DE && (
            <div className="p-3 border-b border-[var(--c-borda)]">
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--c-texto-3)] pointer-events-none" />
                <input
                  id="busca-espelhos-incompletos"
                  type="text"
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  placeholder="Buscar por nome, loja ou cargo"
                  className="w-full pl-8 pr-3 py-2 rounded-xl bg-[var(--c-canvas)] border border-[var(--c-borda)] text-[var(--c-texto)] placeholder-[var(--c-texto-3)] text-xs focus:outline-none focus:ring-2 focus:ring-[var(--c-acento)]"
                />
              </div>
            </div>
          )}

          {/* Cabeçalho: só onde há largura para as colunas */}
          <div className="hidden sm:grid grid-cols-[minmax(0,1fr)_96px_96px_64px_20px] gap-3 px-4 py-2 text-[10px] font-bold uppercase tracking-wider text-[var(--c-texto-3)] border-b border-[var(--c-borda)]">
            <span>Colaborador</span>
            <span className="text-right">Sem batida</span>
            <span className="text-right">Sem fechar</span>
            <span className="text-right">Total</span>
            <span />
          </div>

          <ul className="max-h-[min(60vh,440px)] overflow-y-auto divide-y divide-[var(--c-borda)]">
            {visiveis.map((e) => (
              <li key={e.colaborador.id}>
                <button
                  type="button"
                  id={`espelho-incompleto-${e.colaborador.id}`}
                  onClick={() => aoAbrir(e)}
                  className="w-full grid grid-cols-[minmax(0,1fr)_auto_20px] sm:grid-cols-[minmax(0,1fr)_96px_96px_64px_20px] gap-3 items-center px-4 py-2.5 text-left hover:bg-[var(--c-canvas)] transition-colors"
                >
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-[var(--c-texto)] truncate">
                      {e.colaborador.nome}
                    </span>
                    <span className="block text-[11px] text-[var(--c-texto-3)] truncate">
                      {e.colaborador.cargo} · {e.colaborador.loja}
                      {/* No celular as colunas não cabem: o detalhe vem aqui */}
                      <span className="sm:hidden">
                        {' · '}
                        {[
                          e.semBatida.length > 0 && `${e.semBatida.length} sem batida`,
                          e.semFechar.length > 0 && `${e.semFechar.length} sem fechar`,
                        ]
                          .filter(Boolean)
                          .join(', ')}
                      </span>
                    </span>
                  </span>
                  <span className="hidden sm:block text-right text-sm tabular-nums">{numero(e.semBatida.length)}</span>
                  <span className="hidden sm:block text-right text-sm tabular-nums">{numero(e.semFechar.length)}</span>
                  <span className="text-right text-sm font-bold tabular-nums text-amber-700 dark:text-amber-400 whitespace-nowrap">
                    {e.total}
                    <span className="sm:hidden font-semibold"> {e.total === 1 ? 'dia' : 'dias'}</span>
                  </span>
                  <ChevronRight className="w-4 h-4 text-[var(--c-texto-3)]" />
                </button>
              </li>
            ))}
            {visiveis.length === 0 && (
              <li className="px-4 py-6 text-center text-xs text-[var(--c-texto-3)]">Ninguém com esse nome na lista.</li>
            )}
          </ul>

          <p className="px-4 py-2.5 border-t border-[var(--c-borda)] text-[11px] text-[var(--c-texto-3)] leading-relaxed">
            <strong className="text-[var(--c-texto-2)]">Sem batida:</strong> dia de trabalho em branco — no espelho,
            "Preencher dias vazios" ou o lançamento dia a dia.{' '}
            <strong className="text-[var(--c-texto-2)]">Sem fechar:</strong> o dia começou e faltou batida — Equipe e
            ponto › Pontos incompletos.
          </p>
        </div>
      )}
    </section>
  );
};
