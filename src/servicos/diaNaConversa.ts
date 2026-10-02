/**
 * O SEPARADOR DE DIA NA CONVERSA — "Hoje", "Ontem", "Segunda-feira", "15 de
 * setembro". Como no WhatsApp: sem ele, "15:40" ao lado de uma mensagem não
 * diz se foi hoje ou semana passada (S10, 02/10/2026).
 *
 * O dia é o do APARELHO de quem lê: é o "hoje" que a pessoa tem na cabeça.
 */

const MESES = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
];
const DIAS_DA_SEMANA = [
  'Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado',
];

/** "AAAA-MM-DD" no fuso do aparelho, ou '' se a data não presta. */
export const diaLocal = (iso: string | undefined, fusoDeTeste?: string): string => {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('sv-SE', fusoDeTeste ? { timeZone: fusoDeTeste } : undefined);
};

const emDias = (dia: string): number => {
  const [a, m, d] = dia.split('-').map(Number);
  return Math.round(Date.UTC(a, m - 1, d) / 86_400_000);
};

/** O rótulo do separador, para o dia "AAAA-MM-DD" visto de `hoje`. */
export const rotuloDoDia = (dia: string, hoje: string): string => {
  const distancia = emDias(hoje) - emDias(dia);
  if (distancia === 0) return 'Hoje';
  if (distancia === 1) return 'Ontem';
  const [a, m, d] = dia.split('-').map(Number);
  // Dentro da semana, o nome do dia: "Segunda-feira" é como se fala
  if (distancia > 1 && distancia < 7) return DIAS_DA_SEMANA[new Date(Date.UTC(a, m - 1, d)).getUTCDay()];
  if (hoje.slice(0, 4) === dia.slice(0, 4)) return `${d} de ${MESES[m - 1]}`;
  return `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${a}`;
};

/**
 * Onde entra um separador: antes da primeira mensagem de cada dia. Devolve,
 * para cada mensagem, o rótulo a pôr ANTES dela (ou null).
 */
export const separadoresDeDia = (
  mensagens: { criadoEm?: string }[],
  hoje: string,
  fusoDeTeste?: string
): (string | null)[] => {
  let anterior = '';
  return mensagens.map((m) => {
    const dia = diaLocal(m.criadoEm, fusoDeTeste);
    if (!dia || dia === anterior) return null;
    anterior = dia;
    return rotuloDoDia(dia, hoje);
  });
};
