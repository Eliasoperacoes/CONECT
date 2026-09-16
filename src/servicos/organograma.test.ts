/**
 * Verificação do organograma — CONECTA
 *
 * O organograma não é desenho: é quem aprova hora de quem. O que estes
 * testes prendem é a decisão do dono do sistema — pessoa posicionada na
 * cadeia só é aprovada por quem está acima dela; pessoa ainda não
 * posicionada continua na regra automática de setor/loja, para que ninguém
 * fique com a hora parada enquanto o quadro das 5 lojas é montado.
 */
import { test, expect } from 'bun:test';
import { Colaborador } from '../tipos';
import {
  cadeiaAcimaDe,
  respondePor,
  temAlcadaSobre,
  podeSerResponsavelDe,
  montarArvoreDaLoja,
  subordinadosDiretos,
  semResponsavel,
  estaPosicionado,
} from './organograma';

const pessoa = (
  id: string,
  nivel: number,
  extras: Partial<Colaborador> = {}
): Colaborador => ({
  id,
  nome: id,
  login: id,
  cargo: 'Cargo',
  setor: 'Balcão',
  loja: 'Pirassununga',
  nivel: nivel as Colaborador['nivel'],
  foto: '',
  presenca: 'disponivel',
  vistoPorUltimo: 'agora',
  ativo: true,
  ...extras,
});

// A regra automática de antes do organograma, reproduzida para os testes
const REGRA_AUTOMATICA = (quem: Colaborador, alvo: Colaborador): boolean => {
  if (quem.nivel <= alvo.nivel) return false;
  if (quem.nivel >= 3 && quem.loja === alvo.loja) return true;
  if (quem.nivel === 2 && quem.setor === alvo.setor) return true;
  return false;
};

// --- Rede de exemplo: uma loja com gerente, líder e dois balconistas ---
const GERENTE = pessoa('gerente', 3, { setor: 'Gerência' });
const LIDER = pessoa('lider', 2, { responsavelId: 'gerente' });
const ANA = pessoa('ana', 1, { responsavelId: 'lider' });
const PEDRO = pessoa('pedro', 1); // ainda não posicionado
const RH = pessoa('rh', 1, { setor: 'RH' });
const OUTRA_LOJA = pessoa('outra', 3, { loja: 'Descalvado', setor: 'Gerência' });

const REDE = [GERENTE, LIDER, ANA, PEDRO, RH, OUTRA_LOJA];

test('a cadeia sobe do subordinado até o topo', () => {
  expect(cadeiaAcimaDe(ANA, REDE).map((c) => c.id)).toEqual(['lider', 'gerente']);
  expect(cadeiaAcimaDe(LIDER, REDE).map((c) => c.id)).toEqual(['gerente']);
  expect(cadeiaAcimaDe(GERENTE, REDE)).toHaveLength(0);
});

test('a alçada vale para a cadeia inteira, não só para o chefe direto', () => {
  // O gerente não é o responsável DIRETO da Ana, mas responde por ela
  expect(respondePor(LIDER, ANA, REDE)).toBe(true);
  expect(respondePor(GERENTE, ANA, REDE)).toBe(true);

  // E não vale para baixo nem para o lado
  expect(respondePor(ANA, LIDER, REDE)).toBe(false);
  expect(respondePor(OUTRA_LOJA, ANA, REDE)).toBe(false);
});

// ============================================================
// O ORGANOGRAMA MANDA
// ============================================================

test('POSICIONADO: quem a cadeia não indica perde a alçada que a regra dava', () => {
  // Este é o ponto do pedido. O líder do Balcão aprovaria a Ana pela regra
  // automática (mesmo setor, um nível acima). Mas a Ana foi pendurada em
  // OUTRO líder — e a partir daí só a cadeia dela decide.
  const ANA_SOB_GERENTE = { ...ANA, responsavelId: 'gerente' };
  const rede = [GERENTE, LIDER, ANA_SOB_GERENTE, RH];

  // A regra automática, sozinha, deixaria o líder aprovar
  expect(REGRA_AUTOMATICA(LIDER, ANA_SOB_GERENTE)).toBe(true);

  // O organograma tira essa alçada dele
  expect(temAlcadaSobre(LIDER, ANA_SOB_GERENTE, rede, REGRA_AUTOMATICA)).toBe(false);
  expect(temAlcadaSobre(GERENTE, ANA_SOB_GERENTE, rede, REGRA_AUTOMATICA)).toBe(true);
});

