/**
 * OS LEMBRETES DO DIA — quem é lembrado de quê, às 9h de 10/10/2026.
 */
import { test, expect } from 'bun:test';
import { planejarLembretes, DadosDosLembretes } from './lembretes';
import type { AvisoRede, Colaborador } from '../tipos';

const AGORA = new Date('2026-10-10T12:00:00.000Z'); // 09:00 em Brasília

const pessoa = (id: string, extra: Partial<Colaborador> = {}): Colaborador =>
  ({ id, nome: id, loja: 'Pirassununga', setor: 'Balcão', nivel: 1, ativo: true, ...extra }) as Colaborador;

const publicacao = (id: string, extra: Partial<AvisoRede> = {}): AvisoRede =>
  ({
    id,
    titulo: `Comunicado ${id}`,
    conteudo: '',
    autorId: 'dani',
    criadoEm: '2026-10-08T12:00:00.000Z',
    exigeConfirmacao: true,
    confirmacoesIds: [],
    lojaDestino: 'Todas',
    ...extra,
  }) as AvisoRede;

const base = (): DadosDosLembretes => ({
  colaboradores: [pessoa('dani', { setor: 'RH' }), pessoa('ana'), pessoa('bia'), pessoa('zeca', { ativo: false })],
  holerites: [],
  assinados: new Set(),
  advertencias: [],
  publicacoes: [],
});

const quem = (lembretes: ReturnType<typeof planejarLembretes>) => lembretes.map((l) => l.colaboradorId).sort();

test('holerite não assinado: lembra o dono, todo dia, com o mês', () => {
  const d = base();
  d.holerites = [{ id: 'h1', colaboradorId: 'ana', competencia: '2026-09', criadoEm: '2026-10-05T15:00:00Z' }];
  const [l] = planejarLembretes(d, AGORA);
  expect(l.colaboradorId).toBe('ana');
  expect(l.dados).toMatchObject({ tipo: 'secao', conversaId: 'meus_holerites', mensagemId: 'lembrete-holerite-ana' });
  expect(l.dados.texto).toContain('Setembro de 2026');
});

test('assinado, ou de quem saiu da empresa: ninguém é lembrado', () => {
  const d = base();
  d.holerites = [
    { id: 'h1', colaboradorId: 'ana', competencia: '2026-09', criadoEm: '2026-10-05T15:00:00Z' },
    { id: 'h2', colaboradorId: 'zeca', competencia: '2026-09', criadoEm: '2026-10-05T15:00:00Z' },
  ];
  d.assinados = new Set(['h1']);
  expect(planejarLembretes(d, AGORA)).toEqual([]);
});

test('publicado ontem às 18h não é cobrado às 9h de hoje — espera 20 horas', () => {
  const d = base();
  d.holerites = [{ id: 'h1', colaboradorId: 'ana', competencia: '2026-09', criadoEm: '2026-10-09T21:00:00Z' }];
  expect(planejarLembretes(d, AGORA)).toEqual([]);
});

test('vários holerites pendentes viram UM aviso, com a conta', () => {
  const d = base();
  d.holerites = ['2026-08', '2026-09'].map((c) => ({ id: c, colaboradorId: 'ana', competencia: c, criadoEm: '2026-10-01T12:00:00Z' }));
  const lembretes = planejarLembretes(d, AGORA);
  expect(lembretes).toHaveLength(1);
  expect(lembretes[0].dados.texto).toContain('2 holerites');
});

test('documento do RH sem ciência: lembra sem dizer o que é', () => {
  const d = base();
  d.advertencias = [
    { id: 'a1', colaboradorId: 'bia', cienciaEm: null, criadoEm: '2026-10-01T12:00:00Z' },
    { id: 'a2', colaboradorId: 'ana', cienciaEm: '2026-10-02T12:00:00Z', criadoEm: '2026-10-01T12:00:00Z' },
  ];
  const lembretes = planejarLembretes(d, AGORA);
  expect(quem(lembretes)).toEqual(['bia']);
  expect(lembretes[0].dados.conversaId).toBe('minhas_advertencias');
  // O que aparece na barra: remetente, título e texto
  const { remetente, conversa, texto } = lembretes[0].dados;
  expect(`${remetente} ${conversa} ${texto}`.toLowerCase()).not.toContain('advert');
});

test('publicação: lembra quem ela alcança e não confirmou — nem o autor, nem quem saiu', () => {
  const d = base();
  d.publicacoes = [publicacao('p1', { confirmacoesIds: ['bia'] })];
  const lembretes = planejarLembretes(d, AGORA);
  // Dani é a autora; Bia confirmou; Zeca saiu
  expect(quem(lembretes)).toEqual(['ana']);
  expect(lembretes[0].dados).toMatchObject({ tipo: 'publicacao', publicacaoId: 'p1', texto: 'Comunicado p1' });
});

test('publicação dirigida a outra loja não cobra quem ela não alcança', () => {
  const d = base();
  d.colaboradores.push(pessoa('carlos', { loja: 'Descalvado' }));
  d.publicacoes = [publicacao('p1', { lojaDestino: 'Descalvado' })];
  expect(quem(planejarLembretes(d, AGORA))).toEqual(['carlos']);
});

test('publicação que não pede confirmação, ou antiga, não é cobrada', () => {
  const d = base();
  d.publicacoes = [
    publicacao('sem', { exigeConfirmacao: false }),
    publicacao('velha', { criadoEm: '2026-09-01T12:00:00Z' }),
  ];
  expect(planejarLembretes(d, AGORA)).toEqual([]);
});

test('duas publicações pendentes: um aviso, que abre a mais recente', () => {
  const d = base();
  d.publicacoes = [publicacao('antiga', { criadoEm: '2026-10-02T12:00:00Z' }), publicacao('nova')];
  const daAna = planejarLembretes(d, AGORA).filter((l) => l.colaboradorId === 'ana');
  expect(daAna).toHaveLength(1);
  expect(daAna[0].dados.publicacaoId).toBe('nova');
  expect(daAna[0].dados.texto).toContain('2 publicações');
});
