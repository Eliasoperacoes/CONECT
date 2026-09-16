/**
 * Bloco de dados individuais — CONECTA
 *
 * Mesma ficha em qualquer tela que trate de uma pessoa. Quem decide o que
 * entra é `servicos/fichaColaborador`; aqui só se decide como aparece.
 */
import React from 'react';
import { Colaborador } from '../tipos';
import { montarFicha } from '../servicos/fichaColaborador';

interface Props {
  colaborador: Colaborador;
  /** Responsável direto, para a ficha dizer quem aprova a hora da pessoa. */
  responsavel?: Colaborador | null;
  /** Esconde telefone e e-mail. Usado onde o contato não vem ao caso. */
  ocultarContato?: boolean;
  /** Mostra os campos em branco como "—", para conferência de cadastro. */
  mostrarVazios?: boolean;
  colunas?: 1 | 2;
  className?: string;
}

export const FichaColaborador: React.FC<Props> = ({
  colaborador,
  responsavel,
  ocultarContato = false,
  mostrarVazios = false,
  colunas = 2,
  className = '',
}) => {
  const campos = montarFicha(colaborador, {
    incluirVazios: mostrarVazios,
    responsavel,
  }).filter(
    (campo) => !(ocultarContato && campo.sensivel)
  );

  if (campos.length === 0) return null;

  return (
    <div
      className={`grid gap-2 ${colunas === 2 ? 'grid-cols-2' : 'grid-cols-1'} ${className}`}
    >
      {campos.map((campo) => (
        <div
          key={campo.chave}
          className="p-2.5 bg-[var(--c-canvas)] rounded-xl border border-[var(--c-borda)] min-w-0"
        >
          <span className="text-[11px] text-[var(--c-texto-3)] block font-medium">
            {campo.rotulo}
          </span>
          <strong className="text-[var(--c-texto)] text-sm break-words">
            {campo.valor || '—'}
          </strong>
        </div>
      ))}
    </div>
  );
};
