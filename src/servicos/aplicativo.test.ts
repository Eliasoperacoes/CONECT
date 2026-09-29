/**
 * O APLICATIVO ANDROID POR DENTRO — CONECTA
 *
 * O que o Elias achou no primeiro APK, e o que cada teste segura:
 *
 *  1. o voltar do aparelho não fazia nada;
 *  2. a abertura era uma tela preta e depois um spinner;
 *  4. segurar o ícone não oferecia atalho nenhum;
 *  5. câmera e microfone não funcionavam — nem pediam permissão.
 *
 * (O 3, o formato do aviso, está em envioDeAviso.test.ts.)
 */
import { test, expect, mock, beforeEach } from 'bun:test';

let dentroDoAplicativo = true;
let ouvintes: Record<string, (dado?: any) => void> = {};
let minimizou = 0;
let enderecoDeLancamento: string | undefined;

/** O que chegou às barras: a cor do fundo e o estilo dos ícones. */
let pintadas: string[] = [];
let estilos: string[] = [];

mock.module('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => dentroDoAplicativo },
  registerPlugin: () => ({
    pintar: async ({ cor }: { cor: string }) => {
      pintadas.push(cor);
    },
  }),
  SystemBars: {
    setStyle: async ({ style }: { style: string }) => {
      estilos.push(style);
    },
  },
  SystemBarsStyle: { Dark: 'DARK', Light: 'LIGHT', Default: 'DEFAULT' },
}));

mock.module('@capacitor/app', () => ({
  App: {
    addListener: async (evento: string, fn: (d?: any) => void) => {
      ouvintes[evento] = fn;
      return { remove: async () => {} };
    },
    getLaunchUrl: async () => (enderecoDeLancamento ? { url: enderecoDeLancamento } : undefined),
    minimizeApp: async () => {
      minimizou++;
    },
  },
}));

const { registrarVoltar, tratarVoltar, alturaDaPilha } = await import('./voltar');
const { ligarBotaoVoltar, ouvirEnderecosDoAplicativo, acompanharTemaNasBarras, corEhEscura } =
  await import('./aplicativo');

beforeEach(() => {
  dentroDoAplicativo = true;
  ouvintes = {};
  minimizou = 0;
  enderecoDeLancamento = undefined;
  while (tratarVoltar()) {
    /* esvazia a pilha que o teste anterior deixou */
  }
});

// ===============================================================
// 1. O VOLTAR
// ===============================================================

test('o voltar fecha a tela DE CIMA, e só ela', () => {
  const fechadas: string[] = [];
  registrarVoltar({ atual: () => fechadas.push('ficha') });
  registrarVoltar({ atual: () => fechadas.push('foto da ficha') });

  expect(tratarVoltar()).toBe(true);
  expect(fechadas).toEqual(['foto da ficha']);
});

test('UM MODAL QUE NÃO FECHA não prende a pessoa nele', () => {
  /* Esperando o modal desmontar para sair da pilha, um `aoFechar` sem
     efeito ficava no topo para sempre: cada voltar o chamava de novo */
  const fechadas: string[] = [];
  registrarVoltar({ atual: () => fechadas.push('de baixo') });
  registrarVoltar({ atual: () => {} });

  tratarVoltar();
  tratarVoltar();
  expect(fechadas).toEqual(['de baixo']);
  expect(tratarVoltar()).toBe(false);
});

test('um modal que fecha fora de ordem tira a si mesmo, e não o de cima', () => {
  /* Tirar o topo às cegas desregistraria o modal errado: o voltar
     seguinte "fecharia" um que já nem está na tela */
  const fechadas: string[] = [];
  const tirarDeBaixo = registrarVoltar({ atual: () => fechadas.push('baixo') });
  registrarVoltar({ atual: () => fechadas.push('cima') });

  tirarDeBaixo();
  expect(alturaDaPilha()).toBe(1);
  tratarVoltar();
  expect(fechadas).toEqual(['cima']);
});

test('SEM MODAL, o App recua; sem para onde recuar, MINIMIZA e não fecha', () => {
  let recuos = 0;
  let temParaOnde = true;
  ligarBotaoVoltar(() => {
    recuos++;
    return temParaOnde;
  });

  ouvintes['backButton']();
  expect(recuos).toBe(1);
  expect(minimizou).toBe(0);

  temParaOnde = false;
  ouvintes['backButton']();
  expect(minimizou).toBe(1);
});

