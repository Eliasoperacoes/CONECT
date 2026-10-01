/**
 * A FUNÇÃO DE SERVIDOR `apurar-ponto` (Supabase Edge Function, Deno).
 *
 * Roda toda madrugada, chamada pelo agendador do banco (pg_cron), e apura
 * os últimos dias da rede inteira: cria a falta, reapura o dia que se
 * resolveu, e transforma em pedido o dia fechado que nunca chegou à fila.
 * Quem decide é `planejarApuracao` — as mesmas regras do aplicativo. Este
 * arquivo só lê as tabelas, chama o plano e grava.
 *
 * NÃO EDITE O ARQUIVO DA PASTA `supabase/functions/apurar-ponto`. Ele é
 * GERADO a partir deste (`bun scripts/gerar-funcao-apurar.ts`), com as
 * regras embutidas, para ser colado no painel do Supabase como está. Há
 * teste conferindo que o gerado está em dia com o código.
 *
 * QUEM PODE CHAMAR: só quem tem o segredo `APURAR_SEGREDO` (o agendador o
 * guarda no cofre do banco). Ela usa a chave de serviço — enxerga e grava
 * tudo —, então a porta não pode ficar aberta. Chamar de novo não estraga
 * nada: o plano é idempotente.
 */
import { planejarApuracao, DIAS_REVISADOS } from './apurarPonto';
import { hojeEmBrasilia, deDataLocal, paraDataLocal } from '../servicos/apuracaoDoDia';
import {
  LinhaAjuste,
  LinhaColaborador,
  LinhaRegistroPonto,
  paraAjuste,
  paraColaboradorDaLinha,
  paraFeriado,
  paraJustificativa,
  paraLinhaAjuste,
  paraRegistroPonto,
} from '../servicos/linhasDoBanco';
import type { MapaDePermissoes } from '../servicos/permissoes';

declare const Deno: {
  env: { get(nome: string): string | undefined };
  serve(tratar: (req: Request) => Promise<Response>): void;
};

/**
 * A CHAVE DE SERVIÇO, nos dois formatos que o Supabase usa — o mesmo
 * cuidado da `enviar-aviso`: aceitar só um faria a função morrer calada no
 * dia em que o painel migrar o projeto.
 */
const chaveDeServico = (): string => {
  const antiga = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (antiga) return antiga;
  const novas = Deno.env.get('SUPABASE_SECRET_KEYS');
  if (novas) {
    try {
      const lista = JSON.parse(novas) as Record<string, string>;
      const primeira = lista.default ?? Object.values(lista)[0];
      if (primeira) return primeira;
    } catch {
      return novas;
    }
  }
  throw new Error('Sem chave de serviço no ambiente da função.');
};

const responder = (corpo: unknown, status = 200) =>
  new Response(JSON.stringify(corpo), { status, headers: { 'content-type': 'application/json' } });

/** A API do banco direto, sem biblioteca: são seis leituras e uma gravação. */
const banco = () => {
  const url = `${Deno.env.get('SUPABASE_URL')}/rest/v1`;
  const chave = chaveDeServico();
  const cabecalhos = { apikey: chave, Authorization: `Bearer ${chave}` };

  /**
   * TODAS as linhas, de mil em mil. O banco devolve no máximo mil por
   * pedido e não avisa que cortou: sem paginar, a apuração veria um mês
   * pela metade e criaria falta onde houve batida.
   */
  const ler = async <T>(caminho: string, opcional = false): Promise<T[]> => {
    const todas: T[] = [];
    for (let de = 0; ; de += 1000) {
      const pedir = () =>
        fetch(`${url}/${caminho}`, {
          headers: { ...cabecalhos, Range: `${de}-${de + 999}`, 'Range-Unit': 'items' },
        });
      /*
        "JWT issued at future" (401): o relógio de uma peça do Supabase
        segundos atrás do de outra. Passageiro — a segunda tentativa, na
        primeira simulação em produção, passou. A madrugada não pode
        falhar por isso: espera um pouco e tenta de novo, até três vezes.
      */
      let r = await pedir();
      for (let tentativa = 1; r.status === 401 && tentativa <= 3; tentativa++) {
        await new Promise((ok) => setTimeout(ok, 2000 * tentativa));
        r = await pedir();
      }
      /*
        TABELA QUE NÃO EXISTE, quando ela é opcional, é lista vazia — como
        no aplicativo. A de feriados cadastrados não existia na produção
        (01/10/2026): o app segue com os nacionais e municipais, que são
        calculados, e a primeira simulação parou aqui.
      */
      if (opcional && r.status === 404) return [];
      if (!r.ok) throw new Error(`Leitura de ${caminho.split('?')[0]}: ${r.status} ${await r.text()}`);
      const pagina = (await r.json()) as T[];
      todas.push(...pagina);
      if (pagina.length < 1000) return todas;
    }
  };

  /** Insere ou substitui pelo id, de 500 em 500. */
  const gravarAjustes = async (linhas: Record<string, unknown>[]): Promise<void> => {
    for (let i = 0; i < linhas.length; i += 500) {
      const r = await fetch(`${url}/ajustes_jornada?on_conflict=id`, {
        method: 'POST',
        headers: {
          ...cabecalhos,
          'Content-Type': 'application/json',
          Prefer: 'resolution=merge-duplicates,return=minimal',
        },
        body: JSON.stringify(linhas.slice(i, i + 500)),
      });
      if (!r.ok) throw new Error(`Gravação das apurações: ${r.status} ${await r.text()}`);
    }
  };

  return { ler, gravarAjustes };
};

