/**
 * Ausências justificadas — CONECTA / Malachias Autopeças
 *
 * Atestado, falta justificada e comparecimento: o que NÃO passa por batida
 * nenhuma, e por isso o fluxo automático da jornada nunca enxerga.
 *
 * Segue a MESMA cadeia da aprovação de hora, e pelo mesmo motivo: quem
 * responde pela pessoa é quem decide. Não há uma segunda regra de alçada
 * aqui — `servicoPonto.podeDecidirSobre` é consultado, e é ele que já
 * carrega o organograma, a regra automática e a trava de ninguém decidir
 * sobre si mesmo.
 *
 * Um atestado de três dias é UMA solicitação com início e fim, não três
 * pedidos: quem aprova decide uma vez, sobre o documento inteiro.
 */
import {
  Colaborador,
  JustificativaAusencia,
  SituacaoDoDia,
  SITUACAO_POR_TIPO,
  TipoAusencia,
} from '../tipos';
import {
  lerJustificativas,
  gravarJustificativas,
  assinarJustificativas,
} from './justificativasCache';
import { bancoDados } from './bancoDados';
import { servicoPonto } from './ponto';
import { nuvem } from './nuvem';
import { usandoNuvem } from './supabase';

/**
 * O armazenamento vive em `justificativasCache`, um módulo sem
 * dependência nenhuma. A separação existe porque `nuvem` precisa entregar
 * as ausências do banco, e importar ESTE arquivo fecharia o ciclo
 * nuvem → justificativas → ponto → nuvem.
 */
const ler = lerJustificativas;
const gravar = gravarJustificativas;

// Reexportado para quem usa o serviço não precisar saber do cache
export { assinarJustificativas };

/** Os dias de um período, inclusive as pontas. */
const diasDoPeriodo = (inicio: string, fim: string): string[] => {
  const dias: string[] = [];
  const [ai, mi, di] = inicio.split('-').map(Number);
  const [af, mf, df] = fim.split('-').map(Number);
  const atual = new Date(ai, mi - 1, di, 12);
  const ultimo = new Date(af, mf - 1, df, 12);

  // 400 é trava contra data estragada virando laço infinito
  let limite = 0;
  while (atual <= ultimo && limite < 400) {
    dias.push(
      `${atual.getFullYear()}-${String(atual.getMonth() + 1).padStart(2, '0')}-${String(
        atual.getDate()
      ).padStart(2, '0')}`
    );
    atual.setDate(atual.getDate() + 1);
    limite++;
  }
  return dias;
};

/**
 * Abre a solicitação. Nasce SEMPRE pendente e SEMPRE em nome de quem está
 * logado — abrir já aprovada, ou em nome de outro, é o atalho que a
 * invariante "sem pular etapas" existe para fechar.
 */
