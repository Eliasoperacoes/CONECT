/**
 * Verificação da leitura de nível da planilha — CONECTA
 *
 * A armadilha que motivou estes testes: a busca era por trecho contido, e
 * "Administrativo" contém "admin" E contém "ti". Quem escrevesse o cargo na
 * coluna de nível viraria TI — o nível mais alto da rede — sem nenhum aviso.
 *
 * Erro de preenchimento não pode virar acesso total em silêncio.
 */
import { test, expect } from 'bun:test';
import {
  NIVEL_COLABORADOR,
  NIVEL_LIDER_SETOR,
  NIVEL_GERENTE,
  NIVEL_DIRETORIA,
  NIVEL_TI,
  CARGOS_SUGERIDOS,
  SETORES,
  cuidaDePessoas,
  ehAdministrador,
} from '../tipos';
import { resolverNivelDaPlanilha, resolverSetorDaPlanilha } from './planilhaFuncionarios';

test('o número entra direto', () => {
  expect(resolverNivelDaPlanilha('1').nivel).toBe(NIVEL_COLABORADOR);
  expect(resolverNivelDaPlanilha('2').nivel).toBe(NIVEL_LIDER_SETOR);
  expect(resolverNivelDaPlanilha('3').nivel).toBe(NIVEL_GERENTE);
  expect(resolverNivelDaPlanilha('4').nivel).toBe(NIVEL_DIRETORIA);
  expect(resolverNivelDaPlanilha('5').nivel).toBe(NIVEL_TI);
});

test('o nome escrito também entra, com ou sem acento', () => {
  expect(resolverNivelDaPlanilha('Colaborador').nivel).toBe(NIVEL_COLABORADOR);
  expect(resolverNivelDaPlanilha('Líder de Setor').nivel).toBe(NIVEL_LIDER_SETOR);
  expect(resolverNivelDaPlanilha('lider').nivel).toBe(NIVEL_LIDER_SETOR);
  expect(resolverNivelDaPlanilha('GERENTE').nivel).toBe(NIVEL_GERENTE);
  expect(resolverNivelDaPlanilha('Diretoria').nivel).toBe(NIVEL_DIRETORIA);
  expect(resolverNivelDaPlanilha(' TI ').nivel).toBe(NIVEL_TI);
});

test('ADMINISTRATIVO NÃO VIRA TI', () => {
  // Contém "admin" e contém "ti". Com busca por trecho, esta linha dava
  // acesso total a um cargo de nível 1.
  const r = resolverNivelDaPlanilha('Administrativo');

  expect(r.nivel).toBe(NIVEL_COLABORADOR);
  expect(r.aviso).toBeTruthy();
  expect(r.aviso).toContain('Administrativo');
});

test('nenhum dos cargos da rede escala o nível por engano', () => {
  // Se alguém trocar as colunas, o pior que acontece é virar Colaborador
  for (const cargo of CARGOS_SUGERIDOS) {
    const r = resolverNivelDaPlanilha(cargo);
    expect(r.nivel).toBe(NIVEL_COLABORADOR);
  }
});

test('grafia desconhecida entra como Colaborador E avisa', () => {
  const r = resolverNivelDaPlanilha('chefe supremo');

  expect(r.nivel).toBe(NIVEL_COLABORADOR);
  // Entrar calado seria pior: ninguém conferiria a linha depois
  expect(r.aviso).toContain('não é um dos cinco');
});

test('coluna em branco não gera aviso: é o caso comum', () => {
  expect(resolverNivelDaPlanilha('').nivel).toBe(NIVEL_COLABORADOR);
  expect(resolverNivelDaPlanilha('').aviso).toBeUndefined();
  expect(resolverNivelDaPlanilha('   ').aviso).toBeUndefined();
});

// ============================================================
// SETOR: não pode virar Balcão em silêncio
// ============================================================

test('LOGÍSTICA é um setor da rede', () => {
  expect(resolverSetorDaPlanilha('Logística').setor).toBe('Logística');
  expect(resolverSetorDaPlanilha('logistica').setor).toBe('Logística');
  expect(resolverSetorDaPlanilha('Entregas').setor).toBe('Logística');
  expect(resolverSetorDaPlanilha('Motoboy').setor).toBe('Logística');
  expect(resolverSetorDaPlanilha('Logística').erro).toBeUndefined();
});

