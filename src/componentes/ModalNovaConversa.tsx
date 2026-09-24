/**
 * NOVA CONVERSA — CONECTA / Malachias Autopeças
 *
 * DE ONDE VIERAM OS FILTROS.
 *
 * O "Quadro de Equipe" era uma tela inteira com 89 cartões, filtro de
 * loja, filtro de setor e busca. Ninguém a usava, e os filtros já não
 * achavam quem se procurava — mas a IDEIA era certa: numa rede de cinco
 * cidades, achar alguém pelo nome exige saber o nome.
 *
 * A procura por pessoa acontece AQUI, na hora de chamar um colega. Então
 * os filtros vieram para cá, e a tela inteira saiu do sistema.
 *
 * O QUE FOI FEITO PARA NÃO POLUIR
 *
 *  - Os filtros ficam RECOLHIDOS. Quem já sabe o nome digita e pronto;
 *    quem não sabe abre. Um contador diz quantos estão ligados, para não
 *    haver lista filtrada sem que se veja por quê.
 *  - As opções saem de quem está NA LISTA, não de uma tabela fixa. Cidade
 *    sem ninguém e cargo que ninguém ocupa não aparecem — era isso que
 *    enchia os filtros do quadro de linhas que não levavam a lugar nenhum.
 *  - Sem filtro de cidade, a lista vem AGRUPADA por cidade. É o que o
 *    quadro fazia de melhor: a rede se lê por unidade, não como uma fila
 *    de 89 nomes em ordem alfabética.
 */
