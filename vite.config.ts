import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

/**
 * O carimbo desta publicação.
 *
 * Vai gravado DENTRO do pacote e também num arquivo solto (`versao.json`).
 * O aplicativo compara os dois de tempos em tempos: diferentes quer dizer
 * que saiu versão nova e a aba está velha.
 *
 * Existe porque "atualizei e não apareceu" acontecia sem ninguém conseguir
 * checar nada — nem quem usa, nem quem publica.
 */
const VERSAO = new Date().toISOString();

/** Publica o carimbo num arquivo que o aplicativo consegue reler sozinho. */
const carimboDaVersao = () => ({
  name: 'carimbo-da-versao',
  generateBundle() {
    (this as any).emitFile({
      type: 'asset',
      fileName: 'versao.json',
      source: JSON.stringify({ versao: VERSAO }, null, 2),
    });
  },
});

export default defineConfig(() => {
  return {
    define: {
      __VERSAO_BUILD__: JSON.stringify(VERSAO),
    },
    plugins: [react(), tailwindcss(), carimboDaVersao()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
