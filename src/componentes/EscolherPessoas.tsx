/**
 * ESCOLHER PESSOAS — o passo de "quem entra", na criação do grupo e no
 * "Adicionar participantes". Uma tela só para os dois, como no WhatsApp:
 *
 *   - BUSCA no alto (a rede tem quase noventa pessoas);
 *   - os ESCOLHIDOS em fichas logo abaixo — um toque desmarca, sem ter de
 *     achar a pessoa de novo na lista;
 *   - a lista com a marcação à direita, linhas de 64px;
 *   - o botão de seguir FIXO EMBAIXO, ao alcance do polegar, dizendo
 *     quantos vão ("Adicionar 3") — e apagado enquanto não há ninguém.
 *
 * Cobre a tela de quem a abre (posição absoluta): o "voltar" do Android
 * volta um passo, e não a conversa inteira.
 */
import React, { useMemo, useState } from 'react';
import { ArrowLeft, Check, Search, X } from 'lucide-react';
import { Colaborador } from '../tipos';
import { useVoltar } from '../servicos/voltar';
import { FotoPresenca } from './FotoPresenca';

export const EscolherPessoas: React.FC<{
  titulo: string;
  candidatos: Colaborador[];
  /** O texto do botão de baixo para N escolhidos — "Avançar", "Adicionar 3". */
  textoDoBotao: (escolhidos: number) => string;
  /** Já marcados ao abrir (voltando do passo do nome, na criação). */
  iniciais?: string[];
  ocupado?: boolean;
  erro?: string | null;
  aoVoltar: () => void;
  aoConfirmar: (ids: string[]) => void;
}> = ({ titulo, candidatos, textoDoBotao, iniciais = [], ocupado, erro, aoVoltar, aoConfirmar }) => {
  useVoltar(true, aoVoltar);
  const [busca, setBusca] = useState('');
  const [marcados, setMarcados] = useState<string[]>(iniciais);

  const termo = busca.trim().toLowerCase();
  const lista = useMemo(
    () =>
      [...candidatos]
        .filter((c) => !termo || [c.nome, c.cargo, c.loja, c.setor].some((x) => (x || '').toLowerCase().includes(termo)))
        .sort((a, b) => a.nome.localeCompare(b.nome)),
    [candidatos, termo]
  );
  const escolhidos = marcados.map((id) => candidatos.find((c) => c.id === id)).filter((c): c is Colaborador => !!c);

  const alternar = (id: string) =>
    setMarcados((m) => (m.includes(id) ? m.filter((x) => x !== id) : [...m, id]));

  return (
    <div className="absolute inset-0 z-50 flex flex-col bg-[var(--c-canvas)]" role="dialog" aria-modal="true" aria-label={titulo}>
      <header className="flex items-center gap-2 px-2 h-14 bg-[var(--c-superficie)] border-b border-[var(--c-borda)] flex-shrink-0">
        <button
          type="button"
          onClick={aoVoltar}
          aria-label="Voltar"
          className="w-10 h-10 rounded-full flex items-center justify-center text-[var(--c-texto)] hover:bg-[var(--c-superficie-2)]"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-[var(--c-texto)] truncate">{titulo}</h2>
          <p className="text-xs text-[var(--c-texto-3)]">
            {marcados.length === 0 ? 'Toque nas pessoas para escolher' : `${marcados.length} de ${candidatos.length} escolhidos`}
          </p>
        </div>
      </header>

      <div className="px-3 py-2 bg-[var(--c-superficie)] border-b border-[var(--c-borda)] flex flex-col gap-2 flex-shrink-0">
        <div className="relative">
          <Search className="w-4 h-4 text-[var(--c-texto-3)] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            id="busca-escolher-pessoas"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por nome, cargo ou loja"
            className="w-full h-10 pl-9 pr-3 rounded-xl bg-[var(--c-superficie-2)] text-sm text-[var(--c-texto)] outline-none border border-transparent focus:border-[var(--c-acento)]"
          />
        </div>

        {escolhidos.length > 0 && (
          <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
            {escolhidos.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => alternar(c.id)}
                aria-label={`Tirar ${c.nome}`}
                className="flex-shrink-0 w-14 flex flex-col items-center gap-1"
              >
                <span className="relative">
                  <FotoPresenca foto={c.foto} nome={c.nome} presenca={c.presenca} tamanho="w-11 h-11" />
                  <span className="absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full bg-[var(--c-texto-3)] text-[var(--c-superficie)] flex items-center justify-center border-2 border-[var(--c-superficie)]">
                    <X className="w-3 h-3" />
                  </span>
                </span>
                <span className="w-full text-[11px] text-[var(--c-texto-2)] truncate text-center">{c.nome.split(' ')[0]}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <ul className="flex-1 overflow-y-auto bg-[var(--c-superficie)]">
        {lista.map((c) => {
          const marcado = marcados.includes(c.id);
          return (
            <li key={c.id}>
              <button
                type="button"
                id={`escolher-${c.id}`}
                onClick={() => alternar(c.id)}
                aria-pressed={marcado}
                className="w-full min-h-[64px] px-4 py-2 flex items-center gap-4 text-left hover:bg-[var(--c-superficie-2)] active:bg-[var(--c-superficie-2)]"
              >
                <FotoPresenca foto={c.foto} nome={c.nome} presenca={c.presenca} tamanho="w-10 h-10" />
                <span className="flex-1 min-w-0">
                  <span className="block text-[15px] font-medium text-[var(--c-texto)] truncate">{c.nome}</span>
                  <span className="block text-xs text-[var(--c-texto-3)] truncate">
                    {c.cargo} · {c.loja}
                  </span>
                </span>
                <span
                  className={`w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                    marcado ? 'bg-[var(--c-acento)] border-[var(--c-acento)] text-[var(--c-sobre-acento)]' : 'border-[var(--c-borda-forte)]'
                  }`}
                >
                  {marcado && <Check className="w-3.5 h-3.5" strokeWidth={3} />}
                </span>
              </button>
            </li>
          );
        })}
        {lista.length === 0 && (
          <li className="px-4 py-10 text-center text-sm text-[var(--c-texto-3)]">
            {candidatos.length === 0 ? 'Todo mundo já está no grupo.' : `Ninguém com “${busca.trim()}”.`}
          </li>
        )}
      </ul>

      <div className="p-3 bg-[var(--c-superficie)] border-t border-[var(--c-borda)] flex-shrink-0 pb-[max(12px,env(safe-area-inset-bottom))] flex flex-col gap-2">
        {erro && <p role="alert" className="text-xs font-semibold text-red-600 text-center">{erro}</p>}
        <button
          type="button"
          id="confirmar-escolha-de-pessoas"
          disabled={marcados.length === 0 || ocupado}
          onClick={() => aoConfirmar(marcados)}
          className="w-full h-12 rounded-2xl bg-[var(--c-acento)] text-[var(--c-sobre-acento)] text-[15px] font-bold disabled:opacity-40"
        >
          {ocupado ? 'Aguarde…' : textoDoBotao(marcados.length)}
        </button>
      </div>
    </div>
  );
};
