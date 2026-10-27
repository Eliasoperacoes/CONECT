/**
 * O QUE ESPERA COMPRAS DECIDIR (SPEC-comunicacao-recebimento): problema na
 * chegada (errada, faltou, avariada, preço) e cliente que desistiu. Fica no
 * alto do painel de pedidos, em qualquer parte, até alguém resolver — o
 * vendedor recebe a resposta no chat de encomendas dele.
 */
import React, { useState } from 'react';
import { AlertTriangle, UserX } from 'lucide-react';
import { ROTULO_DA_SITUACAO, ROTULO_DO_PROBLEMA, type DesfechoDoProblema, type EncomendaDeCompras } from '../../servicos/encomendas';
import { classeDoBotao } from '../PadraoWeb';
import { quandoCurto } from './visual';

const UmaParaResolver: React.FC<{
  e: EncomendaDeCompras;
  aoResolverProblema: (resolucao: string, desfecho: DesfechoDoProblema) => Promise<void>;
  aoDestinar: (destino: 'devolver' | 'estoque') => Promise<void>;
}> = ({ e, aoResolverProblema, aoDestinar }) => {
  const [resolucao, setResolucao] = useState('');
  const [gravando, setGravando] = useState(false);
  const fazer = async (acao: () => Promise<void>) => {
    setGravando(true);
    try {
      await acao();
    } finally {
      setGravando(false);
    }
  };
  const problema = e.problema && !e.problema_resolvido_em;
  // Ainda não pedida: o banco só cancela, sem perguntar o destino
  const naoPedida = e.situacao === 'encomendada';

  return (
    <li className="flex flex-col gap-2 px-4 py-3 md:flex-row md:items-center md:gap-4">
      <div className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-2 text-sm font-extrabold text-[var(--c-texto)]">
          {problema ? <AlertTriangle className="h-4 w-4 text-[var(--c-erro)]" aria-hidden /> : <UserX className="h-4 w-4 text-[var(--c-atencao)]" aria-hidden />}
          {e.quantidade}× {e.codigo} · {e.fornecedor_nome}
        </span>
        <span className="block text-xs text-[var(--c-texto-2)]">
          {problema
            ? `${ROTULO_DO_PROBLEMA[e.problema!]}${e.problema_detalhe ? ` — ${e.problema_detalhe}` : ''} · ${quandoCurto(e.problema_em!)}`
            : `Cliente desistiu ${quandoCurto(e.desistiu_em!)}`}
        </span>
        <span className="block text-[11px] text-[var(--c-texto-3)]">
          {e.nome_do_vendedor ?? '—'} · {e.loja ?? '—'} · {ROTULO_DA_SITUACAO[e.situacao]}
        </span>
      </div>
      {problema ? (
        // O desfecho conta na métrica de devoluções: troca e devolvida voltam ao fornecedor
        <div className="flex w-full flex-col gap-2 md:w-[26rem]">
          <input
            aria-label="O que foi feito"
            placeholder="O que foi feito (vai para o vendedor)"
            value={resolucao}
            maxLength={160}
            onChange={(ev) => setResolucao(ev.target.value)}
            className="h-9 min-w-0 rounded-lg border border-[var(--c-borda)] bg-[var(--c-superficie)] px-2 text-xs text-[var(--c-texto)] outline-none focus:border-[var(--c-acento)]"
          />
          <div className="flex gap-2">
            {(
              [
                ['troca', 'Troca', 'O fornecedor manda outra; a encomenda segue'],
                ['devolvida', 'Devolvida', 'Volta ao fornecedor sem reposição; a encomenda é cancelada'],
                ['aceita', 'Aceita como está', 'Fica a peça ou o preço; a encomenda segue'],
              ] as const
            ).map(([desfecho, rotulo, dica]) => (
              <button
                key={desfecho}
                type="button"
                title={dica}
                disabled={gravando || !resolucao.trim()}
                className={`${desfecho === 'aceita' ? classeDoBotao.secundario : classeDoBotao.principal} flex-1`}
                onClick={() => void fazer(() => aoResolverProblema(resolucao.trim(), desfecho))}
              >
                {rotulo}
              </button>
            ))}
          </div>
        </div>
      ) : naoPedida ? (
        <button type="button" disabled={gravando} className={classeDoBotao.secundario} onClick={() => void fazer(() => aoDestinar('devolver'))}>
          Cancelar (ainda não pedida)
        </button>
      ) : (
        <div className="flex gap-2">
          <button type="button" disabled={gravando} className={classeDoBotao.secundario} onClick={() => void fazer(() => aoDestinar('devolver'))}>
            Devolver ao fornecedor
          </button>
          <button type="button" disabled={gravando} className={classeDoBotao.secundario} onClick={() => void fazer(() => aoDestinar('estoque'))}>
            Vai para o estoque
          </button>
        </div>
      )}
    </li>
  );
};

export const ResolverEncomendas: React.FC<{
  lista: EncomendaDeCompras[];
  aoResolverProblema: (e: EncomendaDeCompras, resolucao: string, desfecho: DesfechoDoProblema) => Promise<void>;
  aoDestinar: (e: EncomendaDeCompras, destino: 'devolver' | 'estoque') => Promise<void>;
}> = ({ lista, aoResolverProblema, aoDestinar }) =>
  lista.length === 0 ? null : (
    <section aria-labelledby="pedidos-resolver" className="overflow-hidden rounded-2xl border border-[var(--c-erro)] bg-[var(--c-superficie)]">
      <h2 id="pedidos-resolver" className="border-b border-[var(--c-borda)] bg-[color-mix(in_srgb,var(--c-erro)_8%,transparent)] px-4 py-2 text-xs font-extrabold uppercase tracking-wider text-[var(--c-erro)]">
        Para resolver ({lista.length})
      </h2>
      <ul className="divide-y divide-[var(--c-borda)]">
        {lista.map((e) => (
          <UmaParaResolver key={e.id} e={e} aoResolverProblema={(r, d) => aoResolverProblema(e, r, d)} aoDestinar={(d) => aoDestinar(e, d)} />
        ))}
      </ul>
    </section>
  );
