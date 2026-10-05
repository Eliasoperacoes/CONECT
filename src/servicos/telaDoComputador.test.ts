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
  // ...e com o chat em tela cheia, nenhuma das outras fica marcada
  // Desde a barra lateral por assunto: marca o assunto da tela MOSTRADA
  // (`telaQueAbre`), e Conversas quando o chat está em tela cheia
  const app = ler('App.tsx');
  expect(app).toContain('const telaMostrada = telaQueAbre(telaWeb, acessoWeb.visiveis);');
  expect(app).toContain("const assuntoMostrado = chatExpandido ? 'conversas' : assuntoDaTela(telaMostrada);");
  expect(app).toContain('ativo={assuntoMostrado}');
});

test('conversas no cabeçalho, sem botão flutuando por cima do conteúdo', () => {
  // Desde 05/10/2026, Conversas é um item da barra lateral, com as não lidas
  const app = ler('App.tsx');
  expect(app).not.toContain('fixed bottom-6 right-6');
  expect(app).toContain('conversas: totalNaoLidas,');
  expect(app).toContain('contadores={contadoresWeb}');
  expect(ler('componentes/BarraLateralWeb.tsx')).toContain('id={`assunto-${assunto.id}`}');
});

/*
  O CHAT DO COMPUTADOR EM DOIS ESTADOS, como o Microsoft Teams (Elias,
  03/10/2026): expandido em tela cheia — lista à esquerda, conversa no
  resto — e minimizado, a tela de antes com a conversa numa janela no canto.
*/
test('Conversas, no alto, expande o chat em tela cheia, e o mesmo botao minimiza', () => {
  const app = ler('App.tsx');
  // O item Conversas da barra lateral: o mesmo toque abre e fecha
  const escolher = app.slice(app.indexOf('const escolherAssunto'), app.indexOf('const irParaTelaWeb'));
  expect(escolher).toContain('if (chatExpandido) minimizarChat();');
  expect(escolher).toContain('else expandirChat();');
  // Tela cheia: a lista (a antiga gaveta) vira a coluna da esquerda, só no computador
  const tela = app.slice(app.indexOf('id="chat-em-tela-cheia"'), app.indexOf('<ConteudoWeb'));
  expect(tela).toContain('<div className="hidden md:flex h-full flex-shrink-0">');
  expect(tela).toContain('<PainelConversas');
  expect(tela).toContain('aoFechar={minimizarChat}');
  expect(ler('componentes/PainelConversas.tsx')).toContain('id="lista-do-chat"');
  expect(ler('componentes/PainelConversas.tsx')).not.toContain('fixed z-40');
  // Com a lista sempre ao lado, a seta de voltar some no computador
  expect(tela).toContain('voltarSoNoCelular={chatExpandido}');
});

test('minimizar nao fecha: a conversa segue numa janela, que expande de volta', () => {
  const app = ler('App.tsx');
  const minimizar = app.slice(app.indexOf('const minimizarChat = () => {'), app.indexOf('const minimizarChat = () => {') + 300);
  expect(minimizar).toContain('refChatExpandido.current = false;');
  expect(minimizar).toContain('if (aberta) abrirJanela(aberta);');
  // A janela tem o caminho de volta
  expect(app).toContain('aoExpandir={() => expandirChat(janela.id)}');
  expect(ler('componentes/JanelaChat.tsx')).toContain('aria-label="Expandir conversa"');
  // Expandido, nada flutua por cima da tela cheia; e abrir conversa abre nela
  expect(app).toContain('{!chatExpandido && posicoesDasJanelas.map(');
  expect(app).toContain('if (refChatExpandido.current) {\n      abrirConversaEmTelaCheia(id);');
  expect(app).toContain('const INICIO_DAS_JANELAS = 372;');
});

test('no computador as abas não esmaecem nas pontas', () => {
  expect(ler('componentes/AbasRolaveis.tsx')).toContain('md:[mask-image:none]');
});

test('toda tela tem o mesmo título e a mesma largura', () => {
  const app = ler('App.tsx');
  expect(ler('componentes/PainelRede.tsx')).toContain('<TituloDaPagina titulo={tituloDoPainel}');
  expect(ler('componentes/CentralAvisos.tsx')).toContain('<TituloDaPagina');
  // Desde a barra por assunto: o título é o do topo (o assunto), e a largura
  // é uma só para toda tela do computador
  const web = ler('componentes/ConteudoWeb.tsx');
  expect(web).toContain("const titulo = tela === 'perfil' ? 'Meu perfil' : assunto?.rotulo || 'CONECTA';");
  expect(web).toContain('<div key={tela} className="max-w-7xl mx-auto w-full pb-10">');

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
