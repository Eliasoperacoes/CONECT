/**
 * A CARGA DE HOLERITES — de quem é cada página do PDF do escritório.
 *
 * Holerite é salário: a página no lugar errado mostra o de uma pessoa a
 * outra. Na dúvida, a página não é publicada — o RH decide.
 */
import { test, expect } from 'bun:test';
import {
  analisarPaginas,
  decisaoInicial,
  paginasPorPessoa,
  sugerirCompetencia,
  normalizarParaComparar,
  nomesNoCampo,
} from './cargaDeHolerites';

const EQUIPE = [
  { id: 'maria', nome: 'Maria Clara Mafra De Oliveira' },
  { id: 'ana', nome: 'Ana Paula' },
  { id: 'anaR', nome: 'Ana Paula Ribeiro' },
  { id: 'joao', nome: 'João Felipe da Silva Baldi' },
  { id: 'jose1', nome: 'José Eduardo Boralli' },
  { id: 'jose2', nome: 'Jose Eduardo Boralli' },
];

const holerite = (nome: string) =>
  `MALACHIAS AUTOPECAS LTDA  CNPJ 00.000.000/0001-00  Recibo de Pagamento de Salário
   Código 123  Nome do Funcionário ${nome}  CBO 521110  Setembro/2026
   Vencimentos 2.100,00  Descontos 168,00  Líquido 1.932,00`;

test('o nome vem igual mesmo em maiúsculas e sem acento', () => {
  expect(normalizarParaComparar('João Felipe')).toBe(normalizarParaComparar('JOAO  FELIPE'));

  const [p] = analisarPaginas([holerite('JOAO FELIPE DA SILVA BALDI')], EQUIPE);
  expect(p.donos).toEqual(['joao']);
});

test('cada página vai para quem tem o nome nela', () => {
  const paginas = analisarPaginas(
    [holerite('MARIA CLARA MAFRA DE OLIVEIRA'), holerite('JOÃO FELIPE DA SILVA BALDI')],
    EQUIPE
  );
  expect(paginas.map((p) => p.donos)).toEqual([['maria'], ['joao']]);
  expect(paginasPorPessoa(decisaoInicial(paginas))).toEqual({ maria: [1], joao: [2] });
});

test('"Ana Paula" dentro de "Ana Paula Ribeiro" não é outra pessoa', () => {
  const [daRibeiro, daAna] = analisarPaginas(
    [holerite('ANA PAULA RIBEIRO'), holerite('ANA PAULA')],
    EQUIPE
  );
  expect(daRibeiro.donos).toEqual(['anaR']);
  expect(daAna.donos).toEqual(['ana']);
});

test('pedaço de palavra não é nome: "ANA PAULAS" não casa com Ana Paula', () => {
  const [p] = analisarPaginas([holerite('ANA PAULASSO')], EQUIPE);
  expect(p.donos).toEqual([]);
});

test('nem no começo da palavra: "JOANA PAULA" não é a Ana Paula', () => {
  // A página começando pelo nome é o caso em que a borda da esquerda some
  const [p] = analisarPaginas(['JOANA PAULA  Recibo de Pagamento'], EQUIPE);
  expect(p.donos).toEqual([]);
});

test('uma palavra do nome em comum não é palpite', () => {
  // "MARIA" sozinha está em meio cadastro — sugerir a Maria Clara seria chute
  const [p] = analisarPaginas([holerite('MARIA DAS DORES SANTOS')], EQUIPE);
  expect(p.donos).toEqual([]);
  expect(p.sugestao).toBeUndefined();
});

test('duas pessoas diferentes na mesma página: ninguém recebe sozinho', () => {
  const [p] = analisarPaginas(
    [`${holerite('MARIA CLARA MAFRA DE OLIVEIRA')} ${holerite('JOAO FELIPE DA SILVA BALDI')}`],
    EQUIPE
  );
  expect(p.donos.sort()).toEqual(['joao', 'maria']);
  expect(decisaoInicial([p])[1]).toBeNull();
});

test('homônimo no cadastro: a página espera o RH', () => {
  const [p] = analisarPaginas([holerite('JOSE EDUARDO BORALLI')], EQUIPE);
  expect(p.donos.sort()).toEqual(['jose1', 'jose2']);
  expect(decisaoInicial([p])[1]).toBeNull();
});

