/**
 * Verificação do PACOTE INSTALÁVEL — CONECTA
 *
 * O que motivou: gerar o APK nativo no pwabuilder.com. Ele lê o site
 * publicado e recusa — ou gera um pacote capenga — quando falta um
 * campo do manifesto, um tamanho de ícone ou o trabalhador de segundo
 * plano.
 *
 * Isto aqui confere o REPOSITÓRIO; `scripts/conferir-pwa.ts` confere o
 * que está no ar, que é o que o PWABuilder vê de fato. Os dois
 * precisam: arquivo certo aqui e não servido lá dá no mesmo que não
 * existir.
 */
import { test, expect } from 'bun:test';

const lerManifesto = async (): Promise<Record<string, unknown>> =>
  JSON.parse(await Bun.file('public/manifest.json').text());

const lerTrabalhador = async (): Promise<string> =>
  Bun.file('public/sw-avisos.js').text();

test('O MANIFESTO TEM O QUE O PWABUILDER EXIGE', async () => {
  /**
   * Os seis que ele trata como obrigatórios. Sem qualquer um deles não
   * sai pacote nenhum, e o relatório diz só "manifest incomplete".
   */
  const m = await lerManifesto();

  for (const campo of ['id', 'name', 'short_name', 'start_url', 'scope', 'display']) {
    expect(m[campo]).toBeTruthy();
  }

  // Sem standalone, o aplicativo abre com a barra do navegador por cima
  expect(m.display).toBe('standalone');

  // Estes ele marca como recomendados, e a loja do Android pede
  for (const campo of ['description', 'lang', 'dir', 'orientation', 'categories']) {
    expect(m[campo]).toBeTruthy();
  }

  expect(m.lang).toBe('pt-BR');
});

test('OS TRÊS ÍCONES, e o maskable não é luxo', async () => {
  /**
   * 192 e 512 são o mínimo do PWABuilder. O MASKABLE é o que impede o
   * Android de recortar o ícone num círculo e comer as bordas do logo
   * da Malachias — sem ele o aplicativo nasce com o ícone cortado.
   */
  const m = await lerManifesto();
  const icones = m.icons as Array<{ sizes: string; purpose?: string; src: string }>;

  expect(icones.some((i) => i.sizes.includes('192x192'))).toBe(true);
  expect(icones.some((i) => i.sizes.includes('512x512'))).toBe(true);
  expect(icones.some((i) => (i.purpose || '').includes('maskable'))).toBe(true);
});

test('SE HÁ SCREENSHOT DECLARADO, O ARQUIVO EXISTE', async () => {
  /**
   * `screenshots` é o que o Android mostra na caixa de instalação — é a
   * única coisa que a pessoa vê antes de decidir instalar. Declarado e
   * ausente, a caixa aparece com um retângulo vazio, o que é pior do
   * que aparecer sem print nenhum.
   *
   * O campo ainda não existe: os prints saem do sistema rodando, e
   * `scripts/registrar-screenshots.ts` os declara com o tamanho LIDO do
   * arquivo — `sizes` errado faz o Android recusar em silêncio.
   */
  const m = await lerManifesto();
  const prints = (m.screenshots || []) as Array<{ src: string; sizes: string; form_factor?: string }>;

  for (const print of prints) {
    expect(await Bun.file(`public${print.src}`).exists()).toBe(true);
    expect(print.sizes).toMatch(/^\d+x\d+$/);
    expect(print.form_factor).toBeTruthy();
  }
});

test('TODO ÍCONE DECLARADO EXISTE NO REPOSITÓRIO', async () => {
  /**
   * Declarado e ausente é pior que ausente: o navegador tenta, falha em
   * silêncio e cai no ícone genérico — e ninguém liga uma coisa à
   * outra.
   */
  const m = await lerManifesto();
  const icones = m.icons as Array<{ src: string }>;

  for (const icone of icones) {
    const caminho = `public${icone.src}`;
    expect(await Bun.file(caminho).exists()).toBe(true);
  }
});

