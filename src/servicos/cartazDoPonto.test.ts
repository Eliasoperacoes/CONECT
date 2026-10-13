/**
 * O CARTAZ DE PONTO LEVA, NO RODAPÉ, O QR QUE INSTALA O APP (13/10/2026).
 */
import { test, expect } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import { ehQrDoInstalar, enderecoDoInstalar, montarCartazDoPonto } from './cartazDoPonto';

const PONTO = 'data:image/png;base64,PONTO';
const INSTALAR = 'data:image/png;base64,INSTALAR';
const larguraDe = (html: string, imagem: string) =>
  Number(new RegExp(`src="${imagem}"[^>]*width:(\\d+)px`).exec(html)![1]);

test('o QR do rodapé abre o tutorial que existe no site', () => {
  expect(enderecoDoInstalar('https://conectamalachias.vercel.app')).toBe(
    'https://conectamalachias.vercel.app/instalar.html'
  );
  expect(existsSync('public/instalar.html')).toBe(true);
});

test('o cartaz leva os dois QRs, e o da batida continua o grande', () => {
  const html = montarCartazDoPonto({ loja: 'Pirassununga', codigo: 'AB12CD', qrDoPonto: PONTO, qrDoInstalar: INSTALAR });
  expect(html).toContain('AB12CD');
  expect(html).toContain('Loja Pirassununga');
  // O da batida vem primeiro e é bem maior: é ele que a câmera tem de achar
  expect(html.indexOf(PONTO)).toBeLessThan(html.indexOf(INSTALAR));
  expect(larguraDe(html, PONTO)).toBeGreaterThanOrEqual(3 * larguraDe(html, INSTALAR));
  expect(html).toContain('Ainda não tem o app?');
});

test('sem o QR do tutorial, o cartaz sai só com o ponto', () => {
  const html = montarCartazDoPonto({ loja: 'Pirassununga', codigo: 'AB12CD', qrDoPonto: PONTO, qrDoInstalar: null });
  expect(html).toContain(PONTO);
  expect(html).not.toContain('Ainda não tem o app?');
});

test('o leitor de batida reconhece o QR do rodapé e não tenta bater ponto com ele', () => {
  const o = 'https://conectamalachias.vercel.app';
  expect(ehQrDoInstalar(enderecoDoInstalar(o))).toBe(true);
  expect(ehQrDoInstalar(`${o}/instalar.html?x=1`)).toBe(true);
  expect(ehQrDoInstalar(`${o}/?ponto=CONECTA-PONTO%3APirassununga%3AAB12CD`)).toBe(false);
  expect(ehQrDoInstalar('AB12CD')).toBe(false);

  // Com o cartaz inteiro no quadro, a leitura acha o QR pequeno primeiro
  const modal = readFileSync('src/componentes/ModalBaterPonto.tsx', 'utf8');
  const desvio = modal.indexOf('ehQrDoInstalar(achado.data)');
  expect(desvio).toBeGreaterThan(-1);
  expect(desvio).toBeLessThan(modal.indexOf('confirmarCodigo(achado.data)'));
  expect(modal).toContain('setErro(AVISO_QR_DO_INSTALAR)');
});

test('a tela imprime o cartaz pelo serviço, não por uma cópia própria', () => {
  const tela = readFileSync('src/componentes/BancoDeHoras.tsx', 'utf8');
  expect(tela).toContain('montarCartazDoPonto({');
  expect(tela).toContain('enderecoDoInstalar(window.location.origin)');
  expect(tela).not.toContain('Sem câmera? Digite o código');
});
