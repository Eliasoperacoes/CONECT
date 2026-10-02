/**
 * A CARGA DE HOLERITES — de quem é cada página do PDF do escritório.
 *
 * O escritório de contabilidade manda UM PDF com o holerite de todo
 * mundo, e o RH publicava um por um, pessoa por pessoa. Pedido do Elias:
 * subir o arquivo do mês e o sistema distribuir sozinho.
 *
 * O que identifica o dono é o NOME COMPLETO impresso na página, igual ao
 * cadastro do CONECTA (resposta do Elias). Esta camada só decide, a
 * partir do texto de cada página, de quem ela é. Ler o PDF e separar as
 * páginas é de `pdfHolerite.ts`; publicar é o `salvarHolerite` de sempre.
 *
 * NA DÚVIDA, NÃO PUBLICA. Holerite é salário: a página no lugar errado
 * mostra o de uma pessoa a outra. Por isso
 *
 *   - página sem nenhum nome NÃO vira continuação de ninguém sozinha.
 *     Esses PDFs às vezes terminam num "resumo geral da folha" — grudado
 *     no último funcionário, ele leria a folha da empresa inteira;
 *   - página com dois nomes diferentes, ou com um nome que duas pessoas
 *     do cadastro têm, fica para o RH decidir.
 */

export interface PaginaAnalisada {
  /** Começa em 1, como o leitor de PDF mostra. */
  numero: number;
  /** Quem teve o nome encontrado nela. Um = certo; zero ou mais = RH decide. */
  donos: string[];
  /**
   * O palpite para página sem dono certo: quem teve mais palavras do nome
   * encontradas. Só sugere — quem escolhe é o RH.
   */
  sugestao?: string;
  /** O começo do texto, para o RH reconhecer a página sem abri-la. */
  trecho: string;
}

/**
 * O nome e o texto na mesma forma: sem acento, maiúsculo, só letras,
 * espaços simples e um espaço nas pontas — para "ANA PAULA" não casar
 * dentro de "ANA PAULAS" nem de "JOANA PAULA".
 */
export const normalizarParaComparar = (texto: string): string =>
  ` ${texto
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toUpperCase()
    .replace(/[^A-Z]+/g, ' ')
    .trim()} `;

/** As palavras do nome que identificam: as de 3 letras ou mais ("DE", "DA" não contam). */
const palavrasDoNome = (nome: string): string[] =>
  normalizarParaComparar(nome)
    .trim()
    .split(' ')
    .filter((p) => p.length >= 3);

/**
 * O PEDAÇO DA PÁGINA QUE AJUDA A DECIDIR.
 *
 * O começo de toda página é o cabeçalho da empresa, igual em todas — o
 * RH lia "MALACHIAS AUTOPECAS LTDA CNPJ..." três vezes e não sabia qual
 * era qual. O trecho começa um pouco antes do nome encontrado.
 */
/**
 * O NOME DO CAMPO "Nome do Funcionário" — onde o holerite diz de quem é.
 *
 * No holerite do Domínio (o sistema do escritório) o texto sai como
 * "Código  ABNER SOUSA BORGES  Nome do Funcionário": o nome entre os dois
 * rótulos, em maiúsculas. Cada página traz as DUAS VIAS (a que o RH
 * guardava assinada e a do colaborador), então o nome vem duas vezes.
 *
 * Comparar só aqui, e não na página inteira, evita casar com um nome que
 * aparece em outro canto — a beneficiária de uma pensão, por exemplo.
 * Página onde o campo não é achado volta a procurar no texto todo.
 */
