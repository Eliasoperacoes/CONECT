/**
 * A MARCAÇÃO ORIGINAL — o registro legal do ponto (marcacao-original.sql).
 *
 * Etapa 1 da homologação (Portaria MTP 671/2021): a marcação não se altera,
 * não se apaga e não é recusada; o NSR não tem buracos; o RH corrige no
 * tratamento e a original fica. Provado num Postgres de verdade, local,
 * com o esquema.sql INTEIRO e o delta por cima (scripts/bancoLocal.ts).
 *
 * A batida usa o relógio do banco: em DOMINGO a jornada não recebe nada, e
 * a bateria da jornada dá lugar à prova do domingo.
 */
import { test, expect, beforeAll } from 'bun:test';
import { readFileSync } from 'fs';
import { montarBancoLocal, lerSql, type BancoLocal } from '../../scripts/bancoLocal';

let banco: BancoLocal;
let domingo = false;

beforeAll(async () => {
  banco = await montarBancoLocal();
  await banco.db.exec(lerSql('marcacao-original.sql'));
  // Rodar de novo não pode quebrar
  await banco.db.exec(lerSql('marcacao-original.sql'));
  domingo = (await banco.db.query<{ d: boolean }>(
    `select extract(dow from now() at time zone 'America/Sao_Paulo') = 0 as d`
  )).rows[0].d;
}, 120_000);

test('o esquema.sql inteiro roda num banco vazio, sem erro nenhum', () => {
  expect(banco.errosDoEsquema).toEqual([]);
});

test('o esquema.sql traz o MESMO texto do delta (uma regra, um lugar)', () => {
  const delta = readFileSync('supabase/marcacao-original.sql', 'utf8');
  const esquema = readFileSync('supabase/esquema.sql', 'utf8');
  const SEP = '-- ------------------------------------------------------------\n';
  const s1 = delta.lastIndexOf(SEP, delta.indexOf('-- 1. A TABELA DA MARCAÇÃO ORIGINAL'));
  const s6 = delta.lastIndexOf(SEP, delta.indexOf('-- 6. SÓ A BATIDA DO SERVIDOR ENTRA COMO QR'));
  const s7 = delta.lastIndexOf(SEP, delta.indexOf('-- 7. A BATIDA QUE NUNCA É RECUSADA'));
  const fim = delta.indexOf("notify pgrst, 'reload schema';");
  expect(esquema.includes(delta.slice(s1, s6))).toBe(true);
  expect(esquema.includes(delta.slice(s7, fim).trimEnd())).toBe(true);
  // E uma definição só de cada peça no esquema
  expect(esquema.split('create or replace function public.carimbar_batida()').length).toBe(2);
  expect(esquema.split('create policy ponto_batida').length).toBe(2);
});

test('DOMINGO: a marcação não é recusada — vai para o RH, com NSR', async () => {
  if (!domingo) return;
  const { db, como } = banco;
  await db.exec(`alter table auth.users disable trigger all;
    insert into auth.users (id) values ('00000000-0000-0000-0000-0000000000d0');
    insert into public.colaboradores (id, auth_user_id, nome, login, setor, loja, nivel, ativo)
      values ('dom', '00000000-0000-0000-0000-0000000000d0', 'Dom', 'dom', 'Balcão', 'Pirassununga', 1, true);
    insert into public.codigos_ponto_loja (loja, codigo) values ('Pirassununga', 'ABC123')
      on conflict (loja) do update set codigo = excluded.codigo;`);
  await como('00000000-0000-0000-0000-0000000000d0');
  const r = (await db.query<{ r: any }>(`select public.registrar_marcacao('ABC123', 'Pirassununga', 'entrada') as r`)).rows[0].r;
  await como(null);
  expect(r.fora_da_jornada).toBe('domingo');
  expect(r.registro).toBeNull();
  expect(Number(r.original.nsr)).toBeGreaterThan(0);
});

