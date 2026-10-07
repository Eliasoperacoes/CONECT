/**
 * "VOCÊ AINDA NÃO BATEU O PONTO" — o alerta de cada marcação esquecida.
 *
 * Pedido do Elias (07/10/2026): passados os 5 minutos da CLT (art. 58,
 * § 1º) do horário previsto, avisar a pessoa — nas quatro marcações
 * (entrada, saída e retorno do almoço, saída). Só a pessoa: quem
 * responde por ela continua vendo em Pendências › Sem bater hoje.
 *
 * ===================================================================
 * UM ALERTA POR MARCAÇÃO, SEM GUARDAR NADA
 * ===================================================================
 *
 * O agendador chama a cada `JANELA_DO_ALERTA_MIN` minutos. Cada marcação
 * tem UMA janela — do fim da tolerância até `JANELA_DO_ALERTA_MIN` depois
 * — e só a chamada que cai dentro dela avisa. Assim ninguém recebe o
 * mesmo alerta duas vezes, e não há tabela de "já avisado" para ler e
 * gravar 200 vezes por dia.
 *
 * ===================================================================
 * SÓ A PRÓXIMA MARCAÇÃO
 * ===================================================================
 *
 * O alerta é da marcação que o aplicativo espera agora — a mesma que a
 * próxima batida vai registrar. Quem não veio recebe o da entrada, e
 * não mais três ao longo do dia; quem esqueceu a saída para o almoço e
 * só bateu na volta tem a volta registrada como saída, e é dela que se
 * fala dali em diante.
 *
 * Quem decide se o dia cobra batida e a que horas é o mesmo das telas e
 * da madrugada (`apuracaoDoDia`): folga, atestado, férias, feriado e o
 * sábado de quem não trabalha no sábado não cobram nada.
 */
import {
  Colaborador,
  ROTULO_MARCACAO,
  TOLERANCIA_POR_MARCACAO_PADRAO_MINUTOS,
  TURNO_SABADO,
  TipoMarcacao,
  turnoDe,
} from '../tipos';
import {
  ehSabado,
  hojeEmBrasilia,
  horariosEsperadosDoDia,
  marcacoesEsperadas,
  minutosEmBrasilia,
} from '../servicos/apuracaoDoDia';
import { ligarFonte, DadosDaApuracao } from './apurarPonto';
import type { Lembrete } from './lembretes';

/** De quanto em quanto tempo o agendador chama. Mudou lá, muda aqui. */
export const JANELA_DO_ALERTA_MIN = 5;

export type DadosDoAlertaSemBater = Pick<
  DadosDaApuracao,
  'colaboradores' | 'batidas' | 'ausencias' | 'feriados' | 'permissoes'
>;

const emMinutos = (hora: string): number => {
  const [h, m] = hora.split(':').map(Number);
  return h * 60 + m;
};

const comoHora = (minutos: number): string =>
  `${String(Math.floor(minutos / 60)).padStart(2, '0')}:${String(minutos % 60).padStart(2, '0')}`;

/**
 * A HORA EM QUE ESTA MARCAÇÃO ERA ESPERADA, ou null se não há hora a
 * cobrar (o estágio de horário combinado com a área só tem a entrada,
 * como em "Sem bater hoje").
 *
 * A volta do almoço conta a partir da saída DE VERDADE: quem saiu às
 * 12:40 tem até 14:10 num intervalo de 1h30 — avisar às 14:05 seria
 * cobrar o almoço que a lei garante.
 */
const horaEsperada = (
  colaborador: Colaborador,
  data: string,
  tipo: TipoMarcacao,
  saidaAlmoco: number | null
): number | null => {
  const horarios = horariosEsperadosDoDia(colaborador, data);
  if (tipo === 'entrada') {
    return horarios?.entrada ?? emMinutos(ehSabado(data) ? TURNO_SABADO.entrada : turnoDe(colaborador).entrada);
  }
  const esperado = horarios?.[tipo];
  if (esperado === undefined) return null;
  if (tipo === 'retorno_almoco' && saidaAlmoco !== null && horarios?.saida_almoco !== undefined) {
    return Math.max(esperado, saidaAlmoco + (esperado - horarios.saida_almoco));
  }
  return esperado;
};

export const planejarAlertasSemBater = (dados: DadosDoAlertaSemBater, agora: Date): Lembrete[] => {
  const hoje = hojeEmBrasilia(agora);
  const { batePonto } = ligarFonte({ ...dados, ajustes: [] }, hoje);
  const minutoAgora = minutosEmBrasilia(agora.toISOString());

  const batidasDe = new Map<string, Map<TipoMarcacao, number>>();
  for (const b of dados.batidas) {
    if (b.data !== hoje) continue;
    const dela = batidasDe.get(b.colaboradorId) ?? new Map<TipoMarcacao, number>();
    dela.set(b.tipo, minutosEmBrasilia(b.horario));
    batidasDe.set(b.colaboradorId, dela);
  }

  const alertas: Lembrete[] = [];
  for (const c of dados.colaboradores) {
    if (c.ativo === false || !batePonto(c)) continue;

    const feitas = batidasDe.get(c.id) ?? new Map<TipoMarcacao, number>();
    const proxima = marcacoesEsperadas(hoje, c).find((t) => !feitas.has(t));
    if (!proxima) continue;

    const esperado = horaEsperada(c, hoje, proxima, feitas.get('saida_almoco') ?? null);
    if (esperado === null) continue;

    const fimDaTolerancia = esperado + TOLERANCIA_POR_MARCACAO_PADRAO_MINUTOS;
    if (!(minutoAgora > fimDaTolerancia && minutoAgora <= fimDaTolerancia + JANELA_DO_ALERTA_MIN)) continue;

    const rotulo = ROTULO_MARCACAO[proxima];
    alertas.push({
      colaboradorId: c.id,
      dados: {
        tipo: 'secao',
        conversaId: 'meu_ponto',
        // Fixo por pessoa: o alerta novo substitui o anterior na barra
        mensagemId: `sem-bater-${c.id}`,
        ehGrupo: 'true',
        remetente: 'Ponto',
        conversa: 'Você ainda não bateu o ponto',
        // Sem concordar com o rótulo: "Saída" e "Retorno" pediriam gêneros
        texto: `${rotulo} · horário previsto ${comoHora(esperado)}. Toque para bater o ponto.`,
      },
    });
  }
  return alertas;
};
