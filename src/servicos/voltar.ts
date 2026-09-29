/**
 * O BOTÃO VOLTAR — CONECTA / Malachias Autopeças
 *
 * ===================================================================
 * O PROBLEMA
 * ===================================================================
 *
 * No aplicativo Android, o voltar do aparelho não fazia nada — ou pior,
 * fechava o aplicativo com uma foto aberta na tela. O sistema não tem
 * rotas: janela, modal e aba são estado do React, e o Android não sabe
 * que existem.
 *
 * ===================================================================
 * A PILHA
 * ===================================================================
 *
 * Cada tela que se sobrepõe às outras — modal, visualizador de foto,
 * painel — se põe na pilha enquanto está aberta, com a própria forma de
 * fechar. O voltar fecha a de CIMA, que é a que a pessoa está vendo.
 *
 * Quem se registra é o próprio modal, e não o App. O App não enxerga os
 * modais que moram dentro das abas; uma lista deles escrita no App seria
 * a lista que alguém esquece de atualizar no modal seguinte.
 *
 * Pilha vazia: quem decide é o App (fechar conversa, voltar à aba
 * inicial, e por fim minimizar) — ver `ligarBotaoVoltar`.
 */
import { useEffect, useRef } from 'react';

type Fechar = () => void;

const pilha: Array<{ fechar: { atual: Fechar } }> = [];

/**
 * Põe uma tela na pilha. Devolve a função que a tira.
 *
 * Tirar procura pela própria entrada, e não pelo topo: dois modais podem
 * fechar fora de ordem (o de baixo por um aviso do banco, por exemplo),
 * e tirar o topo às cegas desregistraria o modal errado.
 */
export const registrarVoltar = (fechar: { atual: Fechar }): (() => void) => {
  const entrada = { fechar };
  pilha.push(entrada);
  return () => {
    const i = pilha.lastIndexOf(entrada);
    if (i !== -1) pilha.splice(i, 1);
  };
};

/**
 * Fecha a tela de cima. Devolve falso quando não há nenhuma.
 *
 * TIRA DA PILHA ANTES DE FECHAR, e não espera o modal desmontar. Um
 * `aoFechar` que não fecha (um formulário que recusa sair, um modal que
 * só se esconde) ficaria no topo para sempre: cada voltar chamaria o
 * mesmo fechar, sem efeito, e a pessoa ficaria presa ali. Assim o
 * voltar seguinte passa para a tela de baixo.
 */
export const tratarVoltar = (): boolean => {
  const topo = pilha.pop();
  if (!topo) return false;
  topo.fechar.atual();
  return true;
};

/** Quantas telas estão empilhadas. Serve aos testes. */
export const alturaDaPilha = (): number => pilha.length;

/**
 * O voltar do aparelho fecha esta tela enquanto `ativo` for verdadeiro.
 *
 * `ativo` existe porque alguns modais ficam montados o tempo todo e só
 * se mostram com `aberto`. Registrar pela montagem os poria na pilha
 * fechados — e o voltar "fecharia" um modal invisível, sem efeito
 * nenhum para quem aperta.
 *
 * A função de fechar é guardada por referência: ela muda a cada render,
 * e registrar de novo a cada render reordenaria a pilha.
 */
export const useVoltar = (ativo: boolean, fechar: Fechar): void => {
  const ref = useRef({ atual: fechar });
  ref.current.atual = fechar;

  useEffect(() => {
    if (!ativo) return;
    return registrarVoltar(ref.current);
  }, [ativo]);
};
