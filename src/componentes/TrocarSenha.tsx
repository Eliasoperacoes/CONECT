/**
 * TROCAR A PRÓPRIA SENHA — do perfil (15/10/2026).
 *
 * Até aqui só se definia senha no primeiro acesso, ou depois de o TI
 * redefinir. O TI não tinha a quem pedir. A senha atual é conferida pelo
 * banco (`nuvem.trocarMinhaSenha`): sem ela, quem achasse o computador do
 * balcão aberto trocaria a senha do dono e o deixaria do lado de fora.
 */
import React, { useState } from 'react';
import { AlertCircle, CheckCircle2, Eye, EyeOff } from 'lucide-react';
import { FolhaInferior } from './FolhaInferior';
import { nuvem } from '../servicos/nuvem';

/** O mesmo mínimo do primeiro acesso (TelaDefinirSenha) e do Supabase */
const TAMANHO_MINIMO = 6;

export const TrocarSenha: React.FC<{ aberto: boolean; aoFechar: () => void }> = ({ aberto, aoFechar }) => {
  const [atual, setAtual] = useState('');
  const [nova, setNova] = useState('');
  const [confirmacao, setConfirmacao] = useState('');
  const [mostrar, setMostrar] = useState(false);
  const [gravando, setGravando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [feito, setFeito] = useState(false);

  const fechar = () => {
    setAtual('');
    setNova('');
    setConfirmacao('');
    setErro(null);
    setFeito(false);
    aoFechar();
  };

  /** O que falta, dito antes de ir ao banco */
  const falta =
    !atual
      ? 'Digite a senha atual.'
      : nova.length < TAMANHO_MINIMO
        ? `A senha nova precisa ter ao menos ${TAMANHO_MINIMO} caracteres.`
        : nova === atual
          ? 'A senha nova precisa ser diferente da atual.'
          : nova !== confirmacao
            ? 'A confirmação não é igual à senha nova.'
            : null;

  const salvar = async () => {
    if (falta) return setErro(falta);
    setGravando(true);
    setErro(null);
    const res = await nuvem.trocarMinhaSenha(atual, nova);
    setGravando(false);
    if (!res.sucesso) return setErro(res.erro || 'Não foi possível trocar a senha.');
    setFeito(true);
  };

  const campo =
    'w-full h-12 px-4 pr-12 rounded-xl bg-[var(--c-superficie-2)] border border-[var(--c-borda)] text-base text-[var(--c-texto)] focus:outline-none focus:border-[var(--c-acento)]';
  const rotulo = 'block mb-1.5 text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--c-texto-2)]';
  const tipo = mostrar ? 'text' : 'password';

  return (
    <FolhaInferior
      aberto={aberto}
      titulo="Trocar senha"
      subtitulo="Vale para o celular e o computador"
      aoFechar={fechar}
      rodape={
        feito ? (
          <button type="button" onClick={fechar} className="w-full h-12 rounded-2xl bg-[var(--c-acento)] text-[var(--c-sobre-acento)] text-sm font-bold">
            Pronto
          </button>
        ) : (
          <button
            type="button"
            id="botao-salvar-nova-senha"
            onClick={salvar}
            disabled={gravando}
            className="w-full h-12 rounded-2xl bg-[var(--c-acento)] text-[var(--c-sobre-acento)] text-sm font-bold disabled:opacity-50"
          >
            {gravando ? 'Trocando…' : 'Trocar senha'}
          </button>
        )
      }
    >
      {feito ? (
        <div className="p-6 flex flex-col items-center text-center gap-2">
          <CheckCircle2 className="w-10 h-10 text-emerald-600" />
          <p className="text-base font-bold text-[var(--c-texto)]">Senha trocada</p>
          <p className="text-sm text-[var(--c-texto-3)]">Na próxima vez que entrar, em qualquer aparelho, use a senha nova.</p>
        </div>
      ) : (
        <form
          className="p-4 flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            void salvar();
          }}
        >
          {erro && (
            <div role="alert" className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-sm font-semibold text-red-600 dark:text-red-400 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {erro}
            </div>
          )}
          <div>
            <label htmlFor="senha-atual" className={rotulo}>Senha atual</label>
            <div className="relative">
              <input id="senha-atual" type={tipo} autoComplete="current-password" value={atual} onChange={(e) => setAtual(e.target.value)} className={campo} />
              <button
                type="button"
                onClick={() => setMostrar(!mostrar)}
                aria-label={mostrar ? 'Ocultar senhas' : 'Exibir senhas'}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 w-10 h-10 rounded-xl flex items-center justify-center text-[var(--c-texto-3)] hover:text-[var(--c-texto)]"
              >
                {mostrar ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </div>
          </div>
          <div>
            <label htmlFor="senha-nova" className={rotulo}>Senha nova</label>
            <input
              id="senha-nova"
              type={tipo}
              autoComplete="new-password"
              value={nova}
              onChange={(e) => setNova(e.target.value)}
              placeholder={`Mínimo de ${TAMANHO_MINIMO} caracteres`}
              className={campo}
            />
          </div>
          <div>
            <label htmlFor="senha-confirmacao" className={rotulo}>Confirme a senha nova</label>
            <input id="senha-confirmacao" type={tipo} autoComplete="new-password" value={confirmacao} onChange={(e) => setConfirmacao(e.target.value)} className={campo} />
          </div>
          {/* Enviar pelo Enter do teclado */}
          <button type="submit" className="hidden" aria-hidden tabIndex={-1} />
        </form>
      )}
    </FolhaInferior>
  );
};
