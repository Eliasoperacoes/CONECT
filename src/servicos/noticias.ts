/**
 * AS NOTÍCIAS DE FORA DO INÍCIO — sobre a área de cada pessoa.
 *
 * Pedido do Elias (05/10/2026): "notícias relevantes sobre a área de cada
 * colaborador", separadas das notícias da empresa (a Central).
 *
 * A FONTE É A AGÊNCIA BRASIL (EBC). O Google Notícias foi descartado: o
 * feed dele só permite uso pessoal e não comercial, e um sistema da
 * empresa não é isso. A Agência Brasil diz no próprio feed: "as notícias
 * podem ser reproduzidas desde que citada a fonte" — e a fonte é citada em
 * cada notícia, com o link para a matéria.
 *
 * O feed não separa por área de trabalho; quem separa são as palavras de
 * cada área, aqui. Sem nenhuma da área no dia, vêm as de economia, para o
 * bloco não ficar vazio — e ele diz que são gerais.
 *
 * Sem rede aqui: o servidor (api/noticias.ts) busca o XML e usa estas
 * funções; o teste também.
 */
import type { Setor } from '../tipos';

export interface Noticia {
  titulo: string;
  link: string;
  /** A editoria da agência, tirada do endereço: "economia", "geral", "politica"… */
  editoria: string;
  /** ISO. */
  publicadaEm: string;
  resumo: string;
  imagem?: string;
  /** Escolhida por falar da área da pessoa (`escolherNoticias`); as outras completam o Início. */
  daSuaArea?: boolean;
}

export const FEEDS_DA_AGENCIA_BRASIL = [
  'https://agenciabrasil.ebc.com.br/rss/economia/feed.xml',
  'https://agenciabrasil.ebc.com.br/rss/ultimasnoticias/feed.xml',
];

/** As áreas de notícia e as palavras que dizem que uma notícia é dela. */
export const AREAS_DE_NOTICIA = {
  automotivo: {
    rotulo: 'Setor automotivo',
    palavras: ['autopeça', 'automotiv', 'veículo', 'carro', 'montadora', 'combustível', 'gasolina', 'etanol', 'diesel', 'pneu', 'oficina', 'frota'],
  },
  pessoas: {
    rotulo: 'Trabalho e RH',
    palavras: ['trabalh', 'emprego', 'clt', 'salário', 'inss', 'fgts', 'férias', 'previdência', 'jornada', 'sindicato', 'contratação'],
  },
  // "entrega" saiu: pegava "Embraer tem alta nas entregas" (05/10/2026)
  logistica: {
    rotulo: 'Transporte e logística',
    palavras: ['transporte', 'logística', 'frete', 'rodovia', 'caminhão', 'caminhoneiro', 'diesel', 'combustível', 'pedágio'],
  },
  financas: {
    rotulo: 'Economia e finanças',
    palavras: ['pix', 'juros', 'selic', 'inflação', 'imposto', 'tributo', 'crédito', 'banco', 'consumidor', 'focus'],
  },
  // "dados" e "segurança" saíram: pegavam notícia de eleição (05/10/2026)
  tecnologia: {
    rotulo: 'Tecnologia',
    palavras: ['tecnologia', 'internet', 'digital', 'golpe', 'aplicativo', 'inteligência artificial', 'celular', 'hacker', 'ciberataque'],
  },
} as const;

export type AreaDeNoticia = keyof typeof AREAS_DE_NOTICIA;

/** A área de notícia de cada setor da casa. */
export const AREA_DO_SETOR: Record<Setor, AreaDeNoticia> = {
  Balcão: 'automotivo',
  Estoque: 'automotivo',
  Compras: 'automotivo',
  Garantia: 'automotivo',
  Gerência: 'automotivo',
  Diretoria: 'automotivo',
  Logística: 'logistica',
  RH: 'pessoas',
  Estágio: 'pessoas',
  Caixas: 'financas',
  Tesouraria: 'financas',
  Administrativo: 'financas',
  Callcenter: 'financas',
  TI: 'tecnologia',
};

export const areaDoSetor = (setor: string): AreaDeNoticia =>
  AREA_DO_SETOR[setor as Setor] ?? 'automotivo';

/** O texto sem HTML e sem entidades: o que aparece na tela é texto puro. */
export const textoPuro = (html: string): string =>
  html
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const campo = (item: string, nome: string): string => {
  const achado = item.match(new RegExp(`<${nome}[^>]*>([\\s\\S]*?)</${nome}>`));
  return achado ? achado[1] : '';
};

