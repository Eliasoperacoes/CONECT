/**
 * Verificação do ponto ligado ao banco — CONECTA
 *
 * O que está sendo provado aqui é a afirmação do dono do sistema: o banco de
 * horas pertence à PESSOA, não ao aparelho. Celular e computador têm que
 * chegar no mesmo lugar.
 */
import { test, expect, mock, beforeEach, setSystemTime } from 'bun:test';

// --- Armazenamento falso do navegador ---
class ArmazenamentoFalso {
  private dados = new Map<string, string>();
  getItem(k: string) { return this.dados.has(k) ? this.dados.get(k)! : null; }
  setItem(k: string, v: string) { this.dados.set(k, String(v)); }
  removeItem(k: string) { this.dados.delete(k); }
  clear() { this.dados.clear(); }
}

const armazenamento = new ArmazenamentoFalso();
(globalThis as any).localStorage = armazenamento;

const ELIAS = {
  id: 'colab-elias', nome: 'Elias', login: 'elias', cargo: 'Diretor',
  setor: 'TI', loja: 'Pirassununga', nivel: 5, foto: '', presenca: 'online',
  vistoPorUltimo: 'Agora', cargaHorariaDiariaMinutos: 480, ativo: true,
  criadoEm: new Date().toISOString(),
};

const ANA = { ...ELIAS, id: 'colab-ana', nome: 'Ana', login: 'ana', nivel: 1, setor: 'Vendas', cargo: 'Vendedora' };

// --- Estado do "banco" simulado ---
let modoNuvem = true;
let bancoRegistros: any[] = [];
let bancoCodigos: any[] = [];
let bancoAjustes: any[] = [];
let sincronizacoes = 0;

mock.module('./supabase', () => ({
  usandoNuvem: () => modoNuvem,
  supabase: null,
}));

let colaboradorLogado: any = ELIAS;
/** Equipe visível ao serviço; cada teste monta a sua. */
let equipe: any[] = [ELIAS, ANA];

mock.module('./bancoDados', () => ({
  bancoDados: {
    obterColaboradorAtual: () => colaboradorLogado,
    obterColaboradorPorId: (id: string) => equipe.find((c) => c.id === id),
    obterColaboradores: () => equipe,
    estaAutenticado: () => true,
    registrarAuditoria: () => {},
    assinarAlteracoes: () => () => {},
    /**
     * A tolerância diária sai daqui. Cada teste pode trocá-la para provar
     * os dois lados da faixa sem depender do padrão da rede.
     */
    obterConfiguracoes: () => ({ toleranciaPontoMinutos: toleranciaDoTeste }),
  },
}));

/** Tolerância em vigor durante o teste. Reposta no beforeEach. */
let toleranciaDoTeste = 10;

const CHAVE_REGISTROS = 'conecta_v4_registros_ponto';
const CHAVE_CODIGOS = 'conecta_v4_codigos_ponto_loja';

mock.module('./nuvem', () => ({
  nuvem: {
    assinarAtualizacoes: () => () => {},
    // Espelha o banco simulado no cache, como faz a ponte de verdade
    sincronizarPonto: async () => {
      sincronizacoes++;
      armazenamento.setItem(CHAVE_REGISTROS, JSON.stringify(bancoRegistros));
      armazenamento.setItem(CHAVE_CODIGOS, JSON.stringify(bancoCodigos));
      return true;
    },
    salvarRegistroPonto: async (r: any) => {
      const choque = bancoRegistros.some(
        (x) => x.colaboradorId === r.colaboradorId && x.data === r.data && x.tipo === r.tipo
      );
      if (choque) return { sucesso: false, duplicado: true };
      bancoRegistros.push({ ...r });
      return { sucesso: true };
    },
    salvarAjustePonto: async (r: any) => {
      const i = bancoRegistros.findIndex(
        (x) => x.colaboradorId === r.colaboradorId && x.data === r.data && x.tipo === r.tipo
      );
      if (i !== -1) bancoRegistros[i] = { ...r };
      else bancoRegistros.push({ ...r });
      return { sucesso: true };
    },
    removerRegistroPonto: async (id: string) => {
      bancoRegistros = bancoRegistros.filter((x) => x.id !== id);
      return { sucesso: true };
    },
    salvarCodigoPonto: async (c: any) => {
      bancoCodigos = bancoCodigos.filter((x) => x.loja !== c.loja);
      bancoCodigos.push({ ...c });
      return { sucesso: true };
    },
    // --- Apuração do dia e aprovação ---
    sincronizarAjustes: async () => true,
    salvarAjuste: async (a: any) => {
      bancoAjustes = bancoAjustes.filter((x) => x.id !== a.id);
      bancoAjustes.push({ ...a });
      return { sucesso: true };
    },
    decidirAjuste: async (id: string, estado: string, aprovador: any, observacao?: string) => {
      const i = bancoAjustes.findIndex((x) => x.id === id);
      if (i === -1) return { sucesso: false, erro: 'nao encontrado' };
      bancoAjustes[i] = {
        ...bancoAjustes[i],
        estado,
        aprovadorId: aprovador.id,
        aprovadorNome: aprovador.nome,
        observacao,
      };
      return { sucesso: true };
    },
    provisionarCodigosPonto: async (lista: any[]) => {
      // Só o RH passa pela RLS
      // RH, Diretoria e TI cuidam de pessoas — a mesma regra do banco
      if (!(colaboradorLogado.nivel >= 4 || colaboradorLogado.setor === 'RH')) return false;
      lista.forEach((c) => {
        if (!bancoCodigos.some((x) => x.loja === c.loja)) bancoCodigos.push({ ...c });
      });
      return true;
    },
  },
}));

const { servicoPonto, dataDeHoje } = await import(
  './ponto'
);

beforeEach(() => {
  armazenamento.clear();
  bancoRegistros = [];
  bancoCodigos = [];
  bancoAjustes = [];
  sincronizacoes = 0;
  modoNuvem = true;
  colaboradorLogado = ELIAS;
  equipe = [ELIAS, ANA];
  toleranciaDoTeste = 10;

  /**
   * O RELÓGIO É FIXADO NUMA QUARTA-FEIRA.
   *
   * Sem isto a suíte mudava de resultado conforme o dia em que fosse
   * rodada, e FALHAVA TODO SÁBADO: no sábado não há intervalo, então a
   * segunda batida do dia é a saída, e não a saída para o almoço. Quatro
   * testes quebravam sozinhos, sem nada ter mudado no código.
   *
   * Teste que depende do calendário não prova nada dois dias por semana —
   * e, pior, faz duvidar do código quando o defeito é dele mesmo.
   */
  setSystemTime(new Date(2026, 8, 16, 9, 0, 0));
});

// ============================================================
// O CÓDIGO DO CARTAZ NÃO PODE NASCER NO APARELHO DE QUEM BATE
// ============================================================

test('modo rede: aparelho sem código publicado não inventa um', () => {
  expect(servicoPonto.obterCodigoDaLoja('Pirassununga')).toBeNull();
  expect(servicoPonto.obterTodosCodigos()).toHaveLength(0);
  expect(servicoPonto.montarConteudoQr('Pirassununga')).toBeNull();
});

test('modo rede: colaborador comum não consegue publicar código', async () => {
  colaboradorLogado = ANA;
  await servicoPonto.garantirCodigosDasLojas();
  expect(bancoCodigos).toHaveLength(0);
  expect(servicoPonto.obterTodosCodigos()).toHaveLength(0);
});

test('modo rede: RH publica o código das cinco lojas, uma vez só', async () => {
  await servicoPonto.garantirCodigosDasLojas();
  expect(bancoCodigos).toHaveLength(5);

  const antes = bancoCodigos.map((c) => c.codigo).join();
  await servicoPonto.garantirCodigosDasLojas();
  expect(bancoCodigos).toHaveLength(5);
  expect(bancoCodigos.map((c) => c.codigo).join()).toBe(antes);
});

test('modo local: o código continua nascendo sozinho, como antes', () => {
  modoNuvem = false;
  const codigo = servicoPonto.obterCodigoDaLoja('Descalvado');
  expect(codigo).not.toBeNull();
  expect(codigo!.codigo).toHaveLength(6);
  expect(servicoPonto.obterTodosCodigos()).toHaveLength(5);
});

// ============================================================
// O BANCO DE HORAS É DA PESSOA, NÃO DO APARELHO
// ============================================================

const publicarCodigos = async () => {
  await servicoPonto.garantirCodigosDasLojas();
  return bancoCodigos.find((c) => c.loja === 'Pirassununga')!.codigo;
};

test('a batida vai para o banco, não só para o aparelho', async () => {
  const codigo = await publicarCodigos();
  const res = await servicoPonto.registrarMarcacaoPorCodigo(codigo);

  expect(res.sucesso).toBe(true);
  expect(res.registro!.tipo).toBe('entrada');
  expect(bancoRegistros).toHaveLength(1);
  expect(bancoRegistros[0].colaboradorId).toBe('colab-elias');
});

test('CELULAR E COMPUTADOR: o segundo aparelho continua a jornada, não recomeça', async () => {
  const codigo = await publicarCodigos();

  // Aparelho 1: bate a entrada
  await servicoPonto.registrarMarcacaoPorCodigo(codigo);
  expect(bancoRegistros).toHaveLength(1);

  // Aparelho 2: cache vazio, como quem abre o sistema pela primeira vez ali
  armazenamento.setItem(CHAVE_REGISTROS, JSON.stringify([]));

  const res = await servicoPonto.registrarMarcacaoPorCodigo(codigo);
  expect(res.sucesso).toBe(true);
  // Se o ponto fosse do aparelho, isto voltaria 'entrada' de novo
  expect(res.registro!.tipo).toBe('saida_almoco');
  expect(bancoRegistros).toHaveLength(2);
});

