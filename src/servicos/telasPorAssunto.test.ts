/**
 * QUEM VÊ CADA TELA, POR PERFIL — e cada tela numa porta só.
 *
 * "Não confundir e bagunçar as telas entre os usuários" (Elias,
 * 05/10/2026): a reorganização por assunto muda a PORTA, nunca o que cada
 * pessoa alcança. Estas listas são o que cada perfil via antes dela, com
 * as permissões padrão do catálogo.
 */
import { test, expect } from 'bun:test';
import { permissoesPadrao } from './ferramentas';
import { podeUsarComMapa } from './permissoes';
import { telasQueVejo, assuntosDe, ASSUNTOS, TelaId } from './telasPorAssunto';

const mapa = permissoesPadrao();
const ver = (nivel: number, setor: string, temEquipe: boolean, batePonto: boolean) => {
  const c = { id: 'x', nome: 'Teste', nivel, setor } as any;
  return [...telasQueVejo(c, { pode: (k) => podeUsarComMapa(k, c, mapa), temEquipe, batePonto })].sort();
};

const DE_TODOS: TelaId[] = ['central', 'conversas', 'inicio', 'meus_documentos', 'minhas_ausencias'];
const QUEM_BATE: TelaId[] = ['meu_espelho', 'meu_ponto', 'pedir_ausencia'];
const ordenar = (lista: TelaId[]) => [...lista].sort();

test('COLABORADOR: só o que é dele — nada de equipe, rede ou RH', () => {
  expect(ver(1, 'Balcão', false, true)).toEqual(ordenar([...DE_TODOS, ...QUEM_BATE]));
  expect(ver(1, 'Estágio', false, true)).toEqual(ordenar([...DE_TODOS, ...QUEM_BATE]));
});

test('LÍDER COM EQUIPE: o dele, mais a equipe — sem RH, sem lojas', () => {
  expect(ver(2, 'Balcão', true, true)).toEqual(
    ordenar([
      ...DE_TODOS,
      ...QUEM_BATE,
      'equipe_banco',
      'equipe_pendencias',
      'escala_folgas',
      'ferias_planejamento',
      'ponto_rede',
    ])
  );
  // Sem equipe, a equipe some
  expect(ver(2, 'Balcão', false, true)).not.toContain('equipe_banco');
});

test('GERENTE: a equipe e o QR; não bate ponto, então não tem o próprio ponto', () => {
  const gerente = ver(3, 'Gerência', true, false);
  expect(gerente).toContain('qr_ponto');
  expect(gerente).toContain('equipe_pendencias');
  expect(gerente).not.toContain('meu_ponto');
  expect(gerente).not.toContain('meu_espelho');
  expect(gerente).not.toContain('holerites');
});

test('RH: o trabalho do RH, sem a tela de equipe nem as lojas', () => {
  expect(ver(2, 'RH', false, true)).toEqual(
    ordenar([
      ...DE_TODOS,
      ...QUEM_BATE,
      'painel_rh',
      'assinaturas',
      'holerites',
      'advertencias',
      'atestados',
      'escala_folgas',
      'ferias_planejamento',
      'ponto_rede',
    ])
  );
});

test('ADMINISTRAÇÃO só para o TI', () => {
  expect(ver(5, 'TI', true, false)).toContain('administracao');
  expect(ver(4, 'Diretoria', true, false)).not.toContain('administracao');
  expect(ver(3, 'Gerência', true, false)).not.toContain('administracao');
});

test('UMA TELA, UMA PORTA: cada tela está em um assunto só', () => {
  const todas = ASSUNTOS.flatMap((a) => a.telas.map((t) => t.id));
  expect(new Set(todas).size).toBe(todas.length);
  // E o painel do RH não está na barra: ele mora no Início
  expect(todas).not.toContain('painel_rh');
});

test('assunto sem tela não aparece: o colaborador não vê "Pessoas e lojas" vazio', () => {
  const c = { id: 'x', nome: 'Teste', nivel: 1, setor: 'Balcão' } as any;
  const assuntos = assuntosDe(c, { pode: (k) => podeUsarComMapa(k, c, mapa), temEquipe: false, batePonto: true });
  expect(assuntos.map((a) => a.id)).toEqual(['inicio', 'conversas', 'central', 'ponto', 'ausencias', 'documentos']);
  // E dentro de Ponto, só o dele
  expect(assuntos.find((a) => a.id === 'ponto')!.telas.map((t) => t.id)).toEqual(['meu_ponto', 'meu_espelho']);
});
