/**
 * Organograma — CONECTA / Malachias Autopeças
 *
 * A cadeia de responsabilidade da rede: cada pessoa tem UM responsável
 * direto, e quem está acima responde por quem está abaixo.
 *
 * Isto não é desenho. É a regra que decide quem aprova hora:
 *
 *   - Pessoa POSICIONADA no organograma → só o responsável dela (e o RH,
 *     a Diretoria e o TI) decide. O alcance automático por setor ou por
 *     loja deixa de valer para ela.
 *   - Pessoa AINDA NÃO POSICIONADA → continua na regra automática de
 *     antes (líder do setor, gerente da loja). É a rede de segurança: com
 *     89 pessoas, ninguém pode ficar sem aprovador enquanto o quadro é
 *     montado loja por loja.
 *
 * O responsável do responsável também responde — a alçada sobe a cadeia
 * inteira. Se o gerente não decide, o chefe dele decide.
 */
import {
  Colaborador,
  cuidaDePessoas,
  NIVEL_COLABORADOR,
  NIVEL_LIDER_SETOR,
  NIVEL_GERENTE,
} from '../tipos';

export interface NoOrganograma {
  colaborador: Colaborador;
  subordinados: NoOrganograma[];
  /** Quantas pessoas respondem a ele, somando a cadeia toda abaixo */
  totalAbaixo: number;
  /** Distância até o topo da árvore, para a tela saber indentar */
  profundidade: number;
}

/** Limite de segurança: cadeia mais funda que isto é ciclo ou erro. */
const PROFUNDIDADE_MAXIMA = 20;

/**
 * Sobe a cadeia a partir de uma pessoa, do responsável direto até o topo.
 *
 * Para em ciclo em vez de travar: um ciclo (A responde a B que responde a A)
 * não deveria existir — `podeSerResponsavelDe` impede de criar — mas dado
 * vindo do banco pode estar assim, e o sistema não pode congelar por causa
 * disso.
 */
export const cadeiaAcimaDe = (
  pessoa: Colaborador,
  todos: Colaborador[]
): Colaborador[] => {
  const porId = new Map(todos.map((c) => [c.id, c]));
  const cadeia: Colaborador[] = [];
  const vistos = new Set<string>([pessoa.id]);

  let atual = pessoa;
  while (atual.responsavelId && cadeia.length < PROFUNDIDADE_MAXIMA) {
    if (vistos.has(atual.responsavelId)) break; // ciclo
    const acima = porId.get(atual.responsavelId);
    if (!acima) break; // responsável desligado ou removido
    cadeia.push(acima);
    vistos.add(acima.id);
    atual = acima;
  }

  return cadeia;
};

/** A pessoa foi posicionada no organograma? */
export const estaPosicionado = (pessoa: Colaborador): boolean =>
  !!pessoa.responsavelId;

/**
 * `quem` responde por `alvo` segundo o organograma?
 *
 * Vale para a cadeia inteira, não só para o responsável direto: se o
 * balconista responde ao líder e o líder responde ao gerente, o gerente
 * também responde pelo balconista.
 */
export const respondePor = (
  quem: Colaborador,
  alvo: Colaborador,
  todos: Colaborador[]
): boolean => {
  if (quem.id === alvo.id) return false;
  return cadeiaAcimaDe(alvo, todos).some((c) => c.id === quem.id);
};

/**
 * A regra de antes do organograma, para quem ainda não foi posicionado.
 *
 * Vive aqui, e não dentro de quem a usa, porque QUEM APROVA e QUEM
 * ACOMPANHA têm que ser a mesma resposta. Quando cada um tinha a sua cópia,
 * o gerente aprovava pela cadeia mas enxergava a loja inteira — via saldo
 * de gente sobre quem não decidia nada.
 */
export const regraAutomaticaDeAlcada = (
  quem: Colaborador,
  alvo: Colaborador
): boolean => {
  // A decisão sobe um degrau: quem está no mesmo nível não aprova o colega
  if (quem.nivel <= alvo.nivel) return false;

  // Gerente responde pela LOJA dele, de ponta a ponta
  if (quem.nivel >= NIVEL_GERENTE && quem.loja === alvo.loja) return true;

  /**
   * O alcance por SETOR é do líder, e só dele.
   *
   * Se valesse para todo mundo acima do líder, um gerente de Descalvado
   * decidiria sobre um balconista de Pirassununga só porque os dois são do
   * Balcão — furando a responsabilidade do gerente de lá.
   */
  if (quem.nivel === NIVEL_LIDER_SETOR && quem.setor === alvo.setor) return true;

  return false;
};

