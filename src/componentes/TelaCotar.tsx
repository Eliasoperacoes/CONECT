/**
 * COTAR PEÇA (docs/cotador/SPEC-cotar.md) — a ferramenta do balcão.
 *
 * O balconista digita os códigos e vê, por fornecedor, por quanto vender, de
 * onde vem e em quantos dias chega; e os similares, sempre. Venda, custo e
 * prazo vêm prontos do banco (resultado_da_cotacao): a tela só desenha.
 * Custo e fator chegam nulos para quem não vê custo — não há o que esconder
 * aqui, porque não chega.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { RefreshCw, Search, ShoppingCart, AlertTriangle, Loader2 } from 'lucide-react';
import type { Colaborador } from '../tipos';
import { podeVerCusto } from '../tipos';
import { supabase } from '../servicos/supabase';
import {
  cotarPeloSupabase,
  separarCodigos,
  normalizarCodigo,
  acompanhar,
  terminou,
  type Andamento,
  type CartaoDaPeca,
  type GrupoDaPeca,
  type Oferta,
} from '../servicos/cotar';
import { EstadoVazio, classeDoBotao } from './PadraoWeb';
import { cotacaoHumanaPeloSupabase, type Solicitacao } from '../servicos/cotacaoHumana';
import { historicoPeloSupabase } from '../servicos/historico';
import { UserRound } from 'lucide-react';

/**
 * PEDIR AO COMPRADOR (cotação humana, Elias 21/10/2026): o B2B não tem a
 * peça, ou o cliente não quer o similar. O vendedor manda o veículo e uma
 * observação; a resposta volta neste mesmo cartão.
 */
const PedirAoComprador: React.FC<{ aoEnviar: (veiculo: string, observacao: string) => Promise<void> }> = ({ aoEnviar }) => {
  const [aberto, setAberto] = useState(false);
  const [veiculo, setVeiculo] = useState('');
  const [observacao, setObservacao] = useState('');
  const [erro, setErro] = useState('');
  if (!aberto) {
    return (
      <button type="button" onClick={() => setAberto(true)} className={`${classeDoBotao.secundario} h-9`}>
        <UserRound className="h-4 w-4" /> Pedir ao comprador
      </button>
    );
  }
  const campo =
    'h-9 min-w-0 flex-1 rounded-lg border border-[var(--c-borda)] bg-[var(--c-superficie)] px-2.5 text-xs text-[var(--c-texto)] outline-none placeholder:text-[var(--c-texto-3)] focus:border-[var(--c-acento)]';
  return (
    <div className="flex w-full flex-col gap-1.5">
      <div className="flex flex-wrap gap-1.5">
        <input className={campo} placeholder="Veículo / aplicação (ex.: Gol 1.0 2012)" value={veiculo} onChange={(e) => setVeiculo(e.target.value)} />
        <input className={campo} placeholder="Observação (ex.: cliente não quer o similar)" value={observacao} onChange={(e) => setObservacao(e.target.value)} />
      </div>
      {erro && <span className="text-[11px] text-[var(--c-erro)]">{erro}</span>}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={() => setAberto(false)} className={`${classeDoBotao.secundario} h-9`}>
          Cancelar
        </button>
        <button
          type="button"
          className={`${classeDoBotao.principal} h-9`}
          onClick={async () => {
            try {
              await aoEnviar(veiculo, observacao);
              setAberto(false);
            } catch (e) {
              setErro((e as Error).message);
            }
          }}
        >
          Enviar ao comprador
        </button>
      </div>
    </div>
  );
};

