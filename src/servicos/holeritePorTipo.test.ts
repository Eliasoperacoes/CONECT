/**
 * FOLHA E ADIANTAMENTO NO MESMO MÊS (holerite-por-tipo.sql, 03/11/2026).
 *
 * A Dani tentou subir a folha de outubro e foi recusada: o adiantamento de
 * outubro já estava assinado, e o sistema só aceitava um documento por mês.
 * Quem não tinha assinado teria o adiantamento sobrescrito pela folha.
 *
 * O que estes testes prendem, no banco de verdade: os dois tipos convivem,
 * reenviar substitui só o do mesmo tipo, e a marcação dos documentos antigos
 * não toca em id, arquivo nem assinatura.
 */
import { test, expect, beforeAll } from 'bun:test';
import { montarBancoLocal, lerSql, type BancoLocal } from '../../scripts/bancoLocal';
import { sugerirTipoDeHolerite } from './cargaDeHolerites';

let banco: BancoLocal;

const inserir = (id: string, competencia: string, tipo: string, criadoEm = '2026-11-03 12:00:00-03') =>
  banco.db.query(
    `insert into public.holerites (id, colaborador_id, competencia, tipo, arquivo_caminho, arquivo_nome, criado_em)
     values ($1, 'ana', $2, $3, $4, 'x.pdf', $5)`,
    [id, competencia, tipo, `holerites/ana/${id}.pdf`, criadoEm]
  );

beforeAll(async () => {
  banco = await montarBancoLocal();
  await banco.db.exec(lerSql('rh-holerite-advertencia.sql'));
  await banco.db.exec(`
    create table if not exists public.recebimentos_holerite (holerite_id text primary key);
    insert into public.colaboradores (id, nome, login, setor, loja, nivel, ativo) values
      ('ana', 'Ana', 'ana', 'Balcão', 'Pirassununga', 1, true),
      ('bia', 'Bia', 'bia', 'Balcão', 'Pirassununga', 1, true);
    -- Como produção estava antes do delta: um documento por pessoa e mês
    alter table public.holerites drop constraint if exists holerites_por_pessoa_mes_e_tipo;
    alter table public.holerites drop column if exists tipo;
    alter table public.holerites
      add constraint holerites_colaborador_id_competencia_key unique (colaborador_id, competencia);
    insert into public.holerites (id, colaborador_id, competencia, arquivo_caminho, arquivo_nome, criado_em) values
      ('hol-ana-2026-09', 'ana', '2026-09', 'holerites/ana/2026-09.pdf', 'x.pdf', '2026-10-01 22:55:00-03'),
      ('hol-ana-2026-10', 'ana', '2026-10', 'holerites/ana/2026-10.pdf', 'x.pdf', '2026-10-20 07:38:00-03'),
      -- Publicado em 03/11: não é o adiantamento de 20/10
      ('hol-bia-2026-10', 'bia', '2026-10', 'holerites/bia/2026-10.pdf', 'x.pdf', '2026-11-03 14:26:00-03');
  `);
  await banco.db.exec(lerSql('holerite-por-tipo.sql'));
  // "Pode rodar mais de uma vez"
  await banco.db.exec(lerSql('holerite-por-tipo.sql'));
  // O 13º (10/11/2026), também rodado duas vezes
  await banco.db.exec(lerSql('holerite-decimo-terceiro.sql'));
  await banco.db.exec(lerSql('holerite-decimo-terceiro.sql'));
  // Montar o banco leva mais de 5 s, o limite padrão, com a máquina ocupada
}, 60_000);

test('o que já existe: outubro de antes de 03/11 é adiantamento, o resto é folha; id e arquivo iguais', async () => {
  const { rows } = await banco.db.query<any>(
    'select id, tipo, arquivo_caminho from public.holerites order by id'
  );
  expect(rows).toEqual([
    { id: 'hol-ana-2026-09', tipo: 'folha', arquivo_caminho: 'holerites/ana/2026-09.pdf' },
    { id: 'hol-ana-2026-10', tipo: 'adiantamento', arquivo_caminho: 'holerites/ana/2026-10.pdf' },
    { id: 'hol-bia-2026-10', tipo: 'folha', arquivo_caminho: 'holerites/bia/2026-10.pdf' },
  ]);
});

test('a folha entra no mês do adiantamento, e o segundo do mesmo tipo é recusado', async () => {
  await inserir('hol-ana-2026-10-folha', '2026-10', 'folha');
  await expect(inserir('repetida', '2026-10', 'folha')).rejects.toThrow();
  const { rows } = await banco.db.query<any>(
    `select tipo from public.holerites where colaborador_id = 'ana' and competencia = '2026-10' order by tipo`
  );
  expect(rows.map((r) => r.tipo)).toEqual(['adiantamento', 'folha']);
});

test('novembro tem três documentos: o 13º entra ao lado do adiantamento e da folha, e o segundo 13º é recusado', async () => {
  await inserir('hol-ana-2026-11-adiantamento', '2026-11', 'adiantamento');
  await inserir('hol-ana-2026-11-folha', '2026-11', 'folha');
  await inserir('hol-ana-2026-11-decimo_terceiro', '2026-11', 'decimo_terceiro');
  await expect(inserir('outro-13', '2026-11', 'decimo_terceiro')).rejects.toThrow();
  const { rows } = await banco.db.query<any>(
    `select tipo from public.holerites where colaborador_id = 'ana' and competencia = '2026-11' order by tipo`
  );
  expect(rows.map((r) => r.tipo)).toEqual(['adiantamento', 'decimo_terceiro', 'folha']);
});

