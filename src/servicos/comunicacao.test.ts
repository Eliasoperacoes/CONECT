/**
 * Verificação da comunicação ligada ao banco — CONECTA
 *
 * A regra que está sendo provada: com o Supabase ligado, NADA nasce e morre
 * só no aparelho. Mensagem, leitura, reação, aviso, diretriz e auditoria
 * passam pelo banco — e o que o banco recusa não fica fingindo que deu certo
 * na tela de quem enviou.
 */
import { test, expect, mock, beforeEach } from 'bun:test';

class ArmazenamentoFalso {
  private dados = new Map<string, string>();
  getItem(k: string) { return this.dados.has(k) ? this.dados.get(k)! : null; }
  setItem(k: string, v: string) { this.dados.set(k, String(v)); }
  removeItem(k: string) { this.dados.delete(k); }
  clear() { this.dados.clear(); }
}

const armazenamento = new ArmazenamentoFalso();
(globalThis as any).localStorage = armazenamento;
// Partes do bancoDados desistem quando não há `window` — sem isto o teste
// exercitaria um caminho que nunca acontece no navegador
(globalThis as any).window = globalThis;

const CHAVE_COLABORADORES = 'conecta_v4_colaboradores';
const CHAVE_COLABORADOR_ATUAL = 'conecta_v4_colaborador_atual';
const CHAVE_CONVERSAS = 'conecta_v4_conversas';
const CHAVE_MENSAGENS = 'conecta_v4_mensagens';
const CHAVE_AVISOS_REDE = 'conecta_v4_avisos_rede';

const ELIAS = {
  id: 'colab-elias', nome: 'Elias', login: 'elias', cargo: 'Diretor',
  setor: 'TI', loja: 'Pirassununga', nivel: 5, foto: '', presenca: 'online',
  vistoPorUltimo: 'Agora', cargaHorariaDiariaMinutos: 480, ativo: true,
  criadoEm: '2026-01-01T00:00:00.000Z',
};
const ANA = { ...ELIAS, id: 'colab-ana', nome: 'Ana', login: 'ana', nivel: 1, setor: 'Vendas', cargo: 'Vendedora' };

// --- "Banco" simulado ---
let modoNuvem = true;
let bancoMensagens: any[] = [];
let bancoConversas: any[] = [];
let bancoLeituras: { mensagemId: string; colaboradorId: string }[] = [];
let bancoAvisos: any[] = [];
let bancoLeiturasAviso: any[] = [];
let bancoConfig: any = null;
let bancoAuditoria: any[] = [];
let recusarEscrita = false;

let sessaoViva = true;
/** O que a ponte mandou para o banco na ultima carga em lote. */
let colaboradoresNoBanco: any[] = [];

mock.module('./supabase', () => ({
  usandoNuvem: () => modoNuvem,
  temSessaoViva: () => sessaoViva,
  supabase: null,
}));

let anexosEnviados: { conteudo: string; caminho: string }[] = [];
let anexosApagados: string[] = [];
let armazenamentoFalha = false;

mock.module('./anexos', () => ({
  enviarAnexo: async (conteudo: string, conversaId: string, mensagemId: string) => {
    if (armazenamentoFalha) return null;
    const caminho = `${conversaId}/${mensagemId}.bin`;
    anexosEnviados.push({ conteudo, caminho });
    return { caminho, url: `https://assinado.exemplo/${caminho}?token=abc` };
  },
  apagarAnexos: async (caminhos: string[]) => {
    anexosApagados.push(...caminhos);
    return caminhos.length;
  },
  resolverCaminhos: async () => new Map(),
}));

mock.module('./nuvem', () => ({
  nuvem: {
    assinarAtualizacoes: () => () => {},
    salvarColaborador: async () => ({ sucesso: true }),
    salvarColaboradoresEmLote: async (lista: any[]) => {
      colaboradoresNoBanco = lista.map((c) => ({ ...c }));
      return { sucesso: true, gravados: lista.length };
    },
    removerColaborador: async () => ({ sucesso: true }),
    sincronizarPonto: async () => true,
  },
}));

const recusa = { sucesso: false, erro: 'sem conexao' };

/** Conversas que o banco falso ja conhece. */
const conversasNoBancoFalso = new Set<string>();

