import React, { useEffect, useRef, useState } from 'react';
import { Pin, PinOff, Trash2, Archive, Check, LogOut } from 'lucide-react';
import { Conversa } from '../tipos';
import {
  estaFixada,
  alternarFixada,
  ocultarConversa,
  removerConversaDaLista,
} from '../servicos/preferenciasConversa';
import {
  LARGURA_ACAO,
  abreAoSoltar,
  ehArrastoLateral,
  limitarDeslocamento,
} from '../servicos/deslizarItem';
import { bancoDados } from '../servicos/bancoDados';
import { FolhaInferior } from './FolhaInferior';

/**
 * O aviso de que um item abriu as ações. Os outros fecham as deles:
 * duas conversas com a lixeira à mostra ao mesmo tempo é como se
 * exclui a errada.
 */
const EVENTO_ITEM_ABERTO = 'conecta:item-conversa-aberto';

interface PropsItemConversa {
  conversa: Conversa;
  selecionada?: boolean;
  aoClicar: () => void;
  /**
   * Quem está logado. Sem ele o item não oferece fixar nem excluir — é o
   * que mantém o componente utilizável em tela de leitura, sem ações.
   */
  colaboradorId?: string;
  /** Avisa quem lista para recarregar depois de fixar ou ocultar. */
  aoMudarPreferencia?: () => void;
  /**
   * Modo de seleção: em vez de abrir, o toque marca a conversa.
   *
   * Quem manda é quem lista, e não este item: a barra de ações e a contagem
   * vivem lá, e dois donos do mesmo estado é como a contagem passa a
   * discordar do que está marcado.
   */
  modoSelecao?: boolean;
  marcada?: boolean;
  aoAlternarMarcada?: () => void;
}

/**
 * Um item da lista de conversas.
 *
 * As ações de fixar e excluir moram AQUI, e não em quem lista, porque há
 * duas listas — a flutuante do computador e a da barra do celular. Quando
 * estavam só na do computador, o celular ficou sem elas, que foi o defeito
 * relatado. Uma vez só, os dois lados ganham juntos.
 *
 * AS AÇÕES FICAM ATRÁS DO ITEM, e arrastar para a esquerda as revela —
 * pedido do Elias, no lugar dos três pontinhos que abriam um menu miúdo
 * por cima da lista. No computador, o botão direito do mouse abre as
 * mesmas ações, porque arrastar com o mouse ninguém adivinha.
 */
