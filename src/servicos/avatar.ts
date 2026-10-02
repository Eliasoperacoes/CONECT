/**
 * O AVATAR DE QUEM NÃO TEM FOTO — CONECTA / Malachias Autopeças
 *
 * Todo cadastro nasce com a logo da empresa como foto, e todo grupo também.
 * No S10 do Elias (02/10/2026) a lista de conversas era uma coluna de logos
 * iguais: para achar a Leigislaine era preciso ler cada nome. Como no
 * WhatsApp, quem não tem foto ganha as INICIAIS sobre uma cor que é sempre
 * a mesma para a mesma pessoa — a cor ajuda a achar de relance.
 *
 * O canal oficial (Avisos da Rede) continua com a logo: ali ela é a
 * identidade do canal, não a falta de uma foto.
 */

/** A logo oficial, que vale como "sem foto" (quem nunca trocou). */
export const FOTO_DA_LOGO = '/logo-malachias.svg';

/** O canal que fala pela empresa: a logo É a foto dele. */
const CANAL_COM_A_LOGO = 'grupo-avisos-da-rede';

/** É uma foto de verdade — e não a logo que todo cadastro recebe? */
export const ehFotoDeVerdade = (foto?: string | null): foto is string =>
  !!foto && foto !== FOTO_DA_LOGO;

/** A foto a mostrar, ou `undefined` para mostrar as iniciais. */
export const fotoParaMostrar = (foto: string | undefined | null, id?: string): string | undefined =>
  id === CANAL_COM_A_LOGO ? FOTO_DA_LOGO : ehFotoDeVerdade(foto) ? foto : undefined;

/**
 * As iniciais: a primeira letra do primeiro e do último nome.
 * "Leigislaine Alves Barbosa" → "LB"; "Descalvado (Filial 03)" → "D"
 * (o que está entre parênteses é complemento, não nome).
 */
export const iniciaisDe = (nome: string): string => {
  const palavras = (nome || '')
    .replace(/\(.*?\)/g, ' ')
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
  if (palavras.length === 0) return '?';
  const primeira = palavras[0][0];
  const ultima = palavras.length > 1 ? palavras[palavras.length - 1][0] : '';
  return (primeira + ultima).toUpperCase();
};

/**
 * As cores, escritas por inteiro para o Tailwind encontrá-las no código.
 * Fundo forte e letra branca: leem nos dois temas.
 */
const CORES = [
  'bg-sky-600',
  'bg-emerald-600',
  'bg-violet-600',
  'bg-amber-600',
  'bg-rose-600',
  'bg-teal-600',
  'bg-indigo-600',
  'bg-orange-600',
] as const;

/**
 * A cor de alguém: sempre a mesma para o mesmo NOME — e não para o id, que
 * as fotos de pessoa nem recebem. Assim a Leigislaine tem a mesma cor na
 * lista, no cabeçalho e nos dados do grupo.
 */
export const corDoAvatar = (chave: string): string => {
  let soma = 0;
  for (const letra of chave || '') soma = (soma * 31 + letra.charCodeAt(0)) >>> 0;
  return CORES[soma % CORES.length];
};
