/**
 * Tipos centrais do comunicador CONECTA — Malachias Autopeças
 * Todas as definições em português do Brasil conforme especificação
 */

export type Setor =
  | 'TI'
  | 'Diretoria'
  | 'RH'
  | 'Tesouraria'
  | 'Compras'
  | 'Garantia'
  | 'Callcenter'
  | 'Balcão'
  | 'Caixas'
  | 'Estoque'
  | 'Logística'
  | 'Estágio'
  | 'Administrativo'
  | 'Gerência';

// Lista única usada nos formulários e filtros, para não repetir os setores
export const SETORES: Setor[] = [
  'TI',
  'Diretoria',
  'RH',
  'Tesouraria',
  'Compras',
  'Garantia',
  'Callcenter',
  'Balcão',
  'Caixas',
  'Estoque',
  'Logística',
  'Estágio',
  'Administrativo',
  'Gerência',
];

export type Loja =
  | 'Pirassununga'
  | 'Porto Ferreira'
  | 'Palmeiras'
  | 'Descalvado'
  | 'Santa Rita'
  | 'Rede';

/**
 * Hierarquia da rede, do chão para a cúpula.
 *
 * Na matriz (Pirassununga) existem líderes de setor além do gerente. Nas
 * filiais essa responsabilidade fica com o gerente — mas o nível continua
 * disponível em qualquer loja, porque há exceção real: a liderança de
 * Compras atua nas cinco lojas.
 */
export type NivelHierarquico = 1 | 2 | 3 | 4 | 5;

export const NIVEL_COLABORADOR = 1;
export const NIVEL_LIDER_SETOR = 2;
export const NIVEL_GERENTE = 3;
export const NIVEL_DIRETORIA = 4;
export const NIVEL_TI = 5;

export const ROTULO_NIVEL: Record<NivelHierarquico, string> = {
  1: 'Colaborador',
  2: 'Líder de Setor',
  3: 'Gerente',
  4: 'Diretoria',
  5: 'TI',
};

export const DESCRICAO_NIVEL: Record<NivelHierarquico, string> = {
  1: 'Conversa com a equipe e bate o próprio ponto.',
  2: 'Acompanha o próprio setor — inclusive em outras lojas, quando o setor é da rede.',
  3: 'Responde pela loja inteira.',
  4: 'Enxerga a rede e publica comunicados oficiais.',
  5: 'Administra o sistema, os cadastros e o banco de dados.',
};

export const NIVEIS_EM_ORDEM: NivelHierarquico[] = [1, 2, 3, 4, 5];

/**
 * Cargos usados na rede, para sugerir no cadastro e manter a grafia igual.
 *
 * O campo continua aceitando qualquer texto: a lista existe para evitar que a
 * mesma função apareça como "Balconista", "balconista" e "Balconista(a)" nos
 * filtros e relatórios, não para proibir um cargo novo.
 *
 * CARGO NÃO DEFINE NÍVEL. Todos abaixo são de gente de nível 1; quem responde
 * por equipe recebe o nível à parte, no campo próprio.
 */
export const CARGOS_SUGERIDOS: string[] = [
  'Administrativo',
  'Balconista',
  'Caixa',
  'Comprador(a)',
  'Conferente',
  'Estagiário(a)',
  'Estoquista',
  'Motoboy',
  'Operador(a) de Caixa',
  'Telefonista',
  'Vendedor(a)',
];

/**
 * Quem cuida de pessoas: RH, Diretoria e TI. É a permissão que abre o
 * cadastro de colaborador e o ajuste de ponto dos outros.
 */
export const cuidaDePessoas = (c: { nivel: number; setor: string }): boolean =>
  c.nivel >= NIVEL_DIRETORIA || ehDoRh(c);

/**
 * É do RH?
 *
 * Diferente de `cuidaDePessoas`, que também abrange Diretoria e TI. A
 * distinção importa: quem é do RH tem uma TELA própria, com o trabalho dele
 * reunido, e não precisa do organograma nem do painel de equipe. Já o TI
 * precisa do organograma — é ele quem posiciona as pessoas.
 *
 * Amarrar a tela de RH em `cuidaDePessoas` tiraria o organograma do
 * Administrador junto, e ninguém mais poderia montar a cadeia.
 */
export const ehDoRh = (c: { setor: string }): boolean => c.setor === 'RH';

/** Administra o sistema: só o TI. */
export const ehAdministrador = (c: { nivel: number }): boolean => c.nivel >= NIVEL_TI;

/**
 * Enxerga o painel de RH & Rede. O líder de setor entra aqui, mas o que ele
 * vê lá dentro é o setor dele, não a rede.
 */
export const vePainelDeRede = (c: { nivel: number; setor: string }): boolean =>
  c.nivel >= NIVEL_LIDER_SETOR || c.setor === 'RH';

/**
 * PUBLICA COMUNICADO OFICIAL DA REDE: do líder de setor para cima.
 *
 * Havia TRÊS números para a mesma pergunta, e nenhum deles conversava com
 * os outros: o catálogo de ferramentas liberava a tela no nível 2, esta
 * função exigia 4, e a Central de Avisos exigia 5.
 *
 * O resultado na tela era o pior possível: o líder via a aba "Avisos &
 * Direção", abria, e não conseguia fazer nada. A permissão dizia que sim e
 * a tela dizia que não.
 *
 * Agora é uma só, e ela vale para a tela E para o canal — quem pode
 * publicar aqui é quem pode publicar no grupo Avisos da Rede.
 */
export const publicaComunicado = (c: { nivel: number }): boolean =>
  c.nivel >= NIVEL_LIDER_SETOR;

export type EstadoPresenca = 'disponivel' | 'ocupado' | 'ausente' | 'desconectado';

/**
 * COMO CADA PRESENÇA SE CHAMA NA TELA.
 *
 * Estava escrito dentro da aba "Eu", na lista de botões — e a bolinha
 * colorida do resto do sistema não tinha nome nenhum. Quem queria dizer
 * "ocupado" noutra tela escrevia de novo, e a segunda escrita diverge
 * na primeira mudança.
 */
export const ROTULO_PRESENCA: Record<EstadoPresenca, string> = {
  disponivel: 'Disponível',
  ocupado: 'Ocupado',
  ausente: 'Ausente',
  desconectado: 'Desconectado',
};

