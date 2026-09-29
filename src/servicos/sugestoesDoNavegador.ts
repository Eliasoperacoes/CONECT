/**
 * AS SUGESTÕES DO NAVEGADOR, DESLIGADAS NO SISTEMA INTEIRO.
 *
 * O Elias: "sugestões de textos na versão web (desnecessária), seja na
 * pesquisa de usuários, seja no chat. Remova essas sugestões."
 *
 * São duas coisas do navegador, nenhuma nossa:
 *
 *  - a LISTA do histórico de formulário, que abre embaixo do campo com
 *    tudo que já se digitou nele — na busca de colegas, nomes que a
 *    pessoa já procurou; no chat, mensagens de ontem;
 *  - o TEXTO CINZA que o Edge e o Chrome completam na frente do cursor
 *    (previsão de escrita), que muda de lugar a cada tecla.
 *
 * O campo de mensagem já tinha `autoComplete="off"`, escrito à mão. Os
 * outros sessenta e tantos campos do sistema não — e marcar um por um é
 * como o próximo campo nasce sem a marca. Uma regra, um lugar: aqui, na
 * partida do sistema, para todo campo que existe e que vier a existir.
 *
 * Campo que DIZ o que quer (`autocomplete="username"`,
 * `"current-password"`, `"new-password"`) é respeitado: no login o
 * navegador preencher usuário e senha é ajuda, não ruído.
 */

/** Os tipos de campo em que o navegador guarda e oferece o que foi digitado. */
const TIPOS_COM_HISTORICO = new Set(['', 'text', 'search', 'email', 'tel', 'url', 'number']);

/** É um campo de digitar texto livre, sem um `autocomplete` escolhido? */
export function deveCalar(el: Element): boolean {
  const tag = el.tagName.toLowerCase();
  const ehCampo =
    tag === 'textarea' ||
    (tag === 'input' && TIPOS_COM_HISTORICO.has((el.getAttribute('type') || '').toLowerCase()));
  return ehCampo && !el.hasAttribute('autocomplete');
}

function calar(raiz: Element) {
  if (deveCalar(raiz)) raiz.setAttribute('autocomplete', 'off');
  raiz.querySelectorAll('input, textarea').forEach((el) => {
    if (deveCalar(el)) el.setAttribute('autocomplete', 'off');
  });
}

/**
 * Liga a regra. Devolve a função que a desliga (para os testes).
 *
 * Marca o campo QUANDO ELE ENTRA NA PÁGINA, e não quando recebe o foco:
 * o navegador lê o `autocomplete` ao montar a lista de sugestões, e
 * marcar no foco chegaria atrasado na primeira vez.
 */
export function calarSugestoesDoNavegador(doc: Document = document): () => void {
  /**
   * `writingsuggestions="false"` na raiz vale para a página inteira: o
   * atributo é herdado, e é o que o Chrome e o Edge consultam antes de
   * completar o texto em cinza.
   */
  doc.documentElement.setAttribute('writingsuggestions', 'false');

  calar(doc.documentElement);

  const observador = new MutationObserver((mudancas) => {
    for (const m of mudancas) {
      m.addedNodes.forEach((no) => {
        if (no.nodeType === 1) calar(no as Element);
      });
    }
  });
  observador.observe(doc.documentElement, { childList: true, subtree: true });

  return () => observador.disconnect();
}
