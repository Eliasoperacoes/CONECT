/**
 * CONFERE O QUE O PWABUILDER VAI CONFERIR — CONECTA
 *
 * POR QUE ISTO EXISTE.
 *
 * O pwabuilder.com lê o site PUBLICADO, não o repositório. Um arquivo
 * certo aqui e não servido lá dá o mesmo resultado de não existir — e o
 * relatório dele diz "manifest not found" sem dizer por quê.
 *
 * O caso que este script pega antes de todos: o `vercel.json` reescreve
 * `/(.*)` para `/index.html`. Se um arquivo não estiver de fato no
 * pacote publicado, o servidor devolve a PÁGINA em vez de 404 — e um
 * `manifest.json` que responde HTML com status 200 é o tipo de defeito
 * que se procura por uma tarde inteira.
 *
 * Rode antes de subir o endereço ao PWABuilder:
 *
 *   bun scripts/conferir-pwa.ts
 *   bun scripts/conferir-pwa.ts https://outro-endereco
 */

/**
 * O endereço publicado, pelo argumento ou por `CONECTA_URL` no `.env`.
 *
 * Sem valor padrão de propósito: um endereço chutado que responde 404
 * produziria um relatório de "tudo faltando" e mandaria procurar
 * defeito onde não há nenhum. Melhor parar e pedir.
 */
const ENDERECO = (process.argv[2] || process.env.CONECTA_URL || '').replace(/\/$/, '');

if (!ENDERECO) {
  console.error('Diga qual é o endereço publicado:\n');
  console.error('  bun scripts/conferir-pwa.ts https://SEU-ENDERECO.vercel.app\n');
  console.error('Ou ponha CONECTA_URL no .env para não repetir toda vez.');
  process.exit(1);
}

interface Achado {
  ok: boolean;
  o_que: string;
  detalhe: string;
}

const achados: Achado[] = [];
const anotar = (ok: boolean, o_que: string, detalhe: string) =>
  achados.push({ ok, o_que, detalhe });

/**
 * Busca e já diz se veio HTML no lugar do arquivo.
 *
 * É a armadilha do rewrite: status 200, corpo `<!doctype html>`. Quem
 * olha só o status jura que está tudo certo.
 */
const buscar = async (caminho: string) => {
  try {
    const r = await fetch(`${ENDERECO}${caminho}`, { redirect: 'follow' });
    const texto = await r.text();
    const ehPagina = texto.trimStart().toLowerCase().startsWith('<!doctype html');
    return { ok: r.ok, status: r.status, tipo: r.headers.get('content-type') || '', texto, ehPagina };
  } catch (erro) {
    return { ok: false, status: 0, tipo: '', texto: '', ehPagina: false, erro: String(erro) };
  }
};

console.log(`Conferindo ${ENDERECO} para o PWABuilder...\n`);

// ------------------------------------------------------------
// 1. O MANIFESTO
// ------------------------------------------------------------
const manifesto = await buscar('/manifest.json');

if (!manifesto.ok || manifesto.ehPagina) {
  anotar(
    false,
    'manifest.json',
    manifesto.ehPagina
      ? 'veio a PÁGINA no lugar do arquivo — o rewrite engoliu'
      : `status ${manifesto.status}`
  );
} else {
  let dados: Record<string, unknown> = {};
  try {
    dados = JSON.parse(manifesto.texto);
    anotar(true, 'manifest.json', 'servido e é JSON válido');
  } catch {
    anotar(false, 'manifest.json', 'não é JSON válido');
  }

  /**
   * Os campos que o PWABuilder cobra. Os quatro primeiros ele trata
   * como obrigatórios — sem eles não gera pacote nenhum.
   */
  for (const campo of ['id', 'name', 'short_name', 'start_url', 'scope', 'display']) {
    anotar(!!dados[campo], `manifest.${campo}`, String(dados[campo] ?? '(vazio)'));
  }

  // Estes ele marca como recomendados, e a loja do Android pede
  for (const campo of ['description', 'lang', 'dir', 'orientation', 'categories']) {
    anotar(!!dados[campo], `manifest.${campo}`, String(dados[campo] ?? '(vazio)'));
  }

  anotar(
    dados.display === 'standalone' || dados.display === 'fullscreen',
    'manifest.display',
    `${dados.display} — precisa ser standalone para virar aplicativo`
  );

  /**
   * ÍCONES: 192 e 512 são o mínimo, e o MASKABLE não é luxo — sem ele o
   * Android recorta o ícone num círculo e come as bordas do logo.
   */
  const icones = (dados.icons || []) as Array<{ sizes?: string; purpose?: string; src?: string }>;
  const temTamanho = (t: string) => icones.some((i) => (i.sizes || '').includes(t));
  const temMaskable = icones.some((i) => (i.purpose || '').includes('maskable'));

  anotar(temTamanho('192x192'), 'ícone 192', temTamanho('192x192') ? 'presente' : 'faltando');
  anotar(temTamanho('512x512'), 'ícone 512', temTamanho('512x512') ? 'presente' : 'faltando');
  anotar(temMaskable, 'ícone maskable', temMaskable ? 'presente' : 'faltando — o Android corta o logo');

  // Cada ícone declarado precisa EXISTIR: declarado e ausente é pior que ausente
  for (const icone of icones) {
    if (!icone.src) continue;
    const r = await buscar(icone.src);
    anotar(
      r.ok && !r.ehPagina,
      `arquivo ${icone.src}`,
      r.ehPagina ? 'veio a PÁGINA no lugar da imagem' : `status ${r.status}`
    );
  }
}

