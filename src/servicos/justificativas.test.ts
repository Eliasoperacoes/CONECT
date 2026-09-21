/**
 * Verificação das ausências justificadas — CONECTA
 *
 * Atestado, falta e comparecimento: o que não passa por batida nenhuma.
 *
 * O que estes testes prendem é que isto NÃO virou uma segunda regra de
 * alçada. Se a ausência tivesse a própria noção de quem aprova quem, as
 * duas divergiriam com o tempo — e foi exatamente esse o defeito que já
 * apareceu quatro vezes nesta base.
 */
import { test, expect, mock, beforeEach } from 'bun:test';

class ArmazenamentoFalso {
  private dados = new Map<string, string>();
  getItem(k: string) { return this.dados.has(k) ? this.dados.get(k)! : null; }
  setItem(k: string, v: string) { this.dados.set(k, String(v)); }
  removeItem(k: string) { this.dados.delete(k); }
  clear() { this.dados.clear(); }
}
const armazenamento = new ArmazenamentoFalso();
(globalThis as any).localStorage = armazenamento;

const CHEFE = {
  id: 'chefe', nome: 'Chefe', login: 'chefe', cargo: 'Gerente', setor: 'Gerência',
  loja: 'Pirassununga', nivel: 3, foto: '', presenca: 'disponivel',
  vistoPorUltimo: 'agora', ativo: true,
};
/**
 * A Ana pendurada no Chefe: o alcance vem do ORGANOGRAMA, e nao de
 * dividirem a loja. Sem a cadeia montada, ninguem responde por ela — e e
 * assim que a rede vai funcionar de verdade.
 */
const ANA = {
  ...CHEFE, id: 'ana', nome: 'Ana', login: 'ana', nivel: 1,
  setor: 'Balcão', responsavelId: 'chefe',
};
const OUTRO = {
  ...CHEFE, id: 'outro', nome: 'Outro', login: 'outro', loja: 'Descalvado',
};

/**
 * O RH, que é quem decide DOCUMENTO.
 *
 * Entrou quando o Elias viu a Leigislaine — uma líder — recusar o
 * atestado da Aline. Atestado não é jornada: o líder não tem como julgar
 * o documento e nem deveria lê-lo, porque é dado de saúde de um colega.
 *
 * Note que o Chefe NÃO cuida de pessoas: é Gerência, nível 3. É ele que
 * prova que a cadeia deixou de alcançar o atestado.
 */
const RH = {
  ...CHEFE, id: 'rh', nome: 'Dani', login: 'dani', setor: 'RH', cargo: 'Analista de RH',
};

let logado: any = ANA;
let equipe: any[] = [CHEFE, ANA, OUTRO, RH];

mock.module('./supabase', () => ({ usandoNuvem: () => false, supabase: null }));
mock.module('./nuvem', () => ({
  nuvem: { salvarJustificativa: async () => ({ sucesso: true }) },
}));
mock.module('./bancoDados', () => ({
  bancoDados: {
    obterColaboradorAtual: () => logado,
    obterColaboradorPorId: (id: string) => equipe.find((c) => c.id === id),
    obterColaboradores: () => equipe,
    obterConfiguracoes: () => ({}),
    registrarAuditoria: () => {},
    estaAutenticado: () => true,
    assinarAlteracoes: () => () => {},
  },
}));

const {
  solicitarAusencia,
  pendenciasParaDecidir,
  decidirAusencia,
  situacaoDoDia,
  minhasJustificativas,
  diasCobertos,
  pendenciasDeFolga,
  lancarAusenciaPelaLideranca,
} = await import('./justificativas');

beforeEach(() => {
  armazenamento.clear();
  logado = ANA;
  equipe = [CHEFE, ANA, OUTRO, RH];
});

const pedirAtestado = async (de = '2026-09-16', ate = '2026-09-18') =>
  solicitarAusencia({
    dataInicio: de,
    dataFim: ate,
    tipo: 'atestado',
    observacao: 'Consulta',
    anexoCaminho: 'ausencias/ana/atestado.jpg',
  });

test('a solicitação nasce PENDENTE e em nome de quem pediu', async () => {
  // Nascer aprovada seria o atalho que a regra "sem pular etapas" fecha
  const res = await pedirAtestado();

  expect(res.sucesso).toBe(true);
  expect(res.justificativa!.estado).toBe('pendente');
  expect(res.justificativa!.colaboradorId).toBe('ana');
  expect(res.justificativa!.aprovadorId).toBeUndefined();
});

