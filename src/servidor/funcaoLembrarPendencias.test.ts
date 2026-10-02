/**
 * O ARQUIVO QUE VAI PARA O SUPABASE (`lembrar-pendencias`), testado como
 * ele é: com um Deno de mentira e um banco de mentira. Precisa recusar
 * quem não tem o segredo, simular sem enviar, entregar pela `enviar-aviso`
 * com o segredo — e não cobrar holerite se a tabela de assinaturas faltar.
 */
process.env.TZ = 'UTC';

import { test, expect, setSystemTime, beforeAll, beforeEach } from 'bun:test';
import { readFileSync } from 'fs';
import { gerarFuncaoLembretes, DESTINO_LEMBRETES } from '../../scripts/gerar-funcao-apurar';

test('o arquivo colado no Supabase está em dia com o código', async () => {
  // Mudou uma regra e esqueceu de gerar? Rode: bun scripts/gerar-funcao-apurar.ts
  expect(readFileSync(DESTINO_LEMBRETES, 'utf8').replace(/\r\n/g, '\n')).toBe(await gerarFuncaoLembretes());
});

test('o endereço do projeto não entra no repositório', () => {
  // Como nos SQLs da apuração: o marcador fica aqui, o valor só na cópia entregue
  const simular = readFileSync('supabase/lembretes-1-simular.sql', 'utf8');
  const agendar = readFileSync('supabase/lembretes-3-agendar.sql', 'utf8');
  expect(simular).toContain("'URL_DO_PROJETO/functions/v1/lembrar-pendencias?simular=1'");
  expect(agendar).toContain("'URL_DO_PROJETO/functions/v1/lembrar-pendencias'");
  expect(simular + agendar).not.toMatch(/supabase\.co/);
  // 09:00 em Brasília, e não a hora da madrugada da apuração
  expect(agendar).toContain("'0 12 * * *'");
});

let tratar: (req: Request) => Promise<Response>;
let semTabelaDeAssinaturas = false;
let entregas: Array<{ cabecalhos: Record<string, string>; corpo: any }> = [];

const ANA = {
  id: 'ana', nome: 'Ana', login: 'ana', cargo: 'Balconista', setor: 'Balcão', loja: 'Pirassununga', nivel: 1,
  foto: null, presenca: 'disponivel', ativo: true, criado_em: '', turno: 'A', carga_horaria_diaria_minutos: null,
};
const BIA = { ...ANA, id: 'bia', nome: 'Bia', login: 'bia' };

beforeAll(async () => {
  // Sábado, 10/10/2026, 09:00 em Brasília
  setSystemTime(new Date('2026-10-10T12:00:00.000Z'));

  (globalThis as any).Deno = {
    env: {
      get: (n: string) =>
        ({
          SUPABASE_URL: 'https://banco',
          SUPABASE_SERVICE_ROLE_KEY: 'chave',
          SUPABASE_ANON_KEY: 'publica',
          APURAR_SEGREDO: 'segredo',
        })[n],
    },
    serve: (h: typeof tratar) => {
      tratar = h;
    },
  };

  (globalThis as any).fetch = async (url: string, init: RequestInit = {}) => {
    const cabecalhos = (init.headers || {}) as Record<string, string>;
    if (url.includes('/functions/v1/enviar-aviso')) {
      const corpo = JSON.parse(String(init.body));
      entregas.push({ cabecalhos, corpo });
      return new Response(JSON.stringify({ pedidos: corpo.entregaAgendada.length, entregues: corpo.entregaAgendada.length, recusados: 0 }));
    }
    const tabela = new URL(url).pathname.split('/').pop();
    if (tabela === 'recebimentos_holerite' && semTabelaDeAssinaturas) {
      return new Response(JSON.stringify({ code: 'PGRST205' }), { status: 404 });
    }
    const respostas: Record<string, unknown[]> = {
      colaboradores: [ANA, BIA],
      holerites: [
        { id: 'hol-ana', colaborador_id: 'ana', competencia: '2026-09', criado_em: '2026-10-05T12:00:00Z' },
        { id: 'hol-bia', colaborador_id: 'bia', competencia: '2026-09', criado_em: '2026-10-05T12:00:00Z' },
      ],
      recebimentos_holerite: [{ holerite_id: 'hol-bia' }],
      advertencias: [],
      avisos_rede: [
        {
          id: 'pub-1', titulo: 'Inventário no sábado', conteudo: '', prioridade: 'urgente', autor_id: 'dani',
          autor_nome: 'Dani', autor_cargo: 'RH', loja_destino: 'Todas', fixado_no_topo: false,
          criado_em: '2026-10-08T12:00:00Z', tipo: 'aviso', categoria: null, anexo_caminho: null,
          anexo_nome: null, exige_confirmacao: true, destinos: null,
        },
      ],
      avisos_leitura: [{ aviso_id: 'pub-1', colaborador_id: 'ana' }],
    };
    return new Response(JSON.stringify(respostas[tabela!] ?? []), { status: 200 });
  };

  await import(`../../${DESTINO_LEMBRETES}`);
});

beforeEach(() => {
  entregas = [];
  semTabelaDeAssinaturas = false;
});

const pedir = (caminho = '', segredo?: string) =>
  tratar(
    new Request(`https://f/lembrar-pendencias${caminho}`, {
      method: 'POST',
      headers: segredo ? { 'x-apurar-segredo': segredo } : {},
    })
  );

test('sem o segredo, a porta não abre', async () => {
  expect((await pedir()).status).toBe(401);
  expect((await pedir('', 'chute')).status).toBe(401);
  expect(entregas).toEqual([]);
});

test('simulando, diz quem seria lembrado de quê — e não envia', async () => {
  const r = await pedir('?simular=1', 'segredo');
  const corpo = await r.json();
  expect(corpo.simulacao).toBe(true);
  // A Ana não assinou o holerite; a Bia não confirmou a publicação (a Ana confirmou)
  expect(corpo.seriaEnviado.sort()).toEqual([
    'Ana · Holerite para assinar · Seu holerite de Setembro de 2026 ainda não foi assinado. Toque para assinar.',
    'Bia · Confirme a leitura · Inventário no sábado',
  ]);
  expect(entregas).toEqual([]);
});

test('de verdade, entrega pela enviar-aviso, com o segredo', async () => {
  const r = await pedir('', 'segredo');
  expect(await r.json()).toMatchObject({ ok: true, lembretes: 2, entregues: 2 });
  expect(entregas).toHaveLength(1);
  expect(entregas[0].cabecalhos['x-apurar-segredo']).toBe('segredo');
  expect(entregas[0].corpo.entregaAgendada.map((l: any) => l.colaboradorId).sort()).toEqual(['ana', 'bia']);
});

test('sem a tabela de assinaturas, nenhum holerite é cobrado', async () => {
  // Todo holerite pareceria não assinado: a rede inteira seria lembrada à toa
  semTabelaDeAssinaturas = true;
  const corpo = await (await pedir('?simular=1', 'segredo')).json();
  expect(corpo.semAssinaturas).toBe(true);
  expect(corpo.seriaEnviado).toEqual(['Bia · Confirme a leitura · Inventário no sábado']);
});