mock.module('./nuvemComunicacao', () => ({
  // O registro de conversas ja gravadas: no teste ele comeca vazio, entao
  // a primeira mensagem de cada conversa exercita o caminho completo
  conversaJaEstaNoBanco: (id: string) => conversasNoBancoFalso.has(id),
  marcarConversaNoBanco: (id: string) => conversasNoBancoFalso.add(id),
  esquecerConversaDoBanco: (id: string) => conversasNoBancoFalso.delete(id),
  montarPreviaDaMensagem: (m: any) => {
    if (m.tipo === 'recado_voz') return '🎤 Recado de voz';
    if (m.tipo === 'arquivo') return `📎 ${m.arquivoNome || 'Arquivo'}`;
    if (m.tipo === 'imagem') return `📷 Foto${m.legenda ? ` · ${m.legenda}` : ''}`;
    return m.ehEncaminhada ? `↪ ${m.texto || 'Mensagem encaminhada'}` : m.texto || '';
  },
  carimboDeAuditoria: (iso: string) => `carimbo:${iso}`,
  nuvemComunicacao: {
    assinarAtualizacoes: () => () => {},
    sincronizarConversas: async () => true,
    salvarConversa: async (c: any) => {
      if (recusarEscrita) return recusa;

      // participantes.colaborador_id aponta para colaboradores(id): id que
      // não existe derruba a gravação inteira, como no banco de verdade
      const conhecidos = ['colab-elias', 'colab-ana'];
      const fantasma = (c.participantesIds as string[]).find((id) => !conhecidos.includes(id));
      if (fantasma) {
        return {
          sucesso: false,
          erro: `insert or update on table "participantes" violates foreign key constraint (${fantasma})`,
        };
      }

      bancoConversas = bancoConversas.filter((x) => x.id !== c.id);
      bancoConversas.push({ ...c });
      return { sucesso: true };
    },
    salvarMensagem: async (m: any) => {
      if (recusarEscrita) return recusa;
      bancoMensagens.push({ ...m });
      bancoLeituras.push({ mensagemId: m.id, colaboradorId: m.remetenteId });
      return { sucesso: true };
    },
    atualizarMensagem: async (m: any) => {
      if (recusarEscrita) return recusa;
      const i = bancoMensagens.findIndex((x) => x.id === m.id);
      if (i !== -1) bancoMensagens[i] = { ...m };
      return { sucesso: true };
    },
    removerMensagem: async (id: string) => {
      if (recusarEscrita) return recusa;
      bancoMensagens = bancoMensagens.filter((x) => x.id !== id);
      return { sucesso: true };
    },
    marcarLeitura: async (ids: string[], colaboradorId: string) => {
      ids.forEach((mensagemId) => bancoLeituras.push({ mensagemId, colaboradorId }));
      return true;
    },
    salvarAviso: async (a: any) => {
      if (recusarEscrita) return recusa;
      bancoAvisos = bancoAvisos.filter((x) => x.id !== a.id);
      bancoAvisos.push({ ...a });
      return { sucesso: true };
    },
    removerAviso: async (id: string) => {
      if (recusarEscrita) return recusa;
      bancoAvisos = bancoAvisos.filter((x) => x.id !== id);
      return { sucesso: true };
    },
    marcarLeituraAviso: async (avisoId: string, colaboradorId: string, confirmado: boolean) => {
      bancoLeiturasAviso.push({ avisoId, colaboradorId, confirmado });
      return true;
    },
    salvarConfiguracoes: async (c: any) => {
      if (recusarEscrita) return recusa;
      bancoConfig = { ...c };
      return { sucesso: true };
    },
    registrarAuditoria: async (r: any) => {
      bancoAuditoria.push({ ...r });
    },
    limparConversasAte: async (dataCorte: string) => {
      if (recusarEscrita) return recusa;
      // A mensagem sai da tabela por inteiro, como no banco
      const alvo = bancoMensagens.filter((m) => m.criadoEm < dataCorte);
      bancoMensagens = bancoMensagens.filter((m) => m.criadoEm >= dataCorte);
      return {
        sucesso: true,
        removidas: alvo.length,
        caminhos: alvo.map((m) => m.anexoCaminho).filter(Boolean),
      };
    },
    limparCache: () => {},
    iniciarTempoReal: () => {},
  },
}));

const { bancoDados } = await import('./bancoDados');

const CONVERSA_EQUIPE = {
  id: 'grupo-teste', tipo: 'grupo', nome: 'Equipe',
  participantesIds: ['colab-elias', 'colab-ana'],
  naoLidas: 0, atualizadoEm: '2026-01-01T00:00:00.000Z',
};

const entrarComo = (quem: any) => {
  armazenamento.setItem(CHAVE_COLABORADOR_ATUAL, quem.id);
};

beforeEach(() => {
  armazenamento.clear();
  bancoMensagens = [];
  bancoConversas = [];
  bancoLeituras = [];
  bancoAvisos = [];
  bancoLeiturasAviso = [];
  bancoConfig = null;
  bancoAuditoria = [];
  recusarEscrita = false;
  modoNuvem = true;
  sessaoViva = true;
  colaboradoresNoBanco = [];
  anexosEnviados = [];
  anexosApagados = [];
  armazenamentoFalha = false;

  armazenamento.setItem(CHAVE_COLABORADORES, JSON.stringify([ELIAS, ANA]));
  armazenamento.setItem(CHAVE_CONVERSAS, JSON.stringify([CONVERSA_EQUIPE]));
  armazenamento.setItem(CHAVE_MENSAGENS, JSON.stringify([]));
  armazenamento.setItem(CHAVE_AVISOS_REDE, JSON.stringify([]));
  entrarComo(ELIAS);
});

const lerCacheMensagens = () => JSON.parse(armazenamento.getItem(CHAVE_MENSAGENS) || '[]');

// ============================================================
// MENSAGEM
// ============================================================

test('mensagem enviada vai para o banco, não só para o aparelho', async () => {
  const res = await bancoDados.enviarMensagem('grupo-teste', { tipo: 'texto', texto: 'Bom dia' });

  expect(res.sucesso).toBe(true);
  expect(bancoMensagens).toHaveLength(1);
  expect(bancoMensagens[0].texto).toBe('Bom dia');
  expect(bancoMensagens[0].remetenteId).toBe('colab-elias');
  expect(lerCacheMensagens()).toHaveLength(1);
});

test('a conversa sobe antes da mensagem, senão a mensagem aponta para o nada', async () => {
  await bancoDados.enviarMensagem('grupo-teste', { tipo: 'texto', texto: 'oi' });
  expect(bancoConversas.some((c) => c.id === 'grupo-teste')).toBe(true);
});

test('SEM SESSÃO: não tenta gravar e explica o que houve', async () => {
  // O banco responde a um pedido sem credencial exatamente como responde a um
  // visitante anônimo: "violates row-level security policy". Tentar e mostrar
  // isso na tela não ajuda ninguém — o que resolve é entrar de novo.
  sessaoViva = false;

  const res = await bancoDados.enviarMensagem('grupo-teste', { tipo: 'texto', texto: 'oi' });

  expect(res.sucesso).toBe(false);
  expect(res.erro).toContain('sessão terminou');
  expect(bancoMensagens).toHaveLength(0);
  expect(lerCacheMensagens()).toHaveLength(0);
});

