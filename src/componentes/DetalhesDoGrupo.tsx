/**
 * DETALHES DO GRUPO — quem está, quem administra, e o que cada um pode
 * fazer (Elias, 03/10/2026, no modelo do WhatsApp):
 *
 *   - ADMINISTRADOR do grupo: adiciona e remove pessoas, edita o nome e a
 *     descrição, liga "só administradores enviam", torna outros
 *     administradores;
 *   - TODO PARTICIPANTE: sai do grupo quando quiser;
 *   - QUEM SAIU: apaga o grupo da própria lista (para os outros, segue).
 *
 * Os canais oficiais (das lojas, Avisos da Rede) mostram só quem está: quem
 * cuida deles é o TI, e deles ninguém sai.
 *
 * Quem decide se pode é o banco (grupos-de-todos.sql). A tela esconde o
 * botão de quem não pode, e mostra a recusa do banco se ela vier.
 */
import React, { useMemo, useState } from 'react';
import { ArrowLeft, Check, Crown, LogOut, Pencil, Search, Trash2, UserMinus, UserPlus, X } from 'lucide-react';
import { Colaborador, Conversa } from '../tipos';
import { bancoDados } from '../servicos/bancoDados';
import { FotoPresenca } from './FotoPresenca';

type Vista = 'lista' | 'adicionar' | 'editar' | 'confirmar_saida';