test('OS ATALHOS DO ÍCONE LEVAM A ALGUM LUGAR', async () => {
  /**
   * Segurar o ícone no celular abre os atalhos que o manifesto declara.
   * Eles chegam como `?atalho=`, e sem o App tratá-los abririam o
   * sistema na última aba usada, como um toque comum — o atalho seria
   * enfeite.
   */
  const m = await lerManifesto();
  const atalhos = (m.shortcuts || []) as Array<{ url: string }>;

  expect(atalhos.length).toBeGreaterThan(0);

  const app = await Bun.file('src/App.tsx').text();
  expect(app).toContain("endereco.searchParams.get('atalho')");
  expect(app).toContain("endereco.searchParams.delete('atalho')");

  /**
   * E cada destino declarado tem que ser uma aba que existe — um
   * atalho para uma aba removida abriria o sistema em lugar nenhum.
   */
  for (const atalho of atalhos) {
    const destino = new URL(atalho.url, 'https://x').searchParams.get('atalho');
    expect(destino).toBeTruthy();
    expect(app).toContain('ABAS_PRINCIPAIS as readonly string[]');
  }
});

test('O TRABALHADOR FUNCIONA OFFLINE, sem servir versão velha', async () => {
  /**
   * O PWABuilder só considera "works offline" quando o trabalhador
   * trata `fetch`. Sem isso o pacote sai com nota baixa, e o celular do
   * galpão continua dando a página de erro do navegador — e a pessoa
   * conclui que o sistema caiu.
   *
   * Mas a regra da casa continua valendo: REDE PRIMEIRO. Cache primeiro
   * serviria a tela que já foi corrigida, que é a dor antiga deste
   * projeto. O `fetch(pedido)` vem antes do `caches.match`.
   */
  const sw = await lerTrabalhador();

  expect(sw).toContain("addEventListener('fetch'");

  const corpo = sw.slice(sw.indexOf("addEventListener('fetch'"));
  expect(corpo.indexOf('await fetch(pedido)')).toBeLessThan(
    corpo.indexOf('caches.match(pedido)')
  );

  // E só guarda resposta boa: página de erro em cache é pior que nada
  expect(corpo).toContain('daRede && daRede.ok');
});

test('DADO DO SISTEMA NÃO VEM DO CACHE', async () => {
  /**
   * Chamada ao Supabase servida do cache seria dado errado apresentado
   * como certo — e este sistema decide hora trabalhada e banco de
   * horas. Só a casca é guardada.
   *
   * E `versao.json` precisa vir do servidor sempre: é ele que avisa que
   * saiu publicação nova. Guardado, o aviso nunca apareceria.
   */
  const sw = await lerTrabalhador();

  expect(sw).toContain('endereco.origin !== self.location.origin');
  expect(sw).toContain("endereco.pathname === '/versao.json'");
});

test('publicação nova descarta o cache da anterior', async () => {
  /**
   * Sem isto, arquivo velho convive com arquivo novo no mesmo cache e a
   * tela mistura as duas versões — defeito que aparece só depois do
   * deploy e some ao limpar o navegador, que é o pior tipo.
   */
  const sw = await lerTrabalhador();

  expect(sw).toContain('const CACHE =');
  expect(sw).toContain('caches.keys()');
  expect(sw).toContain('caches.delete(n)');
});

test('O VÍNCULO COM O APLICATIVO ESTÁ PREPARADO', async () => {
  /**
   * O `assetlinks.json` é o que diz ao Android que aquele APK pode
   * abrir este site sem a barra do navegador. Ele só se completa
   * DEPOIS de gerar o pacote, com o fingerprint que o PWABuilder
   * devolve — mas o caminho precisa existir e ser servido antes.
   */
  const caminho = 'public/.well-known/assetlinks.json';
  expect(await Bun.file(caminho).exists()).toBe(true);

  const vinculo = JSON.parse(await Bun.file(caminho).text());
  expect(vinculo[0].relation).toContain('delegate_permission/common.handle_all_urls');
  expect(vinculo[0].target.namespace).toBe('android_app');
  expect(vinculo[0].target.package_name).toBeTruthy();
});

