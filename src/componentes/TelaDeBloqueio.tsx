/**
 * A TELA DE BLOQUEIO — por cima do app, até a digital (ou o rosto) confirmar.
 *
 * Fica POR CIMA, e não no lugar: o que estava acontecendo embaixo continua
 * montado — a batida que chegou pelo QR do cartaz, o aviso tocado — e
 * segue depois de desbloquear. Abre a janela de biometria sozinha; se a
 * pessoa cancelar, o botão a chama de novo. Sem a digital, a saída é a
 * entrada com a senha.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Fingerprint, KeyRound } from 'lucide-react';
import { esperarAppNaFrente, pedirDigital } from '../servicos/desbloqueio';
import { primeiroNome } from '../servicos/saudacao';
import { LogoMalachias } from './LogoMalachias';

export const TelaDeBloqueio: React.FC<{
  nome: string;
  aoDesbloquear: () => void;
  /** Sem a digital: sai da sessão e vai à entrada com a senha. */
  aoEntrarComSenha: () => void;
}> = ({ nome, aoDesbloquear, aoEntrarComSenha }) => {
  const [conferindo, setConferindo] = useState(false);
  const [motivo, setMotivo] = useState<string | null>(null);
  const pedindo = useRef(false);

  const pedir = useCallback(async () => {
    if (pedindo.current) return;
    pedindo.current = true;
    setConferindo(true);
    setMotivo(null);
    const r = await pedirDigital();
    pedindo.current = false;
    setConferindo(false);
    if (r.ok) aoDesbloquear();
    else setMotivo(r.motivo ?? 'Não confirmou. Toque para tentar de novo.');
  }, [aoDesbloquear]);

  /*
    A janela da digital abre sozinha — mas só com o app de fato na frente,
    e de novo a cada volta ao app enquanto ele seguir bloqueado. Antes ela
    abria no instante do retorno, ainda na animação, e "não reconhecia".
  */
  useEffect(() => {
    let vivo = true;
    const aoVoltar = () => void esperarAppNaFrente().then(() => vivo && void pedir());
    aoVoltar();
    // A própria janela da digital pode esconder a página: essa volta não
    // pede de novo, ou o "Cancelar" reabriria a janela sem fim.
    let escondidaPelaDigital = false;
    const aoMudarVisibilidade = () => {
      if (document.visibilityState === 'hidden') {
        escondidaPelaDigital = pedindo.current;
        return;
      }
      if (escondidaPelaDigital) escondidaPelaDigital = false;
      else aoVoltar();
    };
    document.addEventListener('visibilitychange', aoMudarVisibilidade);
    return () => {
      vivo = false;
      document.removeEventListener('visibilitychange', aoMudarVisibilidade);
    };
  }, [pedir]);

  return (
    <div
      id="tela-de-bloqueio"
      role="dialog"
      aria-modal="true"
      aria-label="CONECTA bloqueado"
      className="fixed inset-0 z-[200] flex flex-col bg-[linear-gradient(180deg,var(--c-acento-suave)_0%,var(--c-canvas)_42%)] text-[var(--c-texto)] px-6 pt-[max(env(safe-area-inset-top),1.5rem)] pb-[max(env(safe-area-inset-bottom),1.25rem)]"
    >
      <main className="flex-1 flex flex-col items-center justify-center w-full max-w-sm mx-auto text-center">
        <LogoMalachias tamanho="grande" />
        <h1 className="mt-8 text-[26px] leading-tight font-extrabold tracking-tight">Olá, {primeiroNome(nome)}</h1>
        <p className="mt-2 text-sm text-[var(--c-texto-3)]">O CONECTA está bloqueado. Use a sua digital para continuar.</p>

        <button
          type="button"
          id="botao-desbloquear"
          onClick={pedir}
          disabled={conferindo}
          aria-label="Desbloquear com a digital"
          className="mt-10 w-24 h-24 rounded-full bg-[var(--c-superficie)] border border-[var(--c-borda)] shadow-[var(--s-2)] flex items-center justify-center text-[var(--c-acento)] active:scale-95 transition disabled:opacity-60"
        >
          <Fingerprint className={`w-12 h-12 ${conferindo ? 'animate-pulse' : ''}`} strokeWidth={1.5} />
        </button>
        <p className={`mt-4 text-sm font-semibold ${motivo ? 'text-[var(--c-atencao)]' : 'text-[var(--c-texto-2)]'}`}>
          {conferindo ? 'Aguardando a digital…' : motivo ?? 'Toque para desbloquear'}
        </p>
      </main>

      <button
        type="button"
        id="botao-entrar-com-senha"
        onClick={aoEntrarComSenha}
        className="mx-auto mb-2 h-12 px-5 rounded-2xl flex items-center gap-2 text-sm font-semibold text-[var(--c-acento)] hover:bg-[var(--c-superficie)]"
      >
        <KeyRound className="w-4 h-4" />
        Entrar com a senha
      </button>
    </div>
  );
};
