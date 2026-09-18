/**
 * Holerites — CONECTA / Malachias Autopeças
 *
 * O RH publica o demonstrativo de um mês para uma pessoa. Ela abre o dela
 * na aba "Eu".
 *
 * A TELA É ORGANIZADA POR MÊS, e não por pessoa. É assim que o trabalho
 * acontece: a folha fecha, chegam oitenta arquivos de uma competência, e o
 * RH sobe todos. Organizar por pessoa obrigaria a abrir oitenta fichas para
 * fazer uma coisa só.
 *
 * NENHUM HOLERITE É LIDO AQUI. Esta tela publica e confere quem já tem; ler
 * o documento de alguém sem motivo é diferente de publicá-lo, e a tela não
 * facilita o que não precisa ser fácil.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Receipt, Upload, Check, Search, Trash2, FileText } from 'lucide-react';
import { Colaborador, Holerite } from '../tipos';
import { bancoDados } from '../servicos/bancoDados';
import { listarHolerites, salvarHolerite, removerHolerite } from '../servicos/rh';
import { FotoPresenca } from './FotoPresenca';

interface Props {
  colaboradorAtual: Colaborador;
}

/** "2026-09" -> "Setembro de 2026" */
const NOMES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];
const porExtenso = (competencia: string): string => {
  const [ano, mes] = competencia.split('-');
  return `${NOMES[Number(mes) - 1] || mes} de ${ano}`;
};

const competenciaDeHoje = (): string => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

