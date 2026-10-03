/**
 * Gera TODOS os ícones e imagens de marca do CONECTA a partir da logo
 * oficial — CONECTA / Malachias Autopeças
 *
 *   bun scripts/gerar-icones.ts
 *
 * ===================================================================
 * DE ONDE VEM
 * ===================================================================
 *
 * `marca/pacote-original/` é o pacote de identidade enviado pelo Elias
 * (03/10/2026). A fonte de tudo é o `logo-master-1024.png`: transparente,
 * com 10% de respiro de cada lado, nas cores da marca (azul #2B54A3,
 * grafite #373435, branco). Nada aqui redesenha a logo — só põe fundo,
 * respiro e tamanho.
 *
 * ===================================================================
 * O QUE FOI CORRIGIDO DO PACOTE (conferido antes de aplicar)
 * ===================================================================
 *
 *  1. O ícone do app vinha sobre GRAFITE — a mesma cor das listras e do
 *     triângulo da logo, que sumiam (quebra a regra "não distorcer a
 *     marca"). O fundo passa a ser CINZA CLARO #EDEEF0, escolha do Elias:
 *     a logo aparece inteira, com as três cores.
 *  2. O ícone adaptativo do Android ocupava 64% do quadro; o Android só
 *     garante 61% visível (66 de 108 dp), e o ícone redondo cortava as
 *     pontas. Passa a 56%.
 *  3. Os ícones do PWA eram transparentes: no iPhone a transparência vira
 *     preto, e o grafite some de novo. Os de tela de início ganham fundo.
 *  4. Faltavam tamanhos: o do iPhone (180), o "maskable" do PWA, as cinco
 *     densidades do Android (ícone, adaptativo, monocromático e aviso) e a
 *     abertura do aplicativo.
 *
 * A silhueta do aviso NÃO vem do pacote: é desenhada aqui (`desenharSilhueta`)
 * — a do pacote, reduzida a 24 dp, virava um losango sem o M (03/10/2026).
 * Os favicons ganham o quadro claro (ver abaixo).
 */
import { createCanvas, loadImage, type Image } from '@napi-rs/canvas';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

const PACOTE = 'marca/pacote-original';
const RES = 'android/app/src/main/res';

/** O fundo do ícone do app: cinza claro (escolha do Elias, 03/10/2026). */
export const FUNDO_DO_ICONE = '#EDEEF0';
/** A abertura emenda na tela de espera do sistema, que é branca. */
const FUNDO_DA_ABERTURA = '#FFFFFF';

/**
 * Quanto da largura do quadro a logo ocupa em cada uso. A logo é um
 * losango: cabendo nesta fração, cabe também no círculo de mesmo diâmetro.
 */
export const OCUPACAO = {
  /**
   * O aviso na barra: o Android reserva 1 dp de cada lado dos 24 — 22/24.
   * A silhueta do pacote ocupava bem menos, e o desenho já é pequeno.
   */
  aviso: 22 / 24,
  /** Ícone legado do Android e o "any" do PWA: quadro arredondado, sem máscara do sistema. */
  icone: 0.68,
  /**
   * Adaptativo do Android: bem dentro dos 61% que o sistema garante (66/108
   * dp). Com 56% ficava dentro da regra mas encostado na borda do círculo —
   * mais apertado que o ícone legado. 46% dá o mesmo respiro dos outros.
   */
  adaptativo: 0.46,
  /** Favicon: o quadro claro inteiro, para a logo ler também na aba escura. */
  favicon: 0.74,
  /** Maskable do PWA: dentro do círculo seguro de 80%. */
  maskable: 0.62,
  /** iPhone: o sistema só arredonda os cantos. */
  iphone: 0.72,
  /** Abertura do Android 12+: o ícone vai num círculo de 160 de 240 dp. */
  abertura: 0.6,
  /** Abertura até o Android 11: a imagem inteira, logo no meio. */
  aberturaAntiga: 0.32,
} as const;

const salvar = (caminho: string, png: Buffer) => {
  mkdirSync(dirname(caminho), { recursive: true });
  writeFileSync(caminho, png);
};

/**
 * A logo no meio de um quadro de `largura x altura`, ocupando `ocupacao`
 * do lado menor. O master já tem 10% de respiro de cada lado: a conta é
 * sobre o DESENHO (80% do master), para a ocupação dizer o que se vê.
 */
