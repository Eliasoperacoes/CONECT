import { TituloDaPagina } from './TituloDaPagina';
import { AbasRolaveis, type AbaRolavel } from './AbasRolaveis';
import React, { useState, useEffect, useMemo } from 'react';
import {
  Building2,
  Users,
  Megaphone,
  ArrowRight,
  TrendingUp,
  Activity,
  CheckCircle,
  CheckCircle2,
  MapPin,
  PhoneCall,
  ShieldAlert,
  Clock,
  Network,
  ClipboardList,
  QrCode,
  MessageSquare,
  Briefcase,
} from 'lucide-react';
import {
  Colaborador,
  Loja,
  Setor,
  INFORMACOES_LOJAS,
  cuidaDePessoas,
  ehDoRh,
} from '../tipos';
import { podeUsar } from '../servicos/permissoes';
import { acessoDe } from '../servicos/telasPorAssunto';
import { pendenciasParaDecidir as pendenciasDeAusencia } from '../servicos/justificativas';
import { pendenciasDeFolga } from '../servicos/justificativas';
import { bancoDados } from '../servicos/bancoDados';
import { manterSeIgual } from '../servicos/igualdade';
import { ondeParei, lembrarOndeParei } from '../servicos/navegacaoLembrada';
import { servicoPonto } from '../servicos/ponto';
import { PainelRH } from './PainelRH';
import { SeparacaoPorSetor } from './SeparacaoPorSetor';
import { AprovacaoJornada } from './AprovacaoJornada';
import { Organograma } from './Organograma';
import { PainelGestao } from './PainelGestao';
import type { SecaoDestino } from '../servicos/centralDeNotificacoes';

interface PropsPainelRede {
  colaboradorAtual: Colaborador;
  aoAbrirConversa: (conversaId: string) => void;
  aoAlternarParaGestor?: () => void;
  /**
   * A seção que o sino pediu. Aqui ela só atravessa: as duas moram dentro
   * de "Equipe & Ponto", então este painel abre a sub-aba e entrega o
   * resto para quem sabe o que fazer com ela.
   */
  secaoAlvo?: SecaoDestino | null;
  aoConsumirSecao?: () => void;
}

/**
 * Em lista, porque `ondeParei` confere o que leu do aparelho contra o
 * que existe HOJE — sub-aba removida ou escrita à mão no console cai no
 * padrão em vez de deixar a tela em branco.
 */
const SUB_ABAS = [
  'visao_geral',
  'gestao',
  'rh',
  'organograma',
  'aprovacoes',
] as const;

type SubAbaPainel = (typeof SUB_ABAS)[number];

/**
 * O NOME DE CADA ABA NA FAIXA — curto, para caber sem quebrar.
 * "Visão & Lojas" virou "Lojas"; "Recursos Humanos", "RH".
 */
const ROTULO_SUBABA: Record<SubAbaPainel, (pendencias: number) => AbaRolavel<SubAbaPainel>> = {
  rh: () => ({ id: 'rh', rotulo: 'RH', icone: <Briefcase />, domId: 'subaba-rh' }),
  visao_geral: () => ({ id: 'visao_geral', rotulo: 'Lojas', icone: <Building2 />, domId: 'subaba-visao-geral' }),
  gestao: (pendencias) => ({
    id: 'gestao',
    rotulo: 'Equipe e ponto',
    icone: <ClipboardList />,
    contador: pendencias,
    domId: 'subaba-gestao',
  }),
  organograma: () => ({ id: 'organograma', rotulo: 'Organograma', icone: <Network />, domId: 'subaba-organograma' }),
  aprovacoes: () => ({ id: 'aprovacoes', rotulo: 'Aprovações' }),
};

