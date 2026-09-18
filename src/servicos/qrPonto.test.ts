/**
 * Verificação do cartaz de ponto — CONECTA
 *
 * O pedido: o QR da loja precisa ABRIR O APLICATIVO, já conectado, na aba
 * de ponto. Antes ele trazia um texto solto — a câmera do celular lia
 * "CONECTA-PONTO:Pirassununga:ABC123", mostrava isso na tela e parava ali.
 */
import { test, expect } from 'bun:test';

const lerPonto = async (): Promise<string> =>
  Bun.file(new URL('./ponto.ts', import.meta.url)).text();

const semComentarios = (fonte: string): string =>
  fonte.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

test('o cartaz leva um ENDERECO, e nao um texto solto', async () => {
  const codigo = semComentarios(await lerPonto());
  const inicio = codigo.indexOf('montarConteudoQr');
  const corpo = codigo.slice(inicio, inicio + 700);

  expect(corpo).toContain('window.location.origin');
  expect(corpo).toContain("/?ponto=");
  expect(corpo).toContain('encodeURIComponent(carga)');
});

/**
 * OS CARTAZES JÁ PREGADOS NAS CINCO LOJAS TRAZEM O TEXTO SOLTO.
 *
 * Trocar o formato sem aceitar o antigo faria todos pararem de funcionar no
 * dia da publicação, e ninguém bateria ponto até reimprimir tudo.
 */
test('o formato antigo continua valendo, e o digitado tambem', async () => {
  const codigo = semComentarios(await lerPonto());
  const inicio = codigo.indexOf('resolverLojaDoCodigo');
  const corpo = codigo.slice(inicio, inicio + 2000);

  // Endereço: pega o parâmetro e segue pelo mesmo caminho de sempre
  expect(corpo).toContain("endereco.searchParams.get('ponto')");

  // Texto solto: o ramo antigo continua lá
  expect(corpo).toContain('startsWith(`${PREFIXO_QR}:`)');

  // E o código de 6 caracteres, para quando a câmera falha
  expect(corpo).toContain('codigo_manual');
});

test('endereco ilegivel nao derruba a leitura', async () => {
  const codigo = semComentarios(await lerPonto());
  const inicio = codigo.indexOf('resolverLojaDoCodigo');
  const corpo = codigo.slice(inicio, inicio + 2000);

  /**
   * `new URL` lança com entrada estranha. Sem o try, um QR de outra empresa
   * apontado para a câmera quebraria a tela de bater ponto em vez de dizer
   * "código não reconhecido".
   */
  expect(corpo).toContain('try {');
  expect(corpo).toContain('} catch {');
});

test('quem chega pelo cartaz nao precisa ler o QR de novo', async () => {
  const modal = await Bun.file(
    new URL('../componentes/ModalBaterPonto.tsx', import.meta.url)
  ).text();

  /**
   * A leitura já aconteceu — foi a câmera do celular que trouxe a pessoa
   * até aqui. Abrir a nossa em cima disso pediria o mesmo cartaz duas
   * vezes, e no aplicativo instalado ainda dispararia a permissão de câmera
   * sem necessidade.
   */
  expect(modal).toContain('if (codigoInicial) {');
  expect(modal).toContain('void confirmarCodigo(codigoInicial);');
});

test('o codigo sai da barra de enderecos assim que e usado', async () => {
  const app = await Bun.file(new URL('../App.tsx', import.meta.url)).text();

  /**
   * Recarregar a página com o código ainda no endereço bateria o ponto de
   * novo — e a pessoa nem saberia por quê.
   */
  expect(app).toContain("endereco.searchParams.delete('ponto')");
  expect(app).toContain("setAbaAtiva('ponto')");

  // E o código é consumido na tela, para não reabrir a batida ao voltar
  const aba = await Bun.file(
    new URL('../componentes/AbaPonto.tsx', import.meta.url)
  ).text();
  expect(aba).toContain('aoConsumirCodigo?.()');
});

test('o aplicativo instalado captura o link do cartaz', async () => {
  const manifesto = JSON.parse(
    await Bun.file(new URL('../../public/manifest.json', import.meta.url)).text()
  );

  /**
   * Sem isto a câmera abre o endereço no NAVEGADOR, e no navegador a pessoa
   * pode não estar conectada — o aplicativo instalado é que guarda a sessão
   * dela.
   */
  expect(manifesto.handle_links).toBe('preferred');

  // E reaproveita a janela aberta: cada batida abriria mais uma
  expect(manifesto.launch_handler?.client_mode).toBe('navigate-existing');

  // O escopo precisa cobrir a raiz, que é onde o endereço do cartaz cai
  expect(manifesto.scope).toBe('/');
});
