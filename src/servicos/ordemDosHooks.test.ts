/**
 * NENHUM HOOK DEPOIS DE UM RETORNO ANTECIPADO.
 *
 * O botão roxo "Cadastro" do Banco de Horas deixava o app numa tela branca.
 * A ficha (`ModalCadastroColaborador`) fica montada o tempo todo e começa
 * com `if (!colaborador) return null` — e havia um `useEffect` DEPOIS
 * dessa linha. Fechada, a ficha rodava N hooks; aberta, N+1. O React não
 * aceita isso e derruba a árvore inteira, sem mensagem para quem usa.
 *
 * Nenhum teste de serviço pegava, porque o erro só existe na troca de
 * fechado para aberto. Esta varredura olha o corpo de cada componente:
 * depois de um `return` no nível de cima, não pode vir hook.
 */
import { test, expect } from 'bun:test';
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';

const PASTA = join(import.meta.dir, '../componentes');

/** Hooks chamados no nível de cima de um componente depois de um `return` antecipado. */
export function hooksDepoisDeRetorno(fonte: string): Array<{ linha: number; texto: string }> {
  const linhas = fonte.replace(/\r\n/g, '\n').split('\n');
  const achados: Array<{ linha: number; texto: string }> = [];
  let houveRetorno = false;

  linhas.forEach((l, i) => {
    // Linha sem recuo abre ou fecha um componente: zera a conta
    if (/^\S/.test(l)) houveRetorno = false;

    const retornoNaLinha = /^  if \(.*\)\s*return\b/.test(l);
    const retornoNoBloco =
      /^  if \(.*\)\s*\{?\s*$/.test(l) && /^\s*return\b/.test(linhas[i + 1] || '');
    if (retornoNaLinha || retornoNoBloco) houveRetorno = true;

    if (houveRetorno && /^  (const .*= )?(React\.)?use[A-Z]\w*\(/.test(l)) {
      achados.push({ linha: i + 1, texto: l.trim() });
    }
  });
  return achados;
}

test('a varredura acusa o hook depois do return (o defeito da ficha)', () => {
  const defeito = [
    'export const Ficha = ({ c }) => {',
    '  const [a, setA] = useState(0);',
    '  if (!c) return null;',
    '  useEffect(() => {}, [a]);',
    '  return <div />;',
    '};',
  ].join('\n');
  expect(hooksDepoisDeRetorno(defeito)).toEqual([{ linha: 4, texto: 'useEffect(() => {}, [a]);' }]);

  const certo = [
    'export const Ficha = ({ c }) => {',
    '  const [a, setA] = useState(0);',
    '  useEffect(() => {}, [a]);',
    '  if (!c) return null;',
    '  return <div />;',
    '};',
  ].join('\n');
  expect(hooksDepoisDeRetorno(certo)).toEqual([]);
});

test('nenhum componente chama hook depois de um retorno antecipado', () => {
  const problemas: string[] = [];
  for (const arquivo of readdirSync(PASTA).filter((f) => f.endsWith('.tsx'))) {
    const fonte = readFileSync(join(PASTA, arquivo), 'utf8');
    for (const { linha, texto } of hooksDepoisDeRetorno(fonte)) {
      problemas.push(`${arquivo}:${linha} ${texto}`);
    }
  }
  expect(problemas).toEqual([]);
});
