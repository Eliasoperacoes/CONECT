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

self.addEventListener('install', () => {
  // Assume o lugar do anterior sem esperar as abas abertas fecharem
  self.skipWaiting();
});

self.addEventListener('activate', (evento) => {
  evento.waitUntil(self.clients.claim());
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
