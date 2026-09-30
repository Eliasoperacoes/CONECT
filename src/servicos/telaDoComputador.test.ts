/**
 * O CONECTA NO NAVEGADOR DO COMPUTADOR — o retrabalho de organização.
 *
 * Pedido do Elias: o mesmo cuidado de interface que o aplicativo recebeu,
 * "100% navegador, sem alterar o mobile". Estas são as regras que
 * sustentam a tela grande; o celular foi conferido pixel a pixel.
 */
import { test, expect } from 'bun:test';
import { readFileSync } from 'fs';
import { join } from 'path';

const ler = (arq: string) =>
  readFileSync(join(import.meta.dir, '..', arq), 'utf8').replace(/\r\n/g, '\n');

test('o menu do topo marca a tela que está NA TELA, e não a escolhida por baixo', () => {
  // A sessão nasce em "conversas", que no computador vira o painel:
  // comparando com a escolhida, nada ficava marcado
  expect(ler('App.tsx')).toContain(': abaDesktop === aba.alvo;');
});

test('conversas no cabeçalho, sem botão flutuando por cima do conteúdo', () => {
  const app = ler('App.tsx');
  expect(app).not.toContain('fixed bottom-6 right-6');
  const cabecalho = app.slice(app.indexOf('<header className="hidden md:flex'), app.indexOf('</header>'));
  expect(cabecalho).toContain('id="botao-abrir-conversas"');
  expect(cabecalho).toContain('totalNaoLidas');
});

test('a gaveta de conversas ocupa o lugar onde as janelas de chat começam', () => {
  // 356 de largura + 16 de margem = 372, o início das janelas no App
  expect(ler('componentes/PainelConversas.tsx')).toContain('md:right-4 md:bottom-4 md:w-[356px]');
  expect(ler('App.tsx')).toContain('const INICIO_DAS_JANELAS = 372;');
});

test('no computador as abas não esmaecem nas pontas', () => {
  expect(ler('componentes/AbasRolaveis.tsx')).toContain('md:[mask-image:none]');
});

test('toda tela tem o mesmo título e a mesma largura', () => {
  const app = ler('App.tsx');
  expect(ler('componentes/PainelRede.tsx')).toContain('<TituloDaPagina titulo={tituloDoPainel}');
  expect(ler('componentes/CentralAvisos.tsx')).toContain('<TituloDaPagina');
  expect(app).toContain('titulo="Meu ponto"');
  expect(app).toContain('titulo="Meu perfil"');

  // Ponto e Eu deixaram a coluna de 900px pela largura das outras telas
  expect(app).not.toContain('max-w-[900px]');
  expect(ler('componentes/CentralAvisos.tsx')).toContain('md:max-w-7xl md:mx-auto');
  expect(ler('componentes/PainelRH.tsx')).not.toContain('max-w-[1100px]');
});

test('Ponto e Eu em duas colunas só a partir da tela grande', () => {
  expect(ler('componentes/AbaPonto.tsx')).toContain("'lg:grid lg:grid-cols-2 lg:items-start'");
  const eu = ler('componentes/AbaEu.tsx');
  expect(eu).toContain('lg:grid lg:grid-cols-[360px_minmax(0,1fr)]');
  expect(eu).toContain('<div className="lg:col-start-2 lg:row-start-1 lg:row-span-2">');
});
