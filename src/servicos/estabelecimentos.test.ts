/**
 * O CNPJ DA FICHA É UM DOS ESTABELECIMENTOS (Elias, 07/10/2026: "somente 2
 * CNPJs registram funcionários", e a edição manual e os novos seguem a mesma
 * regra). Sem estabelecimentos cadastrados, vale a regra de antes.
 */
import { test, expect } from 'bun:test';
import { cnpjDaFichaValido, soDigitos } from './estabelecimentos';

const DOIS = [
  { cnpj: '11222333000144', razaoSocial: 'Malachias Autopeças Ltda', local: 'Pirassununga' },
  { cnpj: '55666777000188', razaoSocial: 'Malachias Comércio Ltda', local: 'Descalvado' },
];

test('com estabelecimentos: só vale um deles — com ou sem pontuação; vazio ou outro, não', () => {
  expect(cnpjDaFichaValido('11.222.333/0001-44', DOIS)).toBe(true);
  expect(cnpjDaFichaValido('55666777000188', DOIS)).toBe(true);
  expect(cnpjDaFichaValido('', DOIS)).toBe(false);
  expect(cnpjDaFichaValido(undefined, DOIS)).toBe(false);
  expect(cnpjDaFichaValido('99.888.777/0001-66', DOIS)).toBe(false);
});

test('sem estabelecimentos (antes do cadastro, modo local): a regra de antes, qualquer um ou vazio', () => {
  expect(cnpjDaFichaValido('', [])).toBe(true);
  expect(cnpjDaFichaValido('99.888.777/0001-66', [])).toBe(true);
  expect(soDigitos('11.222.333/0001-44')).toBe('11222333000144');
});

test('o cadastro da pessoa usa a lista e a regra — escolha obrigatória, e o CNPJ antigo não some calado', async () => {
  const modal = await Bun.file(new URL('../componentes/ModalCadastroColaborador.tsx', import.meta.url)).text();
  expect(modal).toContain('carregarEstabelecimentos().then((lista) => vivo && setEstabelecimentos(lista));');
  expect(modal).toContain("if (!cnpjDaFichaValido(form.cnpj, estabelecimentos)) {\n      setErro('Escolha o CNPJ em que a pessoa está registrada.');");
  expect(modal).toContain('{estabelecimentos.length > 0 ? (\n              <select\n                id="cad-cnpj"');
  expect(modal).toContain('(não cadastrado — escolha outro)');
});
