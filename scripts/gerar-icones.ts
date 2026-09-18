/**
 * Gera os ícones PNG do aplicativo — CONECTA / Malachias Autopeças
 *
 *   bun scripts/gerar-icones.ts
 *
 * ===================================================================
 * POR QUE PNG, SE JÁ EXISTE UM SVG
 * ===================================================================
 *
 * O Android só monta o aplicativo de verdade (o "WebAPK", com ícone
 * próprio na gaveta e janela sem barra do navegador) quando o manifesto
 * oferece ícone em PNG, nos tamanhos 192 e 512. Com SVG apenas, o Chrome
 * desiste e instala um ATALHO: o sistema continua sendo o navegador
 * fingindo ser aplicativo — e é isso que faz aparecer aquela notificação
 * fixa "CONECTA — Toque para copiar a URL desse app".
 *
 * ===================================================================
 * POR QUE O DESENHO MUDOU
 * ===================================================================
 *
 * O ícone antigo era um walkie-talkie com ondas de rádio. O Rádio saiu do
 * sistema, então o aplicativo estava se anunciando por uma função que não
 * existe mais. O desenho novo é um balão de conversa, que é o que o
 * CONECTA faz.
 *
 * É um marcador geométrico, não a marca da Malachias. Para trocar pela
 * logomarca de verdade, basta substituir os arquivos gerados.
 */

import { deflateSync } from 'node:zlib';

const AZUL = [0x25, 0x63, 0xeb];
const BRANCO = [0xff, 0xff, 0xff];

// --- Codificação de PNG ---

const tabelaCrc = (() => {
  const tabela = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    tabela[n] = c >>> 0;
  }
  return tabela;
})();

