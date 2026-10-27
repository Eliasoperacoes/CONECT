/**
 * O CARTÃO DA COTAÇÃO — o widget de uma peça (Elias, 21/10/2026).
 *
 * "São mais de 10 fornecedores; um embaixo do outro vira rolagem infinita.
 * Colunas, todas do mesmo tamanho, com os similares minimizados; o widget
 * organizado e com todas as informações centralizadas nele."
 *
 *   ┌ PEÇA · descrição · marca ................ [ações] ┐
 *   │ Melhor preço │ Com estoque 6 de 10 │ Similar mais barato │  ← o resumo
 *   │ [Com estoque | Todos]                 [Menor preço ▾]   │
 *   │ ┌fornecedor┐ ┌fornecedor┐ ┌fornecedor┐ ┌fornecedor┐    │  ← a grade
 *   │ │ R$ 16,90 │ │ R$ 35,90 │ │  Sem     │ │ ...      │    │
 *   │ │ similares▾│ │          │ │ similares▾│ │          │    │
 *   └─────────────────────────────────────────────────────────┘
 *
 * Os dados chegam prontos (cotar.ts: blocosPorFornecedor, resumoDoCartao);
 * aqui só se desenha. Custo e fator chegam nulos para quem não vê custo.
 */
import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ChevronDown,
  Clock,
  Loader2,
  MapPin,
  Package,
  RefreshCw,
  ShoppingCart,
  Sparkles,
  Trophy,
  UserRound,
  X,
} from 'lucide-react';
import {
  blocosPorFornecedor,
  comAPeca,
  comFatorDoVendedor,
  foiCotadaHoje,
  resumoDoCartao,
  type Andamento,
  type BlocoDoFornecedor,
  type CartaoDaPeca,
  type Oferta,
  type OrdemDosBlocos,
} from '../../servicos/cotar';
import type { Solicitacao } from '../../servicos/cotacaoHumana';
import { lerFator, mostrarFator } from '../../servicos/margens';
import { ROTULO_DA_SITUACAO, type MinhaEncomenda } from '../../servicos/encomendas';
import type { ItemParaEncomendar } from './JanelaEncomendar';
import { FiltroSegmentado, classeDoBotao } from '../PadraoWeb';
import { Selo, LinhaDeCusto, brl, haQuanto, quandoCurto } from './visual';

const ROTULO_DO_ANDAMENTO: Record<Andamento['situacao'], string> = {
  pronta: 'Pronto',
  na_fila: 'Na fila…',
  cotando: 'Cotando nos fornecedores…',
  erro: 'Erro',
  sem_pedido: 'Aguardando cotação',
};

/** A situação de uma oferta em palavra e cor (a cor nunca fala sozinha). */
const situacaoDa = (o: Oferta | null) =>
  o?.venda == null
    ? { rotulo: 'Sem estoque', tom: 'neutro' as const, faixa: 'bg-[var(--c-borda-forte)]' }
    : o.emSP
      ? { rotulo: 'Em SP', tom: 'ok' as const, faixa: 'bg-[var(--c-ok)]' }
      : { rotulo: 'Fora do estado', tom: 'atencao' as const, faixa: 'bg-[var(--c-atencao)]' };

/** Um ícone e um texto, numa linha (local, estoque, prazo). */
const Info: React.FC<{ icone: React.ReactNode; children: React.ReactNode }> = ({ icone, children }) => (
  <span className="flex min-w-0 items-center gap-1.5 text-xs text-[var(--c-texto-2)]">
    <span className="flex-shrink-0 text-[var(--c-texto-3)]" aria-hidden>
      {icone}
    </span>
    <span className="truncate">{children}</span>
  </span>
);

/** Um número do resumo do topo. */
const Numero: React.FC<{ rotulo: string; icone: React.ReactNode; children: React.ReactNode; detalhe?: React.ReactNode; tom?: string }> = ({
  rotulo,
  icone,
  children,
  detalhe,
  tom = 'text-[var(--c-texto)]',
}) => (
  // No celular os três cabem lado a lado: menos respiro, sem ícone, rótulo pode quebrar
  <div className="min-w-0 px-3 py-2.5 sm:px-4 sm:py-3">
    <span className="flex items-center gap-1.5 text-[10px] font-extrabold uppercase leading-tight tracking-wider text-[var(--c-texto-3)]">
      <span aria-hidden className="hidden sm:inline">
        {icone}
      </span>
      {rotulo}
    </span>
    <span className={`mt-1 block truncate text-base font-extrabold tabular-nums sm:text-lg ${tom}`}>{children}</span>
    {detalhe && <span className="block truncate text-xs text-[var(--c-texto-3)]">{detalhe}</span>}
  </div>
);

