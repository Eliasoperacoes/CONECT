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
import { bancoDados } from '../servicos/bancoDados';
import { Colaborador, ORDEM_MARCACOES, ROTULO_MARCACAO } from '../tipos';
import type { TelaId, TelaWeb } from '../servicos/telasPorAssunto';
import { TELA_DA_SECAO_DO_RH } from '../servicos/telasPorAssunto';
import { saudacaoDaHora, primeiroNome, dataPorExtenso, horaDeBrasilia } from '../servicos/saudacao';
import { servicoPonto, dataDeHoje, formatarSaldo, formatarDataBR } from '../servicos/ponto';
import { proximaAusenciaDe } from '../servicos/meuRH';
import { lerJustificativas, assinarJustificativas } from '../servicos/justificativasCache';
import { PainelRH } from './PainelRH';

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
    className={`group text-left p-4 rounded-2xl border flex flex-col gap-3 transition-colors ${
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

/** A moldura dos cartões de "Hoje": título com ícone, e o conteúdo. */
const CartaoDeHoje: React.FC<{ titulo: string; icone: React.ReactNode; id: string; children: React.ReactNode; rodape?: React.ReactNode }> = ({
  titulo,
  icone,
  id,
  children,
  rodape,
}) => (
  <section id={id} className="rounded-2xl border border-[var(--c-borda)] bg-[var(--c-superficie)] p-4 flex flex-col gap-3 min-h-[220px]">
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
  <p className="my-auto text-center text-xs text-[var(--c-texto-3)] leading-relaxed px-4">{texto}</p>
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

  return (
    <div className="flex flex-col">
      <section className="px-6 pt-6">
        <p className="text-sm font-semibold text-[var(--c-acento)]">{dataPorExtenso(agora)}</p>
        <h2 id="saudacao-inicio" className="mt-1 text-2xl font-black tracking-tight text-[var(--c-texto)]">
          {saudacaoDaHora(horaDeBrasilia(agora))}, {primeiroNome(eu.nome)}
        </h2>
        <p className="mt-1 text-sm text-[var(--c-texto-3)]">Aqui está o que importa para você hoje.</p>
      </section>

      {/* MEU DIA — o resumo; cada cartão leva à tela do assunto */}
      <section aria-label="Meu dia" className="px-6 pt-5 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
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
      </section>

      {/*
        Para o RH: o que espera uma decisão dele, com o atalho para onde se
        resolve. ANTES de "Hoje": o que pede decisão vem antes do que é só
        leitura — lá embaixo, o RH rolava por tempo e notícia até achar.
      */}
      {visiveis.has('painel_rh') && (
        <PainelRH
          colaboradorAtual={eu}
          secaoFixa="painel"
          aoAbrirSecao={(secao) => aoIrPara(TELA_DA_SECAO_DO_RH[secao] || 'inicio')}
        />
      )}

      {/*
        HOJE — o que é do dia, além do trabalho (Elias: "tempo, notícias…"):
        a previsão na cidade da loja, os comunicados da empresa e as
        notícias da área da pessoa, cada um no seu cartão.
      */}
      <section aria-label="Hoje" className="px-6 pt-6">
        <h2 className="text-sm font-bold text-[var(--c-texto)]">Hoje</h2>
        <p className="text-xs text-[var(--c-texto-3)]">O tempo, a empresa e a sua área.</p>
        <div className="mt-3 grid grid-cols-1 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.3fr)_minmax(0,1.3fr)] gap-3">
          {/* O TEMPO */}
          <CartaoDeHoje id="inicio-tempo" titulo="Tempo" icone={<Sun className="w-3.5 h-3.5" />}>
            {previsao === 'carregando' ? (
              <Aviso texto="Buscando a previsão…" />
            ) : !previsao ? (
              <Aviso texto="A previsão não chegou agora. Ela volta na próxima vez que você abrir o Início." />
            ) : (
              (() => {
                const clima = descreverTempo(previsao.codigo, previsao.ehDia);
                const Icone = ICONE_DO_TEMPO[clima.icone];
                return (
                  <div className="flex flex-col gap-3">
                    <span className="text-xs font-semibold text-[var(--c-texto-2)]">{previsao.cidade}</span>
                    <div className="flex items-center gap-3">
                      <Icone className="w-10 h-10 text-[var(--c-acento)]" />
                      <span className="text-4xl font-black tracking-tight text-[var(--c-texto)] tabular-nums">
                        {previsao.agora}°
                      </span>
                    </div>
                    <span className="text-sm font-semibold text-[var(--c-texto)]">{clima.texto}</span>
                    <div className="flex items-center gap-3 text-xs text-[var(--c-texto-3)] tabular-nums">
                      <span>
                        Máx <strong className="text-[var(--c-texto-2)]">{previsao.maxima}°</strong>
                      </span>
                      <span>
                        Mín <strong className="text-[var(--c-texto-2)]">{previsao.minima}°</strong>
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <Droplets className="w-3.5 h-3.5" />
                        {previsao.chuva}% de chuva
                      </span>
                    </div>
                  </div>
                );
              })()
            )}
          </CartaoDeHoje>

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
                          <span className={`block text-sm leading-snug text-[var(--c-texto)] line-clamp-2 ${naoLido ? 'font-bold' : 'font-medium'}`}>
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

          {/* DA SUA ÁREA — Agência Brasil, com o crédito e o link de cada matéria */}
          <CartaoDeHoje
            id="inicio-area"
            titulo={deFora && deFora !== 'carregando' && deFora.daArea ? deFora.area : 'Notícias'}
            icone={<Newspaper className="w-3.5 h-3.5" />}
            rodape={
              deFora && deFora !== 'carregando' ? (
                <span className="text-[10px] text-[var(--c-texto-3)]">
                  Fonte: {deFora.fonte}
                  {!deFora.daArea && ' · nada da sua área hoje, as de economia'}
                </span>
              ) : undefined
            }
          >
            {deFora === 'carregando' ? (
              <Aviso texto="Buscando as notícias…" />
            ) : !deFora || deFora.noticias.length === 0 ? (
              <Aviso texto="As notícias não chegaram agora. Elas voltam na próxima vez que você abrir o Início." />
            ) : (
              <ul className="flex flex-col divide-y divide-[var(--c-borda)] -mx-1">
                {deFora.noticias.slice(0, 3).map((n) => (
                  <li key={n.link}>
                    <a
                      href={n.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="group px-1 py-2.5 flex gap-2.5 rounded-lg hover:bg-[var(--c-superficie-2)]"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium leading-snug text-[var(--c-texto)] line-clamp-2 group-hover:underline">
                          {n.titulo}
                        </span>
                        <span className="block text-[11px] text-[var(--c-texto-3)] mt-0.5">{quandoSaiu(n.publicadaEm)}</span>
                      </span>
                      <ExternalLink className="w-3.5 h-3.5 mt-1 text-[var(--c-texto-3)] flex-shrink-0" />
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </CartaoDeHoje>
        </div>
      </section>

    </div>
  );
};
