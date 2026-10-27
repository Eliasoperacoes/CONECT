/**
 * HISTÓRICO DE COTAÇÃO (docs/cotador/SPEC-historico.md) — o que foi cotado
 * e pedido ao comprador, guardado para sempre. Elias, 21/10/2026: "se eu
 * perder a notificação acabo sem ter a opção de visualizar o resultado".
 *
 * O trabalho da tela: achar uma cotação. Filtros numa linha; o que ainda
 * espera o comprador em destaque no topo; tocar numa linha reabre a peça
 * na aba Cotar. Quem vê de quem e o custo são do banco.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { History, ChevronRight, Search } from 'lucide-react';
import type { Colaborador } from '../tipos';
import { podeVerHistoricoDeTodos, podeVerCusto } from '../tipos';
import { supabase } from '../servicos/supabase';
import { cotarPeloSupabase } from '../servicos/cotar';
import type { PedidoDeAbertura } from '../servicos/aberturaDaCotacao';
import { historicoPeloSupabase, filtroDoPeriodo, aguardando, type LinhaDoHistorico, type Periodo, type TipoDaLinha } from '../servicos/historico';
import { EstadoVazio, FiltroSegmentado } from './PadraoWeb';
import { Selo, brl, haQuanto, quandoCurto, type Tom } from './cotador/visual';

const PERIODOS: { id: Periodo; rotulo: string }[] = [
  { id: 'hoje', rotulo: 'Hoje' },
  { id: '7dias', rotulo: '7 dias' },
  { id: '30dias', rotulo: '30 dias' },
  { id: 'tudo', rotulo: 'Tudo' },
];

/** A situação em palavras e cor (sempre com texto). */
const SITUACAO: Record<string, { rotulo: string; tom: Tom }> = {
  SP: { rotulo: 'Em SP', tom: 'ok' },
  'FORA DO ESTADO': { rotulo: 'Fora do estado', tom: 'atencao' },
  'SEM ESTOQUE': { rotulo: 'Sem estoque', tom: 'neutro' },
  aberta: { rotulo: 'Aguardando', tom: 'acento' },
  respondida: { rotulo: 'Respondida', tom: 'ok' },
  nao_encontrada: { rotulo: 'Não encontrada', tom: 'erro' },
};

const OPCOES_DE_SITUACAO: { valor: string; rotulo: string }[] = [
  { valor: '', rotulo: 'Toda situação' },
  { valor: 'aberta', rotulo: 'Aguardando o comprador' },
  { valor: 'respondida', rotulo: 'Respondida pelo comprador' },
  { valor: 'nao_encontrada', rotulo: 'Não encontrada' },
  { valor: 'SP', rotulo: 'B2B: em SP' },
  { valor: 'FORA DO ESTADO', rotulo: 'B2B: fora do estado' },
  { valor: 'SEM ESTOQUE', rotulo: 'B2B: sem estoque' },
];

/** O resultado de uma linha em uma frase: "Roles · R$ 16,90 · 2–3 dias".
 *  No B2B o banco guarda a chave ("roles"); o nome vem de `nomes`. */
const resultadoDa = (l: LinhaDoHistorico, nomes: Record<string, string>): string => {
  if (l.tipo === 'comprador' && l.situacao === 'aberta') return 'Aguardando o comprador';
  if (l.situacao === 'nao_encontrada') return 'O comprador não encontrou';
  if (l.venda == null) return 'Sem estoque nos fornecedores';
  const extra = l.tipo === 'b2b' && l.similares ? ` · +${l.similares} similares` : l.opcoes && l.opcoes > 1 ? ` · ${l.opcoes} opções` : '';
  const fornecedor = l.fornecedor && l.tipo === 'b2b' ? (nomes[l.fornecedor] ?? l.fornecedor) : l.fornecedor;
  return [fornecedor, brl(l.venda), l.prazo].filter(Boolean).join(' · ') + extra;
};

const seletor =
  'h-9 rounded-xl border border-[var(--c-borda)] bg-[var(--c-superficie)] px-2.5 text-xs text-[var(--c-texto)] outline-none focus:border-[var(--c-acento)]';