test('NÃO POSICIONADO: a regra automática continua valendo', () => {
  // Pedro não está na cadeia. Sem esta rede de segurança, as horas dele
  // ficariam paradas até alguém arrastá-lo no quadro.
  expect(estaPosicionado(PEDRO)).toBe(false);
  expect(temAlcadaSobre(LIDER, PEDRO, REDE, REGRA_AUTOMATICA)).toBe(true);
  expect(temAlcadaSobre(GERENTE, PEDRO, REDE, REGRA_AUTOMATICA)).toBe(true);

  // Mas a regra automática segue com os limites dela
  expect(temAlcadaSobre(OUTRA_LOJA, PEDRO, REDE, REGRA_AUTOMATICA)).toBe(false);
});

test('RH, Diretoria e TI decidem por fora da cadeia', () => {
  expect(temAlcadaSobre(RH, ANA, REDE, REGRA_AUTOMATICA)).toBe(true);
  expect(temAlcadaSobre(RH, PEDRO, REDE, REGRA_AUTOMATICA)).toBe(true);
});

test('NINGUÉM decide a própria hora, nem no topo da cadeia', () => {
  // Nem quem cuida de pessoas, nem quem não tem ninguém acima
  expect(temAlcadaSobre(RH, RH, REDE, REGRA_AUTOMATICA)).toBe(false);
  expect(temAlcadaSobre(GERENTE, GERENTE, REDE, REGRA_AUTOMATICA)).toBe(false);
  expect(temAlcadaSobre(ANA, ANA, REDE, REGRA_AUTOMATICA)).toBe(false);
});

test('subordinado não aprova o próprio chefe', () => {
  const GERENTE_SOB_DIRETOR = { ...GERENTE, responsavelId: 'diretor' };
  const DIRETOR = pessoa('diretor', 4, { setor: 'Diretoria' });
  const rede = [DIRETOR, GERENTE_SOB_DIRETOR, LIDER, ANA];

  expect(temAlcadaSobre(ANA, GERENTE_SOB_DIRETOR, rede, REGRA_AUTOMATICA)).toBe(false);
  expect(temAlcadaSobre(LIDER, GERENTE_SOB_DIRETOR, rede, REGRA_AUTOMATICA)).toBe(false);
  expect(temAlcadaSobre(DIRETOR, GERENTE_SOB_DIRETOR, rede, REGRA_AUTOMATICA)).toBe(true);
});

// ============================================================
// CICLO: não pode ser criado, e não pode travar se aparecer
// ============================================================

test('não se pendura o chefe debaixo do próprio subordinado', () => {
  // Criar o ciclo deixaria os dois sem ninguém acima — e sem aprovador
  const r = podeSerResponsavelDe(ANA, GERENTE, REDE);
  expect(r.pode).toBe(false);
  expect(r.motivo).toContain('sem ninguém acima');

  expect(podeSerResponsavelDe(ANA, ANA, REDE).pode).toBe(false);

  // O que é legítimo continua passando
  expect(podeSerResponsavelDe(GERENTE, PEDRO, REDE).pode).toBe(true);
});

test('ciclo vindo do banco não trava o sistema', () => {
  // A tela impede criar, mas dado ruim pode existir. Se isto entrar em
  // recursão infinita, o navegador de quem abrir o RH morre.
  const A = pessoa('a', 2, { responsavelId: 'b' });
  const B = pessoa('b', 2, { responsavelId: 'a' });
  const ciclo = [A, B];

  expect(cadeiaAcimaDe(A, ciclo).length).toBeLessThan(5);
  expect(() => montarArvoreDaLoja('Pirassununga', ciclo)).not.toThrow();
  expect(temAlcadaSobre(A, B, ciclo, REGRA_AUTOMATICA)).toBe(true);
});

