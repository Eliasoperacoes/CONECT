/**
 * OS LEMBRETES DO DIA — quem lembrar de quê, às 9h.
 *
 * Pedido do Elias (02/10/2026): lembrar TODO DIA, até resolver,
 *
 *   - o holerite publicado e não assinado;
 *   - o documento do RH (advertência) sem ciência;
 *   - a publicação da Central que pede confirmação e não foi confirmada;
 *   - o espelho de ponto do mês fechado ainda não assinado (07/10/2026).
 *
 * Regras de convivência, para o lembrete não virar motivo de silenciar o
 * CONECTA inteiro:
 *
 *   - UM aviso por assunto por pessoa por dia, somando o que houver
 *     ("3 holerites para assinar"), e não um por documento;
 *   - o primeiro lembrete só depois de ESPERA_HORAS do documento: quem
 *     recebeu o aviso de "holerite disponível" às 18h não é cobrado às 9h
 *     da manhã seguinte;
 *   - publicação só é cobrada por PUBLICACAO_COBRADA_DIAS: o comunicado de
 *     meses atrás não começa a tocar no dia em que isto for ligado;
 *   - quem saiu da empresa não é lembrado de nada.
 *
 * Quem a publicação alcança é `publicoAlvo` (mural.ts) — a mesma conta do
 * "N de M confirmaram" da Central, embutida aqui pelo gerador da função.
 * Sem banco e sem Deno: só dados entram, e a lista de avisos sai.
 */
import type { AvisoRede, Colaborador } from '../tipos';
import { publicoAlvo } from '../servicos/mural';
import { espelhosParaAssinar, rotuloDoMes } from '../servicos/mesesDoEspelho';
import { hojeEmBrasilia } from '../servicos/apuracaoDoDia';

export const ESPERA_HORAS = 20;
export const PUBLICACAO_COBRADA_DIAS = 15;

export interface DadosDosLembretes {
  colaboradores: Colaborador[];
  holerites: Array<{ id: string; colaboradorId: string; competencia: string; criadoEm: string }>;
  /** Os ids dos holerites já assinados. */
  assinados: Set<string>;
  advertencias: Array<{ id: string; colaboradorId: string; cienciaEm: string | null; criadoEm: string }>;
  publicacoes: AvisoRede[];
  /**
   * Os espelhos já assinados (`colaboradorId|AAAA-MM`) e quem bate ponto.
   * Sem isto (tabela ausente), nenhum espelho é cobrado.
   */
  espelhos?: { assinados: Set<string>; batePonto: (c: Colaborador) => boolean };
}

/** Um aviso a entregar: para quem, e os dados que o aparelho lê (`enviar-aviso`). */
export interface Lembrete {
  colaboradorId: string;
  dados: Record<string, string>;
}

const MESES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];
const mesPorExtenso = (competencia: string): string => {
  const [ano, mes] = competencia.split('-');
  return `${MESES[Number(mes) - 1] || mes} de ${ano}`;
};

/** Agrupa por pessoa, na ordem em que aparecem. */
const porPessoa = <T>(itens: T[], dono: (i: T) => string): Map<string, T[]> => {
  const grupos = new Map<string, T[]>();
  for (const item of itens) {
    const id = dono(item);
    grupos.set(id, [...(grupos.get(id) || []), item]);
  }
  return grupos;
};

