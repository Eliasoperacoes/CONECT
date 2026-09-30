/**
 * Organograma da rede — CONECTA / Malachias Autopeças
 *
 * O quadro de responsabilidades, uma loja por vez. Quem está no topo
 * responde por quem está abaixo, e é isso que decide quem aprova a hora de
 * quem — arrastar um cartão aqui muda a fila de aprovação de verdade.
 *
 * Por isso a tela diz, o tempo todo e em texto claro, qual é a consequência
 * de cada movimento. Um organograma que parece decorativo mas altera alçada
 * é pior do que não ter organograma nenhum.
 */
import { AbasRolaveis } from './AbasRolaveis';
import { FolhaInferior } from './FolhaInferior';
import React, { useMemo, useState } from 'react';
import {
  Users,
  UserPlus,
  X,
  AlertCircle,
  ChevronRight,
  ChevronDown,
  ShieldCheck,
  CornerDownRight,
  Building2,
  Info,
  Check,
} from 'lucide-react';
import { Colaborador, Loja, INFORMACOES_LOJAS, ROTULO_NIVEL, cuidaDePessoas } from '../tipos';
import { bancoDados } from '../servicos/bancoDados';
import {
  montarArvoreDaLoja,
  colaboradoresSemResponsavel,
  podeSerResponsavelDe,
  NoOrganograma,
} from '../servicos/organograma';
import { FotoPresenca } from './FotoPresenca';

interface Props {
  colaboradorAtual: Colaborador;
}

