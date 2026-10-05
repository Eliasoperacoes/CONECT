/**
 * ASSINAR O HOLERITE — a barra de assinar (`BarraDeAssinatura`), com o
 * texto do recebimento. Assina o PDF que está na tela, e não outro.
 */
import React from 'react';
import { Holerite } from '../tipos';
import { assinarHolerite, listarRecebimentos } from '../servicos/assinatura';
import { BarraDeAssinatura } from './BarraDeAssinatura';

export const AssinarHolerite: React.FC<{
  holerite: Holerite;
  /** O PDF que está na tela — é ele que a pessoa assina. */
  dados: ArrayBuffer;
  aoAssinar?: () => void;
}> = ({ holerite, dados, aoAssinar }) => (
  <BarraDeAssinatura
    chave={holerite.id}
    textos={{
      convite: 'Confira o holerite e assine o recebimento.',
      titulo: 'Assinar o recebimento',
      declaracao: 'Declaro ter recebido a importância líquida discriminada neste holerite.',
      feito: 'Recebimento assinado',
    }}
    carregar={async () =>
      (await listarRecebimentos({ holeriteIds: [holerite.id] })).get(holerite.id)?.assinadoEm || null
    }
    assinar={(senha) => assinarHolerite(holerite, senha, dados)}
    aoAssinar={aoAssinar}
  />
);
