/**
 * O PRIMEIRO ACESSO — CONECTA / Malachias Autopeças
 *
 * Todo colaborador entra pela primeira vez com a senha padrão distribuída
 * pelo RH. Enquanto não trocar, não passa daqui: a senha padrão é conhecida
 * por todos e não pode virar a senha definitiva de ninguém.
 *
 * E O CPF, OBRIGATÓRIO (Elias, 06/10/2026). É a identificação do
 * trabalhador no comprovante de cada batida. Quem já tinha senha mas ainda
 * não tem CPF cai aqui também, uma vez, só com o campo do CPF — sem ele o
 * comprovante sairia sem a identificação.
 *
 * A conta dos dígitos é conferida aqui (aviso na hora) e no banco
 * (`registrar_meu_cpf`), que é a que vale.
 */

import React, { useState } from 'react';
import { Lock, Eye, EyeOff, AlertCircle, ArrowRight, IdCard, LogOut } from 'lucide-react';
import { Colaborador } from '../tipos';
import { nuvem } from '../servicos/nuvem';
import { cpfValido, formatarCpf, limparCpf } from '../servicos/cpf';
import { primeiroNome } from '../servicos/saudacao';
import { LogoMalachias } from './LogoMalachias';

interface PropsTelaDefinirSenha {
  colaborador: Colaborador;
  /** Ainda está com a senha padrão. */
  pedeSenha: boolean;
  /** Ainda não informou o CPF. */
  pedeCpf: boolean;
  aoConcluir: () => void;
  /** Sair da conta — a tela nunca prende ninguém. */
  aoSair?: () => void;
}

/** Mesma exigência mínima da autenticação do Supabase. */
const TAMANHO_MINIMO = 6;

