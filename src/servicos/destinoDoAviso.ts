/**
 * PARA ONDE O TOQUE NUM AVISO LEVA — CONECTA / Malachias Autopeças
 *
 * `conversa` abre a conversa; o resto é seção do sistema. Nenhum abre aba
 * do navegador: o CONECTA roda como aplicativo, e sair dele para voltar
 * ao mesmo lugar é perder o contexto por nada.
 *
 * Arquivo SEM DEPENDÊNCIAS, de propósito: quem traduz o aviso do Android
 * (`pushNativo`) precisa desta lista, e buscá-la na central de
 * notificações puxava junto o ponto, o banco e o organograma — o que
 * quebrava o próprio aviso nos testes e pesava na abertura.
 */

export const SECOES_DESTINO = ['aprovar_jornadas', 'escala_folgas', 'meu_ponto'] as const;

/**
 * `meu_ponto` é o ponto de quem pediu: é para onde leva o aviso de que
 * o pedido dele foi decidido.
 */
export type SecaoDestino = (typeof SECOES_DESTINO)[number];

export const ehSecaoDestino = (valor: unknown): valor is SecaoDestino =>
  (SECOES_DESTINO as readonly unknown[]).includes(valor);

export type DestinoNotificacao =
  | { tipo: 'conversa'; conversaId: string }
  | { tipo: 'secao'; secao: SecaoDestino }
  /* A publicação da Central: leva à Central COM ela aberta, e não só
     à lista — quem toca num aviso quer aquele aviso */
  | { tipo: 'publicacao'; publicacaoId: string };
