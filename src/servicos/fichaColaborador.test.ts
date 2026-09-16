/**
 * Verificação da ficha do colaborador — CONECTA
 *
 * O que motivou: o CNPJ entrou no cadastro e no formulário, e não apareceu
 * em mais lugar nenhum. O espelho de ponto — que é documento trabalhista —
 * saía identificando a pessoa sem dizer contra qual empregador a jornada
 * corria. Estes testes existem para que campo novo no cadastro não fique
 * outra vez preso ao formulário.
 */
import { test, expect } from 'bun:test';
import { Colaborador } from '../tipos';
import {
  montarFicha,
  linhasDeIdentificacao,
  resumoDaFicha,
  contatoEmLinha,
  formatarJornada,
} from './fichaColaborador';

const pessoa = (extras: Partial<Colaborador> = {}): Colaborador => ({
  id: 'c1',
  nome: 'Accacio Lopes Filho',
  login: 'accacio',
  cargo: 'Balconista',
  setor: 'Balcão',
  loja: 'Pirassununga',
  nivel: 1,
  foto: '',
  presenca: 'disponivel',
  vistoPorUltimo: 'agora',
  ativo: true,
  ...extras,
});

test('a ficha carrega os dados individuais, não só nome e cargo', () => {
  const campos = montarFicha(
    pessoa({
      matricula: '1042',
      cnpj: '12.345.678/0001-90',
      dataAdmissao: '2019-03-04',
      telefone: '(19) 99999-0000',
      email: 'accacio@malachias.com.br',
      ramal: '212',
    })
  );

  const valorDe = (chave: string) => campos.find((c) => c.chave === chave)?.valor;

  expect(valorDe('nome')).toBe('Accacio Lopes Filho');
  expect(valorDe('matricula')).toBe('1042');
  expect(valorDe('cnpj')).toBe('12.345.678/0001-90');
  expect(valorDe('admissao')).toBe('04/03/2019');
  expect(valorDe('telefone')).toBe('(19) 99999-0000');
  expect(valorDe('email')).toBe('accacio@malachias.com.br');
  expect(valorDe('ramal')).toBe('212');
});

test('campo em branco some da ficha comum e aparece na de conferência', () => {
  const semDados = pessoa();

  // No quadro de equipe, uma ficha cheia de "—" não informa nada
  expect(montarFicha(semDados).some((c) => c.chave === 'cnpj')).toBe(false);

  // Para quem corrige o cadastro, o vazio É a informação
  const completa = montarFicha(semDados, { incluirVazios: true });
  expect(completa.some((c) => c.chave === 'cnpj')).toBe(true);
  expect(completa.find((c) => c.chave === 'cnpj')?.valor).toBe('');
});

test('a identificação de documento traz sempre os mesmos campos', () => {
  // Mesmo sem nada preenchido: num documento trabalhista, o campo em branco
  // também precisa aparecer — mostra que falta cadastrar
  const chaves = linhasDeIdentificacao(pessoa()).map((c) => c.chave);

  expect(chaves).toContain('nome');
  expect(chaves).toContain('matricula');
  expect(chaves).toContain('cnpj');
  expect(chaves).toContain('cargo');
  expect(chaves).toContain('loja');
  expect(chaves).toContain('admissao');
});

test('telefone e e-mail vêm marcados, para a tela poder escondê-los', () => {
  const campos = montarFicha(
    pessoa({ telefone: '(19) 99999-0000', email: 'a@b.com', matricula: '1042' })
  );

  expect(campos.find((c) => c.chave === 'telefone')?.sensivel).toBe(true);
  expect(campos.find((c) => c.chave === 'email')?.sensivel).toBe(true);
  // Matrícula é dado funcional, não contato — não pode ser filtrada junto
  expect(campos.find((c) => c.chave === 'matricula')?.sensivel).toBeFalsy();
});

test('o resumo de card identifica a pessoa pela matrícula', () => {
  // Nome se repete na rede; matrícula não
  expect(resumoDaFicha(pessoa({ matricula: '1042' }))).toBe(
    'Matrícula 1042 · Balconista · Balcão · Pirassununga'
  );

  // Sem matrícula, não sobra um "Matrícula" solto
  expect(resumoDaFicha(pessoa())).toBe('Balconista · Balcão · Pirassununga');
});

test('o contato sai na ordem em que se procura a pessoa', () => {
  expect(contatoEmLinha(pessoa({ ramal: '212', telefone: '(19) 99999-0000' }))).toBe(
    'Ramal 212 · (19) 99999-0000'
  );
  expect(contatoEmLinha(pessoa())).toBe('');
});

test('jornada vira hora lida por gente', () => {
  expect(formatarJornada(480)).toBe('8h');
  expect(formatarJornada(450)).toBe('7h30');
  expect(formatarJornada(undefined)).toBe('');
  expect(formatarJornada(0)).toBe('');
});

test('a data de admissão não inverte dia e mês', () => {
  // 04/03 e 03/04 são admissões diferentes, e isso conta tempo de casa
  expect(montarFicha(pessoa({ dataAdmissao: '2019-03-04' })).find((c) => c.chave === 'admissao')
    ?.valor).toBe('04/03/2019');
});
