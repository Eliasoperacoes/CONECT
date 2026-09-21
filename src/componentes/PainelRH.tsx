/**
 * Painel de RH — CONECTA / Malachias Autopeças
 *
 * O QUE ESTA TELA É
 *
 * O lugar de quem cuida de pessoas: indicadores, holerite, atestado,
 * advertência, escala e espelho de ponto. É a tela da Dani.
 *
 * O QUE ELA NÃO FAZ: repetir o que já existe.
 *
 * Escala de folgas e espelho de ponto já eram alcançáveis pelo painel de
 * gestão. Em vez de copiá-los para cá, eles MUDARAM DE LUGAR para quem
 * cuida de pessoas — a mesma tela, um dono só. Duas portas para a mesma
 * sala é o que faz a pessoa perder tempo descobrindo qual das duas é a
 * certa, e é o defeito que já custou caro neste sistema.
 *
 * Os indicadores do topo não são enfeite: cada um deles é uma pergunta que
 * o RH faz toda semana, e todos levam para o lugar onde se resolve.
 */

import React, { useEffect, useMemo, useState } from 'react';
import {
  Users,
  FileText,
  CalendarDays,
  AlertTriangle,
  Stethoscope,
  Receipt,
  ClipboardList,
  TrendingDown,
  CheckCircle2,
} from 'lucide-react';
import { Colaborador } from '../tipos';
import {
  servicoPonto,
  formatarSaldo,
  dataDeHoje,
} from '../servicos/ponto';
import { bancoDados } from '../servicos/bancoDados';
import { podeUsar } from '../servicos/permissoes';
import {
  lerJustificativas,
  assinarJustificativas,
} from '../servicos/justificativasCache';
import { EscalaDeFolgas } from './EscalaDeFolgas';
import { BancoDeHoras } from './BancoDeHoras';
import { AbaHolerites } from './AbaHolerites';
import { AbaAdvertencias } from './AbaAdvertencias';
import { AbaAtestados } from './AbaAtestados';

/**
 * A aba "Feriados" saiu daqui.
 *
 * Ela servia para apertar "Trazer nacionais" uma vez por ano e digitar o
 * que o calendário já sabe. Natal não é dado a ser cadastrado, é conta —
 * e agora `feriadoEm` responde sozinha, para qualquer ano, incluindo os
 * móveis pela Páscoa. Uma tela cuja única função era alimentar o que o
 * sistema podia calcular é trabalho que a pessoa fazia pelo sistema.
 */
type Secao =
  | 'painel'
  | 'holerites'
  | 'atestados'
  | 'advertencias'
  | 'escala'
  | 'espelhos';

interface Props {
  colaboradorAtual: Colaborador;
}

/** Um número do painel, com o que ele quer dizer e para onde ele leva. */
const Indicador: React.FC<{
  rotulo: string;
  valor: React.ReactNode;
  detalhe: string;
  icone: React.ReactNode;
  alerta?: boolean;
  aoAbrir?: () => void;
}> = ({ rotulo, valor, detalhe, icone, alerta, aoAbrir }) => (
  <button
    type="button"
    onClick={aoAbrir}
    disabled={!aoAbrir}
    className={`text-left p-3.5 rounded-2xl border transition-colors ${
      alerta
        ? 'bg-amber-500/5 border-amber-500/25'
        : 'bg-[var(--c-superficie)] border-[var(--c-borda)]'
    } ${aoAbrir ? 'cursor-pointer hover:border-[var(--c-acento)]/40' : 'cursor-default'}`}
  >
    <div className="flex items-center gap-1.5 mb-1.5 text-[var(--c-texto-3)]">
      {icone}
      <span className="text-[10px] font-bold uppercase tracking-wider">{rotulo}</span>
    </div>
    <div
      className={`text-2xl font-black tracking-tight ${
        alerta ? 'text-amber-600' : 'text-[var(--c-texto)]'
      }`}
    >
      {valor}
    </div>
    <span className="block text-[11px] text-[var(--c-texto-3)] leading-snug mt-0.5">
      {detalhe}
    </span>
  </button>
);