export const TelaHistorico: React.FC<{ colaboradorAtual: Colaborador; aoReabrir?: (pedido: PedidoDeAbertura) => void }> =({ colaboradorAtual, aoReabrir }) => {
  const servico = useMemo(() => (supabase ? historicoPeloSupabase(supabase) : null), []);
  const todos = podeVerHistoricoDeTodos(colaboradorAtual);
  const mostraCusto = podeVerCusto(colaboradorAtual);
  const [periodo, setPeriodo] = useState<Periodo>('7dias');
  const [codigo, setCodigo] = useState('');
  const [tipo, setTipo] = useState<'' | TipoDaLinha>('');
  const [situacao, setSituacao] = useState('');
  const [vendedor, setVendedor] = useState('');
  const [loja, setLoja] = useState('');
  const [linhas, setLinhas] = useState<LinhaDoHistorico[] | null>(null);
  const [erro, setErro] = useState('');
  const [nomes, setNomes] = useState<Record<string, string>>({});

  useEffect(() => {
    if (supabase) cotarPeloSupabase(supabase).nomesDosFornecedores().then(setNomes).catch(() => {});
  }, []);

  useEffect(() => {
    if (!servico) return;
    let vivo = true;
    setLinhas(null);
    const espera = setTimeout(() => {
      servico
        .listar({
          ...filtroDoPeriodo(periodo),
          codigo: codigo.trim() || null,
          tipo: tipo || null,
          situacao: situacao || null,
          vendedor: vendedor || null,
          loja: loja || null,
        })
        .then((l) => vivo && (setLinhas(l), setErro('')))
        .catch((e) => vivo && (setErro((e as Error).message), setLinhas([])));
    }, 250); // a busca por código espera a pessoa parar de digitar
    return () => {
      vivo = false;
      clearTimeout(espera);
    };
  }, [servico, periodo, codigo, tipo, situacao, vendedor, loja]);

  if (!servico) {
    return <EstadoVazio icone={<History className="h-6 w-6" />} titulo="Histórico indisponível" descricao="Precisa do banco conectado." />;
  }

  // As opções de vendedor e loja saem do que já veio (sem outra consulta)
  const vendedores = [...new Map((linhas ?? []).filter((l) => l.colaboradorId).map((l) => [l.colaboradorId!, l.nome ?? ''])).entries()];
  const lojas = [...new Set((linhas ?? []).map((l) => l.loja).filter(Boolean) as string[])];
  const esperando = (linhas ?? []).filter(aguardando);
  const resto = (linhas ?? []).filter((l) => !aguardando(l));

  const linha = (l: LinhaDoHistorico) => {
    const s = SITUACAO[l.situacao] ?? { rotulo: l.situacao, tom: 'neutro' as Tom };
    const conteudo = (
      <>
        <span className="text-xs tabular-nums text-[var(--c-texto-3)] md:order-none">{quandoCurto(l.quando)}</span>
        <span className="text-sm font-extrabold text-[var(--c-texto)]">{l.codigo}</span>
        <span className="flex flex-wrap gap-1">
          <Selo tom={l.tipo === 'comprador' ? 'acento' : 'neutro'}>{l.tipo === 'comprador' ? 'Comprador' : 'B2B'}</Selo>
          <Selo tom={s.tom}>{s.rotulo}</Selo>
        </span>
        <span className="min-w-0 text-sm text-[var(--c-texto)] md:truncate">
          {resultadoDa(l, nomes)}
          {mostraCusto && l.custo != null && <span className="ml-1 text-xs font-semibold text-[var(--c-acento)]">(custo {brl(l.custo)})</span>}
          {l.veiculo && <span className="block text-xs text-[var(--c-texto-3)]">{l.veiculo}</span>}
        </span>
        <span className="text-xs text-[var(--c-texto-2)]">
          {l.nome}
          {l.loja && <span className="text-[var(--c-texto-3)]"> · {l.loja}</span>}
        </span>
      </>
    );
    const classe =
      'grid w-full grid-cols-[auto_1fr] items-center gap-x-3 gap-y-1 border-b border-[var(--c-borda)] px-3 py-3 text-left last:border-b-0 md:grid-cols-[7rem_6.5rem_11rem_minmax(0,1fr)_10rem_1rem] md:px-4';
    const chave = `${l.tipo}-${l.id}`;
    return aoReabrir ? (
      <button
        key={chave}
        type="button"
        // Reabre com o que já está guardado: sem ir ao B2B de novo (Elias, 21/10/2026)
        onClick={() => aoReabrir({ codigo: l.codigo, foto: { quando: l.quando, resumo: resultadoDa(l, nomes) } })}
        className={`${classe} hover:bg-[var(--c-superficie-2)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--c-acento)]`}
      >
        {conteudo}
        <ChevronRight className="hidden h-4 w-4 text-[var(--c-texto-3)] md:block" aria-hidden />
      </button>
    ) : (
      <div key={chave} className={classe}>
        {conteudo}
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Os filtros numa linha (no celular, quebram) */}
      <div className="flex flex-col gap-2 lg:flex-row lg:flex-wrap lg:items-center">
        <FiltroSegmentado opcoes={PERIODOS} ativo={periodo} aoEscolher={setPeriodo} />
        <div className="relative lg:w-36">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--c-texto-3)]" aria-hidden />
          <input
            aria-label="Buscar pelo código"
            value={codigo}
            onChange={(e) => setCodigo(e.target.value)}
            placeholder="Buscar código"
            className="h-9 w-full rounded-xl border border-[var(--c-borda)] bg-[var(--c-superficie)] pl-9 pr-3 text-xs text-[var(--c-texto)] outline-none placeholder:text-[var(--c-texto-3)] focus:border-[var(--c-acento)]"
          />
        </div>
        {/* No computador os seletores entram na mesma linha dos outros filtros */}
        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap lg:contents">
          <select aria-label="Tipo" className={seletor} value={tipo} onChange={(e) => setTipo(e.target.value as '' | TipoDaLinha)}>
            <option value="">B2B e comprador</option>
            <option value="b2b">Só B2B</option>
            <option value="comprador">Só pedidos ao comprador</option>
          </select>
          <select aria-label="Situação" className={seletor} value={situacao} onChange={(e) => setSituacao(e.target.value)}>
            {OPCOES_DE_SITUACAO.map((o) => (
              <option key={o.valor} value={o.valor}>
                {o.rotulo}
              </option>
            ))}
          </select>
          {todos && (
            <>
              <select aria-label="Vendedor" className={seletor} value={vendedor} onChange={(e) => setVendedor(e.target.value)}>
                <option value="">Todos os vendedores</option>
                {vendedores.map(([id, nome]) => (
                  <option key={id} value={id}>
                    {nome}
                  </option>
                ))}
              </select>
              <select aria-label="Loja" className={seletor} value={loja} onChange={(e) => setLoja(e.target.value)}>
                <option value="">Todas as lojas</option>
                {lojas.map((l) => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
              </select>
            </>
          )}
        </div>
      </div>

      {erro && (
        <p role="alert" className="rounded-xl border border-[var(--c-erro)] p-3 text-sm text-[var(--c-erro)]">
          {erro}
        </p>
      )}

      {linhas === null && (
        <div className="flex flex-col gap-2" aria-busy="true" aria-label="Carregando o histórico">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-14 animate-pulse rounded-xl bg-[var(--c-superficie-2)]" />
          ))}
        </div>
      )}

      {linhas && esperando.length > 0 && (
        <section aria-labelledby="historico-aguardando" className="overflow-hidden rounded-2xl border border-[var(--c-acento)] bg-[var(--c-superficie)]">
          <h2 id="historico-aguardando" className="bg-[var(--c-acento-suave)] px-3 py-2 text-xs font-extrabold text-[var(--c-acento)] md:px-4">
            Aguardando o comprador ({esperando.length}){esperando[0] && ` · o mais antigo ${haQuanto(esperando[esperando.length - 1].quando)}`}
          </h2>
          {esperando.map(linha)}
        </section>
      )}

      {linhas && resto.length > 0 && (
        <section aria-label="Cotações" className="overflow-hidden rounded-2xl border border-[var(--c-borda)] bg-[var(--c-superficie)] shadow-[var(--s-1)]">
          {/* Cabeçalho da tabela: só no computador */}
          <div className="hidden grid-cols-[7rem_6.5rem_11rem_minmax(0,1fr)_10rem_1rem] gap-x-3 border-b border-[var(--c-borda)] bg-[var(--c-superficie-2)] px-4 py-2 text-[10px] font-extrabold uppercase tracking-wider text-[var(--c-texto-3)] md:grid">
            <span>Quando</span>
            <span>Peça</span>
            <span>Tipo</span>
            <span>Resultado</span>
            <span>Quem</span>
            <span />
          </div>
          {resto.map(linha)}
        </section>
      )}

      {linhas && linhas.length === 0 && !erro && (
        <EstadoVazio
          icone={<History className="h-6 w-6" />}
          titulo="Nada neste período"
          descricao={todos ? 'Nenhuma cotação com esses filtros.' : 'As peças que você cotar e pedir ao comprador ficam guardadas aqui.'}
        />
      )}
      {linhas && linhas.length >= 500 && (
        <p className="text-center text-xs text-[var(--c-texto-3)]">Mostrando as 500 mais recentes. Use os filtros para achar uma mais antiga.</p>
      )}
    </div>
  );
};
