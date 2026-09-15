/**
 * Verificação do CNPJ — CONECTA
 *
 * A conferência dos dígitos existe para o erro aparecer na carga da
 * planilha, e não meses depois num documento trabalhista. Um número trocado
 * passa despercebido na tela; no cálculo, não passa.
 */
import { test, expect } from 'bun:test';
import { apenasDigitosCnpj, formatarCnpj, cnpjEhValido } from './documentos';

test('aceita CNPJ com e sem pontuação', () => {
  // Quem preenche a planilha cola de onde tiver: os dois jeitos entram
  expect(cnpjEhValido('11.222.333/0001-81')).toBe(true);
  expect(cnpjEhValido('11222333000181')).toBe(true);
  expect(cnpjEhValido(' 11222333000181 ')).toBe(true);
});

test('DÍGITO TROCADO É RECUSADO', () => {
  // Um número a menos no final: é o erro de digitação mais comum
  expect(cnpjEhValido('11.222.333/0001-82')).toBe(false);
  // Dois dígitos trocados de lugar no meio
  expect(cnpjEhValido('11.222.233/0001-81')).toBe(false);
});

test('tamanho errado não passa', () => {
  expect(cnpjEhValido('')).toBe(false);
  expect(cnpjEhValido('112223330001')).toBe(false);
  expect(cnpjEhValido('112223330001811')).toBe(false);
});

test('repetidos são recusados mesmo fechando a conta', () => {
  // 11111111111111 passa no módulo 11 por coincidência, mas não existe como
  // empresa — e é justamente o que alguém digita para "preencher o campo"
  expect(cnpjEhValido('11.111.111/1111-11')).toBe(false);
  expect(cnpjEhValido('00000000000000')).toBe(false);
});

test('formata para o padrão que o RH lê', () => {
  expect(formatarCnpj('11222333000181')).toBe('11.222.333/0001-81');
  // Já formatado continua igual
  expect(formatarCnpj('11.222.333/0001-81')).toBe('11.222.333/0001-81');
});

test('incompleto é devolvido como veio, sem inventar pontuação', () => {
  expect(formatarCnpj('1122')).toBe('1122');
  expect(formatarCnpj('')).toBe('');
});

test('a limpeza tira pontuação e corta o excesso', () => {
  expect(apenasDigitosCnpj('11.222.333/0001-81')).toBe('11222333000181');
  expect(apenasDigitosCnpj('11222333000181999')).toBe('11222333000181');
  expect(apenasDigitosCnpj('abc')).toBe('');
});
