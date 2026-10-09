/**
 * AS LINHAS DO BANCO (01/10/2026).
 *
 * Os conversores saíram de `nuvem.ts` para a função de servidor poder
 * usá-los. Na mudança apareceu um defeito antigo: a leitura das apurações
 * descartava o motivo, a origem e o anexo. O próximo a reescrever um pedido
 * pendente o gravava SEM o motivo que a pessoa escreveu.
 */
import { test, expect } from 'bun:test';
import { readFileSync } from 'fs';
import { join } from 'path';
import { paraAjuste, paraLinhaAjuste, paraColaboradorDaLinha } from './linhasDoBanco';

const linha = {
  id: 'a1', colaborador_id: 'ana', data: '2026-10-06', tipo: 'hora_extra', minutos: 30,
  minutos_trabalhados: 520, minutos_previstos: 490, estado: 'pendente', aprovador_id: null,
  aprovador_nome: null, decidido_em: null, observacao: null, criado_em: '2026-10-06T20:41:00Z',
  origem: 'pendencia', motivo_colaborador: 'Inventário de sábado', anexo_caminho: 'anexos/a1.pdf',
};

test('o motivo da pessoa volta do banco, e não some na regravação', () => {
  const ajuste = paraAjuste(linha);
  expect(ajuste.motivoColaborador).toBe('Inventário de sábado');
  expect(ajuste.anexoCaminho).toBe('anexos/a1.pdf');
  expect(ajuste.origem).toBe('pendencia');

  // Ida e volta: o que sobe de novo é o que veio
  const deNovo = paraLinhaAjuste(ajuste);
  expect(deNovo.motivo_colaborador).toBe('Inventário de sábado');
  expect(deNovo.anexo_caminho).toBe('anexos/a1.pdf');
});

test('o colaborador vem com a foto que quem chama resolveu', () => {
  const c = paraColaboradorDaLinha(
    { id: 'ana', nome: 'Ana', login: 'ana', cargo: 'Balconista', setor: 'Balcão', loja: 'Pirassununga', nivel: 1,
      foto: 'perfil/ana/1.jpg', ativo: true, criado_em: '', turno: 'B', carga_horaria_diaria_minutos: null } as any,
    'https://assinada'
  );
  expect(c.foto).toBe('https://assinada');
  expect(c.turno).toBe('B');
  // null no banco é "vale o turno", e não zero
  expect(c.cargaHorariaDiariaMinutos).toBeUndefined();
});

test('os conversores só importam tipos: vão inteiros para o servidor', () => {
  const fonte = readFileSync(join(import.meta.dir, 'linhasDoBanco.ts'), 'utf8');
  expect([...fonte.matchAll(/from\s+'([^']+)'/g)].map((m) => m[1])).toEqual(['../tipos']);
});

test('O ID DA ORIGINAL leva o CNPJ: o NSR se repete entre os estabelecimentos', async () => {
  const { idDaOriginal, lerIdDaOriginal, comprovanteDaOriginal } = await import('./linhasDoBanco');
  expect(idDaOriginal('05.041.606/0001-99', 42)).toBe('original-05041606000199-42');
  expect(lerIdDaOriginal('original-05041606000199-42')).toEqual({ cnpj: '05041606000199', nsr: 42 });
  expect(lerIdDaOriginal('ponto-abc')).toBeNull();
  // O mesmo NSR nos dois CNPJs: dois ids
  const de = (cnpj: string) =>
    comprovanteDaOriginal({ nsr: 7, colaborador_id: 'ana', registrado_em: '2026-10-08T11:00:00Z', data: '2026-10-08', loja: 'Pirassununga',
      metodo: 'qrcode', cnpj_empregador: cnpj, codigo_verificacao: 'x', registro_id: null, tipo_pedido: null, fora_da_jornada: 'repetida' }).id;
  expect(de('05041606000199')).not.toBe(de('28251342000101'));
});

test('o SERVIDOR lê o id da original com a MESMA regra do aparelho (enviar-aviso, caminho 7)', async () => {
  const servidor = await Bun.file(new URL('../../supabase/functions/enviar-aviso/index.ts', import.meta.url)).text();
  const aparelho = await Bun.file(new URL('./linhasDoBanco.ts', import.meta.url)).text();
  const REGRA = String.raw`/^original-(\d*)-(\d+)$/`;
  expect(aparelho).toContain(REGRA);
  expect(servidor).toContain(`const daOriginal = ${REGRA}.exec(id);`);
  expect(servidor).toContain(".from('marcacoes_originais')");
});