test('a jornada inteira fecha na ordem certa mesmo trocando de aparelho', async () => {
  const codigo = await publicarCodigos();
  const tipos: string[] = [];

  for (let i = 0; i < 4; i++) {
    armazenamento.setItem(CHAVE_REGISTROS, JSON.stringify([])); // troca de aparelho
    const res = await servicoPonto.registrarMarcacaoPorCodigo(codigo);
    tipos.push(res.registro!.tipo);
  }

  expect(tipos).toEqual(['entrada', 'saida_almoco', 'retorno_almoco', 'saida']);

  armazenamento.setItem(CHAVE_REGISTROS, JSON.stringify([]));
  const extra = await servicoPonto.registrarMarcacaoPorCodigo(codigo);
  expect(extra.sucesso).toBe(false);
  expect(extra.erro).toContain('já está completa');
});

test('batida repetida vinda de outro aparelho é recusada pelo banco', async () => {
  const codigo = await publicarCodigos();

  // O banco já tem a entrada, mas este aparelho não ficou sabendo...
  bancoRegistros.push({
    id: 'r1', colaboradorId: 'colab-elias', data: dataDeHoje(), tipo: 'entrada',
    horario: new Date().toISOString(), horaFormatada: '08:00',
    metodo: 'qrcode', loja: 'Pirassununga', criadoEm: new Date().toISOString(),
  });

  // ...e o sincronismo antes da batida é justamente o que evita o engano
  const res = await servicoPonto.registrarMarcacaoPorCodigo(codigo);
  expect(res.sucesso).toBe(true);
  expect(res.registro!.tipo).toBe('saida_almoco');
  expect(bancoRegistros).toHaveLength(2);
});

test('o saldo acumulado segue a pessoa, não o aparelho', async () => {
  const codigo = await publicarCodigos();
  const hoje = dataDeHoje();

  const base = (tipo: string, hora: string) => ({
    id: `r-${tipo}`, colaboradorId: 'colab-elias', data: hoje, tipo,
    horario: new Date(`${hoje}T${hora}:00`).toISOString(), horaFormatada: hora,
    metodo: 'qrcode', loja: 'Pirassununga', criadoEm: new Date().toISOString(),
  });

  bancoRegistros = [
    base('entrada', '08:00'), base('saida_almoco', '12:00'),
    base('retorno_almoco', '13:00'), base('saida', '18:00'),
  ];

  // Aparelho novo, cache zerado
  armazenamento.setItem(CHAVE_REGISTROS, JSON.stringify([]));
  expect(servicoPonto.obterSaldoAcumulado('colab-elias')).toBe(0);

  // Depois de sincronizar, a jornada aparece: das 8h às 18h com 1h de almoço
  // = 9h, uma hora acima da jornada contratada de 8h
  await servicoPonto.registrarMarcacaoPorCodigo(codigo).catch(() => {});
  const jornada = servicoPonto.obterJornadaDoDia('colab-elias', hoje);
  expect(jornada.minutosTrabalhados).toBe(540);
  expect(jornada.minutosIntervalo).toBe(60);
  expect(jornada.saldoMinutos).toBe(60);
  expect(jornada.completa).toBe(true);

  // Mas a hora extra NÃO vira saldo sozinha: falta alguém aprovar
  expect(servicoPonto.obterSaldoApuradoPelasBatidas('colab-elias')).toBe(60);
  expect(servicoPonto.obterSaldoAcumulado('colab-elias')).toBe(0);
});

test('código não publicado não bate ponto', async () => {
  await publicarCodigos();
  const res = await servicoPonto.registrarMarcacaoPorCodigo('ZZ9ZZ9');
  expect(res.sucesso).toBe(false);
  expect(res.erro).toContain('não reconhecido');
  expect(bancoRegistros).toHaveLength(0);
});

test('conta desativada não bate ponto', async () => {
  const codigo = await publicarCodigos();
  colaboradorLogado = { ...ANA, ativo: false };
  const res = await servicoPonto.registrarMarcacaoPorCodigo(codigo);
  expect(res.sucesso).toBe(false);
  expect(res.erro).toContain('desativada');
});

// ============================================================
// LADO DO RH
// ============================================================

test('ajuste do RH grava no banco e fica marcado como ajuste', async () => {
  const hoje = dataDeHoje();
  const res = await servicoPonto.ajustarMarcacao({
    colaboradorId: 'colab-ana', data: hoje, tipo: 'entrada',
    hora: '08:15', justificativa: 'Esqueceu de bater',
  });

  expect(res.sucesso).toBe(true);
  expect(bancoRegistros).toHaveLength(1);
  expect(bancoRegistros[0].metodo).toBe('ajuste_rh');
  expect(bancoRegistros[0].ajustadoPorNome).toBe('Elias');
  expect(bancoRegistros[0].justificativa).toBe('Esqueceu de bater');
});

test('ajuste corrige a marcação existente em vez de criar uma segunda', async () => {
  const hoje = dataDeHoje();
  bancoRegistros.push({
    id: 'r1', colaboradorId: 'colab-ana', data: hoje, tipo: 'entrada',
    horario: new Date(`${hoje}T09:30:00`).toISOString(), horaFormatada: '09:30',
    metodo: 'qrcode', loja: 'Pirassununga', criadoEm: new Date().toISOString(),
  });

  await servicoPonto.ajustarMarcacao({
    colaboradorId: 'colab-ana', data: hoje, tipo: 'entrada',
    hora: '08:00', justificativa: 'Relógio do celular atrasado',
  });

  expect(bancoRegistros).toHaveLength(1);
  expect(bancoRegistros[0].horaFormatada).toBe('08:00');
});

test('colaborador comum não ajusta nem remove marcação', async () => {
  colaboradorLogado = ANA;
  const r1 = await servicoPonto.ajustarMarcacao({
    colaboradorId: 'colab-ana', data: dataDeHoje(), tipo: 'entrada',
    hora: '08:00', justificativa: 'tentativa',
  });
  expect(r1.sucesso).toBe(false);
  // Ana não responde por ninguém — nem por si mesma. Corrigir o próprio
  // ponto seria o fim do controle.
  expect(r1.erro).toContain('quem responde por esta pessoa');

  const r2 = await servicoPonto.removerMarcacao('r1', 'tentativa');
  expect(r2.sucesso).toBe(false);
  expect(bancoRegistros).toHaveLength(0);
});

test('ajuste sem justificativa é recusado', async () => {
  const res = await servicoPonto.ajustarMarcacao({
    colaboradorId: 'colab-ana', data: dataDeHoje(), tipo: 'entrada',
    hora: '08:00', justificativa: '   ',
  });
  expect(res.sucesso).toBe(false);
  expect(res.erro).toContain('justificativa');
});

test('remoção do RH tira a marcação do banco', async () => {
  const hoje = dataDeHoje();
  await servicoPonto.ajustarMarcacao({
    colaboradorId: 'colab-ana', data: hoje, tipo: 'entrada',
    hora: '08:00', justificativa: 'lançamento',
  });
  expect(bancoRegistros).toHaveLength(1);

  const id = bancoRegistros[0].id;
  const res = await servicoPonto.removerMarcacao(id, 'lançado por engano');
  expect(res.sucesso).toBe(true);
  expect(bancoRegistros).toHaveLength(0);
});

test('novo código do RH sobe para o banco e invalida o anterior', async () => {
  await publicarCodigos();
  const antigo = bancoCodigos.find((c) => c.loja === 'Palmeiras')!.codigo;

  const res = await servicoPonto.regenerarCodigoDaLoja('Palmeiras');
  expect(res.sucesso).toBe(true);

  const novo = bancoCodigos.find((c) => c.loja === 'Palmeiras')!.codigo;
  expect(novo).not.toBe(antigo);
  expect(bancoCodigos.filter((c) => c.loja === 'Palmeiras')).toHaveLength(1);
  expect(res.codigo!.atualizadoPorNome).toBe('Elias');
});

test('colaborador comum não gera código novo', async () => {
  await publicarCodigos();
  colaboradorLogado = ANA;

  // Nem de outra loja...
  const res = await servicoPonto.regenerarCodigoDaLoja('Palmeiras');
  expect(res.sucesso).toBe(false);
  expect(res.erro).toBeTruthy();

  // ...NEM DA PRÓPRIA. O cartaz nasce no banco pela mão de quem responde
  // pela loja; se quem bate ponto pudesse trocá-lo, o código deixaria de
  // provar que a pessoa estava lá.
  const naPropria = await servicoPonto.regenerarCodigoDaLoja(ANA.loja as any);
  expect(naPropria.sucesso).toBe(false);
  expect(servicoPonto.lojasComQrQuePosso(ANA as any)).toHaveLength(0);
});

// ============================================================
// ALCANCE DE CADA NÍVEL NO BANCO DE HORAS
// ============================================================

/** Equipe montada para exercitar o alcance: duas lojas, três setores. */
const MARIA_COMPRAS_MATRIZ = {
  ...ANA, id: 'colab-maria', nome: 'Maria', login: 'maria',
  nivel: 2, setor: 'Compras', loja: 'Pirassununga', cargo: 'Líder de Compras',
};
const JOAO_COMPRAS_FILIAL = {
  ...ANA, id: 'colab-joao', nome: 'João', login: 'joao',
  nivel: 1, setor: 'Compras', loja: 'Porto Ferreira', cargo: 'Comprador',
};
const PEDRO_BALCAO_MATRIZ = {
  ...ANA, id: 'colab-pedro', nome: 'Pedro', login: 'pedro',
  nivel: 1, setor: 'Balcão', loja: 'Pirassununga', cargo: 'Balconista',
};
const CARLA_GERENTE_FILIAL = {
  ...ANA, id: 'colab-carla', nome: 'Carla', login: 'carla',
  nivel: 3, setor: 'Balcão', loja: 'Porto Ferreira', cargo: 'Gerente',
};

const comEquipeCompleta = (quem: any) => {
  equipe = [ELIAS, ANA, MARIA_COMPRAS_MATRIZ, JOAO_COMPRAS_FILIAL, PEDRO_BALCAO_MATRIZ, CARLA_GERENTE_FILIAL];
  colaboradorLogado = quem;
};

