/**
 * A BUSCA DO TOPO (computador) — pessoas e ferramentas, separadas.
 *
 * Pedido do Elias (06/10/2026). Ao digitar, dois grupos:
 *   · PESSOAS — só colaboradores; o clique abre a ficha rápida, com os
 *     atalhos daquela pessoa (FichaRapida.tsx);
 *   · FERRAMENTAS — só telas do sistema que a pessoa alcança; o clique
 *     abre a tela.
 *
 * O que aparece é decidido em `buscaNoSistema.ts` (testado); aqui só se
 * desenha e se navega pelo teclado: Ctrl+K foca, setas escolhem, Enter
 * abre, Esc fecha.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Search, CornerDownLeft } from 'lucide-react';
import { Colaborador } from '../tipos';
import type { TelaId, TelaWeb } from '../servicos/telasPorAssunto';
import { bancoDados } from '../servicos/bancoDados';
import { buscarNoSistema, ferramentasDe, type FerramentaEncontrada } from '../servicos/buscaNoSistema';
import { ICONE_DA_TELA, ICONE_PADRAO_DA_TELA } from './iconesDasTelas';
import { AvatarSuave } from './PadraoWeb';
import { FichaRapida } from './FichaRapida';

type Sugestao = { tipo: 'pessoa'; pessoa: Colaborador } | { tipo: 'ferramenta'; ferramenta: FerramentaEncontrada };

/** Ctrl+K no Windows, ⌘K no Mac — o que a tecla mostra é o que se aperta. */
const ATALHO = typeof navigator !== 'undefined' && /Mac/i.test(navigator.platform) ? '⌘K' : 'Ctrl K';