import React, { useState, useMemo } from 'react';
import { ArrowLeft, Search, SlidersHorizontal, X } from 'lucide-react';
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
  const [cidade, setCidade] = useState('todas');
  const [cargo, setCargo] = useState('todos');
  const [filtrosAbertos, setFiltrosAbertos] = useState(false);

  /**
   * As opções saem de QUEM ESTÁ NA LISTA.
   *
   * Lidas da lista oficial de lojas e de cargos, ofereceriam cidade sem
   * ninguém e cargo que ninguém ocupa — filtro que devolve lista vazia
   * ensina a desconfiar do filtro.
   */
  const cidades = useMemo(
    () => [...new Set(colegas.map((c) => c.loja).filter(Boolean))].sort(),
    [colegas]
  );

  const cargos = useMemo(
    () => [...new Set(colegas.map((c) => c.cargo).filter(Boolean))].sort(),
    [colegas]
  );

  const colegasFiltrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();

    return colegas.filter((c) => {
      if (cidade !== 'todas' && c.loja !== cidade) return false;
      if (cargo !== 'todos' && c.cargo !== cargo) return false;
      if (!termo) return true;

      /**
       * A busca continua batendo em cargo, loja, setor e ramal, e não só
       * no nome: quem lembra "o rapaz da logística de Descalvado" acha
       * digitando, sem abrir filtro nenhum.
       */
      return (
        c.nome.toLowerCase().includes(termo) ||
        c.cargo.toLowerCase().includes(termo) ||
        c.loja.toLowerCase().includes(termo) ||
        c.setor.toLowerCase().includes(termo) ||
        (c.ramal || '').includes(termo)
      );
    });
  }, [colegas, busca, cidade, cargo]);

  /**
   * Agrupado por cidade — mas só quando a cidade NÃO foi escolhida.
   *
   * Com uma cidade escolhida, o cabeçalho de grupo repetiria em cada
   * linha o que o filtro já diz, e a lista ficaria mais alta sem dizer
   * mais nada.
   */
  const grupos = useMemo(() => {
    if (cidade !== 'todas') return [{ cidade: '', pessoas: colegasFiltrados }];

    const porCidade = new Map<string, Colaborador[]>();
    for (const c of colegasFiltrados) {
      const chave = c.loja || 'Sem unidade';
      const lista = porCidade.get(chave) || [];
      lista.push(c);
      porCidade.set(chave, lista);
    }

    return [...porCidade.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([nome, pessoas]) => ({ cidade: nome, pessoas }));
  }, [colegasFiltrados, cidade]);

  const filtrosLigados = (cidade !== 'todas' ? 1 : 0) + (cargo !== 'todos' ? 1 : 0);

  const limparFiltros = () => {
    setCidade('todas');
    setCargo('todos');
  };

  if (!aberto) return null;

  const classeSeletor =
    'flex-1 min-w-0 bg-[var(--c-superficie-2)] text-[var(--c-texto)] text-xs rounded-lg px-2.5 py-2 outline-none border border-transparent focus:border-[var(--c-acento)] cursor-pointer';

  return (
    <div
      id="modal-nova-conversa"
      className="fixed z-50 top-0 left-0 right-0 bottom-0 w-full h-[100dvh] md:top-auto md:left-auto md:right-6 md:bottom-0 md:w-[340px] md:h-[520px] md:max-h-[calc(100dvh-96px)] bg-[var(--c-canvas)] flex flex-col md:rounded-t-2xl md:border md:border-b-0 md:border-[var(--c-borda)] md:shadow-[var(--s-3)] overflow-hidden"
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

        <div className="flex-1 min-w-0">
          <h1 className="text-base font-semibold text-[var(--c-texto)]">
            Nova conversa
          </h1>
          {/* Diz quantos SOBRARAM, não quantos existem: lista filtrada
              sem o número deixa a pessoa sem saber se procurou errado */}
          <p className="text-xs text-[var(--c-texto-3)] truncate">
            {colegasFiltrados.length === colegas.length
              ? `${colegas.length} colaboradores na rede`
              : `${colegasFiltrados.length} de ${colegas.length} colaboradores`}
          </p>
        </div>
      </header>

      {/* Busca e filtros */}
      <div className="bg-[var(--c-superficie)] border-b border-[var(--c-borda)] p-3 flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <div className="relative flex items-center flex-1 min-w-0">
            <Search className="w-4 h-4 text-[var(--c-texto-3)] absolute left-3 pointer-events-none" />
            <input
              id="campo-busca-colegas"
              type="text"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar por nome, cargo ou cidade..."
              className="w-full bg-[var(--c-superficie-2)] text-[var(--c-texto)] text-sm rounded-lg pl-9 pr-3 py-2.5 outline-none border border-transparent focus:border-[var(--c-acento)] placeholder:text-[var(--c-texto-3)]"
            />
          </div>

          <button
            type="button"
            id="botao-filtros-nova-conversa"
            onClick={() => setFiltrosAbertos((v) => !v)}
            aria-label="Filtrar por cidade e cargo"
            className={`relative w-10 h-10 shrink-0 rounded-lg flex items-center justify-center border transition-colors ${
              filtrosAbertos || filtrosLigados > 0
                ? 'bg-[var(--c-acento)] text-[var(--c-sobre-acento)] border-[var(--c-acento)]'
                : 'bg-[var(--c-superficie-2)] text-[var(--c-texto-2)] border-transparent hover:text-[var(--c-texto)]'
            }`}
          >
            <SlidersHorizontal className="w-4 h-4" />
            {/* O contador existe para não haver lista filtrada sem que se
                veja por quê — com os filtros fechados, o número é a
                única pista de que eles estão agindo */}
            {filtrosLigados > 0 && !filtrosAbertos && (
              <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-[var(--c-texto)] text-[var(--c-superficie)] text-[10px] font-bold flex items-center justify-center">
                {filtrosLigados}
              </span>
            )}
          </button>
        </div>

        {filtrosAbertos && (
          <div className="flex items-center gap-2">
            <select
              id="filtro-cidade"
              value={cidade}
              onChange={(e) => setCidade(e.target.value)}
              className={classeSeletor}
              aria-label="Cidade"
            >
              <option value="todas">Todas as cidades</option>
              {cidades.map((nome) => (
                <option key={nome} value={nome}>
                  {nome}
                </option>
              ))}
            </select>

            <select
              id="filtro-cargo"
              value={cargo}
              onChange={(e) => setCargo(e.target.value)}
              className={classeSeletor}
              aria-label="Cargo"
            >
              <option value="todos">Todos os cargos</option>
              {cargos.map((nome) => (
                <option key={nome} value={nome}>
                  {nome}
                </option>
              ))}
            </select>

            {filtrosLigados > 0 && (
              <button
                type="button"
                onClick={limparFiltros}
                aria-label="Limpar filtros"
                className="w-8 h-8 shrink-0 rounded-lg flex items-center justify-center text-[var(--c-texto-3)] hover:text-[var(--c-texto)] hover:bg-[var(--c-superficie-2)]"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        )}
      </div>

      {/* Lista de colegas */}
      <div className="flex-1 overflow-y-auto">
        {colegasFiltrados.length === 0 ? (
          <div className="py-12 px-6 text-center text-[var(--c-texto-3)] text-sm flex flex-col items-center gap-3">
            <span>Nenhum colega encontrado.</span>
            {/* A saída fica junto do beco sem saída: sem isto a pessoa
                precisa lembrar sozinha de que há filtro ligado */}
            {filtrosLigados > 0 && (
              <button
                type="button"
                onClick={limparFiltros}
                className="px-3 py-1.5 rounded-lg border border-[var(--c-borda)] text-xs font-bold text-[var(--c-texto-2)] hover:text-[var(--c-texto)]"
              >
                Limpar filtros
              </button>
            )}
          </div>
        ) : (
          grupos.map((grupo) => (
            <div key={grupo.cidade || 'todos'}>
              {grupo.cidade && (
                <div className="sticky top-0 z-10 px-4 py-1.5 bg-[var(--c-canvas)]/95 backdrop-blur border-b border-[var(--c-borda)] flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--c-texto-3)]">
                    {grupo.cidade}
                  </span>
                  <span className="text-[10px] font-semibold text-[var(--c-texto-3)]">
                    {grupo.pessoas.length}
                  </span>
                </div>
              )}

              <div className="divide-y divide-[var(--c-borda)]">
                {grupo.pessoas.map((colega) => (
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
                        {/* Agrupado por cidade, repetir a cidade na linha
                            é ruído: o cabeçalho acima já diz qual é */}
                        {colega.cargo}
                        {!grupo.cidade && colega.loja ? ` · ${colega.loja}` : ''}
                        {colega.ramal ? ` · ramal ${colega.ramal}` : ''}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