export const ItemConversa: React.FC<PropsItemConversa> = ({
  conversa,
  selecionada = false,
  aoClicar,
  colaboradorId,
  aoMudarPreferencia,
  modoSelecao = false,
  marcada = false,
  aoAlternarMarcada,
}) => {
  // Em modo de seleção as ações individuais somem: a barra da lista decide
  // o que fazer com o conjunto, e ter os dois caminhos ao mesmo tempo só faz
  // a pessoa errar qual está usando
  const temAcoes = !!colaboradorId && !modoSelecao;
  const fixada = colaboradorId ? estaFixada(colaboradorId, conversa.id) : false;

  /** Quanto o item está puxado para a esquerda: 0 fechado, -largura aberto. */
  const [deslocamento, setDeslocamento] = useState(0);
  const [arrastando, setArrastando] = useState(false);
  const toque = useRef<{ x: number; y: number; inicio: number; lateral: boolean | null } | null>(
    null
  );
  /**
   * O arrasto terminou em cima do item, e o navegador manda um clique
   * logo depois. Sem engolir esse clique, soltar o dedo abriria a
   * conversa que a pessoa só queria arrastar.
   */
  const arrastou = useRef(false);

  /*
    GRUPO DE PESSOAS: "EXCLUIR" É SAIR E APAGAR (Elias, 03/10/2026). Excluir
    sem sair deixava a pessoa no grupo, recebendo aviso de um grupo que ela
    nem via mais. Agora pergunta antes, e desvincula por completo.
  */
  const grupoDePessoas = conversa.tipo === 'grupo' && !conversa.ehSistemaPadrao;
  const jaSai = !!conversa.euSaiEm;
  const [confirmandoSaida, setConfirmandoSaida] = useState(false);
  const [saindo, setSaindo] = useState(false);
  const [erroSaida, setErroSaida] = useState<string | null>(null);
  const sairEApagar = async () => {
    setSaindo(true);
    setErroSaida(null);
    const res = await bancoDados.sairEApagarGrupo(conversa.id);
    setSaindo(false);
    if (!res.sucesso) return setErroSaida(res.erro || 'Não foi possível sair do grupo.');
    setConfirmandoSaida(false);
    aoMudarPreferencia?.();
  };

  const acoes = colaboradorId
    ? [
        {
          chave: 'fixar',
          rotulo: fixada ? 'Desafixar' : 'Fixar',
          Icone: fixada ? PinOff : Pin,
          cor: 'bg-[var(--c-acento)] text-[var(--c-sobre-acento)]',
          dica: fixada ? 'Tirar do topo da lista' : 'Manter no topo da lista',
          executar: () => alternarFixada(colaboradorId, conversa.id),
        },
        /*
          ARQUIVAR — o nome honesto do que este botão sempre fez.

          Chamava-se "Excluir conversa" e não excluía nada: a conversa
          voltava sozinha assim que o colega escrevesse. Nome que promete
          outra coisa faz a pessoa evitar o botão certo com medo de
          perder o histórico.
        */
        {
          chave: 'arquivar',
          rotulo: 'Arquivar',
          Icone: Archive,
          cor: 'bg-slate-500 text-white',
          dica: 'Sai da lista e volta sozinha na próxima mensagem',
          executar: () => ocultarConversa(colaboradorId, conversa.id),
        },
        /*
          EXCLUIR — sai da aba e NÃO volta sozinha.

          É a única diferença para arquivar, e é ela que justifica as
          duas existirem. Mensagem nova continua chegando: o contador
          conta e o aviso do celular toca. O que não acontece é a
          conversa reaparecer na lista por conta própria.

          Nenhuma mensagem é apagada. Chamar o colega de novo traz a
          conversa inteira de volta.
        */
        grupoDePessoas
          ? {
              chave: 'excluir',
              rotulo: jaSai ? 'Apagar' : 'Sair e apagar',
              Icone: jaSai ? Trash2 : LogOut,
              cor: 'bg-red-600 text-white',
              dica: jaSai ? 'Apagar o grupo da sua lista' : 'Sair do grupo e apagá-lo da sua lista',
              executar: () => setConfirmandoSaida(true),
            }
          : {
              chave: 'excluir',
              rotulo: 'Excluir',
              Icone: Trash2,
              cor: 'bg-red-600 text-white',
              dica: 'Sai da aba e só volta quando você chamar o colega de novo',
              executar: () => removerConversaDaLista(colaboradorId, conversa.id),
            },
      ]
    : [];
  const largura = acoes.length * LARGURA_ACAO;
  const aberto = deslocamento === -largura && largura > 0;

  const fechar = () => setDeslocamento(0);

  const abrir = () => {
    setDeslocamento(-largura);
    window.dispatchEvent(new CustomEvent(EVENTO_ITEM_ABERTO, { detail: conversa.id }));
  };

  // Outro item abriu as ações dele: este fecha as suas
  useEffect(() => {
    const aoAbrirOutro = (e: Event) => {
      if ((e as CustomEvent<string>).detail !== conversa.id) setDeslocamento(0);
    };
    window.addEventListener(EVENTO_ITEM_ABERTO, aoAbrirOutro);
    return () => window.removeEventListener(EVENTO_ITEM_ABERTO, aoAbrirOutro);
  }, [conversa.id]);

  // Entrar em modo de seleção recolhe as ações: elas não valem ali
  useEffect(() => {
    if (!temAcoes) setDeslocamento(0);
  }, [temAcoes]);

  const soltar = () => {
    const t = toque.current;
    toque.current = null;
    if (!t?.lateral) return;
    setArrastando(false);
    if (abreAoSoltar(t.inicio, deslocamento, largura)) abrir();
    else fechar();
  };

  // Inicial do nome para avatar caso não haja foto
  const obterInicial = (nome: string) => {
    return (nome || '?').charAt(0).toUpperCase();
  };

  return (
    <div className="relative overflow-hidden border-b border-[var(--c-borda)]">
      {/* As ações, atrás do item. Só aparecem quando ele desliza. */}
      {temAcoes && (
        <div
          id={`acoes-item-conversa-${conversa.id}`}
          className="absolute inset-y-0 right-0 flex"
          style={{ width: largura }}
          aria-hidden={!aberto}
        >
          {acoes.map(({ chave, rotulo, Icone, cor, dica, executar }) => (
            <button
              key={chave}
              type="button"
              tabIndex={aberto ? 0 : -1}
              onClick={() => {
                executar();
                fechar();
                aoMudarPreferencia?.();
              }}
              title={dica}
              style={{ width: LARGURA_ACAO }}
              className={`h-full flex flex-col items-center justify-center gap-1 active:brightness-90 transition-[filter] ${cor}`}
            >
              <Icone className="w-5 h-5" />
              <span className="text-[11px] font-semibold leading-none">{rotulo}</span>
            </button>
          ))}
        </div>
      )}

    <button
      type="button"
      id={`item-conversa-${conversa.id}`}
      onClick={() => {
        if (arrastou.current) {
          arrastou.current = false;
          return;
        }
        // Com as ações à mostra, tocar no item só as recolhe
        if (deslocamento !== 0) {
          fechar();
          return;
        }
        (modoSelecao ? aoAlternarMarcada : aoClicar)?.();
      }}
      onContextMenu={(e) => {
        if (!temAcoes) return;
        e.preventDefault();
        if (aberto) fechar();
        else abrir();
      }}
      onPointerDown={(e) => {
        if (!temAcoes || (e.pointerType === 'mouse' && e.button !== 0)) return;
        toque.current = { x: e.clientX, y: e.clientY, inicio: deslocamento, lateral: null };
        arrastou.current = false;
      }}
      onPointerMove={(e) => {
        const t = toque.current;
        if (!t) return;
        const dx = e.clientX - t.x;
        const dy = e.clientY - t.y;

        if (t.lateral === null) {
          if (ehArrastoLateral(dx, dy)) {
            t.lateral = true;
            arrastou.current = true;
            setArrastando(true);
            e.currentTarget.setPointerCapture(e.pointerId);
          } else if (Math.abs(dy) > 10) {
            // É rolagem da lista: o item não se mexe até o dedo sair
            t.lateral = false;
          }
          return;
        }
        if (t.lateral) setDeslocamento(limitarDeslocamento(t.inicio, dx, largura));
      }}
      onPointerUp={soltar}
      onPointerCancel={soltar}
      style={{
        transform: `translateX(${deslocamento}px)`,
        // O navegador cuida da rolagem vertical; o lado é nosso
        touchAction: temAcoes ? 'pan-y' : undefined,
      }}
      className={`relative w-full flex items-center gap-3 px-4 py-3.5 text-left min-h-[64px] active:bg-[var(--c-superficie-2)] select-none ${
        arrastando ? '' : 'transition-transform duration-200 ease-out'
      } ${
        selecionada || marcada
          ? 'bg-[var(--c-acento-suave)]'
          : 'bg-[var(--c-superficie)]'
      }`}
    >
      {/* O alfinete fica sobre o item, sem roubar linha do nome */}
      {fixada && (
        <Pin className="absolute left-1 top-1 w-3 h-3 text-[var(--c-acento)] pointer-events-none" />
      )}

      {/* A marca da seleção, à frente da foto */}
      {modoSelecao && (
        <span
          className={`flex-shrink-0 w-5 h-5 rounded-full border flex items-center justify-center transition-colors ${
            marcada
              ? 'bg-[var(--c-acento)] border-[var(--c-acento)] text-[var(--c-sobre-acento)]'
              : 'border-[var(--c-borda-forte)] text-transparent'
          }`}
        >
          <Check className="w-3.5 h-3.5 stroke-[3]" />
        </span>
      )}

      {/* 1. Foto ou Avatar */}
      <div className="relative flex-shrink-0 w-12 h-12 rounded-full overflow-hidden bg-[var(--c-superficie-2)] border border-[var(--c-borda)] flex items-center justify-center">
        {conversa.foto ? (
          <img
            src={conversa.foto}
            alt={conversa.nome}
            className="w-full h-full object-cover pointer-events-none"
            referrerPolicy="no-referrer"
            draggable={false}
          />
        ) : (
          <span className="font-semibold text-base text-[var(--c-texto-2)]">
            {obterInicial(conversa.nome)}
          </span>
        )}
      </div>

      {/* 2. Nome e 3. Prévia da última mensagem */}
      <div className="flex-1 min-w-0 pr-1">
        <div className="flex items-baseline justify-between gap-2">
          <span className="font-medium text-base text-[var(--c-texto)] truncate">
            {conversa.nome}
          </span>

          {/* 4. Horário */}
          {conversa.ultimaMensagem?.hora && (
            <span className="text-xs text-[var(--c-texto-3)] flex-shrink-0 font-mono">
              {conversa.ultimaMensagem.hora}
            </span>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 mt-0.5">
          <p className="text-sm text-[var(--c-texto-2)] truncate">
            {conversa.ultimaMensagem?.texto || 'Nenhuma mensagem'}
          </p>

          {/* Contador de não lidas (quando houver) */}
          {conversa.naoLidas > 0 && (
            <span className="flex-shrink-0 min-w-[20px] h-5 px-1.5 rounded-full bg-[var(--c-acento)] text-[var(--c-sobre-acento)] text-xs font-semibold flex items-center justify-center">
              {conversa.naoLidas}
            </span>
          )}
        </div>
      </div>
    </button>

      <FolhaInferior
        aberto={confirmandoSaida}
        titulo={jaSai ? `Apagar “${conversa.nome}”?` : `Sair de “${conversa.nome}” e apagar?`}
        aoFechar={() => setConfirmandoSaida(false)}
        rodape={
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setConfirmandoSaida(false)}
              disabled={saindo}
              className="flex-1 h-12 rounded-2xl border border-[var(--c-borda)] text-sm font-semibold text-[var(--c-texto-2)]"
            >
              Cancelar
            </button>
            <button
              type="button"
              id={`confirmar-sair-e-apagar-${conversa.id}`}
              onClick={sairEApagar}
              disabled={saindo}
              className="flex-1 h-12 rounded-2xl bg-red-600 text-white text-sm font-bold disabled:opacity-50"
            >
              {saindo ? 'Aguarde…' : jaSai ? 'Apagar' : 'Sair e apagar'}
            </button>
          </div>
        }
      >
        <div className="p-4 flex flex-col gap-2">
          <p className="text-sm text-[var(--c-texto-2)] leading-relaxed">
            {jaSai
              ? 'O grupo sai da sua lista, com o histórico. Para os outros participantes, ele continua.'
              : 'Você sai do grupo — deixa de receber as mensagens e os avisos — e ele some da sua lista, com o histórico. Para os outros participantes, o grupo continua.'}
          </p>
          {erroSaida && <p role="alert" className="text-xs font-semibold text-red-600">{erroSaida}</p>}
        </div>
      </FolhaInferior>
    </div>
  );
};