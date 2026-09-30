/**
 * Grava o som do CONECTA para o aplicativo Android — CONECTA / Malachias Autopeças
 *
 *   bun scripts/gerar-som-do-aviso.ts
 *
 * O som é uma receita (src/servicos/somDoAviso.ts), e não um arquivo
 * baixado de algum lugar: o navegador toca as amostras direto, e este
 * script grava AS MESMAS num WAV, que o canal de avisos do Android usa
 * como toque. Mudou a receita, rode este script e gere o APK — o aviso
 * continua soando igual no computador e no celular.
 */
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { gerarWavDoAviso, DURACAO_DO_AVISO } from '../src/servicos/somDoAviso';

// O Android só aceita minúsculas, números e "_" no nome de um recurso
const pasta = join(import.meta.dir, '../android/app/src/main/res/raw');
const arquivo = join(pasta, 'aviso_conecta.wav');

mkdirSync(pasta, { recursive: true });
const wav = gerarWavDoAviso(44100);
writeFileSync(arquivo, wav);

console.log(`Som gravado: ${arquivo} (${(wav.length / 1024).toFixed(0)} KB, ${DURACAO_DO_AVISO}s)`);
