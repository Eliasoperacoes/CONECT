/**
 * Gera `supabase/functions/apurar-ponto/index.ts` a partir de
 * `src/servidor/funcaoApurarPonto.ts`, com as regras do ponto embutidas.
 *
 * O Supabase recebe a função colada no painel, num arquivo só — e as
 * regras moram em `src/servicos/apuracaoDoDia.ts`, que o aplicativo
 * também usa. Copiá-las à mão seria a mesma regra em dois lugares; este
 * script junta tudo, e o teste `funcaoApurarPonto.test.ts` falha se o
 * gerado ficar para trás do código.
 *
 *   bun scripts/gerar-funcao-apurar.ts
 */
import { writeFileSync, mkdirSync } from 'fs';

export const DESTINO = 'supabase/functions/apurar-ponto/index.ts';

export const gerarFuncaoApurar = async (): Promise<string> => {
  const r = await Bun.build({
    entrypoints: ['src/servidor/funcaoApurarPonto.ts'],
    target: 'browser',
    format: 'esm',
    minify: false,
  });
  if (!r.success) throw new Error(r.logs.map(String).join('\n'));
  const codigo = await r.outputs[0].text();
  return `// @ts-nocheck
/**
 * GERADO — NÃO EDITE. Fonte: src/servidor/funcaoApurarPonto.ts
 * Para atualizar: bun scripts/gerar-funcao-apurar.ts, e cole este arquivo
 * inteiro em Edge Functions → apurar-ponto → Code.
 */
${codigo.replace(/\r\n/g, '\n')}`;
};

if (import.meta.main) {
  mkdirSync('supabase/functions/apurar-ponto', { recursive: true });
  writeFileSync(DESTINO, await gerarFuncaoApurar());
  console.log(`Gerado: ${DESTINO}`);
}
