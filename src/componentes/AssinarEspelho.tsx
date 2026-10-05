/**
 * ASSINAR O ESPELHO DE PONTO — a mesma barra do holerite
 * (`BarraDeAssinatura`), a mesma assinatura e a mesma senha. Pedido do
 * Elias (05/10/2026). Só o mês fechado chega aqui (`prepararMeuEspelho`).
 */
import React from 'react';
import { assinarEspelho, chaveDoEspelho, listarEspelhosAssinados } from '../servicos/assinatura';
import { rotuloDoMes } from '../servicos/meuRH';
import { BarraDeAssinatura } from './BarraDeAssinatura';

export const AssinarEspelho: React.FC<{
  colaboradorId: string;
  /** "2026-09" */
  mes: string;
  aoAssinar?: () => void;
}> = ({ colaboradorId, mes, aoAssinar }) => (
  <BarraDeAssinatura
    chave={chaveDoEspelho(colaboradorId, mes)}
    textos={{
      convite: 'Confira as marcações e o saldo do mês e assine o espelho.',
      titulo: 'Assinar o espelho de ponto',
      declaracao: `Declaro que as marcações e a apuração de ${rotuloDoMes(mes)} conferem com a minha jornada.`,
      feito: 'Espelho assinado',
    }}
    carregar={async () =>
      (await listarEspelhosAssinados({ colaboradorId, mes })).get(chaveDoEspelho(colaboradorId, mes))?.assinadoEm ||
      null
    }
    assinar={(senha) => assinarEspelho(mes, senha)}
    aoAssinar={aoAssinar}
  />
);
