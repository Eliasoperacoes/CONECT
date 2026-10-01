/**
 * AS REGRAS DO DIA FORA DO APARELHO (01/10/2026).
 *
 * `apuracaoDoDia` vai inteiro para a função de servidor `apurar-ponto`. Lá
 * não há cache nem relógio de Brasília: os dados vêm do banco, e o fuso da
 * máquina é UTC. Estes testes ligam uma fonte como a do servidor — listas
 * em memória, horários em UTC lidos por `minutosEmBrasilia` — e conferem
 * que o dia sai igual ao que o aplicativo mostra.
 */
import { test, expect, beforeEach } from 'bun:test';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  usarFonteDaApuracao,
  minutosEmBrasilia,
  hojeEmBrasilia,
  jornadaDoDia,
  decidirApuracao,
  decidirLevantamento,
} from './apuracaoDoDia';

const ANA = {
  id: 'ana', nome: 'Ana', login: 'ana', cargo: 'Balconista', setor: 'Balcão', loja: 'Pirassununga',
  nivel: 1, turno: 'A', ativo: true, foto: '', presenca: 'disponivel', vistoPorUltimo: '', criadoEm: '',
} as any;

let batidas: any[] = [];
let ajustes: any[] = [];
let ausencias: Array<{ colaboradorId: string; data: string; situacao: any }> = [];

/** Uma batida como o banco devolve: horário em UTC (Brasília + 3h). */
const batida = (data: string, tipo: string, hora: string) => {
  const [h, m] = hora.split(':').map(Number);
  const utc = new Date(`${data}T00:00:00.000Z`);
  utc.setUTCHours(h + 3, m);
  batidas.push({ id: `${data}-${tipo}`, colaboradorId: 'ana', data, tipo, horario: utc.toISOString(), horaFormatada: hora });
};
const diaInteiro = (data: string, [e, sa, ra, s]: string[]) => {
  batida(data, 'entrada', e);
  batida(data, 'saida_almoco', sa);
  batida(data, 'retorno_almoco', ra);
  batida(data, 'saida', s);
};

beforeEach(() => {
  batidas = [];
  ajustes = [];
  ausencias = [];
  // A fonte do servidor: nada de cache, nada de fuso local
  usarFonteDaApuracao({
    colaborador: (id) => (id === 'ana' ? ANA : undefined),
    marcacoesDoDia: (id, data) => batidas.filter((b) => b.colaboradorId === id && b.data === data),
    situacaoDoDia: (id, data) => ausencias.find((a) => a.colaboradorId === id && a.data === data)?.situacao ?? 'normal',
    feriadoEm: () => undefined,
    ajusteDoDia: (id, data) => ajustes.find((a) => a.colaboradorId === id && a.data === data) ?? null,
    batePonto: () => true,
    hoje: () => '2026-10-08',
    minutosDoHorario: minutosEmBrasilia,
    tolerancias: () => ({ porMarcacao: 5, diaria: 10 }),
  });
});

test('a hora da batida é lida no relógio de Brasília, não no da máquina', () => {
  // 10:30 em UTC é 07:30 em Brasília — no servidor (UTC) getHours() daria 10
  expect(minutosEmBrasilia('2026-09-16T10:30:00.000Z')).toBe(7 * 60 + 30);
  expect(minutosEmBrasilia('2026-09-16T20:10:00.000Z')).toBe(17 * 60 + 10);
  // 23:30 de Brasília já é o dia seguinte em UTC: o "hoje" é o daqui
  expect(hojeEmBrasilia(new Date('2026-10-02T02:30:00.000Z'))).toBe('2026-10-01');
});

test('o dia do turno A, vindo do banco em UTC: 8h10 trabalhadas, 8h previstas, 10 de compensação e saldo zero', () => {
  diaInteiro('2026-10-06', ['07:30', '12:30', '14:00', '17:10']);
  const j = jornadaDoDia('ana', '2026-10-06');
  expect(j.completa).toBe(true);
  expect(j.minutosTrabalhados).toBe(490);
  // As 8h da CLT; os 10 minutos são a compensação do sábado (01/10/2026)
  expect(j.minutosPrevistos).toBe(480);
  expect(j.compensacaoMinutos).toBe(10);
  expect(j.saldoMinutos).toBe(0);
});

