import React, { useState } from 'react';
import { ArrowLeft, Check } from 'lucide-react';
import { Colaborador } from '../tipos';

interface PropsModalCriarGrupo {
  aberto: boolean;
  colegas: Colaborador[];
  aoCriar: (nome: string, participantesIds: string[]) => void;
  aoFechar: () => void;
}

export const ModalCriarGrupo: React.FC<PropsModalCriarGrupo> = ({
  aberto,
  colegas,
  aoCriar,
  aoFechar,
}) => {
  const [nome, setNome] = useState('');
  const [selecionados, setSelecionados] = useState<string[]>([]);

  if (!aberto) return null;

  const alternarColega = (id: string) => {
    setSelecionados((atuais) =>
      atuais.includes(id) ? atuais.filter((item) => item !== id) : [...atuais, id]
    );
  };

  const handleSalvar = (e: React.FormEvent) => {
    e.preventDefault();
    if (!nome.trim() || selecionados.length === 0) return;
    aoCriar(nome.trim(), selecionados);
    setNome('');
    setSelecionados([]);
    aoFechar();
  };

  return (
    <div
      id="modal-criar-grupo"
      className="fixed z-50 top-0 left-0 right-0 bottom-0 w-full h-[100dvh] md:top-auto md:left-auto md:right-6 md:bottom-0 md:w-[340px] md:h-[520px] md:max-h-[calc(100dvh-96px)] bg-[var(--c-canvas)] flex flex-col md:rounded-t-2xl md:border md:border-b-0 md:border-[var(--c-borda)] md:shadow-[var(--s-3)] overflow-hidden"
    >
      {/* Cabeçalho */}
      <header className="w-full bg-[var(--c-superficie)] border-b border-[var(--c-borda)] px-3 py-2.5 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            id="botao-voltar-criar-grupo"
            onClick={aoFechar}
            className="w-10 h-10 flex items-center justify-center text-[var(--c-texto)] rounded-full hover:bg-[var(--c-superficie-2)] active:bg-[var(--c-superficie-2)]"
            aria-label="Voltar"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-base font-semibold text-[var(--c-texto)]">
              Novo grupo
            </h1>
            <p className="text-xs text-[var(--c-texto-3)]">
              {selecionados.length} selecionado(s)
            </p>
          </div>
        </div>

        <button
          type="button"
          id="botao-confirmar-criar-grupo"
          onClick={handleSalvar}
          disabled={!nome.trim() || selecionados.length === 0}
          className="px-4 py-1.5 rounded-lg bg-[var(--c-acento)] text-[var(--c-sobre-acento)] text-sm font-medium disabled:opacity-40"
        >
          Criar
        </button>
      </header>

      {/* Nome do grupo */}
      <div className="p-4 bg-[var(--c-superficie)] border-b border-[var(--c-borda)]">
        <label htmlFor="campo-nome-grupo" className="block text-xs font-medium text-[var(--c-texto-3)] mb-1.5">
          Nome do grupo
        </label>
        <input
          id="campo-nome-grupo"
          type="text"
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          placeholder="Ex: Balcão Plantão Sábado"
          className="w-full bg-[var(--c-superficie-2)] text-[var(--c-texto)] text-sm rounded-lg px-3 py-2.5 outline-none border border-transparent focus:border-[var(--c-acento)] placeholder:text-[var(--c-texto-3)]"
        />
      </div>

      {/* Seleção de participantes */}
      <div className="flex-1 overflow-y-auto">
        <div className="px-4 py-2 text-xs font-semibold text-[var(--c-texto-3)] uppercase tracking-wider bg-[var(--c-canvas)]">
          Adicionar participantes
        </div>
        <div className="divide-y divide-[var(--c-borda)] bg-[var(--c-superficie)]">
          {colegas.map((colega) => {
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
                  <div className="w-10 h-10 rounded-full overflow-hidden bg-[var(--c-superficie-2)] border border-[var(--c-borda)] flex-shrink-0 flex items-center justify-center">
                    {colega.foto ? (
                      <img
                        src={colega.foto}
                        alt={colega.nome}
                        className="w-full h-full object-cover"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <span className="font-semibold text-sm text-[var(--c-texto-2)]">
                        {colega.nome.charAt(0)}
                      </span>
                    )}
                  </div>
                  <div className="min-w-0">
                    <span className="font-medium text-sm text-[var(--c-texto)] block truncate">
                      {colega.nome}
                    </span>
                    <span className="text-xs text-[var(--c-texto-3)] block truncate">
                      {colega.cargo} · {colega.loja}
                    </span>
                  </div>
                </div>

                <div
                  className={`w-5 h-5 rounded-md border flex items-center justify-center transition-colors ${
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
        </div>
      </div>
    </div>
  );
};