/**
 * QUEM MANDA É O ORGANOGRAMA, E SÓ ELE.
 *
 * Havia uma regra automática por trás: líder de setor alcançava TODO o
 * setor, gerente alcançava a loja inteira. Ela existia como rede de
 * segurança para quem ainda não tinha sido posicionado na cadeia.
 *
 * O efeito prático era outro, e foi o que o Elias viu na tela: a líder de
 * Compras recebia para aprovar horas de gente que não é dela, só por
 * dividirem o setor. A cadeia dizia uma coisa e a fila mostrava outra.
 */
test('LIDER SO ALCANCA QUEM ESTA PENDURADO NELE', () => {
  // João é de Compras como a Maria, e na cadeia NÃO é dela
  comEquipeCompleta(MARIA_COMPRAS_MATRIZ);

  const nomes = servicoPonto.obterColaboradoresVisiveis().map((c) => c.nome).sort();

  // Só ela mesma: dividir o setor não é responder por alguém
  expect(nomes).toEqual(['Maria']);
  expect(nomes).not.toContain('João');
});

test('com o organograma montado, o lider alcanca quem e dele', () => {
  equipe = [
    ELIAS,
    ANA,
    { ...JOAO_COMPRAS_FILIAL, responsavelId: MARIA_COMPRAS_MATRIZ.id },
    MARIA_COMPRAS_MATRIZ,
    PEDRO_BALCAO_MATRIZ,
  ];
  colaboradorLogado = MARIA_COMPRAS_MATRIZ;

  const nomes = servicoPonto.obterColaboradoresVisiveis().map((c) => c.nome).sort();

  // Agora sim: a cadeia diz que o João é dela
  expect(nomes).toEqual(['João', 'Maria']);
  expect(nomes).not.toContain('Pedro');
});

test('gerente tambem so alcanca quem esta pendurado nele', () => {
  /**
   * Antes ele pegava a loja inteira. Um gerente que não posicionou ninguém
   * na cadeia não recebe ninguém — e quem ficou de fora cai para RH, que
   * enxerga a rede e pode consertar o organograma.
   */
  comEquipeCompleta(CARLA_GERENTE_FILIAL);

  const nomes = servicoPonto.obterColaboradoresVisiveis().map((c) => c.nome).sort();

  expect(nomes).toEqual(['Carla']);
  expect(nomes).not.toContain('João');
});

test('colaborador comum vê só o próprio ponto', () => {
  comEquipeCompleta(PEDRO_BALCAO_MATRIZ);
  expect(servicoPonto.obterColaboradoresVisiveis().map((c) => c.nome)).toEqual(['Pedro']);
});

test('TI enxerga a rede inteira', () => {
  comEquipeCompleta(ELIAS);
  expect(servicoPonto.obterColaboradoresVisiveis()).toHaveLength(6);
});

// ============================================================
// SEM PULAR ETAPAS: bate o ponto → líder ou gerente decide → banco de horas
// ============================================================

/** Fecha a jornada de alguém num dia, com a duração pedida. */
const fecharJornada = async (quem: any, data: string, entrada: string, saida: string) => {
  const marcar = (tipo: string, hora: string) => ({
    id: `r-${quem.id}-${tipo}`, colaboradorId: quem.id, data, tipo,
    horario: new Date(`${data}T${hora}:00`).toISOString(), horaFormatada: hora,
    metodo: 'qrcode', loja: quem.loja, criadoEm: new Date().toISOString(),
  });
  bancoRegistros.push(
    marcar('entrada', entrada), marcar('saida_almoco', '12:00'),
    marcar('retorno_almoco', '13:00'), marcar('saida', saida)
  );
  armazenamento.setItem(CHAVE_REGISTROS, JSON.stringify(bancoRegistros));
  await servicoPonto.apurarDia(quem.id, data);
};

/**
 * A CADEIA É MONTADA NO FIXTURE, e não deduzida de setor e loja.
 *
 * Antes bastava dividir o setor: a líder alcançava o Pedro por serem os
 * dois do Balcão. Isso acabou — quem manda é o organograma, e por isso o
 * `responsavelId` aparece aqui. É como a rede vai funcionar de verdade.
 */
const PEDRO = {
  ...ANA, id: 'colab-pedro', nome: 'Pedro', login: 'pedro',
  nivel: 1, setor: 'Balcão', loja: 'Pirassununga', cargo: 'Balconista',
  responsavelId: 'colab-lider',
};
const LIDER_BALCAO = {
  ...ANA, id: 'colab-lider', nome: 'Sônia', login: 'sonia',
  nivel: 2, setor: 'Balcão', loja: 'Pirassununga', cargo: 'Líder de Balcão',
  responsavelId: 'colab-gerente',
};
const GERENTE = {
  ...ANA, id: 'colab-gerente', nome: 'Carla', login: 'carla',
  nivel: 3, setor: 'Balcão', loja: 'Pirassununga', cargo: 'Gerente',
};
const OUTRA_LOJA = {
  ...ANA, id: 'colab-outro', nome: 'Rui', login: 'rui',
  nivel: 3, setor: 'Balcão', loja: 'Descalvado', cargo: 'Gerente',
};

const montarEquipe = (logado: any) => {
  equipe = [ELIAS, ANA, PEDRO, LIDER_BALCAO, GERENTE, OUTRA_LOJA];
  colaboradorLogado = logado;
};

test('HORA EXTRA VIRA PENDÊNCIA, não saldo', async () => {
  montarEquipe(PEDRO);
  await fecharJornada(PEDRO, '2026-09-16', '08:00', '18:00'); // 10h de janela - 1h de almoço = 9h

  const ajuste = servicoPonto.obterAjusteDoDia(PEDRO.id, '2026-09-16');
  expect(ajuste).not.toBeNull();
  expect(ajuste!.tipo).toBe('hora_extra');
  expect(ajuste!.minutos).toBe(60);
  expect(ajuste!.estado).toBe('pendente');

  // O passo que falta é a decisão — sem ela, o banco de horas não mexe
  expect(servicoPonto.obterSaldoAcumulado(PEDRO.id)).toBe(0);
  expect(servicoPonto.obterSaldoPendente(PEDRO.id)).toBe(60);
});

test('SAÍDA MAIS CEDO vira pendência de débito', async () => {
  montarEquipe(PEDRO);
  await fecharJornada(PEDRO, '2026-09-16', '08:00', '16:00'); // 8h - 1h = 7h

  const ajuste = servicoPonto.obterAjusteDoDia(PEDRO.id, '2026-09-16');
  expect(ajuste!.tipo).toBe('debito');
  expect(ajuste!.minutos).toBe(60);
  expect(servicoPonto.obterSaldoPendente(PEDRO.id)).toBe(-60);
});

test('dia que bate certo não enche a fila de ninguém', async () => {
  montarEquipe(PEDRO);
  await fecharJornada(PEDRO, '2026-09-16', '08:00', '17:00'); // 9h - 1h = 8h

  expect(servicoPonto.obterAjusteDoDia(PEDRO.id, '2026-09-16')).toBeNull();
  expect(bancoAjustes).toHaveLength(0);
});

test('APROVADO: aí sim entra no banco de horas', async () => {
  montarEquipe(PEDRO);
  await fecharJornada(PEDRO, '2026-09-16', '08:00', '18:00');
  const ajuste = servicoPonto.obterAjusteDoDia(PEDRO.id, '2026-09-16')!;

  colaboradorLogado = LIDER_BALCAO;
  const res = await servicoPonto.decidirAjuste(ajuste.id, true);

  expect(res.sucesso).toBe(true);
  expect(servicoPonto.obterSaldoAcumulado(PEDRO.id)).toBe(60);
  expect(servicoPonto.obterSaldoPendente(PEDRO.id)).toBe(0);
});

test('RECUSADO: não entra, e o motivo é obrigatório', async () => {
  montarEquipe(PEDRO);
  await fecharJornada(PEDRO, '2026-09-16', '08:00', '18:00');
  const ajuste = servicoPonto.obterAjusteDoDia(PEDRO.id, '2026-09-16')!;

  colaboradorLogado = LIDER_BALCAO;

  const semMotivo = await servicoPonto.decidirAjuste(ajuste.id, false);
  expect(semMotivo.sucesso).toBe(false);
  expect(semMotivo.erro).toContain('motivo');

  const comMotivo = await servicoPonto.decidirAjuste(ajuste.id, false, 'Não foi autorizada');
  expect(comMotivo.sucesso).toBe(true);
  expect(servicoPonto.obterSaldoAcumulado(PEDRO.id)).toBe(0);
});

/**
 * QUEM LIDERA APROVA AS PRÓPRIAS HORAS.
 *
 * Era "ninguém decide sobre a própria hora, em hipótese alguma". Mudou por
 * decisão do Elias.
 *
 * "Quem lidera" é quem tem gente pendurada abaixo no organograma — não é
 * cargo nem nível. Um líder sem ninguém sob ele continua sendo subordinado
 * como qualquer outro.
 */
test('QUEM LIDERA APROVA AS PROPRIAS HORAS', async () => {
  montarEquipe(LIDER_BALCAO);
  await fecharJornada(LIDER_BALCAO, '2026-09-16', '08:00', '18:00');
  const ajuste = servicoPonto.obterAjusteDoDia(LIDER_BALCAO.id, '2026-09-16')!;

  // A líder tem o Pedro pendurado nela: decide sobre si mesma
  const res = await servicoPonto.decidirAjuste(ajuste.id, true);
  expect(res.sucesso).toBe(true);
  expect(servicoPonto.obterSaldoAcumulado(LIDER_BALCAO.id)).toBe(60);

  // Quem decide sobre a líder é a gerente
  colaboradorLogado = GERENTE;
  expect(servicoPonto.podeDecidirSobre(LIDER_BALCAO as any)).toBe(true);
  const pelaGerente = await servicoPonto.decidirAjuste(ajuste.id, true);
  expect(pelaGerente.sucesso).toBe(true);
});

