/**
 * O BANCO VISTO DE UMA FUNÇÃO DE SERVIDOR (Deno) — as peças comuns.
 *
 * Moravam dentro da `apurar-ponto`. A `lembrar-pendencias` lê o banco do
 * mesmo jeito, e uma cópia aqui seria a paginação ou a nova tentativa do
 * 401 corrigida numa função e esquecida na outra.
 *
 * Sem biblioteca: são leituras de tabela pela API REST do Supabase.
 */
declare const Deno: { env: { get(nome: string): string | undefined } };

/** Uma chave do ambiente nos dois formatos: a antiga, ou a lista JSON do sistema novo. */
const chaveDoAmbiente = (antiga: string, novas: string, faltando: string): string => {
  const valor = Deno.env.get(antiga);
  if (valor) return valor;
  const lista = Deno.env.get(novas);
  if (lista) {
    try {
      const chaves = JSON.parse(lista) as Record<string, string>;
      const primeira = chaves.default ?? Object.values(chaves)[0];
      if (primeira) return primeira;
    } catch {
      /* não era JSON: é a própria chave */
      return lista;
    }
  }
  throw new Error(faltando);
};

/**
 * A CHAVE DE SERVIÇO, nos dois formatos que o Supabase usa — o mesmo
 * cuidado da `enviar-aviso`: aceitar só um faria a função morrer calada no
 * dia em que o painel migrar o projeto.
 */
export const chaveDeServico = (): string =>
  chaveDoAmbiente('SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_SECRET_KEYS', 'Sem chave de serviço no ambiente da função.');

/**
 * A CHAVE PÚBLICA, nos dois formatos — a mesma da `enviar-aviso`. Com ela
 * e a sessão de quem chama, o banco responde COMO aquela pessoa: é assim
 * que a alçada é conferida pela regra do banco, sem cópia aqui.
 */
export const chavePublica = (): string =>
  chaveDoAmbiente('SUPABASE_ANON_KEY', 'SUPABASE_PUBLISHABLE_KEYS', 'Sem chave pública no ambiente da função.');

export const responder = (corpo: unknown, status = 200) =>
  new Response(JSON.stringify(corpo), { status, headers: { 'content-type': 'application/json' } });

/**
 * O LEITOR DE TABELAS, com a chave de serviço.
 *
 * TODAS as linhas, de mil em mil. O banco devolve no máximo mil por pedido
 * e não avisa que cortou: sem paginar, a apuração veria um mês pela metade
 * e criaria falta onde houve batida.
 */
export const criarLeitor = () => {
  const url = `${Deno.env.get('SUPABASE_URL')}/rest/v1`;
  const chave = chaveDeServico();
  const cabecalhos = { apikey: chave, Authorization: `Bearer ${chave}` };

  /** As tabelas opcionais que não existem no banco: nelas não se grava. */
  const ausentes = new Set<string>();

  const ler = async <T>(caminho: string, opcional = false): Promise<T[]> => {
    const todas: T[] = [];
    for (let de = 0; ; de += 1000) {
      const pedir = () =>
        fetch(`${url}/${caminho}`, {
          headers: { ...cabecalhos, Range: `${de}-${de + 999}`, 'Range-Unit': 'items' },
        });
      /*
        "JWT issued at future" (401): o relógio de uma peça do Supabase
        segundos atrás do de outra. Passageiro — a segunda tentativa, na
        primeira simulação em produção, passou. A madrugada não pode
        falhar por isso: espera um pouco e tenta de novo, até três vezes.
      */
      let r = await pedir();
      for (let tentativa = 1; r.status === 401 && tentativa <= 3; tentativa++) {
        await new Promise((ok) => setTimeout(ok, 2000 * tentativa));
        r = await pedir();
      }
      /*
        TABELA QUE NÃO EXISTE, quando ela é opcional, é lista vazia — como
        no aplicativo. A de feriados cadastrados não existia na produção
        (01/10/2026): o app segue com os nacionais e municipais, que são
        calculados, e a primeira simulação parou aqui.
      */
      if (opcional && r.status === 404) {
        ausentes.add(caminho.split('?')[0]);
        return [];
      }
      if (!r.ok) throw new Error(`Leitura de ${caminho.split('?')[0]}: ${r.status} ${await r.text()}`);
      const pagina = (await r.json()) as T[];
      todas.push(...pagina);
      if (pagina.length < 1000) return todas;
    }
  };

  return { url, cabecalhos, ler, ausentes };
};
