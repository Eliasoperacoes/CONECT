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
import { planejarApuracao, decidirDiaNoServidor, DIAS_REVISADOS } from './apurarPonto';
import { hojeEmBrasilia, deDataLocal, paraDataLocal } from '../servicos/apuracaoDoDia';
import { mesAnterior, diasDoMes } from '../servicos/compensacaoDoSabado';
import {
  LinhaAjuste,
  LinhaColaborador,
  LinhaCompensacao,
  paraCompensacao,
  paraLinhaCompensacao,
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

/**
 * A CHAVE PÚBLICA, nos dois formatos — a mesma da `enviar-aviso`. Com ela
 * e a sessão de quem chama, o banco responde COMO aquela pessoa: é assim
 * que a alçada é conferida pela regra do banco, sem cópia aqui.
 */
const chavePublica = (): string => {
  const antiga = Deno.env.get('SUPABASE_ANON_KEY');
  if (antiga) return antiga;
  const novas = Deno.env.get('SUPABASE_PUBLISHABLE_KEYS');
  if (novas) {
    try {
      const lista = JSON.parse(novas) as Record<string, string>;
      const primeira = lista.default ?? Object.values(lista)[0];
      if (primeira) return primeira;
    } catch {
      return novas;
    }
  }
  throw new Error('Sem chave pública no ambiente da função.');
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
  /** As tabelas opcionais que não existem no banco: nelas não se grava. */
  const ausentes = new Set<string>();

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
      if (opcional && r.status === 404) {
        ausentes.add(caminho.split('?')[0]);
        return [];
      }
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

  /** O fechamento do saldo de compensação: insere ou substitui por pessoa e mês. */
  const gravarCompensacoes = async (linhas: Record<string, unknown>[]): Promise<void> => {
    if (linhas.length === 0 || ausentes.has('compensacao_sabado')) return;
    const r = await fetch(`${url}/compensacao_sabado?on_conflict=colaborador_id,mes`, {
      method: 'POST',
      headers: {
        ...cabecalhos,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify(linhas.map((l) => ({ ...l, atualizado_em: new Date().toISOString() }))),
    });
    if (!r.ok) throw new Error(`Gravação da compensação do sábado: ${r.status} ${await r.text()}`);
  };

  return { ler, gravarAjustes, gravarCompensacoes, ausentes };
};

/**
 * UM DIA SÓ, pedido pelo APLICATIVO — a saída de quem bateu, ou a correção
 * do RH e do líder. Entra pela sessão de quem chama, e não pelo segredo:
 *
 *   - o próprio dia, sem correção: qualquer um apura o seu;
 *   - o dia de outra pessoa, ou uma correção: o banco confere a alçada
 *     (`posso_decidir_jornada`) com a sessão de quem pediu.
 *
 * Decide com as linhas do banco e grava com a chave de serviço; devolve a
 * apuração para o aparelho atualizar a tela e avisar quem acompanha.
 */
const apurarUmDia = async (req: Request, corpo: Record<string, unknown>): Promise<Response> => {
  const url = Deno.env.get('SUPABASE_URL');
  const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!jwt) return responder({ erro: 'Sem sessão.' }, 401);

  const data = String(corpo.data ?? '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) return responder({ erro: 'Dia inválido.' }, 400);

  const quem = await fetch(`${url}/auth/v1/user`, {
    headers: { apikey: chaveDeServico(), Authorization: `Bearer ${jwt}` },
  });
  if (!quem.ok) return responder({ erro: 'Sessão inválida.' }, 401);
  const usuario = (await quem.json()) as { id?: string };

  const { ler, gravarAjustes } = banco();
  const [eu] = await ler<LinhaColaborador>(`colaboradores?select=*&auth_user_id=eq.${usuario.id}`);
  if (!eu) return responder({ erro: 'Sessão sem colaborador.' }, 403);

  const alvoId = String(corpo.colaboradorId || eu.id);
  const corrigido = corpo.corrigido === true;
  if (alvoId !== eu.id || corrigido) {
    const r = await fetch(`${url}/rest/v1/rpc/posso_decidir_jornada`, {
      method: 'POST',
      headers: { apikey: chavePublica(), Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ alvo: alvoId }),
    });
    if (!r.ok || (await r.json()) !== true) {
      return responder({ erro: 'Você não responde pela jornada desta pessoa.' }, 403);
    }
  }

  const [alvo, batidas, ausencias, feriados, ajustes, configuracoes] = await Promise.all([
    ler<LinhaColaborador>(`colaboradores?select=*&id=eq.${encodeURIComponent(alvoId)}`),
    ler<LinhaRegistroPonto>(`registros_ponto?select=*&colaborador_id=eq.${encodeURIComponent(alvoId)}&data=eq.${data}`),
    ler<Record<string, unknown>>(
      `justificativas_ausencia?select=*&colaborador_id=eq.${encodeURIComponent(alvoId)}&estado=eq.aprovada&data_inicio=lte.${data}&data_fim=gte.${data}`
    ),
    ler<Record<string, unknown>>(`feriados?select=*&data=eq.${data}`, true),
    ler<LinhaAjuste>(`ajustes_jornada?select=*&colaborador_id=eq.${encodeURIComponent(alvoId)}&data=eq.${data}`),
    ler<{ permissoes_ferramentas: MapaDePermissoes | null }>('configuracoes?select=permissoes_ferramentas'),
  ]);
  if (!alvo[0]) return responder({ erro: 'Colaborador não encontrado.' }, 404);

  const decisao = decidirDiaNoServidor(
    {
      colaboradores: alvo.map((l) => paraColaboradorDaLinha(l, '')),
      batidas: batidas.map(paraRegistroPonto),
      ausencias: ausencias.map(paraJustificativa),
      feriados: feriados.map(paraFeriado),
      ajustes: ajustes.map(paraAjuste),
      permissoes: configuracoes[0]?.permissoes_ferramentas ?? null,
    },
    {
      colaboradorId: alvoId,
      data,
      hoje: hojeEmBrasilia(),
      agora: new Date().toISOString(),
      novoId: () => `ajuste-${crypto.randomUUID()}`,
      motivo: typeof corpo.motivo === 'string' ? corpo.motivo.trim() || undefined : undefined,
      anexoCaminho: typeof corpo.anexoCaminho === 'string' ? corpo.anexoCaminho || undefined : undefined,
      corrigidoPor: corrigido ? { id: eu.id, nome: eu.nome } : undefined,
    }
  );

  if (decisao.acao === 'nada') return responder({ ok: true, acao: 'nada' });
  await gravarAjustes([paraLinhaAjuste(decisao.ajuste)]);
  return responder({
    ok: true,
    acao: 'gravar',
    ajuste: decisao.ajuste,
    reescrita: decisao.reescrita,
    entrouNaFila: decisao.entrouNaFila,
  });
};

Deno.serve(async (req) => {
  // O aplicativo pede um dia só; a madrugada (com o segredo) pede a rede
  let corpo: Record<string, unknown> = {};
  try {
    corpo = (await req.clone().json()) as Record<string, unknown>;
  } catch {
    /* corpo vazio ou não-JSON: é a madrugada */
  }
  if (corpo?.modo === 'dia') {
    try {
      return await apurarUmDia(req, corpo);
    } catch (e) {
      console.error('Apuração do dia falhou:', e);
      return responder({ erro: String(e instanceof Error ? e.message : e) }, 500);
    }
  }

  const segredo = Deno.env.get('APURAR_SEGREDO');
  if (!segredo || req.headers.get('x-apurar-segredo') !== segredo) {
    return responder({ erro: 'Não autorizado.' }, 401);
  }

  try {
    const hoje = hojeEmBrasilia();
    const primeiro = deDataLocal(hoje);
    primeiro.setDate(primeiro.getDate() - DIAS_REVISADOS - 1);
    /*
      A leitura cobre também o MÊS ANTERIOR inteiro: é ele que tem o saldo
      de compensação do sábado fechado toda noite. Do dia 6 em diante, 35
      dias para trás já não chegam ao dia 1 dele.
    */
    const mesFechado = mesAnterior(hoje.slice(0, 7));
    const inicioDoMesFechado = diasDoMes(mesFechado).inicio;
    const inicio = paraDataLocal(primeiro) < inicioDoMesFechado ? paraDataLocal(primeiro) : inicioDoMesFechado;

    const { ler, gravarAjustes, gravarCompensacoes, ausentes } = banco();
    const [colaboradores, batidas, ausencias, feriados, ajustes, configuracoes, compensacoes] = await Promise.all([
      ler<LinhaColaborador>('colaboradores?select=*&ativo=eq.true&order=id'),
      ler<LinhaRegistroPonto>(`registros_ponto?select=*&data=gte.${inicio}&data=lt.${hoje}&order=id`),
      ler<Record<string, unknown>>(`justificativas_ausencia?select=*&estado=eq.aprovada&data_fim=gte.${inicio}&order=id`),
      // Os cadastrados; os nacionais e municipais a regra calcula sozinha
      ler<Record<string, unknown>>('feriados?select=*&order=id', true),
      ler<LinhaAjuste>(`ajustes_jornada?select=*&data=gte.${inicio}&order=id`),
      ler<{ permissoes_ferramentas: MapaDePermissoes | null }>('configuracoes?select=permissoes_ferramentas'),
      // Os dois meses antes de hoje: o fechado agora e o anterior a ele
      ler<LinhaCompensacao>(`compensacao_sabado?select=*&mes=gte.${mesAnterior(mesFechado)}`, true),
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
        compensacoes: compensacoes.map(paraCompensacao),
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
    if (!simular) {
      await gravarAjustes(plano.gravar.map(paraLinhaAjuste));
      await gravarCompensacoes(plano.compensacoes.map((c) => ({ ...paraLinhaCompensacao(c) })));
    }

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
      // O saldo de compensação do sábado do mês anterior, fechado nesta noite
      compensacao: {
        mes: mesFechado,
        fechados: plano.compensacoes.length,
        semTabela: ausentes.has('compensacao_sabado'),
      },
      ...(simular
        ? {
            seriaGravado: plano.gravar.map(
              (a) => `${nomes.get(a.colaboradorId) ?? a.colaboradorId} · ${a.data} · ${a.tipo} ${a.minutos}min · ${a.estado}`
            ),
            compensacaoQueSeriaFechada: plano.compensacoes.map(
              (c) =>
                `${nomes.get(c.colaboradorId) ?? c.colaboradorId} · ${c.mes} · veio ${c.anterior} + juntou ${c.juntada} − folgas ${c.consumida} = segue ${c.saldoFinal}min`
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
