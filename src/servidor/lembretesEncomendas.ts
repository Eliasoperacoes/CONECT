/**
 * OS LEMBRETES DAS ENCOMENDAS (SPEC-comunicacao-recebimento, Elias 26/10/2026:
 * "é de extrema importância notificações em todos os processos").
 *
 * Roda de hora em hora no horário das lojas (`?encomendas=1` da
 * lembrar-pendencias). Nada fica parado sem alguém saber:
 *
 *   - VENDEDOR: a peça em conferência há 4 h sem o "Recebi";
 *   - GERENTE DA LOJA: a mesma peça há 1 dia — ele pode confirmar pelo vendedor;
 *   - VENDEDOR: recebida há 7 dias e não entregue ao cliente;
 *   - COMPRAS, uma vez por dia (9h): parada há 3 dias sem pedido, pedido que
 *     passou do dia previsto, problema aberto, desistência sem destino.
 *
 * Sem guardar "já lembrei": cada lembrete tem uma janela de 1 hora, que se
 * repete a cada 24 h até resolver. Rodando de hora em hora, cada janela é
 * vista uma vez só — o mesmo que o `semBater` faz com 5 minutos.
 * Sem banco e sem Deno: só dados entram, e a lista de avisos sai.
 */
import type { Lembrete } from './lembretes';
import { conversaComCompras } from '../servicos/conversaComCompras';
import { hojeEmBrasilia } from '../servicos/apuracaoDoDia';

export const HORAS_PARA_O_RECEBI = 4;
export const HORAS_PARA_O_GERENTE = 24;
export const DIAS_SEM_ENTREGAR = 7;
export const DIAS_PARADA = 3;
/** A hora (Brasília) do resumo diário de Compras */
export const HORA_DO_RESUMO = 9;

export interface EncomendaParaLembrar {
  id: string;
  codigo: string;
  quantidade: number;
  situacao: string;
  vendedorId: string | null;
  loja: string | null;
  criadaEm: string;
  conferenciaEm: string | null;
  recebidaEm: string | null;
  /** O dia previsto de chegada, gravado no pedido (AAAA-MM-DD) */
  previsaoChegada: string | null;
  problemaAberto: boolean;
  desistiuSemDestino: boolean;
}

export interface PessoaParaLembrar {
  id: string;
  setor: string;
  loja: string;
  nivel: number;
  ativo?: boolean;
}

const HORA = 3_600_000;

/** O horário em que o agendamento roda (lembretes-encomendas.sql): de hora em hora, 7h–19h, segunda a sábado */
export const PRIMEIRA_RODADA = 7;
export const ULTIMA_RODADA = 19;

/** Hora e dia da semana em Brasília (o servidor roda em UTC) */
const emBrasilia = (t: Date) => {
  const p = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Sao_Paulo', hour: 'numeric', hour12: false, weekday: 'short' }).formatToParts(t);
  return { hora: Number(p.find((x) => x.type === 'hour')!.value) % 24, domingo: p.find((x) => x.type === 'weekday')!.value === 'Sun' };
};

/**
 * A primeira rodada do agendamento em `t` ou depois. A peça que passou do
 * prazo às 20h é lembrada às 7h do dia seguinte (domingo, na segunda) — e
 * não numa hora em que o agendamento nunca roda.
 */
export const primeiraRodadaDesde = (t: Date): Date => {
  let r = new Date(Math.ceil(t.getTime() / HORA) * HORA);
  for (let i = 0; i < 24 * 8; i++) {
    const { hora, domingo } = emBrasilia(r);
    if (!domingo && hora >= PRIMEIRA_RODADA && hora <= ULTIMA_RODADA) return r;
    r = new Date(r.getTime() + HORA);
  }
  return r;
};

/** Passou `horas`, e esta é a rodada do lembrete (a primeira depois do prazo, e a mesma hora nos dias seguintes)? */
export const naJanela = (desde: string | null, horas: number, agora: Date): boolean => {
  if (!desde) return false;
  const alvo = primeiraRodadaDesde(new Date(new Date(desde).getTime() + horas * HORA));
  const h = (agora.getTime() - alvo.getTime()) / HORA;
  return h >= 0 && h % 24 < 1;
};

const horaEmBrasilia = (agora: Date) => Number(agora.toLocaleString('en-US', { hour: 'numeric', hour12: false, timeZone: 'America/Sao_Paulo' })) % 24;

const porPessoa = <T,>(lista: T[], de: (x: T) => string | null): Map<string, T[]> => {
  const m = new Map<string, T[]>();
  for (const x of lista) {
    const k = de(x);
    if (k) m.set(k, [...(m.get(k) ?? []), x]);
  }
  return m;
};

const pecas = (l: EncomendaParaLembrar[]) => (l.length === 1 ? `${l[0].quantidade}× ${l[0].codigo}` : `${l.length} peças`);

