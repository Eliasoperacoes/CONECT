/**
 * PONTOS INCOMPLETOS — a sub-aba de Equipe e ponto.
 *
 * Pedido do Elias (01/10/2026): "o espelho não pode fechar incompleto",
 * uma sub-aba só para isso, cada dia dito com todas as letras ("Yan bateu
 * 2 de 4"), resolvido lançando a batida esquecida; e um aviso no espelho
 * para o responsável conferir.
 */
import { test, expect, mock } from 'bun:test';
import { readFileSync } from 'fs';
import { join } from 'path';

mock.module('../servicos/ponto', () => ({
  servicoPonto: {},
  dataDeHoje: () => '2026-10-01',
  deDataLocal: (d: string) => {
    const [a, m, dia] = d.split('-').map(Number);
    return new Date(a, m - 1, dia, 12);
  },
  paraDataLocal: (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
  formatarDataBR: (d: string) => d,
  formatarDiaCurto: (d: string) => d,
  descreverPontoIncompleto: () => '',
  marcacoesEsperadas: () => [],
  descreverBatidasQueFaltam: () => '',
}));

const { periodoDosPontosIncompletos } = await import('../componentes/PontosIncompletos');
const { resumirEspelhosIncompletos } = await import('../componentes/EspelhosIncompletos');
const ler = (arq: string) => readFileSync(join(import.meta.dir, '../componentes', arq), 'utf8');

test('olha do 1º do mês passado até ontem: o mês que vai fechar está incluído', () => {
  expect(periodoDosPontosIncompletos('2026-10-01')).toEqual({ inicio: '2026-09-01', fim: '2026-09-30' });
  expect(periodoDosPontosIncompletos('2026-10-15')).toEqual({ inicio: '2026-09-01', fim: '2026-10-14' });
  // Janeiro olha dezembro do ano anterior
  expect(periodoDosPontosIncompletos('2027-01-05')).toEqual({ inicio: '2026-12-01', fim: '2027-01-04' });
});

test('a sub-aba existe em Equipe e ponto, com o número de dias, ao lado de Aprovar jornadas', () => {
  const gestao = ler('PainelGestao.tsx');
  expect(gestao).toContain("{ id: 'incompletos' as Aba, rotulo: 'Pontos incompletos', contador: incompletos }");
  // O número vem do banco, e a própria aba o atualiza quando a batida é lançada
  expect(gestao).toContain('servicoPonto.buscarPontosIncompletos(inicio, fim)');
  expect(gestao).toContain(
    '<PontosIncompletos colaboradorAtual={colaboradorAtual} aoMudarTotal={setIncompletos} />'
  );
});

test('UMA ação por dia, que abre as batidas do dia — e não um botão por batida', () => {
  // A primeira versão punha um botão por batida que faltava: a linha do
  // Tiago tinha três, quebrava em duas linhas, e o Elias achou "horrível"
  const tela = ler('PontosIncompletos.tsx');
  expect(tela).toContain('Bateu {p.feitas} de {p.esperadas} — não fechou o dia');
  expect(tela).toContain('Completar dia');
  expect(tela).not.toContain('Lançar {ROTULO_MARCACAO');
  expect(tela).not.toMatch(/p\.faltam\.map\(/);
  // O dia inteiro na folha: feitas com o horário, faltantes com o campo
  expect(tela).toContain('batidasDoDia(aberto).map((b)');
  expect(tela).toContain('servicoPonto.completarDia({');
  // Perguntado ao banco, e não ao cache: lido do cache, a lista oscilava
  expect(tela).toContain('servicoPonto.buscarPontosIncompletos(periodo.inicio, periodo.fim)');
  expect(tela).not.toContain('obterPontosIncompletos(');
  // Os horários do dia vêm com o ponto, não do cache
  expect(tela).toContain('hora: p.horas[tipo] || null');
});

test('a linha recolhida soma os dias, separados pelo que há para fazer', () => {
  const e = (semBatida: number, semFechar: number) =>
    ({ semBatida: Array(semBatida).fill('d'), semFechar: Array(semFechar).fill({}) }) as any;
  expect(resumirEspelhosIncompletos([e(28, 1), e(0, 4), e(5, 0)])).toEqual({
    pessoas: 3,
    semBatida: 33,
    semFechar: 5,
  });
});

test('Espelhos de ponto: o aviso escala para a rede inteira', () => {
  /*
    A primeira versão era uma fileira de botões, um por pessoa: com seis já
    quebrava em duas linhas, e o Elias lembrou que são 89 colaboradores.
    Agora é uma linha recolhida e, aberta, uma tabela com busca e rolagem
    própria.
  */
  const aviso = ler('EspelhosIncompletos.tsx');
  expect(aviso).toContain('aria-expanded={aberto}');
  expect(aviso).toContain('useState(false)'); // começa recolhido
  expect(aviso).toContain('max-h-[min(60vh,440px)] overflow-y-auto');
  expect(aviso).toContain('id="busca-espelhos-incompletos"');
  expect(aviso).not.toContain('flex-wrap');
  // Os dois números, e não "1 dia" para quem tem 28 dias em branco
  expect(aviso).toContain('e.semBatida.length');
  expect(aviso).toContain('e.semFechar.length');

  // No dia 1º de outubro o espelho abria em outubro, e os dias incompletos
  // eram de setembro: cada linha abre a pessoa no mês do mais recente
  const espelho = ler('BancoDeHoras.tsx');
  expect(espelho).toContain('<EspelhosIncompletos');
  expect(espelho).toContain('.buscarEspelhosIncompletos(inicio, fim)');
  expect(espelho).toContain('periodoDoMesNaLista(e.maisRecente.slice(0, 7), dataDeHoje())');
  expect(espelho).toContain('setDetalheId(e.colaborador.id);');
});

test('o cartão do painel do RH conta o espelho incompleto pela mesma regra', () => {
  const rh = ler('PainelRH.tsx');
  expect(rh).toContain('.buscarEspelhosIncompletos(inicio, fim)');
  expect(rh).toContain("'pessoas com espelho incompleto'");
});

test('o espelho da pessoa avisa o responsável dos dias sem fechar', () => {
  const espelho = ler('BancoDeHoras.tsx');
  const individual = espelho.slice(espelho.indexOf('{/* ---------- ESPELHO INDIVIDUAL ---------- */}'));
  expect(individual).toContain('id="aviso-espelho-incompleto"');
  expect(individual).toContain('servicoPonto.batidasQueFaltam(detalhe.colaborador, j.data)');
  // E o dia de trabalho sem batida nenhuma, pela regra do "Preencher dias vazios"
  expect(individual).toContain('servicoPonto.ehDiaVazio(');
});