test('com modal aberto, o voltar fecha o modal e o App nem é consultado', () => {
  let recuos = 0;
  let fechou = false;
  registrarVoltar({ atual: () => (fechou = true) });
  ligarBotaoVoltar(() => {
    recuos++;
    return true;
  });

  ouvintes['backButton']();
  expect(fechou).toBe(true);
  expect(recuos).toBe(0);
});

test('no navegador o voltar não é tocado', () => {
  dentroDoAplicativo = false;
  ligarBotaoVoltar(() => true);
  expect(ouvintes['backButton']).toBeUndefined();
});

test('TODO MODAL que se fecha entra na pilha do voltar', async () => {
  /**
   * A regra mora em cada modal, e o próximo modal escrito esquece. Este
   * teste varre os componentes: quem recebe `aoFechar` e desenha um
   * fundo que cobre a tela precisa chamar `useVoltar`.
   *
   * Fora da regra, de propósito: a janela flutuante do chat (é do
   * computador) e o cartão de justificar (vive dentro de uma tela).
   */
  const { readdirSync } = await import('node:fs');
  const esquecidos: string[] = [];

  for (const nome of readdirSync('src/componentes')) {
    if (!nome.endsWith('.tsx')) continue;
    const fonte = await Bun.file(`src/componentes/${nome}`).text();
    const ehSobreposicao = /fixed inset-0/.test(fonte) && /aoFechar/.test(fonte);
    const foraDaRegra = ['JanelaChat.tsx', 'PainelConversas.tsx', 'ConversasEmEspera.tsx'];
    if (ehSobreposicao && !foraDaRegra.includes(nome) && !fonte.includes('useVoltar(')) {
      esquecidos.push(nome);
    }
  }

  expect(esquecidos).toEqual([]);
});

test('o modal que fica montado registra só quando ABERTO', async () => {
  /* Registrado fechado, o voltar "fecharia" um modal invisível e a
     pessoa apertaria sem efeito nenhum */
  for (const nome of ['ModalCamera', 'ModalBaterPonto', 'ModalAlterarFoto', 'ModalEncaminharMensagem']) {
    const fonte = await Bun.file(`src/componentes/${nome}.tsx`).text();
    expect({ nome, certo: fonte.includes('useVoltar(aberto, aoFechar)') }).toEqual({
      nome,
      certo: true,
    });
  }
});

test('NENHUM MODAL registra o voltar e depois se esconde com return null', async () => {
  /**
   * A lista de cima é escrita à mão, e o visualizador de imagem não estava
   * nela: ele fica montado em toda conversa, registrava `useVoltar(true)`
   * e desenhava nada sem imagem. O primeiro voltar de quem só queria sair
   * da conversa "fechava" esse modal invisível. Medido no S10 do Elias.
   *
   * Esta varre todos: quem se esconde com `if (!x) return null` tem de
   * registrar só quando está à mostra.
   */
  const { readdirSync } = await import('node:fs');
  const errados: string[] = [];

  for (const nome of readdirSync('src/componentes')) {
    if (!nome.endsWith('.tsx')) continue;
    const fonte = await Bun.file(`src/componentes/${nome}`).text();
    const seEsconde = /^\s*if \(![\w.]+\) return null;/m.test(fonte);
    if (seEsconde && fonte.includes('useVoltar(true')) errados.push(nome);
  }

  expect(errados).toEqual([]);
});

// ===============================================================
// 4. OS ATALHOS DO ÍCONE
// ===============================================================

test('o atalho do ícone chega ao App, com o aplicativo fechado ou aberto', async () => {
  const recebidos: string[] = [];
  enderecoDeLancamento = 'conecta://abrir?atalho=ponto';

  ouvirEnderecosDoAplicativo((e) => recebidos.push(e.searchParams.get('atalho') || ''));
  await Bun.sleep(1);
  ouvintes['appUrlOpen']({ url: 'conecta://abrir?atalho=central' });

  expect(recebidos).toEqual(['ponto', 'central']);
});

test('TODO ATALHO aponta para uma aba que existe', async () => {
  /**
   * O App ignora `?atalho=` fora de `ABAS_PRINCIPAIS`. Um atalho com
   * nome errado abriria o aplicativo na última aba, como um toque
   * comum — e ninguém saberia que o atalho está quebrado.
   */
  const { ABAS_PRINCIPAIS } = await import('../tipos');
  const xml = await Bun.file('android/app/src/main/res/xml/shortcuts.xml').text();
  const pwa = JSON.parse(await Bun.file('public/manifest.json').text());

  const nativos = [...xml.matchAll(/conecta:\/\/abrir\?atalho=([a-z]+)/g)].map((m) => m[1]);
  const doPwa = pwa.shortcuts.map((s: { url: string }) => new URL(s.url, 'https://x').searchParams.get('atalho'));

  expect(nativos.length).toBeGreaterThanOrEqual(3);
  for (const aba of [...nativos, ...doPwa]) {
    expect((ABAS_PRINCIPAIS as readonly string[]).includes(aba)).toBe(true);
  }
});

