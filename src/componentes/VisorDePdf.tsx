/**
 * O VISOR DE PDF — o holerite aberto dentro do sistema.
 *
 * Cada página é desenhada numa tela (canvas) pelo mesmo leitor que a carga
 * de holerites usa. Não depende do leitor de PDF do aparelho: a WebView do
 * aplicativo Android não tem um, e mandava o arquivo para o navegador,
 * baixando. Aqui ninguém baixa nada para ver.
 *
 * Abre ajustado à largura da tela; o botão de tamanho amplia, rolando para
 * os lados, para ler número por número no celular. Fora do aplicativo há
 * também "Baixar", para quem quer guardar ou imprimir.
 *
 * Quem decide que um PDF vem para cá é `mostrarPdf` (visorDeDocumento.ts).
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Download, Maximize2, Minimize2 } from 'lucide-react';
import { fecharVisor } from '../servicos/visorDeDocumento';
import { rodandoNoAplicativo } from '../servicos/aplicativo';
import { carregarLeitorDePdf } from '../servicos/leitorDePdf';

/** A largura do "tamanho real" no celular: a folha A4 em pixels de tela, com folga. */
const LARGURA_AMPLIADA = 1000;
/** No computador, a folha não precisa passar disto para ler bem. */
const LARGURA_MAXIMA_AJUSTADA = 900;

const PaginasDoPdf: React.FC<{ dados: ArrayBuffer; largura: number; aoFalhar: () => void }> = ({
  dados,
  largura,
  aoFalhar,
}) => {
  const caixa = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelado = false;
    let tarefa: { destroy: () => Promise<void> } | null = null;

    (async () => {
      try {
        const pdfjs = await carregarLeitorDePdf();
        // Cópia: o leitor transfere o buffer ao trabalhador e o deixa vazio
        const carregando = pdfjs.getDocument({ data: new Uint8Array(dados.slice(0)) });
        tarefa = carregando;
        const documento = await carregando.promise;
        // Nítido em tela de celular, sem passar de 3x (memória do aparelho)
        const densidade = Math.min(window.devicePixelRatio || 1, 3);

        const telas: HTMLCanvasElement[] = [];
        for (let n = 1; n <= documento.numPages; n++) {
          const pagina = await documento.getPage(n);
          const escala = largura / pagina.getViewport({ scale: 1 }).width;
          const vista = pagina.getViewport({ scale: escala * densidade });
          const tela = document.createElement('canvas');
          tela.width = Math.floor(vista.width);
          tela.height = Math.floor(vista.height);
          tela.style.width = `${largura}px`;
          tela.style.height = `${vista.height / densidade}px`;
          tela.className = 'block mx-auto bg-white shadow-[var(--s-2)] rounded-sm';
          await pagina.render({ canvasContext: tela.getContext('2d')!, viewport: vista, canvas: tela }).promise;
          if (cancelado) return;
          telas.push(tela);
        }
        caixa.current?.replaceChildren(...telas);
      } catch (erro) {
        if (cancelado) return;
        console.error('Falha ao desenhar o PDF:', erro);
        aoFalhar();
      }
    })();

    return () => {
      cancelado = true;
      void tarefa?.destroy();
    };
  }, [dados, largura, aoFalhar]);

  return <div ref={caixa} className="flex flex-col gap-3" />;
};