/** "Encomendar": pequeno, ao lado do preço, para não roubar o lugar do preço. */
const BotaoEncomendar: React.FC<{ aoTocar: () => void; rotulo: string }> = ({ aoTocar, rotulo }) => (
  <button
    type="button"
    onClick={aoTocar}
    aria-label={rotulo}
    title={rotulo}
    className="inline-flex h-8 min-w-8 flex-shrink-0 items-center justify-center gap-1 rounded-lg border border-[var(--c-acento)] px-1.5 text-[11px] @min-[15rem]:px-2 font-bold text-[var(--c-acento)] transition hover:bg-[var(--c-acento)] hover:text-[var(--c-sobre-acento)]"
  >
    <ShoppingCart className="h-3.5 w-3.5" aria-hidden />
    {/* Bloco estreito (2 colunas no celular): só o carrinho; o nome fica no aria-label */}
    <span className="hidden @min-[15rem]:inline">Encomendar</span>
  </button>
);

/** A oferta de um B2B → o que a janela de encomendar precisa (e como o banco a acha de novo). */
const itemDaOferta = (o: Oferta, nome: string, codigoCotado: string, ehSimilar: boolean, marca: string | null, descricao: string | null, fator: number | null): ItemParaEncomendar => ({
  codigo: o.codigo,
  marca: o.marca ?? marca,
  descricao: o.descricao ?? descricao,
  fornecedorNome: nome,
  venda: o.venda!,
  prazo: o.prazo,
  ehSimilar,
  tipos: o.tipos.map((t) => ({ tipo: t.tipo, venda: t.venda, provavel: t.provavel })),
  alvo: { de: 'b2b', codigoCotado, fornecedor: o.fornecedor },
  ...(fator != null && { fator }),
});

