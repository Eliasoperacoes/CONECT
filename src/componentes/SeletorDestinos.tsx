/**
 * PARA QUEM VAI — CONECTA / Malachias Autopeças
 *
 * Antes era um `select` com 'Todas' e cinco lojas. Não dava para mandar
 * ao Balcão das cinco unidades, nem a três pessoas específicas — e um
 * comunicado que chega a 89 pessoas quando interessa a 3 ensina as 89 a
 * ignorar comunicado.
 *
 * Quatro alcances, que SOMAM: loja + setor chega a quem está na loja E a
 * quem é do setor em qualquer loja. A conta de quem isso alcança está em
 * `mural.ts` — aqui só se escolhe. O total aparece embaixo, ao vivo,
 * porque escolher destino sem ver quantos são é escolher no escuro.
 */
import React, { useMemo, useState } from 'react';
import { Building2, Users, User, Globe, Search, X } from 'lucide-react';
import {
  Colaborador,
  DestinoPublicacao,
  INFORMACOES_LOJAS,
  SETORES,
} from '../tipos';
import { FotoPresenca } from './FotoPresenca';

interface Props {
  destinos: DestinoPublicacao[];
  aoMudar: (destinos: DestinoPublicacao[]) => void;
  colaboradores: Colaborador[];
}