const desenhar = (
  master: Image,
  largura: number,
  altura: number,
  ocupacao: number,
  fundo: { cor: string; forma: 'cheio' | 'circulo' | 'arredondado' } | null
): Buffer => {
  const cv = createCanvas(largura, altura);
  const c = cv.getContext('2d');
  if (fundo) {
    c.fillStyle = fundo.cor;
    c.beginPath();
    if (fundo.forma === 'circulo') c.arc(largura / 2, altura / 2, Math.min(largura, altura) / 2, 0, Math.PI * 2);
    else if (fundo.forma === 'arredondado') {
      const r = Math.min(largura, altura) * 0.22;
      c.roundRect(0, 0, largura, altura, r);
    } else c.rect(0, 0, largura, altura);
    c.fill();
  }
  const lado = (Math.min(largura, altura) * ocupacao) / 0.8;
  c.imageSmoothingEnabled = true;
  c.imageSmoothingQuality = 'high';
  c.drawImage(master, (largura - lado) / 2, (altura - lado) / 2, lado, lado);
  return cv.toBuffer('image/png');
};

/**
 * A SILHUETA DO AVISO, DESENHADA — e não a do pacote reduzida.
 *
 * O Android pinta o ícone do aviso de uma cor só: vale a forma, não as
 * cores. A silhueta do pacote era o losango cheio — o M branco e as cores
 * viravam a mesma mancha — e as nove listras, a 24 dp, ficavam com menos
 * de um pixel. No S10 o aviso mostrava um losango sem sentido (Elias,
 * 03/10/2026).
 *
 * Aqui a forma é a da logo, medida no master (centro 0, raio 1 do
 * losango): o losango cheio com o M RECORTADO — é o M que diz "Malachias"
 * — e duas listras grossas no lugar das nove finas. Desenhada no tamanho
 * de cada densidade, sai nítida em todas.
 */
export const SILHUETA = {
  /** O M recortado: o retângulo com o V em cima, medido no master. */
  m: [[-0.53, -0.53], [0, -0.07], [0.52, -0.53], [0.52, 0.49], [-0.53, 0.49]] as [number, number][],
  /** Os vãos entre as listras: faixas de x+y constante, paralelas à borda de cima-esquerda. */
  vaos: [-0.5],
  larguraDoVao: 0.16,
} as const;

export const desenharSilhueta = (lado: number, ocupacao: number): Buffer => {
  const cv = createCanvas(lado, lado);
  const c = cv.getContext('2d');
  const R = (lado * ocupacao) / 2;
  const P = (x: number, y: number): [number, number] => [lado / 2 + x * R, lado / 2 + y * R];

  c.fillStyle = '#FFFFFF';
  c.beginPath();
  c.moveTo(...P(0, -1));
  c.lineTo(...P(1, 0));
  c.lineTo(...P(0, 1));
  c.lineTo(...P(-1, 0));
  c.closePath();
  c.fill();

  c.globalCompositeOperation = 'destination-out';
  c.beginPath();
  SILHUETA.m.forEach(([x, y], i) => (i === 0 ? c.moveTo(...P(x, y)) : c.lineTo(...P(x, y))));
  c.closePath();
  c.fill();
  for (const v of SILHUETA.vaos) {
    const a0 = v - SILHUETA.larguraDoVao / 2;
    const a1 = v + SILHUETA.larguraDoVao / 2;
    c.beginPath();
    c.moveTo(...P(a0 + 2, -2));
    c.lineTo(...P(a1 + 2, -2));
    c.lineTo(...P(a1 - 2, 2));
    c.lineTo(...P(a0 - 2, 2));
    c.closePath();
    c.fill();
  }
  return cv.toBuffer('image/png');
};