export interface Colaborador {
  id: string;
  nome: string;
  login: string;
  senha?: string;
  cargo: string;
  setor: Setor;
  loja: Loja;
  nivel: NivelHierarquico;
  foto: string;
  presenca: EstadoPresenca;
  vistoPorUltimo: string;
  ramal?: string;
  telefone?: string;
  email?: string;
  ativo: boolean;
  criadoEm?: string;
  // Campos complementares para dados individuais e permissões do sistema
  matricula?: string;
  /** CNPJ em que o colaborador esta registrado. O grupo tem mais de um, e
   *  nem sempre e o da loja onde a pessoa trabalha. */
  cnpj?: string;
  /**
   * Turno da escala ('A' ou 'B'). Decide o horario de entrada, quando o
   * intervalo comeca e a partir de quando a batida esta atrasada.
   * Vazio = turno A.
   */
  turno?: string;
  /**
   * Senha do PRIMEIRO ACESSO — a que o RH entrega em mao.
   *
   * Diferente da senha de login, que vive cifrada na autenticacao e nunca
   * passa por aqui. Esta o banco confere UMA vez, na ativacao, e apaga.
   *
   * So viaja quando preenchida: mandar vazio numa atualizacao qualquer
   * apagaria a senha de quem ainda nao entrou.
   */
  senhaAtivacao?: string;
  /** Ainda usa a senha da rede e precisa definir a propria no primeiro acesso. */
  precisaTrocarSenha?: boolean;
  departamento?: string;
  /**
   * Responsável direto no organograma. É quem aprova a hora desta pessoa —
   * quando preenchido, substitui o alcance automático por setor/loja.
   * Vazio = ainda não posicionado, vale a regra automática.
   */
  responsavelId?: string;
  dataAdmissao?: string;
  permissoes?: string[];
  observacoes?: string;
  // Jornada contratada por dia útil, em minutos. Base do banco de horas.
  cargaHorariaDiariaMinutos?: number;
  /**
   * A carga da SEMANA, em minutos. É esta que manda no banco de horas.
   *
   * O saldo passou a ser semanal porque a rede não tem uma jornada só:
   * colaborador cumpre 8h10 por dia mais o sábado; estagiário cumpre 30h na
   * semana, e há os que fazem 6h de segunda a sexta e os que fazem menos
   * por dia e vêm no sábado completar. Cobrar por DIA reprovava os dois
   * últimos todo dia, sem que nada estivesse errado.
   */
  cargaSemanalMinutos?: number;
  /**
   * Vem trabalhar aos sábados?
   *
   * Não dá para deduzir do cargo nem do setor: entre os estagiários, quem
   * fecha 6h por dia NÃO vem, e quem fecha menos VEM completar. São dois
   * contratos diferentes no mesmo setor.
   */
  trabalhaSabado?: boolean;
  /**
   * O dia tem intervalo de almoço (quatro batidas) ou é direto (duas)?
   *
   * Jornada de até 6h não exige intervalo, e é o caso de boa parte dos
   * estagiários. Cobrar deles a saída e o retorno do almoço deixava o dia
   * eternamente "pela metade" — era o que fazia o sistema dizer que não
   * cumpriram a jornada.
   */
  temIntervalo?: boolean;
}

// ============================================================
// ESCALA DE TRABALHO DA REDE
//
// Segunda a SÁBADO. Dois turnos de dia útil, ambos de 8h10, e um sábado
// curto de 4h com DUAS marcações — não quatro, porque não há intervalo.
//
// A escala vive aqui, e não espalhada, porque ela decide três coisas ao
// mesmo tempo: quanto o dia prevê, quantas batidas fecham o dia, e a partir
// de que horário uma entrada está atrasada. Se essas três respostas
// divergirem, o banco de horas fica errado sem ninguém ver.
// ============================================================

export interface Turno {
  chave: string;
  nome: string;
  entrada: string;
  saida: string;
  /**
   * O intervalo DESTE turno — ausente quer dizer jornada direta.
   *
   * Era `saidaAlmoco` e `retornoAlmoco`, obrigatórios, e por isso todo
   * turno tinha almoço de 1h30. O estagiário que entra 07:30 e sai 12:30
   * direto não cabia; o que para 15 minutos, menos ainda.
   *
   * Pior: a ficha tinha um `temIntervalo` à parte, então a mesma
   * pergunta — "este dia tem intervalo?" — era respondida em dois
   * lugares que podiam discordar. Agora quem responde é o turno, e a
   * ficha só o escolhe.
   */
  intervalo?: {
    saida: string;
    retorno: string;
    /**
     * SAI DA JORNADA, OU ESTÁ DENTRO DELA?
     *
     * O almoço de 1h30 sai: a pessoa deixa o posto, e o turno A das 07:30
     * às 17:10 fecha 8h10, não 9h40. Ele é batido — quatro marcações.
     *
     * A pausa de 15 minutos do estágio NÃO sai. Decisão do Elias: "13:30,
     * mas não precisa descontar os 15 min de intervalo". Quem entra 07:30
     * e sai 13:30 cumpre 6h, e é assim que a rede conta.
     *
     * E pausa que não desconta também não se bate: exigir a saída e a
     * volta de um descanso de 15 minutos deixaria o dia eternamente pela
     * metade — o mesmo defeito que já derrubou o espelho do estágio uma
     * vez, por outro caminho.
     */
    desconta: boolean;
  };
  /**
   * De quem é este turno.
   *
   * Existe para a tela de cadastro não oferecer a jornada de 8h10 a um
   * estagiário, nem a de 5h a quem é do balcão. Escolher errado aqui
   * desalinha o espelho da pessoa por meses sem ninguém notar.
   */
  perfil: 'integral' | 'estagio';
  /** Este turno vem ao sábado, quando a ficha não diz o contrário? */
  sabado: boolean;
}

/**
 * A ESCALA DA REDE, e ela não é uma só.
 *
 * Os dois primeiros são o dia inteiro do balcão, do estoque, do
 * escritório: 8h10 com 1h30 de almoço, mais o sábado curto.
 *
 * Os três seguintes são o estágio, e foram o que o Elias apontou. Não dá
 * para tratá-los como "o turno normal com menos horas": eles têm intervalo
 * de 15 minutos em vez de almoço, um deles não tem intervalo nenhum, e um
 * começa depois do almoço.
 *
 * A CONTA DE CADA UM, pelo relógio e não por número escolhido:
 *
 *   A   07:30→17:10  −1h30   =  8h10
 *   B   08:20→18:00  −1h30   =  8h10
 *   E1  07:30→13:30  −0h15   =  5h45
 *   E2  07:30→12:30  direto  =  5h00
 *   E3  13:00→18:00  −0h15   =  4h45
 *
 * O intervalo NÃO entra na jornada: é o art. 71 §2º da CLT, e é por isso
 * que o E1 fecha 5h45 e não as 6h de permanência.
 */