export const nomesNoCampo = (texto: string): string[] => [
  ...new Set(
    [...texto.matchAll(/Código\s+(\p{Lu}[\p{Lu}\s'.-]{1,80}?)\s+Nome do Funcionário/gu)].map((m) =>
      m[1].replace(/\s+/g, ' ').trim()
    )
  ),
];

const trechoEmVoltaDoNome = (texto: string, palavra?: string): string => {
  const limpo = texto.normalize('NFD').replace(/\p{M}/gu, '').replace(/\s+/g, ' ').trim();
  const posicao = palavra ? limpo.toUpperCase().indexOf(palavra) : -1;
  const inicio = posicao > 30 ? posicao - 30 : 0;
  return `${inicio > 0 ? '…' : ''}${limpo.slice(inicio, inicio + 160)}`;
};

export const analisarPaginas = (
  textos: string[],
  colaboradores: Array<{ id: string; nome: string }>
): PaginaAnalisada[] => {
  const pessoas = colaboradores
    .map((c) => ({ id: c.id, nome: normalizarParaComparar(c.nome), palavras: palavrasDoNome(c.nome) }))
    .filter((p) => p.nome.trim().length > 0);

  return textos.map((texto, indice) => {
    const campo = nomesNoCampo(texto);
    // Onde procurar: cada nome do campo, separado; sem campo, a página toda
    const alvos = (campo.length > 0 ? campo : [texto]).map(normalizarParaComparar);

    let achados = pessoas.filter((p) => alvos.some((a) => a.includes(p.nome)));

    /**
     * O NOME DENTRO DE OUTRO NOME NÃO É OUTRA PESSOA.
     *
     * "Ana Paula" está dentro de "Ana Paula Ribeiro". Na página da Ana
     * Paula Ribeiro, as duas casariam — e a página iria para o conflito
     * à toa. Fica o nome mais comprido que contém o outro.
     */
    achados = achados.filter(
      (a) => !achados.some((b) => b !== a && b.nome.length > a.nome.length && b.nome.includes(a.nome))
    );

    const donos = [...new Set(achados.map((a) => a.id))];

    let sugestao: string | undefined;
    if (donos.length !== 1) {
      /**
       * O PALPITE: quem teve mais palavras do nome na página.
       *
       * O caso comum é o nome cortado pelo sistema da contabilidade
       * ("MARIA CLARA MAFRA DE OLIVEI"). Exige ao menos duas palavras e
       * um vencedor sozinho — empate não é palpite, é chute.
       */
      const notas = pessoas
        .map((p) => ({
          id: p.id,
          acertos: Math.max(...alvos.map((a) => p.palavras.filter((w) => a.includes(` ${w} `)).length)),
          total: p.palavras.length,
        }))
        .filter((n) => n.acertos >= 2 && n.acertos / Math.max(1, n.total) >= 0.6)
        .sort((a, b) => b.acertos - a.acertos);
      if (notas.length > 0 && (notas.length === 1 || notas[0].acertos > notas[1].acertos)) {
        sugestao = notas[0].id;
      }
    }

    return {
      numero: indice + 1,
      donos,
      sugestao,
      // Com o campo achado, o RH lê o nome como o escritório escreveu
      trecho:
        campo.length > 0
          ? `Nome no holerite: ${campo.join(' / ')}`
          : trechoEmVoltaDoNome(texto, pessoas.find((p) => p.id === (donos[0] || sugestao))?.palavras[0]),
    };
  });
};

/** A escolha inicial de cada página: só o dono certo. O resto começa sem dono. */
export const decisaoInicial = (paginas: PaginaAnalisada[]): Record<number, string | null> =>
  Object.fromEntries(paginas.map((p) => [p.numero, p.donos.length === 1 ? p.donos[0] : null]));

/** As páginas de cada pessoa, em ordem, a partir do que ficou decidido. */
export const paginasPorPessoa = (
  decisoes: Record<number, string | null>
): Record<string, number[]> => {
  const grupos: Record<string, number[]> = {};
  for (const [numero, dono] of Object.entries(decisoes)) {
    if (!dono) continue;
    (grupos[dono] ||= []).push(Number(numero));
  }
  for (const lista of Object.values(grupos)) lista.sort((a, b) => a - b);
  return grupos;
};

const MESES = [
  'JANEIRO', 'FEVEREIRO', 'MARCO', 'ABRIL', 'MAIO', 'JUNHO',
  'JULHO', 'AGOSTO', 'SETEMBRO', 'OUTUBRO', 'NOVEMBRO', 'DEZEMBRO',
];

/**
 * O MÊS DO HOLERITE, lido do próprio PDF — só como sugestão.
 *
 * Aceita "SETEMBRO/2026", "SETEMBRO DE 2026" e "09/2026". Vence o que
 * mais aparece; ninguém publica pelo palpite, o RH confirma no campo.
 */
export const sugerirCompetencia = (textos: string[]): string | null => {
  const contagem = new Map<string, number>();
  const somar = (chave: string) => contagem.set(chave, (contagem.get(chave) || 0) + 1);

  for (const texto of textos) {
    const t = texto.normalize('NFD').replace(/\p{M}/gu, '').toUpperCase();
    for (const m of t.matchAll(/\b(JANEIRO|FEVEREIRO|MARCO|ABRIL|MAIO|JUNHO|JULHO|AGOSTO|SETEMBRO|OUTUBRO|NOVEMBRO|DEZEMBRO)\s*(?:\/|DE)?\s*(20\d{2})\b/g)) {
      somar(`${m[2]}-${String(MESES.indexOf(m[1]) + 1).padStart(2, '0')}`);
    }
    for (const m of t.matchAll(/(?<![\d/])(0[1-9]|1[0-2])\/(20\d{2})\b/g)) {
      somar(`${m[2]}-${m[1]}`);
    }
  }

  let melhor: string | null = null;
  let vezes = 0;
  for (const [chave, n] of contagem) {
    if (n > vezes) {
      melhor = chave;
      vezes = n;
    }
  }
  return melhor;
};
