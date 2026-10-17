/**
 * O RH CADASTRA COLABORADOR (tela Colaboradores, 15/10/2026).
 *
 * O serviço recusava quem não fosse TI, embora o banco já deixasse o RH
 * inserir (colaboradores_insercao = cuido_de_pessoas). Agora vale a mesma
 * regra dos dois lados — e o nível dado, só até o próprio.
 */
import { test, expect, beforeEach } from 'bun:test';

class ArmazenamentoFalso {
  private dados = new Map<string, string>();
  get length() { return this.dados.size; }
  key(i: number) { return [...this.dados.keys()][i] ?? null; }
  getItem(k: string) { return this.dados.has(k) ? this.dados.get(k)! : null; }
  setItem(k: string, v: string) { this.dados.set(k, String(v)); }
  removeItem(k: string) { this.dados.delete(k); }
  clear() { this.dados.clear(); }
}
(globalThis as any).localStorage = new ArmazenamentoFalso();

const { bancoDados } = await import('./bancoDados');

const pessoa = (id: string, setor: string, nivel: number) => ({
  id, nome: id, login: id, cargo: 'x', setor, loja: 'Pirassununga', nivel,
  foto: '', presenca: 'disponivel', vistoPorUltimo: '', ativo: true,
});

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem(
    'conecta_v4_colaboradores',
    JSON.stringify([pessoa('dani', 'RH', 4), pessoa('fabio', 'Gerência', 3), pessoa('elias', 'TI', 5)])
  );
});

const novo = (login: string, nivel: number) =>
  bancoDados.criarColaborador({
    nome: login, login, cargo: 'Balconista', setor: 'Balcão', loja: 'Pirassununga', nivel: nivel as any,
  });

test('o RH cadastra, até o próprio nível', async () => {
  localStorage.setItem('conecta_v4_colaborador_atual', 'dani');
  expect((await novo('ana', 1)).sucesso).toBe(true);
  expect((await novo('bia', 4)).sucesso).toBe(true);
  expect(await novo('caio', 5)).toEqual({ sucesso: false, erro: 'Não é possível dar um nível acima do seu.' });
});

test('o RH não promove ninguém ao 5 pela edição', async () => {
  localStorage.setItem('conecta_v4_colaborador_atual', 'dani');
  const r = await bancoDados.atualizarColaborador('fabio', { nivel: 5 });
  expect(r).toEqual({ sucesso: false, erro: 'Não é possível dar um nível acima do seu.' });
});

test('o gerente não cadastra; o TI cadastra qualquer nível', async () => {
  localStorage.setItem('conecta_v4_colaborador_atual', 'fabio');
  expect((await novo('davi', 1)).sucesso).toBe(false);
  localStorage.setItem('conecta_v4_colaborador_atual', 'elias');
  expect((await novo('eva', 5)).sucesso).toBe(true);
});

test('o que o RH muda na ficha é gravado — sábado, carga, nível e horário próprio', async () => {
  // Eram descartados calados: só o TI gravava (achado em 17/10/2026)
  localStorage.setItem('conecta_v4_colaborador_atual', 'dani');
  const r = await novo('heitor', 1);
  const id = r.colaborador!.id;
  const horario = { entrada: '09:00', intervaloSaida: '12:00', intervaloRetorno: '13:30', saida: '18:40' };
  expect(
    await bancoDados.atualizarColaborador(id, {
      trabalhaSabado: false,
      cargaSemanalMinutos: 2400,
      nivel: 2,
      turno: 'P',
      horarioProprio: horario,
    })
  ).toEqual({ sucesso: true });
  const ficha = bancoDados.obterColaboradorPorId(id)!;
  expect([ficha.trabalhaSabado, ficha.cargaSemanalMinutos, ficha.nivel, ficha.turno]).toEqual([false, 2400, 2, 'P']);
  expect(ficha.horarioProprio).toEqual(horario);
});

test('o colaborador comum continua sem mexer na própria jornada', async () => {
  localStorage.setItem('conecta_v4_colaborador_atual', 'fabio');
  const antes = bancoDados.obterColaboradorPorId('fabio')!;
  await bancoDados.atualizarColaborador('fabio', { trabalhaSabado: false, nivel: 1, turno: 'P' });
  const depois = bancoDados.obterColaboradorPorId('fabio')!;
  expect([depois.trabalhaSabado, depois.nivel, depois.turno]).toEqual([antes.trabalhaSabado, antes.nivel, antes.turno]);
});
