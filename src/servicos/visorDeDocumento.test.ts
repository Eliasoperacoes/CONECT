/**
 * O DOCUMENTO NÃO PODE SER ESCRITO POR CIMA DO SISTEMA (01/10/2026).
 *
 * O Elias abriu o espelho no aplicativo Android: o app sumiu, o espelho
 * ficou no lugar com largura de computador, e não havia como voltar. Na
 * WebView do aplicativo não existe janela — `window.open('', '_blank')`
 * devolve a própria página, e o `document.write` a substituía.
 */
import { test, expect, beforeEach } from 'bun:test';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

let larguraDeCelular = true;
let janelasAbertas: Array<{ escrito: string; imprimiu: boolean }> = [];

(globalThis as any).window = {
  matchMedia: (q: string) => ({ matches: q.includes('max-width') && larguraDeCelular }),
  open: () => {
    const janela = { escrito: '', imprimiu: false };
    janelasAbertas.push(janela);
    return {
      document: { write: (h: string) => (janela.escrito += h), close: () => {} },
      focus: () => {},
      print: () => (janela.imprimiu = true),
    };
  },
};

const { mostrarDocumento, documentoNoVisor, fecharVisor, imprimirDocumento } = await import('./visorDeDocumento');

const ESPELHO = '<!doctype html><html><head><title>Espelho — Ana</title></head><body>tabela</body></html>';

beforeEach(() => {
  janelasAbertas = [];
  fecharVisor();
});

test('no celular, o documento vai para o visor — nenhuma janela é aberta', () => {
  larguraDeCelular = true;
  expect(mostrarDocumento(ESPELHO)).toBe(true);
  expect(janelasAbertas).toHaveLength(0);
  expect(documentoNoVisor()).toEqual({ html: ESPELHO, titulo: 'Espelho — Ana' });

  fecharVisor();
  expect(documentoNoVisor()).toBeNull();
});

test('no computador, a janela nova de sempre, com impressão quando pedida', async () => {
  larguraDeCelular = false;
  expect(imprimirDocumento(ESPELHO)).toBe(true);
  expect(janelasAbertas).toHaveLength(1);
  expect(janelasAbertas[0].escrito).toBe(ESPELHO);
  expect(documentoNoVisor()).toBeNull();
  await new Promise((r) => setTimeout(r, 300));
  expect(janelasAbertas[0].imprimiu).toBe(true);
});

test('nenhuma tela escreve documento numa janela vazia por conta própria', () => {
  /*
    Era o padrão em seis lugares: espelho do Meu RH, espelho e cartaz do
    RH, espelho de Equipe e ponto, férias e escala. Quem precisa abrir um
    documento chama `mostrarDocumento` — que decide entre janela e visor.
    O Meu RH ainda abre a janela antes do `await` no computador (o
    navegador só deixa abrir no toque), para o ANEXO, que é arquivo de
    fora. O espelho do Meu RH passou ao visor em todo aparelho
    (05/10/2026): é lá que fica a barra de assinar.
  */
  const pasta = join(import.meta.dir, '../componentes');
  const comJanelaVazia = readdirSync(pasta)
    .filter((f) => f.endsWith('.tsx'))
    .filter((f) => readFileSync(join(pasta, f), 'utf8').includes("window.open('', '_blank')"));
  expect(comJanelaVazia).toEqual(['MeuRH.tsx']);

  const meuRH = readFileSync(join(pasta, 'MeuRH.tsx'), 'utf8');
  expect(meuRH).toContain('const janela = rodandoNoAplicativo() ? null : abrirJanelaParaDepois();');
  // O espelho abre no visor, com a barra de assinar, e não numa janela
  const espelho = meuRH.slice(meuRH.indexOf('const abrirEspelho'), meuRH.indexOf('const darCiencia'));
  expect(espelho).toContain('mostrarParaAssinar(');
  expect(espelho).toContain('<AssinarEspelho');
  expect(espelho).not.toContain('abrirJanelaParaDepois');
});

test('o visor tem Voltar no alto e fecha pelo voltar do Android', () => {
  const visor = readFileSync(join(import.meta.dir, '../componentes/VisorDeDocumento.tsx'), 'utf8');
  expect(visor).toContain('useVoltar(!!documento, fecharVisor);');
  expect(visor).toContain('id="visor-voltar"');
  // E está montado no sistema
  expect(readFileSync(join(import.meta.dir, '../App.tsx'), 'utf8')).toContain('<VisorDeDocumento />');
});