test('PARTICIPANTE FANTASMA: id que o banco não conhece não derruba a conversa', async () => {
  // O administrador fixo do modo de demonstração não existe no banco, mas o
  // preparo dos canais o inscrevia em todos eles
  armazenamento.setItem(
    CHAVE_CONVERSAS,
    JSON.stringify([
      {
        ...CONVERSA_EQUIPE,
        participantesIds: ['colab-elias', 'colab-ana', 'colab-admin-elias'],
      },
    ])
  );

  const res = await bancoDados.enviarMensagem('grupo-teste', { tipo: 'texto', texto: 'oi' });

  expect(res.sucesso).toBe(true);
  expect(bancoConversas[0].participantesIds).toEqual(['colab-elias', 'colab-ana']);
  expect(bancoMensagens).toHaveLength(1);
});

test('quando o banco recusa, a tela mostra o motivo que ele deu', async () => {
  recusarEscrita = true;
  const res = await bancoDados.enviarMensagem('grupo-teste', { tipo: 'texto', texto: 'oi' });

  expect(res.sucesso).toBe(false);
  // Antes dizia "verifique a conexão", mandando olhar para o lugar errado
  expect(res.erro).toContain('sem conexao');
});

test('BANCO RECUSOU: não diz que enviou nem deixa a mensagem no aparelho', async () => {
  recusarEscrita = true;
  const res = await bancoDados.enviarMensagem('grupo-teste', { tipo: 'texto', texto: 'some' });

  expect(res.sucesso).toBe(false);
  expect(res.erro?.toLowerCase()).toContain('não foi possível');
  expect(bancoMensagens).toHaveLength(0);
  // O ponto central: nada de mensagem fantasma só neste aparelho
  expect(lerCacheMensagens()).toHaveLength(0);
});

test('quem envia já consta como leitor da própria mensagem', async () => {
  await bancoDados.enviarMensagem('grupo-teste', { tipo: 'texto', texto: 'oi' });
  expect(bancoLeituras).toContainEqual({
    mensagemId: bancoMensagens[0].id,
    colaboradorId: 'colab-elias',
  });
});

test('ANEXO VAI PARA O ARMAZENAMENTO: a linha guarda o caminho, não a foto', async () => {
  const res = await bancoDados.enviarMensagem('grupo-teste', {
    tipo: 'imagem', imagemUrl: 'data:image/png;base64,AAAA', legenda: 'Peça trocada',
  });

  expect(res.sucesso).toBe(true);
  expect(anexosEnviados).toHaveLength(1);
  expect(anexosEnviados[0].conteudo).toBe('data:image/png;base64,AAAA');

  // O que a mensagem leva é o caminho — foto embutida na tabela era o que
  // inchava o banco
  expect(bancoMensagens[0].anexoCaminho).toBe(anexosEnviados[0].caminho);
  // E a tela recebe um endereço já utilizável, sem esperar sincronização
  expect(res.mensagem!.imagemUrl).toContain('assinado.exemplo');
});

test('documento e recado de voz seguem o mesmo caminho', async () => {
  await bancoDados.enviarMensagem('grupo-teste', {
    tipo: 'arquivo', arquivoNome: 'nota.pdf', arquivoTamanho: '120 KB',
    arquivoUrl: 'data:application/pdf;base64,BBBB',
  });
  await bancoDados.enviarMensagem('grupo-teste', {
    tipo: 'recado_voz', audioUrl: 'data:audio/webm;base64,CCCC', audioDuracao: 8,
  });

  expect(anexosEnviados).toHaveLength(2);
  expect(bancoMensagens[0].anexoCaminho).toBeTruthy();
  expect(bancoMensagens[1].anexoCaminho).toBeTruthy();
  // O nome e a duração continuam na mensagem: são dela, não do arquivo
  expect(bancoMensagens[0].arquivoNome).toBe('nota.pdf');
  expect(bancoMensagens[1].audioDuracao).toBe(8);
});

test('anexo que não subiu não vira mensagem', async () => {
  armazenamentoFalha = true;

  const res = await bancoDados.enviarMensagem('grupo-teste', {
    tipo: 'imagem', imagemUrl: 'data:image/png;base64,AAAA',
  });

  expect(res.sucesso).toBe(false);
  expect(res.erro).toContain('anexo');
  // Mensagem de foto sem a foto seria um balão vazio na conversa
  expect(bancoMensagens).toHaveLength(0);
  expect(lerCacheMensagens()).toHaveLength(0);
});

test('mensagem de texto não passa pelo armazenamento', async () => {
  await bancoDados.enviarMensagem('grupo-teste', { tipo: 'texto', texto: 'sem anexo' });

  expect(anexosEnviados).toHaveLength(0);
  expect(bancoMensagens[0].anexoCaminho).toBeUndefined();
});

test('edição sobe e marca "Editada"', async () => {
  await bancoDados.enviarMensagem('grupo-teste', { tipo: 'texto', texto: 'errado' });
  const id = bancoMensagens[0].id;

  const res = await bancoDados.editarMensagem(id, 'certo');
  expect(res.sucesso).toBe(true);
  expect(bancoMensagens[0].texto).toBe('certo');
  expect(bancoMensagens[0].editadaEm).toBeTruthy();
});

test('edição recusada pelo banco não muda o aparelho', async () => {
  await bancoDados.enviarMensagem('grupo-teste', { tipo: 'texto', texto: 'original' });
  const id = bancoMensagens[0].id;

  recusarEscrita = true;
  const res = await bancoDados.editarMensagem(id, 'adulterado');

  expect(res.sucesso).toBe(false);
  expect(lerCacheMensagens()[0].texto).toBe('original');
  expect(bancoMensagens[0].texto).toBe('original');
});

test('só o autor edita — nem o Administrador', async () => {
  entrarComo(ANA);
  await bancoDados.enviarMensagem('grupo-teste', { tipo: 'texto', texto: 'da Ana' });
  const id = bancoMensagens[0].id;

  entrarComo(ELIAS);
  const res = await bancoDados.editarMensagem(id, 'reescrito pelo chefe');

  expect(res.sucesso).toBe(false);
  expect(bancoMensagens[0].texto).toBe('da Ana');
});