test('hora extra além da tolerância vira pedido na fila, com o motivo da pessoa', () => {
  diaInteiro('2026-10-06', ['07:30', '12:30', '14:00', '17:40']);
  const d = decidirApuracao('ana', '2026-10-06', {
    motivo: 'Inventário', agora: '2026-10-06T20:41:00.000Z', novoId: () => 'novo',
  });
  expect(d.acao).toBe('gravar');
  if (d.acao !== 'gravar') return;
  expect(d.ajuste).toMatchObject({ id: 'novo', tipo: 'hora_extra', minutos: 30, estado: 'pendente', motivoColaborador: 'Inventário' });
  expect(d.entrouNaFila).toBe(true);
  expect(d.reescrita).toBe(false);
});

test('dia já decidido não reabre sozinho; dentro da tolerância, o pendente volta a zero', () => {
  diaInteiro('2026-10-06', ['07:30', '12:30', '14:00', '17:40']);
  ajustes.push({ id: 'x', colaboradorId: 'ana', data: '2026-10-06', tipo: 'hora_extra', minutos: 30, estado: 'aprovado' });
  expect(decidirApuracao('ana', '2026-10-06', { agora: '', novoId: () => 'n' }).acao).toBe('nada');

  // Corrigida a saída para 17:12, o pendente de antes é reescrito para zero
  batidas = [];
  ajustes = [{ id: 'y', colaboradorId: 'ana', data: '2026-10-06', tipo: 'hora_extra', minutos: 30, estado: 'pendente' }];
  diaInteiro('2026-10-06', ['07:30', '12:30', '14:00', '17:12']);
  const d = decidirApuracao('ana', '2026-10-06', { agora: 'agora', novoId: () => 'n' });
  expect(d).toMatchObject({ acao: 'gravar', reescrita: true, ajuste: { id: 'y', minutos: 0, estado: 'aprovado' } });
});

test('o levantamento: dia útil sem batida vira falta; abonado e domingo, nada', () => {
  // 06/10/2026 é terça; o "hoje" do servidor é 08/10
  const d = decidirLevantamento(ANA, '2026-10-06', 'agora');
  expect(d).toMatchObject({ acao: 'criarFalta', ajuste: { id: 'inc-ana-2026-10-06', tipo: 'dia_incompleto', minutos: 480 } });

  ausencias.push({ colaboradorId: 'ana', data: '2026-10-07', situacao: 'atestado' });
  expect(decidirLevantamento(ANA, '2026-10-07', 'agora').acao).toBe('nada');
  expect(decidirLevantamento(ANA, '2026-10-04', 'agora').acao).toBe('nada'); // domingo
  // Hoje ainda dá tempo de chegar
  expect(decidirLevantamento(ANA, '2026-10-08', 'agora').acao).toBe('nada');
});

test('o dia que fechou com pedido de "dia sem fechar" pendente é reapurado', () => {
  diaInteiro('2026-10-06', ['07:30', '12:30', '14:00', '17:10']);
  ajustes.push({ id: 'inc', colaboradorId: 'ana', data: '2026-10-06', tipo: 'dia_incompleto', estado: 'pendente' });
  expect(decidirLevantamento(ANA, '2026-10-06', 'agora').acao).toBe('reapurar');

  // O dia de HOJE não é revisto, mesmo fechado: ele ainda não terminou
  diaInteiro('2026-10-08', ['07:30', '12:30', '14:00', '17:10']);
  ajustes.push({ id: 'hoje', colaboradorId: 'ana', data: '2026-10-08', tipo: 'dia_incompleto', estado: 'pendente' });
  expect(decidirLevantamento(ANA, '2026-10-08', 'agora').acao).toBe('nada');
});

test('o módulo só importa regras puras: ele vai inteiro para o servidor', () => {
  const fonte = readFileSync(join(import.meta.dir, 'apuracaoDoDia.ts'), 'utf8');
  const imports = [...fonte.matchAll(/from\s+'([^']+)'/g)].map((m) => m[1]);
  expect(imports.sort()).toEqual(['../tipos', './toleranciaDoPonto']);
  // E a tolerância também é folha
  const tolerancia = readFileSync(join(import.meta.dir, 'toleranciaDoPonto.ts'), 'utf8');
  expect([...tolerancia.matchAll(/from\s+'([^']+)'/g)]).toHaveLength(0);
  // Nada de aparelho dentro das regras
  const codigo = fonte.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  expect(codigo).not.toMatch(/localStorage|getHours\(|bancoDados|servicoPonto/);
});