test('ATESTADO SEM DOCUMENTO é recusado na entrada', async () => {
  // Atestado sem documento é palavra; quem decide precisa de algo em que se
  // apoiar, e é isso que o RH guarda
  const res = await solicitarAusencia({
    dataInicio: '2026-09-16',
    dataFim: '2026-09-16',
    tipo: 'atestado',
  });

  expect(res.sucesso).toBe(false);
  expect(res.erro).toContain('Anexe');
});

test('período invertido é recusado', async () => {
  // Fim antes do início percorreria o intervalo ao contrário
  const res = await solicitarAusencia({
    dataInicio: '2026-09-18',
    dataFim: '2026-09-16',
    tipo: 'falta_justificada',
  });

  expect(res.sucesso).toBe(false);
  expect(res.erro).toContain('antes do início');
});

test('um atestado de 3 dias é UMA solicitação, não três', async () => {
  // Quem aprova decide uma vez, sobre o documento inteiro
  const res = await pedirAtestado('2026-09-16', '2026-09-18');

  expect(minhasJustificativas()).toHaveLength(1);
  expect(diasCobertos(res.justificativa!)).toEqual([
    '2026-09-16',
    '2026-09-17',
    '2026-09-18',
  ]);
});

// ============================================================
// DOCUMENTO É DO RH. ESCALA É DA CADEIA.
// ============================================================

/**
 * O DEFEITO QUE ORIGINOU ESTA SEPARAÇÃO:
 *
 * A Aline mandou um atestado e a LEIGISLAINE — uma líder — recusou. Ela
 * não deveria ter podido. Atestado é documento: o líder não tem como
 * julgá-lo, e nem deveria lê-lo, porque é dado de saúde de um colega.
 */
test('o LÍDER não decide atestado, mesmo respondendo pela pessoa', async () => {
  await pedirAtestado();

  // O Chefe responde pela Ana e decide a hora extra dela — mas não isto
  logado = CHEFE;
  expect(pendenciasParaDecidir()).toHaveLength(0);
});

test('o atestado cai na fila do RH', async () => {
  await pedirAtestado();

  logado = RH;
  expect(pendenciasParaDecidir()).toHaveLength(1);
});

test('o líder que tentar decidir por fora recebe NÃO', async () => {
  /**
   * A fila esconder não basta: quem já tinha a tela aberta, ou chamar a
   * função direto, precisa esbarrar na mesma regra. Esconder o botão e
   * deixar a porta aberta não é permissão, é disfarce.
   */
  const { justificativa } = (await pedirAtestado()) as any;

  logado = CHEFE;
  const res = await decidirAusencia(justificativa.id, false, 'Não aceito');

  expect(res.sucesso).toBe(false);
  expect(res.erro).toContain('RH');
});

test('a FOLGA continua com a cadeia, e não vai para o RH', async () => {
  /**
   * Folga de sábado se decide olhando a ESCALA — quantos já estão fora
   * naquele dia — e isso quem sabe é quem toca a loja. Mandar tudo para o
   * RH teria consertado o atestado e quebrado a escala.
   */
  await solicitarAusencia({
    dataInicio: '2026-09-19',
    dataFim: '2026-09-19',
    tipo: 'folga_sabado',
  });

  logado = CHEFE;
  expect(pendenciasDeFolga()).toHaveLength(1);
});

test('a fila da cadeia é de quem responde pela pessoa, e só dele', async () => {
  await solicitarAusencia({
    dataInicio: '2026-09-19',
    dataFim: '2026-09-19',
    tipo: 'folga_sabado',
  });

  logado = CHEFE;
  expect(pendenciasDeFolga()).toHaveLength(1);

  // Gerente de outra loja não decide sobre quem não é dele
  logado = OUTRO;
  expect(pendenciasDeFolga()).toHaveLength(0);
});

test('nem o RH decide o próprio atestado', async () => {
  // A trava de não decidir sobre si mesmo vale nos dois lados da regra
  logado = RH;
  await solicitarAusencia({
    dataInicio: '2026-09-16',
    dataFim: '2026-09-16',
    tipo: 'atestado',
    anexoCaminho: 'ausencias/rh/atestado.jpg',
  });

  expect(pendenciasParaDecidir()).toHaveLength(0);
});