/** A solicitação ao comprador, dentro do cartão: aguardando, a resposta, ou "não encontrada". */
const RespostaDoComprador: React.FC<{ s: Solicitacao; mostraCusto: boolean }> = ({ s, mostraCusto }) => (
  <div className="border-t border-[var(--c-borda)] bg-[color-mix(in_srgb,var(--c-acento)_5%,transparent)] px-3 py-2.5">
    <span className="flex flex-wrap items-center gap-2 text-[11px] font-bold text-[var(--c-acento)]">
      <UserRound className="h-3.5 w-3.5" /> COTADO PELO COMPRADOR
      {s.veiculo && <span className="font-normal text-[var(--c-texto-3)]">· {s.veiculo}</span>}
    </span>
    {s.situacao === 'aberta' && (
      <span className="mt-1 flex items-center gap-1.5 text-xs text-[var(--c-texto-2)]">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Aguardando o comprador…
      </span>
    )}
    {s.situacao === 'nao_encontrada' && (
      <p className="mt-1 text-xs text-[var(--c-erro)]">
        {s.nomeDeQuemRespondeu ?? 'O comprador'} não encontrou{s.motivo ? `: ${s.motivo}` : '.'}
      </p>
    )}
    {s.opcoes.map((o, i) => (
      <div key={i} className="mt-1.5 flex items-baseline justify-between gap-3 border-l-4 border-l-[var(--c-acento)] pl-2">
        <span className="min-w-0">
          <span className="block text-xs font-bold text-[var(--c-texto)]">
            {o.fornecedor}
            {o.marca && <span className="font-normal text-[var(--c-texto-2)]"> · {o.marca}</span>}
          </span>
          <span className="block text-[11px] text-[var(--c-texto-3)]">
            {o.prazo ?? 'prazo a confirmar'} · por {s.nomeDeQuemRespondeu ?? 'Compras'}
          </span>
          {mostraCusto && o.custo != null && (
            <span className="block text-[11px] font-semibold text-[var(--c-acento)]">custo {brl(o.custo)}</span>
          )}
        </span>
        <span className="text-base font-extrabold tabular-nums text-[var(--c-texto)]">{brl(o.venda)}</span>
      </div>
    ))}
  </div>
);

const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const ROTULO_DO_ANDAMENTO: Record<Andamento['situacao'], string> = {
  pronta: 'pronto',
  na_fila: 'na fila…',
  cotando: 'cotando nos fornecedores…',
  erro: 'erro',
  sem_pedido: 'aguardando cotação',
};

interface Estado {
  andamento?: Andamento;
  cartao?: CartaoDaPeca;
}

/** A peça, uma vez só: código em destaque, e a descrição e a marca de quem informou. */
const CabecalhoDaPeca: React.FC<{ g: GrupoDaPeca; principal?: boolean }> = ({ g, principal }) => (
  <span className="min-w-0">
    <span className={`block font-extrabold text-[var(--c-texto)] ${principal ? 'text-base' : 'text-sm'}`}>
      {principal ? 'PEÇA ' : 'SIMILAR '}
      {g.codigo}
    </span>
    {(g.descricao || g.marca) && (
      <span className="block text-[11px] leading-4 text-[var(--c-texto-2)]">
        {g.descricao}
        {g.descricao && g.marca && ' · '}
        {g.marca && <b>{g.marca}</b>}
      </span>
    )}
  </span>
);

/**
 * AS CORES (Elias, 21/10/2026: "cores para tornar intuitivo"), na faixa à
 * esquerda de cada resposta: verde = tem em SP; âmbar = fora do estado
 * (prazo maior); cinza = sem estoque.
 */
const corDaOferta = (o: Oferta): string =>
  o.venda == null ? 'border-l-[var(--c-borda-forte)]' : o.emSP ? 'border-l-[var(--c-ok)]' : 'border-l-[var(--c-atencao)]';

const Selo: React.FC<{ tom: 'ok' | 'atencao'; children: React.ReactNode }> = ({ tom, children }) => (
  <span
    className={`rounded px-1.5 py-0.5 text-[10px] font-extrabold ${
      tom === 'ok'
        ? 'bg-[color-mix(in_srgb,var(--c-ok)_16%,transparent)] text-[var(--c-ok)]'
        : 'bg-[color-mix(in_srgb,var(--c-atencao)_16%,transparent)] text-[var(--c-atencao)]'
    }`}
  >
    {children}
  </span>
);