export const PainelRH: React.FC<Props> = ({ colaboradorAtual }) => {
  const [secao, setSecao] = useState<Secao>('painel');
  const [versao, setVersao] = useState(0);

  useEffect(() => {
    const cancelarPonto = servicoPonto.assinarAlteracoes(() => setVersao((v) => v + 1));
    const cancelarAusencias = assinarJustificativas(() => setVersao((v) => v + 1));
    return () => {
      cancelarPonto();
      cancelarAusencias();
    };
  }, []);

  /**
   * OS NÚMEROS DA SEMANA.
   *
   * Todos saem do que o sistema já sabe — nenhum deles é digitado por
   * ninguém. Indicador que depende de alguém lembrar de atualizar está
   * errado no dia seguinte.
   */
  const numeros = useMemo(() => {
    void versao;

    const pessoas = bancoDados.obterColaboradores().filter((c) => c.ativo !== false);
    const ciclo = servicoPonto.relacaoSemanalDaEquipe(dataDeHoje());

    const comPendencia = ciclo.linhas.filter((l) => l.diasComPendencia.length > 0);
    const saldoDaRede = ciclo.linhas.reduce((t, l) => t + l.saldoMinutos, 0);

    const justificativas = lerJustificativas();
    const mesAtual = dataDeHoje().slice(0, 7);

    const atestadosDoMes = justificativas.filter(
      (j) => j.tipo === 'atestado' && j.dataInicio.slice(0, 7) === mesAtual
    );
    const aguardando = justificativas.filter((j) => j.estado === 'pendente');

    /**
     * QUEM FICA MESMO SEM APROVADOR.
     *
     * Era `!c.responsavelId`, e só. O painel acusava 9 pessoas "fora do
     * organograma" com todo mundo devidamente ligado — porque as 9 eram
     * os GERENTES, LÍDERES, RH e o ADM: o topo da cadeia, que não tem
     * ninguém acima porque não existe ninguém acima.
     *
     * Um número que não pode chegar a zero é um alarme que só ensina a
     * ignorar o painel. E este vinha com faixa amarela mandando
     * "posicione cada uma na aba Organograma" — uma tarefa impossível,
     * repetida todo dia.
     *
     * Não ter responsável só é problema quando sobra alguém sem ninguém
     * para decidir. Duas saídas já existem no sistema, e nenhuma passa
     * por ter alguém acima:
     *
     *  - QUEM LIDERA APROVA AS PRÓPRIAS HORAS. É regra de
     *    `temAlcadaSobre`, e vale para quem tem gente pendurada abaixo.
     *  - QUEM NÃO BATE PONTO não tem hora a aprovar. Da gerência para
     *    cima não se bate — está no catálogo.
     *
     * Sobra o caso real: a pessoa que bate ponto, não tem ninguém acima
     * e não lidera ninguém. Essa fica parada de verdade, e é ela que o
     * RH precisa posicionar.
     */
    const semResponsavel = pessoas.filter(
      (c) =>
        !c.responsavelId &&
        c.id !== colaboradorAtual.id &&
        podeUsar('ponto', c) &&
        !pessoas.some((outro) => outro.responsavelId === c.id)
    );

    return {
      pessoas: pessoas.length,
      comPendencia: comPendencia.length,
      saldoDaRede,
      atestadosDoMes: atestadosDoMes.length,
      aguardando: aguardando.length,
      semResponsavel: semResponsavel.length,
    };
  }, [versao, colaboradorAtual.id]);

  /**
   * O QUE ESTÁ PARADO ESPERANDO O RH, e só isso.
   *
   * Uma linha só entra aqui quando há trabalho a fazer — nada de cartão
   * com zero ocupando o lugar do que importa. Cada uma diz o QUE é, POR
   * QUE apareceu e para ONDE leva, porque "Sem bater: 3" não ensina
   * ninguém a resolver nada.
   *
   * "Sem responsável" tem destino em OUTRA tela, o Organograma, que não é
   * uma seção daqui. Por isso ela leva a explicação no corpo em vez de um
   * botão que não teria para onde ir — prometer um caminho que não existe
   * é pior do que dizer onde fica.
   */
  const pendencias: Array<{
    id: string;
    titulo: string;
    explicacao: string;
    /** Ausente quando o destino não é uma seção daqui. */
    acao?: string;
    icone: React.ReactNode;
    aoAbrir?: () => void;
  }> = [];

  if (numeros.aguardando > 0) {
    pendencias.push({
      id: 'aguardando',
      titulo: `${numeros.aguardando} ${
        numeros.aguardando === 1 ? 'pedido aguarda' : 'pedidos aguardam'
      } sua decisão`,
      explicacao: 'Atestados e folgas que ninguém aprovou nem recusou ainda',
      acao: 'Decidir',
      icone: <Stethoscope className="w-4 h-4" />,
      aoAbrir: () => setSecao('atestados'),
    });
  }

  if (numeros.comPendencia > 0) {
    pendencias.push({
      id: 'sem-bater',
      titulo: `${numeros.comPendencia} ${
        numeros.comPendencia === 1 ? 'pessoa ficou' : 'pessoas ficaram'
      } sem bater`,
      explicacao: 'Faltou batida num dia que já fechou — o espelho não fecha assim',
      acao: 'Ver espelhos',
      icone: <AlertTriangle className="w-4 h-4" />,
      aoAbrir: () => setSecao('espelhos'),
    });
  }

  if (numeros.semResponsavel > 0) {
    pendencias.push({
      id: 'sem-responsavel',
      titulo: `${numeros.semResponsavel} ${
        numeros.semResponsavel === 1 ? 'pessoa bate ponto e não tem' : 'pessoas batem ponto e não têm'
      } quem aprove`,
      explicacao: 'A hora delas não chega a líder nenhum — posicione na aba Organograma',
      icone: <Users className="w-4 h-4" />,
    });
  }

  const abas: Array<{ id: Secao; rotulo: string; icone: React.ReactNode; alerta?: boolean }> = [
    { id: 'painel', rotulo: 'Painel', icone: <ClipboardList className="w-3.5 h-3.5" /> },
    { id: 'holerites', rotulo: 'Holerites', icone: <Receipt className="w-3.5 h-3.5" /> },
    {
      id: 'atestados',
      rotulo: 'Atestados',
      icone: <Stethoscope className="w-3.5 h-3.5" />,
      alerta: numeros.aguardando > 0,
    },
    {
      id: 'advertencias',
      rotulo: 'Advertências',
      icone: <AlertTriangle className="w-3.5 h-3.5" />,
    },
    { id: 'escala', rotulo: 'Escala de folgas', icone: <CalendarDays className="w-3.5 h-3.5" /> },
    { id: 'espelhos', rotulo: 'Espelhos de ponto', icone: <FileText className="w-3.5 h-3.5" /> },
  ];

  return (
    <div className="w-full flex flex-col">
      {/* A barra das seções: uma linha só, e ela cabe no celular rolando */}
      <nav className="px-4 sm:px-6 pt-4 flex gap-1.5 overflow-x-auto no-scrollbar flex-shrink-0">
        {abas.map((aba) => (
          <button
            key={aba.id}
            type="button"
            id={`aba-rh-${aba.id}`}
            onClick={() => setSecao(aba.id)}
            className={`px-3.5 py-2 rounded-lg text-xs font-bold flex items-center gap-1.5 whitespace-nowrap transition-colors border ${
              secao === aba.id
                ? 'bg-[var(--c-acento)] text-[var(--c-sobre-acento)] border-[var(--c-acento)] shadow-xs'
                : 'bg-[var(--c-superficie)] text-[var(--c-texto-3)] border-[var(--c-borda)] hover:text-[var(--c-texto-2)]'
            }`}
          >
            {aba.icone}
            {aba.rotulo}
            {aba.alerta && (
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500 flex-shrink-0" />
            )}
          </button>
        ))}
      </nav>

      {secao === 'painel' && (
        <div className="p-4 sm:p-6 flex flex-col gap-6 max-w-[1100px]">
          {/*
            ===============================================================
            PRIMEIRO O QUE ESPERA DECISÃO. DEPOIS O RESTO.
            ===============================================================

            Eram seis cartões do mesmo tamanho, na mesma cor, na mesma
            linha. "Pessoas ativas: 89" — um número que não muda e não pede
            nada — com o mesmo peso de "Aguardando decisão: 1", que é
            alguém parado esperando resposta. Quem abre não sabe por onde
            começar, e quem nunca usou o sistema menos ainda.

            Agora são duas coisas separadas: o que precisa de você, com
            nome, verbo e caminho; e os números da rede, pequenos, embaixo,
            porque conferir não é agir.
          */}
          <section className="flex flex-col gap-2.5">
            <div>
              <h2 className="text-sm font-bold text-[var(--c-texto)]">Precisa de você</h2>
              <p className="text-xs text-[var(--c-texto-3)]">
                O que está parado esperando uma decisão do RH.
              </p>
            </div>

            {pendencias.length === 0 ? (
              /*
                O estado calmo é uma FRASE, e não um cartão verde grande.
                Nada esperando não é conquista para comemorar toda vez que
                se abre a tela — é o normal, e o normal merece uma linha.
              */
              <div className="p-3.5 rounded-xl bg-[var(--c-superficie)] border border-[var(--c-borda)] flex items-center gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-[var(--c-ok)] flex-shrink-0" />
                <p className="text-xs text-[var(--c-texto-2)]">
                  Nada esperando decisão. O que chegar aparece aqui.
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {pendencias.map((p) => {
                  /*
                    Com destino vira botão; sem destino, uma faixa. Um
                    botão que não leva a lugar nenhum é pior do que texto:
                    a pessoa toca, nada acontece, e ela passa a desconfiar
                    dos outros também.
                  */
                  const Caixa = p.aoAbrir ? 'button' : 'div';
                  return (
                    <Caixa
                      key={p.id}
                      {...(p.aoAbrir
                        ? { type: 'button' as const, onClick: p.aoAbrir }
                        : {})}
                      className={`w-full p-3.5 rounded-xl bg-[var(--c-superficie)] border border-amber-500/30 flex items-center gap-3 text-left transition-colors ${
                        p.aoAbrir ? 'hover:border-amber-500/60 group' : ''
                      }`}
                    >
                      <span className="w-9 h-9 rounded-lg bg-amber-500/10 text-amber-600 flex items-center justify-center flex-shrink-0">
                        {p.icone}
                      </span>

                      <span className="flex-1 min-w-0">
                        <span className="block text-sm font-bold text-[var(--c-texto)]">
                          {p.titulo}
                        </span>
                        <span className="block text-xs text-[var(--c-texto-3)]">
                          {p.explicacao}
                        </span>
                      </span>

                      {p.acao && (
                        <span className="text-xs font-bold text-[var(--c-acento)] whitespace-nowrap group-hover:underline">
                          {p.acao} →
                        </span>
                      )}
                    </Caixa>
                  );
                })}
              </div>
            )}
          </section>

          <section className="flex flex-col gap-2.5">
            <div>
              <h2 className="text-sm font-bold text-[var(--c-texto)]">A rede em números</h2>
              <p className="text-xs text-[var(--c-texto-3)]">
                Saem do que o sistema já sabe — ninguém digita nada aqui.
              </p>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <Indicador
                rotulo="Pessoas ativas"
                valor={numeros.pessoas}
                detalhe="na rede inteira"
                icone={<Users className="w-3.5 h-3.5" />}
              />

              <Indicador
                rotulo="Saldo da rede"
                valor={formatarSaldo(numeros.saldoDaRede)}
                /**
                 * "Já fechados" está escrito porque o número mudou de
                 * significado: ele somava o ciclo INTEIRO, futuro incluído,
                 * e numa segunda de manhã a rede aparecia devendo a semana
                 * que nem tinha começado. Agora só conta dia encerrado — e o
                 * rótulo diz isso, para ninguém procurar no sábado um número
                 * que só fecha na sexta.
                 */
                detalhe="nos dias já fechados do ciclo"
                icone={<TrendingDown className="w-3.5 h-3.5" />}
                aoAbrir={() => setSecao('espelhos')}
              />

              <Indicador
                rotulo="Atestados no mês"
                valor={numeros.atestadosDoMes}
                detalhe="entregues neste mês"
                icone={<Stethoscope className="w-3.5 h-3.5" />}
                aoAbrir={() => setSecao('atestados')}
              />

              <Indicador
                rotulo="Sem responsável"
                valor={numeros.semResponsavel}
                detalhe={
                  numeros.semResponsavel > 0
                    ? 'batem ponto e ninguém aprova'
                    : 'todo mundo tem quem aprove'
                }
                icone={
                  numeros.semResponsavel > 0 ? (
                    <AlertTriangle className="w-3.5 h-3.5" />
                  ) : (
                    <CheckCircle2 className="w-3.5 h-3.5" />
                  )
                }
              />
            </div>
          </section>
        </div>
      )}

      {secao === 'holerites' && <AbaHolerites colaboradorAtual={colaboradorAtual} />}
      {secao === 'atestados' && <AbaAtestados colaboradorAtual={colaboradorAtual} />}
      {secao === 'advertencias' && <AbaAdvertencias colaboradorAtual={colaboradorAtual} />}

      {/*
        Escala e espelhos são as MESMAS telas de sempre, e não cópias. Elas
        mudaram de lugar para quem cuida de pessoas: quem tem esta aba não as
        vê mais em Equipe & Ponto, para ninguém encontrar a mesma sala por
        duas portas.
      */}
      {secao === 'escala' && (
        <div className="p-4 sm:p-6">
          <EscalaDeFolgas colaboradorAtual={colaboradorAtual} />
        </div>
      )}

      {secao === 'espelhos' && (
        <BancoDeHoras colaboradorAtual={colaboradorAtual} abaFixa="banco_horas" />
      )}
    </div>
  );
};
