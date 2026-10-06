/**
 * O ENDEREÇO DE CADA TELA: tirado do catálogo, um por tela, e de volta.
 */
import { test, expect } from 'bun:test';
import { caminhoDaTela, telaDoCaminho, todosOsCaminhos } from './enderecoDaTela';
import { ASSUNTOS } from './telasPorAssunto';

test('cada tela do catálogo tem um caminho, e não há dois iguais', () => {
  const caminhos = todosOsCaminhos();
  const telas = ASSUNTOS.flatMap((a) => a.telas.map((t) => t.id));
  for (const tela of [...telas, 'perfil' as const]) {
    expect({ tela, temCaminho: caminhos.some(([t]) => t === tela) }).toEqual({ tela, temCaminho: true });
  }
  const so = caminhos.map(([, c]) => c);
  expect(new Set(so).size).toBe(so.length);
});

test('o caminho é o assunto e a tela; o Início é a raiz; de uma tela só, só o assunto', () => {
  expect(caminhoDaTela('inicio')).toBe('/');
  expect(caminhoDaTela('meu_ponto')).toBe('/ponto/meu-ponto');
  expect(caminhoDaTela('assinaturas')).toBe('/documentos/assinaturas');
  expect(caminhoDaTela('escala_folgas')).toBe('/ausencias/escala-folgas');
  expect(caminhoDaTela('central')).toBe('/central');
  expect(caminhoDaTela('perfil')).toBe('/perfil');
});

test('IDA E VOLTA: o caminho de toda tela leva a ela mesma', () => {
  for (const [tela, caminho] of todosOsCaminhos()) {
    expect({ caminho, tela: telaDoCaminho(caminho) }).toEqual({ caminho, tela });
  }
});

test('o que se digita à mão também serve; caminho desconhecido não é tela nenhuma', () => {
  expect(telaDoCaminho('/Documentos/Assinaturas/')).toBe('assinaturas');
  expect(telaDoCaminho('/ponto/meu-ponto?x=1')).toBe('meu_ponto');
  expect(telaDoCaminho('')).toBe('inicio');
  // Quem decide o que fazer com isto é o App (cai na tela lembrada / Início)
  expect(telaDoCaminho('/nao-existe')).toBeNull();
  expect(telaDoCaminho('/ponto/meu_ponto')).toBeNull();
  expect(telaDoCaminho('/api/noticias')).toBeNull();
});
