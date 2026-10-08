/**
 * O AFD (arquivo-fonte-de-dados.sql), conferido contra o leiaute vigente
 * (gov.br, 31/07/2026, versão "004"): posições, tamanhos, CRC-16/KERMIT,
 * ordem por NSR, trailer e a linha da assinatura. O CRC e o hash são
 * refeitos AQUI, por fora do banco.
 */
import { test, expect, beforeAll } from 'bun:test';
import { createHash } from 'node:crypto';
import { montarBancoLocal, lerSql, type BancoLocal } from '../../scripts/bancoLocal';

let banco: BancoLocal;
let linhas: string[] = [];

const ANA = '00000000-0000-0000-0000-0000000000e1';
const RITA = '00000000-0000-0000-0000-0000000000e2';
const CNPJ = '05041606000199';

/** CRC-16/KERMIT, escrito a partir da definição — não do código do banco. */
const kermit = (texto: string): string => {
  let crc = 0;
  for (const b of Buffer.from(texto, 'latin1')) {
    crc ^= b;
    for (let i = 0; i < 8; i++) crc = crc & 1 ? (crc >>> 1) ^ 0x8408 : crc >>> 1;
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
};
/** Posições do leiaute (1-based, inclusivas). */
const pos = (l: string, de: number, ate: number) => l.slice(de - 1, ate);

beforeAll(async () => {
  banco = await montarBancoLocal();
  await banco.db.exec(lerSql('identificacao-do-rep.sql'));
  await banco.db.exec(lerSql('arquivo-fonte-de-dados.sql'));
  await banco.db.exec(`
    alter table auth.users disable trigger all;
    insert into auth.users (id) values ('${ANA}'), ('${RITA}');
    insert into public.colaboradores (id, auth_user_id, nome, login, setor, loja, nivel, cnpj, ativo) values
      ('ana', '${ANA}', 'Ana Conceição', 'ana', 'Balcão', 'Pirassununga', 1, '05.041.606/0001-99', true),
      ('rita', '${RITA}', 'Rita', 'rita', 'RH', 'Pirassununga', 2, '${CNPJ}', true);
    insert into public.codigos_ponto_loja (loja, codigo) values ('Pirassununga', 'ABC123')
      on conflict (loja) do update set codigo = excluded.codigo;
    insert into public.identificacao_rep (desenvolvedor_tipo, desenvolvedor_documento, desenvolvedor_nome)
      values ('2', '12345678909', 'Dev Teste');
    insert into public.estabelecimentos (cnpj, razao_social, local)
      values ('${CNPJ}', 'MALACHIAS AUTO PECAS LTDA', 'Av. Teste, 1 - Porto Ferreira/SP');
    insert into public.cpf_colaborador (colaborador_id, cpf) values ('ana', '12345678909');
  `);
  // Duas marcações da Ana (fora da jornada: funciona em qualquer dia)
  for (let i = 0; i < 2; i++) {
    await banco.como(ANA);
    await banco.db.query(`select public.registrar_marcacao('ABC123', 'Pirassununga', null, '01')`);
  }
  await banco.como(RITA);
  const hoje = (await banco.db.query<{ d: string }>(`select to_char((now() at time zone 'America/Sao_Paulo')::date, 'YYYY-MM-DD') as d`)).rows[0].d;
  const r = await banco.db.query<{ ordem: number; linha: string }>(`select * from public.gerar_afd('${CNPJ}', '2026-01-01', '${hoje}')`);
  await banco.como(null);
  linhas = r.rows.sort((a, b) => a.ordem - b.ordem).map((l) => l.linha);
}, 120_000);

test('o CRC-16/KERMIT do exemplo oficial (pergunta 35): "123456789" → "2189"', async () => {
  expect(kermit('123456789')).toBe('2189');
  expect((await banco.db.query<{ c: string }>(`select public.afd_crc16('123456789') as c`)).rows[0].c).toBe('2189');
});

test('a ordem: cabeçalho, os registros pelo NSR, trailer e assinatura — e o tamanho de cada tipo', () => {
  const tipos = linhas.map((l, i) => (i === 0 ? '1' : l.startsWith('999999999') ? '9' : l.startsWith('ASSINATURA') ? 'A' : l[9]));
  // O estabelecimento (2), a Ana entrando no REP com o CPF (5) e as duas marcações (7)
  expect(tipos).toEqual(['1', '2', '5', '7', '7', '9', 'A']);
  const tamanho = { '1': 302, '2': 331, '5': 118, '7': 137, '9': 64, A: 100 } as Record<string, number>;
  linhas.forEach((l, i) => expect({ tipo: tipos[i], tamanho: l.length }).toEqual({ tipo: tipos[i], tamanho: tamanho[tipos[i]] }));
  const nsrs = linhas.slice(1, -2).map((l) => Number(l.slice(0, 9)));
  expect(nsrs).toEqual([...nsrs].sort((a, b) => a - b));
});

test('o CABEÇALHO campo a campo (leiaute "004")', () => {
  const c = linhas[0];
  expect(pos(c, 1, 9)).toBe('000000000');
  expect(pos(c, 10, 10)).toBe('1');
  expect(pos(c, 11, 11)).toBe('1'); // CNPJ
  expect(pos(c, 12, 25)).toBe(CNPJ);
  expect(pos(c, 26, 39)).toBe(' '.repeat(14)); // sem CNO/CAEPF
  expect(pos(c, 40, 189).trimEnd()).toBe('MALACHIAS AUTO PECAS LTDA');
  expect(pos(c, 190, 206)).toBe(' '.repeat(17)); // INPI ainda não registrado
  expect(pos(c, 207, 216)).toBe('2026-01-01');
  expect(pos(c, 217, 226)).toMatch(/^\d{4}-\d{2}-\d{2}/);
  expect(pos(c, 227, 250)).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:00-0300/);
  expect(pos(c, 251, 253)).toBe('004');
  expect(pos(c, 254, 254)).toBe('2'); // desenvolvedor por CPF
  expect(pos(c, 255, 268)).toBe('12345678909   ');
  expect(pos(c, 269, 298)).toBe(' '.repeat(30)); // modelo: só REP-C
  expect(pos(c, 299, 302)).toBe(kermit(c.slice(0, 298)));
});