test('exclusão tira a mensagem do banco', async () => {
  await bancoDados.enviarMensagem('grupo-teste', { tipo: 'texto', texto: 'apagar' });
  const id = bancoMensagens[0].id;

  const res = await bancoDados.excluirMensagem(id);
  expect(res.sucesso).toBe(true);
  expect(bancoMensagens).toHaveLength(0);
  expect(lerCacheMensagens()).toHaveLength(0);
});

test('exclusão recusada pelo banco mantém a mensagem nos dois lados', async () => {
  await bancoDados.enviarMensagem('grupo-teste', { tipo: 'texto', texto: 'fica' });
  const id = bancoMensagens[0].id;

  recusarEscrita = true;
  const res = await bancoDados.excluirMensagem(id);

  expect(res.sucesso).toBe(false);
  expect(bancoMensagens).toHaveLength(1);
  expect(lerCacheMensagens()).toHaveLength(1);
});

test('reação sobe para o banco', async () => {
  entrarComo(ANA);
  await bancoDados.enviarMensagem('grupo-teste', { tipo: 'texto', texto: 'combinado' });
  const id = bancoMensagens[0].id;

  entrarComo(ELIAS);
  bancoDados.adicionarReacaoMensagem('grupo-teste', id, '👍');
  await Promise.resolve();

  expect(bancoMensagens[0].reacoes['👍']).toEqual(['colab-elias']);
});

test('LEITURA É DA PESSOA: abrir a conversa registra quem leu, no banco', async () => {
  entrarComo(ANA);
  await bancoDados.enviarMensagem('grupo-teste', { tipo: 'texto', texto: 'viu isso?' });
  const id = bancoMensagens[0].id;

  entrarComo(ELIAS);
  bancoDados.marcarConversaComoLida('grupo-teste');
  await Promise.resolve();

  expect(bancoLeituras).toContainEqual({ mensagemId: id, colaboradorId: 'colab-elias' });
});

// ============================================================
// AVISOS, DIRETRIZES E AUDITORIA
// ============================================================

test('comunicado publicado sobe e já nasce confirmado pelo autor', async () => {
  const res = await bancoDados.criarAvisoRede({
    titulo: 'Feriado', conteudo: 'Fechado na sexta', prioridade: 'geral',
  });

  expect(res.sucesso).toBe(true);
  expect(bancoAvisos).toHaveLength(1);
  expect(bancoAvisos[0].titulo).toBe('Feriado');
  expect(bancoLeiturasAviso[0]).toMatchObject({
    colaboradorId: 'colab-elias',
    confirmado: true,
  });
});

test('comunicado recusado pelo banco não aparece no aparelho', async () => {
  recusarEscrita = true;
  const res = await bancoDados.criarAvisoRede({
    titulo: 'Some', conteudo: 'nao deve ficar', prioridade: 'geral',
  });

  expect(res.sucesso).toBe(false);
  expect(bancoAvisos).toHaveLength(0);
  expect(JSON.parse(armazenamento.getItem(CHAVE_AVISOS_REDE) || '[]')).toHaveLength(0);
});

test('confirmação de ciência é registrada em nome de quem confirmou', async () => {
  await bancoDados.criarAvisoRede({
    titulo: 'EPI', conteudo: 'Uso obrigatorio', prioridade: 'urgente',
  });
  const avisoId = bancoAvisos[0].id;
  bancoLeiturasAviso = [];

  entrarComo(ANA);
  bancoDados.alternarConfirmacaoAviso(avisoId);
  await Promise.resolve();

  expect(bancoLeiturasAviso).toContainEqual({
    avisoId, colaboradorId: 'colab-ana', confirmado: true,
  });
});

test('diretriz do sistema vale para a rede, não para o aparelho', async () => {
  const res = await bancoDados.salvarConfiguracoes({
    nomeEmpresa: 'Malachias Autopeças',
    mesesHistoricoConversas: 3,
    modoManutencao: false,
    permitirCriacaoGruposPorOperadores: true,
  });

  expect(res.sucesso).toBe(true);
  expect(bancoConfig.meses_historico_conversas ?? bancoConfig.mesesHistoricoConversas).toBe(3);
  expect(bancoConfig.permitirCriacaoGruposPorOperadores).toBe(true);
});

test('diretriz recusada pelo banco não fica valendo só aqui', async () => {
  recusarEscrita = true;
  const res = await bancoDados.salvarConfiguracoes({
    nomeEmpresa: 'Outra',
    mesesHistoricoConversas: 99,
    modoManutencao: true,
    permitirCriacaoGruposPorOperadores: false,
  });

  expect(res.sucesso).toBe(false);
  expect(bancoConfig).toBeNull();
  expect(bancoDados.obterConfiguracoes().mesesHistoricoConversas).not.toBe(99);
});

test('só o Administrador altera as diretrizes', async () => {
  entrarComo(ANA);
  const res = await bancoDados.salvarConfiguracoes(bancoDados.obterConfiguracoes());
  expect(res.sucesso).toBe(false);
  expect(bancoConfig).toBeNull();
});

test('auditoria sobe para o banco', async () => {
  await bancoDados.criarAvisoRede({
    titulo: 'Teste', conteudo: 'conteudo', prioridade: 'geral',
  });

  const acoes = bancoAuditoria.map((a) => a.acao);
  expect(acoes).toContain('Publicação de Comunicado');
  expect(bancoAuditoria[0].usuarioNome).toBe('Elias');
});

test('auditoria que falha não derruba a ação registrada', async () => {
  // A ponte engole o erro de propósito: perder a linha do log é melhor do
  // que impedir a publicação por causa dele
  const res = await bancoDados.criarAvisoRede({
    titulo: 'Segue', conteudo: 'mesmo assim', prioridade: 'geral',
  });
  expect(res.sucesso).toBe(true);
});

