/**
 * FRETES DOS FORNECEDORES (Compras) — o frete por peça que o cotador soma ao
 * custo antes da margem: venda = (custo + frete) × fator. A conta e quem pode
 * alterar moram no banco (alterar_frete); aqui só se lê e se pede para gravar.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Truck } from 'lucide-react';
import { supabase } from '../servicos/supabase';
import { fretesPeloSupabase, lerFrete, type FreteDoFornecedor } from '../servicos/fretes';
import { CartaoLista, EstadoVazio } from './PadraoWeb';

const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const LinhaDoFrete: React.FC<{ f: FreteDoFornecedor; aoGravar: (v: number) => Promise<void> }> = ({ f, aoGravar }) => {
  const [texto, setTexto] = useState(f.frete_por_peca.toFixed(2).replace('.', ','));
  const [estado, setEstado] = useState<'' | 'gravando' | 'ok' | 'erro'>('');
  useEffect(() => setTexto(f.frete_por_peca.toFixed(2).replace('.', ',')), [f.frete_por_peca]);

  const gravar = async () => {
    const v = lerFrete(texto);
    if (v === null) return setEstado('erro');
    if (v === f.frete_por_peca) return setEstado('');
    setEstado('gravando');
    try {
      await aoGravar(v);
      setEstado('ok');
    } catch {
      setEstado('erro');
    }
  };

  return (
    <div className="flex items-center justify-between gap-3 border-b border-[var(--c-borda)] px-4 py-3 last:border-0">
      <span className="min-w-0">
        <span className="block text-sm font-bold text-[var(--c-texto)]">{f.nome}</span>
        <span className="block text-[10px] text-[var(--c-texto-3)]">
          {f.frete_por_peca === 0 ? 'frete grátis' : `${brl(f.frete_por_peca)} por peça`}
          {f.atualizado_por && ` · alterado por ${f.atualizado_por}`}
        </span>
      </span>
      <span className="flex items-center gap-2">
        <span className="text-xs text-[var(--c-texto-3)]">R$</span>
        <input
          aria-label={`Frete por peça da ${f.nome}`}
          value={texto}
          inputMode="decimal"
          onChange={(e) => (setTexto(e.target.value), setEstado(''))}
          onBlur={gravar}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
          className={`h-9 w-24 rounded-xl border bg-[var(--c-superficie)] px-3 text-right text-sm tabular-nums text-[var(--c-texto)] outline-none focus:border-[var(--c-acento)] ${
            estado === 'erro' ? 'border-[var(--c-erro)]' : 'border-[var(--c-borda)]'
          }`}
        />
        <span className="w-16 text-[10px] text-[var(--c-texto-3)]">
          {estado === 'gravando' ? 'gravando…' : estado === 'ok' ? 'gravado' : estado === 'erro' ? '0 a 500' : ''}
        </span>
      </span>
    </div>
  );
};

export const TelaFretes: React.FC = () => {
  const servico = useMemo(() => (supabase ? fretesPeloSupabase(supabase) : null), []);
  const [fretes, setFretes] = useState<FreteDoFornecedor[]>([]);
  const [erro, setErro] = useState('');

  const carregar = useCallback(async () => {
    if (!servico) return;
    try {
      setFretes(await servico.listar());
      setErro('');
    } catch (e) {
      setErro((e as Error).message);
    }
  }, [servico]);

  useEffect(() => void carregar(), [carregar]);

  if (!servico) {
    return <EstadoVazio icone={<Truck className="h-6 w-6" />} titulo="Fretes indisponíveis" descricao="Os fretes precisam do banco conectado." />;
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      {/* A aba já diz o nome: aqui, só o que a tela faz */}
      <p className="text-sm text-[var(--c-texto-2)]">
        O frete por peça entra no preço antes da margem: <b>venda = (custo + frete) × fator</b>. Zero para quem dá frete grátis. Alterar aqui muda o preço na hora.
      </p>
      {erro && <p className="rounded-xl bg-[var(--c-superficie-2)] p-3 text-xs text-[var(--c-erro)]">{erro}</p>}
      <CartaoLista>
        {fretes.map((f) => (
          <LinhaDoFrete
            key={f.chave}
            f={f}
            aoGravar={async (v) => {
              await servico.alterar(f.chave, v);
              await carregar();
            }}
          />
        ))}
      </CartaoLista>
    </div>
  );
};
