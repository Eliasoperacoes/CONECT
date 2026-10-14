/**
 * "ESCREVER COM IA" — o painel do editor da Central (14/10/2026).
 *
 * Cinco ações, e nenhuma conversa livre: criar a partir de tópicos,
 * melhorar, encurtar, mudar o tom e sugerir título. O resultado aparece
 * como PRÉVIA, do jeito que o leitor verá; só "Usar" mexe no editor.
 * Publicar continua sendo um clique da pessoa, depois de ler.
 *
 * As regras moram fora daqui: o que a IA recebe e devolve em
 * `servidor/escritaComIa.ts`, o que fica no aparelho em
 * `servicos/assistenteDeEscrita.ts`, quem pode e quanto no banco.
 */
import React, { useState } from 'react';
import { Sparkles, X, Loader2, Wand2, Scissors, Type, Heading, ShieldAlert, RotateCcw, Check } from 'lucide-react';
import type { TipoPublicacao } from '../tipos';
import type { AcaoDaIa, TomDaIa } from '../servidor/escritaComIa';
import { pedirTextoAIa } from '../servicos/assistenteDeEscrita';
import { TextoFormatado } from './EditorTexto';
import { useVoltar } from '../servicos/voltar';

interface Props {
  tipo: TipoPublicacao;
  titulo: string;
  conteudo: string;
  aoUsar: (r: { titulo?: string; texto?: string }) => void;
  aoFechar: () => void;
}

const TONS: Array<{ tom: TomDaIa; rotulo: string }> = [
  { tom: 'formal', rotulo: 'Formal' },
  { tom: 'acolhedor', rotulo: 'Acolhedor' },
  { tom: 'direto', rotulo: 'Direto' },
];

type Resultado = { acao: AcaoDaIa; titulo?: string; texto?: string };

