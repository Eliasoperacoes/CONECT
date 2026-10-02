/**
 * NOVO GRUPO — qualquer pessoa cria (Elias, 03/10/2026, no modelo do
 * WhatsApp), e quem cria vira administrador do grupo.
 *
 * Nome, e quem entra: com busca (a rede tem quase noventa pessoas) e os
 * escolhidos em fichas no alto, para ver de relance quem já foi marcado e
 * desmarcar sem procurar na lista.
 *
 * Quem decide se pode é o banco (`criar_grupo`): a tela espera a resposta,
 * e só fecha quando o grupo existe.
 */
import React, { useMemo, useState } from 'react';
import { ArrowLeft, Check, Search, X } from 'lucide-react';
import { Colaborador } from '../tipos';
import { useVoltar } from '../servicos/voltar';
import { FotoPresenca } from './FotoPresenca';

interface PropsModalCriarGrupo {
  aberto: boolean;
  colegas: Colaborador[];
  aoCriar: (nome: string, participantesIds: string[]) => Promise<{ sucesso: boolean; erro?: string }>;
  aoFechar: () => void;
}

export const ModalCriarGrupo: React.FC<PropsModalCriarGrupo> = ({ aberto, colegas, aoCriar, aoFechar }) => {
  useVoltar(aberto, aoFechar);
  const [nome, setNome] = useState('');
  const [selecionados, setSelecionados] = useState<string[]>([]);
  const [busca, setBusca] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const termo = busca.trim().toLowerCase();
  const filtrados = useMemo(
    () =>
      termo
        ? colegas.filter((c) => [c.nome, c.cargo, c.loja, c.setor].some((campo) => (campo || '').toLowerCase().includes(termo)))
        : colegas,
    [colegas, termo]
  );

  if (!aberto) return null;

  const alternarColega = (id: string) => {
    setSelecionados((atuais) => (atuais.includes(id) ? atuais.filter((item) => item !== id) : [...atuais, id]));
  };

  const fechar = () => {
    setNome('');
    setSelecionados([]);
    setBusca('');
    setErro(null);
    aoFechar();
  };

  const handleSalvar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nome.trim() || selecionados.length === 0 || salvando) return;
    setSalvando(true);
    setErro(null);
    const res = await aoCriar(nome.trim(), selecionados);
    setSalvando(false);
    if (res.sucesso) fechar();
    else setErro(res.erro || 'Não foi possível criar o grupo.');
  };

  const escolhidos = selecionados
    .map((id) => colegas.find((c) => c.id === id))
    .filter((c): c is Colaborador => !!c);

  return (
    <div
      id="modal-criar-grupo"
      className="fixed z-50 top-0 left-0 right-0 bottom-0 w-full h-[100dvh] md:top-auto md:left-auto md:right-6 md:bottom-0 md:w-[340px] md:h-[560px] md:max-h-[calc(100dvh-96px)] bg-[var(--c-canvas)] flex flex-col md:rounded-t-2xl md:border md:border-b-0 md:border-[var(--c-borda)] md:shadow-[var(--s-3)] overflow-hidden"
    >
      {/* Cabeçalho */}
      <header className="w-full bg-[var(--c-superficie)] border-b border-[var(--c-borda)] px-3 py-2.5 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            id="botao-voltar-criar-grupo"
            onClick={fechar}
            className="w-10 h-10 flex items-center justify-center text-[var(--c-texto)] rounded-full hover:bg-[var(--c-superficie-2)] active:bg-[var(--c-superficie-2)]"
            aria-label="Voltar"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-base font-semibold text-[var(--c-texto)]">Novo grupo</h1>
            <p className="text-xs text-[var(--c-texto-3)]">
              {selecionados.length === 0
                ? 'Escolha quem participa'
                : `${selecionados.length} ${selecionados.length === 1 ? 'pessoa escolhida' : 'pessoas escolhidas'}`}
            </p>
          </div>
        </div>

        <button
          type="button"
          id="botao-confirmar-criar-grupo"
          onClick={handleSalvar}
          disabled={!nome.trim() || selecionados.length === 0 || salvando}
          className="px-4 py-1.5 rounded-lg bg-[var(--c-acento)] text-[var(--c-sobre-acento)] text-sm font-medium disabled:opacity-40"
        >
          {salvando ? 'Criando…' : 'Criar'}
        </button>
      </header>

      {/* Nome do grupo */}
      <div className="p-4 bg-[var(--c-superficie)] border-b border-[var(--c-borda)] flex flex-col gap-3">
        <div>
          <label htmlFor="campo-nome-grupo" className="block text-xs font-medium text-[var(--c-texto-3)] mb-1.5">
            Nome do grupo
          </label>
          <input
            id="campo-nome-grupo"
            type="text"
            value={nome}
            maxLength={80}
            onChange={(e) => setNome(e.target.value)}
            placeholder="Ex: Balcão Plantão Sábado"
            className="w-full bg-[var(--c-superficie-2)] text-[var(--c-texto)] text-sm rounded-lg px-3 py-2.5 outline-none border border-transparent focus:border-[var(--c-acento)] placeholder:text-[var(--c-texto-3)]"
          />
        </div>

        {/* Os escolhidos, em fichas: um toque desmarca */}
        {escolhidos.length > 0 && (
          <div className="flex gap-1.5 overflow-x-auto -mx-1 px-1 pb-0.5">
            {escolhidos.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => alternarColega(c.id)}
                aria-label={`Tirar ${c.nome}`}
                className="flex-shrink-0 h-8 pl-1 pr-2 rounded-full bg-[var(--c-superficie-2)] border border-[var(--c-borda)] flex items-center gap-1.5 text-xs text-[var(--c-texto)]"
              >
                <FotoPresenca foto={c.foto} nome={c.nome} presenca={c.presenca} tamanho="w-6 h-6" />
                <span className="max-w-[90px] truncate">{c.nome.split(' ')[0]}</span>
                <X className="w-3 h-3 text-[var(--c-texto-3)]" />
              </button>
            ))}
          </div>
        )}

        {erro && <p role="alert" className="text-xs font-semibold text-red-600">{erro}</p>}
      </div>

      {/* Busca */}
      <div className="px-3 py-2 bg-[var(--c-canvas)]">
        <div className="relative flex items-center">
          <Search className="w-4 h-4 text-[var(--c-texto-3)] absolute left-3 pointer-events-none" />
          <input
            id="busca-criar-grupo"
            type="text"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por nome, cargo ou loja…"
            className="w-full bg-[var(--c-superficie)] text-[var(--c-texto)] text-sm rounded-lg pl-9 pr-3 py-2 outline-none border border-[var(--c-borda)] focus:border-[var(--c-acento)] placeholder:text-[var(--c-texto-3)]"
          />
        </div>
      </div>

      {/* Seleção de participantes */}
      <div className="flex-1 overflow-y-auto">
        <div className="divide-y divide-[var(--c-borda)] bg-[var(--c-superficie)]">
          {filtrados.map((colega) => {
            const marcado = selecionados.includes(colega.id);
            return (
              <button
                key={colega.id}
                type="button"
                id={`selecionar-membro-${colega.id}`}
                onClick={() => alternarColega(colega.id)}
                className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-[var(--c-superficie-2)] transition-colors min-h-[56px]"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <FotoPresenca foto={colega.foto} nome={colega.nome} presenca={colega.presenca} tamanho="w-10 h-10" />
                  <div className="min-w-0">
                    <span className="font-medium text-sm text-[var(--c-texto)] block truncate">{colega.nome}</span>
                    <span className="text-xs text-[var(--c-texto-3)] block truncate">
                      {colega.cargo} · {colega.loja}
                    </span>
                  </div>
                </div>

                <div
                  className={`w-5 h-5 rounded-md border flex items-center justify-center transition-colors flex-shrink-0 ${
                    marcado
                      ? 'bg-[var(--c-acento)] border-[var(--c-acento)] text-[var(--c-sobre-acento)]'
                      : 'border-[var(--c-borda-forte)] bg-transparent'
                  }`}
                >
                  {marcado && <Check className="w-3.5 h-3.5" />}
                </div>
              </button>
            );
          })}
          {filtrados.length === 0 && (
            <p className="py-8 text-center text-xs text-[var(--c-texto-3)]">Ninguém com “{busca.trim()}”.</p>
          )}
        </div>
      </div>
    </div>
  );
};
