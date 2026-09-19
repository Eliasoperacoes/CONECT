/**
 * A publicação chegou ao ar? — CONECTA / Malachias Autopeças
 *
 *   bun scripts/conferir-deploy.ts
 *
 * Pergunta ao GitHub o que a Vercel respondeu nos últimos commits.
 *
 * ===================================================================
 * POR QUE ISTO EXISTE
 * ===================================================================
 *
 * Sete commits seguidos foram escritos, testados e empurrados — e nenhum
 * chegou ao ar. O `vercel.json` tinha uma chave inválida e a Vercel
 * recusava o arquivo antes de compilar.
 *
 * Nada acusou: os testes passavam, o `build` passava, o `push` passava.
 * O sintoma chegou dias depois como "não atualizou", com o usuário
 * procurando telas que existiam só na minha máquina.
 *
 * `git push` não é publicação. Este script fecha essa distância.
 */

const REPO = 'Eliasoperacoes/CONECT';
const QUANTOS = 10;

interface Commit {
  sha: string;
  commit: { message: string };
}

const buscar = async (caminho: string) => {
  const resposta = await fetch(`https://api.github.com/repos/${REPO}/${caminho}`, {
    headers: { accept: 'application/vnd.github+json' },
  });
  if (!resposta.ok) {
    throw new Error(`GitHub respondeu ${resposta.status} em ${caminho}`);
  }
  return resposta.json();
};

const SINAL: Record<string, string> = {
  success: 'NO AR   ',
  failure: 'FALHOU  ',
  error: 'ERRO    ',
  pending: 'subindo ',
};

const commits: Commit[] = await buscar(`commits?sha=main&per_page=${QUANTOS}`);

let primeiraFalha: { sha: string; titulo: string } | null = null;
let houveSucesso = false;

for (const c of commits) {
  const estado = await buscar(`commits/${c.sha}/status`);
  const situacao: string = estado.state;
  const titulo = c.commit.message.split('\n')[0].slice(0, 58);

  console.log(`${SINAL[situacao] || situacao.padEnd(8)} ${c.sha.slice(0, 7)} ${titulo}`);

  // Os commits vêm do mais novo para o mais antigo: a última falha lida
  // antes do primeiro sucesso é onde a publicação parou
  if (situacao === 'success') houveSucesso = true;
  else if (!houveSucesso && (situacao === 'failure' || situacao === 'error')) {
    primeiraFalha = { sha: c.sha, titulo };
  }

  const detalhe = estado.statuses?.[0];
  if (detalhe?.description && situacao !== 'success') {
    console.log(`         ↳ ${detalhe.description}`);
    if (detalhe.target_url) console.log(`         ↳ ${detalhe.target_url}`);
  }
}

console.log('');
if (primeiraFalha) {
  console.log('A PUBLICAÇÃO ESTÁ PARADA.');
  console.log(`Quebrou em ${primeiraFalha.sha.slice(0, 7)} — ${primeiraFalha.titulo}`);
  console.log('Tudo depois disso existe só no repositório, não no ar.');
  process.exit(1);
}

console.log('A última publicação está no ar.');