test('o banco novo, montado do zero, também aceita o 13º', async () => {
  const novo = await montarBancoLocal();
  await novo.db.exec(lerSql('rh-holerite-advertencia.sql'));
  await novo.db.exec(`insert into public.colaboradores (id, nome, login, setor, loja, nivel, ativo)
                      values ('ana', 'Ana', 'ana', 'Balcão', 'Pirassununga', 1, true)`);
  await novo.db.query(
    `insert into public.holerites (id, colaborador_id, competencia, tipo, arquivo_caminho, arquivo_nome)
     values ('h13', 'ana', '2026-11', 'decimo_terceiro', 'holerites/ana/h13.pdf', 'x.pdf')`
  );
  await expect(
    novo.db.query(
      `insert into public.holerites (id, colaborador_id, competencia, tipo, arquivo_caminho, arquivo_nome)
       values ('hb', 'ana', '2026-11', 'bonus', 'holerites/ana/hb.pdf', 'x.pdf')`
    )
  ).rejects.toThrow();
}, 60_000);

test('tipo fora da lista é recusado', async () => {
  await expect(inserir('estranho', '2026-08', 'bonus')).rejects.toThrow();
});

test('o tipo sai da etiqueta colada no mês', () => {
  expect(sugerirTipoDeHolerite(['Filial  Folha Mensal Setembro de 2026 GERAL'])).toBe('folha');
  expect(sugerirTipoDeHolerite(['Filial  Adiantamento Outubro de 2026 GERAL'])).toBe('adiantamento');
  expect(sugerirTipoDeHolerite(['Filial  Adiantamento Salarial 10/2026'])).toBe('adiantamento');
});

test('a folha desconta o adiantamento: a palavra na linha de desconto não muda o tipo', () => {
  expect(sugerirTipoDeHolerite(['981 ADIANTAMENTO SALARIAL 500,00 Folha Mensal Outubro de 2026'])).toBe('folha');
});

test('as telas do RH contam e substituem por tipo, e a carga não publica sem ele', async () => {
  const ler = (nome: string) => Bun.file(new URL(`../componentes/${nome}.tsx`, import.meta.url)).text();
  const aba = await ler('AbaHolerites');
  expect(aba).toContain('h.competencia === competencia && h.tipo === tipo');
  expect(aba).toContain('removerHoleritesDoMes(competencia, tipo)');

  const carga = await ler('CargaDeHolerites');
  expect(carga).toContain('h.competencia === competencia && h.tipo === tipo');
  expect(carga).toContain('useState<TipoHolerite | null>(null)');
  expect(carga).toContain('disabled={recebem.length === 0 || !tipo}');
});

test('o sino não repete o mês quando os dois documentos estão por assinar', async () => {
  const sino = await Bun.file(new URL('../componentes/SinoWeb.tsx', import.meta.url)).text();
  expect(sino).toContain('[...new Set(meses)].sort()');
});

test('o PDF do 13º é reconhecido, escrito de qualquer jeito, mesmo chamado de adiantamento', () => {
  expect(sugerirTipoDeHolerite(['Filial  13º Salário 1ª Parcela Novembro de 2026'])).toBe('decimo_terceiro');
  expect(sugerirTipoDeHolerite(['ADIANTAMENTO 13O SAL. 11/2026'])).toBe('decimo_terceiro');
  expect(sugerirTipoDeHolerite(['Adiantamento Décimo Terceiro Novembro de 2026'])).toBe('decimo_terceiro');
  // A 2ª parcela desconta a 1ª: continua 13º
  expect(sugerirTipoDeHolerite(['13 Salario 2a Parcela Dezembro de 2026', '981 ADIANTAMENTO 13 SALARIO 1.200,00'])).toBe(
    'decimo_terceiro'
  );
});

test('13º com a etiqueta da folha mensal é dúvida; e "13" perto de saldo não é 13º', () => {
  expect(sugerirTipoDeHolerite(['Folha Mensal Novembro de 2026', '13º Salário 1ª Parcela Novembro de 2026'])).toBeNull();
  expect(sugerirTipoDeHolerite(['Folha Mensal Novembro de 2026 GERAL', '13 SALDO DE SALARIO 30,00'])).toBe('folha');
});

test('as duas telas do RH montam a escolha da mesma lista de tipos', async () => {
  const ler = (nome: string) => Bun.file(new URL(`../componentes/${nome}.tsx`, import.meta.url)).text();
  for (const tela of ['AbaHolerites', 'CargaDeHolerites']) {
    const codigo = await ler(tela);
    expect(codigo).toContain('TIPOS_HOLERITE.map(');
    expect(codigo).not.toMatch(/\[\s*'adiantamento'\s*,\s*'folha'/);
  }
});

test('sem etiqueta, ou com as duas, não há palpite: o RH escolhe', () => {
  expect(sugerirTipoDeHolerite(['MALACHIAS AUTO PECAS LTDA'])).toBeNull();
  expect(sugerirTipoDeHolerite(['981 ADIANTAMENTO 500,00'])).toBeNull();
  expect(sugerirTipoDeHolerite(['Folha Mensal Outubro de 2026', 'Adiantamento Outubro de 2026'])).toBeNull();
});
