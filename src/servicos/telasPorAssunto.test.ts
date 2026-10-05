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
import { telasQueVejo, assuntosDe, ASSUNTOS, TelaId, DE_QUEM_E_A_TELA } from './telasPorAssunto';

const mapa = permissoesPadrao();
const ver = (nivel: number, setor: string, temEquipe: boolean, batePonto: boolean) => {
  const c = { id: 'x', nome: 'Teste', nivel, setor } as any;
  return [...telasQueVejo(c, { pode: (k) => podeUsarComMapa(k, c, mapa), temEquipe, batePonto })].sort();
};

const DE_TODOS: TelaId[] = ['central', 'conversas', 'inicio', 'meus_documentos'];
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

test('AS PRÓPRIAS AUSÊNCIAS NUMA ABA SÓ: quem pede pelo ponto acompanha ali; o gerente vê os cartões', () => {
  const colaborador = ver(1, 'Balcão', false, true);
  expect(colaborador).toContain('pedir_ausencia');
  expect(colaborador).not.toContain('minhas_ausencias');
  const gerente = ver(3, 'Gerência', true, false);
  expect(gerente).not.toContain('pedir_ausencia');
  expect(gerente).toContain('minhas_ausencias');
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

test('CADA CAMINHO DE HOJE LEVA A UMA TELA DA BARRA, e a tela que a pessoa não tem não abre', async () => {
  const { TELA_DO_DESTINO, TELA_DA_SECAO_DO_RH, telaQueAbre, assuntoDaTela } = await import('./telasPorAssunto');
  const { SECOES_DESTINO } = await import('./destinoDoAviso');

  // Todo destino de aviso que existe tem tela — aviso novo sem tela quebra aqui
  for (const secao of SECOES_DESTINO) expect(TELA_DO_DESTINO[secao]).toBeDefined();
  // E toda tela de destino mora num assunto (ou é o Início)
  for (const tela of [...Object.values(TELA_DO_DESTINO), ...Object.values(TELA_DA_SECAO_DO_RH)]) {
    expect(assuntoDaTela(tela)).not.toBeNull();
  }

  // O colaborador recebe um aviso de aprovação (antigo, de quando liderava): cai no Início
  const c = { id: 'x', nome: 'Teste', nivel: 1, setor: 'Balcão' } as any;
  const visiveis = telasQueVejo(c, { pode: (k) => podeUsarComMapa(k, c, mapa), temEquipe: false, batePonto: true });
  expect(telaQueAbre('equipe_pendencias', visiveis)).toBe('inicio');
  expect(telaQueAbre('meu_ponto', visiveis)).toBe('meu_ponto');
  expect(telaQueAbre('perfil', visiveis)).toBe('perfil');
  expect(telaQueAbre(null, visiveis)).toBe('inicio');
});

test('TODA TELA DIZ O QUE É: cada tela e cada assunto têm a sua frase', async () => {
  const { DESCRICAO_DA_TELA, DESCRICAO_DO_ASSUNTO } = await import('./telasPorAssunto');
  for (const assunto of ASSUNTOS) {
    expect(DESCRICAO_DO_ASSUNTO[assunto.id]?.length).toBeGreaterThan(10);
    for (const tela of assunto.telas) expect(DESCRICAO_DA_TELA[tela.id]?.length).toBeGreaterThan(10);
  }
});

test('O RÓTULO "DE QUEM É" não mente: o colaborador comum só vê "Para você" e "Toda a rede"', () => {
  /*
    O rótulo acima do título diz se a tela é da pessoa, da equipe dela ou
    da gestão. Se uma tela de gestão ganhar o rótulo "Para você" (ou o
    contrário), o colaborador lê errado o que está vendo.
  */
  const doColaborador = ver(1, 'Balcão', false, true);
  const rotulos = new Set(doColaborador.map((t) => DE_QUEM_E_A_TELA[t]));
  expect([...rotulos].sort()).toEqual(['Para você', 'Toda a rede']);
  // E o que só o líder ganha a mais é dele como gestor, nunca "Para você"
  const doLider = ver(2, 'Balcão', true, true).filter((t) => !doColaborador.includes(t));
  for (const t of doLider) expect({ t, rotulo: DE_QUEM_E_A_TELA[t] }).not.toEqual({ t, rotulo: 'Para você' });
});
