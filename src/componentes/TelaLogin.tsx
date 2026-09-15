import React, { useEffect, useRef, useState } from 'react';
import {
  Lock,
  User,
  Eye,
  EyeOff,
  Building2,
  Radio,
  ArrowRight,
  AlertCircle,
} from 'lucide-react';
import { bancoDados, obterFotoColaborador } from '../servicos/bancoDados';
import { Colaborador } from '../tipos';
import { usandoNuvem } from '../servicos/supabase';
import { nuvem } from '../servicos/nuvem';

interface PropsTelaLogin {
  aoAutenticar: (colaborador: Colaborador, precisaTrocarSenha?: boolean) => void;
}

export const TelaLogin: React.FC<PropsTelaLogin> = ({ aoAutenticar }) => {
  // Conta sugerida: último colaborador que entrou NESTE dispositivo.
  const [contaSugerida, setContaSugerida] = useState<Colaborador | null>(() =>
    bancoDados.obterUltimoAcessoDoDispositivo()
  );
  const [login, setLogin] = useState(() => contaSugerida?.login ?? '');
  const [senha, setSenha] = useState('');
  const [mostrarSenha, setMostrarSenha] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);
  const campoSenhaRef = useRef<HTMLInputElement>(null);

  const submeterLogin = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setErro(null);

    if (!login.trim()) {
      setErro('Digite seu login de acesso.');
      return;
    }
    if (!senha) {
      setErro('Digite sua senha.');
      return;
    }

    setCarregando(true);

    // No modo rede a autenticação é do banco; no modo local segue como antes
    if (usandoNuvem()) {
      const entrada = await nuvem.entrar(login, senha);
      setCarregando(false);
      if (entrada.sucesso && entrada.colaborador) {
        aoAutenticar(entrada.colaborador, entrada.precisaTrocarSenha);
      } else {
        setErro(entrada.erro || 'Falha ao autenticar.');
      }
      return;
    }

    setTimeout(() => {
      const resultado = bancoDados.autenticar(login, senha);
      setCarregando(false);
      if (resultado.sucesso && resultado.colaborador) {
        aoAutenticar(resultado.colaborador);
      } else {
        setErro(resultado.erro || 'Falha ao autenticar.');
      }
    }, 250);
  };

  // Entra direto na conta sugerida, sem digitar a senha (acesso de um clique).
  const usarContaSugerida = () => {
    if (!contaSugerida || carregando) return;
    setErro(null);
    setLogin(contaSugerida.login);
    setCarregando(true);

    setTimeout(() => {
      const resultado = bancoDados.autenticarContaSugerida();
      setCarregando(false);
      if (resultado.sucesso && resultado.colaborador) {
        aoAutenticar(resultado.colaborador);
        return;
      }
      // Senha alterada ou conta desativada: cai para o preenchimento manual.
      setContaSugerida(null);
      setSenha('');
      setErro(resultado.erro || 'Não foi possível entrar automaticamente.');
      campoSenhaRef.current?.focus();
    }, 250);
  };

  // "Não sou eu": limpa a sugestão deste dispositivo e libera os campos.
  const esquecerContaSugerida = () => {
    bancoDados.esquecerUltimoAcessoDoDispositivo();
    setContaSugerida(null);
    setLogin('');
    setSenha('');
    setErro(null);
  };

  return (
    <div
      id="tela-login-conecta"
      className="min-h-[100dvh] w-full flex flex-col justify-between bg-gradient-to-b from-[var(--c-canvas)] via-[var(--c-superficie)] to-[var(--c-canvas)] text-[var(--c-texto)] p-4 sm:p-6"
    >
      {/* Topo com Logo e Marca */}
      <div className="w-full max-w-md mx-auto pt-4 sm:pt-8 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-600 to-teal-700 flex items-center justify-center text-white shadow-md">
            <Radio className="w-5 h-5" />
          </div>
          <div>
            <span className="text-base font-black tracking-tight text-[var(--c-texto)] flex items-center gap-1.5">
              CONECTA
              <span className="text-[10px] uppercase font-bold tracking-widest px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">
                v1.0.B
              </span>
            </span>
            <span className="text-[11px] text-[var(--c-texto-3)] font-medium block -mt-0.5">
              Malachias Autopeças
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1.5 text-xs text-[var(--c-texto-3)] bg-[var(--c-superficie-2)] px-2.5 py-1 rounded-full border border-[var(--c-borda)]">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <span>5 Lojas Conectadas</span>
        </div>
      </div>

      {/* Caixa Central de Login */}
      <div className="w-full max-w-md mx-auto my-auto py-6">
        <div className="bg-[var(--c-superficie)] rounded-2xl border border-[var(--c-borda)] shadow-[var(--s-3)] p-6 sm:p-8">
          <div className="mb-6 text-center">
            <h1 className="text-xl sm:text-2xl font-black text-[var(--c-texto)] tracking-tight">
              Acesso ao Sistema
            </h1>
            <p className="text-xs sm:text-sm text-[var(--c-texto-3)] mt-1">
              Comunicação Instantânea, Rádio PTT e Gestão de Pessoas
            </p>
          </div>

          {erro && (
            <div
              id="alerta-erro-login"
              className="mb-5 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 text-xs font-semibold flex items-center gap-2"
            >
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{erro}</span>
            </div>
          )}

          <form onSubmit={submeterLogin} className="space-y-4">
            {/* Campo Login */}
            <div>
              <label
                htmlFor="campo-login"
                className="block text-xs font-bold text-[var(--c-texto-2)] uppercase tracking-wider mb-1.5"
              >
                Login ou Usuário
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-[var(--c-texto-3)]">
                  <User className="w-4 h-4" />
                </div>
                <input
                  id="campo-login"
                  type="text"
                  autoComplete="username"
                  autoCapitalize="none"
                  value={login}
                  onChange={(e) => setLogin(e.target.value)}
                  placeholder="Seu login de acesso"
                  className="w-full pl-10 pr-3 py-2.5 rounded-xl bg-[var(--c-canvas)] border border-[var(--c-borda)] text-[var(--c-texto)] placeholder-[var(--c-texto-3)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--c-acento)] focus:border-transparent transition-all"
                />
              </div>
            </div>

            {/* Campo Senha */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label
                  htmlFor="campo-senha"
                  className="block text-xs font-bold text-[var(--c-texto-2)] uppercase tracking-wider"
                >
                  Senha de Acesso
                </label>
              </div>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-[var(--c-texto-3)]">
                  <Lock className="w-4 h-4" />
                </div>
                <input
                  id="campo-senha"
                  ref={campoSenhaRef}
                  type={mostrarSenha ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={senha}
                  onChange={(e) => setSenha(e.target.value)}
                  placeholder="••••••"
                  className="w-full pl-10 pr-10 py-2.5 rounded-xl bg-[var(--c-canvas)] border border-[var(--c-borda)] text-[var(--c-texto)] placeholder-[var(--c-texto-3)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--c-acento)] focus:border-transparent transition-all"
                />
                <button
                  type="button"
                  id="botao-mostrar-senha"
                  onClick={() => setMostrarSenha(!mostrarSenha)}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-[var(--c-texto-3)] hover:text-[var(--c-texto)] transition-colors"
                  aria-label={mostrarSenha ? 'Ocultar senha' : 'Exibir senha'}
                >
                  {mostrarSenha ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Botão de Entrar */}
            <button
              type="submit"
              id="botao-submeter-login"
              disabled={carregando}
              className="w-full mt-2 py-3 px-4 rounded-xl bg-[var(--c-acento)] text-[var(--c-sobre-acento)] font-bold text-sm flex items-center justify-center gap-2 hover:brightness-110 active:scale-[0.99] transition-all disabled:opacity-50 shadow-md"
            >
              {carregando ? (
                <div className="w-5 h-5 border-2 border-[var(--c-sobre-acento)] border-t-transparent rounded-full animate-spin" />
              ) : (
                <>
                  <span>Entrar no Sistema</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          {/* Conta sugerida — so apos o primeiro acesso neste dispositivo. No
              modo rede a sessao ja fica guardada, entao nao se aplica. */}
          {contaSugerida && !usandoNuvem() && (
            <div className="mt-6 pt-5 border-t border-[var(--c-borda)]">
              <span className="block text-[11px] font-bold text-[var(--c-texto-3)] uppercase tracking-wider mb-2">
                Último acesso neste dispositivo
              </span>
              <div className="p-3 rounded-xl bg-[var(--c-superficie-2)] border border-[var(--c-borda)] flex items-center gap-3">
                <img
                  src={obterFotoColaborador(contaSugerida)}
                  alt={contaSugerida.nome}
                  className="w-10 h-10 rounded-full object-cover border border-[var(--c-borda)] bg-[var(--c-canvas)] flex-shrink-0"
                />
                <div className="min-w-0 flex-1">
                  <span className="block text-sm font-bold text-[var(--c-texto)] truncate">
                    {contaSugerida.nome}
                  </span>
                  <span className="block text-[11px] text-[var(--c-texto-3)] truncate">
                    {contaSugerida.cargo} · {contaSugerida.loja}
                  </span>
                </div>
                <button
                  type="button"
                  id="botao-usar-conta-sugerida"
                  onClick={usarContaSugerida}
                  disabled={carregando}
                  className="flex-shrink-0 py-2 px-3.5 rounded-lg bg-[var(--c-acento)] text-[var(--c-sobre-acento)] text-xs font-bold flex items-center gap-1.5 hover:brightness-110 active:scale-[0.98] disabled:opacity-50 transition-all shadow-sm"
                >
                  {carregando ? (
                    <div className="w-3.5 h-3.5 border-2 border-[var(--c-sobre-acento)] border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <>
                      <span>Continuar</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </>
                  )}
                </button>
              </div>
              <button
                type="button"
                id="botao-esquecer-conta-sugerida"
                onClick={esquecerContaSugerida}
                className="mt-2 w-full text-center text-[11px] font-semibold text-[var(--c-texto-3)] hover:text-[var(--c-acento)] transition-colors"
              >
                Não sou eu · entrar com outra conta
              </button>
            </div>
          )}
        </div>

        {/* Rede de Lojas Indicator */}
        <div className="mt-5 grid grid-cols-5 gap-1.5 text-center">
          {[
            { nome: 'Pirassununga', tipo: 'Matriz' },
            { nome: 'Porto Ferreira', tipo: 'Filial' },
            { nome: 'Palmeiras', tipo: 'Filial' },
            { nome: 'Descalvado', tipo: 'Filial' },
            { nome: 'Santa Rita', tipo: 'Filial' },
          ].map((loja) => (
            <div
              key={loja.nome}
              className="p-1.5 rounded-lg bg-[var(--c-superficie)]/50 border border-[var(--c-borda)]"
            >
              <span className="text-[10px] font-bold text-[var(--c-texto)] block truncate">
                {loja.nome}
              </span>
              <span className="text-[9px] text-[var(--c-texto-3)] block font-mono">
                {loja.tipo}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Rodapé Informativo */}
      <div className="w-full max-w-md mx-auto pb-4 text-center text-xs text-[var(--c-texto-3)] flex items-center justify-center gap-2">
        <Building2 className="w-3.5 h-3.5" />
        <span>Malachias Autopeças · Gestão & Comunicação Corporativa</span>
      </div>
    </div>
  );
};