/** UM FORNECEDOR: o mesmo tamanho para todos; os similares minimizados dentro. */
const BlocoFornecedor: React.FC<{
  b: BlocoDoFornecedor;
  nome: string;
  melhor: boolean;
  mostraCusto: boolean;
  codigoCotado: string;
  aoEncomendar?: (item: ItemParaEncomendar) => void;
  /** Callcenter: o número grande é custo + frete até ele digitar o fator; com o fator, a venda dele */
  montaPreco?: boolean;
  fator?: number | null;
}> = ({ b, nome, melhor, mostraCusto, codigoCotado, aoEncomendar, montaPreco = false, fator = null }) => {
  const [aberto, setAberto] = useState(false);
  const semPreco = montaPreco && fator == null;
  // Sem o fator digitado não há preço para encomendar
  const encomendar = semPreco ? undefined : aoEncomendar;
  const o = b.peca;
  const s = situacaoDa(o);
  const tipos = o && o.tipos.length > 1 ? o.tipos : null;
  const idSimilares = `similares-${nome.replace(/\W/g, '')}-${b.similares[0]?.codigo ?? ''}`;

  return (
    <section
      aria-label={`${nome}: ${o?.venda != null ? brl(o.venda) : 'sem estoque'}`}
      className={`@container relative flex flex-col overflow-hidden rounded-xl border bg-[var(--c-superficie)] transition-shadow hover:shadow-[var(--s-2)] ${
        melhor ? 'border-[var(--c-ok)] ring-1 ring-[var(--c-ok)]' : 'border-[var(--c-borda)]'
      }`}
    >
      {/* A cor da situação, numa faixa no topo */}
      <span className={`h-1 w-full ${s.faixa}`} aria-hidden />
      {/* O corpo tem a mesma altura em todos os blocos: a grade fica alinhada */}
      <div className="flex min-h-[10.5rem] flex-1 flex-col gap-2 p-3">
        <div className="flex items-start justify-between gap-2">
          <span className="truncate text-sm font-extrabold text-[var(--c-texto)]">{nome}</span>
          {melhor ? (
            <Selo tom="ok">
              <Trophy className="h-3 w-3" /> Melhor
            </Selo>
          ) : (
            <Selo tom={s.tom}>{s.rotulo}</Selo>
          )}
        </div>

        {o?.venda != null ? (
          <>
            <div className="flex items-center justify-between gap-2">
              <span className="text-xl font-extrabold leading-none @min-[15rem]:text-2xl tabular-nums text-[var(--c-texto)]">
                {tipos && <span className="mr-1 align-middle text-[10px] font-bold uppercase text-[var(--c-atencao)]">desde</span>}
                {semPreco && <span className="mr-1 align-middle text-[10px] font-bold uppercase text-[var(--c-acento)]">custo</span>}
                {brl(o.venda)}
              </span>
              {encomendar && (
                <BotaoEncomendar
                  rotulo={`Encomendar ${o.codigo} na ${nome}`}
                  aoTocar={() => encomendar(itemDaOferta(o, nome, codigoCotado, false, o.marca, o.descricao, fator))}
                />
              )}
            </div>
            {/* Sempre as três linhas, na mesma ordem: o olho acha a mesma coisa no mesmo lugar */}
            <div className="flex flex-col gap-1">
              <Info icone={<MapPin className="h-3.5 w-3.5" />}>{o.local ?? '—'}</Info>
              <Info icone={<Package className="h-3.5 w-3.5" />}>{o.quantidade != null ? `${o.quantidade} un. em estoque` : 'estoque não informado'}</Info>
              <Info icone={<Clock className="h-3.5 w-3.5" />}>{o.prazo ?? '—'}</Info>
            </div>
            {melhor && o.emSP === false && <Selo tom="atencao">Fora do estado</Selo>}
            {tipos && (
              <div className="rounded-lg bg-[color-mix(in_srgb,var(--c-atencao)_10%,transparent)] p-2 text-[11px]">
                <span className="flex items-center gap-1 font-bold text-[var(--c-atencao)]">
                  <AlertTriangle className="h-3 w-3" /> Preço depende do tipo
                </span>
                {tipos.map((t) => (
                  <span key={t.tipo} className={`flex justify-between gap-2 ${t.provavel ? 'font-bold text-[var(--c-texto)]' : 'text-[var(--c-texto-2)]'}`}>
                    <span className="truncate">{t.tipo}</span>
                    <span className="tabular-nums">{t.venda == null ? '—' : brl(t.venda)}</span>
                  </span>
                ))}
              </div>
            )}
            {montaPreco && o.custo != null && (
              // O Callcenter: de onde vem a base, e o fator da marca como sugestão
              <span className="mt-auto truncate text-[11px] font-semibold tabular-nums text-[var(--c-acento)]">
                custo {brl(o.custo)}
                {o.frete ? ` + frete ${brl(o.frete)}` : ''}
                {o.fator != null && <span className="font-medium text-[var(--c-texto-3)]"> · sugestão {mostrarFator(o.fator)}</span>}
              </span>
            )}
            {!montaPreco && mostraCusto && o.custo != null && (
              // Uma linha só, no pé do corpo; o detalhe inteiro no "title"
              <span
                className="mt-auto truncate text-[11px] font-semibold tabular-nums text-[var(--c-acento)]"
                title={`custo ${brl(o.custo)}${o.frete ? ` + frete ${brl(o.frete)}` : ' · frete grátis'} × fator ${o.fator?.toFixed(2).replace('.', ',')}${o.fatorPadrao ? ' (fator padrão)' : ''}`}
              >
                custo {brl(o.custo)}
                {o.frete ? ` + ${brl(o.frete)}` : ''} × {o.fator?.toFixed(2).replace('.', ',')}
                {o.fatorPadrao && ' *'}
              </span>
            )}
          </>
        ) : (
          <span className="flex flex-1 items-center text-sm font-semibold text-[var(--c-texto-3)]">
            {o ? 'Não tem a peça hoje' : 'Só tem similares'}
          </span>
        )}
      </div>

      {/* Os similares DESTE fornecedor: minimizados; abrir faz só este bloco crescer.
          O rodapé existe em todos os blocos, com ou sem similar: a grade fica alinhada */}
      {b.similares.length === 0 ? (
        <div className="border-t border-[var(--c-borda)] px-3 py-2 text-xs text-[var(--c-texto-3)]">Sem similares</div>
      ) : (
        <div className="border-t border-[var(--c-borda)]">
          <button
            type="button"
            aria-expanded={aberto}
            aria-controls={idSimilares}
            onClick={() => setAberto(!aberto)}
            className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-xs font-bold text-[var(--c-acento)] hover:bg-[var(--c-superficie-2)]"
          >
            <span className="truncate">
              Similares ({b.similares.length})
              {b.similarMaisBarato != null && <span className="font-semibold text-[var(--c-texto-2)]"> · desde {brl(b.similarMaisBarato)}</span>}
            </span>
            <ChevronDown className={`h-4 w-4 flex-shrink-0 transition-transform ${aberto ? 'rotate-180' : ''}`} aria-hidden />
          </button>
          {aberto && (
            <ul id={idSimilares} className="divide-y divide-[var(--c-borda)] border-t border-[var(--c-borda)] bg-[var(--c-superficie-2)]">
              {b.similares.map((sim) => (
                <li key={sim.codigo} className="px-3 py-2">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="min-w-0 truncate text-xs font-extrabold text-[var(--c-texto)]">{sim.codigo}</span>
                    <span className={`whitespace-nowrap text-sm font-extrabold tabular-nums ${sim.oferta.venda == null ? 'text-[var(--c-texto-3)]' : 'text-[var(--c-texto)]'}`}>
                      {sim.oferta.venda == null ? 'sem estoque' : brl(sim.oferta.venda)}
                    </span>
                  </div>
                  <span className="block truncate text-[11px] text-[var(--c-texto-3)]">
                    {[sim.marca, sim.oferta.venda != null ? sim.oferta.prazo : null, sim.oferta.emSP === false ? 'fora do estado' : null].filter(Boolean).join(' · ')}
                  </span>
                  {mostraCusto && sim.oferta.custo != null && <LinhaDeCusto custo={sim.oferta.custo} frete={sim.oferta.frete} fator={montaPreco ? null : sim.oferta.fator} />}
                  {encomendar && sim.oferta.venda != null && (
                    <div className="mt-1.5">
                      <BotaoEncomendar
                        rotulo={`Encomendar o similar ${sim.codigo} na ${nome}`}
                        aoTocar={() => encomendar(itemDaOferta(sim.oferta, nome, codigoCotado, true, sim.marca, sim.descricao, fator))}
                      />
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
};

/** A resposta do comprador, como mais um bloco da grade (azul). */
const BlocoDoComprador: React.FC<{ s: Solicitacao; mostraCusto: boolean; aoEncomendar?: (item: ItemParaEncomendar) => void }> = ({
  s,
  mostraCusto,
  aoEncomendar,
}) => (
  <section aria-label="Cotado pelo comprador" className="flex min-h-[12.5rem] flex-col overflow-hidden rounded-xl border border-[var(--c-acento)] bg-[var(--c-superficie)]">
    <span className="h-1 w-full bg-[var(--c-acento)]" aria-hidden />
    <div className="flex flex-1 flex-col gap-2 p-3">
      <div className="flex items-start justify-between gap-2">
        <span className="text-sm font-extrabold text-[var(--c-texto)]">Comprador</span>
        <Selo tom="acento">
          <UserRound className="h-3 w-3" /> Fora do B2B
        </Selo>
      </div>
      {s.situacao === 'aberta' && (
        <span className="flex items-center gap-2 text-sm text-[var(--c-texto-2)]">
          <Loader2 className="h-4 w-4 animate-spin text-[var(--c-acento)]" /> Aguardando · {haQuanto(s.criadaEm)}
        </span>
      )}
      {s.situacao === 'nao_encontrada' && (
        <span className="text-sm text-[var(--c-erro)]">
          {s.nomeDeQuemRespondeu ?? 'O comprador'} não encontrou{s.motivo ? `: ${s.motivo}` : '.'}
        </span>
      )}
      {s.opcoes.map((o, i) => (
        <div key={i} className={i ? 'border-t border-[var(--c-borda)] pt-2' : ''}>
          <div className="flex items-baseline justify-between gap-2">
            <span className="min-w-0 truncate text-xs font-bold text-[var(--c-texto)]">{o.fornecedor}</span>
            <span className={`whitespace-nowrap font-extrabold tabular-nums text-[var(--c-texto)] ${i ? 'text-sm' : 'text-2xl'}`}>{brl(o.venda)}</span>
          </div>
          <span className="block truncate text-[11px] text-[var(--c-texto-3)]">{[o.marca, o.prazo ?? 'prazo a confirmar'].filter(Boolean).join(' · ')}</span>
          {mostraCusto && o.custo != null && <LinhaDeCusto custo={o.custo} />}
          {aoEncomendar && o.respostaId && (
            <div className="mt-1.5">
              <BotaoEncomendar
                rotulo={`Encomendar ${s.codigo} na ${o.fornecedor}`}
                aoTocar={() =>
                  aoEncomendar({
                    codigo: s.codigo,
                    marca: o.marca,
                    descricao: null,
                    fornecedorNome: o.fornecedor,
                    venda: o.venda,
                    prazo: o.prazo,
                    ehSimilar: false,
                    tipos: [],
                    alvo: { de: 'comprador', respostaId: o.respostaId! },
                  })
                }
              />
            </div>
          )}
        </div>
      ))}
      {(s.veiculo || s.nomeDeQuemRespondeu) && (
        <span className="mt-auto text-[11px] text-[var(--c-texto-3)]">
          {[s.veiculo, s.nomeDeQuemRespondeu ? `por ${s.nomeDeQuemRespondeu}` : null].filter(Boolean).join(' · ')}
        </span>
      )}
    </div>
  </section>
);

export const CartaoDaCotacao: React.FC<{
  codigo: string;
  andamento?: Andamento;
  cartao?: CartaoDaPeca;
  /** Aberta pelo Histórico: o resultado daquela vez, em uma frase */
  foto?: { quando: string; resumo: string };
  solicitacao?: Solicitacao;
  nomes: Record<string, string>;
  mostraCusto: boolean;
  podePedirAoComprador: boolean;
  aoAtualizar: () => void;
  aoPedirAoComprador: () => void;
  aoFechar: () => void;
  /** O formulário de pedir ao comprador, quando aberto */
  formulario?: React.ReactNode;
  /** Quem cota encomenda (SPEC-pedidos-compras); sem isto, os botões não aparecem */
  aoEncomendar?: (item: ItemParaEncomendar) => void;
  /** O que já foi encomendado desta peça: para ninguém encomendar duas vezes sem perceber */
  encomendadas?: MinhaEncomenda[];
  /**
   * RECOLHIDO (Elias, 22/10/2026: "ao cotar mais de uma peça fica uma em cima
   * da outra, poluindo o layout"): só a linha da peça, com o essencial; tocar
   * expande. Fica montado, então o filtro e a ordem não se perdem.
   */
  recolhido?: boolean;
  aoExpandir?: () => void;
  /** Callcenter: vê o custo e digita o fator (montaOPreco) */
  montaPreco?: boolean;
}> = ({
  codigo,
  andamento,
  cartao,
  foto,
  solicitacao,
  nomes,
  mostraCusto,
  podePedirAoComprador,
  aoAtualizar,
  aoPedirAoComprador,
  aoFechar,
  formulario,
  aoEncomendar,
  encomendadas = [],
  recolhido = false,
  aoExpandir,
  montaPreco = false,
}) => {
  const [ordem, setOrdem] = useState<OrdemDosBlocos>('preco');
  const [todos, setTodos] = useState(false);
  // O fator do Callcenter: um para o cartão inteiro; vazio = só o custo + frete
  const [textoDoFator, setTextoDoFator] = useState('');
  const fator = montaPreco ? lerFator(textoDoFator) : null;
  const fatorInvalido = montaPreco && textoDoFator.trim() !== '' && fator == null;
  const semPreco = montaPreco && fator == null;
  const visto = useMemo(() => (cartao && montaPreco ? comFatorDoVendedor(cartao, fator) : cartao), [cartao, montaPreco, fator]);
  // Os fatores das marcas com estoque: a dica do campo
  const sugestoes = useMemo(
    () =>
      [...new Set([...(cartao?.ofertas ?? []), ...(cartao?.similares.flatMap((g) => g.ofertas) ?? [])].filter((o) => o.venda != null && o.fator != null).map((o) => o.fator!))].sort(
        (a, b) => a - b
      ),
    [cartao]
  );
  const blocos = useMemo(() => (visto ? blocosPorFornecedor(visto, ordem) : []), [visto, ordem]);
  const resumo = useMemo(() => resumoDoCartao(blocosPorFornecedor(visto ?? { codigo, marca: null, descricao: null, ofertas: [], similares: [] })), [visto, codigo]);
  const temAPeca = comAPeca(blocos);
  // Ninguém tem a peça: mostra todos (os similares), sem a pessoa ter de achar o filtro
  const verTodos = todos || temAPeca.length === 0;
  const visiveis = verTodos ? blocos : temAPeca;
  const situacao = andamento?.situacao;
  const esperando = !cartao && situacao !== 'erro';
  // Aberta sem cotar (Histórico, chat) e ninguém cotou nos B2B hoje
  const naoCotadaHoje = !!cartao && !foiCotadaHoje(cartao);
  const nome = (f: string) => nomes[f] ?? f;
  const botao =
    'inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-[var(--c-borda)] bg-[var(--c-superficie)] px-3 text-xs font-bold text-[var(--c-texto-2)] transition hover:border-[var(--c-acento)] hover:text-[var(--c-acento)] disabled:cursor-not-allowed disabled:opacity-50';

  if (recolhido) {
    // A linha da peça: o mesmo que o vendedor procura no cartão aberto, numa linha só
    const selo = esperando ? (
      <Selo tom="acento">
        <Loader2 className="h-3 w-3 animate-spin" /> {situacao ? ROTULO_DO_ANDAMENTO[situacao] : 'Pedindo…'}
      </Selo>
    ) : situacao === 'erro' ? (
      <Selo tom="erro">Erro</Selo>
    ) : naoCotadaHoje ? (
      <Selo tom="neutro">Não cotado hoje</Selo>
    ) : (
      <Selo tom="ok">Cotado</Selo>
    );
    return (
      <article aria-labelledby={`peca-${codigo}`} className="group relative rounded-xl border border-[var(--c-borda)] bg-[var(--c-superficie)] transition hover:border-[var(--c-acento)] hover:shadow-[var(--s-1)]">
        <button
          type="button"
          onClick={aoExpandir}
          aria-expanded={false}
          className="grid w-full grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1 py-3 pl-4 pr-12 text-left md:grid-cols-[minmax(0,1fr)_10rem_7rem_1rem]"
        >
          <span className="min-w-0">
            <span className="flex items-center gap-2">
              <h3 id={`peca-${codigo}`} className="text-base font-extrabold tracking-tight text-[var(--c-texto)]">
                {codigo}
              </h3>
              {selo}
              {encomendadas.length > 0 && (
                <Selo tom="acento">
                  <ShoppingCart className="h-3 w-3" /> Encomendado
                </Selo>
              )}
            </span>
            <span className="block truncate text-xs text-[var(--c-texto-3)]">
              {[cartao?.descricao, cartao?.marca].filter(Boolean).join(' · ') || (solicitacao ? 'Pedido ao comprador' : ' ')}
            </span>
          </span>
          {/* O melhor preço: o que o vendedor fala para o cliente */}
          <span className="text-right md:text-left">
            {resumo.melhor ? (
              <>
                <span className="block text-base font-extrabold tabular-nums text-[var(--c-ok)]">
                  {semPreco && <span className="mr-1 text-[10px] font-bold uppercase text-[var(--c-acento)]">custo</span>}
                  {brl(resumo.melhor.oferta.venda!)}
                </span>
                <span className="block truncate text-[11px] text-[var(--c-texto-3)]">{nome(resumo.melhor.fornecedor)}</span>
              </>
            ) : (
              <span className="text-xs font-semibold text-[var(--c-texto-3)]">{cartao && !naoCotadaHoje ? 'Sem estoque' : '—'}</span>
            )}
          </span>
          <span className="hidden text-xs text-[var(--c-texto-2)] md:block">
            {cartao && !naoCotadaHoje ? `${resumo.comEstoque} de ${resumo.fornecedores} com a peça` : ''}
          </span>
          <ChevronDown className="hidden h-4 w-4 text-[var(--c-texto-3)] transition group-hover:text-[var(--c-acento)] md:block" aria-hidden />
        </button>
        <button
          type="button"
          aria-label={`Fechar ${codigo}`}
          onClick={aoFechar}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-2 text-[var(--c-texto-3)] hover:bg-[var(--c-superficie-2)] hover:text-[var(--c-texto)]"
        >
          <X className="h-4 w-4" />
        </button>
      </article>
    );
  }

  return (
    <article aria-labelledby={`peca-${codigo}`} className="relative overflow-hidden rounded-2xl border border-[var(--c-borda)] bg-[var(--c-superficie)] shadow-[var(--s-1)]">
      {/* A PEÇA, uma vez, e as ações juntas */}
      {/* O X fica sempre no canto, fora da linha de ações: no celular ela quebra */}
      <button
        type="button"
        aria-label={`Fechar ${codigo}`}
        onClick={aoFechar}
        className="absolute right-2 top-2 rounded-lg p-2 text-[var(--c-texto-3)] hover:bg-[var(--c-superficie-2)] hover:text-[var(--c-texto)]"
      >
        <X className="h-4 w-4" />
      </button>
      <header className="flex flex-col gap-3 border-b border-[var(--c-borda)] py-3 pl-4 pr-12 xl:flex-row xl:items-start xl:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 id={`peca-${codigo}`} className="text-xl font-extrabold tracking-tight text-[var(--c-texto)]">
              {codigo}
            </h3>
            {esperando ? (
              <Selo tom="acento">
                <Loader2 className="h-3 w-3 animate-spin" /> {situacao ? ROTULO_DO_ANDAMENTO[situacao] : 'Pedindo…'}
              </Selo>
            ) : situacao === 'erro' ? (
              <Selo tom="erro">Erro</Selo>
            ) : naoCotadaHoje ? (
              <Selo tom="neutro">{foto ? `Cotado ${quandoCurto(foto.quando)}` : 'Não cotado hoje'}</Selo>
            ) : (
              <Selo tom="ok">Cotado</Selo>
            )}
          </div>
          {cartao && (cartao.descricao || cartao.marca) && (
            <p className="mt-0.5 truncate text-sm text-[var(--c-texto-2)]">
              {cartao.descricao}
              {cartao.descricao && cartao.marca && ' · '}
              {cartao.marca && <b className="font-semibold">{cartao.marca}</b>}
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={aoAtualizar} className={botao}>
            <RefreshCw className="h-3.5 w-3.5" /> Atualizar
          </button>
          {podePedirAoComprador && (
            <button type="button" onClick={aoPedirAoComprador} className={botao}>
              <UserRound className="h-3.5 w-3.5" /> Pedir ao comprador
            </button>
          )}
        </div>
      </header>

      {/* O que já foi encomendado desta peça (as minhas, em andamento) */}
      {encomendadas.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 border-b border-[var(--c-borda)] bg-[var(--c-acento-suave)] px-4 py-2 text-xs text-[var(--c-texto)]">
          <ShoppingCart className="h-3.5 w-3.5 text-[var(--c-acento)]" aria-hidden />
          <b className="font-bold">Já encomendado:</b>
          {encomendadas.map((e) => (
            <span key={e.id} className="inline-flex items-center gap-1.5">
              {e.quantidade}× {e.codigo} · {e.fornecedor_nome}
              <Selo tom="acento">{ROTULO_DA_SITUACAO[e.situacao]}</Selo>
            </span>
          ))}
        </div>
      )}

      {situacao === 'erro' && <p className="px-4 py-3 text-sm text-[var(--c-erro)]">Não deu para cotar: {andamento?.erro}</p>}

      {esperando && (
        // Enquanto cota: o lugar dos blocos, para nada pular quando chegar
        <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" aria-busy="true" aria-label="Cotando nos fornecedores">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-[12.5rem] animate-pulse rounded-xl bg-[var(--c-superficie-2)]" />
          ))}
        </div>
      )}

      {naoCotadaHoje && (
        // Nada de "nenhum fornecedor tem": ninguém perguntou aos B2B hoje
        <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-[var(--c-texto-2)]">
            {foto ? (
              <>
                Na última cotação ({quandoCurto(foto.quando)}): <b className="font-semibold text-[var(--c-texto)]">{foto.resumo}</b>. O preço pode ter mudado.
              </>
            ) : (
              'Esta peça não foi cotada nos B2B hoje.'
            )}
          </p>
          <button type="button" onClick={aoAtualizar} className={`${classeDoBotao.principal} flex-shrink-0`}>
            <RefreshCw className="h-4 w-4" /> Cotar nos B2B agora
          </button>
        </div>
      )}

      {cartao && !naoCotadaHoje && (
        <>
          {/* O RESUMO: o que o vendedor fala para o cliente, em 1 segundo */}
          <div className="grid grid-cols-3 divide-x divide-[var(--c-borda)] border-b border-[var(--c-borda)] bg-[var(--c-superficie-2)]">
            <Numero
              rotulo={semPreco ? 'Menor custo + frete' : 'Melhor preço'}
              icone={<Trophy className="h-3.5 w-3.5" />}
              tom={resumo.melhor ? 'text-[var(--c-ok)]' : 'text-[var(--c-texto-3)]'}
              detalhe={resumo.melhor ? [nome(resumo.melhor.fornecedor), resumo.melhor.oferta.prazo].filter(Boolean).join(' · ') : 'nenhum fornecedor tem a peça'}
            >
              {resumo.melhor ? brl(resumo.melhor.oferta.venda!) : 'Sem estoque'}
            </Numero>
            <Numero
              rotulo="Com a peça"
              icone={<Package className="h-3.5 w-3.5" />}
              detalhe={
                <span className="mt-1 flex h-1.5 overflow-hidden rounded-full bg-[var(--c-borda)]" aria-hidden>
                  <span className="bg-[var(--c-ok)]" style={{ width: `${resumo.fornecedores ? (resumo.comEstoque / resumo.fornecedores) * 100 : 0}%` }} />
                </span>
              }
            >
              {resumo.comEstoque} de {resumo.fornecedores}
              <span className="hidden sm:inline"> fornecedores</span>
            </Numero>
            <Numero
              rotulo="Similar mais barato"
              icone={<Sparkles className="h-3.5 w-3.5" />}
              tom={resumo.similarMaisBarato ? 'text-[var(--c-texto)]' : 'text-[var(--c-texto-3)]'}
              detalhe={
                resumo.similarMaisBarato
                  ? [resumo.similarMaisBarato.similar.codigo, resumo.similarMaisBarato.similar.marca, nome(resumo.similarMaisBarato.fornecedor)].filter(Boolean).join(' · ')
                  : 'nenhum similar com estoque'
              }
            >
              {resumo.similarMaisBarato ? brl(resumo.similarMaisBarato.similar.oferta.venda!) : '—'}
            </Numero>
          </div>

          {/* Filtro e ordem dos blocos */}
          <div className="flex flex-wrap items-center justify-between gap-2 px-4 pt-3">
            <FiltroSegmentado
              opcoes={[
                { id: 'com', rotulo: 'Com a peça', contador: temAPeca.length },
                { id: 'todos', rotulo: 'Todos', contador: blocos.length },
              ]}
              ativo={verTodos ? 'todos' : 'com'}
              aoEscolher={(id) => setTodos(id === 'todos')}
            />
            {montaPreco && (
              // O Callcenter põe a margem: o preço de todos os blocos sai deste número
              <label className="flex items-center gap-2 text-xs text-[var(--c-texto-3)]">
                <span className="font-bold text-[var(--c-texto)]">Fator</span>
                <input
                  value={textoDoFator}
                  onChange={(e) => setTextoDoFator(e.target.value)}
                  inputMode="decimal"
                  placeholder={sugestoes.length ? mostrarFator(sugestoes[0]) : '1,80'}
                  aria-invalid={fatorInvalido}
                  aria-describedby={`fator-${codigo}`}
                  className={`h-8 w-16 rounded-lg border bg-[var(--c-superficie)] px-2 text-center text-sm font-bold tabular-nums text-[var(--c-texto)] outline-none placeholder:font-medium placeholder:text-[var(--c-texto-3)] focus:border-[var(--c-acento)] ${
                    fatorInvalido ? 'border-[var(--c-erro)]' : 'border-[var(--c-borda)]'
                  }`}
                />
                <span id={`fator-${codigo}`} className={fatorInvalido ? 'text-[var(--c-erro)]' : ''}>
                  {fatorInvalido
                    ? 'de 1,00 a 5,00'
                    : sugestoes.length === 1
                      ? `sugestão ${mostrarFator(sugestoes[0])}`
                      : sugestoes.length > 1
                        ? `sugestão ${mostrarFator(sugestoes[0])} a ${mostrarFator(sugestoes[sugestoes.length - 1])}, por marca`
                        : ''}
                </span>
              </label>
            )}
            {mostraCusto && !montaPreco && (
              <span className="order-last w-full text-[11px] text-[var(--c-texto-3)] sm:order-none sm:w-auto">
                <span className="font-semibold text-[var(--c-acento)]">Custo em azul</span> (+ frete × fator) · * fator padrão
              </span>
            )}
            <label className="flex items-center gap-2 text-xs text-[var(--c-texto-3)]">
              Ordenar
              <select
                value={ordem}
                onChange={(e) => setOrdem(e.target.value as OrdemDosBlocos)}
                className="h-8 rounded-lg border border-[var(--c-borda)] bg-[var(--c-superficie)] px-2 text-xs font-semibold text-[var(--c-texto)] outline-none focus:border-[var(--c-acento)]"
              >
                <option value="preco">Menor preço</option>
                <option value="prazo">Menor prazo</option>
              </select>
            </label>
          </div>

          {/* A GRADE: blocos do mesmo tamanho; só o que abre os similares cresce */}
          {/* Duas colunas já no celular: dez fornecedores em cinco linhas, não dez */}
          <div className="grid grid-cols-2 items-start gap-2 p-3 sm:gap-3 sm:p-4 lg:grid-cols-3 xl:grid-cols-4">
            {solicitacao && <BlocoDoComprador s={solicitacao} mostraCusto={mostraCusto} aoEncomendar={aoEncomendar} />}
            {visiveis.map((b) => (
              <BlocoFornecedor
                key={b.fornecedor}
                b={b}
                nome={nome(b.fornecedor)}
                melhor={resumo.melhor?.fornecedor === b.fornecedor}
                mostraCusto={mostraCusto}
                codigoCotado={codigo}
                aoEncomendar={aoEncomendar}
                montaPreco={montaPreco}
                fator={fator}
              />
            ))}
            {!visiveis.length && !solicitacao && (
              <div className="col-span-full rounded-xl border border-dashed border-[var(--c-borda)] p-6 text-center text-sm text-[var(--c-texto-2)]">
                Nenhum fornecedor tem a peça nem similar hoje.
                {podePedirAoComprador && (
                  <button type="button" onClick={aoPedirAoComprador} className="ml-1 font-bold text-[var(--c-acento)]">
                    Pedir ao comprador
                  </button>
                )}
              </div>
            )}
          </div>
        </>
      )}

      {(!cartao || naoCotadaHoje) && solicitacao && (
        <div className="grid items-start gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          <BlocoDoComprador s={solicitacao} mostraCusto={mostraCusto} aoEncomendar={aoEncomendar} />
        </div>
      )}

      {formulario}
    </article>
  );
};