Deno.serve(async (req) => {
  const segredo = Deno.env.get('APURAR_SEGREDO');
  if (!segredo || req.headers.get('x-apurar-segredo') !== segredo) {
    return responder({ erro: 'Não autorizado.' }, 401);
  }

  try {
    const hoje = hojeEmBrasilia();
    const primeiro = deDataLocal(hoje);
    primeiro.setDate(primeiro.getDate() - DIAS_REVISADOS - 1);
    const inicio = paraDataLocal(primeiro);

    const { ler, gravarAjustes } = banco();
    const [colaboradores, batidas, ausencias, feriados, ajustes, configuracoes] = await Promise.all([
      ler<LinhaColaborador>('colaboradores?select=*&ativo=eq.true&order=id'),
      ler<LinhaRegistroPonto>(`registros_ponto?select=*&data=gte.${inicio}&data=lt.${hoje}&order=id`),
      ler<Record<string, unknown>>(`justificativas_ausencia?select=*&estado=eq.aprovada&data_fim=gte.${inicio}&order=id`),
      // Os cadastrados; os nacionais e municipais a regra calcula sozinha
      ler<Record<string, unknown>>('feriados?select=*&order=id', true),
      ler<LinhaAjuste>(`ajustes_jornada?select=*&data=gte.${inicio}&order=id`),
      ler<{ permissoes_ferramentas: MapaDePermissoes | null }>('configuracoes?select=permissoes_ferramentas'),
    ]);

    const plano = planejarApuracao(
      {
        // A foto não importa à apuração
        colaboradores: colaboradores.map((l) => paraColaboradorDaLinha(l, '')),
        batidas: batidas.map(paraRegistroPonto),
        ausencias: ausencias.map(paraJustificativa),
        feriados: feriados.map(paraFeriado),
        ajustes: ajustes.map(paraAjuste),
        permissoes: configuracoes[0]?.permissoes_ferramentas ?? null,
      },
      { hoje, agora: new Date().toISOString(), novoId: () => `ajuste-${crypto.randomUUID()}` }
    );

    /**
     * SIMULAR ANTES DE LIGAR. Com `?simular=1` nada é gravado: a resposta
     * lista o que seria — quem, que dia, o quê. A primeira madrugada
     * revisa 35 dias, e um dia fechado cuja apuração nunca chegou ao banco
     * vira pedido na fila do líder; melhor ver a lista antes do que
     * descobrir pela fila cheia.
     */
    const simular = new URL(req.url).searchParams.has('simular');
    if (!simular) await gravarAjustes(plano.gravar.map(paraLinhaAjuste));

    const nomes = new Map(colaboradores.map((c) => [c.id, c.nome]));
    const resultado = {
      ok: true,
      simulacao: simular,
      hoje,
      revisados: `${inicio} a ${hoje}`,
      ...plano.resumo,
      // O que veio do banco: "nada a gravar" só convence se houve o que ler
      lidos: {
        colaboradores: colaboradores.length,
        batidas: batidas.length,
        ausencias: ausencias.length,
        feriados: feriados.length,
        apuracoes: ajustes.length,
      },
      gravados: simular ? 0 : plano.gravar.length,
      novosNaFila: plano.novosNaFila.length,
      ...(simular
        ? {
            seriaGravado: plano.gravar.map(
              (a) => `${nomes.get(a.colaboradorId) ?? a.colaboradorId} · ${a.data} · ${a.tipo} ${a.minutos}min · ${a.estado}`
            ),
          }
        : {}),
    };
    console.log('Apuração da madrugada:', JSON.stringify(resultado));
    return responder(resultado);
  } catch (e) {
    console.error('Apuração da madrugada falhou:', e);
    return responder({ erro: String(e instanceof Error ? e.message : e) }, 500);
  }
});