// ============================================================
// FERRAMENTAS DA ÉPOCA LOCAL
// ============================================================

test('resets de demonstração são recusados com o banco ligado', () => {
  const r1 = bancoDados.gerarColaboradoresExemplo();
  const r2 = bancoDados.resetarColaboradoresParaPadraoExemplo();
  const r3 = bancoDados.limparColaboradoresManterAdmin();
  const r4 = bancoDados.importarBackup('{"colaboradores":[],"conversas":[]}');

  [r1, r2, r3, r4].forEach((r) => {
    expect(r.sucesso).toBe(false);
    expect(r.erro).toContain('Indisponível com o banco da rede ligado');
  });

  // E o mais importante: não mexeram na base
  expect(JSON.parse(armazenamento.getItem(CHAVE_COLABORADORES)!)).toHaveLength(2);
});

// ============================================================
// AVISO DE MENSAGEM NOVA
// ============================================================

test('mensagem por ler: só o que chegou para mim e eu ainda não vi', async () => {
  entrarComo(ANA);
  await bancoDados.enviarMensagem('grupo-teste', { tipo: 'texto', texto: 'da Ana' });

  entrarComo(ELIAS);
  await bancoDados.enviarMensagem('grupo-teste', { tipo: 'texto', texto: 'minha' });

  const porLer = bancoDados.obterMensagensPorLer();

  // A minha não conta: eu já sei o que escrevi
  expect(porLer).toHaveLength(1);
  expect(porLer[0].texto).toBe('da Ana');
});

test('depois de abrir a conversa, nada fica por ler', async () => {
  entrarComo(ANA);
  await bancoDados.enviarMensagem('grupo-teste', { tipo: 'texto', texto: 'oi' });

  entrarComo(ELIAS);
  expect(bancoDados.obterMensagensPorLer()).toHaveLength(1);

  bancoDados.marcarConversaComoLida('grupo-teste');
  expect(bancoDados.obterMensagensPorLer()).toHaveLength(0);
});

test('mensagem de conversa que não é minha não me avisa', async () => {
  // Conversa entre outras duas pessoas, com o Elias fora dela
  armazenamento.setItem(
    CHAVE_CONVERSAS,
    JSON.stringify([
      CONVERSA_EQUIPE,
      {
        id: 'conv-alheia', tipo: 'individual', nome: 'Outra',
        participantesIds: ['colab-ana', 'colab-terceiro'],
        naoLidas: 0, atualizadoEm: '2026-01-01T00:00:00.000Z',
      },
    ])
  );
  armazenamento.setItem(
    CHAVE_MENSAGENS,
    JSON.stringify([
      {
        id: 'msg-alheia', conversaId: 'conv-alheia', remetenteId: 'colab-ana',
        tipo: 'texto', texto: 'assunto dos outros',
        criadoEm: '2026-09-15T09:00:00.000Z', horaFormatada: '09:00', lida: false, lidaPor: [],
      },
    ])
  );

  entrarComo(ELIAS);
  expect(bancoDados.obterMensagensPorLer()).toHaveLength(0);
});

test('as mensagens por ler vêm da mais antiga para a mais nova', async () => {
  entrarComo(ANA);
  await bancoDados.enviarMensagem('grupo-teste', { tipo: 'texto', texto: 'primeira' });
  await bancoDados.enviarMensagem('grupo-teste', { tipo: 'texto', texto: 'segunda' });

  entrarComo(ELIAS);
  const porLer = bancoDados.obterMensagensPorLer();

  // O aviso mostra a última: se a ordem virasse, avisaria a mensagem errada
  expect(porLer.map((m) => m.texto)).toEqual(['primeira', 'segunda']);
});

// ============================================================
// LIMPEZA DO HISTÓRICO DE CONVERSAS
// ============================================================

/** Mensagem no banco como se fosse de meses atrás. */
const mensagemAntiga = (id: string, data: string, tipo = 'imagem') => {
  bancoMensagens.push({
    id, conversaId: 'grupo-teste', remetenteId: 'colab-elias', tipo,
    texto: tipo === 'texto' ? 'combinado da semana' : undefined,
    criadoEm: data, anexoCaminho: tipo === 'texto' ? undefined : `grupo-teste/${id}.bin`,
  });
};

test('A CONVERSA ANTIGA SAI INTEIRA: texto, foto, áudio e documento', async () => {
  mensagemAntiga('txt-velho', '2026-01-10T09:00:00.000Z', 'texto');
  mensagemAntiga('img-velha', '2026-01-11T09:00:00.000Z', 'imagem');
  mensagemAntiga('voz-velha', '2026-01-12T09:00:00.000Z', 'recado_voz');
  mensagemAntiga('doc-velho', '2026-01-13T09:00:00.000Z', 'arquivo');
  mensagemAntiga('msg-recente', '2026-09-10T09:00:00.000Z', 'texto');

  const res = await bancoDados.limparConversasAntigas('2026-06-01');

  expect(res.sucesso).toBe(true);
  expect(res.mensagens).toBe(4);
  expect(bancoMensagens.map((m) => m.id)).toEqual(['msg-recente']);

  // Apagar a linha não alcança o armazenamento: os arquivos têm que sair
  // junto, senão o espaço continua ocupado por anexo sem dono
  expect(res.arquivos).toBe(3);
  expect(anexosApagados.sort()).toEqual([
    'grupo-teste/doc-velho.bin',
    'grupo-teste/img-velha.bin',
    'grupo-teste/voz-velha.bin',
  ]);
});

test('o que está dentro do prazo não é tocado', async () => {
  mensagemAntiga('dentro', '2026-07-15T09:00:00.000Z', 'imagem');

  const res = await bancoDados.limparConversasAntigas('2026-06-01');

  expect(res.mensagens).toBe(0);
  expect(bancoMensagens).toHaveLength(1);
  expect(anexosApagados).toHaveLength(0);
});

