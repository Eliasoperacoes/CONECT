/**
 * O ARQUIVO QUE VAI PARA O SUPABASE, testado como ele é.
 *
 * `supabase/functions/apurar-ponto/index.ts` é gerado e colado no painel.
 * Aqui ele é carregado com um Deno de mentira e um banco de mentira, em
 * UTC (o fuso das funções), e precisa: recusar quem não tem o segredo, ler
 * as tabelas paginando, e gravar a falta do dia que ninguém bateu.
 */
process.env.TZ = 'UTC';

import { test, expect, setSystemTime, beforeAll } from 'bun:test';
import { readFileSync } from 'fs';
import { gerarFuncaoApurar, DESTINO } from '../../scripts/gerar-funcao-apurar';

test('o arquivo colado no Supabase está em dia com o código', async () => {
  // Mudou uma regra e esqueceu de gerar? Rode: bun scripts/gerar-funcao-apurar.ts
  expect(readFileSync(DESTINO, 'utf8').replace(/\r\n/g, '\n')).toBe(await gerarFuncaoApurar());
});

test('o segredo e o endereço do projeto não entram no repositório', () => {
  /*
    Os SQLs da apuração levam o segredo e o endereço do projeto. No
    repositório ficam os marcadores; os valores são trocados só na cópia
    entregue para colar no Supabase.
  */
  const preparar = readFileSync('supabase/apuracao-1-preparar.sql', 'utf8');
  expect(preparar).toContain("'COLE_O_SEGREDO'");
  expect(preparar).toContain("'URL_DO_PROJETO/functions/v1/apurar-ponto?simular=1'");
  expect(readFileSync('supabase/apuracao-3-agendar.sql', 'utf8')).toContain("'URL_DO_PROJETO/functions/v1/apurar-ponto'");
  expect(preparar + readFileSync('supabase/apuracao-3-agendar.sql', 'utf8')).not.toMatch(/supabase\.co/);
});

let tratar: (req: Request) => Promise<Response>;
let falharUmaVez = false;
const pedidos: { url: string; metodo: string; corpo?: string; range?: string }[] = [];

const ANA = {
  id: 'ana', nome: 'Ana', login: 'ana', cargo: 'Balconista', setor: 'Balcão', loja: 'Pirassununga', nivel: 1,
  foto: null, presenca: 'disponivel', ativo: true, criado_em: '', turno: 'A', carga_horaria_diaria_minutos: null,
};

beforeAll(async () => {
  // Quinta, 08/10/2026, 03:00 em Brasília
  setSystemTime(new Date('2026-10-08T06:00:00.000Z'));

  (globalThis as any).Deno = {
    env: {
      get: (n: string) =>
        ({ SUPABASE_URL: 'https://banco', SUPABASE_SERVICE_ROLE_KEY: 'chave', APURAR_SEGREDO: 'segredo' })[n],
    },
    serve: (h: typeof tratar) => {
      tratar = h;
    },
  };

  (globalThis as any).fetch = async (url: string, init: RequestInit = {}) => {
    const headers = (init.headers || {}) as Record<string, string>;
    pedidos.push({ url, metodo: init.method || 'GET', corpo: init.body as string, range: headers.Range });
    const tabela = new URL(url).pathname.split('/').pop();
    if (init.method === 'POST') return new Response(null, { status: 201 });
    // O "JWT issued at future" da primeira simulação em produção: passa na segunda
    if (tabela === 'colaboradores' && falharUmaVez) {
      falharUmaVez = false;
      return new Response(JSON.stringify({ code: 'PGRST303', message: 'JWT issued at future' }), { status: 401 });
    }
    // Como na produção em 01/10/2026: a tabela de feriados cadastrados não existe
    if (tabela === 'feriados') {
      return new Response(JSON.stringify({ code: 'PGRST205', message: "Could not find the table 'public.feriados'" }), { status: 404 });
    }
    const respostas: Record<string, unknown[]> = {
      colaboradores: [ANA],
      // Ana bateu a semana toda, menos a terça 06/10
      registros_ponto: ['2026-10-01', '2026-10-02', '2026-10-05', '2026-10-07'].flatMap((d) =>
        [['entrada', '10:30'], ['saida_almoco', '15:30'], ['retorno_almoco', '17:00'], ['saida', '20:10']].map(
          ([tipo, utc]) => ({
            id: `${d}-${tipo}`, colaborador_id: 'ana', data: d, tipo, horario: `${d}T${utc}:00.000Z`,
            hora_formatada: '', metodo: 'qrcode', loja: 'Pirassununga', criado_em: '',
          })
        )
      ).concat(
        ['entrada', 'saida'].map((tipo, i) => ({
          id: `sab-${tipo}`, colaborador_id: 'ana', data: '2026-10-03', tipo,
          horario: `2026-10-03T${i ? '15' : '11'}:00:00.000Z`, hora_formatada: '', metodo: 'qrcode', loja: 'Pirassununga', criado_em: '',
        }))
      ),
      justificativas_ausencia: [],
      feriados: [],
      ajustes_jornada: [],
      configuracoes: [{ permissoes_ferramentas: null }],
    };
    return new Response(JSON.stringify(respostas[tabela!] ?? []), { status: 200 });
  };

  await import(`../../${DESTINO}`);
});

