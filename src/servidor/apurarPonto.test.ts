/**
 * A APURAÇÃO DA MADRUGADA, testada como o servidor a roda: em UTC.
 *
 * O fuso deste processo é trocado para UTC antes de tudo — é o fuso das
 * funções do Supabase. Se alguma regra voltar a ler a hora com
 * `getHours()`, toda entrada das 07:30 vira 10:30 e estes testes caem.
 */
process.env.TZ = 'UTC';

import { test, expect } from 'bun:test';
import { planejarApuracao, DadosDaApuracao } from './apurarPonto';

const pessoa = (id: string, nivel: number, extra: Record<string, unknown> = {}) =>
  ({
    id, nome: id, login: id, cargo: 'Balconista', setor: 'Balcão', loja: 'Pirassununga', nivel,
    turno: 'A', ativo: true, foto: '', presenca: 'disponivel', vistoPorUltimo: '', criadoEm: '', ...extra,
  }) as any;

const ANA = pessoa('ana', 1);
const GERENTE = pessoa('ger', 3);

/** Uma batida como o banco devolve: horário em UTC (Brasília + 3h). */
const batida = (quem: string, data: string, tipo: string, hora: string) => {
  const [h, m] = hora.split(':').map(Number);
  const utc = new Date(`${data}T00:00:00.000Z`);
  utc.setUTCHours(h + 3, m);
  return { id: `${quem}-${data}-${tipo}`, colaboradorId: quem, data, tipo, horario: utc.toISOString(), horaFormatada: hora } as any;
};
const dia = (quem: string, data: string, [e, sa, ra, s]: string[]) => [
  batida(quem, data, 'entrada', e),
  batida(quem, data, 'saida_almoco', sa),
  batida(quem, data, 'retorno_almoco', ra),
  batida(quem, data, 'saida', s),
];

const dados = (extra: Partial<DadosDaApuracao> = {}): DadosDaApuracao => ({
  colaboradores: [ANA, GERENTE],
  batidas: [],
  ausencias: [],
  feriados: [],
  ajustes: [],
  permissoes: null,
  ...extra,
});

let n = 0;
// Quinta, 08/10/2026: revisa de 01/10 (qui) a 07/10 (qua)
const opcoes = { hoje: '2026-10-08', agora: '2026-10-08T06:00:00.000Z', novoId: () => `novo-${n++}`, diasParaTras: 7 };

/** A semana da Ana completa no horário, para os testes mexerem num dia só. */
const semanaCerta = () =>
  ['2026-10-01', '2026-10-02', '2026-10-05', '2026-10-06', '2026-10-07'].flatMap((d) =>
    dia('ana', d, ['07:30', '12:30', '14:00', '17:10'])
  );

test('o processo está mesmo em UTC, como o servidor', () => {
  expect(new Date().getTimezoneOffset()).toBe(0);
});

test('a semana certa, vinda do banco em UTC, não gera nada', () => {
  // Sábado 03/10 também batido, das 8 ao meio-dia
  const sabado = [batida('ana', '2026-10-03', 'entrada', '08:00'), batida('ana', '2026-10-03', 'saida', '12:00')];
  const plano = planejarApuracao(dados({ batidas: [...semanaCerta(), ...sabado] }), opcoes);
  expect(plano.gravar).toEqual([]);
});

test('o dia útil sem batida vira falta na fila — e o gerente, que não bate ponto, não', () => {
  const semTerca = semanaCerta().filter((b) => b.data !== '2026-10-06');
  const sabado = [batida('ana', '2026-10-03', 'entrada', '08:00'), batida('ana', '2026-10-03', 'saida', '12:00')];
  const plano = planejarApuracao(dados({ batidas: [...semTerca, ...sabado] }), opcoes);

  expect(plano.gravar.map((a) => `${a.colaboradorId} ${a.data} ${a.tipo}`)).toEqual(['ana 2026-10-06 dia_incompleto']);
  expect(plano.gravar[0]).toMatchObject({ minutos: 480, estado: 'pendente', id: 'inc-ana-2026-10-06' });
  expect(plano.novosNaFila).toHaveLength(1);
  expect(plano.resumo).toMatchObject({ pessoas: 1, faltas: 1 });
});

test('o dia fechado que nunca virou pedido é apurado: hora extra além da tolerância', () => {
  const batidas = semanaCerta().map((b) =>
    b.data === '2026-10-05' && b.tipo === 'saida' ? batida('ana', '2026-10-05', 'saida', '17:40') : b
  );
  const sabado = [batida('ana', '2026-10-03', 'entrada', '08:00'), batida('ana', '2026-10-03', 'saida', '12:00')];
  const plano = planejarApuracao(dados({ batidas: [...batidas, ...sabado] }), opcoes);
  expect(plano.gravar).toHaveLength(1);
  expect(plano.gravar[0]).toMatchObject({ data: '2026-10-05', tipo: 'hora_extra', minutos: 30, estado: 'pendente' });
});

