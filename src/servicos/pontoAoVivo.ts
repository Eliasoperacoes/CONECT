/**
 * O PONTO AO VIVO: O EVENTO APLICADO, E NÃO A JANELA BAIXADA DE NOVO (21/10/2026)
 *
 * Cada batida da rede fazia o aparelho de quem a enxerga (RH, gerentes,
 * líderes) baixar outra vez a janela inteira — 62 dias, para o RH ~19 mil
 * batidas em 19 páginas — e comprimi-la. E cada apuração baixava TODAS as
 * apurações, sem janela nenhuma. Com ~350 batidas por dia, milhões de linhas
 * por dia por aparelho, concentradas no pico das 07:30.
 *
 * O evento ao vivo já traz a linha que mudou. Aqui uma fila de eventos é
 * aplicada a uma lista: insere ou troca pelo id, tira no apagar, e diz
 * quando é preciso a carga completa (evento sem a linha, tipo estranho).
 * Quem chama junta os eventos de uma rajada e aplica de uma vez — uma
 * compressão por rajada, e não uma por batida.
 */

export interface EventoAoVivo<L> {
  eventType: string;
  new?: Partial<L> | null;
  old?: Partial<L> | null;
}

export const aplicarEventosNaLista = <L extends { id: string }, T extends { id: string }>(
  lista: T[],
  eventos: EventoAoVivo<L>[],
  converter: (linha: L) => T,
  /** O item ainda pertence a esta lista? (a batida dentro da janela, por exemplo) */
  cabe: (item: T) => boolean = () => true
): { lista: T[]; recarregar: boolean; mudou: boolean } => {
  const porId = new Map(lista.map((item) => [item.id, item]));
  let mudou = false;
  for (const evento of eventos) {
    if (evento.eventType === 'DELETE') {
      const id = evento.old?.id;
      if (!id) return { lista, recarregar: true, mudou: false };
      if (porId.delete(id)) mudou = true;
      continue;
    }
    if (evento.eventType !== 'INSERT' && evento.eventType !== 'UPDATE') return { lista, recarregar: true, mudou: false };
    const linha = evento.new as L | null | undefined;
    if (!linha?.id) return { lista, recarregar: true, mudou: false };
    const item = converter(linha);
    if (cabe(item)) porId.set(item.id, item);
    else porId.delete(item.id);
    mudou = true;
  }
  return { lista: mudou ? [...porId.values()] : lista, recarregar: false, mudou };
};
