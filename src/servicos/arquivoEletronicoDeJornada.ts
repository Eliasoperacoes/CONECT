/**
 * O ARQUIVO ELETRÔNICO DE JORNADA — o AEJ (Portaria 671/2021, art. 81, II;
 * leiaute do gov.br, versão "002").
 *
 * O AFD é o que o REP registrou; o AEJ é o que o tratamento fez disso: a
 * jornada como o espelho a mostra. Por isso ESTE MÓDULO NÃO DECIDE NADA
 * SOBRE O DIA — recebe as batidas, a falta e as apurações já decididas,
 * da mesma conta que monta o espelho, e só as escreve no leiaute. Um AEJ
 * com regra própria diria à fiscalização uma coisa e ao colaborador outra.
 *
 * As quatro escolhas que o leiaute deixa em aberto (Elias, 07/10/2026):
 *
 *   · DSR: todo domingo do período, para cada vínculo;
 *   · falta não justificada: a mesma do espelho (`JornadaDia.falta`);
 *   · banco de horas: só o APROVADO — hora extra entra, débito compensa;
 *   · a folga de sábado paga pelos 10 minutos diários NÃO entra: é acordo
 *     de compensação semanal, não banco de horas, e o horário contratual
 *     já traz o relógio inteiro (07:30 às 17:10).
 *
 * A MARCAÇÃO, uma a uma:
 *
 *   · "O" — a batida que veio do REP. Sai com a hora da ORIGINAL (a mesma
 *     do AFD), e com o REP.
 *   · "I" — a que alguém lançou: correção do RH ou do líder, o dia
 *     preenchido pelo turno. O motivo é a justificativa gravada.
 *   · "D" — a original que não está na jornada: corrigida, desconsiderada
 *     no tratamento, ou fora da jornada esperando o RH. O REP registrou e
 *     o arquivo não a esconde.
 */
import {
  AjusteJornada,
  Colaborador,
  MINUTOS_SABADO,
  ROTULO_FORA_DA_JORNADA,
  RegistroPonto,
  TURNO_SABADO,
  TipoMarcacao,
  MotivoForaDaJornada,
  minutosDoTurno,
  turnoDe,
} from '../tipos';

/** O REP-P do sistema é um só: é o "1" do registro 02. */
const ID_DO_REP = '1';

/** A original como o banco a guarda, com o que o tratamento decidiu dela. */
export interface OriginalDoAej {
  nsr: number;
  registradoEm: string;
  data: string;
  /** A batida do tratamento criada junto; vazio quando ficou fora da jornada. */
  registroId: string | null;
  tipoPedido: TipoMarcacao | null;
  foraDaJornada: MotivoForaDaJornada | null;
  tratamento?: { decisao: 'incluida' | 'desconsiderada'; registroId: string | null; justificativa: string };
}

/** Um dia como o espelho o vê. */
export interface DiaDoAej {
  data: string;
  /** A ordem das batidas do dia (`sequenciaDoDia`): é dela que sai o par. */
  sequencia: TipoMarcacao[];
  marcacoes: RegistroPonto[];
  falta: boolean;
}

export interface VinculoDoAej {
  colaborador: Colaborador;
  /** Só os 11 dígitos. */
  cpf: string;
  dias: DiaDoAej[];
  originais: OriginalDoAej[];
  ajustes: AjusteJornada[];
}

export interface EntradaDoAej {
  cnpj: string;
  razaoSocial: string;
  inicio: string;
  fim: string;
  /** Instante da geração, ISO. */
  geradoEm: string;
  /** Só dígitos; vazio enquanto o registro no INPI não sai. */
  inpi: string;
  programa: { nome: string; versao: string };
  desenvolvedor: { tipo: '1' | '2'; documento: string; nome: string; email: string };
  vinculos: VinculoDoAej[];
}

const RELOGIO = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Sao_Paulo',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

/**
 * "AAAA-MM-ddThh:mm:00-0300": segundos fixos em zero (item 6.5.7). Brasília
 * não tem horário de verão desde 2019, e o fuso sai fixo.
 */
