/**
 * O AFASTAMENTO — registrar, encerrar e remover (Elias, 17/10/2026).
 *
 * Quem decide é o RH (e o TI): `cuidaDePessoas`, a mesma regra que o banco
 * usa em `afastamentos.sql`. O efeito no ponto não mora aqui — o dia
 * afastado vira situação do dia em `situacaoNaLista`, e daí o espelho, o
 * previsto, a falta e a apuração da madrugada seguem sozinhos.
 */
import {
  Afastamento,
  MotivoAfastamento,
  MOTIVOS_DE_AFASTAMENTO,
  afastamentoEm,
  cuidaDePessoas,
} from '../tipos';
import { bancoDados } from './bancoDados';
import { nuvem } from './nuvem';
import { usandoNuvem } from './supabase';
import { lerAfastamentos, gravarAfastamentos } from './justificativasCache';
import { formatarDataBR } from './ponto';

const DATA = /^\d{4}-\d{2}-\d{2}$/;

/** Os afastamentos desta pessoa, o mais novo primeiro. */
export const afastamentosDe = (colaboradorId: string): Afastamento[] =>
  lerAfastamentos()
    .filter((a) => a.colaboradorId === colaboradorId)
    .sort((a, b) => b.inicio.localeCompare(a.inicio));

/** O afastamento que vale neste dia, se houver — é o que a batida pergunta. */
export const afastamentoDoDia = (colaboradorId: string, data: string): Afastamento | undefined =>
  afastamentoEm(lerAfastamentos(), colaboradorId, data);

export const rotuloDoMotivo = (motivo: MotivoAfastamento): string =>
  MOTIVOS_DE_AFASTAMENTO.find((m) => m.chave === motivo)?.rotulo || 'Afastamento';

/** "até 30/10/2026" ou "sem data de volta" */
export const ateQuando = (a: Afastamento): string => (a.fim ? `até ${formatarDataBR(a.fim)}` : 'sem data de volta');

/** O que está errado, em português; `null` se pode gravar. */
export const problemaNoAfastamento = (
  a: Pick<Afastamento, 'id' | 'colaboradorId' | 'inicio' | 'fim' | 'motivo'>,
  existentes: Afastamento[]
): string | null => {
  if (!DATA.test(a.inicio || '')) return 'Informe o primeiro dia do afastamento.';
  if (a.fim && !DATA.test(a.fim)) return 'Data de volta inválida.';
  if (a.fim && a.fim < a.inicio) return 'A volta não pode ser antes do início.';
  if (!MOTIVOS_DE_AFASTAMENTO.some((m) => m.chave === a.motivo)) return 'Escolha o motivo.';
  // Dois afastamentos no mesmo dia não dizem nada a mais e confundem o fim
  const sobreposto = existentes.find(
    (e) =>
      e.id !== a.id &&
      e.colaboradorId === a.colaboradorId &&
      (!a.fim || e.inicio <= a.fim) &&
      (!e.fim || a.inicio <= e.fim)
  );
  if (sobreposto) {
    return `Já há um afastamento de ${formatarDataBR(sobreposto.inicio)} ${ateQuando(sobreposto)}. Encerre ou altere aquele.`;
  }
  return null;
};

const gravar = async (a: Afastamento): Promise<{ sucesso: boolean; erro?: string }> => {
  if (usandoNuvem()) {
    const res = await nuvem.salvarAfastamento(a);
    if (!res.sucesso) return res;
  }
  gravarAfastamentos([...lerAfastamentos().filter((e) => e.id !== a.id), a]);
  return { sucesso: true };
};

/** Registra um afastamento novo, ou altera um que já existe (mesmo id). */
export const registrarAfastamento = async (dados: {
  id?: string;
  colaboradorId: string;
  inicio: string;
  fim?: string;
  motivo: MotivoAfastamento;
  observacao?: string;
}): Promise<{ sucesso: boolean; erro?: string }> => {
  const atual = bancoDados.obterColaboradorAtual();
  if (!cuidaDePessoas(atual)) return { sucesso: false, erro: 'Só o RH e o TI registram afastamento.' };

  const afastamento: Afastamento = {
    id: dados.id || `afastamento-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    colaboradorId: dados.colaboradorId,
    inicio: dados.inicio,
    fim: dados.fim || undefined,
    motivo: dados.motivo,
    observacao: dados.observacao?.trim() || undefined,
    registradoPorId: atual.id,
    registradoPorNome: atual.nome,
  };
  const problema = problemaNoAfastamento(afastamento, lerAfastamentos());
  if (problema) return { sucesso: false, erro: problema };

  const res = await gravar(afastamento);
  if (res.sucesso) {
    const pessoa = bancoDados.obterColaboradorPorId(dados.colaboradorId)?.nome || dados.colaboradorId;
    bancoDados.registrarAuditoria(
      'Afastamento',
      'usuario',
      `${atual.nome} registrou o afastamento de ${pessoa}: ${rotuloDoMotivo(afastamento.motivo)}, de ${formatarDataBR(
        afastamento.inicio
      )} ${ateQuando(afastamento)}.`
    );
  }
  return res;
};

/** Remove um afastamento lançado por engano. Os dias voltam a ser de trabalho. */
export const removerAfastamento = async (id: string): Promise<{ sucesso: boolean; erro?: string }> => {
  const atual = bancoDados.obterColaboradorAtual();
  if (!cuidaDePessoas(atual)) return { sucesso: false, erro: 'Só o RH e o TI removem afastamento.' };
  const existente = lerAfastamentos().find((a) => a.id === id);
  if (!existente) return { sucesso: false, erro: 'Afastamento não encontrado.' };
  if (usandoNuvem()) {
    const res = await nuvem.removerAfastamento(id);
    if (!res.sucesso) return res;
  }
  gravarAfastamentos(lerAfastamentos().filter((a) => a.id !== id));
  const pessoa = bancoDados.obterColaboradorPorId(existente.colaboradorId)?.nome || existente.colaboradorId;
  bancoDados.registrarAuditoria(
    'Afastamento',
    'usuario',
    `${atual.nome} removeu o afastamento de ${pessoa} (${formatarDataBR(existente.inicio)} ${ateQuando(existente)}).`
  );
  return { sucesso: true };
};
