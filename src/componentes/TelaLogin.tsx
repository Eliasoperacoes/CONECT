import React, { useEffect, useRef, useState } from 'react';
import { Lock, User, Eye, EyeOff, ArrowRight, AlertCircle } from 'lucide-react';
import { bancoDados, obterFotoColaborador } from '../servicos/bancoDados';
import { Colaborador, INFORMACOES_LOJAS } from '../tipos';
import { usandoNuvem } from '../servicos/supabase';
import { nuvem } from '../servicos/nuvem';
import { MarcaConecta } from './MarcaConecta';

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
  const [ajudaSenha, setAjudaSenha] = useState(false);
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
        // Guarda a conta deste aparelho para o próximo acesso ser de um
        // clique. Quem autenticou foi o banco, então a gravação é aqui.
        bancoDados.registrarAcessoDoDispositivo(entrada.colaborador.id, senha);
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
  const usarContaSugerida = async () => {
    if (!contaSugerida || carregando) return;
    setErro(null);
    setLogin(contaSugerida.login);
    setCarregando(true);

    // No modo rede o clique tem que abrir sessão no banco, igual ao login
    // digitado. Entrar só pela verificação local deixaria a pessoa dentro do
    // app sem sessão: nada carregaria e nada seria gravado.
    if (usandoNuvem()) {
      const senhaGuardada = bancoDados.obterSenhaSugeridaDoDispositivo();
      const entrada = senhaGuardada
        ? await nuvem.entrar(contaSugerida.login, senhaGuardada)
        : { sucesso: false, erro: 'Informe a senha para entrar.' as string | undefined };

      setCarregando(false);
      if (entrada.sucesso && 'colaborador' in entrada && entrada.colaborador) {
        aoAutenticar(entrada.colaborador, entrada.precisaTrocarSenha);
        return;
      }

      // Senha trocada ou conta desativada: volta ao preenchimento manual
      bancoDados.esquecerUltimoAcessoDoDispositivo();
      setContaSugerida(null);
      setSenha('');
      setErro(entrada.erro || 'Não foi possível entrar automaticamente.');
      campoSenhaRef.current?.focus();
      return;
    }

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

  /** As lojas da rede, do cadastro único (tipos.ts) — não de uma lista escrita aqui. */
  const lojas = INFORMACOES_LOJAS.filter((l) => l.nome !== 'Rede');

  const campo =
    'w-full h-14 pl-12 rounded-2xl bg-[var(--c-superficie)] border border-[var(--c-borda)] text-[var(--c-texto)] placeholder-[var(--c-texto-3)] text-base shadow-[var(--s-1)] focus:outline-none focus:border-[var(--c-acento)] focus:ring-4 focus:ring-[var(--c-acento)]/15 transition';
  const rotulo = 'block mb-2 text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--c-texto-2)]';

  return (
    <div
      id="tela-login-conecta"
      /*
        A ENTRADA, CENTRALIZADA (Elias, 06/10/2026): uma coluna só, no meio,
        do celular ao computador. O topo e o pé respeitam o entalhe e a
        barra de gestos do aparelho (área segura).
      */
      className="min-h-[100dvh] w-full flex flex-col bg-[linear-gradient(180deg,var(--c-acento-suave)_0%,var(--c-canvas)_42%)] text-[var(--c-texto)] px-6 pt-[max(env(safe-area-inset-top),1.5rem)] pb-[max(env(safe-area-inset-bottom),1.25rem)]"
    >
      <main className="flex-1 flex flex-col justify-center w-full max-w-sm mx-auto py-6">
        {/* A marca do sistema */}
        <div className="flex items-center justify-center gap-2.5">
          <MarcaConecta />
          <span className="text-lg font-extrabold tracking-tight">CONECTA</span>
        </div>

        {/* A empresa */}
        <img
          src="/logo-malachias.svg"
          alt="Malachias Autopeças"
          className="mt-9 mx-auto h-28 w-28 object-contain drop-shadow-sm"
        />

        <h1 className="mt-7 text-center text-[28px] leading-tight font-extrabold tracking-tight">Acesse sua conta</h1>
        <p className="mt-2 text-center text-sm text-[var(--c-texto-3)]">
          Bem-vindo de volta. Informe seus dados para continuar.
        </p>

        {erro && (
          <div
            id="alerta-erro-login"
            role="alert"
            className="mt-6 p-3.5 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 text-sm font-semibold flex items-center gap-2.5"
          >
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{erro}</span>
          </div>
        )}

        <form onSubmit={submeterLogin} className="mt-8 space-y-5">
          <div>
            <label htmlFor="campo-login" className={rotulo}>
              Usuário
            </label>
            <div className="relative">
              <User className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-[var(--c-texto-3)]" />
              <input
                id="campo-login"
                type="text"
                autoComplete="username"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                value={login}
                onChange={(e) => setLogin(e.target.value)}
                placeholder="Seu usuário"
                className={`${campo} pr-4`}
              />
            </div>
          </div>

          <div>
            <label htmlFor="campo-senha" className={rotulo}>
              Senha de acesso
            </label>
            <div className="relative">
              <Lock className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-[var(--c-texto-3)]" />
              <input
                id="campo-senha"
                ref={campoSenhaRef}
                type={mostrarSenha ? 'text' : 'password'}
                autoComplete="current-password"
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
                placeholder="Sua senha"
                className={`${campo} pr-14`}
              />
              <button
                type="button"
                id="botao-mostrar-senha"
                onClick={() => setMostrarSenha(!mostrarSenha)}
                className="absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-xl flex items-center justify-center text-[var(--c-texto-3)] hover:text-[var(--c-texto)] hover:bg-[var(--c-superficie-2)] transition-colors"
                aria-label={mostrarSenha ? 'Ocultar senha' : 'Exibir senha'}
              >
                {mostrarSenha ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </div>
            {/*
              "ESQUECI MINHA SENHA" DIZ A VERDADE: quem redefine é o TI, e na
              entrada seguinte o sistema pede uma senha nova. Um link para uma
              tela de recuperação que não existe deixaria a pessoa presa nela.
            */}
            <div className="mt-3 flex justify-end">
              <button
                type="button"
                id="botao-esqueci-senha"
                onClick={() => setAjudaSenha((a) => !a)}
                aria-expanded={ajudaSenha}
                className="text-sm font-semibold text-[var(--c-acento)] hover:underline"
              >
                Esqueci minha senha
              </button>
            </div>
            {ajudaSenha && (
              <p
                id="ajuda-esqueci-senha"
                className="mt-2 p-3.5 rounded-2xl bg-[var(--c-acento-suave)] text-sm leading-relaxed text-[var(--c-texto-2)]"
              >
                Peça ao <strong className="text-[var(--c-texto)]">TI</strong> para redefinir a sua senha. Na próxima
                entrada, o CONECTA pede que você crie uma senha nova, só sua.
              </p>
            )}
          </div>

          <button
            type="submit"
            id="botao-submeter-login"
            disabled={carregando}
            className="w-full h-14 rounded-2xl bg-[var(--c-acento)] text-[var(--c-sobre-acento)] font-bold text-base flex items-center justify-center gap-2 shadow-lg shadow-[var(--c-acento)]/25 hover:brightness-110 active:scale-[0.99] transition disabled:opacity-60"
          >
            {carregando ? (
              <span className="w-5 h-5 border-2 border-[var(--c-sobre-acento)] border-t-transparent rounded-full animate-spin" />
            ) : (
              <>
                Entrar no sistema
                <ArrowRight className="w-5 h-5" />
              </>
            )}
          </button>
        </form>

        {/* Conta sugerida — só no modo local: no modo rede a sessão já fica guardada */}
        {contaSugerida && !usandoNuvem() && (
          <div className="mt-6">
            <span className="block text-center text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--c-texto-3)] mb-2">
              Último acesso neste aparelho
            </span>
            <div className="p-3 rounded-2xl bg-[var(--c-superficie)] border border-[var(--c-borda)] shadow-[var(--s-1)] flex items-center gap-3">
              <img
                src={obterFotoColaborador(contaSugerida)}
                alt=""
                className="w-10 h-10 rounded-full object-cover border border-[var(--c-borda)] bg-[var(--c-canvas)] flex-shrink-0"
              />
              <div className="min-w-0 flex-1">
                <span className="block text-sm font-bold truncate">{contaSugerida.nome}</span>
                <span className="block text-[11px] text-[var(--c-texto-3)] truncate">
                  {contaSugerida.cargo} · {contaSugerida.loja}
                </span>
              </div>
              <button
                type="button"
                id="botao-usar-conta-sugerida"
                onClick={usarContaSugerida}
                disabled={carregando}
                className="flex-shrink-0 h-10 px-3.5 rounded-xl bg-[var(--c-acento)] text-[var(--c-sobre-acento)] text-xs font-bold flex items-center gap-1.5 hover:brightness-110 disabled:opacity-50 transition"
              >
                Continuar
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
            <button
              type="button"
              id="botao-esquecer-conta-sugerida"
              onClick={esquecerContaSugerida}
              className="mt-2 w-full text-center text-xs font-semibold text-[var(--c-texto-3)] hover:text-[var(--c-acento)] transition-colors"
            >
              Não sou eu · entrar com outra conta
            </button>
          </div>
        )}

        {/* A rede: as lojas, sem bolinha de "online" — o sistema não mede isso */}
        <div className="mt-9 pt-6 border-t border-[var(--c-borda)]">
          <span className="block text-center text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--c-texto-3)]">
            Rede conectada
          </span>
          <ul className="mt-3 flex flex-wrap justify-center gap-2">
            {lojas.map((loja) => (
              <li
                key={loja.nome}
                className="px-3 py-1.5 rounded-full bg-[var(--c-superficie)] border border-[var(--c-borda)] text-xs font-semibold text-[var(--c-texto-2)] shadow-[var(--s-1)]"
              >
                {loja.nome}
              </li>
            ))}
          </ul>
        </div>
      </main>

      <footer className="text-center text-[11px] leading-relaxed text-[var(--c-texto-3)]">
        Uso interno da Malachias Autopeças · o acesso é pessoal
      </footer>
    </div>
  );
};
