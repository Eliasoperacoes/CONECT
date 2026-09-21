/**
 * Verificação do relógio sincronizado — CONECTA
 *
 * O QUE MOTIVOU: todo o ponto saía de `new Date()`, a hora que o APARELHO
 * achava que era. O celular do balcão é compartilhado, tem bateria velha
 * e o relógio a três toques de qualquer um — e a batida era gravada com a
 * hora errada sem que nada acusasse, porque o número gravado parecia tão
 * legítimo quanto os outros.
 *
 * O que estes testes prendem:
 *
 *  1. A META DADE DA VIAGEM é descontada. Sem isso toda sincronização
 *     deixaria o sistema atrasado pelo tempo da rede — numa loja com
 *     internet ruim, minutos.
 *  2. FALHAR É CAIR NO APARELHO E DIZER QUE CAIU. Nunca fingir precisão.
 *  3. GUARDA-SE O DESVIO, e não a hora: é o que faz o relógio continuar
 *     andando entre uma sincronização e outra.
 */
import { test, expect, beforeEach } from 'bun:test';

const {
  calcularDesvio,
  agora,
  agoraEmMs,
  estaSincronizado,
  desvioPreocupante,
  desvioEmMs,
  sincronizarRelogio,
  reiniciarRelogio,
  assinarRelogio,
} = await import('./relogio');

beforeEach(() => {
  reiniciarRelogio();
});

// ---------------------------------------------------------------
// 1. A conta do desvio
// ---------------------------------------------------------------

test('desconta metade da ida e volta', () => {
  /**
   * O cabeçalho foi escrito quando o servidor respondeu, e a resposta
   * levou um tempo para chegar. A hora do servidor NAQUELE instante já é
   * passado quando o cabeçalho chega aqui.
   *
   * Enviado em 1000, recebido em 1200: a viagem levou 200ms, e o
   * servidor escreveu o cabeçalho por volta do meio, em 1100.
   */
  const servidor = new Date(5000).toUTCString(); // servidor diz 5000
  const desvio = calcularDesvio(servidor, 1000, 1200);

  // 5000 + 100 (metade da viagem) - 1200 = 3900
  expect(desvio).toBe(3900);
});

test('sem desconto o sistema ficaria atrasado pelo tempo da rede', () => {
  const servidor = new Date(5000).toUTCString();

  /**
   * A conta ingênua é `servidor - recebido`, e ela erra para MENOS
   * exatamente o tempo que a resposta levou para chegar: o cabeçalho diz
   * a hora da saída, não a da chegada.
   *
   * Numa resposta de 1 segundo o sistema ficaria 500ms atrasado; numa
   * loja com internet ruim, isso cresce — e o ponto passa a registrar
   * sempre um pouco antes do que realmente é.
   */
  const ingenuoLento = 5000 - 2000;
  const corrigidoLento = calcularDesvio(servidor, 1000, 2000)!;
  expect(corrigidoLento - ingenuoLento).toBe(500); // metade de 1000ms

  // Resposta instantânea quase não precisa de correção
  const ingenuoRapido = 5000 - 1010;
  const corrigidoRapido = calcularDesvio(servidor, 1000, 1010)!;
  expect(corrigidoRapido - ingenuoRapido).toBe(5); // metade de 10ms
});

test('cabeçalho ausente ou ilegível não vira desvio', () => {
  // Chutar um desvio a partir de lixo é pior do que não sincronizar
  expect(calcularDesvio(null, 1000, 1100)).toBeNull();
  expect(calcularDesvio('não é data', 1000, 1100)).toBeNull();
});

// ---------------------------------------------------------------
// 2. Falhar é cair no aparelho, e dizer
// ---------------------------------------------------------------

test('sem sincronizar, o relógio é o do aparelho e ele ADMITE isso', () => {
  expect(estaSincronizado()).toBe(false);
  expect(desvioEmMs()).toBe(0);

  // Cair no aparelho é aceitável; fingir que está certo não é
  expect(Math.abs(agoraEmMs() - Date.now())).toBeLessThan(50);
});

