/**
 * A FAIXA QUE CONVIDA A LIGAR OS AVISOS DO COMPUTADOR.
 *
 * O Elias: "não dá a sugestão para ativar". A regra de quando aparecer
 * está em `deveConvidarParaAvisos` (notificacoes.ts); aqui só a faixa.
 *
 * Faixa abaixo do cabeçalho, e não janela por cima: ela não esconde nada
 * nem interrompe quem entrou para bater o ponto. Ao ligar, o som novo
 * toca — a pessoa ouve na hora como o aviso vai soar.
 */
import React, { useState } from 'react';
import { Bell, X } from 'lucide-react';
import {
  deveConvidarParaAvisos,
  adiarConviteDeAvisos,
  pedirPermissaoDeAviso,
  prepararSom,
  tocarAvisoDeMensagem,
} from '../servicos/notificacoes';

export const ConviteAvisos: React.FC = () => {
  const [visivel, setVisivel] = useState(deveConvidarParaAvisos);
  const [resposta, setResposta] = useState<string | null>(null);

  if (!visivel) return null;

  const ativar = async () => {
    prepararSom();
    const permissao = await pedirPermissaoDeAviso();
    if (permissao === 'concedida') {
      tocarAvisoDeMensagem();
      setResposta('Pronto: as mensagens vão avisar mesmo com o CONECTA atrás de outra janela.');
      setTimeout(() => setVisivel(false), 4000);
    } else {
      setResposta('O navegador bloqueou. Para liberar depois, clique no cadeado ao lado do endereço.');
      setTimeout(() => setVisivel(false), 6000);
    }
  };

  const agoraNao = () => {
    adiarConviteDeAvisos();
    setVisivel(false);
  };

  return (
    <div
      id="convite-avisos"
      role="region"
      aria-label="Ativar avisos do computador"
      className="hidden md:flex items-center gap-3 px-4 py-2 bg-[var(--c-acento)]/10 border-b border-[var(--c-acento)]/25 flex-shrink-0"
    >
      <Bell className="w-4 h-4 text-[var(--c-acento)] flex-shrink-0" />
      {resposta ? (
        <p className="flex-1 text-xs font-semibold text-[var(--c-texto)]">{resposta}</p>
      ) : (
        <>
          <p className="flex-1 text-xs text-[var(--c-texto)]">
            <strong>Ative os avisos deste computador</strong>
            <span className="text-[var(--c-texto-2)]">
              {' '}— mensagens e pedidos do ponto avisam mesmo com o CONECTA em segundo plano.
            </span>
          </p>
          <button
            type="button"
            id="botao-ativar-avisos"
            onClick={ativar}
            className="px-3 py-1.5 rounded-lg bg-[var(--c-acento)] text-[var(--c-sobre-acento)] text-xs font-bold hover:brightness-110 transition-all flex-shrink-0"
          >
            Ativar avisos
          </button>
          <button
            type="button"
            onClick={agoraNao}
            className="px-2.5 py-1.5 rounded-lg text-xs font-semibold text-[var(--c-texto-2)] hover:text-[var(--c-texto)] hover:bg-[var(--c-superficie-2)] transition-colors flex-shrink-0"
          >
            Agora não
          </button>
          <button
            type="button"
            onClick={agoraNao}
            aria-label="Fechar"
            className="p-1 rounded-md text-[var(--c-texto-3)] hover:text-[var(--c-texto)] flex-shrink-0"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </>
      )}
    </div>
  );
};
