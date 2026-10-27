/**
 * AS PEÇAS DO PAINEL DE RELATÓRIOS — widgets (Elias, 22/10/2026: "aquela UI
 * voltada a widgets, que dá um ar de moderno"). Regras de visualização
 * (skill dataviz), valendo em todas:
 *   · uma cor de destaque (acento) e o resto em cinza; verde/vermelho só
 *     quando querem dizer bom/ruim, e sempre com seta e texto;
 *   · marcas finas: coluna ≤ 24 px com ponta arredondada de 4 px, linha de
 *     2 px, grade em linha fina sólida; 2 px de folga entre colunas;
 *   · texto nunca na cor do dado: rótulos e valores em tinta de texto;
 *   · hover E teclado mostram a mesma dica; a dica nunca é o único caminho
 *     (os números também estão nas tabelas, em "Dados em tabela");
 *   · número grande com algarismos proporcionais; tabulares só em coluna.
 * SVG puro: sem biblioteca de gráfico.
 */
import React, { useId, useMemo, useState } from "react";
import { ArrowDownRight, ArrowRight, ArrowUpRight, Minus } from "lucide-react";
import type { Variacao } from "../../servicos/relatorios";

// ------------------------------------------------------------
// O WIDGET: a moldura de todos
// ------------------------------------------------------------

export const Widget: React.FC<{
  titulo: string;
  icone?: React.ReactNode;
  sobre?: string;
  acao?: { rotulo: string; aoTocar: () => void };
  className?: string;
  children: React.ReactNode;
  /** Sem o espaçamento interno (tabelas e listas encostam na borda) */
  colado?: boolean;
}> = ({ titulo, icone, sobre, acao, className = "", children, colado }) => {
  const id = useId();
  return (
    <section
      aria-labelledby={id}
      className={`flex min-w-0 flex-col rounded-2xl border border-[var(--c-borda)] bg-[var(--c-superficie)] shadow-[var(--s-1)] ${className}`}
    >
      <header className="flex items-start justify-between gap-3 px-5 pb-1 pt-4">
        <span className="flex min-w-0 items-start gap-2.5">
          {icone && (
            <span
              className="mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg bg-[var(--c-acento-suave)] text-[var(--c-acento)]"
              aria-hidden
            >
              {icone}
            </span>
          )}
          <span className="min-w-0">
            <h2 id={id} className="text-sm font-bold text-[var(--c-texto)]">
              {titulo}
            </h2>
            {sobre && (
              <p className="text-xs leading-5 text-[var(--c-texto-3)]">
                {sobre}
              </p>
            )}
          </span>
        </span>
        {acao && (
          <button
            type="button"
            onClick={acao.aoTocar}
            className="inline-flex flex-shrink-0 items-center gap-1 whitespace-nowrap pt-0.5 text-xs font-semibold text-[var(--c-acento)] hover:underline"
          >
            {acao.rotulo} <ArrowRight className="h-3.5 w-3.5" aria-hidden />
          </button>
        )}
      </header>
      <div
        className={`flex flex-1 flex-col ${colado ? "pt-2" : "px-5 pb-5 pt-3"}`}
      >
        {children}
      </div>
    </section>
  );
};

// ------------------------------------------------------------
// A VARIAÇÃO: seta + porcentagem + "vs período anterior"
// ------------------------------------------------------------

export const Delta: React.FC<{ v: Variacao; base?: string }> = ({
  v,
  base = "vs período anterior",
}) => {
  // Sem período anterior para comparar, não se diz nada (repetir "sem base" em todo cartão é ruído)
  if (v.valor == null) return null;
  const cor =
    v.bom == null
      ? "text-[var(--c-texto-3)]"
      : v.bom
        ? "text-[var(--c-ok)]"
        : "text-[var(--c-erro)]";
  const Icone =
    v.sentido === "sobe"
      ? ArrowUpRight
      : v.sentido === "desce"
        ? ArrowDownRight
        : Minus;
  return (
    <span className="inline-flex items-center gap-1 text-xs">
      <span className={`inline-flex items-center gap-0.5 font-semibold ${cor}`}>
        <Icone className="h-3.5 w-3.5" aria-hidden />
        {v.sentido === "igual"
          ? "igual"
          : `${Math.abs(Math.round(v.valor * 100))}%`}
      </span>
      <span className="text-[var(--c-texto-3)]">{base}</span>
    </span>
  );
};

