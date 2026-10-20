/**
 * A PROTEÇÃO DE UMA TELA (20/10/2026)
 *
 * Sem ela, qualquer erro ao desenhar uma tela derrubava o sistema inteiro
 * numa tela branca — já aconteceu, com o botão "Cadastro" do Banco de Horas.
 * Agora o erro fica preso na tela onde nasceu: ela mostra o aviso, o resto
 * (barra lateral, conversas) continua funcionando, e o erro vai para o
 * registro do TI (`registrarErro`).
 *
 * Tem de ser classe: é o único jeito do React de segurar erro de desenho.
 */
import React from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';
import { registrarErro } from '../servicos/registroDeErros';

interface Props {
  /** O nome da tela, para o registro do TI */
  nome: string;
  /** O sistema inteiro: o aviso ocupa a tela toda */
  inteiro?: boolean;
  children: React.ReactNode;
}

interface Estado {
  erro: Error | null;
}

export class ProtecaoDaTela extends React.Component<Props, Estado> {
  state: Estado = { erro: null };

  static getDerivedStateFromError(erro: Error): Estado {
    return { erro };
  }

  componentDidCatch(erro: Error, info: React.ErrorInfo): void {
    registrarErro({
      tela: this.props.nome,
      mensagem: erro.message,
      pilha: `${erro.stack || ''}\n--- componentes ---${info.componentStack || ''}`,
    });
  }

  render(): React.ReactNode {
    if (!this.state.erro) return this.props.children;

    return (
      <div
        role="alert"
        id="protecao-da-tela"
        className={`flex items-center justify-center p-6 ${this.props.inteiro ? 'min-h-[100dvh] bg-[var(--c-canvas)]' : 'min-h-[50vh]'}`}
      >
        <div className="max-w-sm w-full rounded-2xl border border-[var(--c-borda)] bg-[var(--c-superficie)] p-5 flex flex-col items-center text-center gap-3 shadow-[var(--s-2)]">
          <div className="w-11 h-11 rounded-xl bg-amber-500/10 text-amber-600 flex items-center justify-center">
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-[var(--c-texto)]">Algo deu errado nesta tela</h2>
            <p className="text-xs text-[var(--c-texto-2)] mt-1 leading-relaxed">
              {this.props.inteiro
                ? 'O CONECTA encontrou um erro. O TI já foi avisado. Recarregue para continuar.'
                : 'O resto do sistema continua funcionando, e o TI já foi avisado. Tente abrir de novo.'}
            </p>
          </div>
          <div className="flex gap-2">
            {!this.props.inteiro && (
              <button
                type="button"
                onClick={() => this.setState({ erro: null })}
                className="px-3 py-2 rounded-xl border border-[var(--c-borda)] text-xs font-bold text-[var(--c-texto)] hover:bg-[var(--c-superficie-2)] flex items-center gap-1.5"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Tentar de novo
              </button>
            )}
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="px-3 py-2 rounded-xl bg-[var(--c-acento)] text-[var(--c-sobre-acento)] text-xs font-bold hover:brightness-110"
            >
              Recarregar o sistema
            </button>
          </div>
        </div>
      </div>
    );
  }
}
