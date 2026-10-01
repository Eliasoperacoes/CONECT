/**
 * AS LINHAS DO BANCO E O QUE ELAS VIRAM — num lugar só.
 *
 * Moravam dentro de `nuvem.ts`, que carrega o cliente do navegador. A
 * função de servidor `apurar-ponto` lê as mesmas tabelas e precisa
 * convertê-las IGUAL ao aplicativo: um campo lido de um jeito lá e de
 * outro aqui seria a apuração do servidor divergindo da tela.
 *
 * Só importa tipos: vai inteiro para o servidor.
 */
import {
  AjusteJornada,
  Colaborador,
  EstadoAjuste,
  Feriado,
  JustificativaAusencia,
  Loja,
  MetodoMarcacao,
  NivelHierarquico,
  RegistroPonto,
  Setor,
  TipoAjuste,
  TipoMarcacao,
} from '../tipos';

/** Linha da tabela `colaboradores`, como ela vem do banco. */
export interface LinhaColaborador {
  id: string;
  nome: string;
  login: string;
  cargo: string;
  setor: string;
  loja: string;
  nivel: number;
  foto: string | null;
  cnpj: string | null;
  presenca: string;
  visto_por_ultimo: string | null;
  ramal: string | null;
  telefone: string | null;
  email: string | null;
  matricula: string | null;
  departamento: string | null;
  responsavel_id: string | null;
  data_admissao: string | null;
  observacoes: string | null;
  carga_horaria_diaria_minutos: number | null;
  turno: string | null;
  /** Ausente até rodar `turno-escolhido-uma-vez.sql`. */
  turno_confirmado_em?: string | null;
  carga_semanal_minutos: number | null;
  trabalha_sabado: boolean | null;
  tem_intervalo: boolean | null;
  ativo: boolean;
  criado_em: string;
}

/**
 * A linha do banco como Colaborador. A FOTO vem pronta de quem chama: no
 * aplicativo é o endereço assinado do balde (`nuvem.ts`); no servidor
 * ela não importa.
 */
export const paraColaboradorDaLinha = (linha: LinhaColaborador, foto: string): Colaborador => ({
  id: linha.id,
  nome: linha.nome,
  login: linha.login,
  cargo: linha.cargo,
  setor: linha.setor as Setor,
  loja: linha.loja as Loja,
  nivel: linha.nivel as NivelHierarquico,
  foto,
  presenca: (linha.presenca || 'desconectado') as Colaborador['presenca'],
  vistoPorUltimo: linha.visto_por_ultimo || 'Agora',
  ramal: linha.ramal || undefined,
  telefone: linha.telefone || undefined,
  email: linha.email || undefined,
  matricula: linha.matricula || undefined,
  cnpj: linha.cnpj || undefined,
  departamento: linha.departamento || undefined,
  responsavelId: linha.responsavel_id || undefined,
  dataAdmissao: linha.data_admissao || undefined,
  observacoes: linha.observacoes || undefined,
  // `null` no banco quer dizer "vale o turno". Sem o `?? undefined` ele
  // chega como null e vence o turno valendo ZERO — foi o que zerou o
  // previsto de todo dia útil da Lyvia.
  cargaHorariaDiariaMinutos: linha.carga_horaria_diaria_minutos ?? undefined,
  turno: linha.turno || undefined,
  turnoConfirmadoEm: linha.turno_confirmado_em || undefined,
  /**
   * A jornada da pessoa. Vazio no banco quer dizer "vale o padrão do
   * setor" — e não zero: uma carga semanal de zero minutos faria a pessoa
   * fechar todo ciclo com crédito da semana inteira.
   */
  cargaSemanalMinutos: linha.carga_semanal_minutos ?? undefined,
  trabalhaSabado: linha.trabalha_sabado ?? undefined,
  temIntervalo: linha.tem_intervalo ?? undefined,
  // Não volta do banco: é segredo de entrega, e a tela do RH mostra a
  // partir do que ela própria guardou
  senhaAtivacao: undefined,
  ativo: linha.ativo,
  criadoEm: linha.criado_em,
});

/** Linha da tabela `registros_ponto`, como ela vem do banco. */
export interface LinhaRegistroPonto {
  id: string;
  colaborador_id: string;
  data: string;
  tipo: string;
  horario: string;
  hora_formatada: string;
  metodo: string;
  loja: string;
  ajustado_por_id: string | null;
  ajustado_por_nome: string | null;
  justificativa: string | null;
  criado_em: string;
}

export const paraRegistroPonto = (linha: LinhaRegistroPonto): RegistroPonto => ({
  id: linha.id,
  colaboradorId: linha.colaborador_id,
  data: linha.data,
  tipo: linha.tipo as TipoMarcacao,
  horario: linha.horario,
  horaFormatada: linha.hora_formatada,
  metodo: linha.metodo as MetodoMarcacao,
  loja: linha.loja as Loja,
  criadoEm: linha.criado_em,
  ajustadoPorId: linha.ajustado_por_id || undefined,
  ajustadoPorNome: linha.ajustado_por_nome || undefined,
  justificativa: linha.justificativa || undefined,
});