export const TURNOS: Turno[] = [
  {
    chave: 'A',
    nome: 'Turno A · 07:30 às 17:10',
    entrada: '07:30',
    saida: '17:10',
    intervalo: { saida: '12:30', retorno: '14:00', desconta: true },
    perfil: 'integral',
    sabado: true,
  },
  {
    chave: 'B',
    nome: 'Turno B · 08:20 às 18:00',
    entrada: '08:20',
    saida: '18:00',
    intervalo: { saida: '11:00', retorno: '12:30', desconta: true },
    perfil: 'integral',
    sabado: true,
  },
  {
    /**
     * O ENCAIXE DE QUEM AINDA NÃO FOI CLASSIFICADO.
     *
     * Todo estagiário já cadastrado tem o Turno A gravado na ficha — o
     * formulário sempre salvou um turno, e o padrão dele era o A. Enquanto
     * a jornada saía do SETOR, isso não fazia diferença: o turno era
     * ignorado para eles.
     *
     * Agora que o turno manda, o A daria 8h10 e quatro batidas a quem faz
     * seis horas e bate duas vezes. Este encaixe preserva exatamente o que
     * valia antes — 6h, direto, sem sábado, 30h na semana — até alguém
     * abrir a ficha e dizer qual dos três turnos reais é o daquela pessoa.
     *
     * O nome diz "a definir" porque é isso que ele é: um lugar de espera
     * que aparece no cadastro pedindo para ser trocado.
     */
    chave: 'E0',
    nome: 'Estágio · 6h direto (turno a definir)',
    entrada: '07:30',
    saida: '13:30',
    perfil: 'estagio',
    sabado: false,
  },
  {
    chave: 'E1',
    nome: 'Estágio manhã · 07:30 às 13:30 · 6h',
    entrada: '07:30',
    saida: '13:30',
    /**
     * O horário do intervalo de 15 minutos é o meio da jornada.
     *
     * O Elias disse a duração, não a hora — e na prática ela varia com o
     * movimento do balcão. O meio é o palpite que menos acusa atraso
     * injusto, e a tolerância da CLT cobre o deslocamento normal.
     */
    intervalo: { saida: '10:30', retorno: '10:45', desconta: false },
    perfil: 'estagio',
    sabado: false,
  },
  {
    chave: 'E2',
    nome: 'Estágio escola · 07:30 às 12:30 · 5h',
    entrada: '07:30',
    saida: '12:30',
    // Sai direto para a escola: duas batidas, sem intervalo
    perfil: 'estagio',
    sabado: false,
  },
  {
    chave: 'E3',
    nome: 'Estágio tarde · 13:00 às 18:00 · 5h',
    entrada: '13:00',
    saida: '18:00',
    intervalo: { saida: '15:30', retorno: '15:45', desconta: false },
    perfil: 'estagio',
    sabado: false,
  },
];

/** Sábado: das 8 ao meio-dia, direto, sem intervalo. */
export const TURNO_SABADO = { entrada: '08:00', saida: '12:00' };

export const TURNO_PADRAO = 'A';

const emMinutos = (hora: string): number => {
  const [h, m] = hora.split(':').map(Number);
  return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0);
};

export const acharTurno = (chave?: string): Turno =>
  TURNOS.find((t) => t.chave === chave) || TURNOS[0];

/**
 * Minutos contratados num dia útil deste turno.
 *
 * O intervalo sai da conta porque não é trabalho — art. 71 §2º da CLT. É
 * o que faz o estágio da manhã fechar 5h45, e não as 6h que se passam
 * entre entrar e sair.
 */
export const minutosDoTurno = (turno: Turno): number => {
  const permanencia = emMinutos(turno.saida) - emMinutos(turno.entrada);

  /**
   * SÓ O INTERVALO QUE DESCONTA SAI DA CONTA.
   *
   * O almoço de 1h30 sai: o turno A das 07:30 às 17:10 fecha 8h10.
   *
   * A pausa de 15 minutos do estágio fica dentro — decisão do Elias.
   * Quem entra 07:30 e sai 13:30 cumpre SEIS horas, e é o que fecha com
   * a regra da casa: "os estagiários que cumprem 6 horas diárias não
   * trabalham aos sábados".
   *
   * Eu tinha descontado os 15 minutos por conta própria, apoiado no art.
   * 71 §2º da CLT. Estava errado sobre a prática da rede: o turno da
   * manhã aparecia como 5h45 e a semana dele como 28h45, quando é 6h e
   * 30h.
   */
  if (!turno.intervalo || !turno.intervalo.desconta) return permanencia;

  return (
    permanencia -
    (emMinutos(turno.intervalo.retorno) - emMinutos(turno.intervalo.saida))
  );
};

/**
 * Quantas batidas este turno espera.
 *
 * Quatro só quando há intervalo QUE DESCONTA: o almoço tira a pessoa do
 * posto e precisa estar no documento. A pausa de 15 minutos não se bate —
 * exigir a saída e a volta de um descanso desse tamanho deixaria o dia
 * eternamente pela metade, que é o defeito que já derrubou o espelho do
 * estágio uma vez por outro caminho.
 */
export const marcacoesDoTurno = (turno: Turno): 2 | 4 =>
  turno.intervalo?.desconta ? 4 : 2;

/**
 * O tamanho da PAUSA deste turno — a que não desconta.
 *
 * Diferente de `minutosDeIntervaloDe`, que só conhece o almoço: aquele
 * sai da jornada e é cobrado quando estoura. Este fica dentro dela e
 * serve de colchão — quem entra atrasado até este tanto abriu mão da
 * pausa, e trabalhou o mesmo que quem parou para tomar café.
 *
 * Zero quando o turno não tem pausa, ou quando o intervalo dele é
 * almoço: almoço não é colchão de nada, é hora que não se trabalha.
 */
export const minutosPausaDoTurno = (turno: Turno): number => {
  if (!turno.intervalo || turno.intervalo.desconta) return 0;
  return emMinutos(turno.intervalo.retorno) - emMinutos(turno.intervalo.saida);
};

/** Os turnos que fazem sentido para este contrato. */
export const turnosDoPerfil = (ehEstagio: boolean): Turno[] =>
  TURNOS.filter((t) => t.perfil === (ehEstagio ? 'estagio' : 'integral'));

/**
 * O TURNO DESTA PESSOA. É por aqui que todo o resto pergunta.
 *
 * Diferente de `acharTurno`, que só procura pela chave: aqui o turno
 * precisa CABER no contrato da pessoa. Um estagiário com o Turno A
 * gravado não recebe 8h10 e quatro batidas — recebe o encaixe do estágio.
 *
 * Isso não é zelo teórico: é o estado real do banco. O formulário sempre
 * salvou um turno, com o A por padrão, e enquanto a jornada saía do setor
 * ninguém percebeu. Obedecer a esse A agora quebraria o espelho de todo
 * estagiário da rede de uma vez.
 */
export const turnoDe = (colaborador?: {
  turno?: string;
  setor?: string;
  cargo?: string;
}): Turno => {
  const doPerfil = turnosDoPerfil(ehDeEstagio(colaborador));
  return doPerfil.find((t) => t.chave === colaborador?.turno) || doPerfil[0];
};

/** Minutos contratados no sábado. */
export const MINUTOS_SABADO =
  emMinutos(TURNO_SABADO.saida) - emMinutos(TURNO_SABADO.entrada);

/**
 * Jornada padrão quando o colaborador não tem carga própria cadastrada.
 *
 * É a do turno A — que é igual à do B: os dois fecham 8h10. A rede não tem
 * dia útil de 8h00.
 */
export const CARGA_HORARIA_PADRAO_MINUTOS = minutosDoTurno(TURNOS[0]);

/**
 * A semana contratada de quem cumpre o turno inteiro.
 *
 * Cinco dias úteis de 8h10 mais quatro horas de sábado: 44h50.
 *
 * É o relógio dos turnos cadastrados, com o almoço de 1h30 que a rede
 * pratica — não um número escolhido. Se a jornada contratada for outra, o
 * lugar de mudar é a ficha de cada pessoa, e não este padrão.
 */
export const MINUTOS_SEMANA_PADRAO = CARGA_HORARIA_PADRAO_MINUTOS * 5 + MINUTOS_SABADO;

/** A semana do estágio: 30 horas, cheguem elas como chegarem. */
export const MINUTOS_SEMANA_ESTAGIO = 30 * 60;

