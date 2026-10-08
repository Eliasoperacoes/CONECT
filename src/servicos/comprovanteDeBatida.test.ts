/**
 * O COMPROVANTE DA BATIDA: só da batida do trabalhador, com a hora
 * REGISTRADA (não a corrigida), e todos os campos da portaria.
 */
import { test, expect } from 'bun:test';
import {
  temComprovante,
  montarComprovante,
  linhasDoComprovante,
  formatarCnpj,
  codigoEmBlocos,
  nomeDoArquivo,
  gerarPdfDoComprovante,
  TITULO_DO_COMPROVANTE,
} from './comprovanteDeBatida';
import type { RegistroPonto } from '../tipos';

const BATIDA: RegistroPonto = {
  id: 'r1',
  colaboradorId: 'ana',
  data: '2026-10-06',
  tipo: 'entrada',
  horario: '2026-10-06T10:31:07.000Z',
  horaFormatada: '07:31',
  metodo: 'qrcode',
  loja: 'Pirassununga',
  criadoEm: '2026-10-06T10:31:07.000Z',
  nsr: 42,
  registradoEm: '2026-10-06T10:31:07.000Z',
  cnpjEmpregador: '12345678000190',
  codigoVerificacao: 'a'.repeat(64),
};

test('só a batida do trabalhador, já carimbada, tem comprovante', () => {
  expect(temComprovante(BATIDA)).toBe(true);
  expect(temComprovante({ ...BATIDA, metodo: 'codigo_manual' })).toBe(true);
  // Correção e preenchimento saem no espelho, com quem corrigiu — não são batida
  expect(temComprovante({ ...BATIDA, metodo: 'ajuste_rh' })).toBe(false);
  expect(temComprovante({ ...BATIDA, metodo: 'preenchimento_turno' })).toBe(false);
  // Sem o carimbo do banco (modo local, antes do SQL), não há o que comprovar
  expect(temComprovante({ ...BATIDA, nsr: undefined })).toBe(false);
  expect(temComprovante({ ...BATIDA, codigoVerificacao: undefined })).toBe(false);
});

test('o comprovante tem todos os campos da portaria, e a hora é a REGISTRADA', () => {
  // O RH corrigiu o horário depois: o comprovante continua com o da batida
  const corrigida = { ...BATIDA, horario: '2026-10-06T10:00:00.000Z', horaFormatada: '07:00' };
  const d = montarComprovante(corrigida, { nome: 'Ana Paula Ribeiro', cpf: '52998224725' });
  expect(Object.fromEntries(linhasDoComprovante(d))).toEqual({
    NSR: '000000042',
    Empregador: 'Malachias Autopeças',
    CNPJ: '12.345.678/0001-90',
    Local: 'Loja Pirassununga',
    Trabalhador: 'Ana Paula Ribeiro',
    CPF: '529.982.247-25',
    Data: '06/10/2026',
    Hora: '07:31:07',
    'Marcação': 'Entrada',
    Registro: 'QR da loja',
    'REP-P (INPI)': 'Não informado (registro em andamento)',
  });
  expect(d.codigo).toBe('a'.repeat(64));
});

test('ART. 79: o título letra por letra, a razão social do CNPJ da batida e o INPI do REP-P', () => {
  expect(TITULO_DO_COMPROVANTE).toBe('Comprovante de Registro de Ponto do Trabalhador');
  const d = montarComprovante(BATIDA, { nome: 'Ana', cpf: '52998224725' }, {
    razaoSocial: 'R T MALACHIAS AUTO PECAS LTDA',
    inpi: 'BR 51 2026 000123-4',
  });
  const linhas = Object.fromEntries(linhasDoComprovante(d));
  // São dois CNPJs: o empregador é o da batida, não um nome fixo
  expect(linhas.Empregador).toBe('R T MALACHIAS AUTO PECAS LTDA');
  // O INPI só com os dígitos, como no AFD
  expect(linhas['REP-P (INPI)']).toBe('5120260001234');
});

test('o hash na tela é o do AFD, com as letras como estão gravadas', () => {
  expect(codigoEmBlocos('abcdef0123456789')).toBe('abcd ef01 2345 6789');
});

test('sem CNPJ na ficha ou sem CPF, o comprovante diz que falta — não inventa', () => {
  const d = montarComprovante({ ...BATIDA, cnpjEmpregador: '' }, { nome: 'Bia', cpf: null });
  const linhas = Object.fromEntries(linhasDoComprovante(d));
  expect(linhas.CNPJ).toBe('Não informado na ficha');
  expect(linhas.CPF).toBe('Não informado');
});

test('formatos: CNPJ, código em blocos e nome do arquivo', () => {
  expect(formatarCnpj('12345678000190')).toBe('12.345.678/0001-90');
  expect(formatarCnpj('123')).toBe('');
  const d = montarComprovante(BATIDA, { nome: 'Ana', cpf: '52998224725' });
  expect(nomeDoArquivo(d)).toBe('Comprovante de ponto 06-10-2026 07h31 NSR 000000042.pdf');
});

test('o PDF sai, e é um PDF', async () => {
  const pdf = await gerarPdfDoComprovante(montarComprovante(BATIDA, { nome: 'Ana Paula Ribeiro', cpf: '52998224725' }));
  expect(new TextDecoder().decode(pdf.slice(0, 5))).toBe('%PDF-');
  expect(pdf.length).toBeGreaterThan(1000);
});

