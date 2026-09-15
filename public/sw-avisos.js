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

  const destino = (evento.notification.data && evento.notification.data.url) || '/';

  // Traz para a frente a janela do CONECTA que já estiver aberta, em vez de
  // abrir outra: duas abas do mesmo sistema confundem e duplicam avisos.
  evento.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((janelas) => {
        for (const janela of janelas) {
          if ('focus' in janela) return janela.focus();
        }
        if (self.clients.openWindow) return self.clients.openWindow(destino);
        return undefined;
      })
  );
});
