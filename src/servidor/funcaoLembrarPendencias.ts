/**
 * A FUNÇÃO DE SERVIDOR `lembrar-pendencias` (Supabase Edge Function, Deno).
 *
 * Roda todo dia às 9h de Brasília, chamada pelo agendador do banco
 * (pg_cron). Lê o que está pendente na rede, pergunta a `planejarLembretes`
 * quem lembrar de quê, e entrega pela `enviar-aviso` — que é onde mora o
 * Firebase. Esta função não fala com o Firebase: uma segunda porta para
 * ele seria um segundo lugar para a chave e para a regra de quem está
 * inativo.
 *
 * NÃO EDITE O ARQUIVO DA PASTA `supabase/functions/lembrar-pendencias`.
 * Ele é GERADO a partir deste (`bun scripts/gerar-funcao-apurar.ts`), com
 * as regras embutidas — inclusive `publicoAlvo`, de `mural.ts`.
 *
 * QUEM PODE CHAMAR: só quem tem o segredo dos agendamentos (APURAR_SEGREDO,
 * o mesmo da madrugada). `?simular=1` diz o que seria enviado sem enviar.
 *
 * `?semBater=1` é o OUTRO agendamento, de 5 em 5 minutos no horário das
 * lojas: o alerta de quem não bateu a marcação prevista (`semBater.ts`).
 * Mora aqui para não pedir uma terceira função no painel.
 */
import { planejarLembretes, PUBLICACAO_COBRADA_DIAS, Lembrete } from './lembretes';
import { planejarAlertasSemBater } from './semBater';
import { hojeEmBrasilia } from '../servicos/apuracaoDoDia';
import {
  LinhaAviso,
  LinhaColaborador,
  LinhaRegistroPonto,
  paraAvisoRede,
  paraColaboradorDaLinha,
  paraFeriado,
  paraJustificativa,
  paraRegistroPonto,
} from '../servicos/linhasDoBanco';
import { chavePublica, criarLeitor, responder } from './bancoNoServidor';
import { completarPermissoes, podeUsarComMapa, MapaDePermissoes } from '../servicos/permissoes';

declare const Deno: {
  env: { get(nome: string): string | undefined };
  serve(tratar: (req: Request) => Promise<Response>): void;
};

/** Quantos lembretes por pedido à `enviar-aviso` — o teto dela. */
const POR_ENTREGA = 500;

