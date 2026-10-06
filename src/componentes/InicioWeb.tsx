/**
 * O INÍCIO DO COMPUTADOR — "Bom dia, Fernanda" e o resumo do dia.
 *
 * Pedido do Elias (05/10/2026): abrir cumprimentando a pessoa e mostrando,
 * em resumo, o que importa hoje. Nada aqui é dado novo: cada número vem do
 * mesmo lugar que a tela do assunto usa (o ponto, o Meu RH), e cada cartão
 * leva para lá. Para quem decide (RH), o "Precisa de você" vem logo abaixo.
 */
import React, { useEffect, useMemo, useState } from 'react';
import {
  Clock,
  Wallet,
  CalendarDays,
  FileText,
  ArrowRight,
  Sun,
  Moon,
  CloudSun,
  Cloud,
  CloudFog,
  CloudDrizzle,
  CloudRain,
  CloudLightning,
  Droplets,
  Megaphone,
  Newspaper,
  ExternalLink,
  type LucideIcon,
} from 'lucide-react';
import { buscarPrevisao, descreverTempo, type Previsao, type IconeDoTempo } from '../servicos/tempo';
import { buscarNoticiasDaArea, type NoticiasDaArea } from '../servicos/noticiasDaArea';
import type { Noticia } from '../servicos/noticias';
import { bancoDados } from '../servicos/bancoDados';
import { Colaborador, ORDEM_MARCACOES, ROTULO_MARCACAO } from '../tipos';
import type { TelaId, TelaWeb } from '../servicos/telasPorAssunto';
import { TELA_DA_SECAO_DO_RH } from '../servicos/telasPorAssunto';
import { saudacaoDaHora, primeiroNome, dataPorExtenso, horaDeBrasilia } from '../servicos/saudacao';
import { servicoPonto, dataDeHoje, formatarSaldo, formatarDataBR } from '../servicos/ponto';
import { proximaAusenciaDe } from '../servicos/meuRH';
import { lerJustificativas, assinarJustificativas } from '../servicos/justificativasCache';
import { PainelRH } from './PainelRH';
import { CabecalhoDeSecao } from './PadraoWeb';

/** Um cartão do resumo: o que é, o número, e o toque leva à tela do assunto. */
const CartaoDoDia: React.FC<{
  id: string;
  rotulo: string;
  icone: React.ReactNode;
  valor: React.ReactNode;
  detalhe: string;
  acao: string;
  aoAbrir: () => void;
  destaque?: boolean;
}> = ({ id, rotulo, icone, valor, detalhe, acao, aoAbrir, destaque }) => (
  <button
    type="button"
    id={id}
    onClick={aoAbrir}
    className={`group text-left p-4 rounded-2xl border flex flex-col gap-3 shadow-[var(--s-1)] hover:shadow-[var(--s-2)] transition-shadow ${
      destaque
        ? 'bg-amber-500/8 border-amber-500/40 hover:border-amber-500/60'
        : 'bg-[var(--c-superficie)] border-[var(--c-borda)] hover:border-[var(--c-borda-forte)]'
    }`}
  >
    <span className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-[var(--c-texto-3)]">
      {icone}
      {rotulo}
    </span>
    <span className="text-xl font-black tracking-tight text-[var(--c-texto)]">{valor}</span>
    <span className="text-xs text-[var(--c-texto-3)] leading-snug min-h-[2rem]">{detalhe}</span>
    <span className="mt-auto inline-flex items-center gap-1 text-xs font-bold text-[var(--c-acento)] group-hover:underline">
      {acao}
      <ArrowRight className="w-3.5 h-3.5" />
    </span>
  </button>
);

const ICONE_DO_TEMPO: Record<IconeDoTempo, LucideIcon> = {
  sol: Sun,
  lua: Moon,
  parcial: CloudSun,
  nublado: Cloud,
  neblina: CloudFog,
  garoa: CloudDrizzle,
  chuva: CloudRain,
  tempestade: CloudLightning,
};

