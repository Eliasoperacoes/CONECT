/**
 * Painel de gestão — CONECTA / Malachias Autopeças
 *
 * A equipe de um gerente ou líder num lugar só: quem responde a ele, como
 * está o banco de horas de cada um, quem não bateu o ponto hoje e o que
 * está esperando decisão dele.
 *
 * Quem aparece aqui é EXATAMENTE quem a pessoa pode aprovar — a mesma
 * regra, vinda de `organograma`. Isso é de propósito: acompanhar o saldo de
 * alguém sobre quem não se decide nada não serve para nada, e expõe dado de
 * jornada sem motivo.
 *
 * O ESPELHO DE PONTO mora aqui também, e com correção.
 *
 * Antes não: corrigir marcação era só do RH, e daqui o gestor apenas
 * sinalizava o erro pelo chat. Ficou insustentável porque a fila de
 * aprovação só mostra os dias que fecharam FORA da carga — dia que precisa
 * ser preenchido do zero nunca aparecia lá, e o responsável não tinha por
 * onde lançar.
 *
 * Marcação continua sendo registro trabalhista: a correção exige motivo,
 * fica com o nome de quem fez, e APAGAR batida segue só do RH.
 */
import { AbasRolaveis } from './AbasRolaveis';
import React, { useEffect, useMemo, useState } from 'react';
import {
  Users,
  Clock,
  AlertTriangle,
  CheckCircle2,
  FileText,
  TrendingUp,
  TrendingDown,
  Search,
  CircleSlash,
  Inbox,
} from 'lucide-react';
import { Colaborador, ResumoPontoColaborador } from '../tipos';
import { ondeParei, lembrarOndeParei } from '../servicos/navegacaoLembrada';
import {
  servicoPonto,
  formatarMinutos,
  formatarSaldo,
  primeiroDiaDoMes,
  dataDeHoje,
} from '../servicos/ponto';
import { bancoDados } from '../servicos/bancoDados';
import { podeUsar } from '../servicos/permissoes';
import { acessoDe } from '../servicos/telasPorAssunto';
import { BancoDeHoras } from './BancoDeHoras';
import { CicloSemanal } from './CicloSemanal';
import { FotoPresenca } from './FotoPresenca';
import { FichaColaborador } from './FichaColaborador';
import { EscalaDeFolgas } from './EscalaDeFolgas';
import { SeletorDeMes } from './SeletorDeMes';
import { periodoDosPontosIncompletos } from './PontosIncompletos';
import { PendenciasDoPonto, VistaDePendencia, vistaInicialDasPendencias, contadorDasPendencias } from './PendenciasDoPonto';
import { AbaFerias } from './AbaFerias';
import { TabelaEquipe } from './TabelaEquipe';
import type { SecaoDestino } from '../servicos/centralDeNotificacoes';
import { mostrarDocumento } from '../servicos/visorDeDocumento';

interface Props {
  colaboradorAtual: Colaborador;
  aoAbrirConversa: (colegaId: string) => void;
  /**
   * Há alguém sob a responsabilidade de quem abriu?
   *
   * Vem de fora porque quem lista já sabia — e porque um gerente SEM equipe
   * ainda precisa entrar aqui pelo cartaz de QR da loja dele.
   */
  temEquipe: boolean;
  /**
   * A seção que o sino pediu para abrir.
   *
   * Chega de fora porque a aba mora aqui dentro: sem isto, tocar numa
   * notificação de jornada só conseguia trazer a pessoa até a porta do
   * painel — e ela ainda tinha de achar a aba na mão, depois de já ter
   * dito onde queria ir.
   */
  secaoAlvo?: SecaoDestino | null;
  /** Avisa quem mandou que o destino já foi alcançado. */
  aoConsumirSecao?: () => void;
  /**
   * UMA VISTA SÓ, sem a barra de vistas. No computador cada vista é uma aba
   * do assunto "Ponto" (telasPorAssunto.ts), e a barra daqui seria uma
   * segunda barra empilhada sobre a primeira.
   */
  abaFixa?: 'equipe' | 'pendencias';
}

