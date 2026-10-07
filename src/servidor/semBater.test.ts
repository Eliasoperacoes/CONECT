/**
 * "VOCÊ AINDA NÃO BATEU O PONTO" — testado como o servidor roda: em UTC.
 *
 * 07/10/2026 é uma quarta. A Ana é do turno A: entrada 07:30, almoço
 * 12:30–14:00, saída 17:10. Com os 5 minutos da CLT, o alerta da entrada
 * sai na chamada entre 07:35 (exclusive) e 07:40 — e só nela.
 */
process.env.TZ = 'UTC';
import { test, expect } from 'bun:test';
import { planejarAlertasSemBater, DadosDoAlertaSemBater, JANELA_DO_ALERTA_MIN } from './semBater';

const pessoa = (id: string, extra: Record<string, unknown> = {}) =>
  ({
    id, nome: id, login: id, cargo: 'Balconista', setor: 'Balcão', loja: 'Pirassununga', nivel: 1,
    turno: 'A', ativo: true, foto: '', presenca: 'disponivel', vistoPorUltimo: '', criadoEm: '', ...extra,
  }) as any;

/** Uma batida como o banco devolve: horário em UTC (Brasília + 3h). */
const batida = (quem: string, data: string, tipo: string, hora: string) => {
  const [h, m] = hora.split(':').map(Number);
  const utc = new Date(`${data}T00:00:00.000Z`);
  utc.setUTCHours(h + 3, m);
  return { id: `${quem}-${data}-${tipo}`, colaboradorId: quem, data, tipo, horario: utc.toISOString(), horaFormatada: hora } as any;
};

/** "07:40 de 07/10" em Brasília, como o relógio do servidor (UTC) o vê. */
const as = (hora: string, data = '2026-10-07') => {
  const [h, m] = hora.split(':').map(Number);
  const utc = new Date(`${data}T00:00:00.000Z`);
  utc.setUTCHours(h + 3, m, 7);
  return utc;
};

const dados = (extra: Partial<DadosDoAlertaSemBater> = {}): DadosDoAlertaSemBater => ({
  colaboradores: [pessoa('ana')],
  batidas: [],
  ausencias: [],
  feriados: [],
  permissoes: null,
  ...extra,
});

const textos = (agora: Date, d = dados()) => planejarAlertasSemBater(d, agora).map((a) => `${a.colaboradorId}: ${a.dados.texto}`);

test('a ENTRADA esquecida avisa uma vez, passados os 5 minutos da CLT', () => {
  expect(JANELA_DO_ALERTA_MIN).toBe(5);
  // Ainda dentro da tolerância: nada
  expect(textos(as('07:35'))).toEqual([]);
  // A chamada seguinte avisa, com o horário previsto
  const [alerta] = planejarAlertasSemBater(dados(), as('07:40'));
  expect(alerta.colaboradorId).toBe('ana');
  expect(alerta.dados).toMatchObject({ tipo: 'secao', conversaId: 'meu_ponto', mensagemId: 'sem-bater-ana' });
  expect(alerta.dados.texto).toBe('Entrada · horário previsto 07:30. Toque para bater o ponto.');
  // E não repete na chamada depois
  expect(textos(as('07:45'))).toEqual([]);
  // Quem bateu não é avisado
  expect(textos(as('07:40'), dados({ batidas: [batida('ana', '2026-10-07', 'entrada', '07:38')] }))).toEqual([]);
});

test('as QUATRO marcações: almoço, volta e saída também avisam', () => {
  const entrou = [batida('ana', '2026-10-07', 'entrada', '07:29')];
  expect(textos(as('12:40'), dados({ batidas: entrou }))).toEqual([
    'ana: Saída para almoço · horário previsto 12:30. Toque para bater o ponto.',
  ]);

  const almocou = [...entrou, batida('ana', '2026-10-07', 'saida_almoco', '12:30')];
  expect(textos(as('14:10'), dados({ batidas: almocou }))).toEqual([
    'ana: Retorno do almoço · horário previsto 14:00. Toque para bater o ponto.',
  ]);

  const voltou = [...almocou, batida('ana', '2026-10-07', 'retorno_almoco', '14:00')];
  expect(textos(as('17:20'), dados({ batidas: voltou }))).toEqual([
    'ana: Saída · horário previsto 17:10. Toque para bater o ponto.',
  ]);

  // Dia fechado: nada mais a avisar
  const fechou = [...voltou, batida('ana', '2026-10-07', 'saida', '17:11')];
  expect(textos(as('17:20'), dados({ batidas: fechou }))).toEqual([]);
});

test('a VOLTA DO ALMOÇO conta da saída de verdade: o intervalo é direito, não atraso', () => {
  // Saiu às 12:45: o 1h30 dela vai até 14:15, e o alerta só depois de 14:20
  const batidas = [batida('ana', '2026-10-07', 'entrada', '07:30'), batida('ana', '2026-10-07', 'saida_almoco', '12:45')];
  expect(textos(as('14:10'), dados({ batidas }))).toEqual([]);
  expect(textos(as('14:25'), dados({ batidas }))).toEqual([
    'ana: Retorno do almoço · horário previsto 14:15. Toque para bater o ponto.',
  ]);
});

test('SÓ A PRÓXIMA: quem não veio recebe o da entrada, e não mais três ao longo do dia', () => {
  expect(textos(as('12:40'))).toEqual([]);
  expect(textos(as('17:20'))).toEqual([]);
});

test('folga, atestado, domingo, quem saiu da empresa e quem não bate ponto: nada', () => {
  const atestado = {
    id: 'j1', colaboradorId: 'ana', tipo: 'atestado_medico', dataInicio: '2026-10-07', dataFim: '2026-10-07',
    estado: 'aprovada', criadoEm: '2026-10-06T10:00:00Z',
  } as any;
  expect(textos(as('07:40'), dados({ ausencias: [atestado] }))).toEqual([]);
  // 11/10/2026 é domingo
  expect(textos(as('07:40', '2026-10-11'))).toEqual([]);
  expect(textos(as('07:40'), dados({ colaboradores: [pessoa('ana', { ativo: false })] }))).toEqual([]);
  expect(
    textos(as('07:40'), dados({ permissoes: { ponto: [2, 3] } as any }))
  ).toEqual([]);
});

test('SÁBADO: a entrada da escala (08:00), para quem trabalha no sábado', () => {
  // 10/10/2026 é sábado
  expect(textos(as('08:10', '2026-10-10'))).toEqual(['ana: Entrada · horário previsto 08:00. Toque para bater o ponto.']);
});