/** "Hoje, 14:32", "Ontem" ou "02/10" — quando a notícia saiu, sem conta de cabeça. */
const quandoSaiu = (iso: string): string => {
  if (!iso) return '';
  const data = new Date(iso);
  const dia = (d: Date) => d.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  const ontem = new Date(Date.now() - 86400000);
  if (dia(data) === dia(new Date()))
    return `Hoje, ${data.toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' })}`;
  if (dia(data) === dia(ontem)) return 'Ontem';
  return data.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit' });
};

/** A moldura dos blocos de "Hoje": título com ícone, o conteúdo e, se houver, o rodapé. */
const CartaoDeHoje: React.FC<{
  titulo: React.ReactNode;
  icone: React.ReactNode;
  id: string;
  children: React.ReactNode;
  rodape?: React.ReactNode;
  className?: string;
}> = ({ titulo, icone, id, children, rodape, className = '' }) => (
  <section
    id={id}
    className={`rounded-2xl border border-[var(--c-borda)] bg-[var(--c-superficie)] p-5 shadow-[var(--s-1)] flex flex-col gap-4 ${className}`}
  >
    <h3 className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-[var(--c-texto-3)]">
      {icone}
      {titulo}
    </h3>
    <div className="flex-1 flex flex-col">{children}</div>
    {rodape}
  </section>
);

/** O que aparece enquanto carrega, ou quando não deu: uma frase, no lugar do conteúdo. */
const Aviso: React.FC<{ texto: string }> = ({ texto }) => (
  <p className="my-auto py-8 text-center text-xs text-[var(--c-texto-3)] leading-relaxed px-4">{texto}</p>
);

/**
 * A IMAGEM DA MATÉRIA — a do próprio feed, servida pela agência. Sem imagem,
 * ou se ela não carregar, um fundo com o ícone: nunca o quadrado quebrado
 * do navegador no meio da tela de abertura.
 */
const ImagemDaNoticia: React.FC<{ noticia: Noticia; className: string }> = ({ noticia, className }) => {
  const [falhou, setFalhou] = useState(false);
  if (!noticia.imagem || falhou) {
    return (
      <span className={`${className} flex items-center justify-center bg-[var(--c-acento-suave)] text-[var(--c-acento)]`}>
        <Newspaper className="w-7 h-7 opacity-70" />
      </span>
    );
  }
  return (
    <img
      src={noticia.imagem}
      alt=""
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setFalhou(true)}
      className={`${className} object-cover bg-[var(--c-superficie-2)]`}
    />
  );
};

