/**
 * COTAR PEÇA (docs/cotador/SPEC-cotar.md) — a ferramenta do balcão.
 *
 * O trabalho da tela: em segundos, o vendedor sabe POR QUANTO VENDER, de
 * onde vem e em quantos dias chega — e, se o B2B não tem, pede ao comprador.
 * Venda, custo e prazo vêm prontos do banco (resultado_da_cotacao): a tela
 * só desenha. Custo e fator chegam nulos para quem não vê custo.
 *
 * O desenho (Elias, 21/10/2026): a busca; uma faixa com o que espera o
 * comprador e o que foi cotado hoje; e um cartão por peça em largura
 * total, com o resumo no topo e os fornecedores em grade
 * (cotador/CartaoDaCotacao.tsx) — para 10 fornecedores não virarem uma
 * rolagem sem fim.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Search, AlertTriangle, UserRound, Clock } from 'lucide-react';
import type { Colaborador } from '../tipos';
import { podeVerCusto, montaOPreco } from '../tipos';
import { supabase } from '../servicos/supabase';
import { cotarPeloSupabase, separarCodigos, normalizarCodigo, acompanhar, terminou, type Andamento, type CartaoDaPeca } from '../servicos/cotar';
import { cotacaoHumanaPeloSupabase, daVezPorCodigo, mesclarSolicitacoes, type Solicitacao } from '../servicos/cotacaoHumana';
import { historicoPeloSupabase } from '../servicos/historico';
import { pegarAbertura, ouvirAberturas, lembrarAbertos, abertosGuardados, type PedidoDeAbertura } from '../servicos/aberturaDaCotacao';
import { EstadoVazio, classeDoBotao } from './PadraoWeb';
import { haQuanto } from './cotador/visual';
import { CartaoDaCotacao } from './cotador/CartaoDaCotacao';
import { JanelaEncomendar, type ItemParaEncomendar } from './cotador/JanelaEncomendar';
import { EM_ANDAMENTO, encomendasPeloSupabase, type MinhaEncomenda } from '../servicos/encomendas';

/** Pedir ao comprador: o veículo e uma observação; a resposta volta no cartão. */
const FormularioAoComprador: React.FC<{ aoEnviar: (veiculo: string, observacao: string) => Promise<void>; aoCancelar: () => void }> = ({
  aoEnviar,
  aoCancelar,
}) => {
  const [veiculo, setVeiculo] = useState('');
  const [observacao, setObservacao] = useState('');
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);
  const campo =
    'mt-1 h-11 w-full rounded-xl border border-[var(--c-borda)] bg-[var(--c-superficie)] px-3 text-sm text-[var(--c-texto)] outline-none placeholder:text-[var(--c-texto-3)] focus:border-[var(--c-acento)]';
  return (
    <div className="border-t border-[var(--c-borda)] bg-[var(--c-superficie-2)] p-4">
      <span className="flex items-center gap-2 text-sm font-bold text-[var(--c-texto)]">
        <UserRound className="h-4 w-4 text-[var(--c-acento)]" /> Pedir ao comprador
      </span>
      <span className="block text-xs text-[var(--c-texto-3)]">Ele cota fora do B2B; a resposta aparece neste cartão e no seu chat.</span>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="text-xs font-semibold text-[var(--c-texto-2)]">
          Veículo / aplicação
          <input className={campo} placeholder="Ex.: Gol 1.0 2012" value={veiculo} onChange={(e) => setVeiculo(e.target.value)} autoFocus />
        </label>
        <label className="text-xs font-semibold text-[var(--c-texto-2)]">
          Observação
          <input className={campo} placeholder="Ex.: cliente não quer o similar" value={observacao} onChange={(e) => setObservacao(e.target.value)} />
        </label>
      </div>
      {erro && (
        <span role="alert" className="mt-2 block text-xs text-[var(--c-erro)]">
          {erro}
        </span>
      )}
      <div className="mt-3 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <button type="button" onClick={aoCancelar} className={classeDoBotao.secundario}>
          Cancelar
        </button>
        <button
          type="button"
          disabled={enviando}
          className={classeDoBotao.principal}
          onClick={async () => {
            setEnviando(true);
            try {
              await aoEnviar(veiculo, observacao);
            } catch (e) {
              setErro((e as Error).message);
            } finally {
              setEnviando(false);
            }
          }}
        >
          {enviando ? 'Enviando…' : 'Enviar ao comprador'}
        </button>
      </div>
    </div>
  );
};