test('os registros 2 e 5 com CRC certo; o 5 traz CPF, nome e a operação', () => {
  const [r2, r5] = [linhas[1], linhas[2]];
  expect(pos(r2, 328, 331)).toBe(kermit(r2.slice(0, 327)));
  expect(pos(r2, 50, 63)).toBe(CNPJ);
  expect(pos(r2, 78, 227).trimEnd()).toBe('MALACHIAS AUTO PECAS LTDA');
  expect(pos(r5, 115, 118)).toBe(kermit(r5.slice(0, 114)));
  expect(pos(r5, 35, 35)).toBe('I');
  expect(pos(r5, 36, 47)).toBe('012345678909');
  // Acento em ISO 8859-1, um byte por letra: o nome cabe nas 52 posições
  expect(pos(r5, 48, 99).trimEnd()).toBe('Ana Conceição');
});

test('as MARCAÇÕES: a linha do arquivo é a do hash, e o hash encadeia', () => {
  const [m1, m2] = [linhas[3], linhas[4]];
  const sha = (t: string) => createHash('sha256').update(t).digest('hex');
  expect(pos(m1, 71, 72)).toBe('01'); // coletor: aplicativo
  expect(pos(m1, 73, 73)).toBe('0'); // on-line
  expect(pos(m1, 35, 46)).toBe('012345678909');
  expect(pos(m1, 74, 137)).toBe(sha(m1.slice(0, 73)));
  expect(pos(m2, 74, 137)).toBe(sha(m2.slice(0, 73) + pos(m1, 74, 137)));
});

test('o TRAILER conta cada tipo; e a ASSINATURA é a do leiaute, com o .p7s à parte', () => {
  const t = linhas[linhas.length - 2];
  expect(t).toBe(`999999999${'000000001'}${'0'.repeat(9)}${'0'.repeat(9)}${'000000001'}${'0'.repeat(9)}${'000000002'}9`);
  expect(linhas[linhas.length - 1]).toBe('ASSINATURA_DIGITAL_EM_ARQUIVO_P7S'.padEnd(100, ' '));
});

test('SÓ QUEM CUIDA DE PESSOAS gera; e só de estabelecimento cadastrado', async () => {
  const erro = async (sql: string) => {
    try {
      await banco.db.query(sql);
      return null;
    } catch (e) {
      return (e as Error).message;
    }
  };
  await banco.como(ANA);
  const daAna = await erro(`select * from public.gerar_afd('${CNPJ}', '2026-01-01', '2026-12-31')`);
  await banco.como(RITA);
  const outro = await erro(`select * from public.gerar_afd('28251342000101', '2026-01-01', '2026-12-31')`);
  await banco.como(null);
  expect(daAna).toContain('Só quem cuida de pessoas');
  expect(outro).toContain('não é um estabelecimento cadastrado');
});

test('o esquema.sql traz o MESMO texto do delta do AFD', async () => {
  const { readFileSync } = await import('node:fs');
  const d = readFileSync('supabase/arquivo-fonte-de-dados.sql', 'utf8');
  const e = readFileSync('supabase/esquema.sql', 'utf8');
  const trecho = d.slice(d.indexOf('-- O texto só com o que o ISO 8859-1 representa'), d.indexOf("notify pgrst, 'reload schema';")).trimEnd();
  expect(e.includes(trecho)).toBe(true);
  expect(e.split('create or replace function public.gerar_afd(').length - 1).toBe(1);
});