/** Uma etiqueta ligável. Toda a barra de escolha é feita delas. */
const Chip: React.FC<{
  ligado: boolean;
  aoClicar: () => void;
  children: React.ReactNode;
}> = ({ ligado, aoClicar, children }) => (
  <button
    type="button"
    onClick={aoClicar}
    className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-colors flex items-center gap-1.5 ${
      ligado
        ? 'bg-[var(--c-acento)] text-[var(--c-sobre-acento)] border-[var(--c-acento)]'
        : 'bg-[var(--c-superficie)] text-[var(--c-texto-2)] border-[var(--c-borda)] hover:border-[var(--c-acento)]/40'
    }`}
  >
    {children}
  </button>
);

export const SeletorDestinos: React.FC<Props> = ({
  destinos,
  aoMudar,
  colaboradores,
}) => {
  const [buscaPessoa, setBuscaPessoa] = useState('');

  const paraRede = destinos.some((d) => d.alcance === 'rede');

  const tem = (alcance: DestinoPublicacao['alcance'], valor: string) =>
    destinos.some((d) => d.alcance === alcance && d.valor === valor);

  const alternar = (alcance: DestinoPublicacao['alcance'], valor: string) => {
    /**
     * "Toda a rede" é EXCLUSIVO.
     *
     * Rede + Descalvado não é mais gente do que rede — é a mesma gente,
     * com um destino a mais para quem lê o cartão decifrar. Escolher
     * rede limpa o resto; escolher qualquer outro tira a rede.
     */
    if (alcance === 'rede') {
      aoMudar(paraRede ? [] : [{ alcance: 'rede', valor: '' }]);
      return;
    }

    const semRede = destinos.filter((d) => d.alcance !== 'rede');
    aoMudar(
      tem(alcance, valor)
        ? semRede.filter((d) => !(d.alcance === alcance && d.valor === valor))
        : [...semRede, { alcance, valor }]
    );
  };

  const pessoasEscolhidas = destinos.filter((d) => d.alcance === 'pessoa');

  const daBusca = useMemo(() => {
    const termo = buscaPessoa.trim().toLowerCase();
    if (!termo) return [];
    return colaboradores
      .filter((c) => c.ativo !== false)
      .filter(
        (c) =>
          c.nome.toLowerCase().includes(termo) ||
          c.cargo.toLowerCase().includes(termo) ||
          c.loja.toLowerCase().includes(termo)
      )
      .slice(0, 8);
  }, [colaboradores, buscaPessoa]);

  /**
   * QUANTOS RECEBEM, ao vivo.
   *
   * O autor fica de fora — ele não recebe o próprio comunicado, e
   * contá-lo faria o número mentir por um em toda publicação. Quem
   * calcula de verdade é `publicoAlvo`; aqui a conta é a mesma sem a
   * publicação existir ainda.
   */
  const quantosRecebem = useMemo(() => {
    if (destinos.length === 0) return 0;
    const ativos = colaboradores.filter((c) => c.ativo !== false);
    if (paraRede) return ativos.length;

    return ativos.filter((c) =>
      destinos.some(
        (d) =>
          (d.alcance === 'loja' && c.loja === d.valor) ||
          (d.alcance === 'setor' && c.setor === d.valor) ||
          (d.alcance === 'pessoa' && c.id === d.valor)
      )
    ).length;
  }, [destinos, colaboradores, paraRede]);

  return (
    <div className="flex flex-col gap-2.5">
      <Chip ligado={paraRede} aoClicar={() => alternar('rede', '')}>
        <Globe className="w-3 h-3" /> Toda a rede
      </Chip>

      <div>
        <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-[var(--c-texto-3)] mb-1">
          <Building2 className="w-3 h-3" /> Unidades
        </span>
        <div className="flex flex-wrap gap-1.5">
          {INFORMACOES_LOJAS.map((loja) => (
            <Chip
              key={loja.nome}
              ligado={tem('loja', loja.nome)}
              aoClicar={() => alternar('loja', loja.nome)}
            >
              {loja.nome}
            </Chip>
          ))}
        </div>
      </div>

      <div>
        <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-[var(--c-texto-3)] mb-1">
          <Users className="w-3 h-3" /> Setores
        </span>
        <div className="flex flex-wrap gap-1.5">
          {SETORES.map((setor) => (
            <Chip
              key={setor}
              ligado={tem('setor', setor)}
              aoClicar={() => alternar('setor', setor)}
            >
              {setor}
            </Chip>
          ))}
        </div>
      </div>

      <div>
        <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-[var(--c-texto-3)] mb-1">
          <User className="w-3 h-3" /> Pessoas
        </span>

        {pessoasEscolhidas.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-1.5">
            {pessoasEscolhidas.map((d) => {
              const pessoa = colaboradores.find((c) => c.id === d.valor);
              return (
                <span
                  key={d.valor}
                  className="px-2 py-1 rounded-lg bg-[var(--c-acento)] text-[var(--c-sobre-acento)] text-[11px] font-semibold flex items-center gap-1"
                >
                  {pessoa?.nome || d.valor}
                  <button
                    type="button"
                    onClick={() => alternar('pessoa', d.valor)}
                    aria-label={`Tirar ${pessoa?.nome || 'pessoa'}`}
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              );
            })}
          </div>
        )}

        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--c-texto-3)]" />
          <input
            type="text"
            value={buscaPessoa}
            onChange={(e) => setBuscaPessoa(e.target.value)}
            placeholder="Buscar colaborador pelo nome..."
            className="w-full pl-8 pr-3 py-2 text-xs bg-[var(--c-canvas)] border border-[var(--c-borda)] rounded-lg text-[var(--c-texto)] focus:outline-none focus:ring-2 focus:ring-[var(--c-acento)]"
          />
        </div>

        {daBusca.length > 0 && (
          <div className="mt-1.5 rounded-lg border border-[var(--c-borda)] divide-y divide-[var(--c-borda)] overflow-hidden">
            {daBusca.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => {
                  alternar('pessoa', c.id);
                  setBuscaPessoa('');
                }}
                className={`w-full px-2.5 py-2 flex items-center gap-2 text-left hover:bg-[var(--c-superficie-2)] ${
                  tem('pessoa', c.id) ? 'opacity-40' : ''
                }`}
              >
                <FotoPresenca
                  foto={c.foto}
                  nome={c.nome}
                  presenca={c.presenca}
                  tamanho="w-6 h-6"
                />
                <span className="text-xs font-semibold text-[var(--c-texto)] truncate">
                  {c.nome}
                </span>
                <span className="text-[10px] text-[var(--c-texto-3)] truncate ml-auto">
                  {c.cargo} · {c.loja}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Escolher destino sem ver quantos são é escolher no escuro */}
      <div
        className={`px-3 py-2 rounded-xl border text-xs font-semibold ${
          quantosRecebem === 0
            ? 'bg-amber-500/5 border-amber-500/30 text-amber-700 dark:text-amber-400'
            : 'bg-[var(--c-superficie-2)] border-[var(--c-borda)] text-[var(--c-texto-2)]'
        }`}
      >
        {quantosRecebem === 0
          ? 'Escolha ao menos um destino — ninguém receberia.'
          : `${quantosRecebem} ${
              quantosRecebem === 1 ? 'pessoa recebe' : 'pessoas recebem'
            }`}
      </div>
    </div>
  );
};
