/**
 * A APURAÇÃO DA MADRUGADA — o que o servidor grava, decidido sem gravar.
 *
 * Até 01/10/2026 a falta, o dia que se resolveu e o dia fechado que nunca
 * virou pedido só eram tratados quando alguém ABRIA a fila no aparelho.
 * Um líder que passasse a semana sem abrir deixava a equipe inteira sem
 * apuração; e o aparelho apurava com o que tinha no cache.
 *
 * Aqui o servidor faz isso toda madrugada, para a rede inteira, com as
 * MESMAS regras do aplicativo (`apuracaoDoDia`) — só a fonte muda: as
 * linhas do banco, e o relógio de Brasília.
 *
 * Este arquivo não fala com o banco: recebe as listas e devolve o plano.
 * Quem lê e grava é `funcaoApurarPonto.ts`. Assim a decisão inteira é
 * testada aqui, sem servidor.
 */
import {
  AjusteJornada,
  Colaborador,
  Feriado,
  JustificativaAusencia,
  ORDEM_MARCACOES,
  RegistroPonto,
  TOLERANCIA_PONTO_PADRAO_MINUTOS,
  TOLERANCIA_POR_MARCACAO_PADRAO_MINUTOS,
} from '../tipos';
import {
  usarFonteDaApuracao,
  minutosEmBrasilia,
  jornadaDoDia,
  decidirApuracao,
  decidirLevantamento,
  deDataLocal,
  paraDataLocal,
} from '../servicos/apuracaoDoDia';
import { situacaoNaLista } from '../servicos/justificativasCache';
import { feriadoNaLista } from '../servicos/feriadosCache';
import { completarPermissoes, podeUsarComMapa, MapaDePermissoes } from '../servicos/permissoes';

/** O que o servidor lê do banco para apurar. */
export interface DadosDaApuracao {
  colaboradores: Colaborador[];
  /** As batidas da janela apurada. */
  batidas: RegistroPonto[];
  ausencias: JustificativaAusencia[];
  feriados: Feriado[];
  /** As apurações já gravadas na janela. */
  ajustes: AjusteJornada[];
  /** `configuracoes.permissoes_ferramentas` — decide quem bate ponto. */
  permissoes: MapaDePermissoes | null;
}

export interface PlanoDaApuracao {
  /** As linhas a gravar em `ajustes_jornada` (inserir ou substituir pelo id). */
  gravar: AjusteJornada[];
  /** Os pedidos que PASSARAM a esperar decisão — quem acompanha deve saber. */
  novosNaFila: AjusteJornada[];
  resumo: { pessoas: number; dias: number; faltas: number; apurados: number };
}

/** Quantos dias para trás a madrugada revisa: o mês que fecha cabe inteiro. */
export const DIAS_REVISADOS = 35;

const chave = (colaboradorId: string, data: string) => `${colaboradorId}|${data}`;

/** Muda algo que importa? Regravar a mesma linha toda noite é só ruído. */
const mudou = (antes: AjusteJornada | undefined, depois: AjusteJornada): boolean =>
  !antes ||
  antes.tipo !== depois.tipo ||
  antes.minutos !== depois.minutos ||
  antes.minutosTrabalhados !== depois.minutosTrabalhados ||
  antes.minutosPrevistos !== depois.minutosPrevistos ||
  antes.estado !== depois.estado;

