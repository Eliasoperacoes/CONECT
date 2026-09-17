/**
 * Verificação da jornada semanal — CONECTA
 *
 * O QUE MOTIVOU, relatado por quem usa: "o app na hora de bater o ponto
 * está considerando que todo colaborador sairia às 18h ou não cumpriu sua
 * carga diária".
 *
 * A rede não tem uma jornada só:
 *
 *   - colaborador     8h10 por dia + 4h de sábado  = 44h50 na semana
 *   - estagiário A    6h por dia, NÃO vem sábado   = 30h na semana
 *   - estagiário B    menos por dia, VEM no sábado = 30h na semana
 *
 * Cobrar por DIA reprovava os dois estagiários todo dia, sem que nada
 * estivesse errado.
 */
import { test, expect } from 'bun:test';
import {
  cargaSemanalDe,
  trabalhaNoSabado,
  temIntervaloNoDia,
  ehDeEstagio,
  MINUTOS_SEMANA_PADRAO,
  MINUTOS_SEMANA_ESTAGIO,
  CARGA_HORARIA_PADRAO_MINUTOS,
  MINUTOS_SABADO,
} from '../tipos';

test('a semana do colaborador sai do relogio do turno, e nao de um numero escolhido', () => {
  // 8h10 por dia, com o almoço de 1h30 que a rede pratica
  expect(CARGA_HORARIA_PADRAO_MINUTOS).toBe(490);
  expect(MINUTOS_SABADO).toBe(240);

  // Cinco dias úteis mais o sábado
  expect(MINUTOS_SEMANA_PADRAO).toBe(490 * 5 + 240);
  expect(MINUTOS_SEMANA_PADRAO).toBe(2690); // 44h50
});

test('a semana do estagio e 30h, cheguem elas como chegarem', () => {
  expect(MINUTOS_SEMANA_ESTAGIO).toBe(1800);

  const estagiario = { setor: 'Estágio', cargo: 'Estagiário' };
  expect(cargaSemanalDe(estagiario)).toBe(1800);

  /**
   * Os DOIS casos fecham 30h. O que muda é como: um faz 6h de segunda a
   * sexta, o outro faz menos por dia e vem no sábado completar.
   */
  const vemNoSabado = { setor: 'Estágio', trabalhaSabado: true };
  expect(cargaSemanalDe(vemNoSabado)).toBe(1800);
});

test('o padrao do estagio e NAO vir ao sabado, e o do colaborador e vir', () => {
  expect(trabalhaNoSabado({ setor: 'Estágio' })).toBe(false);
  expect(trabalhaNoSabado({ setor: 'Balcão' })).toBe(true);

  /**
   * E a ficha VENCE o padrão: entre os estagiários há os dois contratos, e
   * deduzir pelo setor deixaria metade deles errada. O padrão é só o ponto
   * de partida.
   */
  expect(trabalhaNoSabado({ setor: 'Estágio', trabalhaSabado: true })).toBe(true);
  expect(trabalhaNoSabado({ setor: 'Balcão', trabalhaSabado: false })).toBe(false);
});

test('jornada de ate 6h nao tem intervalo, e por isso bate duas vezes', () => {
  /**
   * Cobrar do estagiário a saída e o retorno do almoço deixava o dia
   * eternamente "pela metade" — era isto que fazia o sistema dizer que ele
   * não cumpriu a jornada.
   */
  expect(temIntervaloNoDia({ setor: 'Estágio' })).toBe(false);
  expect(temIntervaloNoDia({ setor: 'Estoque' })).toBe(true);

  // E a ficha vence também aqui
  expect(temIntervaloNoDia({ setor: 'Estágio', temIntervalo: true })).toBe(true);
});

test('a ficha vence o setor na carga da semana', () => {
  /**
   * O setor é o PADRÃO, nunca a verdade. Um dia pode haver estagiário fora
   * do setor Estágio, e há contratos de 20h e 25h.
   */
  expect(cargaSemanalDe({ setor: 'Estágio', cargaSemanalMinutos: 20 * 60 })).toBe(1200);
  expect(cargaSemanalDe({ setor: 'Balcão', cargaSemanalMinutos: 1800 })).toBe(1800);
});

test('reconhece o estagio pelo setor e pelo cargo', () => {
  expect(ehDeEstagio({ setor: 'Estágio' })).toBe(true);
  expect(ehDeEstagio({ setor: 'Balcão', cargo: 'Estagiário de TI' })).toBe(true);
  expect(ehDeEstagio({ setor: 'Compras', cargo: 'Comprador' })).toBe(false);
});

/**
 * AS BATIDAS ESPERADAS SÃO DA PESSOA, NÃO DA DATA.
 *
 * Era daqui que vinha o defeito: `marcacoesEsperadas(data)` olhava só o
 * calendário, então cobrava de todo mundo quatro batidas e um sábado.
 */
test('quem nao vem ao sabado nao tem batida esperada no sabado', async () => {
  const { marcacoesEsperadas } = await import('./ponto');

  // 2026-09-19 é um sábado
  const sabado = '2026-09-19';
  const estagiario = { id: 'e1', setor: 'Estágio' } as never;
  const colaborador = { id: 'c1', setor: 'Balcão' } as never;

  expect(marcacoesEsperadas(sabado, estagiario)).toEqual([]);
  expect(marcacoesEsperadas(sabado, colaborador)).toEqual(['entrada', 'saida']);
});

test('quem nao tem intervalo bate duas vezes no dia util', async () => {
  const { marcacoesEsperadas } = await import('./ponto');

  const terca = '2026-09-15';
  const estagiario = { id: 'e1', setor: 'Estágio' } as never;
  const colaborador = { id: 'c1', setor: 'Balcão' } as never;

  expect(marcacoesEsperadas(terca, estagiario)).toEqual(['entrada', 'saida']);
  expect(marcacoesEsperadas(terca, colaborador)).toHaveLength(4);
});

test('sem a pessoa, vale o dia comum da rede', async () => {
  const { marcacoesEsperadas } = await import('./ponto');

  /**
   * Há chamadas que só sabem a data. Para elas o dia comum é a resposta
   * certa — e mudar isso para uma lista vazia sumiria com pendência de
   * verdade.
   */
  expect(marcacoesEsperadas('2026-09-15')).toHaveLength(4);
  expect(marcacoesEsperadas('2026-09-19')).toEqual(['entrada', 'saida']);
});

/**
 * A semana vai de SEGUNDA a DOMINGO: é como a folha corre, e põe o SÁBADO
 * no fim — que é quando o líder confere o banco de horas da semana que
 * fechou. Com a semana começando no domingo, o sábado cairia no meio.
 */
test('a semana vai de segunda a domingo', async () => {
  const { semanaDe } = await import('./ponto');

  // 2026-09-16 é uma quarta
  expect(semanaDe('2026-09-16')).toEqual({ inicio: '2026-09-14', fim: '2026-09-20' });

  // A segunda é o primeiro dia dela mesma
  expect(semanaDe('2026-09-14').inicio).toBe('2026-09-14');

  // E o domingo fecha a semana que começou na segunda anterior
  expect(semanaDe('2026-09-20')).toEqual({ inicio: '2026-09-14', fim: '2026-09-20' });

  // O sábado cai no penúltimo dia, nunca no meio
  expect(semanaDe('2026-09-19').fim).toBe('2026-09-20');
});
