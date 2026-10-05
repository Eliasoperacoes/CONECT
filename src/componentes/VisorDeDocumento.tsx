/**
 * O VISOR DE DOCUMENTO — o espelho, a escala, as férias, no celular.
 *
 * Uma tela inteira por cima do sistema, com Voltar no alto (e o voltar do
 * Android fecha pela mesma pilha de todo modal). O documento é a folha A4
 * que o papel imprime, com largura de computador: aqui ela abre AJUSTADA à
 * largura do celular, e um toque passa para o tamanho real, rolando para
 * os lados — a tabela do espelho tem nove colunas e não há como ler cada
 * número reduzido.
 *
 * Quem decide se um documento vem para cá é `mostrarDocumento`
 * (visorDeDocumento.ts). Montado uma vez em App.
 */
import React, { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { ArrowLeft, Maximize2, Minimize2, Printer } from 'lucide-react';
import { useVoltar } from '../servicos/voltar';
import { assinarVisor, documentoNoVisor, fecharVisor } from '../servicos/visorDeDocumento';
import { rodandoNoAplicativo } from '../servicos/aplicativo';
import { VisorDePdf } from './VisorDePdf';

/** A folha A4 em pé, em pixels de tela: abaixo disto o documento não encolhe. */
const LARGURA_MINIMA_DA_FOLHA = 794;

export const VisorDeDocumento: React.FC = () => {
  const documento = useSyncExternalStore(assinarVisor, documentoNoVisor);
  useVoltar(!!documento, fecharVisor);

  const area = useRef<HTMLDivElement>(null);
  const quadro = useRef<HTMLIFrameElement>(null);
  const [folha, setFolha] = useState({ largura: LARGURA_MINIMA_DA_FOLHA, altura: 1123 });
  const [larguraDaTela, setLarguraDaTela] = useState(360);
  const [tamanhoReal, setTamanhoReal] = useState(false);

  // Cada documento novo começa ajustado à tela
  useEffect(() => setTamanhoReal(false), [documento]);

  useEffect(() => {
    if (!documento || !area.current) return;
    const medir = () => setLarguraDaTela(area.current?.clientWidth || 360);
    medir();
    const observador = new ResizeObserver(medir);
    observador.observe(area.current);
    return () => observador.disconnect();
  }, [documento]);

  if (!documento) return null;
  if ('pdf' in documento) {
    return (
      <VisorDePdf
        url={documento.pdf}
        titulo={documento.titulo}
        arquivoNome={documento.arquivoNome}
        rodape={documento.rodape}
      />
    );
  }

  /** O tamanho da folha só se sabe depois de ela desenhar o conteúdo. */
  const aoCarregar = () => {
    const doc = quadro.current?.contentDocument?.documentElement;
    if (!doc) return;
    setFolha({
      largura: Math.max(LARGURA_MINIMA_DA_FOLHA, doc.scrollWidth),
      altura: doc.scrollHeight,
    });
  };

  const escala = tamanhoReal ? 1 : Math.min(1, (larguraDaTela - 16) / folha.largura);
  // A impressão (e o "Salvar como PDF" dela) existe no navegador; dentro do
  // aplicativo Android não há diálogo de impressão
  const podeImprimir = !rodandoNoAplicativo();

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={documento.titulo}
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
        <h2 className="flex-1 min-w-0 text-sm font-bold text-[var(--c-texto)] truncate">{documento.titulo}</h2>
        <button
          type="button"
          id="visor-tamanho"
          onClick={() => setTamanhoReal((r) => !r)}
          aria-label={tamanhoReal ? 'Ajustar à tela' : 'Tamanho real'}
          title={tamanhoReal ? 'Ajustar à tela' : 'Tamanho real'}
          className="w-11 h-11 rounded-full flex items-center justify-center text-[var(--c-texto-2)] active:bg-[var(--c-superficie-2)]"
        >
          {tamanhoReal ? <Minimize2 className="w-5 h-5" /> : <Maximize2 className="w-5 h-5" />}
        </button>
        {podeImprimir && (
          <button
            type="button"
            id="visor-imprimir"
            onClick={() => quadro.current?.contentWindow?.print()}
            className="h-9 px-3 rounded-xl bg-[var(--c-acento)] text-[var(--c-sobre-acento)] text-xs font-bold flex items-center gap-1.5"
          >
            <Printer className="w-4 h-4" />
            Imprimir / PDF
          </button>
        )}
      </header>

      <div ref={area} className="flex-1 overflow-auto overscroll-contain p-2">
        {/* A caixa tem o tamanho da folha JÁ reduzida: sem isto a rolagem
            seguiria a folha cheia, e sobraria um vazio enorme embaixo */}
        <div
          style={{ width: folha.largura * escala, height: folha.altura * escala }}
          className="mx-auto bg-white shadow-[var(--s-2)] rounded-sm overflow-hidden"
        >
          <iframe
            ref={quadro}
            title={documento.titulo}
            srcDoc={documento.html}
            onLoad={aoCarregar}
            style={{
              width: folha.largura,
              height: folha.altura,
              transform: `scale(${escala})`,
              transformOrigin: 'top left',
              border: 0,
              display: 'block',
            }}
          />
        </div>
      </div>

      {documento.rodape && <div className="flex-shrink-0">{documento.rodape}</div>}
    </div>
  );
};