test('A MARCAÇÃO ORIGINAL: nasce com a batida, não se altera, não se apaga, e o RH corrige no tratamento', async () => {
  if (domingo) return;
  const { db, como } = banco;
  const falhas: string[] = [];
  const prova = (nome: string, ok: boolean, detalhe: unknown = '') => {
    if (!ok) falhas.push(`${nome} → ${JSON.stringify(detalhe)}`);
  };
  const secao = (_nome: string) => {};
  const erroDe = async (sql: string): Promise<string | null> => {
    try {
      await db.exec(sql);
      return null;
    } catch (e) {
      return (e as Error).message;
    }
  };
  const um = async (sql: string) => (await db.query(sql)).rows[0] as any;
  const varios = async (sql: string) => (await db.query(sql)).rows as any[];

    // O gatilho do primeiro login (cria ficha a partir do auth.users) não está em teste
    await db.exec(`alter table auth.users disable trigger all;`);

    // As pessoas: Ana (balcão, bate ponto), Rita (RH), Tiago (TI, admin), Zé (nunca bateu)
    await db.exec(`
    insert into auth.users (id) values
      ('00000000-0000-0000-0000-00000000000a'), ('00000000-0000-0000-0000-00000000000b'),
      ('00000000-0000-0000-0000-00000000000c');
    insert into public.colaboradores (id, auth_user_id, nome, login, setor, loja, nivel, cnpj, ativo) values
      ('ana', '00000000-0000-0000-0000-00000000000a', 'Ana', 'ana', 'Balcão', 'Pirassununga', 1, '11.222.333/0001-44', true),
      ('rita', '00000000-0000-0000-0000-00000000000b', 'Rita', 'rita', 'RH', 'Pirassununga', 2, '11222333000144', true),
      ('tiago', '00000000-0000-0000-0000-00000000000c', 'Tiago', 'tiago', 'TI', 'Pirassununga', 5, '11222333000144', true),
      ('ze', null, 'Zé', 'ze', 'Balcão', 'Pirassununga', 1, '', true);
    insert into public.codigos_ponto_loja (loja, codigo) values ('Pirassununga', 'ABC123')
      on conflict (loja) do update set codigo = excluded.codigo;
    `);


    const ANA = '00000000-0000-0000-0000-00000000000a';
    const RITA = '00000000-0000-0000-0000-00000000000b';
    const TIAGO = '00000000-0000-0000-0000-00000000000c';

    // ---------------------------------------------------------------
    secao('A batida de sempre (bater_ponto, a função de hoje)');
    await como(ANA);
    const b1 = await um(`select * from public.bater_ponto('ABC123', 'Pirassununga', 'entrada')`);
    await como(null);
    const o1 = await um(`select * from public.marcacoes_originais where registro_id = '${b1.id}'`);
    prova('a batida de hoje cria a original, com o mesmo NSR e código', !!o1 && o1.nsr === b1.nsr && o1.codigo_verificacao === b1.codigo_verificacao, { b1, o1 });
    prova('NSR começa em 1 (contador no maior já dado, 0)', Number(b1.nsr) === 1, b1.nsr);
    prova('CNPJ só com dígitos, igual ao carimbo de antes', o1?.cnpj_empregador === '11222333000144', o1?.cnpj_empregador);
    prova('o código é o SHA-256 de antes (mesma fórmula)', o1?.codigo_verificacao === (await um(`select public.codigo_da_batida(${o1?.nsr}, '11222333000144', '${o1?.data instanceof Date ? o1.data.toISOString().slice(0, 10) : o1?.data}', '${new Date(o1?.registrado_em).toISOString()}'::timestamptz, 'ana') as c`)).c);

    secao('A batida repetida não gasta número');
    await como(ANA);
    const repetida = await erroDe(`select * from public.bater_ponto('ABC123', 'Pirassununga', 'entrada')`);
    await como(null);
    prova('bater_ponto repetida é recusada como antes (o app trata)', !!repetida && /duplicate|unique/i.test(repetida), repetida);
    prova('e o contador continua em 1: sem buraco', Number((await um(`select ultimo from public.contador_nsr`)).ultimo) === 1);

    secao('A batida que nunca é recusada (registrar_marcacao)');
    await como(ANA);
    const v2rep = await um(`select public.registrar_marcacao('ABC123', 'Pirassununga', 'entrada') as r`);
    const v2alm = await um(`select public.registrar_marcacao('ABC123', 'Pirassununga', 'saida_almoco') as r`);
    const v2fim = await um(`select public.registrar_marcacao('ABC123', 'Pirassununga', null) as r`);
    const v2ordem = await um(`select public.registrar_marcacao('ABC123', 'Pirassununga', 'entrada') as r`);
    const v2codigo = await erroDe(`select public.registrar_marcacao('ERRADO', 'Pirassununga', 'saida') as r`);
    await como(null);
    prova('repetida: registra a original, fora da jornada, sem linha no tratamento',
      v2rep.r.fora_da_jornada === 'repetida' && v2rep.r.registro === null && Number(v2rep.r.original.nsr) === 2, v2rep.r);
    prova('a próxima da jornada entra no tratamento, com NSR seguido',
      v2alm.r.fora_da_jornada === null && v2alm.r.registro?.tipo === 'saida_almoco' && Number(v2alm.r.original.nsr) === 3 && Number(v2alm.r.registro.nsr) === 3, v2alm.r);
    prova('sem marcação esperada (quinta batida): registra como jornada_completa',
      v2fim.r.fora_da_jornada === 'jornada_completa' && Number(v2fim.r.original.nsr) === 4, v2fim.r);
    prova('o comprovante da fora da jornada tem NSR e código', !!v2fim.r.original.codigo_verificacao && !!v2fim.r.original.registrado_em);
    prova('código da loja errado continua recusado, sem gastar número',
      !!v2codigo && v2codigo.includes('Código não reconhecido') && Number((await um(`select ultimo from public.contador_nsr`)).ultimo) === 5, { v2codigo });
    prova('repetir a entrada depois do almoço: fora da jornada (repetida)', v2ordem.r.fora_da_jornada === 'repetida');
    prova('o tratamento tem só as duas da jornada', (await varios(`select tipo from public.registros_ponto where colaborador_id = 'ana' order by tipo`)).map((l) => l.tipo).join() === 'entrada,saida_almoco');

    secao('A original não se altera nem se apaga — nem pela chave de serviço');
    const nsrAntes = Number((await um(`select count(*) n from public.marcacoes_originais`)).n);
    prova('apagar a original: recusado', !!(await erroDe(`delete from public.marcacoes_originais where nsr = 1`))?.includes('não se apaga'));
    prova('alterar a hora: recusado', !!(await erroDe(`update public.marcacoes_originais set registrado_em = registrado_em - interval '1 hour' where nsr = 1`))?.includes('não se altera'));
    prova('alterar o NSR: recusado', !!(await erroDe(`update public.marcacoes_originais set nsr = 99 where nsr = 1`))?.includes('não se altera'));
    prova('truncate: recusado', !!(await erroDe(`truncate public.marcacoes_originais`))?.includes('não se apaga'));
    prova('nada mudou', Number((await um(`select count(*) n from public.marcacoes_originais`)).n) === nsrAntes);
    await como(ANA);
    const anaApaga = await db.query(`delete from public.marcacoes_originais where colaborador_id = 'ana' returning nsr`).then((r) => r.rows.length).catch((e) => (e as Error).message);
    const anaGrava = await erroDe(`insert into public.marcacoes_originais (nsr, colaborador_id, registrado_em, data, loja, metodo, codigo_verificacao) values (500, 'ana', now(), current_date, 'Pirassununga', 'qrcode', 'x')`);
    const anaContador = await erroDe(`update public.contador_nsr set ultimo = 0`);
    const anaLe = (await varios(`select nsr from public.marcacoes_originais`)).length;
    await como(null);
    prova('a pessoa não apaga a própria original (0 linhas)', anaApaga === 0, anaApaga);
    prova('a pessoa não grava original direto', !!anaGrava, anaGrava);
    prova('a pessoa não mexe no contador', Number((await um(`select ultimo from public.contador_nsr`)).ultimo) === 5, anaContador);
    prova('a pessoa lê as próprias originais (as 5 dela)', anaLe === 5, anaLe);

    secao('O RH corrige no tratamento; a original fica');
    await como(RITA);
    const ritaQr = await erroDe(`insert into public.registros_ponto (id, colaborador_id, data, tipo, horario, hora_formatada, metodo, loja) values ('falsa', 'ana', current_date - 1, 'entrada', now() - interval '1 day', '07:30', 'qrcode', 'Pirassununga')`);
    const ritaAjuste = await erroDe(`insert into public.registros_ponto (id, colaborador_id, data, tipo, horario, hora_formatada, metodo, loja, justificativa) values ('aj1', 'ana', current_date - 1, 'entrada', now() - interval '1 day', '07:30', 'ajuste_rh', 'Pirassununga', 'esqueceu')`);
    const ritaMudaQr = await erroDe(`update public.registros_ponto set horario = horario - interval '10 minutes' where id = '${b1.id}'`);
    const ritaCorrige = await erroDe(`update public.registros_ponto set horario = horario - interval '10 minutes', metodo = 'ajuste_rh', justificativa = 'relógio' where id = '${b1.id}'`);
    const ritaViraQr = await erroDe(`update public.registros_ponto set metodo = 'qrcode' where id = 'aj1'`);
    const ritaRemove = await db.query(`delete from public.registros_ponto where id = '${v2alm.r.registro.id}' returning id`).then((r) => r.rows.length).catch((e) => (e as Error).message);
    await como(null);
    prova('RH não grava marcação com método de batida (QR)', !!ritaQr, ritaQr);
    prova('RH lança correção normalmente', ritaAjuste === null, ritaAjuste);
    const aj1 = await um(`select nsr, codigo_verificacao, registrado_em from public.registros_ponto where id = 'aj1'`);
    prova('correção não ganha NSR nem código, e não cria original', aj1.nsr === null && aj1.codigo_verificacao === null && !(await um(`select 1 x from public.marcacoes_originais where registro_id = 'aj1'`)), aj1);
    prova('correção registra a hora da correção, não a informada', Math.abs(new Date(aj1.registrado_em).getTime() - Date.now()) < 120_000, aj1.registrado_em);
    prova('RH não muda a hora de uma batida mantendo-a como QR', !!ritaMudaQr, ritaMudaQr);
    prova('RH corrige a batida como ajuste (como hoje), com o NSR mantido', ritaCorrige === null && Number((await um(`select nsr from public.registros_ponto where id = '${b1.id}'`)).nsr) === 1, ritaCorrige);
    prova('a original da batida corrigida continua com a hora de verdade',
      new Date((await um(`select registrado_em from public.marcacoes_originais where nsr = 1`)).registrado_em).getTime() === new Date(b1.registrado_em).getTime());
    prova('correção não vira batida de QR', !!ritaViraQr, ritaViraQr);
    prova('RH remove do tratamento (como hoje)', ritaRemove === 1, ritaRemove);
    prova('e a original da removida continua lá', !!(await um(`select 1 x from public.marcacoes_originais where nsr = 3`)));
    prova('nenhuma correção gastou NSR', Number((await um(`select ultimo from public.contador_nsr`)).ultimo) === 5);

    secao('Excluir colaborador');
    await como(TIAGO);
    const excluiAna = await erroDe(`delete from public.colaboradores where id = 'ana'`);
    const excluiZe = await db.query(`delete from public.colaboradores where id = 'ze' returning id`).then((r) => r.rows.length).catch((e) => (e as Error).message);
    await como(null);
    prova('quem já bateu ponto não é excluído (restrict)', !!excluiAna && /foreign key|violates/i.test(excluiAna), excluiAna);
    prova('as batidas dela continuam (nada em cascata)', Number((await um(`select count(*) n from public.registros_ponto where colaborador_id = 'ana'`)).n) >= 2);
    prova('quem nunca bateu ponto ainda é excluído', excluiZe === 1, excluiZe);

    secao('A fusão de cadastro repetido leva as originais');
    const esquema = await Bun.file('C:/Users/malac/antigravity/CONECTA/supabase/esquema.sql').text();
    const iniBloco = esquema.indexOf('do $$', esquema.indexOf('-- CONSERTO DO CADASTRO REPETIDO'));
    const blocoFusao = esquema.slice(iniBloco, esquema.indexOf('end $$;', iniBloco) + 'end $$;'.length);
    // O estado de antes do índice de login único: só assim existe fantasma com o mesmo login
    await db.exec(`drop index if exists public.colaboradores_login_unico;`);
    await db.exec(`
    insert into auth.users (id) values ('00000000-0000-0000-0000-0000000000dd');
    insert into public.colaboradores (id, auth_user_id, nome, login, setor, loja, nivel, ativo)
      values ('colab-000000000000000000000000000000dd', '00000000-0000-0000-0000-0000000000dd', 'Bia', 'bia', 'Balcão', 'Pirassununga', 1, true),
             ('bia-planilha', null, 'Bia', 'bia ', 'Balcão', 'Pirassununga', 1, true);
    `);
    await como('00000000-0000-0000-0000-0000000000dd');
    await um(`select * from public.bater_ponto('ABC123', 'Pirassununga', 'entrada')`);
    await como(null);
    const fusao = await erroDe(blocoFusao);
    prova('a fusão roda (não trava no restrict)', fusao === null, fusao);
    prova('a original foi para a ficha boa, com o mesmo NSR',
      (await um(`select colaborador_id from public.marcacoes_originais where nsr = 6`))?.colaborador_id === 'bia-planilha',
      await varios(`select nsr, colaborador_id from public.marcacoes_originais order by nsr`));
    prova('a fantasma saiu', !(await um(`select 1 x from public.colaboradores where id = 'colab-000000000000000000000000000000dd'`)));

  expect(falhas).toEqual([]);
}, 120_000);