test('gerente de outra loja não decide sobre quem não é dele', async () => {
  montarEquipe(PEDRO);
  await fecharJornada(PEDRO, '2026-09-16', '08:00', '18:00');
  const ajuste = servicoPonto.obterAjusteDoDia(PEDRO.id, '2026-09-16')!;

  colaboradorLogado = OUTRA_LOJA;
  expect(servicoPonto.podeDecidirSobre(PEDRO as any)).toBe(false);

  const res = await servicoPonto.decidirAjuste(ajuste.id, true);
  expect(res.sucesso).toBe(false);
  expect(res.erro).toContain('não responde por esta pessoa');
});

test('a fila mostra só quem eu respondo', async () => {
  montarEquipe(PEDRO);
  await fecharJornada(PEDRO, '2026-09-16', '08:00', '18:00');
  await fecharJornada(LIDER_BALCAO, '2026-09-16', '08:00', '18:00');

  // A líder vê o Pedro (pendurado nela) E a si mesma, porque lidera
  colaboradorLogado = LIDER_BALCAO;
  const filaDaLider = servicoPonto.obterPendenciasParaDecidir();
  expect(filaDaLider.map((p) => p.colaborador.nome).sort()).toEqual(['Pedro', 'Sônia']);

  // A gerente vê os dois: responde pela loja inteira
  colaboradorLogado = GERENTE;
  const filaDaGerente = servicoPonto.obterPendenciasParaDecidir();
  expect(filaDaGerente.map((p) => p.colaborador.nome).sort()).toEqual(['Pedro', 'Sônia']);
});

test('decisão tomada não é reaberta por uma nova apuração', async () => {
  montarEquipe(PEDRO);
  await fecharJornada(PEDRO, '2026-09-16', '08:00', '18:00');
  const ajuste = servicoPonto.obterAjusteDoDia(PEDRO.id, '2026-09-16')!;

  colaboradorLogado = GERENTE;
  await servicoPonto.decidirAjuste(ajuste.id, true);

  // Apurar de novo o mesmo dia não devolve a pendência para a fila
  await servicoPonto.apurarDia(PEDRO.id, '2026-09-16');
  expect(servicoPonto.obterAjusteDoDia(PEDRO.id, '2026-09-16')!.estado).toBe('aprovado');
  expect(servicoPonto.obterPendenciasParaDecidir()).toHaveLength(0);
});

test('NEM O RH/TI aprova a própria hora', async () => {
  // Este é o caso que a regra de "subir um degrau" não pega sozinha: quem
  // cuida de pessoas tem alçada sobre todo mundo, inclusive sobre si — a
  // trava contra decidir a própria hora tem que vir antes disso.
  montarEquipe(ELIAS);
  await fecharJornada(ELIAS, '2026-09-16', '08:00', '18:00');
  const ajuste = servicoPonto.obterAjusteDoDia(ELIAS.id, '2026-09-16')!;

  expect(servicoPonto.podeDecidirSobre(ELIAS as any)).toBe(false);

  const res = await servicoPonto.decidirAjuste(ajuste.id, true);
  expect(res.sucesso).toBe(false);
  expect(servicoPonto.obterSaldoAcumulado(ELIAS.id)).toBe(0);
});

// ============================================================
// O DOCUMENTO TEM QUE IDENTIFICAR A PESSOA E O EMPREGADOR
// ============================================================

/** Alguém com a ficha preenchida como a planilha da rede manda. */
const COM_FICHA = {
  ...ANA,
  id: 'colab-accacio',
  nome: 'Accacio Lopes Filho',
  login: 'accacio',
  setor: 'Balcão',
  cargo: 'Balconista',
  matricula: '1042',
  cnpj: '12.345.678/0001-90',
  dataAdmissao: '2019-03-04',
  telefone: '(19) 99999-0000',
};

test('o espelho de ponto sai com nome completo, matrícula e CNPJ', async () => {
  // O espelho é documento trabalhista. Sair só com nome e cargo não diz
  // contra QUAL empregador a jornada correu — e o grupo tem mais de um CNPJ.
  equipe = [ELIAS, COM_FICHA];
  colaboradorLogado = ELIAS;
  await fecharJornada(COM_FICHA, '2026-09-16', '08:00', '18:00');

  const html = servicoPonto.gerarHtmlEspelho('2026-09-16', '2026-09-16', [COM_FICHA.id]);

  expect(html).toContain('Accacio Lopes Filho');
  expect(html).toContain('1042');
  expect(html).toContain('12.345.678/0001-90');
  expect(html).toContain('04/03/2019');
  expect(html).toContain('Balconista');
  expect(html).toContain('Pirassununga');
});

test('campo não preenchido aparece no espelho como traço, e não some', () => {
  // Num documento, o vazio também é informação: mostra o que falta cadastrar
  equipe = [ELIAS, ANA];
  colaboradorLogado = ELIAS;

  const html = servicoPonto.gerarHtmlEspelho('2026-09-16', '2026-09-16', [ANA.id]);

  expect(html).toContain('CNPJ do empregador');
  expect(html).toContain('Matrícula');
});

test('o CSV do período carrega a identificação em toda linha', async () => {
  // Quem abre o CSV filtra e ordena. Identificação só no cabeçalho vira
  // linha órfã assim que alguém mexe na planilha.
  equipe = [ELIAS, COM_FICHA];
  colaboradorLogado = ELIAS;
  await fecharJornada(COM_FICHA, '2026-09-16', '08:00', '18:00');

  const csv = servicoPonto.gerarCsvDoPeriodo('2026-09-16', '2026-09-16', [COM_FICHA.id]);
  const linhas = csv.split('\n').filter((l) => l.includes('16/09/2026'));

  expect(linhas.length).toBeGreaterThan(0);
  for (const linha of linhas) {
    expect(linha).toContain('Accacio Lopes Filho');
    expect(linha).toContain('1042');
    expect(linha).toContain('12.345.678/0001-90');
  }
});

// ============================================================
// O ORGANOGRAMA MANDA NA FILA DE APROVAÇÃO — DE VERDADE
//
// organograma.test.ts prova a regra isolada. Estes provam que o SERVIÇO DE
// PONTO obedece a ela: é a diferença entre um organograma que decide e um
// que é só desenho bonito na tela do RH.
// ============================================================

test('pendurar alguém no organograma TIRA a alçada de quem a regra dava', async () => {
  const GER = { ...ELIAS, id: 'g', nome: 'Gerente', login: 'g', nivel: 3, setor: 'Gerência' };
  const LID = { ...ELIAS, id: 'l', nome: 'Lider', login: 'l', nivel: 2, setor: 'Balcão' };
  // A Ana é do Balcão, mas responde direto ao gerente
  const ANA_SOB_GER = {
    ...ELIAS, id: 'a', nome: 'Ana', login: 'a', nivel: 1,
    setor: 'Balcão', responsavelId: 'g',
  };
  equipe = [GER, LID, ANA_SOB_GER];

  // O líder do Balcão perde a alçada: quem manda é a cadeia
  colaboradorLogado = LID;
  expect(servicoPonto.podeDecidirSobre(ANA_SOB_GER as any)).toBe(false);

  colaboradorLogado = GER;
  expect(servicoPonto.podeDecidirSobre(ANA_SOB_GER as any)).toBe(true);

  // E a fila reflete isso: a hora da Ana não aparece para o líder
  colaboradorLogado = ANA_SOB_GER;
  await fecharJornada(ANA_SOB_GER, '2026-09-16', '08:00', '18:00');

  colaboradorLogado = LID;
  expect(servicoPonto.obterPendenciasParaDecidir()).toHaveLength(0);

  colaboradorLogado = GER;
  expect(servicoPonto.obterPendenciasParaDecidir()).toHaveLength(1);
});

/**
 * QUEM NÃO ESTÁ NO ORGANOGRAMA CAI PARA O RH — e não para o líder do setor.
 *
 * Havia uma rede de segurança: líder de setor alcançava todo o setor,
 * gerente alcançava a loja. O efeito prático era a líder de Compras
 * recebendo horas de gente que não é dela, só por dividirem o setor.
 *
 * Ninguém fica sem aprovador: RH, Diretoria e TI enxergam a rede inteira. E
 * é melhor assim — a pessoa aparece como pendência de quem pode consertar o
 * organograma, em vez de ser entregue a um líder que não responde por ela.
 */
test('quem NAO esta no organograma cai para o RH, e nao para o lider', async () => {
  const GER = { ...ELIAS, id: 'g', nome: 'Gerente', login: 'g', nivel: 3, setor: 'Gerência' };
  const LID = { ...ELIAS, id: 'l', nome: 'Lider', login: 'l', nivel: 2, setor: 'Balcão' };
  const SOLTO = { ...ELIAS, id: 's', nome: 'Solto', login: 's', nivel: 1, setor: 'Balcão' };
  equipe = [GER, LID, SOLTO];

  // Dividir o setor não é responder por alguém
  colaboradorLogado = LID;
  expect(servicoPonto.podeDecidirSobre(SOLTO as any)).toBe(false);

  // Dividir a loja também não
  colaboradorLogado = GER;
  expect(servicoPonto.podeDecidirSobre(SOLTO as any)).toBe(false);

  // Mas o RH alcança: ninguém fica com a hora parada
  colaboradorLogado = ELIAS;
  expect(servicoPonto.podeDecidirSobre(SOLTO as any)).toBe(true);
});

