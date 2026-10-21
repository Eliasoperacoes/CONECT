/**
 * ESTAÇÃO DE COTAÇÃO: o laço do PC de compras, com banco e extensão falsos.
 * O que precisa ficar de pé: fora do PC de compras nada chama o banco; um
 * pedido por vez; extensão muda vira erro em vez de pedido esquecido; e o
 * pedido é pego NA HORA pelo aviso do banco, sem depender do relógio (que o
 * Chrome desacelera com a aba em segundo plano: 7 min de espera, 21/10/2026).
 */
import { test, expect, afterEach } from 'bun:test';
import { criarEstacao, NOME_DA_ESTACAO, type BancoDaEstacao, type Extensao, type PedidoDaFila, type Estacao } from './estacaoCotacao';

const COMPRAS = { setor: 'Compras', nivel: 1 };
const BALCAO = { setor: 'Balcão', nivel: 1 };
const SITES = { roles: 'ok', pellegrino: 'deslogado', dpk: 'ok' } as const;

let estacao: Estacao | null = null;
afterEach(() => estacao?.parar());

/** A fila começa como vier; os testes empurram pedidos nela depois de a estação ligar. */
const bancoFalso = (fila: PedidoDaFila[] = []) => {
  const chamadas: string[] = [];
  const gravados: { cotacao: string; resultados: unknown }[] = [];
  const aviso: { ouvinte: (() => void) | null; parou: boolean } = { ouvinte: null, parou: false };
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
    ouvirFila(aoMudar) {
      aviso.ouvinte = aoMudar;
      return () => {
        aviso.parou = true;
      };
    },
  };
  const pegas = () => chamadas.filter((c) => c.startsWith('pegar')).length;
  return { banco, chamadas, gravados, fila, aviso, pegas };
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
/** Deixa as promessas em andamento terminarem. */
const assentar = () => new Promise((r) => setTimeout(r, 10));

const pedido = (id: string, codigo = id.toUpperCase(), incluir_similares = false): PedidoDaFila => ({ id, codigo, incluir_similares });

test('fora do PC de compras (sem extensão): não liga e não chama o banco', async () => {
  const { banco, chamadas } = bancoFalso();
  const semExtensao: Extensao = { ola: () => new Promise(() => {}), cotar: async () => ({ resultados: [] }) };
  estacao = criarEstacao({ colaborador: COMPRAS, extensao: semExtensao, banco, temporizador: naHora });
  expect(await estacao.iniciar()).toBe(false);
  expect(await estacao.atenderFila()).toBe('vazia');
  expect(chamadas).toEqual([]);
});

test('quem não atende a fila (Balcão) não liga, mesmo com a extensão no navegador', async () => {
  const { banco, chamadas, aviso } = bancoFalso([pedido('p1', 'OC90')]);
  const extensao = extensaoFalsa();
  estacao = criarEstacao({ colaborador: BALCAO, extensao, banco, temporizador: nunca });
  expect(await estacao.iniciar()).toBe(false);
  await estacao.esvaziarFila();
  expect(chamadas).toEqual([]);
  expect(extensao.pedidos).toEqual([]);
  expect(aviso.ouvinte).toBeNull(); // nem ouve a fila
});

test('Compras com a extensão: liga, dá sinal com os sites e atende o pedido', async () => {
  const { banco, chamadas, gravados, fila } = bancoFalso();
  const extensao = extensaoFalsa();
  estacao = criarEstacao({ colaborador: COMPRAS, extensao, banco, temporizador: nunca });
  expect(await estacao.iniciar()).toBe(true);
  await assentar();
  expect(chamadas[0]).toBe(`sinal ${NOME_DA_ESTACAO} ${JSON.stringify(SITES)} 0.3.0`);
  expect(estacao.situacao()).toEqual({ ativa: true, sites: SITES, precisaRecarregar: false });

  fila.push(pedido('p1', 'OC90', true));
  expect(await estacao.atenderFila()).toBe('pronta');
  expect(extensao.pedidos).toEqual(['OC90 true']);
  expect(gravados).toEqual([{ cotacao: 'p1', resultados: [{ fornecedor: 'dpk', peca: null, ofertas: [], erro: null }] }]);
  // Fila vazia: só pergunta, não cota
  expect(await estacao.atenderFila()).toBe('vazia');
  expect(extensao.pedidos).toHaveLength(1);
});

test('ao ligar, atende o que já esperava na fila', async () => {
  const { banco, gravados } = bancoFalso([pedido('p1'), pedido('p2')]);
  estacao = criarEstacao({ colaborador: COMPRAS, extensao: extensaoFalsa(), banco, temporizador: nunca });
  await estacao.iniciar();
  await assentar();
  expect(gravados.map((g) => g.cotacao)).toEqual(['p1', 'p2']);
});

