/**
 * Sino de notificações — CONECTA / Malachias Autopeças
 *
 * O que está esperando a pessoa, sem interromper o que ela está fazendo.
 *
 * O aviso do Windows serve para quem NÃO está com o sistema à vista. Para
 * quem está, ele é só um susto: uma janela por cima de um sistema aberto,
 * avisando de algo que está a um clique dali. O sino é o outro lado disso
 * — fica quieto no cabeçalho, com o número, e espera ser olhado.
 *
 * TOCAR NUMA NOTIFICAÇÃO LEVA ATÉ ELA, dentro do aplicativo. Sem abrir aba
 * nova: o CONECTA roda como aplicativo no celular da loja, e mandar a
 * pessoa para fora para voltar ao mesmo lugar é perder o contexto por
 * nada.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Bell, CheckCheck, MessageSquare, Clock, CalendarDays, FileText, X } from 'lucide-react';
import {
  assinarNotificacoes,
  listarNotificacoes,
  limparNotificacoes,
  dispensarNotificacao,
  type ItemNotificacao,
  type DestinoNotificacao,
  type TipoNotificacao,
} from '../servicos/centralDeNotificacoes';
import { bancoDados } from '../servicos/bancoDados';
import { servicoPonto } from '../servicos/ponto';
import { assinarJustificativas } from '../servicos/justificativas';

interface Props {
  /** Leva a pessoa ao destino. Quem sabe navegar é o App, não o sino. */
  aoIrPara: (destino: DestinoNotificacao) => void;
}

const ICONE: Record<TipoNotificacao, React.ElementType> = {
  mensagem: MessageSquare,
  jornada: Clock,
  ausencia: FileText,
  folga: CalendarDays,
};

/** "agora", "há 5 min", "há 2 h", "há 3 d" — quem olha quer a ordem, não a data. */
const haQuantoTempo = (iso: string): string => {
  const minutos = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (!Number.isFinite(minutos) || minutos < 1) return 'agora';
  if (minutos < 60) return `há ${minutos} min`;
  const horas = Math.floor(minutos / 60);
  if (horas < 24) return `há ${horas} h`;
  return `há ${Math.floor(horas / 24)} d`;
};