test('a alçada sobe a cadeia inteira, não para no chefe direto', async () => {
  const GER = { ...ELIAS, id: 'g', nome: 'Gerente', login: 'g', nivel: 3, setor: 'Gerência' };
  const LID = { ...ELIAS, id: 'l', nome: 'Lider', login: 'l', nivel: 2, setor: 'Balcão', responsavelId: 'g' };
  const ANA = { ...ELIAS, id: 'a', nome: 'Ana', login: 'a', nivel: 1, setor: 'Balcão', responsavelId: 'l' };
  equipe = [GER, LID, ANA];

  // Se o líder não decidir, o chefe dele decide
  colaboradorLogado = GER;
  expect(servicoPonto.podeDecidirSobre(ANA as any)).toBe(true);

  // Mas nunca ao contrário
  colaboradorLogado = ANA;
  expect(servicoPonto.podeDecidirSobre(LID as any)).toBe(false);
  expect(servicoPonto.podeDecidirSobre(GER as any)).toBe(false);
});

/**
 * QUEM LIDERA APROVA A PRÓPRIA HORA; QUEM NÃO LIDERA, NÃO.
 *
 * A trava caiu para quem tem gente pendurada abaixo — decisão do Elias. Mas
 * ela continua de pé para todos os outros: um colaborador comum não decide
 * sobre a própria jornada, e "ser nível 3" não basta. O que conta é ter
 * alguém sob a responsabilidade.
 */
test('quem NAO lidera continua sem aprovar a propria hora', async () => {
  const TOPO = { ...ELIAS, id: 't', nome: 'Topo', login: 't', nivel: 3, setor: 'Gerência' };
  const SUB = { ...ELIAS, id: 'sub', nome: 'Sub', login: 'sub', nivel: 1, setor: 'Balcão', responsavelId: 't' };
  const SOZINHO = { ...ELIAS, id: 'so', nome: 'Sozinho', login: 'so', nivel: 3, setor: 'Balcão' };
  equipe = [TOPO, SUB, SOZINHO];

  // O topo tem o Sub pendurado nele: aprova a própria
  colaboradorLogado = TOPO;
  expect(servicoPonto.podeDecidirSobre(TOPO as any)).toBe(true);

  // O Sozinho é nível 3 e não lidera ninguém: NÃO aprova a própria
  colaboradorLogado = SOZINHO;
  expect(servicoPonto.podeDecidirSobre(SOZINHO as any)).toBe(false);

  /**
   * E a recusa vale na AÇÃO, não só na pergunta.
   *
   * Uma tela que esconde o botão mas deixa a ação passar não protege nada:
   * basta a tela ficar aberta enquanto a permissão muda.
   */
  colaboradorLogado = SOZINHO;
  await fecharJornada(SOZINHO, '2026-09-16', '08:00', '18:00');
  const ajuste = servicoPonto.obterAjusteDoDia(SOZINHO.id, '2026-09-16')!;
  const res = await servicoPonto.decidirAjuste(ajuste.id, true);

  expect(res.sucesso).toBe(false);
  expect(servicoPonto.obterSaldoAcumulado(SOZINHO.id)).toBe(0);
});

test('gerente de OUTRA loja não entra na cadeia por acaso', async () => {
  const GER_A = { ...ELIAS, id: 'ga', nome: 'Ger A', login: 'ga', nivel: 3, setor: 'Gerência', loja: 'Pirassununga' };
  const GER_B = { ...ELIAS, id: 'gb', nome: 'Ger B', login: 'gb', nivel: 3, setor: 'Gerência', loja: 'Descalvado' };
  const ANA = { ...ELIAS, id: 'a', nome: 'Ana', login: 'a', nivel: 1, setor: 'Balcão', loja: 'Pirassununga', responsavelId: 'ga' };
  equipe = [GER_A, GER_B, ANA];

  colaboradorLogado = GER_B;
  expect(servicoPonto.podeDecidirSobre(ANA as any)).toBe(false);
});

// ============================================================
// PAINEL DE GESTÃO: VER E CORRIGIR SÃO COISAS DIFERENTES
// ============================================================

test('o gerente acompanha a equipe dele, e não a rede', async () => {
  const GER = { ...ELIAS, id: 'g', nome: 'Gerente', login: 'g', nivel: 3, setor: 'Gerência' };
  // Pendurado nele: alcance vem da cadeia, e não de dividirem a loja
  const MEU = {
    ...ELIAS, id: 'meu', nome: 'Meu', login: 'meu', nivel: 1,
    setor: 'Balcão', responsavelId: 'g',
  };
  const DE_OUTRA = {
    ...ELIAS, id: 'outro', nome: 'Outro', login: 'outro', nivel: 1,
    setor: 'Balcão', loja: 'Descalvado',
  };
  equipe = [GER, MEU, DE_OUTRA];
  colaboradorLogado = GER;

  const visiveis = servicoPonto.obterColaboradoresVisiveis().map((c) => c.id);
  expect(visiveis).toContain('meu');
  expect(visiveis).toContain('g'); // ele mesmo: é o extrato dele
  expect(visiveis).not.toContain('outro');
});

test('VER segue a mesma regra de APROVAR — inclusive quando o organograma muda', async () => {
  // Se as duas listas divergirem, o gestor vê saldo de gente sobre quem não
  // decide nada, ou aprova sem conseguir ver o histórico
  const GER = { ...ELIAS, id: 'g', nome: 'Gerente', login: 'g', nivel: 3, setor: 'Gerência' };
  const LID = { ...ELIAS, id: 'l', nome: 'Lider', login: 'l', nivel: 2, setor: 'Balcão' };
  // Ana é do Balcão, mas responde ao gerente — sai da alçada do líder
  const ANA = {
    ...ELIAS, id: 'a', nome: 'Ana', login: 'a', nivel: 1,
    setor: 'Balcão', responsavelId: 'g',
  };
  equipe = [GER, LID, ANA];

  colaboradorLogado = LID;
  expect(servicoPonto.podeDecidirSobre(ANA as any)).toBe(false);
  expect(servicoPonto.obterColaboradoresVisiveis().map((c) => c.id)).not.toContain('a');

  colaboradorLogado = GER;
  expect(servicoPonto.podeDecidirSobre(ANA as any)).toBe(true);
  expect(servicoPonto.obterColaboradoresVisiveis().map((c) => c.id)).toContain('a');
});

test('O RESPONSÁVEL CORRIGE A MARCAÇÃO DE QUEM RESPONDE POR ELE', async () => {
  /**
   * A regra MUDOU, e de propósito.
   *
   * Antes corrigir era só do RH, e isso deixava a fila de aprovação sem
   * saída: o responsável via o dia fechado errado, sabia o horário certo,
   * e só podia aprovar o errado ou recusar — e recusar não conserta o
   * espelho de ninguém.
   *
   * O que segura no lugar da trava antiga está nos dois testes abaixo: o
   * alcance é o da cadeia, e a correção nasce com autor e motivo.
   */
  const GER = { ...ELIAS, id: 'g', nome: 'Gerente', login: 'g', nivel: 3, setor: 'Gerência' };
  const PEDRO_EQ = {
    ...ELIAS, id: 'p', nome: 'Pedro', login: 'p', nivel: 1,
    setor: 'Balcão', responsavelId: 'g',
  };
  equipe = [GER, PEDRO_EQ];
  colaboradorLogado = GER;

  expect(servicoPonto.podeDecidirSobre(PEDRO_EQ as any)).toBe(true);

  const res = await servicoPonto.ajustarMarcacao({
    colaboradorId: PEDRO_EQ.id,
    data: '2026-09-16',
    tipo: 'saida',
    hora: '18:00',
    justificativa: 'saiu para entrega em Leme e não bateu na volta',
  });

  expect(res.sucesso).toBe(true);
  expect(bancoRegistros).toHaveLength(1);

  // A correção do responsável NÃO se disfarça de batida, e nem de correção
  // do RH: o espelho precisa poder dizer quem escreveu aquilo
  expect(bancoRegistros[0].metodo).toBe('ajuste_lider');
  expect(bancoRegistros[0].ajustadoPorNome).toBe('Gerente');
  expect(bancoRegistros[0].justificativa).toContain('entrega em Leme');
});

test('CORRIGIR SEGUE A CADEIA — fora dela, não corrige', async () => {
  /**
   * É o que substitui a trava antiga. Sem isto, soltar a correção para
   * "líder e gerente" viraria qualquer líder mexendo no ponto de qualquer
   * pessoa da rede.
   */
  const GER = { ...ELIAS, id: 'g', nome: 'Gerente', login: 'g', nivel: 3, setor: 'Gerência', loja: 'Pirassununga' };
  const DE_OUTRA = {
    ...ELIAS, id: 'x', nome: 'Outra Loja', login: 'x', nivel: 1,
    setor: 'Balcão', loja: 'Leme', responsavelId: 'chefe-de-leme',
  };
  equipe = [GER, DE_OUTRA];
  colaboradorLogado = GER;

  expect(servicoPonto.podeDecidirSobre(DE_OUTRA as any)).toBe(false);

  const res = await servicoPonto.ajustarMarcacao({
    colaboradorId: DE_OUTRA.id,
    data: '2026-09-16',
    tipo: 'saida',
    hora: '18:00',
    justificativa: 'nem é da minha equipe',
  });

  expect(res.sucesso).toBe(false);
  expect(bancoRegistros).toHaveLength(0);
});

test('o RH corrige, e a correção fica com autoria', async () => {
  // O outro lado do mesmo teste: a trava não pode ter travado o RH junto
  const PEDRO_EQ = { ...ELIAS, id: 'p', nome: 'Pedro', login: 'p', nivel: 1, setor: 'Balcão' };
  equipe = [ELIAS, PEDRO_EQ];
  colaboradorLogado = ELIAS;

  const res = await servicoPonto.ajustarMarcacao({
    colaboradorId: PEDRO_EQ.id,
    data: '2026-09-16',
    tipo: 'saida',
    hora: '18:00',
    justificativa: 'esqueceu de bater',
  });

  expect(res.sucesso).toBe(true);
  expect(res.registro?.metodo).toBe('ajuste_rh');
});

// ============================================================
// O CARTAZ DE QR É DA LOJA, E O GERENTE CUIDA DA DELE
// ============================================================