export const solicitarAusencia = async (dados: {
  dataInicio: string;
  dataFim: string;
  tipo: TipoAusencia;
  observacao?: string;
  anexoCaminho?: string;
  anexoNome?: string;
}): Promise<{ sucesso: boolean; justificativa?: JustificativaAusencia; erro?: string }> => {
  const eu = bancoDados.obterColaboradorAtual();

  if (!dados.dataInicio || !dados.dataFim) {
    return { sucesso: false, erro: 'Informe o período.' };
  }
  if (dados.dataFim < dados.dataInicio) {
    return { sucesso: false, erro: 'O fim não pode ser antes do início.' };
  }
  // Atestado sem documento é palavra; a decisão do gestor precisa de algo
  // em que se apoiar, e é isso que o RH vai guardar
  if (dados.tipo === 'atestado' && !dados.anexoCaminho) {
    return { sucesso: false, erro: 'Anexe o atestado.' };
  }

  const justificativa: JustificativaAusencia = {
    id: `just-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    colaboradorId: eu.id,
    dataInicio: dados.dataInicio,
    dataFim: dados.dataFim,
    tipo: dados.tipo,
    observacao: dados.observacao?.trim() || undefined,
    anexoCaminho: dados.anexoCaminho,
    anexoNome: dados.anexoNome,
    estado: 'pendente',
    criadoEm: new Date().toISOString(),
  };

  // O banco primeiro: uma solicitação que não subiu apareceria só para quem
  // pediu, e o gestor nunca saberia que existe
  if (usandoNuvem()) {
    const res = await nuvem.salvarJustificativa(justificativa);
    if (!res.sucesso) {
      return { sucesso: false, erro: res.erro || 'Falha ao enviar a solicitação.' };
    }
  }

  gravar([...ler(), justificativa]);
  bancoDados.registrarAuditoria(
    'Ausência justificada',
    'usuario',
    `${eu.nome} solicitou ${dados.tipo} de ${dados.dataInicio} a ${dados.dataFim}.`
  );

  return { sucesso: true, justificativa };
};

/** As minhas, da mais recente para a mais antiga. */
export const minhasJustificativas = (): JustificativaAusencia[] => {
  const eu = bancoDados.obterColaboradorAtual();
  return ler()
    .filter((j) => j.colaboradorId === eu.id)
    .sort((a, b) => b.criadoEm.localeCompare(a.criadoEm));
};

/**
 * A fila de quem decide.
 *
 * `podeDecidirSobre` é a mesma função que decide a hora extra — não há
 * segunda regra de alçada aqui. Ela já recusa a si mesmo, então ninguém
 * aprova a própria ausência nem sendo Diretoria ou TI.
 */
export const pendenciasParaDecidir = (): {
  justificativa: JustificativaAusencia;
  colaborador: Colaborador;
}[] =>
  ler()
    .filter((j) => j.estado === 'pendente')
    .map((justificativa) => ({
      justificativa,
      colaborador: bancoDados.obterColaboradorPorId(justificativa.colaboradorId),
    }))
    .filter(
      (item): item is { justificativa: JustificativaAusencia; colaborador: Colaborador } =>
        !!item.colaborador && servicoPonto.podeDecidirSobre(item.colaborador)
    )
    .sort((a, b) => a.justificativa.dataInicio.localeCompare(b.justificativa.dataInicio));

/** Aprova ou recusa. Recusar exige motivo, como na jornada. */
export const decidirAusencia = async (
  id: string,
  aprovada: boolean,
  motivoRecusa?: string
): Promise<{ sucesso: boolean; erro?: string }> => {
  const eu = bancoDados.obterColaboradorAtual();
  const lista = ler();
  const indice = lista.findIndex((j) => j.id === id);

  if (indice === -1) return { sucesso: false, erro: 'Solicitação não encontrada.' };

  const alvo = lista[indice];
  const dono = bancoDados.obterColaboradorPorId(alvo.colaboradorId);
  if (!dono || !servicoPonto.podeDecidirSobre(dono)) {
    return {
      sucesso: false,
      erro: 'Você não responde por esta pessoa. A decisão cabe ao líder ou ao gerente dela.',
    };
  }
  if (!aprovada && !motivoRecusa?.trim()) {
    return { sucesso: false, erro: 'Informe o motivo da recusa.' };
  }

  const decidida: JustificativaAusencia = {
    ...alvo,
    estado: aprovada ? 'aprovada' : 'recusada',
    aprovadorId: eu.id,
    aprovadorNome: eu.nome,
    decididoEm: new Date().toISOString(),
    motivoRecusa: aprovada ? undefined : motivoRecusa?.trim(),
  };

  if (usandoNuvem()) {
    const res = await nuvem.salvarJustificativa(decidida);
    if (!res.sucesso) {
      return { sucesso: false, erro: res.erro || 'Falha ao registrar a decisão.' };
    }
  }

  lista[indice] = decidida;
  gravar(lista);

  bancoDados.registrarAuditoria(
    'Ausência justificada',
    'usuario',
    `${eu.nome} ${aprovada ? 'aprovou' : 'recusou'} ${alvo.tipo} de ${dono.nome}.`
  );

  return { sucesso: true };
};

/**
 * A situação de um dia, vinda de ausência APROVADA.
 *
 * Só aprovada conta: solicitação pendente não pode mudar o espelho de ponto
 * antes de alguém decidir — seria o mesmo que a hora extra entrar no saldo
 * sem aprovação.
 */
export const situacaoDoDia = (colaboradorId: string, data: string): SituacaoDoDia => {
  const achada = ler().find(
    (j) =>
      j.colaboradorId === colaboradorId &&
      j.estado === 'aprovada' &&
      data >= j.dataInicio &&
      data <= j.dataFim
  );
  return achada ? SITUACAO_POR_TIPO[achada.tipo] : 'normal';
};

/** Os dias cobertos por uma solicitação, para a tela mostrar o alcance. */
export const diasCobertos = (justificativa: JustificativaAusencia): string[] =>
  diasDoPeriodo(justificativa.dataInicio, justificativa.dataFim);