/**
 * QUEM LIDERA APROVA A PRÓPRIA AUSÊNCIA; QUEM NÃO LIDERA, NÃO.
 *
 * A trava caiu para quem tem gente pendurada abaixo — decisão do Elias,
 * junto com a da hora extra. E vale a mesma coisa aqui de propósito: a
 * regra vem de `podeDecidirSobre`, e não há uma segunda escrita neste
 * arquivo. Se houvesse, um dia elas discordariam.
 *
 * O tipo é FÉRIAS porque a regra é da cadeia, e férias é da cadeia —
 * planejar quem sai quando é de quem toca a loja.
 */
test('quem lidera aprova as proprias ferias', async () => {
  // O Chefe tem a Ana pendurada nele
  logado = CHEFE;
  await solicitarAusencia({
    dataInicio: '2026-09-16',
    dataFim: '2026-09-16',
    tipo: 'ferias',
  });

  // Ela aparece para ele mesmo decidir
  expect(pendenciasParaDecidir()).toHaveLength(1);

  const minha = minhasJustificativas()[0];
  const res = await decidirAusencia(minha.id, true);
  expect(res.sucesso).toBe(true);
  expect(situacaoDoDia(CHEFE.id, '2026-09-16')).toBe('ferias');
});

test('recusar EXIGE motivo', async () => {
  await pedirAtestado();
  logado = RH;
  const alvo = pendenciasParaDecidir()[0].justificativa;

  const semMotivo = await decidirAusencia(alvo.id, false);
  expect(semMotivo.sucesso).toBe(false);

  const comMotivo = await decidirAusencia(alvo.id, false, 'Documento ilegível');
  expect(comMotivo.sucesso).toBe(true);
});

// ============================================================
// O DIA SÓ MUDA DEPOIS DE APROVADO
// ============================================================

test('APROVADA: o dia deixa de ser "sem batida" e ganha situação', async () => {
  await pedirAtestado('2026-09-16', '2026-09-18');
  logado = RH;
  await decidirAusencia(pendenciasParaDecidir()[0].justificativa.id, true);

  // Todos os dias do período, inclusive as pontas
  expect(situacaoDoDia(ANA.id, '2026-09-16')).toBe('abonado_atestado');
  expect(situacaoDoDia(ANA.id, '2026-09-17')).toBe('abonado_atestado');
  expect(situacaoDoDia(ANA.id, '2026-09-18')).toBe('abonado_atestado');
  // Fora do período, não
  expect(situacaoDoDia(ANA.id, '2026-09-19')).toBe('normal');
});

test('PENDENTE não muda o dia', async () => {
  // Mudar o espelho antes de alguém decidir seria o mesmo que a hora extra
  // entrar no saldo sem aprovação
  await pedirAtestado();
  expect(situacaoDoDia(ANA.id, '2026-09-16')).toBe('normal');
});

test('RECUSADA não muda o dia', async () => {
  await pedirAtestado();
  logado = RH;
  await decidirAusencia(
    pendenciasParaDecidir()[0].justificativa.id,
    false,
    'Documento ilegível'
  );

  expect(situacaoDoDia(ANA.id, '2026-09-16')).toBe('normal');
  // E o motivo fica à vista de quem pediu, para poder corrigir
  logado = ANA;
  expect(minhasJustificativas()[0].motivoRecusa).toBe('Documento ilegível');
});

test('a ausência de um não vaza para o dia de outro', async () => {
  await pedirAtestado();
  logado = RH;
  await decidirAusencia(pendenciasParaDecidir()[0].justificativa.id, true);

  expect(situacaoDoDia(ANA.id, '2026-09-16')).toBe('abonado_atestado');
  expect(situacaoDoDia(OUTRO.id, '2026-09-16')).toBe('normal');
});

test('cada tipo vira a sua própria situação no dia', async () => {
  await solicitarAusencia({
    dataInicio: '2026-09-20',
    dataFim: '2026-09-20',
    tipo: 'falta_justificada',
  });
  // Falta justificada é documento, como o atestado: decide o RH
  logado = RH;
  await decidirAusencia(pendenciasParaDecidir()[0].justificativa.id, true);

  // Falta justificada não é abono de atestado: o espelho precisa distinguir
  expect(situacaoDoDia(ANA.id, '2026-09-20')).toBe('falta_justificada');
});


