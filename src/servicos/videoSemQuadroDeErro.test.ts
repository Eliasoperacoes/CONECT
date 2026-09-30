/**
 * A CÂMERA NÃO ABRE COM CARA DE VÍDEO QUEBRADO.
 *
 * O Elias: ao abrir a câmera para ler o QR, aparecia "uma imagem de vídeo
 * com erro". É o quadro cinza com o ícone de "play" que o WebView do
 * Android desenha num `<video>` sem imagem ainda. Todo vídeo do sistema
 * leva a capa vazia e só aparece quando a primeira imagem chega.
 */
import { test, expect } from 'bun:test';
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';

const PASTA = join(import.meta.dir, '../componentes');

const videos = readdirSync(PASTA)
  .filter((f) => f.endsWith('.tsx'))
  .flatMap((arquivo) => {
    const fonte = readFileSync(join(PASTA, arquivo), 'utf8');
    return [...fonte.matchAll(/<video\b[\s\S]*?\/>/g)].map((m) => ({ arquivo, tag: m[0] }));
  });

test('há câmeras para conferir (a varredura não está cega)', () => {
  expect(videos.map((v) => v.arquivo).sort()).toEqual(
    expect.arrayContaining(['ModalBaterPonto.tsx', 'ModalCamera.tsx'])
  );
});

test('todo vídeo tem a capa vazia no lugar do quadro de erro', () => {
  for (const { arquivo, tag } of videos) {
    expect(`${arquivo}: ${tag.includes('poster={CAPA_VAZIA_DO_VIDEO}')}`).toBe(`${arquivo}: true`);
  }
});

test('todo vídeo fica invisível até a primeira imagem', () => {
  for (const { arquivo, tag } of videos) {
    expect(`${arquivo}: ${tag.includes('onPlaying={() => setImagemChegou(true)}')}`).toBe(`${arquivo}: true`);
    expect(`${arquivo}: ${tag.includes("imagemChegou ? 'opacity-100' : 'opacity-0'")}`).toBe(`${arquivo}: true`);
  }
});

test('a espera da câmera no ponto tem fundo inteiro, sem o vídeo aparecendo atrás', () => {
  const ponto = readFileSync(join(PASTA, 'ModalBaterPonto.tsx'), 'utf8');
  expect(ponto).toContain("(estado === 'iniciando' || (estado === 'lendo' && !imagemChegou))");
  expect(ponto).toContain('justify-center gap-2 text-white bg-black">');
});