test('O PRIMEIRO ACESSO PEDE O CPF, e quem já tem senha mas não tem CPF também passa por lá', async () => {
  const app = await Bun.file(new URL('../App.tsx', import.meta.url)).text();
  // Sem CPF, a tela do primeiro acesso — só com o CPF, se a senha já é própria
  expect(app).toContain("if (precisaTrocarSenha || situacaoDoCpf === 'falta') {");
  expect(app).toContain("pedeCpf={situacaoDoCpf === 'falta'}");
  // Sem resposta do banco (sem rede, SQL não rodado), ninguém fica barrado
  expect(app).toContain("if (vivo) setSituacaoDoCpf(cpf || indisponivel ? 'tem' : 'falta');");
  // E o CPF é conferido antes de ir ao banco, que confere de novo
  const tela = await Bun.file(new URL('../componentes/TelaDefinirSenha.tsx', import.meta.url)).text();
  expect(tela).toContain("if (pedeCpf && !cpfValido(cpf)) return setErro('CPF inválido. Confira os números.');");
  const sql = await Bun.file(new URL('../../supabase/cpf-e-comprovante.sql', import.meta.url)).text();
  expect(sql).toContain('if not public.cpf_valido(d) then');
  // A correção não apaga o comprovante: o gatilho devolve o carimbo original
  expect(sql).toContain('new.codigo_verificacao := old.codigo_verificacao;');
});

test('O CPF É PEDIDO UMA VEZ SÓ, no web ou no celular, e a tela nunca prende ninguém (06/10/2026)', async () => {
  const nuvem = await Bun.file(new URL('./nuvem.ts', import.meta.url)).text();
  const obter = nuvem.slice(nuvem.indexOf('async obterMeuCpf('), nuvem.indexOf('async registrarMeuCpf('));
  // Quem é "eu" sai do login, e não do colaborador que a tela tem na mão
  expect(obter).toContain('await supabase.auth.getUser()');
  expect(obter).toContain(".eq('auth_user_id', sessao.user.id)");
  expect(obter).not.toContain('colaboradorId');
  // "Seu CPF já está cadastrado" é sucesso: a pessoa tem CPF
  expect(nuvem).toContain("error.message.startsWith('Seu CPF já está cadastrado')) return { sucesso: true };");
  // E a tela tem saída
  const app = await Bun.file(new URL('../App.tsx', import.meta.url)).text();
  expect(app).toContain('aoSair={async () => {');
  const tela = await Bun.file(new URL('../componentes/TelaDefinirSenha.tsx', import.meta.url)).text();
  expect(tela).toContain('id="botao-sair-primeiro-acesso"');
});

test('SÓ QUEM BATE PONTO PRECISA DE CPF — a conta ADM, a diretoria e a gerência entram sem (06/10/2026)', async () => {
  /*
    O Elias tem duas contas: a de uso (bate ponto, tem o CPF) e a ADM. O
    CPF é único, então a ADM nunca poderia ter o mesmo — e ficava presa
    na tela do CPF. O CPF existe para o comprovante da batida.
  */
  const app = await Bun.file(new URL('../App.tsx', import.meta.url)).text();
  expect(app).toContain('const quemBatePonto = batePonto(colaboradorAtual);');
  expect(app).toContain("if (!quemBatePonto) {\n      setSituacaoDoCpf('tem');");
  // E pelos níveis padrão, quem não bate é o administrador, a diretoria e a gerência
  const { permissoesPadrao } = await import('./ferramentas');
  const { podeUsarComMapa } = await import('./permissoes');
  const mapa = permissoesPadrao();
  const bate = (nivel: number, setor: string) => podeUsarComMapa('ponto', { id: 'x', nome: 'x', nivel, setor } as any, mapa);
  expect([bate(5, 'TI'), bate(4, 'Diretoria'), bate(3, 'Gerência')]).toEqual([false, false, false]);
  expect([bate(2, 'RH'), bate(1, 'Balcão')]).toEqual([true, true]);
});

test('ART. 80, III: os comprovantes dos últimos dias saem das ORIGINAIS, da mais nova à mais antiga', async () => {
  const { comprovantesRecentes, DIAS_DOS_COMPROVANTES } = await import('./comprovanteDeBatida');
  const original = (nsr: number, quando: string, extra: Record<string, unknown> = {}) => ({
    nsr, colaborador_id: 'ana', registrado_em: quando, data: quando.slice(0, 10), loja: 'Pirassununga',
    metodo: 'qrcode', cnpj_empregador: '05041606000199', codigo_verificacao: 'b'.repeat(64),
    registro_id: `r${nsr}`, tipo_pedido: 'entrada', fora_da_jornada: null, ...extra,
  });
  const agora = new Date('2026-10-08T15:00:00.000Z');
  const lista = comprovantesRecentes(
    [
      original(1, '2026-09-30T10:00:00.000Z'), // 8 dias: fora da janela
      original(2, '2026-10-06T10:31:00.000Z'), // anteontem: dentro (o mínimo da Portaria são 48 h)
      original(3, '2026-10-07T20:58:15.000Z', { tipo_pedido: 'saida', registro_id: 'corrigida-pelo-rh' }),
      original(4, '2026-10-07T20:58:40.000Z', { tipo_pedido: null, registro_id: null, fora_da_jornada: 'jornada_completa' }),
    ],
    agora
  );
  expect(DIAS_DOS_COMPROVANTES).toBeGreaterThanOrEqual(2);
  expect(lista.map((r) => r.nsr)).toEqual([4, 3, 2]);
  // Toda original da pessoa tem comprovante — inclusive a corrigida depois
  expect(lista.every(temComprovante)).toBe(true);
  // A que entrou na jornada não se diz "fora da jornada"; a que ficou fora, sim
  const [fora, saida] = lista;
  expect(montarComprovante(saida, { nome: 'Ana' }).marcacao).toBe('Saída');
  expect(montarComprovante(fora, { nome: 'Ana' }).marcacao).toBe('Marcação fora da jornada');
});
