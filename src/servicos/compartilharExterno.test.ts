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
 *  3. VAI SÓ A MENSAGEM. Sem hora, sem nome de quem falou, sem
 *     "(imagem)". Do outro lado da conversa está um fornecedor, não a
 *     equipe — carimbo interno ali é ruído.
 *
 *  4. A FOTO DO BALDE VAI JUNTO. Com a nuvem ligada, `imagemUrl` é
 *     endereço assinado e não data URL. Exigir data URL fazia o botão
 *     prometer anexo e mandar só texto.
 */
import { test, expect } from 'bun:test';
import {
  montarTextoDasMensagens,
  encurtarParaLink,
  dataUrlParaArquivo,
  prepararArquivos,
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

// 1 x 1 preto, o menor PNG que dá para montar à mão
const PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

test('VAI SÓ A MENSAGEM — sem hora, sem nome, sem carimbo', () => {
  /**
   * A primeira versão mandava `[15:45] Elias Camila Ferreira: (imagem)`.
   * Do outro lado isso é ruído: o fornecedor quer saber qual peça é, não
   * quem falou dentro da loja.
   */
  const texto = montarTextoDasMensagens([
    msg({ texto: 'preciso do filtro de óleo do Corsa 2012' }),
    msg({ id: 'm2', remetenteId: 'colab-2', horaFormatada: '14:36', texto: 'tenho 4' }),
  ]);

  expect(texto).toBe('preciso do filtro de óleo do Corsa 2012\ntenho 4');
  expect(texto).not.toContain('14:35');
  expect(texto).not.toContain(':');
});

test('MENSAGEM SEM TEXTO NÃO VIRA LINHA NENHUMA', () => {
  /**
   * A foto vai como arquivo. Anunciar "(imagem)" ao lado da imagem é
   * dizer o óbvio, e era o que mais incomodava na primeira versão.
   */
  const texto = montarTextoDasMensagens([
    msg({ tipo: 'imagem', imagemUrl: PNG }),
    msg({ id: 'm2', tipo: 'recado_voz', audioDuracao: 72 }),
    msg({ id: 'm3', tipo: 'arquivo', arquivoNome: 'orcamento.pdf' }),
  ]);

  expect(texto).toBe('');
});

test('a legenda da imagem é mensagem, e vai', () => {
  expect(
    montarTextoDasMensagens([msg({ tipo: 'imagem', imagemUrl: PNG, legenda: 'peça riscada' })])
  ).toBe('peça riscada');
});

test('só as mensagens com texto entram, sem deixar linha em branco no meio', () => {
  const texto = montarTextoDasMensagens([
    msg({ texto: 'segue a foto' }),
    msg({ id: 'm2', tipo: 'imagem', imagemUrl: PNG }),
    msg({ id: 'm3', texto: 'é essa mesmo?' }),
  ]);

  expect(texto).toBe('segue a foto\né essa mesmo?');
  expect(texto).not.toContain('\n\n');
});

test('texto comprido é cortado com aviso, em vez de ir picado', () => {
  const curto = 'a'.repeat(100);
  expect(encurtarParaLink(curto)).toBe(curto);

  const cortado = encurtarParaLink('b'.repeat(5000));
  expect(cortado.length).toBeLessThan(5000);
  expect(cortado).toContain('cortada por tamanho');
});

test('o link sai codificado, senão a quebra de linha mata o endereço', () => {
  const link = montarLinkWhatsApp('filtro & correia\noutra linha');
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

/** Troca o `fetch` por um que devolve uma imagem, e restaura depois. */
const comFetchFalso = async <T,>(
  responder: (url: string) => Response | null,
  corpo: () => Promise<T>
): Promise<T> => {
  const anterior = globalThis.fetch;
  globalThis.fetch = (async (entrada: any) => {
    const resposta = responder(String(entrada));
    if (!resposta) throw new Error('rede caiu');
    return resposta;
  }) as typeof fetch;

  try {
    return await corpo();
  } finally {
    globalThis.fetch = anterior;
  }
};

test('A FOTO DO BALDE VAI JUNTO — foi o que quebrou na primeira versão', async () => {
  /**
   * Com a nuvem ligada, `imagemUrl` é ENDEREÇO ASSINADO, não data URL.
   * A primeira versão exigia `data:` e por isso nenhuma foto de verdade
   * era anexada: o botão prometia anexo e mandava só texto.
   *
   * Este teste falha se alguém voltar a exigir data URL.
   */
  const { arquivos, deixadosParaTras } = await comFetchFalso(
    () => new Response(new Blob([new Uint8Array([1, 2, 3])], { type: 'image/jpeg' })),
    () =>
      prepararArquivos([
        msg({ tipo: 'imagem', imagemUrl: 'https://balde.supabase.co/foto.jpg?token=abc' }),
        msg({ id: 'm2', texto: 'só texto' }),
      ])
  );

  expect(arquivos).toHaveLength(1);
  expect(arquivos[0].type).toBe('image/jpeg');
  expect(deixadosParaTras).toBe(0);
});

test('anexo baixado sem extensão ganha a do tipo, senão chega como desconhecido', async () => {
  const { arquivos } = await comFetchFalso(
    () => new Response(new Blob([new Uint8Array([1])], { type: 'image/png' })),
    () => prepararArquivos([msg({ tipo: 'imagem', imagemUrl: 'https://balde/x?token=a' })])
  );

  expect(arquivos[0].name.endsWith('.png')).toBe(true);
});

test('data URL continua funcionando, sem passar pela rede', async () => {
  const { arquivos, deixadosParaTras } = await comFetchFalso(
    () => {
      throw new Error('não devia buscar na rede');
    },
    () => prepararArquivos([msg({ tipo: 'imagem', imagemUrl: PNG })])
  );

  expect(arquivos).toHaveLength(1);
  expect(deixadosParaTras).toBe(0);
});

test('ANEXO QUE NÃO BAIXOU ENTRA NA CONTA DOS QUE FICARAM', async () => {
  /**
   * Rede caiu, endereço venceu. A tela precisa do número para avisar —
   * contado como enviado, ela afirma que a foto foi junto e ela não foi.
   */
  const { arquivos, deixadosParaTras } = await comFetchFalso(
    () => null,
    () =>
      prepararArquivos([
        msg({ tipo: 'imagem', imagemUrl: 'https://balde/venceu.jpg' }),
        msg({ id: 'm2', texto: 'só texto' }),
      ])
  );

  expect(arquivos).toHaveLength(0);
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

test('a imagem oferecida para colar é uma imagem, não o PDF do orçamento', () => {
  const pdf = new File([new Uint8Array([1])], 'orcamento.pdf', { type: 'application/pdf' });
  const foto = new File([new Uint8Array([2])], 'peca.png', { type: 'image/png' });

  expect(primeiraImagem([pdf, foto])).toBe(foto);
  expect(primeiraImagem([pdf])).toBeUndefined();
});

test('seleção sem texto e sem anexo não é dada como enviada', async () => {
  const anterior = globalThis.navigator;
  Object.defineProperty(globalThis, 'navigator', {
    value: { share: async () => {}, canShare: () => true },
    configurable: true,
  });

  try {
    const res = await compartilharNoWhatsApp({ texto: '   ' });
    expect(res.via).toBe('nenhum');
    expect(res.erro).toBeTruthy();
  } finally {
    Object.defineProperty(globalThis, 'navigator', { value: anterior, configurable: true });
  }
});

test('SÓ FOTO, SEM TEXTO: a bandeja não recebe legenda em branco', async () => {
  /**
   * `share({ text: '' })` faz alguns aparelhos abrirem com um espaço já
   * digitado na legenda, e o iPhone chega a recusar o envio inteiro.
   */
  const anterior = globalThis.navigator;
  let carga: any = null;

  Object.defineProperty(globalThis, 'navigator', {
    value: {
      share: async (d: any) => {
        carga = d;
      },
      canShare: () => true,
    },
    configurable: true,
  });

  try {
    const foto = dataUrlParaArquivo(PNG, 'peca.png')!;
    const res = await compartilharNoWhatsApp({ texto: '', arquivos: [foto] });

    expect('text' in carga).toBe(false);
    expect(carga.files).toHaveLength(1);
    expect(res.via).toBe('bandeja');
    expect(res.arquivosEnviados).toBe(1);
  } finally {
    Object.defineProperty(globalThis, 'navigator', { value: anterior, configurable: true });
  }
});

test('link sem texto abre o WhatsApp mesmo assim, sem parâmetro vazio', () => {
  expect(montarLinkWhatsApp('')).toBe('https://wa.me/');
  expect(montarLinkWhatsApp('   ')).toBe('https://wa.me/');
  expect(montarLinkWhatsApp('filtro')).toBe('https://wa.me/?text=filtro');
});
