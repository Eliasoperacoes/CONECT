/**
 * O HOLERITE NO CELULAR MAIS VELHO (22/10/2026). No aplicativo Android quem
 * desenha é a WebView do aparelho. No celular do Marcos o holerite não abria
 * e não aparecia "Assinar"; no do Accacio aparecia o arquivo e não o botão —
 * e nenhum dos dois deixava erro registrado.
 */
import { test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';

const ler = (arq: string) => readFileSync(arq, 'utf8');

test('o leitor de PDF é o "legacy", com os recursos que a WebView antiga não tem', () => {
  const leitor = ler('src/servicos/leitorDePdf.ts');
  expect(leitor).toContain("import('pdfjs-dist/legacy/build/pdf.mjs')");
  expect(leitor).toContain("import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url')");
  // Nenhum outro lugar puxa a versão moderna direto
  for (const arq of ['src/componentes/VisorDePdf.tsx', 'src/servicos/pdfHolerite.ts']) {
    expect(ler(arq)).not.toMatch(/from 'pdfjs-dist'|import\('pdfjs-dist'\)/);
  }
});

test('a falha do visor e da barra de assinar chega ao TI, e a barra não some calada', () => {
  const visor = ler('src/componentes/VisorDePdf.tsx');
  expect(visor.match(/tela: 'visor de pdf'/g)).toHaveLength(2);
  const barra = ler('src/componentes/BarraDeAssinatura.tsx');
  expect(barra).toContain("tela: 'barra de assinar'");
  expect(barra).toContain('Tentar de novo');
});
