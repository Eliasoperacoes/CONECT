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
import {
  Receipt,
  Upload,
  Check,
  Search,
  Trash2,
  FileText,
  ChevronDown,
  ChevronRight,
  FileUp,
  Download,
} from 'lucide-react';
import { Colaborador, Holerite, RecebimentoHolerite } from '../tipos';
import { bancoDados } from '../servicos/bancoDados';
import {
  listarHolerites,
  salvarHolerite,
  removerHolerite,
  removerHoleritesDoMes,
  gerarComprovantes,
} from '../servicos/rh';
import { listarRecebimentos } from '../servicos/assinatura';
import { dataHoraDeBrasilia } from '../servicos/comprovanteDeHolerite';
import { baixarArquivo } from '../servicos/compartilharArquivo';
import { FotoPresenca } from './FotoPresenca';
import { CargaDeHolerites } from './CargaDeHolerites';
import { useTelaEmbutida, margemDaTela, AcaoNoCabecalho } from './TelaEmbutida';
import { CartaoNumero, CartaoLista, EstadoVazio, BuscaDaLista, classeDoBotao } from './PadraoWeb';

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
  /** Dentro da estrutura do computador: sem o título próprio, na margem padrão. */
  const embutida = useTelaEmbutida();
  const [competencia, setCompetencia] = useState(competenciaDeHoje());
  const [holerites, setHolerites] = useState<Holerite[]>([]);
  const [busca, setBusca] = useState('');
  const [enviando, setEnviando] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [versao, setVersao] = useState(0);
  const [cargaAberta, setCargaAberta] = useState(false);

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

  /*
    QUEM JÁ ASSINOU, no mês na tela. Só os ids do mês vão no pedido: a
    lista de todos os meses cresce oitenta por mês, e o filtro vai no
    endereço da consulta.
  */
  const [recebimentos, setRecebimentos] = useState<Map<string, RecebimentoHolerite>>(new Map());
  useEffect(() => {
    let cancelado = false;
    const doMes = holerites.filter((h) => h.competencia === competencia).map((h) => h.id);
    listarRecebimentos({ holeriteIds: doMes }).then((mapa) => {
      if (!cancelado) setRecebimentos(mapa);
    });
    return () => {
      cancelado = true;
    };
  }, [holerites, competencia]);

  const [gerando, setGerando] = useState<string | null>(null);
  const baixarComprovantes = async (
    itens: Array<{ holerite: Holerite; recebimento: RecebimentoHolerite; nome: string }>,
    chave: string,
    nomeDoArquivo: string
  ) => {
    setGerando(chave);
    setAviso(null);
    const res = await gerarComprovantes(itens);
    setGerando(null);
    if (!res.pdf) return setAviso(res.erro || 'Não foi possível gerar o comprovante.');
    baixarArquivo(res.pdf, nomeDoArquivo, 'application/pdf');
  };

  /**
   * Todos os ativos, sem o filtro da busca: a carga procura o nome de
   * qualquer pessoa da rede no PDF, não só de quem está na tela agora.
   */
  const ativos = useMemo(
    () => bancoDados.obterColaboradores().filter((c) => c.ativo !== false),
    [versao]
  );

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
  /**
   * A LISTA RECOLHE POR LOJA.
   *
   * São 89 pessoas numa coluna só. Quem está subindo o holerite de Porto
   * Ferreira rolava a matriz inteira para chegar lá, e perdia o lugar a
   * cada arquivo enviado.
   *
   * A loja é o corte certo porque é assim que o holerite chega ao RH: um
   * lote por unidade. Recolher por setor ou por letra não ajudaria em
   * nada nesse trabalho.
   */
  /**
   * GUARDA QUEM ESTÁ ABERTA, e não quem está fechada.
   *
   * Parece detalhe e não é: com o conjunto de fechadas, o estado inicial
   * vazio queria dizer "tudo aberto" — as cinco lojas abertas de uma vez,
   * 89 linhas na tela, que é o que o Elias pediu para mudar.
   *
   * Invertido, o vazio quer dizer o certo: tudo recolhido. E nenhuma
   * `useEffect` precisa correr atrás da lista de lojas para semear o
   * estado — o que seria um segundo lugar decidindo o mesmo.
   */
  const [abertas, setAbertas] = useState<Set<string>>(new Set());

  const porLoja = useMemo(() => {
    const mapa = new Map<string, typeof pessoas>();
    for (const c of pessoas) {
      const lista = mapa.get(c.loja) || [];
      lista.push(c);
      mapa.set(c.loja, lista);
    }
    return [...mapa.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [pessoas]);

  /**
   * BUSCANDO, TUDO ABRE.
   *
   * Um resultado escondido dentro de um grupo fechado é pior do que
   * resultado nenhum: a pessoa digita o nome certo, não vê nada e
   * conclui que o colega não está cadastrado.
   */
  const buscando = busca.trim().length > 0;

  const alternarLoja = (loja: string) =>
    setAbertas((atual) => {
      const nova = new Set(atual);
      if (nova.has(loja)) nova.delete(loja);
      else nova.add(loja);
      return nova;
    });

  const todasRecolhidas = abertas.size === 0;

  const alternarTodas = () =>
    setAbertas(todasRecolhidas ? new Set(porLoja.map(([loja]) => loja)) : new Set());

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
  const assinadosNoMes = [...jaTem.values()].filter((h) => recebimentos.has(h.id));
  const nomeDoColaborador = (id: string) => bancoDados.obterColaboradorPorId(id)?.nome || id;

  /*
    LIMPAR O MÊS INTEIRO — para a carga de teste não ficar no meio do
    trabalho, ou para refazer uma que subiu errada. Dois toques: o primeiro
    só pergunta, dizendo quantos e de que mês.
  */
  const [confirmandoLimpeza, setConfirmandoLimpeza] = useState(false);
  const [limpando, setLimpando] = useState(false);
  useEffect(() => setConfirmandoLimpeza(false), [competencia]);

  const limparMes = async () => {
    setLimpando(true);
    const res = await removerHoleritesDoMes(competencia);
    setLimpando(false);
    setConfirmandoLimpeza(false);
    if (!res.sucesso) setAviso(res.erro || 'Falha ao remover.');
    else if (res.removidos === 0 && res.assinadosMantidos === 0) {
      setAviso('Nenhum holerite foi removido. Confira se o seu acesso permite apagar.');
    } else {
      const mantidos = res.assinadosMantidos
        ? ` ${res.assinadosMantidos} assinado${res.assinadosMantidos === 1 ? '' : 's'} ficou${res.assinadosMantidos === 1 ? '' : 'aram'}.`
        : '';
      setAviso(
        `${res.removidos} holerite${res.removidos === 1 ? '' : 's'} de ${porExtenso(competencia)} removido${res.removidos === 1 ? '' : 's'}.${mantidos}`
      );
    }
    setVersao((v) => v + 1);
  };

  /** O PDF do escritório escolhido ou arrastado na área de carga (computador). */
  const [arquivoDaCarga, setArquivoDaCarga] = useState<File | null>(null);
  const [arrastando, setArrastando] = useState(false);
  const abrirCargaCom = (arquivo: File | undefined) => {
    if (!arquivo) return;
    setArquivoDaCarga(arquivo);
    setCargaAberta(true);
  };

  const carga = (
    <CargaDeHolerites
      aberto={cargaAberta}
      aoFechar={() => {
        setCargaAberta(false);
        setArquivoDaCarga(null);
      }}
      pessoas={ativos}
      holerites={holerites}
      competenciaInicial={competencia}
      aoPublicar={() => setVersao((v) => v + 1)}
      arquivoInicial={arquivoDaCarga}
    />
  );

  const arquivoDeUmaPessoa = (
    <input ref={refArquivo} type="file" accept="application/pdf,image/*" onChange={aoEscolher} className="hidden" />
  );

  const baixarAssinadosDoMes = () =>
    baixarComprovantes(
      assinadosNoMes
        .map((h) => ({ holerite: h, recebimento: recebimentos.get(h.id)!, nome: nomeDoColaborador(h.colaboradorId) }))
        .sort((a, b) => a.nome.localeCompare(b.nome)),
      'mes',
      `Holerites assinados ${competencia}.pdf`
    );

  /** As lojas, recolhidas, e quem em cada uma — no celular solta; no computador, dentro do cartão de lista. */
  const listaDasLojas = (noCartao: boolean) => (
    <div className={noCartao ? '' : 'flex flex-col gap-2'}>
      {porLoja.map(([loja, daLoja]) => {
        const fechada = !buscando && !abertas.has(loja);
        const publicados = daLoja.filter((c) => jaTem.has(c.id)).length;
        const completa = publicados === daLoja.length;

        return (
          <div
            key={loja}
            className={noCartao ? 'border-b border-[var(--c-borda)] last:border-0' : 'flex flex-col gap-1.5'}
          >
            {/*
              O CABEÇALHO DIZ O PROGRESSO SEM PRECISAR ABRIR.

              "3 de 12" é o que o RH quer saber ao passar o olho: qual
              loja ainda falta. Sem isso, recolher esconderia justamente
              a informação que faz decidir onde mexer.
            */}
            <button
              type="button"
              onClick={() => alternarLoja(loja)}
              disabled={buscando}
              className={
                noCartao
                  ? 'w-full px-4 py-3 flex items-center gap-2 text-left hover:bg-[var(--c-superficie-2)] transition-colors disabled:opacity-60'
                  : 'px-3 py-2 rounded-xl bg-[var(--c-canvas)] border border-[var(--c-borda)] flex items-center gap-2 text-left hover:border-[var(--c-borda-forte)] transition-colors disabled:opacity-60'
              }
            >
              {fechada ? (
                <ChevronRight className="w-4 h-4 text-[var(--c-texto-3)] flex-shrink-0" />
              ) : (
                <ChevronDown className="w-4 h-4 text-[var(--c-texto-3)] flex-shrink-0" />
              )}

              <span className="flex-1 min-w-0 text-xs font-bold text-[var(--c-texto)] truncate">
                {loja}
              </span>

              <span
                className={`text-[11px] font-bold tabular-nums flex-shrink-0 ${
                  completa ? 'text-emerald-600' : 'text-[var(--c-texto-3)]'
                }`}
              >
                {completa && <Check className="w-3.5 h-3.5 inline mr-0.5" />}
                {publicados} de {daLoja.length}
              </span>
            </button>

            {!fechada && (
              <div className={noCartao ? 'flex flex-col gap-1.5 pl-10 pr-4 pb-3' : 'flex flex-col gap-1.5 pl-2'}>
                {daLoja.map((c) => {
                  const holerite = jaTem.get(c.id);
                  const subindo = enviando === c.id;
                  const recebido = holerite ? recebimentos.get(holerite.id) : undefined;

                  // ASSINADO: mostra quando, e o comprovante. Substituir e
                  // remover somem — o banco recusaria os dois
                  if (holerite && recebido) {
                    return (
                      <div
                        key={c.id}
                        className="px-3 py-2.5 rounded-xl border flex items-center gap-3 bg-emerald-500/5 border-emerald-500/20"
                      >
                        <FotoPresenca foto={c.foto} nome={c.nome} presenca={c.presenca} tamanho="w-8 h-8" />
                        <div className="flex-1 min-w-0">
                          <span className="block text-xs font-bold text-[var(--c-texto)] truncate">{c.nome}</span>
                          <span className="block text-[11px] text-emerald-700 dark:text-emerald-400 truncate">
                            Assinado em {dataHoraDeBrasilia(recebido.assinadoEm)}
                          </span>
                        </div>
                        <button
                          type="button"
                          disabled={gerando !== null}
                          onClick={() =>
                            baixarComprovantes(
                              [{ holerite, recebimento: recebido, nome: c.nome }],
                              holerite.id,
                              `Holerite assinado ${competencia} - ${c.nome}.pdf`
                            )
                          }
                          className="flex-shrink-0 px-2 py-1 rounded-lg border border-[var(--c-borda)] text-[11px] font-semibold text-[var(--c-texto-2)] hover:text-[var(--c-texto)] flex items-center gap-1 disabled:opacity-50"
                        >
                          <Download className="w-3.5 h-3.5" />
                          {gerando === holerite.id ? 'Gerando…' : 'Comprovante'}
                        </button>
                      </div>
                    );
                  }

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
              </div>
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
  );

  /*
    NO COMPUTADOR, o padrão do desenho: o mês no título da tela; a carga do
    PDF como uma área larga, que aceita o arquivo arrastado; os números do
    mês nos cartões; as lojas num cartão de lista, com a busca no topo. No
    celular, nada muda.
  */
  if (embutida) {
    const faltam = Math.max(0, ativos.length - publicados);
    return (
      <div className={`${margemDaTela(true)} flex flex-col gap-5`}>
        <AcaoNoCabecalho>
          {assinadosNoMes.length > 0 && (
            <button
              type="button"
              id="botao-baixar-assinados-do-mes"
              disabled={gerando !== null}
              onClick={baixarAssinadosDoMes}
              className={classeDoBotao.secundario}
            >
              <Download className="w-4 h-4" />
              {gerando === 'mes' ? 'Gerando…' : `Baixar ${assinadosNoMes.length} assinados`}
            </button>
          )}
          <label className="sr-only" htmlFor="rh-competencia">
            Competência
          </label>
          <input
            id="rh-competencia"
            type="month"
            value={competencia}
            onChange={(e) => setCompetencia(e.target.value)}
            className="h-10 px-3 rounded-xl bg-[var(--c-superficie)] border border-[var(--c-borda)] text-xs font-bold text-[var(--c-texto)] shadow-[var(--s-1)]"
          />
        </AcaoNoCabecalho>

        {/* A carga: clicar escolhe o PDF; arrastar o arquivo até aqui também serve */}
        <label
          id="botao-abrir-carga-holerites"
          htmlFor="arquivo-pdf-do-escritorio"
          onDragOver={(e) => {
            e.preventDefault();
            setArrastando(true);
          }}
          onDragLeave={() => setArrastando(false)}
          onDrop={(e) => {
            e.preventDefault();
            setArrastando(false);
            abrirCargaCom(e.dataTransfer.files?.[0]);
          }}
          className={`flex flex-col items-center justify-center gap-2 px-6 py-8 rounded-2xl border-2 border-dashed cursor-pointer text-center transition-colors ${
            arrastando
              ? 'border-[var(--c-acento)] bg-[var(--c-acento-suave)]'
              : 'border-[var(--c-acento)]/35 bg-[var(--c-superficie)] hover:bg-[var(--c-acento-suave)]/50'
          }`}
        >
          <span className="w-11 h-11 rounded-xl bg-[var(--c-acento)] text-[var(--c-sobre-acento)] flex items-center justify-center shadow-[var(--s-2)]">
            <FileUp className="w-5 h-5" />
          </span>
          <span className="mt-1 text-sm font-extrabold text-[var(--c-texto)]">Carregar o PDF do escritório</span>
          <span className="text-xs text-[var(--c-texto-3)]">
            Um arquivo com o holerite de todos · clique para escolher ou arraste até aqui. Nada é publicado antes de
            você conferir.
          </span>
        </label>
        <input
          id="arquivo-pdf-do-escritorio"
          type="file"
          accept="application/pdf"
          className="hidden"
          onChange={(e) => {
            const arquivo = e.target.files?.[0];
            e.target.value = '';
            abrirCargaCom(arquivo);
          }}
        />
        {carga}

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <CartaoNumero
            rotulo="Publicados"
            valor={publicados}
            detalhe={`de ${ativos.length} colaboradores em ${porExtenso(competencia)}`}
            tom={publicados > 0 ? 'acento' : 'neutro'}
          />
          <CartaoNumero
            rotulo="Assinados"
            valor={assinadosNoMes.length}
            detalhe="O colaborador confirmou o recebimento"
            tom={assinadosNoMes.length > 0 ? 'ok' : 'neutro'}
          />
          <CartaoNumero
            rotulo="Sem holerite"
            valor={faltam}
            detalhe="Ainda não receberam o do mês"
            tom={faltam > 0 && publicados > 0 ? 'atencao' : 'neutro'}
          />
        </div>

        {aviso && (
          <div className="px-3 py-2 rounded-xl bg-[var(--c-superficie-2)] border border-[var(--c-borda)] text-xs text-[var(--c-texto-2)]">
            {aviso}
          </div>
        )}
        {arquivoDeUmaPessoa}

        <CartaoLista
          barra={
            <>
              <div className="flex flex-wrap items-center gap-3">
                {porLoja.length > 1 && !buscando && (
                  <button type="button" onClick={alternarTodas} className={`${classeDoBotao.secundario} h-9`}>
                    {todasRecolhidas ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                    {todasRecolhidas ? 'Abrir todas as lojas' : 'Recolher todas'}
                  </button>
                )}
                {publicados > assinadosNoMes.length &&
                  (confirmandoLimpeza ? (
                    <span className="flex flex-wrap items-center gap-2 text-[11px] font-semibold text-red-700 dark:text-red-400">
                      Remover os {publicados - assinadosNoMes.length} de {porExtenso(competencia)}?
                      {assinadosNoMes.length > 0 && ` Os ${assinadosNoMes.length} assinados ficam.`}
                      <button
                        type="button"
                        id="botao-confirmar-limpeza-holerites"
                        onClick={limparMes}
                        disabled={limpando}
                        className="px-2.5 py-1.5 rounded-lg bg-red-600 text-white text-[11px] font-bold disabled:opacity-50"
                      >
                        {limpando ? 'Removendo…' : 'Remover todos'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmandoLimpeza(false)}
                        disabled={limpando}
                        className="px-2.5 py-1.5 rounded-lg border border-[var(--c-borda)] text-[11px] font-semibold text-[var(--c-texto-2)]"
                      >
                        Cancelar
                      </button>
                    </span>
                  ) : (
                    <button
                      type="button"
                      id="botao-limpar-holerites-do-mes"
                      onClick={() => setConfirmandoLimpeza(true)}
                      className="flex items-center gap-1.5 text-[11px] font-semibold text-[var(--c-texto-3)] hover:text-red-600 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Limpar este mês
                    </button>
                  ))}
              </div>
              <BuscaDaLista
                id="holerites-busca"
                valor={busca}
                aoMudar={setBusca}
                placeholder="Buscar por nome, matrícula ou loja"
              />
            </>
          }
        >
          {pessoas.length === 0 ? (
            <EstadoVazio
              icone={<Receipt className="w-6 h-6" />}
              titulo="Ninguém com esse nome"
              descricao="Procure pelo nome, pela matrícula ou pela loja."
            />
          ) : (
            listaDasLojas(true)
          )}
        </CartaoLista>
      </div>
    );
  }

  return (
    <div className={`${margemDaTela(embutida)} flex flex-col gap-4`}>
      <div className={embutida ? 'hidden' : ''}>
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

      {/*
        A CARGA VEM PRIMEIRO: é como o holerite chega de verdade, num PDF
        só do escritório. O envio um por um fica embaixo, para o caso
        isolado — o recém-admitido, a correção de uma pessoa.
      */}
      <button
        type="button"
        id="botao-abrir-carga-holerites"
        onClick={() => setCargaAberta(true)}
        className="w-full sm:w-auto sm:self-start flex items-center gap-3 p-4 rounded-2xl bg-[var(--c-acento)] text-[var(--c-sobre-acento)] text-left hover:brightness-110 active:scale-[0.99] transition-all"
      >
        <FileUp className="w-6 h-6 flex-shrink-0" />
        <span>
          <span className="block text-sm font-bold">Carregar o PDF do escritório</span>
          <span className="block text-xs opacity-85">Um arquivo com todos · distribui pelo nome de cada um</span>
        </span>
      </button>

      {carga}

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
            {publicados > 0 && ` · ${assinadosNoMes.length} assinado${assinadosNoMes.length === 1 ? '' : 's'}`}
          </span>
        </div>

        {/* O arquivo do mês: os assinados, carimbados, num PDF só */}
        {assinadosNoMes.length > 0 && (
          <button
            type="button"
            id="botao-baixar-assinados-do-mes"
            disabled={gerando !== null}
            onClick={baixarAssinadosDoMes}
            className="pb-1 flex items-center gap-1.5 text-[11px] font-semibold text-[var(--c-acento)] hover:underline disabled:opacity-50"
          >
            <Download className="w-3.5 h-3.5" />
            {gerando === 'mes' ? 'Gerando…' : `Baixar os ${assinadosNoMes.length} assinados`}
          </button>
        )}

        {publicados > assinadosNoMes.length &&
          (confirmandoLimpeza ? (
            <div className="flex flex-wrap items-center gap-2 p-2 rounded-xl bg-red-500/8 border border-red-500/30">
              <span className="text-[11px] font-semibold text-red-700 dark:text-red-400">
                Remover os {publicados - assinadosNoMes.length} holerites de {porExtenso(competencia)}? Quem já recebeu
                deixa de ver.
                {assinadosNoMes.length > 0 && ` Os ${assinadosNoMes.length} assinados ficam.`}
              </span>
              <button
                type="button"
                id="botao-confirmar-limpeza-holerites"
                onClick={limparMes}
                disabled={limpando}
                className="px-2.5 py-1.5 rounded-lg bg-red-600 text-white text-[11px] font-bold disabled:opacity-50"
              >
                {limpando ? 'Removendo…' : 'Remover todos'}
              </button>
              <button
                type="button"
                onClick={() => setConfirmandoLimpeza(false)}
                disabled={limpando}
                className="px-2.5 py-1.5 rounded-lg border border-[var(--c-borda)] text-[11px] font-semibold text-[var(--c-texto-2)]"
              >
                Cancelar
              </button>
            </div>
          ) : (
            <button
              type="button"
              id="botao-limpar-holerites-do-mes"
              onClick={() => setConfirmandoLimpeza(true)}
              className="pb-1 flex items-center gap-1.5 text-[11px] font-semibold text-[var(--c-texto-3)] hover:text-red-600 transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Limpar este mês
            </button>
          ))}

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

      {arquivoDeUmaPessoa}

      {porLoja.length > 1 && !buscando && (
        <button
          type="button"
          onClick={alternarTodas}
          className="self-start text-[11px] font-bold text-[var(--c-acento)] hover:underline flex items-center gap-1"
        >
          {todasRecolhidas ? (
            <ChevronDown className="w-3.5 h-3.5" />
          ) : (
            <ChevronRight className="w-3.5 h-3.5" />
          )}
          {todasRecolhidas ? 'Abrir todas as lojas' : 'Recolher todas as lojas'}
        </button>
      )}

      {listaDasLojas(false)}
    </div>
  );
};