test('SETOR DESCONHECIDO FALHA, não vira Balcão calado', () => {
  // Era isto que mandava 32 pessoas para o Balcão sem ninguém ver — e o
  // setor decide quem aprova a jornada delas
  const r = resolverSetorDaPlanilha('Marketing');

  expect(r.erro).toBeTruthy();
  expect(r.erro).toContain('não existe na rede');
  // A mensagem tem que dizer o que serve, senão a pessoa fica adivinhando
  expect(r.erro).toContain('Logística');
  expect(r.erro).toContain('Balcão');
});

test('setor em branco também falha', () => {
  const r = resolverSetorDaPlanilha('');
  expect(r.erro).toContain('não informado');
});

test('os setores da rede continuam entrando', () => {
  for (const setor of SETORES) {
    const r = resolverSetorDaPlanilha(setor);
    expect(r.setor).toBe(setor);
    expect(r.erro).toBeUndefined();
  }
});

test('grafias do dia a dia continuam valendo', () => {
  expect(resolverSetorDaPlanilha('Vendas').setor).toBe('Balcão');
  expect(resolverSetorDaPlanilha('Almoxarifado').setor).toBe('Estoque');
  expect(resolverSetorDaPlanilha('Financeiro').setor).toBe('Tesouraria');
  expect(resolverSetorDaPlanilha('Recursos Humanos').setor).toBe('RH');
});

test('ESTÁGIO entra, com as grafias que a planilha usa', () => {
  // A planilha da rede escreve "Estagiário(a)"; a normalização come o
  // parêntese e o acento, então as duas formas chegam no mesmo setor
  expect(resolverSetorDaPlanilha('Estagiário(a)').setor).toBe('Estágio');
  expect(resolverSetorDaPlanilha('Estagiario').setor).toBe('Estágio');
  expect(resolverSetorDaPlanilha('Estágio').setor).toBe('Estágio');
  expect(resolverSetorDaPlanilha('Aprendiz').setor).toBe('Estágio');

  expect(resolverSetorDaPlanilha('Estagiário(a)').erro).toBeUndefined();
});

test('ADMINISTRATIVO entra como setor, e não escala o nível', () => {
  expect(resolverSetorDaPlanilha('Administrativo').setor).toBe('Administrativo');
  expect(resolverSetorDaPlanilha('Administração').setor).toBe('Administrativo');
  expect(resolverSetorDaPlanilha('ADM').setor).toBe('Administrativo');
  expect(resolverSetorDaPlanilha('Administrativo').erro).toBeUndefined();

  // A mesma palavra existe como cargo e agora como setor — mas na coluna de
  // NÍVEL ela continua não valendo nada, que é o que evita virar TI
  expect(resolverNivelDaPlanilha('Administrativo').nivel).toBe(NIVEL_COLABORADOR);
  expect(resolverNivelDaPlanilha('Administrativo').aviso).toBeTruthy();
});

test('GERÊNCIA é setor próprio, e não muda a autorização', () => {
  expect(resolverSetorDaPlanilha('Gerência').setor).toBe('Gerência');
  expect(resolverSetorDaPlanilha('Gerencia').setor).toBe('Gerência');
  expect(resolverSetorDaPlanilha('Gerente').setor).toBe('Gerência');
  expect(resolverSetorDaPlanilha('Gerência').erro).toBeUndefined();

  // Antes "Gerência" no setor caía em Diretoria — mandava todo gerente para
  // o setor da cúpula
  expect(resolverSetorDaPlanilha('Gerência').setor).not.toBe('Diretoria');

  // Na coluna de NÍVEL continua valendo 3: a alçada da loja, nem mais nem menos
  expect(resolverNivelDaPlanilha('Gerente').nivel).toBe(NIVEL_GERENTE);
  expect(resolverNivelDaPlanilha('Gerência').nivel).toBe(NIVEL_GERENTE);
});

test('o setor não concede autorização — quem concede é o nível', () => {
  // Um gerente no setor Gerência continua sem cuidar de pessoas; um
  // colaborador comum no RH cuida. É o desenho: setor diz onde a pessoa
  // trabalha, nível diz o que ela pode.
  expect(cuidaDePessoas({ nivel: NIVEL_GERENTE, setor: 'Gerência' })).toBe(false);
  expect(cuidaDePessoas({ nivel: NIVEL_COLABORADOR, setor: 'RH' })).toBe(true);
  expect(ehAdministrador({ nivel: NIVEL_GERENTE })).toBe(false);
});