// ------------------------------------------------------------
// MINI-GRÁFICO (sparkline): a tendência do número, em cinza, o último ponto em destaque
// ------------------------------------------------------------

export const Sparkline: React.FC<{
  valores: number[];
  rotulo: string;
  altura?: number;
}> = ({ valores, rotulo, altura = 32 }) => {
  if (valores.length < 2) return null;
  const largura = 120;
  const max = Math.max(...valores, 1);
  const pontos = valores.map(
    (v, i) =>
      [
        (i / (valores.length - 1)) * largura,
        altura - 3 - (v / max) * (altura - 6),
      ] as const,
  );
  const caminho = pontos
    .map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`)
    .join(" ");
  const [ux, uy] = pontos[pontos.length - 1];
  return (
    <div className="relative h-8 w-full" role="img" aria-label={rotulo}>
      <svg
        viewBox={`0 0 ${largura} ${altura}`}
        preserveAspectRatio="none"
        className="h-full w-full overflow-visible"
        aria-hidden
      >
        <path
          d={caminho}
          fill="none"
          stroke="var(--c-borda-forte)"
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      {/* O ponto de hoje fora do SVG esticado: um círculo de verdade, 8 px, com o anel da superfície */}
      <span
        className="absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[var(--c-acento)] ring-2 ring-[var(--c-superficie)]"
        style={{
          left: `${(ux / largura) * 100}%`,
          top: `${(uy / altura) * 100}%`,
        }}
        aria-hidden
      />
    </div>
  );
};

// ------------------------------------------------------------
// O CARTÃO DE NÚMERO: rótulo, valor, variação, tendência
// ------------------------------------------------------------

export const CartaoDeNumero: React.FC<{
  rotulo: string;
  valor: string;
  detalhe?: string;
  variacao?: Variacao;
  /** "mais tempo é pior": a seta vermelha sobe */
  tendencia?: number[];
  icone?: React.ReactNode;
}> = ({ rotulo, valor, detalhe, variacao, tendencia, icone }) => (
  <div className="flex min-w-0 flex-col gap-1 rounded-2xl border border-[var(--c-borda)] bg-[var(--c-superficie)] p-4 shadow-[var(--s-1)]">
    <span className="flex items-center gap-1.5 text-xs font-medium text-[var(--c-texto-2)]">
      {icone && (
        <span className="text-[var(--c-texto-3)]" aria-hidden>
          {icone}
        </span>
      )}
      {rotulo}
    </span>
    <span className="truncate text-2xl font-bold tracking-tight text-[var(--c-texto)]">
      {valor}
    </span>
    <span className="flex min-h-[1.25rem] flex-wrap items-center gap-x-2">
      {variacao && <Delta v={variacao} />}
      {detalhe && (
        <span className="truncate text-xs text-[var(--c-texto-3)]">
          {detalhe}
        </span>
      )}
    </span>
    {tendencia && tendencia.length > 1 && (
      <div className="mt-auto pt-2">
        <Sparkline
          valores={tendencia}
          rotulo={`Tendência de ${rotulo.toLowerCase()} no período`}
        />
      </div>
    )}
  </div>
);

// ------------------------------------------------------------
// A DICA (tooltip): o valor primeiro, o nome depois
// ------------------------------------------------------------

const Dica: React.FC<{
  x: number;
  titulo: string;
  linhas: { cor: string; nome: string; valor: string }[];
}> = ({ x, titulo, linhas }) => (
  <div
    role="status"
    className="pointer-events-none absolute top-0 z-20 min-w-[9rem] -translate-x-1/2 rounded-xl border border-[var(--c-borda)] bg-[var(--c-superficie)] px-3 py-2 shadow-[var(--s-2)]"
    style={{ left: `clamp(4.5rem, ${x}%, calc(100% - 4.5rem))` }}
  >
    <span className="block text-[11px] text-[var(--c-texto-3)]">{titulo}</span>
    {linhas.map((l) => (
      <span key={l.nome} className="mt-0.5 flex items-center gap-2 text-xs">
        <span
          className="h-0.5 w-3 rounded-full"
          style={{ background: l.cor }}
          aria-hidden
        />
        <b className="font-semibold tabular-nums text-[var(--c-texto)]">
          {l.valor}
        </b>
        <span className="text-[var(--c-texto-3)]">{l.nome}</span>
      </span>
    ))}
  </div>
);

const diaCurto = (dia: string) => {
  const [, m, d] = dia.split("-");
  return `${d}/${m}`;
};
const diaLongo = (dia: string) =>
  new Date(`${dia}T12:00:00-03:00`).toLocaleDateString("pt-BR", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    timeZone: "America/Sao_Paulo",
  });

// ------------------------------------------------------------
// ÁREA NO TEMPO (uma série): linha de 2 px, véu de 10%, cursor que acha o dia
// ------------------------------------------------------------

export const AreaNoTempo: React.FC<{
  dias: string[];
  valores: number[];
  formatar: (v: number) => string;
  nome: string;
  altura?: number;
}> = ({ dias, valores, formatar, nome, altura = 112 }) => {
  const [foco, setFoco] = useState<number | null>(null);
  const L = 600;
  const max = Math.max(...valores, 1);
  const p = valores.map(
    (v, i) =>
      [
        (i / Math.max(1, valores.length - 1)) * L,
        altura - 4 - (v / max) * (altura - 12),
      ] as const,
  );
  const linha = p
    .map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`)
    .join(" ");
  const area = `${linha} L${L},${altura} L0,${altura} Z`;
  const gradiente = useId();
  const aoMover = (e: React.PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    setFoco(
      Math.round(((e.clientX - r.left) / r.width) * (valores.length - 1)),
    );
  };
  return (
    <div className="relative">
      {foco != null && (
        <Dica
          x={(foco / Math.max(1, valores.length - 1)) * 100}
          titulo={diaLongo(dias[foco])}
          linhas={[
            { cor: "var(--c-acento)", nome, valor: formatar(valores[foco]) },
          ]}
        />
      )}
      <svg
        viewBox={`0 0 ${L} ${altura}`}
        preserveAspectRatio="none"
        className="block h-28 w-full touch-none"
        role="img"
        aria-label={`${nome} por dia`}
        tabIndex={0}
        onPointerMove={aoMover}
        onPointerLeave={() => setFoco(null)}
        onFocus={() => setFoco(valores.length - 1)}
        onBlur={() => setFoco(null)}
        onKeyDown={(e) => {
          if (e.key === "ArrowLeft") setFoco((f) => Math.max(0, (f ?? 0) - 1));
          if (e.key === "ArrowRight")
            setFoco((f) => Math.min(valores.length - 1, (f ?? 0) + 1));
        }}
      >
        <defs>
          <linearGradient id={gradiente} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="var(--c-acento)" stopOpacity="0.16" />
            <stop
              offset="100%"
              stopColor="var(--c-acento)"
              stopOpacity="0.02"
            />
          </linearGradient>
        </defs>
        <line
          x1="0"
          x2={L}
          y1={altura - 0.5}
          y2={altura - 0.5}
          stroke="var(--c-borda)"
          strokeWidth="1"
          vectorEffect="non-scaling-stroke"
        />
        <path d={area} fill={`url(#${gradiente})`} />
        <path
          d={linha}
          fill="none"
          stroke="var(--c-acento)"
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
        {foco != null && (
          <line
            x1={p[foco][0]}
            x2={p[foco][0]}
            y1="0"
            y2={altura}
            stroke="var(--c-texto-3)"
            strokeWidth="1"
            vectorEffect="non-scaling-stroke"
          />
        )}
      </svg>
      <div className="mt-1 flex justify-between text-[11px] tabular-nums text-[var(--c-texto-3)]">
        <span>{diaCurto(dias[0])}</span>
        <span>{diaCurto(dias[dias.length - 1])}</span>
      </div>
    </div>
  );
};

