/**
 * Compartilhar para fora — CONECTA
 *
 * O que estes testes protegem, em ordem de dano:
 *
 *  1. CANCELAR NÃO É ENVIAR. Fechar a bandeja sem escolher contato tem
 *     que chegar como cancelado. Se virar sucesso, a Auditoria passa a
 *     registrar envio que não houve — e auditoria que mente é pior do
 *     que auditoria nenhuma.
 *
 *  2. ANEXO QUE FICOU PARA TRÁS PRECISA SER CONTADO. O link do WhatsApp
 *     Web não leva arquivo. Se a conta der zero por engano, a tela diz
 *     que foi tudo, e a pessoa só descobre quando o fornecedor responde
 *     "que peça?".
 *
 *  3. O TEXTO LEVA QUEM E QUANDO. Sem isso o destinatário recebe frases
 *     soltas, que é o contrário do motivo de a conversa estar saindo.
 */
import { test, expect } from 'bun:test';
import {
  montarTextoDasMensagens,
  encurtarParaLink,
  dataUrlParaArquivo,
  arquivosDasMensagens,
  montarLinkWhatsApp,
  compartilharNoWhatsApp,
  primeiraImagem,
} from './compartilharExterno';
import { Mensagem } from '../tipos';

const msg = (partes: Partial<Mensagem>): Mensagem => ({
  id: 'm1',
  conversaId: 'c1',
  remetenteId: 'colab-1',
  tipo: 'texto',
  criadoEm: '2026-09-18T14:35:00.000Z',
  horaFormatada: '14:35',
  lida: true,
  ...partes,
});

const nomes = (id: string) => (id === 'colab-1' ? 'Elias' : 'Leigislaine');

// 1 x 1 preto, o menor PNG que dá para montar à mão
const PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

test('o texto leva quem falou e a que horas', () => {
  const texto = montarTextoDasMensagens(
    [
      msg({ texto: 'preciso do filtro de óleo do Corsa 2012' }),
      msg({ id: 'm2', remetenteId: 'colab-2', horaFormatada: '14:36', texto: 'tenho 4' }),
    ],
    nomes
  );

  expect(texto).toBe(
    '[14:35] Elias: preciso do filtro de óleo do Corsa 2012\n[14:36] Leigislaine: tenho 4'
  );
});

test('mensagem sem texto vira descrição, e não linha vazia', () => {
  const texto = montarTextoDasMensagens(
    [
      msg({ tipo: 'imagem', imagemUrl: PNG }),
      msg({ id: 'm2', tipo: 'recado_voz', audioDuracao: 72 }),
      msg({ id: 'm3', tipo: 'arquivo', arquivoNome: 'orcamento.pdf' }),
    ],
    nomes
  );

  expect(texto).toContain('(imagem)');
  expect(texto).toContain('(áudio 1:12)');
  expect(texto).toContain('(arquivo: orcamento.pdf)');
  // Nenhuma linha termina no dois-pontos, que é como sairia se ficasse vazia
  expect(texto.split('\n').some((l) => l.trim().endsWith(':'))).toBe(false);
});

test('a legenda da imagem vai junto', () => {
  const texto = montarTextoDasMensagens(
    [msg({ tipo: 'imagem', imagemUrl: PNG, legenda: 'peça riscada' })],
    nomes
  );
  expect(texto).toContain('peça riscada');
});

test('texto comprido é cortado com aviso, em vez de ir picado', () => {
  const curto = 'a'.repeat(100);
  expect(encurtarParaLink(curto)).toBe(curto);

  const cortado = encurtarParaLink('b'.repeat(5000));
  expect(cortado.length).toBeLessThan(5000);
  expect(cortado).toContain('cortada por tamanho');
});

test('o link sai codificado, senão a quebra de linha mata o endereço', () => {
  const link = montarLinkWhatsApp('[14:35] Elias: filtro & correia\noutra linha');
  expect(link.startsWith('https://wa.me/?text=')).toBe(true);
  expect(link).not.toContain('\n');
  expect(link).not.toContain(' ');
  // "&" solto viraria começo de outro parâmetro e cortaria o texto ali
  expect(link).toContain('%26');
});

test('data URL vira arquivo sem esperar nada', () => {
  const arquivo = dataUrlParaArquivo(PNG, 'peca.png');
  expect(arquivo).not.toBeNull();
  expect(arquivo!.type).toBe('image/png');
  expect(arquivo!.name).toBe('peca.png');
  expect(arquivo!.size).toBeGreaterThan(0);
});

test('conteúdo estragado devolve nulo, sem derrubar o resto', () => {
  expect(dataUrlParaArquivo('https://exemplo.com/foto.png', 'x.png')).toBeNull();
  expect(dataUrlParaArquivo('data:image/png,semBase64', 'x.png')).toBeNull();
  expect(dataUrlParaArquivo('', 'x.png')).toBeNull();
});

test('ANEXO QUE SÓ EXISTE NO BALDE ENTRA NA CONTA DOS QUE FICARAM', () => {
  /**
   * É o caso que engana: a mensagem É de imagem, tem `anexoCaminho`, e
   * parece completa. Só que o conteúdo está no balde, e buscá-lo exigiria
   * esperar — o que mataria a bandeja no iPhone.
   *
   * Ele tem que aparecer como deixado para trás. Contado como enviado, a
   * tela afirma que a foto foi junto e ela não foi.
   */
  const { arquivos, deixadosParaTras } = arquivosDasMensagens([
    msg({ tipo: 'imagem', imagemUrl: PNG }),
    msg({ id: 'm2', tipo: 'imagem', anexoCaminho: 'anexos/2026/foto.jpg' }),
    msg({ id: 'm3', texto: 'só texto' }),
  ]);

  expect(arquivos).toHaveLength(1);
  expect(deixadosParaTras).toBe(1);
});