test('gerente cuida do QR da PRÓPRIA loja, e só dela', async () => {
  const GER = {
    ...ELIAS, id: 'g', nome: 'Gerente', login: 'g', nivel: 3,
    setor: 'Gerência', loja: 'Pirassununga',
  };
  equipe = [GER];
  colaboradorLogado = GER;

  expect(servicoPonto.podeCuidarDoQrDaLoja(GER as any, 'Pirassununga')).toBe(true);
  // Trocar o cartaz de outra unidade derrubaria o ponto de gente por quem
  // ele não responde
  expect(servicoPonto.podeCuidarDoQrDaLoja(GER as any, 'Descalvado')).toBe(false);

  expect(servicoPonto.lojasComQrQuePosso(GER as any)).toEqual(['Pirassununga']);
});

test('o banco recusa o gerente trocando o cartaz de outra loja', async () => {
  const GER = {
    ...ELIAS, id: 'g', nome: 'Gerente', login: 'g', nivel: 3,
    setor: 'Gerência', loja: 'Pirassununga',
  };
  equipe = [GER];
  colaboradorLogado = GER;

  const res = await servicoPonto.regenerarCodigoDaLoja('Descalvado');
  expect(res.sucesso).toBe(false);
  expect(res.erro).toContain('sua loja');
});

test('RH e TI cuidam das cinco lojas', () => {
  equipe = [ELIAS];
  colaboradorLogado = ELIAS;

  expect(servicoPonto.lojasComQrQuePosso(ELIAS as any)).toHaveLength(5);
});

test('LÍDER DE SETOR não cuida do cartaz', async () => {
  // O cartaz é da LOJA, não do setor — e a liderança de Compras atua nas
  // cinco. Dar o cartaz a ela seria dar o de todas.
  const LIDER = {
    ...ELIAS, id: 'l', nome: 'Lider', login: 'l', nivel: 2,
    setor: 'Compras', loja: 'Pirassununga',
  };
  equipe = [LIDER];
  colaboradorLogado = LIDER;

  expect(servicoPonto.podeCuidarDoQrDaLoja(LIDER as any, 'Pirassununga')).toBe(false);
  expect(servicoPonto.lojasComQrQuePosso(LIDER as any)).toHaveLength(0);
});

// ============================================================
// TOLERÂNCIA DIÁRIA — art. 58 §1º da CLT
//
// Era o defeito central: qualquer minuto virava pendência, ~1.800 aprovações
// por mês, e fila desse tamanho vira carimbo. Dentro da faixa entra no banco
// sozinho; fora dela, o dia INTEIRO vira pendência com o valor cheio.
// ============================================================

const CARLOS = {
  ...ELIAS, id: 'c', nome: 'Carlos', login: 'c', nivel: 1, setor: 'Balcão',
};
const CHEFE = {
  ...ELIAS, id: 'ch', nome: 'Chefe', login: 'ch', nivel: 3, setor: 'Gerência',
};

test('DENTRO DA TOLERÂNCIA: entra no banco sem passar por ninguém', async () => {
  equipe = [CHEFE, CARLOS];
  colaboradorLogado = CARLOS;

  // 8h07 trabalhadas: 7 minutos além, dentro dos 10
  await fecharJornada(CARLOS, '2026-09-16', '08:00', '17:07');

  const ajuste = servicoPonto.obterAjusteDoDia(CARLOS.id, '2026-09-16')!;
  expect(ajuste.estado).toBe('aprovado');
  expect(ajuste.origem).toBe('tolerancia_automatica');
  // Ninguém carimbou: não há aprovador humano
  expect(ajuste.aprovadorId).toBeUndefined();

  // Entrou no saldo, e não aparece na fila de ninguém
  expect(servicoPonto.obterSaldoAcumulado(CARLOS.id)).toBe(7);
  colaboradorLogado = CHEFE;
  expect(servicoPonto.obterPendenciasParaDecidir()).toHaveLength(0);
});

test('FORA DA TOLERÂNCIA: pendência com o valor CHEIO, não o excedente', async () => {
  // A tolerância é tudo-ou-nada por dia. Descontar os 10 minutos daria 20 e
  // faria a pessoa receber menos do que trabalhou.
  equipe = [CHEFE, CARLOS];
  colaboradorLogado = CARLOS;

  await fecharJornada(CARLOS, '2026-09-16', '08:00', '17:30'); // 8h30 = +30

  const ajuste = servicoPonto.obterAjusteDoDia(CARLOS.id, '2026-09-16')!;
  expect(ajuste.estado).toBe('pendente');
  expect(ajuste.origem).toBe('pendencia');
  expect(ajuste.minutos).toBe(30);
  expect(servicoPonto.obterSaldoAcumulado(CARLOS.id)).toBe(0);
});

test('a faixa vale para os DOIS lados', async () => {
  equipe = [CHEFE, CARLOS];
  colaboradorLogado = CARLOS;

  // 8 minutos a menos
  await fecharJornada(CARLOS, '2026-09-16', '08:00', '16:52');
  const ajuste = servicoPonto.obterAjusteDoDia(CARLOS.id, '2026-09-16')!;

  expect(ajuste.tipo).toBe('debito');
  expect(ajuste.estado).toBe('aprovado');
  expect(servicoPonto.obterSaldoAcumulado(CARLOS.id)).toBe(-8);
});

test('O LIMITE É INCLUSIVO: exatamente 10 minutos ainda é tolerância', async () => {
  // A borda importa: a lei diz "até 10", e um erro de <= para < mandaria
  // para a fila um dia por pessoa a cada tanto, sem motivo nenhum.
  equipe = [CHEFE, CARLOS];
  colaboradorLogado = CARLOS;

  await fecharJornada(CARLOS, '2026-09-16', '08:00', '17:10');
  expect(servicoPonto.obterAjusteDoDia(CARLOS.id, '2026-09-16')!.estado).toBe('aprovado');

  await fecharJornada(CARLOS, '2026-09-17', '08:00', '17:11');
  expect(servicoPonto.obterAjusteDoDia(CARLOS.id, '2026-09-17')!.estado).toBe('pendente');
});

test('a tolerância é CONFIGURÁVEL, sem deploy', async () => {
  equipe = [CHEFE, CARLOS];
  colaboradorLogado = CARLOS;

  toleranciaDoTeste = 0;
  await fecharJornada(CARLOS, '2026-09-16', '08:00', '17:05');
  expect(servicoPonto.obterAjusteDoDia(CARLOS.id, '2026-09-16')!.estado).toBe('pendente');

  toleranciaDoTeste = 30;
  await fecharJornada(CARLOS, '2026-09-17', '08:00', '17:20');
  expect(servicoPonto.obterAjusteDoDia(CARLOS.id, '2026-09-17')!.estado).toBe('aprovado');
});

test('tolerância inválida cai no padrão da lei, não em zero', async () => {
  // Configuração corrompida ou apagada não pode transformar cada minuto em
  // pendência — seria voltar ao defeito que a tolerância veio corrigir.
  toleranciaDoTeste = -5 as number;
  expect(servicoPonto.obterToleranciaMinutos()).toBe(10);

  toleranciaDoTeste = undefined as unknown as number;
  expect(servicoPonto.obterToleranciaMinutos()).toBe(10);
});

test('a tolerância NÃO decide quem aprova o que passa dela', async () => {
  // Fora da faixa, a cadeia de aprovação continua mandando igual
  const ANA_SOB_CHEFE = { ...CARLOS, responsavelId: 'ch' };
  const OUTRO_CHEFE = { ...CHEFE, id: 'ch2', login: 'ch2', loja: 'Descalvado' };
  equipe = [CHEFE, OUTRO_CHEFE, ANA_SOB_CHEFE];

  colaboradorLogado = ANA_SOB_CHEFE;
  await fecharJornada(ANA_SOB_CHEFE, '2026-09-16', '08:00', '18:00');

  colaboradorLogado = OUTRO_CHEFE;
  expect(servicoPonto.obterPendenciasParaDecidir()).toHaveLength(0);
  colaboradorLogado = CHEFE;
  expect(servicoPonto.obterPendenciasParaDecidir()).toHaveLength(1);
});

test('o motivo do colaborador chega junto da pendência', async () => {
  // Sem ele o aprovador vê "trabalhou 9h de 8h" e decide no escuro
  equipe = [CHEFE, CARLOS];
  colaboradorLogado = CARLOS;

  await fecharJornada(CARLOS, '2026-09-16', '08:00', '18:00');
  await servicoPonto.apurarDia(CARLOS.id, '2026-09-16', {
    motivo: 'Entrega atrasada do fornecedor',
    anexoCaminho: 'ponto/c/2026-09-16.jpg',
  });

  const ajuste = servicoPonto.obterAjusteDoDia(CARLOS.id, '2026-09-16')!;
  expect(ajuste.motivoColaborador).toBe('Entrega atrasada do fornecedor');
  expect(ajuste.anexoCaminho).toBe('ponto/c/2026-09-16.jpg');
});


// ============================================================
// A ESCALA DA REDE: SEGUNDA A SÁBADO, DOIS TURNOS
//
// 2026-09-19 é sábado; 2026-09-20 é domingo; 2026-09-16 é quarta.
// ============================================================

const DO_TURNO_A = {
  ...ELIAS, id: 'ta', nome: 'Do turno A', login: 'ta', nivel: 1,
  setor: 'Balcão', turno: 'A', cargaHorariaDiariaMinutos: undefined,
  // Pendurado no gestor: sem a cadeia montada, ninguem responde por ele
  responsavelId: 'g',
};
const DO_TURNO_B = { ...DO_TURNO_A, id: 'tb', nome: 'Do turno B', login: 'tb', turno: 'B' };
const GESTOR = {
  ...ELIAS, id: 'g', nome: 'Gestor', login: 'g', nivel: 3, setor: 'Gerência',
};

