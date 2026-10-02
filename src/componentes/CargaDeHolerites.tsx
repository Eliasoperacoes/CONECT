/**
 * CARGA DE HOLERITES — o PDF do escritório, distribuído de uma vez.
 *
 * Pedido do Elias: "recebemos em PDF os holerites do escritório... uma
 * função de upload como um sistema de carga, distribuído automaticamente
 * para os colaboradores". Antes, o RH publicava um por um.
 *
 * Três passos, sempre com o RH vendo antes de acontecer:
 *
 *   1. escolher o arquivo (lido aqui, no navegador — não sobe inteiro);
 *   2. conferir: quem foi achado, o que precisa de decisão, quem ficou
 *      sem holerite, quem vai ter o do mês substituído;
 *   3. publicar, com o progresso à vista.
 *
 * As regras de quem é o dono de cada página estão em
 * `cargaDeHolerites.ts`; o PDF, em `pdfHolerite.ts`. Aqui só se mostra e
 * se pergunta.
 */
import React, { useMemo, useState } from 'react';
import { FileUp, Loader2, CheckCircle2, AlertTriangle, UserX, FileWarning } from 'lucide-react';
import { Colaborador, Holerite } from '../tipos';
import { FolhaInferior } from './FolhaInferior';
import {
  analisarPaginas,
  decisaoInicial,
  paginasPorPessoa,
  sugerirCompetencia,
  PaginaAnalisada,
} from '../servicos/cargaDeHolerites';
import { lerPaginasDoPdf, publicarCargaDeHolerites, ResultadoDaCarga, CortesDasVias } from '../servicos/pdfHolerite';
import { rotuloDoMes } from '../servicos/meuRH';

interface Props {
  aberto: boolean;
  aoFechar: () => void;
  /** Quem pode receber: os ativos da rede. */
  pessoas: Colaborador[];
  /** Os já publicados, para avisar quem terá o do mês substituído. */
  holerites: Holerite[];
  competenciaInicial: string;
  aoPublicar: () => void;
}

type Etapa = 'escolher' | 'lendo' | 'revisar' | 'publicando' | 'fim';

const NAO_PUBLICAR = '';

