/**
 * MEU RH — o que a aba Eu mostra de cada pessoa, e quando.
 *
 * Pedido do Elias: documentos, folga, férias, holerite, advertência e o
 * espelho do ponto "disponível no fechamento do mês".
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
(globalThis as any).window = globalThis;

let modoNuvem = false;
mock.module('./supabase', () => ({
  usandoNuvem: () => modoNuvem,
  temSessaoViva: () => true,
  supabase: null,
  loginParaEmailInterno: (l: string) => `${l}@interno`,
  normalizarLogin: (l: string) => l,
}));

/** O que o banco responde ao pedido das batidas do mês. */
let bancoTrouxe = true;
const pedidosDoMes: Array<{ id: string; inicio: string; fim: string }> = [];
mock.module('./nuvem', () => ({
  nuvem: {
    trazerMarcacoesDe: async (id: string, p: { inicio: string; fim: string }) => {
      pedidosDoMes.push({ id, ...p });
      return bancoTrouxe;
    },
    assinarAtualizacoes: () => () => {},
    obterJanelaDoPonto: () => ({ inicio: '2026-08-01', fim: '2026-09-30' }),
  },
}));

const {
  mesesFechados,
  periodoDoMes,
  rotuloDoMes,
  liberacaoDoMesAtual,
  separarMinhasAusencias,
  situacaoDasFerias,
  prepararMeuEspelho,
} = await import('./meuRH');

const MARIA = {
  id: 'maria', nome: 'Maria Clara', login: 'maria', cargo: 'Auxiliar de Estoque',
  setor: 'Estoque', loja: 'Pirassununga', nivel: 1, foto: '', presenca: 'disponivel',
  vistoPorUltimo: 'Agora', ativo: true, criadoEm: '2026-01-01T00:00:00.000Z', turno: 'B',
};

beforeEach(() => {
  armazenamento.clear();
  armazenamento.setItem('conecta_v4_colaboradores', JSON.stringify([MARIA]));
  armazenamento.setItem('conecta_v4_colaborador_atual', 'maria');
  modoNuvem = false;
  bancoTrouxe = true;
  pedidosDoMes.length = 0;
});

const ausencia = (id: string, tipo: string, inicio: string, fim = inicio, extra: any = {}) => ({
  id, colaboradorId: 'maria', dataInicio: inicio, dataFim: fim, tipo,
  estado: 'aprovada', criadoEm: `${inicio}T12:00:00Z`, ...extra,
});

// ------------------------------------------------------------------
// O espelho sai no fechamento do mês
// ------------------------------------------------------------------

test('o mês corrente não entra: o espelho dele ainda muda a cada batida', () => {
  const meses = mesesFechados('2026-09-30');
  expect(meses[0]).toBe('2026-08');
  expect(meses).not.toContain('2026-09');
  expect(meses).toHaveLength(12);
  // Doze para trás, atravessando a virada do ano
  expect(meses[11]).toBe('2025-09');
});

test('não volta para antes da admissão', () => {
  expect(mesesFechados('2026-09-30', '2026-06-15')).toEqual(['2026-08', '2026-07', '2026-06']);
  // Admitida no mês corrente: ainda não há espelho fechado
  expect(mesesFechados('2026-09-30', '2026-09-01')).toEqual([]);
});

test('janeiro fecha dezembro do ano anterior', () => {
  expect(mesesFechados('2027-01-05', undefined, 2)).toEqual(['2026-12', '2026-11']);
  expect(liberacaoDoMesAtual('2026-12-10')).toBe('2027-01-01');
  expect(liberacaoDoMesAtual('2026-09-30')).toBe('2026-10-01');
});