/**
 * As vistas de gestão, numa barra só.
 *
 * "rede" e "qr" vinham de uma ABA DE TOPO separada, chamada "Banco de
 * Horas". Só que a primeira vista daqui já se chamava "Banco de horas da
 * equipe": o mesmo nome em dois lugares, um dentro do outro, e quem tinha
 * as duas permissões via as duas.
 *
 * Agora é uma barra única. O que mudou foi ONDE se chega, não o que cada
 * tela faz: a rede continua sendo a tela do RH, com correção de marcação e
 * exportação, e a equipe continua sendo a cadeia de quem abre.
 */
/**
 * Em lista, porque `ondeParei` confere o que leu do aparelho contra o
 * que existe HOJE: aba removida ou escrita à mão no console cai no
 * padrão, em vez de deixar a tela em branco.
 */
const ABAS = ['equipe', 'pendencias', 'folgas', 'ferias', 'rede', 'qr'] as const;

type Aba = (typeof ABAS)[number];

/** Saldo colorido pelo sinal: verde credita a pessoa, âmbar deve. */
const CorDoSaldo: React.FC<{ minutos: number; className?: string }> = ({
  minutos,
  className = '',
}) => (
  <strong
    className={`font-mono ${
      minutos > 0
        ? 'text-emerald-600'
        : minutos < 0
        ? 'text-amber-600'
        : 'text-[var(--c-texto-2)]'
    } ${className}`}
  >
    {formatarSaldo(minutos)}
  </strong>
);

