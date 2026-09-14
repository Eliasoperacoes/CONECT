/**
 * Conexão com o Supabase — CONECTA / Malachias Autopeças
 *
 * O sistema funciona em dois modos:
 *
 *  - LOCAL: sem as chaves configuradas, tudo continua no navegador, como
 *    sempre funcionou. Serve para desenvolver e para demonstração.
 *  - NUVEM: com as chaves no .env, os dados passam a viver no banco e a rede
 *    inteira enxerga a mesma informação.
 *
 * O modo é decidido aqui, num lugar só, para o resto do sistema não precisar
 * saber de chave nenhuma.
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';

const URL_SUPABASE = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const CHAVE_SUPABASE = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/** Domínio interno usado para transformar o login em e-mail para o Supabase. */
const DOMINIO_INTERNO = 'conecta.malachias.local';

/**
 * O funcionário digita "Elias"; o Supabase exige um e-mail. A conversão é
 * feita aqui e é sempre a mesma, para o login continuar simples na tela.
 */
export const loginParaEmailInterno = (login: string): string =>
  `${login.trim().toLowerCase().replace(/[^a-z0-9._-]/g, '')}@${DOMINIO_INTERNO}`;

const configurado = !!(
  URL_SUPABASE &&
  CHAVE_SUPABASE &&
  URL_SUPABASE.startsWith('http') &&
  CHAVE_SUPABASE.length > 20
);

/** Há um banco na nuvem configurado neste ambiente? */
export const usandoNuvem = (): boolean => configurado;

/**
 * Cliente do Supabase. É `null` no modo local — quem usa deve checar
 * `usandoNuvem()` antes, ou usar `exigirSupabase()`.
 */
export const supabase: SupabaseClient | null = configurado
  ? createClient(URL_SUPABASE!, CHAVE_SUPABASE!, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        storageKey: 'conecta_sessao_supabase',
      },
      realtime: {
        params: { eventsPerSecond: 10 },
      },
    })
  : null;

/** Cliente garantido, para trechos que só rodam no modo nuvem. */
export const exigirSupabase = (): SupabaseClient => {
  if (!supabase) {
    throw new Error(
      'Supabase não configurado. Defina VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY no .env'
    );
  }
  return supabase;
};

/** Estado da conexão, para a interface poder avisar o usuário. */
export type EstadoConexaoNuvem = 'local' | 'conectando' | 'conectado' | 'erro';

/**
 * Confere se o banco responde e se o esquema foi aplicado. Chamado na
 * inicialização para o sistema saber se pode confiar na nuvem.
 */
export const verificarConexao = async (): Promise<{
  estado: EstadoConexaoNuvem;
  erro?: string;
}> => {
  if (!supabase) return { estado: 'local' };

  try {
    const { error } = await supabase.from('colaboradores').select('id').limit(1);

    if (error) {
      // Tabela ausente significa que o esquema ainda não foi aplicado
      if (error.code === '42P01') {
        return {
          estado: 'erro',
          erro: 'Banco conectado, mas as tabelas não existem. Rode o supabase/esquema.sql no SQL Editor.',
        };
      }
      return { estado: 'erro', erro: error.message };
    }

    return { estado: 'conectado' };
  } catch (erro) {
    return {
      estado: 'erro',
      erro: erro instanceof Error ? erro.message : 'Falha ao contatar o banco.',
    };
  }
};