export const Organograma: React.FC<Props> = ({ colaboradorAtual }) => {
  const [lojaAtiva, setLojaAtiva] = useState<Loja>('Pirassununga');
  /** Quem está tendo o responsável escolhido, pela folha (o caminho por toque). */
  const [movendo, setMovendo] = useState<Colaborador | null>(null);
  const [buscaResponsavel, setBuscaResponsavel] = useState('');
  const [versao, setVersao] = useState(0);
  const [arrastando, setArrastando] = useState<Colaborador | null>(null);
  const [alvoDestaque, setAlvoDestaque] = useState<string | null>(null);
  /**
   * Quem está aberto. Começa vazio de propósito: com 89 pessoas, abrir tudo
   * de saída devolve a parede de cartões que esta tela existe para evitar.
   * Fechado, o lado esquerdo mostra a estrutura — líderes e gerentes.
   */
  const [abertos, setAbertos] = useState<Set<string>>(new Set());
  const [aviso, setAviso] = useState<{ texto: string; erro: boolean } | null>(null);

  const podeEditar = bancoDados.podeGerenciarPessoas(colaboradorAtual);

  const todos = useMemo(() => {
    void versao;
    return bancoDados.obterColaboradores();
  }, [versao]);

  const arvore = useMemo(
    () => montarArvoreDaLoja(lojaAtiva, todos, { semColaboradoresSoltos: true }),
    [lojaAtiva, todos]
  );

  const aguardando = useMemo(
    () => colaboradoresSemResponsavel(todos, lojaAtiva),
    [todos, lojaAtiva]
  );

  /** Ids da árvore que têm equipe — o que faz sentido abrir. */
  const comEquipe = useMemo(() => {
    const ids: string[] = [];
    const varrer = (nos: NoOrganograma[]) => {
      for (const no of nos) {
        if (no.subordinados.length > 0) ids.push(no.colaborador.id);
        varrer(no.subordinados);
      }
    };
    varrer(arvore);
    return ids;
  }, [arvore]);

  const tudoAberto = comEquipe.length > 0 && comEquipe.every((id) => abertos.has(id));

  const alternar = (id: string) =>
    setAbertos((atuais) => {
      const proximos = new Set(atuais);
      if (proximos.has(id)) proximos.delete(id);
      else proximos.add(id);
      return proximos;
    });

  const mostrar = (texto: string, erro = false) => {
    setAviso({ texto, erro });
    setTimeout(() => setAviso(null), 5000);
  };

  const mover = async (quem: Colaborador, novoResponsavelId: string | null) => {
    const res = await bancoDados.definirResponsavel(quem.id, novoResponsavelId);
    setVersao((v) => v + 1);

    if (!res.sucesso) {
      mostrar(res.erro || 'Não foi possível mover.', true);
      return;
    }

    // Abre o destino: soltar alguém num cartão fechado e não ver nada
    // acontecer parece que o arrasto falhou
    if (novoResponsavelId) {
      setAbertos((atuais) => new Set(atuais).add(novoResponsavelId));
    }

    const chefe = todos.find((c) => c.id === novoResponsavelId);
    mostrar(
      chefe
        ? `${quem.nome} agora responde a ${chefe.nome} — e é ${chefe.nome} quem aprova as horas dele.`
        : `${quem.nome} saiu da cadeia. As horas dele voltam para a regra de setor e loja.`
    );
  };

  const soltarSobre = (destino: Colaborador | null) => {
    const quem = arrastando;
    setArrastando(null);
    setAlvoDestaque(null);
    if (!quem) return;
    if (destino && destino.id === quem.id) return;
    mover(quem, destino ? destino.id : null);
  };

  /** Um cartão da árvore, com os subordinados dele logo abaixo. */
  const Cartao: React.FC<{ no: NoOrganograma }> = ({ no }) => {
    const c = no.colaborador;
    const destacado = alvoDestaque === c.id;
    const arrastandoEste = arrastando?.id === c.id;
    const temEquipe = no.subordinados.length > 0;
    const aberto = abertos.has(c.id);

    // Soltar aqui só vale se não fechar um ciclo; a tela avisa antes,
    // em vez de deixar arrastar e reclamar depois
    const recusa =
      arrastando && arrastando.id !== c.id
        ? !podeSerResponsavelDe(c, arrastando, todos).pode
        : false;

    return (
      <div className="flex flex-col">
        <div
          draggable={podeEditar}
          onDragStart={() => setArrastando(c)}
          onDragEnd={() => {
            setArrastando(null);
            setAlvoDestaque(null);
          }}
          onDragOver={(e) => {
            if (!podeEditar || !arrastando || recusa) return;
            e.preventDefault();
            setAlvoDestaque(c.id);
          }}
          onDragLeave={() => setAlvoDestaque((atual) => (atual === c.id ? null : atual))}
          onClick={() => temEquipe && alternar(c.id)}
          onDrop={(e) => {
            e.preventDefault();
            e.stopPropagation();
            if (recusa) {
              mostrar(
                podeSerResponsavelDe(c, arrastando!, todos).motivo || 'Movimento inválido.',
                true
              );
              setArrastando(null);
              setAlvoDestaque(null);
              return;
            }
            soltarSobre(c);
          }}
          className={`p-2.5 rounded-xl border flex items-center gap-2.5 transition-all ${
            temEquipe
              ? 'cursor-pointer'
              : podeEditar
              ? 'cursor-grab active:cursor-grabbing'
              : ''
          } ${arrastandoEste ? 'opacity-40' : ''} ${
            destacado
              ? 'border-emerald-500 bg-emerald-500/10 ring-2 ring-emerald-500/30'
              : recusa && arrastando
              ? 'border-[var(--c-borda)] bg-[var(--c-superficie)] opacity-40'
              : 'border-[var(--c-borda)] bg-[var(--c-superficie)] hover:border-[var(--c-borda-forte)]'
          }`}
        >
          {/* A seta ocupa lugar mesmo sem equipe, senão os cartões de uma
              mesma coluna ficam desalinhados entre si */}
          <span className="w-4 flex-shrink-0 flex items-center justify-center">
            {temEquipe &&
              (aberto ? (
                <ChevronDown className="w-4 h-4 text-[var(--c-texto-3)]" />
              ) : (
                <ChevronRight className="w-4 h-4 text-[var(--c-texto-3)]" />
              ))}
          </span>

          <FotoPresenca
            foto={c.foto}
            nome={c.nome}
            presenca={c.presenca}
            tamanho="w-8 h-8"
          />

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-sm font-bold text-[var(--c-texto)] truncate">
                {c.nome}
              </span>
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded border bg-[var(--c-canvas)] text-[var(--c-texto-3)] border-[var(--c-borda)]">
                N{c.nivel} · {ROTULO_NIVEL[c.nivel] || 'Colaborador'}
              </span>
              {cuidaDePessoas(c) && (
                <span
                  className="text-[10px] font-bold px-1.5 py-0.5 rounded border bg-indigo-500/10 text-indigo-600 border-indigo-500/20 inline-flex items-center gap-1"
                  title="Aprova jornada de toda a rede, por fora da cadeia"
                >
                  <ShieldCheck className="w-3 h-3" />
                  Rede
                </span>
              )}
            </div>
            <span className="text-[11px] text-[var(--c-texto-3)] block truncate">
              {c.cargo} · {c.setor}
              {no.totalAbaixo > 0 && (
                <>
                  {' · '}
                  <strong className="text-[var(--c-texto-2)]">
                    aprova {no.totalAbaixo}{' '}
                    {no.totalAbaixo === 1 ? 'pessoa' : 'pessoas'}
                  </strong>
                  {!aberto && (
                    <span className="text-[var(--c-texto-3)]"> · clique para ver</span>
                  )}
                </>
              )}
            </span>
          </div>

          {/* O CAMINHO POR TOQUE: arrastar não funciona com o dedo no celular */}
          {podeEditar && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setMovendo(c);
              }}
              title="Escolher a quem esta pessoa responde"
              aria-label={`Mudar o responsável de ${c.nome}`}
              className="h-8 px-2.5 rounded-lg text-[12px] font-semibold text-[var(--c-acento)] bg-[var(--c-acento-suave)] flex-shrink-0"
            >
              mudar
            </button>
          )}
          {podeEditar && c.responsavelId && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                mover(c, null);
              }}
              title="Tirar da cadeia — volta para a regra de setor e loja"
              className="p-1.5 rounded-lg text-[var(--c-texto-3)] hover:text-red-600 hover:bg-red-500/10 transition-colors flex-shrink-0"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {temEquipe && aberto && (
          <div className="ml-4 pl-3 mt-1.5 border-l-2 border-[var(--c-borda)] flex flex-col gap-1.5">
            {no.subordinados.map((filho) => (
              <Cartao key={filho.colaborador.id} no={filho} />
            ))}
          </div>
        )}
      </div>
    );
  };

  const lojasComPessoas = INFORMACOES_LOJAS.filter((info) =>
    todos.some((c) => c.loja === info.nome && c.ativo !== false)
  );

  return (
    <div className="w-full flex flex-col gap-3 p-4 sm:p-6">
      <div>
        <h2 className="text-sm font-bold text-[var(--c-texto)] flex items-center gap-2">
          <Users className="w-4 h-4" />
          Cadeia de responsabilidade
        </h2>
        <p className="text-xs text-[var(--c-texto-3)]">
          {podeEditar
            ? 'Toque em "mudar" numa pessoa para escolher a quem ela responde (no computador, dá para arrastar). Isto muda quem aprova as horas dela.'
            : 'Quem responde por quem nesta loja. Só RH, Diretoria e TI alteram.'}
        </p>
      </div>

      {/* A consequência escrita, para ninguém mover achando que é desenho —
          recolhida: é leitura de uma vez, e aberta ela empurrava a árvore
          para baixo da primeira tela do celular */}
      <details className="group rounded-xl bg-blue-500/5 border border-blue-500/20 text-xs text-[var(--c-texto-2)]">
        <summary className="list-none cursor-pointer p-3 flex items-center gap-2.5 font-semibold text-[var(--c-texto)]">
          <Info className="w-4 h-4 text-blue-600 flex-shrink-0" />
          <span className="flex-1">Como a cadeia decide quem aprova as horas</span>
          <ChevronDown className="w-4 h-4 text-[var(--c-texto-3)] transition-transform group-open:rotate-180" />
        </summary>
        <div className="px-3 pb-3 pl-9 flex flex-col gap-1">
          <span>
            <strong>Posicionado na cadeia:</strong> só quem está acima dele aprova as horas.
            O alcance automático por setor e por loja deixa de valer para essa pessoa.
          </span>
          <span>
            <strong>Fora da cadeia:</strong> vale a regra de sempre — líder do setor e
            gerente da loja aprovam.
          </span>
          <span className="text-[var(--c-texto-3)]">
            RH, Diretoria e TI aprovam a rede inteira nos dois casos.
          </span>
        </div>
      </details>

      {aviso && (
        <div
          className={`p-3 rounded-xl text-xs font-semibold flex items-start gap-2 ${
            aviso.erro
              ? 'bg-red-500/10 border border-red-500/20 text-red-600'
              : 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-700'
          }`}
        >
          <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <span>{aviso.texto}</span>
        </div>
      )}

      {/* Seletor de loja: o quadro é montado uma unidade por vez, numa linha que desliza */}
      <AbasRolaveis
        className="-mx-4 sm:mx-0 sm:px-0"
        ativa={lojaAtiva}
        aoEscolher={setLojaAtiva}
        abas={lojasComPessoas.map((info) => ({
          id: info.nome,
          rotulo: info.nome,
          contador: colaboradoresSemResponsavel(todos, info.nome).length,
        }))}
      />

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4 items-start">
        {/* A árvore da loja */}
        <div className="p-3 rounded-2xl bg-[var(--c-canvas)] border border-[var(--c-borda)] flex flex-col gap-1.5 min-h-[200px]">
          <div className="flex items-center justify-between gap-2 px-1">
            <span className="text-[11px] text-[var(--c-texto-3)]">
              Liderança de {lojaAtiva} — clique num cartão para abrir ou fechar a
              equipe dele.
            </span>
            {comEquipe.length > 0 && (
              <button
                type="button"
                onClick={() =>
                  setAbertos(tudoAberto ? new Set() : new Set(comEquipe))
                }
                className="text-[11px] font-semibold text-[var(--c-texto-2)] hover:text-[var(--c-texto)] whitespace-nowrap px-2 py-1 rounded-lg border border-[var(--c-borda)] hover:border-[var(--c-borda-forte)] transition-colors flex-shrink-0"
              >
                {tudoAberto ? 'Fechar todos' : 'Abrir todos'}
              </button>
            )}
          </div>
          {arvore.length === 0 ? (
            <div className="p-8 text-center text-xs text-[var(--c-texto-3)]">
              Nenhum líder ou gerente cadastrado em {lojaAtiva}. Ajuste o nível das
              pessoas no Quadro de Equipe para montar a cadeia daqui.
            </div>
          ) : (
            arvore.map((no) => <Cartao key={no.colaborador.id} no={no} />)
          )}
        </div>

        {/* Os colaboradores que ainda esperam um responsável */}
        <div
          onDragOver={(e) => {
            if (!podeEditar || !arrastando) return;
            e.preventDefault();
            setAlvoDestaque('__solto__');
          }}
          onDragLeave={() =>
            setAlvoDestaque((a) => (a === '__solto__' ? null : a))
          }
          onDrop={(e) => {
            e.preventDefault();
            soltarSobre(null);
          }}
          className={`p-3 rounded-2xl border flex flex-col gap-2 transition-all ${
            alvoDestaque === '__solto__'
              ? 'border-amber-500 bg-amber-500/10 ring-2 ring-amber-500/30'
              : 'border-[var(--c-borda)] bg-[var(--c-canvas)]'
          }`}
        >
          <div className="flex items-center gap-1.5">
            <UserPlus className="w-3.5 h-3.5 text-amber-600" />
            <span className="text-xs font-bold text-[var(--c-texto)]">
              Colaboradores sem responsável ({aguardando.length})
            </span>
          </div>
          <p className="text-[11px] text-[var(--c-texto-3)]">
            Seguem na regra automática: líder do setor e gerente da loja aprovam as
            horas deles.
            {podeEditar &&
              ' Toque numa pessoa para escolher o responsável dela (no computador, dá para arrastar).'}
          </p>

          {aguardando.length === 0 ? (
            <div className="p-4 text-center text-[11px] text-[var(--c-texto-3)]">
              Todo colaborador de {lojaAtiva} já tem responsável.
            </div>
          ) : (
            <div className="flex flex-col gap-1.5 max-h-[420px] overflow-y-auto">
              {aguardando.map((c) => (
                <div
                  key={c.id}
                  draggable={podeEditar}
                  role={podeEditar ? 'button' : undefined}
                  onClick={() => podeEditar && setMovendo(c)}
                  onDragStart={() => setArrastando(c)}
                  onDragEnd={() => {
                    setArrastando(null);
                    setAlvoDestaque(null);
                  }}
                  className={`p-2 rounded-xl border border-[var(--c-borda)] bg-[var(--c-superficie)] flex items-center gap-2 ${
                    podeEditar ? 'cursor-grab active:cursor-grabbing' : ''
                  } ${arrastando?.id === c.id ? 'opacity-40' : ''}`}
                >
                  <CornerDownRight className="w-3.5 h-3.5 text-[var(--c-texto-3)] flex-shrink-0" />
                  <div className="min-w-0 flex-1">
                    <span className="text-xs font-semibold text-[var(--c-texto)] block truncate">
                      {c.nome}
                    </span>
                    <span className="text-[10px] text-[var(--c-texto-3)] block truncate">
                      {c.cargo} · {c.setor}
                    </span>
                  </div>
                  <ChevronRight className="w-3.5 h-3.5 text-[var(--c-texto-3)] flex-shrink-0" />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/*
        ESCOLHER O RESPONSÁVEL POR TOQUE. No celular não há arrastar: a
        pessoa toca em "mudar" e escolhe da lista. Só quem pode ser
        responsável dela aparece habilitado — a regra é a mesma do arrasto
        (`podeSerResponsavelDe`), e quem não pode diz por quê.
      */}
      <FolhaInferior
        aberto={!!movendo}
        titulo={movendo ? `A quem ${movendo.nome.split(' ')[0]} responde?` : ''}
        subtitulo="Quem responde por ela aprova as horas dela"
        aoFechar={() => {
          setMovendo(null);
          setBuscaResponsavel('');
        }}
      >
        {movendo && (
          <div className="pb-4">
            <div className="p-3 sticky top-0 bg-[var(--c-superficie)] z-10">
              <input
                type="search"
                value={buscaResponsavel}
                onChange={(e) => setBuscaResponsavel(e.target.value)}
                placeholder="Buscar pelo nome"
                className="w-full h-11 px-4 rounded-full bg-[var(--c-superficie-2)] text-[15px] text-[var(--c-texto)] outline-none placeholder:text-[var(--c-texto-3)]"
              />
            </div>
            {movendo.responsavelId && (
              <button
                type="button"
                onClick={() => {
                  mover(movendo, null);
                  setMovendo(null);
                }}
                className="w-full flex items-center gap-3 px-4 py-3 text-left text-red-600 active:bg-[var(--c-superficie-2)] border-b border-[var(--c-borda)]"
              >
                <X className="w-5 h-5" />
                <span className="text-[15px] font-semibold">Tirar da cadeia (volta à regra de setor e loja)</span>
              </button>
            )}
            {todos
              .filter((c) => c.ativo !== false && c.id !== movendo.id && c.nivel >= 2)
              .filter((c) => c.nome.toLowerCase().includes(buscaResponsavel.trim().toLowerCase()))
              .sort(
                (a, b) =>
                  Number(b.loja === movendo.loja) - Number(a.loja === movendo.loja) ||
                  b.nivel - a.nivel ||
                  a.nome.localeCompare(b.nome)
              )
              .map((c) => {
                const regra = podeSerResponsavelDe(c, movendo, todos);
                const atual = movendo.responsavelId === c.id;
                return (
                  <button
                    key={c.id}
                    type="button"
                    disabled={!regra.pode || atual}
                    onClick={() => {
                      mover(movendo, c.id);
                      setMovendo(null);
                      setBuscaResponsavel('');
                    }}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-left active:bg-[var(--c-superficie-2)] disabled:opacity-50"
                  >
                    <FotoPresenca foto={c.foto} nome={c.nome} presenca={c.presenca} tamanho="w-10 h-10" />
                    <span className="flex-1 min-w-0">
                      <span className="block text-[15px] font-semibold text-[var(--c-texto)] truncate">{c.nome}</span>
                      <span className="block text-[12px] text-[var(--c-texto-3)] truncate">
                        {regra.pode ? `${c.cargo} · ${c.loja}` : regra.motivo}
                      </span>
                    </span>
                    {atual && <Check className="w-5 h-5 text-[var(--c-acento)] flex-shrink-0" />}
                  </button>
                );
              })}
          </div>
        )}
      </FolhaInferior>
    </div>
  );
};