export const paraLinhaPonto = (r: RegistroPonto) => ({
  id: r.id,
  colaborador_id: r.colaboradorId,
  data: r.data,
  tipo: r.tipo,
  horario: r.horario,
  hora_formatada: r.horaFormatada,
  metodo: r.metodo,
  loja: r.loja,
  ajustado_por_id: r.ajustadoPorId ?? null,
  ajustado_por_nome: r.ajustadoPorNome ?? null,
  justificativa: r.justificativa ?? null,
});

/** Linha da tabela `ajustes_jornada`. */
export interface LinhaAjuste {
  id: string;
  colaborador_id: string;
  data: string;
  tipo: string;
  minutos: number;
  minutos_trabalhados: number;
  minutos_previstos: number;
  estado: string;
  aprovador_id: string | null;
  aprovador_nome: string | null;
  decidido_em: string | null;
  observacao: string | null;
  criado_em: string;
  origem?: string | null;
  motivo_colaborador?: string | null;
  anexo_caminho?: string | null;
}

export const paraAjuste = (linha: LinhaAjuste): AjusteJornada => ({
  id: linha.id,
  colaboradorId: linha.colaborador_id,
  data: linha.data,
  tipo: linha.tipo as TipoAjuste,
  minutos: linha.minutos,
  minutosTrabalhados: linha.minutos_trabalhados,
  minutosPrevistos: linha.minutos_previstos,
  estado: linha.estado as EstadoAjuste,
  aprovadorId: linha.aprovador_id || undefined,
  aprovadorNome: linha.aprovador_nome || undefined,
  decididoEm: linha.decidido_em || undefined,
  observacao: linha.observacao || undefined,
  /**
   * ESTES TRÊS NÃO VOLTAVAM DO BANCO (até 01/10/2026). Gravava-se o motivo
   * que a pessoa escreveu, mas a leitura o descartava — e o próximo que
   * reescrevesse o pedido pendente (a revisão da fila, a reapuração)
   * gravava o pedido de novo SEM motivo, apagando-o do banco.
   */
  origem: (linha.origem as AjusteJornada['origem']) || undefined,
  motivoColaborador: linha.motivo_colaborador || undefined,
  anexoCaminho: linha.anexo_caminho || undefined,
  criadoEm: linha.criado_em,
});

export const paraLinhaAjuste = (a: AjusteJornada) => ({
  id: a.id,
  colaborador_id: a.colaboradorId,
  data: a.data,
  tipo: a.tipo,
  minutos: a.minutos,
  minutos_trabalhados: a.minutosTrabalhados,
  minutos_previstos: a.minutosPrevistos,
  estado: a.estado,
  aprovador_id: a.aprovadorId ?? null,
  aprovador_nome: a.aprovadorNome ?? null,
  decidido_em: a.decididoEm ?? null,
  observacao: a.observacao ?? null,
  origem: a.origem ?? 'pendencia',
  motivo_colaborador: a.motivoColaborador ?? null,
  anexo_caminho: a.anexoCaminho ?? null,
});

/**
 * Linha da tabela `justificativas_ausencia`.
 *
 * Atestado, falta e comparecimento: o que não passa por batida nenhuma e o
 * fluxo automático da jornada nunca enxerga.
 */
export const paraLinhaJustificativa = (j: JustificativaAusencia) => ({
  id: j.id,
  colaborador_id: j.colaboradorId,
  data_inicio: j.dataInicio,
  data_fim: j.dataFim,
  tipo: j.tipo,
  observacao: j.observacao ?? null,
  anexo_caminho: j.anexoCaminho ?? null,
  anexo_nome: j.anexoNome ?? null,
  estado: j.estado,
  aprovador_id: j.aprovadorId ?? null,
  aprovador_nome: j.aprovadorNome ?? null,
  decidido_em: j.decididoEm ?? null,
  motivo_recusa: j.motivoRecusa ?? null,
});

export const paraJustificativa = (linha: Record<string, unknown>): JustificativaAusencia => ({
  id: String(linha.id),
  colaboradorId: String(linha.colaborador_id),
  dataInicio: String(linha.data_inicio),
  dataFim: String(linha.data_fim),
  tipo: linha.tipo as JustificativaAusencia['tipo'],
  observacao: (linha.observacao as string) || undefined,
  anexoCaminho: (linha.anexo_caminho as string) || undefined,
  anexoNome: (linha.anexo_nome as string) || undefined,
  estado: linha.estado as JustificativaAusencia['estado'],
  aprovadorId: (linha.aprovador_id as string) || undefined,
  aprovadorNome: (linha.aprovador_nome as string) || undefined,
  decididoEm: (linha.decidido_em as string) || undefined,
  motivoRecusa: (linha.motivo_recusa as string) || undefined,
  criadoEm: String(linha.criado_em),
});

/** Linha da tabela `feriados`. */
export const paraFeriado = (l: Record<string, unknown>): Feriado => ({
  id: String(l.id),
  data: String(l.data),
  nome: String(l.nome),
  loja: (l.loja as Loja) || undefined,
  minutosPrevistos: Number(l.minutos_previstos) || 0,
  criadoEm: String(l.criado_em),
});
