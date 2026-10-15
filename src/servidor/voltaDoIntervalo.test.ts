/**
 * "FOI INTERVALO?" — a sugestão ao líder e a conta do dia (15/10/2026).
 *
 * A Lyvia (estágio de 5h, sem intervalo) entrou 07:59, saiu 12:30 para
 * almoçar, voltou 13:30 e saiu 17:00 — hora extra autorizada.
 */
process.env.TZ = 'UTC';
import { test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { sugestoesDeIntervalo, INTERVALO_MINIMO_MINUTOS } from '../servicos/voltaDoIntervalo';
import { planejarApuracao } from './apurarPonto';

const pessoa = (id: string, extra: Record<string, unknown> = {}) =>
  ({
    id, nome: `${id} Silva`, login: id, cargo: 'Estagiária', setor: 'Estágio', loja: 'Pirassununga', nivel: 1,
    turno: 'E2', ativo: true, foto: '', presenca: 'disponivel', vistoPorUltimo: '', criadoEm: '', ...extra,
  }) as any;
const LYVIA = pessoa('lyvia');

const registro = (tipo: string, hora: string) => ({ tipo, horaFormatada: hora }) as any;
const fora = (hora: string, nsr: number, quem = LYVIA, data = '2026-10-14') =>
  ({ cnpj: '11222333000144', nsr, colaborador: quem, data, hora, loja: 'Pirassununga', motivo: 'jornada_completa', tipoPedido: null }) as any;

test('saiu às 12:30, voltou às 13:30 e saiu às 17:00: o líder vê "foi intervalo?"', () => {
  const [s] = sugestoesDeIntervalo([fora('13:30', 7), fora('17:00', 8)], () => [
    registro('entrada', '07:59'),
    registro('saida', '12:30'),
  ]);
  expect(s.saida).toBe('12:30');
  expect(s.volta.hora).toBe('13:30');
  expect(s.saidaFinal?.hora).toBe('17:00');
});

test('ainda sem a saída de verdade, a volta sozinha já se sugere', () => {
  const [s] = sugestoesDeIntervalo([fora('13:30', 7)], () => [registro('entrada', '07:59'), registro('saida', '12:30')]);
  expect(s.volta.hora).toBe('13:30');
  expect(s.saidaFinal).toBeUndefined();
});

test(`O CASO DO YAN: bater de novo antes de ${INTERVALO_MINIMO_MINUTOS} minutos não é intervalo`, () => {
  expect(INTERVALO_MINIMO_MINUTOS).toBe(15);
  const dia = () => [registro('entrada', '07:59'), registro('saida', '12:30')];
  expect(sugestoesDeIntervalo([fora('12:31', 7)], dia)).toEqual([]);
  expect(sugestoesDeIntervalo([fora('12:44', 7)], dia)).toEqual([]);
  expect(sugestoesDeIntervalo([fora('12:45', 7)], dia)).toHaveLength(1);
});

test('dia que já tem intervalo, ou não tem saída, não se sugere', () => {
  const comAlmoco = () => [registro('entrada', '07:30'), registro('saida_almoco', '12:30'), registro('retorno_almoco', '14:00'), registro('saida', '17:10')];
  expect(sugestoesDeIntervalo([fora('18:30', 9)], comAlmoco)).toEqual([]);
  expect(sugestoesDeIntervalo([fora('13:30', 9)], () => [registro('entrada', '07:59')])).toEqual([]);
});

test('o dia corrigido soma certo: 8h01 trabalhadas, 5h previstas, a hora a mais vai para a fila', () => {
  const batida = (tipo: string, hora: string) => {
    const [h, m] = hora.split(':').map(Number);
    const utc = new Date('2026-10-14T00:00:00.000Z');
    utc.setUTCHours(h + 3, m);
    return { id: `l-${tipo}`, colaboradorId: 'lyvia', data: '2026-10-14', tipo, horario: utc.toISOString(), horaFormatada: hora, metodo: 'ajuste_lider' } as any;
  };
  const plano = planejarApuracao(
    {
      colaboradores: [LYVIA],
      batidas: [batida('entrada', '07:59'), batida('saida_almoco', '12:30'), batida('retorno_almoco', '13:30'), batida('saida', '17:00')],
      ausencias: [], feriados: [], ajustes: [], permissoes: null,
    },
    { hoje: '2026-10-15', agora: '2026-10-15T06:00:00.000Z', novoId: () => 'n1', diasParaTras: 1 }
  );
  const [ajuste] = plano.gravar;
  expect(ajuste).toMatchObject({ data: '2026-10-14', tipo: 'hora_extra', minutosTrabalhados: 481, minutosPrevistos: 300, estado: 'pendente' });
});

test('a tela sugere pela regra e confirma pelo banco, que confere tudo de novo', () => {
  const tela = readFileSync('src/componentes/MarcacoesForaDaJornada.tsx', 'utf8');
  expect(tela).toContain('sugestoesDeIntervalo(marcacoes, (id, data) => servicoPonto.obterMarcacoesDoDia(id, data))');
  expect(tela).toContain('await servicoPonto.tratarComoIntervalo(s)');
  const nuvem = readFileSync('src/servicos/nuvem.ts', 'utf8');
  expect(nuvem).toContain("supabase.rpc('tratar_como_intervalo'");
  // A mesma janela nos dois lugares
  expect(readFileSync('supabase/volta-do-intervalo.sql', 'utf8')).toContain(`interval '${INTERVALO_MINIMO_MINUTOS} minutes'`);
});
