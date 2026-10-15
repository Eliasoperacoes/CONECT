/**
 * "FOI INTERVALO?" NO BANCO (volta-do-intervalo.sql, 15/10/2026).
 *
 * A estagiária não tem intervalo: bate entrada e saída. No dia de hora
 * extra ela almoça e volta — a saída do almoço já entrou como SAÍDA, e a
 * volta e a saída de verdade caem fora da jornada. O líder confirma num
 * toque, e o dia se arruma EM NOME DELE. Batida duplicada não vira almoço.
 */
import { test, expect, beforeAll } from 'bun:test';
import { montarBancoLocal, lerSql, type BancoLocal } from '../../scripts/bancoLocal';

let banco: BancoLocal;
let domingo = false;

const LIDER = '00000000-0000-0000-0000-0000000000e1';
const LYVIA = '00000000-0000-0000-0000-0000000000e2';
const OUTRA = '00000000-0000-0000-0000-0000000000e3';
const YAN = '00000000-0000-0000-0000-0000000000e4';

beforeAll(async () => {
  banco = await montarBancoLocal();
  await banco.db.exec(lerSql('volta-do-intervalo.sql'));
  await banco.db.exec(`
    alter table auth.users disable trigger all;
    insert into auth.users (id) values ('${LIDER}'), ('${LYVIA}'), ('${OUTRA}'), ('${YAN}');
    insert into public.colaboradores (id, auth_user_id, nome, login, setor, loja, nivel, cnpj, ativo, responsavel_id, turno) values
      ('lider', '${LIDER}', 'Paulo', 'paulo', 'Balcão', 'Pirassununga', 2, '11222333000144', true, null, 'A'),
      ('lyvia', '${LYVIA}', 'Lyvia', 'lyvia', 'Estágio', 'Pirassununga', 1, '11222333000144', true, 'lider', 'E2'),
      ('outra', '${OUTRA}', 'Bia', 'bia', 'Balcão', 'Pirassununga', 1, '11222333000144', true, 'lider', 'A'),
      ('yan', '${YAN}', 'Yan', 'yan', 'Estágio', 'Pirassununga', 1, '11222333000144', true, 'lider', 'E2');
    insert into public.codigos_ponto_loja (loja, codigo) values ('Pirassununga', 'ABC123')
      on conflict (loja) do update set codigo = excluded.codigo;
  `);
  domingo = (await banco.db.query<{ d: boolean }>(
    `select extract(dow from now() at time zone 'America/Sao_Paulo') = 0 as d`
  )).rows[0].d;
}, 120_000);

const bater = async (uid: string, tipo: string | null) => {
  await banco.como(uid);
  try {
    return (await banco.db.query<{ r: any }>(
      `select public.registrar_marcacao('ABC123', 'Pirassununga', ${tipo ? `'${tipo}'` : 'null'}, '02') as r`
    )).rows[0].r;
  } finally {
    await banco.como(null);
  }
};

/** Empurra para trás no tempo as marcações da pessoa feitas há menos de 1 minuto (só o dono do banco) */
const envelhecerAsUltimas = async (colaborador: string, minutos: number) => {
  await banco.db.exec(`
    alter table public.marcacoes_originais disable trigger user;
    alter table public.registros_ponto disable trigger user;
    update public.registros_ponto set horario = horario - interval '${minutos} minutes'
     where colaborador_id = '${colaborador}' and horario > now() - interval '1 minute';
    update public.marcacoes_originais set registrado_em = registrado_em - interval '${minutos} minutes'
     where colaborador_id = '${colaborador}' and registrado_em > now() - interval '1 minute';
    alter table public.marcacoes_originais enable trigger user;
    alter table public.registros_ponto enable trigger user;
  `);
};

const tratar = async (uid: string, colaborador: string) => {
  await banco.como(uid);
  try {
    const r = await banco.db.query<{ n: number }>(
      `select public.tratar_como_intervalo('${colaborador}', (now() at time zone 'America/Sao_Paulo')::date) as n`
    );
    return { incluidas: r.rows[0].n };
  } catch (e: any) {
    return { erro: e.message as string };
  } finally {
    await banco.como(null);
  }
};

const diaDe = async (colaborador: string) =>
  (await banco.db.query<{ tipo: string; metodo: string }>(
    `select tipo, metodo from public.registros_ponto where colaborador_id = '${colaborador}' order by horario`
  )).rows;

test('a Lyvia sai às 12:30, volta uma hora depois e sai: o líder confirma, e o dia tem as quatro', async () => {
  if (domingo) return;
  await bater(LYVIA, 'entrada');
  await envelhecerAsUltimas('lyvia', 300);
  await bater(LYVIA, 'saida');
  await envelhecerAsUltimas('lyvia', 120);
  // A volta: o aplicativo não espera mais nada dela, e a batida cai fora da jornada
  expect((await bater(LYVIA, null)).fora_da_jornada).toBe('jornada_completa');
  await envelhecerAsUltimas('lyvia', 60);
  expect((await bater(LYVIA, null)).fora_da_jornada).toBe('jornada_completa');

  // Quem não responde por ela não decide
  expect((await tratar(OUTRA, 'lyvia')).erro).toContain('Você não responde pela jornada desta pessoa.');

  expect(await tratar(LIDER, 'lyvia')).toEqual({ incluidas: 2 });
  expect(await diaDe('lyvia')).toEqual([
    { tipo: 'entrada', metodo: 'qrcode' },
    // A saída virou almoço como CORREÇÃO do líder, não por baixo
    { tipo: 'saida_almoco', metodo: 'ajuste_lider' },
    { tipo: 'retorno_almoco', metodo: 'ajuste_lider' },
    { tipo: 'saida', metodo: 'ajuste_lider' },
  ]);

  // As originais não mudam: quatro, como foram batidas
  const originais = (await banco.db.query<{ n: number }>(
    `select count(*)::int as n from public.marcacoes_originais where colaborador_id = 'lyvia'`
  )).rows[0].n;
  expect(originais).toBe(4);

  // E não se trata duas vezes
  expect((await tratar(LIDER, 'lyvia')).erro).toContain('Este dia já tem intervalo.');
});

test('O CASO DO YAN: bater a saída duas vezes não vira almoço', async () => {
  if (domingo) return;
  await bater(YAN, 'entrada');
  await envelhecerAsUltimas('yan', 300);
  await bater(YAN, 'saida');
  await envelhecerAsUltimas('yan', 5);
  // Bateu de novo 5 minutos depois, achando que não tinha registrado
  await bater(YAN, null);
  expect((await tratar(LIDER, 'yan')).erro).toContain('Não há volta 15 minutos ou mais depois da saída');
  expect((await diaDe('yan')).map((r) => r.tipo)).toEqual(['entrada', 'saida']);
});