export const gerarIcones = async () => {
  const master = await loadImage(`${PACOTE}/logo-master-1024.png`);
  const gerados: string[] = [];
  const gravar = (caminho: string, png: Buffer) => {
    salvar(caminho, png);
    gerados.push(caminho);
  };

  // --- WEB E PWA ---
  /*
    OS FAVICONS GANHAM O QUADRO CLARO. Os do pacote são transparentes, e na
    aba ESCURA do navegador só o "M" branco aparecia — o grafite e o azul
    somem no fundo escuro (a regra do README: transparente só "quando houver
    contraste suficiente"). Com o quadro, leem nos dois temas.
  */
  for (const lado of [16, 32, 48]) {
    gravar(`public/favicon-${lado}.png`, desenhar(master, lado, lado, OCUPACAO.favicon, { cor: FUNDO_DO_ICONE, forma: 'arredondado' }));
  }
  for (const lado of [192, 512]) {
    gravar(`public/icone-${lado}.png`, desenhar(master, lado, lado, OCUPACAO.icone, { cor: FUNDO_DO_ICONE, forma: 'arredondado' }));
  }
  gravar('public/icone-maskable-512.png', desenhar(master, 512, 512, OCUPACAO.maskable, { cor: FUNDO_DO_ICONE, forma: 'cheio' }));
  gravar('public/apple-touch-icon.png', desenhar(master, 180, 180, OCUPACAO.iphone, { cor: FUNDO_DO_ICONE, forma: 'cheio' }));
  // O "badge" do aviso no navegador: só a silhueta, como o Android pede
  gravar('public/icone-aviso-96.png', desenharSilhueta(96, OCUPACAO.aviso));

  /*
    A LOGO TRANSPARENTE, no caminho de sempre. `/logo-malachias.svg` está
    gravado no banco como foto de quem escolheu "usar a logo": o arquivo
    fica, e passa a carregar a logo oficial (o PNG de 512, dentro do SVG).
  */
  const web512 = readFileSync(`${PACOTE}/logo-web-512.png`).toString('base64');
  writeFileSync(
    'public/logo-malachias.svg',
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 512 512" width="512" height="512">
  <!-- GERADO por scripts/gerar-icones.ts a partir de marca/pacote-original/logo-web-512.png — a logo oficial, sem redesenho -->
  <image width="512" height="512" href="data:image/png;base64,${web512}" xlink:href="data:image/png;base64,${web512}"/>
</svg>
`
  );
  gerados.push('public/logo-malachias.svg');

  // --- ANDROID: ícone do aplicativo ---
  const densidades = { ldpi: 0.75, mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 } as const;
  for (const [nome, fator] of Object.entries(densidades)) {
    const legado = Math.round(48 * fator);
    gravar(`${RES}/mipmap-${nome}/ic_launcher.png`, desenhar(master, legado, legado, OCUPACAO.icone, { cor: FUNDO_DO_ICONE, forma: 'arredondado' }));
    gravar(`${RES}/mipmap-${nome}/ic_launcher_round.png`, desenhar(master, legado, legado, OCUPACAO.icone, { cor: FUNDO_DO_ICONE, forma: 'circulo' }));
    if (nome === 'ldpi') continue;
    const camada = Math.round(108 * fator);
    gravar(`${RES}/mipmap-${nome}/ic_launcher_foreground.png`, desenhar(master, camada, camada, OCUPACAO.adaptativo, null));
    // O monocromático (ícones temáticos do Android 13): a silhueta no mesmo lugar
    gravar(`${RES}/mipmap-${nome}/ic_launcher_monochrome.png`, desenharSilhueta(camada, OCUPACAO.adaptativo));
    // O aviso na barra: 24 dp, a silhueta desenhada, grande (22 dos 24 dp)
    gravar(`${RES}/drawable-${nome}/ic_stat_conecta.png`, desenharSilhueta(Math.round(24 * fator), OCUPACAO.aviso));
    // A abertura do Android 12+: 240 dp
    const abertura = Math.round(240 * fator);
    gravar(`${RES}/drawable-${nome}/abertura_logo.png`, desenhar(master, abertura, abertura, OCUPACAO.abertura, null));
  }

  // --- ANDROID: abertura até o Android 11 (os tamanhos que o Capacitor criou) ---
  const aberturasAntigas: Array<[string, number, number]> = [
    ['drawable', 480, 320],
    ['drawable-land-mdpi', 480, 320], ['drawable-land-hdpi', 800, 480], ['drawable-land-xhdpi', 1280, 720],
    ['drawable-land-xxhdpi', 1600, 960], ['drawable-land-xxxhdpi', 1920, 1280],
    ['drawable-port-mdpi', 320, 480], ['drawable-port-hdpi', 480, 800], ['drawable-port-xhdpi', 720, 1280],
    ['drawable-port-xxhdpi', 960, 1600], ['drawable-port-xxxhdpi', 1280, 1920],
  ];
  for (const [pasta, l, a] of aberturasAntigas) {
    gravar(`${RES}/${pasta}/splash.png`, desenhar(master, l, a, OCUPACAO.aberturaAntiga, { cor: FUNDO_DA_ABERTURA, forma: 'cheio' }));
  }

  return gerados;
};

if (import.meta.main) {
  const gerados = await gerarIcones();
  console.log(`${gerados.length} arquivos gerados a partir de ${PACOTE}/logo-master-1024.png`);
}