test('sincronização que falha não inventa hora', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = (() => Promise.reject(new Error('sem rede'))) as any;

  const deuCerto = await sincronizarRelogio('https://exemplo.invalido');

  expect(deuCerto).toBe(false);
  expect(estaSincronizado()).toBe(false);
  expect(desvioEmMs()).toBe(0);

  globalThis.fetch = original;
});

test('resposta sem o cabeçalho Date não conta como sincronizada', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = (() =>
    Promise.resolve({ headers: new Headers() } as Response)) as any;

  expect(await sincronizarRelogio('https://exemplo.invalido')).toBe(false);
  expect(estaSincronizado()).toBe(false);

  globalThis.fetch = original;
});

// ---------------------------------------------------------------
// 3. Guarda o desvio, e o relógio segue andando
// ---------------------------------------------------------------

test('depois de sincronizar, a hora sai corrigida', async () => {
  const original = globalThis.fetch;

  // Servidor uma hora à frente do aparelho
  const umaHoraAFrente = new Date(Date.now() + 3600 * 1000).toUTCString();
  globalThis.fetch = (() =>
    Promise.resolve({
      headers: new Headers({ date: umaHoraAFrente }),
    } as Response)) as any;

  expect(await sincronizarRelogio('https://exemplo.invalido')).toBe(true);
  expect(estaSincronizado()).toBe(true);

  // Perto de uma hora, com folga para o tempo do próprio teste
  expect(agoraEmMs() - Date.now()).toBeGreaterThan(3500 * 1000);

  globalThis.fetch = original;
});

test('o relógio ANDA entre uma sincronização e outra', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = (() =>
    Promise.resolve({
      headers: new Headers({ date: new Date(Date.now() + 60000).toUTCString() }),
    } as Response)) as any;

  await sincronizarRelogio('https://exemplo.invalido');

  const primeira = agoraEmMs();
  await new Promise((r) => setTimeout(r, 20));
  const segunda = agoraEmMs();

  /**
   * Guardar a HORA em vez do desvio deixaria o relógio parado no instante
   * da sincronização — e o ponto bateria sempre o mesmo horário até a
   * próxima.
   */
  expect(segunda).toBeGreaterThan(primeira);

  globalThis.fetch = original;
});

test('avisa quem assina quando o relógio é acertado', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = (() =>
    Promise.resolve({
      headers: new Headers({ date: new Date().toUTCString() }),
    } as Response)) as any;

  let avisos = 0;
  const parar = assinarRelogio(() => { avisos += 1; });

  await sincronizarRelogio('https://exemplo.invalido');
  expect(avisos).toBe(1);

  parar();
  globalThis.fetch = original;
});

// ---------------------------------------------------------------
// O aviso de relógio torto
// ---------------------------------------------------------------

test('desvio grande é sinalizado para a tela poder avisar', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = (() =>
    Promise.resolve({
      headers: new Headers({
        date: new Date(Date.now() + 10 * 60 * 1000).toUTCString(),
      }),
    } as Response)) as any;

  await sincronizarRelogio('https://exemplo.invalido');

  // Dez minutos de diferença não é imprecisão de rede, é relógio errado —
  // e quem vai bater o ponto precisa saber ANTES, não depois
  expect(desvioPreocupante()).toBe(true);

  globalThis.fetch = original;
});

test('desvio pequeno NÃO vira alarme', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = (() =>
    Promise.resolve({
      headers: new Headers({ date: new Date(Date.now() + 3000).toUTCString() }),
    } as Response)) as any;

  await sincronizarRelogio('https://exemplo.invalido');

  // Três segundos é rede, não relógio torto. Alarmar aqui ensinaria a
  // ignorar o aviso no dia em que ele importasse
  expect(desvioPreocupante()).toBe(false);

  globalThis.fetch = original;
});

test('nunca sincronizado não dispara o alarme de desvio', () => {
  // Desvio 0 por ignorância não é desvio 0 por conferência, mas alarmar
  // quem nunca sincronizou seria alarme permanente e inútil
  expect(desvioPreocupante()).toBe(false);
});

test('agora() devolve objetos distintos', () => {
  const a = agora();
  const b = agora();

  // `Date` é mutável: devolver o mesmo objeto deixaria qualquer setDate
  // de qualquer tela reescrevendo a hora de todo mundo
  expect(a).not.toBe(b);
});
