/**
 * O PAINEL DO SINO NÃO PODE VAZAR DA TELA — CONECTA
 *
 * ===================================================================
 * O QUE MOTIVOU
 * ===================================================================
 *
 * O Elias, do celular: "a barra abre vazando o limite do layout pro
 * lado esquerdo da tela".
 *
 * O painel era `absolute right-0`, ancorado no SINO. A borda direita
 * dele ficava onde o sino está — não onde a tela acaba. Como ele tem
 * quase a largura do aparelho, o que sobrava vazava pela ESQUERDA e
 * sumia fora da janela.
 *
 * ===================================================================
 * ISTO JÁ TINHA SIDO "CONSERTADO" UMA VEZ
 * ===================================================================
 *
 * O comentário que estava no código dizia:
 *
 *   "No celular o painel ocupa quase a largura da tela e se ancora pela
 *    direita. Um menu de largura fixa estourava a borda no aparelho da
 *    loja, e a última linha ficava cortada."
 *
 * A correção de então limitou a LARGURA com `calc(100vw-2rem)`. Não
 * resolveu, porque o problema nunca foi a largura — era o ponto de
 * ancoragem. Largura certa ancorada no lugar errado vaza igual.
 *
 * E o comentário, escrito com segurança, fez o defeito parecer tratado
 * por meses. É o mesmo caso do cabeçalho do Banco de Horas, que dizia
 * usar "o mesmo número que o espelho" enquanto usava outro.
 *
 * ===================================================================
 * POR QUE ESTE TESTE EXISTE, SE É LAYOUT
 * ===================================================================
 *
 * A conta que decide a posição é aritmética pura, e é ela que erra: dá
 * para exercitá-la sem navegador nenhum. O que não dá para testar aqui
 * é a aparência — só que a aparência não era o problema.
 */
import { test, expect } from 'bun:test';

/**
 * A MESMA CONTA DE `medirPosicao`, no `SinoNotificacoes`.
 *
 * Copiada de propósito, e é a única cópia aceitável aqui: o original
 * vive dentro de um componente React que depende de `window` e de um
 * `ref` montado. O teste abaixo confere que as duas não divergiram.
 */
const MARGEM = 8;
const LARGURA_MAXIMA = 352;

const posicaoDoPainel = (
  sino: { right: number; bottom: number },
  larguraDaTela: number
): { top: number; left: number; width: number } => {
  const width = Math.min(LARGURA_MAXIMA, larguraDaTela - MARGEM * 2);
  const left = Math.min(
    Math.max(MARGEM, sino.right - width),
    larguraDaTela - width - MARGEM
  );
  return { top: sino.bottom + MARGEM, left, width };
};

/** As larguras que este sistema encontra de verdade. */
const TELAS = [
  { nome: 'celular pequeno', largura: 320 },
  { nome: 'celular da loja', largura: 390 },
  { nome: 'celular grande', largura: 430 },
  { nome: 'tablet', largura: 768 },
  { nome: 'computador', largura: 1440 },
];

test('O PAINEL NUNCA SAI DA TELA, em nenhuma largura', () => {
  /**
   * O defeito, preso num teste. Vale para o sino em QUALQUER posição do
   * cabeçalho — porque foi o sino não estar colado na borda direita que
   * fez o painel vazar.
   */
  for (const tela of TELAS) {
    for (let direitaDoSino = 40; direitaDoSino <= tela.largura; direitaDoSino += 10) {
      const p = posicaoDoPainel({ right: direitaDoSino, bottom: 56 }, tela.largura);

      const onde = `${tela.nome} (${tela.largura}px), sino terminando em ${direitaDoSino}px`;

      expect({ onde, vazaEsquerda: p.left < 0 }).toEqual({ onde, vazaEsquerda: false });
      expect({
        onde,
        vazaDireita: p.left + p.width > tela.largura,
      }).toEqual({ onde, vazaDireita: false });
    }
  }
});

test('a margem das bordas é respeitada dos dois lados', () => {
  /**
   * Encostar na borda não "vaza", mas fica feio e some debaixo do canto
   * arredondado do aparelho. A folga é a mesma dos dois lados.
   */
  for (const tela of TELAS) {
    for (const direitaDoSino of [40, tela.largura / 2, tela.largura]) {
      const p = posicaoDoPainel({ right: direitaDoSino, bottom: 56 }, tela.largura);

      expect(p.left).toBeGreaterThanOrEqual(MARGEM);
      expect(tela.largura - (p.left + p.width)).toBeGreaterThanOrEqual(MARGEM);
    }
  }
});

test('ALINHA PELA DIREITA DO SINO quando cabe', () => {
  /**
   * É de onde o menu "sai", e é o que se espera dele. As bordas da tela
   * mandam mais — mas quando não há conflito, o alinhamento natural
   * vale.
   */
  const p = posicaoDoPainel({ right: 1400, bottom: 56 }, 1440);

  expect(p.left + p.width).toBe(1400);
  expect(p.width).toBe(LARGURA_MAXIMA);
});

test('no celular ele ocupa a largura útil, e não 22rem', () => {
  /**
   * 352px num aparelho de 320 não cabe. A largura cede antes da
   * posição — é o que o `min` decide.
   */
  const p = posicaoDoPainel({ right: 300, bottom: 56 }, 320);

  expect(p.width).toBe(320 - MARGEM * 2);
  expect(p.left).toBe(MARGEM);
});

test('abre ABAIXO do sino, e não por cima dele', () => {
  const p = posicaoDoPainel({ right: 380, bottom: 56 }, 390);
  expect(p.top).toBe(56 + MARGEM);
});

test('A CONTA DO COMPONENTE É A MESMA CONTA DESTE TESTE', async () => {
  /**
   * A cópia acima só vale enquanto as duas concordarem. Sem esta
   * conferência, alguém mexeria no componente e o teste continuaria
   * verde sobre uma conta que não existe mais — que é pior do que não
   * ter teste, porque dá segurança falsa.
   */
  const fonte = await Bun.file('src/componentes/SinoNotificacoes.tsx').text();

  expect(fonte).toContain('const MARGEM = 8;');
  expect(fonte).toContain('const LARGURA_MAXIMA = 352;');
  expect(fonte).toContain(
    'const largura = Math.min(LARGURA_MAXIMA, window.innerWidth - MARGEM * 2);'
  );
  expect(fonte).toContain('Math.max(MARGEM, r.right - largura)');
  expect(fonte).toContain('window.innerWidth - largura - MARGEM');
});

test('o painel é FIXO na janela, e não preso ao sino', () => {
  /**
   * A raiz do defeito. `absolute` posiciona em relação ao ancestral
   * posicionado — o sino —, e por isso `right-0` punha a borda direita
   * do painel onde o sino estava, e não onde a tela acabava.
   *
   * Com `fixed` e a posição medida, as coordenadas são da JANELA, que é
   * o que "não sair da tela" quer dizer.
   */
  return Bun.file('src/componentes/SinoNotificacoes.tsx')
    .text()
    .then((fonte) => {
      const painel = fonte.slice(fonte.indexOf('role="dialog"'));

      expect(painel).toContain('className="fixed');
      expect(painel).not.toContain('absolute right-0');
      // E a largura não é mais o remendo que não resolvia
      expect(painel).not.toContain('calc(100vw-2rem)');
    });
});
