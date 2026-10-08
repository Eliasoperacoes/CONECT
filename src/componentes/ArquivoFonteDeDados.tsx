/**
 * O AFD E O AEJ NA TELA DO RH — escolher o estabelecimento e baixar o
 * arquivo do período que a tela já mostra. O AFD é o que o REP registrou;
 * o AEJ, a jornada tratada, a mesma do espelho (Portaria 671/2021, art. 81, § 2º: o AFD do
 * REP-P é "prontamente gerado e entregue, quando solicitado pelo
 * Auditor-Fiscal do Trabalho").
 *
 * Só aparece para quem cuida de pessoas (a mesma regra do banco, que
 * confere de novo). O que ainda falta para o arquivo valer — o número do
 * INPI, a assinatura com certificado — é dito aqui, e não escondido.
 */
import React, { useEffect, useState } from 'react';
import { FileText, Download, Loader2 } from 'lucide-react';
import { carregarEstabelecimentos, Estabelecimento } from '../servicos/estabelecimentos';
import { gerarArquivoAej, gerarArquivoAfd } from '../servicos/arquivosFiscais';
import { baixarArquivo } from '../servicos/compartilharArquivo';
import { formatarCnpj } from '../servicos/documentos';
import { formatarDataBR } from '../servicos/ponto';

export const ArquivoFonteDeDados: React.FC<{ inicio: string; fim: string }> = ({ inicio, fim }) => {
  const [estabelecimentos, setEstabelecimentos] = useState<Estabelecimento[]>([]);
  const [cnpj, setCnpj] = useState('');
  const [gerando, setGerando] = useState<'afd' | 'aej' | null>(null);
  const [aviso, setAviso] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null);

  useEffect(() => {
    let vivo = true;
    carregarEstabelecimentos().then((lista) => {
      if (!vivo) return;
      setEstabelecimentos(lista);
      setCnpj((atual) => atual || lista[0]?.cnpj || '');
    });
    return () => {
      vivo = false;
    };
  }, []);

  // Sem estabelecimento cadastrado não há AFD a gerar
  if (estabelecimentos.length === 0) return null;

  const gerar = async () => {
    setGerando('afd');
    setAviso(null);
    const r = await gerarArquivoAfd(cnpj, inicio, fim);
    setGerando(null);
    if (!r.sucesso) return setAviso({ tipo: 'erro', texto: r.erro });
    baixarArquivo(r.bytes, r.nome, 'text/plain;charset=ISO-8859-1');
    setAviso({
      tipo: 'ok',
      texto: `${r.nome} gerado: ${r.marcacoes} ${r.marcacoes === 1 ? 'marcação' : 'marcações'} no período.`,
    });
  };

  const gerarAej = async () => {
    setGerando('aej');
    setAviso(null);
    const r = await gerarArquivoAej(cnpj, inicio, fim);
    setGerando(null);
    if (!r.sucesso) return setAviso({ tipo: 'erro', texto: r.erro });
    baixarArquivo(r.bytes, r.nome, 'text/plain;charset=ISO-8859-1');
    // Quem ficou de fora por falta de CPF é dito pelo nome: o arquivo não está completo sem eles
    const fora = r.semCpf.length
      ? ` Ficaram de fora, sem CPF cadastrado: ${r.semCpf.join(', ')}.`
      : '';
    setAviso({
      tipo: r.semCpf.length ? 'erro' : 'ok',
      texto: `${r.nome} gerado: ${r.vinculos} ${r.vinculos === 1 ? 'pessoa' : 'pessoas'}, ${r.marcacoes} ${
        r.marcacoes === 1 ? 'marcação' : 'marcações'
      }.${fora}`,
    });
  };

  return (
    <section
      id="arquivo-fonte-de-dados"
      aria-labelledby="titulo-afd"
      className="rounded-2xl border border-[var(--c-borda)] bg-[var(--c-superficie)] p-4 flex flex-col gap-3"
    >
      <div className="flex items-start gap-3">
        <span className="w-9 h-9 rounded-xl bg-[var(--c-acento)]/10 text-[var(--c-acento)] flex items-center justify-center flex-shrink-0">
          <FileText className="w-4 h-4" />
        </span>
        <div className="min-w-0">
          <h3 id="titulo-afd" className="text-sm font-bold text-[var(--c-texto)]">
            Arquivos fiscais do ponto
          </h3>
          <p className="text-xs text-[var(--c-texto-3)] leading-relaxed">
            De {formatarDataBR(inicio)} a {formatarDataBR(fim)}, no leiaute da Portaria 671, para entregar à
            fiscalização: o AFD traz as marcações como o relógio registrou; o AEJ, a jornada tratada, como no espelho.
          </p>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-2">
        <select
          id="afd-estabelecimento"
          aria-label="Estabelecimento"
          value={cnpj}
          onChange={(e) => setCnpj(e.target.value)}
          className="flex-1 min-w-0 px-3 py-2 rounded-xl bg-[var(--c-canvas)] border border-[var(--c-borda)] text-[var(--c-texto)] text-xs focus:outline-none focus:ring-2 focus:ring-[var(--c-acento)]"
        >
          {estabelecimentos.map((e) => (
            <option key={e.cnpj} value={e.cnpj}>
              {e.razaoSocial} · {formatarCnpj(e.cnpj)}
            </option>
          ))}
        </select>
        <button
          type="button"
          id="botao-gerar-afd"
          onClick={gerar}
          disabled={!!gerando || !cnpj}
          className="h-9 px-4 rounded-xl bg-[var(--c-acento)] text-[var(--c-sobre-acento)] text-xs font-bold flex items-center justify-center gap-1.5 disabled:opacity-50"
        >
          {gerando === 'afd' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
          {gerando === 'afd' ? 'Gerando…' : 'Baixar AFD'}
        </button>
        <button
          type="button"
          id="botao-gerar-aej"
          onClick={gerarAej}
          disabled={!!gerando || !cnpj}
          className="h-9 px-4 rounded-xl bg-[var(--c-superficie-2)] border border-[var(--c-borda)] text-[var(--c-texto)] hover:border-[var(--c-acento)] text-xs font-bold flex items-center justify-center gap-1.5 disabled:opacity-50"
        >
          {gerando === 'aej' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
          {gerando === 'aej' ? 'Gerando…' : 'Baixar AEJ'}
        </button>
      </div>

      {aviso && (
        <p
          role={aviso.tipo === 'erro' ? 'alert' : 'status'}
          className={`text-xs font-semibold ${aviso.tipo === 'erro' ? 'text-red-600' : 'text-emerald-700 dark:text-emerald-400'}`}
        >
          {aviso.texto}
        </p>
      )}

      <p className="text-[11px] text-[var(--c-texto-3)] leading-relaxed">
        Ainda não vale como entrega oficial: falta o registro do sistema no INPI (o campo sai em branco) e a assinatura
        com certificado digital ICP-Brasil (o arquivo .p7s que acompanha cada um).
      </p>
    </section>
  );
};