export const DetalhesDoGrupo: React.FC<{
  conversa: Conversa;
  colaboradorAtual: Colaborador;
  aoFechar: () => void;
  /** Apagado da minha lista: a conversa some, e a janela dela fecha. */
  aoApagar: () => void;
}> = ({ conversa, colaboradorAtual, aoFechar, aoApagar }) => {
  const [vista, setVista] = useState<Vista>('lista');
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [acoesDe, setAcoesDe] = useState<string | null>(null);

  const deGente = bancoDados.ehGrupoDePessoas(conversa);
  const administro = bancoDados.administroOGrupo(conversa);
  const sai = !!conversa.euSaiEm;
  const admins = new Set(conversa.administradoresIds || []);

  // Quem está: eu primeiro, depois os administradores, depois os outros, por nome
  const todos = bancoDados.obterColaboradores();
  const participantes = todos
    .filter((c) => conversa.participantesIds.includes(c.id) && !(sai && c.id === colaboradorAtual.id))
    .sort(
      (a, b) =>
        Number(b.id === colaboradorAtual.id) - Number(a.id === colaboradorAtual.id) ||
        Number(admins.has(b.id)) - Number(admins.has(a.id)) ||
        a.nome.localeCompare(b.nome)
    );

  const fazer = async (acao: () => Promise<{ sucesso: boolean; erro?: string }>, depois?: () => void) => {
    setOcupado(true);
    setErro(null);
    const res = await acao();
    setOcupado(false);
    if (!res.sucesso) return setErro(res.erro || 'Não foi possível concluir.');
    setAcoesDe(null);
    depois?.();
  };

  if (vista === 'adicionar') {
    return (
      <SeletorDePessoas
        candidatos={todos.filter((c) => c.ativo !== false && !conversa.participantesIds.includes(c.id))}
        ocupado={ocupado}
        erro={erro}
        aoVoltar={() => setVista('lista')}
        aoConfirmar={(ids) => fazer(() => bancoDados.adicionarAoGrupo(conversa.id, ids), () => setVista('lista'))}
      />
    );
  }

  if (vista === 'editar') {
    return (
      <EditarGrupo
        conversa={conversa}
        ocupado={ocupado}
        erro={erro}
        aoVoltar={() => setVista('lista')}
        aoSalvar={(campos) => fazer(() => bancoDados.editarGrupo(conversa.id, campos), () => setVista('lista'))}
      />
    );
  }

  if (vista === 'confirmar_saida') {
    return (
      <div className="p-5 flex flex-col gap-4">
        <h3 className="text-base font-bold text-[var(--c-texto)]">Sair de “{conversa.nome}”?</h3>
        <p className="text-sm text-[var(--c-texto-2)] leading-relaxed">
          Você deixa de receber as mensagens do grupo. O que veio até agora continua com você, e
          depois pode apagar o grupo da sua lista.
          {administro && admins.size === 1 && participantes.length > 1 && (
            <> Como você é o único administrador, a pessoa mais antiga do grupo assume.</>
          )}
        </p>
        {erro && <p role="alert" className="text-xs font-semibold text-red-600">{erro}</p>}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setVista('lista')}
            disabled={ocupado}
            className="flex-1 h-11 rounded-xl border border-[var(--c-borda)] text-sm font-semibold text-[var(--c-texto-2)]"
          >
            Cancelar
          </button>
          <button
            type="button"
            id="confirmar-sair-do-grupo"
            onClick={() => fazer(() => bancoDados.sairDoGrupo(conversa.id), () => setVista('lista'))}
            disabled={ocupado}
            className="flex-1 h-11 rounded-xl bg-red-600 text-white text-sm font-bold disabled:opacity-50"
          >
            {ocupado ? 'Saindo…' : 'Sair do grupo'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {conversa.descricao && (
        <p className="text-sm text-[var(--c-texto-2)] whitespace-pre-wrap break-words">{conversa.descricao}</p>
      )}

      {sai && (
        <div className="p-3 rounded-xl bg-[var(--c-superficie-2)] text-xs text-[var(--c-texto-2)]">
          Você saiu deste grupo. O histórico até a sua saída continua aqui.
        </div>
      )}

      {erro && <p role="alert" className="text-xs font-semibold text-red-600">{erro}</p>}

      <div className="flex items-center justify-between">
        <span className="font-bold text-xs text-[var(--c-texto-2)] uppercase tracking-wider">
          {participantes.length} {participantes.length === 1 ? 'participante' : 'participantes'}
        </span>
        {administro && (
          <button
            type="button"
            onClick={() => setVista('editar')}
            className="text-xs font-semibold text-[var(--c-acento)] flex items-center gap-1"
          >
            <Pencil className="w-3.5 h-3.5" />
            Editar grupo
          </button>
        )}
      </div>

      <div className="divide-y divide-[var(--c-borda)] border border-[var(--c-borda)] rounded-xl overflow-hidden">
        {administro && (
          <button
            type="button"
            id="adicionar-ao-grupo"
            onClick={() => {
              setErro(null);
              setVista('adicionar');
            }}
            className="w-full p-2.5 flex items-center gap-2.5 text-left hover:bg-[var(--c-superficie-2)]"
          >
            <span className="w-8 h-8 rounded-full bg-[var(--c-acento)] text-[var(--c-sobre-acento)] flex items-center justify-center flex-shrink-0">
              <UserPlus className="w-4 h-4" />
            </span>
            <span className="text-sm font-semibold text-[var(--c-texto)]">Adicionar participantes</span>
          </button>
        )}

        {participantes.map((p) => {
          const souEu = p.id === colaboradorAtual.id;
          const ehAdmin = admins.has(p.id);
          const temAcoes = deGente && administro && !souEu;
          return (
            <div key={p.id}>
              <button
                type="button"
                disabled={!temAcoes}
                onClick={() => setAcoesDe(acoesDe === p.id ? null : p.id)}
                className="w-full p-2.5 flex items-center gap-2.5 text-left enabled:hover:bg-[var(--c-superficie-2)]"
              >
                <FotoPresenca foto={p.foto} nome={p.nome} presenca={p.presenca} tamanho="w-8 h-8" />
                <span className="flex-1 min-w-0">
                  <strong className="text-xs text-[var(--c-texto)] block truncate">{souEu ? 'Você' : p.nome}</strong>
                  <span className="text-[11px] text-[var(--c-texto-3)] block truncate">
                    {p.cargo} · {p.loja}
                  </span>
                </span>
                {deGente && ehAdmin && (
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-emerald-500/12 text-emerald-700 dark:text-emerald-400 flex-shrink-0">
                    Admin
                  </span>
                )}
              </button>

              {/* As ações sobre a pessoa, abaixo dela — como o menu do WhatsApp */}
              {acoesDe === p.id && (
                <div className="px-2.5 pb-2.5 flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={ocupado}
                    onClick={() => fazer(() => bancoDados.definirAdminDoGrupo(conversa.id, p.id, !ehAdmin))}
                    className="h-9 px-3 rounded-lg border border-[var(--c-borda)] text-xs font-semibold text-[var(--c-texto-2)] flex items-center gap-1.5 disabled:opacity-50"
                  >
                    <Crown className="w-3.5 h-3.5" />
                    {ehAdmin ? 'Tirar de administrador' : 'Tornar administrador'}
                  </button>
                  <button
                    type="button"
                    disabled={ocupado}
                    onClick={() => fazer(() => bancoDados.removerDoGrupo(conversa.id, p.id))}
                    className="h-9 px-3 rounded-lg border border-red-500/30 text-xs font-semibold text-red-600 flex items-center gap-1.5 disabled:opacity-50"
                  >
                    <UserMinus className="w-3.5 h-3.5" />
                    Remover do grupo
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* SAIR e APAGAR: só nos grupos de gente — do canal oficial ninguém sai */}
      {deGente && !sai && (
        <button
          type="button"
          id="sair-do-grupo"
          onClick={() => {
            setErro(null);
            setVista('confirmar_saida');
          }}
          className="w-full h-11 rounded-xl border border-red-500/30 text-red-600 text-sm font-semibold flex items-center justify-center gap-2 hover:bg-red-500/5"
        >
          <LogOut className="w-4 h-4" />
          Sair do grupo
        </button>
      )}
      {deGente && sai && (
        <button
          type="button"
          id="apagar-grupo-da-lista"
          disabled={ocupado}
          onClick={() => fazer(() => bancoDados.apagarGrupoDaMinhaLista(conversa.id), aoApagar)}
          className="w-full h-11 rounded-xl bg-red-600 text-white text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-50"
        >
          <Trash2 className="w-4 h-4" />
          {ocupado ? 'Apagando…' : 'Apagar grupo da minha lista'}
        </button>
      )}

      <button
        type="button"
        onClick={aoFechar}
        className="w-full py-2.5 rounded-xl bg-[var(--c-superficie-2)] hover:bg-[var(--c-borda)] font-semibold text-xs text-[var(--c-texto)] transition-colors"
      >
        Fechar
      </button>
    </div>
  );
};

/** Escolher quem entra: busca e marcação, como na criação do grupo. */
const SeletorDePessoas: React.FC<{
  candidatos: Colaborador[];
  ocupado: boolean;
  erro: string | null;
  aoVoltar: () => void;
  aoConfirmar: (ids: string[]) => void;
}> = ({ candidatos, ocupado, erro, aoVoltar, aoConfirmar }) => {
  const [busca, setBusca] = useState('');
  const [marcados, setMarcados] = useState<string[]>([]);
  const termo = busca.trim().toLowerCase();
  const lista = useMemo(
    () =>
      [...candidatos]
        .filter((c) => !termo || [c.nome, c.cargo, c.loja, c.setor].some((x) => (x || '').toLowerCase().includes(termo)))
        .sort((a, b) => a.nome.localeCompare(b.nome)),
    [candidatos, termo]
  );

  return (
    <div className="flex flex-col gap-3 min-h-0">
      <div className="flex items-center gap-2">
        <button type="button" onClick={aoVoltar} aria-label="Voltar" className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-[var(--c-superficie-2)]">
          <ArrowLeft className="w-4 h-4" />
        </button>
        <h3 className="flex-1 text-sm font-bold text-[var(--c-texto)]">Adicionar participantes</h3>
        <button
          type="button"
          id="confirmar-adicionar-ao-grupo"
          disabled={marcados.length === 0 || ocupado}
          onClick={() => aoConfirmar(marcados)}
          className="h-9 px-3 rounded-lg bg-[var(--c-acento)] text-[var(--c-sobre-acento)] text-xs font-bold disabled:opacity-40"
        >
          {ocupado ? 'Adicionando…' : marcados.length ? `Adicionar ${marcados.length}` : 'Adicionar'}
        </button>
      </div>
      {erro && <p role="alert" className="text-xs font-semibold text-red-600">{erro}</p>}
      <div className="relative">
        <Search className="w-4 h-4 text-[var(--c-texto-3)] absolute left-3 top-1/2 -translate-y-1/2" />
        <input
          id="busca-adicionar-ao-grupo"
          type="text"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar por nome, cargo ou loja…"
          className="w-full h-10 pl-9 pr-3 rounded-lg bg-[var(--c-canvas)] border border-[var(--c-borda)] text-sm text-[var(--c-texto)] outline-none focus:border-[var(--c-acento)]"
        />
      </div>
      <div className="max-h-[45vh] overflow-y-auto divide-y divide-[var(--c-borda)] border border-[var(--c-borda)] rounded-xl">
        {lista.map((c) => {
          const marcado = marcados.includes(c.id);
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => setMarcados((m) => (marcado ? m.filter((x) => x !== c.id) : [...m, c.id]))}
              className="w-full p-2.5 flex items-center gap-2.5 text-left hover:bg-[var(--c-superficie-2)]"
            >
              <FotoPresenca foto={c.foto} nome={c.nome} presenca={c.presenca} tamanho="w-8 h-8" />
              <span className="flex-1 min-w-0">
                <strong className="text-xs text-[var(--c-texto)] block truncate">{c.nome}</strong>
                <span className="text-[11px] text-[var(--c-texto-3)] block truncate">{c.cargo} · {c.loja}</span>
              </span>
              <span
                className={`w-5 h-5 rounded-md border flex items-center justify-center flex-shrink-0 ${
                  marcado ? 'bg-[var(--c-acento)] border-[var(--c-acento)] text-[var(--c-sobre-acento)]' : 'border-[var(--c-borda-forte)]'
                }`}
              >
                {marcado && <Check className="w-3.5 h-3.5" />}
              </span>
            </button>
          );
        })}
        {lista.length === 0 && (
          <p className="py-6 text-center text-xs text-[var(--c-texto-3)]">
            {candidatos.length === 0 ? 'Todo mundo já está no grupo.' : `Ninguém com “${busca.trim()}”.`}
          </p>
        )}
      </div>
    </div>
  );
};

/** Nome, descrição e "só administradores enviam" — só para administradores. */
const EditarGrupo: React.FC<{
  conversa: Conversa;
  ocupado: boolean;
  erro: string | null;
  aoVoltar: () => void;
  aoSalvar: (campos: { nome: string; descricao: string; apenasGestoresPublicam: boolean }) => void;
}> = ({ conversa, ocupado, erro, aoVoltar, aoSalvar }) => {
  const [nome, setNome] = useState(conversa.nome);
  const [descricao, setDescricao] = useState(conversa.descricao || '');
  const [soAdmins, setSoAdmins] = useState(!!conversa.apenasGestoresPublicam);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <button type="button" onClick={aoVoltar} aria-label="Voltar" className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-[var(--c-superficie-2)]">
          <ArrowLeft className="w-4 h-4" />
        </button>
        <h3 className="flex-1 text-sm font-bold text-[var(--c-texto)]">Editar grupo</h3>
        <button type="button" onClick={aoVoltar} aria-label="Fechar" className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-[var(--c-superficie-2)]">
          <X className="w-4 h-4" />
        </button>
      </div>
      <label className="text-xs font-semibold text-[var(--c-texto-2)]" htmlFor="editar-nome-grupo">Nome</label>
      <input
        id="editar-nome-grupo"
        value={nome}
        maxLength={80}
        onChange={(e) => setNome(e.target.value)}
        className="h-11 px-3 rounded-xl bg-[var(--c-canvas)] border border-[var(--c-borda)] text-sm text-[var(--c-texto)] outline-none focus:border-[var(--c-acento)]"
      />
      <label className="text-xs font-semibold text-[var(--c-texto-2)]" htmlFor="editar-descricao-grupo">Descrição</label>
      <textarea
        id="editar-descricao-grupo"
        rows={3}
        value={descricao}
        onChange={(e) => setDescricao(e.target.value)}
        placeholder="Para que serve o grupo (opcional)"
        className="px-3 py-2 rounded-xl bg-[var(--c-canvas)] border border-[var(--c-borda)] text-sm text-[var(--c-texto)] resize-none outline-none focus:border-[var(--c-acento)]"
      />
      <label className="flex items-start gap-2 text-sm text-[var(--c-texto-2)]">
        <input type="checkbox" checked={soAdmins} onChange={(e) => setSoAdmins(e.target.checked)} className="mt-1 w-4 h-4 accent-[var(--c-acento)]" />
        <span>
          Só administradores enviam mensagens
          <span className="block text-[11px] text-[var(--c-texto-3)]">Os outros participantes leem, mas não escrevem.</span>
        </span>
      </label>
      {erro && <p role="alert" className="text-xs font-semibold text-red-600">{erro}</p>}
      <button
        type="button"
        id="salvar-edicao-grupo"
        disabled={!nome.trim() || ocupado}
        onClick={() => aoSalvar({ nome, descricao, apenasGestoresPublicam: soAdmins })}
        className="h-11 rounded-xl bg-[var(--c-acento)] text-[var(--c-sobre-acento)] text-sm font-bold disabled:opacity-40"
      >
        {ocupado ? 'Salvando…' : 'Salvar'}
      </button>
    </div>
  );
};
