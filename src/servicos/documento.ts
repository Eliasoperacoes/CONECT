/**
 * Documentos impressos — CONECTA / Malachias Autopeças
 *
 * O QUE UM PAPEL DA MALACHIAS PARECE, escrito num lugar só.
 *
 * Espelho de ponto e escala de folgas nasceram separados, cada um com o
 * seu HTML, e ficaram parecendo de empresas diferentes: um com cabeçalho
 * de 18px e linha preta, outro com título de 30px, cinzas claros e
 * etiquetas arredondadas. Lado a lado na mesa do RH, não davam a impressão
 * de sair do mesmo sistema.
 *
 * Isso não é gosto. Documento de pessoal é assinado, arquivado e às vezes
 * mostrado para fora — e um conjunto que não se parece perde a cara de
 * documento oficial.
 *
 * Então o estilo e as peças de montagem moram AQUI, e cada tela traz só o
 * miolo. Papel novo nasce igual aos outros sem ninguém ter de lembrar
 * disso.
 */

/** A folha: retrato para listas, paisagem para grades largas. */
export type OrientacaoPapel = 'retrato' | 'paisagem';

/**
 * O estilo comum.
 *
 * Preto no texto, cinza no apoio, régua preta sob o cabeçalho, número em
 * fonte de máquina. É o que o espelho de ponto já usava, e virou a regra
 * por ser o documento que mais sai daqui.
 */
export const ESTILO_DOCUMENTO = `
  * { box-sizing: border-box; }
  body {
    font-family: system-ui, -apple-system, 'Segoe UI', Arial, sans-serif;
    color: #111; margin: 0; padding: 16px; background: #fff;
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }
  .folha { max-width: 1000px; margin: 0 auto 32px; page-break-after: always; }
  .folha:last-child { page-break-after: auto; }

  .topo {
    display: flex; justify-content: space-between; align-items: flex-start;
    border-bottom: 2px solid #111; padding-bottom: 8px; margin-bottom: 12px;
  }
  .topo h1 { font-size: 18px; margin: 0; letter-spacing: 1px; }
  .empresa { margin: 2px 0 0; font-size: 12px; color: #444; }
  .periodo { font-size: 12px; text-align: right; color: #444; }

  table { width: 100%; border-collapse: collapse; }
  .grade { font-size: 11px; }
  .grade th {
    background: #eee; border: 1px solid #999; padding: 5px 4px;
    font-size: 10px; text-transform: uppercase; text-align: left;
  }
  .grade td { border: 1px solid #bbb; padding: 5px 6px; vertical-align: top; }
  .grade .centro { text-align: center; }
  .ficha { margin-bottom: 12px; font-size: 12px; }
  .ficha td { border: 1px solid #bbb; padding: 5px 8px; width: 50%; }

  .hora, .num { font-family: ui-monospace, Consolas, monospace; }
  .num { text-align: right; padding-right: 8px; }
  .neg { color: #b00020; }
  .vazio td, .vazio { color: #999; }
  .nota { font-size: 10px; color: #555; margin-top: 10px; }

  .assinaturas {
    display: flex; gap: 48px; margin-top: 44px; font-size: 11px; text-align: center;
  }
  .assinaturas div { flex: 1; }
  .linha { display: block; border-top: 1px solid #111; margin-bottom: 4px; }

  .rodape {
    margin-top: 22px; padding-top: 8px; border-top: 1px solid #bbb;
    font-size: 10px; color: #555; display: flex;
    justify-content: space-between; gap: 12px;
  }
`;

/**
 * O cabeçalho de toda folha.
 *
 * Título à esquerda, empresa embaixo dele, período à direita. A régua
 * preta embaixo é o que dá cara de documento — sem ela o papel parece uma
 * página de site impressa.
 */
export const cabecalho = (dados: {
  titulo: string;
  subtitulo?: string;
  periodo?: string;
}): string => `
  <div class="topo">
    <div>
      <h1>${dados.titulo}</h1>
      <p class="empresa">Malachias Autopeças${
        dados.subtitulo ? ` · ${dados.subtitulo}` : ''
      }</p>
    </div>
    ${dados.periodo ? `<div class="periodo">${dados.periodo}</div>` : ''}
  </div>`;

/** As linhas de assinatura. Documento de pessoal costuma precisar delas. */
export const assinaturas = (rotulos: string[]): string =>
  rotulos.length === 0
    ? ''
    : `<div class="assinaturas">${rotulos
        .map((r) => `<div><span class="linha"></span>${r}</div>`)
        .join('')}</div>`;

export const rodape = (esquerda: string): string =>
  `<div class="rodape"><span>${esquerda}</span><span>CONECTA · Malachias Autopeças</span></div>`;

/**
 * A folha inteira, pronta para abrir numa janela e imprimir.
 *
 * `estiloExtra` existe para o que é só daquele papel — largura de uma
 * coluna, um destaque pontual. O que for repetir em dois documentos sobe
 * para `ESTILO_DOCUMENTO`, senão os dois voltam a divergir.
 */
export const montarDocumento = (dados: {
  titulo: string;
  corpo: string;
  orientacao?: OrientacaoPapel;
  estiloExtra?: string;
}): string => {
  const papel = dados.orientacao === 'paisagem' ? 'A4 landscape' : 'A4 portrait';

  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8">
<title>${dados.titulo}</title>
<style>${ESTILO_DOCUMENTO}${dados.estiloExtra || ''}
  @media print {
    body { padding: 0; }
    @page { size: ${papel}; margin: 12mm; }
  }
</style></head><body>${dados.corpo}</body></html>`;
};

/**
 * Abre o documento numa janela à parte e manda imprimir.
 *
 * Numa janela, e não na mesma aba: a pessoa volta para onde estava com um
 * toque, e o sistema não recarrega atrás do papel.
 */
export const imprimirDocumento = (html: string): boolean => {
  const janela = window.open('', '_blank');
  if (!janela) return false;

  janela.document.write(html);
  janela.document.close();
  janela.focus();
  janela.print();
  return true;
};

/** Hoje, em DD/MM/AAAA, para a linha de emissão. */
export const emitidoHoje = (): string => {
  const d = new Date();
  const dois = (n: number) => String(n).padStart(2, '0');
  return `${dois(d.getDate())}/${dois(d.getMonth() + 1)}/${d.getFullYear()}`;
};
