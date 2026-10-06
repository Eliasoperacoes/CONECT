/**
 * A BARRA LATERAL DO COMPUTADOR — um item por ASSUNTO.
 *
 * Pedido do Elias (05/10/2026): organizar por assunto, e não por quem usa.
 * Tudo de ponto num item, tudo de folga e férias em outro, tudo de
 * documento em outro. Quem decide os itens de cada pessoa é
 * `assuntosDe` (telasPorAssunto.ts) — a mesma resposta de quem vê o quê
 * do celular; aqui só se desenha.
 *
 * Só no computador (md+). Entre 768 e 1024px ela fica estreita, só com os
 * ícones (o nome vem no `title`); acima, ícone e nome. No celular não
 * existe: lá a navegação é a barra de baixo, como sempre foi.
 */
import React from 'react';
import {
  Home,
  MessageSquare,
  Megaphone,
  Clock,
  CalendarDays,
  FileText,
  Building2,
  ShieldCheck,
  type LucideIcon,
} from 'lucide-react';
import type { Assunto, AssuntoId } from '../servicos/telasPorAssunto';
import { IndicadorNuvem } from './IndicadorNuvem';
import { LogoMalachias } from './LogoMalachias';

export const ICONE_DO_ASSUNTO: Record<AssuntoId, LucideIcon> = {
  inicio: Home,
  conversas: MessageSquare,
  central: Megaphone,
  ponto: Clock,
  ausencias: CalendarDays,
  documentos: FileText,
  pessoas: Building2,
  administracao: ShieldCheck,
};

/** O título de cada grupo da barra. O principal não tem: é o de todo dia. */
const TITULO_DO_GRUPO: Record<Assunto['grupo'], string | null> = {
  principal: null,
  gestao: 'Trabalho',
  rodape: null,
};

const Contador: React.FC<{ valor: number; recolhido?: boolean }> = ({ valor, recolhido }) => (
  <span
    className={`min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center tabular-nums ${
      recolhido ? 'absolute -top-1 -right-1 lg:static' : 'ml-auto'
    }`}
  >
    {valor > 99 ? '99+' : valor}
  </span>
);

export const BarraLateralWeb: React.FC<{
  assuntos: Assunto[];
  ativo: AssuntoId | null;
  contadores: Partial<Record<AssuntoId, number>>;
  aoEscolher: (assunto: Assunto) => void;
}> = ({ assuntos, ativo, contadores, aoEscolher }) => {
  const grupos: Assunto['grupo'][] = ['principal', 'gestao', 'rodape'];

  return (
    <aside
      id="barra-lateral-web"
      aria-label="Navegação"
      className="hidden md:flex flex-col w-16 lg:w-60 h-full flex-shrink-0 bg-[var(--c-superficie)] border-r border-[var(--c-borda)]"
    >
      {/* A marca: a empresa (o logo), o sistema e se ele está ligado à rede */}
      <div className="h-20 flex items-center gap-3 px-3 lg:px-5 border-b border-[var(--c-borda)] flex-shrink-0">
        <LogoMalachias className="mx-auto lg:mx-0" />
        <div className="hidden lg:block min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="font-extrabold text-base tracking-tight text-[var(--c-texto)]">CONECTA</span>
            <IndicadorNuvem />
          </div>
          <span className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--c-texto-3)]">
            Malachias Autopeças
          </span>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-2 lg:px-3 py-3 flex flex-col">
        {grupos.map((grupo) => {
          const itens = assuntos.filter((a) => a.grupo === grupo);
          if (itens.length === 0) return null;
          const titulo = TITULO_DO_GRUPO[grupo];
          return (
            <div key={grupo} className={`flex flex-col gap-0.5 ${grupo === 'rodape' ? 'mt-auto pt-3' : 'mb-3'}`}>
              {titulo && (
                <span className="hidden lg:block px-3 pt-2 pb-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--c-texto-3)]">
                  {titulo}
                </span>
              )}
              {titulo && <span className="lg:hidden mx-3 my-2 border-t border-[var(--c-borda)]" aria-hidden />}
              {itens.map((assunto) => {
                const Icone = ICONE_DO_ASSUNTO[assunto.id];
                const marcado = ativo === assunto.id;
                const contador = contadores[assunto.id] || 0;
                return (
                  <button
                    key={assunto.id}
                    type="button"
                    id={`assunto-${assunto.id}`}
                    title={assunto.rotulo}
                    aria-current={marcado ? 'page' : undefined}
                    onClick={() => aoEscolher(assunto)}
                    className={`group relative h-10 px-3 rounded-xl flex items-center gap-3 text-sm font-semibold transition-colors justify-center lg:justify-start ${
                      marcado
                        ? 'bg-[var(--c-acento-suave)] text-[var(--c-acento)]'
                        : 'text-[var(--c-texto-2)] hover:bg-[var(--c-superficie-2)] hover:text-[var(--c-texto)]'
                    }`}
                  >
                    <Icone
                      className={`w-[18px] h-[18px] flex-shrink-0 ${
                        marcado ? '' : 'text-[var(--c-texto-3)] group-hover:text-[var(--c-texto-2)]'
                      }`}
                    />
                    <span className="hidden lg:inline truncate">{assunto.rotulo}</span>
                    {contador > 0 && <Contador valor={contador} recolhido />}
                  </button>
                );
              })}
            </div>
          );
        })}
      </nav>
    </aside>
  );
};