test('O REWRITE NÃO PODE ENGOLIR O ASSETLINKS', async () => {
  /**
   * `vercel.json` reescreve `/(.*)` para `/index.html`. Na Vercel o
   * arquivo estático ganha do rewrite, mas o `Content-Type` não vem
   * sozinho — e o Android recusa `assetlinks.json` servido como
   * `text/html`, sem dizer por quê.
   */
  const vercel = JSON.parse(await Bun.file('vercel.json').text());
  const regra = (vercel.headers || []).find(
    (h: { source: string }) => h.source === '/.well-known/assetlinks.json'
  );

  expect(regra).toBeTruthy();
  expect(
    regra.headers.some(
      (c: { key: string; value: string }) =>
        c.key === 'Content-Type' && c.value === 'application/json'
    )
  ).toBe(true);
});

test('O TRABALHADOR É REGISTRADO PELO HTML, não pelo React', async () => {
  /**
   * O PWABuilder analisou o site e respondeu "did not find a Service
   * Worker" com o arquivo servido corretamente: o registro morava num
   * `useEffect` do App, ou seja, só depois do pacote baixar e o React
   * montar. Ele lê a página; não espera o React.
   *
   * E não é só a nota: quem abre SEM SINAL não chega a montar o React,
   * então o trabalhador que serviria a página guardada nunca era
   * registrado — justamente quando ele faz falta.
   */
  const html = await Bun.file('index.html').text();

  expect(html).toContain("navigator.serviceWorker.register('/sw-avisos.js')");
  expect(html).toContain("window.addEventListener('load'");

  /**
   * No `load`, e não antes: registrar cedo disputa banda com o próprio
   * pacote do sistema, e a primeira abertura fica mais lenta.
   */
  const trecho = html.slice(html.indexOf("'serviceWorker' in navigator"));
  expect(trecho.indexOf("addEventListener('load'")).toBeLessThan(
    trecho.indexOf('serviceWorker.register')
  );

  // E falhar em registrar não pode derrubar a página
  expect(trecho).toContain('.catch(');
});

test('o registro no React CONTINUA, e não é duplicata', async () => {
  /**
   * `prepararAvisos` precisa do registro para pedir permissão e mostrar
   * o aviso. Com a mesma URL, o navegador devolve o registro que já
   * existe — tirar essa chamada quebraria a notificação para ganhar
   * nada.
   */
  const notificacoes = await Bun.file('src/servicos/notificacoes.ts').text();
  expect(notificacoes).toContain("navigator.serviceWorker.register('/sw-avisos.js')");
});

test('a página aponta para o manifesto e tem cor de tema', async () => {
  /**
   * O PWABuilder começa lendo o HTML: sem o `<link rel="manifest">` ele
   * nem chega ao manifesto, e o relatório diz "no manifest found" com o
   * arquivo servido corretamente ao lado.
   */
  const html = await Bun.file('index.html').text();

  expect(html).toContain('rel="manifest"');
  expect(html).toContain('name="theme-color"');
  expect(html).toContain('lang="pt-BR"');
});

test('a cor do tema é a MESMA no HTML e no manifesto', async () => {
  /**
   * Divergindo, a barra do sistema pisca de uma cor para a outra na
   * abertura — e o Android usa a do manifesto enquanto o navegador usa
   * a do HTML.
   */
  const html = await Bun.file('index.html').text();
  const m = await lerManifesto();

  const doHtml = html.match(/name="theme-color" content="([^"]+)"/)?.[1];
  expect(doHtml).toBe(m.theme_color as string);
});
