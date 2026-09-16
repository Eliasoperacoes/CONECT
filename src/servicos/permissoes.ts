/**
 * Permissões de ferramenta — CONECTA / Malachias Autopeças
 *
 * Responde uma pergunta só: esta pessoa enxerga esta ferramenta?
 *
 * A configuração vive no banco (tabela `configuracoes`, campo
 * `permissoes_ferramentas`) e vale para a rede inteira — o administrador
 * muda num aparelho e vale em todos. O armazenamento do navegador é cache
 * de leitura, como no resto do sistema.
 *
 * ===================================================================
 * O QUE ESTE ARQUIVO NÃO FAZ
 * ===================================================================
 *
 * Não decide QUAIS DADOS a pessoa vê dentro da ferramenta. Ligar "Quadro de
 * Equipe" para o gerente não passa a mostrar a rede inteira para ele: o
 * conteúdo continua filtrado pela alçada (`organograma`) e pela RLS do
 * banco.
 *
 * Isso é o que impede a configuração de virar um vazamento. Um interruptor
 * que abrisse dado junto seria fácil de ligar sem querer, e ninguém
 * perceberia — a tela pareceria igual, só com mais gente dentro.
 */
import { Colaborador, NivelHierarquico, NIVEL_TI } from '../tipos';
import { FERRAMENTAS, acharFerramenta, permissoesPadrao } from './ferramentas';

/** Ferramenta -> níveis que a enxergam. */
export type MapaDePermissoes = Record<string, NivelHierarquico[]>;

const CHAVE_CACHE = 'conecta_v4_permissoes_ferramentas';

let emMemoria: MapaDePermissoes | null = null;
const ouvintes: Array<() => void> = [];

const lerCache = (): MapaDePermissoes | null => {
  try {
    const bruto = localStorage.getItem(CHAVE_CACHE);
    if (!bruto) return null;
    const lido = JSON.parse(bruto);
    return lido && typeof lido === 'object' ? (lido as MapaDePermissoes) : null;
  } catch {
    return null;
  }
};

/**
 * O mapa em vigor.
 *
 * Sempre completado com o padrão: ferramenta criada depois da última
 * gravação não fica sem resposta — entra com o padrão dela. Sem isso, toda
 * ferramenta nova nasceria invisível para todo mundo até alguém abrir o
 * painel, e a tela sumiria sem explicação.
 */
export const obterPermissoes = (): MapaDePermissoes => {
  if (!emMemoria) emMemoria = lerCache();

  const padrao = permissoesPadrao();
  if (!emMemoria) return padrao;

  const completo: MapaDePermissoes = { ...padrao };
  for (const ferramenta of FERRAMENTAS) {
    const gravado = emMemoria[ferramenta.chave];
    if (Array.isArray(gravado)) completo[ferramenta.chave] = gravado;
  }
  return completo;
};

/**
 * A pessoa enxerga a ferramenta?
 *
 * Chave desconhecida devolve `false`: ferramenta que não está no catálogo
 * não deveria estar sendo perguntada, e responder "sim" por descuido
 * abriria tela sem ninguém ter decidido isso.
 */
export const podeUsar = (chave: string, colaborador: Colaborador): boolean => {
  const ferramenta = acharFerramenta(chave);
  if (!ferramenta) return false;

  // O TI não se tranca para fora. Vale mesmo que a configuração diga o
  // contrário — é a saída de emergência de quem administra o sistema.
  if (ferramenta.sempreParaTI && colaborador.nivel >= NIVEL_TI) return true;

  const niveis = obterPermissoes()[ferramenta.chave];
  return Array.isArray(niveis) && niveis.includes(colaborador.nivel);
};

/** As ferramentas de uma área que a pessoa enxerga, na ordem do catálogo. */
export const ferramentasVisiveis = (
  colaborador: Colaborador,
  area?: string
): typeof FERRAMENTAS =>
  FERRAMENTAS.filter(
    (f) => (!area || f.area === area) && podeUsar(f.chave, colaborador)
  );

export const assinarPermissoes = (ouvinte: () => void): (() => void) => {
  ouvintes.push(ouvinte);
  return () => {
    const i = ouvintes.indexOf(ouvinte);
    if (i !== -1) ouvintes.splice(i, 1);
  };
};

const notificar = (): void => ouvintes.forEach((o) => o());

/** Grava o mapa vindo do banco (ou de outro aparelho) no cache local. */
export const aplicarPermissoes = (mapa: MapaDePermissoes | null): void => {
  emMemoria = mapa;
  try {
    if (mapa) localStorage.setItem(CHAVE_CACHE, JSON.stringify(mapa));
    else localStorage.removeItem(CHAVE_CACHE);
  } catch {
    // Navegador sem armazenamento: segue valendo o que está em memória
  }
  notificar();
};

/**
 * Liga ou desliga uma ferramenta para um nível.
 *
 * Devolve o mapa novo em vez de gravar: quem chama decide se manda para o
 * banco. As travas que valem sempre:
 *
 *  - ferramenta marcada `sempreParaTI` não se desliga do nível 5;
 *  - o catálogo é a fonte da lista, então chave de fora dele não entra.
 */
export const alternarNivel = (
  mapa: MapaDePermissoes,
  chave: string,
  nivel: NivelHierarquico
): { mapa: MapaDePermissoes; erro?: string } => {
  const ferramenta = acharFerramenta(chave);
  if (!ferramenta) return { mapa, erro: 'Ferramenta desconhecida.' };

  const atuais = mapa[chave] || [];
  const ligado = atuais.includes(nivel);

  if (ligado && ferramenta.sempreParaTI && nivel >= NIVEL_TI) {
    return {
      mapa,
      erro: `"${ferramenta.nome}" não pode ser desligada do TI — é o que impede o administrador de se trancar para fora.`,
    };
  }

  const novos = ligado
    ? atuais.filter((n) => n !== nivel)
    : [...atuais, nivel].sort((a, b) => a - b);

  return { mapa: { ...mapa, [chave]: novos } };
};

/** Volta tudo ao padrão do catálogo. */
export const restaurarPadrao = (): MapaDePermissoes => permissoesPadrao();
