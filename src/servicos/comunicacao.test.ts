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
  setor: 'Diretoria', loja: 'Pirassununga', nivel: 4, foto: '', presenca: 'online',
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
    removerColaborador: async () => ({ sucesso: true }),
    sincronizarPonto: async () => true,
  },
}));

const recusa = { sucesso: false, erro: 'sem conexao' };

mock.module('./nuvemComunicacao', () => ({
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
    limparImagensAte: async (dataCorte: string) => {
      if (recusarEscrita) return recusa;
      // Só imagem, e a mensagem continua na tabela — como no banco
      const alvo = bancoMensagens.filter(
        (m) => m.tipo === 'imagem' && m.criadoEm < dataCorte && m.anexoCaminho
      );
      const caminhos = alvo.map((m) => m.anexoCaminho);
      alvo.forEach((m) => {
        m.anexoCaminho = undefined;
        m.anexoLimpoEm = new Date().toISOString();
      });
      return { sucesso: true, limpas: alvo.length, caminhos };
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
    bipeRadioAtivo: false,
    tempoMaximoRadioSegundos: 30,
    mesesHistoricoImagens: 2,
    modoManutencao: false,
    permitirCriacaoGruposPorOperadores: true,
  });

  expect(res.sucesso).toBe(true);
  expect(bancoConfig.tempoMaximoRadioSegundos).toBe(30);
  expect(bancoConfig.permitirCriacaoGruposPorOperadores).toBe(true);
});