/** Uma resposta de fornecedor: o nome, a venda em destaque, e o resto em uma linha. */
const LinhaDaOferta: React.FC<{ o: Oferta; nome: string; mostraCusto: boolean; melhor?: boolean }> = ({
  o,
  nome,
  mostraCusto,
  melhor,
}) => {
  const semEstoque = o.venda == null;
  return (
    <div className={`border-b border-l-4 border-[var(--c-borda)] px-3 py-2.5 last:border-b-0 ${corDaOferta(o)} ${semEstoque ? 'opacity-60' : ''}`}>
      <div className="flex items-baseline justify-between gap-3">
        <span className="flex min-w-0 items-center gap-2">
          <span className="truncate text-xs font-bold text-[var(--c-texto)]">{nome}</span>
          {melhor && <Selo tom="ok">MELHOR OPÇÃO</Selo>}
        </span>
        <span className="flex-shrink-0 text-right">
          {semEstoque ? (
            <span className="text-[11px] font-bold text-[var(--c-texto-3)]">SEM ESTOQUE</span>
          ) : (
            <span className="text-base font-extrabold tabular-nums text-[var(--c-texto)]">
              {o.tipos.length > 1 && <span className="mr-1 text-[10px] font-bold text-[var(--c-atencao)]">a partir de</span>}
              {brl(o.venda!)}
            </span>
          )}
        </span>
      </div>
      {!semEstoque && (
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-[var(--c-texto-3)]">
          <span>{o.local}</span>
          {o.quantidade != null && <span>· {o.quantidade} un.</span>}
          {o.prazo && <span>· {o.prazo}</span>}
          {o.emSP === false && <Selo tom="atencao">FORA DO ESTADO</Selo>}
        </div>
      )}
      {o.tipos.length > 1 && (
        <div className="mt-1.5 rounded-lg bg-[color-mix(in_srgb,var(--c-atencao)_10%,transparent)] p-2 text-[11px]">
          <span className="flex items-center gap-1 font-bold text-[var(--c-atencao)]">
            <AlertTriangle className="h-3.5 w-3.5" /> O preço depende do tipo da peça:
          </span>
          {o.tipos.map((t) => (
            <span key={t.tipo} className={`mt-0.5 flex justify-between ${t.provavel ? 'font-bold text-[var(--c-texto)]' : 'text-[var(--c-texto-2)]'}`}>
              <span>
                {t.tipo}
                {t.provavel && ' (pela descrição)'}
              </span>
              <span className="tabular-nums">{t.venda == null ? '—' : brl(t.venda)}</span>
            </span>
          ))}
        </div>
      )}
      {/* O custo em OUTRA COR que a venda, só para quem vê custo (o dado nem chega aos outros) */}
      {mostraCusto && !semEstoque && o.custo != null && (
        <div className="mt-1 text-[11px] font-semibold text-[var(--c-acento)]">
          custo {brl(o.custo)}
          {o.frete ? ` + frete ${brl(o.frete)}` : ' · frete grátis'} × fator {o.fator?.toFixed(2).replace('.', ',')}
          {o.fatorPadrao && ' · fator padrão (marca sem cadastro)'}
        </div>
      )}
    </div>
  );
};

