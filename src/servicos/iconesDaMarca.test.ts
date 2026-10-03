/**
 * OS ÍCONES DA MARCA — gerados da logo oficial (marca/pacote-original) por
 * scripts/gerar-icones.ts. O que não pode voltar a acontecer:
 *
 *   - o fundo do ícone na cor de uma parte da logo (grafite ou azul), que
 *     apagava metade da marca;
 *   - a web ou o Android apontando para um ícone que não existe mais;
 *   - o aviso do Android sem a silhueta (o Android pinta tudo de uma cor).
 */
import { test, expect } from 'bun:test';
import { existsSync, readFileSync } from 'fs';
import { loadImage } from '@napi-rs/canvas';
import { FUNDO_DO_ICONE, OCUPACAO } from '../../scripts/gerar-icones';

const RES = 'android/app/src/main/res';
const CORES_DA_LOGO = ['#2B54A3', '#373435'];

test('o fundo do ícone não é nenhuma cor da logo — senão metade dela some', () => {
  expect(CORES_DA_LOGO).not.toContain(FUNDO_DO_ICONE.toUpperCase());
  const xml = readFileSync(`${RES}/values/ic_launcher_background.xml`, 'utf8');
  expect(xml).toContain(`<color name="ic_launcher_background">${FUNDO_DO_ICONE}</color>`);
});

test('o adaptativo do Android cabe na área que o sistema garante (66 de 108 dp)', () => {
  expect(OCUPACAO.adaptativo).toBeLessThanOrEqual(66 / 108);
  expect(OCUPACAO.maskable).toBeLessThanOrEqual(0.8);
});

test('o ícone do Android tem as três camadas, e o monocromático dos temas', () => {
  for (const arquivo of ['ic_launcher.xml', 'ic_launcher_round.xml']) {
    const xml = readFileSync(`${RES}/mipmap-anydpi-v26/${arquivo}`, 'utf8');
    expect(xml).toContain('@color/ic_launcher_background');
    expect(xml).toContain('@mipmap/ic_launcher_foreground');
    expect(xml).toContain('@mipmap/ic_launcher_monochrome');
  }
  for (const d of ['mdpi', 'hdpi', 'xhdpi', 'xxhdpi', 'xxxhdpi']) {
    for (const n of ['ic_launcher', 'ic_launcher_round', 'ic_launcher_foreground', 'ic_launcher_monochrome']) {
      expect(existsSync(`${RES}/mipmap-${d}/${n}.png`)).toBe(true);
    }
  }
});

test('o aviso do Android é a silhueta da logo, em 24 dp, nas cinco densidades', async () => {
  // O balão de conversa provisório saiu: sobrando, seria o reserva do Android
  expect(existsSync(`${RES}/drawable/ic_stat_conecta.xml`)).toBe(false);
  const lados: Record<string, number> = { mdpi: 24, hdpi: 36, xhdpi: 48, xxhdpi: 72, xxxhdpi: 96 };
  for (const [d, lado] of Object.entries(lados)) {
    const img = await loadImage(`${RES}/drawable-${d}/ic_stat_conecta.png`);
    expect([img.width, img.height]).toEqual([lado, lado]);
  }
});

test('o aviso mostra o M recortado no losango, grande, e nao uma mancha', async () => {
  /*
    No S10 (03/10/2026) o aviso era um losango cheio: o Android pinta o
    ícone de uma cor só, e o M branco virava a mesma mancha das cores.
    O M precisa ser BURACO, e o losango, quase os 24 dp inteiros.
  */
  const { createCanvas } = await import('@napi-rs/canvas');
  const img = await loadImage(`${RES}/drawable-xxxhdpi/ic_stat_conecta.png`);
  const lado = img.width;
  const cv = createCanvas(lado, lado);
  const c = cv.getContext('2d');
  c.drawImage(img, 0, 0);
  const alfa = (x: number, y: number) => c.getImageData(Math.round(x), Math.round(y), 1, 1).data[3];
  const R = (lado * OCUPACAO.aviso) / 2;
  const P = (x: number, y: number) => [lado / 2 + x * R, lado / 2 + y * R] as const;

  expect(alfa(...P(0, 0.25))).toBe(0); // dentro do M: recortado
  expect(alfa(...P(0, 0.8))).toBe(255); // o triângulo de baixo
  expect(alfa(...P(0.75, 0))).toBe(255); // o triângulo da direita
  expect(alfa(...P(0, -0.85))).toBe(255); // o alto do losango, acima do V

  // Grande: as pontas do losango chegam perto da borda (22 de 24 dp)
  expect(OCUPACAO.aviso).toBeGreaterThanOrEqual(0.9);
  expect(alfa(lado / 2, lado / 2 - R + 3)).toBe(255);
});

test('a web aponta só para ícones que existem', () => {
  const html = readFileSync('index.html', 'utf8');
  const manifesto = JSON.parse(readFileSync('public/manifest.json', 'utf8'));
  const caminhos = [
    ...[...html.matchAll(/<link rel="(?:icon|apple-touch-icon)"[^>]*href="([^"]+)"/g)].map((m) => m[1]),
    ...manifesto.icons.map((i: { src: string }) => i.src),
  ];
  expect(caminhos).toContain('/apple-touch-icon.png');
  expect(manifesto.icons.some((i: { purpose: string }) => i.purpose === 'maskable')).toBe(true);
  for (const c of caminhos) expect(existsSync(`public${c}`)).toBe(true);
});

test('a logo padrão de perfil é a oficial, no caminho que o banco guarda', () => {
  // `/logo-malachias.svg` está gravado como foto de quem escolheu "usar a logo"
  const svg = readFileSync('public/logo-malachias.svg', 'utf8');
  const oficial = readFileSync('marca/pacote-original/logo-web-512.png').toString('base64');
  expect(svg).toContain(oficial);
});
