/**
 * OS AVISOS DO PONTO, do lado do aparelho.
 *
 * O servidor tem os próprios testes (`avisoDoPonto.test.ts`). Aqui: o que
 * o aparelho manda, quem ele põe na lista, e que os cinco lugares onde um
 * pedido nasce ou é decidido de fato pedem o aviso — pela regra que já
 * existe, e não por uma cópia dela.
 */
import { test, expect, mock, beforeEach } from 'bun:test';

let chamadas: any[] = [];
let eu = { id: 'ana' };
let pessoas: any[] = [];

mock.module('./supabase', () => ({
  supabase: {
    functions: {
      invoke: async (nome: string, opcoes: any) => {
        chamadas.push({ nome, corpo: opcoes.body });
        return { error: null };
      },
    },
  },
  usandoNuvem: () => true,
}));

mock.module('./bancoDados', () => ({
  bancoDados: {
    obterColaboradorAtual: () => eu,
    obterColaboradores: () => pessoas,
  },
}));

const { quemAcompanha, avisarPedidoDePonto, avisarDecisaoDePonto, textoDaDecisao } =
  await import('./avisosDePonto');

beforeEach(() => {
  chamadas = [];
  eu = { id: 'ana' };
  pessoas = [
    { id: 'ana', ativo: true },
    { id: 'bia', ativo: true },
    { id: 'caio', ativo: true },
    { id: 'zeca', ativo: false },
  ];
});

test('quem acompanha: pela regra passada, sem quem chama e sem desligado', () => {
  expect(quemAcompanha(() => true)).toEqual(['bia', 'caio']);
  expect(quemAcompanha((q) => q.id === 'caio')).toEqual(['caio']);
});

test('o pedido vai para o servidor com o que ele precisa conferir', () => {
  avisarPedidoDePonto({
    tabela: 'ajustes_jornada',
    id: 'aj-1',
    destinatarios: ['bia'],
    secao: 'aprovar_jornadas',
    texto: 'Hora extra de 1h20 em 28/09/2026 · aguarda sua decisão',
  });

  expect(chamadas).toEqual([
    {
      nome: 'enviar-aviso',
      corpo: {
        ponto: {
          evento: 'pedido',
          tabela: 'ajustes_jornada',
          id: 'aj-1',
          destinatarios: ['bia'],
          secao: 'aprovar_jornadas',
          texto: 'Hora extra de 1h20 em 28/09/2026 · aguarda sua decisão',
        },
      },
    },
  ]);
});

test('pedido sem ninguém para avisar nem chega ao servidor', () => {
  avisarPedidoDePonto({ tabela: 'ajustes_jornada', id: 'aj-1', destinatarios: [], secao: 'aprovar_jornadas', texto: 'x' });
  expect(chamadas).toEqual([]);
});

test('a decisão não leva lista: quem recebe o servidor tira do banco', () => {
  avisarDecisaoDePonto({ tabela: 'justificativas_ausencia', id: 'j-1', texto: 'Aprovado: Folga' });
  expect(chamadas[0].corpo.ponto).toEqual({
    evento: 'decisao',
    tabela: 'justificativas_ausencia',
    id: 'j-1',
    secao: 'meu_ponto',
    texto: 'Aprovado: Folga',
  });
  expect(chamadas[0].corpo.ponto.destinatarios).toBeUndefined();
});

test('o texto da decisão diz o resultado e, na recusa, o motivo', () => {
  expect(textoDaDecisao(true, 'Folga de sábado em 04/10/2026')).toBe(
    'Aprovado: Folga de sábado em 04/10/2026'
  );
  expect(textoDaDecisao(false, 'Hora extra de 1h em 28/09/2026', ' não combinada ')).toBe(
    'Recusado: Hora extra de 1h em 28/09/2026 · não combinada'
  );
});

// ---------------------------------------------------------------
// Os cinco lugares onde o pedido nasce ou é decidido
// ---------------------------------------------------------------

const trecho = (fonte: string, inicio: string, tamanho = 9000) => {
  const i = fonte.indexOf(inicio);
  expect(i).toBeGreaterThan(-1);
  return fonte.slice(i, i + tamanho);
};

test('o dia que ENTRA na fila avisa quem acompanha, pela regra do organograma', async () => {
  const ponto = await Bun.file(new URL('./ponto.ts', import.meta.url)).text();
  const apurar = trecho(ponto, 'async apurarDia(', 16000);

  // Só quando PASSA a esperar decisão: reapurar o mesmo pendente não avisa de novo
  expect(apurar).toContain("ajuste.estado === 'pendente' && existente?.estado !== 'pendente'");
  expect(apurar).toContain('quemAcompanha((quem) => deveSerAvisadoSobre(quem, dono, todos))');
});

test('as duas decisões do ajuste avisam o dono', async () => {
  const ponto = await Bun.file(new URL('./ponto.ts', import.meta.url)).text();
  expect(trecho(ponto, 'async decidirAjuste(')).toContain('avisarDecisaoDePonto({');
  expect(trecho(ponto, 'async decidirDiaIncompleto(', 4000)).toContain('avisarDecisaoDePonto({');
});

test('ausência e folga: o pedido avisa pela regra das ausências; decisão e lançamento avisam o dono', async () => {
  const fonte = await Bun.file(new URL('./justificativas.ts', import.meta.url)).text();

  // O atestado vai ao RH, a folga à cadeia — a regra é a de sempre
  expect(fonte).toContain('deveSerAvisadoDeAusencia(quem, eu, justificativa.tipo)');
  expect(fonte).toContain(
    "secao: justificativa.tipo === 'folga_sabado' ? 'escala_folgas' : 'aprovar_jornadas'"
  );
  expect(trecho(fonte, 'export const decidirAusencia')).toContain('avisarDecisaoDePonto({');
  expect(fonte).toContain('Lançado na sua escala:');
});