const crc32 = (dados: Uint8Array): number => {
  let c = 0xffffffff;
  for (let i = 0; i < dados.length; i++) c = tabelaCrc[(c ^ dados[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};

const pedaco = (tipo: string, dados: Uint8Array): Uint8Array => {
  const nome = new TextEncoder().encode(tipo);
  const corpo = new Uint8Array(nome.length + dados.length);
  corpo.set(nome, 0);
  corpo.set(dados, nome.length);

  const saida = new Uint8Array(corpo.length + 8);
  const visao = new DataView(saida.buffer);
  visao.setUint32(0, dados.length);
  saida.set(corpo, 4);
  visao.setUint32(saida.length - 4, crc32(corpo));
  return saida;
};

/** `pixels` em RGBA, linha a linha. */
const montarPng = (largura: number, altura: number, pixels: Uint8Array): Uint8Array => {
  const ihdr = new Uint8Array(13);
  const v = new DataView(ihdr.buffer);
  v.setUint32(0, largura);
  v.setUint32(4, altura);
  ihdr[8] = 8; // bits por canal
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  // Cada linha é precedida pelo byte de filtro (0 = nenhum)
  const bruto = new Uint8Array(altura * (largura * 4 + 1));
  for (let y = 0; y < altura; y++) {
    const destino = y * (largura * 4 + 1);
    bruto[destino] = 0;
    bruto.set(pixels.subarray(y * largura * 4, (y + 1) * largura * 4), destino + 1);
  }

  const partes = [
    new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pedaco('IHDR', ihdr),
    pedaco('IDAT', new Uint8Array(deflateSync(bruto, { level: 9 }))),
    pedaco('IEND', new Uint8Array(0)),
  ];

  const total = partes.reduce((s, p) => s + p.length, 0);
  const png = new Uint8Array(total);
  let em = 0;
  for (const p of partes) {
    png.set(p, em);
    em += p.length;
  }
  return png;
};

// --- Formas, em coordenadas de 0 a 1 ---

const dentroDeRetanguloRedondo = (
  x: number,
  y: number,
  x0: number,
  y0: number,
  larg: number,
  alt: number,
  raio: number
): boolean => {
  const x1 = x0 + larg;
  const y1 = y0 + alt;
  if (x < x0 || x > x1 || y < y0 || y > y1) return false;

  const cx = Math.min(Math.max(x, x0 + raio), x1 - raio);
  const cy = Math.min(Math.max(y, y0 + raio), y1 - raio);
  const dx = x - cx;
  const dy = y - cy;
  return dx * dx + dy * dy <= raio * raio;
};

const dentroDoTriangulo = (
  x: number,
  y: number,
  pontos: [number, number][]
): boolean => {
  const [[ax, ay], [bx, by], [cx, cy]] = pontos;
  const d1 = (x - bx) * (ay - by) - (ax - bx) * (y - by);
  const d2 = (x - cx) * (by - cy) - (bx - cx) * (y - cy);
  const d3 = (x - ax) * (cy - ay) - (cx - ax) * (y - ay);
  const temNegativo = d1 < 0 || d2 < 0 || d3 < 0;
  const temPositivo = d1 > 0 || d2 > 0 || d3 > 0;
  return !(temNegativo && temPositivo);
};

/**
 * O balão de conversa, centralizado, com a escala pedida.
 *
 * `escala` existe por causa do ícone "maskable": o Android recorta o ícone
 * em formatos diferentes conforme o aparelho, e só garante os 80% do meio.
 * O desenho encolhe para caber nessa área segura.
 */
const dentroDoBalao = (x: number, y: number, escala: number): boolean => {
  const ex = 0.5 + (x - 0.5) / escala;
  const ey = 0.5 + (y - 0.5) / escala;

  const corpo = dentroDeRetanguloRedondo(ex, ey, 0.22, 0.25, 0.56, 0.42, 0.13);
  const rabo = dentroDoTriangulo(ex, ey, [
    [0.34, 0.63],
    [0.32, 0.81],
    [0.52, 0.63],
  ]);
  return corpo || rabo;
};

/**
 * Desenha um ícone.
 *
 * Renderiza em 4x e reduz depois: sem isso a borda arredondada sai
 * serrilhada, e ícone serrilhado numa tela de celular salta à vista.
 */
const desenhar = (tamanho: number, opcoes: { raioFundo: number; escalaMarca: number }) => {
  const amostras = 4;
  const pixels = new Uint8Array(tamanho * tamanho * 4);

  for (let y = 0; y < tamanho; y++) {
    for (let x = 0; x < tamanho; x++) {
      let fundo = 0;
      let marca = 0;

      for (let sy = 0; sy < amostras; sy++) {
        for (let sx = 0; sx < amostras; sx++) {
          const nx = (x + (sx + 0.5) / amostras) / tamanho;
          const ny = (y + (sy + 0.5) / amostras) / tamanho;

          if (dentroDeRetanguloRedondo(nx, ny, 0, 0, 1, 1, opcoes.raioFundo)) fundo++;
          if (dentroDoBalao(nx, ny, opcoes.escalaMarca)) marca++;
        }
      }

      const total = amostras * amostras;
      const coberturaFundo = fundo / total;
      const coberturaMarca = (marca / total) * coberturaFundo;

      const em = (y * tamanho + x) * 4;
      for (let c = 0; c < 3; c++) {
        pixels[em + c] = Math.round(
          AZUL[c] * (1 - coberturaMarca) + BRANCO[c] * coberturaMarca
        );
      }
      pixels[em + 3] = Math.round(coberturaFundo * 255);
    }
  }

  return montarPng(tamanho, tamanho, pixels);
};

const arquivos: { nome: string; tamanho: number; raioFundo: number; escalaMarca: number }[] = [
  { nome: 'icone-192.png', tamanho: 192, raioFundo: 0.22, escalaMarca: 1 },
  { nome: 'icone-512.png', tamanho: 512, raioFundo: 0.22, escalaMarca: 1 },
  // Sem cantos arredondados e com a marca menor: o Android recorta este no
  // formato do aparelho, e o que ele garante é só o miolo
  { nome: 'icone-maskable-512.png', tamanho: 512, raioFundo: 0, escalaMarca: 0.72 },
];

for (const a of arquivos) {
  const png = desenhar(a.tamanho, { raioFundo: a.raioFundo, escalaMarca: a.escalaMarca });
  await Bun.write(`public/${a.nome}`, png);
  console.log(`${a.nome} — ${a.tamanho}x${a.tamanho}, ${(png.length / 1024).toFixed(1)} kB`);
}
