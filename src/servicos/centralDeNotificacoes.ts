/**
 * Central de notificações — CONECTA / Malachias Autopeças
 *
 * O que está esperando a pessoa, num lugar só.
 *
 * ===================================================================
 * POR QUE ISTO EXISTE
 * ===================================================================
 *
 * O sistema tinha aviso do Windows e mais nada. Quem estava com a tela
 * aberta não era avisado de coisa nenhuma — e, para compensar, o aviso
 * passou a disparar também na abertura. Virou o pior dos dois mundos: a
 * mesma notificação da mesma pendência a cada login, e nada enquanto a
 * pessoa trabalhava.
 *
 * O sino resolve a necessidade sem interromper: mostra o que espera, o
 * tempo todo, e a notificação do sistema volta a ser só para quem não
 * está olhando.
 *
 * ===================================================================
 * DISPENSAR TIRA O AVISO, NUNCA O TRABALHO
 * ===================================================================
 *
 * Dispensar uma notificação — no "x" dela ou no "Limpar" de todas — a
 * tira DAQUI, e só daqui. A jornada continua esperando decisão na tela
 * de Aprovar jornadas, com o número dela na aba; o pedido de folga
 * continua na Escala; a mensagem continua por ler na conversa.
 *
 * Esta é a distinção que faz o sino ser seguro: ele é o aviso, não a
 * fila. Quem guarda o trabalho é a tela onde ele se resolve, e nenhum
 * toque aqui apaga nada de lá.
 *
 * Mensagem dispensada volta a avisar quando chega OUTRA mensagem na
 * conversa — o id acompanha a última mensagem, então a conversa que se
 * mexeu de novo é uma novidade de novo.
 *
 * ===================================================================
 * O AVISO É DE QUEM RESPONDE PELA PESSOA
 * ===================================================================
 *
 * Não de todo mundo que teria autoridade para decidir. A diferença mora
 * em `deveSerAvisadoSobre`, no organograma, com o porquê escrito lá.
 */

import { bancoDados } from './bancoDados';
import { servicoPonto, formatarDataBR } from './ponto';
import {
  pendenciasParaDecidir as pendenciasDeAusencia,
  pendenciasDeFolga,
} from './justificativas';
import { montarPreviaDaMensagem } from './nuvemComunicacao';
import { deveSerAvisadoSobre } from './organograma';
import { ROTULO_TIPO_AJUSTE, ROTULO_TIPO_AUSENCIA, type Colaborador } from '../tipos';

/**
 * Para onde o toque leva.
 *
 * `conversa` abre a janela; o resto é seção do sistema. Nenhum abre aba
 * do navegador: o CONECTA roda como aplicativo, e sair dele para voltar
 * ao mesmo lugar é perder o contexto por nada.
 */
export type SecaoDestino = 'aprovar_jornadas' | 'escala_folgas';

export type DestinoNotificacao =
  | { tipo: 'conversa'; conversaId: string }
  | { tipo: 'secao'; secao: SecaoDestino };

export type TipoNotificacao = 'mensagem' | 'jornada' | 'ausencia' | 'folga';

export interface ItemNotificacao {
  /**
   * Estável entre recarregamentos.
   *
   * É o que permite dizer "esta eu já vi". Um id sorteado faria tudo
   * voltar a ser novidade a cada abertura — exatamente o laço que o sino
   * veio desfazer.
   */
  id: string;
  tipo: TipoNotificacao;
  titulo: string;
  detalhe: string;
  /** ISO. Ordena a lista: o mais recente em cima. */
  quando: string;
  destino: DestinoNotificacao;
}

const CHAVE_DISPENSADAS = 'conecta_v4_notificacoes_dispensadas';

const ouvintes: Array<() => void> = [];

export const assinarNotificacoes = (ouvinte: () => void): (() => void) => {
  ouvintes.push(ouvinte);
  return () => {
    const i = ouvintes.indexOf(ouvinte);
    if (i !== -1) ouvintes.splice(i, 1);
  };
};