/** O estado de cada cartão: o andamento da cotação, o resultado e, aberto
 *  pelo Histórico, a foto da última vez. */
interface Estado {
  andamento?: Andamento;
  cartao?: CartaoDaPeca;
  foto?: PedidoDeAbertura['foto'];
}

const ficha =
  'inline-flex h-8 flex-shrink-0 items-center gap-1.5 rounded-full border px-3 text-xs font-bold transition hover:border-[var(--c-acento)] hover:text-[var(--c-acento)]';

export const TelaCotar: React.FC<{ colaboradorAtual: Colaborador }> = ({ colaboradorAtual }) => {
  const servico = useMemo(() => (supabase ? cotarPeloSupabase(supabase) : null), []);
  const humana = useMemo(() => (supabase ? cotacaoHumanaPeloSupabase(supabase) : null), []);
  const mostraCusto = podeVerCusto(colaboradorAtual);
  const [texto, setTexto] = useState('');
  const [ordem, setOrdem] = useState<string[]>([]);
  const [estados, setEstados] = useState<Record<string, Estado>>({});
  const [nomes, setNomes] = useState<Record<string, string>>({});
  const [doDia, setDoDia] = useState<string[]>([]);
  const [aoComprador, setAoComprador] = useState<Record<string, Solicitacao>>({});
  const [formularioAberto, setFormularioAberto] = useState<string | null>(null);
  // A peça aberta: a escolhida, ou a mais recente; as outras ficam recolhidas
  const [expandida, setExpandida] = useState<string | null>(null);
  const aberta = expandida && ordem.includes(expandida) ? expandida : (ordem[0] ?? null);
  /** Abre a peça e leva a tela até ela (a aberta fica no alto). */
  const abrirPeca = (codigo: string) => {
    setExpandida(codigo);
    requestAnimationFrame(() => document.getElementById(`peca-${codigo}`)?.closest('article')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  };
  const [erro, setErro] = useState('');
  const paradas = useRef<(() => void)[]>([]);
  // Encomendar (SPEC-pedidos-compras): a peça escolhida e as que já estão encomendadas
  const encomendas = useMemo(() => (supabase ? encomendasPeloSupabase(supabase) : null), []);
  const [paraEncomendar, setParaEncomendar] = useState<ItemParaEncomendar | null>(null);
  // O corte de quem abre a janela agora: hoje ou amanhã (o banco calcula)
  const [cancelavelAte, setCancelavelAte] = useState<string | null>(null);
  useEffect(() => {
    if (!paraEncomendar || !encomendas) return;
    setCancelavelAte(null);
    encomendas.cancelavelAte().then(setCancelavelAte).catch(() => {});
  }, [paraEncomendar, encomendas]);
  const [minhasEncomendas, setMinhasEncomendas] = useState<MinhaEncomenda[]>([]);
  const carregarEncomendas = useCallback(() => {
    encomendas?.minhas().then(setMinhasEncomendas).catch(() => {});
  }, [encomendas]);
  useEffect(carregarEncomendas, [carregarEncomendas]);

  const carregarDoDia = useCallback(() => {
    servico?.minhasDoDia().then(setDoDia).catch(() => {});
  }, [servico]);

  /** A solicitação mais recente de cada código (as minhas) */
  const carregarSolicitacoes = useCallback(async () => {
    if (!humana) return;
    try {
      const relidas = daVezPorCodigo(await humana.listar(), colaboradorAtual.id);
      setAoComprador((anteriores) => mesclarSolicitacoes(anteriores, relidas));
    } catch {
      /* sem as solicitações a cotação continua funcionando */
    }
  }, [humana, colaboradorAtual.id]);

  useEffect(() => {
    if (!servico) return;
    servico.nomesDosFornecedores().then(setNomes).catch(() => {});
    carregarDoDia();
    return () => paradas.current.forEach((p) => p());
  }, [servico, carregarDoDia]);

  // A resposta do comprador aparece no cartão na hora em que ele responde
  useEffect(() => {
    void carregarSolicitacoes();
    return humana?.ouvir(() => void carregarSolicitacoes());
  }, [humana, carregarSolicitacoes]);

  // Resposta na tela = vista: só a do cartão ABERTO (o recolhido o vendedor
  // ainda não leu). Marcada aqui também: a antiga não volta na releitura.
  useEffect(() => {
    const s = aberta ? aoComprador[aberta] : undefined;
    if (!aberta || !s || s.situacao === 'aberta' || s.vistaEm) return;
    const vistaEm = new Date().toISOString();
    setAoComprador((a) => (a[aberta]?.id === s.id ? { ...a, [aberta]: { ...a[aberta], vistaEm } } : a));
    void humana?.marcarVista(s.id).then(carregarSolicitacoes).catch(() => {});
  }, [aberta, aoComprador, humana, carregarSolicitacoes]);

  /** Busca o resultado de um código que ficou pronto, e guarda a foto para o Histórico. */
  const carregarCartao = useCallback(
    async (codigo: string) => {
      if (!servico) return;
      try {
        const cartao = await servico.resultado(codigo);
        setEstados((e) => ({ ...e, [codigo]: { ...e[codigo], cartao } }));
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
      setExpandida(normais[0]);
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

  /**
   * ABRIR SEM COTAR (Elias, 21/10/2026): o Histórico, o cartão do chat, o
   * aviso e as fichas mostram o que já está no banco — sem ir ao B2B de
   * novo. Cotada hoje, a grade inteira; senão, a foto e o "cotar agora".
   */
  const abrir = useCallback(
    async ({ codigo, foto }: PedidoDeAbertura) => {
      if (!servico) return;
      const c = normalizarCodigo(codigo);
      setErro('');
      setOrdem((o) => [c, ...o.filter((x) => x !== c)]);
      setExpandida(c);
      setEstados((e) => ({ ...e, [c]: { ...e[c], foto } }));
      // A resposta do comprador, mesmo a de mais de 7 dias
      humana
        ?.listar(c)
        .then((lista) => {
          const daVez = daVezPorCodigo(lista, colaboradorAtual.id)[c];
          if (daVez) setAoComprador((a) => ({ ...a, [c]: daVez }));
        })
        .catch(() => {});
      try {
        const cartao = await servico.resultado(c);
        setEstados((e) => ({ ...e, [c]: { ...e[c], cartao } }));
      } catch (e) {
        setErro((e as Error).message);
      }
    },
    [servico, humana, colaboradorAtual.id]
  );

  // Ao montar: os cartões que estavam abertos (troca de tela, F5), depois o
  // pedido que chegou antes da aba; e os pedidos que chegam com ela aberta
  useEffect(() => {
    for (const codigo of abertosGuardados(colaboradorAtual.id).reverse()) void abrir({ codigo });
    const pendente = pegarAbertura();
    if (pendente) void abrir(pendente);
    return ouvirAberturas((p) => void abrir(p));
  }, [abrir, colaboradorAtual.id]);

  useEffect(() => {
    lembrarAbertos(colaboradorAtual.id, ordem);
  }, [ordem, colaboradorAtual.id]);

  if (!servico) {
    return <EstadoVazio icone={<Search className="h-6 w-6" />} titulo="Cotação indisponível" descricao="A cotação precisa do banco conectado." />;
  }

  const enviar = () => {
    const codigos = separarCodigos(texto);
    if (!codigos.length) return setErro('Digite um código com 3 ou mais caracteres.');
    setTexto('');
    void cotar(codigos);
  };

  const estacaoFora = ordem.some((c) => estados[c]?.andamento && !estados[c].andamento!.estacao_no_ar && !terminou(estados[c].andamento!));
  const aguardandoComprador = Object.values(aoComprador).filter((s) => s.situacao === 'aberta');
  const recentes = doDia.filter((c) => !ordem.includes(c));

  return (
    <div className="flex flex-col gap-4">
      {/* A busca: o código é o único jeito de cotar (Elias, 21/10/2026) */}
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          enviar();
        }}
      >
        <label htmlFor="codigos-para-cotar" className="sr-only">
          Códigos das peças
        </label>
        <div className="relative min-w-0 flex-1">
          <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-[var(--c-texto-3)]" aria-hidden />
          <input
            id="codigos-para-cotar"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="Código da peça (vários: espaço ou vírgula)"
            autoCapitalize="characters"
            autoComplete="off"
            className="h-12 w-full rounded-xl border border-[var(--c-borda)] bg-[var(--c-superficie)] pl-12 pr-4 text-base font-semibold uppercase tracking-wide text-[var(--c-texto)] outline-none placeholder:font-normal placeholder:normal-case placeholder:tracking-normal placeholder:text-[var(--c-texto-3)] focus:border-[var(--c-acento)] focus:ring-2 focus:ring-[var(--c-acento-suave)]"
          />
        </div>
        <button type="submit" className={`${classeDoBotao.principal} h-12 px-6`}>
          Cotar
        </button>
      </form>

      {/* O que espera o comprador e o que foi cotado hoje: fichas, a um toque */}
      {(aguardandoComprador.length > 0 || recentes.length > 0) && (
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          {aguardandoComprador.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => void abrir({ codigo: s.codigo })}
              className={`${ficha} border-[var(--c-acento)] bg-[var(--c-acento-suave)] text-[var(--c-acento)]`}
              title="Pedido ao comprador, aguardando resposta"
            >
              <UserRound className="h-3.5 w-3.5" aria-hidden /> {s.codigo}
              <span className="font-semibold opacity-80">· {haQuanto(s.criadaEm)}</span>
            </button>
          ))}
          {recentes.length > 0 && (
            <span className="flex flex-shrink-0 items-center gap-1 pl-1 text-[10px] font-extrabold uppercase tracking-wider text-[var(--c-texto-3)]">
              <Clock className="h-3 w-3" aria-hidden /> Hoje
            </span>
          )}
          {recentes.map((c) => (
            <button key={c} type="button" onClick={() => void abrir({ codigo: c })} className={`${ficha} border-[var(--c-borda)] bg-[var(--c-superficie)] text-[var(--c-texto)]`}>
              {c}
            </button>
          ))}
        </div>
      )}

      {erro && (
        <p role="alert" className="rounded-xl border border-[var(--c-erro)] bg-[color-mix(in_srgb,var(--c-erro)_8%,transparent)] p-3 text-sm text-[var(--c-erro)]">
          {erro}
        </p>
      )}

      {estacaoFora && (
        <p role="status" className="flex items-start gap-2 rounded-xl border border-[var(--c-atencao)] bg-[color-mix(in_srgb,var(--c-atencao)_10%,transparent)] p-3 text-sm text-[var(--c-texto)]">
          <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-[var(--c-atencao)]" />
          A estação de compras está fora do ar. A peça fica aguardando e é cotada quando ela voltar.
        </p>
      )}

      {ordem.length === 0 && (
        <EstadoVazio
          icone={<Search className="h-6 w-6" />}
          titulo="Cote uma peça"
          descricao="Digite o código. Aparecem o preço de venda, o prazo e os similares de cada fornecedor; se nenhum tiver, peça ao comprador."
        />
      )}

      {/* Mais de uma peça na tela: trocar entre elas sem rolar até o fim */}
      {ordem.length > 1 && (
        <div role="tablist" aria-label="Peças nesta tela" className="-mb-1 flex items-center gap-1.5 overflow-x-auto pb-1">
          <span className="flex-shrink-0 pr-1 text-[10px] font-extrabold uppercase tracking-wider text-[var(--c-texto-3)]">Nesta tela</span>
          {ordem.map((c) => (
            <button
              key={c}
              type="button"
              role="tab"
              aria-selected={c === aberta}
              onClick={() => abrirPeca(c)}
              className={`h-8 flex-shrink-0 rounded-lg px-3 text-xs font-extrabold transition ${
                c === aberta
                  ? 'bg-[var(--c-acento)] text-[var(--c-sobre-acento)] shadow-[var(--s-1)]'
                  : 'border border-[var(--c-borda)] bg-[var(--c-superficie)] text-[var(--c-texto-2)] hover:border-[var(--c-acento)] hover:text-[var(--c-acento)]'
              }`}
            >
              {c}
            </button>
          ))}
        </div>
      )}

      {/* A peça aberta no alto; as outras recolhidas embaixo. Uma lista só, com
          as mesmas chaves: trocar a aberta não remonta o cartão (o filtro fica) */}
      {[aberta, ...ordem.filter((c) => c !== aberta)].flatMap((codigo, i) => {
        if (!codigo) return [];
        const s = aoComprador[codigo];
        const cartao = (
          <CartaoDaCotacao
            key={codigo}
            recolhido={codigo !== aberta}
            aoExpandir={() => abrirPeca(codigo)}
            codigo={codigo}
            andamento={estados[codigo]?.andamento}
            cartao={estados[codigo]?.cartao}
            foto={estados[codigo]?.foto}
            solicitacao={s}
            nomes={nomes}
            mostraCusto={mostraCusto}
            montaPreco={montaOPreco(colaboradorAtual)}
            podePedirAoComprador={!!humana && (!s || s.situacao !== 'aberta') && formularioAberto !== codigo}
            aoAtualizar={() => void cotar([codigo], true)}
            aoPedirAoComprador={() => setFormularioAberto(codigo)}
            aoFechar={() => setOrdem((o) => o.filter((c) => c !== codigo))}
            aoEncomendar={encomendas ? setParaEncomendar : undefined}
            encomendadas={minhasEncomendas.filter(
              (e) => e.codigo_cotado === codigo && EM_ANDAMENTO.includes(e.situacao)
            )}
            formulario={
              formularioAberto === codigo && humana ? (
                <FormularioAoComprador
                  aoCancelar={() => setFormularioAberto(null)}
                  aoEnviar={async (veiculo, observacao) => {
                    await humana.pedir(codigo, veiculo, observacao);
                    setFormularioAberto(null);
                    await carregarSolicitacoes();
                  }}
                />
              ) : undefined
            }
          />
        );
        return i === 1
          ? [
              <h2 key="outras-pecas" className="-mb-2 mt-2 text-[10px] font-extrabold uppercase tracking-wider text-[var(--c-texto-3)]">
                Outras peças ({ordem.length - 1}) · toque para abrir
              </h2>,
              cartao,
            ]
          : [cartao];
      })}

      {encomendas && (
        <JanelaEncomendar
          item={paraEncomendar}
          cancelavelAte={cancelavelAte}
          aoFechar={() => setParaEncomendar(null)}
          aoEncomendar={async (item, quantidade, observacao, variante) => {
            if (item.alvo.de === 'b2b') {
              await encomendas.encomendar({
                codigoCotado: item.alvo.codigoCotado,
                codigoPeca: item.codigo,
                fornecedor: item.alvo.fornecedor,
                variante,
                quantidade,
                observacao,
                fator: item.fator,
              });
            } else {
              await encomendas.encomendarResposta(item.alvo.respostaId, quantidade, observacao);
            }
            carregarEncomendas();
          }}
        />
      )}
    </div>
  );
};