test('o endereço do atalho é o que o aplicativo aceita abrir', async () => {
  const manifesto = await Bun.file('android/app/src/main/AndroidManifest.xml').text();
  expect(manifesto).toContain('android:scheme="conecta"');
  expect(manifesto).toContain('android:host="abrir"');
  expect(manifesto).toContain('android:resource="@xml/shortcuts"');
});

test('O ATALHO VENCE A ÚLTIMA ABA USADA', async () => {
  /**
   * O defeito do primeiro APK com atalhos: o atalho escolhia a aba, a
   * sessão do banco terminava de ser conferida meio segundo depois e
   * restaurava a última aba por cima. O atalho só abria o aplicativo.
   */
  const app = await Bun.file('src/App.tsx').text();
  const restauracao = app.slice(app.indexOf('SÓ AGORA DÁ PARA SABER ONDE A PESSOA PAROU'));
  expect(restauracao).toMatch(/abaPedidaNaEntrada\.current \?\?\s+ondeParei\(eu\.id/);
  expect(app).toContain('abaPedidaNaEntrada.current = atalho as AbaPrincipal;');
  expect(app).toContain("abaPedidaNaEntrada.current = 'ponto';");
});

// ===============================================================
// AS BARRAS DO ANDROID
// ===============================================================

test('a cor do tema diz se os ícones da barra são claros ou escuros', () => {
  expect(corEhEscura('#0E1216')).toBe(true);
  expect(corEhEscura('#F4F6F8')).toBe(false);
  expect(corEhEscura(' #FFFFFF ')).toBe(false);
  expect(corEhEscura('lixo')).toBe(false);
});

test('AS BARRAS SEGUEM O TEMA DO CONECTA', () => {
  /**
   * Com o CONECTA escuro as barras ficavam brancas; com o celular escuro
   * os ícones saíam brancos no branco — a hora e os avisos sumiam.
   */
  pintadas = [];
  estilos = [];
  let canvas = '#0E1216';
  let aoMudar: () => void = () => {};
  const meta = {
    conteudo: 'width=device-width, initial-scale=1.0, viewport-fit=cover',
    getAttribute: () => meta.conteudo,
    setAttribute: (_: string, v: string) => (meta.conteudo = v),
  };
  const g = globalThis as any;
  g.document = { documentElement: {}, querySelector: () => meta };
  g.getComputedStyle = () => ({ getPropertyValue: () => canvas });
  /* Só dispara a troca se alguém de fato pediu para observar o tema */
  g.MutationObserver = class {
    fn: () => void;
    constructor(fn: () => void) {
      this.fn = fn;
    }
    observe(_: unknown, opcoes: { attributeFilter?: string[] }) {
      if (opcoes?.attributeFilter?.includes('data-tema')) aoMudar = this.fn;
    }
    disconnect() {}
  };
  g.window = { matchMedia: () => ({ addEventListener() {}, removeEventListener() {} }) };

  try {
    acompanharTemaNasBarras();
    expect(pintadas).toEqual(['#0E1216']);
    expect(estilos).toEqual(['DARK']);

    // A pessoa troca para o tema claro dentro do CONECTA
    canvas = '#F4F6F8';
    aoMudar();
    expect(pintadas).toEqual(['#0E1216', '#F4F6F8']);
    expect(estilos).toEqual(['DARK', 'LIGHT']);
  } finally {
    delete g.document;
    delete g.getComputedStyle;
    delete g.MutationObserver;
    delete g.window;
  }
});

test('o plugin das barras está registrado no aplicativo', async () => {
  const atividade = await Bun.file(
    'android/app/src/main/java/br/com/malachiasautopecas/conecta/MainActivity.java'
  ).text();
  expect(atividade).toContain('registerPlugin(Barras.class);');
  expect(atividade.indexOf('registerPlugin(Barras.class)')).toBeLessThan(atividade.indexOf('super.onCreate'));
  const app = await Bun.file('src/App.tsx').text();
  expect(app).toContain('useEffect(() => acompanharTemaNasBarras(), []);');
});

test('"Bater ponto" abre a batida, e não só a aba', async () => {
  const app = await Bun.file('src/App.tsx').text();
  expect(app).toContain("if (atalho === 'ponto') setPedidoDeBater(true);");
  expect(app).toContain('ouvirEnderecosDoAplicativo((endereco) => lerEndereco(endereco, false))');
});

// ===============================================================
// 5. CÂMERA E MICROFONE
// ===============================================================

test('O APLICATIVO DECLARA câmera e microfone', async () => {
  /**
   * Sem a declaração, o WebView nega em silêncio: o Android não pede ao
   * usuário uma permissão que o aplicativo não declarou. A câmera do
   * ponto não abria e o recado de voz não gravava — sem pergunta, sem
   * erro na tela.
   */
  const manifesto = await Bun.file('android/app/src/main/AndroidManifest.xml').text();
  for (const permissao of ['CAMERA', 'RECORD_AUDIO', 'POST_NOTIFICATIONS']) {
    expect(manifesto).toContain(`android.permission.${permissao}"`);
  }
});

// ===============================================================
// 2. A ABERTURA
// ===============================================================

test('A TELA DE ESPERA aparece antes do sistema baixar', async () => {
  /* No React ela só surgia depois de 1,8 MB de pacote; até lá, tela
     vazia — preta, no tema escuro do celular */
  const html = await Bun.file('index.html').text();
  const antesDoPacote = html.slice(0, html.indexOf('/src/main.tsx'));
  expect(antesDoPacote).toContain('id="espera"');
  expect(antesDoPacote).toContain('/logo-malachias.svg');

  const app = await Bun.file('src/App.tsx').text();
  expect(app).toContain('encerrarEspera()');
  expect(app).not.toContain('Conectando à rede Malachias');
});

test('a abertura do Android é branca, e não a cor do tema do celular', async () => {
  const estilos = await Bun.file('android/app/src/main/res/values/styles.xml').text();
  expect(estilos).toContain('<item name="windowSplashScreenBackground">@color/fundo_abertura</item>');
  expect(estilos).toContain('<item name="android:windowBackground">@color/fundo_abertura</item>');

  const cores = await Bun.file('android/app/src/main/res/values/cores.xml').text();
  expect(cores).toContain('<color name="fundo_abertura">#FFFFFF</color>');

  const config = await Bun.file('capacitor.config.ts').text();
  expect(config).toContain("backgroundColor: '#ffffff'");
});


// ===============================================================
// 6. O TECLADO
// ===============================================================

/**
 * A FAIXA VAZIA ENTRE A CAIXA DE MENSAGEM E O TECLADO.
 *
 * Medida no S10 do Elias (Android 12, WebView 153): 170px, a altura exata
 * da barra de navegação, descontada duas vezes. O Capacitor lê a meta do
 * viewport UMA VEZ, no primeiro desenho; a troca de `cover` para `auto`
 * acontecia no aplicativo.ts, depois de o sistema baixar — tarde demais.
 */
const scriptDaTela = async (): Promise<{ html: string; script: string }> => {
  const html = await Bun.file('index.html').text();
  const meta = html.indexOf('<meta name="viewport"');
  const abre = html.indexOf('<script>', meta);
  const script = html.slice(abre + '<script>'.length, html.indexOf('</script>', abre));
  return { html, script };
};

const rodarScriptDaTela = (script: string, janela: Record<string, unknown>): string => {
  const meta = { content: 'width=device-width, initial-scale=1.0, viewport-fit=cover' };
  const documento = { querySelector: () => meta };
  new Function('window', 'document', script)(janela, documento);
  return meta.content;
};

test('no aplicativo a página fica entre as barras DESDE o primeiro desenho', async () => {
  const { html, script } = await scriptDaTela();

  // Dentro do aplicativo: vira `auto`
  expect(rodarScriptDaTela(script, { androidBridge: {} })).toContain('viewport-fit=auto');
  // No navegador e no iPhone: continua `cover`
  expect(rodarScriptDaTela(script, {})).toContain('viewport-fit=cover');

  // Logo depois da meta, antes de qualquer outro script da página
  const meta = html.indexOf('<meta name="viewport"');
  const primeiroScript = html.indexOf('<script', meta);
  expect(html.slice(primeiroScript, primeiroScript + 20)).toContain('<script>');
  expect(html.indexOf('if (window.androidBridge)', meta)).toBeGreaterThan(primeiroScript);
  expect(html.indexOf('if (window.androidBridge)', meta)).toBeLessThan(html.indexOf('</script>', primeiroScript));

  // E num lugar só: o aplicativo.ts não troca de novo, tarde demais
  const aplicativo = await Bun.file('src/servicos/aplicativo.ts').text();
  expect(aplicativo).not.toContain("replace('viewport-fit=cover'");
});
