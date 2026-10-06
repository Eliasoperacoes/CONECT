/**
 * "USAR A DIGITAL PARA DESBLOQUEAR?" — perguntado uma vez por aparelho,
 * depois de entrar no app. A resposta fica no aparelho, e muda em "Eu".
 * Ativar já confirma a digital: quem diz "sim" vê na hora que funciona.
 */
import React, { useState } from 'react';
import { Fingerprint, Loader2 } from 'lucide-react';
import { confirmarIdentidade, gravarPreferencia } from '../servicos/desbloqueio';
import { FolhaInferior } from './FolhaInferior';

export const OfertaDeBiometria: React.FC<{ aberta: boolean; aoResponder: () => void }> = ({ aberta, aoResponder }) => {
  const [ativando, setAtivando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  const ativar = async () => {
    setAtivando(true);
    setAviso(null);
    const ok = await confirmarIdentidade('Ativar o desbloqueio pela digital');
    setAtivando(false);
    if (!ok) return setAviso('A digital não foi confirmada. Tente de novo, ou deixe para depois.');
    gravarPreferencia('ligada');
    aoResponder();
  };

  const depois = () => {
    gravarPreferencia('desligada');
    aoResponder();
  };

  return (
    <FolhaInferior
      aberto={aberta}
      titulo="Desbloquear com a digital"
      aoFechar={depois}
      rodape={
        <div className="flex flex-col gap-2">
          <button
            type="button"
            id="oferta-biometria-ativar"
            onClick={ativar}
            disabled={ativando}
            className="w-full h-12 rounded-2xl bg-[var(--c-marca)] text-[var(--c-sobre-marca)] font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-60"
          >
            {ativando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Fingerprint className="w-4 h-4" />}
            Ativar
          </button>
          <button type="button" id="oferta-biometria-depois" onClick={depois} className="h-11 text-sm font-semibold text-[var(--c-texto-2)]">
            Agora não
          </button>
        </div>
      }
    >
      <div className="p-6 flex flex-col items-center text-center gap-3">
        <span className="w-16 h-16 rounded-2xl bg-[var(--c-acento-suave)] text-[var(--c-marca)] flex items-center justify-center">
          <Fingerprint className="w-9 h-9" strokeWidth={1.5} />
        </span>
        <p className="text-sm leading-relaxed text-[var(--c-texto-2)]">
          Com a digital, o CONECTA abre só para você: se o celular ficar no balcão, ninguém vê as suas conversas, o seu
          ponto e os seus documentos. A senha continua valendo.
        </p>
        <p className="text-xs text-[var(--c-texto-3)]">Dá para mudar quando quiser, em Eu.</p>
        {aviso && <p className="text-xs font-semibold text-[var(--c-atencao)]">{aviso}</p>}
      </div>
    </FolhaInferior>
  );
};
