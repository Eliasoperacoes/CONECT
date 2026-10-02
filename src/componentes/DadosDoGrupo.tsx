/**
 * DADOS DO GRUPO — a tela do grupo, no padrão do WhatsApp (Elias,
 * 03/10/2026: a primeira versão ficou "muito básica e nada intuitiva").
 *
 * Tela cheia sobre a conversa, de cima para baixo, na ordem em que se procura:
 *
 *   foto · nome (lápis para quem administra) · "Grupo · N participantes"
 *   descrição — tocável para escrever, se você administra
 *   Configurações do grupo — "Só administradores enviam" (quem administra)
 *   N participantes — busca, "Adicionar participantes", a lista
 *   Sair do grupo / Apagar grupo — em vermelho, por último, com confirmação
 *
 * Tocar numa pessoa abre uma FOLHA de opções (e não botões soltos na
 * lista): conversar com ela, torná-la administradora, removê-la.
 *
 * As regras são do banco (grupos-de-todos.sql). A tela só não oferece o
 * que a pessoa não pode, e mostra a recusa do banco se ela vier.
 */
import React, { useMemo, useState } from 'react';
import {
  ArrowLeft,
  Check,
  Crown,
  LogOut,
  MessageSquare,
  Pencil,
  Search,
  ShieldOff,
  Trash2,
  UserMinus,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import { Colaborador, Conversa } from '../tipos';
import { bancoDados } from '../servicos/bancoDados';
import { useVoltar } from '../servicos/voltar';
import { FotoPresenca } from './FotoPresenca';
import { Avatar } from './Avatar';
import { FolhaInferior } from './FolhaInferior';
import { EscolherPessoas } from './EscolherPessoas';

const primeiroNome = (nome: string) => nome.split(' ')[0];

/** Uma seção da tela: o cartão branco do WhatsApp, com título opcional. */
const Secao: React.FC<{ titulo?: React.ReactNode; children: React.ReactNode }> = ({ titulo, children }) => (
  <section className="bg-[var(--c-superficie)] border-y sm:border sm:rounded-2xl border-[var(--c-borda)] overflow-hidden">
    {titulo && <div className="px-4 pt-3 pb-1 text-xs font-semibold text-[var(--c-texto-3)]">{titulo}</div>}
    {children}
  </section>
);

/** Uma linha de ação: ícone, texto, e o toque inteiro. */
const LinhaDeAcao: React.FC<{
  id?: string;
  icone: React.ReactNode;
  texto: string;
  perigo?: boolean;
  destaque?: boolean;
  aoTocar: () => void;
}> = ({ id, icone, texto, perigo, destaque, aoTocar }) => (
  <button
    type="button"
    id={id}
    onClick={aoTocar}
    className={`w-full min-h-[56px] px-4 flex items-center gap-4 text-left hover:bg-[var(--c-superficie-2)] active:bg-[var(--c-superficie-2)] transition-colors ${
      perigo ? 'text-red-600' : 'text-[var(--c-texto)]'
    }`}
  >
    <span
      className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
        destaque ? 'bg-[var(--c-acento)] text-[var(--c-sobre-acento)]' : perigo ? '' : 'text-[var(--c-texto-2)]'
      }`}
    >
      {icone}
    </span>
    <span className="text-[15px] font-medium">{texto}</span>
  </button>
);

/** Interruptor acessível, do tamanho de um polegar. */
const Interruptor: React.FC<{ ligado: boolean; aoMudar: (v: boolean) => void; id: string; desligado?: boolean }> = ({
  ligado,
  aoMudar,
  id,
  desligado,
}) => (
  <button
    type="button"
    role="switch"
    id={id}
    aria-checked={ligado}
    disabled={desligado}
    onClick={() => aoMudar(!ligado)}
    className={`relative w-12 h-7 rounded-full transition-colors flex-shrink-0 disabled:opacity-50 ${
      ligado ? 'bg-[var(--c-acento)]' : 'bg-[var(--c-borda-forte)]'
    }`}
  >
    <span
      className={`absolute top-1 w-5 h-5 rounded-full bg-white shadow transition-all ${ligado ? 'left-6' : 'left-1'}`}
    />
  </button>
);

type Confirmacao =
  | { tipo: 'sair' }
  | { tipo: 'apagar' }
  | { tipo: 'remover'; pessoa: Colaborador };

export const DadosDoGrupo: React.FC<{
  conversa: Conversa;
  colaboradorAtual: Colaborador;
  aoFechar: () => void;
  /** Apagado da minha lista: a conversa some, e a tela dela fecha. */
  aoApagar: () => void;
  /** "Conversar com Fulano": abre a conversa individual. */
  aoConversarCom?: (colegaId: string) => void;
}> = ({ conversa, colaboradorAtual, aoFechar, aoApagar, aoConversarCom }) => {
  useVoltar(true, aoFechar);

  const deGente = bancoDados.ehGrupoDePessoas(conversa);
  const administro = bancoDados.administroOGrupo(conversa);
  const sai = !!conversa.euSaiEm;
  const admins = new Set(conversa.administradoresIds || []);

  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [pessoaAberta, setPessoaAberta] = useState<Colaborador | null>(null);
  const [confirmando, setConfirmando] = useState<Confirmacao | null>(null);
  const [adicionando, setAdicionando] = useState(false);
  const [editandoNome, setEditandoNome] = useState(false);
  const [editandoDescricao, setEditandoDescricao] = useState(false);
  const [nome, setNome] = useState(conversa.nome);
  const [descricao, setDescricao] = useState(conversa.descricao || '');
  const [buscando, setBuscando] = useState(false);
  const [busca, setBusca] = useState('');

  const todos = bancoDados.obterColaboradores();
  const participantes = useMemo(
    () =>
      todos
        .filter((c) => conversa.participantesIds.includes(c.id) && !(sai && c.id === colaboradorAtual.id))
        // Você primeiro, depois quem administra, depois os outros por nome — como no WhatsApp
        .sort(
          (a, b) =>
            Number(b.id === colaboradorAtual.id) - Number(a.id === colaboradorAtual.id) ||
            Number(admins.has(b.id)) - Number(admins.has(a.id)) ||
            a.nome.localeCompare(b.nome)
        ),
    [conversa, todos.length]
  );
  const termo = busca.trim().toLowerCase();
  const visiveis = termo
    ? participantes.filter((p) => [p.nome, p.cargo, p.loja].some((x) => (x || '').toLowerCase().includes(termo)))
    : participantes;

  const fazer = async (acao: () => Promise<{ sucesso: boolean; erro?: string }>, depois?: () => void) => {
    setOcupado(true);
    setErro(null);
    const res = await acao();
    setOcupado(false);
    if (!res.sucesso) {
      setErro(res.erro || 'Não foi possível concluir.');
      return false;
    }
    depois?.();
    return true;
  };

  const salvarEdicao = (campos: Partial<{ nome: string; descricao: string; apenasGestoresPublicam: boolean }>) =>
    fazer(() =>
      bancoDados.editarGrupo(conversa.id, {
        nome: campos.nome ?? conversa.nome,
        descricao: campos.descricao ?? conversa.descricao ?? '',
        apenasGestoresPublicam: campos.apenasGestoresPublicam ?? !!conversa.apenasGestoresPublicam,
      })
    );

  const totalAtivos = participantes.length;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Dados do grupo"
      id="dados-do-grupo"
      className="absolute inset-0 z-40 flex flex-col bg-[var(--c-canvas)]"
    >
      {/* Topo: voltar e o título da tela */}
      <header className="flex items-center gap-2 px-2 h-14 bg-[var(--c-superficie)] border-b border-[var(--c-borda)] flex-shrink-0">
        <button
          type="button"
          id="voltar-dados-do-grupo"
          onClick={aoFechar}
          aria-label="Voltar para a conversa"
          className="w-10 h-10 rounded-full flex items-center justify-center text-[var(--c-texto)] hover:bg-[var(--c-superficie-2)]"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h2 className="text-base font-semibold text-[var(--c-texto)]">Dados do grupo</h2>
      </header>

      <div className="flex-1 overflow-y-auto overscroll-contain">
        <div className="max-w-2xl mx-auto flex flex-col gap-3 sm:p-4 pb-6">
          {erro && (
            <div role="alert" className="mx-4 sm:mx-0 mt-3 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-xs font-semibold text-red-600 flex items-start gap-2">
              <span className="flex-1">{erro}</span>
              <button type="button" onClick={() => setErro(null)} aria-label="Fechar aviso">
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* A FOTO, O NOME, E QUANTOS */}
          <Secao>
            <div className="px-4 pt-6 pb-5 flex flex-col items-center text-center gap-2">
              <span className="w-24 h-24 rounded-full overflow-hidden flex items-center justify-center">
                <Avatar foto={conversa.foto} nome={conversa.nome} id={conversa.id} letra="text-4xl" />
              </span>

              {/* Só enquanto administra: saiu ou perdeu o papel, a edição fecha */}
              {editandoNome && administro ? (
                <div className="w-full max-w-sm flex items-center gap-2 mt-1">
                  <input
                    id="editar-nome-do-grupo"
                    autoFocus
                    value={nome}
                    maxLength={80}
                    onChange={(e) => setNome(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && nome.trim() && document.getElementById('salvar-nome-do-grupo')?.click()}
                    className="flex-1 h-11 px-3 rounded-xl bg-[var(--c-canvas)] border-2 border-[var(--c-acento)] text-base text-[var(--c-texto)] outline-none"
                  />
                  <button
                    type="button"
                    id="salvar-nome-do-grupo"
                    disabled={!nome.trim() || ocupado}
                    onClick={async () => {
                      if (await salvarEdicao({ nome })) setEditandoNome(false);
                    }}
                    aria-label="Salvar o nome"
                    className="w-11 h-11 rounded-xl bg-[var(--c-acento)] text-[var(--c-sobre-acento)] flex items-center justify-center disabled:opacity-40"
                  >
                    <Check className="w-5 h-5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setNome(conversa.nome);
                      setEditandoNome(false);
                    }}
                    aria-label="Cancelar"
                    className="w-11 h-11 rounded-xl border border-[var(--c-borda)] text-[var(--c-texto-2)] flex items-center justify-center"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-1.5 mt-1">
                  <h3 className="text-xl font-bold text-[var(--c-texto)] break-words">{conversa.nome}</h3>
                  {administro && (
                    <button
                      type="button"
                      id="editar-nome-grupo"
                      onClick={() => setEditandoNome(true)}
                      aria-label="Editar o nome do grupo"
                      className="w-9 h-9 rounded-full flex items-center justify-center text-[var(--c-texto-3)] hover:text-[var(--c-acento)] hover:bg-[var(--c-superficie-2)]"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                  )}
                </div>
              )}

              <p className="text-sm text-[var(--c-texto-3)]">
                {deGente ? 'Grupo' : 'Canal oficial da rede'} · {totalAtivos}{' '}
                {totalAtivos === 1 ? 'participante' : 'participantes'}
              </p>
            </div>
          </Secao>

          {/* A DESCRIÇÃO: escrita por quem administra, lida por todos */}
          {(conversa.descricao || administro) && (
            <Secao>
              {editandoDescricao && administro ? (
                <div className="p-4 flex flex-col gap-2">
                  <textarea
                    id="editar-descricao-do-grupo"
                    autoFocus
                    rows={3}
                    maxLength={500}
                    value={descricao}
                    onChange={(e) => setDescricao(e.target.value)}
                    placeholder="Para que serve o grupo"
                    className="w-full px-3 py-2 rounded-xl bg-[var(--c-canvas)] border-2 border-[var(--c-acento)] text-sm text-[var(--c-texto)] resize-none outline-none"
                  />
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setDescricao(conversa.descricao || '');
                        setEditandoDescricao(false);
                      }}
                      className="h-10 px-4 rounded-xl border border-[var(--c-borda)] text-sm font-semibold text-[var(--c-texto-2)]"
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      id="salvar-descricao-do-grupo"
                      disabled={ocupado}
                      onClick={async () => {
                        if (await salvarEdicao({ descricao })) setEditandoDescricao(false);
                      }}
                      className="h-10 px-4 rounded-xl bg-[var(--c-acento)] text-[var(--c-sobre-acento)] text-sm font-bold disabled:opacity-40"
                    >
                      Salvar
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  disabled={!administro}
                  onClick={() => setEditandoDescricao(true)}
                  className="w-full px-4 py-3.5 text-left enabled:hover:bg-[var(--c-superficie-2)]"
                >
                  {conversa.descricao ? (
                    <span className="text-sm text-[var(--c-texto)] whitespace-pre-wrap break-words">
                      {conversa.descricao}
                    </span>
                  ) : (
                    <span className="text-sm font-medium text-[var(--c-acento)]">Adicionar descrição do grupo</span>
                  )}
                </button>
              )}
            </Secao>
          )}

          {sai && (
            <div className="mx-4 sm:mx-0 p-3 rounded-xl bg-[var(--c-superficie-2)] text-sm text-[var(--c-texto-2)]">
              Você não participa mais deste grupo. O histórico até a sua saída continua aqui.
            </div>
          )}

          {/* CONFIGURAÇÕES: só quem administra vê */}
          {administro && (
            <Secao titulo="Configurações do grupo">
              <div className="px-4 py-3 flex items-center gap-4">
                <span className="flex-1">
                  <span className="block text-[15px] text-[var(--c-texto)]">Só administradores enviam mensagens</span>
                  <span className="block text-xs text-[var(--c-texto-3)]">Os outros participantes leem, mas não escrevem.</span>
                </span>
                <Interruptor
                  id="interruptor-so-admins-enviam"
                  ligado={!!conversa.apenasGestoresPublicam}
                  desligado={ocupado}
                  aoMudar={(v) => salvarEdicao({ apenasGestoresPublicam: v })}
                />
              </div>
            </Secao>
          )}

          {/* OS PARTICIPANTES */}
          <Secao
            titulo={
              <div className="flex items-center justify-between -mt-0.5">
                <span>
                  {totalAtivos} {totalAtivos === 1 ? 'participante' : 'participantes'}
                </span>
                {totalAtivos > 6 && (
                  <button
                    type="button"
                    id="buscar-participantes"
                    onClick={() => {
                      setBuscando((b) => !b);
                      setBusca('');
                    }}
                    aria-label="Buscar participantes"
                    className="w-8 h-8 -mr-2 rounded-full flex items-center justify-center hover:bg-[var(--c-superficie-2)]"
                  >
                    {buscando ? <X className="w-4 h-4" /> : <Search className="w-4 h-4" />}
                  </button>
                )}
              </div>
            }
          >
            {buscando && (
              <div className="px-4 pb-2">
                <input
                  id="busca-participantes"
                  autoFocus
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  placeholder="Buscar participante"
                  className="w-full h-10 px-3 rounded-xl bg-[var(--c-canvas)] border border-[var(--c-borda)] text-sm text-[var(--c-texto)] outline-none focus:border-[var(--c-acento)]"
                />
              </div>
            )}

            {administro && !buscando && (
              <LinhaDeAcao
                id="adicionar-ao-grupo"
                destaque
                icone={<UserPlus className="w-5 h-5" />}
                texto="Adicionar participantes"
                aoTocar={() => {
                  setErro(null);
                  setAdicionando(true);
                }}
              />
            )}

            <ul>
              {visiveis.map((p) => {
                const souEu = p.id === colaboradorAtual.id;
                return (
                  <li key={p.id}>
                    <button
                      type="button"
                      id={`participante-${p.id}`}
                      disabled={souEu}
                      onClick={() => setPessoaAberta(p)}
                      className="w-full min-h-[64px] px-4 py-2 flex items-center gap-4 text-left enabled:hover:bg-[var(--c-superficie-2)] enabled:active:bg-[var(--c-superficie-2)]"
                    >
                      <FotoPresenca foto={p.foto} nome={p.nome} presenca={p.presenca} tamanho="w-10 h-10" />
                      <span className="flex-1 min-w-0">
                        <span className="block text-[15px] font-medium text-[var(--c-texto)] truncate">
                          {souEu ? 'Você' : p.nome}
                        </span>
                        <span className="block text-xs text-[var(--c-texto-3)] truncate">
                          {p.cargo} · {p.loja}
                        </span>
                      </span>
                      {deGente && admins.has(p.id) && (
                        <span className="text-[11px] font-semibold px-2 py-1 rounded-md bg-emerald-500/12 text-emerald-700 dark:text-emerald-400 flex-shrink-0">
                          Admin do grupo
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
              {visiveis.length === 0 && (
                <li className="px-4 py-6 text-center text-sm text-[var(--c-texto-3)]">Ninguém com “{busca.trim()}”.</li>
              )}
            </ul>
          </Secao>

          {/* O QUE TIRA DO GRUPO: por último, em vermelho */}
          {deGente && (
            <Secao>
              {sai ? (
                <LinhaDeAcao
                  id="apagar-grupo-da-lista"
                  perigo
                  icone={<Trash2 className="w-5 h-5" />}
                  texto="Apagar grupo"
                  aoTocar={() => setConfirmando({ tipo: 'apagar' })}
                />
              ) : (
                <LinhaDeAcao
                  id="sair-do-grupo"
                  perigo
                  icone={<LogOut className="w-5 h-5" />}
                  texto="Sair do grupo"
                  aoTocar={() => setConfirmando({ tipo: 'sair' })}
                />
              )}
            </Secao>
          )}

          {!deGente && (
            <p className="px-4 text-xs text-center text-[var(--c-texto-3)] flex items-center justify-center gap-1.5">
              <Users className="w-3.5 h-3.5" />
              Canal oficial: quem entra e sai é definido pelo TI.
            </p>
          )}
        </div>
      </div>

      {/* A PESSOA: o que dá para fazer com ela, numa folha */}
      <FolhaInferior
        aberto={!!pessoaAberta}
        titulo={pessoaAberta?.nome || ''}
        subtitulo={pessoaAberta ? `${pessoaAberta.cargo} · ${pessoaAberta.loja}` : undefined}
        aoFechar={() => setPessoaAberta(null)}
      >
        {pessoaAberta && (
          <div className="py-2">
            {aoConversarCom && (
              <LinhaDeAcao
                icone={<MessageSquare className="w-5 h-5" />}
                texto={`Conversar com ${primeiroNome(pessoaAberta.nome)}`}
                aoTocar={() => {
                  const id = pessoaAberta.id;
                  setPessoaAberta(null);
                  aoFechar();
                  aoConversarCom(id);
                }}
              />
            )}
            {deGente && administro && (
              <>
                <LinhaDeAcao
                  id="alternar-admin"
                  icone={admins.has(pessoaAberta.id) ? <ShieldOff className="w-5 h-5" /> : <Crown className="w-5 h-5" />}
                  texto={admins.has(pessoaAberta.id) ? 'Remover como admin do grupo' : 'Tornar admin do grupo'}
                  aoTocar={() =>
                    fazer(
                      () => bancoDados.definirAdminDoGrupo(conversa.id, pessoaAberta.id, !admins.has(pessoaAberta.id)),
                      () => setPessoaAberta(null)
                    )
                  }
                />
                <LinhaDeAcao
                  id="remover-do-grupo"
                  perigo
                  icone={<UserMinus className="w-5 h-5" />}
                  texto={`Remover ${primeiroNome(pessoaAberta.nome)}`}
                  aoTocar={() => {
                    const p = pessoaAberta;
                    setPessoaAberta(null);
                    setConfirmando({ tipo: 'remover', pessoa: p });
                  }}
                />
              </>
            )}
          </div>
        )}
      </FolhaInferior>

      {/* CONFIRMAÇÕES: o que não se desfaz com um toque pergunta antes */}
      <FolhaInferior
        aberto={!!confirmando}
        titulo={
          confirmando?.tipo === 'sair'
            ? `Sair de “${conversa.nome}”?`
            : confirmando?.tipo === 'apagar'
              ? `Apagar “${conversa.nome}”?`
              : confirmando?.tipo === 'remover'
                ? `Remover ${primeiroNome(confirmando.pessoa.nome)} do grupo?`
                : ''
        }
        aoFechar={() => setConfirmando(null)}
        rodape={
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setConfirmando(null)}
              disabled={ocupado}
              className="flex-1 h-12 rounded-2xl border border-[var(--c-borda)] text-sm font-semibold text-[var(--c-texto-2)]"
            >
              Cancelar
            </button>
            <button
              type="button"
              id="confirmar-acao-do-grupo"
              disabled={ocupado}
              onClick={() => {
                const c = confirmando;
                if (!c) return;
                if (c.tipo === 'sair') fazer(() => bancoDados.sairDoGrupo(conversa.id), () => setConfirmando(null));
                if (c.tipo === 'apagar')
                  fazer(() => bancoDados.apagarGrupoDaMinhaLista(conversa.id), () => {
                    setConfirmando(null);
                    aoApagar();
                  });
                if (c.tipo === 'remover')
                  fazer(() => bancoDados.removerDoGrupo(conversa.id, c.pessoa.id), () => setConfirmando(null));
              }}
              className="flex-1 h-12 rounded-2xl bg-red-600 text-white text-sm font-bold disabled:opacity-50"
            >
              {ocupado
                ? 'Aguarde…'
                : confirmando?.tipo === 'sair'
                  ? 'Sair'
                  : confirmando?.tipo === 'apagar'
                    ? 'Apagar'
                    : 'Remover'}
            </button>
          </div>
        }
      >
        <p className="p-4 text-sm text-[var(--c-texto-2)] leading-relaxed">
          {confirmando?.tipo === 'sair' && (
            <>
              Você deixa de receber as mensagens do grupo. O que veio até agora continua com você.
              {administro && admins.size === 1 && totalAtivos > 1 && (
                <> Como você é o único admin, a pessoa mais antiga do grupo assume.</>
              )}
            </>
          )}
          {confirmando?.tipo === 'apagar' && 'O grupo sai da sua lista, com o histórico. Para os outros participantes, ele continua.'}
          {confirmando?.tipo === 'remover' &&
            `${primeiroNome(confirmando.pessoa.nome)} deixa de receber as mensagens do grupo. Você pode adicionar de novo depois.`}
        </p>
      </FolhaInferior>

      {/* ADICIONAR: a mesma escolha de pessoas da criação do grupo */}
      {adicionando && (
        <EscolherPessoas
          titulo="Adicionar participantes"
          candidatos={todos.filter((c) => c.ativo !== false && !conversa.participantesIds.includes(c.id))}
          textoDoBotao={(n) => (n ? `Adicionar ${n}` : 'Adicionar')}
          ocupado={ocupado}
          erro={erro}
          aoVoltar={() => setAdicionando(false)}
          aoConfirmar={(ids) => fazer(() => bancoDados.adicionarAoGrupo(conversa.id, ids), () => setAdicionando(false))}
        />
      )}
    </div>
  );
};