test('responsável que não existe mais não quebra a cadeia', () => {
  // Alguém desligado: o subordinado volta a cair na regra automática
  const ORFAO = pessoa('orfao', 1, { responsavelId: 'ja-foi-embora' });
  const rede = [GERENTE, LIDER, ORFAO];

  expect(cadeiaAcimaDe(ORFAO, rede)).toHaveLength(0);
  // Continua posicionado, então a cadeia manda — e a cadeia está vazia.
  // Sobra o RH, que é quem tem de reposicionar a pessoa.
  expect(temAlcadaSobre(LIDER, ORFAO, rede, REGRA_AUTOMATICA)).toBe(false);
  expect(temAlcadaSobre(RH, ORFAO, rede, REGRA_AUTOMATICA)).toBe(true);
});

// ============================================================
// A ÁRVORE POR LOJA
// ============================================================

test('a árvore da loja começa pelo nível mais alto', () => {
  const arvore = montarArvoreDaLoja('Pirassununga', REDE);
  const raizes = arvore.map((n) => n.colaborador.id);

  // Gerente encabeça; Pedro e o RH aparecem soltos por não terem responsável
  expect(raizes[0]).toBe('gerente');
  expect(raizes).toContain('pedro');

  const doGerente = arvore.find((n) => n.colaborador.id === 'gerente')!;
  expect(doGerente.subordinados.map((n) => n.colaborador.id)).toEqual(['lider']);
  // A contagem soma a cadeia inteira abaixo: líder + Ana
  expect(doGerente.totalAbaixo).toBe(2);
  expect(doGerente.subordinados[0].subordinados[0].colaborador.id).toBe('ana');
});

test('quem responde a alguém de OUTRA loja não some do quadro da loja dele', () => {
  // O caso real: a líder de Compras atua na rede toda e tem subordinados em
  // cinco unidades. Sem isto, eles sumiriam do quadro das próprias lojas.
  const LIDER_REDE = pessoa('lider-compras', 2, { loja: 'Rede', setor: 'Compras' });
  const COMPRADOR = pessoa('comprador-desc', 1, {
    loja: 'Descalvado',
    setor: 'Compras',
    responsavelId: 'lider-compras',
  });
  const rede = [LIDER_REDE, COMPRADOR];

  const arvore = montarArvoreDaLoja('Descalvado', rede);
  expect(arvore.map((n) => n.colaborador.id)).toContain('comprador-desc');

  // E a alçada dela sobre ele continua valendo, apesar das lojas diferentes
  expect(temAlcadaSobre(LIDER_REDE, COMPRADOR, rede, REGRA_AUTOMATICA)).toBe(true);
});

test('desligado não aparece no quadro', () => {
  const SAIU = pessoa('saiu', 1, { ativo: false, responsavelId: 'gerente' });
  const arvore = montarArvoreDaLoja('Pirassununga', [...REDE, SAIU]);
  const todosOsIds = JSON.stringify(arvore);

  expect(todosOsIds).not.toContain('saiu');
});

test('a lista de quem falta posicionar não cobra chefe de quem não precisa', () => {
  const faltando = semResponsavel(REDE).map((c) => c.id);

  expect(faltando).toContain('pedro');
  // Gerente ainda não tem chefe e precisa de um
  expect(faltando).toContain('gerente');
  // RH decide por fora da cadeia; cobrar um chefe para ele é ruído
  expect(faltando).not.toContain('rh');
  // Quem já está posicionado sai da lista
  expect(faltando).not.toContain('ana');
});

test('subordinados diretos ignoram os netos', () => {
  expect(subordinadosDiretos(GERENTE, REDE).map((c) => c.id)).toEqual(['lider']);
  expect(subordinadosDiretos(LIDER, REDE).map((c) => c.id)).toEqual(['ana']);
  expect(subordinadosDiretos(ANA, REDE)).toHaveLength(0);
});
