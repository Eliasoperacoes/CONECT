/**
 * NOVO GRUPO — em dois passos, como no WhatsApp (Elias, 03/10/2026):
 *
 *   1. QUEM ENTRA (EscolherPessoas): busca, fichas, "Avançar";
 *   2. O NOME: a foto do grupo já com a inicial, o nome com o contador, e
 *      quem vai entrar à vista — "Criar grupo" embaixo.
 *
 * Nome e lista na mesma tela, no celular, tinha o teclado cobrindo a lista
 * enquanto se escolhia. Quem cria vira administrador do grupo; quem decide
 * se pode é o banco (`criar_grupo`), e a tela só fecha quando ele existe.
 */
import React, { useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { Colaborador } from '../tipos';
import { useVoltar } from '../servicos/voltar';
import { FotoPresenca } from './FotoPresenca';
import { EscolherPessoas } from './EscolherPessoas';

interface PropsModalCriarGrupo {
  aberto: boolean;
  colegas: Colaborador[];
  aoCriar: (nome: string, participantesIds: string[]) => Promise<{ sucesso: boolean; erro?: string }>;
  aoFechar: () => void;
}

const LIMITE_DO_NOME = 80;

export const ModalCriarGrupo: React.FC<PropsModalCriarGrupo> = ({ aberto, colegas, aoCriar, aoFechar }) => {
  const [passo, setPasso] = useState<'pessoas' | 'nome'>('pessoas');
  const [escolhidos, setEscolhidos] = useState<string[]>([]);
  const [nome, setNome] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  // No passo do nome, o "voltar" volta para a escolha (o do passo 1 é da EscolherPessoas)
  useVoltar(aberto && passo === 'nome', () => setPasso('pessoas'));

  if (!aberto) return null;

  const fechar = () => {
    setPasso('pessoas');
    setEscolhidos([]);
    setNome('');
    setErro(null);
    aoFechar();
  };

  const criar = async () => {
    if (!nome.trim() || salvando) return;
    setSalvando(true);
    setErro(null);
    const res = await aoCriar(nome.trim(), escolhidos);
    setSalvando(false);
    if (res.sucesso) fechar();
    else setErro(res.erro || 'Não foi possível criar o grupo.');
  };

  const pessoas = escolhidos.map((id) => colegas.find((c) => c.id === id)).filter((c): c is Colaborador => !!c);

  return (
    <div
      id="modal-criar-grupo"
      className="fixed z-50 top-0 left-0 right-0 bottom-0 w-full h-[100dvh] md:top-auto md:left-auto md:right-6 md:bottom-0 md:w-[380px] md:h-[600px] md:max-h-[calc(100dvh-96px)] bg-[var(--c-canvas)] flex flex-col md:rounded-t-2xl md:border md:border-b-0 md:border-[var(--c-borda)] md:shadow-[var(--s-3)] overflow-hidden"
    >
      {passo === 'pessoas' ? (
        <EscolherPessoas
          titulo="Novo grupo"
          candidatos={colegas}
          iniciais={escolhidos}
          textoDoBotao={(n) => (n ? `Avançar com ${n}` : 'Escolha quem participa')}
          aoVoltar={fechar}
          aoConfirmar={(ids) => {
            setEscolhidos(ids);
            setPasso('nome');
          }}
        />
      ) : (
        <>
          <header className="flex items-center gap-2 px-2 h-14 bg-[var(--c-superficie)] border-b border-[var(--c-borda)] flex-shrink-0">
            <button
              type="button"
              id="voltar-para-pessoas"
              onClick={() => setPasso('pessoas')}
              aria-label="Voltar para a escolha das pessoas"
              className="w-10 h-10 rounded-full flex items-center justify-center text-[var(--c-texto)] hover:bg-[var(--c-superficie-2)]"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <h1 className="text-base font-semibold text-[var(--c-texto)]">Novo grupo</h1>
          </header>

          <div className="flex-1 overflow-y-auto">
            {/* A FOTO E O NOME: a inicial aparece enquanto se digita */}
            <div className="bg-[var(--c-superficie)] border-b border-[var(--c-borda)] px-4 py-6 flex flex-col items-center gap-4">
              <span className="w-24 h-24 rounded-full bg-[var(--c-acento)]/15 text-[var(--c-acento)] flex items-center justify-center text-4xl font-bold">
                {nome.trim() ? nome.trim().charAt(0).toUpperCase() : '?'}
              </span>
              <div className="w-full">
                <label htmlFor="campo-nome-grupo" className="block text-xs font-semibold text-[var(--c-texto-3)] mb-1.5">
                  Nome do grupo
                </label>
                <input
                  id="campo-nome-grupo"
                  autoFocus
                  value={nome}
                  maxLength={LIMITE_DO_NOME}
                  onChange={(e) => setNome(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && criar()}
                  placeholder="Ex.: Balcão plantão sábado"
                  className="w-full h-12 px-3 rounded-xl bg-[var(--c-canvas)] border-2 border-[var(--c-borda)] focus:border-[var(--c-acento)] text-base text-[var(--c-texto)] outline-none"
                />
                <span className="block text-right text-[11px] text-[var(--c-texto-3)] mt-1 tabular-nums">
                  {nome.length}/{LIMITE_DO_NOME}
                </span>
              </div>
            </div>

            {/* QUEM VAI ENTRAR, à vista antes de criar */}
            <div className="px-4 pt-4 pb-2 text-xs font-semibold text-[var(--c-texto-3)]">
              {pessoas.length + 1} participantes · você entra como admin do grupo
            </div>
            <div className="px-4 pb-4 flex flex-wrap gap-3">
              {pessoas.map((c) => (
                <span key={c.id} className="w-14 flex flex-col items-center gap-1">
                  <FotoPresenca foto={c.foto} nome={c.nome} presenca={c.presenca} tamanho="w-11 h-11" />
                  <span className="w-full text-[11px] text-[var(--c-texto-2)] truncate text-center">{c.nome.split(' ')[0]}</span>
                </span>
              ))}
            </div>
          </div>

          <div className="p-3 bg-[var(--c-superficie)] border-t border-[var(--c-borda)] flex-shrink-0 pb-[max(12px,env(safe-area-inset-bottom))] flex flex-col gap-2">
            {erro && <p role="alert" className="text-xs font-semibold text-red-600 text-center">{erro}</p>}
            <button
              type="button"
              id="botao-confirmar-criar-grupo"
              disabled={!nome.trim() || salvando}
              onClick={criar}
              className="w-full h-12 rounded-2xl bg-[var(--c-acento)] text-[var(--c-sobre-acento)] text-[15px] font-bold disabled:opacity-40"
            >
              {salvando ? 'Criando…' : nome.trim() ? 'Criar grupo' : 'Dê um nome ao grupo'}
            </button>
          </div>
        </>
      )}
    </div>
  );
};
