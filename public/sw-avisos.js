/**
 * Trabalhador de segundo plano dos avisos — CONECTA / Malachias Autopeças
 *
 * Existe por um motivo só: no Android, `new Notification(...)` é recusado
 * pelo navegador. Aviso no celular precisa passar por um trabalhador como
 * este, via `registration.showNotification(...)`. Sem ele, o celular fica
 * mudo por mais correto que esteja o resto do código.
 *
 * Ele NÃO intercepta requisições de rede de propósito. Um trabalhador que
 * guarda arquivos em cache passa a servir versão velha do sistema depois de
 * cada publicação, e o pessoal fica vendo uma tela que já foi corrigida.
 * Aqui ele só cuida do clique no aviso.
 */

/**
 * O CACHE DA CASCA, e só dela.
 *
 * O aviso acima continua valendo: este trabalhador NÃO serve versão
 * velha. A estratégia é REDE PRIMEIRO — com sinal, a resposta vem
 * sempre do servidor, e o cache só é reescrito depois que ela chega.
 * O guardado só aparece quando a rede falha.
 *
 * Por que passou a existir: o celular do balcão perde sinal no
 * corredor dos fundos e dentro do galpão. Sem isto, abrir o CONECTA lá
 * dava a página de erro do navegador — e a pessoa concluía que o
 * sistema caiu. Com isto, ela abre e vê os dados que já tinha.
 *
 * O nome do cache leva a versão: publicação nova descarta o cache
 * inteiro da anterior em `activate`, em vez de deixar arquivo velho
 * conviver com arquivo novo.
 */
const CACHE = 'conecta-casca-v1';

self.addEventListener('install', () => {
  // Assume o lugar do anterior sem esperar as abas abertas fecharem
  self.skipWaiting();
});

self.addEventListener('activate', (evento) => {
  evento.waitUntil(
    (async () => {
      const nomes = await caches.keys();
      await Promise.all(
        nomes.filter((n) => n !== CACHE).map((n) => caches.delete(n))
      );
      await self.clients.claim();
    })()
  );
});

/**
 * REDE PRIMEIRO, cache como rede de segurança.
 *
 * Só navegação (abrir o aplicativo) e os arquivos do próprio pacote.
 * Chamada ao Supabase NÃO passa por aqui: dado de ponto e de conversa
 * servido do cache seria dado errado apresentado como certo — e este
 * sistema decide hora trabalhada.
 */
self.addEventListener('fetch', (evento) => {
  const pedido = evento.request;

  if (pedido.method !== 'GET') return;

  const endereco = new URL(pedido.url);
  // Outro domínio (Supabase, fontes): passa direto, sem tocar
  if (endereco.origin !== self.location.origin) return;
  // O carimbo da versão precisa vir do servidor, sempre: é ele que
  // avisa que saiu publicação nova
  if (endereco.pathname === '/versao.json') return;

  const ehNavegacao =
    pedido.mode === 'navigate' || pedido.destination === 'document';

  const ehDoPacote =
    endereco.pathname.startsWith('/assets/') ||
    endereco.pathname.endsWith('.png') ||
    endereco.pathname.endsWith('.svg') ||
    endereco.pathname === '/manifest.json';

  if (!ehNavegacao && !ehDoPacote) return;

  evento.respondWith(
    (async () => {
      try {
        const daRede = await fetch(pedido);
        // Só guarda resposta boa: página de erro em cache é pior que nada
        if (daRede && daRede.ok) {
          const copia = daRede.clone();
          caches.open(CACHE).then((c) => c.put(pedido, copia)).catch(() => {});
        }
        return daRede;
      } catch {
        const guardado = await caches.match(pedido);
        if (guardado) return guardado;

        // Navegação sem rede e sem cache do endereço exato: devolve a
        // casca, que é a mesma para qualquer caminho neste sistema
        if (ehNavegacao) {
          const casca = await caches.match('/index.html');
          if (casca) return casca;
        }
        throw new Error('sem rede e sem cópia guardada');
      }
    })()
  );
});

self.addEventListener('notificationclick', (evento) => {
  evento.notification.close();

  const dados = evento.notification.data || {};
  const conversaId = dados.conversaId;
  const destino = dados.url || '/';

  /**
   * O TOQUE PRECISA ABRIR A CONVERSA, NÃO SÓ O SISTEMA.
   *
   * Antes daqui só saía um foco: o aviso dizia "Fabio: chegou a peça",
   * a pessoa tocava, e o CONECTA vinha para a frente na tela em que estivesse
   * — a lista, o ponto, onde fosse. Ela tinha de achar a conversa na mão,
   * depois de já ter tocado no aviso DAQUELA conversa.
   *
   * Agora a conversa vai junto do aviso e é ela que abre.
   */
  evento.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((janelas) => {
        // Traz para a frente a janela do CONECTA que já estiver aberta, em
        // vez de abrir outra: duas abas do mesmo sistema confundem e
        // duplicam avisos.
        for (const janela of janelas) {
          if ('focus' in janela) {
            // O recado vai ANTES do foco: a janela pode demorar a responder,
            // e assim ela já acorda sabendo o que abrir
            if (conversaId && typeof janela.postMessage === 'function') {
              janela.postMessage({ tipo: 'conecta:abrir-conversa', conversaId });
            }
            return janela.focus();
          }
        }

        // Nenhuma janela aberta: o sistema abre já na conversa, pelo
        // endereço — não há para quem mandar recado ainda.
        if (self.clients.openWindow) {
          return self.clients.openWindow(
            conversaId
              ? destino + '?conversa=' + encodeURIComponent(conversaId)
              : destino
          );
        }
        return undefined;
      })
  );
});