test('sem o segredo, a porta não abre', async () => {
  const r = await tratar(new Request('https://f', { method: 'POST' }));
  expect(r.status).toBe(401);
  expect(pedidos).toHaveLength(0);
});

test('simulando, diz o que gravaria e não grava nada', async () => {
  falharUmaVez = true;
  const r = await tratar(
    new Request('https://f/apurar-ponto?simular=1', { method: 'POST', headers: { 'x-apurar-segredo': 'segredo' } })
  );
  const corpo = await r.json();
  // O 401 passageiro da primeira leitura foi tentado de novo, e passou
  expect(falharUmaVez).toBe(false);
  expect(r.status).toBe(200);
  expect(corpo).toMatchObject({ simulacao: true, gravados: 0, faltas: 1 });
  // "Nada a gravar" só convence se houve o que ler: os números vêm na resposta
  expect(corpo.lidos).toEqual({ colaboradores: 1, batidas: 18, ausencias: 0, feriados: 0, apuracoes: 0 });
  // Quinta 01, sexta 02, sábado 03, segunda 05 e quarta 07 fecharam
  expect(corpo.diasFechados).toBe(5);
  expect(corpo.seriaGravado).toEqual(['Ana · 2026-10-06 · dia_incompleto 490min · pendente']);
  expect(pedidos.filter((p) => p.metodo === 'POST')).toHaveLength(0);
  pedidos.length = 0;
});

test('com o segredo, lê o banco paginando e grava a falta da terça', async () => {
  const r = await tratar(new Request('https://f', { method: 'POST', headers: { 'x-apurar-segredo': 'segredo' } }));
  const corpo = await r.json();
  expect(r.status).toBe(200);
  expect(corpo).toMatchObject({ ok: true, hoje: '2026-10-08', faltas: 1, gravados: 1 });

  // As leituras pedem a primeira página de mil, e as batidas param antes de hoje
  const leituras = pedidos.filter((p) => p.metodo === 'GET');
  expect(leituras.every((p) => p.range === '0-999')).toBe(true);
  expect(leituras.find((p) => p.url.includes('registros_ponto'))!.url).toContain('data=lt.2026-10-08');

  // Uma gravação, com a falta da terça — e nenhum dia batido virou pedido
  const gravacoes = pedidos.filter((p) => p.metodo === 'POST');
  expect(gravacoes).toHaveLength(1);
  const linhas = JSON.parse(gravacoes[0].corpo!);
  expect(linhas.map((l: any) => l.id)).toEqual(['inc-ana-2026-10-06']);
  expect(linhas[0]).toMatchObject({ tipo: 'dia_incompleto', minutos: 490, estado: 'pendente' });
});
