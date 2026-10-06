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
  // A mesma largura e a mesma margem para toda tela, com o fim reservado ao balão
  expect(web).toContain('<div key={tela} className="max-w-7xl mx-auto w-full px-2 pb-28">');
  expect(web).toContain('<ContextoTelaEmbutida.Provider value={true}>');

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

test('O CHAT NO BALÃO DO CANTO, e não na barra lateral (Elias, 05/10/2026)', () => {
  const app = ler('App.tsx');
  expect(app).toContain("assuntos={acessoWeb.assuntos.filter((a) => a.id !== 'conversas')}");
  expect(app).toContain('<BalaoDeConversas naoLidas={totalNaoLidas} aoAbrir={() => expandirChat()} />');
  const balao = ler('componentes/BalaoDeConversas.tsx');
  expect(balao).toContain('fixed bottom-6 right-6');
  // Só no computador: no celular as conversas são a barra de baixo
  expect(balao).toContain('hidden md:flex');
});

test('TELA EMBUTIDA: o título próprio some, a ação fica, e a margem é a padrão', () => {
  // Cada tela que tinha título próprio esconde só o título quando embutida
  for (const tela of ['AbaHolerites', 'AbaAdvertencias', 'EscalaDeFolgas', 'AbaFerias', 'AbaAtestados', 'AbaAssinaturas', 'PainelGestao']) {
    const fonte = ler(`componentes/${tela}.tsx`);
    expect({ tela, usa: fonte.includes('useTelaEmbutida()') }).toEqual({ tela, usa: true });
    expect({ tela, margem: fonte.includes('margemDaTela(embutida') }).toEqual({ tela, margem: true });
  }
  /*
    AS AÇÕES CONTINUAM, no título da tela (o desenho do Figma): Registrar
    (advertência), Imprimir (escala, férias) e Assinar todos não moram no
    título escondido — vão para a vaga do cabeçalho, que o ConteudoWeb dá.
  */
  const acaoNoCabecalho = (tela: string, trecho: string) => {
    const fonte = ler(`componentes/${tela}.tsx`);
    const vaga = fonte.slice(fonte.indexOf('<AcaoNoCabecalho>'), fonte.indexOf('</AcaoNoCabecalho>'));
    expect({ tela, trecho, naVaga: vaga.includes(trecho) }).toEqual({ tela, trecho, naVaga: true });
  };
  acaoNoCabecalho('AbaAdvertencias', 'id="botao-nova-advertencia"');
  acaoNoCabecalho('EscalaDeFolgas', 'onClick={imprimir}');
  acaoNoCabecalho('AbaFerias', 'onClick={() => imprimir(null)}');
  acaoNoCabecalho('AbaAssinaturas', 'id="assinar-lote"');
  acaoNoCabecalho('AbaHolerites', 'id="rh-competencia"');
  // ...e a vaga existe: o cabeçalho a entrega a toda tela, menos o Início
  expect(ler('componentes/ConteudoWeb.tsx')).toContain("<ContextoAcaoDaTela.Provider value={tela === 'inicio' ? null : vagaDaAcao}>");
});

test('O QUE O SELO DE DOCUMENTOS CONTA ESTÁ EM "MEUS DOCUMENTOS" (Elias, 06/10/2026)', () => {
  /*
    Testando com uma colaboradora: o selo de Documentos acusava o espelho para
    assinar, e o espelho morava em Ponto. O selo é `pendenciasDoMeuRH`, que
    soma holerite, advertência sem ciência e espelho — os três têm de estar
    na tela para onde ele leva.
  */
  const meuRH = ler('servicos/meuRH.ts');
  expect(meuRH).toContain('total: holeritesParaAssinar.length + semCiencia.length + espelhos.length');
  const conteudo = ler('componentes/ConteudoWeb.tsx');
  const caso = conteudo.slice(conteudo.indexOf("case 'meus_documentos':"), conteudo.indexOf("case 'assinaturas':"));
  for (const cartao of ["'espelho'", "'holerites'", "'advertencias'"]) {
    expect({ cartao, emMeusDocumentos: caso.includes(cartao) }).toEqual({ cartao, emMeusDocumentos: true });
  }
  // E o espelho não tem uma segunda porta em Ponto
  expect(ler('servicos/telasPorAssunto.ts')).not.toContain("'meu_espelho'");
});

test('O ENDEREÇO ACOMPANHA A TELA NO COMPUTADOR, e o celular fica de fora (Elias, 06/10/2026)', () => {
  const app = ler('App.tsx');
  // O endereço escrito é o da tela que aparece de fato, depois da regra de acesso
  expect(app).toContain('const caminho = caminhoDaTela(telaQueAbre(telaWeb, acessoWeb.visiveis));');
  // Só a troca da pessoa entra no histórico; a do sistema só corrige o endereço
  expect(app).toContain('if (daPessoa) window.history.pushState(null');
  expect(app).toContain("else window.history.replaceState(window.history.state, '', novo);");
  // O voltar do navegador troca a tela
  expect(app).toContain("window.addEventListener('popstate', aoNavegar);");
  // No celular nada disso roda: lá o voltar é a pilha do Android (voltar.ts)
  expect(app).toContain('if (!autenticado || ehTelaDeCelular()) return;');
  // A raiz não pede tela: abre onde a pessoa parou, como sempre
  expect(app).toContain("return doEndereco && doEndereco !== 'inicio'");
  // Os caminhos da pessoa passam por navegarNaWeb — nenhum troca a tela por fora dele
  for (const caminho of ['irParaTelaWeb', 'escolherAssunto', 'irParaNotificacao']) {
    const corpo = app.slice(app.indexOf(`const ${caminho} = `), app.indexOf(`const ${caminho} = `) + 1200);
    expect({ caminho, usa: corpo.includes('navegarNaWeb(') }).toEqual({ caminho, usa: true });
  }
});
