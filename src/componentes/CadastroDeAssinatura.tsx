/**
 * CADASTRAR A ASSINATURA — o termo de adesão e o desenho, uma vez só.
 *
 * Decisão do Elias (02/10/2026): a pessoa desenha a assinatura uma vez e
 * ela é reaproveitada; cada documento é confirmado com a senha. Trocar a
 * assinatura é desenhar de novo aqui — a antiga continua guardada, valendo
 * para o que já assinou.
 *
 * O quadro é branco mesmo no tema escuro: a assinatura é tinta escura
 * sobre papel, como vai sair no comprovante.
 */
import React, { useEffect, useRef, useState } from 'react';
import { Eraser, PenLine } from 'lucide-react';
import { TEXTO_DO_TERMO, cadastrarAssinatura } from '../servicos/assinatura';

/** Folga em volta do traço, no recorte final, em pixels do quadro. */
const FOLGA = 12;

/**
 * O desenho, recortado até o traço, em PNG de fundo transparente. O quadro
 * inteiro teria um vazio enorme em volta, e a assinatura sairia minúscula
 * no comprovante.
 */
const recortarDesenho = (quadro: HTMLCanvasElement): string | null => {
  const ctx = quadro.getContext('2d');
  if (!ctx) return null;
  const { width, height } = quadro;
  const pixels = ctx.getImageData(0, 0, width, height).data;
  let [esq, topo, dir, base] = [width, height, -1, -1];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (pixels[(y * width + x) * 4 + 3] > 0) {
        if (x < esq) esq = x;
        if (x > dir) dir = x;
        if (y < topo) topo = y;
        if (y > base) base = y;
      }
    }
  }
  if (dir < 0) return null;
  esq = Math.max(0, esq - FOLGA);
  topo = Math.max(0, topo - FOLGA);
  dir = Math.min(width - 1, dir + FOLGA);
  base = Math.min(height - 1, base + FOLGA);

  const recorte = document.createElement('canvas');
  recorte.width = dir - esq + 1;
  recorte.height = base - topo + 1;
  recorte.getContext('2d')!.drawImage(quadro, esq, topo, recorte.width, recorte.height, 0, 0, recorte.width, recorte.height);
  return recorte.toDataURL('image/png');
};

export const CadastroDeAssinatura: React.FC<{
  aoSalvar: () => void;
  aoCancelar: () => void;
}> = ({ aoSalvar, aoCancelar }) => {
  const quadro = useRef<HTMLCanvasElement>(null);
  const desenhando = useRef(false);
  const ultimo = useRef<{ x: number; y: number } | null>(null);
  const [temTraco, setTemTraco] = useState(false);
  const [aceito, setAceito] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  // O quadro na resolução da tela: traço fino e nítido no celular
  useEffect(() => {
    const tela = quadro.current;
    if (!tela) return;
    const densidade = Math.min(window.devicePixelRatio || 1, 3);
    const { width, height } = tela.getBoundingClientRect();
    tela.width = Math.round(width * densidade);
    tela.height = Math.round(height * densidade);
    const ctx = tela.getContext('2d')!;
    ctx.scale(densidade, densidade);
    ctx.lineWidth = 2.4;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#111827';
  }, []);

  const ponto = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const comecar = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    desenhando.current = true;
    ultimo.current = ponto(e);
  };

  const mover = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!desenhando.current || !ultimo.current) return;
    const ctx = e.currentTarget.getContext('2d')!;
    const agora = ponto(e);
    ctx.beginPath();
    ctx.moveTo(ultimo.current.x, ultimo.current.y);
    ctx.lineTo(agora.x, agora.y);
    ctx.stroke();
    ultimo.current = agora;
    if (!temTraco) setTemTraco(true);
  };

  const parar = () => {
    desenhando.current = false;
    ultimo.current = null;
  };

  const limpar = () => {
    const tela = quadro.current;
    if (!tela) return;
    tela.getContext('2d')!.clearRect(0, 0, tela.width, tela.height);
    setTemTraco(false);
  };

  const salvar = async () => {
    const imagem = quadro.current ? recortarDesenho(quadro.current) : null;
    if (!imagem) return setErro('Desenhe a sua assinatura no quadro.');
    setSalvando(true);
    setErro(null);
    const res = await cadastrarAssinatura(imagem);
    setSalvando(false);
    if (res.sucesso) aoSalvar();
    else setErro(res.erro || 'A assinatura não foi salva.');
  };

  return (
    <div className="flex flex-col gap-3">
      <div>
        <h3 className="text-sm font-bold text-[var(--c-texto)] flex items-center gap-1.5">
          <PenLine className="w-4 h-4 text-[var(--c-acento)]" />
          Sua assinatura
        </h3>
        <p className="text-xs text-[var(--c-texto-3)]">
          Feita uma vez. Depois, cada documento é confirmado com a sua senha.
        </p>
      </div>

      <div className="max-h-36 overflow-y-auto rounded-xl bg-[var(--c-canvas)] border border-[var(--c-borda)] p-3 flex flex-col gap-1.5">
        <p className="text-[11px] font-bold uppercase tracking-wider text-[var(--c-texto-3)]">Termo de adesão</p>
        {TEXTO_DO_TERMO.map((paragrafo) => (
          <p key={paragrafo} className="text-xs leading-relaxed text-[var(--c-texto-2)]">
            {paragrafo}
          </p>
        ))}
      </div>

      <div className="relative">
        <canvas
          ref={quadro}
          id="quadro-de-assinatura"
          aria-label="Quadro para desenhar a assinatura"
          onPointerDown={comecar}
          onPointerMove={mover}
          onPointerUp={parar}
          onPointerCancel={parar}
          onPointerLeave={parar}
          className="w-full h-40 rounded-xl bg-white border-2 border-dashed border-[var(--c-borda-forte)] cursor-crosshair"
          style={{ touchAction: 'none' }}
        />
        {/* A linha de assinar, como no papel */}
        <div className="pointer-events-none absolute left-6 right-6 bottom-9 border-b border-gray-300" />
        {!temTraco && (
          <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-xs text-gray-400">
            Assine aqui com o dedo
          </span>
        )}
        {temTraco && (
          <button
            type="button"
            onClick={limpar}
            className="absolute top-2 right-2 px-2 py-1 rounded-lg bg-gray-100 text-gray-600 text-[11px] font-semibold flex items-center gap-1"
          >
            <Eraser className="w-3.5 h-3.5" />
            Limpar
          </button>
        )}
      </div>

      <label className="flex items-start gap-2 text-xs text-[var(--c-texto-2)]">
        <input
          type="checkbox"
          id="aceite-do-termo"
          checked={aceito}
          onChange={(e) => setAceito(e.target.checked)}
          className="mt-0.5 w-4 h-4 accent-[var(--c-acento)]"
        />
        Li e aceito o termo de adesão, e reconheço esta assinatura como minha.
      </label>

      {erro && <p className="text-xs font-semibold text-red-600">{erro}</p>}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={aoCancelar}
          disabled={salvando}
          className="flex-1 h-11 rounded-xl border border-[var(--c-borda)] text-sm font-semibold text-[var(--c-texto-2)]"
        >
          Cancelar
        </button>
        <button
          type="button"
          id="salvar-assinatura"
          onClick={salvar}
          disabled={!aceito || !temTraco || salvando}
          className="flex-1 h-11 rounded-xl bg-[var(--c-acento)] text-[var(--c-sobre-acento)] text-sm font-bold disabled:opacity-40"
        >
          {salvando ? 'Salvando…' : 'Salvar assinatura'}
        </button>
      </div>
    </div>
  );
};
