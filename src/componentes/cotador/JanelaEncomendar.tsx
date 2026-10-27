/**
 * ENCOMENDAR (docs/cotador/SPEC-pedidos-compras.md, Elias 21/10/2026).
 *
 * O vendedor escolheu a peça (ou um similar) de um fornecedor na cotação.
 * Dois passos, na folha que sobe de baixo (janela no computador):
 *   1. quantidade e observação (o nome ou o telefone do cliente);
 *   2. "Você tem certeza que deseja encomendar?" — pedido do Elias: o
 *      vendedor que encomenda já autorizou a compra.
 * O custo não aparece aqui: o banco congela o custo da hora sozinho.
 */
import React, { useEffect, useState } from "react";
import { CheckCircle2, Minus, Plus, ShoppingCart } from "lucide-react";
import { FolhaInferior } from "../FolhaInferior";
import { classeDoBotao } from "../PadraoWeb";
import { brl } from "./visual";
import { entraAmanha } from "../../servicos/encomendas";

/** "15:59", no horário de Brasília */
const horaCurta = (iso: string) =>
  new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });

/** O que o vendedor escolheu, e como o banco encontra de novo. */
export interface ItemParaEncomendar {
  codigo: string;
  marca: string | null;
  descricao: string | null;
  fornecedorNome: string;
  venda: number;
  prazo: string | null;
  ehSimilar: boolean;
  /** Marca com preço por tipo: o vendedor escolhe qual */
  tipos: { tipo: string; venda: number | null; provavel: boolean }[];
  /** O fator que o Callcenter digitou: o banco recalcula a venda com ele */
  fator?: number;
  alvo:
    | { de: "b2b"; codigoCotado: string; fornecedor: string }
    | { de: "comprador"; respostaId: string };
}

type Passo = "dados" | "confirmar" | "feito";