const avisar = (): void => ouvintes.forEach((o) => o());

/**
 * O que já foi dispensado, POR PESSOA.
 *
 * Guardado por colaborador de propósito: o balcão tem aparelho
 * compartilhado, e o que um dispensou não pode calar o aviso do outro.
 */
const lerDispensadas = (): Set<string> => {
  try {
    const eu = bancoDados.obterColaboradorAtual().id;
    const bruto = localStorage.getItem(`${CHAVE_DISPENSADAS}_${eu}`);
    const lido = bruto ? JSON.parse(bruto) : [];
    return new Set(Array.isArray(lido) ? (lido as string[]) : []);
  } catch {
    return new Set();
  }
};

const gravarDispensadas = (dispensadas: Set<string>): void => {
  try {
    const eu = bancoDados.obterColaboradorAtual().id;
    /**
     * Só as 300 mais recentes.
     *
     * A lista cresceria para sempre — e ninguém precisa lembrar de uma
     * mensagem dispensada há seis meses, porque a conversa dela já se
     * mexeu muitas vezes desde então.
     */
    const recorte = [...dispensadas].slice(-300);
    localStorage.setItem(`${CHAVE_DISPENSADAS}_${eu}`, JSON.stringify(recorte));
  } catch {
    // Armazenamento cheio ou bloqueado: o sino ainda funciona, só volta a
    // mostrar o que já foi dispensado. Melhor do que quebrar.
  }
};

/**
 * Este pedido é meu para acompanhar?
 *
 * A regra mora no organograma, e não aqui: quem responde por quem é
 * assunto dele, e uma segunda cópia desta conta é exatamente como as
 * telas deste sistema já passaram a discordar sobre quem aprova quem.
 */
const meuParaAcompanhar = (solicitante: Colaborador): boolean =>
  deveSerAvisadoSobre(
    bancoDados.obterColaboradorAtual(),
    solicitante,
    bancoDados.obterColaboradores()
  );

/** As mensagens por ler, agrupadas por conversa — uma linha por conversa. */
const deMensagens = (): ItemNotificacao[] => {
  const porConversa = new Map<string, { quantas: number; ultima: ReturnType<typeof bancoDados.obterMensagensPorLer>[number] }>();

  for (const m of bancoDados.obterMensagensPorLer()) {
    const atual = porConversa.get(m.conversaId);
    porConversa.set(m.conversaId, {
      quantas: (atual?.quantas || 0) + 1,
      ultima: m,
    });
  }

  return [...porConversa.entries()].map(([conversaId, { quantas, ultima }]) => {
    const conversa = bancoDados.obterConversaPorId(conversaId);
    const remetente = bancoDados.obterColaboradorPorId(ultima.remetenteId);
    const ehGrupo = conversa?.tipo === 'grupo';

    return {
      // A última mensagem identifica o estado da conversa: chegou outra,
      // vira notificação nova de novo
      id: `msg-${ultima.id}`,
      tipo: 'mensagem' as const,
      titulo: ehGrupo ? conversa?.nome || 'Grupo' : remetente?.nome || 'Mensagem',
      detalhe:
        quantas > 1
          ? `${quantas} mensagens novas`
          : ehGrupo
            ? `${remetente?.nome || 'Alguém'}: ${montarPreviaDaMensagem(ultima)}`
            : montarPreviaDaMensagem(ultima),
      quando: ultima.criadoEm,
      destino: { tipo: 'conversa' as const, conversaId },
      vista: false,
    };
  });
};

const deJornadas = (): ItemNotificacao[] =>
  servicoPonto
    .obterPendenciasParaDecidir()
    .filter(({ colaborador }) => meuParaAcompanhar(colaborador))
    .map(({ ajuste, colaborador }) => ({
      id: `jornada-${ajuste.id}`,
      tipo: 'jornada' as const,
      titulo: `${colaborador.nome} · aguarda sua decisão`,
      detalhe: `${ROTULO_TIPO_AJUSTE[ajuste.tipo]} em ${formatarDataBR(ajuste.data)}`,
      quando: ajuste.criadoEm,
      destino: { tipo: 'secao' as const, secao: 'aprovar_jornadas' as const },
    }));