export const TelaDefinirSenha: React.FC<PropsTelaDefinirSenha> = ({ colaborador, pedeSenha, pedeCpf, aoConcluir, aoSair }) => {
  const [senha, setSenha] = useState('');
  const [confirmacao, setConfirmacao] = useState('');
  const [cpf, setCpf] = useState('');
  const [mostrar, setMostrar] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  /** O que já foi salvo — num segundo envio, não se pede de novo. */
  const [senhaSalva, setSenhaSalva] = useState(false);

  const cpfCompleto = limparCpf(cpf).length === 11;
  const cpfComErro = cpfCompleto && !cpfValido(cpf);

  const submeter = async (e: React.FormEvent) => {
    e.preventDefault();
    setErro(null);

    if (pedeSenha && !senhaSalva) {
      if (senha.length < TAMANHO_MINIMO) return setErro(`A senha precisa ter ao menos ${TAMANHO_MINIMO} caracteres.`);
      if (senha !== confirmacao) return setErro('As duas senhas não são iguais.');
    }
    if (pedeCpf && !cpfValido(cpf)) return setErro('CPF inválido. Confira os números.');

    setSalvando(true);
    // O CPF primeiro: se ele for recusado, a senha padrão ainda vale e a pessoa tenta de novo
    if (pedeCpf) {
      const r = await nuvem.registrarMeuCpf(limparCpf(cpf));
      if (!r.sucesso) {
        setSalvando(false);
        return setErro(r.erro || 'Não foi possível salvar o CPF.');
      }
    }
    if (pedeSenha && !senhaSalva) {
      const r = await nuvem.definirNovaSenha(senha);
      if (!r.sucesso) {
        setSalvando(false);
        return setErro(r.erro || 'Não foi possível salvar a senha.');
      }
      setSenhaSalva(true);
    }
    setSalvando(false);
    aoConcluir();
  };

  const campo =
    'w-full h-14 pl-12 rounded-2xl bg-[var(--c-superficie)] border border-[var(--c-borda)] text-[var(--c-texto)] placeholder-[var(--c-texto-3)] text-base shadow-[var(--s-1)] focus:outline-none focus:border-[var(--c-acento)] focus:ring-4 focus:ring-[var(--c-acento)]/15 transition';
  const rotulo = 'block mb-2 text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--c-texto-2)]';
  const icone = 'pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-[var(--c-texto-3)]';

  const titulo = pedeSenha ? 'Crie a sua senha' : 'Informe o seu CPF';
  const frase = pedeSenha
    ? pedeCpf
      ? 'Você entrou com a senha padrão. Crie uma senha só sua e informe o seu CPF para continuar.'
      : 'Você entrou com a senha padrão. Crie uma senha só sua para continuar.'
    : 'O CPF identifica você no comprovante de cada batida de ponto. É pedido uma vez só.';

  return (
    <div
      id="tela-definir-senha"
      className="min-h-[100dvh] w-full flex flex-col bg-[linear-gradient(180deg,var(--c-acento-suave)_0%,var(--c-canvas)_42%)] text-[var(--c-texto)] px-6 pt-[max(env(safe-area-inset-top),1.5rem)] pb-[max(env(safe-area-inset-bottom),1.25rem)]"
    >
      <main className="flex-1 flex flex-col justify-center w-full max-w-sm mx-auto py-6">
        <LogoMalachias tamanho="grande" className="mx-auto" />

        <h1 className="mt-8 text-center text-[28px] leading-tight font-extrabold tracking-tight">{titulo}</h1>
        <p className="mt-2 text-center text-sm leading-relaxed text-[var(--c-texto-3)]">
          Olá, <strong className="font-semibold text-[var(--c-texto-2)]">{primeiroNome(colaborador.nome)}</strong>. {frase}
        </p>

        {erro && (
          <div
            role="alert"
            className="mt-6 p-3.5 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 text-sm font-semibold flex items-center gap-2.5"
          >
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{erro}</span>
          </div>
        )}

        <form onSubmit={submeter} className="mt-8 space-y-5">
          {pedeSenha && !senhaSalva && (
            <>
              <div>
                <label htmlFor="campo-nova-senha" className={rotulo}>
                  Nova senha
                </label>
                <div className="relative">
                  <Lock className={icone} />
                  <input
                    id="campo-nova-senha"
                    type={mostrar ? 'text' : 'password'}
                    autoComplete="new-password"
                    value={senha}
                    onChange={(e) => setSenha(e.target.value)}
                    placeholder={`Mínimo de ${TAMANHO_MINIMO} caracteres`}
                    className={`${campo} pr-14`}
                  />
                  <button
                    type="button"
                    onClick={() => setMostrar(!mostrar)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-xl flex items-center justify-center text-[var(--c-texto-3)] hover:text-[var(--c-texto)] hover:bg-[var(--c-superficie-2)] transition-colors"
                    aria-label={mostrar ? 'Ocultar senha' : 'Exibir senha'}
                  >
                    {mostrar ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
              </div>

              <div>
                <label htmlFor="campo-confirmar-senha" className={rotulo}>
                  Repita a nova senha
                </label>
                <div className="relative">
                  <Lock className={icone} />
                  <input
                    id="campo-confirmar-senha"
                    type={mostrar ? 'text' : 'password'}
                    autoComplete="new-password"
                    value={confirmacao}
                    onChange={(e) => setConfirmacao(e.target.value)}
                    placeholder="Digite de novo"
                    className={`${campo} pr-4`}
                  />
                </div>
              </div>
            </>
          )}

          {pedeCpf && (
            <div>
              <label htmlFor="campo-cpf" className={rotulo}>
                CPF
              </label>
              <div className="relative">
                <IdCard className={icone} />
                <input
                  id="campo-cpf"
                  type="text"
                  inputMode="numeric"
                  autoComplete="off"
                  value={cpf}
                  onChange={(e) => setCpf(formatarCpf(e.target.value))}
                  placeholder="000.000.000-00"
                  aria-invalid={cpfComErro}
                  aria-describedby="ajuda-cpf"
                  className={`${campo} pr-4 tabular-nums ${cpfComErro ? 'border-red-500 focus:border-red-500 focus:ring-red-500/15' : ''}`}
                />
              </div>
              <p id="ajuda-cpf" className={`mt-2 text-xs ${cpfComErro ? 'text-red-600 font-semibold' : 'text-[var(--c-texto-3)]'}`}>
                {cpfComErro
                  ? 'Este CPF não existe. Confira os números.'
                  : 'Só você e o RH veem o seu CPF. Para corrigir depois, fale com o RH.'}
              </p>
            </div>
          )}

          <button
            type="submit"
            id="botao-salvar-nova-senha"
            disabled={salvando || (pedeCpf && !cpfValido(cpf))}
            className="w-full h-14 rounded-2xl bg-[var(--c-marca)] text-[var(--c-sobre-marca)] font-bold text-base flex items-center justify-center gap-2 shadow-lg shadow-[var(--c-marca)]/30 hover:brightness-110 active:scale-[0.99] transition disabled:opacity-50"
          >
            {salvando ? (
              <span className="w-5 h-5 border-2 border-[var(--c-sobre-marca)] border-t-transparent rounded-full animate-spin" />
            ) : (
              <>
                Salvar e entrar
                <ArrowRight className="w-5 h-5" />
              </>
            )}
          </button>
        </form>
      </main>

      {aoSair && (
        <button
          type="button"
          id="botao-sair-primeiro-acesso"
          onClick={aoSair}
          className="mx-auto mb-2 h-11 px-5 rounded-2xl flex items-center gap-2 text-sm font-semibold text-[var(--c-texto-2)] hover:bg-[var(--c-superficie)]"
        >
          <LogOut className="w-4 h-4" />
          Sair e entrar com outra conta
        </button>
      )}
    </div>
  );
};
