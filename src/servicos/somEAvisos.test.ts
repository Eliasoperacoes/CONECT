/**
 * O SOM DO CONECTA, O CONVITE PARA LIGAR OS AVISOS, E O SILÊNCIO AO SAIR.
 *
 * Pedido do Elias: o computador não sugeria ligar os avisos; tocava o som
 * ao fazer logout; e o som tinha de ser "algo sofisticado, tanto para o
 * celular quanto para o computador".
 */
import { test, expect, mock, beforeEach } from 'bun:test';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

class ArmazenamentoFalso {
  private dados = new Map<string, string>();
  getItem(k: string) { return this.dados.has(k) ? this.dados.get(k)! : null; }
  setItem(k: string, v: string) { this.dados.set(k, String(v)); }
  removeItem(k: string) { this.dados.delete(k); }
  clear() { this.dados.clear(); }
}
const armazenamento = new ArmazenamentoFalso();
(globalThis as any).localStorage = armazenamento;

/** O navegador simulado: mouse ou toque, e a resposta da permissão. */
let temMouse = true;
let noAplicativo = false;
(globalThis as any).window = globalThis;
(globalThis as any).matchMedia = (consulta: string) => ({
  matches: consulta === '(pointer: fine)' ? temMouse : false,
});
(globalThis as any).Notification = { permission: 'default' };

mock.module('./aplicativo', () => ({ rodandoNoAplicativo: () => noAplicativo }));

const { deveConvidarParaAvisos, adiarConviteDeAvisos } = await import('./notificacoes');
const { gerarAmostrasDoAviso, gerarWavDoAviso, NOTAS_DO_AVISO, DURACAO_DO_AVISO } = await import(
  './somDoAviso'
);

const RAIZ = join(import.meta.dir, '../..');
const ler = (arq: string) => readFileSync(join(RAIZ, arq), 'utf8').replace(/\r\n/g, '\n');

beforeEach(() => {
  armazenamento.clear();
  temMouse = true;
  noAplicativo = false;
  (globalThis as any).Notification.permission = 'default';
});

// ------------------------------------------------------------------
// O convite
// ------------------------------------------------------------------

test('o computador que ainda não respondeu recebe o convite', () => {
  expect(deveConvidarParaAvisos()).toBe(true);
});

test('"Agora não" cala por uma semana, e depois volta', () => {
  const agora = 1_000_000_000_000;
  adiarConviteDeAvisos(agora);
  expect(deveConvidarParaAvisos(agora + 6 * 24 * 3600 * 1000)).toBe(false);
  expect(deveConvidarParaAvisos(agora + 8 * 24 * 3600 * 1000)).toBe(true);
});

test('não convida quem já respondeu: perguntar de novo não adianta', () => {
  (globalThis as any).Notification.permission = 'granted';
  expect(deveConvidarParaAvisos()).toBe(false);
  (globalThis as any).Notification.permission = 'denied';
  expect(deveConvidarParaAvisos()).toBe(false);
});

test('celular e aplicativo não recebem o convite do computador', () => {
  temMouse = false;
  expect(deveConvidarParaAvisos()).toBe(false);
  temMouse = true;
  noAplicativo = true;
  expect(deveConvidarParaAvisos()).toBe(false);
});

// ------------------------------------------------------------------
// O som
// ------------------------------------------------------------------

test('o som começa e termina em silêncio, sem estalo, e não satura', () => {
  const a = gerarAmostrasDoAviso(44100);
  expect(a.length).toBe(Math.round(DURACAO_DO_AVISO * 44100));
  expect(Math.abs(a[0])).toBeLessThan(0.001);
  expect(Math.abs(a[a.length - 1])).toBeLessThan(0.001);

  let pico = 0;
  for (const v of a) pico = Math.max(pico, Math.abs(v));
  // Audível na loja, longe de estourar
  expect(pico).toBeGreaterThan(0.4);
  expect(pico).toBeLessThan(0.8);
});

test('são duas notas, subindo, e a segunda entra depois da primeira', () => {
  expect(NOTAS_DO_AVISO).toHaveLength(2);
  expect(NOTAS_DO_AVISO[1].frequencia).toBeGreaterThan(NOTAS_DO_AVISO[0].frequencia);
  expect(NOTAS_DO_AVISO[1].inicio).toBeGreaterThan(NOTAS_DO_AVISO[0].inicio);
});

test('o WAV é um áudio válido, com as mesmas amostras do navegador', () => {
  const wav = gerarWavDoAviso(44100);
  const v = new DataView(wav.buffer);
  const texto = (pos: number, n: number) => String.fromCharCode(...wav.slice(pos, pos + n));

  expect(texto(0, 4)).toBe('RIFF');
  expect(texto(8, 4)).toBe('WAVE');
  expect(v.getUint16(22, true)).toBe(1); // mono
  expect(v.getUint32(24, true)).toBe(44100);

  const amostras = gerarAmostrasDoAviso(44100);
  expect(v.getUint32(40, true)).toBe(amostras.length * 2);
  // Uma amostra no meio do som, a mesma nos dois
  const meio = Math.round(0.2 * 44100);
  expect(v.getInt16(44 + meio * 2, true)).toBe(Math.round(amostras[meio] * 32767));
});

test('o som do aplicativo Android é o arquivo gerado desta receita', () => {
  // Mudou a receita e não rodou `bun scripts/gerar-som-do-aviso.ts`: o
  // celular tocaria outro som que o computador
  const arquivo = join(RAIZ, 'android/app/src/main/res/raw/aviso_conecta.wav');
  expect(existsSync(arquivo)).toBe(true);
  expect(Array.from(readFileSync(arquivo))).toEqual(Array.from(gerarWavDoAviso(44100)));
});

test('o canal do Android tem o som, e o manifesto aponta para ele', () => {
  const java = ler('android/app/src/main/java/br/com/malachiasautopecas/conecta/ServicoDeAvisos.java');
  const manifesto = ler('android/app/src/main/AndroidManifest.xml');

  const canal = java.match(/static final String CANAL = "([^"]+)"/)?.[1];
  expect(canal).toBe('avisos_conecta');
  expect(manifesto).toContain(`android:value="${canal}" />`);
  expect(java).toContain('R.raw.aviso_conecta');
  expect(java).toContain('canal.setSound(som, uso);');
  // O canal antigo sai, para não haver dois "Mensagens" nas configurações
  expect(java).toContain('gerente.deleteNotificationChannel(CANAL_ANTIGO);');
});

test('no computador o aviso do sistema é silencioso: toca só o som do CONECTA', () => {
  expect(ler('src/servicos/notificacoes.ts')).toContain('silent: somLigado() && ehComputador(),');
});

// ------------------------------------------------------------------
// O silêncio ao sair
// ------------------------------------------------------------------

test('sem sessão não se avisa nada, e a troca de pessoa recomeça a conta', () => {
  const app = ler('src/App.tsx');
  const ini = app.indexOf('const donoDosAvisos = useRef');
  const efeito = app.slice(ini, app.indexOf('tocarAvisoDeMensagem();', ini));

  expect(efeito).toContain('const sessao = autenticado && bancoDados.estaAutenticado() ? colaboradorAtual.id : null;');
  expect(efeito).toContain('jaAvisadas.current = null;');
  // A saída vem ANTES de qualquer som
  expect(efeito.indexOf('if (!sessao) {')).toBeGreaterThan(-1);

  // As pendências do ponto também recomeçam sem sessão
  expect(app).toContain(`if (!bancoDados.estaAutenticado()) {
        refPendenciasVistas.current = null;`);
});
