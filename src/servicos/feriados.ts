/**
 * Calendário de feriados — CONECTA / Malachias Autopeças
 *
 * O que o sistema precisa saber sobre os dias em que a rede não abre.
 *
 * ===================================================================
 * POR QUE ISTO MUDA O ESPELHO
 * ===================================================================
 *
 * Sem feriado cadastrado, todo 7 de setembro virava um dia inteiro de
 * débito para a rede inteira — e o espelho mostrava um dia sem batida
 * nenhuma, que se lê como falta. Ninguém entendia de onde saiu o buraco
 * no banco de horas, porque a causa é a ausência de um registro, e
 * ausência não aparece em lugar nenhum.
 *
 * ===================================================================
 * POR LOJA, PORQUE SÃO CIDADES DIFERENTES
 * ===================================================================
 *
 * As cinco unidades ficam em municípios distintos. O aniversário de
 * Pirassununga não fecha a loja de Leme, e o padroeiro de uma não vale
 * para a outra. Feriado sem loja vale para a rede; com loja, só para ela
 * — e o da loja vence o da rede quando os dois caem no mesmo dia.
 *
 * ===================================================================
 * MEIO EXPEDIENTE É UM NÚMERO, NÃO UM SIM OU NÃO
 * ===================================================================
 *
 * 24 e 31 de dezembro a rede costuma abrir meio período. Tratar feriado
 * como "fecha ou não fecha" obrigaria a escolher entre cobrar o dia
 * inteiro e não cobrar nada — e as duas escolhas estão erradas.
 */

import { Feriado, Loja } from '../tipos';
import { cuidaDePessoas } from '../tipos';
import { bancoDados } from './bancoDados';
import { nuvem } from './nuvem';
import { usandoNuvem } from './supabase';
import {
  lerFeriados,
  gravarFeriados,
  assinarFeriados,
  feriadoEm,
} from './feriadosCache';
import { feriadosNacionaisDe } from './feriadosNacionais';

export { assinarFeriados, lerFeriados, feriadoEm };

/**
 * Quem mexe no calendário.
 *
 * O mesmo grupo que cuida de pessoas: RH, Diretoria e TI. Feriado vale
 * para a rede inteira e mexe no banco de horas de todo mundo — não é
 * decisão de uma loja só.
 */
export const podeCuidarDoCalendario = (): boolean =>
  cuidaDePessoas(bancoDados.obterColaboradorAtual());

/** Os feriados de um ano, em ordem, com os da loja junto dos da rede. */
export const feriadosDoAno = (ano: number, loja?: Loja): Feriado[] =>
  lerFeriados()
    .filter((f) => f.data.startsWith(String(ano)))
    .filter((f) => !loja || !f.loja || f.loja === loja)
    .sort((a, b) => a.data.localeCompare(b.data));

/** Os feriados de um mês, para o calendário da escala. */
export const feriadosDoMes = (ano: number, mes: number, loja?: Loja): Feriado[] => {
  const prefixo = `${ano}-${String(mes + 1).padStart(2, '0')}`;
  return lerFeriados()
    .filter((f) => f.data.startsWith(prefixo))
    .filter((f) => !loja || !f.loja || f.loja === loja)
    .sort((a, b) => a.data.localeCompare(b.data));
};

const gravar = async (
  lista: Feriado[]
): Promise<{ sucesso: boolean; erro?: string }> => {
  if (usandoNuvem()) {
    const res = await nuvem.salvarFeriados(lista);
    if (!res.sucesso) return res;
  }
  return { sucesso: true };
};

export const salvarFeriado = async (dados: {
  data: string;
  nome: string;
  loja?: Loja;
  minutosPrevistos: number;
}): Promise<{ sucesso: boolean; erro?: string }> => {
  if (!podeCuidarDoCalendario()) {
    return { sucesso: false, erro: 'Apenas RH, Diretoria e TI mexem no calendário.' };
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dados.data)) {
    return { sucesso: false, erro: 'Informe a data.' };
  }
  if (!dados.nome.trim()) {
    return { sucesso: false, erro: 'Dê um nome ao feriado — ele sai no espelho de ponto.' };
  }
  if (dados.minutosPrevistos < 0 || dados.minutosPrevistos > 600) {
    return { sucesso: false, erro: 'Horas previstas fora do razoável.' };
  }

  /**
   * MESMO DIA E MESMA ABRANGÊNCIA É O MESMO FERIADO.
   *
   * Cadastrar de novo corrige o que está lá, em vez de empilhar duas
   * linhas do mesmo dia — duas linhas fariam o espelho escolher uma
   * delas sem critério.
   */
  const novo: Feriado = {
    id: `fer-${dados.data}-${dados.loja || 'rede'}`,
    data: dados.data,
    nome: dados.nome.trim(),
    loja: dados.loja,
    minutosPrevistos: dados.minutosPrevistos,
    criadoEm: new Date().toISOString(),
  };

  const lista = [...lerFeriados().filter((f) => f.id !== novo.id), novo];

  const res = await gravar([novo]);
  if (!res.sucesso) return res;

  gravarFeriados(lista);
  bancoDados.registrarAuditoria(
    'Feriado cadastrado',
    'usuario',
    `${bancoDados.obterColaboradorAtual().nome} cadastrou ${novo.nome} em ${novo.data}${
      novo.loja ? ` (${novo.loja})` : ' (rede inteira)'
    }.`
  );
  return { sucesso: true };
};

export const removerFeriado = async (
  id: string
): Promise<{ sucesso: boolean; erro?: string }> => {
  if (!podeCuidarDoCalendario()) {
    return { sucesso: false, erro: 'Apenas RH, Diretoria e TI mexem no calendário.' };
  }

  if (usandoNuvem()) {
    const res = await nuvem.removerFeriado(id);
    if (!res.sucesso) return res;
  }

  gravarFeriados(lerFeriados().filter((f) => f.id !== id));
  return { sucesso: true };
};

/**
 * Traz os feriados nacionais do ano de uma vez.
 *
 * NÃO SOBRESCREVE O QUE JÁ EXISTE. Se o RH marcou o Natal como meio
 * expediente, ou apagou um feriado que a rede resolveu abrir, importar de
 * novo não pode desfazer essa decisão — senão o botão vira uma armadilha
 * que reescreve o calendário inteiro sem avisar.
 */
export const importarFeriadosNacionais = async (
  ano: number
): Promise<{ sucesso: boolean; acrescentados: number; erro?: string }> => {
  if (!podeCuidarDoCalendario()) {
    return {
      sucesso: false,
      acrescentados: 0,
      erro: 'Apenas RH, Diretoria e TI mexem no calendário.',
    };
  }

  const existentes = lerFeriados();
  const jaTem = new Set(existentes.map((f) => f.id));

  const novos: Feriado[] = feriadosNacionaisDe(ano)
    .map((f) => ({
      id: `fer-${f.data}-rede`,
      data: f.data,
      nome: f.nome,
      minutosPrevistos: f.minutosPrevistos,
      criadoEm: new Date().toISOString(),
    }))
    .filter((f) => !jaTem.has(f.id));

  if (novos.length === 0) return { sucesso: true, acrescentados: 0 };

  const res = await gravar(novos);
  if (!res.sucesso) return { sucesso: false, acrescentados: 0, erro: res.erro };

  gravarFeriados([...existentes, ...novos]);
  bancoDados.registrarAuditoria(
    'Feriados nacionais importados',
    'usuario',
    `${bancoDados.obterColaboradorAtual().nome} trouxe ${novos.length} feriado(s) de ${ano}.`
  );

  return { sucesso: true, acrescentados: novos.length };
};
