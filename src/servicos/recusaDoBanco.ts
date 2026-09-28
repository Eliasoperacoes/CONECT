/**
 * O QUE O BANCO RECUSOU, EM PORTUGUÊS — CONECTA
 *
 * ===================================================================
 * POR QUE NUM ARQUIVO SÓ
 * ===================================================================
 *
 * Todo caminho de escrita precisa da MESMA resposta, e não estava
 * assim. A explicação morava dentro da ponte de comunicação: o CHAT
 * sabia dizer "falta rodar um script no Supabase", e a BATIDA DE PONTO
 * devolvia a mensagem crua do PostgREST — para uma pessoa no balcão,
 * com o celular na mão, lendo "Could not find the 'x' column of
 * 'registros_ponto' in the schema cache".
 *
 * Duas respostas para a mesma pergunta é como este sistema já se
 * contradisse quatro vezes.
 *
 * ===================================================================
 * POR QUE NÃO DENTRO DE `supabase.ts`
 * ===================================================================
 *
 * Porque os testes substituem `./supabase` inteiro para não falar com
 * banco nenhum. Com a função lá dentro, cada arquivo de teste teria de
 * reimplementá-la no seu falso — e aí o teste que confere a explicação
 * estaria conferindo a cópia dele mesmo, não a regra.
 *
 * Aqui ele importa só `temSessaoViva`, que os falsos já fornecem porque
 * o resto do sistema também o usa.
 */
import { temSessaoViva } from './supabase';

/**
 * A recusa do banco, traduzida para quem vai ler.
 *
 * `PGRST204` é o PostgREST dizendo que o código mandou uma coluna que o
 * banco não tem — ou seja, um script do Supabase que ficou por rodar.
 * Não é permissão, não é conexão, e não adianta tentar de novo.
 *
 * Isto derrubou o CHAT INTEIRO uma vez: toda mensagem passou a levar
 * `publicacao_id`, o `aviso-no-chat.sql` não tinha sido rodado, e o
 * banco recusava CADA envio — inclusive um "bom dia", que manda a
 * coluna como nula do mesmo jeito. A tela dizia "Verifique a conexão e
 * tente de novo", e a conexão estava ótima.
 *
 * Quem lê a mensagem é quem roda o script, então ela diz QUAL coluna e
 * O QUE fazer. A mensagem do banco vai junto, entre parênteses: é ela
 * que serve para procurar.
 */
export const explicarRecusaDoBanco = async (error: {
  code?: string;
  message: string;
}): Promise<string> => {
  const ehColunaQueFalta =
    error.code === 'PGRST204' ||
    /could not find the .* column|schema cache/i.test(error.message);

  if (ehColunaQueFalta) {
    const coluna = error.message.match(/'([^']+)' column/)?.[1];
    return `O banco ainda não tem ${
      coluna ? `a coluna '${coluna}'` : 'uma coluna que o sistema usa'
    }. Falta rodar um script no Supabase — avise o TI. (${error.message})`;
  }

  const ehRecusaDeAcesso =
    error.code === '42501' || error.message.toLowerCase().includes('row-level security');

  if (!ehRecusaDeAcesso) return error.message;

  /**
   * SESSÃO VENCIDA E FALTA DE PERMISSÃO SE PARECEM NO BANCO.
   *
   * Um pedido sem credencial é recusado com a mesma "violates
   * row-level security policy" de um visitante sem direito. São dois
   * consertos diferentes: um é entrar de novo, o outro é pedir acesso —
   * e mandar a pessoa errada tentar o conserto errado é o que faz ela
   * desistir.
   */
  if (!temSessaoViva()) {
    return 'Sua sessão terminou. Saia e entre de novo para continuar.';
  }

  return `Sem permissão no banco para esta ação (${error.message}).`;
};