export const AbaHolerites: React.FC<Props> = ({ colaboradorAtual }) => {
  const [competencia, setCompetencia] = useState(competenciaDeHoje());
  const [holerites, setHolerites] = useState<Holerite[]>([]);
  const [busca, setBusca] = useState('');
  const [enviando, setEnviando] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [versao, setVersao] = useState(0);

  /** Um input por pessoa: um só, compartilhado, manda o arquivo para o último clicado. */
  const refArquivo = useRef<HTMLInputElement>(null);
  const refAlvo = useRef<string | null>(null);

  useEffect(() => {
    let cancelado = false;
    listarHolerites().then((lista) => {
      if (!cancelado) setHolerites(lista);
    });
    return () => {
      cancelado = true;
    };
  }, [versao]);

  const pessoas = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return bancoDados
      .obterColaboradores()
      .filter((c) => c.ativo !== false)
      .filter(
        (c) =>
          !termo ||
          c.nome.toLowerCase().includes(termo) ||
          (c.matricula || '').includes(termo) ||
          c.loja.toLowerCase().includes(termo)
      )
      .sort((a, b) => a.nome.localeCompare(b.nome));
  }, [busca, versao]);

  /** Quem já tem holerite NESTA competência. */
  const jaTem = useMemo(() => {
    const mapa = new Map<string, Holerite>();
    for (const h of holerites) {
      if (h.competencia === competencia) mapa.set(h.colaboradorId, h);
    }
    return mapa;
  }, [holerites, competencia]);

  const escolherArquivo = (colaboradorId: string) => {
    refAlvo.current = colaboradorId;
    refArquivo.current?.click();
  };

  const aoEscolher = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const arquivo = e.target.files?.[0];
    const alvo = refAlvo.current;
    e.target.value = '';
    if (!arquivo || !alvo) return;

    setEnviando(alvo);
    setAviso(null);

    const conteudo = await new Promise<string>((pronto) => {
      const leitor = new FileReader();
      leitor.onload = () => pronto(String(leitor.result || ''));
      leitor.readAsDataURL(arquivo);
    });

    const res = await salvarHolerite({
      colaboradorId: alvo,
      competencia,
      conteudo,
      arquivoNome: arquivo.name,
    });

    setEnviando(null);
    setAviso(
      res.sucesso
        ? `Holerite de ${porExtenso(competencia)} publicado.`
        : res.erro || 'Falha ao publicar.'
    );
    if (res.sucesso) setVersao((v) => v + 1);
  };

  const apagar = async (h: Holerite) => {
    const res = await removerHolerite(h);
    setAviso(res.sucesso ? 'Holerite removido.' : res.erro || 'Falha ao remover.');
    if (res.sucesso) setVersao((v) => v + 1);
  };

  const publicados = jaTem.size;

  return (
    <div className="p-4 sm:p-6 flex flex-col gap-4">
      <div>
        <h2 className="text-sm font-bold text-[var(--c-texto)] flex items-center gap-1.5">
          <Receipt className="w-4 h-4 text-[var(--c-acento)]" />
          Holerites
        </h2>
        <p className="text-xs text-[var(--c-texto-3)] leading-relaxed">
          Escolha o mês e envie o arquivo de cada pessoa. Ela abre o dela na aba{' '}
          <strong className="text-[var(--c-texto-2)]">Eu</strong> — ninguém mais vê.
          Reenviar substitui o do mesmo mês.
        </p>
      </div>

      {/* O mês, e quantos já subiram nele */}
      <div className="flex flex-wrap items-end gap-3 p-3 rounded-2xl bg-[var(--c-superficie)] border border-[var(--c-borda)]">
        <div>
          <label
            htmlFor="rh-competencia"
            className="block text-[10px] font-bold uppercase tracking-wider text-[var(--c-texto-3)] mb-1"
          >
            Competência
          </label>
          <input
            id="rh-competencia"
            type="month"
            value={competencia}
            onChange={(e) => setCompetencia(e.target.value)}
            className="px-3 py-2 rounded-xl bg-[var(--c-canvas)] border border-[var(--c-borda)] text-xs text-[var(--c-texto)]"
          />
        </div>

        <div className="pb-1">
          <span className="block text-lg font-black text-[var(--c-texto)] leading-none">
            {publicados}
            <span className="text-xs font-normal text-[var(--c-texto-3)]">
              {' '}
              de {pessoas.length}
            </span>
          </span>
          <span className="text-[11px] text-[var(--c-texto-3)]">
            publicados em {porExtenso(competencia)}
          </span>
        </div>

        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--c-texto-3)]" />
          <input
            type="text"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por nome, matrícula ou loja..."
            className="w-full pl-9 pr-3 py-2 text-xs bg-[var(--c-canvas)] border border-[var(--c-borda)] rounded-xl text-[var(--c-texto)] focus:outline-none focus:ring-2 focus:ring-[var(--c-acento)]"
          />
        </div>
      </div>

      {aviso && (
        <div className="px-3 py-2 rounded-xl bg-[var(--c-superficie-2)] border border-[var(--c-borda)] text-xs text-[var(--c-texto-2)]">
          {aviso}
        </div>
      )}

      <input
        ref={refArquivo}
        type="file"
        accept="application/pdf,image/*"
        onChange={aoEscolher}
        className="hidden"
      />

      <div className="flex flex-col gap-1.5">
        {pessoas.map((c) => {
          const holerite = jaTem.get(c.id);
          const subindo = enviando === c.id;

          return (
            <div
              key={c.id}
              className={`px-3 py-2.5 rounded-xl border flex items-center gap-3 ${
                holerite
                  ? 'bg-emerald-500/5 border-emerald-500/20'
                  : 'bg-[var(--c-superficie)] border-[var(--c-borda)]'
              }`}
            >
              <FotoPresenca
                foto={c.foto}
                nome={c.nome}
                presenca={c.presenca}
                tamanho="w-8 h-8"
              />

              <div className="flex-1 min-w-0">
                <span className="block text-xs font-bold text-[var(--c-texto)] truncate">
                  {c.nome}
                </span>
                <span className="block text-[11px] text-[var(--c-texto-3)] truncate">
                  {c.cargo} · {c.loja}
                  {c.matricula ? ` · mat. ${c.matricula}` : ''}
                </span>
              </div>

              {holerite ? (
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <span
                    className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 dark:text-emerald-400"
                    title={`Enviado por ${holerite.enviadoPorNome || 'RH'}`}
                  >
                    <Check className="w-3.5 h-3.5" />
                    Publicado
                  </span>
                  <button
                    type="button"
                    onClick={() => escolherArquivo(c.id)}
                    className="px-2 py-1 rounded-lg border border-[var(--c-borda)] text-[11px] font-semibold text-[var(--c-texto-2)] hover:text-[var(--c-texto)] transition-colors"
                  >
                    Substituir
                  </button>
                  <button
                    type="button"
                    onClick={() => apagar(holerite)}
                    className="p-1.5 rounded-lg text-[var(--c-texto-3)] hover:text-red-600 hover:bg-red-500/10 transition-colors"
                    title="Remover este holerite"
                    aria-label={`Remover o holerite de ${c.nome}`}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => escolherArquivo(c.id)}
                  disabled={subindo}
                  className="flex-shrink-0 px-2.5 py-1.5 rounded-lg bg-[var(--c-acento)] text-[var(--c-sobre-acento)] text-[11px] font-bold flex items-center gap-1.5 hover:brightness-110 disabled:opacity-50 transition-all"
                >
                  <Upload className="w-3.5 h-3.5" />
                  {subindo ? 'Enviando…' : 'Enviar'}
                </button>
              )}
            </div>
          );
        })}

        {pessoas.length === 0 && (
          <div className="p-6 text-center text-xs text-[var(--c-texto-3)] flex flex-col items-center gap-2">
            <FileText className="w-5 h-5" />
            Ninguém bate com essa busca.
          </div>
        )}
      </div>
    </div>
  );
};