/**
 * A equipe de alguém: as pessoas por quem ele responde.
 *
 * Mesma regra da aprovação — quem aprova a hora de alguém acompanha essa
 * pessoa, e ninguém acompanha quem não aprova.
 */
export const minhaEquipe = (
  quem: Colaborador,
  todos: Colaborador[]
): Colaborador[] =>
  todos
    .filter(
      (c) =>
        c.ativo !== false &&
        // A própria pessoa entra quando ela lidera: agora ela aprova as
        // horas dela, e acompanhar sem poder decidir não serviria de nada
        temAlcadaSobre(quem, c, todos, regraAutomaticaDeAlcada)
    )
    .sort((a, b) => a.nome.localeCompare(b.nome));

/**
 * A regra de alçada da rede, num lugar só.
 *
 * `servicoPonto.podeDecidirSobre` chama isto e nada mais decide alçada —
 * tela, banco e serviço têm que dizer a mesma coisa.
 */
export const temAlcadaSobre = (
  quem: Colaborador,
  alvo: Colaborador,
  todos: Colaborador[],
  // Mantida na assinatura por compatibilidade: a regra automática deixou de
  // decidir alçada. Ver o comentário abaixo.
  _regraAutomatica?: (quem: Colaborador, alvo: Colaborador) => boolean
): boolean => {
  /**
   * O LÍDER APROVA AS PRÓPRIAS HORAS.
   *
   * Era "ninguém decide sobre a própria hora, em hipótese alguma". Mudou
   * por decisão do Elias: quem lidera aprova também as suas.
   *
   * "Quem lidera" é quem tem gente pendurada abaixo no organograma — não é
   * cargo nem nível. Um líder sem ninguém sob ele não aprova as próprias
   * horas: ele é subordinado como qualquer outro, e quem decide é quem está
   * acima dele.
   */
  if (quem.id === alvo.id) return subordinadosDiretos(quem, todos).length > 0;

  // RH, Diretoria e TI seguem por fora da cadeia: o controle é deles
  if (cuidaDePessoas(quem)) return true;

  /**
   * DAQUI PARA BAIXO, QUEM MANDA É O ORGANOGRAMA — E SÓ ELE.
   *
   * Antes havia uma regra automática por trás: líder de setor alcançava
   * TODO o setor, gerente alcançava a loja inteira. Ela existia como rede
   * de segurança para quem ainda não tinha sido posicionado na cadeia.
   *
   * O efeito prático era outro, e foi o que o Elias viu: a líder de Compras
   * recebia para aprovar as horas de gente que não é dela, só por dividirem
   * o setor. A cadeia dizia uma coisa e a fila mostrava outra.
   *
   * Quem não está posicionado NÃO fica sem aprovador: cai para RH,
   * Diretoria e TI, que enxergam a rede inteira. É melhor assim — a pessoa
   * aparece como pendência de quem pode consertar o organograma, em vez de
   * ser silenciosamente entregue a um líder que não responde por ela.
   */
  return respondePor(quem, alvo, todos);
};

/**
 * Pode-se pendurar `alvo` sob `candidato`?
 *
 * O que isto impede, e por quê:
 *  - pendurar alguém em si mesmo;
 *  - pendurar o chefe debaixo do próprio subordinado, o que fecharia um
 *    ciclo e deixaria os dois sem ninguém acima — e sem aprovador.
 */
export const podeSerResponsavelDe = (
  candidato: Colaborador,
  alvo: Colaborador,
  todos: Colaborador[]
): { pode: boolean; motivo?: string } => {
  if (candidato.id === alvo.id) {
    return { pode: false, motivo: 'Ninguém responde por si mesmo.' };
  }

  // Se o candidato já está ABAIXO do alvo, ligá-los fecharia o círculo
  if (respondePor(alvo, candidato, todos)) {
    return {
      pode: false,
      motivo: `${candidato.nome} já responde a ${alvo.nome}. Inverter agora deixaria os dois sem ninguém acima.`,
    };
  }

  return { pode: true };
};

