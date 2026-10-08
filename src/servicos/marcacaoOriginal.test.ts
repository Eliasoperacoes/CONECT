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
  // O esquema já traz o registrador por estabelecimento (etapa 2a); o
  // delta dele, rodado de novo por cima, não pode quebrar nada
  await banco.db.exec(lerSql('registrador-por-estabelecimento.sql'));
  await banco.db.exec(lerSql('registrador-por-estabelecimento.sql'));
  domingo = (await banco.db.query<{ d: boolean }>(
    `select extract(dow from now() at time zone 'America/Sao_Paulo') = 0 as d`
  )).rows[0].d;
}, 120_000);

test('o esquema.sql inteiro roda num banco vazio, sem erro nenhum', () => {
  expect(banco.errosDoEsquema).toEqual([]);
});

test('o esquema.sql traz o MESMO texto dos deltas (uma regra, um lugar)', () => {
  const esquema = readFileSync('supabase/esquema.sql', 'utf8');
  const SEP = '-- ------------------------------------------------------------\n';
  // Da etapa 1 continuam valendo: a tabela da original, a trava e a regra de quem grava
  const etapa1 = readFileSync('supabase/marcacao-original.sql', 'utf8');
  const secao = (n: string, proxima: string) =>
    etapa1.slice(etapa1.lastIndexOf(SEP, etapa1.indexOf(n)), etapa1.lastIndexOf(SEP, etapa1.indexOf(proxima)));
  expect(esquema.includes(secao('-- 1. A TABELA DA MARCAÇÃO ORIGINAL', '-- 2. O CONTADOR DO NSR'))).toBe(true);
  expect(esquema.includes(secao('-- 3. A TRAVA: original não se altera', '-- 4. UMA MARCAÇÃO ORIGINAL NOVA'))).toBe(true);
  // A regra de quem grava foi atualizada no lugar dela no esquema: confere-se o conteúdo
  expect(esquema).toContain("public.cuido_de_pessoas()\n      and metodo in ('ajuste_rh', 'ajuste_lider', 'preenchimento_turno')");
  // O resto é o do registrador por estabelecimento (etapa 2a)
  const etapa2 = readFileSync('supabase/registrador-por-estabelecimento.sql', 'utf8');
  const ini = etapa2.lastIndexOf(SEP, etapa2.indexOf('-- 1. O FORMATO DO AFD'));
  expect(esquema.includes(etapa2.slice(ini, etapa2.indexOf("notify pgrst, 'reload schema';")).trimEnd())).toBe(true);
  // E uma definição só de cada peça no esquema
  for (const peca of [
    'create or replace function public.carimbar_batida()',
    'create or replace function public.nova_marcacao_original(',
    'create or replace function public.registrar_marcacao(',
    'create policy ponto_batida',
  ]) {
    expect({ peca, vezes: esquema.split(peca).length - 1 }).toEqual({ peca, vezes: 1 });
  }
  expect(esquema).not.toContain('create table if not exists public.contador_nsr (');
});