const deAusencias = (): ItemNotificacao[] =>
  pendenciasDeAusencia()
    .filter(({ colaborador }) => meuParaAcompanhar(colaborador))
    .map(({ justificativa, colaborador }) => ({
      id: `ausencia-${justificativa.id}`,
      tipo: 'ausencia' as const,
      titulo: `${colaborador.nome} · ${ROTULO_TIPO_AUSENCIA[justificativa.tipo]}`,
      detalhe: `Aguardando sua decisão · ${formatarDataBR(justificativa.dataInicio)}`,
      quando: justificativa.criadoEm,
      destino: { tipo: 'secao' as const, secao: 'aprovar_jornadas' as const },
    }));

const deFolgas = (): ItemNotificacao[] =>
  pendenciasDeFolga()
    .filter(({ colaborador }) => meuParaAcompanhar(colaborador))
    .map(({ justificativa, colaborador }) => ({
      id: `folga-${justificativa.id}`,
      tipo: 'folga' as const,
      titulo: `${colaborador.nome} · folga de sábado`,
      detalhe: `Pedido para ${formatarDataBR(justificativa.dataInicio)}`,
      quando: justificativa.criadoEm,
      destino: { tipo: 'secao' as const, secao: 'escala_folgas' as const },
    }));

/**
 * ===================================================================
 * POR QUE OS AVISOS DA DIREÇÃO NÃO ESTÃO AQUI
 * ===================================================================
 *
 * `AvisoRede` tem o campo `lidoPorIds`, e a tentação era óbvia: aviso não
 * lido vira notificação. Só que NENHUMA tela do sistema escreve nesse
 * campo hoje — `CentralAvisos` só mostra os avisos, e não registra quem
 * leu.
 *
 * Um aviso que entrasse no sino nunca sairia dele. Seria uma notificação
 * que a pessoa não tem como resolver: abre, lê, volta, e ela continua
 * lá. É o mesmo laço de que o Elias reclamou, só que dentro do sino em
 * vez do Windows.
 *
 * Fica de fora até `CentralAvisos` marcar a leitura de verdade. Aí basta
 * acrescentar a fonte aqui — o resto do sino já aguenta.
 *
 * O aviso continua chegando pela faixa no topo e pela conversa
 * `grupo-avisos-da-rede`, como sempre chegou.
 */

/**
 * Tudo o que espera esta pessoa, do mais recente para o mais antigo.
 *
 * Cada fonte é lida do cache que a tela dela já usa — nenhuma ida ao
 * banco. O sino não pode custar uma consulta por vez que a tela pisca.
 */
export const listarNotificacoes = (): ItemNotificacao[] => {
  const dispensadas = lerDispensadas();

  return [...deMensagens(), ...deJornadas(), ...deAusencias(), ...deFolgas()]
    .filter((n) => !dispensadas.has(n.id))
    .sort((a, b) => (b.quando || '').localeCompare(a.quando || ''));
};

/** Quantas estão esperando. É o número do sino. */
export const contarNotificacoes = (): number => listarNotificacoes().length;

/**
 * Tira UMA do sino — o "x" de cada linha.
 *
 * Some o aviso, e só ele. A decisão continua esperando na tela dela.
 */
export const dispensarNotificacao = (id: string): void => {
  const dispensadas = lerDispensadas();
  if (dispensadas.has(id)) return;
  dispensadas.add(id);
  gravarDispensadas(dispensadas);
  avisar();
};

/**
 * Tira TODAS as que estão no sino agora.
 *
 * Só as de agora, de propósito: uma decisão que chegar depois volta a
 * avisar. "Limpar" é esvaziar a caixa, não desligar o sino.
 */
export const limparNotificacoes = (): void => {
  const dispensadas = lerDispensadas();
  for (const n of listarNotificacoes()) dispensadas.add(n.id);
  gravarDispensadas(dispensadas);
  avisar();
};
