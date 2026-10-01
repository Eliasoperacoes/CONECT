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
/** Liga a recusa do banco, para provar que a tela não mente quando ele nega. */
let bancoRecusaAjuste = false;
let sincronizacoes = 0;
/** A função do banco `dias_com_batida_incompleta` existe? (pontos-incompletos.sql) */
let funcaoDosIncompletos = true;
/** A função do banco `dias_com_batida` existe? (dias-com-batida.sql) */
let funcaoDosDiasComBatida = true;
/** A função do banco `bater_ponto` existe? (ponto-pelo-servidor.sql) */
let funcaoBaterPonto = false;
/** O relógio do SERVIDOR na batida — de propósito diferente do aparelho. */
let horaDoServidor = '09:00';
let diaDoServidor = '2026-09-16';
/** O banco responde que a batida já existe (corrida entre dois aparelhos). */
let baterPontoJaExiste = false;
/** A recusa escrita pelo banco (P0001), quando há. */
let baterPontoRecusa: string | null = null;
/** A última janela de batidas que o serviço pediu ao banco. */
let janelaPedida: { inicio: string; fim: string } | null = null;

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
    obterConfiguracoes: () => ({
      toleranciaPontoMinutos: toleranciaDoTeste,
      toleranciaPorMarcacaoMinutos: toleranciaPorMarcacaoDoTeste,
    }),
  },
}));

/** Tolerância em vigor durante o teste. Reposta no beforeEach. */
let toleranciaDoTeste = 10;
/** O outro limite da CLT, em minutos por marcação. */
let toleranciaPorMarcacaoDoTeste = 5;

const CHAVE_REGISTROS = 'conecta_v4_registros_ponto';
const CHAVE_CODIGOS = 'conecta_v4_codigos_ponto_loja';

