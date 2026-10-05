/**
 * A FILA DE ASSINATURAS DO RH — o que cada documento do mês espera.
 *
 * Pedido do Elias (05/10/2026): o RH assina como responsável, de uma vez,
 * os holerites e espelhos que os colaboradores já assinaram, e enxerga o
 * mês inteiro num lugar só. Esta é a regra que separa os documentos; a
 * tela (`AbaAssinaturas`) só mostra, e o banco (`assinar_como_responsavel`)
 * é quem decide o que de fato entra — esta conta não substitui a dele, só
 * evita mandar ao banco o que ele recusaria.
 *
 * Sem banco e sem tela aqui: os dados entram prontos, para ser testado.
 */
import type { Holerite, RecebimentoHolerite } from '../tipos';
import type { AssinaturaNoEspelho } from './ponto';
import type { AssinaturaDoResponsavel, DocumentoAssinavel } from './assinatura';
import { chaveDoEspelho, chaveDoResponsavel } from './assinatura';

/**
 * Onde o documento está:
 *   - para_assinar: o colaborador assinou, falta o responsável — entra no lote;
 *   - assinado: as duas assinaturas;
 *   - falta_colaborador: publicado (ou fechado), e a pessoa ainda não assinou;
 *   - alterado: o espelho mudou depois que a pessoa assinou — fora do lote;
 *   - proprio: o documento é de quem assina — outra pessoa do RH assina.
 */
export type EstadoDaAssinatura = 'para_assinar' | 'assinado' | 'falta_colaborador' | 'alterado' | 'proprio';

export interface ItemDeAssinatura {
  /** Única na fila: o tipo e a referência. */
  chave: string;
  documento: DocumentoAssinavel;
  /** holerite: o id; espelho: `chaveDoEspelho`. É o que vai ao banco. */
  referencia: string;
  colaboradorId: string;
  nome: string;
  estado: EstadoDaAssinatura;
  colaboradorAssinouEm?: string;
  responsavel?: { nome: string; assinadoEm: string };
}

export interface PessoaDaFila {
  id: string;
  nome: string;
  /** Tem espelho de ponto? (bate ponto, estava admitida no mês) */
  temEspelho: boolean;
}

export const montarFilaDoMes = (dados: {
  mes: string;
  /** Quem assina: o documento dele não entra no lote dele. */
  eu: string;
  pessoas: PessoaDaFila[];
  /** Os holerites DESTE mês. */
  holerites: Holerite[];
  recebimentos: Map<string, RecebimentoHolerite>;
  /** Os espelhos assinados do mês, por pessoa (`assinaturasDoEspelho`). */
  espelhos: Map<string, AssinaturaNoEspelho>;
  responsaveis: Map<string, AssinaturaDoResponsavel>;
  /** O espelho do mês já se cobra? (`ESPELHO_ASSINADO_DESDE`, mês fechado) */
  cobraEspelho: boolean;
}): ItemDeAssinatura[] => {
  const nomeDe = new Map(dados.pessoas.map((p) => [p.id, p.nome]));
  const itens: ItemDeAssinatura[] = [];

  const estadoDe = (
    colaboradorId: string,
    assinouEm: string | undefined,
    responsavel: AssinaturaDoResponsavel | undefined,
    confere = true
  ): EstadoDaAssinatura => {
    if (responsavel) return 'assinado';
    if (!assinouEm) return 'falta_colaborador';
    if (!confere) return 'alterado';
    if (colaboradorId === dados.eu) return 'proprio';
    return 'para_assinar';
  };

  for (const h of dados.holerites) {
    if (h.competencia !== dados.mes) continue;
    const recebimento = dados.recebimentos.get(h.id);
    const responsavel = dados.responsaveis.get(chaveDoResponsavel('holerite', h.id));
    itens.push({
      chave: chaveDoResponsavel('holerite', h.id),
      documento: 'holerite',
      referencia: h.id,
      colaboradorId: h.colaboradorId,
      nome: nomeDe.get(h.colaboradorId) || 'Colaborador removido',
      estado: estadoDe(h.colaboradorId, recebimento?.assinadoEm, responsavel),
      colaboradorAssinouEm: recebimento?.assinadoEm,
      responsavel: responsavel && { nome: responsavel.responsavelNome, assinadoEm: responsavel.assinadoEm },
    });
  }

  for (const p of dados.pessoas) {
    const assinado = dados.espelhos.get(p.id);
    // Sem assinatura e sem cobrança, o espelho não é assunto desta fila
    if (!assinado && (!dados.cobraEspelho || !p.temEspelho)) continue;
    const referencia = chaveDoEspelho(p.id, dados.mes);
    const responsavel = dados.responsaveis.get(chaveDoResponsavel('espelho', referencia));
    itens.push({
      chave: chaveDoResponsavel('espelho', referencia),
      documento: 'espelho',
      referencia,
      colaboradorId: p.id,
      nome: p.nome,
      estado: estadoDe(p.id, assinado?.assinadoEm, responsavel, assinado?.confere ?? true),
      colaboradorAssinouEm: assinado?.assinadoEm,
      responsavel: responsavel && { nome: responsavel.responsavelNome, assinadoEm: responsavel.assinadoEm },
    });
  }

  return itens.sort(
    (a, b) => a.nome.localeCompare(b.nome, 'pt-BR') || a.documento.localeCompare(b.documento)
  );
};

/** O lote do botão "Assinar": só o que está para assinar, separado por tipo para o banco. */
export const loteDaFila = (itens: ItemDeAssinatura[]): { holerites: string[]; espelhos: string[] } => {
  const prontos = itens.filter((i) => i.estado === 'para_assinar');
  return {
    holerites: prontos.filter((i) => i.documento === 'holerite').map((i) => i.referencia),
    espelhos: prontos.filter((i) => i.documento === 'espelho').map((i) => i.referencia),
  };
};

/** "9 holerites e 5 espelhos de ponto" — a frase do lote, no singular e no plural. */
export const descreverLote = (lote: { holerites: string[]; espelhos: string[] }): string => {
  const partes = [
    lote.holerites.length && `${lote.holerites.length} holerite${lote.holerites.length === 1 ? '' : 's'}`,
    lote.espelhos.length &&
      `${lote.espelhos.length} espelho${lote.espelhos.length === 1 ? '' : 's'} de ponto`,
  ].filter(Boolean);
  return partes.join(' e ');
};
