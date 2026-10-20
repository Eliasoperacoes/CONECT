/**
 * ESTAÇÃO DE COTAÇÃO: o laço do PC de compras, com banco e extensão falsos.
 * O que precisa ficar de pé: fora do PC de compras nada chama o banco; um
 * pedido por vez; extensão muda vira erro em vez de pedido esquecido.
 */
import { test, expect, afterEach } from 'bun:test';
import { criarEstacao, NOME_DA_ESTACAO, type BancoDaEstacao, type Extensao, type PedidoDaFila, type Estacao } from './estacaoCotacao';

const COMPRAS = { setor: 'Compras', nivel: 1 };
const BALCAO = { setor: 'Balcão', nivel: 1 };
const SITES = { roles: 'ok', pellegrino: 'deslogado', dpk: 'ok' } as const;

let estacao: Estacao | null = null;
afterEach(() => estacao?.parar());

const bancoFalso = (fila: PedidoDaFila[] = []) => {
  const chamadas: string[] = [];
  const gravados: { cotacao: string; resultados: unknown }[] = [];
  const banco: BancoDaEstacao = {
    async sinal(e, sites, versao) {
      chamadas.push(`sinal ${e} ${JSON.stringify(sites)} ${versao}`);
    },
    async pegar(e) {
      chamadas.push(`pegar ${e}`);
      return fila.shift() ?? null;
    },
    async gravar(cotacao, resultados) {
      chamadas.push(`gravar ${cotacao}`);
      gravados.push({ cotacao, resultados });
      return 'pronta';
    },
  };
  return { banco, chamadas, gravados };
};

const extensaoFalsa = (cotar?: Extensao['cotar']): Extensao & { pedidos: string[] } => {
  const pedidos: string[] = [];
  return {
    pedidos,
    ola: async () => ({ versao: '0.3.0', sites: { ...SITES } }),
    cotar:
      cotar ??
      (async (codigo, similares) => {
        pedidos.push(`${codigo} ${similares}`);
        return { resultados: [{ fornecedor: 'dpk', peca: null, ofertas: [], erro: null }] };
      }),
  };
};

/** Prazo que nunca vence (o normal) ou que vence na hora (extensão muda). */
const nunca = () => new Promise<void>(() => {});
const naHora = () => Promise.resolve();

test('fora do PC de compras (sem extensão): não liga e não chama o banco', async () => {
  const { banco, chamadas } = bancoFalso();
  const semExtensao: Extensao = { ola: () => new Promise(() => {}), cotar: async () => ({ resultados: [] }) };
  estacao = criarEstacao({ colaborador: COMPRAS, extensao: semExtensao, banco, temporizador: naHora });
  expect(await estacao.iniciar()).toBe(false);
  expect(await estacao.atenderFila()).toBe('vazia');
  expect(chamadas).toEqual([]);
});

test('quem não atende a fila (Balcão) não liga, mesmo com a extensão no navegador', async () => {
  const { banco, chamadas } = bancoFalso([{ id: 'p1', codigo: 'OC90', incluir_similares: false }]);
  const extensao = extensaoFalsa();
  estacao = criarEstacao({ colaborador: BALCAO, extensao, banco, temporizador: nunca });
  expect(await estacao.iniciar()).toBe(false);
  await estacao.atenderFila();
  expect(chamadas).toEqual([]);
  expect(extensao.pedidos).toEqual([]);
});

test('Compras com a extensão: liga, dá sinal com os sites e atende o pedido', async () => {
  const { banco, chamadas, gravados } = bancoFalso([{ id: 'p1', codigo: 'OC90', incluir_similares: true }]);
  const extensao = extensaoFalsa();
  estacao = criarEstacao({ colaborador: COMPRAS, extensao, banco, temporizador: nunca });
  expect(await estacao.iniciar()).toBe(true);
  expect(chamadas[0]).toBe(`sinal ${NOME_DA_ESTACAO} ${JSON.stringify(SITES)} 0.3.0`);
  expect(estacao.situacao()).toEqual({ ativa: true, sites: SITES, precisaRecarregar: false });

  expect(await estacao.atenderFila()).toBe('pronta');
  expect(extensao.pedidos).toEqual(['OC90 true']);
  expect(gravados).toEqual([{ cotacao: 'p1', resultados: [{ fornecedor: 'dpk', peca: null, ofertas: [], erro: null }] }]);
  // Fila vazia: só pergunta, não cota
  expect(await estacao.atenderFila()).toBe('vazia');
  expect(extensao.pedidos).toHaveLength(1);
});

test('um pedido por vez: enquanto cota, a volta seguinte não pega outro', async () => {
  const { banco, chamadas } = bancoFalso([
    { id: 'p1', codigo: 'A1', incluir_similares: false },
    { id: 'p2', codigo: 'B2', incluir_similares: false },
  ]);
  let soltar!: () => void;
  const extensao = extensaoFalsa(
    () => new Promise((r) => (soltar = () => r({ resultados: [] })))
  );
  estacao = criarEstacao({ colaborador: COMPRAS, extensao, banco, temporizador: nunca });
  await estacao.iniciar();
  const primeira = estacao.atenderFila();
  await Promise.resolve();
  await Promise.resolve();
  expect(await estacao.atenderFila()).toBe('ocupada');
  soltar();
  await primeira;
  expect(chamadas.filter((c) => c.startsWith('pegar'))).toHaveLength(1);
});

test('extensão muda por 90 s: grava erro em todos os fornecedores (o pedido não fica esquecido)', async () => {
  const { banco, gravados } = bancoFalso([{ id: 'p1', codigo: 'OC90', incluir_similares: false }]);
  const extensao = extensaoFalsa(() => new Promise(() => {}));
  // O "ola" responde na hora; o prazo de cotar vence na hora
  let vezes = 0;
  const temporizador = () => (vezes++ === 0 ? nunca() : naHora());
  estacao = criarEstacao({ colaborador: COMPRAS, extensao, banco, temporizador });
  await estacao.iniciar();
  await estacao.atenderFila();
  expect(gravados).toEqual([
    {
      cotacao: 'p1',
      resultados: ['roles', 'pellegrino', 'dpk'].map((fornecedor) => ({
        fornecedor, peca: null, ofertas: [], erro: 'a extensão não respondeu em 90 s',
      })),
    },
  ]);
});

test('extensão recarregada: a estação para e pede F5, sem gastar o pedido como erro (20/10)', async () => {
  const { banco, chamadas, gravados } = bancoFalso([
    { id: 'p1', codigo: 'OC90', incluir_similares: true },
    { id: 'p2', codigo: 'HG5170', incluir_similares: false },
  ]);
  const extensao = extensaoFalsa(async () => {
    throw new Error('Extension context invalidated.');
  });
  estacao = criarEstacao({ colaborador: COMPRAS, extensao, banco, temporizador: nunca });
  await estacao.iniciar();

  expect(await estacao.atenderFila()).toBe('extensao-falhou');
  expect(gravados).toEqual([]); // p1 fica "cotando" e volta sozinho para a fila em 5 min
  expect(estacao.situacao()).toMatchObject({ ativa: false, precisaRecarregar: true });
  // Parada, não pega o próximo
  expect(await estacao.atenderFila()).toBe('vazia');
  expect(chamadas.filter((c) => c.startsWith('pegar'))).toHaveLength(1);
});