// ============================================================
// FOLGA DE SÁBADO: DIREITO MENSAL, NÃO COMPENSAÇÃO
//
// 2026-09-19 e 2026-09-26 são sábados; 2026-10-03 é sábado de outubro;
// 2026-09-16 é quarta.
// ============================================================

const pedirFolga = async (sabado: string) =>
  solicitarAusencia({ dataInicio: sabado, dataFim: sabado, tipo: 'folga_sabado' });

test('a folga só cai em SÁBADO', async () => {
  const naQuarta = await pedirFolga('2026-09-16');

  expect(naQuarta.sucesso).toBe(false);
  expect(naQuarta.erro).toContain('sábado');

  expect((await pedirFolga('2026-09-19')).sucesso).toBe(true);
});

test('a folga é de UM sábado, não de um período', async () => {
  const res = await solicitarAusencia({
    dataInicio: '2026-09-19',
    dataFim: '2026-09-26',
    tipo: 'folga_sabado',
  });

  expect(res.sucesso).toBe(false);
  expect(res.erro).toContain('um sábado só');
});

test('UMA POR MÊS: o segundo pedido do mesmo mês é recusado', async () => {
  // Sem o limite, quem pedisse primeiro levaria todos os sábados do mês
  expect((await pedirFolga('2026-09-19')).sucesso).toBe(true);

  const segunda = await pedirFolga('2026-09-26');
  expect(segunda.sucesso).toBe(false);
  expect(segunda.erro).toContain('19/09');
});

test('mês novo, direito novo', async () => {
  expect((await pedirFolga('2026-09-19')).sucesso).toBe(true);
  expect((await pedirFolga('2026-10-03')).sucesso).toBe(true);
});

test('folga RECUSADA não queima o direito do mês', async () => {
  // Senão uma recusa do gestor tiraria da pessoa o direito daquele mês
  await pedirFolga('2026-09-19');
  logado = CHEFE;
  // A folga tem fila PROPRIA: ela se julga pela escala, nao pelo documento
  await decidirAusencia(
    pendenciasDeFolga()[0].justificativa.id,
    false,
    'Sábado de balanço'
  );

  logado = ANA;
  expect((await pedirFolga('2026-09-26')).sucesso).toBe(true);
});

test('a folga precisa da autorização do gestor', async () => {
  // Não é auto-serviço: o direito é mensal, mas a data passa por quem
  // responde pela escala da loja
  await pedirFolga('2026-09-19');

  expect(situacaoDoDia(ANA.id, '2026-09-19')).toBe('normal');

  logado = CHEFE;
  // Nao aparece na fila de ausencias: folga se decide na Escala de folgas
  expect(pendenciasParaDecidir()).toHaveLength(0);
  expect(pendenciasDeFolga()).toHaveLength(1);

  await decidirAusencia(pendenciasDeFolga()[0].justificativa.id, true);
  expect(situacaoDoDia(ANA.id, '2026-09-19')).toBe('folga');
});

test('quem lidera aprova a propria folga; quem nao lidera, nao', async () => {
  logado = CHEFE;
  await pedirFolga('2026-09-19');

  // Folga tem fila própria: ela não se julga pelo documento, e sim pela
  // escala do sábado
  expect(pendenciasDeFolga()).toHaveLength(1);
  const minha = minhasJustificativas()[0];
  expect((await decidirAusencia(minha.id, true)).sucesso).toBe(true);

  /**
   * E a Ana, que não lidera ninguém, continua sem aprovar a dela. O direito
   * é de quem responde por alguém — não é de todo mundo.
   */
  logado = ANA;
  await pedirFolga('2026-09-26');
  const daAna = minhasJustificativas()[0];
  expect((await decidirAusencia(daAna.id, true)).sucesso).toBe(false);
});

