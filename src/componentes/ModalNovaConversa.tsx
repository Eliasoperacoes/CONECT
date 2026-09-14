import React, { useState, useMemo } from 'react';
import { ArrowLeft, Search } from 'lucide-react';
import { Colaborador } from '../tipos';
import { FotoPresenca } from './FotoPresenca';

interface PropsModalNovaConversa {
  aberto: boolean;
  colegas: Colaborador[];
  aoSelecionar: (colegaId: string) => void;
  aoFechar: () => void;
}

export const ModalNovaConversa: React.FC<PropsModalNovaConversa> = ({
  aberto,
  colegas,
  aoSelecionar,
  aoFechar,
}) => {
  const [busca, setBusca] = useState('');

  const colegasFiltrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    if (!termo) return colegas;
    return colegas.filter(
      (c) =>
        c.nome.toLowerCase().includes(termo) ||
        c.cargo.toLowerCase().includes(termo) ||
        c.loja.toLowerCase().includes(termo) ||
        c.setor.toLowerCase().includes(termo)
    );
  }, [colegas, busca]);

  if (!aberto) return null;

  return (
    <div
      id="modal-nova-conversa"
      className="fixed inset-0 z-50 bg-[var(--c-canvas)] flex flex-col w-full h-[100dvh]"
    >
      {/* Cabeçalho */}
      <header className="w-full bg-[var(--c-superficie)] border-b border-[var(--c-borda)] px-3 py-2.5 flex items-center gap-3">
        <button
          type="button"
          id="botao-voltar-nova-conversa"
          onClick={aoFechar}
          className="w-10 h-10 flex items-center justify-center text-[var(--c-texto)] rounded-full hover:bg-[var(--c-superficie-2)] active:bg-[var(--c-superficie-2)]"
          aria-label="Voltar"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>

        <div className="flex-1">
          <h1 className="text-base font-semibold text-[var(--c-texto)]">
            Nova conversa
          </h1>
          <p className="text-xs text-[var(--c-texto-3)]">
            {colegas.length} colaboradores na rede
          </p>
        </div>
      </header>

      {/* Campo de busca */}
      <div className="p-3 bg-[var(--c-superficie)] border-b border-[var(--c-borda)]">
        <div className="relative flex items-center w-full">
          <Search className="w-4 h-4 text-[var(--c-texto-3)] absolute left-3 pointer-events-none" />
          <input
            id="campo-busca-colegas"
            type="text"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar colega por nome, cargo ou loja..."
            className="w-full bg-[var(--c-superficie-2)] text-[var(--c-texto)] text-sm rounded-lg pl-9 pr-3 py-2.5 outline-none border border-transparent focus:border-[var(--c-acento)] placeholder:text-[var(--c-texto-3)]"
          />
        </div>
      </div>

      {/* Lista de colegas */}
      <div className="flex-1 overflow-y-auto">
        {colegasFiltrados.length === 0 ? (
          <div className="py-12 text-center text-[var(--c-texto-3)] text-sm">
            Nenhum colega encontrado.
          </div>
        ) : (
          <div className="divide-y divide-[var(--c-borda)]">
            {colegasFiltrados.map((colega) => (
              <button
                key={colega.id}
                type="button"
                id={`colega-item-${colega.id}`}
                onClick={() => {
                  aoSelecionar(colega.id);
                  aoFechar();
                }}
                className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-[var(--c-superficie-2)] active:bg-[var(--c-superficie-2)] transition-colors min-h-[58px]"
              >
                <FotoPresenca
                  foto={colega.foto}
                  nome={colega.nome}
                  presenca={colega.presenca}
                  tamanho="w-11 h-11"
                />

                <div className="flex-1 min-w-0">
                  <span className="font-medium text-base text-[var(--c-texto)] block truncate">
                    {colega.nome}
                  </span>
                  <span className="text-xs text-[var(--c-texto-3)] block truncate">
                    {colega.cargo} · {colega.loja}
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
