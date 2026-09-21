/**
 * Leitura paginada do banco — CONECTA / Malachias Autopeças
 *
 * ===================================================================
 * O SUPABASE CORTA EM 1000 LINHAS, E NÃO AVISA
 * ===================================================================
 *
 * Uma consulta sem faixa volta no máximo 1000 registros. Não vem erro,
 * não vem sinal nenhum: vem menos dado, e o sistema acredita que aquilo
 * é tudo.
 *
 * O ESTRAGO QUE ISSO FEZ: o espelho de ponto do RH aparecia incompleto.
 * São 89 pessoas × 4 batidas × 22 dias — quase 8 mil linhas por mês. O
 * líder, cuja segurança por linha devolve só a equipe dele, recebia o
 * conjunto inteiro e via o que tinha acabado de digitar. O RH, que
 * enxerga a rede toda, batia no teto — e como a ordem era por horário
 * CRESCENTE, o que ficava de fora era exatamente o mais recente.
 *
 * Duas pessoas olhando a mesma tela e vendo coisas diferentes, sem erro
 * em lugar nenhum. Em registro de ponto isso não é tolerável.
 *
 * ===================================================================
 * POR QUE ESTE ARQUIVO NÃO IMPORTA NADA
 * ===================================================================
 *
 * `nuvem` e `nuvemComunicacao` precisam dos dois, e `nuvem` já importa
 * `nuvemComunicacao`. Deixar o buscador num deles obrigaria o outro a
 * importá-lo de volta — e ciclo de importação neste projeto já apagou a
 * tela uma vez.
 */

export const LINHAS_POR_PAGINA = 1000;

/** O teto de segurança: erro de filtro não pode virar laço infinito. */
const TETO = 200_000;

/** O mínimo que uma consulta do Supabase precisa oferecer. */
interface ConsultaPaginavel {
  range: (de: number, ate: number) => PromiseLike<{ data: unknown; error: unknown }>;
}

/**
 * Traz TODAS as linhas, em páginas.
 *
 * `montar` devolve uma consulta NOVA a cada chamada, e isso não é
 * capricho: o construtor do Supabase não pode ser reaproveitado depois
 * de aguardado uma vez.
 *
 * Devolve `null` quando o banco recusa — diferente de `[]`, que quer
 * dizer "consultei e não há nada". Confundir os dois faria o cache ser
 * apagado por uma falha de rede.
 */
export const buscarTodasAsLinhas = async <T>(
  montar: () => ConsultaPaginavel,
  ondeEstou: string
): Promise<T[] | null> => {
  const tudo: T[] = [];

  for (let inicio = 0; inicio < TETO; inicio += LINHAS_POR_PAGINA) {
    const { data, error } = await montar().range(inicio, inicio + LINHAS_POR_PAGINA - 1);

    if (error) {
      console.error(`Falha ao ler ${ondeEstou}:`, (error as { message?: string }).message);
      return null;
    }

    const pagina = (data || []) as T[];
    tudo.push(...pagina);

    // Página incompleta quer dizer que acabou
    if (pagina.length < LINHAS_POR_PAGINA) return tudo;
  }

  console.error(`Leitura de ${ondeEstou} passou de ${TETO} linhas; algo está errado.`);
  return tudo;
};