test('a página de resumo da folha, sem nome, não vai para o último funcionário', () => {
  const paginas = analisarPaginas(
    [holerite('JOAO FELIPE DA SILVA BALDI'), 'RESUMO GERAL DA FOLHA  Total líquido 187.340,55'],
    EQUIPE
  );
  expect(paginas[1].donos).toEqual([]);
  expect(paginas[1].sugestao).toBeUndefined();
  expect(paginasPorPessoa(decisaoInicial(paginas))).toEqual({ joao: [1] });
});

test('nome cortado pelo sistema da contabilidade vira SUGESTÃO, não publicação', () => {
  const [p] = analisarPaginas([holerite('MARIA CLARA MAFRA DE OLIVEI')], EQUIPE);
  expect(p.donos).toEqual([]);
  expect(p.sugestao).toBe('maria');
  expect(decisaoInicial([p])[1]).toBeNull();
});

test('o RH decide: a escolha dele é o que vale, e páginas seguidas se juntam', () => {
  const grupos = paginasPorPessoa({ 1: 'maria', 2: 'joao', 3: 'maria', 4: null });
  expect(grupos).toEqual({ maria: [1, 3], joao: [2] });
});

/*
  O HOLERITE DO DOMÍNIO, como o texto sai do PDF real do escritório
  (Setembro/2026): o nome ENTRE "Código" e "Nome do Funcionário", e as duas
  vias na mesma página.
*/
const viaDominio = (nome: string, resto = '') =>
  `8781 149 SALARIO PERICULOSIDADE ${resto} R   T MALACHIAS   AUTO   PECAS   LTDA 28.251.342/0001-01 CNPJ:   CC: 41  Código  ${nome}  Nome do Funcionário   CBO  519110  Departamento  1  Filial  Folha Mensal Setembro de 2026 GERAL Mensalista Admissão:   05/09/2022 MOTOBOY`;
const paginaDominio = (nome: string, resto = '') => `${viaDominio(nome, resto)} ${viaDominio(nome, resto)}`;

test('Domínio: o nome sai do campo, uma vez só mesmo com as duas vias', () => {
  const [p] = analisarPaginas([paginaDominio('JOÃO   FELIPE   DA   SILVA   BALDI')], EQUIPE);
  expect(nomesNoCampo(paginaDominio('JOÃO   FELIPE   DA   SILVA   BALDI'))).toEqual(['JOÃO FELIPE DA SILVA BALDI']);
  expect(p.donos).toEqual(['joao']);
  expect(p.trecho).toBe('Nome no holerite: JOÃO FELIPE DA SILVA BALDI');
});

test('Domínio: outro nome do cadastro no corpo da página não divide a página', () => {
  // A pensão descontada do João leva o nome da beneficiária no texto
  const [p] = analisarPaginas(
    [paginaDominio('JOAO FELIPE DA SILVA BALDI', 'PENSAO ALIMENTICIA MARIA CLARA MAFRA DE OLIVEIRA')],
    EQUIPE
  );
  expect(p.donos).toEqual(['joao']);
});

test('Domínio: nome com palavra a mais que o cadastro é sugestão, não publicação', () => {
  // "FERNANDA NATHALIE METZNER CECCARELLI" no holerite; sem o "Nathalie" no cadastro
  const [p] = analisarPaginas(
    [paginaDominio('FERNANDA NATHALIE METZNER CECCARELLI')],
    [...EQUIPE, { id: 'fer', nome: 'Fernanda Metzner Ceccarelli' }]
  );
  expect(p.donos).toEqual([]);
  expect(p.sugestao).toBe('fer');
});

test('Domínio: a página "A TRANSPORTAR" e a seguinte vão para a mesma pessoa', () => {
  const paginas = analisarPaginas(
    [`${paginaDominio('MARIA CLARA MAFRA DE OLIVEIRA')} A TRANSPORTAR`, paginaDominio('MARIA CLARA MAFRA DE OLIVEIRA')],
    EQUIPE
  );
  expect(paginasPorPessoa(decisaoInicial(paginas))).toEqual({ maria: [1, 2] });
});

test('o mês sai do PDF como sugestão, sem confundir com data de admissão', () => {
  expect(sugerirCompetencia([holerite('X'), holerite('Y')])).toBe('2026-09');
  // A admissão vem antes, de propósito: num empate, a primeira contada venceria
  expect(sugerirCompetencia(['Admissão 15/03/2020  Referência: 08/2026'])).toBe('2026-08');
  expect(sugerirCompetencia(['MARÇO DE 2026'])).toBe('2026-03');
  expect(sugerirCompetencia(['sem data nenhuma'])).toBeNull();
});
