/**
 * O AEJ (arquivoEletronicoDeJornada.ts), conferido contra o leiaute do
 * gov.br (versão "002"): a ordem dos registros, cada campo, o par de
 * entrada/saída, a fonte da marcação (O / I / D) e as quatro escolhas do
 * Elias para o registro 07 (DSR, falta do espelho, banco só aprovado,
 * sábado compensado fora).
 */
import { test, expect } from 'bun:test';
import { montarAej, textoDoAej, dataHoraDoAej, type EntradaDoAej, type VinculoDoAej } from './arquivoEletronicoDeJornada';
import { vinculosDoAej } from './arquivosFiscais';
import type { AjusteJornada, Colaborador, RegistroPonto, TipoMarcacao } from '../tipos';

const pessoa = (id: string, nome: string, extra: Partial<Colaborador> = {}): Colaborador =>
  ({ id, nome, turno: 'A', setor: 'Balcão', cargo: 'Vendedor', loja: 'Pirassununga', cnpj: '05.041.606/0001-99', ativo: true, ...extra }) as Colaborador;

/** Uma batida no relógio de Brasília (-03:00). */
const batida = (id: string, data: string, tipo: TipoMarcacao, hora: string, extra: Partial<RegistroPonto> = {}): RegistroPonto =>
  ({ id, colaboradorId: 'ana', data, tipo, horario: new Date(`${data}T${hora}:00-03:00`).toISOString(), horaFormatada: hora, metodo: 'qrcode', loja: 'Pirassununga', criadoEm: '', ...extra }) as RegistroPonto;

const QUATRO: TipoMarcacao[] = ['entrada', 'saida_almoco', 'retorno_almoco', 'saida'];

const base = (vinculos: VinculoDoAej[]): EntradaDoAej => ({
  cnpj: '05041606000199',
  razaoSocial: 'MALACHIAS AUTO PECAS LTDA',
  inicio: '2026-10-03',
  fim: '2026-10-06',
  geradoEm: '2026-10-07T13:44:20.000Z',
  inpi: '',
  programa: { nome: 'CONECTA', versao: '1.0' },
  desenvolvedor: { tipo: '2', documento: '12345678909', nome: 'Dev Teste', email: 'dev@teste.com' },
  vinculos,
});

/*
  A Ana, turno A, de sábado 03/10 a terça 06/10:
   · sábado: entrada e saída (2 batidas, par 1);
   · domingo: descanso;
   · segunda: 4 batidas, a saída corrigida pelo RH (a original 17:42 vira D);
   · terça: falta.
  E uma original fora da jornada no domingo, esperando o RH; e o banco:
  uma hora extra aprovada, um débito aprovado e uma pendente.
*/
const ana: VinculoDoAej = {
  colaborador: pessoa('ana', 'Ana Conceição', { dataAdmissao: '2026-01-01' }),
  cpf: '12345678909',
  dias: [
    { data: '2026-10-03', sequencia: ['entrada', 'saida'], marcacoes: [batida('s1', '2026-10-03', 'entrada', '08:01', { nsr: 1 }), batida('s2', '2026-10-03', 'saida', '12:00', { nsr: 2 })], falta: false },
    { data: '2026-10-04', sequencia: [], marcacoes: [], falta: false },
    {
      data: '2026-10-05',
      sequencia: QUATRO,
      marcacoes: [
        batida('m1', '2026-10-05', 'entrada', '07:30', { nsr: 4 }),
        batida('m2', '2026-10-05', 'saida_almoco', '12:30', { nsr: 5 }),
        batida('m3', '2026-10-05', 'retorno_almoco', '14:00', { nsr: 6 }),
        batida('m4', '2026-10-05', 'saida', '17:10', { nsr: 7, metodo: 'ajuste_rh', justificativa: 'Esqueceu | de bater\nna hora' }),
      ],
      falta: false,
    },
    { data: '2026-10-06', sequencia: QUATRO, marcacoes: [], falta: true },
  ],
  originais: [
    // A original é a do REP (08:02:10); a batida do cache diz 08:01. Vale a do REP, que é a do AFD
    { nsr: 1, registradoEm: '2026-10-03T11:02:10.000Z', data: '2026-10-03', registroId: 's1', tipoPedido: 'entrada', foraDaJornada: null },
    { nsr: 2, registradoEm: '2026-10-03T15:00:05.000Z', data: '2026-10-03', registroId: 's2', tipoPedido: 'saida', foraDaJornada: null },
    { nsr: 3, registradoEm: '2026-10-04T13:00:00.000Z', data: '2026-10-04', registroId: null, tipoPedido: null, foraDaJornada: 'domingo' },
    { nsr: 4, registradoEm: '2026-10-05T10:30:00.000Z', data: '2026-10-05', registroId: 'm1', tipoPedido: 'entrada', foraDaJornada: null },
    { nsr: 5, registradoEm: '2026-10-05T15:30:00.000Z', data: '2026-10-05', registroId: 'm2', tipoPedido: 'saida_almoco', foraDaJornada: null },
    { nsr: 6, registradoEm: '2026-10-05T17:00:00.000Z', data: '2026-10-05', registroId: 'm3', tipoPedido: 'retorno_almoco', foraDaJornada: null },
    { nsr: 7, registradoEm: '2026-10-05T20:42:00.000Z', data: '2026-10-05', registroId: 'm4', tipoPedido: 'saida', foraDaJornada: null },
  ],
  ajustes: [
    { id: 'a1', colaboradorId: 'ana', data: '2026-10-05', tipo: 'hora_extra', minutos: 30, estado: 'aprovado' } as AjusteJornada,
    { id: 'a2', colaboradorId: 'ana', data: '2026-10-03', tipo: 'debito', minutos: 15, estado: 'aprovado' } as AjusteJornada,
    { id: 'a3', colaboradorId: 'ana', data: '2026-10-06', tipo: 'debito', minutos: 480, estado: 'pendente' } as AjusteJornada,
    { id: 'a4', colaboradorId: 'ana', data: '2026-09-30', tipo: 'hora_extra', minutos: 60, estado: 'aprovado' } as AjusteJornada,
  ],
};

