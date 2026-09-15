/**
 * Definição de senha no primeiro acesso — CONECTA / Malachias Autopeças
 *
 * Todo colaborador entra pela primeira vez com a senha padrão distribuída
 * pelo RH. Enquanto não trocar, não passa daqui: a senha padrão é conhecida
 * por todos e não pode virar a senha definitiva de ninguém.
 */

import React, { useState } from 'react';
import { Lock, Eye, EyeOff, ShieldCheck, AlertCircle, ArrowRight } from 'lucide-react';
import { Colaborador } from '../tipos';
import { nuvem } from '../servicos/nuvem';

interface PropsTelaDefinirSenha {
  colaborador: Colaborador;
  aoConcluir: () => void;
}

/** Mesma exigência mínima da autenticação do Supabase. */
const TAMANHO_MINIMO = 6;

export const TelaDefinirSenha: React.FC<PropsTelaDefinirSenha> = ({
  colaborador,
  aoConcluir,
}) => {
  const [senha, setSenha] = useState('');
  const [confirmacao, setConfirmacao] = useState('');
  const [mostrar, setMostrar] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  const submeter = async (e: React.FormEvent) => {
    e.preventDefault();
    setErro(null);

    if (senha.length < TAMANHO_MINIMO) {
      setErro(`A senha precisa ter ao menos ${TAMANHO_MINIMO} caracteres.`);
      return;
    }
    if (senha !== confirmacao) {
      setErro('As duas senhas não são iguais.');
      return;
    }

    setSalvando(true);
    const res = await nuvem.definirNovaSenha(senha);
    setSalvando(false);

    if (res.sucesso) {
      aoConcluir();
    } else {
      setErro(res.erro || 'Não foi possível salvar a senha.');
    }
  };

  const campo =
    'w-full pl-10 pr-10 py-2.5 rounded-xl bg-[var(--c-canvas)] border border-[var(--c-borda)] text-[var(--c-texto)] placeholder-[var(--c-texto-3)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--c-acento)] focus:border-transparent transition-all';

  return (
    <div
      id="tela-definir-senha"
      className="min-h-[100dvh] w-full flex items-center justify-center bg-gradient-to-b from-[var(--c-canvas)] via-[var(--c-superficie)] to-[var(--c-canvas)] text-[var(--c-texto)] p-4"
    >
      <div className="w-full max-w-md">
        <div className="bg-[var(--c-superficie)] rounded-2xl border border-[var(--c-borda)] shadow-[var(--s-3)] p-6 sm:p-8">
          <div className="mb-6 text-center">
            <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 flex items-center justify-center mx-auto mb-3">
              <ShieldCheck className="w-7 h-7" />
            </div>
            <h1 className="text-xl font-black tracking-tight">Crie sua senha</h1>
            <p className="text-xs sm:text-sm text-[var(--c-texto-3)] mt-1 leading-relaxed">
              Olá, <strong className="text-[var(--c-texto-2)]">{colaborador.nome}</strong>. Você
              entrou com a senha padrão da empresa. Defina agora uma senha só sua para continuar.
            </p>
          </div>

          {erro && (
            <div className="mb-5 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 text-xs font-semibold flex items-center gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{erro}</span>
            </div>
          )}

          <form onSubmit={submeter} className="space-y-4">
            <div>
              <label
                htmlFor="campo-nova-senha"
                className="block text-xs font-bold text-[var(--c-texto-2)] uppercase tracking-wider mb-1.5"
              >
                Nova senha
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-[var(--c-texto-3)]">
                  <Lock className="w-4 h-4" />
                </div>
                <input
                  id="campo-nova-senha"
                  type={mostrar ? 'text' : 'password'}
                  autoComplete="new-password"
                  value={senha}
                  onChange={(e) => setSenha(e.target.value)}
                  placeholder={`Mínimo de ${TAMANHO_MINIMO} caracteres`}
                  className={campo}
                />
                <button
                  type="button"
                  onClick={() => setMostrar(!mostrar)}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-[var(--c-texto-3)] hover:text-[var(--c-texto)] transition-colors"
                  aria-label={mostrar ? 'Ocultar senha' : 'Exibir senha'}
                >
                  {mostrar ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div>
              <label
                htmlFor="campo-confirmar-senha"
                className="block text-xs font-bold text-[var(--c-texto-2)] uppercase tracking-wider mb-1.5"
              >
                Repita a nova senha
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-[var(--c-texto-3)]">
                  <Lock className="w-4 h-4" />
                </div>
                <input
                  id="campo-confirmar-senha"
                  type={mostrar ? 'text' : 'password'}
                  autoComplete="new-password"
                  value={confirmacao}
                  onChange={(e) => setConfirmacao(e.target.value)}
                  placeholder="Digite de novo"
                  className={campo}
                />
              </div>
            </div>

            <button
              type="submit"
              id="botao-salvar-nova-senha"
              disabled={salvando}
              className="w-full mt-2 py-3 px-4 rounded-xl bg-[var(--c-acento)] text-[var(--c-sobre-acento)] font-bold text-sm flex items-center justify-center gap-2 hover:brightness-110 active:scale-[0.99] transition-all disabled:opacity-50 shadow-md"
            >
              {salvando ? (
                <div className="w-5 h-5 border-2 border-[var(--c-sobre-acento)] border-t-transparent rounded-full animate-spin" />
              ) : (
                <>
                  <span>Salvar e entrar</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          <p className="mt-5 text-[11px] text-[var(--c-texto-3)] text-center leading-relaxed">
            Guarde bem esta senha. Se esquecer, o TI precisa redefinir o seu acesso.
          </p>
        </div>
      </div>
    </div>
  );
};
