/**
 * O PEDIDO DE AVISO DE UMA MENSAGEM — CONECTA
 *
 * O aparelho que envia pede ao servidor que acorde os outros. Este
 * arquivo protege três coisas:
 *
 *  1. o pedido NUNCA atrapalha o envio — a mensagem já está no banco;
 *  2. ele sai do único insert de mensagem, e não de cada tela;
 *  3. a função de servidor só avisa quem deve: pedido de quem enviou,
 *     para quem participa, sem quem removeu a conversa ou saiu da empresa.
 */
import { test, expect, mock, beforeEach } from 'bun:test';

let naNuvem = true;
let pedidos: { nome: string; corpo: any }[] = [];
let clienteSemFuncoes = false;

mock.module('./supabase', () => ({
  get supabase() {
    if (clienteSemFuncoes) return {};
    return {
      functions: {
        invoke: async (nome: string, { body }: { body: any }) => {
          pedidos.push({ nome, corpo: body });
          return { error: null };
        },
      },
    };
  },
  usandoNuvem: () => naNuvem,
}));

const { pedirAvisoDaMensagem, FUNCAO_DE_AVISO } = await import('./envioDeAviso');

beforeEach(() => {
  naNuvem = true;
  pedidos = [];
  clienteSemFuncoes = false;
});

test('pede o aviso com o id da mensagem e a prévia', () => {
  pedirAvisoDaMensagem('msg-1', 'bom dia');

  expect(pedidos).toEqual([
    { nome: FUNCAO_DE_AVISO, corpo: { mensagemId: 'msg-1', previa: 'bom dia' } },
  ]);
});

test('a prévia é cortada: o Android não mostra o resto', () => {
  pedirAvisoDaMensagem('msg-2', 'x'.repeat(5000));

  expect(pedidos[0].corpo.previa.length).toBe(240);
});

test('no modo local não há a quem pedir', () => {
  naNuvem = false;
  pedirAvisoDaMensagem('msg-3', 'oi');

  expect(pedidos).toEqual([]);
});

test('SEM CLIENTE DE FUNÇÕES, o envio da mensagem não quebra', () => {
  /* A mensagem já foi gravada: um erro aqui devolveria falha para quem
     só queria mandar um "bom dia" que chegou */
  clienteSemFuncoes = true;

  expect(() => pedirAvisoDaMensagem('msg-4', 'oi')).not.toThrow();
});

test('O PEDIDO SAI DO ÚNICO INSERT DE MENSAGEM, e só depois de dar certo', async () => {
  /**
   * Chat, recado de publicação e aviso de citação passam todos por
   * `salvarMensagem`. Chamado de cada tela, um deles ficaria mudo.
   * E antes do insert, avisaria de uma mensagem que o banco recusou.
   */
  const fonte = await Bun.file('src/servicos/nuvemComunicacao.ts').text();
  const inicio = fonte.indexOf('async salvarMensagem(');
  const corpo = fonte.slice(inicio, fonte.indexOf('async atualizarMensagem(', inicio));

  expect(corpo.length).toBeGreaterThan(0);
  const insert = corpo.indexOf(".from('mensagens').insert(");
  const falhou = corpo.indexOf('if (error)');
  const pedido = corpo.indexOf('pedirAvisoDaMensagem(mensagem.id, montarPreviaDaMensagem(mensagem))');
  expect(insert).toBeGreaterThan(-1);
  expect(pedido).toBeGreaterThan(falhou);
  expect(falhou).toBeGreaterThan(insert);

  /* E ninguém mais pede: o pedido tem um lugar só */
  for await (const arquivo of new Bun.Glob('src/**/*.{ts,tsx}').scan('.')) {
    if (arquivo.endsWith('.test.ts') || arquivo.replace(/\\/g, '/').endsWith('envioDeAviso.ts')) continue;
    const texto = await Bun.file(arquivo).text();
    const chamadas = texto.split('pedirAvisoDaMensagem(').length - 1;
    const esperado = arquivo.replace(/\\/g, '/').endsWith('nuvemComunicacao.ts') ? 1 : 0;
    expect({ arquivo, chamadas }).toEqual({ arquivo, chamadas: esperado });
  }
});

// ===============================================================
// A FUNÇÃO DE SERVIDOR
//
// Roda no Deno do Supabase, fora do alcance do `bun test`. O que dá
// para cobrar daqui é que as travas estão escritas.
// ===============================================================

const funcao = () => Bun.file(`supabase/functions/${FUNCAO_DE_AVISO}/index.ts`).text();

test('a função existe com o mesmo nome que o aparelho chama', async () => {
  expect((await funcao()).length).toBeGreaterThan(0);
});

test('SÓ QUEM ENVIOU PEDE O AVISO', async () => {
  /* Sem isto, qualquer sessão faria qualquer conversa tocar no bolso
     de todo mundo */
  const fonte = await funcao();
  expect(fonte).toContain('mensagem.remetente_id !== eu.id');
  expect(fonte).toContain("eq('auth_user_id', sessao.user.id)");
});

test('quem removeu a conversa, quem saiu da empresa e o próprio remetente ficam de fora', async () => {
  const fonte = await funcao();
  expect(fonte).toContain('p.removida !== true');
  expect(fonte).toContain(".eq('ativo', true)");
  expect(fonte).toContain(".neq('colaborador_id', eu.id)");
});

test('o título sai do banco, e não do aparelho', async () => {
  /* O aparelho manda só a prévia do próprio texto. Título vindo dele
     deixaria um aviso aparecer com o nome de outra pessoa */
  const fonte = await funcao();
  expect(fonte).toContain('const titulo = ehGrupo ? conversa.nome : eu.nome;');
  expect(fonte).not.toMatch(/corpo\.titulo/);
});

test('a chave de serviço do Firebase não está no repositório', async () => {
  const fonte = await funcao();
  expect(fonte).toContain("Deno.env.get('FCM_CONTA_SERVICO')");
  expect(fonte).not.toContain('BEGIN PRIVATE KEY-----\\n');
  expect(fonte).not.toMatch(/"private_key"\s*:/);
});
