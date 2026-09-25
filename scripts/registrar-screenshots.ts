/**
 * REGISTRA OS PRINTS NO MANIFESTO — CONECTA / Malachias Autopeças
 *
 *   bun scripts/registrar-screenshots.ts
 *
 * ===================================================================
 * POR QUE ISTO NÃO GERA A IMAGEM
 * ===================================================================
 *
 * `screenshots` é o que o Android mostra na caixa de instalação e o que a
 * Play Store exibe na ficha do aplicativo. É a única coisa que a pessoa
 * vê antes de decidir instalar.
 *
 * Um desenho bonito feito por script não é o sistema: seria propaganda de
 * uma tela que não existe. O print tem de sair do CONECTA rodando — e
 * quem tem o CONECTA rodando é você, não este script.
 *
 * ===================================================================
 * COMO USAR
 * ===================================================================
 *
 * 1. Abra o sistema e tire dois prints:
 *
 *      public/print-celular.png   — retrato, algo perto de 390x844
 *      public/print-computador.png — paisagem, algo perto de 1280x800
 *
 *    A aba Ponto no celular e o painel de gestão no computador são as
 *    duas telas que dizem o que o sistema faz.
 *
 * 2. Rode este script. Ele lê o tamanho real de cada PNG e escreve a
 *    declaração no manifesto.
 *
 * O TAMANHO É LIDO DO ARQUIVO, e não digitado: `sizes` errado faz o
 * Android recusar o print em silêncio, e ninguém liga uma coisa à outra.
 */

const MANIFESTO = 'public/manifest.json';

interface Print {
  arquivo: string;
  rotulo: string;
  plataforma: 'narrow' | 'wide';
}

const PRINTS: Print[] = [
  { arquivo: 'print-celular.png', rotulo: 'O ponto no celular', plataforma: 'narrow' },
  { arquivo: 'print-computador.png', rotulo: 'O painel de gestão', plataforma: 'wide' },
];

/**
 * Largura e altura de um PNG, lidas do cabeçalho IHDR.
 *
 * São os bytes 16..24 de todo PNG válido — não precisa de biblioteca, e
 * uma biblioteca a mais só para isto seria peso sem motivo.
 */
const medir = (bytes: Uint8Array): { largura: number; altura: number } | null => {
  const assinatura = [0x89, 0x50, 0x4e, 0x47];
  if (bytes.length < 24 || !assinatura.every((b, i) => bytes[i] === b)) return null;

  const ler = (posicao: number) =>
    (bytes[posicao] << 24) |
    (bytes[posicao + 1] << 16) |
    (bytes[posicao + 2] << 8) |
    bytes[posicao + 3];

  return { largura: ler(16), altura: ler(20) };
};

const manifesto = JSON.parse(await Bun.file(MANIFESTO).text());
const declarados: unknown[] = [];
let faltando = 0;

for (const print of PRINTS) {
  const caminho = `public/${print.arquivo}`;
  const arquivo = Bun.file(caminho);

  if (!(await arquivo.exists())) {
    console.log(`  falta  ${caminho}`);
    faltando++;
    continue;
  }

  const medida = medir(new Uint8Array(await arquivo.arrayBuffer()));
  if (!medida) {
    console.log(`  ERRO   ${caminho} não é um PNG válido`);
    faltando++;
    continue;
  }

  /**
   * A proporção precisa ser CLARA, e não só "não é o contrário".
   *
   * Um print quadrado passava como paisagem, porque a conta era
   * `altura > largura` — e quadrado dá `false`, que é o mesmo que
   * deitado. O Android usaria um quadrado como print de computador e a
   * caixa de instalação sairia estranha.
   */
  const esperado = print.plataforma === 'narrow' ? 'em pé' : 'deitado';
  const real =
    medida.altura > medida.largura
      ? 'em pé'
      : medida.largura > medida.altura
        ? 'deitado'
        : 'quadrado';

  if (real !== esperado) {
    console.log(`  ERRO   ${caminho} está ${real}, e deveria estar ${esperado}`);
    faltando++;
    continue;
  }

  declarados.push({
    src: `/${print.arquivo}`,
    sizes: `${medida.largura}x${medida.altura}`,
    type: 'image/png',
    form_factor: print.plataforma,
    label: print.rotulo,
  });

  console.log(`  ok     ${caminho} (${medida.largura}x${medida.altura})`);
}

if (declarados.length === 0) {
  console.log('\nNenhum print encontrado. Leia o cabeçalho deste arquivo.');
  process.exit(1);
}

manifesto.screenshots = declarados;

await Bun.write(MANIFESTO, `${JSON.stringify(manifesto, null, 2)}\n`);
console.log(`\n${declarados.length} print(s) no manifesto.`);

if (faltando > 0) {
  console.log(
    `${faltando} ainda faltando — o PWABuilder pede os dois formatos, celular e computador.`
  );
}
