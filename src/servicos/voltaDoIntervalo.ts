/**
 * "FOI INTERVALO?" — a sugestão que o líder vê em "Fora da jornada"
 * (15/10/2026).
 *
 * O estagiário não tem intervalo: bate entrada e saída. No dia de hora
 * extra autorizada ele almoça e volta — a saída do almoço já entrou como
 * saída, e a volta e a saída de verdade caem fora da jornada. Em vez de o
 * RH arrumar pelo espelho, o líder vê "Saiu às 12:30 e voltou às 13:30.
 * Foi intervalo?" e confirma num toque. A correção sai em nome dele.
 *
 * Isto só SUGERE. Quem decide, e confere tudo de novo, é o banco
 * (`tratar_como_intervalo`, volta-do-intervalo.sql) — a mesma regra nos dois
 * lugares de propósito, como a alçada; mudou uma, mude a outra.
 */
import type { Colaborador, RegistroPonto } from '../tipos';
import type { MarcacaoParaTratar } from './ponto';

/**
 * 15 MINUTOS: o intervalo mínimo da CLT de quem trabalha mais de 4 e até 6
 * horas (art. 71, §1º). Abaixo disso é batida repetida, não almoço — o caso
 * do Yan, que bateu a mesma marcação duas vezes.
 */
export const INTERVALO_MINIMO_MINUTOS = 15;

/** Entre a volta e a saída de verdade: a mesma janela da batida repetida */
const ENTRE_VOLTA_E_SAIDA_MINUTOS = 2;

export interface SugestaoDeIntervalo {
  colaborador: Colaborador;
  data: string;
  /** "12:30" — a saída que vira saída para almoço */
  saida: string;
  volta: MarcacaoParaTratar;
  /** A saída de verdade, quando a pessoa já bateu */
  saidaFinal?: MarcacaoParaTratar;
}

const minutos = (hora: string): number => {
  const [h, m] = hora.split(':').map(Number);
  return h * 60 + m;
};

/**
 * Os dias que parecem "saiu e voltou": têm saída e nenhum intervalo, e uma
 * marcação fora da jornada 15 minutos ou mais depois da saída.
 */
export const sugestoesDeIntervalo = (
  marcacoes: MarcacaoParaTratar[],
  registrosDoDia: (colaboradorId: string, data: string) => RegistroPonto[]
): SugestaoDeIntervalo[] => {
  const porDia = new Map<string, MarcacaoParaTratar[]>();
  for (const m of marcacoes) {
    const chave = `${m.colaborador.id}|${m.data}`;
    porDia.set(chave, [...(porDia.get(chave) || []), m]);
  }

  const sugestoes: SugestaoDeIntervalo[] = [];
  for (const doDia of porDia.values()) {
    const { colaborador, data } = doDia[0];
    const registros = registrosDoDia(colaborador.id, data);
    const saida = registros.find((r) => r.tipo === 'saida');
    if (!saida) continue;
    if (registros.some((r) => r.tipo === 'saida_almoco' || r.tipo === 'retorno_almoco')) continue;

    const depois = doDia
      .filter((m) => minutos(m.hora) >= minutos(saida.horaFormatada) + INTERVALO_MINIMO_MINUTOS)
      .sort((a, b) => minutos(a.hora) - minutos(b.hora));
    if (depois.length === 0) continue;

    const [volta] = depois;
    const saidaFinal = [...depois]
      .reverse()
      .find((m) => minutos(m.hora) >= minutos(volta.hora) + ENTRE_VOLTA_E_SAIDA_MINUTOS);
    sugestoes.push({ colaborador, data, saida: saida.horaFormatada, volta, saidaFinal });
  }
  return sugestoes;
};