test('o período vai do dia 1 ao último dia de verdade', () => {
  expect(periodoDoMes('2026-09')).toEqual({ inicio: '2026-09-01', fim: '2026-09-30' });
  expect(periodoDoMes('2026-02')).toEqual({ inicio: '2026-02-01', fim: '2026-02-28' });
  expect(periodoDoMes('2028-02').fim).toBe('2028-02-29');
  expect(rotuloDoMes('2026-08')).toBe('Agosto de 2026');
});

test('mês aberto não gera espelho, nem pergunta ao banco', async () => {
  modoNuvem = true;
  const res = await prepararMeuEspelho('maria', '2026-09', '2026-09-30');
  expect(res.html).toBeUndefined();
  expect(res.erro).toContain('ainda não fechou');
  expect(pedidosDoMes).toHaveLength(0);
});

test('mês fechado: busca as batidas daquele mês e monta o espelho da pessoa', async () => {
  modoNuvem = true;
  const res = await prepararMeuEspelho('maria', '2026-08', '2026-09-30');

  expect(pedidosDoMes).toEqual([{ id: 'maria', inicio: '2026-08-01', fim: '2026-08-31' }]);
  expect(res.erro).toBeUndefined();
  expect(res.html).toContain('Maria Clara');
});

test('o banco não trouxe as batidas: o espelho NÃO abre vazio', async () => {
  // Espelho vazio se lê como "não bateu ponto" — pior que não abrir
  modoNuvem = true;
  bancoTrouxe = false;
  const res = await prepararMeuEspelho('maria', '2026-08', '2026-09-30');
  expect(res.html).toBeUndefined();
  expect(res.erro).toContain('Não foi possível buscar');
});

// ------------------------------------------------------------------
// Documentos, folgas e férias: a mesma lista, separada como se procura
// ------------------------------------------------------------------

test('cada ausência vai para a sua gaveta, e só as da pessoa', () => {
  const todas = [
    ausencia('a1', 'atestado', '2026-09-10'),
    ausencia('a2', 'comparecimento', '2026-09-20'),
    ausencia('f1', 'folga_sabado', '2026-09-19'),
    ausencia('v1', 'ferias', '2026-12-01', '2026-12-20'),
    { ...ausencia('x1', 'atestado', '2026-09-11'), colaboradorId: 'outra' },
  ] as any;

  const minhas = separarMinhasAusencias(todas, 'maria');

  expect(minhas.documentos.map((j) => j.id)).toEqual(['a2', 'a1']);
  expect(minhas.folgas.map((j) => j.id)).toEqual(['f1']);
  expect(minhas.ferias.map((j) => j.id)).toEqual(['v1']);
});

test('férias: a próxima, a em curso e os dias lançados no ano', () => {
  const ferias = [
    ausencia('passada', 'ferias', '2026-01-05', '2026-01-19'),
    ausencia('proxima', 'ferias', '2026-12-01', '2026-12-10', { estado: 'pendente' }),
    ausencia('recusada', 'ferias', '2026-10-01', '2026-10-30', { estado: 'recusada' }),
  ] as any;

  const s = situacaoDasFerias(ferias, '2026-09-30');
  expect(s.emCurso).toBeUndefined();
  // A recusada não vai acontecer: não é a "próxima", nem conta dias
  expect(s.proxima?.id).toBe('proxima');
  expect(s.diasNoAno).toBe(15 + 10);

  const emCurso = situacaoDasFerias(ferias, '2026-12-05');
  expect(emCurso.emCurso?.id).toBe('proxima');
});

