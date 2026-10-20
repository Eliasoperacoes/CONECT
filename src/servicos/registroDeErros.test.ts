/**
 * O REGISTRO DE ERROS E A PROTEÇÃO DAS TELAS (20/10/2026)
 *
 * Um erro numa tela fica nela (ProtecaoDaTela), e vai para o registro do TI
 * com freio — o mesmo erro uma vez por minuto, 20 por sessão — e cortado,
 * para nenhuma pilha virar um texto gigante no banco.
 */
import { test, expect, beforeEach } from 'bun:test';
import { readFileSync } from 'fs';
import {
  deveRegistrar,
  linhaDoErro,
  zerarRegistroDeErros,
  MAXIMO_POR_SESSAO,
  INTERVALO_DO_MESMO_ERRO_MS,
  registrarErro,
} from './registroDeErros';
import { ProtecaoDaTela } from '../componentes/ProtecaoDaTela';

beforeEach(() => zerarRegistroDeErros());

test('o mesmo erro vai uma vez por minuto, e outro erro vai na hora', () => {
  const e = { tela: 'inicio', mensagem: 'x is undefined' };
  expect(deveRegistrar(e, 0)).toBe(true);
  expect(deveRegistrar(e, 1000)).toBe(false);
  expect(deveRegistrar({ ...e, tela: 'ponto' }, 1000)).toBe(true);
  expect(deveRegistrar(e, INTERVALO_DO_MESMO_ERRO_MS + 1)).toBe(true);
});

test('no máximo 20 por sessão, mesmo com erros diferentes', () => {
  let enviados = 0;
  for (let i = 0; i < 100; i++) if (deveRegistrar({ tela: 't', mensagem: `erro ${i}` }, i)) enviados++;
  expect(enviados).toBe(MAXIMO_POR_SESSAO);
});

test('a linha vai cortada nos tamanhos que o banco aceita', () => {
  const l = linhaDoErro({ tela: 'x'.repeat(200), mensagem: 'm'.repeat(2000), pilha: 'p'.repeat(10000) });
  expect([l.tela.length, l.mensagem.length, l.pilha!.length]).toEqual([80, 500, 4000]);
  expect(linhaDoErro({ tela: 't', mensagem: '' }).mensagem).toBe('Erro sem mensagem');
});

test('registrar nunca lança, mesmo sem banco', () => {
  expect(() => registrarErro({ tela: 't', mensagem: 'sem banco' })).not.toThrow();
});

test('a proteção segura o erro e mostra o aviso no lugar da tela', () => {
  const estado = ProtecaoDaTela.getDerivedStateFromError(new Error('quebrou'));
  expect(estado.erro?.message).toBe('quebrou');
  const p = new ProtecaoDaTela({ nome: 'inicio', children: null });
  expect(() => p.componentDidCatch(new Error('quebrou'), { componentStack: '\n  at Inicio' } as any)).not.toThrow();
});

test('todas as telas estão protegidas: as do computador, as do celular e o sistema inteiro', () => {
  const conteudo = readFileSync('src/componentes/ConteudoWeb.tsx', 'utf8');
  expect(conteudo).toContain('<ProtecaoDaTela nome={tela}>{telaDoAssunto()}</ProtecaoDaTela>');
  const app = readFileSync('src/App.tsx', 'utf8');
  for (const nome of ['central (celular)', 'ponto (celular)', 'eu (celular)']) {
    expect(app).toContain(`<ProtecaoDaTela nome="${nome}">`);
  }
  const raiz = readFileSync('src/main.tsx', 'utf8');
  expect(raiz).toContain('<ProtecaoDaTela nome="sistema" inteiro>');
  expect(raiz).toContain('vigiarErrosGlobais();');
});
