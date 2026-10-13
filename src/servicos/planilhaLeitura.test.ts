/**
 * A PLANILHA DO RH É LIDA DE VERDADE (planilhaFuncionarios.ts) — com a
 * biblioteca 0.20.3 do site da SheetJS, carregada só na hora (laudo de
 * 13/10/2026, item 7). Monta um .xlsx real, com acento e as colunas do
 * modelo, e passa pela mesma função que a tela de importação usa.
 */
import { test, expect } from 'bun:test';
import * as XLSX from 'xlsx';
import { processarArquivoPlanilha } from './planilhaFuncionarios';

const planilha = (linhas: Record<string, string>[], nome = 'funcionarios.xlsx'): File => {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(linhas), 'Funcionários');
  const bytes = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
  return new File([bytes], nome);
};

test('a versão é a corrigida (0.20.3), e não a 0.18.5 do npm', () => {
  expect(XLSX.version).toBe('0.20.3');
});

test('lê nome com acento, login, cargo e loja de um .xlsx de verdade', async () => {
  const r = await processarArquivoPlanilha(
    planilha([
      { 'Nome Completo': 'Ana Conceição', 'Login de Acesso': 'ana.conceicao', 'Cargo / Função': 'Vendedor(a)', 'Loja / Filial': 'Pirassununga', Setor: 'Balcão', Nível: 'Colaborador' },
      { 'Nome Completo': 'Bruno Tavares', 'Login de Acesso': 'bruno.tavares', 'Cargo / Função': 'Estoquista', 'Loja / Filial': 'Leme', Setor: 'Estoque', Nível: 'Colaborador' },
    ]),
    []
  );
  expect(r.totalLinhas).toBe(2);
  expect(r.linhasValidas).toBe(2);
  expect(r.novosCadastros).toBe(2);
  const ana = r.linhas.find((l: any) => l.dados?.login === 'ana.conceicao') as any;
  expect(ana?.dados?.nome).toBe('Ana Conceição');
});

test('planilha vazia continua recusada com o aviso de sempre', async () => {
  await expect(processarArquivoPlanilha(planilha([]), [])).rejects.toThrow('A planilha está vazia');
});