export const planejarLembretes = (d: DadosDosLembretes, agora: Date): Lembrete[] => {
  const ativos = new Set(d.colaboradores.filter((c) => c.ativo !== false).map((c) => c.id));
  const limite = agora.getTime() - ESPERA_HORAS * 3600_000;
  const jaEsperou = (iso: string) => new Date(iso).getTime() <= limite;
  const lembretes: Lembrete[] = [];

  // Os campos que o aviso do Android mostra; `mensagemId` fixo por pessoa e
  // assunto, para o lembrete de hoje SUBSTITUIR o de ontem na barra
  const aviso = (colaboradorId: string, assunto: string, dados: Record<string, string>): Lembrete => ({
    colaboradorId,
    dados: { mensagemId: `lembrete-${assunto}-${colaboradorId}`, ehGrupo: 'true', ...dados },
  });

  // HOLERITES NÃO ASSINADOS
  const holerites = d.holerites.filter(
    (h) => ativos.has(h.colaboradorId) && !d.assinados.has(h.id) && jaEsperou(h.criadoEm)
  );
  for (const [colaboradorId, seus] of porPessoa(holerites, (h) => h.colaboradorId)) {
    const texto =
      seus.length === 1
        ? `Seu holerite de ${mesPorExtenso(seus[0].competencia)} ainda não foi assinado. Toque para assinar.`
        : `Você tem ${seus.length} holerites para assinar. Toque para ver.`;
    lembretes.push(
      aviso(colaboradorId, 'holerite', {
        tipo: 'secao',
        conversaId: 'meus_holerites',
        remetente: 'RH',
        conversa: 'Holerite para assinar',
        texto,
      })
    );
  }

  // DOCUMENTO DO RH SEM CIÊNCIA — sem dizer o que é: aparece na tela bloqueada
  const advertencias = d.advertencias.filter(
    (a) => ativos.has(a.colaboradorId) && !a.cienciaEm && jaEsperou(a.criadoEm)
  );
  for (const colaboradorId of porPessoa(advertencias, (a) => a.colaboradorId).keys()) {
    lembretes.push(
      aviso(colaboradorId, 'ciencia', {
        tipo: 'secao',
        conversaId: 'minhas_advertencias',
        remetente: 'RH',
        conversa: 'Documento do RH',
        texto: 'Há um documento do RH aguardando a sua ciência. Toque para abrir.',
      })
    );
  }

  // PUBLICAÇÕES QUE PEDEM CONFIRMAÇÃO
  const desde = agora.getTime() - PUBLICACAO_COBRADA_DIAS * 86400_000;
  const pendentes: Array<{ colaboradorId: string; publicacao: AvisoRede }> = [];
  for (const p of d.publicacoes) {
    const criada = new Date(p.criadoEm).getTime();
    if (!p.exigeConfirmacao || criada < desde || !jaEsperou(p.criadoEm)) continue;
    const confirmaram = new Set(p.confirmacoesIds || []);
    for (const pessoa of publicoAlvo(p, d.colaboradores)) {
      if (!confirmaram.has(pessoa.id)) pendentes.push({ colaboradorId: pessoa.id, publicacao: p });
    }
  }
  for (const [colaboradorId, suas] of porPessoa(pendentes, (p) => p.colaboradorId)) {
    // A mais recente é a que o toque abre
    const [maisRecente] = [...suas].sort((a, b) => b.publicacao.criadoEm.localeCompare(a.publicacao.criadoEm));
    lembretes.push(
      aviso(colaboradorId, 'publicacao', {
        tipo: 'publicacao',
        conversaId: maisRecente.publicacao.id,
        publicacaoId: maisRecente.publicacao.id,
        remetente: 'Central',
        conversa: 'Confirme a leitura',
        texto:
          suas.length === 1
            ? maisRecente.publicacao.titulo
            : `Você tem ${suas.length} publicações para confirmar a leitura.`,
      })
    );
  }

  /*
    ESPELHOS DE PONTO PARA ASSINAR. Sem espera de 20h: o mês fecha à
    meia-noite e o espelho fica disponível no dia 1 — o lembrete desse dia
    é o próprio "está disponível". A regra de quais meses é a da tela
    (`espelhosParaAssinar`): o lembrete nunca cobra o que o Meu RH não cobra.
  */
  if (d.espelhos) {
    const hoje = hojeEmBrasilia(agora);
    for (const c of d.colaboradores) {
      if (!ativos.has(c.id)) continue;
      const meses = espelhosParaAssinar(c, d.espelhos.batePonto(c), hoje, {
        has: (mes) => d.espelhos!.assinados.has(`${c.id}|${mes}`),
      });
      if (meses.length === 0) continue;
      lembretes.push(
        aviso(c.id, 'espelho', {
          tipo: 'secao',
          conversaId: 'meus_espelhos',
          remetente: 'Ponto',
          conversa: 'Espelho de ponto',
          texto:
            meses.length === 1
              ? `Seu espelho de ponto de ${rotuloDoMes(meses[0])} está disponível para assinar. Toque para conferir.`
              : `Você tem ${meses.length} espelhos de ponto para assinar. Toque para ver.`,
        })
      );
    }
  }

  return lembretes;
};