// ------------------------------------------------------------
// COLUNAS POR DIA: encomendas (destaque) sobre as cotações (contexto, cinza)
// Mesma unidade (quantas): um eixo só.
// ------------------------------------------------------------

export const ColunasPorDia: React.FC<{
  dias: { dia: string; cotacoes: number; encomendas: number; valor: number }[];
  formatarValor: (v: number) => string;
}> = ({ dias, formatarValor }) => {
  const [foco, setFoco] = useState<number | null>(null);
  const altura = 160;
  const max = useMemo(() => {
    const m = Math.max(
      1,
      ...dias.map((d) => Math.max(d.cotacoes, d.encomendas)),
    );
    // Um topo "redondo" para o eixo
    const passo = m <= 5 ? 1 : m <= 10 ? 2 : m <= 50 ? 10 : m <= 100 ? 20 : 50;
    return Math.ceil(m / passo) * passo;
  }, [dias]);
  const largura = 100 / dias.length;
  const col = Math.min(24, Math.max(3, 600 / dias.length - 4)); // px na área de 600
  return (
    // O gráfico ocupa a altura que o widget tiver (no mínimo 10 rem): a linha do painel fecha junta
    <div className="flex flex-1 flex-col">
      <div className="relative min-h-[10rem] flex-1 pl-7">
        {/* Eixo Y: 0, metade e topo, em linhas finas */}
        {[0, 0.5, 1].map((f) => (
          <span
            key={f}
            className="absolute left-0 -translate-y-1/2 text-[10px] tabular-nums text-[var(--c-texto-3)]"
            style={{ top: `${(1 - f) * 100}%` }}
          >
            {Math.round(max * f)}
          </span>
        ))}
        {foco != null && (
          <Dica
            x={(foco + 0.5) * largura}
            titulo={diaLongo(dias[foco].dia)}
            linhas={[
              {
                cor: "var(--c-acento)",
                nome: "encomendas",
                valor: String(dias[foco].encomendas),
              },
              {
                cor: "var(--c-borda-forte)",
                nome: "cotações",
                valor: String(dias[foco].cotacoes),
              },
              {
                cor: "transparent",
                nome: "encomendado",
                valor: formatarValor(dias[foco].valor),
              },
            ]}
          />
        )}
        <svg
          viewBox={`0 0 600 ${altura}`}
          preserveAspectRatio="none"
          className="absolute inset-y-0 left-7 right-0 block h-full w-[calc(100%-1.75rem)]"
          role="img"
          aria-label="Cotações e encomendas por dia"
        >
          {[0.5, 1].map((f) => (
            <line
              key={f}
              x1="0"
              x2="600"
              y1={(1 - f) * altura + 0.5}
              y2={(1 - f) * altura + 0.5}
              stroke="var(--c-borda)"
              strokeWidth="1"
              vectorEffect="non-scaling-stroke"
            />
          ))}
          <line
            x1="0"
            x2="600"
            y1={altura - 0.5}
            y2={altura - 0.5}
            stroke="var(--c-borda-forte)"
            strokeWidth="1"
            vectorEffect="non-scaling-stroke"
          />
          {dias.map((d, i) => {
            const cx = (i + 0.5) * (600 / dias.length);
            const hC = (d.cotacoes / max) * altura;
            const hE = (d.encomendas / max) * altura;
            const ativo = foco === i;
            return (
              <g key={d.dia}>
                {/* A coluna de contexto (cotações), mais larga e cinza */}
                {hC > 0 && (
                  <path
                    d={coluna(cx, col, hC, altura)}
                    fill={ativo ? "var(--c-texto-3)" : "var(--c-borda-forte)"}
                    opacity={ativo ? 0.5 : 0.55}
                  />
                )}
                {/* A coluna que importa (encomendas), mais estreita, por cima */}
                {hE > 0 && (
                  <path
                    d={coluna(cx, Math.max(2, col * 0.55), hE, altura)}
                    fill="var(--c-acento)"
                    opacity={foco == null || ativo ? 1 : 0.55}
                  />
                )}
              </g>
            );
          })}
        </svg>
        {/* A área de toque de cada dia: maior que a coluna, e focável pelo teclado */}
        <div className="absolute inset-y-0 left-7 right-0 flex">
          {dias.map((d, i) => (
            <button
              key={d.dia}
              type="button"
              className="h-full flex-1 focus:outline-none focus-visible:bg-[var(--c-acento-suave)]"
              aria-label={`${diaLongo(d.dia)}: ${d.encomendas} encomendas, ${d.cotacoes} cotações`}
              onPointerEnter={() => setFoco(i)}
              onPointerLeave={() => setFoco(null)}
              onFocus={() => setFoco(i)}
              onBlur={() => setFoco(null)}
            />
          ))}
        </div>
      </div>
      <div className="mt-1.5 flex justify-between pl-7 text-[11px] tabular-nums text-[var(--c-texto-3)]">
        <span>{diaCurto(dias[0].dia)}</span>
        {dias.length > 6 && (
          <span>{diaCurto(dias[Math.floor(dias.length / 2)].dia)}</span>
        )}
        <span>{diaCurto(dias[dias.length - 1].dia)}</span>
      </div>
    </div>
  );
};

