/**
 * A BATIDA A MENOS DE 2 MINUTOS DA ANTERIOR NÃO AVANÇA A JORNADA
 * (batida-repetida-em-2-minutos.sql, 08/10/2026).
 *
 * O caso do Yan: entrada às 08:23:35, de novo às 08:23:54 — e o banco
 * aceitou a segunda como saída para almoço. A marcação continua
 * registrada (original, NSR), mas entra "repetida" e vai para o RH.
 */
import { test, expect, beforeAll } from 'bun:test';
import { montarBancoLocal, lerSql, type BancoLocal } from '../../scripts/bancoLocal';

let banco: BancoLocal;
let domingo = false;

const ANA = '00000000-0000-0000-0000-0000000000f1';
const BIA = '00000000-0000-0000-0000-0000000000f2';

beforeAll(async () => {
  banco = await montarBancoLocal();
  // O próprio delta, rodado por cima do esquema: a trava do começo passa
  await banco.db.exec(lerSql('batida-repetida-em-2-minutos.sql'));
  await banco.db.exec(`
    alter table auth.users disable trigger all;
    insert into auth.users (id) values ('${ANA}'), ('${BIA}');
    insert into public.colaboradores (id, auth_user_id, nome, login, setor, loja, nivel, cnpj, ativo) values
      ('ana', '${ANA}', 'Ana', 'ana', 'Balcão', 'Pirassununga', 1, '11222333000144', true),
      ('bia', '${BIA}', 'Bia', 'bia', 'Balcão', 'Pirassununga', 1, '11222333000144', true);
    insert into public.codigos_ponto_loja (loja, codigo) values ('Pirassununga', 'ABC123')
      on conflict (loja) do update set codigo = excluded.codigo;
  `);
  domingo = (await banco.db.query<{ d: boolean }>(
    `select extract(dow from now() at time zone 'America/Sao_Paulo') = 0 as d`
  )).rows[0].d;
}, 120_000);

const marcar = async (uid: string, tipo: string) => {
  await banco.como(uid);
  const r = (await banco.db.query<{ r: any }>(`select public.registrar_marcacao('ABC123', 'Pirassununga', '${tipo}', '02') as r`)).rows[0].r;
  await banco.como(null);
  return r;
};

/** Empurra as originais da pessoa para trás no tempo — só o dono do banco, com a trava desligada. */
const envelhecer = async (colaborador: string, minutos: number) => {
  await banco.db.exec(`
    alter table public.marcacoes_originais disable trigger user;
    update public.marcacoes_originais set registrado_em = registrado_em - interval '${minutos} minutes'
     where colaborador_id = '${colaborador}';
    alter table public.marcacoes_originais enable trigger user;
  `);
};

test('a conferência do delta: uma função de batida, com a janela', async () => {
  const r = (await banco.db.query<any>(`
    select (select count(*)::int from pg_proc where proname = 'registrar_marcacao') as funcoes,
           (select prosrc like '%interval ''2 minutes''%' from pg_proc where proname = 'registrar_marcacao') as janela`)).rows[0];
  expect(r).toEqual({ funcoes: 1, janela: true });
});

test('O CASO DO YAN: a segunda batida 19 s depois fica registrada, mas não vira saída para almoço', async () => {
  if (domingo) return;
  const entrada = await marcar(ANA, 'entrada');
  expect(entrada.fora_da_jornada).toBeNull();
  expect(entrada.registro?.tipo).toBe('entrada');

  const logoDepois = await marcar(ANA, 'saida_almoco');
  expect(logoDepois.fora_da_jornada).toBe('repetida');
  expect(logoDepois.registro).toBeNull();
  // Registrada mesmo assim: original com NSR seguido, para o comprovante e o RH
  expect(Number(logoDepois.original.nsr)).toBe(Number(entrada.original.nsr) + 1);

  const tratamento = (await banco.db.query<{ tipo: string }>(
    `select tipo from public.registros_ponto where colaborador_id = 'ana' order by horario`
  )).rows.map((l) => l.tipo);
  expect(tratamento).toEqual(['entrada']);
});

test('passados os 2 minutos, a próxima batida entra na jornada normalmente', async () => {
  if (domingo) return;
  await envelhecer('ana', 3);
  const almoco = await marcar(ANA, 'saida_almoco');
  expect(almoco.fora_da_jornada).toBeNull();
  expect(almoco.registro?.tipo).toBe('saida_almoco');
});

test('a janela é DA PESSOA: a batida de outra pessoa no mesmo minuto não segura a dela', async () => {
  if (domingo) return;
  // A Ana acabou de bater (o almoço acima); a Bia entra no mesmo instante
  const bia = await marcar(BIA, 'entrada');
  expect(bia.fora_da_jornada).toBeNull();
  expect(bia.registro?.tipo).toBe('entrada');
});