/** Fecha um SÁBADO: duas marcações, sem intervalo. */
const fecharSabado = async (quem: any, data: string, entrada: string, saida: string) => {
  const marcar = (tipo: string, hora: string) => ({
    id: `r-${quem.id}-${tipo}-${data}`, colaboradorId: quem.id, data, tipo,
    horario: new Date(`${data}T${hora}:00`).toISOString(), horaFormatada: hora,
    metodo: 'qrcode', loja: quem.loja, criadoEm: new Date().toISOString(),
  });
  bancoRegistros.push(marcar('entrada', entrada), marcar('saida', saida));
  armazenamento.setItem(CHAVE_REGISTROS, JSON.stringify(bancoRegistros));
  await servicoPonto.apurarDia(quem.id, data);
};

test('os dois turnos preveem a MESMA jornada: 8h10', () => {
  equipe = [GESTOR, DO_TURNO_A, DO_TURNO_B];

  const a = servicoPonto.obterJornadaDoDia(DO_TURNO_A.id, '2026-09-16');
  const b = servicoPonto.obterJornadaDoDia(DO_TURNO_B.id, '2026-09-16');

  expect(a.minutosPrevistos).toBe(490);
  expect(b.minutosPrevistos).toBe(490);
});

test('SÁBADO PREVÊ 4 HORAS, não zero', () => {
  /**
   * Era o defeito: sábado contava como fim de semana e previa ZERO. As 4
   * horas trabalhadas viravam 4 horas extras para a rede inteira, toda
   * semana — 85 pessoas gerando pendência de 4h todo sábado.
   */
  equipe = [GESTOR, DO_TURNO_A];
  const sabado = servicoPonto.obterJornadaDoDia(DO_TURNO_A.id, '2026-09-19');

  expect(sabado.minutosPrevistos).toBe(240);
});

test('DOMINGO continua sem prever nada', () => {
  equipe = [GESTOR, DO_TURNO_A];
  expect(
    servicoPonto.obterJornadaDoDia(DO_TURNO_A.id, '2026-09-20').minutosPrevistos
  ).toBe(0);
});

test('SÁBADO FECHA COM DUAS MARCAÇÕES', async () => {
  /**
   * Exigir as quatro deixaria todo sábado eternamente incompleto — e dia
   * incompleto não apura, então o sábado nunca entraria no banco de
   * ninguém.
   */
  equipe = [GESTOR, DO_TURNO_A];
  colaboradorLogado = DO_TURNO_A;

  await fecharSabado(DO_TURNO_A, '2026-09-19', '08:00', '12:00');

  const jornada = servicoPonto.obterJornadaDoDia(DO_TURNO_A.id, '2026-09-19');
  expect(jornada.completa).toBe(true);
  expect(jornada.minutosTrabalhados).toBe(240);
  // Bateu exatamente o previsto: nada a decidir, e nada no banco de horas
  expect(servicoPonto.obterAjusteDoDia(DO_TURNO_A.id, '2026-09-19')).toBeFalsy();
  expect(servicoPonto.obterSaldoAcumulado(DO_TURNO_A.id)).toBe(0);
});

test('no sábado, depois da entrada vem a SAÍDA — não o almoço', async () => {
  // Percorrendo as quatro fixas, o sistema pediria um almoço que não existe
  equipe = [GESTOR, DO_TURNO_A];
  colaboradorLogado = DO_TURNO_A;

  expect(servicoPonto.obterProximaMarcacao(DO_TURNO_A.id, '2026-09-19')).toBe('entrada');

  bancoRegistros.push({
    id: 'r1', colaboradorId: DO_TURNO_A.id, data: '2026-09-19', tipo: 'entrada',
    horario: new Date('2026-09-19T08:00:00').toISOString(), horaFormatada: '08:00',
    metodo: 'qrcode', loja: DO_TURNO_A.loja, criadoEm: new Date().toISOString(),
  } as any);
  armazenamento.setItem(CHAVE_REGISTROS, JSON.stringify(bancoRegistros));

  expect(servicoPonto.obterProximaMarcacao(DO_TURNO_A.id, '2026-09-19')).toBe('saida');
});

test('no dia útil a ordem das quatro continua igual', async () => {
  equipe = [GESTOR, DO_TURNO_A];
  expect(servicoPonto.obterProximaMarcacao(DO_TURNO_A.id, '2026-09-16')).toBe('entrada');
});

// ============================================================
// O ATRASO É MEDIDO CONTRA O TURNO DA PESSOA
// ============================================================

test('quem é do turno B não justifica atraso por entrar às 08:20', () => {
  /**
   * Com um horário único da rede, quem entra às 08:20 apareceria atrasado
   * todo santo dia — e a pessoa aprenderia a escrever qualquer coisa no
   * campo de motivo para conseguir bater o ponto.
   */
  equipe = [GESTOR, DO_TURNO_A, DO_TURNO_B];

  const asOitoEVinte = new Date('2026-09-16T08:20:00');

  // Turno B entra às 08:20: em cima da hora
  expect(
    servicoPonto.avaliarMarcacao(DO_TURNO_B.id, 'entrada', asOitoEVinte).precisaMotivo
  ).toBe(false);

  // Turno A entra às 07:30: 50 minutos atrasado
  const doA = servicoPonto.avaliarMarcacao(DO_TURNO_A.id, 'entrada', asOitoEVinte);
  expect(doA.precisaMotivo).toBe(true);
  expect(doA.minutos).toBe(50);
  expect(doA.descricao).toContain('07:30');
});

test('no sábado o horário cobrado é o do sábado', () => {
  equipe = [GESTOR, DO_TURNO_B];

  // 08:00 é a hora certa do sábado, mesmo para quem é do turno B
  expect(
    servicoPonto.avaliarMarcacao(
      DO_TURNO_B.id, 'entrada', new Date('2026-09-19T08:00:00')
    ).precisaMotivo
  ).toBe(false);

  const atrasado = servicoPonto.avaliarMarcacao(
    DO_TURNO_B.id, 'entrada', new Date('2026-09-19T08:40:00')
  );
  expect(atrasado.precisaMotivo).toBe(true);
  expect(atrasado.minutos).toBe(40);
});

test('domingo não cobra horário de entrada', () => {
  equipe = [GESTOR, DO_TURNO_A];
  expect(
    servicoPonto.avaliarMarcacao(
      DO_TURNO_A.id, 'entrada', new Date('2026-09-20T11:00:00')
    ).precisaMotivo
  ).toBe(false);
});

test('a tolerância vale também na entrada', () => {
  equipe = [GESTOR, DO_TURNO_A];
  // 8 minutos depois das 07:30, dentro dos 10
  expect(
    servicoPonto.avaliarMarcacao(
      DO_TURNO_A.id, 'entrada', new Date('2026-09-16T07:38:00')
    ).precisaMotivo
  ).toBe(false);
});

test('carga individual cadastrada vence o turno', () => {
  // Contrato individual manda mais que a escala da rede
  const MEIO_PERIODO = { ...DO_TURNO_A, id: 'mp', login: 'mp', cargaHorariaDiariaMinutos: 240 };
  equipe = [GESTOR, MEIO_PERIODO];

  expect(
    servicoPonto.obterJornadaDoDia(MEIO_PERIODO.id, '2026-09-16').minutosPrevistos
  ).toBe(240);
});


// ============================================================
// DIA QUE COMEÇOU E NÃO FECHOU
//
// Antes sumia em silêncio: sem as marcações esperadas o dia não apura, não
// vira pendência, não vira débito, e simplesmente não conta. Era o caminho
// mais fácil para sumir com um dia inteiro.
// ============================================================

/** Bate só parte do dia e deixa em aberto. */
const baterParcial = (quem: any, data: string, tipos: Record<string, string>) => {
  Object.entries(tipos).forEach(([tipo, hora]) => {
    bancoRegistros.push({
      id: `p-${quem.id}-${tipo}-${data}`, colaboradorId: quem.id, data, tipo,
      horario: new Date(`${data}T${hora}:00`).toISOString(), horaFormatada: hora,
      metodo: 'qrcode', loja: quem.loja, criadoEm: new Date().toISOString(),
    } as any);
  });
  armazenamento.setItem(CHAVE_REGISTROS, JSON.stringify(bancoRegistros));
};

