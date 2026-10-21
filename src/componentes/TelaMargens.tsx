/**
 * MARGENS POR MARCA (cotador B2B) — docs/cotador/SPEC-precificacao.md
 *
 * O gerente ajusta o fator de cada marca, o fator padrão, e cuida das
 * marcas que chegaram dos B2Bs sem fator: cadastra, ou aponta que "Wix
 * Filters" é a WIX FILTROS da lista. A tela não calcula preço: a conta mora
 * no banco (preco_de_venda).
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Percent, Link2, Trash2 } from 'lucide-react';
import type { Colaborador } from '../tipos';
import { supabase } from '../servicos/supabase';
import {
  margensPeloSupabase,
  lerFator,
  mostrarFator,
  cuidaDasMargens,
  MARCA_PADRAO,
  type FatorDaMarca,
  type MarcaSemMargem,
  type Apelido,
} from '../servicos/margens';
import {
  CabecalhoDeSecao,
  CartaoNumero,
  CartaoLista,
  BuscaDaLista,
  EstadoVazio,
  classeDoBotao,
} from './PadraoWeb';

const campo =
  'h-9 rounded-xl border border-[var(--c-borda)] bg-[var(--c-superficie)] px-3 text-xs text-[var(--c-texto)] outline-none placeholder:text-[var(--c-texto-3)] focus:border-[var(--c-acento)]';

/** O fator editável de uma linha: grava ao sair do campo ou no Enter. */
const CampoDoFator: React.FC<{ fator: number; aoGravar: (f: number) => Promise<void>; rotulo: string }> = ({
  fator,
  aoGravar,
  rotulo,
}) => {
  const [texto, setTexto] = useState(mostrarFator(fator));
  const [estado, setEstado] = useState<'' | 'gravando' | 'ok' | 'erro'>('');
  useEffect(() => setTexto(mostrarFator(fator)), [fator]);

  const gravar = async () => {
    const novo = lerFator(texto);
    if (novo === null) return setEstado('erro');
    if (novo === fator) return setEstado('');
    setEstado('gravando');
    try {
      await aoGravar(novo);
      setEstado('ok');
    } catch {
      setEstado('erro');
    }
  };

  return (
    <span className="flex items-center gap-2">
      <input
        aria-label={rotulo}
        value={texto}
        onChange={(e) => (setTexto(e.target.value), setEstado(''))}
        onBlur={gravar}
        onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
        inputMode="decimal"
        className={`${campo} w-20 text-right tabular-nums ${estado === 'erro' ? 'border-[var(--c-erro)]' : ''}`}
      />
      <span className="w-14 text-[10px] text-[var(--c-texto-3)]">
        {estado === 'gravando' ? 'gravando…' : estado === 'ok' ? 'gravado' : estado === 'erro' ? '1,00 a 5,00' : ''}
      </span>
    </span>
  );
};

/** Uma marca que chegou do B2B sem fator: cadastrar, ou apontar para uma da lista. */
const LinhaSemMargem: React.FC<{
  item: MarcaSemMargem;
  marcas: string[];
  aoCadastrar: (marca: string, fator: number) => Promise<void>;
  aoApontar: (doB2b: string, marca: string) => Promise<void>;
}> = ({ item, marcas, aoCadastrar, aoApontar }) => {
  const [fator, setFator] = useState('');
  const [alvo, setAlvo] = useState('');
  const [erro, setErro] = useState('');
  const fazer = async (acao: () => Promise<void>) => {
    setErro('');
    try {
      await acao();
    } catch (e) {
      setErro((e as Error).message);
    }
  };
  const lista = `marcas-${item.marca.replace(/\W/g, '')}`;
  return (
    <div className="flex flex-col gap-2 border-b border-[var(--c-borda)] px-4 py-3 last:border-0 lg:flex-row lg:items-center">
      <span className="min-w-0 flex-1">
        <span className="block truncate text-xs font-bold text-[var(--c-texto)]">{item.marca}</span>
        <span className="block text-[10px] text-[var(--c-texto-3)]">
          apareceu {item.vezes}× nas cotações · hoje usa o fator padrão
        </span>
        {erro && <span className="block text-[10px] text-[var(--c-erro)]">{erro}</span>}
      </span>
      <span className="flex items-center gap-2">
        <input
          value={fator}
          onChange={(e) => setFator(e.target.value)}
          placeholder="fator"
          aria-label={`Fator para ${item.marca}`}
          inputMode="decimal"
          className={`${campo} w-20 text-right`}
        />
        <button
          type="button"
          className={classeDoBotao.secundario}
          onClick={() => {
            const f = lerFator(fator);
            if (f === null) return setErro('Fator de 1,00 a 5,00');
            void fazer(() => aoCadastrar(item.marca, f));
          }}
        >
          Cadastrar
        </button>
      </span>
      <span className="flex items-center gap-2">
        <input
          list={lista}
          value={alvo}
          onChange={(e) => setAlvo(e.target.value)}
          placeholder="é a marca…"
          aria-label={`${item.marca} é a marca`}
          className={`${campo} w-44`}
        />
        <datalist id={lista}>
          {marcas.map((m) => (
            <option key={m} value={m} />
          ))}
        </datalist>
        <button
          type="button"
          className={classeDoBotao.secundario}
          onClick={() => (alvo ? void fazer(() => aoApontar(item.marca, alvo.trim().toUpperCase())) : setErro('Escolha a marca da lista'))}
        >
          <Link2 className="h-3.5 w-3.5" /> Apontar
        </button>
      </span>
    </div>
  );
};