/** Jornada diária de estágio quando a ficha não diz outra coisa. */
export const MINUTOS_DIA_ESTAGIO = 6 * 60;

/**
 * Esta pessoa é de estágio?
 *
 * Pelo SETOR, que é o que a rede já cadastra. É só o PADRÃO: o que vale de
 * verdade são os campos da ficha, porque entre os estagiários há contratos
 * diferentes — e um dia pode haver estagiário fora do setor Estágio.
 */
export const ehDeEstagio = (colaborador?: {
  setor?: string;
  cargo?: string;
}): boolean =>
  (colaborador?.setor || '').toLowerCase().includes('está') ||
  (colaborador?.setor || '').toLowerCase().includes('esta') ||
  (colaborador?.cargo || '').toLowerCase().includes('estagi');

/**
 * A carga da semana desta pessoa.
 *
 * SAI DO TURNO DELA, e não de uma constante por setor. Era
 * `estágio ? 30h : 44h50` — dois números para uma rede que tem cinco
 * jornadas diferentes, e que por isso errava três delas.
 *
 * A conta é o relógio: os dias úteis do turno, mais o sábado se ela vem
 * ao sábado. Quem tem carga própria na ficha continua vencendo tudo isso
 * — é o contrato individual, e ele manda.
 *
 * O que cada turno fecha por semana:
 *
 *   A / B  8h10 × 5 + 4h de sábado  = 44h50
 *   E1     5h45 × 5                 = 28h45
 *   E2     5h00 × 5                 = 25h00
 *   E3     4h45 × 5                 = 23h45
 *
 * Quem faz E2 ou E3 e vem ao sábado soma as 4h dele — é o caso que o
 * Elias descreveu, de quem compensa no sábado o que não fecha na semana.
 */
export const cargaSemanalDe = (colaborador?: {
  cargaSemanalMinutos?: number;
  turno?: string;
  trabalhaSabado?: boolean;
  setor?: string;
  cargo?: string;
}): number => {
  if (colaborador?.cargaSemanalMinutos !== undefined) {
    return colaborador.cargaSemanalMinutos;
  }

  const turno = turnoDe(colaborador);
  const uteis = minutosDoTurno(turno) * 5;

  return uteis + (trabalhaNoSabado(colaborador) ? MINUTOS_SABADO : 0);
};

/**
 * Esta pessoa trabalha aos sábados?
 *
 * O padrão do estágio é NÃO: quem cumpre as 6h de segunda a sexta já fechou
 * a semana. Quem vem ao sábado é exceção e está marcado na ficha.
 */
export const trabalhaNoSabado = (colaborador?: {
  trabalhaSabado?: boolean;
  turno?: string;
  setor?: string;
  cargo?: string;
}): boolean => colaborador?.trabalhaSabado ?? turnoDe(colaborador).sabado;

/**
 * O dia desta pessoa tem intervalo?
 *
 * QUEM RESPONDE É O TURNO. Antes era um `temIntervalo` na ficha, separado
 * do turno — a mesma pergunta em dois lugares, que é como este sistema já
 * passou a discordar de si mesmo quatro vezes.
 *
 * E discordava mesmo: o turno sempre trazia almoço de 1h30, e a ficha
 * podia dizer "sem intervalo". O estagiário das 07:30 às 13:30, que para
 * 15 minutos, não era nenhum dos dois.
 *
 * A ficha ainda vence quando alguém marca explicitamente — é a exceção
 * combinada com a área, e some junto do campo se um dia ele sair.
 */
export const temIntervaloNoDia = (colaborador?: {
  temIntervalo?: boolean;
  turno?: string;
  setor?: string;
  cargo?: string;
}): boolean => colaborador?.temIntervalo ?? !!turnoDe(colaborador).intervalo?.desconta;

/**
 * O intervalo contratado desta pessoa, em minutos.
 *
 * Existe porque 15 minutos e 1h30 são coisas diferentes na hora de dizer
 * "seu intervalo passou do contratado". Antes a conta pegava o almoço do
 * turno A para todo mundo, e cobrava do estagiário um almoço que ele não
 * tem.
 */
export const minutosDeIntervaloDe = (colaborador?: {
  turno?: string;
  setor?: string;
  cargo?: string;
}): number => {
  const turno = turnoDe(colaborador);
  // Só o intervalo que DESCONTA é cobrado: a pausa de 15 minutos não sai
  // da jornada, e por isso não há excedente a apurar nela
  if (!turno.intervalo?.desconta) return 0;
  return emMinutos(turno.intervalo.retorno) - emMinutos(turno.intervalo.saida);
};

/**
 * Tolerancia diaria padrao, em minutos.
 *
 * Dez minutos e o limite do art. 58 par. 1 da CLT: variacoes de ate 5 minutos
 * por marcacao, limitadas a 10 no dia, nao sao jornada extraordinaria. O
 * numero fica configuravel, mas o padrao sai da lei e nao de gosto.
 */
export const TOLERANCIA_PONTO_PADRAO_MINUTOS = 10;

/**
 * O limite POR MARCACAO do art. 58 §1o da CLT.
 *
 * "variacoes de horario no registro de ponto nao excedentes de CINCO
 * minutos, observado o limite maximo de DEZ minutos diarios."
 *
 * Sao dois limites, e vale o que for atingido primeiro.
 */
export const TOLERANCIA_POR_MARCACAO_PADRAO_MINUTOS = 5;

/** Comeco da jornada, quando a rede nao configurou outro. */
export const HORARIO_ENTRADA_PADRAO = '08:00';

/** Intervalo de almoco contratado, quando nao configurado. */
export const INTERVALO_ALMOCO_PADRAO_MINUTOS = 60;

export type TipoMensagem = 'texto' | 'recado_voz' | 'arquivo' | 'imagem';

export interface Mensagem {
  id: string;
  conversaId: string;
  remetenteId: string;
  texto?: string;
  tipo: TipoMensagem;
  audioUrl?: string;
  audioDuracao?: number; // em segundos
  arquivoNome?: string;
  arquivoTamanho?: string;
  // Conteúdo do anexo em data URL. Sem ele o download não teria o que entregar.
  arquivoUrl?: string;
  imagemUrl?: string;
  legenda?: string;
  criadoEm: string; // ISO string
  horaFormatada: string; // ex: "14:35"
  lida: boolean;
  lidaPor?: string[]; // IDs dos colaboradores que visualizaram
  visualizadaEm?: string; // Data/hora da confirmação de visualização
  ehEncaminhada?: boolean; // Indicador de mensagem encaminhada
  editadaEm?: string; // Quando foi alterada pelo autor, se foi
  // Caminho do anexo no armazenamento. As URLs acima trazem o conteudo
  // pronto para exibir; este campo e o endereco permanente dele no banco.
  anexoCaminho?: string;
  ehAvisoDirecao?: boolean;
  /**
   * Ainda subindo. So no aparelho — nunca vai para o banco.
   *
   * Aparece assim que a pessoa aperta enviar. Sem isso, a tela ficava parada
   * ate seis idas ao banco terminarem, e a pessoa apertava enviar de novo
   * achando que nao tinha funcionado.
   *
   * Nao ha estado de "falhou": mensagem recusada pelo banco e REMOVIDA do
   * aparelho, porque mensagem que nao gravou nao foi enviada.
   */
  envio?: 'enviando';
  /**
   * Fixada no alto da conversa, a vista de todos os participantes.
   * Diferente de fixar CONVERSA na lista, que e preferencia de cada um.
   */
  /**
   * A mensagem que esta responde, quando é uma resposta.
   *
   * Guarda só o id. O texto citado é montado na hora, a partir da mensagem
   * original — copiar o texto junto pareceria mais simples e criaria uma
   * segunda verdade: original editado ou apagado, e a citação continuaria
   * mostrando o que já não existe.
   */
  respondendoA?: string;
  fixadaEm?: string;
  fixadaPorId?: string;
  reacoes?: Record<string, string[]>; // ex: { '👍': ['colab-1', 'colab-2'], '✅': ['colab-3'] }
}

