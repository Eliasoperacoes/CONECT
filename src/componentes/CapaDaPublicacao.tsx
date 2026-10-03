/**
 * A CAPA NO CARTÃO DA CENTRAL — CONECTA / Malachias Autopeças
 *
 * A publicação com imagem de capa (`capaDe`, em textoRico) mostra a capa
 * em miniatura no cartão da lista, como numa lista de notícias: é o que
 * faz um comunicado se destacar de relance (Elias, 03/10/2026).
 *
 * O caminho no balde precisa de endereço ASSINADO, e assinar é ida à
 * rede. Os endereços ficam guardados aqui, para a lista não assinar de
 * novo a cada redesenho.
 */
import React, { useEffect, useState } from 'react';
import { capaDe } from '../servicos/textoRico';
import { abrirDocumento } from '../servicos/rh';

const assinadas = new Map<string, string>();

export const CapaDaPublicacao: React.FC<{ conteudo: string }> = ({ conteudo }) => {
  const caminho = capaDe(conteudo);
  const [url, setUrl] = useState<string | null>(() =>
    caminho ? assinadas.get(caminho) || (/^https?:\/\//i.test(caminho) ? caminho : null) : null
  );

  useEffect(() => {
    if (!caminho || url) return;
    let vivo = true;
    abrirDocumento(caminho)
      .then((endereco) => {
        if (!vivo || !endereco) return;
        assinadas.set(caminho, endereco);
        setUrl(endereco);
      })
      .catch(() => {});
    return () => {
      vivo = false;
    };
  }, [caminho, url]);

  if (!caminho || !url) return null;
  return (
    <img
      src={url}
      alt=""
      loading="lazy"
      className="w-20 h-16 sm:w-28 sm:h-20 rounded-xl object-cover shrink-0 border border-[var(--c-borda)]"
    />
  );
};
