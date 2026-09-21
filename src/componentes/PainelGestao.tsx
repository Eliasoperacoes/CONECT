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
import React, { useMemo, useState } from 'react';
import {
  Users,
  Clock,
  AlertTriangle,
  CheckCircle2,
  MessageSquare,
  FileText,
  TrendingUp,
  TrendingDown,
  Search,
  CircleSlash,
  Inbox,
} from 'lucide-react';
import { Colaborador, ResumoPontoColaborador } from '../tipos';
import {
  servicoPonto,
  formatarMinutos,
  formatarSaldo,
  primeiroDiaDoMes,
  dataDeHoje,
} from '../servicos/ponto';
import { bancoDados } from '../servicos/bancoDados';
import { podeUsar } from '../servicos/permissoes';
import { cuidaDePessoas } from '../tipos';
import { BancoDeHoras } from './BancoDeHoras';
import { CicloSemanal } from './CicloSemanal';
import { resumoDaFicha } from '../servicos/fichaColaborador';
import { FotoPresenca } from './FotoPresenca';
import { FichaColaborador } from './FichaColaborador';
import { AprovacaoJornada } from './AprovacaoJornada';
import { EscalaDeFolgas } from './EscalaDeFolgas';

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
type Aba = 'equipe' | 'sem_bater' | 'aprovacoes' | 'folgas' | 'rede' | 'qr';

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
  const temTelaDeRh =
    cuidaDePessoas(colaboradorAtual) && podeUsar('rh_pessoal', colaboradorAtual);

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
  const veRede =
    (veEspelhoDaRede || podeUsar('espelho_equipe', colaboradorAtual)) && !temTelaDeRh;
  const veQr = podeUsar('qr_ponto', colaboradorAtual);
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
  const veEscala = podeUsar('escala_folgas', colaboradorAtual) && !temTelaDeRh;

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

  const [aba, setAba] = useState<Aba>(abaInicial);
  const [dataInicio, setDataInicio] = useState(primeiroDiaDoMes());
  const [dataFim, setDataFim] = useState(dataDeHoje());
  const [busca, setBusca] = useState('');
  const [fichaAberta, setFichaAberta] = useState<Colaborador | null>(null);
  const [versao] = useState(0);

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
   * Quem não bateu hoje. Sai do mesmo resumo da equipe — não há segunda
   * consulta nem segunda regra: é a mesma lista, filtrada.
   */
  const semBaterHoje = useMemo(
    () => equipe.filter((r) => !r.registrouHoje),
    [equipe]
  );

  const totais = useMemo(() => {
    const saldoBanco = equipe.reduce((t, r) => t + r.saldoAcumuladoMinutos, 0);
    const semBaterHoje = equipe.filter((r) => !r.registrouHoje).length;
    const comPendencia = equipe.reduce((t, r) => t + r.diasComPendencia, 0);
    return { saldoBanco, semBaterHoje, comPendencia };
  }, [equipe]);

  const abrirEspelho = (id: string) => {
    const html = servicoPonto.gerarHtmlEspelho(dataInicio, dataFim, [id]);
    const janela = window.open('', '_blank');
    if (!janela) return;
    janela.document.write(html);
    janela.document.close();
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
          {/* O que precisa de atenção, antes da lista */}
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
                totais.semBaterHoje > 0 ? () => setAba('sem_bater') : undefined
              }
            />
          </div>

          {/* Abas */}
          <div className="flex items-center bg-[var(--c-canvas)] border border-[var(--c-borda)] p-1 rounded-xl gap-1 self-start">
            <button
              type="button"
              onClick={() => setAba('equipe')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                aba === 'equipe'
                  ? 'bg-[var(--c-acento)] text-[var(--c-sobre-acento)] shadow-sm'
                  : 'text-[var(--c-texto-2)] hover:text-[var(--c-texto)]'
              }`}
            >
              Banco de horas da equipe
            </button>
            {/* A escala fica AQUI, e não no painel de RH: quem monta a
                escala de sábado é quem responde pela loja, e ele precisa dela
                junto do resto da equipe dele */}
            {totais.semBaterHoje > 0 && (
              <button
                type="button"
                onClick={() => setAba('sem_bater')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
                  aba === 'sem_bater'
                    ? 'bg-[var(--c-acento)] text-[var(--c-sobre-acento)] shadow-sm'
                    : 'text-[var(--c-texto-2)] hover:text-[var(--c-texto)]'
                }`}
              >
                Sem bater hoje
                <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-amber-500 text-white text-[10px] font-bold flex items-center justify-center">
                  {totais.semBaterHoje}
                </span>
              </button>
            )}
            {veEscala && (
            <button
              type="button"
              onClick={() => setAba('folgas')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                aba === 'folgas'
                  ? 'bg-[var(--c-acento)] text-[var(--c-sobre-acento)] shadow-sm'
                  : 'text-[var(--c-texto-2)] hover:text-[var(--c-texto)]'
              }`}
            >
              Escala de folgas
            </button>
            )}
            <button
              type="button"
              onClick={() => setAba('aprovacoes')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
                aba === 'aprovacoes'
                  ? 'bg-[var(--c-acento)] text-[var(--c-sobre-acento)] shadow-sm'
                  : 'text-[var(--c-texto-2)] hover:text-[var(--c-texto)]'
              }`}
            >
              Aprovar jornadas
              {pendencias.length > 0 && (
                <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-amber-500 text-white text-[10px] font-bold flex items-center justify-center">
                  {pendencias.length}
                </span>
              )}
            </button>

            {/*
              AS DUAS QUE VIERAM DA ABA DE TOPO.

              "Rede" é a tela do RH: todas as lojas, correção de marcação e
              exportação. Continua sendo exatamente a mesma tela, com as
              mesmas permissões — o que mudou foi só o caminho até ela.

              O nome é "Rede" e não "Banco de Horas" porque a PRIMEIRA vista
              desta barra já é o banco de horas, da equipe de quem abre. Dois
              itens com o mesmo nome na mesma barra é o defeito que esta
              fusão veio corrigir, não um a repetir.
            */}
            {veRede && (
              <button
                type="button"
                onClick={() => setAba('rede')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  aba === 'rede'
                    ? 'bg-[var(--c-acento)] text-[var(--c-sobre-acento)] shadow-sm'
                    : 'text-[var(--c-texto-2)] hover:text-[var(--c-texto)]'
                }`}
              >
                {/* O rótulo diz o alcance: quem vê a rede lê "Rede", quem
                    vê só a equipe lê "Espelho de ponto" */}
                {veEspelhoDaRede ? 'Rede' : 'Espelho de ponto'}
              </button>
            )}

            {veQr && (
              <button
                type="button"
                onClick={() => setAba('qr')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  aba === 'qr'
                    ? 'bg-[var(--c-acento)] text-[var(--c-sobre-acento)] shadow-sm'
                    : 'text-[var(--c-texto-2)] hover:text-[var(--c-texto)]'
                }`}
              >
                QR do ponto
              </button>
            )}
          </div>

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
          ) : aba === 'sem_bater' ? (
            <div className="flex flex-col gap-2">
              <div>
                <h3 className="text-sm font-bold text-[var(--c-texto)]">
                  Quem ainda não bateu o ponto hoje
                </h3>
                <p className="text-xs text-[var(--c-texto-3)]">
                  Pode ser folga, atestado ou esquecimento. Chame a pessoa antes de
                  o dia fechar — depois vira dia sem fechar, e aí é decisão sua.
                </p>
              </div>

              {semBaterHoje.map((r) => (
                <div
                  key={r.colaborador.id}
                  className="p-3 rounded-2xl bg-[var(--c-superficie)] border border-[var(--c-borda)] flex items-center gap-3"
                >
                  <FotoPresenca
                    foto={r.colaborador.foto}
                    nome={r.colaborador.nome}
                    presenca={r.colaborador.presenca}
                    tamanho="w-9 h-9"
                  />
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-bold text-[var(--c-texto)] block truncate">
                      {r.colaborador.nome}
                    </span>
                    <span className="text-[11px] text-[var(--c-texto-3)] block truncate">
                      {resumoDaFicha(r.colaborador)}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => aoAbrirConversa(r.colaborador.id)}
                    title="Chamar no chat"
                    className="p-2 rounded-lg bg-[var(--c-acento)] text-[var(--c-sobre-acento)] hover:brightness-110 transition-all flex-shrink-0"
                  >
                    <MessageSquare className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          ) : aba === 'folgas' ? (
            <div className="-m-4 sm:-m-6">
              <EscalaDeFolgas colaboradorAtual={colaboradorAtual} />
            </div>
          ) : aba === 'aprovacoes' ? (
            <div className="-m-4 sm:-m-6">
              <AprovacaoJornada colaboradorAtual={colaboradorAtual} />
            </div>
          ) : (
            <>
              {/* Período e busca */}
              <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
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

              <div className="flex flex-col gap-2">
                {exibidos.length === 0 && (
                  <div className="p-6 text-center text-xs text-[var(--c-texto-3)]">
                    Ninguém na equipe bate com “{busca}”.
                  </div>
                )}

                {exibidos.map((r) => {
                  const c = r.colaborador;
                  const pendente = servicoPonto.obterSaldoPendente(c.id);

                  return (
                    <div
                      key={c.id}
                      className="p-3.5 rounded-2xl bg-[var(--c-superficie)] border border-[var(--c-borda)] flex flex-col sm:flex-row sm:items-center gap-3"
                    >
                      <FotoPresenca
                        foto={c.foto}
                        nome={c.nome}
                        presenca={c.presenca}
                        tamanho="w-10 h-10"
                      />

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-bold text-[var(--c-texto)] truncate">
                            {c.nome}
                          </span>
                          {!r.registrouHoje && (
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded border bg-amber-500/10 text-amber-700 border-amber-500/20">
                              sem bater hoje
                            </span>
                          )}
                          {r.diasComPendencia > 0 && (
                            <span
                              className="text-[10px] font-bold px-1.5 py-0.5 rounded border bg-red-500/10 text-red-600 border-red-500/20"
                              title="Dias iniciados e não fechados"
                            >
                              {r.diasComPendencia} dia(s) em aberto
                            </span>
                          )}
                        </div>
                        <span className="text-[11px] text-[var(--c-texto-3)] block truncate">
                          {resumoDaFicha(c)}
                        </span>
                      </div>

                      {/* Os números que importam para a decisão do gestor */}
                      <div className="flex items-center gap-4 text-xs flex-shrink-0">
                        <div className="flex flex-col">
                          <span className="text-[10px] text-[var(--c-texto-3)]">
                            No período
                          </span>
                          <CorDoSaldo minutos={r.saldoPeriodoMinutos} />
                          <span className="text-[10px] text-[var(--c-texto-3)]">
                            {formatarMinutos(r.minutosTrabalhados)} trabalhadas
                          </span>
                        </div>

                        <div className="flex flex-col">
                          <span className="text-[10px] text-[var(--c-texto-3)]">
                            Banco de horas
                          </span>
                          <span className="inline-flex items-center gap-1">
                            {r.saldoAcumuladoMinutos >= 0 ? (
                              <TrendingUp className="w-3 h-3 text-emerald-600" />
                            ) : (
                              <TrendingDown className="w-3 h-3 text-amber-600" />
                            )}
                            <CorDoSaldo minutos={r.saldoAcumuladoMinutos} />
                          </span>
                          {pendente !== 0 && (
                            <span className="text-[10px] text-amber-600 font-semibold">
                              {formatarSaldo(pendente)} esperando você
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <button
                          type="button"
                          onClick={() => setFichaAberta(c)}
                          title="Ver ficha completa"
                          className="p-2 rounded-lg border border-[var(--c-borda)] text-[var(--c-texto-2)] hover:text-[var(--c-texto)] hover:border-[var(--c-borda-forte)] transition-colors"
                        >
                          <Users className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => abrirEspelho(c.id)}
                          title="Espelho de ponto do período"
                          className="p-2 rounded-lg border border-[var(--c-borda)] text-[var(--c-texto-2)] hover:text-[var(--c-texto)] hover:border-[var(--c-borda-forte)] transition-colors"
                        >
                          <FileText className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => aoAbrirConversa(c.id)}
                          title="Falar com a pessoa"
                          className="p-2 rounded-lg bg-[var(--c-acento)] text-[var(--c-sobre-acento)] hover:brightness-110 transition-all"
                        >
                          <MessageSquare className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

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
