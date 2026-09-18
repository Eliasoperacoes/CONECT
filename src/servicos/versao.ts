/**
 * Versão publicada — CONECTA / Malachias Autopeças
 *
 * Responde duas perguntas que ninguém conseguia responder antes:
 *
 *   "qual versão esta aba está rodando?"
 *   "saiu uma nova?"
 *
 * Nasceu de "atualizei e não apareceu", que aconteceu no celular e no PC.
 * A causa foi o `index.html` ficar guardado no navegador: é ele que aponta
 * para os pacotes novos, então guardado ele continua carregando os velhos
 * por tempo indeterminado. As regras de cache no `vercel.json` cuidam da
 * causa; isto aqui cuida do que sobra — a aba que já estava aberta quando
 * a publicação saiu.
 *
 * NÃO RECARREGA SOZINHO. Recarregar por conta própria apagaria a mensagem
 * pela metade de quem está digitando. O aplicativo avisa; quem decide é a
 * pessoa.
 */

/** Gravado dentro do pacote no momento da publicação (ver vite.config.ts). */
declare const __VERSAO_BUILD__: string;

export const versaoDesteAplicativo = (): string => {
  try {
    return __VERSAO_BUILD__;
  } catch {
    // Em teste e no modo de desenvolvimento a constante não é injetada
    return 'desenvolvimento';
  }
};

/** Em texto curto, para caber num rodapé: "18/09 17:26". */
export const versaoLegivel = (versao = versaoDesteAplicativo()): string => {
  if (!versao || versao === 'desenvolvimento') return 'desenvolvimento';

  const data = new Date(versao);
  if (Number.isNaN(data.getTime())) return versao;

  const doisDigitos = (n: number) => String(n).padStart(2, '0');
  return `${doisDigitos(data.getDate())}/${doisDigitos(data.getMonth() + 1)} ${doisDigitos(
    data.getHours()
  )}:${doisDigitos(data.getMinutes())}`;
};

/**
 * A versão que está no ar AGORA.
 *
 * `cache: 'no-store'` não é detalhe: sem ele o navegador responderia com a
 * mesma cópia guardada que criou o problema, e a verificação diria para
 * sempre que está tudo em dia.
 */
export const versaoPublicada = async (): Promise<string | null> => {
  try {
    const resposta = await fetch(`/versao.json?t=${Date.now()}`, { cache: 'no-store' });
    if (!resposta.ok) return null;
    const corpo = await resposta.json();
    return typeof corpo?.versao === 'string' ? corpo.versao : null;
  } catch {
    // Sem rede: não é novidade nenhuma, é só não saber
    return null;
  }
};

/** Saiu versão nova depois que esta aba abriu? */
export const saiuVersaoNova = async (): Promise<boolean> => {
  const minha = versaoDesteAplicativo();
  if (minha === 'desenvolvimento') return false;

  const publicada = await versaoPublicada();
  return !!publicada && publicada !== minha;
};

const INTERVALO_MINUTOS = 15;

/**
 * Fica de olho e avisa uma vez.
 *
 * Confere ao voltar para a frente, além do intervalo: no celular a aba
 * passa horas em segundo plano, e o relógio sozinho avisaria tarde demais.
 *
 * Devolve a função de parar.
 */
export const vigiarVersao = (aoSairNova: () => void): (() => void) => {
  let avisado = false;

  const conferir = async () => {
    if (avisado) return;
    if (await saiuVersaoNova()) {
      avisado = true;
      aoSairNova();
    }
  };

  const relogio = setInterval(conferir, INTERVALO_MINUTOS * 60 * 1000);

  const aoVoltar = () => {
    if (document.visibilityState === 'visible') void conferir();
  };
  document.addEventListener('visibilitychange', aoVoltar);

  return () => {
    clearInterval(relogio);
    document.removeEventListener('visibilitychange', aoVoltar);
  };
};