export type TipoConversa = 'individual' | 'grupo';

export interface Conversa {
  id: string;
  tipo: TipoConversa;
  nome: string;
  foto?: string;
  participantesIds: string[];
  ultimaMensagem?: {
    texto: string;
    hora: string;
    remetenteId: string;
    tipo: TipoMensagem;
  };
  naoLidas: number;
  atualizadoEm: string;
  // Campos específicos de grupo
  descricao?: string;
  criadoPorId?: string;
  apenasGestoresPublicam?: boolean; // ex: "Avisos da Rede" onde só nível 3+ publica
  ehSistemaPadrao?: boolean;
}

// Abas da barra inferior: Conversas | Grupos | Rede (painel) | Eu
export const ABAS_PRINCIPAIS = [
  'conversas',
  'grupos',
  'ponto',
  'painel',
  'eu',
] as const;

export type AbaPrincipal = (typeof ABAS_PRINCIPAIS)[number];

export interface RegistroAuditoria {
  id: string;
  dataHora: string;
  usuarioNome: string;
  acao: string;
  categoria: 'usuario' | 'grupo' | 'aviso' | 'sistema' | 'seguranca';
  detalhes: string;
}

export interface ConfiguracaoSistema {
  nomeEmpresa: string;
  /**
   * Quais ferramentas cada nivel enxerga. Chave da ferramenta -> niveis.
   *
   * E configuracao da REDE, nao do aparelho: o administrador muda num lugar
   * e vale em todos. Vazio significa "vale o padrao do catalogo", nunca
   * "ninguem ve nada" nem "todo mundo ve tudo".
   */
  permissoesFerramentas?: Record<string, number[]>;
  /**
   * Tolerancia diaria, em minutos, sobre a diferenca AGREGADA do dia.
   *
   * Dentro dela a diferenca entra no banco sem passar por ninguem; fora
   * dela, o dia inteiro vira pendencia com o valor CHEIO — a tolerancia e
   * tudo-ou-nada por dia, nao um desconto.
   *
   * Configuravel de proposito: era um numero fixo espalhado pelo codigo, e
   * mudar exigia deploy.
   */
  toleranciaPontoMinutos?: number;
  /**
   * Tolerancia por MARCACAO, o outro limite do art. 58 §1o da CLT.
   *
   * A lei traz dois numeros, e valem juntos: variacoes de ate 5 minutos em
   * CADA marcacao, observado o maximo de 10 minutos no dia.
   *
   * O sistema tinha so o segundo, e por isso era mais permissivo que a lei
   * num caso: uma unica variacao de 6 a 10 minutos passava batida. Quem
   * saia 8 minutos mais cedo nao gerava nada; pela lei, esses 8 minutos
   * contam.
   *
   * Nunca era mais rigido que a lei — entao nao houve cobranca indevida,
   * so deixou de contar o que deveria.
   */
  toleranciaPorMarcacaoMinutos?: number;
  /** Horario em que a jornada comeca, para saber se a entrada atrasou. */
  horarioEntradaPadrao?: string;
  /** Intervalo de almoco contratado, para saber se o retorno atrasou. */
  intervaloAlmocoPadraoMinutos?: number;
  /** Meses de conversa guardados antes da limpeza automatica. */
  mesesHistoricoConversas: number;
  /** Quando a limpeza rodou pela ultima vez. */
  ultimaLimpezaConversas?: string;
  /**
   * Periodo de teste: a rede esta experimentando o sistema.
   *
   * Existe para quem usa saber que pode reclamar. Sem o aviso, a pessoa
   * encontra um defeito, conclui que o sistema e assim mesmo e volta para o
   * grupo do WhatsApp — e ninguem fica sabendo do defeito.
   */
  emPeriodoDeTeste?: boolean;
  modoManutencao: boolean;
  permitirCriacaoGruposPorOperadores: boolean;
}

export type PrioridadeAviso = 'geral' | 'atencao' | 'urgente';

export const PRIORIDADES_AVISO: PrioridadeAviso[] = ['urgente', 'atencao', 'geral'];

export const ROTULO_PRIORIDADE: Record<PrioridadeAviso, string> = {
  urgente: 'Urgente',
  atencao: 'Atenção',
  geral: 'Geral',
};

/**
 * O QUE SE PUBLICA NA CENTRAL DA DIREÇÃO.
 *
 * Era só aviso: um recado com data, que se lê e se esquece. Mas o que
 * chega à loja não é só recado — é a tabela de preço, o passo a passo do
 * fechamento de caixa, o formulário de férias. Essas coisas viviam no
 * grupo do WhatsApp e sumiam na rolagem.
 *
 * São TRÊS TIPOS na mesma prateleira, porque quem procura não sabe de
 * antemão se o que quer é aviso ou documento — sabe o assunto:
 *
 *  - `aviso` — o recado com data. Vale no dia e envelhece.
 *  - `documento` — o arquivo que se guarda e se consulta. Não envelhece.
 *  - `tutorial` — o passo a passo. Não envelhece, e é para quem chegou
 *    agora tanto quanto para quem esqueceu.
 */
export type TipoPublicacao = 'aviso' | 'documento' | 'tutorial';

export const TIPOS_PUBLICACAO: TipoPublicacao[] = ['aviso', 'documento', 'tutorial'];

export const ROTULO_TIPO_PUBLICACAO: Record<TipoPublicacao, string> = {
  aviso: 'Avisos',
  documento: 'Documentos',
  tutorial: 'Tutoriais',
};

/**
 * O MESMO RÓTULO NO SINGULAR, escrito e não calculado.
 *
 * A aba diz "Tutoriais"; o botão de criar diz "Tutorial". A tela tirava
 * o "s" com `replace(/s$/, '')` e escrevia **"Tutoriai"** — porque
 * português não faz plural tirando letra.
 *
 * Duas palavras, duas entradas. Tipo novo não compila sem as duas.
 */
export const ROTULO_TIPO_PUBLICACAO_SINGULAR: Record<TipoPublicacao, string> = {
  aviso: 'Aviso',
  documento: 'Documento',
  tutorial: 'Tutorial',
};

/**
 * ENVELHECE OU NÃO.
 *
 * Aviso antigo é ruído — ninguém quer o comunicado de inventário do ano
 * passado no topo. Documento e tutorial são o contrário: o mais
 * consultado costuma ser o mais antigo, e escondê-lo por idade seria
 * esconder a tabela de preços que vale desde sempre.
 *
 * `Record` de propósito: tipo novo não compila sem que alguém decida.
 */
