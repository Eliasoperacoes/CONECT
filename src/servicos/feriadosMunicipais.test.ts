/**
 * Verificação dos feriados por cidade — CONECTA
 *
 * O calendário é a espinha do ponto: é ele que decide se um dia cobra
 * 8h10 ou zero. Feriado municipal errado é folha de pagamento errada.
 *
 * As cinco lojas ficam em cinco cidades DIFERENTES, e isso não é detalhe:
 * num 8 de setembro a loja de Descalvado está fechada e as outras quatro
 * estão abertas. Um calendário só para a rede erraria quatro lojas para
 * acertar uma.
 */
import { test, expect } from 'bun:test';
import { INFORMACOES_LOJAS } from '../tipos';
import {
  feriadosLocaisDe,
  cidadesMapeadas,
  cidadeDaLoja,
} from './feriadosMunicipais';

const nomesEm = (ano: number, cidade?: string) =>
  feriadosLocaisDe(ano, cidade).map((f) => `${f.data} ${f.nome}`);

// ---------------------------------------------------------------
// Cada cidade tem o seu, e só o seu
// ---------------------------------------------------------------

test('o aniversário de cada cidade cai na cidade certa', () => {
  expect(nomesEm(2026, 'Descalvado - SP')).toContain(
    '2026-09-08 Aniversário de Descalvado'
  );
  expect(nomesEm(2026, 'Pirassununga - SP')).toContain(
    '2026-08-06 Aniversário de Pirassununga'
  );
  expect(nomesEm(2026, 'Porto Ferreira - SP')).toContain(
    '2026-07-29 Aniversário de Porto Ferreira'
  );
  expect(nomesEm(2026, 'Santa Rita do Passa Quatro - SP')).toContain(
    '2026-05-22 Aniversário de Santa Rita do Passa Quatro'
  );
  expect(nomesEm(2026, 'Santa Cruz das Palmeiras - SP')).toContain(
    '2026-05-03 Aniversário de Santa Cruz das Palmeiras'
  );
});

test('o feriado de uma cidade NÃO vaza para as outras', () => {
  /**
   * É o ponto todo deste arquivo. Se vazasse, o 8 de setembro fecharia a
   * rede inteira por causa de Descalvado — quatro lojas abertas com o
   * espelho dizendo que era feriado.
   */
  const emPirassununga = nomesEm(2026, 'Pirassununga - SP');

  expect(emPirassununga).not.toContain('2026-09-08 Aniversário de Descalvado');
  expect(emPirassununga.some((n) => n.includes('Porto Ferreira'))).toBe(false);
  expect(emPirassununga.some((n) => n.includes('São Sebastião'))).toBe(false);
});

test('Pirassununga tem a Piracema além do aniversário', () => {
  // A matriz é a única com dois municipais; esquecer o segundo cobraria
  // um dia inteiro de quem não trabalhou
  expect(nomesEm(2026, 'Pirassununga - SP')).toContain('2026-12-08 Piracema');
});

test('Porto Ferreira tem São Sebastião além do aniversário', () => {
  expect(nomesEm(2026, 'Porto Ferreira - SP')).toContain(
    '2026-01-20 São Sebastião'
  );
});

// ---------------------------------------------------------------
// O estadual vale para todas
// ---------------------------------------------------------------

test('9 de julho vale nas CINCO lojas', () => {
  // As cinco ficam em São Paulo: a Revolução Constitucionalista fecha
  // todas, e deixar de fora qualquer uma seria cobrar o dia dela
  for (const cidade of cidadesMapeadas()) {
    expect(nomesEm(2026, cidade)).toContain(
      '2026-07-09 Revolução Constitucionalista'
    );
  }
});

test('a Consciência Negra NÃO está aqui', () => {
  /**
   * Virou feriado NACIONAL pela Lei 14.759/2023, e já está na tabela
   * nacional. Repetir criaria dois feriados no mesmo dia — e o de loja
   * venceria o nacional sem motivo nenhum.
   */
  for (const cidade of cidadesMapeadas()) {
    expect(nomesEm(2026, cidade).some((n) => n.includes('Consciência'))).toBe(
      false
    );
  }
});

// ---------------------------------------------------------------
// Qualquer ano, sem ninguém cadastrar nada
// ---------------------------------------------------------------

test('o calendário responde para qualquer ano, sem cadastro', () => {
  /**
   * É o que o Elias pediu: automático. Se dependesse de alguém importar
   * o ano, o primeiro ano em que ninguém lembrasse transformaria todo
   * feriado em dia útil no espelho.
   */
  for (const ano of [2026, 2027, 2030, 2041]) {
    expect(nomesEm(ano, 'Descalvado - SP')).toContain(
      `${ano}-09-08 Aniversário de Descalvado`
    );
  }
});

test('a lista vem em ordem de data', () => {
  const datas = feriadosLocaisDe(2027, 'Porto Ferreira - SP').map((f) => f.data);
  expect([...datas].sort()).toEqual(datas);
});

// ---------------------------------------------------------------
// Loja → cidade, sem uma segunda cópia do endereço
// ---------------------------------------------------------------

test('a cidade de cada loja sai do cadastro das unidades', () => {
  /**
   * `INFORMACOES_LOJAS` é a fonte do endereço. Repetir a cidade dentro do
   * calendário seria a mesma informação em dois lugares — e é assim que
   * as telas deste sistema já passaram a discordar quatro vezes.
   */
  expect(cidadeDaLoja('Descalvado', INFORMACOES_LOJAS)).toBe('Descalvado - SP');
  expect(cidadeDaLoja('Palmeiras', INFORMACOES_LOJAS)).toBe(
    'Santa Cruz das Palmeiras - SP'
  );
  expect(cidadeDaLoja('Santa Rita', INFORMACOES_LOJAS)).toBe(
    'Santa Rita do Passa Quatro - SP'
  );
});

test('TODA loja de verdade tem calendário próprio', () => {
  /**
   * A rede tem cinco lojas e cinco cidades. Uma loja sem calendário
   * passaria a cobrar os feriados municipais dela como dia cheio, e o
   * defeito só apareceria no dia — tarde demais.
   *
   * "Rede" fica fora: é a central de operações, não é loja.
   */
  const semCalendario = INFORMACOES_LOJAS.filter(
    (l) => l.nome !== 'Rede' && !cidadesMapeadas().includes(l.cidade)
  ).map((l) => `${l.nome} (${l.cidade})`);

  expect(semCalendario).toEqual([]);
});

test('cidade desconhecida ainda pega o estadual', () => {
  // Loja nova em cidade não mapeada perde o feriado da cidade dela, mas
  // não perde o 9 de julho — que é o mínimo correto
  const fora = feriadosLocaisDe(2026, 'Cidade Que Não Existe - SP');

  expect(fora.map((f) => f.nome)).toEqual(['Revolução Constitucionalista']);
});

test('sem cidade nenhuma, também sobra o estadual', () => {
  expect(feriadosLocaisDe(2026).map((f) => f.nome)).toEqual([
    'Revolução Constitucionalista',
  ]);
});
