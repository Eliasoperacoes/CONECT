/**
 * AS NOTÍCIAS DA ÁREA, pelo servidor — GET /api/noticias?setor=Balcão
 *
 * O navegador não pode ler o feed da Agência Brasil direto (o site dela não
 * libera a leitura por outro endereço), então esta função busca, escolhe
 * pela área do setor (`escolherNoticias`, src/servicos/noticias.ts) e
 * devolve só o necessário, em JSON.
 *
 * O CACHE É DA VERCEL, 30 minutos na borda: a rede inteira abrindo o Início
 * vira um pedido à agência a cada meia hora por área, e não um por pessoa.
 * Sem dado pessoal aqui: entra o setor, sai notícia pública.
 */
import { FEEDS_DA_AGENCIA_BRASIL, lerFeed, escolherNoticias, areaDoSetor, AREAS_DE_NOTICIA } from '../src/servicos/noticias';

export async function GET(request: Request): Promise<Response> {
  const setor = new URL(request.url).searchParams.get('setor') || '';
  const area = areaDoSetor(setor);

  const feeds = await Promise.all(
    FEEDS_DA_AGENCIA_BRASIL.map(async (endereco) => {
      try {
        const resposta = await fetch(endereco, { signal: AbortSignal.timeout(8000) });
        return resposta.ok ? lerFeed(await resposta.text()) : [];
      } catch {
        return [];
      }
    })
  );
  const { daArea, noticias } = escolherNoticias(feeds.flat(), area);

  return Response.json(
    { area: AREAS_DE_NOTICIA[area].rotulo, daArea, noticias, fonte: 'Agência Brasil' },
    {
      headers: {
        // Meia hora na borda; enquanto renova, serve a anterior
        'Cache-Control': 'public, s-maxage=1800, stale-while-revalidate=3600',
      },
    }
  );
}
