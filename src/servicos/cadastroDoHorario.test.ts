/**
 * O HORÁRIO NO CADASTRO — Painel ADM e ficha do RH escolhem o turno
 *
 * O Painel ADM oferecia "Jornada Diária" com 4h00 a 8h48, sem o 8h10 dos
 * turnos A e B, e gravava 8h00 ao abrir e salvar qualquer ficha. O
 * previsto virava 8h00 e o sistema deixava de conhecer o horário de cada
 * batida — a tolerância por marcação não valia para essa pessoa.
 */
import { expect, test } from 'bun:test';

const ler = (caminho: string) => Bun.file(new URL(caminho, import.meta.url)).text();
const semComentarios = (fonte: string) =>
  fonte.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

test('o Painel ADM escolhe o HORÁRIO (turno), com a mesma lista da ficha do RH', async () => {
  const painel = semComentarios(await ler('../componentes/PainelAdministrativo.tsx'));
  const ficha = semComentarios(await ler('../componentes/ModalCadastroColaborador.tsx'));

  // O seletor de horas soltas saiu
  expect(painel).not.toContain('id="campo-carga-horaria"');
  expect(painel).not.toContain('<option value={480}>');

  // A lista de turnos é a mesma nas duas telas: A e B, ou os de estágio
  expect(painel).toContain('turnosDoPerfil(ehDeEstagio(formColab))');
  expect(ficha).toContain('turnosDoPerfil(ehDeEstagio(form))');
});

test('abrir e salvar uma ficha NÃO grava 8h00 de carga própria', async () => {
  const painel = semComentarios(await ler('../componentes/PainelAdministrativo.tsx'));
  expect(painel).not.toContain('?? CARGA_HORARIA_PADRAO_MINUTOS');
  expect(painel).toContain('cargaHorariaDiariaMinutos: colab.cargaHorariaDiariaMinutos ?? undefined');
  // E o turno vai junto na gravação
  expect(painel).toContain('bancoDados.criarColaborador({ ...formColab, turno })');
});

test('o cadastro novo nasce no turno escolhido, e não sempre no A', async () => {
  const banco = semComentarios(await ler('./bancoDados.ts'));
  expect(banco).toContain('turno: dados.turno || TURNO_PADRAO');
});

test('os horários A e B são os oficiais, e fecham 8h10', async () => {
  const { TURNOS, minutosDoTurno } = await import('../tipos');
  const a = TURNOS.find((t) => t.chave === 'A')!;
  const b = TURNOS.find((t) => t.chave === 'B')!;

  expect([a.entrada, a.intervalo?.saida, a.intervalo?.retorno, a.saida]).toEqual([
    '07:30', '12:30', '14:00', '17:10',
  ]);
  expect([b.entrada, b.intervalo?.saida, b.intervalo?.retorno, b.saida]).toEqual([
    '08:20', '11:00', '12:30', '18:00',
  ]);
  expect(minutosDoTurno(a)).toBe(490);
  expect(minutosDoTurno(b)).toBe(490);
});

test('O BANCO ACEITA TODO TURNO QUE A TELA OFERECE', async () => {
  /**
   * A trava do banco só conhecia A e B, e a tela oferecia também os turnos
   * de estágio: nenhum estagiário conseguiu gravar o dele. A Lyvia ficou no
   * A, com 8h10 de carga, e foi cobrada como integral. Descoberto quando o
   * SQL que a punha no E3 foi recusado (29/09/2026).
   */
  const { TURNOS } = await import('../tipos');
  const esquema = await Bun.file('supabase/esquema.sql').text();

  const travas = [
    ...esquema.matchAll(/colaboradores_turno_check\s+check \(turno in \(([^)]*)\)\)/g),
  ];
  expect(travas.length).toBeGreaterThan(0);
  // A última definição é a que vale
  const aceitos = travas[travas.length - 1][1]
    .split(',')
    .map((v) => v.trim().replace(/'/g, ''))
    .sort();

  expect(aceitos).toEqual(TURNOS.map((t) => t.chave).sort());
});