test('a tolerância compara cada batida com o turno NO RELÓGIO DA LOJA', () => {
  /*
    Entrou 07:27 e saiu 17:13: três minutos em cada ponta, dentro dos 5 por
    marcação e dos 10 do dia — não gera nada. Lida no relógio do servidor
    (UTC), a entrada viraria 10:27, três horas "atrasada" contra as 07:30
    do turno, e o dia viraria hora extra de 6 minutos na fila.
  */
  const batidas = semanaCerta().map((b) =>
    b.data !== '2026-10-05' ? b : b.tipo === 'entrada' ? batida('ana', '2026-10-05', 'entrada', '07:27') : b.tipo === 'saida' ? batida('ana', '2026-10-05', 'saida', '17:13') : b
  );
  const sabado = [batida('ana', '2026-10-03', 'entrada', '08:00'), batida('ana', '2026-10-03', 'saida', '12:00')];
  expect(planejarApuracao(dados({ batidas: [...batidas, ...sabado] }), opcoes).gravar).toEqual([]);
});

test('rodar de novo com o que gravou não grava nada: a madrugada é idempotente', () => {
  // Uma falta (06/10) e uma hora extra pendente (05/10, saída 17:40)
  const batidas = semanaCerta()
    .filter((b) => b.data !== '2026-10-06')
    .map((b) => (b.data === '2026-10-05' && b.tipo === 'saida' ? batida('ana', '2026-10-05', 'saida', '17:40') : b));
  const sabado = [batida('ana', '2026-10-03', 'entrada', '08:00'), batida('ana', '2026-10-03', 'saida', '12:00')];
  const primeira = planejarApuracao(dados({ batidas: [...batidas, ...sabado] }), opcoes);
  expect(primeira.gravar).toHaveLength(2);

  const segunda = planejarApuracao(dados({ batidas: [...batidas, ...sabado], ajustes: primeira.gravar }), opcoes);
  expect(segunda.gravar).toEqual([]);
  expect(segunda.novosNaFila).toEqual([]);
});

test('dia decidido não é reaberto, e ausência aprovada não vira falta', () => {
  const semTerca = semanaCerta().filter((b) => b.data !== '2026-10-06' && b.data !== '2026-10-07');
  const sabado = [batida('ana', '2026-10-03', 'entrada', '08:00'), batida('ana', '2026-10-03', 'saida', '12:00')];
  const plano = planejarApuracao(
    dados({
      batidas: [...semTerca, ...sabado],
      // 06/10: a falta já foi decidida pelo líder
      ajustes: [{ id: 'x', colaboradorId: 'ana', data: '2026-10-06', tipo: 'debito', minutos: 490, minutosTrabalhados: 0, minutosPrevistos: 490, estado: 'aprovado', criadoEm: '' }],
      // 07/10: atestado aprovado
      ausencias: [{ id: 'j', colaboradorId: 'ana', dataInicio: '2026-10-07', dataFim: '2026-10-07', tipo: 'atestado', estado: 'aprovada', criadoEm: '' } as any],
    }),
    opcoes
  );
  expect(plano.gravar).toEqual([]);
});

test('a madrugada fecha o saldo de compensação do sábado do mês anterior', () => {
  /*
    Hoje é 08/10: o mês fechado é setembro. A Ana cumpriu dois dias úteis
    de setembro no horário (2 × 10 min) e não folgou; agosto deixou 30 min.
    Setembro fecha com 50, que seguem para outubro.
  */
  const setembro = [
    ...dia('ana', '2026-09-14', ['07:30', '12:30', '14:00', '17:10']),
    ...dia('ana', '2026-09-15', ['07:30', '12:30', '14:00', '17:10']),
  ];
  const agosto = { colaboradorId: 'ana', mes: '2026-08', anterior: 0, juntada: 30, folgas: 0, consumida: 0, saldoFinal: 30 };
  const plano = planejarApuracao(dados({ batidas: [...semanaCerta(), ...setembro], compensacoes: [agosto] }), opcoes);
  expect(plano.compensacoes).toEqual([
    { colaboradorId: 'ana', mes: '2026-09', anterior: 30, juntada: 20, folgas: 0, consumida: 0, saldoFinal: 50 },
  ]);

  // Já gravado igual, não regrava
  const deNovo = planejarApuracao(
    dados({ batidas: [...semanaCerta(), ...setembro], compensacoes: [agosto, plano.compensacoes[0]] }),
    opcoes
  );
  expect(deNovo.compensacoes).toEqual([]);

  // Com a folga de sábado de 19/09 aprovada, ela consome os 50 — e não deixa devendo
  const comFolga = planejarApuracao(
    dados({
      batidas: [...semanaCerta(), ...setembro],
      compensacoes: [agosto],
      ausencias: [{ id: 'f', colaboradorId: 'ana', dataInicio: '2026-09-19', dataFim: '2026-09-19', tipo: 'folga_sabado', estado: 'aprovada', criadoEm: '' } as any],
    }),
    opcoes
  );
  expect(comFolga.compensacoes[0]).toMatchObject({ folgas: 1, consumida: 50, saldoFinal: 0 });
});
