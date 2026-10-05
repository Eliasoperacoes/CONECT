/**
 * A FOLHA DE ASSINAR — a assinatura da pessoa e a senha, por cima da tela.
 *
 * Uma só para tudo que se assina: o holerite e o espelho do colaborador
 * (`BarraDeAssinatura`) e o lote do responsável (`AbaAssinaturas`). Na
 * primeira vez cadastra a assinatura (`CadastroDeAssinatura`); daí em
 * diante, mostra a assinatura e pede a senha, conferida no banco.
 */
import React, { useEffect, useState } from 'react';
import { Lock } from 'lucide-react';
import { Assinatura } from '../tipos';
import { obterMinhaAssinatura } from '../servicos/assinatura';
import { useVoltar } from '../servicos/voltar';
import { CadastroDeAssinatura } from './CadastroDeAssinatura';

export const FolhaDeAssinar: React.FC<{
  aberta: boolean;
  aoFechar: () => void;
  titulo: string;
  /** O que a pessoa declara ao assinar. */
  declaracao: string;
  /** O que vai ser assinado, acima da senha (o lote do RH). */
  resumo?: React.ReactNode;
  /** "Assinar", "Assinar 14 documentos". */
  rotuloDoBotao?: string;
  assinar: (senha: string) => Promise<{ sucesso: boolean; erro?: string }>;
  aoAssinar: () => void;
}> = ({ aberta, aoFechar, titulo, declaracao, resumo, rotuloDoBotao = 'Assinar', assinar, aoAssinar }) => {
  const [assinatura, setAssinatura] = useState<Assinatura | null | undefined>(undefined);
  const [cadastrando, setCadastrando] = useState(false);
  const [senha, setSenha] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  // A cada abertura: a assinatura de agora, senha e erro limpos
  useEffect(() => {
    if (!aberta) return;
    let cancelado = false;
    setSenha('');
    setErro(null);
    setAssinatura(undefined);
    obterMinhaAssinatura().then((minha) => {
      if (cancelado) return;
      setAssinatura(minha);
      setCadastrando(!minha);
    });
    return () => {
      cancelado = true;
    };
  }, [aberta]);

  // O voltar do Android fecha a folha antes da tela de baixo
  useVoltar(aberta, aoFechar);

  if (!aberta) return null;

  const aposCadastrar = async () => {
    setAssinatura(await obterMinhaAssinatura());
    setCadastrando(false);
  };

  const confirmar = async () => {
    setEnviando(true);
    setErro(null);
    const res = await assinar(senha);
    setEnviando(false);
    setSenha('');
    if (!res.sucesso) return setErro(res.erro || 'A assinatura não foi registrada.');
    aoAssinar();
  };

  return (
    <div className="fixed inset-0 z-[95] flex items-end sm:items-center justify-center bg-black/50" onClick={aoFechar}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={titulo}
        onClick={(e) => e.stopPropagation()}
        className="w-full sm:max-w-md max-h-[90dvh] overflow-y-auto bg-[var(--c-superficie)] rounded-t-3xl sm:rounded-3xl p-4 pb-[max(16px,env(safe-area-inset-bottom))]"
      >
        {assinatura === undefined ? (
          <p className="py-8 text-center text-xs text-[var(--c-texto-3)]">Carregando a sua assinatura…</p>
        ) : cadastrando ? (
          <CadastroDeAssinatura
            aoSalvar={aposCadastrar}
            aoCancelar={() => (assinatura ? setCadastrando(false) : aoFechar())}
          />
        ) : (
          <div className="flex flex-col gap-3">
            <div>
              <h3 className="text-sm font-bold text-[var(--c-texto)]">{titulo}</h3>
              <p className="text-xs text-[var(--c-texto-3)]">{declaracao}</p>
            </div>

            {resumo}

            {assinatura && (
              <div className="rounded-xl bg-white border border-[var(--c-borda)] p-2 flex items-center justify-between gap-2">
                <img src={assinatura.imagem} alt="Sua assinatura" className="h-14 max-w-[70%] object-contain" />
                <button
                  type="button"
                  onClick={() => setCadastrando(true)}
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
                onClick={aoFechar}
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
                {enviando ? 'Assinando…' : rotuloDoBotao}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