export const PainelGestao: React.FC<Props> = ({
  colaboradorAtual,
  aoAbrirConversa,
  temEquipe,
  secaoAlvo,
  aoConsumirSecao,
  abaFixa,
}) => {
  /**
   * ESCALA E REDE MUDARAM DE LUGAR PARA QUEM CUIDA DE PESSOAS.
   *
   * As duas agora moram na tela de RH, que é de onde elas são. Mantê-las
   * aqui TAMBÉM criaria duas portas para a mesma sala — e o tempo que se
   * perde não é achando a porta, é descobrindo se as duas levam ao mesmo
   * lugar.
   *
   * Para o líder que NÃO cuida de pessoas nada muda: ele não tem a tela de
   * RH, e continua alcançando as duas por aqui.
   */
  /*
    AS CONDIÇÕES MORAM EM `acessoDe` (telasPorAssunto.ts) — a mesma
    resposta da barra lateral do computador. Os porquês de cada uma estão
    aqui embaixo, onde sempre estiveram.
  */
  const acesso = acessoDe(colaboradorAtual, {
    pode: (chave) => podeUsar(chave, colaboradorAtual),
    temEquipe,
    batePonto: false,
  });

  /**
   * O espelho de ponto, com duas portas para a mesma tela.
   *
   * `banco_horas_rh` traz a rede inteira; `espelho_equipe`, só a equipe de
   * quem abre. O conteúdo já vem filtrado pela cadeia, então não há duas
   * telas — há dois alcances, e o rótulo diz qual é.
   *
   * Existe porque a fila de aprovação só mostra os dias que caíram fora da
   * carga. Dia que precisa ser preenchido do zero não aparece lá, e o
   * líder não tinha por onde lançar.
   */
  const veEspelhoDaRede = podeUsar('banco_horas_rh', colaboradorAtual);
  const veRede = acesso.redeNaGestao;
  const veQr = acesso.qr;
  /**
   * A ESCALA PASSA PELO CATÁLOGO, como as outras.
   *
   * Era só `!temTelaDeRh` — a tela onde a liderança lança folga e férias
   * não aparecia no painel de Permissões, e não dava para ligar ou
   * desligar por nível. Quem alcançava o painel de gestão, tinha.
   *
   * O `!temTelaDeRh` continua ao lado, e é outra coisa: não é permissão,
   * é evitar duas portas para a mesma sala — quem tem a tela de RH acessa
   * a escala por lá.
   */
  const veEscala = acesso.escalaDaEquipe;

  /**
   * Quem NÃO tem equipe ainda pode entrar aqui — um gerente sem ninguém
   * cadastrado abaixo dele precisa do cartaz de QR da loja. Para ele a
   * barra começa no que ele de fato alcança, e não numa lista vazia.
   *
   * O "tem equipe" vem de quem já o calculava, e não de uma segunda conta
   * aqui dentro: duas definições da mesma coisa é como as telas passam a
   * discordar sobre quem aparece.
   */
  const abaInicial: Aba = temEquipe ? 'equipe' : veRede ? 'rede' : 'qr';

  /**
   * Começa onde a pessoa parou; `abaInicial` é o padrão de quem nunca
   * escolheu nada — e continua sendo o desvio quando o que foi lembrado
   * não vale mais.
   */
  const [abaEscolhida, setAba] = useState<Aba>(() =>
    ondeParei(colaboradorAtual.id, 'gestao', ABAS, abaInicial)
  );

  /**
   * A ABA QUE VALE. Nunca uma que a pessoa não tenha.
   *
   * As abas somem da barra conforme a permissão, mas o conteúdo abaixo é
   * escolhido pelo estado — então bastava o estado apontar para uma aba
   * escondida e a tela aparecia sem o botão. Enquanto o estado nascia
   * sempre em `abaInicial` isso não acontecia; passando a nascer do que
   * ficou guardado no aparelho, passa a acontecer: basta a pessoa perder
   * a permissão depois de ter estado lá — ou editar o `localStorage`.
   */
  const aba: Aba = (() => {
    if (abaFixa) return abaFixa;
    if ((abaEscolhida === 'folgas' || abaEscolhida === 'ferias') && !veEscala) return abaInicial;
    if (abaEscolhida === 'rede' && !veRede) return abaInicial;
    if (abaEscolhida === 'qr' && !veQr) return abaInicial;
    if (
      (abaEscolhida === 'equipe' || abaEscolhida === 'pendencias') &&
      !temEquipe
    ) {
      return abaInicial;
    }
    return abaEscolhida;
  })();

  useEffect(() => {
    lembrarOndeParei(colaboradorAtual.id, 'gestao', aba);
  }, [colaboradorAtual.id, aba]);

  /**
   * O sino mandou abrir uma seção. Abre.
   *
   * A escala passa por `veEscala` de propósito: uma notificação NÃO é
   * autorização. Se a pessoa perdeu a permissão entre o pedido de folga e
   * o toque no sino, ela para na aba inicial — e não numa aba que a barra
   * acima nem desenha, que é como se chega numa tela sem saída.
   *
   * O aviso é consumido de qualquer jeito, inclusive quando é recusado:
   * alvo que não se limpa fica reabrindo a mesma aba a cada desenho e
   * prende a pessoa ali.
   */
  useEffect(() => {
    if (!secaoAlvo) return;

    if (secaoAlvo === 'aprovar_jornadas') abrirPendencias('aprovar');
    else if (secaoAlvo === 'escala_folgas' && veEscala) setAba('folgas');

    aoConsumirSecao?.();
  }, [secaoAlvo, veEscala, aoConsumirSecao]);
  const [dataInicio, setDataInicio] = useState(primeiroDiaDoMes());
  const [dataFim, setDataFim] = useState(dataDeHoje());
  const [busca, setBusca] = useState('');
  const [fichaAberta, setFichaAberta] = useState<Colaborador | null>(null);
  /*
    O PAINEL ACOMPANHA O PONTO: decidida uma jornada (ou lançada uma
    batida), os números da aba Pendências e do resumo mudam na hora. Sem
    isto, "Aprovar 88" seguia 88 depois de decidir — o número só
    atualizava saindo e voltando.
  */
  const [versao, setVersao] = useState(0);
  useEffect(() => servicoPonto.assinarAlteracoes(() => setVersao((v) => v + 1)), []);

  /**
   * O resumo já vem filtrado pela alçada — `obterResumoDoPeriodo` usa
   * `obterColaboradoresVisiveis`, que é a mesma regra da aprovação. Aqui só
   * se tira a própria pessoa: o extrato dela é da aba "Eu", e misturá-lo com
   * o da equipe faria o total da equipe incluir o próprio gestor.
   */
  const equipe: ResumoPontoColaborador[] = useMemo(() => {
    void versao;
    /**
     * Quem lidera aparece na própria lista.
     *
     * Antes a pessoa era tirada daqui porque "o extrato dela é da aba Eu".
     * Deixou de valer: agora ela APROVA as próprias horas, e aprovar sem ver
     * o extrato ao lado do da equipe seria decidir no escuro.
     *
     * A pergunta é a mesma da fila de decisão — se esta lista divergisse,
     * haveria pendência sem quem a decida.
     */
    return servicoPonto
      .obterResumoDoPeriodo(dataInicio, dataFim)
      .filter((r) => servicoPonto.podeDecidirSobre(r.colaborador));
  }, [dataInicio, dataFim, colaboradorAtual.id, versao]);

  const termo = busca.trim().toLowerCase();
  const exibidos = useMemo(
    () =>
      termo
        ? equipe.filter(
            (r) =>
              r.colaborador.nome.toLowerCase().includes(termo) ||
              r.colaborador.cargo.toLowerCase().includes(termo) ||
              r.colaborador.setor.toLowerCase().includes(termo) ||
              (r.colaborador.matricula || '').includes(termo)
          )
        : equipe,
    [equipe, termo]
  );

  const pendencias = servicoPonto.obterPendenciasParaDecidir();
  /**
   * O número da aba "Pontos incompletos", perguntado ao banco como a própria
   * aba — e atualizado POR ELA (`aoMudarTotal`) quando uma batida é
   * lançada, sem uma segunda consulta. Lido do cache, ele oscilava.
   */
  const [incompletos, setIncompletos] = useState(0);
  useEffect(() => {
    let vivo = true;
    const { inicio, fim } = periodoDosPontosIncompletos(dataDeHoje());
    servicoPonto.buscarPontosIncompletos(inicio, fim).then((lista) => vivo && setIncompletos(lista.length));
    return () => {
      vivo = false;
    };
  }, [colaboradorAtual.id]);

  /**
   * Quem não bateu hoje. Sai do mesmo resumo da equipe — não há segunda
   * consulta nem segunda regra: é a mesma lista, filtrada.
   */
  const semBaterHoje = useMemo(
    () => equipe.filter((r) => r.semBaterHoje),
    [equipe]
  );

  const totais = useMemo(() => {
    const saldoBanco = equipe.reduce((t, r) => t + r.saldoAcumuladoMinutos, 0);
    const semBaterHoje = equipe.filter((r) => r.semBaterHoje).length;
    const comPendencia = equipe.reduce((t, r) => t + r.diasComPendencia, 0);
    return { saldoBanco, semBaterHoje, comPendencia };
  }, [equipe]);

  /** O número de cada parte da aba Pendências — os mesmos que as três abas mostravam. */
  const totaisDasPendencias: Record<VistaDePendencia, number> = {
    sem_bater: totais.semBaterHoje,
    incompletos,
    aprovar: pendencias.length,
  };

  /**
   * A PARTE ABERTA DENTRO DE PENDÊNCIAS: a primeira com alguma coisa, na
   * ordem do dia — e NÃO a última escolhida. Lembrar "Aprovar" esconderia
   * de manhã as três pessoas que ainda não bateram. O cartão do resumo e o
   * sino pedem uma parte certa (`abrirPendencias`).
   */
  const [vistaEscolhida, setVistaEscolhida] = useState<VistaDePendencia | null>(null);
  const vistaDasPendencias = vistaEscolhida ?? vistaInicialDasPendencias(totaisDasPendencias);

  /** Abre a aba Pendências já na parte pedida — pelo cartão do resumo ou pelo sino. */
  const abrirPendencias = (vista: VistaDePendencia) => {
    setVistaEscolhida(vista);
    setAba('pendencias');
  };

  const abrirEspelho = (id: string) => {
    // No celular, o visor (com Voltar); no computador, uma janela nova
    mostrarDocumento(servicoPonto.gerarHtmlEspelho(dataInicio, dataFim, [id]));
  };

  /**
   * Um número que não leva a lugar nenhum não serve para nada.
   *
   * "Sem bater hoje: 23" dizia que havia um problema e deixava o gestor
   * procurar quem, um por um, na lista de 24 pessoas. Cartão com `aoAbrir`
   * vira botão e leva direto à lista.
   */
  const Cartao: React.FC<{
    titulo: string;
    valor: React.ReactNode;
    detalhe: string;
    icone: React.ReactNode;
    alerta?: boolean;
    aoAbrir?: () => void;
  }> = ({ titulo, valor, detalhe, icone, alerta, aoAbrir }) => (
    <div
      onClick={aoAbrir}
      role={aoAbrir ? 'button' : undefined}
      className={`p-3.5 rounded-2xl border flex flex-col gap-1 ${
        aoAbrir ? 'cursor-pointer hover:brightness-105 active:scale-[0.99] transition-all' : ''
      } ${
        alerta
          ? 'bg-amber-500/5 border-amber-500/25'
          : 'bg-[var(--c-superficie)] border-[var(--c-borda)]'
      }`}
    >
      <span className="text-[11px] text-[var(--c-texto-3)] font-medium flex items-center gap-1.5">
        {icone}
        {titulo}
      </span>
      <span className="text-xl font-black text-[var(--c-texto)] leading-none">{valor}</span>
      <span className="text-[11px] text-[var(--c-texto-3)]">{detalhe}</span>
    </div>
  );

  return (
    <div className="w-full flex flex-col gap-4 p-4 sm:p-6">
      <div>
        <h2 className="text-sm font-bold text-[var(--c-texto)] flex items-center gap-2">
          <Users className="w-4 h-4" />
          Minha equipe
        </h2>
        <p className="text-xs text-[var(--c-texto-3)]">
          As pessoas por quem você responde — as mesmas cujas horas você aprova. Quem
          você não aprova não aparece aqui.
        </p>
      </div>

      {equipe.length === 0 ? (
        <div className="p-8 rounded-2xl bg-[var(--c-superficie)] border border-[var(--c-borda)] flex flex-col items-center text-center gap-2">
          <CircleSlash className="w-8 h-8 text-[var(--c-texto-3)]" />
          <span className="text-sm font-bold text-[var(--c-texto)]">
            Ninguém responde a você ainda
          </span>
          <span className="text-xs text-[var(--c-texto-3)] max-w-sm">
            Peça ao RH para posicionar a sua equipe no Organograma. Enquanto isso, você
            continua aprovando pela regra de setor e loja.
          </span>
        </div>
      ) : (
        <>
          {/*
            AS VISTAS, NUMA LINHA QUE DESLIZA (AbasRolaveis) — e ANTES dos
            cartões. Eram quatro a seis botões num contêiner que quebrava
            em três linhas no celular, depois de quatro cartões: para
            aprovar jornadas era preciso rolar por cima do resumo.

            A escala fica AQUI, e não no painel de RH: quem monta a escala
            de sábado é quem responde pela loja. "Rede" é a tela do RH —
            todas as lojas, correção e exportação —; o nome diz o alcance.
          */}
          {!abaFixa && <AbasRolaveis
            className="-mx-4 sm:mx-0 sm:px-0"
            ativa={aba}
            aoEscolher={setAba}
            abas={[
              { id: 'equipe' as Aba, rotulo: 'Banco de horas' },
              /*
                SEM BATER HOJE, PONTOS INCOMPLETOS E APROVAR JORNADAS NUMA ABA
                SÓ (Elias, 03/10/2026) — as três respondem "o que do ponto da
                equipe precisa de mim", em três momentos do dia. Cada parte
                mostra o seu lá dentro (PendenciasDoPonto).

                O NÚMERO DA ABA É SÓ O QUE PEDE DECISÃO. Somava também "sem
                bater", e no S10 do Fabio (02/10/2026) a mesma fila aparecia
                como 19 em "Equipe e ponto", 9+ na barra e 38 aqui. Quem
                ainda não bateu é informação que muda a manhã inteira — às 7h
                seria a equipe toda —, não decisão esperando o gestor.
              */
              {
                id: 'pendencias' as Aba,
                rotulo: 'Pendências',
                contador: contadorDasPendencias(totaisDasPendencias),
              },
              ...(veEscala ? [{ id: 'folgas' as Aba, rotulo: 'Escala de folgas' }] : []),
              /*
                FÉRIAS DA EQUIPE, PELA MESMA PERMISSÃO DA ESCALA.
                O catálogo já dizia "folgas de sábado e férias da equipe".
                Quando as férias ganharam tela própria, ela foi só para o
                RH, e o líder ficou sem onde lançar. A tela filtra pela
                alçada: ele vê a própria linha e a de quem responde a ele.
              */
              ...(veEscala ? [{ id: 'ferias' as Aba, rotulo: 'Férias' }] : []),
              ...(veRede ? [{ id: 'rede' as Aba, rotulo: veEspelhoDaRede ? 'Rede' : 'Espelho de ponto' }] : []),
              ...(veQr ? [{ id: 'qr' as Aba, rotulo: 'QR do ponto' }] : []),
            ]}
          />}

          {/* O resumo da equipe: só na vista da equipe, abaixo das abas */}
          {aba === 'equipe' && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Cartao
              titulo="Equipe"
              valor={equipe.length}
              detalhe={equipe.length === 1 ? 'pessoa' : 'pessoas'}
              icone={<Users className="w-3.5 h-3.5" />}
            />
            <Cartao
              titulo="Banco de horas"
              valor={<CorDoSaldo minutos={totais.saldoBanco} />}
              detalhe="somado, já aprovado"
              icone={<Clock className="w-3.5 h-3.5" />}
            />
            <Cartao
              titulo="Aguardando você"
              valor={pendencias.length}
              detalhe={
                pendencias.length === 0
                  ? 'nada para decidir'
                  : 'hora parada, fora do banco'
              }
              icone={<CheckCircle2 className="w-3.5 h-3.5" />}
              alerta={pendencias.length > 0}
              aoAbrir={pendencias.length > 0 ? () => abrirPendencias('aprovar') : undefined}
            />
            <Cartao
              titulo="Sem bater hoje"
              valor={totais.semBaterHoje}
              detalhe={
                totais.semBaterHoje > 0 ? 'toque para ver quem' : 'todo mundo bateu'
              }
              icone={<AlertTriangle className="w-3.5 h-3.5" />}
              alerta={totais.semBaterHoje > 0}
              aoAbrir={
                totais.semBaterHoje > 0 ? () => abrirPendencias('sem_bater') : undefined
              }
            />
          </div>
          )}

          {/*
            As duas vistas que vieram da aba de topo entram ANTES da cadeia
            de `if` da equipe: elas não usam nada do que vem abaixo — nem a
            busca, nem o período, nem a lista — e a tela de rede traz o seu
            próprio.
          */}
          {aba === 'rede' ? (
            <BancoDeHoras colaboradorAtual={colaboradorAtual} abaFixa="banco_horas" />
          ) : aba === 'qr' ? (
            <BancoDeHoras colaboradorAtual={colaboradorAtual} abaFixa="qrcodes" />
          ) : aba === 'pendencias' ? (
            <PendenciasDoPonto
              colaboradorAtual={colaboradorAtual}
              vista={vistaDasPendencias}
              aoEscolherVista={setVistaEscolhida}
              totais={totaisDasPendencias}
              semBaterHoje={semBaterHoje.map((r) => r.colaborador)}
              aoMudarIncompletos={setIncompletos}
              aoAbrirConversa={aoAbrirConversa}
            />
          ) : aba === 'folgas' ? (
            <div className="-m-4 sm:-m-6">
              <EscalaDeFolgas colaboradorAtual={colaboradorAtual} />
            </div>
          ) : aba === 'ferias' ? (
            <div className="-m-4 sm:-m-6">
              <AbaFerias colaboradorAtual={colaboradorAtual} />
            </div>
          ) : (
            <>
              {/* Período e busca */}
              <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
                {/* O mês num toque — o mesmo seletor do espelho do RH */}
                <SeletorDeMes
                  id="gestao-mes"
                  comRotulo={false}
                  className="sm:w-56 flex-shrink-0"
                  dataInicio={dataInicio}
                  dataFim={dataFim}
                  aoEscolher={(inicio, fim) => {
                    setDataInicio(inicio);
                    setDataFim(fim);
                  }}
                />
                <div className="flex items-center gap-2 text-xs">
                  <label className="text-[var(--c-texto-3)]" htmlFor="gestao-de">
                    De
                  </label>
                  <input
                    id="gestao-de"
                    type="date"
                    value={dataInicio}
                    onChange={(e) => setDataInicio(e.target.value)}
                    className="px-2 py-1.5 rounded-lg bg-[var(--c-superficie)] border border-[var(--c-borda)] text-[var(--c-texto)]"
                  />
                  <label className="text-[var(--c-texto-3)]" htmlFor="gestao-ate">
                    até
                  </label>
                  <input
                    id="gestao-ate"
                    type="date"
                    value={dataFim}
                    onChange={(e) => setDataFim(e.target.value)}
                    className="px-2 py-1.5 rounded-lg bg-[var(--c-superficie)] border border-[var(--c-borda)] text-[var(--c-texto)]"
                  />
                </div>

                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--c-texto-3)]" />
                  <input
                    type="text"
                    value={busca}
                    onChange={(e) => setBusca(e.target.value)}
                    placeholder="Buscar na equipe por nome, matrícula, cargo ou setor..."
                    className="w-full pl-9 pr-3 py-1.5 text-xs bg-[var(--c-superficie)] border border-[var(--c-borda)] rounded-lg text-[var(--c-texto)] focus:outline-none focus:ring-2 focus:ring-[var(--c-acento)]"
                  />
                </div>
              </div>

              {/*
                O CICLO VEM ANTES DA LISTA.

                A lista responde "como está a minha equipe no mês"; o ciclo
                responde "o que precisa de mim agora". A segunda pergunta é
                a que o líder faz no sábado, então ela vem primeiro.
              */}
              <CicloSemanal
                colaboradorAtual={colaboradorAtual}
                aoEscolherPeriodo={(inicio, fim) => {
                  setDataInicio(inicio);
                  setDataFim(fim);
                }}
              />

              {exibidos.length === 0 ? (
                <div className="p-6 text-center text-xs text-[var(--c-texto-3)]">
                  Ninguém na equipe bate com “{busca}”.
                </div>
              ) : (
                /*
                  A EQUIPE EM LINHAS, e não em cartões.

                  Cada pessoa ocupava uns 90 pixels — foto de 40, dois blocos
                  de números e três botões. Com 23 pessoas davam mais de dois
                  metros de rolagem, e o cartão não dizia nada que a linha não
                  diga. Agrupada por unidade e recolhível: quem responde por
                  mais de uma loja lê a loja que tem problema, não 23 nomes.
                */
                <TabelaEquipe
                  linhas={exibidos}
                  colaboradorAtual={colaboradorAtual}
                  aoAbrirFicha={setFichaAberta}
                  aoAbrirEspelho={abrirEspelho}
                  aoAbrirConversa={aoAbrirConversa}
                />
              )}

              {/* Marcação é registro trabalhista: alterar é do RH */}
              <div className="p-3 rounded-xl bg-[var(--c-canvas)] border border-[var(--c-borda)] flex gap-2.5 text-[11px] text-[var(--c-texto-3)]">
                <Inbox className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                <span>
                  Marcação errada ou esquecida se corrige com o RH — a alteração fica
                  registrada com data, motivo e autor. Avise pelo chat e o RH ajusta;
                  depois o dia volta para você aprovar.
                </span>
              </div>
            </>
          )}
        </>
      )}

      {/* Ficha da pessoa, sem sair do painel */}
      {fichaAberta && (
        <div
          className="fixed inset-0 z-[60] bg-black/50 flex items-center justify-center p-4"
          onClick={() => setFichaAberta(null)}
        >
          <div
            className="bg-[var(--c-superficie)] rounded-2xl border border-[var(--c-borda)] shadow-2xl w-full max-w-lg max-h-[85vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 border-b border-[var(--c-borda)] flex items-center gap-3">
              <FotoPresenca
                foto={fichaAberta.foto}
                nome={fichaAberta.nome}
                presenca={fichaAberta.presenca}
                tamanho="w-10 h-10"
              />
              <div className="min-w-0">
                <span className="text-sm font-bold text-[var(--c-texto)] block truncate">
                  {fichaAberta.nome}
                </span>
                <span className="text-[11px] text-[var(--c-texto-3)]">
                  {fichaAberta.cargo} · {fichaAberta.loja}
                </span>
              </div>
            </div>
            <div className="p-4">
              <FichaColaborador
                colaborador={fichaAberta}
                responsavel={
                  fichaAberta.responsavelId
                    ? bancoDados.obterColaboradorPorId(fichaAberta.responsavelId)
                    : null
                }
              />
            </div>
            <div className="p-4 pt-0">
              <button
                type="button"
                onClick={() => setFichaAberta(null)}
                className="w-full py-2 rounded-xl border border-[var(--c-borda)] text-xs font-bold text-[var(--c-texto-2)] hover:text-[var(--c-texto)] transition-colors"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