export const VisorDePdf: React.FC<{ url: string; titulo: string; arquivoNome: string }> = ({
  url,
  titulo,
  arquivoNome,
}) => {
  const area = useRef<HTMLDivElement>(null);
  const [dados, setDados] = useState<ArrayBuffer | null>(null);
  const [falhou, setFalhou] = useState(false);
  const [larguraDaTela, setLarguraDaTela] = useState(360);
  const [ampliado, setAmpliado] = useState(false);

  useEffect(() => {
    let cancelado = false;
    setDados(null);
    setFalhou(false);
    setAmpliado(false);
    fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.arrayBuffer();
      })
      .then((d) => !cancelado && setDados(d))
      .catch((erro) => {
        console.error('Falha ao baixar o PDF para o visor:', erro);
        if (!cancelado) setFalhou(true);
      });
    return () => {
      cancelado = true;
    };
  }, [url]);

  useEffect(() => {
    if (!area.current) return;
    const medir = () => setLarguraDaTela(area.current?.clientWidth || 360);
    medir();
    const observador = new ResizeObserver(medir);
    observador.observe(area.current);
    return () => observador.disconnect();
  }, []);

  // Redesenhar a cada pixel de redimensionamento seria pesado: passos de 40
  const ajustada = Math.min(LARGURA_MAXIMA_AJUSTADA, Math.floor((larguraDaTela - 16) / 40) * 40 || 320);
  const largura = ampliado ? Math.max(ajustada, LARGURA_AMPLIADA) : ajustada;

  // O arquivo já está aqui: baixar não pede de novo ao banco
  const enderecoParaBaixar = useMemo(
    () => (dados ? URL.createObjectURL(new Blob([dados], { type: 'application/pdf' })) : null),
    [dados]
  );
  useEffect(() => () => {
    if (enderecoParaBaixar) URL.revokeObjectURL(enderecoParaBaixar);
  }, [enderecoParaBaixar]);

  const aoFalhar = useMemo(() => () => setFalhou(true), []);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={titulo}
      id="visor-de-documento"
      className="fixed inset-0 z-[90] flex flex-col bg-[var(--c-canvas)]"
    >
      <header className="flex items-center gap-1 px-2 pb-2 pt-[max(8px,env(safe-area-inset-top))] bg-[var(--c-superficie)] border-b border-[var(--c-borda)] flex-shrink-0">
        <button
          type="button"
          id="visor-voltar"
          onClick={fecharVisor}
          aria-label="Voltar"
          className="w-11 h-11 rounded-full flex items-center justify-center text-[var(--c-texto)] active:bg-[var(--c-superficie-2)]"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h2 className="flex-1 min-w-0 text-sm font-bold text-[var(--c-texto)] truncate">{titulo}</h2>
        {ajustada < LARGURA_AMPLIADA && (
          <button
            type="button"
            id="visor-tamanho"
            onClick={() => setAmpliado((a) => !a)}
            aria-label={ampliado ? 'Ajustar à tela' : 'Ampliar'}
            title={ampliado ? 'Ajustar à tela' : 'Ampliar'}
            className="w-11 h-11 rounded-full flex items-center justify-center text-[var(--c-texto-2)] active:bg-[var(--c-superficie-2)]"
          >
            {ampliado ? <Minimize2 className="w-5 h-5" /> : <Maximize2 className="w-5 h-5" />}
          </button>
        )}
        {/* No aplicativo Android o download não funciona dentro da WebView */}
        {!rodandoNoAplicativo() && enderecoParaBaixar && (
          <a
            id="visor-baixar"
            href={enderecoParaBaixar}
            download={arquivoNome}
            className="h-9 px-3 rounded-xl bg-[var(--c-acento)] text-[var(--c-sobre-acento)] text-xs font-bold flex items-center gap-1.5"
          >
            <Download className="w-4 h-4" />
            Baixar
          </a>
        )}
      </header>

      <div ref={area} className="flex-1 overflow-auto overscroll-contain p-2">
        {falhou ? (
          <p className="p-6 text-center text-sm text-[var(--c-texto-2)]">
            Não foi possível abrir o documento. Volte e tente de novo em instantes.
          </p>
        ) : !dados ? (
          <p className="p-6 text-center text-sm text-[var(--c-texto-3)]">Carregando…</p>
        ) : (
          <div style={{ width: largura }} className="mx-auto">
            <PaginasDoPdf dados={dados} largura={largura} aoFalhar={aoFalhar} />
          </div>
        )}
      </div>
    </div>
  );
};