test('O AVISO DO BANCO pega o pedido na hora e esvazia a fila, sem esperar o relógio', async () => {
  const { banco, gravados, fila, aviso } = bancoFalso();
  estacao = criarEstacao({ colaborador: COMPRAS, extensao: extensaoFalsa(), banco, temporizador: nunca });
  await estacao.iniciar();
  await assentar();
  expect(aviso.ouvinte).not.toBeNull();

  fila.push(pedido('p1'), pedido('p2'), pedido('p3'));
  aviso.ouvinte!(); // um aviso só: os três saem, um atrás do outro
  await assentar();
  expect(gravados.map((g) => g.cotacao)).toEqual(['p1', 'p2', 'p3']);
});

test('aviso que chega no instante do "fila vazia" não se perde: dá mais uma volta', async () => {
  /*
    A corrida real: a estação pergunta a fila, o banco responde "vazia", e
    nesse meio-tempo a Bia pede — o aviso chega enquanto a volta ainda não
    terminou. Sem a volta extra, o pedido esperaria o relógio (que o Chrome
    desacelera em segundo plano).
  */
  const { banco, gravados, fila, aviso } = bancoFalso();
  const pegarDeVerdade = banco.pegar;
  let armado = false;
  banco.pegar = async (e) => {
    const p = await pegarDeVerdade(e);
    if (armado && !p) {
      armado = false;
      fila.push(pedido('p2')); // a Bia pediu agora…
      aviso.ouvinte!(); // …e o aviso chega antes de esta volta acabar
    }
    return p;
  };
  estacao = criarEstacao({ colaborador: COMPRAS, extensao: extensaoFalsa(), banco, temporizador: nunca });
  await estacao.iniciar();
  await assentar();

  fila.push(pedido('p1'));
  armado = true;
  aviso.ouvinte!();
  await assentar();
  expect(gravados.map((g) => g.cotacao)).toEqual(['p1', 'p2']);
});

test('um pedido por vez: enquanto cota, a volta seguinte não pega outro', async () => {
  const { banco, fila, pegas } = bancoFalso();
  let soltar!: () => void;
  const extensao = extensaoFalsa(() => new Promise((r) => (soltar = () => r({ resultados: [] }))));
  estacao = criarEstacao({ colaborador: COMPRAS, extensao, banco, temporizador: nunca });
  await estacao.iniciar();
  await assentar();
  const antes = pegas();

  fila.push(pedido('p1'), pedido('p2'));
  const primeira = estacao.atenderFila();
  await Promise.resolve();
  await Promise.resolve();
  expect(await estacao.atenderFila()).toBe('ocupada');
  expect(pegas() - antes).toBe(1);
  soltar();
  await primeira;
});

test('extensão muda por 90 s: grava erro em todos os fornecedores (o pedido não fica esquecido)', async () => {
  const { banco, gravados, fila } = bancoFalso();
  const extensao = extensaoFalsa(() => new Promise(() => {}));
  // O "ola" responde na hora; o prazo de cotar vence na hora
  let vezes = 0;
  const temporizador = () => (vezes++ === 0 ? nunca() : naHora());
  estacao = criarEstacao({ colaborador: COMPRAS, extensao, banco, temporizador });
  await estacao.iniciar();
  await assentar();
  fila.push(pedido('p1', 'OC90'));
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
  const { banco, gravados, fila, pegas, aviso } = bancoFalso();
  const extensao = extensaoFalsa(async () => {
    throw new Error('Extension context invalidated.');
  });
  estacao = criarEstacao({ colaborador: COMPRAS, extensao, banco, temporizador: nunca });
  await estacao.iniciar();
  await assentar();
  const antes = pegas();

  fila.push(pedido('p1', 'OC90', true), pedido('p2', 'HG5170'));
  expect(await estacao.atenderFila()).toBe('extensao-falhou');
  expect(gravados).toEqual([]); // p1 fica "cotando" e volta sozinho para a fila em 5 min
  expect(estacao.situacao()).toMatchObject({ ativa: false, precisaRecarregar: true });
  // Parada, não pega o próximo, nem pelo aviso do banco
  expect(aviso.parou).toBe(true);
  expect(await estacao.atenderFila()).toBe('vazia');
  expect(pegas() - antes).toBe(1);
});

test('enquanto é estação, segura a aba acordada; ao parar, solta e deixa de ouvir a fila', async () => {
  const { banco, aviso } = bancoFalso();
  const trava = { segurou: 0, soltou: 0 };
  estacao = criarEstacao({
    colaborador: COMPRAS,
    extensao: extensaoFalsa(),
    banco,
    temporizador: nunca,
    manterAcordado: () => (trava.segurou++, () => void trava.soltou++),
  });
  await estacao.iniciar();
  expect(trava).toEqual({ segurou: 1, soltou: 0 });
  estacao.parar();
  expect(trava).toEqual({ segurou: 1, soltou: 1 });
  expect(aviso.parou).toBe(true);
});
