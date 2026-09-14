import React from 'react';
import { Colaborador, EstadoTransmissaoRadio } from '../tipos';

interface PropsTelaRadioAoVivo {
  estado: EstadoTransmissaoRadio;
  colaboradorAlvo?: Colaborador;
  nomeConversa: string;
  fotoConversa?: string;
  volumeVoz: number; // 0 a 100
  nomeQuemFala?: string;
}

export const TelaRadioAoVivo: React.FC<PropsTelaRadioAoVivo> = ({
  estado,
  colaboradorAlvo,
  nomeConversa,
  fotoConversa,
  volumeVoz,
  nomeQuemFala,
}) => {
  if (estado === 'ocioso') return null;

  const nomeExibicao = nomeQuemFala || colaboradorAlvo?.nome || nomeConversa;
  const fotoExibicao = colaboradorAlvo?.foto || fotoConversa;

  // Uma palavra apenas conforme a especificação: CHAMANDO, FALANDO ou OUVINDO
  let palavraEstado = 'FALANDO';
  if (estado === 'chamando') palavraEstado = 'CHAMANDO';
  if (estado === 'falando') palavraEstado = 'FALANDO';
  if (estado === 'ouvindo') palavraEstado = 'OUVINDO';
  if (estado === 'recado_automatico') palavraEstado = 'GRAVANDO';

  // Barras da onda sonora
  const multiplicadorVolume = Math.max(0.15, volumeVoz / 100);

  return (
    <div
      id="tela-radio-ao-vivo"
      className="fixed inset-0 z-50 bg-[var(--c-canvas)] flex flex-col items-center justify-between p-6 select-none animate-in fade-in duration-150"
    >
      {/* Topo limpo */}
      <div className="w-full pt-8 text-center">
        <span className="text-xs font-semibold text-[var(--c-texto-3)] uppercase tracking-widest">
          RÁDIO CONECTA
        </span>
      </div>

      {/* Centro: Foto grande, Nome, Onda e UMA Palavra */}
      <div className="flex flex-col items-center justify-center w-full max-w-xs text-center my-auto">
        {/* Foto Grande */}
        <div className="relative w-36 h-36 rounded-full overflow-hidden border-4 border-[var(--c-acento)] bg-[var(--c-superficie-2)] shadow-[var(--s-3)] mb-6 flex items-center justify-center">
          {fotoExibicao ? (
            <img
              src={fotoExibicao}
              alt={nomeExibicao}
              className="w-full h-full object-cover"
              referrerPolicy="no-referrer"
            />
          ) : (
            <span className="text-4xl font-bold text-[var(--c-texto-2)]">
              {nomeExibicao.charAt(0)}
            </span>
          )}
          {/* Anel pulsante */}
          <div className="absolute inset-0 rounded-full border-2 border-[var(--c-acento)] animate-ping opacity-30 pointer-events-none" />
        </div>

        {/* Nome */}
        <h2 className="text-2xl font-bold text-[var(--c-texto)] mb-5 truncate w-full px-2">
          {nomeExibicao}
        </h2>

        {/* Onda de voz dinâmica (Web Audio Analyser) */}
        <div className="flex items-center justify-center gap-1.5 h-16 w-full mb-6">
          {[18, 35, 50, 75, 95, 60, 45, 80, 55, 30].map((alturaBase, i) => {
            const alturaReal = Math.min(
              56,
              Math.max(6, Math.round(alturaBase * multiplicadorVolume * (0.6 + Math.sin(i + Date.now() / 200) * 0.4)))
            );
            return (
              <div
                key={i}
                className="w-2 rounded-full bg-[var(--c-acento)] transition-all duration-75"
                style={{ height: `${alturaReal}px` }}
              />
            );
          })}
        </div>

        {/* UMA PALAVRA: CHAMANDO, FALANDO ou OUVINDO */}
        <div className="mt-2">
          <span className="text-xl font-mono font-bold tracking-widest text-[var(--c-acento)] uppercase">
            {palavraEstado}
          </span>
        </div>
      </div>

      {/* Rodapé: instrução sutil do rádio */}
      <div className="w-full pb-8 text-center">
        {estado === 'ouvindo' ? (
          <span className="text-sm text-[var(--c-texto-3)]">
            Voz ao vivo no alto-falante
          </span>
        ) : (
          <span className="text-sm text-[var(--c-texto-3)]">
            Solte para encerrar
          </span>
        )}
      </div>
    </div>
  );
};
