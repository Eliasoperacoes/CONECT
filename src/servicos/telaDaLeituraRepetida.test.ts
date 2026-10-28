/**
 * A LEITURA REPETIDA DO QR diz que o ponto já está batido (29/10/2026).
 *
 * No primeiro dia de todos, 13 leituras repetidas em 8 pessoas — uma
 * delas, quatro em pouco mais de um minuto. A tela dizia "enviada ao RH"
 * em amarelo, e a pessoa lia de novo.
 */
import { test, expect } from 'bun:test';
import { readFileSync } from 'fs';
import { join } from 'path';
import { aBatidaQueValeu, textoDaRepetida } from './batidaRepetida';

const batida = (tipo: string, horario: string, horaFormatada: string) =>
  ({ id: tipo, colaboradorId: 'evandro', data: '2026-10-29', tipo, horario, horaFormatada, metodo: 'qrcode', loja: 'Porto Ferreira', criadoEm: horario }) as any;

const DIA = [
  batida('entrada', '2026-10-29T11:00:10+00:00', '08:00'),
  batida('saida_almoco', '2026-10-29T14:01:00+00:00', '11:01'),
  batida('retorno_almoco', '2026-10-29T15:31:00+00:00', '12:31'),
  batida('saida', '2026-10-29T21:01:02+00:00', '18:01'),
];

test('a batida que valeu é a última antes da leitura repetida', () => {
  // A repetida das 18:02 (escrita com "Z", como vem do comprovante)
  expect(aBatidaQueValeu(DIA, { horario: '2026-10-29T21:02:00.000Z' })?.tipo).toBe('saida');
  // A repetida das 11:01:30 repete a saída para o almoço, não a saída do dia
  expect(aBatidaQueValeu(DIA, { horario: '2026-10-29T14:01:30.000Z' })?.tipo).toBe('saida_almoco');
  expect(aBatidaQueValeu([], { horario: '2026-10-29T21:02:00.000Z' })).toBeUndefined();
});

test('o texto diz que o ponto já está batido, a que horas, e que a leitura não muda nada', () => {
  const t = textoDaRepetida(DIA[3]);
  expect(t.titulo).toBe('Você já tinha batido o ponto');
  expect(t.detalhe).toContain('Saída às 18:01');
  expect(t.detalhe).toContain('não muda o seu ponto');
  expect(t.detalhe).not.toContain('RH');
  // Sem a batida no aparelho, ainda tranquiliza
  expect(textoDaRepetida(undefined).detalhe).toContain('não muda o seu ponto');
});

test('a tela da batida usa o texto da repetida, e não o "enviada ao RH"', () => {
  const tela = readFileSync(join(import.meta.dir, '../componentes/ModalBaterPonto.tsx'), 'utf8');
  // O ramo da repetida vai até o ramo seguinte (o das outras fora da jornada)
  const inicio = tela.indexOf("registroFeito.foraDaJornada === 'repetida'");
  const ramo = tela.slice(inicio, tela.indexOf("estado === 'sucesso' && registroFeito ? (", inicio));
  expect(tela).toContain("registroFeito.foraDaJornada === 'repetida'");
  expect(ramo).toContain('aBatidaQueValeu(');
  expect(ramo).toContain('textoDaRepetida(');
  expect(ramo).not.toContain('enviada ao RH');
});