export const JanelaEncomendar: React.FC<{
  item: ItemParaEncomendar | null;
  aoFechar: () => void;
  aoEncomendar: (
    item: ItemParaEncomendar,
    quantidade: number,
    observacao: string,
    variante: string | null,
  ) => Promise<void>;
  /** Até quando a encomenda feita agora pode ser cancelada (o banco calcula o corte) */
  cancelavelAte?: string | null;
}> = ({ item, aoFechar, aoEncomendar, cancelavelAte }) => {
  const [passo, setPasso] = useState<Passo>("dados");
  const [quantidade, setQuantidade] = useState(1);
  const [observacao, setObservacao] = useState("");
  const [variante, setVariante] = useState<string | null>(null);
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);

  // Cada item abre do começo
  useEffect(() => {
    if (!item) return;
    setPasso("dados");
    setQuantidade(1);
    setObservacao("");
    setErro("");
    const comPreco = item.tipos.filter((t) => t.venda != null);
    setVariante(
      comPreco.length > 1
        ? (comPreco.find((t) => t.provavel) ?? comPreco[0]).tipo
        : null,
    );
  }, [item]);

  if (!item) return null;
  const vendaDoTipo = variante
    ? (item.tipos.find((t) => t.tipo === variante)?.venda ?? item.venda)
    : item.venda;
  const qtd = Math.min(999, Math.max(1, quantidade || 1));
  // Depois do corte entra no pedido de amanhã (Elias, 26/10/2026): o vendedor sabe antes de prometer ao cliente
  const corte = cancelavelAte
    ? entraAmanha(cancelavelAte)
      ? { amanha: true, texto: `Depois do horário de corte: entra no pedido de amanhã. Dá para cancelar até amanhã, ${horaCurta(cancelavelAte)}.` }
      : { amanha: false, texto: `Entra no pedido de hoje. Dá para cancelar até ${horaCurta(cancelavelAte)}, na aba Encomendas.` }
    : null;
  const resumo = `${qtd}× ${item.codigo}${item.marca ? ` ${item.marca}` : ""}${variante ? ` (${variante})` : ""}`;

  const encomendar = async () => {
    setEnviando(true);
    setErro("");
    try {
      await aoEncomendar(item, qtd, observacao, variante);
      setPasso("feito");
    } catch (e) {
      setErro((e as Error).message);
      setPasso("dados");
    } finally {
      setEnviando(false);
    }
  };

  const campo =
    "mt-1 h-11 w-full rounded-xl border border-[var(--c-borda)] bg-[var(--c-superficie)] px-3 text-sm text-[var(--c-texto)] outline-none placeholder:text-[var(--c-texto-3)] focus:border-[var(--c-acento)]";

  return (
    <FolhaInferior
      aberto
      titulo={passo === "feito" ? "Encomendada" : "Encomendar"}
      subtitulo={`${item.fornecedorNome}${item.ehSimilar ? " · similar" : ""}`}
      aoFechar={aoFechar}
      aoVoltar={passo === "confirmar" ? () => setPasso("dados") : undefined}
      rodape={
        passo === "dados" ? (
          <button
            type="button"
            className={`${classeDoBotao.principal} w-full`}
            onClick={() => setPasso("confirmar")}
          >
            <ShoppingCart className="h-4 w-4" /> Encomendar
          </button>
        ) : passo === "confirmar" ? (
          <div className="flex gap-2">
            <button
              type="button"
              className={`${classeDoBotao.secundario} flex-1`}
              onClick={() => setPasso("dados")}
              disabled={enviando}
            >
              Voltar
            </button>
            <button
              type="button"
              className={`${classeDoBotao.principal} flex-1`}
              onClick={() => void encomendar()}
              disabled={enviando}
            >
              {enviando ? "Encomendando…" : "Sim, encomendar"}
            </button>
          </div>
        ) : (
          <button
            type="button"
            className={`${classeDoBotao.principal} w-full`}
            onClick={aoFechar}
          >
            Fechar
          </button>
        )
      }
    >
      <div className="p-4">
        {/* A peça escolhida, sempre à vista */}
        <div className="rounded-xl border border-[var(--c-borda)] bg-[var(--c-superficie-2)] p-3">
          <div className="flex items-baseline justify-between gap-3">
            <span className="min-w-0">
              <span className="block text-base font-extrabold text-[var(--c-texto)]">
                {item.codigo}
              </span>
              <span className="block truncate text-xs text-[var(--c-texto-2)]">
                {[item.descricao, item.marca].filter(Boolean).join(" · ")}
              </span>
            </span>
            <span className="whitespace-nowrap text-lg font-extrabold tabular-nums text-[var(--c-texto)]">
              {brl(vendaDoTipo ?? item.venda)}
            </span>
          </div>
          <span className="mt-1 block text-xs text-[var(--c-texto-3)]">
            {item.fornecedorNome}
            {item.prazo && ` · ${item.prazo}`}
            {item.fator != null && ` · fator ${item.fator.toFixed(2).replace(".", ",")}`}
          </span>
        </div>

        {passo === "dados" && (
          <div className="mt-4 flex flex-col gap-4">
            {variante && (
              <label className="text-xs font-semibold text-[var(--c-texto-2)]">
                Tipo da peça (o preço muda com o tipo)
                <select
                  className={campo}
                  value={variante}
                  onChange={(e) => setVariante(e.target.value)}
                >
                  {item.tipos
                    .filter((t) => t.venda != null)
                    .map((t) => (
                      <option key={t.tipo} value={t.tipo}>
                        {t.tipo} — {brl(t.venda!)}
                      </option>
                    ))}
                </select>
              </label>
            )}
            <div className="text-xs font-semibold text-[var(--c-texto-2)]">
              <span id="encomendar-qtd">Quantidade</span>
              <div
                className="mt-1 flex items-center gap-2"
                role="group"
                aria-labelledby="encomendar-qtd"
              >
                <button
                  type="button"
                  aria-label="Menos uma"
                  className={`${classeDoBotao.secundario} h-11 w-11 px-0`}
                  onClick={() => setQuantidade(qtd - 1)}
                  disabled={qtd <= 1}
                >
                  <Minus className="h-4 w-4" />
                </button>
                <input
                  aria-label="Quantidade"
                  inputMode="numeric"
                  className={`${campo} mt-0 w-20 text-center text-base font-bold tabular-nums`}
                  value={quantidade || ""}
                  onChange={(e) =>
                    setQuantidade(
                      Number(e.target.value.replace(/\D/g, "")) || 0,
                    )
                  }
                />
                <button
                  type="button"
                  aria-label="Mais uma"
                  className={`${classeDoBotao.secundario} h-11 w-11 px-0`}
                  onClick={() => setQuantidade(qtd + 1)}
                  disabled={qtd >= 999}
                >
                  <Plus className="h-4 w-4" />
                </button>
                <span className="ml-auto text-sm font-bold tabular-nums text-[var(--c-texto)]">
                  {brl((vendaDoTipo ?? item.venda) * qtd)}
                </span>
              </div>
            </div>
            <label className="text-xs font-semibold text-[var(--c-texto-2)]">
              Observação
              <input
                className={campo}
                placeholder="Nome ou telefone do cliente"
                value={observacao}
                maxLength={120}
                onChange={(e) => setObservacao(e.target.value)}
              />
              <span className="mt-1 block font-normal text-[var(--c-texto-3)]">
                Vai no aviso de chegada da peça, para você avisar o cliente.
              </span>
            </label>
            {corte?.amanha && (
              <p className="rounded-lg bg-[color-mix(in_srgb,var(--c-atencao)_12%,transparent)] px-3 py-2 text-xs font-semibold text-[var(--c-atencao)]">
                {corte.texto}
              </p>
            )}
            {erro && (
              <p role="alert" className="text-sm text-[var(--c-erro)]">
                {erro}
              </p>
            )}
          </div>
        )}

        {passo === "confirmar" && (
          <div className="mt-5 text-center">
            <p className="text-base font-extrabold text-[var(--c-texto)]">
              Você tem certeza que deseja encomendar?
            </p>
            <p className="mt-2 text-sm text-[var(--c-texto-2)]">
              {resumo} · {item.fornecedorNome} ·{" "}
              {brl((vendaDoTipo ?? item.venda) * qtd)}
            </p>
            {observacao.trim() && (
              <p className="mt-1 text-xs text-[var(--c-texto-3)]">
                Observação: {observacao.trim()}
              </p>
            )}
            <p className={`mt-3 text-xs ${corte?.amanha ? "font-bold text-[var(--c-atencao)]" : "text-[var(--c-texto-3)]"}`}>
              A compra fica autorizada. {corte?.texto ?? "Dá para cancelar até o horário de corte, na aba Encomendas."}
            </p>
          </div>
        )}

        {passo === "feito" && (
          <div className="mt-5 flex flex-col items-center text-center">
            <CheckCircle2 className="h-10 w-10 text-[var(--c-ok)]" />
            <p className="mt-2 text-base font-extrabold text-[var(--c-texto)]">
              {resumo} encomendada
            </p>
            <p className="mt-1 text-sm text-[var(--c-texto-2)]">
              Compras já vê na coluna da {item.fornecedorNome}. Acompanhe na aba
              Encomendas.
            </p>
          </div>
        )}
      </div>
    </FolhaInferior>
  );
};