export const PUBLICACAO_ENVELHECE: Record<TipoPublicacao, boolean> = {
  aviso: true,
  documento: false,
  tutorial: false,
};

/**
 * A GAVETA. É o que a pessoa usa para achar sem saber o título.
 *
 * Lista fechada de propósito: categoria digitada à mão vira "RH",
 * "Rh", "Recursos Humanos" e "rh " em quatro publicações, e nenhuma
 * busca acha as quatro.
 */
export type CategoriaPublicacao =
  | 'operacional'
  | 'rh'
  | 'comercial'
  | 'institucional'
  | 'seguranca';

export const CATEGORIAS_PUBLICACAO: CategoriaPublicacao[] = [
  'operacional',
  'rh',
  'comercial',
  'institucional',
  'seguranca',
];

export const ROTULO_CATEGORIA: Record<CategoriaPublicacao, string> = {
  operacional: 'Operacional',
  rh: 'RH',
  comercial: 'Comercial',
  institucional: 'Institucional',
  seguranca: 'Segurança',
};

/**
 * PARA QUEM VAI.
 *
 * Era um campo só, `lojaDestino`, com 'Todas' ou uma loja. Não dava
 * para mandar ao setor de Balcão das cinco lojas, nem para três pessoas
 * específicas — e um comunicado que chega a 89 pessoas quando interessa
 * a 3 ensina as 89 a ignorar comunicado.
 *
 * Quatro alcances, e uma publicação pode ter vários:
 *
 *  - `rede` — todo mundo. O valor é ignorado.
 *  - `loja` — uma unidade. O valor é o nome dela.
 *  - `setor` — um setor, em todas as lojas. O valor é o nome dele.
 *  - `pessoa` — o id de um colaborador.
 */
export type AlcanceDestino = 'rede' | 'loja' | 'setor' | 'pessoa';

export interface DestinoPublicacao {
  alcance: AlcanceDestino;
  /** Nome da loja, nome do setor ou id da pessoa. Vazio quando `rede`. */
  valor: string;
}

/** Quem leu uma publicação, e quando. */
export interface LeituraPublicacao {
  colaboradorId: string;
  lidoEm: string;
  confirmado: boolean;
}

export interface AvisoRede {
  id: string;
  titulo: string;
  conteudo: string;
  prioridade: PrioridadeAviso;
  tipo: TipoPublicacao;
  categoria: CategoriaPublicacao;
  autorId: string;
  autorNome: string;
  autorCargo: string;
  criadoEm: string;
  horaFormatada: string;
  dataPorExtenso: string;
  fixadoNoTopo: boolean;
  /**
   * MANTIDO, e não substituído por `destinos`.
   *
   * São 24 publicações antigas gravadas só com ele. Trocar a coluna
   * deixaria todas elas sem destino nenhum — ou seja, invisíveis para
   * todo mundo no dia da migração. `alcanca()` lê as duas: `destinos`
   * quando existe, este campo quando não.
   */
  lojaDestino: Loja | 'Todas';
  destinos?: DestinoPublicacao[];
  /** O arquivo anexado — é o que faz "documento" ser documento. */
  anexoCaminho?: string;
  anexoNome?: string;
  /** Exige ciência assinada: some da lista de quem leu sem confirmar. */
  exigeConfirmacao?: boolean;
  lidoPorIds: string[];
  confirmacoesIds: string[];
}

export interface SolicitacaoRadioAoVivo {
  deId: string;
  paraId?: string; // se conversa individual
  grupoId?: string; // se grupo
  conversaId: string;
  nomeFalante: string;
  fotoFalante: string;
  iniciadoEm: number;
}

// ============================================================
// BANCO DE HORAS E REGISTRO DE PONTO
// ============================================================

/** As quatro marcações da jornada, sempre nesta ordem. */
export type TipoMarcacao = 'entrada' | 'saida_almoco' | 'retorno_almoco' | 'saida';

export const ORDEM_MARCACOES: TipoMarcacao[] = [
  'entrada',
  'saida_almoco',
  'retorno_almoco',
  'saida',
];

export const ROTULO_MARCACAO: Record<TipoMarcacao, string> = {
  entrada: 'Entrada',
  saida_almoco: 'Saída para almoço',
  retorno_almoco: 'Retorno do almoço',
  saida: 'Saída',
};

/** Como a marcação foi comprovada. */
/**
 * `preenchimento_turno` é o único que NÃO veio de gente.
 *
 * O sistema escreve o horário do turno num dia que ficou vazio, para o
 * RH não ter de digitar quatro batidas por pessoa por dia. Isso é criar
 * registro trabalhista por dedução — e por isso ele nunca se confunde
 * com batida nem com correção: tem cor própria no espelho, fica na
 * Auditoria e pode ser desfeito.
 */
export type MetodoMarcacao =
  | 'qrcode'
  | 'codigo_manual'
  | 'ajuste_rh'
  | 'ajuste_lider'
  | 'preenchimento_turno';

/**
 * A marcação foi escrita por alguém, e não batida pela pessoa?
 *
 * Existe porque agora há DOIS tipos de correção — a do RH e a do
 * líder/gerente na fila de aprovação. Toda tela que destaca marcação
 * corrigida pergunta aqui; comparar com `'ajuste_rh'` na mão faria a
 * correção do líder passar despercebida no espelho, que é exatamente o
 * que o destaque existe para evitar.
 */
export const ehMarcacaoCorrigida = (metodo?: MetodoMarcacao): boolean =>
  metodo === 'ajuste_rh' || metodo === 'ajuste_lider';

/**
 * A marcação foi DEDUZIDA do turno, e não escrita por alguém?
 *
 * Separada de `ehMarcacaoCorrigida` de propósito. Correção tem autor e
 * justificativa: uma pessoa afirmou o horário. Preenchimento é o sistema
 * supondo pelo contrato — e quem confere o documento precisa distinguir
 * as duas coisas sem ter de perguntar a ninguém.
 */
export const ehMarcacaoPreenchida = (metodo?: MetodoMarcacao): boolean =>
  metodo === 'preenchimento_turno';

export interface RegistroPonto {
  id: string;
  colaboradorId: string;
  data: string; // AAAA-MM-DD no fuso local
  tipo: TipoMarcacao;
  horario: string; // ISO completo do instante da marcação
  horaFormatada: string; // ex: "08:03"
  metodo: MetodoMarcacao;
  loja: Loja; // loja onde o ponto foi comprovado
  criadoEm: string;
  // Preenchidos apenas quando o RH lança ou corrige uma marcação
  ajustadoPorId?: string;
  ajustadoPorNome?: string;
  justificativa?: string;
}

/** Jornada consolidada de um dia para um colaborador. */
export interface JornadaDia {
  data: string; // AAAA-MM-DD
  colaboradorId: string;
  marcacoes: Partial<Record<TipoMarcacao, RegistroPonto>>;
  minutosTrabalhados: number;
  minutosIntervalo: number;
  minutosPrevistos: number;
  saldoMinutos: number; // trabalhados - previstos
  completa: boolean; // as quatro marcações registradas
  emAndamento: boolean; // começou e ainda não encerrou
}