const linhas = montarAej(base([ana]));
const doTipo = (t: string) => linhas.filter((l) => l.startsWith(`${t}|`));

test('a ORDEM: 01, 02, 03, 04, 05, 07, 08, 99 e a assinatura; sem linha em branco', () => {
  const tipos = linhas.map((l) => (l.startsWith('ASSINATURA') ? 'A' : l.slice(0, 2)));
  const ordem = ['01', '02', '03', '04', '05', '07', '08', '99', 'A'];
  expect([...new Set(tipos)]).toEqual(ordem);
  expect(tipos).toEqual([...tipos].sort((a, b) => ordem.indexOf(a) - ordem.indexOf(b)));
  expect(linhas.every((l) => l.length > 0)).toBe(true);
  expect(linhas[linhas.length - 1]).toBe('ASSINATURA_DIGITAL_EM_ARQUIVO_P7S'.padEnd(100, ' '));
});

test('o CABEÇALHO, o REP e o PTRP campo a campo', () => {
  expect(linhas[0]).toBe('01|1|05041606000199|||MALACHIAS AUTO PECAS LTDA|2026-10-03|2026-10-06|2026-10-07T10:44:00-0300|002');
  // Sem INPI ainda, o número do REP-P fica vazio
  expect(linhas[1]).toBe('02|1|3|');
  expect(montarAej({ ...base([ana]), inpi: '512022123456' })[1]).toBe('02|1|3|00000512022123456');
  expect(doTipo('08')).toEqual(['08|CONECTA|1.0|2|12345678909|Dev Teste|dev@teste.com']);
  expect(doTipo('03')).toEqual(['03|1|12345678909|Ana Conceição']);
});

test('o HORÁRIO CONTRATUAL: o relógio do turno A (8h10, almoço 12:30-14:00) e o do sábado', () => {
  expect(doTipo('04')).toEqual(['04|A|490|0730|1230|1400|1710', '04|SAB|240|0800|1200']);
  // Carga própria na ficha é outro contrato, com código próprio
  const propria = montarAej(base([{ ...ana, colaborador: { ...ana.colaborador, cargaHorariaDiariaMinutos: 360 } }]));
  expect(propria.filter((l) => l.startsWith('04|A-360|360|'))).toHaveLength(1);
});