mock.module('./nuvem', () => ({
  nuvem: {
    assinarAtualizacoes: () => () => {},
    obterJanelaDoPonto: () => janelaPedida || { inicio: '2026-01-01', fim: '2026-12-31' },
    // As batidas de uma pessoa num período, do banco para o cache
    trazerMarcacoesDe: async (id: string, p: { inicio: string; fim: string }) => {
      const doBanco = bancoRegistros.filter((r) => r.colaboradorId === id && r.data >= p.inicio && r.data <= p.fim);
      const noCache = JSON.parse(armazenamento.getItem(CHAVE_REGISTROS) || '[]').filter(
        (r: any) => !(r.colaboradorId === id && r.data >= p.inicio && r.data <= p.fim)
      );
      armazenamento.setItem(CHAVE_REGISTROS, JSON.stringify([...noCache, ...doBanco]));
      return true;
    },
    // A função dias_com_batida_incompleta: dias com batida e menos de 4
    buscarDiasComBatidaIncompleta: async (inicio: string, fim: string) => {
      if (!funcaoDosIncompletos) return null;
      const dias = new Map<string, any>();
      for (const r of bancoRegistros) {
        if (r.data < inicio || r.data > fim) continue;
        const chave = `${r.colaboradorId}|${r.data}`;
        const d = dias.get(chave) || { colaboradorId: r.colaboradorId, data: r.data, tipos: [], horas: [] };
        d.tipos.push(r.tipo);
        d.horas.push(r.horaFormatada);
        dias.set(chave, d);
      }
      return [...dias.values()].filter((d) => d.tipos.length < 4);
    },
    // A função dias_com_batida: os dias em que cada pessoa bateu
    buscarDiasComBatida: async (inicio: string, fim: string) => {
      if (!funcaoDosDiasComBatida) return null;
      const porPessoa = new Map<string, Set<string>>();
      for (const r of bancoRegistros) {
        if (r.data < inicio || r.data > fim) continue;
        porPessoa.set(r.colaboradorId, (porPessoa.get(r.colaboradorId) || new Set()).add(r.data));
      }
      return [...porPessoa].map(([colaboradorId, dias]) => ({ colaboradorId, dias: [...dias].sort() }));
    },
    // Espelha o banco simulado no cache, como faz a ponte de verdade
    sincronizarPonto: async (periodo?: { inicio: string; fim: string }) => {
      if (periodo) janelaPedida = periodo;
      sincronizacoes++;
      armazenamento.setItem(CHAVE_REGISTROS, JSON.stringify(bancoRegistros));
      armazenamento.setItem(CHAVE_CODIGOS, JSON.stringify(bancoCodigos));
      return true;
    },
    /*
      A função bater_ponto: confere o código no "banco" e carimba a hora
      pelo relógio DELE (horaDoServidor), não pelo do aparelho. Desligada,
      responde como o banco sem o script (semFuncao).
    */
    baterPonto: async (d: { codigo: string; loja: string | null; tipo: string }) => {
      if (!funcaoBaterPonto) return { sucesso: false, semFuncao: true };
      if (baterPontoJaExiste) return { sucesso: false, duplicado: true };
      if (baterPontoRecusa) return { sucesso: false, erro: baterPontoRecusa };
      const oficial = bancoCodigos.find((c) =>
        d.loja ? c.loja === d.loja && c.codigo.toUpperCase() === d.codigo : c.codigo.toUpperCase() === d.codigo
      );
      if (!oficial) return { sucesso: false, erro: 'Código não reconhecido. Use o QR afixado na sua loja.' };
      const r = {
        id: `ponto-srv-${bancoRegistros.length}`, colaboradorId: colaboradorLogado.id, data: diaDoServidor,
        tipo: d.tipo, horario: new Date(`${diaDoServidor}T${horaDoServidor}:00`).toISOString(),
        horaFormatada: horaDoServidor, metodo: d.loja ? 'qrcode' : 'codigo_manual', loja: oficial.loja,
        criadoEm: new Date().toISOString(),
      };
      if (bancoRegistros.some((x) => x.colaboradorId === r.colaboradorId && x.data === r.data && x.tipo === r.tipo)) {
        return { sucesso: false, duplicado: true };
      }
      bancoRegistros.push(r);
      return { sucesso: true, registro: r };
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
      // O teste da gravação recusada liga isto
      if (bancoRecusaAjuste) return { sucesso: false, erro: 'sem permissão' };
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

const { servicoPonto, dataDeHoje, marcacoesEsperadas, motivoSemMarcacao } = await import(
  './ponto'
);

beforeEach(() => {
  armazenamento.clear();
  bancoRegistros = [];
  bancoCodigos = [];
  bancoAjustes = [];
  sincronizacoes = 0;
  janelaPedida = null;
  funcaoDosIncompletos = true;
  funcaoDosDiasComBatida = true;
  funcaoBaterPonto = false;
  horaDoServidor = '09:00';
  diaDoServidor = '2026-09-16';
  baterPontoJaExiste = false;
  baterPontoRecusa = null;
  modoNuvem = true;
  colaboradorLogado = ELIAS;
  equipe = [ELIAS, ANA];
  toleranciaDoTeste = 10;
  toleranciaPorMarcacaoDoTeste = 5;
  bancoRecusaAjuste = false;

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

/*
  O APARELHO SÓ MARCA (01/10/2026). A hora e o dia gravados são os do
  servidor; o código é conferido lá. O relógio da suíte (o "aparelho") está
  em 16/09 09:00 — o servidor, nestes testes, diz outra coisa.
*/
test('com bater_ponto no banco, a hora gravada é a do servidor, não a do aparelho', async () => {
  const codigo = await publicarCodigos();
  funcaoBaterPonto = true;
  horaDoServidor = '09:07';

  const res = await servicoPonto.registrarMarcacaoPorCodigo(codigo);
  expect(res.sucesso).toBe(true);
  expect(res.registro!.horaFormatada).toBe('09:07');
  expect(bancoRegistros).toHaveLength(1);
  expect(bancoRegistros[0].horaFormatada).toBe('09:07');
  // O aparelho guarda o que o servidor devolveu
  expect(servicoPonto.obterMarcacoesDoDia(ELIAS.id, '2026-09-16')[0].horaFormatada).toBe('09:07');
});

test('o código é conferido pelo banco: o aparelho nem precisa conhecê-lo', async () => {
  const codigo = await publicarCodigos();
  funcaoBaterPonto = true;
  // O aparelho de quem bate não enxerga mais os códigos das lojas
  armazenamento.removeItem('conecta_v4_codigos_ponto_loja');

  expect((await servicoPonto.registrarMarcacaoPorCodigo(codigo)).sucesso).toBe(true);

  const errado = await servicoPonto.registrarMarcacaoPorCodigo('ZZZ999');
  expect(errado.sucesso).toBe(false);
  expect(errado.erro).toContain('Código não reconhecido');
  expect(bancoRegistros).toHaveLength(1);
});

test('o que o banco recusa não é gravado pelo aparelho por outro caminho', async () => {
  const codigo = await publicarCodigos();
  funcaoBaterPonto = true;
  // Código válido, mas o banco recusa (batida fora de ordem, conta desativada...)
  baterPontoRecusa = 'Batida fora de ordem. Atualize a tela e tente de novo.';
  const res = await servicoPonto.registrarMarcacaoPorCodigo(codigo);
  expect(res.sucesso).toBe(false);
  expect(res.erro).toBe('Batida fora de ordem. Atualize a tela e tente de novo.');
  expect(bancoRegistros).toHaveLength(0);
});

test('batida repetida pelo bater_ponto é recusada como vinda de outro aparelho', async () => {
  const codigo = await publicarCodigos();
  funcaoBaterPonto = true;
  // O outro aparelho gravou a entrada no instante entre a sincronização e
  // a batida deste: o banco responde pela restrição única
  baterPontoJaExiste = true;
  const res = await servicoPonto.registrarMarcacaoPorCodigo(codigo);
  expect(res.sucesso).toBe(false);
  expect(res.erro).toContain('Entrada já foi registrada hoje, em outro aparelho');
  // E não caiu no caminho antigo gravando por conta própria
  expect(bancoRegistros).toHaveLength(0);
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

test('DENTRO DA TOLERÂNCIA: o banco de horas recebe ZERO', async () => {
  /**
   * O art. 58 §1º: variações até cinco minutos por marcação, com limite
   * de dez no dia, "NÃO SERÃO DESCONTADAS NEM COMPUTADAS como jornada
   * extraordinária". Nem descontadas nem computadas — os dois lados.
   *
   * O código citava esse artigo e fazia o contrário: gravava o valor
   * CHEIO, já aprovado, e ele entrava no saldo. Uma semana da Fernanda:
   *
   *     qua 23/09   8h15 contra 8h10   ->  +0h05 creditados
   *     sex 25/09   8h13 contra 8h10   ->  +0h03 creditados
   *
   * E no outro sentido, a Camila: 33 minutos de débito em 6 dias,
   * aprovados sozinhos. Em 190 dias úteis, 3 minutos por dia são −9h30
   * que ninguém decidiu descontar.
   */
  equipe = [CHEFE, CARLOS];
  colaboradorLogado = CARLOS;

  // 8h07 trabalhadas: 7 minutos além, dentro dos 10
  await fecharJornada(CARLOS, '2026-09-16', '08:00', '17:07');

  expect(servicoPonto.obterSaldoAcumulado(CARLOS.id)).toBe(0);
  expect(servicoPonto.obterSaldoPendente(CARLOS.id)).toBe(0);

  // Nem linha nova: seriam 85 pessoas × 22 dias de zeros por mês
  expect(servicoPonto.obterAjusteDoDia(CARLOS.id, '2026-09-16')).toBeNull();

  // E não aparece na fila de ninguém — a razão de a tolerância existir
  colaboradorLogado = CHEFE;
  expect(servicoPonto.obterPendenciasParaDecidir()).toHaveLength(0);
});

test('O RELÓGIO CONTINUA NO ESPELHO; o saldo do dia é o apurado', async () => {
  /**
   * A tolerância filtra o que vira SALDO, e não o que aconteceu.
   * Documento de ponto mostra o que aconteceu: a pessoa entrou 08:00 e
   * saiu 17:07, e o dia dela tem 7 minutos a mais.
   *
   * Esta função é a fronteira entre as duas coisas — é aqui que o fato
   * do dia vira crédito, débito ou nada. Zerar o espelho junto seria
   * apagar do documento uma batida que existiu.
   */
  equipe = [CHEFE, CARLOS];
  colaboradorLogado = CARLOS;

  await fecharJornada(CARLOS, '2026-09-16', '08:00', '17:07');

  const jornada = servicoPonto.obterJornadaDoDia(CARLOS.id, '2026-09-16');
  /**
   * O RELÓGIO continua no documento: 08:00, 17:07 e os 7 minutos a mais
   * (`saldoBrutoMinutos`). O SALDO DO DIA passou a ser o apurado, com a
   * tolerância — pedido do Elias, para o espelho, a semana e o banco de
   * horas darem o mesmo número. Antes o espelho dizia +0h07 e o banco,
   * zero.
   */
  expect(jornada.saldoBrutoMinutos).toBe(7);
  expect(jornada.saldoMinutos).toBe(0);
  expect(jornada.marcacoes.entrada?.horaFormatada).toBe('08:00');
  expect(jornada.marcacoes.saida?.horaFormatada).toBe('17:07');

  // Mas o banco de horas não recebeu nada
  expect(servicoPonto.obterSaldoAcumulado(CARLOS.id)).toBe(0);
});

test('A APURAÇÃO JÁ GRAVADA É ZERADA ao reapurar', async () => {
  /**
   * A cura dos saldos que já existem. Os débitos da Camila e os créditos
   * da Fernanda estão gravados e APROVADOS — reapurar tem de alcançá-los,
   * senão a regra nova só vale para o futuro e o passado fica torto para
   * sempre.
   *
   * O DIA TEM DE JÁ TER FECHADO: reapurar pula o dia em andamento, e o
   * relógio deste arquivo está em 16/09. Por isso o caso é no dia 15.
   */
  // O CHEFE precisa responder por ele: reapurar é de quem tem alçada
  const SOB_CHEFE = { ...CARLOS, responsavelId: 'ch' };
  equipe = [CHEFE, SOB_CHEFE];
  colaboradorLogado = SOB_CHEFE;

  // Um débito de 5 minutos, como os que estão no banco hoje
  armazenamento.setItem(
    'conecta_v4_ajustes_jornada',
    JSON.stringify([
      {
        id: 'velho', colaboradorId: CARLOS.id, data: '2026-09-15',
        tipo: 'debito', minutos: 5, minutosTrabalhados: 485, minutosPrevistos: 490,
        estado: 'aprovado', origem: 'tolerancia_automatica',
        criadoEm: '2026-09-15T18:00:00.000Z',
      },
    ])
  );
  expect(servicoPonto.obterSaldoAcumulado(CARLOS.id)).toBe(-5);

  await fecharJornada(SOB_CHEFE, '2026-09-15', '08:00', '17:05');
  colaboradorLogado = CHEFE;
  const res = await servicoPonto.reapurarPeriodo(CARLOS.id, '2026-09-15', '2026-09-15');

  expect(res.sucesso).toBe(true);
  expect(servicoPonto.obterSaldoAcumulado(CARLOS.id)).toBe(0);

  /**
   * ZERADA E NÃO APAGADA: apagar exigiria dar permissão de remoção a quem
   * bate o ponto, e aí bastaria apagar a linha para um débito sumir.
   */
  expect(servicoPonto.obterAjusteDoDia(CARLOS.id, '2026-09-15')?.minutos).toBe(0);
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
  /**
   * "Nem descontadas nem computadas" são dois verbos, e o segundo é o
   * que costuma ser esquecido. Se a regra valesse só para o débito, a
   * casa deixaria de descontar os minutos da pessoa e continuaria
   * creditando os dela — o que é generoso e igualmente fora da lei.
   */
  equipe = [CHEFE, CARLOS];
  colaboradorLogado = CARLOS;

  // 8 minutos a MENOS
  await fecharJornada(CARLOS, '2026-09-16', '08:00', '16:52');
  expect(servicoPonto.obterSaldoAcumulado(CARLOS.id)).toBe(0);
  expect(servicoPonto.obterAjusteDoDia(CARLOS.id, '2026-09-16')).toBeNull();

  // 8 minutos a MAIS, no dia seguinte
  await fecharJornada(CARLOS, '2026-09-17', '08:00', '17:08');
  expect(servicoPonto.obterSaldoAcumulado(CARLOS.id)).toBe(0);
  expect(servicoPonto.obterAjusteDoDia(CARLOS.id, '2026-09-17')).toBeNull();
});

test('O LIMITE É INCLUSIVO: exatamente 10 minutos ainda é tolerância', async () => {
  // A borda importa: a lei diz "até 10", e um erro de <= para < mandaria
  // para a fila um dia por pessoa a cada tanto, sem motivo nenhum.
  equipe = [CHEFE, CARLOS];
  colaboradorLogado = CARLOS;

  await fecharJornada(CARLOS, '2026-09-16', '08:00', '17:10');
  expect(servicoPonto.obterAjusteDoDia(CARLOS.id, '2026-09-16')).toBeNull();

  await fecharJornada(CARLOS, '2026-09-17', '08:00', '17:11');
  expect(servicoPonto.obterAjusteDoDia(CARLOS.id, '2026-09-17')!.estado).toBe('pendente');
  expect(servicoPonto.obterAjusteDoDia(CARLOS.id, '2026-09-17')!.minutos).toBe(11);
});

test('a tolerância é CONFIGURÁVEL, sem deploy', async () => {
  equipe = [CHEFE, CARLOS];
  colaboradorLogado = CARLOS;

  toleranciaDoTeste = 0;
  await fecharJornada(CARLOS, '2026-09-16', '08:00', '17:05');
  expect(servicoPonto.obterAjusteDoDia(CARLOS.id, '2026-09-16')!.estado).toBe('pendente');

  toleranciaDoTeste = 30;
  await fecharJornada(CARLOS, '2026-09-17', '08:00', '17:20');
  expect(servicoPonto.obterAjusteDoDia(CARLOS.id, '2026-09-17')).toBeNull();
  expect(servicoPonto.obterSaldoAcumulado(CARLOS.id)).toBe(0);
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

test('os dois turnos preveem a MESMA jornada: 8h da CLT (o relógio dá 8h10)', () => {
  // 01/10/2026: os 10 minutos do relógio são a compensação do sábado
  equipe = [GESTOR, DO_TURNO_A, DO_TURNO_B];

  const a = servicoPonto.obterJornadaDoDia(DO_TURNO_A.id, '2026-09-16');
  const b = servicoPonto.obterJornadaDoDia(DO_TURNO_B.id, '2026-09-16');

  expect(a.minutosPrevistos).toBe(480);
  expect(b.minutosPrevistos).toBe(480);
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

test('o almoço CURTO também pede motivo — o de 11 segundos do José Eduardo', () => {
  /*
    01/10/2026: sem conseguir bater no almoço, ele bateu a saída às 15:16:07
    e o retorno às 15:16:18. Só o intervalo LONGO pedia motivo, e um almoço
    de zero minuto entrou calado — virando 1h30 de hora a mais no dia.
  */
  equipe = [GESTOR, DO_TURNO_A];
  baterParcial(DO_TURNO_A, '2026-09-16', { entrada: '07:24', saida_almoco: '15:16' });
  const curto = servicoPonto.avaliarMarcacao(DO_TURNO_A.id, 'retorno_almoco', new Date('2026-09-16T15:16:18'));
  expect(curto.precisaMotivo).toBe(true);
  expect(curto.minutos).toBe(90);
  expect(curto.descricao).toBe('Intervalo de 0h00 — 1h30 a menos que os 1h30 do seu turno.');

  // O intervalo contratado, e o pouco mais curto dentro da tolerância, não perguntam
  bancoRegistros = [];
  baterParcial(DO_TURNO_A, '2026-09-16', { entrada: '07:30', saida_almoco: '12:30' });
  expect(servicoPonto.avaliarMarcacao(DO_TURNO_A.id, 'retorno_almoco', new Date('2026-09-16T14:00:00')).precisaMotivo).toBe(false);
  expect(servicoPonto.avaliarMarcacao(DO_TURNO_A.id, 'retorno_almoco', new Date('2026-09-16T13:52:00')).precisaMotivo).toBe(false);
  // E o longo continua perguntando
  expect(servicoPonto.avaliarMarcacao(DO_TURNO_A.id, 'retorno_almoco', new Date('2026-09-16T14:20:00')).descricao).toContain('além dos');
});

test('a tolerância vale também na entrada', () => {
  equipe = [GESTOR, DO_TURNO_A];
  // 5 minutos depois das 07:30: o limite por marcação da CLT. Era 8
  // dentro dos 10 do dia — mas a entrada é uma marcação, e 8 já é saldo.
  expect(
    servicoPonto.avaliarMarcacao(
      DO_TURNO_A.id, 'entrada', new Date('2026-09-16T07:35:00')
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

test('DIA PELA METADE VAI PARA "PONTOS INCOMPLETOS", NÃO PARA A FILA', async () => {
  /*
    Decisão do Elias (01/10/2026): a fila de decisão fica com hora extra,
    débito e falta. O dia que começou e não fechou pede a batida esquecida,
    e é dito com todas as letras: "bateu 2 de 4".
  */
  equipe = [GESTOR, DO_TURNO_A];
  colaboradorLogado = GESTOR;
  const { descreverPontoIncompleto, descreverBatidasQueFaltam } = await import('./ponto');

  // Entrou e foi almoçar; nunca voltou a bater
  baterParcial(DO_TURNO_A, diasAtras(3), { entrada: '07:30', saida_almoco: '12:30' });

  expect(await servicoPonto.levantarDiasIncompletos()).toBe(0);
  expect(servicoPonto.obterPendenciasParaDecidir()).toHaveLength(0);

  const [dia] = servicoPonto.obterPontosIncompletos(diasAtras(10), diasAtras(1));
  expect(dia.data).toBe(diasAtras(3));
  expect(dia.feitas).toBe(2);
  expect(dia.esperadas).toBe(4);
  expect(descreverPontoIncompleto(dia)).toBe('Do turno A bateu 2 de 4 — não fechou o dia');
  expect(descreverBatidasQueFaltam(dia.faltam)).toBe('Faltam: retorno do almoço e saída');
});

test('lançada a batida que falta, o dia sai de "Pontos incompletos"', async () => {
  equipe = [GESTOR, DO_TURNO_A];
  colaboradorLogado = GESTOR;
  baterParcial(DO_TURNO_A, diasAtras(3), {
    entrada: '07:30', saida_almoco: '12:30', retorno_almoco: '14:00',
  });
  expect(servicoPonto.obterPontosIncompletos(diasAtras(10), diasAtras(1))).toHaveLength(1);

  const res = await servicoPonto.ajustarMarcacao({
    colaboradorId: DO_TURNO_A.id, data: diasAtras(3), tipo: 'saida', hora: '17:10',
    justificativa: 'Esqueceu de bater a saída; confirmado com o líder',
  });
  expect(res.sucesso).toBe(true);
  expect(servicoPonto.obterPontosIncompletos(diasAtras(10), diasAtras(1))).toHaveLength(0);
});

test('a fila mostra o que está no banco: o número não oscila com o cache', () => {
  /*
    01/10/2026: um filtro perguntava ao CACHE se o dia tinha batida, e o
    cache é uma janela que as telas trocam — a fila ia de 1 a 6 e de volta,
    e cada subida virava aviso. O mesmo pedido tem de contar igual com ou
    sem as batidas no aparelho.
  */
  equipe = [GESTOR, DO_TURNO_A];
  colaboradorLogado = GESTOR;
  baterParcial(DO_TURNO_A, diasAtras(3), { entrada: '07:30' });
  bancoAjustes.push({
    id: 'antigo', colaboradorId: DO_TURNO_A.id, data: diasAtras(3), tipo: 'dia_incompleto',
    minutos: 490, minutosTrabalhados: 0, minutosPrevistos: 490, estado: 'pendente',
    origem: 'pendencia', criadoEm: new Date().toISOString(),
  });
  armazenamento.setItem('conecta_v4_ajustes_jornada', JSON.stringify(bancoAjustes));

  const comBatidas = servicoPonto.obterPendenciasParaDecidir().length;
  armazenamento.setItem(CHAVE_REGISTROS, JSON.stringify([]));
  const semBatidas = servicoPonto.obterPendenciasParaDecidir().length;

  expect(comBatidas).toBe(1);
  expect(semBatidas).toBe(comBatidas);
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
  emOutubro();
  equipe = [GESTOR, DO_TURNO_A];
  colaboradorLogado = GESTOR;
  await servicoPonto.levantarDiasIncompletos();

  // Só a falta de terça: as outras faltas da semana ficam na fila
  const alvo = servicoPonto.obterAjusteDoDia(DO_TURNO_A.id, '2026-10-06')!;
  const outras = servicoPonto.obterPendenciasParaDecidir().length - 1;
  const res = await servicoPonto.decidirDiaIncompleto(alvo.id, true);

  expect(res.sucesso).toBe(true);
  expect(servicoPonto.obterSaldoAcumulado(DO_TURNO_A.id)).toBe(0);
  expect(servicoPonto.obterPendenciasParaDecidir()).toHaveLength(outras);
});

test('MARCAR DÉBITO: o dia vira a jornada prevista, negativa', async () => {
  emOutubro();
  equipe = [GESTOR, DO_TURNO_A];
  colaboradorLogado = GESTOR;
  await servicoPonto.levantarDiasIncompletos();

  const alvo = servicoPonto.obterAjusteDoDia(DO_TURNO_A.id, '2026-10-06')!;
  await servicoPonto.decidirDiaIncompleto(alvo.id, false);

  // A jornada da CLT, 8h = 480 minutos, negativos (01/10/2026: era 8h10)
  expect(servicoPonto.obterSaldoAcumulado(DO_TURNO_A.id)).toBe(-480);
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
  emOutubro();
  equipe = [GESTOR, DO_TURNO_A];
  colaboradorLogado = GESTOR;

  const primeira = await servicoPonto.levantarDiasIncompletos();
  expect(primeira).toBeGreaterThan(0);
  expect(await servicoPonto.levantarDiasIncompletos()).toBe(0);
  expect(servicoPonto.obterPendenciasParaDecidir()).toHaveLength(primeira);
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
  emOutubro();
  equipe = [GESTOR, DO_TURNO_A, DO_TURNO_B];
  colaboradorLogado = GESTOR;
  await servicoPonto.levantarDiasIncompletos();
  const alvo = servicoPonto.obterAjusteDoDia(DO_TURNO_A.id, '2026-10-06')!;

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

test('A FOLGA APARECE NO ESPELHO, com o nome dela', async () => {
  /**
   * Pedido do Elias: "a folga deve aparecer no espelho do holerite".
   *
   * O previsto já era zerado, mas essa era só metade:
   * `marcacoesEsperadas` continuava esperando entrada e saída no dia de
   * folga, e o espelho imprimia `--:--` nas colunas — que num documento
   * de ponto tem UM significado só: "deveria ter batido e não bateu".
   *
   * O direito mensal da pessoa aparecia no papel como esquecimento dela.
   */
  equipe = [GESTOR, DO_TURNO_A];
  armazenamento.setItem(
    'conecta_v4_justificativas_ausencia',
    JSON.stringify([
      {
        id: 'f9', colaboradorId: DO_TURNO_A.id, dataInicio: '2026-09-19',
        dataFim: '2026-09-19', tipo: 'folga_sabado', estado: 'aprovada',
        criadoEm: new Date().toISOString(),
      },
    ])
  );

  // Nenhuma batida é cobrada no dia de folga
  expect(marcacoesEsperadas('2026-09-19', DO_TURNO_A as any)).toEqual([]);

  // E a célula vazia diz POR QUE está vazia
  expect(motivoSemMarcacao('2026-09-19', 'entrada', DO_TURNO_A as any)).toBe('Folga');
  expect(motivoSemMarcacao('2026-09-19', 'saida', DO_TURNO_A as any)).toBe('Folga');

  /**
   * "Folga" e não "Sábado": a folga de sábado É um sábado, e o rótulo
   * genérico diria a metade errada da verdade. O holerite precisa mostrar
   * que o dia foi o direito mensal, e não um sábado comum.
   */
  expect(motivoSemMarcacao('2026-09-19', 'entrada', DO_TURNO_A as any)).not.toBe('Sábado');

  armazenamento.removeItem('conecta_v4_justificativas_ausencia');
});

test('ATESTADO E FÉRIAS saem com o rótulo de cada um', async () => {
  /**
   * A guarda do teste acima: se o rótulo fosse fixo em 'Folga', todo dia
   * abonado sairia como folga — e um mês de férias apareceria no espelho
   * como trinta folgas de sábado.
   */
  equipe = [GESTOR, DO_TURNO_A];
  armazenamento.setItem(
    'conecta_v4_justificativas_ausencia',
    JSON.stringify([
      {
        id: 'f10', colaboradorId: DO_TURNO_A.id, dataInicio: '2026-09-21',
        dataFim: '2026-09-21', tipo: 'atestado', estado: 'aprovada',
        criadoEm: new Date().toISOString(),
      },
      {
        id: 'f11', colaboradorId: DO_TURNO_A.id, dataInicio: '2026-09-22',
        dataFim: '2026-09-22', tipo: 'ferias', estado: 'aprovada',
        criadoEm: new Date().toISOString(),
      },
    ])
  );

  expect(motivoSemMarcacao('2026-09-21', 'entrada', DO_TURNO_A as any)).toBe('Atestado');
  expect(motivoSemMarcacao('2026-09-22', 'entrada', DO_TURNO_A as any)).toBe('Férias');

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

// ============================================================
// FERIADO NÃO COBRA JORNADA
// ============================================================

const CHAVE_FERIADOS_TESTE = 'conecta_v4_feriados';

const comFeriados = <T,>(lista: any[], corpo: () => T): T => {
  armazenamento.setItem(CHAVE_FERIADOS_TESTE, JSON.stringify(lista));
  try {
    return corpo();
  } finally {
    armazenamento.removeItem(CHAVE_FERIADOS_TESTE);
  }
};

test('FERIADO NÃO VIRA DÉBITO NO BANCO DE HORAS', async () => {
  /**
   * Sem o calendário, todo 7 de setembro contava como dia inteiro de
   * débito para a rede inteira — e o espelho mostrava um dia sem batida,
   * que se lê como falta.
   *
   * O defeito é do tipo mais difícil de achar: a causa é a AUSÊNCIA de um
   * registro, e ausência não aparece em lugar nenhum.
   */
  equipe = [ELIAS, ANA];
  colaboradorLogado = ANA;

  /**
   * O dia de controle era 07/09 — que É a Independência do Brasil.
   *
   * O teste usava o próprio feriado como "segunda-feira comum" e passava,
   * porque naquela época feriado só existia se alguém tivesse ido à tela
   * de Feriados cadastrar. Com o cálculo automático a premissa caiu, e o
   * teste apontou para ela. O controle agora é 14/09, uma segunda sem
   * nada em cima.
   */
  const semFeriado = servicoPonto.obterJornadaDoDia(ANA.id, '2026-09-14');
  expect(semFeriado.minutosPrevistos).toBeGreaterThan(0);

  /**
   * E o 7 de setembro fecha SOZINHO, sem ninguém cadastrar. Era isto que
   * o comentário acima prometia e o código não entregava: a causa do
   * defeito era a AUSÊNCIA de um registro, e a correção de verdade é não
   * depender de registro nenhum.
   */
  expect(servicoPonto.obterJornadaDoDia(ANA.id, '2026-09-07').minutosPrevistos).toBe(0);

  comFeriados(
    [
      {
        id: 'f1',
        data: '2026-09-07',
        nome: 'Independência do Brasil',
        minutosPrevistos: 0,
        criadoEm: '',
      },
    ],
    () => {
      const comFeriado = servicoPonto.obterJornadaDoDia(ANA.id, '2026-09-07');
      expect(comFeriado.minutosPrevistos).toBe(0);
    }
  );
});

test('MEIO EXPEDIENTE PREVÊ O QUE FOI CADASTRADO', async () => {
  /**
   * 24 e 31 de dezembro a rede abre meio período. Tratar feriado como
   * "fecha ou não fecha" obrigaria a escolher entre cobrar o dia inteiro
   * e não cobrar nada — as duas erradas.
   */
  equipe = [ELIAS, ANA];
  colaboradorLogado = ANA;

  comFeriados(
    [
      {
        id: 'f2',
        data: '2026-12-24',
        nome: 'Véspera de Natal',
        minutosPrevistos: 240,
        criadoEm: '',
      },
    ],
    () => {
      expect(servicoPonto.obterJornadaDoDia(ANA.id, '2026-12-24').minutosPrevistos).toBe(240);
      // E o dia espera entrada e saída: a pessoa veio, só que menos tempo
      expect(marcacoesEsperadas('2026-12-24', ANA as any)).toEqual(['entrada', 'saida']);
    }
  );
});

test('FERIADO FECHADO NÃO PEDE BATIDA NENHUMA', async () => {
  /**
   * Sem isto o dia entrava na conta de "dias sem fechar" e ia parar na
   * fila do responsável, pedindo decisão sobre um dia em que a loja
   * estava de portas fechadas.
   */
  comFeriados(
    [{ id: 'f3', data: '2026-09-07', nome: 'Independência', minutosPrevistos: 0, criadoEm: '' }],
    () => {
      expect(marcacoesEsperadas('2026-09-07', ANA as any)).toEqual([]);
    }
  );
});

test('FERIADO QUE CAI NO SÁBADO FECHA A LOJA DO MESMO JEITO', async () => {
  /**
   * O sábado prevê 4 horas. Se o feriado fosse consultado depois da
   * regra do sábado, o dia continuaria cobrando as 4 horas de uma loja
   * fechada.
   */
  equipe = [ELIAS, ANA];
  colaboradorLogado = ANA;

  // 2026-09-05 é sábado
  expect(servicoPonto.obterJornadaDoDia(ANA.id, '2026-09-05').minutosPrevistos).toBeGreaterThan(0);

  comFeriados(
    [{ id: 'f4', data: '2026-09-05', nome: 'Feriado no sábado', minutosPrevistos: 0, criadoEm: '' }],
    () => {
      expect(servicoPonto.obterJornadaDoDia(ANA.id, '2026-09-05').minutosPrevistos).toBe(0);
    }
  );
});

test('DOMINGO NÃO ESPERA BATIDA NENHUMA', async () => {
  /**
   * Estava devolvendo as quatro, e o efeito era silencioso: todo domingo
   * passado entrava na lista de dias com pendência da semana, como se a
   * pessoa tivesse esquecido de bater num dia em que a loja nem abre.
   */
  // 2026-09-20 é domingo
  expect(marcacoesEsperadas('2026-09-20', ANA as any)).toEqual([]);

  // E o sábado continua com duas, que é o que a loja abre
  expect(marcacoesEsperadas('2026-09-19', ANA as any)).toEqual(['entrada', 'saida']);

  // Dia útil segue com as quatro
  expect(marcacoesEsperadas('2026-09-21', ANA as any)).toHaveLength(4);
});

test('DOMINGO NÃO RECEBE HORÁRIO: nem batida, nem lançamento', async () => {
  /**
   * Era "domingo trabalhado ainda pode ser batido", como hora extra.
   * Decisão do Elias (29/09/2026): o domingo aparece no espelho escrito
   * "Domingo", "sem a possibilidade de registrar hora". A trava é da
   * regra, e não só da tela: a batida e a correção a respeitam.
   */
  equipe = [ELIAS, ANA];
  colaboradorLogado = ANA;

  // 2026-09-20 é domingo: não há próxima batida
  expect(servicoPonto.obterProximaMarcacao(ANA.id, '2026-09-20')).toBeNull();

  // Nem o RH lança horário no domingo
  colaboradorLogado = ELIAS;
  const res = await servicoPonto.ajustarMarcacao({
    colaboradorId: ANA.id, data: '2026-09-20', tipo: 'entrada', hora: '08:00',
    justificativa: 'Inventário',
  });
  expect(res.sucesso).toBe(false);
  expect(res.erro).toContain('Domingo');

  // Sábado e dia útil continuam aceitando
  expect(servicoPonto.obterProximaMarcacao(ANA.id, '2026-09-19')).toBe('entrada');
});

test('A CÉLULA VAZIA DIZ POR QUE ESTÁ VAZIA', async () => {
  /**
   * `--:--` tem UM significado só: "deveria ter batido e não bateu". No
   * sábado o almoço não existe, e imprimir `--:--` ali fazia o espelho
   * acusar duas batidas esquecidas em todo sábado do mês.
   */
  const { motivoSemMarcacao } = await import('./ponto');

  // Sábado: entrada e saída são esperadas; o almoço, não
  expect(motivoSemMarcacao('2026-09-19', 'entrada', ANA as any)).toBeNull();
  expect(motivoSemMarcacao('2026-09-19', 'saida', ANA as any)).toBeNull();
  expect(motivoSemMarcacao('2026-09-19', 'saida_almoco', ANA as any)).toBe('Sábado');
  expect(motivoSemMarcacao('2026-09-19', 'retorno_almoco', ANA as any)).toBe('Sábado');

  // Domingo: nenhuma é esperada
  expect(motivoSemMarcacao('2026-09-20', 'entrada', ANA as any)).toBe('Domingo');

  // Dia útil: todas são esperadas, e a célula vazia continua sendo `--:--`
  expect(motivoSemMarcacao('2026-09-21', 'saida_almoco', ANA as any)).toBeNull();
});

test('o feriado aparece pelo NOME dele na célula', async () => {
  const { motivoSemMarcacao } = await import('./ponto');

  comFeriados(
    [{ id: 'f5', data: '2026-09-07', nome: 'Independência do Brasil', minutosPrevistos: 0, criadoEm: '' }],
    () => {
      expect(motivoSemMarcacao('2026-09-07', 'entrada', ANA as any)).toBe(
        'Independência do Brasil'
      );
    }
  );
});

test('O HORÁRIO BATIDO VENCE O RÓTULO NO ESPELHO', async () => {
  /**
   * Hora extra no feriado, domingo trabalhado: o documento tem de mostrar
   * o que ACONTECEU, não o que era previsto. Se o rótulo vencesse, a
   * batida sumiria do papel — e é justamente a batida que prova a hora
   * extra.
   */
  equipe = [ELIAS, ANA];
  colaboradorLogado = ELIAS;

  bancoRegistros = [
    {
      id: 'r-dom',
      colaborador_id: ANA.id,
      data: '2026-09-20',
      tipo: 'entrada',
      horario: new Date(2026, 8, 20, 8, 0).toISOString(),
      hora_formatada: '08:00',
      metodo: 'qrcode',
      loja: 'Pirassununga',
      criado_em: new Date().toISOString(),
    },
  ];
  armazenamento.setItem(
    'conecta_v4_registros_ponto',
    JSON.stringify([
      {
        id: 'r-dom',
        colaboradorId: ANA.id,
        data: '2026-09-20',
        tipo: 'entrada',
        horario: new Date(2026, 8, 20, 8, 0).toISOString(),
        horaFormatada: '08:00',
        metodo: 'qrcode',
        loja: 'Pirassununga',
        criadoEm: new Date().toISOString(),
      },
    ])
  );

  const html = servicoPonto.gerarHtmlEspelho('2026-09-20', '2026-09-20', [ANA.id]);

  // A batida do domingo está no papel
  expect(html).toContain('08:00');
  // E as colunas que ninguém bateu dizem o motivo
  expect(html).toContain('Domingo');
});

test('CORRIGIR A BATIDA REESCREVE A PENDÊNCIA, E NÃO DEIXA A VELHA', async () => {
  /**
   * O defeito relatado: a líder corrigiu a batida de um sábado — 08:00 e
   * 12:01 — e a fila continuou dizendo "trabalhou 2h28 de 4h00", com
   * débito de 1h32. Dois lugares do sistema mostrando dias diferentes do
   * MESMO dia.
   *
   * A apuração guarda os minutos congelados no momento em que nasceu. Se
   * a correção não a reescrever, o número velho fica na fila para sempre.
   */
  const SABADO = '2026-09-05';
  equipe = [ELIAS, ANA];
  colaboradorLogado = ELIAS;

  // A pessoa bateu e saiu cedo: 08:00 às 10:28
  armazenamento.setItem(
    'conecta_v4_registros_ponto',
    JSON.stringify([
      {
        id: 'r1', colaboradorId: ANA.id, data: SABADO, tipo: 'entrada',
        horario: new Date(2026, 8, 5, 8, 0).toISOString(), horaFormatada: '08:00',
        metodo: 'qrcode', loja: 'Pirassununga', criadoEm: '',
      },
      {
        id: 'r2', colaboradorId: ANA.id, data: SABADO, tipo: 'saida',
        horario: new Date(2026, 8, 5, 10, 28).toISOString(), horaFormatada: '10:28',
        metodo: 'qrcode', loja: 'Pirassununga', criadoEm: '',
      },
    ])
  );

  await servicoPonto.apurarDia(ANA.id, SABADO);

  const pendente = servicoPonto.obterAjusteDoDia(ANA.id, SABADO);
  expect(pendente?.estado).toBe('pendente');
  expect(pendente?.tipo).toBe('debito');
  expect(pendente?.minutosTrabalhados).toBe(148); // 2h28

  // Agora a correção: a saída era 12:01
  armazenamento.setItem(
    'conecta_v4_registros_ponto',
    JSON.stringify([
      {
        id: 'r1', colaboradorId: ANA.id, data: SABADO, tipo: 'entrada',
        horario: new Date(2026, 8, 5, 8, 0).toISOString(), horaFormatada: '08:00',
        metodo: 'ajuste_lider', loja: 'Pirassununga', criadoEm: '',
      },
      {
        id: 'r2', colaboradorId: ANA.id, data: SABADO, tipo: 'saida',
        horario: new Date(2026, 8, 5, 12, 1).toISOString(), horaFormatada: '12:01',
        metodo: 'ajuste_lider', loja: 'Pirassununga', criadoEm: '',
      },
    ])
  );

  await servicoPonto.apurarDia(ANA.id, SABADO);

  const depois = servicoPonto.obterAjusteDoDia(ANA.id, SABADO);

  // O número velho NÃO pode ter sobrevivido
  expect(depois?.minutosTrabalhados).toBe(241); // 4h01
  // 1 minuto a mais cabe na tolerância: sai da fila
  expect(depois?.estado).toBe('aprovado');
  expect(depois?.origem).toBe('tolerancia_automatica');
});

test('DIA QUE PASSA A FECHAR EXATO SAI DA FILA SEM SER APAGADO', async () => {
  /**
   * Apagar exigiria dar permissão de remoção à própria pessoa — e aí
   * bastaria apagar a linha para um débito sumir, já que a apuração só é
   * refeita quando alguém bate ou corrige.
   *
   * Reescrever tira da fila e preserva o histórico.
   */
  const DIA = '2026-09-18'; // sexta
  // Carga de 8h10, como a da Fernanda: é o turno da rede
  const COM_TURNO = { ...ANA, cargaHorariaDiariaMinutos: 490 };
  equipe = [ELIAS, COM_TURNO];
  colaboradorLogado = ELIAS;

  const bater = (saida: [number, number]) =>
    armazenamento.setItem(
      'conecta_v4_registros_ponto',
      JSON.stringify([
        { id: 'a', colaboradorId: ANA.id, data: DIA, tipo: 'entrada',
          horario: new Date(2026, 8, 18, 7, 30).toISOString(), horaFormatada: '07:30',
          metodo: 'qrcode', loja: 'Pirassununga', criadoEm: '' },
        { id: 'b', colaboradorId: ANA.id, data: DIA, tipo: 'saida_almoco',
          horario: new Date(2026, 8, 18, 12, 30).toISOString(), horaFormatada: '12:30',
          metodo: 'qrcode', loja: 'Pirassununga', criadoEm: '' },
        { id: 'c', colaboradorId: ANA.id, data: DIA, tipo: 'retorno_almoco',
          horario: new Date(2026, 8, 18, 14, 0).toISOString(), horaFormatada: '14:00',
          metodo: 'qrcode', loja: 'Pirassununga', criadoEm: '' },
        { id: 'd', colaboradorId: ANA.id, data: DIA, tipo: 'saida',
          horario: new Date(2026, 8, 18, saida[0], saida[1]).toISOString(),
          horaFormatada: `${saida[0]}:${String(saida[1]).padStart(2, '0')}`,
          metodo: 'qrcode', loja: 'Pirassununga', criadoEm: '' },
      ])
    );

  // Saiu 16:37: faltam 33 minutos
  bater([16, 37]);
  await servicoPonto.apurarDia(ANA.id, DIA);
  expect(servicoPonto.obterAjusteDoDia(ANA.id, DIA)?.estado).toBe('pendente');
  expect(servicoPonto.obterAjusteDoDia(ANA.id, DIA)?.minutos).toBe(33);

  // Corrigido para 17:10: o dia fecha exato
  bater([17, 10]);
  await servicoPonto.apurarDia(ANA.id, DIA);

  const depois = servicoPonto.obterAjusteDoDia(ANA.id, DIA);
  // A linha continua existindo — o histórico não some
  expect(depois).toBeDefined();
  // Mas não está mais na fila
  expect(depois?.estado).toBe('aprovado');
  expect(depois?.minutos).toBe(0);
});

test('BANCO RECUSOU: A TELA NÃO PODE DIZER QUE CORRIGIU', async () => {
  /**
   * O padrão que este projeto já pagou caro: mandar para o banco e não
   * esperar. A tela mostra o dia resolvido, o banco continua com a
   * pendência antiga — e a próxima sincronização traz o número velho de
   * volta, sem explicação para ninguém.
   *
   * Aqui a ordem é banco PRIMEIRO. Recusou, o aparelho não muda.
   */
  const DIA = '2026-09-18';
  const COM_TURNO = { ...ANA, cargaHorariaDiariaMinutos: 490 };
  equipe = [ELIAS, COM_TURNO];
  colaboradorLogado = ELIAS;

  const marcar = (h: number, m: number) =>
    armazenamento.setItem(
      'conecta_v4_registros_ponto',
      JSON.stringify([
        { id: 'a', colaboradorId: ANA.id, data: DIA, tipo: 'entrada',
          horario: new Date(2026, 8, 18, 7, 30).toISOString(), horaFormatada: '07:30',
          metodo: 'qrcode', loja: 'Pirassununga', criadoEm: '' },
        { id: 'b', colaboradorId: ANA.id, data: DIA, tipo: 'saida_almoco',
          horario: new Date(2026, 8, 18, 12, 30).toISOString(), horaFormatada: '12:30',
          metodo: 'qrcode', loja: 'Pirassununga', criadoEm: '' },
        { id: 'c', colaboradorId: ANA.id, data: DIA, tipo: 'retorno_almoco',
          horario: new Date(2026, 8, 18, 14, 0).toISOString(), horaFormatada: '14:00',
          metodo: 'qrcode', loja: 'Pirassununga', criadoEm: '' },
        { id: 'd', colaboradorId: ANA.id, data: DIA, tipo: 'saida',
          horario: new Date(2026, 8, 18, h, m).toISOString(),
          horaFormatada: `${h}:${String(m).padStart(2, '0')}`,
          metodo: 'qrcode', loja: 'Pirassununga', criadoEm: '' },
      ])
    );

  marcar(16, 37);
  await servicoPonto.apurarDia(ANA.id, DIA);
  expect(servicoPonto.obterAjusteDoDia(ANA.id, DIA)?.minutos).toBe(33);

  // Agora o banco recusa, e a correção chega
  bancoRecusaAjuste = true;
  marcar(17, 10);
  await servicoPonto.apurarDia(ANA.id, DIA);

  // A pendência antiga CONTINUA, porque foi o que o banco guardou.
  // Mostrar "resolvido" aqui seria a tela mentindo.
  const depois = servicoPonto.obterAjusteDoDia(ANA.id, DIA);
  expect(depois?.estado).toBe('pendente');
  expect(depois?.minutos).toBe(33);
});

// ============================================================
// OS DOIS LIMITES DO ART. 58 §1º DA CLT
// ============================================================

/**
 * Quem cumpre o TURNO A da rede: 07:30 · 12:30 · 14:00 · 17:10, 8h10.
 *
 * O limite por marcação só vale quando o sistema conhece o horário de
 * cada batida — e ele só conhece quando a carga da ficha fecha com o
 * turno. Por isso este colaborador existe separado do CARLOS, cuja
 * ficha tem 8h00 e não corresponde a turno nenhum.
 */
const DO_TURNO = {
  ...ELIAS,
  id: 'turno-a',
  nome: 'Do Turno A',
  login: 'turnoa',
  nivel: 1,
  setor: 'Balcão',
  cargaHorariaDiariaMinutos: 490,
};

const baterTurnoA = async (data: string, saida: string, entrada = '07:30') => {
  const marcar = (tipo: string, hora: string) => ({
    id: `t-${tipo}`, colaboradorId: DO_TURNO.id, data, tipo,
    horario: new Date(`${data}T${hora}:00`).toISOString(), horaFormatada: hora,
    metodo: 'qrcode', loja: DO_TURNO.loja, criadoEm: '',
  });
  armazenamento.setItem(
    CHAVE_REGISTROS,
    JSON.stringify([
      marcar('entrada', entrada),
      marcar('saida_almoco', '12:30'),
      marcar('retorno_almoco', '14:00'),
      marcar('saida', saida),
    ])
  );
  await servicoPonto.apurarDia(DO_TURNO.id, data);
};

test('UMA VARIAÇÃO DE 8 MINUTOS NÃO É MAIS TOLERADA', async () => {
  /**
   * O art. 58 §1º traz DOIS limites: cinco minutos em CADA marcação,
   * observado o máximo de dez no dia. O sistema conhecia só o segundo — e
   * por isso era mais permissivo que a lei justamente aqui: quem saía 8
   * minutos mais cedo não gerava nada, quando pela lei esses 8 minutos
   * contam.
   */
  equipe = [CHEFE, DO_TURNO];
  colaboradorLogado = DO_TURNO;

  // Saída 17:02 em vez de 17:10: 8 minutos numa marcação só
  await baterTurnoA('2026-09-16', '17:02');

  const ajuste = servicoPonto.obterAjusteDoDia(DO_TURNO.id, '2026-09-16')!;
  expect(ajuste.estado).toBe('pendente');
  expect(ajuste.minutos).toBe(8);
});

test('DUAS VARIAÇÕES DE 4 MINUTOS CONTINUAM TOLERADAS', async () => {
  /**
   * O outro lado, e é ele que impede o aperto de virar exagero: 4 + 4
   * cabe nos dois limites da lei — cinco em cada, oito no dia.
   */
  equipe = [CHEFE, DO_TURNO];
  colaboradorLogado = DO_TURNO;

  // Entra 4 min atrasado e sai 4 min atrasado: nada muda no total
  await baterTurnoA('2026-09-16', '17:14', '07:34');

  const ajuste = servicoPonto.obterAjusteDoDia(DO_TURNO.id, '2026-09-16');
  // Diferença zero: o dia fecha exato, nem entra na conta
  expect(ajuste?.estado ?? 'sem apuração').not.toBe('pendente');
});

test('QUATRO MINUTOS A MENOS NUMA MARCAÇÃO SÓ SEGUE TOLERADO', async () => {
  equipe = [CHEFE, DO_TURNO];
  colaboradorLogado = DO_TURNO;

  // Saída 17:06: 4 minutos, dentro dos dois limites
  await baterTurnoA('2026-09-16', '17:06');

  // Dentro dos dois limites: o banco de horas nao recebe nada
  expect(servicoPonto.obterAjusteDoDia(DO_TURNO.id, '2026-09-16')).toBeNull();
  expect(servicoPonto.obterSaldoAcumulado(DO_TURNO.id)).toBe(0);
});

test('QUEM NÃO CUMPRE TURNO DA REDE SÓ RESPONDE PELO LIMITE DO DIA', async () => {
  /**
   * A ficha pode ter carga própria — o estágio, ou alguém com horário
   * combinado com a área. Aí os horários do turno NÃO são os dela, e
   * comparar acusaria trinta minutos de variação todo dia.
   *
   * O sistema admite que não sabe, e vale só o limite do dia. O CARLOS
   * tem 8h00 na ficha, que não fecha com nenhum turno.
   */
  equipe = [CHEFE, CARLOS];
  colaboradorLogado = CARLOS;

  // 8h07: sete minutos além, numa marcação só — pelo turno seria recusado
  await fecharJornada(CARLOS, '2026-09-16', '08:00', '17:07');

  expect(servicoPonto.obterAjusteDoDia(CARLOS.id, '2026-09-16')).toBeNull();
  expect(servicoPonto.obterSaldoAcumulado(CARLOS.id)).toBe(0);
  expect(servicoPonto.maiorVariacaoDoDia(CARLOS.id, '2026-09-16')).toBeNull();
});

test('o limite por marcação é CONFIGURÁVEL, como o do dia', async () => {
  equipe = [CHEFE, DO_TURNO];
  colaboradorLogado = DO_TURNO;

  // Com o limite frouxo em 9, a variação de 8 volta a caber
  toleranciaPorMarcacaoDoTeste = 9;
  await baterTurnoA('2026-09-16', '17:02');
  expect(servicoPonto.obterAjusteDoDia(DO_TURNO.id, '2026-09-16')).toBeNull();

  // E com o limite no numero da lei, a mesma variacao vira pendencia
  toleranciaPorMarcacaoDoTeste = 5;
  await baterTurnoA('2026-09-17', '17:02');
  expect(servicoPonto.obterAjusteDoDia(DO_TURNO.id, '2026-09-17')?.estado).toBe('pendente');
});

test('O PADRÃO É O NÚMERO DA LEI: 5 minutos por marcação, 10 no dia', async () => {
  /**
   * Os dois números não são escolha nossa. Estão no art. 58 §1º da CLT:
   *
   *   "variações de horário no registro de ponto não excedentes de CINCO
   *    minutos, observado o limite máximo de DEZ minutos diários"
   *
   * São configuráveis porque a rede pode querer ser mais generosa — mas
   * o padrão tem de ser o da lei, senão o sistema nasce fora dela.
   */
  const { TOLERANCIA_PONTO_PADRAO_MINUTOS, TOLERANCIA_POR_MARCACAO_PADRAO_MINUTOS } =
    await import('../tipos');

  expect(TOLERANCIA_POR_MARCACAO_PADRAO_MINUTOS).toBe(5);
  expect(TOLERANCIA_PONTO_PADRAO_MINUTOS).toBe(10);

  // E é para ele que o serviço cai quando ninguém configurou
  toleranciaPorMarcacaoDoTeste = undefined as any;
  expect(servicoPonto.obterToleranciaPorMarcacaoMinutos()).toBe(5);
});

// ============================================================
// QUEM CORRIGE A BATIDA JÁ DECIDIU O DIA
//
// O DEFEITO, relatado pelo Elias: "ao atualizar o espelho no modo RH ele
// manda solicitação de aprovação para o líder do setor".
//
// Pedir ao líder que carimbe o horário que o RH acabou de afirmar inverte
// a hierarquia — e enche a fila de quem não tem o que julgar ali: a única
// informação que o líder teria é a justificativa que o RH escreveu.
// ============================================================

test('correção do RH NÃO vira pendência para o líder', async () => {
  montarEquipe(ELIAS);

  // Um dia fechado com uma hora a mais: fora da tolerância, viraria fila
  await fecharJornada(PEDRO, '2026-09-16', '08:00', '18:00');
  expect(servicoPonto.obterAjusteDoDia(PEDRO.id, '2026-09-16')!.estado).toBe('pendente');

  // O RH corrige a saída para o horário certo
  await servicoPonto.ajustarMarcacao({
    colaboradorId: PEDRO.id, data: '2026-09-16', tipo: 'saida',
    hora: '17:30', justificativa: 'Cartão não leu na saída',
  });

  const ajuste = servicoPonto.obterAjusteDoDia(PEDRO.id, '2026-09-16')!;
  expect(ajuste.estado).toBe('aprovado');
  expect(ajuste.origem).toBe('correcao_manual');
  // E assinado: ponto é registro trabalhista, alguém responde por ele
  expect(ajuste.aprovadorId).toBe(ELIAS.id);
  expect(ajuste.aprovadorNome).toBe('Elias');
});

test('a batida NORMAL continua virando pendência', async () => {
  /**
   * A correção nasce decidida porque quem corrigiu tem autoridade. Bater
   * o próprio ponto não é corrigir nada — se isto passasse, qualquer um
   * aprovaria a própria hora extra batendo o cartão.
   */
  montarEquipe(PEDRO);
  await fecharJornada(PEDRO, '2026-09-16', '08:00', '18:00');

  const ajuste = servicoPonto.obterAjusteDoDia(PEDRO.id, '2026-09-16')!;
  expect(ajuste.estado).toBe('pendente');
  expect(ajuste.aprovadorId).toBeUndefined();
});

test('o LÍDER também decide o dia que ele corrigiu', async () => {
  // A regra é da autoridade sobre a pessoa, e não do cargo de RH
  montarEquipe(LIDER_BALCAO);
  await fecharJornada(PEDRO, '2026-09-16', '08:00', '18:00');

  await servicoPonto.ajustarMarcacao({
    colaboradorId: PEDRO.id, data: '2026-09-16', tipo: 'saida',
    hora: '17:30', justificativa: 'Corrigido pela líder',
  });

  const ajuste = servicoPonto.obterAjusteDoDia(PEDRO.id, '2026-09-16')!;
  expect(ajuste.estado).toBe('aprovado');
  expect(ajuste.aprovadorId).toBe(LIDER_BALCAO.id);
});

// ============================================================
// O SALDO PRESO DA LYVIA
//
// "a Lyvia ficou com o saldo de hora negativo mesmo estando com a sua
// carga horaria correta."
//
// O dia dela fechou com débito enquanto a jornada ainda era lida errada.
// O débito foi decidido. Depois a batida foi corrigida — e o débito velho
// continuou no saldo, porque a apuração voltava antes de refazer conta
// nenhuma quando o dia já tinha decisão.
// ============================================================

test('dia JÁ DECIDIDO é refeito quando a batida é corrigida', async () => {
  montarEquipe(ELIAS);
  await fecharJornada(PEDRO, '2026-09-16', '08:00', '18:00');

  // Alguém decide o débito/extra do jeito que estava
  await servicoPonto.decidirAjuste(
    servicoPonto.obterAjusteDoDia(PEDRO.id, '2026-09-16')!.id,
    true
  );
  expect(servicoPonto.obterSaldoAcumulado(PEDRO.id)).toBe(60);

  // E então a batida é corrigida para o horário certo
  await servicoPonto.ajustarMarcacao({
    colaboradorId: PEDRO.id, data: '2026-09-16', tipo: 'saida',
    hora: '17:00', justificativa: 'Horário conferido no espelho',
  });

  /**
   * O saldo TEM de acompanhar. Antes ficava nos 60 minutos de um dia que
   * não existe mais — e era isso que a Lyvia via: carga certa na ficha,
   * saldo negativo na tela.
   */
  expect(servicoPonto.obterSaldoAcumulado(PEDRO.id)).toBe(0);
});

test('a correção que zera a diferença tira o débito do saldo', async () => {
  montarEquipe(ELIAS);
  // Uma hora a MENOS, decidida como débito
  await fecharJornada(PEDRO, '2026-09-16', '08:00', '16:00');
  await servicoPonto.decidirAjuste(
    servicoPonto.obterAjusteDoDia(PEDRO.id, '2026-09-16')!.id,
    true
  );
  expect(servicoPonto.obterSaldoAcumulado(PEDRO.id)).toBe(-60);

  await servicoPonto.ajustarMarcacao({
    colaboradorId: PEDRO.id, data: '2026-09-16', tipo: 'saida',
    hora: '17:00', justificativa: 'Bateu no relógio da loja',
  });

  expect(servicoPonto.obterSaldoAcumulado(PEDRO.id)).toBe(0);

  /**
   * E o dia zerado também é ASSINADO por quem corrigiu.
   *
   * Sem isto ele ficaria como "Tolerância automática" — dizendo que a
   * regra resolveu um dia que na verdade uma pessoa reescreveu à mão.
   * Ponto é registro trabalhista: quem mexeu tem de ficar no documento.
   */
  const ajuste = servicoPonto.obterAjusteDoDia(PEDRO.id, '2026-09-16')!;
  expect(ajuste.origem).toBe('correcao_manual');
  expect(ajuste.aprovadorId).toBe(ELIAS.id);
  expect(ajuste.aprovadorNome).toBe('Elias');
});

test('dia já decidido que continua FORA da tolerância também é refeito', async () => {
  /**
   * O irmão do caso da Lyvia, e o que escapou da primeira rodada de
   * testes: lá a correção zerava a diferença e caía no ramo do dia certo.
   * Aqui a diferença continua existindo, só que menor — e a apuração
   * precisa reescrever o número em vez de voltar antes da conta.
   */
  montarEquipe(ELIAS);
  await fecharJornada(PEDRO, '2026-09-16', '08:00', '18:00'); // +60

  await servicoPonto.decidirAjuste(
    servicoPonto.obterAjusteDoDia(PEDRO.id, '2026-09-16')!.id,
    true
  );
  expect(servicoPonto.obterSaldoAcumulado(PEDRO.id)).toBe(60);

  // Corrige para 17:30: a extra cai de 60 para 30, mas não some
  await servicoPonto.ajustarMarcacao({
    colaboradorId: PEDRO.id, data: '2026-09-16', tipo: 'saida',
    hora: '17:30', justificativa: 'Conferido no relógio da loja',
  });

  const ajuste = servicoPonto.obterAjusteDoDia(PEDRO.id, '2026-09-16')!;
  expect(ajuste.minutos).toBe(30);
  expect(ajuste.estado).toBe('aprovado');
  expect(ajuste.aprovadorId).toBe(ELIAS.id);
  expect(servicoPonto.obterSaldoAcumulado(PEDRO.id)).toBe(30);
});

// ============================================================
// O PREVISTO DO DIA SAI DO TURNO, E NÃO DE UM NÚMERO NA FICHA
//
// O DEFEITO, visto no espelho da Lyvia: estagiária do turno da tarde,
// 4h45 por dia, com o cabeçalho dizendo "jornada diária: 8h10" e −3h25
// de débito TODO dia. Acumulou −47h50 em três semanas.
//
// A causa era uma linha: `cargaHorariaDiariaMinutos ?? minutosDoTurno()`.
// A coluna é `not null default 480` — ela NUNCA vem indefinida, então o
// `??` nunca caía para o turno e a metade direita era código morto.
// ============================================================

/**
 * A Lyvia DEPOIS da migração: turno A ainda gravado de quando foi
 * cadastrada, mas sem a jornada diária que o sistema tinha distribuído
 * sozinho. Vazio quer dizer "vale o turno".
 */
const LYVIA = {
  ...ANA, id: 'colab-lyvia', nome: 'Lyvia', login: 'lyvia',
  setor: 'Estágio', cargo: 'Estagiário(a)', turno: 'A',
  cargaHorariaDiariaMinutos: undefined,
};

test('sem jornada própria na ficha, o previsto sai do TURNO', async () => {
  equipe = [ELIAS, LYVIA];
  colaboradorLogado = ELIAS;

  // 15/09/2026 é uma terça
  const jornada = servicoPonto.obterJornadaDoDia(LYVIA.id, '2026-09-15');

  // O encaixe do estágio, e não as 8h10 da rede
  expect(jornada.minutosPrevistos).toBe(360); // 6h
  expect(jornada.minutosPrevistos).not.toBe(490);
});

test('a jornada que o sistema DISTRIBUIU sozinho era o defeito', async () => {
  /**
   * Toda ficha nascia com 8h10 gravados — `?? CARGA_HORARIA_PADRAO_MINUTOS`
   * no cadastro — e esse número vencia o turno no cálculo do previsto.
   *
   * Este teste prende o estrago: com o número lá, a estagiária da tarde
   * deve 3h25 por dia. É por isso que a migração limpa os 480 e 490 que
   * ninguém escolheu, e por isso o campo nasce vazio agora.
   */
  equipe = [ELIAS, { ...LYVIA, turno: 'E3', cargaHorariaDiariaMinutos: 490 }];
  colaboradorLogado = ELIAS;

  const jornada = servicoPonto.obterJornadaDoDia(LYVIA.id, '2026-09-15');
  expect(jornada.minutosPrevistos).toBe(490);
  expect(jornada.minutosPrevistos - 285).toBe(205); // 3h25 de débito por dia
});

test('o previsto acompanha a TROCA de turno', async () => {
  colaboradorLogado = ELIAS;

  const previstoCom = (turno: string) => {
    equipe = [ELIAS, { ...LYVIA, turno }];
    return servicoPonto.obterJornadaDoDia(LYVIA.id, '2026-09-15').minutosPrevistos;
  };

  // É o que o RH ganha ao classificar cada estagiário
  expect(previstoCom("E1")).toBe(360); // 6h — a pausa de 15 min não desconta
  expect(previstoCom('E2')).toBe(300); // 5h00
  expect(previstoCom("E3")).toBe(300); // 5h
});

test('a estagiária da tarde fecha o dia em ZERO, e não em débito', async () => {
  /**
   * O caso do print, de ponta a ponta. O turno da tarde é 13:00 às 18:00
   * e a pausa de 15 minutos NÃO desconta: são 5h cheias.
   *
   * Antes fechava em −3h25, porque o previsto vinha dos 490 da ficha.
   */
  equipe = [ELIAS, { ...LYVIA, turno: 'E3' }];
  colaboradorLogado = ELIAS;

  const marcar = (tipo: string, hora: string) => ({
    id: `r-lyvia-${tipo}`, colaboradorId: LYVIA.id, data: '2026-09-15', tipo,
    horario: new Date(`2026-09-15T${hora}:00`).toISOString(), horaFormatada: hora,
    metodo: 'ajuste_rh', loja: 'Pirassununga', criadoEm: new Date().toISOString(),
  });
  bancoRegistros.push(marcar('entrada', '13:00'), marcar('saida', '18:00'));
  armazenamento.setItem(CHAVE_REGISTROS, JSON.stringify(bancoRegistros));

  const jornada = servicoPonto.obterJornadaDoDia(LYVIA.id, '2026-09-15');
  expect(jornada.minutosTrabalhados).toBe(300);
  expect(jornada.minutosPrevistos).toBe(300);
  expect(jornada.minutosTrabalhados - jornada.minutosPrevistos).toBe(0);
});

test('quem entra 13:15 num turno de 13:00 deve os 15 minutos', () => {
  /**
   * É o que as batidas do print mostram: entrada 13:15 todo dia, num
   * turno que começa 13:00. Com a pausa não descontando, isso é um atraso
   * de 15 minutos — e não uma jornada de 4h45.
   *
   * A distinção importa: atraso se justifica e se decide; jornada menor
   * seria contrato. Confundir os dois esconde um do outro.
   */
  equipe = [ELIAS, { ...LYVIA, turno: 'E3' }];
  colaboradorLogado = ELIAS;

  const marcar = (tipo: string, hora: string) => ({
    id: `r-atraso-${tipo}`, colaboradorId: LYVIA.id, data: '2026-09-16', tipo,
    horario: new Date(`2026-09-16T${hora}:00`).toISOString(), horaFormatada: hora,
    metodo: 'ajuste_rh', loja: 'Pirassununga', criadoEm: new Date().toISOString(),
  });
  bancoRegistros.push(marcar('entrada', '13:15'), marcar('saida', '18:00'));
  armazenamento.setItem(CHAVE_REGISTROS, JSON.stringify(bancoRegistros));

  const jornada = servicoPonto.obterJornadaDoDia(LYVIA.id, '2026-09-16');
  expect(jornada.minutosTrabalhados).toBe(285);
  expect(jornada.minutosPrevistos).toBe(300);
  expect(jornada.minutosTrabalhados - jornada.minutosPrevistos).toBe(-15);
});

test('MEIO PERÍODO continua vencendo o turno', async () => {
  /**
   * O campo não sumiu, virou opcional. Contrato individual é real e manda
   * mais que a escala da rede — o que mudou é que agora ele só vale
   * quando alguém escreveu de propósito.
   */
  equipe = [ELIAS, { ...LYVIA, turno: 'E1', cargaHorariaDiariaMinutos: 240 }];
  colaboradorLogado = ELIAS;

  expect(
    servicoPonto.obterJornadaDoDia(LYVIA.id, '2026-09-15').minutosPrevistos
  ).toBe(240);
});

// ============================================================
// O SÁBADO COMPENSA A SEMANA
//
// "alguns estagiários não fecham as 6 horas diárias, o que faz que eles
// compensem trabalhando aos sábados — essas horas são divididas para
// abater a carga, complementando a semana."
//
// O previsto era dia a dia, isolado: o sábado de quem vem compensar era
// um dia igual aos outros, e nunca conversava com o débito da terça.
//
// Agora o turno dá a FORMA do dia e a carga semanal dá o TAMANHO da
// semana. Cada dia é a fatia dele no total contratado.
// ============================================================

/** Estagiária da tarde que VEM ao sábado para completar a semana. */
const ESTAGIARIA_SABADO = {
  ...ANA, id: 'colab-est', nome: 'Lyvia', login: 'lyvia',
  setor: 'Estágio', cargo: 'Estagiário(a)', turno: 'E3',
  trabalhaSabado: true,
  cargaHorariaDiariaMinutos: undefined,
  cargaSemanalMinutos: undefined as number | undefined,
};

const previstoDe = (quem: any, data: string) => {
  equipe = [ELIAS, quem];
  colaboradorLogado = ELIAS;
  return servicoPonto.obterJornadaDoDia(quem.id, data).minutosPrevistos;
};

// 2026-09-15 é terça; 2026-09-19 é sábado
test('sem carga semanal própria, o dia é o do turno — nada muda', () => {
  const terca = previstoDe(ESTAGIARIA_SABADO, '2026-09-15');
  const sabado = previstoDe(ESTAGIARIA_SABADO, '2026-09-19');

  expect(terca).toBe(300); // 5h do turno da tarde
  expect(sabado).toBe(240); // as 4h do sábado da rede
  expect(terca * 5 + sabado).toBe(1740); // 29h na semana
});

test('a carga semanal NÃO rateia mais o dia — o previsto é o relógio', () => {
  /**
   * Eu havia feito o previsto ser a fatia do dia na carga semanal. O
   * Elias perguntou o sentido do resultado — 5h18 para quem tem turno de
   * 6h — e não havia nenhum: ninguém sai 5h18 depois de entrar.
   *
   * Pior, o rateio ESPALHAVA um débito de 33 minutos por todos os dias,
   * quando o problema era um só e estava no cadastro: o turno não era o
   * dela. Número sem relógio não se confere e ainda esconde a causa.
   */
  const comContratoMenor = { ...ESTAGIARIA_SABADO, cargaSemanalMinutos: 25 * 60 };

  // O DIA ÚTIL continua sendo o do turno, inteiro — sem número quebrado
  expect(previstoDe(comContratoMenor, '2026-09-15')).toBe(300);

  /**
   * Quem carrega a diferença é o SÁBADO, que é o dia flexível da escala.
   * Cinco dias de 5h já fecham as 25h contratadas, então o sábado dela
   * não prevê nada — se ela vier, é hora extra.
   */
  expect(previstoDe(comContratoMenor, '2026-09-19')).toBe(0);
});

test('o SÁBADO carrega o que falta para fechar a semana', () => {
  /**
   * "Os sábados devem compor a semana e não ser apenas mais um horário
   * padrão." Eram 4h fixas para todo mundo que vem, como se fosse um dia
   * igual aos outros.
   *
   * Agora ele é a SOBRA: contrato menos os cinco dias úteis. É o dia
   * flexível da escala, e é assim que ele complementa a semana.
   */
  const turnoDe5h = { ...ESTAGIARIA_SABADO, turno: 'E3', trabalhaSabado: true };

  /**
   * 5h × 5 = 25h; para fechar 30h faltariam 5h — mas a loja abre só das 8
   * ao meio-dia. O sábado nunca passa das 4h da loja (decisão do Elias,
   * 29/09/2026: a Lyvia devia 45 min todo sábado sem ter como cumprir).
   */
  expect(previstoDe({ ...turnoDe5h, cargaSemanalMinutos: 1800 }, '2026-09-19')).toBe(240);

  // Para fechar 29h, precisa das 4h de sempre
  expect(previstoDe({ ...turnoDe5h, cargaSemanalMinutos: 1740 }, '2026-09-19')).toBe(240);
});

test('quem já fecha a semana de segunda a sexta não DEVE o sábado', () => {
  /**
   * A regra da casa: "os estagiários que cumprem 6 horas diárias não
   * trabalham aos sábados". Se um deles vier assim mesmo, o dia é hora
   * extra — e não um dia que ele estava devendo.
   *
   * Isso só aparece com o CONTRATO ESCRITO na ficha. Sem ele o sistema
   * não tem como saber se o sábado é parte do combinado ou sobra: ele
   * deriva o contrato do próprio horário, e aí o sábado fecha em zero
   * como qualquer outro dia.
   *
   * É a diferença entre "ela trabalha sábado" e "ela DEVE o sábado", e é
   * o que torna a carga semanal do estágio um dado que vale preencher.
   */
  const seisHoras = {
    ...ESTAGIARIA_SABADO, turno: 'E1', trabalhaSabado: true,
    cargaSemanalMinutos: 1800, // 30h escritas em contrato
  };

  expect(previstoDe(seisHoras, '2026-09-15')).toBe(360); // 6h × 5 = 30h
  expect(previstoDe(seisHoras, '2026-09-19')).toBe(0); // já fechou: o sábado é extra

  // Sem o contrato escrito, o sistema deriva 34h do próprio horário
  const semContrato = { ...seisHoras, cargaSemanalMinutos: undefined };
  expect(previstoDe(semContrato, '2026-09-19')).toBe(240);
});

test('o sábado do BALCÃO continua sendo 4h', () => {
  // 8h10 × 5 são 40h50, e o contrato é 44h50: a sobra é exatamente 4h.
  // A regra nova não pode mexer em quem já estava certo.
  const balconista = {
    ...ANA, id: 'colab-sab-balc', setor: 'Balcão', cargo: 'Balconista', turno: 'A',
    cargaHorariaDiariaMinutos: undefined, cargaSemanalMinutos: undefined,
  };

  expect(previstoDe(balconista, '2026-09-19')).toBe(240);
});

test('contrato menor que a semana útil não vira crédito no sábado', () => {
  // Divergência de cadastro não pode virar hora a favor sozinha: a ficha
  // é que avisa, e o sábado para em zero
  const contratoMenor = {
    ...ESTAGIARIA_SABADO, turno: 'E1', trabalhaSabado: true,
    cargaSemanalMinutos: 20 * 60,
  };

  expect(previstoDe(contratoMenor, '2026-09-19')).toBe(0);
});

test('cumprindo o horário combinado, a semana fecha em ZERO', () => {
  /**
   * É assim que o sábado compensa, e não precisava de rateio: basta ele
   * CONTAR. Quem trabalha o horário combinado — dia útil e sábado — fecha
   * a semana em zero, porque a soma dos dias É a semana dela.
   */
  const dela = { ...ESTAGIARIA_SABADO, cargaSemanalMinutos: undefined };

  const util = previstoDe(dela, '2026-09-15');
  const sabado = previstoDe(dela, '2026-09-19');

  expect(300 - util).toBe(0);
  expect(240 - sabado).toBe(0);
  expect(util * 5 + sabado).toBe(1740); // 29h, a semana do horário dela
});

test('quem NÃO vem ao sábado não tem o sábado na conta da semana', () => {
  /**
   * O estagiário das 6h de segunda a sexta fecha a semana sem sábado. Se
   * o sábado entrasse no divisor, o dia útil dele encolheria para caber
   * num dia que ele nunca trabalha.
   */
  const semSabado = {
    ...ESTAGIARIA_SABADO, id: 'colab-est2', trabalhaSabado: false,
    turno: 'E0', cargaSemanalMinutos: undefined,
  };

  expect(previstoDe(semSabado, '2026-09-15')).toBe(360); // 6h
  expect(previstoDe(semSabado, '2026-09-19')).toBe(0);   // sábado não é dele
});

test('o INTEGRAL não se mexe: a razão é 1', () => {
  /**
   * 8h × 5 + 4h de sábado é exatamente a carga semanal padrão. A escala
   * só entra quando alguém tem contrato diferente do próprio horário —
   * para o resto da rede, a conta é a mesma de antes.
   */
  const balconista = {
    ...ANA, id: 'colab-bal', setor: 'Balcão', cargo: 'Balconista', turno: 'A',
    cargaHorariaDiariaMinutos: undefined, cargaSemanalMinutos: undefined,
  };

  // As 8h da CLT no dia útil (o relógio dá 8h10: compensação do sábado)
  expect(previstoDe(balconista, '2026-09-15')).toBe(480);
  expect(previstoDe(balconista, '2026-09-19')).toBe(240);
});

test('meio período continua vencendo tudo no dia útil', () => {
  const meioPeriodo = { ...ESTAGIARIA_SABADO, id: 'colab-mp', cargaHorariaDiariaMinutos: 240 };
  expect(previstoDe(meioPeriodo, '2026-09-15')).toBe(240);
});

test('jornada NULA no banco vale o turno, e não ZERO', () => {
  /**
   * O defeito que o Elias viu no espelho: saldo +4h45 em todo dia útil,
   * como se a pessoa não devesse jornada nenhuma.
   *
   * A migração limpou a coluna para `null`, e a checagem aqui era
   * `!== undefined` — que `null` satisfaz. A função devolvia null, que
   * vira zero na subtração. O sábado escapava porque nem passa por essa
   * linha, e por isso só ele mostrava número plausível.
   *
   * `null` chega do banco; `undefined` chega do cache local. Os dois
   * querem dizer a mesma coisa: vale o turno.
   */
  const comNull = {
    ...ESTAGIARIA_SABADO, id: 'colab-null',
    cargaHorariaDiariaMinutos: null as unknown as undefined,
  };

  const terca = previstoDe(comNull, '2026-09-15');
  expect(terca).not.toBe(0);
  expect(terca).toBe(300); // as 5h do turno da tarde
});

test('a ponte do banco traduz null para "vale o turno"', async () => {
  /**
   * A tradução tem de acontecer na BORDA, e não em cada lugar que lê o
   * campo. Uma checagem esquecida lá adiante devolve zero de novo.
   *
   * E na volta nunca 490: salvar uma ficha qualquer — trocar um ramal —
   * desfaria a migração para aquela pessoa, sem ninguém notar.
   */
  const ponte =
    (await Bun.file(new URL('./nuvem.ts', import.meta.url)).text()) +
    (await Bun.file(new URL('./linhasDoBanco.ts', import.meta.url)).text());

  expect(ponte).toContain(
    'cargaHorariaDiariaMinutos: linha.carga_horaria_diaria_minutos ?? undefined'
  );
  expect(ponte).toContain('carga_horaria_diaria_minutos: c.cargaHorariaDiariaMinutos ?? null');
  expect(ponte).not.toContain('c.cargaHorariaDiariaMinutos ?? 490');
});

test('a semana do turno da tarde com sábado é 29h', () => {
  /**
   * A PAUSA DE 15 MINUTOS NÃO DESCONTA — decisão do Elias: "13:30, mas
   * não precisa descontar os 15 min de intervalo".
   *
   * Com isso o turno da tarde é 5h cheias, não 4h45, e a semana com
   * sábado dá 29h. Eu havia descontado por conta própria, apoiado no art.
   * 71 §2º da CLT, e o efeito era o turno da manhã aparecer como 5h45 —
   * quando a regra da casa é "os estagiários que cumprem 6 horas não
   * trabalham aos sábados".
   *
   * Quando o contrato É o horário, a carga semanal fica VAZIA e a razão
   * da escala vira 1: cada dia prevê o que o turno diz e quem cumpriu o
   * combinado fecha em zero.
   */
  const dela = {
    ...ESTAGIARIA_SABADO, id: 'colab-tarde',
    turno: 'E3', trabalhaSabado: true,
    cargaSemanalMinutos: undefined,
  };

  const terca = previstoDe(dela, '2026-09-15');
  const sabado = previstoDe(dela, '2026-09-19');

  expect(terca).toBe(300); // 5h, sem descontar a pausa
  expect(sabado).toBe(240); // 4h00
  expect(terca * 5 + sabado).toBe(1740); // 29h na semana

  // Cumprindo o horário, não sobra nem falta nada
  expect(300 - terca).toBe(0);
  expect(240 - sabado).toBe(0);
});

test('marcar 30h numa semana de 27h45 ENCOLHE todos os dias', () => {
  /**
   * O erro que a tela convidava a cometer, e que o rótulo agora evita: a
   * carga semanal não é o número da categoria, é o contrato da pessoa.
   */
  const comTrintaHoras = {
    ...ESTAGIARIA_SABADO, id: 'colab-30h',
    turno: 'E3', trabalhaSabado: true,
    cargaSemanalMinutos: 1800,
  };

  // 27h45 de horário contra 30h de contrato: os dias CRESCEM, e ela passa
  // a dever todo dia por cumprir exatamente o que foi combinado
  expect(previstoDe(comTrintaHoras, '2026-09-15')).toBeGreaterThan(285);
});

// ============================================================
// A PAUSA É O COLCHÃO DO DIA
//
// "esses 15 min são descontados do intervalo dela."
//
// A pausa do estágio é paga e não se bate. Quem entra 13:15 num turno
// que começa 13:00 abriu mão dela — e trabalhou exatamente o mesmo que a
// colega que entrou 13:00 e parou 15 minutos.
// ============================================================

const marcarDia = (quem: any, data: string, entrada: string, saida: string) => {
  equipe = [ELIAS, quem];
  colaboradorLogado = ELIAS;
  bancoRegistros.push(
    { id: `p-${quem.id}-${data}-e`, colaboradorId: quem.id, data, tipo: 'entrada',
      horario: new Date(`${data}T${entrada}:00`).toISOString(), horaFormatada: entrada,
      metodo: 'ajuste_rh', loja: 'Pirassununga', criadoEm: new Date().toISOString() },
    { id: `p-${quem.id}-${data}-s`, colaboradorId: quem.id, data, tipo: 'saida',
      horario: new Date(`${data}T${saida}:00`).toISOString(), horaFormatada: saida,
      metodo: 'ajuste_rh', loja: 'Pirassununga', criadoEm: new Date().toISOString() }
  );
  armazenamento.setItem(CHAVE_REGISTROS, JSON.stringify(bancoRegistros));
  return servicoPonto.obterJornadaDoDia(quem.id, data);
};

const DA_TARDE = {
  ...ANA, id: 'colab-tarde-p', setor: 'Estágio', cargo: 'Estagiário(a)',
  turno: 'E3', trabalhaSabado: true, cargaHorariaDiariaMinutos: undefined,
};

test('entrar 15 min depois abre mão da pausa: o dia fecha em ZERO', () => {
  // Era −15 minutos todo santo dia por uma jornada cumprida inteira
  const dia = marcarDia(DA_TARDE, '2026-09-15', '13:15', '18:00');

  expect(dia.minutosTrabalhados).toBe(285); // a presença dela
  expect(dia.minutosPrevistos).toBe(300); // as 5h do turno
  expect(dia.saldoMinutos).toBe(0); // a pausa cobriu
});

test('a pausa cobre ATÉ o tamanho dela, e nem um minuto mais', () => {
  /**
   * Quem entra 13:40 perdeu a pausa E chegou atrasado. Os 25 minutos
   * além dela continuam débito — senão a pausa viraria tolerância
   * silenciosa de qualquer atraso.
   */
  const dia = marcarDia(DA_TARDE, '2026-09-16', '13:40', '18:00');

  expect(dia.minutosTrabalhados).toBe(260);
  expect(dia.saldoMinutos).toBe(-25); // 40 de atraso menos os 15 da pausa
});

test('a pausa NÃO vira crédito para quem fica além do horário', () => {
  /**
   * Só abate para baixo. Hora extra é outra coisa e passa por decisão de
   * quem responde pela pessoa — transformar pausa em crédito criaria
   * meia hora de extra fantasma por dia.
   */
  const dia = marcarDia(DA_TARDE, '2026-09-17', '13:00', '18:30');

  expect(dia.minutosTrabalhados).toBe(330);
  expect(dia.saldoMinutos).toBe(30); // os 30 cheios, sem somar pausa
});

test('quem cumpre o horário E tira a pausa fecha igual', () => {
  // Os dois caminhos valem o mesmo: é o ponto da regra
  const dia = marcarDia(DA_TARDE, '2026-09-18', '13:00', '18:00');
  expect(dia.saldoMinutos).toBe(0);
});

test('quem tem ALMOÇO não ganha colchão nenhum', () => {
  /**
   * Almoço não é pausa: ele sai da jornada e é batido. Dar o mesmo
   * abatimento ao balconista seria criar uma tolerância de 1h30 por dia.
   */
  const balconista = {
    ...ANA, id: 'colab-balc-p', setor: 'Balcão', cargo: 'Balconista',
    turno: 'A', cargaHorariaDiariaMinutos: undefined,
  };

  // Entra 15 minutos atrasado num turno com almoço: os 15 são débito
  equipe = [ELIAS, balconista];
  colaboradorLogado = ELIAS;
  const marcar = (tipo: string, hora: string) => ({
    id: `b-${tipo}`, colaboradorId: balconista.id, data: '2026-09-15', tipo,
    horario: new Date(`2026-09-15T${hora}:00`).toISOString(), horaFormatada: hora,
    metodo: 'ajuste_rh', loja: 'Pirassununga', criadoEm: new Date().toISOString(),
  });
  bancoRegistros.push(
    marcar('entrada', '07:45'), marcar('saida_almoco', '12:30'),
    marcar('retorno_almoco', '14:00'), marcar('saida', '17:10')
  );
  armazenamento.setItem(CHAVE_REGISTROS, JSON.stringify(bancoRegistros));

  const dia = servicoPonto.obterJornadaDoDia(balconista.id, '2026-09-15');
  expect(dia.saldoMinutos).toBe(-15);
});

// ============================================================
// REAPURAR O PERÍODO
//
// A apuração de um dia só é refeita quando alguém mexe naquele dia. É de
// propósito. Mas quando a REGRA muda, os dias já apurados guardam o
// número antigo para sempre — e o espelho passa a mostrar dois números
// que não conversam.
// ============================================================

test('reapurar refaz os dias com a regra de hoje', async () => {
  montarEquipe(ELIAS);
  await fecharJornada(PEDRO, '2026-09-15', '08:00', '18:00'); // +60

  // Alguém decidiu o dia como estava
  await servicoPonto.decidirAjuste(
    servicoPonto.obterAjusteDoDia(PEDRO.id, '2026-09-15')!.id,
    true
  );
  expect(servicoPonto.obterSaldoAcumulado(PEDRO.id)).toBe(60);

  /**
   * A marcação muda por fora da apuração — como se a REGRA tivesse
   * mudado e os dias antigos tivessem ficado com o número velho.
   *
   * A edição vai no BANCO simulado, e não no cache: `reapurarPeriodo`
   * sincroniza antes de recontar, justamente para não reescrever dias
   * sobre marcações vencidas. Mexer só no cache seria desfeito ali.
   */
  const saida = bancoRegistros.find(
    (r: any) => r.colaboradorId === PEDRO.id && r.data === '2026-09-15' && r.tipo === 'saida'
  );
  saida.horario = new Date('2026-09-15T17:00:00').toISOString();
  saida.horaFormatada = '17:00';

  const res = await servicoPonto.reapurarPeriodo(PEDRO.id, '2026-09-15', '2026-09-15');

  expect(res.sucesso).toBe(true);
  expect(res.dias).toBe(1);
  expect(servicoPonto.obterSaldoAcumulado(PEDRO.id)).toBe(0);
});

test('reapurar NÃO joga o resultado na fila de ninguém', async () => {
  /**
   * Quem reapura decide: a autoridade é a mesma de corrigir a marcação.
   * Jogar o resultado na fila do líder transformaria um conserto de
   * sistema em trabalho para outra pessoa — e ela não teria o que julgar.
   */
  montarEquipe(ELIAS);
  await fecharJornada(PEDRO, '2026-09-15', '08:00', '18:00');

  await servicoPonto.reapurarPeriodo(PEDRO.id, '2026-09-15', '2026-09-15');

  const ajuste = servicoPonto.obterAjusteDoDia(PEDRO.id, '2026-09-15')!;
  expect(ajuste.estado).toBe('aprovado');
  expect(ajuste.aprovadorId).toBe(ELIAS.id);
});

test('reapurar não alcança o dia de HOJE, nem quando ele já fechou', async () => {
  /**
   * Dia em andamento não se apura: ele não acabou. E "não acabou" vale
   * mesmo quando as batidas já estão todas lá — alguém pode voltar de
   * uma entrega às 18h30, e o dia fechado às 17h não era o dia dela.
   *
   * As marcações entram direto no banco simulado, sem passar por
   * `fecharJornada`: aquele helper já apura, e o que se testa aqui é se
   * a REAPURAÇÃO apura por conta própria.
   */
  montarEquipe(ELIAS);
  const hoje = dataDeHoje();

  const marcar = (tipo: string, hora: string) => ({
    id: `hoje-${tipo}`, colaboradorId: PEDRO.id, data: hoje, tipo,
    horario: new Date(`${hoje}T${hora}:00`).toISOString(), horaFormatada: hora,
    metodo: 'qrcode', loja: PEDRO.loja, criadoEm: new Date().toISOString(),
  });
  bancoRegistros.push(
    marcar('entrada', '08:00'), marcar('saida_almoco', '12:00'),
    marcar('retorno_almoco', '13:00'), marcar('saida', '18:00')
  );
  armazenamento.setItem(CHAVE_REGISTROS, JSON.stringify(bancoRegistros));

  const res = await servicoPonto.reapurarPeriodo(PEDRO.id, hoje, hoje);

  expect(res.dias).toBe(0);
  // E nenhuma apuração nasceu de um dia que ainda está acontecendo
  expect(servicoPonto.obterAjusteDoDia(PEDRO.id, hoje)).toBeNull();
});

test('quem não responde pela pessoa NÃO reapura', async () => {
  // A mesma porta de corrigir a marcação: senão reapurar seria uma
  // segunda forma de mexer no ponto alheio, sem a trava da primeira
  montarEquipe(OUTRA_LOJA);

  const res = await servicoPonto.reapurarPeriodo(PEDRO.id, '2026-09-15', '2026-09-15');
  expect(res.sucesso).toBe(false);
  expect(res.erro).toContain('responde');
});

test('o sábado do BALCÃO não estica nem encolhe por contrato', () => {
  /**
   * "Isso é pra ser reflexo apenas para os estagiários."
   *
   * Para o balcão o sábado é horário de verdade: 08:00 às 12:00, a loja
   * abre e fecha nessas horas. Eu havia aplicado a sobra para todo mundo.
   *
   * Um balconista com contrato de 48h teria sábado previsto de 7h10 — a
   * loja fecha ao meio-dia, então o sistema cobraria três horas que não
   * existem. Com 40h o sábado zeraria, sumindo com um dia inteiro de
   * trabalho.
   */
  const balconista = {
    ...ANA, id: 'colab-sab-fixo', setor: 'Balcão', cargo: 'Balconista', turno: 'A',
    trabalhaSabado: true, cargaHorariaDiariaMinutos: undefined,
  };

  // Contrato maior: o sábado NÃO estica para além do que a loja abre
  expect(previstoDe({ ...balconista, cargaSemanalMinutos: 48 * 60 }, '2026-09-19')).toBe(240);

  // Contrato menor: o sábado NÃO some
  expect(previstoDe({ ...balconista, cargaSemanalMinutos: 40 * 60 }, '2026-09-19')).toBe(240);

  // E sem contrato escrito continua nas 4h de sempre
  expect(previstoDe(balconista, '2026-09-19')).toBe(240);
});

test('o sábado do ESTÁGIO continua completando a semana', () => {
  // A regra não sumiu, só ficou onde ela faz sentido
  const estagiaria = {
    ...ANA, id: 'colab-sab-est', setor: 'Estágio', cargo: 'Estagiário(a)', turno: 'E3',
    trabalhaSabado: true, cargaHorariaDiariaMinutos: undefined,
  };

  // 5h × 5 = 25h; faltariam 5h para as 30h, mas o sábado vai até as 4h da loja
  expect(previstoDe({ ...estagiaria, cargaSemanalMinutos: 1800 }, '2026-09-19')).toBe(240);
  // Com 3h faltando, o sábado carrega só as 3h
  expect(previstoDe({ ...estagiaria, cargaSemanalMinutos: 1680 }, '2026-09-19')).toBe(180);
});

// ============================================================
// PREENCHER O ESPELHO PELO TURNO
//
// O RH precisava digitar quatro batidas por pessoa por dia para fechar
// um mês. Com 89 pessoas isso não se faz — e o que não se faz vira
// espelho incompleto, que é pior do que o trabalho.
//
// Mas isto CRIA registro trabalhista por dedução. As travas abaixo são o
// que separa "poupar digitação" de "inventar jornada".
// ============================================================

const preencher = (quem: any, de: string, ate: string, motivo = 'Fechamento do mês') =>
  servicoPonto.preencherEspelhoPeloTurno({
    colaboradorId: quem.id, dataInicio: de, dataFim: ate, justificativa: motivo,
  });

test('preenche o dia vazio com o horário do turno', async () => {
  montarEquipe(ELIAS);

  const res = await preencher(PEDRO, '2026-09-14', '2026-09-15');
  expect(res.sucesso).toBe(true);
  expect(res.dias).toBe(2);

  const dia = servicoPonto.obterJornadaDoDia(PEDRO.id, '2026-09-15');
  expect(dia.completa).toBe(true);
  expect(dia.marcacoes.entrada!.horaFormatada).toBe('07:30');
  expect(dia.marcacoes.saida!.horaFormatada).toBe('17:10');
});

test('a origem NUNCA se confunde com batida nem com correção', async () => {
  const { ehMarcacaoPreenchida, ehMarcacaoCorrigida } = await import('../tipos');

  /**
   * É o que separa o documento honesto do inventado: quem confere
   * precisa ver que aquele horário foi DEDUZIDO do contrato, e não
   * batido pela pessoa nem afirmado por alguém.
   */
  montarEquipe(ELIAS);
  await preencher(PEDRO, '2026-09-15', '2026-09-15');

  const entrada = servicoPonto.obterJornadaDoDia(PEDRO.id, '2026-09-15').marcacoes.entrada!;
  expect(entrada.metodo).toBe('preenchimento_turno');
  expect(ehMarcacaoPreenchida(entrada.metodo)).toBe(true);
  expect(ehMarcacaoCorrigida(entrada.metodo)).toBe(false);

  // E fica o rastro de quem mandou e por quê
  expect(entrada.ajustadoPorNome).toBe('Elias');
  expect(entrada.justificativa).toBe('Fechamento do mês');
});

test('TRAVA: dia com UMA batida fica como está', async () => {
  /**
   * Dia pela metade é justamente o que precisa de gente olhando — uma
   * saída que não foi batida é pergunta, não lacuna. Preencher o resto
   * apagaria a pergunta e fecharia o dia como se estivesse certo.
   */
  montarEquipe(ELIAS);
  bancoRegistros.push({
    id: 'so-entrada', colaboradorId: PEDRO.id, data: '2026-09-15', tipo: 'entrada',
    horario: new Date('2026-09-15T08:00:00').toISOString(), horaFormatada: '08:00',
    metodo: 'qrcode', loja: PEDRO.loja, criadoEm: new Date().toISOString(),
  });
  armazenamento.setItem(CHAVE_REGISTROS, JSON.stringify(bancoRegistros));

  const res = await preencher(PEDRO, '2026-09-15', '2026-09-15');

  expect(res.dias).toBe(0);
  const dia = servicoPonto.obterJornadaDoDia(PEDRO.id, '2026-09-15');
  expect(dia.marcacoes.saida).toBeUndefined();
});

test('TRAVA: não toca no dia de HOJE', async () => {
  montarEquipe(ELIAS);
  const hoje = dataDeHoje();

  const res = await preencher(PEDRO, hoje, hoje);
  expect(res.dias).toBe(0);
});

test('TRAVA: exige justificativa', async () => {
  montarEquipe(ELIAS);
  const res = await preencher(PEDRO, '2026-09-15', '2026-09-15', '   ');

  expect(res.sucesso).toBe(false);
  expect(res.erro).toContain('motivo');
});

test('TRAVA: quem não responde pela pessoa não preenche', async () => {
  montarEquipe(OUTRA_LOJA);
  const res = await preencher(PEDRO, '2026-09-15', '2026-09-15');

  expect(res.sucesso).toBe(false);
  expect(res.erro).toContain('responde');
});

test('não preenche DOMINGO nem dia que não é da pessoa', async () => {
  // 2026-09-20 é um domingo
  montarEquipe(ELIAS);
  const res = await preencher(PEDRO, '2026-09-20', '2026-09-20');

  expect(res.dias).toBe(0);
  expect(servicoPonto.obterJornadaDoDia(PEDRO.id, '2026-09-20').marcacoes.entrada)
    .toBeUndefined();
});

test('o dia preenchido é APURADO junto, e não fica solto', async () => {
  /**
   * Preencher sem apurar deixaria o espelho cheio e o saldo vazio — duas
   * telas contando histórias diferentes do mesmo mês, que é o defeito
   * que já apareceu aqui por outros caminhos.
   */
  const semJornadaPropria = {
    ...PEDRO, id: 'colab-limpo', login: 'limpo',
    cargaHorariaDiariaMinutos: undefined,
  };
  equipe = [ELIAS, semJornadaPropria];
  colaboradorLogado = ELIAS;

  await preencher(semJornadaPropria, '2026-09-15', '2026-09-15');

  const dia = servicoPonto.obterJornadaDoDia(semJornadaPropria.id, '2026-09-15');
  // O turno fecha a carga certinha: nada a decidir, e nada na fila
  expect(dia.minutosTrabalhados).toBe(490);
  expect(dia.saldoMinutos).toBe(0);
});

test('preencher EXPÕE a jornada da ficha que discorda do turno', async () => {
  /**
   * O Pedro tem 8h00 gravadas na ficha e cumpre o turno A, que fecha
   * 8h10. Preenchido pelo turno, o dia dele nasce com 10 minutos de
   * sobra — todo dia.
   *
   * Isso é a divergência aparecendo, e não um defeito do preenchimento:
   * o número saiu do relógio do turno, que é o horário que ele cumpre. O
   * conserto é na ficha — ou a jornada própria é real e o turno é outro,
   * ou ela é resquício e deve sair.
   */
  montarEquipe(ELIAS);
  await preencher(PEDRO, '2026-09-15', '2026-09-15');

  const dia = servicoPonto.obterJornadaDoDia(PEDRO.id, '2026-09-15');
  expect(dia.minutosTrabalhados).toBe(490); // o turno
  expect(dia.minutosPrevistos).toBe(480); // a ficha
  // A divergência continua à vista no relógio: 10 minutos a mais, todo dia
  expect(dia.saldoBrutoMinutos).toBe(10);
  /**
   * Mas o SALDO é o apurado. Sem horário conhecido (a ficha não fecha com
   * o turno), vale o limite do dia, e 10 minutos cabem nele — é a regra
   * da tolerância, aplicada no mesmo lugar para todos.
   */
  expect(dia.saldoMinutos).toBe(0);
});

test('não preenche dia de ATESTADO ou falta abonada', async () => {
  /**
   * O domingo já não é preenchido porque o turno não espera batida
   * nenhuma nele. Este caso é outro, e só a checagem de situação pega:
   * uma terça-feira normal, em que a pessoa tem atestado aprovado.
   *
   * Preencher ali seria o sistema afirmando que ela trabalhou um dia em
   * que o próprio sistema sabe que ela não estava.
   */
  montarEquipe(ELIAS);
  armazenamento.setItem(
    'conecta_v4_justificativas_ausencia',
    JSON.stringify([
      {
        id: 'at1', colaboradorId: PEDRO.id, dataInicio: '2026-09-15',
        dataFim: '2026-09-15', tipo: 'atestado', estado: 'aprovada',
        criadoEm: new Date().toISOString(),
      },
    ])
  );

  const res = await preencher(PEDRO, '2026-09-15', '2026-09-15');

  expect(res.dias).toBe(0);
  expect(servicoPonto.obterJornadaDoDia(PEDRO.id, '2026-09-15').marcacoes.entrada)
    .toBeUndefined();

  armazenamento.removeItem('conecta_v4_justificativas_ausencia');
});

// ============================================================
// A TOLERÂNCIA NA REGRA CENTRAL — do espelho ao banco de horas
//
// Pedido do Elias: a tolerância aplicada ANTES de o saldo do dia existir,
// para o espelho, a semana, o fechamento do período e o banco de horas
// receberem o mesmo número. A regra caso a caso está em
// `toleranciaDoPonto.test.ts`; aqui, que ela chega a todos.
// ============================================================

/** Bate as quatro marcações de um dia e apura, como a 4ª batida faz. */
const baterDia = async (quem: any, data: string, horas: [string, string, string, string]) => {
  const tipos = ['entrada', 'saida_almoco', 'retorno_almoco', 'saida'];
  // No banco E no aparelho: a correção e a reapuração sincronizam antes de agir
  bancoRegistros = bancoRegistros.filter(
    (r: any) => !(r.colaboradorId === quem.id && r.data === data)
  );
  bancoRegistros.push(
    ...horas.map((hora, i) => ({
      id: `d-${quem.id}-${data}-${tipos[i]}`, colaboradorId: quem.id, data, tipo: tipos[i],
      horario: new Date(`${data}T${hora}:00`).toISOString(), horaFormatada: hora,
      metodo: 'qrcode', loja: quem.loja, criadoEm: '',
    }))
  );
  armazenamento.setItem(CHAVE_REGISTROS, JSON.stringify(bancoRegistros));
  await servicoPonto.apurarDia(quem.id, data);
};

test('13. O BANCO DE HORAS RECEBE O SALDO APURADO, e não o do relógio', async () => {
  equipe = [ELIAS, DO_TURNO];
  colaboradorLogado = DO_TURNO;

  // Segunda: 07:28 e 17:15 — +7 no relógio, dentro da tolerância
  await baterDia(DO_TURNO, '2026-09-14', ['07:28', '12:30', '14:00', '17:15']);
  // Terça: almoço de 12:32 a 13:56 — 6 min somados, passa da regra do almoço
  await baterDia(DO_TURNO, '2026-09-15', ['07:30', '12:32', '13:56', '17:10']);

  expect(servicoPonto.obterAjusteDoDia(DO_TURNO.id, '2026-09-14')).toBeNull();
  const terca = servicoPonto.obterAjusteDoDia(DO_TURNO.id, '2026-09-15')!;
  expect(terca.estado).toBe('pendente');
  expect(terca.tipo).toBe('hora_extra');
  expect(terca.minutos).toBe(6);

  // Só o que foi decidido entra no saldo — e entra o apurado
  colaboradorLogado = ELIAS;
  await servicoPonto.decidirAjuste(terca.id, true);
  expect(servicoPonto.obterSaldoAcumulado(DO_TURNO.id)).toBe(6);
});

test('14. O FECHAMENTO DO PERÍODO e a semana somam os saldos apurados', async () => {
  equipe = [ELIAS, DO_TURNO];
  colaboradorLogado = DO_TURNO;

  await baterDia(DO_TURNO, '2026-09-14', ['07:28', '12:30', '14:00', '17:15']); // relógio +7
  await baterDia(DO_TURNO, '2026-09-15', ['07:29', '12:30', '14:00', '17:12']); // relógio +3

  // O dia mostra o relógio E o saldo apurado, lado a lado
  const segunda = servicoPonto.obterJornadaDoDia(DO_TURNO.id, '2026-09-14');
  expect(segunda.saldoBrutoMinutos).toBe(7);
  expect(segunda.saldoMinutos).toBe(0);

  // A semana soma o apurado: 0, e não os 10 minutos do relógio
  expect(servicoPonto.apurarSemana(DO_TURNO.id, '2026-09-15').saldoMinutos).toBe(0);

  // O espelho do período, idem — e o acumulado bate com ele
  colaboradorLogado = ELIAS;
  const resumo = servicoPonto
    .obterResumoDoPeriodo('2026-09-14', '2026-09-15')
    .find((r) => r.colaborador.id === DO_TURNO.id)!;
  expect(resumo.saldoPeriodoMinutos).toBe(0);
  expect(resumo.saldoAcumuladoMinutos).toBe(0);
  // O relógio continua no documento: 8h17 + 8h13 trabalhadas
  expect(resumo.minutosTrabalhados).toBe(497 + 493);
});

test('16. A MARCAÇÃO CORRIGIDA PELO RH passa pela mesma tolerância', async () => {
  equipe = [ELIAS, DO_TURNO];
  colaboradorLogado = DO_TURNO;

  // Saiu 17:20: 10 depois numa marcação só — pendência
  await baterDia(DO_TURNO, '2026-09-15', ['07:30', '12:30', '14:00', '17:20']);
  expect(servicoPonto.obterAjusteDoDia(DO_TURNO.id, '2026-09-15')!.estado).toBe('pendente');

  // O RH corrige a saída para 17:12: 2 depois, dentro da tolerância
  colaboradorLogado = ELIAS;
  const res = await servicoPonto.ajustarMarcacao({
    colaboradorId: DO_TURNO.id, data: '2026-09-15', tipo: 'saida', hora: '17:12',
    justificativa: 'Saída registrada tarde por fila no relógio',
  });
  expect(res.sucesso).toBe(true);

  // A apuração é reescrita para zero, e não apagada
  const depois = servicoPonto.obterAjusteDoDia(DO_TURNO.id, '2026-09-15')!;
  expect(depois.minutos).toBe(0);
  expect(depois.estado).toBe('aprovado');
  expect(servicoPonto.obterSaldoAcumulado(DO_TURNO.id)).toBe(0);
});

test('13b. REAPURAR leva a regra nova ao que já estava gravado', async () => {
  /**
   * Os saldos gravados antes desta regra ficam com o número velho até
   * alguém reapurar. Um débito de 8 minutos aprovado pela regra antiga,
   * num dia que a nova tolera (entrou 4 atrasado, saiu 4 mais cedo):
   */
  equipe = [ELIAS, DO_TURNO];
  colaboradorLogado = DO_TURNO;
  await baterDia(DO_TURNO, '2026-09-15', ['07:34', '12:30', '14:00', '17:06']);
  armazenamento.setItem(
    'conecta_v4_ajustes_jornada',
    JSON.stringify([
      {
        id: 'velho', colaboradorId: DO_TURNO.id, data: '2026-09-15',
        tipo: 'debito', minutos: 8, minutosTrabalhados: 482, minutosPrevistos: 490,
        estado: 'aprovado', origem: 'pendencia', criadoEm: '2026-09-15T18:00:00.000Z',
      },
    ])
  );
  expect(servicoPonto.obterSaldoAcumulado(DO_TURNO.id)).toBe(-8);

  colaboradorLogado = ELIAS;
  const res = await servicoPonto.reapurarPeriodo(DO_TURNO.id, '2026-09-15', '2026-09-15');
  expect(res.sucesso).toBe(true);
  expect(servicoPonto.obterSaldoAcumulado(DO_TURNO.id)).toBe(0);
});

test('15. DIA SEM MARCAÇÃO COMPLETA não vira saldo pela tolerância', async () => {
  equipe = [ELIAS, DO_TURNO];
  colaboradorLogado = DO_TURNO;

  // Só a entrada: a jornada não fechou
  armazenamento.setItem(
    CHAVE_REGISTROS,
    JSON.stringify([
      {
        id: 'so-entrada', colaboradorId: DO_TURNO.id, data: '2026-09-15', tipo: 'entrada',
        horario: new Date('2026-09-15T07:29:00').toISOString(), horaFormatada: '07:29',
        metodo: 'qrcode', loja: DO_TURNO.loja, criadoEm: '',
      },
    ])
  );
  const jornada = servicoPonto.obterJornadaDoDia(DO_TURNO.id, '2026-09-15');
  expect(jornada.saldoMinutos).toBe(0);
  expect(jornada.tolerancia.modo).toBe('sem_jornada');
  expect(jornada.completa).toBe(false);
});

// ============================================================
// HORÁRIO A, HORÁRIO B E SÁBADO — com os turnos REAIS do cadastro
//
// Pedido do Elias: "faça testes explícitos para Horário A, Horário B e
// sábado". Aqui o dia passa por `obterJornadaDoDia` inteiro: o turno
// da ficha define o horário de cada batida, e a tolerância é medida
// contra ele. Nada de "total trabalhado − 8h10".
// ============================================================

/** Um sábado: duas batidas, das 8 ao meio-dia. */
const baterSabado = async (quem: any, data: string, entrada: string, saida: string) => {
  bancoRegistros = bancoRegistros.filter((r: any) => !(r.colaboradorId === quem.id && r.data === data));
  bancoRegistros.push(
    ...[['entrada', entrada], ['saida', saida]].map(([tipo, hora]) => ({
      id: `s-${quem.id}-${data}-${tipo}`, colaboradorId: quem.id, data, tipo,
      horario: new Date(`${data}T${hora}:00`).toISOString(), horaFormatada: hora,
      metodo: 'qrcode', loja: quem.loja, criadoEm: '',
    }))
  );
  armazenamento.setItem(CHAVE_REGISTROS, JSON.stringify(bancoRegistros));
  await servicoPonto.apurarDia(quem.id, data);
};

test('HORÁRIO A: 07:29 e 17:12 fecham com saldo 0h00, não +0h03', async () => {
  equipe = [ELIAS, DO_TURNO_A];
  colaboradorLogado = DO_TURNO_A;
  await baterDia(DO_TURNO_A, '2026-09-15', ['07:29', '12:30', '14:00', '17:12']);

  const dia = servicoPonto.obterJornadaDoDia(DO_TURNO_A.id, '2026-09-15');
  expect(dia.minutosPrevistos).toBe(480); // 8h, da CLT
  expect(dia.minutosTrabalhados).toBe(493);
  // O relógio conta contra as 8h: 10 de compensação do sábado + 3 de variação
  expect(dia.saldoBrutoMinutos).toBe(13);
  expect(dia.compensacaoMinutos).toBe(10);
  expect(dia.saldoMinutos).toBe(0);
  expect(servicoPonto.obterAjusteDoDia(DO_TURNO_A.id, '2026-09-15')).toBeNull();
});

test('HORÁRIO A: o almoço reduzido além de 5 min conta, e a entrada/saída não o mascara', async () => {
  equipe = [ELIAS, DO_TURNO_A];
  colaboradorLogado = DO_TURNO_A;
  // Entrada e saída exatas; almoço de 12:32 a 13:56 (84 min, 6 a menos)
  await baterDia(DO_TURNO_A, '2026-09-15', ['07:30', '12:32', '13:56', '17:10']);

  const dia = servicoPonto.obterJornadaDoDia(DO_TURNO_A.id, '2026-09-15');
  expect(dia.tolerancia.intervalo?.reducaoMinutos).toBe(6);
  expect(dia.saldoMinutos).toBe(6);
});

test('HORÁRIO B: entrada 08:22 não gera −0h02', async () => {
  // Turno B: 08:20 · 11:00 · 12:30 · 18:00, 8h10
  equipe = [ELIAS, DO_TURNO_B];
  colaboradorLogado = DO_TURNO_B;
  await baterDia(DO_TURNO_B, '2026-09-15', ['08:22', '11:00', '12:30', '18:00']);

  const dia = servicoPonto.obterJornadaDoDia(DO_TURNO_B.id, '2026-09-15');
  expect(dia.minutosPrevistos).toBe(480);
  // 8h08 trabalhadas: +8 contra as 8h — os 10 da compensação menos os 2 do atraso
  expect(dia.saldoBrutoMinutos).toBe(8);
  expect(dia.compensacaoMinutos).toBe(10);
  expect(dia.saldoMinutos).toBe(0);
  // Medido contra o horário do B, e não contra o do A
  expect(dia.tolerancia.entradaESaida).toEqual({ efeitoEntrada: -2, efeitoSaida: 0, tolerado: true });
});

test('HORÁRIO B: a mesma batida medida contra o horário do A seria atraso de 52 min', async () => {
  // Prova de que o turno da ficha é o que manda: 08:22 no turno A é outra história
  equipe = [ELIAS, DO_TURNO_A];
  colaboradorLogado = DO_TURNO_A;
  await baterDia(DO_TURNO_A, '2026-09-15', ['08:22', '12:30', '14:00', '17:10']);
  expect(servicoPonto.obterJornadaDoDia(DO_TURNO_A.id, '2026-09-15').saldoMinutos).toBe(-52);
});

test('SÁBADO: 08:03 às 11:57 fecha com saldo 0h00, e não −0h06', async () => {
  equipe = [ELIAS, DO_TURNO_A];
  colaboradorLogado = DO_TURNO_A;
  // 19/09/2026 é sábado
  await baterSabado(DO_TURNO_A, '2026-09-19', '08:03', '11:57');

  const dia = servicoPonto.obterJornadaDoDia(DO_TURNO_A.id, '2026-09-19');
  expect(dia.minutosPrevistos).toBe(240);
  expect(dia.minutosTrabalhados).toBe(234);
  expect(dia.saldoBrutoMinutos).toBe(-6);
  expect(dia.saldoMinutos).toBe(0);
  expect(dia.tolerancia.entradaESaida).toEqual({ efeitoEntrada: -3, efeitoSaida: -3, tolerado: true });
});

// ============================================================
// O ESPELHO AUDITÁVEL
// ============================================================

test('o espelho mostra a conta de cada dia: previsto, relógio, variações, tolerância, saldo', async () => {
  equipe = [ELIAS, DO_TURNO_A];
  colaboradorLogado = DO_TURNO_A;
  await baterDia(DO_TURNO_A, '2026-09-14', ['07:29', '12:30', '14:00', '17:12']); // tolerado
  await baterDia(DO_TURNO_A, '2026-09-15', ['07:24', '12:30', '14:00', '17:10']); // entrada 6 antes

  colaboradorLogado = ELIAS;
  const html = servicoPonto.gerarHtmlEspelho('2026-09-14', '2026-09-15', [DO_TURNO_A.id]);

  for (const coluna of ['Previsto', 'Trabalhado', 'Relógio', 'Saldo']) {
    expect(html).toContain(`<th>${coluna}</th>`);
  }
  /**
   * AS COLUNAS DAS SOMAS SAÍRAM DO PAPEL — pedido do Elias: poluíam o
   * espelho. O detalhe marcação a marcação continua no CSV (teste abaixo);
   * no papel, Relógio e Saldo lado a lado e a legenda em texto corrido.
   */
  expect(html).not.toContain('<th>Entrada / Saída</th>');
  expect(html).not.toContain('<th>Almoço</th>');
  expect(html).not.toContain('E -1 / S +2');
  const legenda = html.slice(html.indexOf('class="legenda"'), html.indexOf('</p>', html.indexOf('class="legenda"')));
  expect(legenda).toContain('até 5 minutos na entrada');
  for (const simbolo of ['✓', '✗', '(E =', '(S)', '(R)']) expect(legenda).not.toContain(simbolo);

  // O relógio conta contra as 8h da CLT: segunda +0h13 (10 de compensação +
  // 3 tolerados, saldo 0h00); terça +0h16 (10 + 6 que contam, saldo +0h06)
  expect(html).toContain('+0h13');
  expect(html).toContain('+0h16');
  expect(html).toContain('+0h06');

  // O rodapé fecha a conta: relógio +29 (dos quais +20 de compensação),
  // tolerância +3, saldo +26
  expect(html).toContain('Relógio do período');
  expect(html).toContain('dos quais, compensação do sábado (10 min × 2 dias)');
  expect(html).toContain('Tolerância aplicada');

  // A jornada do documento: as 8h da CLT, e os 10 min como compensação —
  // decisão do Elias com a Dani (01/10/2026). O horário do turno segue lá.
  expect(html).toContain('Turno A · 07:30 às 17:10');
  expect(html).toContain('8h00 por dia útil + 0h10 de compensação do sábado');
});

test('o CSV traz as mesmas colunas de auditoria', async () => {
  equipe = [ELIAS, DO_TURNO_A];
  colaboradorLogado = DO_TURNO_A;
  await baterDia(DO_TURNO_A, '2026-09-14', ['07:29', '12:30', '14:00', '17:12']);

  colaboradorLogado = ELIAS;
  const csv = servicoPonto.gerarCsvDoPeriodo('2026-09-14', '2026-09-14', [DO_TURNO_A.id]);
  const [cabecalho, linha] = csv.split('\n');
  expect(cabecalho).toContain('Relogio;Entrada/Saida;Almoco;Tolerancia aplicada;Saldo do dia');
  expect(linha).toContain('E -1 / S +2 = 3 ✓');
});

test('ESTAGIÁRIO: a mesma regra, medida contra o turno de estágio dele', async () => {
  /**
   * A carga do estágio é outra (5h no turno escola), mas a regra é a
   * mesma: 5 min por marcação, 10 somadas. O horário vem do turno da
   * ficha, que é a especificidade de cada estagiário.
   */
  const ESTAGIARIO = {
    ...ELIAS, id: 'est', nome: 'Estagiária', login: 'est', nivel: 1,
    setor: 'Estágio', cargo: 'Estagiária', turno: 'E2', cargaHorariaDiariaMinutos: undefined,
  };
  equipe = [ELIAS, ESTAGIARIO];
  colaboradorLogado = ESTAGIARIO;

  // Turno E2: 07:30 às 12:30, direto. Entrou 07:33 e saiu 12:31
  await baterSabado(ESTAGIARIO, '2026-09-15', '07:33', '12:31');
  const tolerado = servicoPonto.obterJornadaDoDia(ESTAGIARIO.id, '2026-09-15');
  expect(tolerado.minutosPrevistos).toBe(300);
  expect(tolerado.saldoBrutoMinutos).toBe(-2);
  expect(tolerado.saldoMinutos).toBe(0);
  expect(tolerado.tolerancia.modo).toBe('marcacoes');

  // Entrou 07:37: 7 de atraso numa marcação só — conta inteiro
  await baterSabado(ESTAGIARIO, '2026-09-14', '07:37', '12:30');
  expect(servicoPonto.obterJornadaDoDia(ESTAGIARIO.id, '2026-09-14').saldoMinutos).toBe(-7);
});

test('A LYVIA NO SÁBADO: 08:00 às 12:00 fecha com saldo 0h00, e não −0h45', async () => {
  /**
   * Estagiária do E3 (5h por dia), contrato de 30h, vem ao sábado. O sábado
   * previa 5h (a sobra até as 30h) e a pausa perdoava 15 min: −1h + 0h15 =
   * −0h45 todo sábado, com a loja fechando ao meio-dia. Agora o sábado é
   * de 4h, sem pausa, e a tolerância mede contra 08:00 e 12:00.
   */
  const LYVIA = {
    ...ELIAS, id: 'lyvia-e3', nome: 'Lyvia', login: 'lyvia', nivel: 1,
    setor: 'Estágio', cargo: 'Estagiária', turno: 'E3', trabalhaSabado: true,
    cargaHorariaDiariaMinutos: undefined, cargaSemanalMinutos: 1800,
  };
  equipe = [ELIAS, LYVIA];
  colaboradorLogado = LYVIA;

  await baterSabado(LYVIA, '2026-09-19', '08:00', '12:00');
  const cumpriu = servicoPonto.obterJornadaDoDia(LYVIA.id, '2026-09-19');
  expect(cumpriu.minutosPrevistos).toBe(240);
  expect(cumpriu.saldoMinutos).toBe(0);

  // Pequena variação: tolerada como a de qualquer um
  await baterSabado(LYVIA, '2026-09-12', '08:03', '11:58');
  expect(servicoPonto.obterJornadaDoDia(LYVIA.id, '2026-09-12').saldoMinutos).toBe(0);

  // Saiu 11:45: 15 a menos — a pausa não perdoa no sábado, conta inteiro
  await baterSabado(LYVIA, '2026-09-05', '08:00', '11:45');
  expect(servicoPonto.obterJornadaDoDia(LYVIA.id, '2026-09-05').saldoMinutos).toBe(-15);
});

test('O ESPELHO TRAZ TODOS OS DIAS: domingo escrito, feriado pelo nome', async () => {
  /**
   * Pedido do Elias: a semana inteira no espelho. Só entravam dias com
   * batida ou com previsto, e o domingo e o feriado fechado sumiam.
   */
  equipe = [ELIAS, DO_TURNO_A];
  colaboradorLogado = ELIAS;

  const html = comFeriados(
    [{ id: 'f7', data: '2026-09-07', nome: 'Independência do Brasil', minutosPrevistos: 0, criadoEm: '' }],
    () => servicoPonto.gerarHtmlEspelho('2026-09-06', '2026-09-08', [DO_TURNO_A.id])
  );

  // Os três dias, em ordem: domingo, feriado, terça
  const linhas = html.slice(html.indexOf('<tbody>'), html.indexOf('</tbody>'));
  expect(linhas.match(/<tr/g)?.length).toBe(3);
  expect(linhas).toContain('06/09/2026');
  expect(linhas).toContain('07/09/2026');
  expect(linhas).toContain('08/09/2026');

  // Domingo escrito nas células; feriado com o nome dele
  const domingo = linhas.slice(linhas.indexOf('06/09/2026'), linhas.indexOf('07/09/2026'));
  // Uma célula só, ocupando as quatro marcações: o nome aparece uma vez
  expect(domingo.match(/>Domingo</g)?.length).toBe(1);
  expect(domingo).toContain('colspan="4"');
  const feriado = linhas.slice(linhas.indexOf('07/09/2026'), linhas.indexOf('08/09/2026'));
  expect(feriado).toContain('Independência do Brasil');
  expect(feriado.match(/Independência do Brasil/g)?.length).toBe(1);
});

test('a tela do Banco de Horas também mostra todos os dias, e não deixa lançar no domingo', async () => {
  const tela = await Bun.file('src/componentes/BancoDeHoras.tsx').text();
  const semComentarios = tela.replace(/\/\*[\s\S]*?\*\//g, '');
  expect(semComentarios).not.toContain('Object.keys(j.marcacoes).length > 0 || j.minutosPrevistos > 0');
  expect(semComentarios).toContain('const lancavel = podeCorrigirMarcacao && aceitaMarcacaoNoDia(jornada.data)');
  expect(semComentarios).toContain('disabled={!lancavel}');
});

// ============================================================
// O PAPEL E A TELA SÃO O MESMO ESPELHO
//
// O Elias: "o espelho de ponto para imprimir não bate com o espelho do
// painel?". Os números vinham da mesma conta, mas cada um montava a
// própria grade — colunas diferentes, domingo diferente, rodapé diferente.
// ============================================================

test('o rodapé fecha a conta: trabalhado − previsto = relógio; relógio − tolerância = saldo', async () => {
  const { totaisDoEspelho } = await import('./ponto');
  equipe = [ELIAS, DO_TURNO_A];
  colaboradorLogado = DO_TURNO_A;
  await baterDia(DO_TURNO_A, '2026-09-14', ['07:29', '12:30', '14:00', '17:12']); // +3, tolerado
  await baterDia(DO_TURNO_A, '2026-09-15', ['07:24', '12:30', '14:00', '17:10']); // +6, conta

  colaboradorLogado = ELIAS;
  const resumo = servicoPonto
    .obterResumoDoPeriodo('2026-09-01', '2026-09-30')
    .find((r) => r.colaborador.id === DO_TURNO_A.id)!;
  const t = totaisDoEspelho(resumo);

  // Só os dias com jornada fechada: os outros 20 dias úteis do mês não entram no previsto
  expect(t.trabalhado).toBe(493 + 496);
  // As 8h da CLT por dia útil (01/10/2026: era o relógio do turno, 8h10)
  expect(t.previsto).toBe(480 + 480);
  expect(t.relogio).toBe(t.trabalhado - t.previsto);
  // +29: os 20 da compensação do sábado (10 × 2 dias) e as variações +3 e +6
  expect(t.relogio).toBe(29);
  expect(t.compensacao).toBe(20);
  expect(t.tolerancia).toBe(3);
  // Sem folga no período, a compensação fica inteira no saldo
  expect(t.folgaConsumida).toBe(0);
  expect(t.saldoPeriodo).toBe(t.relogio - t.tolerancia);
});

/*
  A COMPENSAÇÃO DO SÁBADO (01/10/2026, Elias com a Dani). A jornada é a da
  CLT, 8h; os 10 minutos do turno integral são o combinado com que a pessoa
  paga a folga de sábado do mês — e a folga consome só esse crédito, até 4h.
*/
test('a compensação rende 10 min no dia útil fechado do turno integral — e só nele', async () => {
  const ESTAGIO = { ...DO_TURNO_A, id: 'est', login: 'est', setor: 'Estágio', cargo: 'Estagiária', turno: 'E1' };
  const PROPRIA = { ...DO_TURNO_A, id: 'mp', login: 'mp', cargaHorariaDiariaMinutos: 480 };
  equipe = [ELIAS, DO_TURNO_A, ESTAGIO, PROPRIA];
  colaboradorLogado = DO_TURNO_A;
  await baterDia(DO_TURNO_A, '2026-09-14', ['07:30', '12:30', '14:00', '17:10']);
  baterParcial(DO_TURNO_A, '2026-09-15', { entrada: '07:30' });
  baterParcial(DO_TURNO_A, '2026-09-12', { entrada: '08:00', saida: '12:00' });
  baterParcial(ESTAGIO, '2026-09-14', { entrada: '07:30', saida: '13:30' });
  baterParcial(PROPRIA, '2026-09-14', { entrada: '07:30', saida_almoco: '12:30', retorno_almoco: '14:00', saida: '17:00' });

  const comp = (quem: any, data: string) => servicoPonto.obterJornadaDoDia(quem.id, data).compensacaoMinutos;
  expect(comp(DO_TURNO_A, '2026-09-14')).toBe(10); // dia útil fechado
  expect(comp(DO_TURNO_A, '2026-09-15')).toBe(0); // pela metade não paga folga
  expect(comp(DO_TURNO_A, '2026-09-12')).toBe(0); // sábado: 4h corridas, sem combinado
  expect(comp(ESTAGIO, '2026-09-14')).toBe(0); // estágio não tem o combinado
  expect(comp(PROPRIA, '2026-09-14')).toBe(0); // jornada própria na ficha manda
  // E o horário do turno segue sendo o horário: sair às 17:10 não é hora extra
  expect(servicoPonto.obterJornadaDoDia(DO_TURNO_A.id, '2026-09-14').saldoMinutos).toBe(0);
  expect(servicoPonto.obterAjusteDoDia(DO_TURNO_A.id, '2026-09-14')).toBeNull();
});

test('a folga de sábado consome a compensação, até 4h — e nunca deixa devendo', async () => {
  const { totaisDoEspelho, linhasDoRodape } = await import('./ponto');
  equipe = [ELIAS, DO_TURNO_A];
  colaboradorLogado = DO_TURNO_A;
  await baterDia(DO_TURNO_A, '2026-09-14', ['07:30', '12:30', '14:00', '17:10']);
  await baterDia(DO_TURNO_A, '2026-09-15', ['07:30', '12:30', '14:00', '17:10']);
  // Sábado 19/09 de folga, aprovada
  comAusenciaAprovada(DO_TURNO_A, '2026-09-19', 'folga_sabado');

  colaboradorLogado = ELIAS;
  const resumo = servicoPonto.obterResumoDoPeriodo('2026-09-14', '2026-09-19').find((r) => r.colaborador.id === DO_TURNO_A.id)!;
  expect(resumo.folgasDeSabado).toBe(1);
  const t = totaisDoEspelho(resumo);
  // Juntou 20 minutos: a folga consome os 20, e não as 4h — ninguém fica devendo por ela
  expect(t.compensacao).toBe(20);
  expect(t.folgaConsumida).toBe(20);
  expect(t.saldoPeriodo).toBe(0);
  // A conta fecha no papel: relógio − tolerância − folga = saldo
  expect(t.relogio - t.tolerancia - t.folgaConsumida).toBe(t.saldoPeriodo);
  const folga = linhasDoRodape(t).find((l) => l.rotulo.startsWith('Folga de sábado'))!;
  expect(folga.minutos).toBe(-20);

  // Com o mês cheio de compensação, a folga para nas 4h
  const muito = totaisDoEspelho({ ...resumo, compensacaoMinutos: 260 });
  expect(muito.folgaConsumida).toBe(240);
  expect(muito.saldoPeriodo).toBe(20);
  armazenamento.removeItem('conecta_v4_justificativas_ausencia');
});

test('o espelho com dia em branco não fecha 0h00 como se estivesse certo', async () => {
  /*
    01/10/2026: setembro com seis dias úteis em branco, e o rodapé dizia
    "Saldo do período 0h00". Antes da cobrança de falta o dia vazio não
    entra no saldo — mas tem de aparecer, e o saldo se declara provisório.
  */
  const { totaisDoEspelho, linhasDoRodape, espelhoIncompleto } = await import('./ponto');
  equipe = [ELIAS, DO_TURNO_A];
  colaboradorLogado = DO_TURNO_A;
  // Relógio da suíte em 16/09 (quarta): 14 e 15 batidos; 10 e 11 em branco
  await baterDia(DO_TURNO_A, '2026-09-14', ['07:30', '12:30', '14:00', '17:10']);
  await baterDia(DO_TURNO_A, '2026-09-15', ['07:30', '12:30', '14:00', '17:10']);

  colaboradorLogado = ELIAS;
  const resumo = servicoPonto
    .obterResumoDoPeriodo('2026-09-10', '2026-09-15')
    .find((r) => r.colaborador.id === DO_TURNO_A.id)!;
  // 10 e 11 (qui, sex) e o sábado 12 em branco; o domingo 13 não é de trabalho
  expect(resumo.diasSemBatidaForaDaConta).toEqual(['2026-09-10', '2026-09-11', '2026-09-12']);

  const t = totaisDoEspelho(resumo);
  expect(t.diasSemBatida).toBe(3);
  expect(t.previstoSemBatida).toBe(480 + 480 + 240);
  // Os dois dias batidos no horário: só os 20 da compensação do sábado
  expect(t.saldoPeriodo).toBe(20);
  expect(espelhoIncompleto(t)).toBe(true);

  const linhas = linhasDoRodape(t);
  const semBatida = linhas.find((l) => l.rotulo.startsWith('Dias sem batida'))!;
  expect(semBatida.alerta).toBe(true);
  expect(semBatida.minutos).toBe(1200);
  const saldo = linhas.find((l) => l.rotulo.startsWith('Saldo do período'))!;
  expect(saldo.rotulo).toContain('provisório: espelho incompleto');
  expect(saldo.alerta).toBe(true);

  // O papel diz o mesmo
  const papel = servicoPonto.gerarHtmlEspelho('2026-09-10', '2026-09-15', [DO_TURNO_A.id]);
  expect(papel).toContain('provisório: espelho incompleto');
  expect(papel).toContain('class=" alerta"');

  // E o espelho completo continua limpo
  const completo = totaisDoEspelho(
    servicoPonto.obterResumoDoPeriodo('2026-09-14', '2026-09-15').find((r) => r.colaborador.id === DO_TURNO_A.id)!
  );
  expect(espelhoIncompleto(completo)).toBe(false);
  expect(linhasDoRodape(completo).some((l) => l.alerta)).toBe(false);
});

test('o painel e o papel desenham a MESMA linha e o MESMO rodapé', async () => {
  const semComentarios = (f: string) => f.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  const tela = semComentarios(await Bun.file('src/componentes/BancoDeHoras.tsx').text());
  const servico = semComentarios(await Bun.file('src/servicos/ponto.ts').text());
  const papel = servico.slice(servico.indexOf('gerarHtmlEspelho('));

  for (const fonte of [tela, papel]) {
    expect(fonte).toContain('linhaDoEspelho(');
    expect(fonte).toContain('linhasDoRodape(totaisDoEspelho(');
  }
  // As mesmas colunas no painel
  for (const coluna of ['>Previsto<', '>Trabalhado<', '>Relógio<', '>Saldo<']) {
    expect(tela).toContain(coluna);
  }
  // E nenhuma grade própria de novo
  expect(tela).not.toContain('>Total</th>');
  expect(papel).not.toContain('Total trabalhado no período');
});

test('ALINE, 21/09, no espelho: relógio +0h11 (10 de compensação + 1) e saldo 0h00', async () => {
  equipe = [ELIAS, DO_TURNO_A];
  colaboradorLogado = DO_TURNO_A;
  await baterDia(DO_TURNO_A, '2026-09-21', ['07:30', '12:30', '14:05', '17:16']);

  const dia = servicoPonto.obterJornadaDoDia(DO_TURNO_A.id, '2026-09-21');
  expect(dia.minutosTrabalhados).toBe(491);
  // O relógio conta contra as 8h da CLT: os 10 da compensação e +1 de variação
  expect(dia.saldoBrutoMinutos).toBe(11);
  expect(dia.compensacaoMinutos).toBe(10);
  expect(dia.saldoMinutos).toBe(0);
  expect(servicoPonto.obterAjusteDoDia(DO_TURNO_A.id, '2026-09-21')).toBeNull();
});

// ============================================================
// "SEM BATER HOJE" RESPEITA A ENTRADA DE CADA UM
//
// Pedido do Elias: às 07:35 o painel dava como faltoso até quem é do
// turno B, que só entra às 08:20. A lista de quem sumiu vinha cheia de
// quem ainda nem devia ter chegado.
// ============================================================

test('sem bater hoje: só depois da entrada do turno da pessoa mais 5 minutos', () => {
  equipe = [GESTOR, DO_TURNO_A, DO_TURNO_B];
  const quarta = (hora: string) => new Date(`2026-09-16T${hora}:00`);

  // Turno A entra 07:30: até 07:35 está na margem; às 07:36, já devia
  expect(servicoPonto.estaSemBaterHoje(DO_TURNO_A as any, quarta('07:35'))).toBe(false);
  expect(servicoPonto.estaSemBaterHoje(DO_TURNO_A as any, quarta('07:36'))).toBe(true);

  // O mesmo horário não cobra quem é do turno B
  expect(servicoPonto.estaSemBaterHoje(DO_TURNO_B as any, quarta('07:36'))).toBe(false);
  expect(servicoPonto.estaSemBaterHoje(DO_TURNO_B as any, quarta('08:25'))).toBe(false);
  expect(servicoPonto.estaSemBaterHoje(DO_TURNO_B as any, quarta('08:26'))).toBe(true);
});

test('sem bater hoje: quem já bateu, e o domingo, não entram', () => {
  equipe = [GESTOR, DO_TURNO_A];

  expect(servicoPonto.estaSemBaterHoje(DO_TURNO_A as any, new Date('2026-09-20T10:00:00'))).toBe(false);

  baterParcial(DO_TURNO_A, '2026-09-16', { entrada: '07:31' });
  expect(servicoPonto.estaSemBaterHoje(DO_TURNO_A as any, new Date('2026-09-16T10:00:00'))).toBe(false);
});

test('o painel conta como sem bater só quem já passou da hora', () => {
  colaboradorLogado = GESTOR;
  equipe = [GESTOR, DO_TURNO_A, DO_TURNO_B];
  setSystemTime(new Date(2026, 8, 16, 7, 40, 0));

  const resumo = servicoPonto.obterResumoDoPeriodo('2026-09-16', '2026-09-16');
  const de = (id: string) => resumo.find((r) => r.colaborador.id === id)!;

  expect(de(DO_TURNO_A.id).semBaterHoje).toBe(true);
  expect(de(DO_TURNO_B.id).semBaterHoje).toBe(false);
  // Presença é outra pergunta: nenhum dos dois bateu
  expect(de(DO_TURNO_B.id).registrouHoje).toBe(false);
});

test('a entrada pede motivo a partir de 6 minutos: o limite é o da marcação', () => {
  equipe = [GESTOR, DO_TURNO_A];
  const entrada = (hora: string) =>
    servicoPonto.avaliarMarcacao(DO_TURNO_A.id, 'entrada', new Date(`2026-09-16T${hora}:00`));

  expect(entrada('07:35').precisaMotivo).toBe(false);
  expect(entrada('07:36').precisaMotivo).toBe(true);
});

// ============================================================
// O DÉBITO TEM O NOME DA CAUSA
//
// O Elias entrou atrasado e o aviso dizia "Saída antecipada": era o nome
// de todo débito, viesse de onde viesse.
// ============================================================

const fecharDiaDoA = async (entrada: string, saida: string) => {
  equipe = [GESTOR, DO_TURNO_A];
  baterParcial(DO_TURNO_A, '2026-09-16', {
    entrada, saida_almoco: '12:30', retorno_almoco: '14:00', saida,
  });
  const res = await servicoPonto.apurarDia(DO_TURNO_A.id, '2026-09-16');
  return res.ajuste!;
};

test('atraso na entrada não vira "saída antecipada"', async () => {
  const ajuste = await fecharDiaDoA('07:50', '17:10');
  expect(ajuste.tipo).toBe('debito');
  expect(servicoPonto.rotuloDoAjuste(ajuste)).toBe('Atraso na entrada');
});

test('saída antes da hora continua sendo saída antecipada', async () => {
  const ajuste = await fecharDiaDoA('07:30', '16:50');
  expect(servicoPonto.rotuloDoAjuste(ajuste)).toBe('Saída antecipada');
});

test('as duas causas no mesmo dia aparecem juntas', async () => {
  const ajuste = await fecharDiaDoA('07:50', '16:50');
  expect(servicoPonto.rotuloDoAjuste(ajuste)).toBe('Atraso na entrada e saída antecipada');
});

test('almoço esticado é intervalo estendido', async () => {
  equipe = [GESTOR, DO_TURNO_A];
  baterParcial(DO_TURNO_A, '2026-09-16', {
    entrada: '07:30', saida_almoco: '12:30', retorno_almoco: '14:30', saida: '17:10',
  });
  const { ajuste } = await servicoPonto.apurarDia(DO_TURNO_A.id, '2026-09-16');
  expect(servicoPonto.rotuloDoAjuste(ajuste!)).toBe('Intervalo estendido');
});

test('hora extra continua hora extra', async () => {
  const ajuste = await fecharDiaDoA('07:30', '17:40');
  expect(ajuste.tipo).toBe('hora_extra');
  expect(servicoPonto.rotuloDoAjuste(ajuste)).toBe('Hora extra');
});

// ============================================================
// AUSÊNCIA APROVADA NÃO TRANSFORMA TRABALHO EM HORA EXTRA
//
// A Fernanda teve atestado aprovado em 25/09 e bateu as quatro marcações:
// o previsto zerou e as 8h13 trabalhadas viraram +8h13 no espelho.
// ============================================================

const comAusenciaAprovada = (quem: any, data: string, tipo: string) =>
  armazenamento.setItem(
    'conecta_v4_justificativas_ausencia',
    JSON.stringify([
      {
        id: `aus-${data}`, colaboradorId: quem.id, dataInicio: data, dataFim: data,
        tipo, estado: 'aprovada', criadoEm: new Date().toISOString(),
      },
    ])
  );

test('atestado aprovado + dia trabalhado inteiro: saldo zero, não +8h', () => {
  equipe = [GESTOR, DO_TURNO_A];
  comAusenciaAprovada(DO_TURNO_A, '2026-09-25', 'atestado');
  baterParcial(DO_TURNO_A, '2026-09-25', {
    entrada: '07:29', saida_almoco: '12:32', retorno_almoco: '14:03', saida: '17:13',
  });

  const dia = servicoPonto.obterJornadaDoDia(DO_TURNO_A.id, '2026-09-25');
  expect(dia.minutosPrevistos).toBe(480);
  // Veio e cumpriu o horário: os 10 minutos são a compensação, como em
  // qualquer dia, e não hora extra sobre o abono
  expect(dia.compensacaoMinutos).toBe(10);
  expect(dia.saldoMinutos).toBe(0);

  armazenamento.removeItem('conecta_v4_justificativas_ausencia');
});

test('declaração de comparecimento: a falta daquele dia está perdoada', () => {
  // Saiu às 15:10 para a consulta: 2h a menos, que a declaração cobre
  equipe = [GESTOR, DO_TURNO_A];
  comAusenciaAprovada(DO_TURNO_A, '2026-09-25', 'comparecimento');
  baterParcial(DO_TURNO_A, '2026-09-25', {
    entrada: '07:30', saida_almoco: '12:30', retorno_almoco: '14:00', saida: '15:10',
  });

  const dia = servicoPonto.obterJornadaDoDia(DO_TURNO_A.id, '2026-09-25');
  expect(dia.minutosTrabalhados).toBe(370);
  expect(dia.saldoMinutos).toBe(0);

  armazenamento.removeItem('conecta_v4_justificativas_ausencia');
});

test('o que passa da jornada normal continua sendo extra, com ou sem abono', () => {
  equipe = [GESTOR, DO_TURNO_A];
  comAusenciaAprovada(DO_TURNO_A, '2026-09-25', 'atestado');
  baterParcial(DO_TURNO_A, '2026-09-25', {
    entrada: '07:30', saida_almoco: '12:30', retorno_almoco: '14:00', saida: '18:10',
  });

  expect(servicoPonto.obterJornadaDoDia(DO_TURNO_A.id, '2026-09-25').saldoMinutos).toBe(60);

  armazenamento.removeItem('conecta_v4_justificativas_ausencia');
});

test('ausência aprovada SEM batida continua prevendo zero, sem débito', () => {
  equipe = [GESTOR, DO_TURNO_A];
  comAusenciaAprovada(DO_TURNO_A, '2026-09-25', 'atestado');

  const dia = servicoPonto.obterJornadaDoDia(DO_TURNO_A.id, '2026-09-25');
  expect(dia.minutosPrevistos).toBe(0);
  expect(dia.saldoMinutos).toBe(0);

  armazenamento.removeItem('conecta_v4_justificativas_ausencia');
});

// ============================================================
// DIA SEM BATIDA É FALTA — a partir de 01/10/2026
//
// O Elias viu no espelho: os dias sem batida passavam sem débito. Decisão
// dele: débito no espelho e a fila do líder (confirmar ou abonar), e só a
// partir de 01/10/2026 — antes disso, muita gente ainda nem usava o sistema.
// 2026-10-06 é terça; 2026-10-03 é sábado; 2026-10-04 é domingo.
// ============================================================

const emOutubro = () => setSystemTime(new Date(2026, 9, 8, 9, 0, 0));

test('dia útil sem batida, já passado, é falta: o débito da jornada inteira', () => {
  emOutubro();
  equipe = [GESTOR, DO_TURNO_A];

  const dia = servicoPonto.obterJornadaDoDia(DO_TURNO_A.id, '2026-10-06');
  expect(dia.falta).toBe(true);
  // A jornada da CLT: 8h (01/10/2026)
  expect(dia.saldoMinutos).toBe(-480);
});

test('o sábado de quem vem ao sábado também é falta, das 4 horas', () => {
  emOutubro();
  equipe = [GESTOR, DO_TURNO_A];
  const sabado = servicoPonto.obterJornadaDoDia(DO_TURNO_A.id, '2026-10-03');
  expect(sabado.falta).toBe(true);
  expect(sabado.saldoMinutos).toBe(-240);
});

test('não é falta: hoje, domingo, antes de 01/10, antes da admissão, dia abonado', () => {
  emOutubro();
  equipe = [GESTOR, DO_TURNO_A];
  const falta = (data: string, quem: any = DO_TURNO_A) =>
    servicoPonto.obterJornadaDoDia(quem.id, data).falta;

  expect(falta('2026-10-08')).toBe(false); // hoje ainda dá tempo
  expect(falta('2026-10-04')).toBe(false); // domingo
  expect(falta('2026-09-29')).toBe(false); // antes da cobrança
  expect(servicoPonto.obterJornadaDoDia(DO_TURNO_A.id, '2026-09-29').saldoMinutos).toBe(0);

  const NOVATO = { ...DO_TURNO_A, id: 'novato', login: 'novato', dataAdmissao: '2026-10-07' };
  equipe = [GESTOR, NOVATO];
  expect(falta('2026-10-06', NOVATO)).toBe(false);

  equipe = [GESTOR, DO_TURNO_A];
  comAusenciaAprovada(DO_TURNO_A, '2026-10-06', 'atestado');
  expect(falta('2026-10-06')).toBe(false);
  armazenamento.removeItem('conecta_v4_justificativas_ausencia');
});

test('a falta vai para a fila do líder, com o nome "Falta"', async () => {
  emOutubro();
  colaboradorLogado = GESTOR;
  equipe = [GESTOR, DO_TURNO_A];

  await servicoPonto.levantarDiasIncompletos();

  const ajuste = servicoPonto.obterAjusteDoDia(DO_TURNO_A.id, '2026-10-06');
  expect(ajuste?.tipo).toBe('dia_incompleto');
  expect(ajuste?.estado).toBe('pendente');
  expect(ajuste?.minutosPrevistos).toBe(480);
  expect(servicoPonto.rotuloDoAjuste(ajuste!)).toBe('Falta');
  // Setembro não entra na fila
  expect(servicoPonto.obterAjusteDoDia(DO_TURNO_A.id, '2026-09-29')).toBeNull();
});

test('o líder confirma: débito; abona: zero — e o espelho mostra o decidido', async () => {
  emOutubro();
  colaboradorLogado = GESTOR;
  equipe = [GESTOR, DO_TURNO_A];
  await servicoPonto.levantarDiasIncompletos();

  const terca = servicoPonto.obterAjusteDoDia(DO_TURNO_A.id, '2026-10-06')!;
  await servicoPonto.decidirDiaIncompleto(terca.id, false);
  // A jornada da CLT, 8h (01/10/2026)
  expect(servicoPonto.obterJornadaDoDia(DO_TURNO_A.id, '2026-10-06').saldoMinutos).toBe(-480);

  const segunda = servicoPonto.obterAjusteDoDia(DO_TURNO_A.id, '2026-10-05')!;
  await servicoPonto.decidirDiaIncompleto(segunda.id, true);
  expect(servicoPonto.obterJornadaDoDia(DO_TURNO_A.id, '2026-10-05').saldoMinutos).toBe(0);
});

test('o espelho escreve "Falta" e o rodapé soma as faltas numa linha própria', async () => {
  emOutubro();
  colaboradorLogado = GESTOR;
  equipe = [GESTOR, DO_TURNO_A];
  const { linhaDoEspelho, totaisDoEspelho, linhasDoRodape } = await import('./ponto');

  const linha = linhaDoEspelho(servicoPonto.obterJornadaDoDia(DO_TURNO_A.id, '2026-10-06'), DO_TURNO_A as any);
  expect(linha.falta).toBe(true);
  expect(linha.saldo).toBe(-480);

  // 05 e 06/10 sem batida; o relógio não muda, a linha de faltas soma as duas
  const resumo = servicoPonto
    .obterResumoDoPeriodo('2026-10-05', '2026-10-06')
    .find((r) => r.colaborador.id === DO_TURNO_A.id)!;
  const t = totaisDoEspelho(resumo);
  expect(t.faltas).toBe(-960);
  expect(t.relogio).toBe(0);
  expect(t.tolerancia).toBe(0);
  // Dia sem batida não rende compensação do sábado
  expect(t.compensacao).toBe(0);
  expect(t.saldoPeriodo).toBe(-960);
  expect(linhasDoRodape(t).map((l) => l.rotulo)).toContain('Faltas (dias sem batida)');

  expect(servicoPonto.gerarHtmlEspelho('2026-10-05', '2026-10-06', [DO_TURNO_A.id])).toContain('>Falta<');
});

// ============================================================
// O "DIA SEM FECHAR" QUE O DIA JÁ RESOLVEU SAI DA FILA
//
// Fernanda e Aline, 30/09: as quatro batidas no espelho, e o pedido de
// "dia sem fechar" parado em Aprovar jornadas. O pedido era criado e
// nunca mais revisto.
// ============================================================

const pedidoParado = (quem: any, data: string) => {
  const pedido = {
    id: `inc-${quem.id}-${data}`, colaboradorId: quem.id, data, tipo: 'dia_incompleto',
    minutos: 490, minutosTrabalhados: 0, minutosPrevistos: 490,
    estado: 'pendente', origem: 'pendencia', criadoEm: new Date().toISOString(),
  };
  bancoAjustes.push(pedido);
  armazenamento.setItem('conecta_v4_ajustes_jornada', JSON.stringify(bancoAjustes));
};

test('dia que fechou dentro da tolerância: o pedido parado sai da fila', async () => {
  emOutubro();
  colaboradorLogado = GESTOR;
  equipe = [GESTOR, DO_TURNO_A];
  pedidoParado(DO_TURNO_A, '2026-10-06');
  baterParcial(DO_TURNO_A, '2026-10-06', {
    entrada: '07:31', saida_almoco: '12:30', retorno_almoco: '14:00', saida: '17:12',
  });

  await servicoPonto.levantarDiasIncompletos();

  const depois = servicoPonto.obterAjusteDoDia(DO_TURNO_A.id, '2026-10-06');
  expect(depois?.estado).not.toBe('pendente');
  expect(
    servicoPonto.obterPendenciasParaDecidir().some(({ ajuste }) => ajuste.colaboradorId === DO_TURNO_A.id && ajuste.data === '2026-10-06')
  ).toBe(false);
});

test('dia que fechou com diferença: vira hora extra com o valor de verdade', async () => {
  emOutubro();
  colaboradorLogado = GESTOR;
  equipe = [GESTOR, DO_TURNO_A];
  pedidoParado(DO_TURNO_A, '2026-10-06');
  baterParcial(DO_TURNO_A, '2026-10-06', {
    entrada: '07:30', saida_almoco: '12:30', retorno_almoco: '14:00', saida: '18:10',
  });

  await servicoPonto.levantarDiasIncompletos();

  const depois = servicoPonto.obterAjusteDoDia(DO_TURNO_A.id, '2026-10-06');
  expect(depois?.tipo).toBe('hora_extra');
  expect(depois?.minutos).toBe(60);
  expect(depois?.estado).toBe('pendente');
});

test('o dia de hoje e o de ontem saem do MESMO relógio', async () => {
  /*
    O aparelho marca 30/09 23:30; o relógio sincronizado com o servidor,
    01/10 00:30. Com "hoje" de um e os dias para trás do outro, o 30/09
    nunca era conferido — e no outro sentido, o dia corrente entrava.
  */
  colaboradorLogado = GESTOR;
  equipe = [GESTOR, DO_TURNO_A];
  setSystemTime(new Date(2026, 9, 8, 23, 30, 0));
  const { sincronizarRelogio, reiniciarRelogio } = await import('./relogio');
  const fetchOriginal = globalThis.fetch;
  (globalThis as any).fetch = async () => ({
    headers: { get: () => new Date(2026, 9, 9, 0, 30, 0).toUTCString() },
  });
  await sincronizarRelogio('https://servidor.exemplo');
  globalThis.fetch = fetchOriginal;

  // 08/10 sem batida nenhuma: é falta, e é ontem pelo relógio que vale
  await servicoPonto.levantarDiasIncompletos();
  reiniciarRelogio();

  expect(servicoPonto.obterAjusteDoDia(DO_TURNO_A.id, '2026-10-08')?.tipo).toBe('dia_incompleto');
});

test('a fila busca no banco as batidas dos dias que analisa', async () => {
  /*
    Fernanda, Aline e Lyvia, 01/10: o espelho do RH em "Outubro" deixou no
    aparelho só o dia 1º, e a fila viu o 30/09 sem batida nenhuma — o
    pedido parado não foi revisto. As batidas estão no BANCO.
  */
  emOutubro();
  colaboradorLogado = GESTOR;
  equipe = [GESTOR, DO_TURNO_A];
  pedidoParado(DO_TURNO_A, '2026-10-06');
  baterParcial(DO_TURNO_A, '2026-10-06', {
    entrada: '07:31', saida_almoco: '12:30', retorno_almoco: '14:00', saida: '17:12',
  });
  // O aparelho, porém, só tem o mês corrente até ontem... vazio para o dia 6
  armazenamento.setItem(CHAVE_REGISTROS, JSON.stringify([]));
  // A tela do RH tinha pedido o mês inteiro de outubro
  janelaPedida = { inicio: '2026-10-08', fim: '2026-10-31' };

  await servicoPonto.levantarDiasIncompletos();

  expect(servicoPonto.obterAjusteDoDia(DO_TURNO_A.id, '2026-10-06')?.estado).not.toBe('pendente');
  // A janela foi ALARGADA para trás, sem perder o que a tela tinha pedido
  expect(janelaPedida!.inicio <= '2026-09-07').toBe(true);
  expect(janelaPedida!.fim).toBe('2026-10-31');
});

test('o dia de hoje não é incompleto: a pessoa ainda está trabalhando', () => {
  // De manhã ninguém bateu a saída — e não esqueceu, ela só sai às 17h
  equipe = [GESTOR, DO_TURNO_A];
  colaboradorLogado = GESTOR;
  baterParcial(DO_TURNO_A, dataDeHoje(), { entrada: '07:30' });
  expect(servicoPonto.obterPontosIncompletos(diasAtras(5), dataDeHoje())).toHaveLength(0);
});

// ============================================================
// COMPLETAR O DIA: uma ação, as batidas que faltam de uma vez
// ============================================================

test('completar o dia lança as batidas que faltam, de uma vez', async () => {
  equipe = [GESTOR, DO_TURNO_A];
  colaboradorLogado = GESTOR;
  baterParcial(DO_TURNO_A, diasAtras(3), { entrada: '07:30', saida_almoco: '12:30' });

  const res = await servicoPonto.completarDia({
    colaboradorId: DO_TURNO_A.id,
    data: diasAtras(3),
    horarios: { retorno_almoco: '14:00', saida: '17:10' },
    justificativa: 'Esqueceu as duas; confirmado com ele',
  });

  expect(res).toEqual({ sucesso: true, lancadas: 2 });
  expect(servicoPonto.obterPontosIncompletos(diasAtras(10), diasAtras(1))).toHaveLength(0);
});

test('completar o dia confere a ordem com as batidas que já existem', async () => {
  equipe = [GESTOR, DO_TURNO_A];
  colaboradorLogado = GESTOR;
  baterParcial(DO_TURNO_A, diasAtras(3), { entrada: '07:30', saida_almoco: '12:30' });

  // Retorno antes da saída para o almoço: o dia ficaria negativo
  const res = await servicoPonto.completarDia({
    colaboradorId: DO_TURNO_A.id,
    data: diasAtras(3),
    horarios: { retorno_almoco: '12:00', saida: '17:10' },
    justificativa: 'Teste',
  });

  expect(res.sucesso).toBe(false);
  expect(res.erro).toContain('Retorno do almoço (12:00) tem de vir depois de saída para almoço (12:30)');
  expect(res.lancadas).toBe(0);
});

test('sem justificativa, nada é lançado', async () => {
  equipe = [GESTOR, DO_TURNO_A];
  colaboradorLogado = GESTOR;
  baterParcial(DO_TURNO_A, diasAtras(3), { entrada: '07:30' });
  const res = await servicoPonto.completarDia({
    colaboradorId: DO_TURNO_A.id, data: diasAtras(3), horarios: { saida: '17:10' }, justificativa: '  ',
  });
  expect(res.sucesso).toBe(false);
  expect(res.lancadas).toBe(0);
});

test('o horário do turno aparece como referência de cada batida', () => {
  equipe = [GESTOR, DO_TURNO_A];
  // 16/09/2026 é quarta: turno A, 07:30 às 17:10 com almoço 12:30–14:00
  expect(servicoPonto.horarioPrevistoDaBatida(DO_TURNO_A as any, '2026-09-16', 'saida')).toBe('17:10');
  expect(servicoPonto.horarioPrevistoDaBatida(DO_TURNO_A as any, '2026-09-16', 'retorno_almoco')).toBe('14:00');
});

test('os pontos incompletos vêm do BANCO, mesmo com o aparelho sem as batidas', async () => {
  /*
    01/10/2026: o espelho aberto em outubro deixava no aparelho só o dia 1º,
    e os dias de setembro sem fechar sumiam da lista. Perguntado ao banco,
    o cache não importa.
  */
  equipe = [GESTOR, DO_TURNO_A];
  colaboradorLogado = GESTOR;
  baterParcial(DO_TURNO_A, diasAtras(3), { entrada: '07:30', saida_almoco: '12:30' });
  armazenamento.setItem(CHAVE_REGISTROS, JSON.stringify([]));

  const pontos = await servicoPonto.buscarPontosIncompletos(diasAtras(10), diasAtras(1));
  expect(pontos).toHaveLength(1);
  expect(pontos[0].faltam).toEqual(['retorno_almoco', 'saida']);
  // Os horários feitos vêm junto: a tela não depende do cache
  expect(pontos[0].horas).toEqual({ entrada: '07:30', saida_almoco: '12:30' });
});

test('sem a função no banco, os pontos incompletos voltam ao aparelho', async () => {
  funcaoDosIncompletos = false;
  equipe = [GESTOR, DO_TURNO_A];
  colaboradorLogado = GESTOR;
  baterParcial(DO_TURNO_A, diasAtras(3), { entrada: '07:30' });
  const pontos = await servicoPonto.buscarPontosIncompletos(diasAtras(10), diasAtras(1));
  expect(pontos).toHaveLength(1);
});

/*
  O ESPELHO INCOMPLETO CONTA O DIA VAZIO (01/10/2026).
  O Elias viu "1 dia" para quem bateu uma vez em setembro: os dias de
  trabalho sem batida nenhuma não entravam. Semana de 13/09 (domingo) a
  18/09/2026 (sexta), turno A.
*/
const semanaDoEspelho = () => {
  // A semana inteira já passou (o relógio da suíte para em 16/09)
  emOutubro();
  baterParcial(DO_TURNO_A, '2026-09-15', { entrada: '07:30', saida_almoco: '12:30', retorno_almoco: '14:00', saida: '17:10' });
  baterParcial(DO_TURNO_A, '2026-09-16', { entrada: '07:30' });
  // O aparelho não tem nada: a conta tem de vir do banco
  armazenamento.setItem(CHAVE_REGISTROS, JSON.stringify([]));
};

test('o espelho incompleto soma os dias sem batida aos dias sem fechar', async () => {
  equipe = [GESTOR, DO_TURNO_A];
  colaboradorLogado = GESTOR;
  semanaDoEspelho();

  const lista = await servicoPonto.buscarEspelhosIncompletos('2026-09-13', '2026-09-18');
  const dele = lista.find((e) => e.colaborador.id === DO_TURNO_A.id)!;
  // Domingo não conta; o dia 15 fechou; o 16 começou e não fechou
  expect(dele.semBatida).toEqual(['2026-09-14', '2026-09-17', '2026-09-18']);
  expect(dele.semFechar.map((p) => p.data)).toEqual(['2026-09-16']);
  expect(dele.total).toBe(4);
  expect(dele.maisRecente).toBe('2026-09-18');
  // O banco foi perguntado numa linha por pessoa — não se baixou a rede
  expect(janelaPedida).toBeNull();
});

test('antes da admissão não há dia vazio', async () => {
  const ADMITIDO = { ...DO_TURNO_A, dataAdmissao: '2026-09-17' };
  equipe = [GESTOR, ADMITIDO];
  colaboradorLogado = GESTOR;
  semanaDoEspelho();

  const dele = (await servicoPonto.buscarEspelhosIncompletos('2026-09-13', '2026-09-18')).find(
    (e) => e.colaborador.id === ADMITIDO.id
  )!;
  expect(dele.semBatida).toEqual(['2026-09-17', '2026-09-18']);
});

test('sem a função dias_com_batida no banco, a conta alarga o cache e dá o mesmo', async () => {
  funcaoDosDiasComBatida = false;
  equipe = [GESTOR, DO_TURNO_A];
  colaboradorLogado = GESTOR;
  semanaDoEspelho();

  const dele = (await servicoPonto.buscarEspelhosIncompletos('2026-09-13', '2026-09-18')).find(
    (e) => e.colaborador.id === DO_TURNO_A.id
  )!;
  expect(dele.semBatida).toEqual(['2026-09-14', '2026-09-17', '2026-09-18']);
  expect(janelaPedida).not.toBeNull();
});

/*
  GERENTE NÃO BATE PONTO — e então não tem nada de ponto pessoal (Elias,
  01/10/2026). Só a aba sumia: o espelho, o espelho incompleto, a falta e
  o "sem bater hoje" continuavam cobrando dele. Gerenciar o ponto dos
  outros segue igual.
*/
const GERENTE_DA_LOJA = { ...GESTOR, id: 'ger', nome: 'Gerente da loja', login: 'ger', turno: 'A' };

test('quem não bate ponto não tem espelho, nem incompleto, nem no resumo', async () => {
  equipe = [ELIAS, GERENTE_DA_LOJA, DO_TURNO_A];
  colaboradorLogado = ELIAS;
  semanaDoEspelho();

  const incompletos = await servicoPonto.buscarEspelhosIncompletos('2026-09-13', '2026-09-18');
  expect(incompletos.map((e) => e.colaborador.id)).not.toContain(GERENTE_DA_LOJA.id);
  // O de quem bate continua lá: a regra não apagou todo mundo
  expect(incompletos.map((e) => e.colaborador.id)).toContain(DO_TURNO_A.id);

  const resumo = servicoPonto.obterResumoDoPeriodo('2026-09-13', '2026-09-18').map((r) => r.colaborador.id);
  expect(resumo).not.toContain(GERENTE_DA_LOJA.id);
  expect(resumo).toContain(DO_TURNO_A.id);
});

test('quem não bate ponto não falta nem fica "sem bater hoje"', () => {
  emOutubro();
  equipe = [ELIAS, GERENTE_DA_LOJA, DO_TURNO_A];
  // 06/10/2026, terça, já passou: dia útil sem batida
  expect(servicoPonto.obterJornadaDoDia(GERENTE_DA_LOJA.id, '2026-10-06').falta).toBe(false);
  expect(servicoPonto.obterJornadaDoDia(DO_TURNO_A.id, '2026-10-06').falta).toBe(true);

  const dezDaManha = new Date(2026, 9, 8, 10, 0, 0);
  expect(servicoPonto.estaSemBaterHoje(GERENTE_DA_LOJA as any, dezDaManha)).toBe(false);
  expect(servicoPonto.estaSemBaterHoje(DO_TURNO_A as any, dezDaManha)).toBe(true);
});

test('o levantamento não cria falta na fila para quem não bate ponto', async () => {
  emOutubro();
  equipe = [ELIAS, GERENTE_DA_LOJA, DO_TURNO_A];
  colaboradorLogado = ELIAS;
  await servicoPonto.levantarDiasIncompletos(5);
  const pedidos = servicoPonto.obterPendenciasParaDecidir().map((p) => p.colaborador.id);
  expect(pedidos).not.toContain(GERENTE_DA_LOJA.id);
  expect(pedidos).toContain(DO_TURNO_A.id);
});

test('o estágio de 2 batidas, com as 2 feitas, não está incompleto', async () => {
  const ESTAGIARIA = { ...DO_TURNO_A, id: 'est', login: 'est', setor: 'Estágio', cargo: 'Estagiária', turno: 'E3' };
  equipe = [GESTOR, ESTAGIARIA];
  colaboradorLogado = GESTOR;
  baterParcial(ESTAGIARIA, diasAtras(3), { entrada: '13:00', saida: '18:00' });
  expect(await servicoPonto.buscarPontosIncompletos(diasAtras(10), diasAtras(1))).toHaveLength(0);
});