/** Entrega pela `enviar-aviso`, onde mora o Firebase. Devolve quantos chegaram. */
const entregar = async (segredo: string, lembretes: Lembrete[]): Promise<number> => {
  let entregues = 0;
  for (let i = 0; i < lembretes.length; i += POR_ENTREGA) {
    const r = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/enviar-aviso`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: chavePublica(),
        'x-apurar-segredo': segredo,
      },
      body: JSON.stringify({ entregaAgendada: lembretes.slice(i, i + POR_ENTREGA) }),
    });
    if (!r.ok) throw new Error(`enviar-aviso respondeu ${r.status}: ${await r.text()}`);
    entregues += ((await r.json()) as { entregues?: number }).entregues || 0;
  }
  return entregues;
};

/**
 * AS COLUNAS DO COLABORADOR QUE O ALERTA USA — sem a foto. Esta chamada
 * roda 168 vezes por dia, e a foto (até 60 KB por pessoa) baixada a cada
 * vez seria quase 1 GB por dia de tráfego por nada (LIMITES-SUPABASE.md).
 */
const COLUNAS_DO_ALERTA =
  'id,nome,login,cargo,setor,loja,nivel,responsavel_id,data_admissao,carga_horaria_diaria_minutos,turno,carga_semanal_minutos,trabalha_sabado,tem_intervalo,ativo';

const alertarSemBater = async (segredo: string, simular: boolean): Promise<Response> => {
  const { ler } = criarLeitor();
  const agora = new Date();
  const hoje = hojeEmBrasilia(agora);

  const [colaboradores, batidas, ausencias, feriados, configuracoes] = await Promise.all([
    ler<LinhaColaborador>(`colaboradores?select=${COLUNAS_DO_ALERTA}&ativo=eq.true`),
    ler<LinhaRegistroPonto>(`registros_ponto?select=id,colaborador_id,data,tipo,horario&data=eq.${hoje}`),
    ler<Record<string, unknown>>(
      `justificativas_ausencia?select=*&estado=eq.aprovada&data_inicio=lte.${hoje}&data_fim=gte.${hoje}`
    ),
    ler<Record<string, unknown>>('feriados?select=*', true),
    ler<{ permissoes_ferramentas: MapaDePermissoes | null }>('configuracoes?select=permissoes_ferramentas'),
  ]);

  const alertas = planejarAlertasSemBater(
    {
      colaboradores: colaboradores.map((c) => paraColaboradorDaLinha(c, '')),
      batidas: batidas.map(paraRegistroPonto),
      ausencias: ausencias.map(paraJustificativa),
      feriados: feriados.map(paraFeriado),
      permissoes: configuracoes[0]?.permissoes_ferramentas ?? null,
    },
    agora
  );

  if (simular) {
    const nomes = new Map(colaboradores.map((c) => [c.id, c.nome]));
    return responder({
      simulacao: true,
      hoje,
      batidas: batidas.length,
      alertas: alertas.length,
      seriaEnviado: alertas.map((a) => `${nomes.get(a.colaboradorId) || a.colaboradorId} · ${a.dados.texto}`),
    });
  }
  const entregues = alertas.length ? await entregar(segredo, alertas) : 0;
  return responder({ ok: true, hoje, alertas: alertas.length, entregues });
};

Deno.serve(async (req) => {
  const segredo = Deno.env.get('APURAR_SEGREDO');
  if (!segredo || req.headers.get('x-apurar-segredo') !== segredo) {
    return responder({ erro: 'Sem autorização.' }, 401);
  }
  const simular = new URL(req.url).searchParams.has('simular');

  try {
    if (new URL(req.url).searchParams.has('semBater')) return await alertarSemBater(segredo, simular);

    const { ler, ausentes } = criarLeitor();
    const agora = new Date();
    const desde = new Date(agora.getTime() - PUBLICACAO_COBRADA_DIAS * 86400_000).toISOString();

    const [colaboradores, holerites, recebimentos, advertencias, publicacoes, espelhosAssinados, configuracoes] = await Promise.all([
      ler<LinhaColaborador>('colaboradores?select=*'),
      ler<{ id: string; colaborador_id: string; competencia: string; criado_em: string }>(
        'holerites?select=id,colaborador_id,competencia,criado_em',
        true
      ),
      ler<{ holerite_id: string }>('recebimentos_holerite?select=holerite_id', true),
      ler<{ id: string; colaborador_id: string; ciencia_em: string | null; criado_em: string }>(
        'advertencias?select=id,colaborador_id,ciencia_em,criado_em&ciencia_em=is.null',
        true
      ),
      ler<LinhaAviso>(`avisos_rede?select=*&exige_confirmacao=eq.true&criado_em=gte.${encodeURIComponent(desde)}`),
      ler<{ colaborador_id: string; mes: string }>('espelhos_assinados?select=colaborador_id,mes', true),
      // Quem bate ponto: a ferramenta "Meu ponto", como na apuração da madrugada
      ler<{ permissoes_ferramentas: MapaDePermissoes | null }>('configuracoes?select=permissoes_ferramentas'),
    ]);
    const permissoes = completarPermissoes(configuracoes[0]?.permissoes_ferramentas ?? null);

    // Quem confirmou cada publicação em cobrança — só delas, e só as confirmadas
    const ids = publicacoes.map((p) => p.id);
    const confirmacoes = ids.length
      ? await ler<{ aviso_id: string; colaborador_id: string }>(
          `avisos_leitura?select=aviso_id,colaborador_id&confirmado=eq.true&aviso_id=in.(${ids
            .map((id) => `"${id}"`)
            .join(',')})`
        )
      : [];
    const confirmaram = new Map<string, string[]>();
    for (const c of confirmacoes) confirmaram.set(c.aviso_id, [...(confirmaram.get(c.aviso_id) || []), c.colaborador_id]);

    /*
      SEM A TABELA DE ASSINATURAS, NENHUM HOLERITE É COBRADO. Sem ela todo
      holerite pareceria não assinado — e a rede inteira seria lembrada de
      assinar o que talvez já assinou.
    */
    const semAssinaturas = ausentes.has('recebimentos_holerite');

    const lembretes = planejarLembretes(
      {
        colaboradores: colaboradores.map((c) => paraColaboradorDaLinha(c, '')),
        holerites: semAssinaturas
          ? []
          : holerites.map((h) => ({
              id: h.id,
              colaboradorId: h.colaborador_id,
              competencia: h.competencia,
              criadoEm: h.criado_em,
            })),
        assinados: new Set(recebimentos.map((r) => r.holerite_id)),
        advertencias: advertencias.map((a) => ({
          id: a.id,
          colaboradorId: a.colaborador_id,
          cienciaEm: a.ciencia_em,
          criadoEm: a.criado_em,
        })),
        publicacoes: publicacoes.map((p) => paraAvisoRede(p, [], confirmaram.get(p.id) || [])),
        // Sem a tabela de assinaturas do espelho, nenhum espelho é cobrado
        espelhos: ausentes.has('espelhos_assinados')
          ? undefined
          : {
              assinados: new Set(espelhosAssinados.map((e) => `${e.colaborador_id}|${e.mes}`)),
              batePonto: (c) => podeUsarComMapa('ponto', c, permissoes),
            },
      },
      agora
    );

    const lidos = {
      colaboradores: colaboradores.length,
      holerites: holerites.length,
      assinados: recebimentos.length,
      advertenciasSemCiencia: advertencias.length,
      publicacoesEmCobranca: publicacoes.length,
      espelhosAssinados: espelhosAssinados.length,
    };

    if (simular) {
      const nomes = new Map(colaboradores.map((c) => [c.id, c.nome]));
      return responder({
        simulacao: true,
        lidos,
        semAssinaturas,
        lembretes: lembretes.length,
        seriaEnviado: lembretes.map(
          (l) => `${nomes.get(l.colaboradorId) || l.colaboradorId} · ${l.dados.conversa} · ${l.dados.texto}`
        ),
      });
    }

    const entregues = await entregar(segredo, lembretes);

    return responder({ ok: true, lidos, lembretes: lembretes.length, entregues });
  } catch (erro) {
    console.error('Lembretes do dia:', erro);
    return responder({ erro: erro instanceof Error ? erro.message : String(erro) }, 500);
  }
});