export const CargaDeHolerites: React.FC<Props> = ({
  aberto,
  aoFechar,
  pessoas,
  holerites,
  competenciaInicial,
  aoPublicar,
}) => {
  const [etapa, setEtapa] = useState<Etapa>('escolher');
  const [arquivo, setArquivo] = useState<{ nome: string; dados: ArrayBuffer; cortes: CortesDasVias } | null>(null);
  const [paginas, setPaginas] = useState<PaginaAnalisada[]>([]);
  const [decisoes, setDecisoes] = useState<Record<number, string | null>>({});
  const [competencia, setCompetencia] = useState(competenciaInicial);
  const [erro, setErro] = useState<string | null>(null);
  const [progresso, setProgresso] = useState({ feitos: 0, total: 0 });
  const [resultado, setResultado] = useState<ResultadoDaCarga | null>(null);

  const nomeDe = (id: string) => pessoas.find((p) => p.id === id)?.nome || id;

  const recomecar = () => {
    setEtapa('escolher');
    setArquivo(null);
    setPaginas([]);
    setDecisoes({});
    setErro(null);
    setResultado(null);
  };

  const fechar = () => {
    // Publicando, fechar abandonaria o lote no meio sem ninguém saber onde parou
    if (etapa === 'publicando') return;
    recomecar();
    aoFechar();
  };

  const aoEscolherArquivo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const escolhido = e.target.files?.[0];
    e.target.value = '';
    if (!escolhido) return;

    setErro(null);
    setEtapa('lendo');
    try {
      const dados = await escolhido.arrayBuffer();
      const { textos, cortes } = await lerPaginasDoPdf(dados);

      /**
       * PDF ESCANEADO NÃO TEM NOME PARA LER.
       *
       * Se nenhuma página tem texto, é foto do papel. Mostrar tudo "sem
       * dono" faria o RH achar que o sistema errou os nomes; o que falta
       * é o arquivo certo.
       */
      if (textos.every((t) => t.trim().length < 20)) {
        setErro(
          'Este PDF não tem texto — parece escaneado (uma foto do papel). Peça ao escritório o PDF gerado pelo sistema da folha.'
        );
        setEtapa('escolher');
        return;
      }

      const analise = analisarPaginas(textos, pessoas);
      setArquivo({ nome: escolhido.name, dados, cortes });
      setPaginas(analise);
      setDecisoes(decisaoInicial(analise));
      setCompetencia(sugerirCompetencia(textos) || competenciaInicial);
      setEtapa('revisar');
    } catch (falha) {
      console.error('Falha ao ler o PDF da carga:', falha);
      setErro('Não foi possível ler este arquivo. Confira se é um PDF que abre normalmente.');
      setEtapa('escolher');
    }
  };

  const grupos = useMemo(() => paginasPorPessoa(decisoes), [decisoes]);
  const recebem = Object.keys(grupos);
  const paraDecidir = paginas.filter((p) => p.donos.length !== 1);
  const semHolerite = pessoas.filter((p) => !grupos[p.id]);
  const substituidos = recebem.filter((id) =>
    holerites.some((h) => h.colaboradorId === id && h.competencia === competencia)
  );
  const naoPublicadas = paginas.filter((p) => !decisoes[p.numero]).length;
  // As páginas impressas em duas vias, que cada um recebe com uma só
  const umaVia = arquivo ? Object.values(arquivo.cortes).filter((c) => c != null).length : 0;

  const publicar = async () => {
    if (!arquivo || recebem.length === 0) return;
    if (!/^\d{4}-\d{2}$/.test(competencia)) {
      setErro('Escolha o mês (competência) antes de publicar.');
      return;
    }
    setErro(null);
    setEtapa('publicando');
    setProgresso({ feitos: 0, total: recebem.length });

    const res = await publicarCargaDeHolerites({
      arquivo: arquivo.dados,
      cortes: arquivo.cortes,
      competencia,
      grupos,
      nomeDe,
      aoAvancar: (feitos, total) => setProgresso({ feitos, total }),
    });

    setResultado(res);
    setEtapa('fim');
    if (res.publicados > 0) aoPublicar();
  };

  const opcoesDePessoa = (pagina: PaginaAnalisada) => {
    // Os nomes achados e o palpite vêm primeiro: são as respostas prováveis
    const primeiros = [...pagina.donos, ...(pagina.sugestao ? [pagina.sugestao] : [])];
    const resto = pessoas.filter((p) => !primeiros.includes(p.id));
    return { primeiros: [...new Set(primeiros)], resto };
  };

  const rodape =
    etapa === 'revisar' ? (
      <div className="flex flex-col gap-2">
        {erro && <p className="text-xs font-semibold text-red-600">{erro}</p>}
        <button
          type="button"
          id="botao-publicar-carga"
          onClick={publicar}
          disabled={recebem.length === 0}
          className="w-full h-12 rounded-2xl bg-[var(--c-acento)] text-[var(--c-sobre-acento)] text-sm font-bold disabled:opacity-40"
        >
          Publicar {recebem.length} holerite{recebem.length === 1 ? '' : 's'} de {rotuloDoMes(competencia)}
        </button>
        <button type="button" onClick={recomecar} className="h-10 text-xs font-semibold text-[var(--c-texto-2)]">
          Escolher outro arquivo
        </button>
      </div>
    ) : etapa === 'fim' ? (
      <button
        type="button"
        onClick={fechar}
        className="w-full h-12 rounded-2xl bg-[var(--c-acento)] text-[var(--c-sobre-acento)] text-sm font-bold"
      >
        Concluir
      </button>
    ) : undefined;

  return (
    <FolhaInferior
      aberto={aberto}
      titulo="Carga de holerites"
      subtitulo={arquivo ? `${arquivo.nome} · ${paginas.length} páginas` : 'O PDF do escritório, distribuído pelo nome'}
      aoFechar={fechar}
      rodape={rodape}
    >
      {etapa === 'escolher' && (
        <div className="p-5 flex flex-col gap-4">
          <p className="text-sm text-[var(--c-texto-2)] leading-relaxed">
            Escolha o PDF que o escritório mandou, com o holerite de todos. O sistema acha o{' '}
            <strong>nome completo</strong> de cada pessoa na página e separa o dela. Nada é
            publicado antes de você conferir.
          </p>
          <label
            htmlFor="arquivo-carga-holerites"
            className="flex flex-col items-center justify-center gap-2 p-8 rounded-2xl border-2 border-dashed border-[var(--c-borda-forte)] text-[var(--c-texto-2)] cursor-pointer active:bg-[var(--c-superficie-2)] hover:bg-[var(--c-superficie-2)] transition-colors"
          >
            <FileUp className="w-8 h-8 text-[var(--c-acento)]" />
            <span className="text-sm font-bold text-[var(--c-texto)]">Escolher o PDF</span>
            <span className="text-xs text-[var(--c-texto-3)]">O arquivo é lido aqui, neste aparelho</span>
          </label>
          <input
            id="arquivo-carga-holerites"
            type="file"
            accept="application/pdf"
            onChange={aoEscolherArquivo}
            className="hidden"
          />
          {erro && (
            <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-xs font-semibold text-red-600 flex gap-2">
              <FileWarning className="w-4 h-4 flex-shrink-0" />
              {erro}
            </div>
          )}
        </div>
      )}

      {etapa === 'lendo' && (
        <div className="p-10 flex flex-col items-center gap-3 text-[var(--c-texto-2)]">
          <Loader2 className="w-7 h-7 animate-spin text-[var(--c-acento)]" />
          <span className="text-sm font-semibold">Lendo o PDF e procurando os nomes…</span>
        </div>
      )}

      {etapa === 'revisar' && (
        <div className="p-4 flex flex-col gap-4">
          <div>
            <label htmlFor="carga-competencia" className="block text-xs font-bold text-[var(--c-texto-2)] mb-1.5">
              Mês do holerite (competência)
            </label>
            <input
              id="carga-competencia"
              type="month"
              value={competencia}
              onChange={(e) => setCompetencia(e.target.value)}
              className="w-full h-11 px-3 rounded-xl bg-[var(--c-canvas)] border border-[var(--c-borda)] text-sm text-[var(--c-texto)]"
            />
            <span className="text-[11px] text-[var(--c-texto-3)]">Lido do PDF. Confira antes de publicar.</span>
          </div>

          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="p-2.5 rounded-xl bg-emerald-500/10">
              <span className="block text-xl font-black text-emerald-600">{recebem.length}</span>
              <span className="text-[11px] text-[var(--c-texto-2)]">vão receber</span>
            </div>
            <div className={`p-2.5 rounded-xl ${paraDecidir.length ? 'bg-amber-500/10' : 'bg-[var(--c-superficie-2)]'}`}>
              <span className={`block text-xl font-black ${paraDecidir.length ? 'text-amber-600' : 'text-[var(--c-texto-3)]'}`}>
                {paraDecidir.length}
              </span>
              <span className="text-[11px] text-[var(--c-texto-2)]">para decidir</span>
            </div>
            <div className="p-2.5 rounded-xl bg-[var(--c-superficie-2)]">
              <span className="block text-xl font-black text-[var(--c-texto-2)]">{semHolerite.length}</span>
              <span className="text-[11px] text-[var(--c-texto-2)]">sem holerite</span>
            </div>
          </div>

          {substituidos.length > 0 && (
            <p className="p-3 rounded-xl bg-amber-500/8 border border-amber-500/25 text-xs text-amber-700 dark:text-amber-400">
              {substituidos.length} pessoa{substituidos.length === 1 ? ' já tem' : 's já têm'} holerite de{' '}
              {rotuloDoMes(competencia)}. Publicar substitui o anterior.
            </p>
          )}

          {paraDecidir.length > 0 && (
            <section className="flex flex-col gap-2">
              <h3 className="text-sm font-bold text-[var(--c-texto)] flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 text-amber-600" />
                Páginas para você decidir
              </h3>
              <p className="text-xs text-[var(--c-texto-3)]">
                O nome não bateu com certeza. Na dúvida, deixe em “Não publicar” — holerite no lugar
                errado mostra o salário de uma pessoa a outra.
              </p>
              {paraDecidir.map((p) => {
                const { primeiros, resto } = opcoesDePessoa(p);
                return (
                  <div key={p.numero} className="p-3 rounded-xl border border-[var(--c-borda)] bg-[var(--c-canvas)] flex flex-col gap-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-bold text-[var(--c-texto)]">Página {p.numero}</span>
                      <span className="text-[11px] text-[var(--c-texto-3)]">
                        {p.donos.length > 1
                          ? `${p.donos.length} nomes na página`
                          : p.sugestao
                            ? 'Nome parecido'
                            : 'Nenhum nome do cadastro'}
                      </span>
                    </div>
                    {(p.donos.length > 1 || p.sugestao) && (
                      <p className="text-xs text-[var(--c-texto-2)]">
                        {p.donos.length > 1 ? 'Nomes: ' : 'Parece ser '}
                        <strong className="text-[var(--c-texto)]">
                          {(p.donos.length > 1 ? p.donos : [p.sugestao!]).map(nomeDe).join(' e ')}
                        </strong>
                      </p>
                    )}
                    <p className="text-[11px] text-[var(--c-texto-3)] line-clamp-2 break-words">{p.trecho || '(página sem texto)'}</p>
                    <select
                      id={`dono-pagina-${p.numero}`}
                      value={decisoes[p.numero] || NAO_PUBLICAR}
                      onChange={(e) => setDecisoes((d) => ({ ...d, [p.numero]: e.target.value || null }))}
                      className="h-11 px-3 rounded-xl bg-[var(--c-superficie)] border border-[var(--c-borda)] text-sm text-[var(--c-texto)]"
                    >
                      <option value={NAO_PUBLICAR}>Não publicar esta página</option>
                      {primeiros.map((id) => (
                        <option key={id} value={id}>
                          {id === p.sugestao ? 'Sugestão: ' : ''}
                          {nomeDe(id)}
                        </option>
                      ))}
                      <option disabled>──────────</option>
                      {resto.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.nome}
                        </option>
                      ))}
                    </select>
                  </div>
                );
              })}
            </section>
          )}

          <details className="rounded-xl border border-[var(--c-borda)]">
            <summary className="px-3 py-3 text-sm font-bold text-[var(--c-texto)] cursor-pointer flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              Quem vai receber ({recebem.length})
            </summary>
            <ul className="divide-y divide-[var(--c-borda)]">
              {recebem
                .sort((a, b) => nomeDe(a).localeCompare(nomeDe(b)))
                .map((id) => (
                  <li key={id} className="px-3 py-2 flex items-center justify-between gap-2 text-xs">
                    <span className="text-[var(--c-texto)] truncate">{nomeDe(id)}</span>
                    <span className="text-[var(--c-texto-3)] flex-shrink-0">
                      pág. {grupos[id].join(', ')}
                    </span>
                  </li>
                ))}
            </ul>
          </details>

          {semHolerite.length > 0 && (
            <details className="rounded-xl border border-[var(--c-borda)]">
              <summary className="px-3 py-3 text-sm font-bold text-[var(--c-texto)] cursor-pointer flex items-center gap-1.5">
                <UserX className="w-4 h-4 text-[var(--c-texto-3)]" />
                Sem holerite neste arquivo ({semHolerite.length})
              </summary>
              <p className="px-3 pb-2 text-[11px] text-[var(--c-texto-3)]">
                Estagiário, recém-admitido, ou nome diferente do cadastro. Quem deveria estar aqui, confira
                o nome na ficha.
              </p>
              <ul className="divide-y divide-[var(--c-borda)]">
                {semHolerite.map((c) => (
                  <li key={c.id} className="px-3 py-2 text-xs text-[var(--c-texto-2)] truncate">
                    {c.nome} · {c.loja}
                  </li>
                ))}
              </ul>
            </details>
          )}

          {umaVia > 0 && (
            <p className="text-[11px] text-[var(--c-texto-3)]">
              {umaVia === paginas.length ? 'Todas as páginas' : `${umaVia} de ${paginas.length} páginas`} vieram em duas vias: cada pessoa recebe uma só.
            </p>
          )}
          {naoPublicadas > 0 && (
            <p className="text-[11px] text-[var(--c-texto-3)]">
              {naoPublicadas} página{naoPublicadas === 1 ? '' : 's'} do arquivo não {naoPublicadas === 1 ? 'será publicada' : 'serão publicadas'}.
            </p>
          )}
        </div>
      )}

      {etapa === 'publicando' && (
        <div className="p-8 flex flex-col gap-3">
          <span className="text-sm font-semibold text-[var(--c-texto)] text-center">
            Publicando {progresso.feitos} de {progresso.total}…
          </span>
          <div className="h-2.5 rounded-full bg-[var(--c-superficie-2)] overflow-hidden">
            <div
              className="h-full bg-[var(--c-acento)] transition-all"
              style={{ width: `${progresso.total ? (progresso.feitos / progresso.total) * 100 : 0}%` }}
            />
          </div>
          <span className="text-xs text-[var(--c-texto-3)] text-center">Não feche esta janela.</span>
        </div>
      )}

      {etapa === 'fim' && resultado && (
        <div className="p-5 flex flex-col gap-3">
          <div className="flex items-center gap-2 text-emerald-600">
            <CheckCircle2 className="w-6 h-6" />
            <span className="text-base font-bold">
              {resultado.publicados} holerite{resultado.publicados === 1 ? '' : 's'} de {rotuloDoMes(competencia)} publicado
              {resultado.publicados === 1 ? '' : 's'}
            </span>
          </div>
          <p className="text-xs text-[var(--c-texto-3)]">
            Cada pessoa já encontra o dela na aba Eu, em Meu RH → Holerites.
          </p>
          {resultado.falhas.length > 0 && (
            <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 flex flex-col gap-1">
              <span className="text-xs font-bold text-red-600">
                {resultado.falhas.length} não {resultado.falhas.length === 1 ? 'foi' : 'foram'} publicado
                {resultado.falhas.length === 1 ? '' : 's'} — envie de novo pela lista:
              </span>
              {resultado.falhas.map((f) => (
                <span key={f.colaboradorId} className="text-xs text-red-600">
                  {nomeDe(f.colaboradorId)}: {f.erro}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </FolhaInferior>
  );
};
