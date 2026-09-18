/**
 * Meus documentos — CONECTA / Malachias Autopeças
 *
 * O holerite e a advertência da própria pessoa, na tela dela.
 *
 * SEM ISTO A FUNÇÃO NÃO EXISTE. Um holerite que o RH publica e ninguém
 * consegue abrir é um arquivo num balde — e uma advertência que a pessoa
 * não vê não pode receber ciência dela, que é o que a torna uma advertência
 * e não um bilhete.
 *
 * A CIÊNCIA É DADA AQUI, e só aqui. Quem confirma que leu é quem leu; o RH
 * apenas enxerga se já houve. Um botão de "ele leu" no painel do RH seria o
 * RH afirmando algo sobre outra pessoa — exatamente o que uma ciência
 * existe para evitar.
 */

import React, { useEffect, useState } from 'react';
import { Receipt, AlertTriangle, Download, Check, Clock } from 'lucide-react';
import { Colaborador, Holerite, Advertencia, ROTULO_ADVERTENCIA } from '../tipos';
import {
  listarHolerites,
  listarAdvertencias,
  abrirDocumento,
  darCienciaNaAdvertencia,
} from '../servicos/rh';

interface Props {
  colaboradorAtual: Colaborador;
}

const NOMES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];
const porExtenso = (competencia: string): string => {
  const [ano, mes] = competencia.split('-');
  return `${NOMES[Number(mes) - 1] || mes} de ${ano}`;
};

const formatarData = (iso: string): string => {
  const [a, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${a}`;
};

export const MeusDocumentos: React.FC<Props> = ({ colaboradorAtual }) => {
  const [holerites, setHolerites] = useState<Holerite[]>([]);
  const [advertencias, setAdvertencias] = useState<Advertencia[]>([]);
  const [versao, setVersao] = useState(0);

  useEffect(() => {
    let cancelado = false;
    Promise.all([
      listarHolerites(colaboradorAtual.id),
      listarAdvertencias(colaboradorAtual.id),
    ]).then(([h, a]) => {
      if (cancelado) return;
      setHolerites(h);
      setAdvertencias(a);
    });
    return () => {
      cancelado = true;
    };
  }, [colaboradorAtual.id, versao]);

  const abrir = async (caminho: string) => {
    const url = await abrirDocumento(caminho);
    if (url) window.open(url, '_blank');
  };

  const darCiencia = async (a: Advertencia) => {
    const res = await darCienciaNaAdvertencia(a);
    if (res.sucesso) setVersao((v) => v + 1);
  };

  const semCiencia = advertencias.filter((a) => !a.cienciaEm);

  // Nada publicado ainda: a seção inteira some, em vez de duas listas vazias
  if (holerites.length === 0 && advertencias.length === 0) return null;

  return (
    <>
      {holerites.length > 0 && (
        <div className="mt-4 bg-[var(--c-superficie)] border-y border-[var(--c-borda)]">
          <div className="px-4 py-2 text-xs font-semibold text-[var(--c-texto-3)] uppercase tracking-wider">
            Meus holerites
          </div>
          <div className="divide-y divide-[var(--c-borda)]">
            {holerites.map((h) => (
              <button
                key={h.id}
                type="button"
                onClick={() => abrir(h.arquivoCaminho)}
                className="w-full px-4 py-3 flex items-center gap-3 text-left hover:bg-[var(--c-superficie-2)] transition-colors min-h-[52px]"
              >
                <Receipt className="w-4 h-4 text-[var(--c-acento)] flex-shrink-0" />
                <span className="flex-1 min-w-0 text-sm font-medium text-[var(--c-texto)]">
                  {porExtenso(h.competencia)}
                </span>
                <Download className="w-4 h-4 text-[var(--c-texto-3)] flex-shrink-0" />
              </button>
            ))}
          </div>
        </div>
      )}

      {advertencias.length > 0 && (
        <div className="mt-4 bg-[var(--c-superficie)] border-y border-[var(--c-borda)]">
          <div className="px-4 py-2 text-xs font-semibold text-[var(--c-texto-3)] uppercase tracking-wider flex items-center gap-2">
            Advertências
            {semCiencia.length > 0 && (
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-amber-500/15 text-amber-700 dark:text-amber-400 normal-case tracking-normal">
                {semCiencia.length} sem ciência
              </span>
            )}
          </div>

          <div className="divide-y divide-[var(--c-borda)]">
            {advertencias.map((a) => (
              <div key={a.id} className="px-4 py-3 flex flex-col gap-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0" />
                  <span className="text-sm font-bold text-[var(--c-texto)]">
                    {ROTULO_ADVERTENCIA[a.tipo]}
                    {a.tipo === 'suspensao' && a.diasSuspensao
                      ? ` · ${a.diasSuspensao} dias`
                      : ''}
                  </span>
                  <span className="text-xs text-[var(--c-texto-3)]">
                    {formatarData(a.data)}
                  </span>
                </div>

                <p className="text-xs text-[var(--c-texto-2)] leading-snug break-words">
                  {a.motivo}
                </p>

                {a.arquivoCaminho && (
                  <button
                    type="button"
                    onClick={() => abrir(a.arquivoCaminho!)}
                    className="self-start text-[11px] font-semibold text-[var(--c-acento)]"
                  >
                    Abrir documento
                  </button>
                )}

                {a.cienciaEm ? (
                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">
                    <Check className="w-3 h-3" />
                    Você deu ciência em {formatarData(a.cienciaEm)}
                  </span>
                ) : (
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-700 dark:text-amber-400">
                      <Clock className="w-3 h-3" />
                      Aguardando sua ciência
                    </span>
                    {/*
                      Dar ciência é dizer "eu li", e não "eu concordo". O
                      texto do botão diz isso porque a diferença importa: a
                      pessoa que discorda continua precisando registrar que
                      tomou conhecimento.
                    */}
                    <button
                      type="button"
                      onClick={() => darCiencia(a)}
                      className="px-2.5 py-1 rounded-lg bg-[var(--c-acento)] text-[var(--c-sobre-acento)] text-[11px] font-bold hover:brightness-110 transition-all"
                    >
                      Li e tomei ciência
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
};