// ============================================================
// APURAÇÃO DO DIA E APROVAÇÃO
//
// A jornada fechada que não bate com as 8h contratadas não vira saldo
// sozinha. O sistema levanta a diferença e manda para o responsável decidir
// — hora extra foi autorizada? a saída mais cedo foi combinada? Só depois do
// aval é que entra no banco de horas.
//
// O caminho é sempre o mesmo, sem atalho:
//   colaborador bate o ponto → líder ou gerente decide → banco de horas
// ============================================================

/** Sobra ou falta em relação à jornada contratada do dia. */
export type TipoAjuste = 'hora_extra' | 'debito' | 'dia_incompleto';

export type EstadoAjuste = 'pendente' | 'aprovado' | 'recusado';

export const ROTULO_TIPO_AJUSTE: Record<TipoAjuste, string> = {
  hora_extra: 'Hora extra',
  debito: 'Saída antecipada',
  dia_incompleto: 'Dia sem fechar',
};

export const ROTULO_ESTADO_AJUSTE: Record<EstadoAjuste, string> = {
  pendente: 'Aguardando aprovação',
  aprovado: 'Aprovado',
  recusado: 'Recusado',
};

/**
 * De onde veio a apuracao.
 *
 * 'tolerancia_automatica' nasce ja aprovada, sem aprovador humano: e a
 * diferenca pequena que a CLT (art. 58 par. 1) manda desprezar. Guardamos a
 * origem para o espelho conseguir dizer que ninguem carimbou aquilo — e para
 * o RH separar o que foi decisao de gente do que foi regra.
 */
/**
 * De onde veio a decisão sobre o dia.
 *
 * `correcao_manual` entrou quando o Elias corrigiu o espelho pelo RH e o
 * sistema mandou o resultado para o líder aprovar. Quem corrige a batida
 * com autoridade sobre a pessoa já decidiu — pedir carimbo de terceiro
 * sobre o horário que o RH acabou de afirmar inverte a hierarquia, e
 * enche a fila de quem não tem nada a julgar ali.
 */
export type OrigemAjuste =
  | 'pendencia'
  | 'tolerancia_automatica'
  | 'correcao_manual';

/**
 * Dia que comecou e nao fechou — faltou marcacao.
 *
 * Antes sumia em silencio: sem as marcacoes esperadas o dia nao apurava,
 * nao virava pendencia, nao virava debito, e simplesmente nao contava. Era
 * o caminho mais facil para sumir com um dia.
 *
 * Agora vai para a fila de quem responde pela pessoa, que decide: ABONAR
 * (o dia conta como jornada normal) ou MARCAR DEBITO (o dia nao foi
 * trabalhado). Corrigir a marcacao em si continua sendo do RH.
 */
export const TIPO_DIA_INCOMPLETO = 'dia_incompleto';

export interface AjusteJornada {
  id: string;
  colaboradorId: string;
  data: string; // AAAA-MM-DD
  tipo: TipoAjuste;
  /** Sempre positivo. O sinal vem do tipo, para não haver dois jeitos de ler. */
  minutos: number;
  /** O que a batida apurou, guardado junto para a conferência não depender
   *  de recalcular o dia meses depois. */
  minutosTrabalhados: number;
  minutosPrevistos: number;
  estado: EstadoAjuste;
  aprovadorId?: string;
  aprovadorNome?: string;
  decididoEm?: string;
  observacao?: string;
  /** Vazio nas antigas: elas nasceram antes de a tolerancia existir. */
  origem?: OrigemAjuste;
  /**
   * O que o colaborador escreveu no ato da batida.
   *
   * Sem isto o aprovador decide no escuro: ve "trabalhou 9h10 de 8h00" e nao
   * sabe se foi entrega atrasada, cliente no balcao ou esquecimento.
   */
  motivoColaborador?: string;
  /** Comprovante que ele anexou junto, no armazenamento privado. */
  anexoCaminho?: string;
  criadoEm: string;
}

// ============================================================
// AUSENCIA JUSTIFICADA
//
// O que NAO passa por batida: atestado, falta, comparecimento. Segue a mesma
// cadeia de aprovacao da jornada, e pela mesma razao — quem responde pela
// pessoa e quem decide.
// ============================================================

export type TipoAusencia =
  | 'atestado'
  | 'falta_justificada'
  | 'comparecimento'
  | 'folga_sabado'
  | 'ferias'
  | 'outro';

export const ROTULO_TIPO_AUSENCIA: Record<TipoAusencia, string> = {
  atestado: 'Atestado médico',
  falta_justificada: 'Falta justificada',
  comparecimento: 'Comparecimento (declaração)',
  folga_sabado: 'Folga de sábado',
  ferias: 'Férias',
  outro: 'Outro',
};

/**
 * QUAIS AUSÊNCIAS SE PROVAM COM PAPEL.
 *
 * Atestado, declaração de comparecimento e falta justificada só valem com
 * o documento na mão — e é esse acervo que o RH guarda, consulta na
 * homologação e apresenta na fiscalização.
 *
 * Férias e folga de sábado não: uma é programação do ano, a outra é
 * escala do mês. Nenhuma das duas tem documento para arquivar, e
 * misturá-las ao acervo virou uma lista de avisos de coisa recusada em
 * vez do arquivo de documentos que a tela precisa ser.
 *
 * É `Record` de propósito: tipo novo de ausência não compila sem que
 * alguém decida, aqui, se ele entra no acervo.
 */
export const SE_COMPROVA_COM_DOCUMENTO: Record<TipoAusencia, boolean> = {
  atestado: true,
  falta_justificada: true,
  comparecimento: true,
  outro: true,
  folga_sabado: false,
  ferias: false,
};

export type EstadoJustificativa = 'pendente' | 'aprovada' | 'recusada';

export interface JustificativaAusencia {
  id: string;
  colaboradorId: string;
  /** AAAA-MM-DD. Um atestado de 3 dias e UMA solicitacao, nao tres. */
  dataInicio: string;
  dataFim: string;
  tipo: TipoAusencia;
  observacao?: string;
  anexoCaminho?: string;
  anexoNome?: string;
  estado: EstadoJustificativa;
  aprovadorId?: string;
  aprovadorNome?: string;
  decididoEm?: string;
  motivoRecusa?: string;
  criadoEm: string;
}

/**
 * Situacao de um dia que nao tem jornada batida.
 *
 * Existe para o dia deixar de ser so "sem batida" depois que a ausencia e
 * aprovada — senao o espelho de ponto sai com um buraco e ninguem sabe se
 * foi falta, atestado ou esquecimento.
 */
/**
 * HOLERITE: o demonstrativo de pagamento de um mês.
 *
 * Guardamos o CAMINHO do arquivo, nunca o conteúdo. Holerite em base64
 * dentro da tabela incha o banco e faz cada abertura da tela baixar tudo de
 * novo — e o que a pessoa quer é abrir o dela, não os oitenta.
 */
export interface Holerite {
  id: string;
  colaboradorId: string;
  /** AAAA-MM. É de um MÊS, não de um dia. */
  competencia: string;
  arquivoCaminho: string;
  arquivoNome: string;
  enviadoPorId?: string;
  enviadoPorNome?: string;
  criadoEm: string;
}

