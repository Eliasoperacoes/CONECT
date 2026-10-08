/**
 * OS ESTABELECIMENTOS — os CNPJs em que as pessoas são registradas.
 *
 * Elias (07/10/2026): "são 5 lojas, porém somente 2 CNPJs registram
 * funcionários", e o CNPJ é da PESSOA, não da loja. O registrador de ponto
 * numera tudo por CNPJ (registrador-por-estabelecimento.sql), então o CNPJ
 * da ficha deixa de ser texto livre: é um dos estabelecimentos cadastrados.
 * Ficha sem CNPJ, ou com um que não é deles, não entra no AFD certo.
 *
 * A lista mora na tabela `estabelecimentos` (só o administrador grava).
 * Vazia — antes do cadastro, ou no modo local —, o cadastro da pessoa
 * continua aceitando o CNPJ digitado, como antes.
 */
import { usandoNuvem } from './supabase';
import { nuvem } from './nuvem';

export interface Estabelecimento {
  /** Só os 14 dígitos. */
  cnpj: string;
  razaoSocial: string;
  local: string;
}

export const soDigitos = (texto?: string | null): string => (texto || '').replace(/\D/g, '');

/** Os estabelecimentos cadastrados. Vazia sem banco, sem a tabela ou se ninguém cadastrou. */
export const carregarEstabelecimentos = async (): Promise<Estabelecimento[]> => {
  if (!usandoNuvem()) return [];
  return (await nuvem.listarEstabelecimentos()).map((l) => ({
    cnpj: l.cnpj,
    razaoSocial: l.razao_social,
    local: l.local,
  }));
};

/**
 * O CNPJ DA FICHA ESTÁ CERTO? Com estabelecimentos cadastrados, só vale
 * um deles; sem nenhum, a regra de antes (qualquer CNPJ, ou vazio).
 *
 * OBRIGATÓRIO SÓ PARA QUEM BATE PONTO, como o CPF (Elias, 07/10/2026): a
 * direção, o RH que não bate e as contas de administração não entram no
 * registrador — exigir um CNPJ delas seria inventar um vínculo. Quem não
 * bate pode ficar sem; se tiver, tem de ser um dos estabelecimentos.
 */
export const cnpjDaFichaValido = (
  cnpj: string | undefined,
  lista: Estabelecimento[],
  bateOPonto = true
): boolean => {
  if (lista.length === 0) return true;
  if (!soDigitos(cnpj)) return !bateOPonto;
  return lista.some((e) => e.cnpj === soDigitos(cnpj));
};
