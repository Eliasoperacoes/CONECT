/**
 * QUANTAS PESSOAS EM CADA SETOR — uma seção, duas telas.
 *
 * Morava só em Lojas (PainelRede). O Elias pediu a mesma leitura no
 * painel do RH. Copiar o bloco para lá seria a duplicação que este
 * sistema já pagou com a lista de setores em duas telas: um dia uma
 * mudaria e a outra não. As duas usam este componente, e o número sai
 * de `bancoDados.obterEstatisticasRede`, o mesmo para as duas.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Layers } from 'lucide-react';
import { bancoDados } from '../servicos/bancoDados';

export const SeparacaoPorSetor: React.FC = () => {
  const [porSetor, setPorSetor] = useState<Record<string, number>>(
    () => bancoDados.obterEstatisticasRede().porSetor
  );

  useEffect(() => {
    const atualizar = () => {
      const novo = bancoDados.obterEstatisticasRede().porSetor;
      // Mesmo conteúdo, mesmo objeto: não redesenha à toa a cada aviso do banco
      setPorSetor((anterior) =>
        JSON.stringify(anterior) === JSON.stringify(novo) ? anterior : novo
      );
    };
    return bancoDados.assinarAlteracoes(atualizar);
  }, []);

  // Do maior para o menor: a leitura começa por onde está a maior parte da equipe
  const setores = useMemo(
    () => Object.entries(porSetor).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])),
    [porSetor]
  );
  /** Maior setor da rede, para as barras compararem entre si com honestidade. */
  const maior = setores.length > 0 ? setores[0][1] : 0;

  return (
    <section id="separacao-por-setor" className="flex flex-col gap-3">
      <div>
        <h2 className="text-base font-bold text-[var(--c-texto)] flex items-center gap-2">
          <Layers className="w-4 h-4 text-[var(--c-acento)]" />
          Separações por Setor da Autopeças
        </h2>
        <p className="text-xs text-[var(--c-texto-3)]">
          Distribuição de colaboradores por atividade nas lojas e na matriz
        </p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {setores.map(([setorNome, quantidade]) => {
          const qtdNum = Number(quantidade) || 0;
          return (
            <div
              key={setorNome}
              className="bg-[var(--c-superficie)] p-3.5 rounded-xl border border-[var(--c-borda)] shadow-xs transition-all flex flex-col justify-between gap-2"
            >
              <div className="flex items-center justify-between gap-2">
                <strong className="text-sm text-[var(--c-texto)] truncate">{setorNome}</strong>
                <span className="text-xs font-bold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/50 px-2 py-0.5 rounded-md border border-blue-200 dark:border-blue-800 flex-shrink-0">
                  {qtdNum} {qtdNum === 1 ? 'membro' : 'membros'}
                </span>
              </div>
              <div className="w-full bg-[var(--c-canvas)] h-2 rounded-full overflow-hidden border border-[var(--c-borda)]">
                <div
                  className="bg-[var(--c-acento)] h-full rounded-full"
                  style={{ width: `${Math.round((qtdNum / Math.max(1, maior)) * 100)}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
};