export const TelaMargens: React.FC<{ colaboradorAtual: Colaborador }> = ({ colaboradorAtual }) => {
  const servico = useMemo(() => (supabase ? margensPeloSupabase(supabase) : null), []);
  const [fatores, setFatores] = useState<FatorDaMarca[]>([]);
  const [semMargem, setSemMargem] = useState<MarcaSemMargem[]>([]);
  const [apelidos, setApelidos] = useState<Apelido[]>([]);
  const [busca, setBusca] = useState('');
  const [erro, setErro] = useState('');
  const [nova, setNova] = useState({ marca: '', variante: '', fator: '' });

  const carregar = useCallback(async () => {
    if (!servico) return;
    try {
      const [f, s, a] = await Promise.all([servico.listar(), servico.semMargem(), servico.apelidos()]);
      setFatores(f);
      setSemMargem(s);
      setApelidos(a);
      setErro('');
    } catch (e) {
      setErro((e as Error).message);
    }
  }, [servico]);

  useEffect(() => void carregar(), [carregar]);

  if (!servico || !cuidaDasMargens(colaboradorAtual)) {
    return (
      <EstadoVazio
        icone={<Percent className="h-6 w-6" />}
        titulo="Margens indisponíveis"
        descricao="As margens do cotador são de Gerente para cima e precisam do banco conectado."
      />
    );
  }

  const padrao = fatores.find((f) => f.marca === MARCA_PADRAO && f.variante === '');
  const daLista = fatores.filter((f) => f.marca !== MARCA_PADRAO);
  const nomes = [...new Set(daLista.map((f) => f.marca))];
  const termo = busca.trim().toUpperCase();
  const visiveis = termo ? daLista.filter((f) => `${f.marca} ${f.variante}`.includes(termo)) : daLista;
  const comTipos = new Set(daLista.filter((f) => f.variante).map((f) => f.marca));

  const salvar = async (marca: string, variante: string, fator: number) => {
    await servico.salvar(marca, variante, fator);
    await carregar();
  };

  return (
    <div className="flex flex-col gap-5">
      <CabecalhoDeSecao
        rotulo="Cotação B2B"
        titulo="Margens por marca"
        descricao="Preço de venda = custo do B2B × fator da marca, arredondado para cima em ,90 (R$ 100 com fator 1,80 vira R$ 180,90). Marca sem fator usa o padrão. O balconista vê só a venda."
      />

      {erro && <p className="rounded-xl bg-[var(--c-superficie-2)] p-3 text-xs text-[var(--c-erro)]">{erro}</p>}

      <div className="grid gap-3 sm:grid-cols-3">
        <CartaoNumero
          rotulo="Fator padrão"
          valor={padrao ? mostrarFator(padrao.fator) : '—'}
          detalhe="Para marca sem fator cadastrado"
          tom="acento"
        />
        <CartaoNumero rotulo="Marcas com fator" valor={nomes.length} detalhe={`${comTipos.size} com fator por tipo de peça`} />
        <CartaoNumero
          rotulo="Marcas sem margem"
          valor={semMargem.length}
          detalhe="Chegaram dos B2Bs e usam o padrão"
          tom={semMargem.length ? 'atencao' : 'ok'}
        />
      </div>

      {padrao && (
        <CartaoLista>
          <div className="flex items-center justify-between gap-3 px-4 py-3">
            <span className="text-xs font-bold text-[var(--c-texto)]">Fator padrão</span>
            <CampoDoFator rotulo="Fator padrão" fator={padrao.fator} aoGravar={(f) => salvar(MARCA_PADRAO, '', f)} />
          </div>
        </CartaoLista>
      )}

      {semMargem.length > 0 && (
        <CartaoLista
          barra={
            <span className="text-xs font-bold text-[var(--c-texto)]">
              Marcas sem margem — cadastre o fator, ou aponte qual marca da lista ela é
            </span>
          }
        >
          {semMargem.map((s) => (
            <LinhaSemMargem
              key={s.marca}
              item={s}
              marcas={nomes}
              aoCadastrar={(marca, fator) => salvar(marca, '', fator)}
              aoApontar={async (doB2b, marca) => {
                await servico.apontarApelido(doB2b, marca);
                await carregar();
              }}
            />
          ))}
        </CartaoLista>
      )}

      <CartaoLista
        barra={
          <>
            <BuscaDaLista valor={busca} aoMudar={setBusca} placeholder="Buscar marca" />
            <span className="flex flex-wrap items-center gap-2">
              <input
                value={nova.marca}
                onChange={(e) => setNova({ ...nova, marca: e.target.value })}
                placeholder="nova marca"
                aria-label="Nova marca"
                className={`${campo} w-36`}
              />
              <input
                value={nova.variante}
                onChange={(e) => setNova({ ...nova, variante: e.target.value })}
                placeholder="tipo (opcional)"
                aria-label="Tipo de peça"
                className={`${campo} w-32`}
              />
              <input
                value={nova.fator}
                onChange={(e) => setNova({ ...nova, fator: e.target.value })}
                placeholder="fator"
                aria-label="Fator"
                inputMode="decimal"
                className={`${campo} w-20 text-right`}
              />
              <button
                type="button"
                className={classeDoBotao.principal}
                onClick={async () => {
                  const f = lerFator(nova.fator);
                  if (!nova.marca.trim() || f === null) return setErro('Informe a marca e um fator de 1,00 a 5,00.');
                  try {
                    await salvar(nova.marca, nova.variante, f);
                    setNova({ marca: '', variante: '', fator: '' });
                  } catch (e) {
                    setErro((e as Error).message);
                  }
                }}
              >
                Adicionar
              </button>
            </span>
          </>
        }
      >
        {visiveis.length === 0 ? (
          <EstadoVazio icone={<Percent className="h-6 w-6" />} titulo="Nenhuma marca" descricao="Nenhuma marca com esse nome na lista." />
        ) : (
          visiveis.map((f) => (
            <div
              key={`${f.marca}|${f.variante}`}
              className="flex items-center justify-between gap-3 border-b border-[var(--c-borda)] px-4 py-2 last:border-0"
            >
              <span className="min-w-0">
                <span className="block truncate text-xs font-bold text-[var(--c-texto)]">{f.marca}</span>
                {f.variante && (
                  <span className="block text-[10px] text-[var(--c-atencao)]">
                    tipo: {f.variante} · a cotação mostra o preço de cada tipo
                  </span>
                )}
              </span>
              <CampoDoFator
                rotulo={`Fator de ${f.marca} ${f.variante}`}
                fator={f.fator}
                aoGravar={(novo) => salvar(f.marca, f.variante, novo)}
              />
            </div>
          ))
        )}
      </CartaoLista>

      {apelidos.length > 0 && (
        <CartaoLista barra={<span className="text-xs font-bold text-[var(--c-texto)]">Como os B2Bs escrevem a marca ({apelidos.length})</span>}>
          {apelidos.map((a) => (
            <div key={a.apelido} className="flex items-center justify-between gap-3 border-b border-[var(--c-borda)] px-4 py-2 last:border-0">
              <span className="text-xs text-[var(--c-texto-2)]">
                {a.apelido} → <b className="text-[var(--c-texto)]">{a.marca}</b>
              </span>
              <button
                type="button"
                aria-label={`Remover apelido ${a.apelido}`}
                className="rounded-lg p-1.5 text-[var(--c-texto-3)] hover:text-[var(--c-erro)]"
                onClick={async () => {
                  try {
                    await servico.removerApelido(a.apelido);
                    await carregar();
                  } catch (e) {
                    setErro((e as Error).message);
                  }
                }}
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </CartaoLista>
      )}
    </div>
  );
};