test('as MARCAÇÕES: hora da original, par pela ordem do dia, O / I / D com motivo', () => {
  expect(doTipo('05')).toEqual([
    // Sábado: duas batidas, a saída fecha o par 1; o código do horário só na 1ª entrada
    '05|1|2026-10-03T08:02:00-0300|1|E|001|O|SAB|',
    '05|1|2026-10-03T12:00:00-0300|1|S|001|O||',
    // A original do domingo, fora da jornada, esperando o RH
    '05|1|2026-10-04T10:00:00-0300|1|D|001|O||Domingo não tem jornada; aguardando tratamento do RH',
    '05|1|2026-10-05T07:30:00-0300|1|E|001|O|A|',
    '05|1|2026-10-05T12:30:00-0300|1|S|001|O||',
    '05|1|2026-10-05T14:00:00-0300|1|E|002|O||',
    // A correção entra como incluída, sem REP; o "|" e a quebra saem do texto
    '05|1|2026-10-05T17:10:00-0300||S|002|I||Esqueceu de bater na hora',
    // e a original que ela substituiu fica, desconsiderada
    '05|1|2026-10-05T17:42:00-0300|1|D|002|O||Corrigida: Esqueceu de bater na hora',
  ]);
});

test('o tratamento: incluída na hora da original é "O"; desconsiderada sai com a justificativa', () => {
  const v: VinculoDoAej = {
    ...ana,
    dias: [{ data: '2026-10-05', sequencia: QUATRO, marcacoes: [batida('t1', '2026-10-05', 'entrada', '07:31', { metodo: 'ajuste_rh', justificativa: 'tratada' })], falta: false }],
    originais: [
      { nsr: 9, registradoEm: '2026-10-05T10:31:20.000Z', data: '2026-10-05', registroId: null, tipoPedido: null, foraDaJornada: 'repetida', tratamento: { decisao: 'incluida', registroId: 't1', justificativa: 'tratada' } },
      { nsr: 10, registradoEm: '2026-10-05T10:32:00.000Z', data: '2026-10-05', registroId: null, tipoPedido: null, foraDaJornada: 'repetida', tratamento: { decisao: 'desconsiderada', registroId: null, justificativa: 'Bateu duas vezes' } },
    ],
    ajustes: [],
  };
  expect(montarAej(base([v])).filter((l) => l.startsWith('05|'))).toEqual([
    '05|1|2026-10-05T07:31:00-0300|1|E|001|O|A|',
    '05|1|2026-10-05T07:32:00-0300|1|D|001|O||Bateu duas vezes',
  ]);
});

test('o registro 07: DSR no domingo sem batida, a falta do espelho, e só o banco APROVADO do período', () => {
  expect(doTipo('07')).toEqual([
    '07|1|3|2026-10-03|15|2', // débito aprovado: compensação
    '07|1|1|2026-10-04||', // domingo: DSR
    '07|1|3|2026-10-05|30|1', // hora extra aprovada: inclusão
    '07|1|2|2026-10-06||', // falta
  ]);
  // Domingo com batida não foi descanso
  const trabalhou = { ...ana, dias: ana.dias.map((d) => (d.data === '2026-10-04' ? { ...d, marcacoes: [batida('d1', d.data, 'entrada', '09:00')] } : d)) };
  expect(montarAej(base([trabalhou])).some((l) => l.startsWith('07|1|1|'))).toBe(false);
});

test('o TRAILER conta cada tipo (o 06 não se usa: um vínculo por CPF)', () => {
  expect(doTipo('99')).toEqual(['99|1|1|1|2|8|0|4|1']);
});

test('os VÍNCULOS: do CNPJ e batem ponto, ou com original nele; sem CPF fica à parte', () => {
  const lista = [
    pessoa('ana', 'Ana'),
    pessoa('bia', 'Bia', { cnpj: '28.251.342/0001-01' }),
    pessoa('caio', 'Caio', { cnpj: '28.251.342/0001-01' }),
    pessoa('dani', 'Dani'),
    pessoa('edu', 'Edu', { ativo: false }),
    pessoa('fer', 'Fer'),
  ];
  const r = vinculosDoAej(
    '05041606000199',
    lista,
    (c) => c.id !== 'dani',
    new Set(['caio']),
    new Map([['ana', '123.456.789-09'], ['caio', '98765432100'], ['edu', '11111111111']])
  );
  expect(r.comCpf.map((v) => [v.colaborador.id, v.cpf])).toEqual([['ana', '12345678909'], ['caio', '98765432100']]);
  expect(r.semCpf.map((c) => c.id)).toEqual(['fer']);
});

test('o texto livre não leva o delimitador nem quebra a linha, e respeita o tamanho', () => {
  expect(textoDoAej('a|b\r\nc')).toBe('a b c');
  expect(textoDoAej('x'.repeat(200))).toHaveLength(150);
  expect(dataHoraDoAej('2026-10-05T23:59:59.000Z')).toBe('2026-10-05T20:59:00-0300');
});
