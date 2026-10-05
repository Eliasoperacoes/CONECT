/**
 * A PREVISÃO DO TEMPO DO INÍCIO — a cidade da loja da pessoa, hoje.
 *
 * Pedido do Elias (05/10/2026): enriquecer o Início com o que é do dia,
 * "tipo tempo". Vem do Open-Meteo: gratuito, sem chave, sem cadastro, e
 * responde ao navegador direto (não precisa de servidor no meio).
 *
 * A cidade sai do cadastro único das lojas (`INFORMACOES_LOJAS`). A
 * resposta fica 30 minutos no aparelho: a previsão do dia não muda a cada
 * troca de tela, e 89 pessoas abrindo o Início não viram 89 pedidos.
 */
import { INFORMACOES_LOJAS } from '../tipos';

export interface Previsao {
  cidade: string;
  /** Agora, em °C, arredondado. */
  agora: number;
  maxima: number;
  minima: number;
  /** Chance de chuva no dia, em %. */
  chuva: number;
  /** O código do clima (WMO), para o texto e o ícone. */
  codigo: number;
  ehDia: boolean;
}

export type IconeDoTempo = 'sol' | 'lua' | 'parcial' | 'nublado' | 'neblina' | 'garoa' | 'chuva' | 'tempestade';

/**
 * O CÓDIGO DO CLIMA EM PORTUGUÊS (tabela WMO, a que o Open-Meteo usa).
 * Só os grupos que fazem diferença para quem vai sair de casa.
 */
export const descreverTempo = (codigo: number, ehDia = true): { texto: string; icone: IconeDoTempo } => {
  if (codigo === 0) return { texto: 'Céu limpo', icone: ehDia ? 'sol' : 'lua' };
  if (codigo === 1 || codigo === 2) return { texto: 'Parcialmente nublado', icone: 'parcial' };
  if (codigo === 3) return { texto: 'Nublado', icone: 'nublado' };
  if (codigo === 45 || codigo === 48) return { texto: 'Neblina', icone: 'neblina' };
  if (codigo >= 51 && codigo <= 57) return { texto: 'Garoa', icone: 'garoa' };
  if ((codigo >= 61 && codigo <= 67) || (codigo >= 80 && codigo <= 82)) return { texto: 'Chuva', icone: 'chuva' };
  if (codigo >= 95) return { texto: 'Tempestade', icone: 'tempestade' };
  return { texto: 'Tempo instável', icone: 'nublado' };
};

/** A cidade e as coordenadas da loja; a matriz quando a loja não é conhecida. */
export const lugarDaLoja = (loja: string) => {
  const info = INFORMACOES_LOJAS.find((l) => l.nome === loja) ?? INFORMACOES_LOJAS[0];
  // "Pirassununga - SP" → "Pirassununga"; a central diz a cidade da matriz
  const cidade = info.tipo === 'Central' ? INFORMACOES_LOJAS[0].cidade : info.cidade;
  return { cidade: cidade.replace(/ - [A-Z]{2}$/, ''), ...info.coordenadas };
};

export const enderecoDaPrevisao = (latitude: number, longitude: number): string =>
  'https://api.open-meteo.com/v1/forecast' +
  `?latitude=${latitude}&longitude=${longitude}` +
  '&current=temperature_2m,weather_code,is_day' +
  '&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,weather_code' +
  '&timezone=America%2FSao_Paulo&forecast_days=1';

/** Lê a resposta; sem os campos esperados, não há previsão (e nada aparece quebrado). */
export const lerPrevisao = (cidade: string, json: unknown): Previsao | null => {
  const r = json as {
    current?: { temperature_2m?: number; weather_code?: number; is_day?: number };
    daily?: { temperature_2m_max?: number[]; temperature_2m_min?: number[]; precipitation_probability_max?: number[] };
  };
  const agora = r?.current?.temperature_2m;
  const maxima = r?.daily?.temperature_2m_max?.[0];
  const minima = r?.daily?.temperature_2m_min?.[0];
  if (typeof agora !== 'number' || typeof maxima !== 'number' || typeof minima !== 'number') return null;
  return {
    cidade,
    agora: Math.round(agora),
    maxima: Math.round(maxima),
    minima: Math.round(minima),
    chuva: Math.round(r.daily?.precipitation_probability_max?.[0] ?? 0),
    codigo: r.current?.weather_code ?? 3,
    ehDia: r.current?.is_day !== 0,
  };
};

const VALIDADE_MS = 30 * 60 * 1000;

/** A previsão da cidade da loja — do aparelho se tiver menos de 30 minutos. */
export const buscarPrevisao = async (loja: string): Promise<Previsao | null> => {
  const lugar = lugarDaLoja(loja);
  const chave = `conecta:tempo:${lugar.cidade}`;
  try {
    const guardada = JSON.parse(sessionStorage.getItem(chave) || 'null') as { em: number; previsao: Previsao } | null;
    if (guardada && Date.now() - guardada.em < VALIDADE_MS) return guardada.previsao;
  } catch {
    /* sem armazenamento: pede de novo */
  }
  try {
    const resposta = await fetch(enderecoDaPrevisao(lugar.latitude, lugar.longitude));
    if (!resposta.ok) return null;
    const previsao = lerPrevisao(lugar.cidade, await resposta.json());
    if (previsao) {
      try {
        sessionStorage.setItem(chave, JSON.stringify({ em: Date.now(), previsao }));
      } catch {
        /* só não guarda */
      }
    }
    return previsao;
  } catch {
    // Sem internet de fora: o cartão do tempo simplesmente não aparece
    return null;
  }
};