test('A LISTA DE TIPOS DO BANCO BATE COM A DO CÓDIGO', async () => {
  /**
   * O defeito: a folga de sábado entrou no código e o `check` da tabela
   * continuou com os quatro tipos antigos. O banco recusava com
   * "violates check constraint justificativas_ausencia_tipo_check", e o
   * erro não diz que falta um valor na lista — diz só que a regra falhou.
   *
   * Lista fechada em dois lugares é a mesma armadilha que já mordeu este
   * sistema com os setores e com a função de primeiro acesso.
   */
  const { ROTULO_TIPO_AUSENCIA } = await import('../tipos');
  const noCodigo = Object.keys(ROTULO_TIPO_AUSENCIA).sort();

  const sql = await Bun.file(
    new URL('../../supabase/ponto-tolerancia-justificativas.sql', import.meta.url)
  ).text();

  const bloco = sql.slice(sql.indexOf('tipo            text not null check'));
  const noBanco = [...bloco.slice(0, 400).matchAll(/'([a-z_]+)'/g)]
    .map((m) => m[1])
    .filter((v) => noCodigo.includes(v) || v.includes('_') || v === 'outro')
    .sort();

  for (const tipo of noCodigo) {
    expect({ tipo, aceitoPeloBanco: noBanco.includes(tipo) }).toEqual({
      tipo,
      aceitoPeloBanco: true,
    });
  }

  /**
   * E O ESTADO FINAL, depois de rodar tudo na ordem do documento.
   *
   * Antes esta parte cobrava um arquivo fixo (`folga-sabado.sql`). Errado:
   * arquivo de migração é histórico — o que ele aceitava na época dele não
   * muda, e não deve mudar. Quando "férias" entrou por um arquivo novo, o
   * teste acusou o arquivo velho por não adivinhar o futuro.
   *
   * O que importa de verdade é outra coisa: rodando os arquivos NA ORDEM
   * DO DOCUMENTO, o último que redefine a restrição precisa aceitar todos
   * os tipos do código. É esse o estado em que o banco do Elias termina.
   */
  const operacao = await Bun.file(
    new URL('../../docs/OPERACAO.md', import.meta.url)
  ).text();

  // A ordem de execução sai da própria tabela do documento
  const ordem = [...operacao.matchAll(/\|\s*\d+\s*\|\s*`([^`]+\.sql)`/g)].map((m) => m[1]);
  expect(ordem.length).toBeGreaterThan(5);

  let ultimaLista: string[] | null = null;
  let ultimoArquivo = '';

  for (const arquivo of ordem) {
    const conteudo = await Bun.file(
      new URL(`../../supabase/${arquivo}`, import.meta.url)
    ).text();

    /**
     * A DEFINIÇÃO, e não a citação.
     *
     * O nome da restrição também aparece na consulta de conferência, no
     * fim do arquivo. Procurar a última ocorrência do NOME achava a
     * conferência e concluía que o arquivo não define nada.
     */
    const definicoes = [
      ...conteudo.matchAll(
        /add constraint\s+justificativas_ausencia_tipo_check[\s\S]{0,300}?tipo in \(([^)]*)\)/g
      ),
    ];
    if (definicoes.length === 0) continue;

    const lista = definicoes[definicoes.length - 1][1];
    ultimaLista = [...lista.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
    ultimoArquivo = arquivo;
  }

  expect(ultimaLista).not.toBeNull();

  for (const tipo of noCodigo) {
    expect({ arquivo: ultimoArquivo, tipo, aceito: ultimaLista!.includes(tipo) }).toEqual({
      arquivo: ultimoArquivo,
      tipo,
      aceito: true,
    });
  }
});

// ============================================================
// A LIDERANÇA MONTA A ESCALA, SEM ESPERAR PEDIDO
// ============================================================

/** O próximo sábado a partir de uma data, em AAAA-MM-DD. */
const proximoSabado = (base = new Date(2026, 8, 1)): string => {
  const d = new Date(base);
  while (d.getDay() !== 6) d.setDate(d.getDate() + 1);
  const dois = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${dois(d.getMonth() + 1)}-${dois(d.getDate())}`;
};

test('O QUE A LIDERANÇA LANÇA JÁ NASCE APROVADO', async () => {
  /**
   * Fechar os sábados do mês e montar as férias do semestre é trabalho de
   * quem organiza a equipe — não existe pedido do colaborador para
   * responder. Criar pendente e aprovar em seguida seria teatro, e
   * encheria a escala de linhas amarelas que ninguém precisa decidir.
   */
  logado = CHEFE;

  const res = await lancarAusenciaPelaLideranca({
    colaboradorId: ANA.id,
    dataInicio: '2026-10-05',
    dataFim: '2026-10-19',
    tipo: 'ferias',
  });

  expect(res.sucesso).toBe(true);
  expect(res.justificativa!.estado).toBe('aprovada');
  // Com o nome de quem lançou: escala sem autoria não se cobra de ninguém
  expect(res.justificativa!.aprovadorNome).toBe('Chefe');
  expect(res.justificativa!.decididoEm).toBeTruthy();
});

test('A LIDERANÇA SÓ ESCALA QUEM RESPONDE A ELA', async () => {
  /**
   * A mesma regra do aprovar. Uma segunda aqui divergiria, e o gerente
   * acabaria marcando férias de gente de outra loja.
   */
  logado = CHEFE;

  const res = await lancarAusenciaPelaLideranca({
    colaboradorId: OUTRO.id,
    dataInicio: '2026-10-05',
    dataFim: '2026-10-09',
    tipo: 'ferias',
  });

  expect(res.sucesso).toBe(false);
  expect(res.erro).toContain('não responde por esta pessoa');
});

test('O LIMITE DE UMA FOLGA POR MÊS VALE TAMBÉM PARA A LIDERANÇA', async () => {
  /**
   * O limite existe para o direito ser igual para todos, e não para
   * conter quem pede demais. Afrouxá-lo para quem escala desfaria
   * justamente isso.
   */
  logado = CHEFE;
  const sabado = proximoSabado();

  const primeira = await lancarAusenciaPelaLideranca({
    colaboradorId: ANA.id, dataInicio: sabado, dataFim: sabado, tipo: 'folga_sabado',
  });
  expect(primeira.sucesso).toBe(true);

  // Outro sábado do MESMO mês
  const [a, m, d] = sabado.split('-').map(Number);
  const outro = new Date(a, m - 1, d + 7);
  const dois = (n: number) => String(n).padStart(2, '0');
  const sabadoSeguinte = `${outro.getFullYear()}-${dois(outro.getMonth() + 1)}-${dois(outro.getDate())}`;

  if (sabadoSeguinte.slice(0, 7) === sabado.slice(0, 7)) {
    const segunda = await lancarAusenciaPelaLideranca({
      colaboradorId: ANA.id, dataInicio: sabadoSeguinte, dataFim: sabadoSeguinte, tipo: 'folga_sabado',
    });
    expect(segunda.sucesso).toBe(false);
    expect(segunda.erro).toContain('já tem folga');
  }
});

test('folga lançada pela liderança continua caindo só em sábado', async () => {
  logado = CHEFE;

  const res = await lancarAusenciaPelaLideranca({
    colaboradorId: ANA.id,
    dataInicio: '2026-10-07', // quarta-feira
    dataFim: '2026-10-07',
    tipo: 'folga_sabado',
  });

  expect(res.sucesso).toBe(false);
  expect(res.erro).toContain('sábado');
});

test('QUEM LIDERA LANÇA AS PRÓPRIAS FÉRIAS', async () => {
  /**
   * A líder abria a escala e via só a subordinada, sem ter por onde
   * marcar as férias dela mesma.
   *
   * A regra já existia: quem responde por alguém decide a própria
   * jornada. A escala é que se excluía à mão, com um filtro escrito
   * quando ninguém decidia sobre si — e que ficou para trás quando a
   * regra mudou.
   */
  logado = CHEFE;

  const res = await lancarAusenciaPelaLideranca({
    colaboradorId: CHEFE.id,
    dataInicio: '2026-11-03',
    dataFim: '2026-11-17',
    tipo: 'ferias',
  });

  expect(res.sucesso).toBe(true);
  expect(res.justificativa!.colaboradorId).toBe(CHEFE.id);
  expect(res.justificativa!.estado).toBe('aprovada');
});

test('QUEM NÃO RESPONDE POR NINGUÉM NÃO LANÇA AS PRÓPRIAS', async () => {
  /**
   * O outro lado, e é ele que impede a escala de virar autoatendimento:
   * a Ana não tem ninguém pendurado nela, então as férias dela são
   * decididas por quem responde por ela.
   */
  logado = ANA;

  const res = await lancarAusenciaPelaLideranca({
    colaboradorId: ANA.id,
    dataInicio: '2026-11-03',
    dataFim: '2026-11-17',
    tipo: 'ferias',
  });

  expect(res.sucesso).toBe(false);
  expect(res.erro).toContain('não responde por esta pessoa');
});