export const PainelRede: React.FC<PropsPainelRede> = ({
  colaboradorAtual,
  aoAbrirConversa,
  aoAlternarParaGestor,
  secaoAlvo,
  aoConsumirSecao,
}) => {
  /** Volta para a sub-aba onde a pessoa parou, e não para a visão geral. */
  const [subAbaEscolhida, setSubAbaAtiva] = useState<SubAbaPainel>(() =>
    ondeParei(colaboradorAtual.id, 'rede', SUB_ABAS, 'visao_geral')
  );
  const [estatisticas, setEstatisticas] = useState(bancoDados.obterEstatisticasRede());

  /**
   * O MESMO CUIDADO DO APP: só trocar o que mudou de verdade.
   *
   * `obterEstatisticasRede()` monta um objeto novo a cada chamada, e
   * isto roda a cada notificação do banco. Com o objeto novo, este
   * painel e tudo dentro dele redesenhavam sozinhos várias vezes por
   * minuto — e um redesenho entre o `mousedown` e o `mouseup` engole o
   * clique, que foi como o defeito apareceu: "a aba não pega de
   * primeira".
   */
  const atualizar = () => {
    setEstatisticas((anterior) =>
      manterSeIgual(anterior, bancoDados.obterEstatisticasRede())
    );
  };

  useEffect(() => {
    atualizar();
    const cancelar = bancoDados.assinarAlteracoes(atualizar);
    return () => cancelar();
  }, []);

  /**
   * Unidades com equipe primeiro e, dentro disso, as maiores antes. As lojas
   * ainda sem ninguém cadastrado vão para o fim, para que a leitura comece
   * pelo que está em operação em vez de por cartões vazios.
   */
  const unidadesOrdenadas = useMemo(() => {
    return [...INFORMACOES_LOJAS].sort((a, b) => {
      const totalA = estatisticas.porLoja[a.nome]?.total || 0;
      const totalB = estatisticas.porLoja[b.nome]?.total || 0;
      if (totalA === 0 && totalB > 0) return 1;
      if (totalB === 0 && totalA > 0) return -1;
      if (totalA !== totalB) return totalB - totalA;
      return a.nome.localeCompare(b.nome);
    });
  }, [estatisticas]);

  /** Banco de horas e QR do ponto: só RH e Administrador. */
  const podeVerBancoDeHoras = servicoPonto.podeAcessarPainelRH(colaboradorAtual);

  /**
   * Quantas decisões esperam por mim — jornada E ausência.
   *
   * Somadas de propósito: são a mesma fila para quem decide, e separar o
   * contador faria a menor das duas passar despercebida.
   */
  const pendenciasParaDecidir =
    servicoPonto.obterPendenciasParaDecidir().length +
    pendenciasDeAusencia().length +
    pendenciasDeFolga().length;

  /** Tamanho da alçada de quem abriu, para o subtítulo dizer a verdade. */
  const equipeDeQuemAbre = servicoPonto.obterColaboradoresVisiveis().length;

  /** Aba de equipe vazia não é permissão, é ruído: só aparece com equipe. */
  const temEquipe = equipeDeQuemAbre > 1;

  /**
   * As abas que esta pessoa realmente tem, na ordem em que aparecem.
   *
   * Existe porque a aba guardada no estado pode não ser permitida: o padrão
   * é "Visão & Lojas", que o gerente não enxerga mais. Sem isto ele abriria
   * o painel numa tela em branco, sem nada clicável e sem explicação.
   */
  /**
   * Declarado AQUI, e não mais embaixo.
   *
   * Ele é lido pelo `useMemo` logo abaixo. Estando declarado depois, o
   * TypeScript aceitava — a leitura está dentro de uma função — mas essa
   * função roda no PRIMEIRO RENDER, e aí é uma variável usada antes de
   * existir. Tela branca, sem erro em tempo de compilação.
   */
  const cuidaDeRh = cuidaDePessoas(colaboradorAtual);

  /**
   * Quem é do RH tem TRÊS abas: a dele, Visão & Lojas e Avisos.
   *
   * Organograma e Equipe & Ponto não são trabalho dele — e a tela de RH já
   * reúne o que ele abre todo dia. Repare que isto NÃO usa
   * `cuidaDePessoas`: essa função também vale para Diretoria e TI, e
   * amarrar aqui tiraria o organograma do Administrador, que é justamente
   * quem posiciona as pessoas nele.
   */
  const souDoRh = ehDoRh(colaboradorAtual);

  /**
   * O PAINEL DO RH TEM TRÊS ABAS, E A DELE VEM PRIMEIRO.
   *
   * Quem é do RH não monta organograma nem acompanha equipe — o trabalho
   * dele está reunido na tela de RH, e as duas outras abas seriam ruído
   * ocupando o lugar do que ele abre todo dia.
   *
   * É pelo SETOR, e não por `cuidaDePessoas`: essa função também vale para
   * Diretoria e TI, e amarrar aqui tiraria o organograma do Administrador
   * — que é justamente quem posiciona as pessoas nele.
   */
  /** A pergunta ao catálogo, com a pessoa de agora. */
  const pode = (chave: string) => podeUsar(chave, colaboradorAtual);

  const abasPermitidas = useMemo(() => {
    /*
      AS CONDIÇÕES MORAM EM `acessoDe` (telasPorAssunto.ts), a mesma
      resposta que a barra lateral do computador usa — reorganizar por
      assunto não pode mudar quem vê o quê. Lá estão os porquês: "Visão &
      Lojas" e o organograma não são do RH; "Equipe & Ponto" reúne equipe,
      banco de horas da rede e cartaz de QR.
    */
    const acesso = acessoDe(colaboradorAtual, { pode, temEquipe, batePonto: false });
    const lista: SubAbaPainel[] = [];
    if (acesso.rh) lista.push('rh');
    if (acesso.unidades) lista.push('visao_geral');
    if (acesso.gestao) lista.push('gestao');
    if (acesso.organograma) lista.push('organograma');
    return lista;
  }, [colaboradorAtual, temEquipe, podeVerBancoDeHoras, cuidaDeRh]);

  /**
   * A aba que vale. Nunca uma que a pessoa não tenha — nem por estado
   * antigo, nem por permissão retirada com a tela aberta.
   */
  const subAbaAtiva: SubAbaPainel =
    abasPermitidas.includes(subAbaEscolhida) ? subAbaEscolhida : abasPermitidas[0];

  /**
   * Guarda a que VALE, não a que foi escolhida.
   *
   * Se a pessoa perdeu a permissão de uma sub-aba, gravar a escolhida a
   * faria cair no desvio a cada recarga, para sempre.
   */
  useEffect(() => {
    if (subAbaAtiva) lembrarOndeParei(colaboradorAtual.id, 'rede', subAbaAtiva);
  }, [colaboradorAtual.id, subAbaAtiva]);

  /**
   * Leva o alvo do sino até "Equipe & Ponto".
   *
   * As duas seções que o sino aponta — aprovar jornadas e escala de
   * folgas — são abas do `PainelGestao`, que só existe dentro desta
   * sub-aba. Então aqui a conta é uma só: abrir a porta. Quem escolhe a
   * aba lá dentro é ele, que é onde a permissão de cada uma é conhecida.
   *
   * Quem não alcança "Equipe & Ponto" consome o alvo aqui mesmo. Sem
   * isso, o pedido ficaria pendurado no App para sempre, e a próxima
   * notificação tocada não teria efeito nenhum — o estado nunca voltaria
   * a mudar.
   */
  useEffect(() => {
    if (!secaoAlvo) return;

    if (abasPermitidas.includes('gestao')) {
      setSubAbaAtiva('gestao');
      return; // O PainelGestao consome quando chegar na aba
    }

    aoConsumirSecao?.();
  }, [secaoAlvo, abasPermitidas, aoConsumirSecao]);

  /**
   * Painel de gestão: quem responde por alguém. Líder de setor e gerente
   * acompanham a própria equipe; RH, Diretoria e TI veem a rede — para eles
   * é o mesmo alcance do painel de RH, só que organizado por pessoa.
   */

  /**
   * Quem enxerga o quê vem do painel de Permissões, não de regra escrita
   * aqui. Antes cada aba tinha o próprio `nivel >= N`, e mudar quem via o
   * quê exigia mexer no código de cada componente.
   *
   * "Minha Equipe" ainda exige ter equipe: uma aba vazia não é permissão,
   * é ruído.
   */
  /*
    Quem vê "Equipe & Ponto" — inclusive o gerente sem equipe cadastrada,
    que ainda precisa do cartaz de QR da loja — é `acessoDe(...).gestao`,
    em telasPorAssunto.ts.
  */

  /**
   * O painel muda de nome conforme quem abre.
   *
   * Para o gerente ele é o painel da GERÊNCIA dele, não "Recursos Humanos &
   * Rede" — o nome sugeria acesso à rede inteira e a alçada dele é a
   * equipe.
   */
  const tituloDoPainel = cuidaDeRh ? 'Recursos Humanos & Rede' : 'Gerência';
  const subtituloDoPainel = cuidaDeRh
    ? `${estatisticas.totalColaboradores} ${
        estatisticas.totalColaboradores === 1 ? 'colaborador' : 'colaboradores'
      } em ${estatisticas.totalLojasComEquipe} ${
        estatisticas.totalLojasComEquipe === 1 ? 'unidade' : 'unidades'
      } · Mensagens e voz`
    : `${colaboradorAtual.loja} · ${Math.max(equipeDeQuemAbre - 1, 0)} ${
        equipeDeQuemAbre - 1 === 1 ? 'pessoa' : 'pessoas'
      } sob sua responsabilidade`;

  const lidarIniciarConversaColega = (colegaId: string) => {
    const conversa = bancoDados.obterOuCriarConversaIndividual(colegaId);
    aoAbrirConversa(conversa.id);
  };

  return (
    <div className="w-full h-full flex flex-col bg-[var(--c-canvas)] overflow-y-auto pb-24">
      {/*
        O TOPO DO GERENCIAR — pedido do Elias: "layout estourado, texto
        empilhado". Era um cabeçalho grande com as abas num contêiner que
        quebrava "Visão & Lojas" em três linhas. Agora: o título numa linha,
        e as abas numa faixa que desliza, fixa no alto enquanto a tela rola.

        As abas saem de `abasPermitidas` — a mesma lista que decide qual
        aba vale. Botões escritos um a um, cada um com a própria condição,
        eram como uma aba aparecia sem estar liberada e "caía fora" no
        clique seguinte.
      */}
      <header className="bg-[var(--c-superficie)] flex-shrink-0">
        <div className="px-4 pt-4 pb-1 md:px-6 md:pt-6 max-w-7xl mx-auto w-full">
          <TituloDaPagina titulo={tituloDoPainel} subtitulo={subtituloDoPainel} />
        </div>
      </header>
      <div className="sticky top-0 z-20 bg-[var(--c-superficie)] border-b border-[var(--c-borda)] flex-shrink-0">
        <div className="max-w-7xl mx-auto w-full">
          <AbasRolaveis
            className="md:px-3"
            variante="sublinhado"
            ativa={subAbaAtiva}
            aoEscolher={setSubAbaAtiva}
            abas={abasPermitidas.map((id) => ROTULO_SUBABA[id](pendenciasParaDecidir))}
          />
        </div>
      </div>

      {/* Conteúdo Principal do Painel */}
      <main className="flex-1 max-w-7xl w-full mx-auto">
        {/* SUB-ABA 1: VISÃO GERAL & SEPARAÇÕES POR LOJA E SETOR */}
        {subAbaAtiva === 'visao_geral' && (
          <div className="p-4 sm:p-6 flex flex-col gap-6 animate-in fade-in duration-150">
            {/* 4 Cards de Métricas Principais */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
              <div className="bg-[var(--c-superficie)] p-4 rounded-xl border border-[var(--c-borda)] shadow-xs flex flex-col justify-between gap-2">
                <div className="flex items-center justify-between text-[var(--c-texto-3)]">
                  <span className="text-xs font-medium">Equipe em Turno</span>
                  <Activity className="w-4 h-4 text-emerald-500" />
                </div>
                <div>
                  <div className="text-2xl font-black text-[var(--c-texto)] tracking-tight">
                    {estatisticas.totalOnline}{' '}
                    <span className="text-xs font-normal text-[var(--c-texto-3)]">
                      / {estatisticas.totalColaboradores} ativos
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400 font-medium mt-1">
                    <span className="w-2 h-2 rounded-full bg-emerald-500" />
                    <span>{estatisticas.disponiveis} disponíveis no balcão/loja</span>
                  </div>
                </div>
              </div>

              <div className="bg-[var(--c-superficie)] p-4 rounded-xl border border-[var(--c-borda)] shadow-xs flex flex-col justify-between gap-2">
                <div className="flex items-center justify-between text-[var(--c-texto-3)]">
                  <span className="text-xs font-medium">Lojas Interligadas</span>
                  <Building2 className="w-4 h-4 text-blue-500" />
                </div>
                <div>
                  <div className="text-2xl font-black text-[var(--c-texto)] tracking-tight">
                    {estatisticas.totalLojasComEquipe}{' '}
                    <span className="text-xs font-normal text-[var(--c-texto-3)]">
                      {estatisticas.totalLojasComEquipe === 1 ? 'com equipe' : 'com equipe'} de 5
                    </span>
                  </div>
                  <p className="text-xs text-[var(--c-texto-3)] mt-1">
                    Pirassununga (matriz), Porto Ferreira, Palmeiras, Descalvado, Sta. Rita
                  </p>
                </div>
              </div>

              <div className="bg-[var(--c-superficie)] p-4 rounded-xl border border-[var(--c-borda)] shadow-xs flex flex-col justify-between gap-2">
                <div className="flex items-center justify-between text-[var(--c-texto-3)]">
                  <span className="text-xs font-medium">Comunicados Oficiais</span>
                  <Megaphone className="w-4 h-4 text-amber-500" />
                </div>
                <div>
                  <div className="text-2xl font-black text-[var(--c-texto)] tracking-tight">
                    {estatisticas.totalAvisosVigentes}{' '}
                    <span className="text-xs font-normal text-[var(--c-texto-3)]">
                      {estatisticas.totalAvisosVigentes === 1 ? 'aviso' : 'avisos'}
                    </span>
                  </div>
                  <div className="text-xs text-amber-600 dark:text-amber-400 font-medium mt-1">
                    {estatisticas.avisosUrgentes > 0 ? (
                      <span className="font-bold">⚠️ {estatisticas.avisosUrgentes} urgente da diretoria</span>
                    ) : (
                      'Todos comunicados em dia'
                    )}
                  </div>
                </div>
              </div>

              <div className="bg-[var(--c-superficie)] p-4 rounded-xl border border-[var(--c-borda)] shadow-xs flex flex-col justify-between gap-2">
                <div className="flex items-center justify-between text-[var(--c-texto-3)]">
                  <span className="text-xs font-medium">Movimento de Hoje</span>
                  <MessageSquare className="w-4 h-4 text-emerald-500" />
                </div>
                <div>
                  <div className="text-2xl font-black text-[var(--c-texto)] tracking-tight">
                    {estatisticas.mensagensHoje}{' '}
                    <span className="text-xs font-normal text-[var(--c-texto-3)]">
                      {estatisticas.mensagensHoje === 1 ? 'mensagem' : 'mensagens'}
                    </span>
                  </div>
                  <p className="text-xs text-[var(--c-texto-3)] mt-1">
                    {estatisticas.chamadasHoje}{' '}
                    {estatisticas.chamadasHoje === 1 ? 'áudio' : 'áudios'} gravados hoje
                  </p>
                </div>
              </div>
            </div>

            {/* SEÇÃO 1: SEPARAÇÕES POR LOJA (5 LOJAS + CENTRAL) */}
            <section className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-base font-bold text-[var(--c-texto)] flex items-center gap-2">
                    <Building2 className="w-4 h-4 text-[var(--c-acento)]" />
                    Separações por Loja & Filiais
                  </h2>
                  <p className="text-xs text-[var(--c-texto-3)]">
                    Status da operação, supervisão e equipe conectada em cada unidade
                  </p>
                </div>

              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {unidadesOrdenadas.map((loja) => {
                  const metricasLoja = estatisticas.porLoja[loja.nome] || { total: 0, online: 0 };
                  const semEquipe = metricasLoja.total === 0;

                  return (
                    <div
                      key={loja.nome}
                      className={`bg-[var(--c-superficie)] rounded-xl border p-4 shadow-xs transition-all flex flex-col justify-between gap-3 ${
                        semEquipe
                          ? 'border-dashed border-[var(--c-borda)] opacity-60'
                          : 'border-[var(--c-borda)] hover:shadow-sm'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="font-bold text-sm text-[var(--c-texto)]">
                              Loja {loja.nome}
                            </h3>
                            <span
                              className={`px-1.5 py-0.5 text-[10px] font-bold rounded-md uppercase tracking-wider ${
                                loja.tipo === 'Matriz'
                                  ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-200'
                                  : loja.tipo === 'Central'
                                  ? 'bg-purple-100 text-purple-800 dark:bg-purple-900/50 dark:text-purple-200'
                                  : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                              }`}
                            >
                              {loja.tipo}
                            </span>
                          </div>
                          <p className="text-xs text-[var(--c-texto-3)] flex items-center gap-1 mt-0.5">
                            <MapPin className="w-3 h-3" /> {loja.cidade}
                          </p>
                        </div>

                        <div className="text-right">
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                            {metricasLoja.online} online
                          </span>
                        </div>
                      </div>

                      <div className="text-xs text-[var(--c-texto-2)] bg-[var(--c-canvas)] p-2.5 rounded-lg border border-[var(--c-borda)] flex flex-col gap-1">
                        <div className="flex justify-between">
                          <span className="text-[var(--c-texto-3)]">Supervisão:</span>
                          <strong className="text-[var(--c-texto)]">{loja.gerente}</strong>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-[var(--c-texto-3)]">Telefone:</span>
                          <span className="font-mono text-[var(--c-texto-2)]">{loja.telefone}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-[var(--c-texto-3)]">Equipe cadastrada:</span>
                          <span>{metricasLoja.total} colaboradores</span>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2 pt-1">
                        {loja.grupoId && (
                          <button
                            type="button"
                            onClick={() => aoAbrirConversa(loja.grupoId!)}
                            className="px-2.5 py-1.5 rounded-lg bg-[var(--c-superficie-2)] hover:bg-[var(--c-borda)] text-[var(--c-texto)] font-semibold text-xs transition-colors flex items-center justify-center gap-1 border border-[var(--c-borda)]"
                          >
                            <span>Canal da Loja</span>
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            {/* SEÇÃO 2: SEPARAÇÕES POR SETOR — a mesma do painel do RH */}
            <SeparacaoPorSetor />

            {/* SEÇÃO 3: ATALHOS RÁPIDOS PARA AVISOS DA REDE */}
            <section className="bg-gradient-to-r from-blue-900 to-indigo-900 text-white rounded-xl p-5 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-lg bg-white/10 flex items-center justify-center flex-shrink-0">
                  <Megaphone className="w-5 h-5 text-amber-300" />
                </div>
                <div>
                  <h3 className="font-bold text-base">Precisa emitir um aviso para as 5 lojas?</h3>
                  <p className="text-xs text-blue-200">
                    Comunique inventários, chegadas de peças e laudos de garantia com ciência obrigatória.
                  </p>
                </div>
              </div>

            </section>
          </div>
        )}

        {/* SUB-ABA 3: BANCO DE HORAS E QR DO PONTO */}
        {/* SUB-ABA: A EQUIPE DE QUEM RESPONDE POR ALGUÉM */}
        {subAbaAtiva === 'gestao' && (
          <PainelGestao
            colaboradorAtual={colaboradorAtual}
            aoAbrirConversa={lidarIniciarConversaColega}
            temEquipe={temEquipe}
            secaoAlvo={secaoAlvo}
            aoConsumirSecao={aoConsumirSecao}
          />
        )}

        {/* SUB-ABA: CADEIA DE RESPONSABILIDADE (decide quem aprova hora) */}
        {subAbaAtiva === 'rh' && <PainelRH colaboradorAtual={colaboradorAtual} />}

        {subAbaAtiva === 'organograma' && (
          <Organograma colaboradorAtual={colaboradorAtual} />
        )}
      </main>
    </div>
  );
};