/** Uma coluna com a ponta de cima arredondada (4 px) e a base reta, na linha do zero. */
const coluna = (cx: number, w: number, h: number, base: number) => {
  const r = Math.min(4, w / 2, h);
  const x = cx - w / 2;
  const y = base - h;
  return `M${x},${base} L${x},${y + r} Q${x},${y} ${x + r},${y} L${x + w - r},${y} Q${x + w},${y} ${x + w},${y + r} L${x + w},${base} Z`;
};

// ------------------------------------------------------------
// LISTA DE BARRAS (rankings): o primeiro em destaque, os outros em cinza
// ------------------------------------------------------------

export interface ItemDaLista {
  chave: string;
  nome: string;
  valor: number;
  textoDoValor: string;
  detalhe?: string;
  selo?: React.ReactNode;
}

export const ListaDeBarras: React.FC<{
  itens: ItemDaLista[];
  vazio: string;
  limite?: number;
  destaque?: "primeiro" | "todos";
}> = ({ itens, vazio, limite = 6, destaque = "primeiro" }) => {
  if (!itens.length)
    return (
      <p className="py-6 text-center text-sm text-[var(--c-texto-3)]">
        {vazio}
      </p>
    );
  const max = Math.max(...itens.map((i) => i.valor), 1);
  return (
    <ol className="flex flex-col gap-3.5">
      {itens.slice(0, limite).map((i, n) => (
        <li key={i.chave} className="min-w-0">
          <div className="flex items-baseline justify-between gap-3">
            <span className="flex min-w-0 items-center gap-2">
              <span className="w-4 flex-shrink-0 text-right text-[11px] tabular-nums text-[var(--c-texto-3)]">
                {n + 1}
              </span>
              <span className="truncate text-sm font-semibold text-[var(--c-texto)]">
                {i.nome}
              </span>
              {i.selo}
            </span>
            <span className="flex-shrink-0 text-sm font-semibold tabular-nums text-[var(--c-texto)]">
              {i.textoDoValor}
            </span>
          </div>
          <div className="ml-6 mt-1.5 flex items-center gap-2">
            <span
              className="h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--c-superficie-2)]"
              aria-hidden
            >
              <span
                className="block h-full rounded-full"
                style={{
                  width: `${(i.valor / max) * 100}%`,
                  background:
                    destaque === "todos" || n === 0
                      ? "var(--c-acento)"
                      : "var(--c-borda-forte)",
                }}
              />
            </span>
          </div>
          {i.detalhe && (
            <span className="ml-6 mt-1 block truncate text-xs text-[var(--c-texto-3)]">
              {i.detalhe}
            </span>
          )}
        </li>
      ))}
    </ol>
  );
};
