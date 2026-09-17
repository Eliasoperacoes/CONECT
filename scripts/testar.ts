/**
 * Roda cada arquivo de teste num processo próprio — CONECTA
 *
 * Os testes trocam módulos inteiros por dublês (`mock.module`), e essa troca
 * vale para o processo todo. Rodando tudo de uma vez, o dublê de um arquivo
 * passaria a valer dentro do outro: o teste da ponte de comunicação receberia
 * o dublê escrito para o teste do bancoDados e passaria sem testar nada.
 *
 * Um processo por arquivo mantém cada um no seu mundo.
 */

import { Glob } from 'bun';

const arquivos = [...new Glob('src/**/*.test.ts').scanSync('.')].sort();

if (arquivos.length === 0) {
  console.error('Nenhum arquivo de teste encontrado.');
  process.exit(1);
}

let houveFalha = false;

for (const arquivo of arquivos) {
  const execucao = Bun.spawnSync(['bun', 'test', arquivo], {
    stdout: 'inherit',
    stderr: 'inherit',
    /**
     * SEGUNDA TRANCA CONTRA FALAR COM O BANCO DE PRODUÇÃO.
     *
     * A primeira está em `supabase.ts`, que não cria cliente em modo de
     * teste. Esta existe porque a primeira é uma linha de código que alguém
     * pode simplificar sem perceber o que ela segura — e aqui as chaves nem
     * chegam ao processo.
     *
     * Vale só para `bun run test`. Quem roda `bun test arquivo` direto
     * continua protegido pela tranca de dentro.
     */
    env: {
      ...process.env,
      VITE_SUPABASE_URL: '',
      VITE_SUPABASE_ANON_KEY: '',
      NODE_ENV: 'test',
    },
  });
  if (execucao.exitCode !== 0) houveFalha = true;
}

process.exit(houveFalha ? 1 : 0);
