/**
 * Gera as funções de servidor que levam regras do aplicativo embutidas:
 *
 *   supabase/functions/apurar-ponto/index.ts        de src/servidor/funcaoApurarPonto.ts
 *   supabase/functions/lembrar-pendencias/index.ts  de src/servidor/funcaoLembrarPendencias.ts
 *
 * O Supabase recebe a função colada no painel, num arquivo só — e as
 * regras moram em `src/servicos/` (`apuracaoDoDia.ts`, `mural.ts`), que o
 * aplicativo também usa. Copiá-las à mão seria a mesma regra em dois
 * lugares; este script junta tudo, e os testes falham se o gerado ficar
 * para trás do código.
 *
 *   bun scripts/gerar-funcao-apurar.ts
 */
import { writeFileSync, mkdirSync } from 'fs';
import { dirname } from 'path';

export const DESTINO = 'supabase/functions/apurar-ponto/index.ts';
export const DESTINO_LEMBRETES = 'supabase/functions/lembrar-pendencias/index.ts';

const gerar = async (fonte: string, nome: string): Promise<string> => {
  const r = await Bun.build({
    entrypoints: [fonte],
    target: 'browser',
    format: 'esm',
    minify: false,
  });
  if (!r.success) throw new Error(r.logs.map(String).join('\n'));
  const codigo = await r.outputs[0].text();
  return `// @ts-nocheck
/**
 * GERADO — NÃO EDITE. Fonte: ${fonte}
 * Para atualizar: bun scripts/gerar-funcao-apurar.ts, e cole este arquivo
 * inteiro em Edge Functions → ${nome} → Code.
 */
${codigo.replace(/\r\n/g, '\n')}`;
};

export const gerarFuncaoApurar = (): Promise<string> =>
  gerar('src/servidor/funcaoApurarPonto.ts', 'apurar-ponto');

export const gerarFuncaoLembretes = (): Promise<string> =>
  gerar('src/servidor/funcaoLembrarPendencias.ts', 'lembrar-pendencias');

if (import.meta.main) {
  for (const [destino, gerador] of [
    [DESTINO, gerarFuncaoApurar],
    [DESTINO_LEMBRETES, gerarFuncaoLembretes],
  ] as const) {
    mkdirSync(dirname(destino), { recursive: true });
    writeFileSync(destino, await gerador());
    console.log(`Gerado: ${destino}`);
  }
}
