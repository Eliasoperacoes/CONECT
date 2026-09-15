/**
 * Verificação do ponto ligado ao banco — CONECTA
 *
 * O que está sendo provado aqui é a afirmação do dono do sistema: o banco de
 * horas pertence à PESSOA, não ao aparelho. Celular e computador têm que
 * chegar no mesmo lugar.
 */
import { test, expect, mock, beforeEach } from 'bun:test';

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
  },
}));

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
  expect(r1.erro).toContain('Apenas RH');

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
  const res = await servicoPonto.regenerarCodigoDaLoja('Palmeiras');
  expect(res.sucesso).toBe(false);
  expect(res.erro).toContain('Apenas RH');
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

test('LÍDER DE COMPRAS: enxerga o setor nas cinco lojas, não só a dela', () => {
  comEquipeCompleta(MARIA_COMPRAS_MATRIZ);

  const nomes = servicoPonto.obterColaboradoresVisiveis().map((c) => c.nome).sort();

  // O João é de Compras em Porto Ferreira: limitar pela loja esconderia dele
  expect(nomes).toEqual(['João', 'Maria']);
  // E ninguém de outro setor entra
  expect(nomes).not.toContain('Pedro');
});

test('gerente enxerga a loja inteira, de todos os setores', () => {
  comEquipeCompleta(CARLA_GERENTE_FILIAL);

  const nomes = servicoPonto.obterColaboradoresVisiveis().map((c) => c.nome).sort();

  expect(nomes).toEqual(['Carla', 'João']);
  expect(nomes).not.toContain('Maria');
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

const PEDRO = {
  ...ANA, id: 'colab-pedro', nome: 'Pedro', login: 'pedro',
  nivel: 1, setor: 'Balcão', loja: 'Pirassununga', cargo: 'Balconista',
};
const LIDER_BALCAO = {
  ...ANA, id: 'colab-lider', nome: 'Sônia', login: 'sonia',
  nivel: 2, setor: 'Balcão', loja: 'Pirassununga', cargo: 'Líder de Balcão',
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

test('NINGUÉM APROVA A PRÓPRIA HORA', async () => {
  montarEquipe(LIDER_BALCAO);
  await fecharJornada(LIDER_BALCAO, '2026-09-16', '08:00', '18:00');
  const ajuste = servicoPonto.obterAjusteDoDia(LIDER_BALCAO.id, '2026-09-16')!;

  // A líder tentando decidir sobre si mesma
  const res = await servicoPonto.decidirAjuste(ajuste.id, true);
  expect(res.sucesso).toBe(false);
  expect(servicoPonto.obterSaldoAcumulado(LIDER_BALCAO.id)).toBe(0);

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

  // A líder vê o Pedro (setor dela), mas não a si mesma
  colaboradorLogado = LIDER_BALCAO;
  const filaDaLider = servicoPonto.obterPendenciasParaDecidir();
  expect(filaDaLider.map((p) => p.colaborador.nome)).toEqual(['Pedro']);

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
