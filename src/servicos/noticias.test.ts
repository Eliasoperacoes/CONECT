/**
 * As notícias de fora do Início: o feed lido como texto puro, só links da
 * fonte, e cada área com as suas.
 */
import { test, expect } from 'bun:test';
import { lerFeed, escolherNoticias, areaDoSetor, textoPuro, AREA_DO_SETOR } from './noticias';
import { SETORES } from '../tipos';

/** Um item no formato do feed da Agência Brasil (conferido em 05/10/2026). */
const item = (titulo: string, link: string, data: string, texto = 'Texto da matéria.') => `
  <item>
    <title>${titulo}</title>
    <link>${link}</link>
    <imagem-destaque>https://imagens.ebc.com.br/abc/foto.jpg</imagem-destaque>    <description>  &lt;p&gt;&lt;strong&gt;${texto}&lt;/strong&gt;&lt;img src=&quot;https://x/ebc.png&quot; /&gt;&lt;/p&gt;</description>
    <pubDate>${data}</pubDate>
  </item>`;

const XML = `<rss><channel>
${item('Venda de veículos cresce em setembro', 'https://agenciabrasil.ebc.com.br/economia/noticia/2026-10/veiculos', 'Mon, 05 Oct 2026 12:00:00 -0300')}
${item('Prazo do FGTS termina na sexta', 'https://agenciabrasil.ebc.com.br/economia/noticia/2026-10/fgts', 'Mon, 05 Oct 2026 09:00:00 -0300')}
${item('Mega-Sena acumula', 'https://agenciabrasil.ebc.com.br/geral/noticia/2026-10/mega', 'Mon, 05 Oct 2026 08:00:00 -0300')}
${item('<script>alert(1)</script>Golpe', 'javascript:alert(1)', 'Mon, 05 Oct 2026 07:00:00 -0300')}
</channel></rss>`;

test('o feed vira notícia em TEXTO PURO, e só com link da própria fonte', () => {
  const noticias = lerFeed(XML);
  expect(noticias.map((n) => n.titulo)).toEqual([
    'Venda de veículos cresce em setembro',
    'Prazo do FGTS termina na sexta',
    'Mega-Sena acumula',
  ]);
  // O resumo sem HTML, a data em ISO, a imagem só do servidor de imagens da EBC
  expect(noticias[0].resumo).toBe('Texto da matéria.');
  expect(noticias[0].publicadaEm).toBe('2026-10-05T15:00:00.000Z');
  expect(noticias[0].imagem).toBe('https://imagens.ebc.com.br/abc/foto.jpg');
  expect(textoPuro('&lt;b&gt;A &amp;amp; B&lt;/b&gt;')).toBe('A &amp; B');
});

test('cada área recebe as suas PRIMEIRO; a economia completa, dita de fora da área', () => {
  const noticias = lerFeed(XML);
  const balcao = escolherNoticias(noticias, areaDoSetor('Balcão'));
  expect(balcao.daArea).toBe(true);
  // A de veículos é do balcão; a do FGTS (economia) só completa — e diz que completa
  expect(balcao.noticias.map((n) => [n.titulo, n.daSuaArea])).toEqual([
    ['Venda de veículos cresce em setembro', true],
    ['Prazo do FGTS termina na sexta', false],
  ]);
  const rh = escolherNoticias(noticias, areaDoSetor('RH'));
  expect(rh.noticias.map((n) => [n.titulo, n.daSuaArea])).toEqual([
    ['Prazo do FGTS termina na sexta', true],
    ['Venda de veículos cresce em setembro', false],
  ]);
  // O limite vale para a soma: a área não é cortada para a economia caber
  expect(escolherNoticias(noticias, areaDoSetor('Balcão'), 1).noticias.map((n) => n.daSuaArea)).toEqual([true]);
  // TI: nada de tecnologia no dia — vêm as mais novas, e o bloco sabe que são gerais
  const ti = escolherNoticias(noticias, areaDoSetor('TI'));
  expect(ti.daArea).toBe(false);
  expect(ti.noticias[0].titulo).toBe('Venda de veículos cresce em setembro');
  // ...e só de economia: a de "geral" (Mega-Sena) não vai para a tela da empresa
  expect(ti.noticias.map((n) => n.editoria)).toEqual(['economia', 'economia']);
  // O mesmo link em dois feeds aparece uma vez só
  const dobradas = escolherNoticias([...noticias, ...noticias], 'automotivo').noticias.map((n) => n.link);
  expect(dobradas).toEqual([...new Set(dobradas)]);
});

test('todo setor da casa tem a sua área de notícia', () => {
  for (const setor of SETORES) expect(AREA_DO_SETOR[setor]).toBeDefined();
});

test('AS FUNÇÕES DA VERCEL importam com extensão: o Node em ESM não acha "../src/x" sem ".js"', async () => {
  /*
    A primeira publicação de api/noticias.ts caiu em 500
    (FUNCTION_INVOCATION_FAILED): reproduzido com o Node, o import sem
    extensão dá ERR_MODULE_NOT_FOUND. O Bun e o Vite aceitam — por isso
    só aparecia em produção.
  */
  const { readdirSync } = await import('node:fs');
  for (const arquivo of readdirSync('api').filter((f) => f.endsWith('.ts'))) {
    const fonte = await Bun.file(`api/${arquivo}`).text();
    for (const [, caminho] of fonte.matchAll(/from\s+'(\.[^']+)'/g)) {
      expect({ arquivo, caminho, comExtensao: caminho.endsWith('.js') }).toEqual({ arquivo, caminho, comExtensao: true });
    }
  }
});