test('O SQL ANTIGO, rodado depois do registrador novo, PARA antes de mudar qualquer coisa', async () => {
  // Rodado de novo, ele criaria a segunda versão das funções, e a batida pararia
  for (const antigo of ['marcacao-original.sql', 'tratamento-da-marcacao.sql', 'cpf-e-comprovante.sql', 'ponto-pelo-servidor.sql']) {
    let erro = '';
    try {
      await banco.db.exec(lerSql(antigo));
    } catch (e) {
      erro = (e as Error).message;
    }
    expect({ antigo, erro }).toEqual({ antigo, erro: `${antigo} foi substituído por registrador-por-estabelecimento.sql. Não rode este arquivo de novo.` });
  }
  // E a batida continua com UMA função
  const funcoes = await banco.db.query<{ n: number }>(`select count(*)::int n from pg_proc where proname = 'registrar_marcacao'`);
  expect(funcoes.rows[0].n).toBe(1);
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
    /*
      O CÓDIGO É O HASH DO AFD (etapa 2a), conferido por fora do banco:
      SHA-256 das posições 001 a 073 do registro tipo "7", na primeira
      marcação do CNPJ sem hash anterior. A Ana não tem CPF (doze zeros) e
      bateu pela `bater_ponto`, que não diz o coletor ("05"). Brasília é
      -0300 (sem horário de verão desde 2019).
    */
    const { createHash } = await import('node:crypto');
    const dh = (iso: string) => `${new Date(new Date(iso).getTime() - 3 * 3600_000).toISOString().slice(0, 16)}:00-0300`;
    const linha = `${String(o1?.nsr).padStart(9, '0')}7${dh(o1?.registrado_em)}000000000000${dh(o1?.registrado_em)}050`;
    prova('o código é o hash do AFD: posições 001 a 073 do tipo "7"', linha.length === 73 && o1?.codigo_verificacao === createHash('sha256').update(linha).digest('hex'), { linha, codigo: o1?.codigo_verificacao });
    prova('a original guarda o coletor e o CPF', o1?.coletor === '05' && o1?.cpf === '' && o1?.offline === false, o1);

    secao('A batida repetida não gasta número');
    await como(ANA);
    const repetida = await erroDe(`select * from public.bater_ponto('ABC123', 'Pirassununga', 'entrada')`);
    await como(null);
    prova('bater_ponto repetida é recusada como antes (o app trata)', !!repetida && /duplicate|unique/i.test(repetida), repetida);
    prova('e o contador continua em 1: sem buraco', Number((await um(`select ultimo from public.contador_nsr_estabelecimento where cnpj = '11222333000144'`)).ultimo) === 1);

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
      !!v2codigo && v2codigo.includes('Código não reconhecido') && Number((await um(`select ultimo from public.contador_nsr_estabelecimento where cnpj = '11222333000144'`)).ultimo) === 5, { v2codigo });
    prova('repetir a entrada depois do almoço: fora da jornada (repetida)', v2ordem.r.fora_da_jornada === 'repetida');
    prova('o tratamento tem só as duas da jornada', (await varios(`select tipo from public.registros_ponto where colaborador_id = 'ana' order by tipo`)).map((l) => l.tipo).join() === 'entrada,saida_almoco');

    secao('A original não se altera nem se apaga — nem pela chave de serviço');
    const nsrAntes = Number((await um(`select count(*) n from public.marcacoes_originais`)).n);
    prova('apagar a original: recusado', !!(await erroDe(`delete from public.marcacoes_originais where nsr = 1`))?.includes('não se apaga'));
    prova('alterar a hora: recusado', !!(await erroDe(`update public.marcacoes_originais set registrado_em = registrado_em - interval '1 hour' where nsr = 1`))?.includes('não se altera'));
    prova('alterar o NSR: recusado', !!(await erroDe(`update public.marcacoes_originais set nsr = 99 where nsr = 1`))?.includes('não se altera'));
    /*
      Recusado por uma das duas travas: a nossa ("não se apaga") ou, desde
      que a decisão do tratamento aponta para a original
      (tratamento-da-marcacao.sql), a chave estrangeira, que o Postgres
      confere antes. A prova seguinte confere que nada sumiu.
    */
    const truncar = await erroDe(`truncate public.marcacoes_originais`);
    prova('truncate: recusado', !!truncar && /não se apaga|foreign key/i.test(truncar), truncar);
    prova('nada mudou', Number((await um(`select count(*) n from public.marcacoes_originais`)).n) === nsrAntes);
    await como(ANA);
    const anaApaga = await db.query(`delete from public.marcacoes_originais where colaborador_id = 'ana' returning nsr`).then((r) => r.rows.length).catch((e) => (e as Error).message);
    const anaGrava = await erroDe(`insert into public.marcacoes_originais (nsr, colaborador_id, registrado_em, data, loja, metodo, codigo_verificacao) values (500, 'ana', now(), current_date, 'Pirassununga', 'qrcode', 'x')`);
    const anaContador = await erroDe(`update public.contador_nsr_estabelecimento set ultimo = 0`);
    const anaLe = (await varios(`select nsr from public.marcacoes_originais`)).length;
    await como(null);
    prova('a pessoa não apaga a própria original (0 linhas)', anaApaga === 0, anaApaga);
    prova('a pessoa não grava original direto', !!anaGrava, anaGrava);
    prova('a pessoa não mexe no contador', Number((await um(`select ultimo from public.contador_nsr_estabelecimento where cnpj = '11222333000144'`)).ultimo) === 5, anaContador);
    prova('a pessoa lê as próprias originais (as 5 dela)', anaLe === 5, anaLe);

    secao('O RH corrige no tratamento; a original fica');
    await como(RITA);
    const ritaQr = await erroDe(`insert into public.registros_ponto (id, colaborador_id, data, tipo, horario, hora_formatada, metodo, loja) values ('falsa', 'ana', '2026-01-05', 'entrada', '2026-01-05T10:30:00Z', '07:30', 'qrcode', 'Pirassununga')`);
    const ritaAjuste = await erroDe(`insert into public.registros_ponto (id, colaborador_id, data, tipo, horario, hora_formatada, metodo, loja, justificativa) values ('aj1', 'ana', '2026-01-05', 'entrada', '2026-01-05T10:30:00Z', '07:30', 'ajuste_rh', 'Pirassununga', 'esqueceu')`);
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
    prova('nenhuma correção gastou NSR', Number((await um(`select ultimo from public.contador_nsr_estabelecimento where cnpj = '11222333000144'`)).ultimo) === 5);

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
    // A fantasma não tem CNPJ: a marcação dela é a primeira do balde "sem CNPJ" (NSR por estabelecimento)
    prova('a original foi para a ficha boa, com o mesmo NSR',
      (await um(`select colaborador_id from public.marcacoes_originais where cnpj_empregador = '' and nsr = 1`))?.colaborador_id === 'bia-planilha',
      await varios(`select cnpj_empregador, nsr, colaborador_id from public.marcacoes_originais order by cnpj_empregador, nsr`));
    prova('a fantasma saiu', !(await um(`select 1 x from public.colaboradores where id = 'colab-000000000000000000000000000000dd'`)));

  expect(falhas).toEqual([]);
}, 120_000);