test('CANCELAR A BANDEJA NÃO PODE VIRAR ENVIO', async () => {
  const anterior = globalThis.navigator;
  Object.defineProperty(globalThis, 'navigator', {
    value: {
      share: async () => {
        throw new DOMException('cancelado pelo usuário', 'AbortError');
      },
      canShare: () => true,
    },
    configurable: true,
  });

  try {
    const res = await compartilharNoWhatsApp({ texto: 'oi' });
    expect(res.cancelado).toBe(true);
    expect(res.via).toBe('nenhum');
    expect(res.arquivosEnviados).toBe(0);
  } finally {
    Object.defineProperty(globalThis, 'navigator', {
      value: anterior,
      configurable: true,
    });
  }
});

test('a bandeja aceitando arquivo conta os arquivos enviados', async () => {
  const anterior = globalThis.navigator;
  let recebeuArquivos = 0;

  Object.defineProperty(globalThis, 'navigator', {
    value: {
      share: async (dados: { files?: File[] }) => {
        recebeuArquivos = dados.files?.length ?? 0;
      },
      canShare: () => true,
    },
    configurable: true,
  });

  try {
    const arquivo = dataUrlParaArquivo(PNG, 'peca.png')!;
    const res = await compartilharNoWhatsApp({ texto: 'oi', arquivos: [arquivo] });

    expect(recebeuArquivos).toBe(1);
    expect(res.via).toBe('bandeja');
    expect(res.arquivosEnviados).toBe(1);
    expect(res.arquivosDeixadosParaTras).toBe(0);
  } finally {
    Object.defineProperty(globalThis, 'navigator', {
      value: anterior,
      configurable: true,
    });
  }
});

test('BANDEJA QUE RECUSA O ARQUIVO MANDA O TEXTO E ADMITE O QUE FICOU', async () => {
  /**
   * Alguns aparelhos recusam certos tipos. Chamar `share` assim mesmo
   * falha inteiro e some com o texto também — por isso, recusado o
   * arquivo, vai só o texto. E o arquivo tem que ser CONTADO como
   * deixado para trás.
   */
  const anterior = globalThis.navigator;
  let recebeuArquivos: number | undefined;

  Object.defineProperty(globalThis, 'navigator', {
    value: {
      share: async (dados: { files?: File[] }) => {
        recebeuArquivos = dados.files?.length;
      },
      canShare: () => false,
    },
    configurable: true,
  });

  try {
    const arquivo = dataUrlParaArquivo(PNG, 'peca.png')!;
    const res = await compartilharNoWhatsApp({ texto: 'oi', arquivos: [arquivo] });

    expect(recebeuArquivos).toBeUndefined();
    expect(res.via).toBe('bandeja');
    expect(res.arquivosEnviados).toBe(0);
    expect(res.arquivosDeixadosParaTras).toBe(1);
  } finally {
    Object.defineProperty(globalThis, 'navigator', {
      value: anterior,
      configurable: true,
    });
  }
});

test('SEM BANDEJA, O LINK VAI E NENHUM ANEXO SEGUE', async () => {
  const antesNav = globalThis.navigator;
  const antesWin = (globalThis as any).window;
  let aberto = '';

  Object.defineProperty(globalThis, 'navigator', { value: {}, configurable: true });
  (globalThis as any).window = {
    open: (url: string) => {
      aberto = url;
      return {};
    },
  };

  try {
    const arquivo = dataUrlParaArquivo(PNG, 'peca.png')!;
    const res = await compartilharNoWhatsApp({ texto: 'filtro', arquivos: [arquivo] });

    expect(res.via).toBe('link');
    expect(aberto).toContain('https://wa.me/?text=');
    expect(res.arquivosEnviados).toBe(0);
    // O anexo NÃO foi. A tela depende deste número para avisar.
    expect(res.arquivosDeixadosParaTras).toBe(1);
  } finally {
    Object.defineProperty(globalThis, 'navigator', { value: antesNav, configurable: true });
    (globalThis as any).window = antesWin;
  }
});

test('janela bloqueada não é dada como enviada', async () => {
  const antesNav = globalThis.navigator;
  const antesWin = (globalThis as any).window;

  Object.defineProperty(globalThis, 'navigator', { value: {}, configurable: true });
  (globalThis as any).window = { open: () => null };

  try {
    const res = await compartilharNoWhatsApp({ texto: 'oi' });
    expect(res.via).toBe('nenhum');
    expect(res.erro).toBeTruthy();
  } finally {
    Object.defineProperty(globalThis, 'navigator', { value: antesNav, configurable: true });
    (globalThis as any).window = antesWin;
  }
});

test('a imagem oferecida para colar é uma que existe no aparelho', () => {
  expect(
    primeiraImagem([
      msg({ tipo: 'texto', texto: 'oi' }),
      msg({ id: 'm2', tipo: 'imagem', anexoCaminho: 'anexos/foto.jpg' }),
      msg({ id: 'm3', tipo: 'imagem', imagemUrl: PNG }),
    ])
  ).toBe(PNG);

  // Só as que moram no balde: não há o que copiar
  expect(primeiraImagem([msg({ tipo: 'imagem', anexoCaminho: 'anexos/foto.jpg' })])).toBeUndefined();
});
