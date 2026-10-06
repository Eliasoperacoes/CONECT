/**
 * OS DOCUMENTOS DA PESSOA NO SINO E NO SELO (Elias, 06/10/2026): cada um
 * pelo nome, sem piscar ao abrir, e atualizados depois de assinar.
 */
import { test, expect } from 'bun:test';
import { itensDosDocumentos } from '../componentes/SinoWeb';

const ler = (caminho: string) => Bun.file(new URL(`../${caminho}`, import.meta.url)).text();

test('o sino diz QUAL documento: o holerite e o espelho com o mês', () => {
  const itens = itensDosDocumentos({ holerites: ['2026-09'], espelhos: ['2026-09', '2026-08'], advertencias: 1 });
  const frase = (id: string) => {
    const i = itens.find((x) => x.id === id)!;
    return `${i.quantidade} ${i.texto(i.quantidade)}`;
  };
  expect(frase('documentos-holerites')).toBe('1 holerite de setembro de 2026 para assinar');
  expect(frase('documentos-espelhos')).toBe('2 espelhos de ponto de agosto de 2026 e setembro de 2026 para assinar');
  // A advertência não se diz pelo nome: o sino fica à vista de quem estiver do lado
  expect(frase('documentos-ciencia')).toBe('1 documento do RH para dar ciência');
  // E todos levam a Meus documentos, onde se assina
  expect(new Set(itens.map((i) => i.tela))).toEqual(new Set(['meus_documentos']));
});

test('sem pendência, o item não tem número — e o sino não o mostra', () => {
  const itens = itensDosDocumentos({ holerites: [], espelhos: [], advertencias: 0 });
  expect(itens.every((i) => i.quantidade === 0)).toBe(true);
});

test('O ESPELHO NÃO PISCA: a conta espera os documentos chegarem', async () => {
  /*
    Antes da lista de assinados chegar, ela está vazia e o espelho de
    setembro parecia não assinado: a bolinha aparecia e sumia meio
    segundo depois.
  */
  const meuRH = await ler('componentes/MeuRH.tsx');
  expect(meuRH).toContain('espelhosParaAssinar(eu, carregado && batePonto(eu), hoje, espelhosAssinados)');
  expect(meuRH).toContain('setCarregado(true);');
});

test('ASSINAR E DAR CIÊNCIA AVISAM: o selo e o sino recontam na hora', async () => {
  const assinatura = await ler('servicos/assinatura.ts');
  // Holerite e espelho: os dois sucessos avisam
  expect(assinatura.split('avisarQueDocumentosMudaram();\n  return { sucesso: true, assinadoEm').length - 1).toBe(2);
  const rh = await ler('servicos/rh.ts');
  const ciencia = rh.slice(rh.indexOf('export const darCienciaNaAdvertencia'), rh.indexOf('export const darCienciaNaAdvertencia') + 1500);
  expect(ciencia).toContain('avisarQueDocumentosMudaram();');
  // E quem conta escuta, e reconta também ao entrar e sair de Meus documentos
  const app = await ler('App.tsx');
  expect(app).toContain('useEffect(() => ouvirMudancaDeDocumentos(() => setVersaoDosDocumentos((v) => v + 1)), []);');
  expect(app).toContain('[autenticado, colaboradorAtual.id, estouNaAbaEu, estouEmMeusDocumentos, versaoDosDocumentos]');
});
