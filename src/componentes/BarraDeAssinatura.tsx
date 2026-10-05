/**
 * A BARRA DE ASSINAR — no pé do visor, com o documento à frente.
 *
 * Uma só para todo documento que a pessoa assina: o holerite e o espelho
 * de ponto (05/10/2026). Muda o texto e o que "assinar" grava; a ordem é a
 * mesma, a do papel: a pessoa vê o documento, e só então assina. Na
 * primeira vez cadastra a assinatura (com o termo de adesão); daí em
 * diante, cada documento é confirmado com a senha, conferida no banco.
 *
 * Assinado, a barra só mostra quando — e não oferece desfazer: a
 * assinatura é registro, não preferência.
 */
import React, { useEffect, useState } from 'react';
import { CheckCircle2, Lock, PenLine } from 'lucide-react';
import { Assinatura } from '../tipos';
import { obterMinhaAssinatura } from '../servicos/assinatura';
import { dataHoraDeBrasilia } from '../servicos/comprovanteDeHolerite';
import { useVoltar } from '../servicos/voltar';
import { CadastroDeAssinatura } from './CadastroDeAssinatura';

type Etapa = 'carregando' | 'pendente' | 'cadastrar' | 'senha' | 'assinado';

export interface TextosDaAssinatura {
  /** Ao lado do botão: "Confira o holerite e assine o recebimento." */
  convite: string;
  /** O título da folha de senha. */
  titulo: string;
  /** O que a pessoa declara ao assinar. */
  declaracao: string;
  /** Depois de assinado: "Recebimento assinado". */
  feito: string;
}

export const BarraDeAssinatura: React.FC<{
  textos: TextosDaAssinatura;
  /** Já assinado? Devolve quando, ou null. */
  carregar: () => Promise<string | null>;
  assinar: (senha: string) => Promise<{ sucesso: boolean; erro?: string }>;
  /** Muda quando o documento muda: a barra recarrega. */
  chave: string;
  aoAssinar?: () => void;
}> = ({ textos, carregar, assinar, chave, aoAssinar }) => {
  const [etapa, setEtapa] = useState<Etapa>('carregando');
  const [assinadoEm, setAssinadoEm] = useState<string | null>(null);
  const [assinatura, setAssinatura] = useState<Assinatura | null>(null);
  const [senha, setSenha] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    let cancelado = false;
    (async () => {
      const [quando, minha] = await Promise.all([carregar(), obterMinhaAssinatura()]);
      if (cancelado) return;
      setAssinadoEm(quando);
      setAssinatura(minha);
      setEtapa(quando ? 'assinado' : 'pendente');
    })();
    return () => {
      cancelado = true;
    };
  }, [chave]);

  // O voltar do Android fecha a folha de assinar antes do visor
  const folhaAberta = etapa === 'cadastrar' || etapa === 'senha';
  useVoltar(folhaAberta, () => setEtapa('pendente'));

  const comecar = () => {
    setErro(null);
    setSenha('');
    setEtapa(assinatura ? 'senha' : 'cadastrar');
  };

  const aposCadastrar = async () => {
    setAssinatura(await obterMinhaAssinatura());
    setEtapa('senha');
  };

  const confirmar = async () => {
    setEnviando(true);
    setErro(null);
    const res = await assinar(senha);
    setEnviando(false);
    setSenha('');
    if (!res.sucesso) return setErro(res.erro || 'A assinatura não foi registrada.');
    setAssinadoEm(await carregar());
    setEtapa('assinado');
    aoAssinar?.();
  };

  if (etapa === 'carregando') return null;

  if (etapa === 'assinado') {
    return (
      <div className="flex items-center gap-2 px-4 py-3 bg-emerald-500/10 border-t border-emerald-500/30 pb-[max(12px,env(safe-area-inset-bottom))]">
        <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0" />
        <p className="text-xs text-[var(--c-texto)]">
          <strong>{textos.feito}</strong>
          {assinadoEm ? ` em ${dataHoraDeBrasilia(assinadoEm)}` : ''}.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="flex items-center gap-3 px-4 py-3 bg-[var(--c-superficie)] border-t border-[var(--c-borda)] pb-[max(12px,env(safe-area-inset-bottom))]">
        <p className="flex-1 text-xs text-[var(--c-texto-2)] leading-snug">{textos.convite}</p>
        <button
          type="button"
          id="botao-assinar-documento"
          onClick={comecar}
          className="h-10 px-4 rounded-xl bg-[var(--c-acento)] text-[var(--c-sobre-acento)] text-sm font-bold flex items-center gap-1.5"
        >
          <PenLine className="w-4 h-4" />
          Assinar
        </button>
      </div>

      {folhaAberta && (
        <div className="fixed inset-0 z-[95] flex items-end sm:items-center justify-center bg-black/50" onClick={() => setEtapa('pendente')}>
          <div
            role="dialog"
            aria-modal="true"
            aria-label={textos.titulo}
            onClick={(e) => e.stopPropagation()}
            className="w-full sm:max-w-md max-h-[90dvh] overflow-y-auto bg-[var(--c-superficie)] rounded-t-3xl sm:rounded-3xl p-4 pb-[max(16px,env(safe-area-inset-bottom))]"
          >
            {etapa === 'cadastrar' ? (
              <CadastroDeAssinatura aoSalvar={aposCadastrar} aoCancelar={() => setEtapa('pendente')} />
            ) : (
              <div className="flex flex-col gap-3">
                <div>
                  <h3 className="text-sm font-bold text-[var(--c-texto)]">{textos.titulo}</h3>
                  <p className="text-xs text-[var(--c-texto-3)]">{textos.declaracao}</p>
                </div>

                {assinatura && (
                  <div className="rounded-xl bg-white border border-[var(--c-borda)] p-2 flex items-center justify-between gap-2">
                    <img src={assinatura.imagem} alt="Sua assinatura" className="h-14 max-w-[70%] object-contain" />
                    <button
                      type="button"
                      onClick={() => setEtapa('cadastrar')}
                      className="text-[11px] font-semibold text-gray-500 underline"
                    >
                      Trocar
                    </button>
                  </div>
                )}

                <label htmlFor="senha-para-assinar" className="text-xs font-semibold text-[var(--c-texto-2)] flex items-center gap-1.5">
                  <Lock className="w-3.5 h-3.5" />
                  Sua senha do CONECTA
                </label>
                <input
                  id="senha-para-assinar"
                  type="password"
                  autoComplete="current-password"
                  value={senha}
                  onChange={(e) => setSenha(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && senha && !enviando && confirmar()}
                  autoFocus
                  className="h-11 px-3 rounded-xl bg-[var(--c-canvas)] border border-[var(--c-borda)] text-sm text-[var(--c-texto)] focus:outline-none focus:ring-2 focus:ring-[var(--c-acento)]"
                />

                {erro && <p className="text-xs font-semibold text-red-600">{erro}</p>}

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setEtapa('pendente')}
                    disabled={enviando}
                    className="flex-1 h-11 rounded-xl border border-[var(--c-borda)] text-sm font-semibold text-[var(--c-texto-2)]"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    id="confirmar-assinatura"
                    onClick={confirmar}
                    disabled={!senha || enviando}
                    className="flex-1 h-11 rounded-xl bg-[var(--c-acento)] text-[var(--c-sobre-acento)] text-sm font-bold disabled:opacity-40"
                  >
                    {enviando ? 'Assinando…' : 'Assinar'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
};