// ------------------------------------------------------------
// 2. O TRABALHADOR DE SEGUNDO PLANO
// ------------------------------------------------------------
const trabalhador = await buscar('/sw-avisos.js');
anotar(
  trabalhador.ok && !trabalhador.ehPagina,
  'service worker',
  trabalhador.ehPagina ? 'veio a PÁGINA no lugar do script' : `status ${trabalhador.status}`
);

if (trabalhador.ok && !trabalhador.ehPagina) {
  /**
   * O PWABuilder só considera "funciona offline" quando o trabalhador
   * trata `fetch`. Sem isso o pacote ainda sai, mas com nota baixa — e
   * o celular do galpão continua dando página de erro.
   */
  anotar(
    trabalhador.texto.includes("addEventListener('fetch'"),
    'service worker offline',
    trabalhador.texto.includes("addEventListener('fetch'")
      ? 'trata fetch'
      : 'não trata fetch — o PWABuilder marca "does not work offline"'
  );
}

// ------------------------------------------------------------
// 3. A PÁGINA
// ------------------------------------------------------------
const pagina = await buscar('/');
if (pagina.ok) {
  anotar(
    pagina.texto.includes('rel="manifest"'),
    '<link rel="manifest">',
    pagina.texto.includes('rel="manifest"') ? 'presente no HTML' : 'faltando'
  );
  anotar(
    pagina.texto.includes('name="theme-color"'),
    'meta theme-color',
    pagina.texto.includes('name="theme-color"') ? 'presente' : 'faltando'
  );
  anotar(ENDERECO.startsWith('https://'), 'HTTPS', 'o PWABuilder recusa http');
} else {
  anotar(false, 'página inicial', `status ${pagina.status}`);
}

// ------------------------------------------------------------
// 4. O VÍNCULO COM O APLICATIVO (só depois de gerar o APK)
// ------------------------------------------------------------
const vinculo = await buscar('/.well-known/assetlinks.json');

if (!vinculo.ok || vinculo.ehPagina) {
  anotar(
    false,
    'assetlinks.json',
    vinculo.ehPagina
      ? 'veio a PÁGINA — o arquivo não está no pacote publicado'
      : `status ${vinculo.status}`
  );
} else {
  const falta = vinculo.texto.includes('SUBSTITUA_PELO_FINGERPRINT');
  anotar(
    !falta,
    'assetlinks.json',
    falta
      ? 'servido, mas ainda com o marcador — cole o fingerprint que o PWABuilder der'
      : 'servido e preenchido'
  );
}

// ------------------------------------------------------------
console.log('');
for (const a of achados) {
  console.log(`${a.ok ? '  ok  ' : ' FALTA'}  ${a.o_que.padEnd(28)} ${a.detalhe}`);
}

const problemas = achados.filter((a) => !a.ok);
console.log('');

if (problemas.length === 0) {
  console.log('Tudo pronto para o pwabuilder.com.');
} else {
  console.log(`${problemas.length} item(ns) para resolver antes de gerar o APK.`);
  /**
   * O assetlinks sozinho NÃO impede gerar o pacote — ele só é
   * preenchido depois, com o fingerprint que o próprio PWABuilder
   * devolve. Sair com erro por causa dele faria o script parecer
   * quebrado logo na primeira vez que ele é usado.
   */
  const bloqueiam = problemas.filter((p) => !p.o_que.includes('assetlinks'));
  if (bloqueiam.length > 0) process.exit(1);
}
