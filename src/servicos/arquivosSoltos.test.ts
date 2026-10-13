/**
 * ARRASTAR ARQUIVO PARA A CONVERSA, NO COMPUTADOR (13/10/2026).
 *
 * Antes, o navegador abria o arquivo solto em outra janela.
 */
import { test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { impedirQueArquivoSoltoAbra, trazArquivos } from './arquivosSoltos';

const arraste = (tipos: string[]) => ({ types: tipos, dropEffect: 'copy' }) as unknown as DataTransfer;

/** Uma janela de mentira que guarda os ouvintes para disparar à mão */
function janelaFalsa() {
  const ouvintes: Record<string, (e: DragEvent) => void> = {};
  return {
    janela: { addEventListener: (tipo: string, f: any) => (ouvintes[tipo] = f) } as any,
    disparar(tipo: string, dados: DataTransfer, jaTratado = false) {
      const evento = { dataTransfer: dados, defaultPrevented: jaTratado, cancelado: false, preventDefault() { this.cancelado = true; } };
      ouvintes[tipo](evento as unknown as DragEvent);
      return evento;
    },
  };
}

test('arraste de arquivo do computador é reconhecido; texto e elementos da página não', () => {
  expect(trazArquivos(arraste(['Files']))).toBe(true);
  expect(trazArquivos(arraste(['text/plain', 'Files']))).toBe(true);
  expect(trazArquivos(arraste(['text/plain']))).toBe(false);
  expect(trazArquivos(arraste(['text/uri-list', 'text/html']))).toBe(false);
  expect(trazArquivos(null)).toBe(false);
});

test('arquivo solto fora da conversa não abre no navegador', () => {
  const { janela, disparar } = janelaFalsa();
  impedirQueArquivoSoltoAbra(janela);

  // Sem o cancelamento, o navegador troca a página pelo arquivo
  expect(disparar('drop', arraste(['Files'])).cancelado).toBe(true);
  const passando = disparar('dragover', arraste(['Files']));
  expect(passando.cancelado).toBe(true);
  expect(passando.dataTransfer.dropEffect).toBe('none');

  // Arrastar texto dentro da página segue com o navegador
  expect(disparar('drop', arraste(['text/plain'])).cancelado).toBe(false);
});

test('quem recebe arquivo continua recebendo: a trava não mexe no arraste já tratado', () => {
  const { janela, disparar } = janelaFalsa();
  impedirQueArquivoSoltoAbra(janela);
  const sobreAConversa = disparar('dragover', arraste(['Files']), true);
  expect(sobreAConversa.dataTransfer.dropEffect).toBe('copy');
});

test('a trava é ligada ao abrir o sistema', () => {
  expect(readFileSync('src/main.tsx', 'utf8')).toContain('impedirQueArquivoSoltoAbra();');
});

test('a conversa recebe o arquivo solto, pelo mesmo caminho do clipe de anexo', () => {
  const tela = readFileSync('src/componentes/TelaConversa.tsx', 'utf8');
  const raiz = tela.slice(tela.indexOf('id="tela-conversa-ativa"'), tela.indexOf('id="tela-conversa-ativa"') + 600);
  expect(raiz).toContain('onDrop={aoSoltarArquivos}');
  expect(raiz).toContain('onDragOver={aoPassarArrastando}');

  const corpoDe = (nome: string) => tela.slice(tela.indexOf(`const ${nome} =`), tela.indexOf('};', tela.indexOf(`const ${nome} =`)));
  // Um caminho só: o clipe e o arraste chamam o mesmo envio
  expect(corpoDe('lidarEnvioArquivo')).toContain('await enviarArquivo(arquivo)');
  expect(tela).toContain('for (const arquivo of arquivos) await enviarArquivo(arquivo);');
  // Sem permissão de publicar na conversa, soltar não envia
  expect(corpoDe('aoSoltarArquivos')).toContain('if (!podePublicar || !trazArquivos(e.dataTransfer)) return;');
});