export const planejarLembretesDeEncomendas = (encomendas: EncomendaParaLembrar[], pessoas: PessoaParaLembrar[], agora: Date): Lembrete[] => {
  const ativas = pessoas.filter((p) => p.ativo !== false);
  const ativo = new Set(ativas.map((p) => p.id));
  const lembretes: Lembrete[] = [];
  // `mensagemId` fixo por pessoa e assunto: o lembrete novo substitui o velho na barra
  const aviso = (colaboradorId: string, assunto: string, dados: Record<string, string>): Lembrete => ({
    colaboradorId,
    dados: { mensagemId: `lembrete-encomenda-${assunto}-${colaboradorId}`, ehGrupo: 'true', remetente: 'Encomendas', ...dados },
  });
  const naConversaDele = (vendedor: string) => ({ tipo: 'conversa', conversaId: conversaComCompras(vendedor) });

  // VENDEDOR: o "Recebi" esquecido
  const semRecebi = encomendas.filter((e) => e.situacao === 'em_conferencia' && naJanela(e.conferenciaEm, HORAS_PARA_O_RECEBI, agora));
  for (const [vendedor, suas] of porPessoa(semRecebi, (e) => e.vendedorId)) {
    if (!ativo.has(vendedor)) continue;
    lembretes.push(
      aviso(vendedor, 'recebi', {
        ...naConversaDele(vendedor),
        conversa: 'Peça esperando o Recebi',
        texto: `${pecas(suas)} ${suas.length === 1 ? 'está' : 'estão'} em conferência na loja. Confira e toque "Recebi".`,
      })
    );
  }

  // GERENTE DA LOJA: 1 dia sem o "Recebi" — ele pode confirmar pelo vendedor
  const paraGerente = encomendas.filter((e) => e.situacao === 'em_conferencia' && naJanela(e.conferenciaEm, HORAS_PARA_O_GERENTE, agora));
  for (const [loja, daLoja] of porPessoa(paraGerente, (e) => e.loja)) {
    for (const g of ativas.filter((p) => p.nivel >= 3 && p.loja === loja)) {
      const deOutros = daLoja.filter((e) => e.vendedorId !== g.id);
      if (!deOutros.length) continue;
      lembretes.push(
        aviso(g.id, 'gerente', {
          conversa: 'Peça parada na loja',
          texto: `${pecas(deOutros)} em conferência há mais de 1 dia sem o "Recebi" do vendedor. Você pode confirmar em Encomendas.`,
        })
      );
    }
  }

  // VENDEDOR: recebida e não entregue ao cliente
  const naoEntregues = encomendas.filter((e) => e.situacao === 'recebida' && naJanela(e.recebidaEm, DIAS_SEM_ENTREGAR * 24, agora));
  for (const [vendedor, suas] of porPessoa(naoEntregues, (e) => e.vendedorId)) {
    if (!ativo.has(vendedor)) continue;
    lembretes.push(
      aviso(vendedor, 'entrega', {
        ...naConversaDele(vendedor),
        conversa: 'Peça não entregue',
        texto: `${pecas(suas)} recebida${suas.length === 1 ? '' : 's'} há ${DIAS_SEM_ENTREGAR} dias e ainda não entregue${suas.length === 1 ? '' : 's'} ao cliente. Avise o cliente ou marque "Entregue".`,
      })
    );
  }

  // COMPRAS: o resumo do dia, uma vez, às 9h
  if (horaEmBrasilia(agora) === HORA_DO_RESUMO) {
    const hoje = hojeEmBrasilia(agora);
    const paradas = encomendas.filter((e) => e.situacao === 'encomendada' && agora.getTime() - new Date(e.criadaEm).getTime() >= DIAS_PARADA * 24 * HORA);
    const atrasadas = encomendas.filter((e) => e.situacao === 'pedido_realizado' && !!e.previsaoChegada && e.previsaoChegada < hoje);
    const problemas = encomendas.filter((e) => e.problemaAberto);
    const desistencias = encomendas.filter((e) => e.desistiuSemDestino);
    const partes = [
      paradas.length && `${paradas.length} parada${paradas.length === 1 ? '' : 's'} há ${DIAS_PARADA}+ dias sem pedido`,
      atrasadas.length && `${atrasadas.length} pedido${atrasadas.length === 1 ? '' : 's'} atrasado${atrasadas.length === 1 ? '' : 's'}`,
      problemas.length && `${problemas.length} problema${problemas.length === 1 ? '' : 's'} para resolver`,
      desistencias.length && `${desistencias.length} desistência${desistencias.length === 1 ? '' : 's'} sem destino`,
    ].filter(Boolean);
    if (partes.length) {
      for (const c of ativas.filter((p) => p.setor === 'Compras')) {
        lembretes.push(aviso(c.id, 'compras', { conversa: 'Encomendas do dia', texto: `Encomendas: ${partes.join(' · ')}.` }));
      }
    }
  }

  return lembretes;
};