/** Os itens de um feed RSS. Sem DOM: roda no servidor como no teste. */
export const lerFeed = (xml: string): Noticia[] =>
  [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].flatMap((m) => {
    const item = m[1];
    const titulo = textoPuro(campo(item, 'title'));
    const link = textoPuro(campo(item, 'link'));
    // Só endereço da própria agência: o link vira um <a> na tela
    if (!titulo || !/^https:\/\/agenciabrasil\.ebc\.com\.br\//.test(link)) return [];
    const data = new Date(textoPuro(campo(item, 'pubDate')));
    const resumo = textoPuro(campo(item, 'description'));
    const imagem = textoPuro(campo(item, 'imagem-destaque'));
    return [
      {
        titulo,
        link,
        editoria: link.split('/')[3] || '',
        publicadaEm: Number.isNaN(data.getTime()) ? '' : data.toISOString(),
        resumo: resumo.length > 180 ? `${resumo.slice(0, 177).trimEnd()}…` : resumo,
        imagem: /^https:\/\/imagens\.ebc\.com\.br\//.test(imagem) ? imagem : undefined,
      },
    ];
  });

/** Sem acento e em minúscula, para "Veículo" achar "veiculo". */
const simplificar = (texto: string) =>
  texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** O dia de Brasília de um instante ISO, em AAAA-MM-DD. */
export const diaDeBrasilia = (iso: string | number | Date): string =>
  new Date(iso).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });

/** Quantos dias de calendário separam dois AAAA-MM-DD. */
const diasEntre = (de: string, ate: string): number =>
  Math.round((Date.parse(`${ate}T12:00:00Z`) - Date.parse(`${de}T12:00:00Z`)) / 86400000);

/**
 * Até quantos dias atrás uma matéria ainda entra. Logo cedo a agência quase
 * não publicou (06/10/2026, 9h39: nenhuma de economia, seis no total, de
 * cultura e ciência) — as de ontem completam; as de semana passada, não.
 */
export const DIAS_DE_VALIDADE = 2;

/**
 * AS NOTÍCIAS DO DIA, DA ÁREA DA PESSOA. A palavra conta pelo COMEÇO
 * ("veículo" acha "veículos", mas "dados" não acha "candidatos").
 *
 * A ORDEM É O DIA, DEPOIS A ÁREA (Elias, 06/10/2026: "que se atualizem
 * todos os dias com as matérias do dia atual"). A área vinha antes da
 * data, e uma matéria da área de três dias atrás passava na frente de
 * uma de hoje. Agora: as de hoje — da área, depois as de economia —;
 * faltando, as dos dias anteriores na mesma ordem; nada mais velho que
 * `DIAS_DE_VALIDADE`. Cada uma diz se é da área (`daSuaArea`).
 *
 * Só economia completa: a reserva vinha de "últimas notícias" e trouxe
 * política e futebol para a tela de abertura da empresa (05/10/2026).
 */
export const escolherNoticias = (
  todas: Noticia[],
  area: AreaDeNoticia,
  limite = 4,
  hoje = diaDeBrasilia(Date.now())
): { daArea: boolean; noticias: Noticia[] } => {
  const vistas = new Set<string>();
  const unicas = todas
    .filter((n) => !vistas.has(n.link) && vistas.add(n.link))
    .filter((n) => {
      const atras = diasEntre(diaDeBrasilia(n.publicadaEm), hoje);
      return atras >= 0 && atras <= DIAS_DE_VALIDADE;
    })
    .sort((a, b) => b.publicadaEm.localeCompare(a.publicadaEm));
  const palavras = AREAS_DE_NOTICIA[area].palavras.map(simplificar);
  const ehDaArea = (n: Noticia) => {
    const texto = ` ${simplificar(`${n.titulo} ${n.resumo}`).replace(/[^a-z0-9]+/g, ' ')}`;
    return palavras.some((p) => texto.includes(` ${p}`));
  };
  const candidatas = unicas
    .map((n) => ({ ...n, daSuaArea: ehDaArea(n) }))
    .filter((n) => n.daSuaArea || n.editoria === 'economia');
  // O dia primeiro (o mais novo antes); no mesmo dia, a da área antes; depois, a mais recente
  const ordenadas = candidatas.sort(
    (a, b) =>
      diaDeBrasilia(b.publicadaEm).localeCompare(diaDeBrasilia(a.publicadaEm)) ||
      Number(b.daSuaArea) - Number(a.daSuaArea) ||
      b.publicadaEm.localeCompare(a.publicadaEm)
  );
  const noticias = ordenadas.slice(0, limite);
  return { daArea: noticias.some((n) => n.daSuaArea), noticias };
};