/**
 * Monta a árvore de uma loja.
 *
 * Quem aparece na raiz: quem não tem responsável, e também quem tem um
 * responsável de OUTRA loja — senão a pessoa sumiria do quadro da loja
 * dela. O caso real é a líder de Compras, que atua na rede toda e tem
 * subordinados em cinco unidades.
 */
export const montarArvoreDaLoja = (
  loja: string,
  todos: Colaborador[],
  opcoes: { semColaboradoresSoltos?: boolean } = {}
): NoOrganograma[] => {
  const daLoja = todos.filter((c) => c.loja === loja && c.ativo !== false);
  const idsDaLoja = new Set(daLoja.map((c) => c.id));

  const filhosDe = new Map<string, Colaborador[]>();
  const raizes: Colaborador[] = [];

  for (const pessoa of daLoja) {
    const paiNaMesmaLoja = pessoa.responsavelId && idsDaLoja.has(pessoa.responsavelId);
    if (paiNaMesmaLoja) {
      const lista = filhosDe.get(pessoa.responsavelId!);
      if (lista) lista.push(pessoa);
      else filhosDe.set(pessoa.responsavelId!, [pessoa]);
    } else {
      raizes.push(pessoa);
    }
  }

  const construir = (pessoa: Colaborador, profundidade: number, vistos: Set<string>): NoOrganograma => {
    // O `vistos` é a trava contra ciclo: sem ele, A→B→A faria a montagem
    // da tela entrar em recursão infinita e derrubar o navegador
    const proximos = (filhosDe.get(pessoa.id) || [])
      .filter((f) => !vistos.has(f.id))
      .sort((a, b) => b.nivel - a.nivel || a.nome.localeCompare(b.nome));

    const seguintes = new Set(vistos).add(pessoa.id);
    const subordinados =
      profundidade >= PROFUNDIDADE_MAXIMA
        ? []
        : proximos.map((f) => construir(f, profundidade + 1, seguintes));

    return {
      colaborador: pessoa,
      subordinados,
      totalAbaixo: subordinados.reduce((soma, n) => soma + 1 + n.totalAbaixo, 0),
      profundidade,
    };
  };

  return (
    raizes
      /**
       * Colaborador solto não é raiz de nada — é fila de trabalho.
       *
       * Com 89 pessoas, deixá-los na raiz enchia o quadro de cartões
       * avulsos e escondia a estrutura, que é o que a tela existe para
       * mostrar. Eles ficam na lista de quem falta posicionar; a árvore
       * guarda a liderança e quem já está pendurado nela.
       */
      .filter(
        (c) =>
          !opcoes.semColaboradoresSoltos ||
          c.nivel > NIVEL_COLABORADOR ||
          (filhosDe.get(c.id) || []).length > 0
      )
      // Nível mais alto primeiro: o gerente encabeça o quadro da loja
      .sort((a, b) => b.nivel - a.nivel || a.nome.localeCompare(b.nome))
      .map((r) => construir(r, 0, new Set()))
  );
};

/** Subordinados diretos, em qualquer loja. */
export const subordinadosDiretos = (
  pessoa: Colaborador,
  todos: Colaborador[]
): Colaborador[] =>
  todos
    .filter((c) => c.responsavelId === pessoa.id && c.ativo !== false)
    .sort((a, b) => a.nome.localeCompare(b.nome));

/**
 * Colaboradores que ainda não foram pendurados em ninguém — a lista de
 * trabalho de quem monta o quadro.
 *
 * Só nível 1. Líder e gerente sem chefe não entram aqui: eles são a
 * estrutura, e aparecem no alto da árvore da loja. Antes entravam, e o
 * gerente saía nos dois lados da tela ao mesmo tempo.
 */
export const colaboradoresSemResponsavel = (
  todos: Colaborador[],
  loja?: string
): Colaborador[] =>
  todos
    .filter(
      (c) =>
        c.ativo !== false &&
        !c.responsavelId &&
        c.nivel === NIVEL_COLABORADOR &&
        (!loja || c.loja === loja) &&
        // Quem cuida de pessoas está fora da cadeia por desenho: RH,
        // Diretoria e TI decidem por todo mundo e não precisam de chefe
        // no organograma para aprovar nada
        !cuidaDePessoas(c)
    )
    .sort((a, b) => a.nome.localeCompare(b.nome));