test('o selo da aba Eu e o cartao contam a mesma coisa: holerite sem assinar e advertencia sem ciencia', async () => {
  // O "1 para assinar" do Fabio só aparecia para quem já estava na aba (S10, 02/10/2026)
  const { pendenciasDoMeuRH } = await import('./meuRH');
  const recebidos = new Set(['h-ago']);
  const r = pendenciasDoMeuRH(
    [{ id: 'h-set' }, { id: 'h-ago' }],
    recebidos,
    [{ cienciaEm: null }, { cienciaEm: '2026-09-01T10:00:00Z' }]
  );
  expect(r.holeritesParaAssinar.map((h) => h.id)).toEqual(['h-set']);
  expect(r.semCiencia.length).toBe(1);
  expect(r.total).toBe(2);

  const app = await Bun.file(new URL('../App.tsx', import.meta.url)).text();
  expect(app).toContain('setPendenciasDoMeuRHAgora(pendenciasDoMeuRH(h, r, a, espelhos).total)');
  expect(app).toContain('espelhosParaAssinar(colaboradorAtual, batePonto(colaboradorAtual), dataDeHoje(), assinados)');
  expect(app).toMatch(/alvo: 'eu',\s*contador: pendenciasDoMeuRHAgora,/);
  const tela = await Bun.file(new URL('../componentes/MeuRH.tsx', import.meta.url)).text();
  expect(tela).toMatch(/pendenciasDoMeuRH\(\s*holerites,\s*recebimentos,\s*advertencias,\s*espelhosParaAssinar\(eu, batePonto\(eu\), hoje, espelhosAssinados\)/);
});

test('ESPELHO PARA ASSINAR: mês fechado desde setembro/2026, não assinado, de quem bate ponto', async () => {
  const { espelhosParaAssinar, pendenciasDoMeuRH, ESPELHO_ASSINADO_DESDE } = await import('./meuRH');
  expect(ESPELHO_ASSINADO_DESDE).toBe('2026-09');
  const hoje = '2026-12-10';

  // Setembro, outubro e novembro fecharam; dezembro está aberto; agosto é de antes da cobrança
  expect(espelhosParaAssinar({}, true, hoje, new Set())).toEqual(['2026-11', '2026-10', '2026-09']);
  // O assinado sai da lista
  expect(espelhosParaAssinar({}, true, hoje, new Set(['2026-10']))).toEqual(['2026-11', '2026-09']);
  // Admitido em outubro: setembro não é dele
  expect(espelhosParaAssinar({ dataAdmissao: '2026-10-15' }, true, hoje, new Set())).toEqual(['2026-11', '2026-10']);
  // Quem não bate ponto não tem espelho
  expect(espelhosParaAssinar({}, false, hoje, new Set())).toEqual([]);

  // E conta no selo, junto com holerite e advertência
  const r = pendenciasDoMeuRH([], new Set(), [], ['2026-11', '2026-10']);
  expect(r.total).toBe(2);
  expect(r.espelhosParaAssinar).toEqual(['2026-11', '2026-10']);
});

test('A PRÓXIMA AUSÊNCIA: folga ou férias, a mais próxima de hoje em diante, sem as recusadas', async () => {
  const { proximaAusenciaDe } = await import('./meuRH');
  const j = (id: string, tipo: string, inicio: string, fim: string, estado = 'aprovada', colaboradorId = 'ana') =>
    ({ id, tipo, dataInicio: inicio, dataFim: fim, estado, colaboradorId }) as any;
  const lista = [
    j('passada', 'folga_sabado', '2026-09-26', '2026-09-26'),
    j('recusada', 'folga_sabado', '2026-10-10', '2026-10-10', 'recusada'),
    j('ferias', 'ferias', '2026-12-01', '2026-12-20'),
    j('folga', 'folga_sabado', '2026-10-31', '2026-10-31', 'pendente'),
    j('atestado', 'atestado', '2026-10-07', '2026-10-07'),
    j('de-outra', 'folga_sabado', '2026-10-10', '2026-10-10', 'aprovada', 'bia'),
  ];
  expect(proximaAusenciaDe(lista, 'ana', '2026-10-05')?.id).toBe('folga');
  // Férias em curso contam: a pessoa está nelas
  expect(proximaAusenciaDe(lista, 'ana', '2026-12-10')?.id).toBe('ferias');
  expect(proximaAusenciaDe(lista, 'ana', '2027-01-01')).toBeNull();
});
