/**
 * UMA SEÇÃO QUE RECOLHE — CONECTA / Malachias Autopeças
 *
 * POR QUE EXISTE COMO PEÇA, e não escrita em cada tela.
 *
 * A aba "Eu" tinha sete blocos, todos abertos, um debaixo do outro. No
 * celular davam quatro telas de rolagem — e o mais alto deles, a ficha
 * cadastral, é o que menos se usa: é consulta, não tem botão nenhum.
 *
 * Ela vai crescer: holerite, documentos, o que vier. Recolher escrito à
 * mão em cada bloco daria sete versões do mesmo `useState`, e a oitava
 * sairia diferente — que é como este sistema já foi mordido quatro
 * vezes.
 *
 * O RESUMO NÃO É ENFEITE. É o que a seção diz FECHADA, e é ele que
 * decide se vale abrir: a presença atual, quantos documentos chegaram,
 * o saldo do mês. Uma seção recolhida sem resumo é uma gaveta sem
 * etiqueta — a pessoa abre todas para achar a que queria, e aí recolher
 * não economizou nada.
 */
import React, { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';

interface Props {
  titulo: string;
  icone: React.ReactNode;
  /** O que a seção diz FECHADA — o que decide se vale abrir. */
  resumo?: React.ReactNode;
  /**
   * Nasce aberta?
   *
   * O padrão é FECHADA: numa tela de celular, cada bloco aberto empurra
   * o seguinte para fora da primeira dobra.
   */
  abertaDeInicio?: boolean;
  /** Um ponto colorido no cabeçalho, quando há algo pedindo atenção. */
  alerta?: boolean;
  children: React.ReactNode;
}

export const SecaoRecolhivel: React.FC<Props> = ({
  titulo,
  icone,
  resumo,
  abertaDeInicio = false,
  alerta = false,
  children,
}) => {
  const [aberta, setAberta] = useState(abertaDeInicio);

  return (
    <div className="mt-3 bg-[var(--c-superficie)] border-y border-[var(--c-borda)]">
      <button
        type="button"
        onClick={() => setAberta((v) => !v)}
        aria-expanded={aberta}
        /**
         * 52px de altura: é o mínimo para o dedo acertar sem mirar. O
         * resto da aba já usa essa medida, e um alvo menor aqui faria
         * a pessoa abrir a seção errada.
         */
        className="w-full px-4 py-3 min-h-[52px] flex items-center gap-3 text-left active:bg-[var(--c-superficie-2)] transition-colors"
      >
        <span className="shrink-0 text-[var(--c-texto-2)]">{icone}</span>

        <span className="text-sm font-semibold text-[var(--c-texto)] shrink-0">
          {titulo}
        </span>

        {alerta && (
          <span className="w-1.5 h-1.5 rounded-full bg-[var(--c-acento)] shrink-0" />
        )}

        <div className="flex-1 min-w-0" />

        {/* O resumo some quando a seção abre: o conteúdo já o repete */}
        {!aberta && resumo && (
          <span className="text-xs text-[var(--c-texto-3)] truncate max-w-[45%] text-right">
            {resumo}
          </span>
        )}

        {aberta ? (
          <ChevronUp className="w-4 h-4 text-[var(--c-texto-3)] shrink-0" />
        ) : (
          <ChevronDown className="w-4 h-4 text-[var(--c-texto-3)] shrink-0" />
        )}
      </button>

      {aberta && (
        <div className="border-t border-[var(--c-borda)]">{children}</div>
      )}
    </div>
  );
};