/** Uma data no passado que não caia em domingo. */
const diasAtras = (n: number): string => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  // Sem domingo (nao tem jornada) e sem sabado (preve 4h, nao 8h10):
  // o teste quer um dia util comum
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate()
  ).padStart(2, '0')}`;
};

test('DIA SEM FECHAR VAI PARA A FILA DO RESPONSÁVEL', async () => {
  equipe = [GESTOR, DO_TURNO_A];
  colaboradorLogado = GESTOR;

  // Entrou e foi almoçar; nunca voltou a bater
  baterParcial(DO_TURNO_A, diasAtras(3), { entrada: '07:30', saida_almoco: '12:30' });

  const criados = await servicoPonto.levantarDiasIncompletos();
  expect(criados).toBe(1);

  const fila = servicoPonto.obterPendenciasParaDecidir();
  expect(fila).toHaveLength(1);
  expect(fila[0].ajuste.tipo).toBe('dia_incompleto');
});

test('dia sem fechar NÃO mexe no saldo enquanto ninguém decide', async () => {
  // O valor guardado é a jornada prevista; contá-lo como crédito mostraria
  // horas a mais para quem só esqueceu de bater a saída
  equipe = [GESTOR, DO_TURNO_A];
  colaboradorLogado = GESTOR;
  baterParcial(DO_TURNO_A, diasAtras(3), { entrada: '07:30' });
  await servicoPonto.levantarDiasIncompletos();

  expect(servicoPonto.obterSaldoPendente(DO_TURNO_A.id)).toBe(0);
  expect(servicoPonto.obterSaldoAcumulado(DO_TURNO_A.id)).toBe(0);
});

test('ABONAR: o dia conta como jornada normal, saldo zero', async () => {
  equipe = [GESTOR, DO_TURNO_A];
  colaboradorLogado = GESTOR;
  baterParcial(DO_TURNO_A, diasAtras(3), { entrada: '07:30' });
  await servicoPonto.levantarDiasIncompletos();

  const alvo = servicoPonto.obterPendenciasParaDecidir()[0].ajuste;
  const res = await servicoPonto.decidirDiaIncompleto(alvo.id, true);

  expect(res.sucesso).toBe(true);
  expect(servicoPonto.obterSaldoAcumulado(DO_TURNO_A.id)).toBe(0);
  expect(servicoPonto.obterPendenciasParaDecidir()).toHaveLength(0);
});

test('MARCAR DÉBITO: o dia vira a jornada prevista, negativa', async () => {
  equipe = [GESTOR, DO_TURNO_A];
  colaboradorLogado = GESTOR;
  baterParcial(DO_TURNO_A, diasAtras(3), { entrada: '07:30' });
  await servicoPonto.levantarDiasIncompletos();

  const alvo = servicoPonto.obterPendenciasParaDecidir()[0].ajuste;
  await servicoPonto.decidirDiaIncompleto(alvo.id, false);

  // 8h10 = 490 minutos, negativos
  expect(servicoPonto.obterSaldoAcumulado(DO_TURNO_A.id)).toBe(-490);
});

test('O DIA DE HOJE NÃO ENTRA NA FILA', async () => {
  // Durante o expediente o dia está legitimamente incompleto; cobrar de
  // manhã a saída que só acontece às 17h seria ruído puro
  equipe = [GESTOR, DO_TURNO_A];
  colaboradorLogado = GESTOR;
  baterParcial(DO_TURNO_A, dataDeHoje(), { entrada: '07:30' });

  expect(await servicoPonto.levantarDiasIncompletos()).toBe(0);
});

test('dia SEM NENHUMA batida não entra: isso é falta, não dia pela metade', async () => {
  equipe = [GESTOR, DO_TURNO_A];
  colaboradorLogado = GESTOR;

  // Nenhuma marcação em dia nenhum
  expect(await servicoPonto.levantarDiasIncompletos()).toBe(0);
});

test('dia completo não entra', async () => {
  equipe = [GESTOR, DO_TURNO_A];
  colaboradorLogado = GESTOR;
  await fecharJornada(DO_TURNO_A, diasAtras(3), '07:30', '17:10');

  expect(await servicoPonto.levantarDiasIncompletos()).toBe(0);
});

test('o levantamento não repete o mesmo dia', async () => {
  // Abrir a fila duas vezes não pode criar duas pendências do mesmo dia
  equipe = [GESTOR, DO_TURNO_A];
  colaboradorLogado = GESTOR;
  baterParcial(DO_TURNO_A, diasAtras(3), { entrada: '07:30' });

  expect(await servicoPonto.levantarDiasIncompletos()).toBe(1);
  expect(await servicoPonto.levantarDiasIncompletos()).toBe(0);
  expect(servicoPonto.obterPendenciasParaDecidir()).toHaveLength(1);
});

test('só levanta de quem eu aprovo', async () => {
  // Não está pendurado no gestor: é isso que o mantém fora da fila dele
  const DE_OUTRA_LOJA = {
    ...DO_TURNO_A, id: 'ol', login: 'ol', nome: 'De outra',
    loja: 'Descalvado', responsavelId: undefined,
  };
  equipe = [GESTOR, DO_TURNO_A, DE_OUTRA_LOJA];
  colaboradorLogado = GESTOR;

  baterParcial(DE_OUTRA_LOJA, diasAtras(3), { entrada: '07:30' });

  // Gestor é de Pirassununga: o dia de Descalvado não é dele
  expect(await servicoPonto.levantarDiasIncompletos()).toBe(0);
});

test('quem não responde por ninguém não decide o dia de outro', async () => {
  equipe = [GESTOR, DO_TURNO_A, DO_TURNO_B];
  colaboradorLogado = GESTOR;
  baterParcial(DO_TURNO_A, diasAtras(3), { entrada: '07:30' });
  await servicoPonto.levantarDiasIncompletos();
  const alvo = servicoPonto.obterPendenciasParaDecidir()[0].ajuste;

  colaboradorLogado = DO_TURNO_B;
  const res = await servicoPonto.decidirDiaIncompleto(alvo.id, true);

  expect(res.sucesso).toBe(false);
  expect(res.erro).toContain('não responde');
});


// ============================================================
// SÁBADO DE FOLGA PREVÊ ZERO
// ============================================================

test('ausência aprovada zera o previsto do dia', async () => {
  /**
   * Sem isto, o sábado de folga previa 4 horas e a pessoa fechava o mês com
   * 4 horas de débito por exercer um direito da rede.
   */
  equipe = [GESTOR, DO_TURNO_A];

  // Sem folga: sábado prevê as 4 horas
  expect(
    servicoPonto.obterJornadaDoDia(DO_TURNO_A.id, '2026-09-19').minutosPrevistos
  ).toBe(240);

  // Com a folga aprovada gravada, prevê zero
  armazenamento.setItem(
    'conecta_v4_justificativas_ausencia',
    JSON.stringify([
      {
        id: 'f1', colaboradorId: DO_TURNO_A.id, dataInicio: '2026-09-19',
        dataFim: '2026-09-19', tipo: 'folga_sabado', estado: 'aprovada',
        criadoEm: new Date().toISOString(),
      },
    ])
  );

  expect(
    servicoPonto.obterJornadaDoDia(DO_TURNO_A.id, '2026-09-19').minutosPrevistos
  ).toBe(0);
  // E não sobra débito nenhum
  expect(
    servicoPonto.obterJornadaDoDia(DO_TURNO_A.id, '2026-09-19').saldoMinutos
  ).toBe(0);

  armazenamento.removeItem('conecta_v4_justificativas_ausencia');
});

test('ausência PENDENTE não zera nada', async () => {
  // Mudar o previsto antes de alguém decidir seria o mesmo que a hora extra
  // entrar no saldo sem aprovação
  equipe = [GESTOR, DO_TURNO_A];
  armazenamento.setItem(
    'conecta_v4_justificativas_ausencia',
    JSON.stringify([
      {
        id: 'f2', colaboradorId: DO_TURNO_A.id, dataInicio: '2026-09-19',
        dataFim: '2026-09-19', tipo: 'folga_sabado', estado: 'pendente',
        criadoEm: new Date().toISOString(),
      },
    ])
  );

  expect(
    servicoPonto.obterJornadaDoDia(DO_TURNO_A.id, '2026-09-19').minutosPrevistos
  ).toBe(240);

  armazenamento.removeItem('conecta_v4_justificativas_ausencia');
});

test('O ESPELHO MARCA AS DUAS CORREÇÕES, NÃO SÓ A DO RH', async () => {
  /**
   * O destaque de "corrigido" no espelho é o que denuncia marcação escrita
   * por alguém em vez de batida pela pessoa. Ele é a contrapartida de ter
   * soltado a correção para o responsável.
   *
   * Se `ehMarcacaoCorrigida` voltar a olhar só `ajuste_rh`, a correção do
   * líder passa a aparecer no documento como batida normal — a perda é
   * silenciosa, que é o pior tipo.
   */
  const { ehMarcacaoCorrigida } = await import('../tipos');

  expect(ehMarcacaoCorrigida('ajuste_rh')).toBe(true);
  expect(ehMarcacaoCorrigida('ajuste_lider')).toBe(true);

  // Batida de verdade não pode ser marcada como corrigida
  expect(ehMarcacaoCorrigida('qrcode')).toBe(false);
  expect(ehMarcacaoCorrigida('codigo_manual')).toBe(false);
  expect(ehMarcacaoCorrigida(undefined)).toBe(false);
});

test('ESTAGIÁRIA BATE DUAS VEZES, NÃO QUATRO', async () => {
  /**
   * A Lyvia é estagiária e responde à líder de Garantia. Jornada de
   * estágio não tem intervalo: entra e sai, e pronto.
   *
   * `obterProximaMarcacao` recebia o id da pessoa e perguntava as
   * marcações esperadas SÓ PELA DATA. Resultado: depois da entrada, o
   * sistema pedia a saída para almoço — um almoço que ela não tem — e o
   * dia dela nunca fechava.
   *
   * Terceira vez que esta mesma linha esquece o segundo argumento neste
   * projeto. Por isso agora tem teste.
   */
  const LYVIA = {
    ...ELIAS,
    id: 'colab-lyvia',
    nome: 'Lyvia',
    login: 'lyvia',
    nivel: 1,
    setor: 'Estágio',
    cargo: 'Estagiária',
  };
  equipe = [ELIAS, LYVIA];

  // O cartaz é publicado por quem pode publicar; só depois a estagiária entra
  const codigo = await publicarCodigos();
  colaboradorLogado = LYVIA;

  const entrada = await servicoPonto.registrarMarcacaoPorCodigo(codigo);
  expect(entrada.registro!.tipo).toBe('entrada');

  // A próxima é a SAÍDA. Se vier 'saida_almoco', o dia não fecha nunca.
  expect(servicoPonto.obterProximaMarcacao(LYVIA.id)).toBe('saida');

  const saida = await servicoPonto.registrarMarcacaoPorCodigo(codigo);
  expect(saida.registro!.tipo).toBe('saida');

  // E aí a jornada dela acabou
  expect(servicoPonto.obterProximaMarcacao(LYVIA.id)).toBeNull();
});

test('quem tem intervalo continua batendo as quatro', async () => {
  // O outro lado: a correção acima não pode ter tirado o almoço de todo mundo
  equipe = [ELIAS, ANA];

  const codigo = await publicarCodigos();
  colaboradorLogado = ANA;
  await servicoPonto.registrarMarcacaoPorCodigo(codigo);

  expect(servicoPonto.obterProximaMarcacao(ANA.id)).toBe('saida_almoco');
});