test('diretriz recusada pelo banco não fica valendo só aqui', async () => {
  recusarEscrita = true;
  const res = await bancoDados.salvarConfiguracoes({
    nomeEmpresa: 'Outra',
    bipeRadioAtivo: true,
    tempoMaximoRadioSegundos: 999,
    mesesHistoricoImagens: 2,
    modoManutencao: true,
    permitirCriacaoGruposPorOperadores: false,
  });

  expect(res.sucesso).toBe(false);
  expect(bancoConfig).toBeNull();
  expect(bancoDados.obterConfiguracoes().tempoMaximoRadioSegundos).not.toBe(999);
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
// LIMPEZA DE IMAGENS ANTIGAS
// ============================================================

/** Mensagem no banco como se fosse de meses atrás. */
const mensagemAntiga = (id: string, data: string, tipo = 'imagem') => {
  bancoMensagens.push({
    id, conversaId: 'grupo-teste', remetenteId: 'colab-elias', tipo,
    texto: tipo === 'texto' ? 'combinado da semana' : undefined,
    legenda: tipo === 'imagem' ? 'peça trocada' : undefined,
    criadoEm: data, anexoCaminho: tipo === 'texto' ? undefined : `grupo-teste/${id}.bin`,
  });
};

test('A MENSAGEM FICA, A IMAGEM SAI: limpeza preserva o registro', async () => {
  mensagemAntiga('img-velha', '2026-01-10T09:00:00.000Z');
  mensagemAntiga('img-recente', '2026-09-10T09:00:00.000Z');

  const res = await bancoDados.limparImagensAntigas('2026-06-01');

  expect(res.sucesso).toBe(true);
  expect(res.imagens).toBe(1);

  // Nenhuma mensagem sai do histórico — o registro é o controle
  expect(bancoMensagens).toHaveLength(2);

  const velha = bancoMensagens.find((m) => m.id === 'img-velha');
  expect(velha.anexoCaminho).toBeUndefined();
  expect(velha.anexoLimpoEm).toBeTruthy();
  // Quem enviou, quando e a legenda continuam lá
  expect(velha.remetenteId).toBe('colab-elias');
  expect(velha.legenda).toBe('peça trocada');

  // O arquivo tem que sair do armazenamento, senão o espaço não é liberado
  expect(res.arquivos).toBe(1);
  expect(anexosApagados).toEqual(['grupo-teste/img-velha.bin']);
});

test('SÓ IMAGEM: recado de voz, documento e texto antigos não são tocados', async () => {
  mensagemAntiga('voz-velha', '2026-01-10T09:00:00.000Z', 'recado_voz');
  mensagemAntiga('doc-velho', '2026-01-11T09:00:00.000Z', 'arquivo');
  mensagemAntiga('txt-velho', '2026-01-12T09:00:00.000Z', 'texto');
  mensagemAntiga('img-velha', '2026-01-13T09:00:00.000Z');

  const res = await bancoDados.limparImagensAntigas('2026-06-01');

  expect(res.imagens).toBe(1);
  expect(anexosApagados).toEqual(['grupo-teste/img-velha.bin']);
  expect(bancoMensagens.find((m) => m.id === 'voz-velha').anexoCaminho).toBeTruthy();
  expect(bancoMensagens.find((m) => m.id === 'doc-velho').anexoCaminho).toBeTruthy();
  expect(bancoMensagens.find((m) => m.id === 'txt-velho').texto).toBe('combinado da semana');
});

test('a limpeza fica registrada na auditoria, que não é apagada', async () => {
  mensagemAntiga('img-velha', '2026-01-10T09:00:00.000Z');
  await bancoDados.limparImagensAntigas('2026-06-01');

  const registro = bancoAuditoria.find((a) => a.acao === 'Limpeza de Imagens Antigas');
  expect(registro).toBeTruthy();
  expect(registro.detalhes).toContain('2026-06-01');
  expect(registro.detalhes).toContain('mensagens foram mantidas');
  expect(registro.usuarioNome).toBe('Elias');
});

test('só o Administrador limpa imagens', async () => {
  mensagemAntiga('img-velha', '2026-01-10T09:00:00.000Z');
  entrarComo(ANA);

  const res = await bancoDados.limparImagensAntigas('2026-06-01');

  expect(res.sucesso).toBe(false);
  expect(res.erro).toContain('Apenas o Administrador');
  expect(bancoMensagens[0].anexoCaminho).toBeTruthy();
});

test('data de corte precisa ser válida e anterior a hoje', async () => {
  const semData = await bancoDados.limparImagensAntigas('');
  expect(semData.sucesso).toBe(false);
  expect(semData.erro).toContain('AAAA-MM-DD');

  // Cortar "até hoje" levaria as fotos do próprio dia
  const hoje = new Date();
  const hojeIso = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-${String(
    hoje.getDate()
  ).padStart(2, '0')}`;
  const ateHoje = await bancoDados.limparImagensAntigas(hojeIso);
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
      mesesHistoricoImagens: meses,
      ultimaLimpezaImagens: ultimaLimpeza,
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

test('REGRA DA CASA: guarda os últimos meses e limpa o que passou', async () => {
  configurarRegra(2);
  mensagemAntiga('img-fora', mesesAtras(5));
  mensagemAntiga('img-dentro', mesesAtras(1));

  const res = await bancoDados.aplicarRegraDeLimpeza();

  expect(res.executou).toBe(true);
  expect(res.imagens).toBe(1);
  expect(bancoMensagens.find((m) => m.id === 'img-fora').anexoCaminho).toBeUndefined();
  // Dentro da janela de guarda, a foto continua lá
  expect(bancoMensagens.find((m) => m.id === 'img-dentro').anexoCaminho).toBeTruthy();
});

test('a regra roda uma vez por dia, não a cada abertura do sistema', async () => {
  configurarRegra(2, new Date().toISOString());
  mensagemAntiga('img-fora', mesesAtras(5));

  const res = await bancoDados.aplicarRegraDeLimpeza();

  expect(res.executou).toBe(false);
  expect(anexosApagados).toHaveLength(0);
});

test('regra em zero mês deixa a limpeza automática desligada', async () => {
  configurarRegra(0);
  mensagemAntiga('img-antiquissima', mesesAtras(24));

  const res = await bancoDados.aplicarRegraDeLimpeza();

  expect(res.executou).toBe(false);
  expect(bancoMensagens[0].anexoCaminho).toBeTruthy();
});

test('a regra não roda na sessão de quem não é Administrador', async () => {
  configurarRegra(2);
  mensagemAntiga('img-fora', mesesAtras(5));
  entrarComo(ANA);

  const res = await bancoDados.aplicarRegraDeLimpeza();

  expect(res.executou).toBe(false);
  expect(bancoMensagens[0].anexoCaminho).toBeTruthy();
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