export const TelaCotar: React.FC<{ colaboradorAtual: Colaborador }> = ({ colaboradorAtual }) => {
  const servico = useMemo(() => (supabase ? cotarPeloSupabase(supabase) : null), []);
  const mostraCusto = podeVerCusto(colaboradorAtual);
  const [texto, setTexto] = useState('');
  const [ordem, setOrdem] = useState<string[]>([]);
  const [estados, setEstados] = useState<Record<string, Estado>>({});
  const [nomes, setNomes] = useState<Record<string, string>>({});
  const [doDia, setDoDia] = useState<string[]>([]);
  const [erro, setErro] = useState('');
  const paradas = useRef<(() => void)[]>([]);
  const humana = useMemo(() => (supabase ? cotacaoHumanaPeloSupabase(supabase) : null), []);
  /** A solicitação ao comprador mais recente de cada código (as minhas, dos últimos 7 dias) */
  const [aoComprador, setAoComprador] = useState<Record<string, Solicitacao>>({});

  const carregarSolicitacoes = useCallback(async () => {
    if (!humana) return;
    try {
      const minhas = await humana.listar();
      const porCodigo: Record<string, Solicitacao> = {};
      for (const s of minhas) porCodigo[s.codigo] = s; // a lista vem da mais antiga: fica a mais recente
      setAoComprador(porCodigo);
    } catch {
      /* sem as solicitações a cotação continua funcionando */
    }
  }, [humana]);

  // A resposta do comprador aparece no cartão na hora em que ele responde
  useEffect(() => {
    void carregarSolicitacoes();
    return humana?.ouvir(() => void carregarSolicitacoes());
  }, [humana, carregarSolicitacoes]);

  // Resposta na tela = vista: os lembretes (avisos-cotacao) param
  useEffect(() => {
    for (const codigo of ordem) {
      const s = aoComprador[codigo];
      if (s && s.situacao !== 'aberta' && !s.vistaEm) {
        void humana?.marcarVista(s.id).then(carregarSolicitacoes).catch(() => {});
      }
    }
  }, [ordem, aoComprador, humana, carregarSolicitacoes]);

  const carregarDoDia = useCallback(() => {
    servico?.minhasDoDia().then(setDoDia).catch(() => {});
  }, [servico]);

  useEffect(() => {
    if (!servico) return;
    servico.nomesDosFornecedores().then(setNomes).catch(() => {});
    carregarDoDia();
    return () => paradas.current.forEach((p) => p());
  }, [servico, carregarDoDia]);

  /** Busca o resultado de um código que ficou pronto. */
  const carregarCartao = useCallback(
    async (codigo: string) => {
      if (!servico) return;
      try {
        const cartao = await servico.resultado(codigo);
        setEstados((e) => ({ ...e, [codigo]: { ...e[codigo], cartao } }));
        // A foto do que o vendedor viu, para o Histórico (o banco calcula; reabrir não duplica)
        if (supabase) void historicoPeloSupabase(supabase).registrarConsulta(codigo).catch(() => {});
      } catch (e) {
        setErro((e as Error).message);
      }
    },
    [servico]
  );

  /** Pede (ou força) e acompanha até ficar pronto. */
  const cotar = useCallback(
    async (codigos: string[], forcar = false) => {
      if (!servico || !codigos.length) return;
      setErro('');
      const normais = codigos.map(normalizarCodigo);
      setOrdem((o) => [...normais, ...o.filter((c) => !normais.includes(c))]);
      setEstados((e) => {
        const novo = { ...e };
        for (const c of normais) novo[c] = { cartao: forcar ? undefined : e[c]?.cartao };
        return novo;
      });
      try {
        await servico.pedir(codigos, forcar);
      } catch (e) {
        return setErro((e as Error).message);
      }
      carregarDoDia();
      const carregados = new Set<string>();
      paradas.current.push(
        acompanhar(normais, (c) => servico.andamento(c), (andamentos) => {
          setEstados((e) => {
            const novo = { ...e };
            for (const a of andamentos) novo[a.codigo] = { ...novo[a.codigo], andamento: a };
            return novo;
          });
          for (const a of andamentos) {
            if (a.situacao === 'pronta' && !carregados.has(a.codigo)) {
              carregados.add(a.codigo);
              void carregarCartao(a.codigo);
            }
          }
        })
      );
    },
    [servico, carregarCartao, carregarDoDia]
  );

  if (!servico) {
    return (
      <EstadoVazio icone={<Search className="h-6 w-6" />} titulo="Cotação indisponível" descricao="A cotação precisa do banco conectado." />
    );
  }

  const enviar = () => {
    const codigos = separarCodigos(texto);
    if (!codigos.length) return setErro('Digite um código com 3 ou mais caracteres.');
    setTexto('');
    void cotar(codigos);
  };

  const estacaoFora = ordem.some((c) => estados[c]?.andamento && !estados[c].andamento!.estacao_no_ar && !terminou(estados[c].andamento!));

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-3">
      <div className="flex gap-2">
        <input
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && enviar()}
          placeholder="Código da peça (vários: separe por espaço ou vírgula)"
          aria-label="Códigos das peças"
          autoCapitalize="characters"
          className="h-11 min-w-0 flex-1 rounded-xl border border-[var(--c-borda)] bg-[var(--c-superficie)] px-3 text-sm text-[var(--c-texto)] outline-none placeholder:text-[var(--c-texto-3)] focus:border-[var(--c-acento)]"
        />
        <button type="button" onClick={enviar} className={`${classeDoBotao.principal} h-11`}>
          <Search className="h-4 w-4" /> Cotar
        </button>
      </div>

      {erro && <p className="rounded-xl bg-[var(--c-superficie-2)] p-3 text-xs text-[var(--c-erro)]">{erro}</p>}

      {estacaoFora && (
        <p className="flex items-center gap-2 rounded-xl bg-[color-mix(in_srgb,var(--c-atencao)_14%,transparent)] p-3 text-xs font-semibold text-[var(--c-atencao)]">
          <AlertTriangle className="h-4 w-4 flex-shrink-0" />
          Estação de compras fora do ar: a peça fica aguardando cotação e é cotada quando ela voltar.
        </p>
      )}

      {ordem.map((codigo) => {
        const { andamento, cartao } = estados[codigo] ?? {};
        const situacao = andamento?.situacao;
        const esperando = !cartao && situacao !== 'erro';
        return (
          <section key={codigo} className="overflow-hidden rounded-2xl border border-[var(--c-borda)] bg-[var(--c-superficie)] shadow-[var(--s-1)]">
            <header className="flex items-start justify-between gap-2 border-b border-[var(--c-borda)] px-3 py-2.5">
              <span className="min-w-0">
                <CabecalhoDaPeca principal g={cartao ?? { codigo, marca: null, descricao: null, ofertas: [] }} />
                {esperando && (
                  <span className="mt-0.5 flex items-center gap-1.5 text-[11px] text-[var(--c-acento)]">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    {situacao ? ROTULO_DO_ANDAMENTO[situacao] : 'pedindo…'}
                  </span>
                )}
                {situacao === 'erro' && (
                  <span className="mt-0.5 block text-[11px] text-[var(--c-erro)]">Não deu para cotar: {andamento?.erro}</span>
                )}
              </span>
              <button
                type="button"
                onClick={() => void cotar([codigo], true)}
                className="inline-flex flex-shrink-0 items-center gap-1 rounded-lg border border-[var(--c-borda)] px-2 py-1.5 text-[10px] font-bold text-[var(--c-texto-2)] hover:border-[var(--c-acento)] hover:text-[var(--c-acento)]"
              >
                <RefreshCw className="h-3.5 w-3.5" /> Atualizar agora
              </button>
            </header>

            {cartao && (
              <>
                {cartao.ofertas.length === 0 && (
                  <p className="px-3 py-3 text-xs text-[var(--c-texto-3)]">Nenhum fornecedor tem esta peça hoje.</p>
                )}
                {cartao.ofertas.map((o, i) => (
                  <LinhaDaOferta
                    key={o.fornecedor}
                    o={o}
                    nome={nomes[o.fornecedor] ?? o.fornecedor}
                    mostraCusto={mostraCusto}
                    // A primeira já é a melhor: SP pela menor venda (cotar.ts)
                    melhor={i === 0 && o.venda != null}
                  />
                ))}
                {cartao.similares.length > 0 && (
                  <>
                    <div className="bg-[var(--c-superficie-2)] px-3 py-1.5 text-[10px] font-extrabold uppercase tracking-wider text-[var(--c-texto-3)]">
                      Similares ({cartao.similares.length}) · do mais barato ao mais caro
                    </div>
                    {cartao.similares.map((g) => (
                      <div key={g.codigo} className="border-b border-[var(--c-borda)] last:border-0">
                        <div className="flex items-start justify-between gap-2 bg-[color-mix(in_srgb,var(--c-superficie-2)_50%,transparent)] px-3 pb-1 pt-2">
                          <CabecalhoDaPeca g={g} />
                          {/* A opção mais barata, para quando o cliente pedir (Elias, 20/10) */}
                          {g.ofertas[0]?.venda != null &&
                            (cartao.ofertas[0]?.venda == null || g.ofertas[0].venda < cartao.ofertas[0].venda) && (
                              <Selo tom="ok">MAIS BARATO QUE A PEÇA</Selo>
                            )}
                        </div>
                        {g.ofertas.map((o) => (
                          <LinhaDaOferta key={o.fornecedor} o={o} nome={nomes[o.fornecedor] ?? o.fornecedor} mostraCusto={mostraCusto} />
                        ))}
                      </div>
                    ))}
                  </>
                )}
              </>
            )}

            {aoComprador[codigo] && <RespostaDoComprador s={aoComprador[codigo]} mostraCusto={mostraCusto} />}

            {(cartao || situacao === 'erro') && (
              <div className="flex flex-wrap items-center justify-end gap-2 border-t border-[var(--c-borda)] px-3 py-2">
                {(!aoComprador[codigo] || aoComprador[codigo].situacao !== 'aberta') && humana && (
                  <PedirAoComprador
                    aoEnviar={async (veiculo, observacao) => {
                      await humana.pedir(codigo, veiculo, observacao);
                      await carregarSolicitacoes();
                    }}
                  />
                )}
                <button type="button" disabled title="Chega no próximo módulo (pedidos para compras)" className={`${classeDoBotao.secundario} h-9`}>
                  <ShoppingCart className="h-4 w-4" /> Pedir à Compras (em breve)
                </button>
              </div>
            )}
          </section>
        );
      })}

      {ordem.length === 0 && (
        <EstadoVazio
          icone={<Search className="h-6 w-6" />}
          titulo="Cote uma peça"
          descricao="Digite o código: o preço de venda, o prazo e os similares de cada fornecedor aparecem aqui."
        />
      )}

      {doDia.length > 0 && (
        <div className="rounded-2xl border border-[var(--c-borda)] bg-[var(--c-superficie)] p-3">
          <span className="block text-[10px] font-extrabold uppercase tracking-wider text-[var(--c-texto-3)]">
            Minhas cotações do dia
          </span>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {doDia.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => void cotar([c])}
                className="rounded-lg border border-[var(--c-borda)] px-2.5 py-1 text-[11px] font-bold text-[var(--c-texto-2)] hover:border-[var(--c-acento)] hover:text-[var(--c-acento)]"
              >
                {c}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
