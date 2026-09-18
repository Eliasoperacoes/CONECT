import React, { useState, useMemo, useEffect } from 'react';
import {
  X,
  Search,
  Forward,
  Check,
  Users,
  Building2,
  CheckCheck,
  Share2,
  Copy,
  AlertTriangle,
  ExternalLink,
} from 'lucide-react';
import { bancoDados } from '../servicos/bancoDados';
import { podeUsar } from '../servicos/permissoes';
import {
  montarTextoDasMensagens,
  prepararArquivos,
  compartilharNoWhatsApp,
  copiarImagemParaAreaDeTransferencia,
  primeiraImagem,
  temBandejaDoAparelho,
} from '../servicos/compartilharExterno';
import { Colaborador, Conversa } from '../tipos';
import { FotoPresenca } from './FotoPresenca';

interface PropsModalEncaminharMensagem {
  aberto: boolean;
  mensagensIds: string[];
  aoFechar: () => void;
  aoSucesso: (total: number, destinoNome: string) => void;
}

export const ModalEncaminharMensagem: React.FC<PropsModalEncaminharMensagem> = ({
  aberto,
  mensagensIds,
  aoFechar,
  aoSucesso,
}) => {
  const [busca, setBusca] = useState('');
  const [avisoExterno, setAvisoExterno] = useState<string | null>(null);
  const [imagemParaColar, setImagemParaColar] = useState<File | null>(null);
  const [imagemCopiada, setImagemCopiada] = useState(false);
  /**
   * Os anexos já convertidos em arquivo, prontos antes do clique.
   *
   * `null` enquanto ainda estão sendo buscados. A foto costuma morar no
   * balde, e baixá-la leva um instante — que acontece enquanto a pessoa
   * ainda está escolhendo o destino, nunca no gesto do toque.
   */
  const [anexosProntos, setAnexosProntos] = useState<{
    arquivos: File[];
    deixadosParaTras: number;
  } | null>(null);
  const [destinosSelecionados, setDestinosSelecionados] = useState<string[]>([]);
  const [enviando, setEnviando] = useState(false);

  const colaboradorAtual = bancoDados.obterColaboradorAtual();
  const todasConversas = bancoDados.obterTodasConversas();
  const todosColaboradores = bancoDados.obterColaboradores();

  // Opções de destino:
  // 1. Grupos acessíveis
  const grupos = useMemo(() => {
    return todasConversas.filter(
      (c) => c.tipo === 'grupo' && c.participantesIds.includes(colaboradorAtual.id)
    );
  }, [todasConversas, colaboradorAtual.id]);

  // 2. Colegas para conversa direta (garantindo id de conversa para cada colega)
  const colegas = useMemo(() => {
    return todosColaboradores.filter((c) => c.id !== colaboradorAtual.id && c.ativo !== false);
  }, [todosColaboradores, colaboradorAtual.id]);

  // Filtro de busca
  const termo = busca.trim().toLowerCase();

  const gruposFiltrados = useMemo(() => {
    if (!termo) return grupos;
    return grupos.filter(
      (g) =>
        g.nome.toLowerCase().includes(termo) ||
        (g.descricao && g.descricao.toLowerCase().includes(termo))
    );
  }, [grupos, termo]);

  const colegasFiltrados = useMemo(() => {
    if (!termo) return colegas;
    return colegas.filter(
      (c) =>
        c.nome.toLowerCase().includes(termo) ||
        c.cargo.toLowerCase().includes(termo) ||
        c.loja.toLowerCase().includes(termo) ||
        c.setor.toLowerCase().includes(termo)
    );
  }, [colegas, termo]);

  /**
   * As mensagens de verdade, não só os ids.
   *
   * Vem do banco com o mesmo filtro do encaminhamento interno: id de
   * mensagem é adivinhável, e o texto que sai da empresa não pode ser de
   * uma conversa que esta pessoa não participa.
   *
   * ESTE `useMemo` PRECISA FICAR ACIMA DO `return null` LOGO ABAIXO.
   * Hook declarado depois de saída condicional derruba a tela inteira, e
   * já aconteceu aqui.
   */
  const mensagensEscolhidas = useMemo(
    () => bancoDados.obterMensagensPorIds(mensagensIds),
    [mensagensIds]
  );

  /**
   * Baixa os anexos ASSIM QUE O MODAL ABRE.
   *
   * É o ponto que a primeira versão errou. Ela preparava no clique e só
   * aceitava data URL — e com a nuvem ligada `imagemUrl` é endereço
   * assinado do balde, então nenhuma foto ia. Buscar no clique também não
   * serviria: a espera gasta o gesto do toque e o iPhone não abre a
   * bandeja. Preparar aqui resolve os dois.
   *
   * Também precisa ficar ACIMA do `return null` logo abaixo: hook depois
   * de saída condicional derruba a tela.
   */
  useEffect(() => {
    if (!aberto) return;

    let cancelado = false;
    setAnexosProntos(null);

    prepararArquivos(mensagensEscolhidas).then((pronto) => {
      if (!cancelado) setAnexosProntos(pronto);
    });

    return () => {
      cancelado = true;
    };
  }, [aberto, mensagensEscolhidas]);

  if (!aberto || mensagensIds.length === 0) return null;

  // Mandar para fora é informação saindo da empresa: passa pelo catálogo
  // de permissões como qualquer outra ferramenta
  const podeMandarParaFora = podeUsar('compartilhar_whatsapp', colaboradorAtual);

  /**
   * Chamada DIRETO do clique, sem nenhuma espera antes.
   *
   * O Safari só abre a bandeja do aparelho no mesmo gesto do toque, e um
   * `await` aqui em cima gastaria o gesto. Por isso os anexos já chegam
   * prontos de `anexosProntos` — nada é buscado a partir daqui.
   */
  const lidarCompartilharNoWhatsApp = async () => {
    if (!anexosProntos) return;

    setAvisoExterno(null);
    setImagemParaColar(null);
    setImagemCopiada(false);

    const texto = montarTextoDasMensagens(mensagensEscolhidas);
    const { arquivos, deixadosParaTras } = anexosProntos;

    const res = await compartilharNoWhatsApp({ texto, arquivos, deixadosParaTras });

    // Fechou a bandeja sem escolher contato: não saiu nada, não registra
    // nada. Auditoria com envio que não houve é pior do que auditoria
    // nenhuma.
    if (res.cancelado) return;

    if (res.erro) {
      setAvisoExterno(res.erro);
      return;
    }

    const conversaOrigem = todasConversas.find(
      (c) => c.id === mensagensEscolhidas[0]?.conversaId
    );

    bancoDados.registrarCompartilhamentoExterno({
      totalMensagens: mensagensEscolhidas.length,
      conversaNome: conversaOrigem?.nome || 'conversa',
      comArquivos: res.arquivosEnviados,
    });

    /**
     * O aviso do que NÃO foi junto.
     *
     * Pelo link do WhatsApp Web só vai texto. Deixar a pessoa achar que a
     * foto da peça seguiu é pior do que não ter o botão: ela só descobre
     * quando o fornecedor responde "que peça?".
     */
    if (res.arquivosDeixadosParaTras > 0) {
      setImagemParaColar(primeiraImagem(anexosProntos.arquivos) || null);
      setAvisoExterno(
        res.via === 'link'
          ? `O texto foi. ${res.arquivosDeixadosParaTras} anexo(s) não vão pelo link do WhatsApp Web.`
          : `${res.arquivosDeixadosParaTras} anexo(s) não puderam ir junto.`
      );
      return;
    }

    aoFechar();
  };

  const lidarCopiarImagem = async () => {
    if (!imagemParaColar) return;
    const res = await copiarImagemParaAreaDeTransferencia(imagemParaColar);
    if (res.sucesso) setImagemCopiada(true);
    else setAvisoExterno(res.erro || 'Não foi possível copiar a imagem.');
  };

  const alternarDestino = (conversaOuColegaId: string, ehColega = false) => {
    let idFinal = conversaOuColegaId;
    if (ehColega) {
      // Obtém ou inicializa conversa com o colega
      const conv = bancoDados.obterOuCriarConversaIndividual(conversaOuColegaId);
      idFinal = conv.id;
    }

    setDestinosSelecionados((prev) =>
      prev.includes(idFinal) ? prev.filter((id) => id !== idFinal) : [...prev, idFinal]
    );
  };

  const lidarEncaminhar = async () => {
    if (destinosSelecionados.length === 0 || enviando) return;
    setEnviando(true);

    try {
      const res = await bancoDados.encaminharMensagens(mensagensIds, destinosSelecionados);
      if (res.sucesso) {
        // Nome de exibição para feedback
        let destinoNome = `${destinosSelecionados.length} destinatários`;
        if (destinosSelecionados.length === 1) {
          const conv = todasConversas.find((c) => c.id === destinosSelecionados[0]);
          destinoNome = conv ? conv.nome : 'destinatário';
        }
        aoSucesso(res.totalEncaminhadas, destinoNome);
        aoFechar();
      }
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div
      id="modal-encaminhar-mensagem"
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 animate-in fade-in"
      onClick={aoFechar}
    >
      <div
        className="bg-[var(--c-superficie)] w-full max-w-lg rounded-2xl border border-[var(--c-borda)] shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in zoom-in-95"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Topo do Modal */}
        <header className="px-4 py-3.5 border-b border-[var(--c-borda)] flex items-center justify-between bg-[var(--c-superficie)] flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-blue-500/15 text-blue-600 dark:text-blue-400 flex items-center justify-center">
              <Forward className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-[var(--c-texto)]">
                Encaminhar {mensagensIds.length > 1 ? `${mensagensIds.length} mensagens` : 'mensagem'}
              </h2>
              <p className="text-[11px] text-[var(--c-texto-3)]">
                {podeMandarParaFora
                  ? 'Para colegas e canais, ou para fora no WhatsApp'
                  : 'Selecione os colaboradores ou canais para enviar'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={aoFechar}
            className="w-8 h-8 rounded-full flex items-center justify-center text-[var(--c-texto-3)] hover:text-[var(--c-texto)] hover:bg-[var(--c-superficie-2)] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </header>

        {/* Campo de Busca Rápida */}
        <div className="p-3 border-b border-[var(--c-borda)] bg-[var(--c-canvas)] flex-shrink-0">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--c-texto-3)]" />
            <input
              type="text"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar colaborador, loja, cargo ou canal..."
              className="w-full pl-9 pr-4 py-2 text-xs rounded-xl bg-[var(--c-superficie)] border border-[var(--c-borda)] text-[var(--c-texto)] placeholder:text-[var(--c-texto-3)] outline-none focus:border-[var(--c-acento)] transition-all"
            />
          </div>
        </div>

        {/* Lista com scroll de Canais e Colaboradores */}
        <div className="flex-1 overflow-y-auto divide-y divide-[var(--c-borda)] p-1">
          {/*
            FORA DO CONECTA.
            Não é uma opção de seleção como as de baixo — é ação de um
            toque só. Misturar as duas numa lista de caixinhas faria a
            pessoa marcar o WhatsApp junto de três colegas e esperar que
            "Encaminhar" desse conta dos quatro, o que não acontece: o
            envio para fora é o aparelho dela que faz.
          */}
          {podeMandarParaFora && (
            <div className="py-2">
              <div className="px-3 py-1 text-[11px] font-bold text-[var(--c-texto-3)] uppercase tracking-wider flex items-center gap-1.5">
                <ExternalLink className="w-3 h-3" />
                Fora do CONECTA
              </div>

              <button
                type="button"
                id="botao-compartilhar-whatsapp"
                onClick={lidarCompartilharNoWhatsApp}
                disabled={!anexosProntos}
                className="mt-1 w-full px-3 py-2.5 rounded-xl flex items-center gap-3 text-left hover:bg-emerald-50 dark:hover:bg-emerald-950/30 transition-all disabled:opacity-60 disabled:hover:bg-transparent"
              >
                <div className="w-9 h-9 rounded-full bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400 flex items-center justify-center flex-shrink-0">
                  <Share2 className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <span className="text-xs font-semibold text-[var(--c-texto)] block truncate">
                    Enviar no WhatsApp
                  </span>
                  {/*
                    O anexo é baixado enquanto a pessoa escolhe o destino.
                    Dizer que está preparando evita o clique que não faz
                    nada — e é o preço de não gastar o gesto do toque.
                  */}
                  <span className="text-[10px] text-[var(--c-texto-3)] block truncate">
                    {!anexosProntos
                      ? 'Preparando os anexos...'
                      : anexosProntos.arquivos.length > 0
                        ? `${anexosProntos.arquivos.length} anexo(s) prontos para ir junto`
                        : temBandejaDoAparelho()
                          ? 'Abre o WhatsApp para você escolher o contato'
                          : 'Abre o WhatsApp Web com o texto pronto'}
                  </span>
                </div>
              </button>

              {avisoExterno && (
                <div className="mx-3 mt-2 p-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 flex flex-col gap-2">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
                    <span className="text-[11px] text-amber-800 dark:text-amber-300 leading-snug">
                      {avisoExterno}
                    </span>
                  </div>

                  {/*
                    O contorno do PC: o link não leva anexo, mas o
                    WhatsApp Web aceita Ctrl+V. Botão separado porque a
                    cópia precisa do próprio gesto — emendada na abertura
                    da janela, uma das duas falha.
                  */}
                  {imagemParaColar && (
                    <button
                      type="button"
                      onClick={lidarCopiarImagem}
                      disabled={imagemCopiada}
                      className="self-start px-2.5 py-1 rounded-lg bg-[var(--c-acento)] text-[var(--c-sobre-acento)] text-[11px] font-bold flex items-center gap-1.5 hover:brightness-110 transition-all disabled:opacity-60"
                    >
                      {imagemCopiada ? (
                        <>
                          <Check className="w-3 h-3" />
                          Copiada — cole com Ctrl+V no WhatsApp
                        </>
                      ) : (
                        <>
                          <Copy className="w-3 h-3" />
                          Copiar imagem
                        </>
                      )}
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Seção 1: Grupos e Canais Operacionais */}
          {gruposFiltrados.length > 0 && (
            <div className="py-2">
              <div className="px-3 py-1 text-[11px] font-bold text-[var(--c-texto-3)] uppercase tracking-wider flex items-center gap-1.5">
                <Users className="w-3 h-3" />
                Canais e Grupos ({gruposFiltrados.length})
              </div>
              <div className="mt-1 space-y-0.5">
                {gruposFiltrados.map((g) => {
                  const selecionado = destinosSelecionados.includes(g.id);
                  return (
                    <button
                      key={g.id}
                      type="button"
                      onClick={() => alternarDestino(g.id, false)}
                      className={`w-full px-3 py-2.5 rounded-xl flex items-center justify-between text-left transition-all ${
                        selecionado
                          ? 'bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800'
                          : 'hover:bg-[var(--c-superficie-2)]'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-9 h-9 rounded-full bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400 flex items-center justify-center font-bold text-xs flex-shrink-0">
                          {g.nome.charAt(0)}
                        </div>
                        <div className="min-w-0">
                          <span className="text-xs font-semibold text-[var(--c-texto)] block truncate">
                            {g.nome}
                          </span>
                          <span className="text-[10px] text-[var(--c-texto-3)] block truncate">
                            {g.ehSistemaPadrao ? 'Canal Oficial' : `${g.participantesIds.length} membros`}
                          </span>
                        </div>
                      </div>

                      <div
                        className={`w-5 h-5 rounded-full border flex items-center justify-center transition-all ${
                          selecionado
                            ? 'bg-[var(--c-acento)] border-[var(--c-acento)] text-[var(--c-sobre-acento)]'
                            : 'border-[var(--c-borda)] bg-[var(--c-superficie)]'
                        }`}
                      >
                        {selecionado && <Check className="w-3 h-3" />}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Seção 2: Colaboradores da Rede Malachias */}
          {colegasFiltrados.length > 0 && (
            <div className="py-2">
              <div className="px-3 py-1 text-[11px] font-bold text-[var(--c-texto-3)] uppercase tracking-wider flex items-center gap-1.5">
                <Building2 className="w-3 h-3" />
                Colaboradores ({colegasFiltrados.length})
              </div>
              <div className="mt-1 space-y-0.5">
                {colegasFiltrados.map((c) => {
                  // Acha id de conversa existente ou usa o id do colega
                  const convExistente = todasConversas.find(
                    (conv) =>
                      conv.tipo === 'individual' &&
                      conv.participantesIds.includes(colaboradorAtual.id) &&
                      conv.participantesIds.includes(c.id)
                  );
                  const idParaChecar = convExistente ? convExistente.id : `conv-temp-${c.id}`;
                  const selecionado =
                    destinosSelecionados.includes(idParaChecar) ||
                    destinosSelecionados.some((d) => d.includes(c.id));

                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => alternarDestino(c.id, true)}
                      className={`w-full px-3 py-2.5 rounded-xl flex items-center justify-between text-left transition-all ${
                        selecionado
                          ? 'bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800'
                          : 'hover:bg-[var(--c-superficie-2)]'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <FotoPresenca
                          foto={c.foto}
                          nome={c.nome}
                          presenca={c.presenca}
                          tamanho="w-9 h-9"
                        />
                        <div className="min-w-0">
                          <span className="text-xs font-semibold text-[var(--c-texto)] block truncate">
                            {c.nome}
                          </span>
                          <span className="text-[10px] text-[var(--c-texto-3)] block truncate">
                            {c.cargo} · {c.loja} {c.ramal ? `· Ramal ${c.ramal}` : ''}
                          </span>
                        </div>
                      </div>

                      <div
                        className={`w-5 h-5 rounded-full border flex items-center justify-center transition-all ${
                          selecionado
                            ? 'bg-[var(--c-acento)] border-[var(--c-acento)] text-[var(--c-sobre-acento)]'
                            : 'border-[var(--c-borda)] bg-[var(--c-superficie)]'
                        }`}
                      >
                        {selecionado && <Check className="w-3 h-3" />}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {gruposFiltrados.length === 0 && colegasFiltrados.length === 0 && (
            <div className="p-8 text-center text-xs text-[var(--c-texto-3)]">
              Nenhum colaborador ou grupo encontrado para &ldquo;{busca}&rdquo;.
            </div>
          )}
        </div>

        {/* Rodapé Fixo com Botão de Confirmação */}
        <footer className="p-3 border-t border-[var(--c-borda)] bg-[var(--c-superficie)] flex items-center justify-between gap-3 flex-shrink-0">
          <span className="text-xs text-[var(--c-texto-3)]">
            {destinosSelecionados.length === 0
              ? 'Nenhum destinatário selecionado'
              : `${destinosSelecionados.length} selecionado(s)`}
          </span>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={aoFechar}
              className="px-3 py-2 rounded-xl text-xs font-medium text-[var(--c-texto-2)] hover:bg-[var(--c-superficie-2)]"
            >
              Cancelar
            </button>

            <button
              type="button"
              id="botao-confirmar-encaminhar"
              onClick={lidarEncaminhar}
              disabled={destinosSelecionados.length === 0 || enviando}
              className={`px-4 py-2 rounded-xl font-bold text-xs flex items-center gap-2 transition-all shadow-xs ${
                destinosSelecionados.length > 0 && !enviando
                  ? 'bg-[var(--c-acento)] text-[var(--c-sobre-acento)] hover:brightness-105 active:scale-95 cursor-pointer'
                  : 'bg-[var(--c-superficie-2)] text-[var(--c-texto-3)] cursor-not-allowed'
              }`}
            >
              <Forward className="w-3.5 h-3.5" />
              <span>{enviando ? 'Encaminhando...' : 'Encaminhar'}</span>
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
};
