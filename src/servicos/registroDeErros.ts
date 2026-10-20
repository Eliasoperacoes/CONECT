/**
 * O REGISTRO DE ERROS DO APLICATIVO (20/10/2026)
 *
 * Até aqui, um travamento só chegava ao TI se alguém contasse — e a tela
 * branca já tinha acontecido sem ninguém saber por quê. Cada erro de tela
 * (o que a `ProtecaoDaTela` segura) e cada erro solto do navegador vira uma
 * linha em `erros_do_app` (erros-do-app.sql), que só o TI lê.
 *
 * SÓ O TÉCNICO: a tela, a mensagem do erro, a pilha, a versão e o
 * navegador. Nada da ficha nem do que a pessoa digitou — quem gravou sai da
 * sessão, no próprio banco.
 *
 * COM FREIO: o mesmo erro uma vez por minuto, e no máximo 20 por sessão. Um
 * erro que se repete a cada desenho não pode virar mil linhas por pessoa.
 */
import { supabase, usandoNuvem, temSessaoViva } from './supabase';
import { versaoDesteAplicativo } from './versao';

export const MAXIMO_POR_SESSAO = 20;
export const INTERVALO_DO_MESMO_ERRO_MS = 60_000;

export interface ErroDoApp {
  tela: string;
  mensagem: string;
  pilha?: string;
}

const ultimaVez = new Map<string, number>();
let enviadosNestaSessao = 0;

/** Para os testes: começa uma sessão nova */
export const zerarRegistroDeErros = (): void => {
  ultimaVez.clear();
  enviadosNestaSessao = 0;
};

/** A linha como vai ao banco — cortada, para nenhum erro virar um texto gigante */
export const linhaDoErro = (e: ErroDoApp) => ({
  tela: e.tela.slice(0, 80),
  mensagem: (e.mensagem || 'Erro sem mensagem').slice(0, 500),
  pilha: e.pilha ? e.pilha.slice(0, 4000) : null,
  versao: versaoDesteAplicativo().slice(0, 40),
  navegador: (typeof navigator !== 'undefined' ? navigator.userAgent : '').slice(0, 200),
});

/** Se este erro deve ir ao banco agora (o freio), e já conta o envio */
export const deveRegistrar = (e: ErroDoApp, agora = Date.now()): boolean => {
  if (enviadosNestaSessao >= MAXIMO_POR_SESSAO) return false;
  const chave = `${e.tela}|${e.mensagem}`;
  const antes = ultimaVez.get(chave);
  if (antes !== undefined && agora - antes < INTERVALO_DO_MESMO_ERRO_MS) return false;
  ultimaVez.set(chave, agora);
  enviadosNestaSessao++;
  return true;
};

/**
 * Registra um erro. Nunca lança: o registro de erro que falha não pode
 * derrubar a tela que só queria avisar.
 */
export const registrarErro = (e: ErroDoApp): void => {
  try {
    console.error(`[${e.tela}] ${e.mensagem}`);
    if (!deveRegistrar(e)) return;
    if (!usandoNuvem() || !supabase || !temSessaoViva()) return;
    void supabase
      .from('erros_do_app')
      .insert(linhaDoErro(e))
      .then(() => undefined, () => undefined);
  } catch {
    // Sem registro: o erro original já foi para o console
  }
};

let vigiando = false;

/** Os erros que nenhuma tela segurou: os soltos do navegador e as promessas sem `catch` */
export const vigiarErrosGlobais = (): void => {
  if (vigiando || typeof window === 'undefined') return;
  vigiando = true;
  window.addEventListener('error', (evento) => {
    registrarErro({
      tela: 'global',
      mensagem: evento.message || String(evento.error),
      pilha: evento.error instanceof Error ? evento.error.stack : undefined,
    });
  });
  window.addEventListener('unhandledrejection', (evento) => {
    const motivo = evento.reason;
    registrarErro({
      tela: 'global (promessa)',
      mensagem: motivo instanceof Error ? motivo.message : String(motivo),
      pilha: motivo instanceof Error ? motivo.stack : undefined,
    });
  });
};
