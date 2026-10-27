/**
 * A BARRA DE ASSINAR — no pé do visor, com o documento à frente.
 *
 * Uma só para todo documento que o colaborador assina: o holerite e o
 * espelho de ponto (05/10/2026). Muda o texto e o que "assinar" grava; a
 * ordem é a do papel: a pessoa vê o documento, e só então assina. A
 * assinatura e a senha ficam na `FolhaDeAssinar`, a mesma do RH.
 *
 * Assinado, a barra só mostra quando — e não oferece desfazer: a
 * assinatura é registro, não preferência.
 */
import React, { useEffect, useState } from 'react';
import { CheckCircle2, PenLine } from 'lucide-react';
import { dataHoraDeBrasilia } from '../servicos/comprovanteDeHolerite';
import { FolhaDeAssinar } from './FolhaDeAssinar';
import { registrarErro } from '../servicos/registroDeErros';

export interface TextosDaAssinatura {
  /** Ao lado do botão: "Confira o holerite e assine o recebimento." */
  convite: string;
  /** O título da folha de senha. */
  titulo: string;
  /** O que a pessoa declara ao assinar. */
  declaracao: string;
  /** Depois de assinado: "Recebimento assinado". */
  feito: string;
}

export const BarraDeAssinatura: React.FC<{
  textos: TextosDaAssinatura;
  /** Já assinado? Devolve quando, ou null. */
  carregar: () => Promise<string | null>;
  assinar: (senha: string) => Promise<{ sucesso: boolean; erro?: string }>;
  /** Muda quando o documento muda: a barra recarrega. */
  chave: string;
  aoAssinar?: () => void;
}> = ({ textos, carregar, assinar, chave, aoAssinar }) => {
  // undefined: carregando; null: falta assinar; texto: quando assinou
  const [assinadoEm, setAssinadoEm] = useState<string | null | undefined>(undefined);
  const [folhaAberta, setFolhaAberta] = useState(false);
  /*
    A CONFERÊNCIA FALHOU (22/10/2026). Sem isto a barra ficava escondida para
    sempre, calada — o Accacio via o holerite e nenhum "Assinar". Agora ela
    diz que não conseguiu, oferece tentar de novo, e o erro chega ao TI.
  */
  const [falhou, setFalhou] = useState(false);
  const [tentativa, setTentativa] = useState(0);

  useEffect(() => {
    let cancelado = false;
    setAssinadoEm(undefined);
    setFalhou(false);
    carregar()
      .then((quando) => !cancelado && setAssinadoEm(quando))
      .catch((erro) => {
        if (cancelado) return;
        registrarErro({
          tela: 'barra de assinar',
          mensagem: `Não conferiu a assinatura: ${erro instanceof Error ? erro.message : String(erro)}`,
          pilha: erro instanceof Error ? erro.stack : undefined,
        });
        setFalhou(true);
      });
    return () => {
      cancelado = true;
    };
  }, [chave, tentativa]);

  if (falhou) {
    return (
      <div className="flex items-center gap-3 px-4 py-3 bg-[var(--c-superficie)] border-t border-[var(--c-borda)] pb-[max(12px,env(safe-area-inset-bottom))]">
        <p className="flex-1 text-xs text-[var(--c-texto-2)] leading-snug">
          Não foi possível conferir a assinatura agora.
        </p>
        <button
          type="button"
          onClick={() => setTentativa((t) => t + 1)}
          className="h-10 px-4 rounded-xl border border-[var(--c-borda)] text-[var(--c-texto)] text-sm font-bold"
        >
          Tentar de novo
        </button>
      </div>
    );
  }

  if (assinadoEm === undefined) return null;

  if (assinadoEm) {
    return (
      <div className="flex items-center gap-2 px-4 py-3 bg-emerald-500/10 border-t border-emerald-500/30 pb-[max(12px,env(safe-area-inset-bottom))]">
        <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0" />
        <p className="text-xs text-[var(--c-texto)]">
          <strong>{textos.feito}</strong> em {dataHoraDeBrasilia(assinadoEm)}.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="flex items-center gap-3 px-4 py-3 bg-[var(--c-superficie)] border-t border-[var(--c-borda)] pb-[max(12px,env(safe-area-inset-bottom))]">
        <p className="flex-1 text-xs text-[var(--c-texto-2)] leading-snug">{textos.convite}</p>
        <button
          type="button"
          id="botao-assinar-documento"
          onClick={() => setFolhaAberta(true)}
          className="h-10 px-4 rounded-xl bg-[var(--c-acento)] text-[var(--c-sobre-acento)] text-sm font-bold flex items-center gap-1.5"
        >
          <PenLine className="w-4 h-4" />
          Assinar
        </button>
      </div>

      <FolhaDeAssinar
        aberta={folhaAberta}
        aoFechar={() => setFolhaAberta(false)}
        titulo={textos.titulo}
        declaracao={textos.declaracao}
        assinar={assinar}
        aoAssinar={async () => {
          setFolhaAberta(false);
          setAssinadoEm(await carregar());
          aoAssinar?.();
        }}
      />
    </>
  );
};