export const SinoNotificacoes: React.FC<Props> = ({ aoIrPara }) => {
  const [aberto, setAberto] = useState(false);
  const [versao, setVersao] = useState(0);
  const caixa = useRef<HTMLDivElement>(null);

  /**
   * Relê a lista quando algo muda.
   *
   * `versao` entra nas dependências de propósito: é o que faz o número
   * cair no mesmo instante em que a pessoa limpa ou toca numa
   * notificação, em vez de esperar o próximo desenho da tela.
   */
  const itens = useMemo(() => listarNotificacoes(), [versao, aberto]);
  const quantas = itens.length;

  /**
   * Quatro assinaturas, porque são quatro donos do dado.
   *
   * A central NÃO guarda notificação — ela pergunta às fontes toda vez. O
   * efeito disso é que ela não tem como avisar que chegou mensagem nova:
   * quem soube foi o `bancoDados`, e ela nem estava olhando.
   *
   * Sem assinar as fontes, o número do sino só mudava quando a própria
   * pessoa limpava ou tocava em algo — ou seja, mensagem nova chegava e o
   * sino continuava marcando o que marcava antes. Era o contador mentindo,
   * que é pior do que não ter contador.
   */
  useEffect(() => {
    const repicar = () => setVersao((v) => v + 1);

    const cancelar = [
      assinarNotificacoes(repicar),
      bancoDados.assinarAlteracoes(repicar),
      servicoPonto.assinarAlteracoes(repicar),
      assinarJustificativas(repicar),
    ];

    return () => cancelar.forEach((parar) => parar());
  }, []);

  /**
   * Fecha ao tocar fora e no Esc.
   *
   * No celular isto é o que mais importa: não há canto vazio sobrando na
   * tela, e um painel que só fecha pelo próprio botão vira uma tampa em
   * cima do sistema.
   */
  useEffect(() => {
    if (!aberto) return;

    const foraDaCaixa = (evento: MouseEvent) => {
      if (caixa.current && !caixa.current.contains(evento.target as Node)) setAberto(false);
    };
    const pelaTecla = (evento: KeyboardEvent) => {
      if (evento.key === 'Escape') setAberto(false);
    };

    document.addEventListener('mousedown', foraDaCaixa);
    document.addEventListener('keydown', pelaTecla);
    return () => {
      document.removeEventListener('mousedown', foraDaCaixa);
      document.removeEventListener('keydown', pelaTecla);
    };
  }, [aberto]);

  /**
   * Tocar é ir até lá — e o aviso já cumpriu o papel dele.
   *
   * Dispensa junto de propósito: manter no sino algo que a pessoa acabou
   * de abrir faz o contador contar duas vezes a mesma coisa, e é assim
   * que um sino começa a ser ignorado.
   */
  const tocar = (item: ItemNotificacao) => {
    dispensarNotificacao(item.id);
    setAberto(false);
    aoIrPara(item.destino);
  };

  return (
    <div className="relative" ref={caixa}>
      <button
        type="button"
        onClick={() => setAberto((a) => !a)}
        aria-label={quantas > 0 ? `Notificações: ${quantas}` : 'Notificações'}
        aria-expanded={aberto}
        className="relative p-2 rounded-lg text-[var(--c-texto-2)] hover:text-[var(--c-texto)] hover:bg-[var(--c-canvas)] transition-colors"
      >
        <Bell size={20} />
        {quantas > 0 && (
          <span
            className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-[var(--c-erro)] text-[var(--c-sobre-acento)] text-[10px] font-bold flex items-center justify-center"
            aria-hidden="true"
          >
            {quantas > 99 ? '99+' : quantas}
          </span>
        )}
      </button>

      {aberto && (
        <div
          role="dialog"
          aria-label="Notificações"
          /**
           * No celular o painel ocupa quase a largura da tela e se ancora
           * pela direita. Um menu de largura fixa estourava a borda no
           * aparelho da loja, e a última linha ficava cortada.
           */
          className="absolute right-0 top-full mt-2 w-[min(22rem,calc(100vw-2rem))] max-h-[70vh] flex flex-col bg-[var(--c-superficie)] border border-[var(--c-borda)] rounded-xl shadow-lg z-50 overflow-hidden"
        >
          <div className="px-3 py-2.5 border-b border-[var(--c-borda)] flex items-center justify-between gap-2 flex-shrink-0">
            <span className="text-sm font-semibold text-[var(--c-texto)]">Notificações</span>
            {quantas > 0 && (
              <button
                type="button"
                onClick={() => limparNotificacoes()}
                className="text-xs font-semibold text-[var(--c-acento)] hover:underline flex items-center gap-1"
              >
                <CheckCheck size={14} />
                Limpar todas
              </button>
            )}
          </div>

          <div className="overflow-y-auto">
            {itens.length === 0 ? (
              <p className="px-3 py-8 text-center text-xs text-[var(--c-texto-2)]">
                Nada esperando por você.
              </p>
            ) : (
              itens.map((item) => {
                const Icone = ICONE[item.tipo];
                return (
                  /**
                   * Dois botões lado a lado, e não um dentro do outro: ir
                   * até a notificação e dispensá-la são ações diferentes, e
                   * botão dentro de botão é HTML inválido — o navegador
                   * desmonta e o clique passa a cair no lugar errado.
                   */
                  <div
                    key={item.id}
                    className="flex items-start border-b border-[var(--c-borda)] last:border-0 hover:bg-[var(--c-canvas)] transition-colors"
                  >
                    <button
                      type="button"
                      onClick={() => tocar(item)}
                      className="flex-1 min-w-0 pl-3 py-2.5 flex items-start gap-2.5 text-left"
                    >
                      <Icone
                        size={16}
                        className="mt-0.5 flex-shrink-0 text-[var(--c-texto-2)]"
                      />
                      <span className="flex-1 min-w-0">
                        <span className="block text-xs font-semibold text-[var(--c-texto)] truncate">
                          {item.titulo}
                        </span>
                        <span className="block text-xs text-[var(--c-texto-2)] truncate">
                          {item.detalhe}
                        </span>
                        <span className="block text-[10px] text-[var(--c-texto-2)] mt-0.5">
                          {haQuantoTempo(item.quando)}
                        </span>
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => dispensarNotificacao(item.id)}
                      aria-label={`Dispensar: ${item.titulo}`}
                      title="Dispensar este aviso"
                      /**
                       * Alvo de 32px porque isto é tocado com o polegar no
                       * celular da loja, a um centímetro do botão que abre
                       * a notificação. Menor do que isso, dispensar vira
                       * uma loteria entre as duas ações.
                       */
                      className="flex-shrink-0 m-1 w-8 h-8 flex items-center justify-center rounded-lg text-[var(--c-texto-3)] hover:text-[var(--c-erro)] hover:bg-[var(--c-erro)]/10 transition-colors"
                    >
                      <X size={14} />
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
};