export const AssistenteDeEscrita: React.FC<Props> = ({ tipo, titulo, conteudo, aoUsar, aoFechar }) => {
  const temTexto = conteudo.trim().length >= 3;
  const [aba, setAba] = useState<'criar' | 'revisar'>(temTexto ? 'revisar' : 'criar');
  const [topicos, setTopicos] = useState('');
  const [pensando, setPensando] = useState<AcaoDaIa | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [restantes, setRestantes] = useState<number | null>(null);
  const [ultimo, setUltimo] = useState<{ acao: AcaoDaIa; tom?: TomDaIa } | null>(null);

  useVoltar(true, aoFechar);

  const pedir = async (acao: AcaoDaIa, tom?: TomDaIa) => {
    setErro(null);
    setResultado(null);
    setPensando(acao);
    setUltimo({ acao, tom });
    const entrada = acao === 'criar' ? topicos : acao === 'titulo' ? `${titulo}\n\n${conteudo}` : conteudo;
    const r = await pedirTextoAIa({ acao, entrada, tom, tipo });
    setPensando(null);
    if ('erro' in r) {
      setErro(r.erro);
      return;
    }
    setRestantes(r.restantes);
    setResultado({ acao, titulo: r.titulo, texto: r.texto });
  };

  const usar = () => {
    if (!resultado) return;
    // Criar não troca o título que a pessoa já escreveu; "Sugerir título" troca, é o pedido
    const trocaTitulo = resultado.acao === 'titulo' || !titulo.trim();
    aoUsar({ titulo: trocaTitulo ? resultado.titulo : undefined, texto: resultado.texto });
    aoFechar();
  };

  const botaoAcao =
    'w-full px-3 py-2.5 rounded-xl border border-[var(--c-borda)] bg-[var(--c-superficie)] text-left text-sm font-semibold text-[var(--c-texto)] hover:border-[var(--c-acento)] disabled:opacity-40 flex items-center gap-2.5 transition-colors';

  return (
    <div
      id="assistente-de-escrita"
      className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-[2px]"
      onClick={aoFechar}
    >
      <div
        role="dialog"
        aria-label="Escrever com IA"
        onClick={(e) => e.stopPropagation()}
        className="w-full sm:max-w-lg max-h-[92dvh] flex flex-col rounded-t-3xl sm:rounded-3xl bg-[var(--c-canvas)] shadow-2xl overflow-hidden"
      >
        <header className="shrink-0 flex items-center gap-3 px-5 pt-5 pb-3">
          <div className="w-9 h-9 rounded-xl bg-[var(--c-acento)] text-[var(--c-sobre-acento)] flex items-center justify-center">
            <Sparkles className="w-4.5 h-4.5" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-extrabold text-[var(--c-texto)]">Escrever com IA</h2>
            <p className="text-[11px] text-[var(--c-texto-3)]">Você revisa antes de usar. Nada é publicado sozinho.</p>
          </div>
          <button
            type="button"
            onClick={aoFechar}
            className="w-9 h-9 rounded-full flex items-center justify-center text-[var(--c-texto-2)] hover:bg-[var(--c-superficie-2)]"
            title="Fechar"
          >
            <X className="w-5 h-5" />
          </button>
        </header>

        <div className="shrink-0 px-5">
          <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-[var(--c-superficie-2)]">
            {(['criar', 'revisar'] as const).map((a) => (
              <button
                key={a}
                type="button"
                onClick={() => {
                  setAba(a);
                  setResultado(null);
                  setErro(null);
                }}
                className={`py-2 rounded-lg text-xs font-bold transition-colors ${
                  aba === a ? 'bg-[var(--c-canvas)] text-[var(--c-texto)] shadow-sm' : 'text-[var(--c-texto-3)]'
                }`}
              >
                {a === 'criar' ? 'Criar a partir de tópicos' : 'Revisar o que escrevi'}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4 flex flex-col gap-3">
          {!resultado && aba === 'criar' && (
            <>
              <label htmlFor="topicos-da-ia" className="text-xs font-bold text-[var(--c-texto-2)]">
                O que a publicação precisa dizer?
              </label>
              <textarea
                id="topicos-da-ia"
                value={topicos}
                onChange={(e) => setTopicos(e.target.value)}
                rows={5}
                maxLength={6000}
                placeholder={'Ex.: inventário no sábado 18/10\ncomeça 7h30, loja fechada ao público\ntodos do balcão e estoque\ntrazer uniforme'}
                className="w-full px-3.5 py-3 rounded-2xl border border-[var(--c-borda)] bg-[var(--c-superficie)] text-sm text-[var(--c-texto)] placeholder:text-[var(--c-texto-3)] focus:outline-none focus:border-[var(--c-acento)] resize-none"
              />
              <button
                type="button"
                disabled={!!pensando || topicos.trim().length < 3}
                onClick={() => pedir('criar')}
                className="w-full py-3 rounded-2xl bg-[var(--c-acento)] text-[var(--c-sobre-acento)] text-sm font-bold disabled:opacity-40 flex items-center justify-center gap-2"
              >
                {pensando === 'criar' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                {pensando === 'criar' ? 'Escrevendo...' : 'Escrever'}
              </button>
            </>
          )}

          {!resultado && aba === 'revisar' && (
            <>
              {!temTexto && (
                <p className="text-sm text-[var(--c-texto-3)]">
                  Escreva o texto no editor primeiro, ou use "Criar a partir de tópicos".
                </p>
              )}
              <button type="button" disabled={!temTexto || !!pensando} onClick={() => pedir('melhorar')} className={botaoAcao}>
                {pensando === 'melhorar' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4 text-[var(--c-acento)]" />}
                <span className="flex-1">Melhorar o texto<span className="block text-[11px] font-normal text-[var(--c-texto-3)]">Corrige o português e organiza, sem mudar o conteúdo</span></span>
              </button>
              <button type="button" disabled={!temTexto || !!pensando} onClick={() => pedir('encurtar')} className={botaoAcao}>
                {pensando === 'encurtar' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Scissors className="w-4 h-4 text-[var(--c-acento)]" />}
                <span className="flex-1">Encurtar<span className="block text-[11px] font-normal text-[var(--c-texto-3)]">Mais ou menos metade, sem perder datas e horários</span></span>
              </button>
              <div className={`${botaoAcao} cursor-default hover:border-[var(--c-borda)] ${!temTexto ? 'opacity-40' : ''}`}>
                {pensando === 'tom' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Type className="w-4 h-4 text-[var(--c-acento)]" />}
                <span className="flex-1">Mudar o tom</span>
                <span className="flex gap-1">
                  {TONS.map(({ tom, rotulo }) => (
                    <button
                      key={tom}
                      type="button"
                      disabled={!temTexto || !!pensando}
                      onClick={() => pedir('tom', tom)}
                      className="px-2.5 py-1 rounded-lg bg-[var(--c-superficie-2)] text-[11px] font-bold text-[var(--c-texto-2)] hover:text-[var(--c-texto)] disabled:opacity-40"
                    >
                      {rotulo}
                    </button>
                  ))}
                </span>
              </div>
              <button type="button" disabled={!temTexto || !!pensando} onClick={() => pedir('titulo')} className={botaoAcao}>
                {pensando === 'titulo' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Heading className="w-4 h-4 text-[var(--c-acento)]" />}
                <span className="flex-1">Sugerir título</span>
              </button>
            </>
          )}

          {erro && (
            <div className="rounded-2xl border border-red-500/25 bg-red-500/5 px-3.5 py-3 text-sm text-red-700 dark:text-red-400">
              {erro}
            </div>
          )}

          {resultado && (
            <div className="flex flex-col gap-3">
              <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--c-texto-3)]">Sugestão da IA</span>
              <div className="rounded-2xl border border-[var(--c-borda)] bg-[var(--c-superficie)] p-4">
                {resultado.titulo && (
                  <p className="text-lg font-extrabold text-[var(--c-texto)] mb-2">{resultado.titulo}</p>
                )}
                {resultado.texto && <TextoFormatado texto={resultado.texto} />}
              </div>
              {/* [horário], [local]: o que faltou no pedido — e não um link, que segue com "(" */}
              {resultado.texto && /\[[^\]\n]{1,40}\](?!\()/.test(resultado.texto.replace(/\[!(IMPORTANTE|ATENCAO|DICA)\]/g, '')) && (
                <p className="text-xs text-amber-700 dark:text-amber-400">
                  Os trechos entre colchetes, como [horário], são o que faltou no pedido: complete antes de publicar.
                </p>
              )}
            </div>
          )}
        </div>

        <footer className="shrink-0 border-t border-[var(--c-borda)] px-5 py-3 flex flex-col gap-2.5">
          {resultado && (
            <div className="grid grid-cols-[auto_1fr] gap-2">
              <button
                type="button"
                disabled={!!pensando}
                onClick={() => ultimo && pedir(ultimo.acao, ultimo.tom)}
                className="px-3.5 py-2.5 rounded-xl border border-[var(--c-borda)] text-xs font-bold text-[var(--c-texto-2)] flex items-center gap-1.5 disabled:opacity-40"
              >
                {pensando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />}
                Outra versão
              </button>
              <button
                type="button"
                onClick={usar}
                className="py-2.5 rounded-xl bg-[var(--c-acento)] text-[var(--c-sobre-acento)] text-xs font-bold flex items-center justify-center gap-1.5"
              >
                <Check className="w-3.5 h-3.5" />
                {resultado.acao === 'titulo' ? 'Usar este título' : temTexto ? 'Substituir pelo texto da IA' : 'Usar este texto'}
              </button>
            </div>
          )}
          <p className="flex items-start gap-1.5 text-[11px] leading-snug text-[var(--c-texto-3)]">
            <ShieldAlert className="w-3.5 h-3.5 shrink-0 mt-px" />
            <span>
              O texto vai para a IA do Google. Não escreva CPF, salário, atestado ou dados pessoais. Imagens, links e pessoas citadas
              não saem do CONECTA.
              {restantes !== null && ` · ${restantes} uso${restantes === 1 ? '' : 's'} restante${restantes === 1 ? '' : 's'} hoje`}
            </span>
          </p>
        </footer>
      </div>
    </div>
  );
};