export const BuscaWeb: React.FC<{
  colaboradorAtual: Colaborador;
  visiveis: Set<TelaId>;
  aoIrPara: (tela: TelaWeb) => void;
  aoAbrirAdmin: () => void;
  aoConversar: (colaboradorId: string) => void;
}> = ({ colaboradorAtual, visiveis, aoIrPara, aoAbrirAdmin, aoConversar }) => {
  const [termo, setTermo] = useState('');
  const [aberta, setAberta] = useState(false);
  const [marcada, setMarcada] = useState(0);
  const [pessoaAberta, setPessoaAberta] = useState<Colaborador | null>(null);
  const campo = useRef<HTMLInputElement>(null);
  const caixa = useRef<HTMLDivElement>(null);

  const ferramentas = useMemo(() => ferramentasDe(visiveis), [visiveis]);
  const achados = useMemo(
    () => buscarNoSistema(termo, { pessoas: aberta ? bancoDados.obterColaboradores() : [], ferramentas }),
    [termo, ferramentas, aberta]
  );
  // A ordem do teclado é a da tela: pessoas, depois ferramentas
  const sugestoes: Sugestao[] = [
    ...achados.pessoas.map((pessoa) => ({ tipo: 'pessoa' as const, pessoa })),
    ...achados.ferramentas.map((ferramenta) => ({ tipo: 'ferramenta' as const, ferramenta })),
  ];
  useEffect(() => setMarcada(0), [termo]);

  // Ctrl+K (⌘K) de qualquer lugar foca a busca
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        campo.current?.focus();
        setAberta(true);
      }
    };
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  }, []);

  // Clique fora fecha
  useEffect(() => {
    if (!aberta) return;
    const fora = (e: MouseEvent) => {
      if (caixa.current && !caixa.current.contains(e.target as Node)) setAberta(false);
    };
    document.addEventListener('mousedown', fora);
    return () => document.removeEventListener('mousedown', fora);
  }, [aberta]);

  const escolher = (s: Sugestao) => {
    setAberta(false);
    setTermo('');
    campo.current?.blur();
    if (s.tipo === 'pessoa') return setPessoaAberta(s.pessoa);
    // Administração abre por cima, como na barra lateral
    if (s.ferramenta.tela === 'administracao') return aoAbrirAdmin();
    aoIrPara(s.ferramenta.tela);
  };

  const aoTeclar = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setAberta(false);
      campo.current?.blur();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setMarcada((m) => Math.min(m + 1, sugestoes.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setMarcada((m) => Math.max(m - 1, 0));
    } else if (e.key === 'Enter' && sugestoes[marcada]) {
      e.preventDefault();
      escolher(sugestoes[marcada]);
    }
  };

  const digitou = termo.trim().length >= 2;
  const linha = (i: number) =>
    `w-full flex items-center gap-3 rounded-xl px-2.5 py-2 text-left transition-colors ${
      i === marcada ? 'bg-[var(--c-acento-suave)]' : 'hover:bg-[var(--c-superficie-2)]'
    }`;

  return (
    <div ref={caixa} className="relative w-full max-w-md">
      <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--c-texto-3)]" />
      <input
        ref={campo}
        id="busca-web"
        type="search"
        role="combobox"
        aria-expanded={aberta && digitou}
        aria-controls="busca-web-sugestoes"
        autoComplete="off"
        value={termo}
        onChange={(e) => {
          setTermo(e.target.value);
          setAberta(true);
        }}
        onFocus={() => setAberta(true)}
        onKeyDown={aoTeclar}
        placeholder="Buscar pessoas ou ferramentas"
        className="h-11 w-full rounded-xl border border-[var(--c-borda)] bg-[var(--c-canvas)] pl-10 pr-16 text-sm text-[var(--c-texto)] outline-none transition placeholder:text-[var(--c-texto-3)] focus:border-[var(--c-acento)] focus:bg-[var(--c-superficie)] focus:shadow-[var(--s-1)]"
      />
      {!termo && (
      <kbd className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 rounded-md border border-[var(--c-borda)] bg-[var(--c-superficie)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--c-texto-3)]">
        {ATALHO}
      </kbd>
      )}

      {aberta && digitou && (
        <div
          id="busca-web-sugestoes"
          role="listbox"
          className="absolute left-0 right-0 top-[52px] z-40 max-h-[70vh] overflow-y-auto rounded-2xl border border-[var(--c-borda)] bg-[var(--c-superficie)] p-2 shadow-[var(--s-3)]"
        >
          {sugestoes.length === 0 ? (
            <p className="px-3 py-6 text-center text-xs text-[var(--c-texto-3)]">
              Nada com “{termo.trim()}”. Procure pelo nome da pessoa, pela loja ou pelo nome da tela.
            </p>
          ) : (
            <>
              {achados.pessoas.length > 0 && (
                <div role="group" aria-label="Pessoas">
                  <p className="px-2.5 pb-1 pt-1.5 text-[10px] font-bold uppercase tracking-wider text-[var(--c-texto-3)]">
                    Pessoas
                  </p>
                  {achados.pessoas.map((pessoa, i) => (
                    <button
                      key={pessoa.id}
                      type="button"
                      role="option"
                      aria-selected={i === marcada}
                      id={`busca-pessoa-${pessoa.id}`}
                      onMouseEnter={() => setMarcada(i)}
                      onClick={() => escolher({ tipo: 'pessoa', pessoa })}
                      className={linha(i)}
                    >
                      <AvatarSuave nome={pessoa.nome} foto={pessoa.foto} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-[var(--c-texto)]">{pessoa.nome}</span>
                        <span className="block truncate text-[11px] text-[var(--c-texto-3)]">
                          {pessoa.cargo} · {pessoa.loja}
                        </span>
                      </span>
                      {i === marcada && <CornerDownLeft className="h-3.5 w-3.5 text-[var(--c-texto-3)]" />}
                    </button>
                  ))}
                </div>
              )}
              {achados.ferramentas.length > 0 && (
                <div role="group" aria-label="Ferramentas" className={achados.pessoas.length ? 'mt-1 border-t border-[var(--c-borda)] pt-1' : ''}>
                  <p className="px-2.5 pb-1 pt-1.5 text-[10px] font-bold uppercase tracking-wider text-[var(--c-texto-3)]">
                    Ferramentas
                  </p>
                  {achados.ferramentas.map((ferramenta, j) => {
                    const i = achados.pessoas.length + j;
                    const Icone = ICONE_DA_TELA[ferramenta.tela] ?? ICONE_PADRAO_DA_TELA;
                    return (
                      <button
                        key={ferramenta.tela}
                        type="button"
                        role="option"
                        aria-selected={i === marcada}
                        id={`busca-tela-${ferramenta.tela}`}
                        onMouseEnter={() => setMarcada(i)}
                        onClick={() => escolher({ tipo: 'ferramenta', ferramenta })}
                        className={linha(i)}
                      >
                        <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-[var(--c-superficie-2)] text-[var(--c-texto-2)]">
                          <Icone className="h-4 w-4" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold text-[var(--c-texto)]">
                            {ferramenta.rotulo}
                            {ferramenta.rotulo !== ferramenta.assunto && (
                              <span className="font-normal text-[var(--c-texto-3)]"> · {ferramenta.assunto}</span>
                            )}
                          </span>
                          <span className="block truncate text-[11px] text-[var(--c-texto-3)]">{ferramenta.descricao}</span>
                        </span>
                        {i === marcada && <CornerDownLeft className="h-3.5 w-3.5 text-[var(--c-texto-3)]" />}
                      </button>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {pessoaAberta && (
        <FichaRapida
          pessoa={pessoaAberta}
          colaboradorAtual={colaboradorAtual}
          visiveis={visiveis}
          aoFechar={() => setPessoaAberta(null)}
          aoConversar={aoConversar}
        />
      )}
    </div>
  );
};
