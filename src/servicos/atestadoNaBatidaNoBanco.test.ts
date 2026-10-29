/**
 * O ATESTADO QUE FICOU PRESO AO DIA DE PONTO (atestados-anexados-na-batida.sql).
 *
 * O da Beatriz (28/10/2026) ia com o dia de ponto para a fila da líder e
 * nunca chegava ao RH. O script leva ao RH, como atestado PENDENTE, cada
 * dia de ponto com anexo e motivo de saúde — e não duplica ao rodar de novo.
 */
import { test, expect, beforeAll } from 'bun:test';
import { montarBancoLocal, lerSql, type BancoLocal } from '../../scripts/bancoLocal';

let banco: BancoLocal;

beforeAll(async () => {
  banco = await montarBancoLocal();
  await banco.db.exec(`
    insert into public.colaboradores (id, nome, login, setor, loja, nivel, ativo) values
      ('bia', 'Beatriz', 'beatriz', 'Estoque', 'Pirassununga', 1, true),
      ('ana', 'Ana', 'ana', 'Balcão', 'Pirassununga', 1, true);
    insert into public.ajustes_jornada
      (id, colaborador_id, data, tipo, minutos, minutos_trabalhados, minutos_previstos, estado,
       motivo_colaborador, anexo_caminho) values
      ('a-bia', 'bia', '2026-10-28', 'debito', 78, 412, 490, 'pendente',
       'estava no médico, com atestado', 'ponto/bia/2026-10-28-1.jpg'),
      ('a-nota', 'ana', '2026-10-27', 'hora_extra', 40, 530, 490, 'pendente',
       'entrega do fornecedor atrasou', 'ponto/ana/2026-10-27-1.jpg'),
      ('a-ja-tem', 'ana', '2026-10-26', 'debito', 60, 430, 490, 'aprovado',
       'fui na consulta', 'ponto/ana/2026-10-26-1.pdf');
    insert into public.justificativas_ausencia
      (id, colaborador_id, data_inicio, data_fim, tipo, anexo_caminho, estado) values
      ('j-ana', 'ana', '2026-10-26', '2026-10-26', 'comparecimento', 'ausencias/ana/x.pdf', 'aprovada');
  `);
}, 120_000);

test('o atestado da Beatriz vai ao RH pendente, com o documento; o resto não', async () => {
  await banco.db.exec(lerSql('atestados-anexados-na-batida.sql'));

  const { rows } = await banco.db.query<any>(
    `select id, colaborador_id, to_char(data_inicio, 'YYYY-MM-DD') as dia, tipo, estado, anexo_caminho, anexo_nome
       from public.justificativas_ausencia order by id`
  );
  expect(rows).toEqual([
    { id: 'j-ana', colaborador_id: 'ana', dia: '2026-10-26', tipo: 'comparecimento', estado: 'aprovada', anexo_caminho: 'ausencias/ana/x.pdf', anexo_nome: null },
    {
      id: 'just-batida-a-bia', colaborador_id: 'bia', dia: '2026-10-28', tipo: 'atestado', estado: 'pendente',
      anexo_caminho: 'ponto/bia/2026-10-28-1.jpg', anexo_nome: 'atestado.jpg',
    },
  ]);
});

test('rodar de novo não duplica, e a conferência mostra cada dia com anexo', async () => {
  await banco.db.exec(lerSql('atestados-anexados-na-batida.sql'));
  const total = await banco.db.query<any>('select count(*)::int as n from public.justificativas_ausencia');
  expect(total.rows[0].n).toBe(2);

  const conferencia = await banco.db.query<any>(
    lerSql('atestados-anexados-na-batida.sql').split('-- CONFERÊNCIA')[1].replace(/^[^\n]*\n/, '')
  );
  expect(conferencia.rows.map((l: any) => [l.nome, l.dia, l.horas, l.atestado_no_rh])).toEqual([
    ['Beatriz', '28/10/2026', '−1h18', 'pendente'],
    ['Ana', '27/10/2026', '+0h40', 'não'],
    ['Ana', '26/10/2026', '−1h00', 'aprovada'],
  ]);
});
