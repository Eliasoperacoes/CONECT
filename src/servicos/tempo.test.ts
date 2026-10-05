/**
 * A previsão do tempo do Início: a cidade certa, a resposta lida, o clima em português.
 */
import { test, expect } from 'bun:test';
import { descreverTempo, lugarDaLoja, lerPrevisao, enderecoDaPrevisao } from './tempo';

test('cada loja na sua cidade; a central e a loja desconhecida, na matriz', () => {
  expect(lugarDaLoja('Palmeiras').cidade).toBe('Santa Cruz das Palmeiras');
  expect(lugarDaLoja('Santa Rita').cidade).toBe('Santa Rita do Passa Quatro');
  expect(lugarDaLoja('Rede').cidade).toBe('Pirassununga');
  expect(lugarDaLoja('Loja que não existe').cidade).toBe('Pirassununga');
  // Cada cidade com as suas coordenadas (nada de todas no mesmo ponto)
  expect(lugarDaLoja('Descalvado').longitude).not.toBe(lugarDaLoja('Pirassununga').longitude);
});

test('a resposta de verdade do Open-Meteo vira a previsão', () => {
  // Formato conferido contra o serviço em 05/10/2026
  const resposta = {
    current: { time: '2026-10-05T17:00', temperature_2m: 20.5, weather_code: 53, is_day: 1 },
    daily: { temperature_2m_max: [26.2], temperature_2m_min: [17.8], precipitation_probability_max: [57] },
  };
  expect(lerPrevisao('Pirassununga', resposta)).toEqual({
    cidade: 'Pirassununga',
    agora: 21,
    maxima: 26,
    minima: 18,
    chuva: 57,
    codigo: 53,
    ehDia: true,
  });
  // Resposta quebrada não vira um cartão com "NaN°"
  expect(lerPrevisao('Pirassununga', { erro: true })).toBeNull();
  expect(enderecoDaPrevisao(-21.996, -47.426)).toContain('timezone=America%2FSao_Paulo');
});

test('o clima em português, com o ícone de cada grupo', () => {
  expect(descreverTempo(0)).toEqual({ texto: 'Céu limpo', icone: 'sol' });
  expect(descreverTempo(0, false).icone).toBe('lua');
  expect(descreverTempo(2).texto).toBe('Parcialmente nublado');
  expect(descreverTempo(53).texto).toBe('Garoa');
  expect(descreverTempo(63).texto).toBe('Chuva');
  expect(descreverTempo(81).texto).toBe('Chuva');
  expect(descreverTempo(95).icone).toBe('tempestade');
});