/** O selo da matéria: da área da pessoa, ou a de economia que completa o bloco. */
const SeloDaNoticia: React.FC<{ noticia: Noticia; area: string }> = ({ noticia, area }) => (
  <span
    className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
      noticia.daSuaArea
        ? 'bg-[var(--c-acento-suave)] text-[var(--c-acento)]'
        : 'bg-[var(--c-superficie-2)] text-[var(--c-texto-3)]'
    }`}
  >
    {noticia.daSuaArea ? area : 'Economia'}
  </span>
);

/**
 * A notícia em destaque: a imagem grande, o título, o resumo e o caminho
 * para a matéria. SOZINHA no bloco, ela deita — imagem ao lado do texto —
 * para não virar uma foto da largura da tela.
 */
const NoticiaEmDestaque: React.FC<{ noticia: Noticia; area: string; sozinha?: boolean }> = ({
  noticia,
  area,
  sozinha,
}) => (
  <a
    href={noticia.link}
    target="_blank"
    rel="noopener noreferrer"
    id="inicio-noticia-destaque"
    className={`group rounded-xl overflow-hidden border border-[var(--c-borda)] bg-[var(--c-superficie)] hover:shadow-[var(--s-2)] transition-shadow ${
      sozinha ? 'grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]' : 'flex flex-col'
    }`}
  >
    <ImagemDaNoticia noticia={noticia} className={sozinha ? 'w-full aspect-[16/9] md:aspect-auto md:h-full md:min-h-[240px]' : 'w-full aspect-[16/9]'} />
    <span className={`flex flex-col gap-2 flex-1 ${sozinha ? 'p-5 justify-center' : 'p-4'}`}>
      <span className="flex items-center gap-2">
        <SeloDaNoticia noticia={noticia} area={area} />
        <span className="text-[11px] text-[var(--c-texto-3)]">{quandoSaiu(noticia.publicadaEm)}</span>
      </span>
      <span className="text-base font-extrabold leading-snug text-[var(--c-texto)] line-clamp-2 group-hover:text-[var(--c-acento)] transition-colors">
        {noticia.titulo}
      </span>
      <span className="text-xs leading-relaxed text-[var(--c-texto-2)] line-clamp-3">{noticia.resumo}</span>
      <span className="mt-auto pt-1 inline-flex items-center gap-1 text-xs font-bold text-[var(--c-acento)]">
        Ler a matéria
        <ExternalLink className="w-3.5 h-3.5" />
      </span>
    </span>
  </a>
);

/** As outras: a miniatura ao lado, o título e o começo do resumo. */
const NoticiaCompacta: React.FC<{ noticia: Noticia; area: string }> = ({ noticia, area }) => (
  <a
    href={noticia.link}
    target="_blank"
    rel="noopener noreferrer"
    className="group flex gap-3 p-2 -mx-2 rounded-xl hover:bg-[var(--c-superficie-2)] transition-colors"
  >
    <ImagemDaNoticia noticia={noticia} className="w-28 h-20 flex-shrink-0 rounded-lg" />
    <span className="min-w-0 flex flex-col gap-1">
      <span className="flex items-center gap-2">
        <SeloDaNoticia noticia={noticia} area={area} />
        <span className="text-[10px] text-[var(--c-texto-3)] truncate">{quandoSaiu(noticia.publicadaEm)}</span>
      </span>
      <span className="text-sm font-bold leading-snug text-[var(--c-texto)] line-clamp-2 group-hover:text-[var(--c-acento)] transition-colors">
        {noticia.titulo}
      </span>
      <span className="text-[11px] leading-snug text-[var(--c-texto-3)] line-clamp-2">{noticia.resumo}</span>
    </span>
  </a>
);

export const InicioWeb: React.FC<{
  colaboradorAtual: Colaborador;
  /** As telas da pessoa: cada cartão só aparece se a tela dele existir para ela. */
  visiveis: Set<TelaId>;
  /** Holerite e espelho para assinar, advertência sem ciência (`pendenciasDoMeuRH`). */
  pendenciasDoMeuRH: number;
  aoIrPara: (tela: TelaWeb) => void;
  /** Abre um comunicado da Central (o mesmo caminho do aviso). */
  aoAbrirPublicacao: (id: string) => void;
}> = ({ colaboradorAtual, visiveis, pendenciasDoMeuRH, aoIrPara, aoAbrirPublicacao }) => {
  const eu = colaboradorAtual;
  const hoje = dataDeHoje();
  const agora = new Date();

  // O tempo e as notícias de fora: chegam depois, e a tela não espera por eles
  const [previsao, setPrevisao] = useState<Previsao | null | 'carregando'>('carregando');
  const [deFora, setDeFora] = useState<NoticiasDaArea | null | 'carregando'>('carregando');
  useEffect(() => {
    let vivo = true;
    buscarPrevisao(eu.loja).then((p) => vivo && setPrevisao(p));
    buscarNoticiasDaArea(eu.setor).then((n) => vivo && setDeFora(n));
    return () => {
      vivo = false;
    };
  }, [eu.loja, eu.setor]);

  /** Os comunicados da Central para esta pessoa: os três mais novos. */
  const daEmpresa = useMemo(
    () =>
      [...bancoDados.obterAvisosVisiveisParaUsuarioAtual()]
        .sort((a, b) => b.criadoEm.localeCompare(a.criadoEm))
        .slice(0, 3),
    [eu.id]
  );

  // O ponto e as ausências mudam com a tela aberta: o resumo acompanha
  const [versao, setVersao] = useState(0);
  useEffect(() => servicoPonto.assinarAlteracoes(() => setVersao((v) => v + 1)), []);
  useEffect(() => assinarJustificativas(() => setVersao((v) => v + 1)), []);

  const dia = useMemo(() => {
    void versao;
    const jornada = servicoPonto.obterJornadaDoDia(eu.id, hoje);
    const batidas = ORDEM_MARCACOES.filter((t) => jornada.marcacoes[t]).map(
      (t) => `${jornada.marcacoes[t]!.horaFormatada}`
    );
    return {
      batidas,
      proxima: servicoPonto.obterProximaMarcacao(eu.id, hoje),
      saldo: servicoPonto.obterSaldoAcumulado(eu.id),
      proximaAusencia: proximaAusenciaDe(lerJustificativas(), eu.id, hoje),
    };
  }, [eu.id, hoje, versao]);

  const temPonto = visiveis.has('meu_ponto');
  const ausencia = dia.proximaAusencia;

  const noticias = deFora && deFora !== 'carregando' ? deFora.noticias : [];
  const [destaque, ...outras] = noticias;
  const area = deFora && deFora !== 'carregando' ? deFora.area : '';

  return (
    <div className="flex flex-col px-6 pt-8 pb-6 gap-8">
      {/* A SAUDAÇÃO */}
      <header>
        <p className="text-sm font-semibold text-[var(--c-acento)]">{dataPorExtenso(agora)}</p>
        <h1 id="saudacao-inicio" className="mt-1 text-3xl font-extrabold tracking-tight text-[var(--c-texto)]">
          {saudacaoDaHora(horaDeBrasilia(agora))}, {primeiroNome(eu.nome)}
        </h1>
        <p className="mt-1.5 text-sm text-[var(--c-texto-3)]">Aqui está o que importa para você hoje.</p>
      </header>

      {/*
        HOJE, LOGO ABAIXO DA SAUDAÇÃO (Elias, 06/10/2026): as notícias em
        cartões com a imagem e o resumo da matéria — e não uma lista de
        manchetes —, e ao lado o tempo e os comunicados da empresa.
      */}
      <section aria-label="Hoje" className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_340px] gap-5 items-start">
        {/* AS NOTÍCIAS — Agência Brasil, com o crédito e o link de cada matéria */}
        <CartaoDeHoje
          id="inicio-area"
          titulo={
            <>
              Notícias
              {deFora && deFora !== 'carregando' && deFora.daArea && (
                <span className="normal-case tracking-normal font-semibold text-[var(--c-texto-3)]">· {deFora.area}</span>
              )}
            </>
          }
          icone={<Newspaper className="w-3.5 h-3.5" />}
          rodape={
            deFora && deFora !== 'carregando' && noticias.length > 0 ? (
              <span className="text-[10px] text-[var(--c-texto-3)]">
                Fonte: {deFora.fonte} · as matérias abrem no site da agência
              </span>
            ) : undefined
          }
        >
          {deFora === 'carregando' ? (
            <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] gap-5 animate-pulse" aria-hidden>
              <div className="rounded-xl bg-[var(--c-superficie-2)] aspect-[16/11]" />
              <div className="flex flex-col gap-4">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="flex gap-3">
                    <div className="w-28 h-20 rounded-lg bg-[var(--c-superficie-2)]" />
                    <div className="flex-1 flex flex-col gap-2 pt-1">
                      <div className="h-3 rounded bg-[var(--c-superficie-2)] w-1/3" />
                      <div className="h-3 rounded bg-[var(--c-superficie-2)]" />
                      <div className="h-3 rounded bg-[var(--c-superficie-2)] w-4/5" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : !destaque ? (
            <Aviso texto="As notícias não chegaram agora. Elas voltam na próxima vez que você abrir o Início." />
          ) : (
            <div
              className={`grid grid-cols-1 gap-5 ${outras.length ? 'lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]' : ''}`}
            >
              <NoticiaEmDestaque noticia={destaque} area={area} sozinha={outras.length === 0} />
              {outras.length > 0 && (
                <div className="flex flex-col gap-2">
                  {outras.slice(0, 3).map((n) => (
                    <NoticiaCompacta key={n.link} noticia={n} area={area} />
                  ))}
                </div>
              )}
            </div>
          )}
        </CartaoDeHoje>

        <div className="flex flex-col gap-5">
          {/* O TEMPO na cidade da loja */}
          <section
            id="inicio-tempo"
            className="rounded-2xl border border-[var(--c-borda)] p-5 shadow-[var(--s-1)] bg-gradient-to-br from-[var(--c-acento-suave)] to-[var(--c-superficie)]"
          >
            <h3 className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-[var(--c-texto-3)]">
              <Sun className="w-3.5 h-3.5" />
              Tempo{previsao && previsao !== 'carregando' ? ` · ${previsao.cidade}` : ''}
            </h3>
            {previsao === 'carregando' ? (
              <Aviso texto="Buscando a previsão…" />
            ) : !previsao ? (
              <Aviso texto="A previsão não chegou agora. Ela volta na próxima vez que você abrir o Início." />
            ) : (
              (() => {
                const clima = descreverTempo(previsao.codigo, previsao.ehDia);
                const Icone = ICONE_DO_TEMPO[clima.icone];
                return (
                  <div className="mt-4 flex flex-col gap-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <span className="block text-5xl font-extrabold tracking-tight text-[var(--c-texto)] tabular-nums leading-none">
                          {previsao.agora}°
                        </span>
                        <span className="mt-2 block text-sm font-semibold text-[var(--c-texto-2)]">{clima.texto}</span>
                      </div>
                      <Icone className="w-14 h-14 text-[var(--c-acento)] flex-shrink-0" strokeWidth={1.5} />
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-center tabular-nums">
                      {[
                        ['Máxima', `${previsao.maxima}°`],
                        ['Mínima', `${previsao.minima}°`],
                        ['Chuva', `${previsao.chuva}%`],
                      ].map(([rotulo, valor]) => (
                        <span key={rotulo} className="rounded-xl bg-[var(--c-superficie)]/80 border border-[var(--c-borda)] px-2 py-2">
                          <span className="block text-[10px] font-bold uppercase tracking-wider text-[var(--c-texto-3)]">
                            {rotulo === 'Chuva' ? (
                              <span className="inline-flex items-center gap-0.5">
                                <Droplets className="w-3 h-3" />
                                {rotulo}
                              </span>
                            ) : (
                              rotulo
                            )}
                          </span>
                          <span className="block mt-0.5 text-sm font-extrabold text-[var(--c-texto)]">{valor}</span>
                        </span>
                      ))}
                    </div>
                  </div>
                );
              })()
            )}
          </section>

          {/* DA EMPRESA — a Central */}
          <CartaoDeHoje
            id="inicio-empresa"
            titulo="Da empresa"
            icone={<Megaphone className="w-3.5 h-3.5" />}
            rodape={
              <button
                type="button"
                onClick={() => aoIrPara('central')}
                className="self-start inline-flex items-center gap-1 text-xs font-bold text-[var(--c-acento)] hover:underline"
              >
                Abrir a Central
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            }
          >
            {daEmpresa.length === 0 ? (
              <Aviso texto="Nenhum comunicado ainda. O que a direção publicar para você aparece aqui." />
            ) : (
              <ul className="flex flex-col divide-y divide-[var(--c-borda)] -mx-1">
                {daEmpresa.map((p) => {
                  const naoLido = !(p.lidoPorIds || []).includes(eu.id);
                  return (
                    <li key={p.id}>
                      <button
                        type="button"
                        onClick={() => aoAbrirPublicacao(p.id)}
                        className="w-full text-left px-1 py-2.5 flex gap-2.5 rounded-lg hover:bg-[var(--c-superficie-2)]"
                      >
                        <span
                          aria-label={naoLido ? 'Não lido' : undefined}
                          className={`mt-1.5 w-2 h-2 rounded-full flex-shrink-0 ${naoLido ? 'bg-[var(--c-acento)]' : 'bg-transparent'}`}
                        />
                        <span className="min-w-0">
                          <span
                            className={`block text-sm leading-snug text-[var(--c-texto)] line-clamp-2 ${naoLido ? 'font-bold' : 'font-medium'}`}
                          >
                            {p.titulo}
                          </span>
                          <span className="block text-[11px] text-[var(--c-texto-3)] mt-0.5">
                            {quandoSaiu(p.criadoEm)} · {p.autorNome}
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </CartaoDeHoje>
        </div>
      </section>

      {/* SEU DIA — o resumo; cada cartão leva à tela do assunto */}
      <section aria-label="Seu dia" className="flex flex-col gap-4">
        <CabecalhoDeSecao
          rotulo="Para você"
          titulo="Seu dia"
          descricao="O ponto, o banco de horas, a próxima folga e os documentos — cada cartão abre a tela do assunto."
        />
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {temPonto && (
            <CartaoDoDia
              id="inicio-ponto"
              rotulo="Ponto de hoje"
              icone={<Clock className="w-3.5 h-3.5" />}
              valor={dia.batidas.length ? dia.batidas.join(' · ') : 'Nenhuma batida'}
              detalhe={
                dia.proxima ? `Próxima: ${ROTULO_MARCACAO[dia.proxima].toLowerCase()}` : 'Jornada de hoje completa'
              }
              acao={dia.proxima ? 'Bater ponto' : 'Ver o ponto'}
              aoAbrir={() => aoIrPara('meu_ponto')}
            />
          )}
          {temPonto && (
            <CartaoDoDia
              id="inicio-banco"
              rotulo="Banco de horas"
              icone={<Wallet className="w-3.5 h-3.5" />}
              valor={
                <span className={dia.saldo < 0 ? 'text-red-600' : 'text-[var(--c-ok)]'}>{formatarSaldo(dia.saldo)}</span>
              }
              detalhe={dia.saldo >= 0 ? 'Horas a seu favor' : 'Horas a compensar'}
              acao="Ver o espelho"
              aoAbrir={() => aoIrPara(visiveis.has('meu_espelho') ? 'meu_espelho' : 'meu_ponto')}
            />
          )}
          <CartaoDoDia
            id="inicio-ausencia"
            rotulo="Próxima folga ou férias"
            icone={<CalendarDays className="w-3.5 h-3.5" />}
            valor={ausencia ? formatarDataBR(ausencia.dataInicio) : 'Nada marcado'}
            detalhe={
              ausencia
                ? `${ausencia.tipo === 'ferias' ? `Férias até ${formatarDataBR(ausencia.dataFim)}` : 'Folga de sábado'}${
                    ausencia.estado === 'pendente' ? ' · em análise' : ''
                  }`
                : 'Folgas e férias aprovadas aparecem aqui'
            }
            acao={visiveis.has('pedir_ausencia') ? 'Minhas solicitações' : 'Ver férias'}
            aoAbrir={() => aoIrPara(visiveis.has('pedir_ausencia') ? 'pedir_ausencia' : 'minhas_ausencias')}
          />
          <CartaoDoDia
            id="inicio-documentos"
            rotulo="Meus documentos"
            icone={<FileText className="w-3.5 h-3.5" />}
            valor={pendenciasDoMeuRH ? `${pendenciasDoMeuRH} para você` : 'Tudo em dia'}
            detalhe={
              pendenciasDoMeuRH
                ? 'Holerite ou espelho para assinar, ou documento para dar ciência'
                : 'Holerites e documentos do RH ficam aqui'
            }
            acao="Abrir documentos"
            destaque={pendenciasDoMeuRH > 0}
            aoAbrir={() => aoIrPara('meus_documentos')}
          />
        </div>
      </section>

      {/* Para o RH: o que espera uma decisão dele, com o atalho para onde se resolve */}
      {visiveis.has('painel_rh') && (
        <div className="-mx-6 -mb-6">
          <PainelRH
            colaboradorAtual={eu}
            secaoFixa="painel"
            aoAbrirSecao={(secao) => aoIrPara(TELA_DA_SECAO_DO_RH[secao] || 'inicio')}
          />
        </div>
      )}
    </div>
  );
};