export const dataHoraDoAej = (iso: string): string => {
  const p = Object.fromEntries(RELOGIO.formatToParts(new Date(iso)).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:00-0300`;
};

/**
 * O texto livre não pode carregar o delimitador nem quebrar a linha: um
 * "|" na justificativa criaria um campo a mais, e o arquivo inteiro
 * deixaria de ser lido.
 */
export const textoDoAej = (texto: string, maximo = 150): string =>
  texto.replace(/[|\r\n]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, maximo);

const hhmm = (hora: string): string => hora.replace(':', '');

const ehEntrada = (tipo: TipoMarcacao): boolean => tipo === 'entrada' || tipo === 'retorno_almoco';

/** O par entrada/saída da batida, pela ordem do dia: no dia de duas batidas, a saída é do par 1. */
const parDaBatida = (tipo: TipoMarcacao, sequencia: TipoMarcacao[]): number => {
  const i = sequencia.indexOf(tipo);
  if (i >= 0) return Math.floor(i / 2) + 1;
  return tipo === 'entrada' || tipo === 'saida_almoco' ? 1 : 2;
};

const minutoDe = (iso: string): string => dataHoraDoAej(iso);

/** O dia da semana da data (0 = domingo), sem depender do fuso de quem gera. */
const diaDaSemana = (data: string): number => new Date(`${data}T12:00:00Z`).getUTCDay();

/** O horário contratual de um dia: o do turno, ou o do sábado. */
interface HorarioContratual {
  codigo: string;
  duracao: number;
  horas: string[];
}

const horarioDoDia = (colaborador: Colaborador, data: string): HorarioContratual => {
  const sabado = diaDaSemana(data) === 6;
  if (sabado) {
    return { codigo: 'SAB', duracao: MINUTOS_SABADO, horas: [TURNO_SABADO.entrada, TURNO_SABADO.saida] };
  }
  const turno = turnoDe(colaborador);
  // O relógio do turno; a carga própria da ficha, quando há, é o contrato
  const propria = colaborador.cargaHorariaDiariaMinutos;
  const duracao = propria != null ? propria : minutosDoTurno(turno);
  const horas = turno.intervalo?.desconta
    ? [turno.entrada, turno.intervalo.saida, turno.intervalo.retorno, turno.saida]
    : [turno.entrada, turno.saida];
  const codigo = propria != null && propria !== minutosDoTurno(turno) ? `${turno.chave}-${propria}` : turno.chave;
  return { codigo, duracao, horas };
};

/** Os registros do AEJ, em ordem, sem o CRLF (quem grava é `bytesDoArquivo`). */
export const montarAej = (e: EntradaDoAej): string[] => {
  const r01 = [
    '01',
    '1',
    e.cnpj,
    '',
    '',
    textoDoAej(e.razaoSocial),
    e.inicio,
    e.fim,
    dataHoraDoAej(e.geradoEm),
    '002',
  ].join('|');
  const r02 = ['02', ID_DO_REP, '3', e.inpi ? e.inpi.padStart(17, '0') : ''].join('|');

  const vinculos = [...e.vinculos].sort((a, b) => a.colaborador.nome.localeCompare(b.colaborador.nome, 'pt-BR'));
  const r03: string[] = [];
  const horarios = new Map<string, HorarioContratual>();
  const r05: string[] = [];
  const r07: string[] = [];

  vinculos.forEach((v, i) => {
    const id = String(i + 1);
    r03.push(['03', id, v.cpf, textoDoAej(v.colaborador.nome)].join('|'));

    const marcas: Array<{ quando: string; linha: string }> = [];
    const usadas = new Set<number>();
    const porRegistro = new Map<string, RegistroPonto>();

    for (const dia of v.dias) {
      for (const m of dia.marcacoes) {
        porRegistro.set(m.id, m);
        const original = v.originais.find(
          (o) => o.registroId === m.id || (m.nsr != null && o.nsr === m.nsr) || o.tratamento?.registroId === m.id
        );
        const daOriginal =
          m.metodo === 'qrcode' ||
          m.metodo === 'codigo_manual' ||
          (!!original && minutoDe(original.registradoEm) === minutoDe(m.horario));
        if (daOriginal && original) usadas.add(original.nsr);

        const tpMarc = ehEntrada(m.tipo) ? 'E' : 'S';
        const par = parDaBatida(m.tipo, dia.sequencia);
        let codigo = '';
        if (tpMarc === 'E' && par === 1) {
          const h = horarioDoDia(v.colaborador, dia.data);
          horarios.set(h.codigo, h);
          codigo = h.codigo;
        }
        const quando = daOriginal && original ? original.registradoEm : m.horario;
        marcas.push({
          quando,
          linha: [
            '05',
            id,
            dataHoraDoAej(quando),
            daOriginal ? ID_DO_REP : '',
            tpMarc,
            String(par).padStart(3, '0'),
            daOriginal ? 'O' : 'I',
            codigo,
            daOriginal ? '' : textoDoAej(m.justificativa || 'Incluída pelo RH'),
          ].join('|'),
        });
      }
    }

    // As originais que a jornada não usa: desconsideradas, com o porquê
    const sequenciaDe = new Map(v.dias.map((d) => [d.data, d.sequencia]));
    for (const o of v.originais) {
      if (usadas.has(o.nsr)) continue;
      if (o.data < e.inicio || o.data > e.fim) continue;
      const corrigida = (o.registroId && porRegistro.get(o.registroId)) || undefined;
      const motivo =
        o.tratamento?.decisao === 'desconsiderada'
          ? o.tratamento.justificativa
          : corrigida
          ? `Corrigida: ${corrigida.justificativa || 'correção do RH'}`
          : o.foraDaJornada
          ? `${ROTULO_FORA_DA_JORNADA[o.foraDaJornada]}; aguardando tratamento do RH`
          : 'Retirada da jornada pelo RH';
      const tipo = corrigida?.tipo || o.tipoPedido || 'entrada';
      marcas.push({
        quando: o.registradoEm,
        linha: [
          '05',
          id,
          dataHoraDoAej(o.registradoEm),
          ID_DO_REP,
          'D',
          String(parDaBatida(tipo, sequenciaDe.get(o.data) || [])).padStart(3, '0'),
          'O',
          '',
          textoDoAej(motivo),
        ].join('|'),
      });
    }

    marcas.sort((a, b) => a.quando.localeCompare(b.quando));
    r05.push(...marcas.map((m) => m.linha));

    // Ausências e banco de horas, por data
    const doVinculo: Array<{ data: string; linha: string }> = [];
    const admissao = v.colaborador.dataAdmissao || '';
    for (const dia of v.dias) {
      if (dia.data < admissao) continue;
      // Domingo trabalhado não foi descanso: as batidas dele já estão nos 05
      if (diaDaSemana(dia.data) === 0) {
        if (dia.marcacoes.length > 0) continue;
        doVinculo.push({ data: dia.data, linha: ['07', id, '1', dia.data, '', ''].join('|') });
      } else if (dia.falta) {
        doVinculo.push({ data: dia.data, linha: ['07', id, '2', dia.data, '', ''].join('|') });
      }
    }
    for (const a of v.ajustes) {
      if (a.estado !== 'aprovado' || a.minutos <= 0) continue;
      if (a.data < e.inicio || a.data > e.fim) continue;
      if (a.tipo !== 'hora_extra' && a.tipo !== 'debito') continue;
      doVinculo.push({
        data: a.data,
        linha: ['07', id, '3', a.data, String(a.minutos), a.tipo === 'hora_extra' ? '1' : '2'].join('|'),
      });
    }
    doVinculo.sort((a, b) => a.data.localeCompare(b.data));
    r07.push(...doVinculo.map((d) => d.linha));
  });

  const r04 = [...horarios.values()]
    .sort((a, b) => a.codigo.localeCompare(b.codigo))
    .map((h) => ['04', h.codigo, String(h.duracao), ...h.horas.map(hhmm)].join('|'));

  const d = e.desenvolvedor;
  const r08 = [
    '08',
    textoDoAej(e.programa.nome),
    textoDoAej(e.programa.versao, 8),
    d.tipo,
    d.documento,
    textoDoAej(d.nome),
    textoDoAej(d.email, 50),
  ].join('|');

  const r99 = ['99', '1', '1', r03.length, r04.length, r05.length, 0, r07.length, '1'].join('|');

  return [r01, r02, ...r03, ...r04, ...r05, ...r07, r08, r99, 'ASSINATURA_DIGITAL_EM_ARQUIVO_P7S'.padEnd(100, ' ')];
};