/** Os três degraus da advertência, na ordem em que a CLT os usa. */
export type TipoAdvertencia = 'verbal' | 'escrita' | 'suspensao';

export const ROTULO_ADVERTENCIA: Record<TipoAdvertencia, string> = {
  verbal: 'Verbal',
  escrita: 'Escrita',
  suspensao: 'Suspensão',
};

/**
 * ADVERTÊNCIA: um registro disciplinar.
 *
 * A CIÊNCIA é do colaborador, e não de quem aplicou. Uma advertência que o
 * RH marca como "ele leu" não é ciência de ninguém — por isso o campo só é
 * preenchido pela própria pessoa, na tela dela.
 */
export interface Advertencia {
  id: string;
  colaboradorId: string;
  tipo: TipoAdvertencia;
  data: string;
  motivo: string;
  /** Dias parados, quando for suspensão. */
  diasSuspensao?: number;
  arquivoCaminho?: string;
  arquivoNome?: string;
  /** Quando o colaborador confirmou que leu. */
  cienciaEm?: string;
  aplicadaPorId?: string;
  aplicadaPorNome?: string;
  criadoEm: string;
}

/**
 * Um dia em que a rede não abre — ou abre menos.
 *
 * `loja` nula vale para a rede inteira. As cinco lojas ficam em cidades
 * diferentes, e o aniversário de Pirassununga não fecha a de Leme: sem
 * essa coluna, o feriado municipal de uma cidade cobraria falta de todo
 * mundo ou perdoaria quem trabalhou.
 *
 * `minutosPrevistos` zero é dia fechado. Maior que zero é meio
 * expediente — 24 e 31 de dezembro costumam ser assim, e sem isso a
 * escolha seria entre cobrar o dia inteiro ou não cobrar nada.
 */
export interface Feriado {
  id: string;
  /** AAAA-MM-DD */
  data: string;
  nome: string;
  loja?: Loja;
  minutosPrevistos: number;
  criadoEm: string;
}

export type SituacaoDoDia =
  | 'normal'
  | 'abonado_atestado'
  | 'falta_justificada'
  | 'comparecimento'
  | 'folga'
  | 'ferias'
  | 'abonado_outro';

export const SITUACAO_POR_TIPO: Record<TipoAusencia, SituacaoDoDia> = {
  atestado: 'abonado_atestado',
  falta_justificada: 'falta_justificada',
  comparecimento: 'comparecimento',
  folga_sabado: 'folga',
  // Férias tem situação própria, e não "folga": o espelho precisa dizer
  // qual das duas foi, e uma contagem de férias não pode varrer as folgas
  // de sábado junto
  ferias: 'ferias',
  outro: 'abonado_outro',
};

/**
 * FOLGA DE SABADO: um direito mensal, nao uma compensacao.
 *
 * Cada colaborador tem uma por mes. O sabado aprovado passa a prever ZERO —
 * o dia nao gera debito nem credito, e o banco de horas nao e tocado.
 *
 * Nao consome saldo de proposito. Se consumisse, quem esta com o banco
 * zerado perderia um direito que a rede da a todos.
 */
export const FOLGAS_DE_SABADO_POR_MES = 1;

export const ROTULO_SITUACAO: Record<SituacaoDoDia, string> = {
  normal: '',
  abonado_atestado: 'Atestado',
  falta_justificada: 'Falta justificada',
  comparecimento: 'Comparecimento',
  folga: 'Folga',
  ferias: 'Férias',
  abonado_outro: 'Abonado',
};

/** Quanto o ajuste soma ou subtrai do banco de horas. */
/**
 * Os minutos com o sinal que eles valem no saldo.
 *
 * Dia sem fechar vale ZERO enquanto não for decidido: o valor guardado ali
 * é a jornada prevista, e ainda não se sabe se ela vira débito ou se o dia
 * é abonado. Contá-lo como crédito faria o saldo pendente mostrar horas a
 * mais para quem simplesmente esqueceu de bater a saída.
 */
export const minutosComSinal = (ajuste: AjusteJornada): number => {
  if (ajuste.tipo === 'dia_incompleto') return 0;
  return ajuste.tipo === 'debito' ? -ajuste.minutos : ajuste.minutos;
};

/** Código de ponto de uma loja, materializado no QR impresso. */
export interface CodigoPontoLoja {
  loja: Loja;
  codigo: string; // 6 caracteres, digitáveis à mão
  atualizadoEm: string;
  atualizadoPorNome?: string;
}

/** Linha do painel de RH: colaborador + números do período. */
export interface ResumoPontoColaborador {
  colaborador: Colaborador;
  jornadas: JornadaDia[];
  minutosTrabalhados: number;
  minutosPrevistos: number;
  saldoPeriodoMinutos: number;
  saldoAcumuladoMinutos: number;
  diasCompletos: number;
  diasComPendencia: number;
  registrouHoje: boolean;
}

// ============================================================
// UNIDADES DA REDE
// ============================================================

export interface InfoLoja {
  nome: Loja;
  tipo: 'Matriz' | 'Filial' | 'Central';
  cidade: string;
  gerente: string;
  telefone: string;
  grupoId?: string;
}

/** Cadastro único das unidades, usado pelo Painel da Rede e pelo RH. */
export const INFORMACOES_LOJAS: InfoLoja[] = [
  {
    nome: 'Pirassununga',
    tipo: 'Matriz',
    cidade: 'Pirassununga - SP',
    gerente: 'Carlos Malachias / Marcos',
    telefone: '(19) 3561-1000',
    grupoId: 'grupo-loja-pirassununga',
  },
  {
    nome: 'Porto Ferreira',
    tipo: 'Filial',
    cidade: 'Porto Ferreira - SP',
    gerente: 'Roberto Fagundes',
    telefone: '(19) 3581-2000',
    grupoId: 'grupo-loja-porto-ferreira',
  },
  {
    nome: 'Palmeiras',
    tipo: 'Filial',
    cidade: 'Santa Cruz das Palmeiras - SP',
    gerente: 'Márcio Prado',
    telefone: '(19) 3672-3000',
    grupoId: 'grupo-loja-palmeiras',
  },
  {
    nome: 'Descalvado',
    tipo: 'Filial',
    cidade: 'Descalvado - SP',
    gerente: 'Fernanda Alves',
    telefone: '(19) 3583-4000',
    grupoId: 'grupo-loja-descalvado',
  },
  {
    nome: 'Santa Rita',
    tipo: 'Filial',
    cidade: 'Santa Rita do Passa Quatro - SP',
    gerente: 'André Villanova',
    telefone: '(19) 3582-5000',
    grupoId: 'grupo-loja-santa-rita',
  },
  {
    nome: 'Rede',
    tipo: 'Central',
    cidade: 'Operações Centrais',
    gerente: 'Vanessa / Marcelo',
    telefone: '(19) 3561-9900',
    grupoId: 'grupo-avisos-da-rede',
  },
];

/**
 * Senha entregue pelo RH para o primeiro acesso de cada colaborador.
 * Trocá-la é obrigatório na primeira entrada. O mínimo de 6 caracteres é
 * exigência da autenticação do Supabase, por isso não pode ser menor.
 */
export const SENHA_PADRAO_PRIMEIRO_ACESSO = '123456';
