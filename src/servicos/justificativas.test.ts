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
const ANA = { ...CHEFE, id: 'ana', nome: 'Ana', login: 'ana', nivel: 1, setor: 'Balcão' };
const OUTRO = {
  ...CHEFE, id: 'outro', nome: 'Outro', login: 'outro', loja: 'Descalvado',
};

let logado: any = ANA;
let equipe: any[] = [CHEFE, ANA, OUTRO];

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
} = await import('./justificativas');

beforeEach(() => {
  armazenamento.clear();
  logado = ANA;
  equipe = [CHEFE, ANA, OUTRO];
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
// A ALÇADA É A MESMA DA HORA EXTRA
// ============================================================

test('a fila é de quem responde pela pessoa, e só dele', async () => {
  await pedirAtestado();

  logado = CHEFE;
  expect(pendenciasParaDecidir()).toHaveLength(1);

  // Gerente de outra loja não decide sobre quem não é dele
  logado = OUTRO;
  expect(pendenciasParaDecidir()).toHaveLength(0);
});

test('NINGUÉM APROVA A PRÓPRIA AUSÊNCIA', async () => {
  // Nem o gerente, nem quem está no topo. A trava vem de podeDecidirSobre,
  // a mesma da hora extra — não há uma segunda regra aqui.
  logado = CHEFE;
  await solicitarAusencia({
    dataInicio: '2026-09-16',
    dataFim: '2026-09-16',
    tipo: 'comparecimento',
  });

  expect(pendenciasParaDecidir()).toHaveLength(0);

  const minha = minhasJustificativas()[0];
  const res = await decidirAusencia(minha.id, true);
  expect(res.sucesso).toBe(false);
  expect(situacaoDoDia(CHEFE.id, '2026-09-16')).toBe('normal');
});

test('recusar EXIGE motivo', async () => {
  await pedirAtestado();
  logado = CHEFE;
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
  logado = CHEFE;
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
  logado = CHEFE;
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
  logado = CHEFE;
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
  logado = CHEFE;
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
  await decidirAusencia(
    pendenciasParaDecidir()[0].justificativa.id,
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
  expect(pendenciasParaDecidir()).toHaveLength(1);
  await decidirAusencia(pendenciasParaDecidir()[0].justificativa.id, true);

  expect(situacaoDoDia(ANA.id, '2026-09-19')).toBe('folga');
});

test('NINGUÉM APROVA A PRÓPRIA FOLGA', async () => {
  logado = CHEFE;
  await pedirFolga('2026-09-19');

  expect(pendenciasParaDecidir()).toHaveLength(0);
  const minha = minhasJustificativas()[0];
  expect((await decidirAusencia(minha.id, true)).sucesso).toBe(false);
});