export const planejarApuracao = (
  dados: DadosDaApuracao,
  opcoes: {
    /** AAAA-MM-DD de hoje em Brasília. Hoje não é apurado: ainda não acabou. */
    hoje: string;
    agora: string;
    novoId: () => string;
    diasParaTras?: number;
  }
): PlanoDaApuracao => {
  const porId = new Map(dados.colaboradores.map((c) => [c.id, c]));

  const batidasDoDia = new Map<string, RegistroPonto[]>();
  for (const b of dados.batidas) {
    const k = chave(b.colaboradorId, b.data);
    batidasDoDia.set(k, [...(batidasDoDia.get(k) || []), b]);
  }
  for (const lista of batidasDoDia.values()) {
    lista.sort((a, b) => ORDEM_MARCACOES.indexOf(a.tipo) - ORDEM_MARCACOES.indexOf(b.tipo));
  }

  // As decisões desta mesma noite valem para as seguintes
  const ajusteDoDia = new Map(dados.ajustes.map((a) => [chave(a.colaboradorId, a.data), a]));
  const permissoes = completarPermissoes(dados.permissoes);
  const batePonto = (c: Colaborador) => podeUsarComMapa('ponto', c, permissoes);

  usarFonteDaApuracao({
    colaborador: (id) => porId.get(id),
    marcacoesDoDia: (id, data) => batidasDoDia.get(chave(id, data)) || [],
    situacaoDoDia: (id, data) => situacaoNaLista(dados.ausencias, id, data),
    feriadoEm: (data, loja) => feriadoNaLista(dados.feriados, data, loja),
    ajusteDoDia: (id, data) => ajusteDoDia.get(chave(id, data)) ?? null,
    batePonto,
    hoje: () => opcoes.hoje,
    // O servidor roda em UTC: a hora da batida é lida no relógio da loja
    minutosDoHorario: minutosEmBrasilia,
    /**
     * A tolerância configurável não está no banco — o aplicativo também
     * usa o padrão da lei (10 no dia, 5 por marcação). Se um dia ela for
     * para a tabela `configuracoes`, entra aqui e lá juntas.
     */
    tolerancias: () => ({
      porMarcacao: TOLERANCIA_POR_MARCACAO_PADRAO_MINUTOS,
      diaria: TOLERANCIA_PONTO_PADRAO_MINUTOS,
    }),
  });

  const gravar: AjusteJornada[] = [];
  const novosNaFila: AjusteJornada[] = [];
  const registrar = (ajuste: AjusteJornada, entrouNaFila: boolean) => {
    gravar.push(ajuste);
    ajusteDoDia.set(chave(ajuste.colaboradorId, ajuste.data), ajuste);
    if (entrouNaFila) novosNaFila.push(ajuste);
  };

  const pessoas = dados.colaboradores.filter((c) => c.ativo !== false && batePonto(c));
  const dias = opcoes.diasParaTras ?? DIAS_REVISADOS;
  let faltas = 0;
  let apurados = 0;

  for (const pessoa of pessoas) {
    for (let i = 1; i <= dias; i++) {
      const referencia = deDataLocal(opcoes.hoje);
      referencia.setDate(referencia.getDate() - i);
      const data = paraDataLocal(referencia);

      const levantamento = decidirLevantamento(pessoa, data, opcoes.agora);
      if (levantamento.acao === 'criarFalta') {
        registrar(levantamento.ajuste, true);
        faltas++;
        continue;
      }

      /*
        O DIA FECHADO É APURADO — tenha ou não passado pela saída no
        aparelho. É o que cobre a saída cuja apuração não chegou ao banco
        (o celular fechou, a rede caiu), e o "dia sem fechar" que o dia já
        resolveu (o 'reapurar' do levantamento). Dia já decidido não reabre:
        `decidirApuracao` devolve 'nada'.
      */
      if (!jornadaDoDia(pessoa.id, data).completa) continue;
      const apuracao = decidirApuracao(pessoa.id, data, { agora: opcoes.agora, novoId: opcoes.novoId });
      if (apuracao.acao === 'nada') continue;
      if (!mudou(ajusteDoDia.get(chave(pessoa.id, data)) ?? undefined, apuracao.ajuste)) continue;
      registrar(apuracao.ajuste, apuracao.entrouNaFila);
      apurados++;
    }
  }

  return { gravar, novosNaFila, resumo: { pessoas: pessoas.length, dias, faltas, apurados } };
};
