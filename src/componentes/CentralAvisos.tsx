import React, { useState, useEffect } from 'react';
import {
  Megaphone,
  Plus,
  Pin,
  AlertTriangle,
  Info,
  AlertCircle,
  CheckCircle2,
  Trash2,
  Building2,
  Clock,
  User,
  ShieldCheck,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { Colaborador, AvisoRede, PrioridadeAviso, Loja } from '../tipos';
import { bancoDados } from '../servicos/bancoDados';

interface PropsCentralAvisos {
  colaboradorAtual: Colaborador;
  aoAbrirConversaAvisos?: () => void;
  aoAlternarParaGestor?: () => void;
}

const LOJAS_OPCOES: (Loja | 'Todas')[] = [
  'Todas',
  'Pirassununga',
  'Porto Ferreira',
  'Palmeiras',
  'Descalvado',
  'Santa Rita',
];

export const CentralAvisos: React.FC<PropsCentralAvisos> = ({
  colaboradorAtual,
  aoAbrirConversaAvisos,
  aoAlternarParaGestor,
}) => {
  const [avisos, setAvisos] = useState<AvisoRede[]>([]);
  const [formularioAberto, setFormularioAberto] = useState(false);
  const [filtroPrioridade, setFiltroPrioridade] = useState<'todas' | PrioridadeAviso>('todas');
  const [filtroLoja, setFiltroLoja] = useState<Loja | 'Todas'>('Todas');

  // Campos do formulário
  const [titulo, setTitulo] = useState('');
  const [conteudo, setConteudo] = useState('');
  const [prioridade, setPrioridade] = useState<PrioridadeAviso>('geral');
  const [lojaDestino, setLojaDestino] = useState<Loja | 'Todas'>('Todas');
  const [fixadoNoTopo, setFixadoNoTopo] = useState(false);
  const [mensagemStatus, setMensagemStatus] = useState<string | null>(null);
  const [avisoParaExcluirId, setAvisoParaExcluirId] = useState<string | null>(null);

  const carregarAvisos = () => {
    setAvisos(bancoDados.obterAvisosVisiveisParaUsuarioAtual());
  };

  useEffect(() => {
    carregarAvisos();
    const cancelar = bancoDados.assinarAlteracoes(carregarAvisos);
    return () => cancelar();
  }, []);

  const podePublicar = colaboradorAtual.nivel === 4;

  const lidarEnviarAviso = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!titulo.trim() || !conteudo.trim()) {
      setMensagemStatus('Preencha o título e o conteúdo do aviso.');
      return;
    }

    const resultado = await bancoDados.criarAvisoRede({
      titulo,
      conteudo,
      prioridade,
      lojaDestino,
      fixadoNoTopo,
    });

    if (resultado.sucesso) {
      setTitulo('');
      setConteudo('');
      setPrioridade('geral');
      setLojaDestino('Todas');
      setFixadoNoTopo(false);
      setFormularioAberto(false);
      setMensagemStatus('Comunicado publicado com sucesso para toda a rede!');
      setTimeout(() => setMensagemStatus(null), 4000);
    } else {
      setMensagemStatus(resultado.erro || 'Erro ao publicar aviso.');
    }
  };

  const avisosFiltrados = avisos.filter((aviso) => {
    if (filtroPrioridade !== 'todas' && aviso.prioridade !== filtroPrioridade) {
      return false;
    }
    if (filtroLoja !== 'Todas' && aviso.lojaDestino !== 'Todas' && aviso.lojaDestino !== filtroLoja) {
      return false;
    }
    return true;
  });

  const obterIconePrioridade = (p: PrioridadeAviso) => {
    switch (p) {
      case 'urgente':
        return <AlertTriangle className="w-4 h-4 text-red-600" />;
      case 'atencao':
        return <AlertCircle className="w-4 h-4 text-amber-600" />;
      default:
        return <Info className="w-4 h-4 text-blue-600" />;
    }
  };

  const obterBadgePrioridade = (p: PrioridadeAviso) => {
    switch (p) {
      case 'urgente':
        return (
          <span className="px-2 py-0.5 text-xs font-bold rounded-full bg-red-100 dark:bg-red-950/60 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800 flex items-center gap-1">
            <AlertTriangle className="w-3 h-3" /> Urgente
          </span>
        );
      case 'atencao':
        return (
          <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800 flex items-center gap-1">
            <AlertCircle className="w-3 h-3" /> Atenção
          </span>
        );
      default:
        return (
          <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 flex items-center gap-1">
            <Info className="w-3 h-3" /> Geral
          </span>
        );
    }
  };

  return (
    <div className="w-full flex flex-col gap-5 p-4 sm:p-6">
      {/* Topo informativo com ação de novo aviso */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-[var(--c-superficie)] p-4 sm:p-5 rounded-xl border border-[var(--c-borda)] shadow-sm">
        <div className="flex items-start gap-3">
          <div className="w-11 h-11 rounded-lg bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 text-blue-600 dark:text-blue-400 flex items-center justify-center flex-shrink-0">
            <Megaphone className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-base sm:text-lg font-bold text-[var(--c-texto)]">
              Central de Avisos da Direção
            </h2>
            <p className="text-xs sm:text-sm text-[var(--c-texto-3)]">
              Comunicados operacionais, inventários e avisos para as 5 lojas da Malachias
            </p>
          </div>
        </div>

        {podePublicar ? (
          <button
            type="button"
            id="botao-abrir-formulario-aviso"
            onClick={() => setFormularioAberto(!formularioAberto)}
            className="w-full sm:w-auto px-4 py-2.5 rounded-lg bg-[var(--c-acento)] text-[var(--c-sobre-acento)] font-semibold text-sm flex items-center justify-center gap-2 hover:brightness-110 active:scale-95 transition-all shadow-sm"
          >
            {formularioAberto ? (
              <>
                <ChevronUp className="w-4 h-4" /> Recolher Formulário
              </>
            ) : (
              <>
                <Plus className="w-4 h-4" /> Novo Comunicado
              </>
            )}
          </button>
        ) : (
          <div className="w-full sm:w-auto flex items-center gap-2 text-xs bg-slate-100 dark:bg-slate-800/80 px-3 py-2 rounded-lg text-[var(--c-texto-2)] border border-[var(--c-borda)]">
            <ShieldCheck className="w-4 h-4 text-[var(--c-acento)]" />
            <span>Publicação de comunicados restrita à Administração de TI (N4)</span>
          </div>
        )}
      </div>

      {/* Mensagem temporária de status */}
      {mensagemStatus && (
        <div className="p-3.5 bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 rounded-lg text-sm text-blue-800 dark:text-blue-200 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-blue-600 flex-shrink-0" />
          <span>{mensagemStatus}</span>
        </div>
      )}

      {/* Formulário de Criação de Aviso (Nível 2+) */}
      {formularioAberto && podePublicar && (
        <form
          onSubmit={lidarEnviarAviso}
          className="bg-[var(--c-superficie)] p-5 rounded-xl border-2 border-[var(--c-acento)] shadow-md flex flex-col gap-4 animate-in fade-in duration-200"
          id="formulario-novo-aviso"
        >
          <div className="flex items-center justify-between border-b border-[var(--c-borda)] pb-3">
            <span className="text-sm font-bold text-[var(--c-texto)] flex items-center gap-2">
              <Megaphone className="w-4 h-4 text-[var(--c-acento)]" /> Publicar Novo Comunicado Oficial
            </span>
            <span className="text-xs text-[var(--c-texto-3)]">
              Autor: {colaboradorAtual.nome} ({colaboradorAtual.cargo})
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-[var(--c-texto-2)] mb-1">
                Título do Comunicado *
              </label>
              <input
                type="text"
                id="campo-titulo-aviso"
                value={titulo}
                onChange={(e) => setTitulo(e.target.value)}
                placeholder="Ex: Inventário Geral da Rede Malachias"
                className="w-full px-3 py-2 text-sm bg-[var(--c-canvas)] border border-[var(--c-borda)] rounded-lg text-[var(--c-texto)] focus:outline-none focus:ring-2 focus:ring-[var(--c-acento)]"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[var(--c-texto-2)] mb-1">
                Destino do Aviso
              </label>
              <select
                id="campo-loja-destino-aviso"
                value={lojaDestino}
                onChange={(e) => setLojaDestino(e.target.value as Loja | 'Todas')}
                className="w-full px-3 py-2 text-sm bg-[var(--c-canvas)] border border-[var(--c-borda)] rounded-lg text-[var(--c-texto)] focus:outline-none focus:ring-2 focus:ring-[var(--c-acento)]"
              >
                {LOJAS_OPCOES.map((l) => (
                  <option key={l} value={l}>
                    {l === 'Todas' ? 'Todas as 5 Lojas da Rede' : `Loja ${l}`}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-[var(--c-texto-2)] mb-1">
              Prioridade
            </label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setPrioridade('geral')}
                className={`p-2 rounded-lg border text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
                  prioridade === 'geral'
                    ? 'bg-blue-50 dark:bg-blue-950/60 border-blue-500 text-blue-700 dark:text-blue-300 ring-2 ring-blue-500/30'
                    : 'border-[var(--c-borda)] bg-[var(--c-canvas)] text-[var(--c-texto-2)]'
                }`}
              >
                <Info className="w-3.5 h-3.5 text-blue-600" /> Geral
              </button>

              <button
                type="button"
                onClick={() => setPrioridade('atencao')}
                className={`p-2 rounded-lg border text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
                  prioridade === 'atencao'
                    ? 'bg-amber-50 dark:bg-amber-950/60 border-amber-500 text-amber-700 dark:text-amber-300 ring-2 ring-amber-500/30'
                    : 'border-[var(--c-borda)] bg-[var(--c-canvas)] text-[var(--c-texto-2)]'
                }`}
              >
                <AlertCircle className="w-3.5 h-3.5 text-amber-600" /> Atenção
              </button>

              <button
                type="button"
                onClick={() => setPrioridade('urgente')}
                className={`p-2 rounded-lg border text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
                  prioridade === 'urgente'
                    ? 'bg-red-50 dark:bg-red-950/60 border-red-500 text-red-700 dark:text-red-300 ring-2 ring-red-500/30'
                    : 'border-[var(--c-borda)] bg-[var(--c-canvas)] text-[var(--c-texto-2)]'
                }`}
              >
                <AlertTriangle className="w-3.5 h-3.5 text-red-600" /> Urgente
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-[var(--c-texto-2)] mb-1">
              Conteúdo do Comunicado *
            </label>
            <textarea
              id="campo-conteudo-aviso"
              rows={3}
              value={conteudo}
              onChange={(e) => setConteudo(e.target.value)}
              placeholder="Descreva as instruções, horários, procedimentos ou regras com clareza..."
              className="w-full px-3 py-2 text-sm bg-[var(--c-canvas)] border border-[var(--c-borda)] rounded-lg text-[var(--c-texto)] focus:outline-none focus:ring-2 focus:ring-[var(--c-acento)] resize-none"
              required
            />
          </div>

          <div className="flex items-center justify-between pt-1">
            <label className="flex items-center gap-2 cursor-pointer text-xs text-[var(--c-texto-2)] select-none">
              <input
                type="checkbox"
                checked={fixadoNoTopo}
                onChange={(e) => setFixadoNoTopo(e.target.checked)}
                className="w-4 h-4 rounded text-[var(--c-acento)] focus:ring-[var(--c-acento)] border-[var(--c-borda)]"
              />
              <span className="flex items-center gap-1 font-medium">
                <Pin className="w-3.5 h-3.5 text-[var(--c-acento)]" /> Fixar no topo da lista
              </span>
            </label>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setFormularioAberto(false)}
                className="px-3 py-1.5 rounded-lg border border-[var(--c-borda)] text-xs font-semibold text-[var(--c-texto-2)] hover:bg-[var(--c-superficie-2)]"
              >
                Cancelar
              </button>
              <button
                type="submit"
                id="botao-confirmar-publicacao-aviso"
                className="px-4 py-1.5 rounded-lg bg-[var(--c-acento)] text-[var(--c-sobre-acento)] text-xs font-bold hover:brightness-110 active:scale-95 transition-all shadow-sm"
              >
                Publicar Comunicado
              </button>
            </div>
          </div>
        </form>
      )}

      {/* Barra de Filtros rápidos */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-[var(--c-superficie)] p-3 rounded-xl border border-[var(--c-borda)]">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs font-medium text-[var(--c-texto-3)] mr-1">Prioridade:</span>
          {(['todas', 'urgente', 'atencao', 'geral'] as const).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setFiltroPrioridade(p)}
              className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                filtroPrioridade === p
                  ? 'bg-[var(--c-acento)] text-[var(--c-sobre-acento)]'
                  : 'bg-[var(--c-superficie-2)] text-[var(--c-texto-2)] hover:bg-[var(--c-borda)]'
              }`}
            >
              {p === 'todas' ? 'Todas' : p.charAt(0).toUpperCase() + p.slice(1)}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1.5">
          <span className="text-xs font-medium text-[var(--c-texto-3)]">Filtrar Loja:</span>
          <select
            value={filtroLoja}
            onChange={(e) => setFiltroLoja(e.target.value as Loja | 'Todas')}
            className="text-xs px-2 py-1 bg-[var(--c-canvas)] border border-[var(--c-borda)] rounded-md text-[var(--c-texto)] focus:outline-none"
          >
            {LOJAS_OPCOES.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Lista de Comunicados */}
      <div className="flex flex-col gap-4" id="lista-avisos-rede">
        {avisosFiltrados.length === 0 ? (
          <div className="bg-[var(--c-superficie)] p-8 rounded-xl border border-[var(--c-borda)] text-center text-[var(--c-texto-3)] text-sm">
            Nenhum aviso encontrado para os filtros selecionados.
          </div>
        ) : (
          avisosFiltrados.map((aviso) => {
            const jaConfirmou = (aviso.confirmacoesIds || []).includes(colaboradorAtual.id);
            const totalConfirmacoes = (aviso.confirmacoesIds || []).length;
            const podeExcluir = colaboradorAtual.nivel >= 3 || aviso.autorId === colaboradorAtual.id;

            return (
              <article
                key={aviso.id}
                id={`card-aviso-${aviso.id}`}
                className={`bg-[var(--c-superficie)] rounded-xl border p-4 sm:p-5 shadow-sm flex flex-col gap-3 transition-all ${
                  aviso.fixadoNoTopo
                    ? 'border-blue-300 dark:border-blue-700/60 bg-blue-50/20 dark:bg-blue-950/10'
                    : 'border-[var(--c-borda)] hover:border-[var(--c-borda-forte)]'
                }`}
              >
                {/* Cabeçalho do Card */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-2">
                    {aviso.fixadoNoTopo && (
                      <span className="px-2 py-0.5 text-xs font-bold rounded-full bg-blue-600 text-white flex items-center gap-1 shadow-xs">
                        <Pin className="w-3 h-3" /> Fixado
                      </span>
                    )}
                    {obterBadgePrioridade(aviso.prioridade)}
                    <span className="px-2 py-0.5 text-xs rounded-full bg-[var(--c-superficie-2)] text-[var(--c-texto-2)] border border-[var(--c-borda)] flex items-center gap-1">
                      <Building2 className="w-3 h-3" />
                      {aviso.lojaDestino === 'Todas' ? 'Rede Toda' : `Loja ${aviso.lojaDestino}`}
                    </span>
                  </div>

                  <div className="flex items-center gap-1 text-[var(--c-texto-3)] text-xs flex-shrink-0">
                    <Clock className="w-3.5 h-3.5" />
                    <span>{aviso.horaFormatada}</span>

                    {podePublicar && (
                      <button
                        type="button"
                        title={aviso.fixadoNoTopo ? 'Desafixar aviso' : 'Fixar aviso no topo'}
                        onClick={() => bancoDados.alternarFixadoAviso(aviso.id)}
                        className={`p-1.5 rounded hover:bg-[var(--c-superficie-2)] transition-colors ${
                          aviso.fixadoNoTopo ? 'text-[var(--c-acento)]' : 'text-[var(--c-texto-3)]'
                        }`}
                      >
                        <Pin className="w-4 h-4" />
                      </button>
                    )}

                    {podeExcluir && (
                      <button
                        type="button"
                        title="Excluir comunicado"
                        onClick={() => setAvisoParaExcluirId(aviso.id)}
                        className="p-1.5 rounded hover:bg-red-50 dark:hover:bg-red-950 text-red-500 transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Título do Aviso */}
                <h3 className="text-base sm:text-lg font-bold text-[var(--c-texto)] tracking-tight">
                  {aviso.titulo}
                </h3>

                {/* Conteúdo completo do aviso */}
                <div className="text-sm text-[var(--c-texto-2)] whitespace-pre-line leading-relaxed">
                  {aviso.conteudo}
                </div>

                {/* Rodapé com autor e confirmação de ciência */}
                <div className="pt-3 border-t border-[var(--c-borda)] flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                  <div className="flex items-center gap-2 text-[var(--c-texto-3)]">
                    <div className="w-6 h-6 rounded-full bg-[var(--c-superficie-2)] border border-[var(--c-borda)] flex items-center justify-center font-bold text-xs text-[var(--c-texto-2)]">
                      {aviso.autorNome.charAt(0)}
                    </div>
                    <span>
                      Publicado por <strong className="text-[var(--c-texto-2)]">{aviso.autorNome}</strong> ({aviso.autorCargo})
                    </span>
                  </div>

                  <div className="flex items-center gap-3 self-end sm:self-auto">
                    <span className="text-[var(--c-texto-3)] text-xs">
                      {totalConfirmacoes} {totalConfirmacoes === 1 ? 'colaborador ciente' : 'colaboradores cientes'}
                    </span>

                    <button
                      type="button"
                      id={`botao-confirmar-ciencia-${aviso.id}`}
                      onClick={() => bancoDados.alternarConfirmacaoAviso(aviso.id)}
                      className={`px-3 py-1.5 rounded-lg font-semibold text-xs flex items-center gap-1.5 transition-all ${
                        jaConfirmou
                          ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800'
                          : 'bg-[var(--c-superficie-2)] text-[var(--c-texto)] border border-[var(--c-borda)] hover:bg-[var(--c-borda)]'
                      }`}
                    >
                      <CheckCircle2 className={`w-3.5 h-3.5 ${jaConfirmou ? 'text-emerald-600 dark:text-emerald-400' : 'text-[var(--c-texto-3)]'}`} />
                      {jaConfirmou ? 'Ciente Registrado' : 'Confirmar Ciência'}
                    </button>
                  </div>
                </div>
              </article>
            );
          })
        )}
      </div>

      {/* Modal de Confirmação para Excluir Comunicado */}
      {avisoParaExcluirId && (
        <div
          id="modal-confirmar-exclusao-aviso-central"
          className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4 backdrop-blur-xs"
        >
          <div className="bg-[var(--c-superficie)] border border-[var(--c-borda)] rounded-2xl w-full max-w-sm shadow-2xl p-5 space-y-4 animate-in fade-in duration-150">
            <div className="flex items-center gap-3 text-red-600">
              <div className="w-10 h-10 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center">
                <AlertCircle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-[var(--c-texto)]">
                  Excluir Comunicado
                </h3>
                <p className="text-xs text-[var(--c-texto-3)]">
                  Confirmação de remoção
                </p>
              </div>
            </div>

            <p className="text-xs text-[var(--c-texto-2)] leading-relaxed">
              Deseja realmente remover este comunicado oficial da rede? Esta ação é irreversível.
            </p>

            <div className="pt-2 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setAvisoParaExcluirId(null)}
                className="py-2 px-3.5 rounded-xl border border-[var(--c-borda)] text-[var(--c-texto-3)] hover:text-[var(--c-texto)] text-xs font-semibold"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={async () => {
                  await bancoDados.removerAviso(avisoParaExcluirId);
                  setAvisoParaExcluirId(null);
                  setMensagemStatus('Comunicado oficial removido.');
                  setTimeout(() => setMensagemStatus(null), 3000);
                }}
                className="py-2 px-4 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-sm cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Excluir Comunicado</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