test('a limpeza fica registrada na auditoria, que não é apagada', async () => {
  mensagemAntiga('velha', '2026-01-10T09:00:00.000Z');
  await bancoDados.limparConversasAntigas('2026-06-01');

  const registro = bancoAuditoria.find((a) => a.acao === 'Limpeza de Histórico');
  expect(registro).toBeTruthy();
  expect(registro.detalhes).toContain('2026-06-01');
  expect(registro.detalhes).toContain('Ponto e cadastros não foram tocados');
  expect(registro.usuarioNome).toBe('Elias');
});

test('só o Administrador limpa o histórico', async () => {
  mensagemAntiga('velha', '2026-01-10T09:00:00.000Z');
  entrarComo(ANA);

  const res = await bancoDados.limparConversasAntigas('2026-06-01');

  expect(res.sucesso).toBe(false);
  expect(res.erro).toContain('Apenas o Administrador');
  expect(bancoMensagens).toHaveLength(1);
});

test('data de corte precisa ser válida e anterior a hoje', async () => {
  const semData = await bancoDados.limparConversasAntigas('');
  expect(semData.sucesso).toBe(false);
  expect(semData.erro).toContain('AAAA-MM-DD');

  // Cortar "até hoje" levaria a conversa do próprio dia
  const hoje = new Date();
  const hojeIso = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-${String(
    hoje.getDate()
  ).padStart(2, '0')}`;
  const ateHoje = await bancoDados.limparConversasAntigas(hojeIso);
  expect(ateHoje.sucesso).toBe(false);
  expect(ateHoje.erro).toContain('anterior a hoje');
});

// --- A regra da casa ---

const configurarRegra = (meses: number, ultimaLimpeza?: string) => {
  armazenamento.setItem(
    'conecta_v4_configuracoes',
    JSON.stringify({
      nomeEmpresa: 'Malachias Autopeças',
      bipeRadioAtivo: true,
      tempoMaximoRadioSegundos: 45,
      mesesHistoricoConversas: meses,
      ultimaLimpezaConversas: ultimaLimpeza,
      modoManutencao: false,
      permitirCriacaoGruposPorOperadores: false,
    })
  );
};

/** Data de N meses atrás, para montar mensagem dentro ou fora da janela. */
const mesesAtras = (n: number): string => {
  const d = new Date();
  d.setMonth(d.getMonth() - n);
  return d.toISOString();
};

test('REGRA DA CASA: guarda os últimos meses e apaga o que passou', async () => {
  configurarRegra(2);
  mensagemAntiga('fora', mesesAtras(5), 'texto');
  mensagemAntiga('dentro', mesesAtras(1), 'texto');

  const res = await bancoDados.aplicarRegraDeLimpeza();

  expect(res.executou).toBe(true);
  expect(res.mensagens).toBe(1);
  expect(bancoMensagens.map((m) => m.id)).toEqual(['dentro']);
});

test('a regra roda uma vez por dia, não a cada abertura do sistema', async () => {
  configurarRegra(2, new Date().toISOString());
  mensagemAntiga('fora', mesesAtras(5));

  const res = await bancoDados.aplicarRegraDeLimpeza();

  expect(res.executou).toBe(false);
  expect(bancoMensagens).toHaveLength(1);
});

test('regra em zero mês deixa a limpeza automática desligada', async () => {
  configurarRegra(0);
  mensagemAntiga('antiquissima', mesesAtras(24));

  const res = await bancoDados.aplicarRegraDeLimpeza();

  expect(res.executou).toBe(false);
  expect(bancoMensagens).toHaveLength(1);
});

test('a regra não roda na sessão de quem não é Administrador', async () => {
  configurarRegra(2);
  mensagemAntiga('fora', mesesAtras(5));
  entrarComo(ANA);

  const res = await bancoDados.aplicarRegraDeLimpeza();

  expect(res.executou).toBe(false);
  expect(bancoMensagens).toHaveLength(1);
});

test('ACESSO DE UM CLIQUE: no modo rede não entra pela verificação local', () => {
  // Entrar por aqui deixava a pessoa dentro do app sem sessão no Supabase:
  // a tela abria, mas toda leitura voltava vazia e toda gravação era
  // recusada pela RLS ("violates row-level security policy")
  armazenamento.setItem(
    'conecta_v4_ultimo_acesso_dispositivo',
    JSON.stringify({ id: 'colab-elias', senha: '123456' })
  );

  const res = bancoDados.autenticarContaSugerida();

  expect(res.sucesso).toBe(false);
  expect(res.colaborador).toBeUndefined();
});

test('a senha do aparelho fica disponível para o login pelo banco', () => {
  bancoDados.registrarAcessoDoDispositivo('colab-ana', 'segredo123');
  expect(bancoDados.obterSenhaSugeridaDoDispositivo()).toBe('segredo123');
});

test('no modo local os resets continuam funcionando', () => {
  modoNuvem = false;
  const res = bancoDados.limparColaboradoresManterAdmin();
  expect(res.sucesso).toBe(true);
  modoNuvem = true;
});

// ============================================================
// CARGA DA PLANILHA: o que é lido tem que chegar na ficha
// ============================================================

test('CNPJ DA PLANILHA CHEGA NA FICHA DO COLABORADOR', async () => {
  // O CNPJ era lido da planilha e descartado na importação em lote: a
  // função não conhecia o campo, então ele sumia sem erro nenhum
  const res = await bancoDados.importarColaboradoresEmLote(
    [
      {
        nome: 'Joana Ribeiro',
        login: 'joana.ribeiro',
        cargo: 'Administrativo',
        loja: 'Pirassununga',
        setor: 'Administrativo',
        nivel: 1,
        matricula: 'MAL-0900',
        cnpj: '11.222.333/0001-81',
      },
    ],
    true
  );

  expect(res.sucesso).toBe(true);
  expect(res.criados).toBe(1);

  const criada = bancoDados.obterColaboradores().find((c) => c.login === 'joana.ribeiro');
  expect(criada).toBeTruthy();
  expect(criada!.cnpj).toBe('11.222.333/0001-81');
  // A matrícula sempre funcionou; serve de controle de que o teste é honesto
  expect(criada!.matricula).toBe('MAL-0900');
});

test('atualizar pela planilha preenche o CNPJ de quem já existe', async () => {
  bancoDados.importarColaboradoresEmLote(
    [
      {
        nome: 'Ana', login: 'ana', cargo: 'Vendedora',
        loja: 'Pirassununga', setor: 'Balcão', nivel: 1,
        cnpj: '11.222.333/0001-81',
      },
    ],
    true
  );

  const ana = bancoDados.obterColaboradores().find((c) => c.login === 'ana');
  expect(ana!.cnpj).toBe('11.222.333/0001-81');
});

test('A PLANILHA NÃO TRANCA O ADMINISTRADOR DO LADO DE FORA', async () => {
  // A linha do próprio admin vindo como nível 1 o rebaixaria — e só um TI
  // devolve o nível. Ele ficaria trancado fora do sistema que administra.
  bancoDados.importarColaboradoresEmLote(
    [
      {
        nome: 'Elias', login: 'elias', cargo: 'Diretor',
        loja: 'Pirassununga', setor: 'TI', nivel: 1,
      },
    ],
    true
  );

  const elias = bancoDados.obterColaboradores().find((c) => c.login === 'elias');
  expect(elias!.nivel).toBe(5);
});

// ============================================================
// FIXAR MENSAGEM: É CONTEÚDO COMPARTILHADO, NÃO PREFERÊNCIA
//
// Fixar conversa na lista é do navegador de cada um. Fixar MENSAGEM vale
// para todos os participantes, então tem de atravessar o banco — ida e
// volta. Estes testes leem o código da ponte, que é onde isso se perde.
// ============================================================

test('a ponte com o banco leva E traz as duas colunas do fixar', async () => {
  /**
   * O jeito de isto quebrar em silêncio: mapear só a ida. A mensagem sobe
   * fixada, o banco grava, e ao recarregar volta sem `fixadaEm` — a faixa
   * some sozinha e ninguém entende por quê.
   */
  const ponte = await Bun.file(
    new URL('./nuvemComunicacao.ts', import.meta.url)
  ).text();

  // Ida: do objeto para a linha
  expect(ponte).toContain('fixada_em: m.fixadaEm ?? null');
  expect(ponte).toContain('fixada_por_id: m.fixadaPorId ?? null');

  // Volta: da linha para o objeto
  expect(ponte).toContain('fixadaEm: linha.fixada_em || undefined');
  expect(ponte).toContain('fixadaPorId: linha.fixada_por_id || undefined');

  // E a coluna tem que existir no tipo da linha, senão o TypeScript cala
  expect(ponte).toContain('fixada_em: string | null');
});

test('o banco tem as colunas e o índice das fixadas', async () => {
  const sql = await Bun.file(
    new URL('../../supabase/esquema.sql', import.meta.url)
  ).text();

  expect(sql).toContain('add column if not exists fixada_em');
  expect(sql).toContain('add column if not exists fixada_por_id');
  // Sem índice, abrir uma conversa longa varre a conversa inteira
  expect(sql).toContain('mensagens_fixadas_por_conversa');
});

test('AS AÇÕES DA MENSAGEM SÃO ALCANÇÁVEIS NO CELULAR', async () => {
  /**
   * O defeito relatado: encaminhar, editar e apagar viviam num
   * `opacity-0 group-hover:opacity-100`. Toque não dispara hover — então no
   * aparelho onde a rede mais usa o sistema essas ações eram invisíveis.
   *
   * Este teste lê a tela e exige que exista um caminho que não dependa de
   * hover.
   */
  const tela = await Bun.file(
    new URL('../componentes/TelaConversa.tsx', import.meta.url)
  ).text();

  // Há um gatilho que não depende de hover, e ele é o MESMO nos dois
  // aparelhos: as ações deixaram de ter duas listas quando a fileira de seis
  // ícones do computador saiu. No celular o botão fica sempre à mão; no
  // computador ele aparece ao passar o mouse.
  expect(tela).toContain('setMenuMensagem({ msg, x: r.left, y: r.bottom })');
  expect(tela).toContain('md:opacity-0 md:group-hover:opacity-100');

  // A fileira de ícones do computador não pode voltar: eram seis alvos
  // pequenos e sem rótulo ao lado de cada balão, e uma segunda lista das
  // mesmas ações
  expect(tela).not.toContain("hidden md:flex opacity-0 group-hover:opacity-100");
});

test('no celular as ações são um PAINEL, não botões na linha da mensagem', async () => {
  /**
   * A primeira correção falhou: acrescentei os mesmos botõezinhos à linha da
   * mensagem, e no telefone eles caíam fora da tela. O balão já ocupa 85% da
   * largura, sobra espaço para UM botão — não para cinco —, e o container só
   * rola na vertical, então nem dava para alcançá-los.
   *
   * O teste exige o painel: posicionado, com largura própria, e com rótulo
   * em texto em vez de só ícone.
   */
  const tela = await Bun.file(
    new URL('../componentes/TelaConversa.tsx', import.meta.url)
  ).text();

  const inicio = tela.indexOf('{menuMensagem && (() => {');
  expect(inicio).toBeGreaterThan(-1);
  const menu = tela.slice(inicio, inicio + 6000);

  /**
   * Flutuante e com largura própria: não disputa espaço com o balão.
   *
   * Ele já foi `absolute` dentro da lista de mensagens, e isso trouxe outro
   * defeito: perto do topo da conversa a borda da lista o cortava ao meio.
   * Agora é `fixed`, ancorado na janela pelo canto do botão.
   */
  expect(menu).toContain('className="fixed z-[61]');
  expect(menu).toContain('width: MENU_LARGURA');

  // Rótulos em texto — ícone sozinho num menu de toque não diz o que faz
  for (const rotulo of ['Encaminhar', 'Selecionar', 'Apagar']) {
    expect(menu).toContain(rotulo);
  }

  // Fundo que fecha ao tocar fora, senão o menu fica preso aberto
  expect(menu).toContain('fixed inset-0');

  // Se não couber embaixo, abre para cima — antes isso era decidido pelo
  // ÍNDICE da mensagem na lista, que chutava; agora é medido na janela
  expect(tela).not.toContain('abrirMenuParaCima');
  expect(menu).toContain('const cabeAbaixo =');
});

test('quem fixa é quem pode publicar, não só o autor', async () => {
  // Fixar não é sobre a mensagem, é sobre destacá-la para o grupo — e quem
  // destaca costuma ser quem coordena, não quem escreveu. Num canal onde só
  // a gestão fala, só a gestão fixa.
  const servico = await Bun.file(
    new URL('./bancoDados.ts', import.meta.url)
  ).text();

  const inicio = servico.indexOf('podeFixarMensagem(mensagem: Mensagem): boolean {');
  const corpo = servico.slice(inicio, inicio + 200);

  expect(corpo).toContain('podePublicarNaConversa');
  expect(corpo).not.toContain('remetenteId');
});

// ============================================================
// O CAMINHO DO ENVIO — ONDE O DELAY MORAVA
//
// Uma mensagem de texto fazia SEIS idas ao banco antes de aparecer na tela:
// quatro em salvarConversa (a conversa, a minha participação, quem já está
// dentro, os que faltam), a da mensagem, e a do próprio visto. No celular
// isso é quase um segundo de caixa parada — e a pessoa aperta enviar de
// novo achando que falhou.
// ============================================================

test('a conversa NÃO sobe a cada mensagem', async () => {
  const ponte = await Bun.file(
    new URL('./nuvemComunicacao.ts', import.meta.url)
  ).text();
  const servico = await Bun.file(new URL('./bancoDados.ts', import.meta.url)).text();

  // Há um registro de quais conversas já existem no banco
  expect(ponte).toContain('conversaJaEstaNoBanco');
  expect(ponte).toContain('marcarConversaNoBanco');

  // E o envio consulta esse registro antes de regravar a conversa
  expect(servico).toContain('!conversaJaEstaNoBanco(conversaId)');
});

test('o atalho que mente é desfeito, não vira erro para quem escreveu', async () => {
  /**
   * Se o registro disser que a conversa está no banco e ela não estiver, o
   * insert falha com referência quebrada (23503). Devolver erro nesse caso
   * puniria a pessoa por um atalho nosso: o certo é refazer a conversa e
   * tentar de novo, uma vez.
   */
  const ponte = await Bun.file(
    new URL('./nuvemComunicacao.ts', import.meta.url)
  ).text();
  const servico = await Bun.file(new URL('./bancoDados.ts', import.meta.url)).text();

  expect(ponte).toContain("conversaAusente: error.code === '23503'");
  expect(servico).toContain('res.conversaAusente');
  expect(servico).toContain('esquecerConversaDoBanco');
});

test('o próprio visto não segura o envio', async () => {
  // Quem envia já leu o que escreveu. Esperar por esse registro punha uma
  // ida a mais no caminho crítico, por nada.
  const ponte = await Bun.file(
    new URL('./nuvemComunicacao.ts', import.meta.url)
  ).text();

  const inicio = ponte.indexOf('async salvarMensagem');
  const corpo = ponte.slice(inicio, inicio + 1800);

  expect(corpo).toContain('void this.marcarLeitura');
  expect(corpo).not.toContain('await this.marcarLeitura');
});

test('A MENSAGEM APARECE ANTES DE SUBIR, e diz que está subindo', async () => {
  /**
   * O compromisso de "só vale depois de entrar no banco" continua: o que
   * muda é que a espera fica VISÍVEL. Sem o selo, "apareceu" pareceria
   * "enviado" — pior do que a espera.
   */
  const servico = await Bun.file(new URL('./bancoDados.ts', import.meta.url)).text();

  // Grava e notifica ANTES do bloco de rede
  const inicio = servico.indexOf('async enviarMensagem');
  const corpo = servico.slice(inicio, inicio + 6000);

  const posGuardar = corpo.indexOf('this.guardarMensagemLocal');
  const posSalvar = corpo.indexOf('nuvemComunicacao.salvarMensagem');
  expect(posGuardar).toBeGreaterThan(-1);
  expect(posSalvar).toBeGreaterThan(posGuardar);

  // E o estado do envio existe nos dois sentidos
  expect(servico).toContain("novaMensagem.envio = 'enviando'");
  expect(servico).toContain('this.confirmarEnvio');
  expect(servico).toContain('this.marcarFalhaDeEnvio');

  // A tela mostra os dois estados
  const tela = await Bun.file(
    new URL('../componentes/TelaConversa.tsx', import.meta.url)
  ).text();
  expect(tela).toContain("msg.envio === 'enviando'");
});

test('o estado do envio NÃO vai para o banco', async () => {
  // É marca do aparelho. Subindo, ela voltaria na sincronização e a mensagem
  // ficaria "enviando" para sempre na tela de quem recebeu.
  const ponte = await Bun.file(
    new URL('./nuvemComunicacao.ts', import.meta.url)
  ).text();

  const inicio = ponte.indexOf('const paraLinhaMensagem');
  const mapa = ponte.slice(inicio, inicio + 1200);
  expect(mapa).not.toContain('envio');
});
