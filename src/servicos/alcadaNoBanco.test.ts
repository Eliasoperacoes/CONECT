/**
 * A alçada no banco — CONECTA
 *
 * ===================================================================
 * QUEM ESCREVE PRECISA CONSEGUIR LER
 * ===================================================================
 *
 * O defeito que originou este arquivo: a líder de setor podia CORRIGIR a
 * marcação da equipe e não podia LÊ-LA. As regras de gravação foram
 * ensinadas sobre o líder; a de leitura ficou para trás, conhecendo só
 * "nível 3 ou mais".
 *
 * O erro não saiu como "sem permissão". A gravação usava `upsert`, que no
 * banco precisa enxergar a linha para resolver o conflito — sem enxergar,
 * falhava inteira, e a tela traduzia para "verifique a conexão". A líder
 * conferiu o wi-fi, estava bom, e o defeito chegou como "não funciona".
 *
 * Três camadas erradas de uma vez, e nenhuma acusando a outra. Por isso o
 * teste é estrutural: ele lê as regras do banco e cobra a coerência entre
 * elas, em vez de depender de alguém reproduzir o caso.
 */
import { test, expect } from 'bun:test';
import { Glob } from 'bun';

/** Uma regra de segurança por linha, como está escrita no arquivo. */
interface Regra {
  arquivo: string;
  tabela: string;
  nome: string;
  operacao: string;
  corpo: string;
}

const lerRegras = async (): Promise<Regra[]> => {
  const regras: Regra[] = [];

  for (const arquivo of new Glob('supabase/*.sql').scanSync('.')) {
    const fonte = await Bun.file(arquivo).text();

    // Sem os comentários: eles citam os nomes das funções o tempo todo
    const sql = fonte.replace(/--.*$/gm, '');

    const achados = sql.matchAll(
      /create policy\s+(\w+)\s+on\s+public\.(\w+)\s+for\s+(select|insert|update|delete|all)\b([\s\S]*?);\s*(?=\n|$)/gi
    );

    for (const achado of achados) {
      regras.push({
        arquivo,
        nome: achado[1],
        tabela: achado[2],
        operacao: achado[3].toLowerCase(),
        corpo: achado[4],
      });
    }
  }

  return regras;
};

/**
 * A regra que vale: a ÚLTIMA escrita para aquela tabela e operação.
 *
 * Os arquivos de delta reescrevem regras do esquema, e é o último a rodar
 * que fica valendo. Conferir a primeira versão daria um falso "está tudo
 * certo" justamente quando um delta tivesse estragado algo.
 *
 * A ordem entre arquivos segue a do documento de operação: o esquema
 * primeiro, os deltas depois, em ordem alfabética — que é como eles são
 * numerados lá.
 */
const regraEmVigor = (regras: Regra[], tabela: string, operacao: string): Regra | undefined => {
  const doGrupo = regras
    .filter((r) => r.tabela === tabela && (r.operacao === operacao || r.operacao === 'all'))
    .sort((a, b) => {
      const peso = (arquivo: string) => (arquivo.includes('esquema.sql') ? 0 : 1);
      return peso(a.arquivo) - peso(b.arquivo) || a.arquivo.localeCompare(b.arquivo);
    });

  return doGrupo[doGrupo.length - 1];
};

test('QUEM PODE ESCREVER PRECISA PODER LER', async () => {
  const regras = await lerRegras();
  expect(regras.length).toBeGreaterThan(10);

  const tabelas = [...new Set(regras.map((r) => r.tabela))];
  const problemas: string[] = [];

  for (const tabela of tabelas) {
    const escritas = (['insert', 'update'] as const)
      .map((op) => regraEmVigor(regras, tabela, op))
      .filter((r): r is Regra => !!r);

    const ensinadaSobreLider = escritas.some((r) => r.corpo.includes('posso_decidir_jornada'));
    if (!ensinadaSobreLider) continue;

    const leitura = regraEmVigor(regras, tabela, 'select');
    if (!leitura) {
      problemas.push(`${tabela}: grava conhecendo o responsável e não tem regra de leitura`);
      continue;
    }

    if (!leitura.corpo.includes('posso_decidir_jornada')) {
      problemas.push(
        `${tabela}: a gravação conhece o responsável, mas a leitura (${leitura.nome}, em ${leitura.arquivo}) não — ` +
          `é o defeito da correção de ponto se repetindo`
      );
    }
  }

  expect(problemas).toEqual([]);
});

test('APAGAR REGISTRO DE PONTO CONTINUA SÓ DO RH', async () => {
  /**
   * A contrapartida de ter soltado a correção para o responsável.
   * Corrigir horário e apagar batida são decisões diferentes: a segunda
   * diz que a marcação nunca existiu, e isso não é do líder.
   */
  const regras = await lerRegras();

  for (const tabela of ['registros_ponto', 'ajustes_jornada', 'justificativas_ausencia']) {
    const remocao = regraEmVigor(regras, tabela, 'delete');
    expect(remocao).toBeDefined();
    expect(remocao!.corpo).toContain('cuido_de_pessoas');
    expect(remocao!.corpo).not.toContain('posso_decidir_jornada');
  }
});

test('NENHUMA GRAVAÇÃO DE PONTO USA upsert', async () => {
  /**
   * `upsert` vira `ON CONFLICT DO UPDATE`, que precisa ENXERGAR a linha em
   * conflito. Quem não pode lê-la não recebe "sem permissão": a gravação
   * falha inteira, com um erro que não diz nada sobre permissão.
   *
   * Já mordeu duas vezes neste projeto — na gravação de conversa e na
   * correção de marcação. O padrão certo é insert comum e tratar o 23505.
   */
  const fonte = await Bun.file('src/servicos/nuvem.ts').text();
  const codigo = fonte.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

  /**
   * SÓ AS GRAVAÇÕES QUE O LÍDER FAZ.
   *
   * `colaboradores` e `codigos_ponto_loja` seguem com `upsert` de
   * propósito: quem grava lá é o RH ou o TI, que enxergam a linha. A
   * armadilha só arma quando quem grava tem leitura estreita — e é o caso
   * de ponto, apuração e ausência.
   */
  const corpoDe = (nome: string): string => {
    const inicio = codigo.indexOf(`async ${nome}(`);
    expect(inicio).toBeGreaterThan(-1);
    const depois = codigo.indexOf('\n  async ', inicio + 1);
    return codigo.slice(inicio, depois === -1 ? undefined : depois);
  };

  const comUpsert: string[] = [];
  for (const nome of [
    'salvarAjustePonto',
    'salvarRegistroPonto',
    'salvarAjuste',
    'salvarJustificativa',
  ]) {
    if (corpoDe(nome).includes('.upsert(')) comUpsert.push(nome);
  }

  expect(comUpsert).toEqual([]);

  // E o tratamento que toma o lugar dele continua lá
  expect(corpoDe('salvarAjustePonto').includes("'23505'")).toBe(true);
});

test('a tela não inventa a causa do erro do banco', async () => {
  /**
   * A mensagem antiga mandava a líder olhar a conexão enquanto o banco
   * recusava por permissão. Ela conferiu, estava boa, e o defeito chegou
   * como "não funciona" — sem a única informação que resolveria.
   */
  const fonte = await Bun.file('src/servicos/ponto.ts').text();
  const codigo = fonte.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

  // O motivo do banco é repassado, em vez de trocado por um palpite
  expect(codigo).toContain('${res.erro}');
});
