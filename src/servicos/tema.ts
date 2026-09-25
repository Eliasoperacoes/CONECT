/**
 * Preferência de tema do CONECTA — Malachias Autopeças
 * Guarda a escolha no dispositivo e aplica o atributo `data-tema` na raiz do
 * documento. Aplicado antes da renderização do React para não piscar o tema
 * errado no carregamento.
 */

export type PreferenciaTema = 'sistema' | 'claro' | 'escuro';

const CHAVE_TEMA = 'conecta_v4_tema';
const TEMAS_VALIDOS: PreferenciaTema[] = ['sistema', 'claro', 'escuro'];

/** Como cada tema se chama na tela. Mora aqui porque o tipo mora aqui. */
export const ROTULO_TEMA: Record<PreferenciaTema, string> = {
  sistema: 'Automático',
  claro: 'Claro',
  escuro: 'Escuro',
};

/** Lê a preferência salva neste dispositivo. Padrão: acompanhar o sistema. */
export const obterTemaSalvo = (): PreferenciaTema => {
  if (typeof window === 'undefined') return 'sistema';
  const salvo = localStorage.getItem(CHAVE_TEMA) as PreferenciaTema | null;
  return salvo && TEMAS_VALIDOS.includes(salvo) ? salvo : 'sistema';
};

/** Aplica o tema no documento sem gravar a escolha. */
export const aplicarTemaNoDocumento = (tema: PreferenciaTema): void => {
  const raiz = document.documentElement;
  if (tema === 'sistema') {
    raiz.removeAttribute('data-tema');
  } else {
    raiz.setAttribute('data-tema', tema);
  }
};

/** Grava a escolha do usuário e aplica imediatamente. */
export const definirTema = (tema: PreferenciaTema): void => {
  localStorage.setItem(CHAVE_TEMA, tema);
  aplicarTemaNoDocumento(tema);
};

/** Restaura o tema salvo. Chamado na inicialização do aplicativo. */
export const iniciarTema = (): PreferenciaTema => {
  const tema = obterTemaSalvo();
  aplicarTemaNoDocumento(tema);
  return tema;
};
