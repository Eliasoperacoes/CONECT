/**
 * Ausências justificadas — CONECTA / Malachias Autopeças
 *
 * Atestado, falta justificada e comparecimento: o que NÃO passa por batida
 * nenhuma, e por isso o fluxo automático da jornada nunca enxerga.
 *
 * ===================================================================
 * NEM TUDO AQUI SE DECIDE NO MESMO LUGAR
 * ===================================================================
 *
 * Seguia tudo a cadeia da aprovação de hora. Deu no que o Elias viu: a
 * Aline mandou um atestado, a Leigislaine recusou — e ela não deveria ter
 * podido recusar nada disso.
 *
 * Atestado é DOCUMENTO, não jornada. O líder sabe se a pessoa fez hora
 * extra porque ele estava lá; ele não tem como julgar um atestado, e
 * também não deveria ler um: é dado de saúde de um colega, que pela LGPD
 * pede tratamento restrito a quem precisa dele para trabalhar.
 *
 * Folga de sábado é o contrário — se decide olhando a ESCALA, quantos já
 * estão de folga naquele sábado, e isso quem sabe é quem toca a loja.
 *
 * Então são dois donos, e `quemDecide` diz qual é qual.
 *
 * Um atestado de três dias é UMA solicitação com início e fim, não três
 * pedidos: quem aprova decide uma vez, sobre o documento inteiro.
 */
import {
  Colaborador,
  JustificativaAusencia,
  SituacaoDoDia,
  SITUACAO_POR_TIPO,
  SE_COMPROVA_COM_DOCUMENTO,
  TipoAusencia,
  cuidaDePessoas,
  ehDoRh,
} from '../tipos';
import { deveSerAvisadoSobre } from './organograma';
import {
  lerJustificativas,
  gravarJustificativas,
  assinarJustificativas,
  situacaoDoDia,
} from './justificativasCache';
import { bancoDados } from './bancoDados';
import { servicoPonto } from './ponto';
import { nuvem } from './nuvem';
import { usandoNuvem } from './supabase';

/**
 * O armazenamento vive em `justificativasCache`, um módulo sem
 * dependência nenhuma. A separação existe porque `nuvem` precisa entregar
 * as ausências do banco, e importar ESTE arquivo fecharia o ciclo
 * nuvem → justificativas → ponto → nuvem.
 */
const ler = lerJustificativas;
const gravar = gravarJustificativas;

// Reexportado para quem usa o serviço não precisar saber do cache
export { assinarJustificativas };

/**
 * QUEM DECIDE CADA TIPO.
 *
 * `rh` — o documento. Atestado, falta justificada, comparecimento e
 * "outro" são papéis que se julgam pelo papel, e o atestado ainda carrega
 * dado de saúde. Não é assunto do líder, nem para decidir nem para ler.
 *
 * `cadeia` — a escala. Folga de sábado e férias se decidem olhando quem
 * mais está fora naquele dia, e isso é de quem toca a loja.
 *
 * É A MESMA LINHA de `SE_COMPROVA_COM_DOCUMENTO`, vista do outro lado:
 * quem guarda o papel é quem decide sobre o papel. Escrevê-la de novo
 * aqui deixaria o acervo do RH e a fila de aprovação discordando no dia
 * em que um tipo novo aparecesse — e foi assim que férias entrou na
 * tela de atestados.
 */
export const quemDecide = (tipo: TipoAusencia): 'rh' | 'cadeia' =>
  SE_COMPROVA_COM_DOCUMENTO[tipo] ? 'rh' : 'cadeia';

/**
 * Esta pessoa pode decidir ESTA solicitação?
 *
 * As duas metades têm a mesma trava de não decidir sobre si mesmo, mas
 * por caminhos diferentes: na cadeia quem cuida disso é
 * `podeDecidirSobre`; no RH é a comparação explícita aqui embaixo —
 * alguém do RH mandando o próprio atestado não se aprova.
 */
export const podeDecidirSobreAusencia = (
  quem: Colaborador,
  dono: Colaborador,
  tipo: TipoAusencia
): boolean => {
  if (quemDecide(tipo) === 'cadeia') return servicoPonto.podeDecidirSobre(dono);

  /**
   * `cuidaDePessoas` e não `ehDoRh`: Diretoria e TI continuam alcançando,
   * como alcançam todo o resto do sistema. Sem isso, um atestado ficaria
   * parado para sempre se o RH estivesse de férias — e não haveria quem
   * destravasse.
   *
   * Quem é AVISADO é mais estreito que quem pode decidir, e essa
   * diferença está em `deveSerAvisadoDeAusencia`.
   */
  return cuidaDePessoas(quem) && quem.id !== dono.id;
};

/**
 * Esta pessoa deve ser AVISADA desta solicitação?
 *
 * Poder decidir não é precisar ser avisado — é a mesma distinção que o
 * organograma já faz para a jornada. O atestado é trabalho do RH: é o
 * sino do RH que tem de tocar, e não o de todo diretor e todo TI da rede.
 */
export const deveSerAvisadoDeAusencia = (
  quem: Colaborador,
  dono: Colaborador,
  tipo: TipoAusencia
): boolean => {
  if (quemDecide(tipo) === 'cadeia') {
    return deveSerAvisadoSobre(quem, dono, bancoDados.obterColaboradores());
  }
  return ehDoRh(quem) && quem.id !== dono.id;
};

/** Os dias de um período, inclusive as pontas. */
const diasDoPeriodo = (inicio: string, fim: string): string[] => {
  const dias: string[] = [];
  const [ai, mi, di] = inicio.split('-').map(Number);
  const [af, mf, df] = fim.split('-').map(Number);
  const atual = new Date(ai, mi - 1, di, 12);
  const ultimo = new Date(af, mf - 1, df, 12);

  // 400 é trava contra data estragada virando laço infinito
  let limite = 0;
  while (atual <= ultimo && limite < 400) {
    dias.push(
      `${atual.getFullYear()}-${String(atual.getMonth() + 1).padStart(2, '0')}-${String(
        atual.getDate()
      ).padStart(2, '0')}`
    );
    atual.setDate(atual.getDate() + 1);
    limite++;
  }
  return dias;
};

/**
 * Abre a solicitação. Nasce SEMPRE pendente e SEMPRE em nome de quem está
 * logado — abrir já aprovada, ou em nome de outro, é o atalho que a
 * invariante "sem pular etapas" existe para fechar.
 */
export const solicitarAusencia = async (dados: {
  dataInicio: string;
  dataFim: string;
  tipo: TipoAusencia;
  observacao?: string;
  anexoCaminho?: string;
  anexoNome?: string;
}): Promise<{ sucesso: boolean; justificativa?: JustificativaAusencia; erro?: string }> => {
  const eu = bancoDados.obterColaboradorAtual();

  if (!dados.dataInicio || !dados.dataFim) {
    return { sucesso: false, erro: 'Informe o período.' };
  }
  if (dados.dataFim < dados.dataInicio) {
    return { sucesso: false, erro: 'O fim não pode ser antes do início.' };
  }
  // Atestado sem documento é palavra; a decisão do gestor precisa de algo
  // em que se apoiar, e é isso que o RH vai guardar
  if (dados.tipo === 'atestado' && !dados.anexoCaminho) {
    return { sucesso: false, erro: 'Anexe o atestado.' };
  }

  /**
   * FOLGA DE SÁBADO: um direito mensal, não uma compensação.
   *
   * Duas regras próprias, e as duas existem para o direito ser igual para
   * todos: só cai em sábado, e é uma por mês. Sem o limite, quem pedisse
   * primeiro levaria todos os sábados do mês.
   */
  if (dados.tipo === 'folga_sabado') {
    if (dados.dataInicio !== dados.dataFim) {
      return { sucesso: false, erro: 'A folga é de um sábado só.' };
    }
    if (!ehSabado(dados.dataInicio)) {
      return { sucesso: false, erro: 'A folga é sempre num sábado.' };
    }

    const jaTem = folgaDoMes(eu.id, dados.dataInicio);
    if (jaTem) {
      return {
        sucesso: false,
        erro: `Você já tem folga ${
          jaTem.estado === 'pendente' ? 'solicitada' : 'aprovada'
        } para ${jaTem.dataInicio.split('-').reverse().join('/')} neste mês.`,
      };
    }
  }

  const justificativa: JustificativaAusencia = {
    id: `just-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    colaboradorId: eu.id,
    dataInicio: dados.dataInicio,
    dataFim: dados.dataFim,
    tipo: dados.tipo,
    observacao: dados.observacao?.trim() || undefined,
    anexoCaminho: dados.anexoCaminho,
    anexoNome: dados.anexoNome,
    estado: 'pendente',
    criadoEm: new Date().toISOString(),
  };

  // O banco primeiro: uma solicitação que não subiu apareceria só para quem
  // pediu, e o gestor nunca saberia que existe
  if (usandoNuvem()) {
    const res = await nuvem.salvarJustificativa(justificativa);
    if (!res.sucesso) {
      return { sucesso: false, erro: res.erro || 'Falha ao enviar a solicitação.' };
    }
  }

  gravar([...ler(), justificativa]);
  bancoDados.registrarAuditoria(
    'Ausência justificada',
    'usuario',
    `${eu.nome} solicitou ${dados.tipo} de ${dados.dataInicio} a ${dados.dataFim}.`
  );

  return { sucesso: true, justificativa };
};

/**
 * A LIDERANÇA LANÇA A AUSÊNCIA DA EQUIPE, sem esperar pedido.
 *
 * `solicitarAusencia` cobre o que parte da pessoa — atestado, folga. Não
 * cobre PLANEJAR: montar a escala de férias do semestre ou fechar os
 * sábados do mês é trabalho de quem organiza a equipe, e não existe
 * pedido do colaborador para responder.
 *
 * NASCE APROVADA, e é de propósito: quem lança é quem aprovaria de
 * qualquer jeito. Criar pendente para aprovar em seguida seria teatro,
 * e deixaria a escala cheia de linhas amarelas que ninguém precisa
 * decidir.
 *
 * O limite de uma folga de sábado por mês vale aqui também. Ele existe
 * para o direito ser igual para todos, e não para conter quem pede
 * demais — afrouxá-lo para a liderança desfaria justamente isso.
 */
export const lancarAusenciaPelaLideranca = async (dados: {
  colaboradorId: string;
  dataInicio: string;
  dataFim: string;
  tipo: TipoAusencia;
  observacao?: string;
}): Promise<{ sucesso: boolean; justificativa?: JustificativaAusencia; erro?: string }> => {
  const eu = bancoDados.obterColaboradorAtual();
  const pessoa = bancoDados.obterColaboradorPorId(dados.colaboradorId);

  if (!pessoa) return { sucesso: false, erro: 'Colaborador não encontrado.' };

  // A MESMA regra do aprovar. Uma segunda aqui divergiria, e a liderança
  // acabaria lançando folga de quem não é da equipe dela.
  if (!servicoPonto.podeDecidirSobre(pessoa)) {
    return {
      sucesso: false,
      erro: 'Você não responde por esta pessoa. A escala dela é de quem responde por ela.',
    };
  }

  if (!dados.dataInicio || !dados.dataFim) {
    return { sucesso: false, erro: 'Informe o período.' };
  }
  if (dados.dataFim < dados.dataInicio) {
    return { sucesso: false, erro: 'O fim não pode ser antes do início.' };
  }

  if (dados.tipo === 'folga_sabado') {
    if (dados.dataInicio !== dados.dataFim) {
      return { sucesso: false, erro: 'A folga é de um sábado só.' };
    }
    if (!ehSabado(dados.dataInicio)) {
      return { sucesso: false, erro: 'A folga é sempre num sábado.' };
    }
    const jaTem = folgaDoMes(pessoa.id, dados.dataInicio);
    if (jaTem) {
      return {
        sucesso: false,
        erro: `${pessoa.nome} já tem folga ${
          jaTem.estado === 'pendente' ? 'solicitada' : 'marcada'
        } em ${jaTem.dataInicio.split('-').reverse().join('/')} neste mês.`,
      };
    }
  }

  const agora = new Date().toISOString();
  const justificativa: JustificativaAusencia = {
    id: `just-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    colaboradorId: pessoa.id,
    dataInicio: dados.dataInicio,
    dataFim: dados.dataFim,
    tipo: dados.tipo,
    observacao: dados.observacao?.trim() || undefined,
    estado: 'aprovada',
    aprovadorId: eu.id,
    aprovadorNome: eu.nome,
    decididoEm: agora,
    criadoEm: agora,
  };

  // O banco primeiro: escala que não subiu só existiria no aparelho de
  // quem montou, e a pessoa escalada nunca saberia
  if (usandoNuvem()) {
    const res = await nuvem.salvarJustificativa(justificativa);
    if (!res.sucesso) {
      return { sucesso: false, erro: res.erro || 'Falha ao gravar na escala.' };
    }
  }

  gravar([...ler(), justificativa]);
  bancoDados.registrarAuditoria(
    'Escala lançada pela liderança',
    'usuario',
    `${eu.nome} lançou ${dados.tipo} para ${pessoa.nome} de ${dados.dataInicio} a ${dados.dataFim}.`
  );

  return { sucesso: true, justificativa };
};

/** O dia da semana, sem depender de fuso: a data já vem como AAAA-MM-DD. */
const ehSabado = (data: string): boolean => {
  const [ano, mes, dia] = data.split('-').map(Number);
  return new Date(ano, (mes || 1) - 1, dia || 1, 12).getDay() === 6;
};

/**
 * A folga já pedida no mês desta data, se houver.
 *
 * Recusada não conta: a pessoa pode pedir outro sábado depois de o gestor
 * negar o primeiro — senão uma recusa queimaria o direito do mês.
 */
export const folgaDoMes = (
  colaboradorId: string,
  data: string
): JustificativaAusencia | undefined => {
  const mes = data.slice(0, 7);
  return ler().find(
    (j) =>
      j.colaboradorId === colaboradorId &&
      j.tipo === 'folga_sabado' &&
      j.estado !== 'recusada' &&
      j.dataInicio.slice(0, 7) === mes
  );
};

/** As minhas, da mais recente para a mais antiga. */
export const minhasJustificativas = (): JustificativaAusencia[] => {
  const eu = bancoDados.obterColaboradorAtual();
  return ler()
    .filter((j) => j.colaboradorId === eu.id)
    .sort((a, b) => b.criadoEm.localeCompare(a.criadoEm));
};

/**
 * A fila de quem decide.
 *
 * `podeDecidirSobre` é a mesma função que decide a hora extra — não há
 * segunda regra de alçada aqui. Ela já recusa a si mesmo, então ninguém
 * aprova a própria ausência nem sendo Diretoria ou TI.
 */
export const pendenciasParaDecidir = (opcoes: { tipo?: 'ausencia' | 'folga' } = {}): {
  justificativa: JustificativaAusencia;
  colaborador: Colaborador;
}[] =>
  ler()
    .filter((j) => j.estado === 'pendente')
    /**
     * FOLGA NÃO É AUSÊNCIA.
     *
     * As duas usam a mesma tabela porque o caminho de aprovação é o mesmo,
     * mas são coisas diferentes para quem decide: a ausência se julga pelo
     * documento, e a folga se julga pela ESCALA — quantos já estão de folga
     * naquele sábado. Misturá-las numa fila só obrigava o gestor a decidir
     * folga sem ver o calendário.
     */
    .filter((j) =>
      opcoes.tipo === 'folga'
        ? j.tipo === 'folga_sabado'
        : j.tipo !== 'folga_sabado'
    )
    .map((justificativa) => ({
      justificativa,
      colaborador: bancoDados.obterColaboradorPorId(justificativa.colaboradorId),
    }))
    .filter(
      (item): item is { justificativa: JustificativaAusencia; colaborador: Colaborador } =>
        !!item.colaborador &&
        podeDecidirSobreAusencia(
          bancoDados.obterColaboradorAtual(),
          item.colaborador,
          item.justificativa.tipo
        )
    )
    .sort((a, b) => a.justificativa.dataInicio.localeCompare(b.justificativa.dataInicio));

/** Aprova ou recusa. Recusar exige motivo, como na jornada. */
export const decidirAusencia = async (
  id: string,
  aprovada: boolean,
  motivoRecusa?: string
): Promise<{ sucesso: boolean; erro?: string }> => {
  const eu = bancoDados.obterColaboradorAtual();
  const lista = ler();
  const indice = lista.findIndex((j) => j.id === id);

  if (indice === -1) return { sucesso: false, erro: 'Solicitação não encontrada.' };

  const alvo = lista[indice];
  const dono = bancoDados.obterColaboradorPorId(alvo.colaboradorId);
  if (!dono || !podeDecidirSobreAusencia(eu, dono, alvo.tipo)) {
    return {
      sucesso: false,
      erro:
        dono && quemDecide(alvo.tipo) === 'rh'
          ? 'Atestados e declarações são decididos pelo RH.'
          : 'Você não responde por esta pessoa. A decisão cabe ao líder ou ao gerente dela.',
    };
  }
  if (!aprovada && !motivoRecusa?.trim()) {
    return { sucesso: false, erro: 'Informe o motivo da recusa.' };
  }

  const decidida: JustificativaAusencia = {
    ...alvo,
    estado: aprovada ? 'aprovada' : 'recusada',
    aprovadorId: eu.id,
    aprovadorNome: eu.nome,
    decididoEm: new Date().toISOString(),
    motivoRecusa: aprovada ? undefined : motivoRecusa?.trim(),
  };

  if (usandoNuvem()) {
    const res = await nuvem.salvarJustificativa(decidida);
    if (!res.sucesso) {
      return { sucesso: false, erro: res.erro || 'Falha ao registrar a decisão.' };
    }
  }

  lista[indice] = decidida;
  gravar(lista);

  bancoDados.registrarAuditoria(
    'Ausência justificada',
    'usuario',
    `${eu.nome} ${aprovada ? 'aprovou' : 'recusou'} ${alvo.tipo} de ${dono.nome}.`
  );

  return { sucesso: true };
};

// Vem da folha: `ponto` também precisa dela, e importar este arquivo de lá
// refecharia o ciclo que já derrubou o aplicativo uma vez
export { situacaoDoDia };

/** Os dias cobertos por uma solicitação, para a tela mostrar o alcance. */
export const diasCobertos = (justificativa: JustificativaAusencia): string[] =>
  diasDoPeriodo(justificativa.dataInicio, justificativa.dataFim);

/** A fila de FOLGAS, decidida na Escala de folgas. */
export const pendenciasDeFolga = () => pendenciasParaDecidir({ tipo: 'folga' });

/**
 * ===================================================================
 * A ESCALA DE FÉRIAS
 * ===================================================================
 *
 * Férias do ano inteiro, para várias pessoas no mesmo período. O gestor
 * escolhe cinco nomes, um início e um fim, e grava de uma vez — era um
 * formulário por pessoa.
 *
 * O QUE ESTE MÓDULO NÃO FAZ: decidir quantos dias alguém tem direito,
 * nem quantos podem sair juntos. Ele MOSTRA os dois números e deixa a
 * decisão com quem toca a loja.
 *
 * É deliberado. O art. 130 da CLT dá 30 dias por período aquisitivo, mas
 * o período aquisitivo de cada um começa na data de admissão dele, e o
 * sistema não acompanha aquisição — só o que foi lançado. Bloquear a 31ª
 * diária com esse dado incompleto recusaria férias legítimas de quem
 * virou período no meio do ano.
 *
 * E quantos podem sair juntos não existe em lugar nenhum da rede: é
 * julgamento de quem conhece o movimento da loja.
 */

/** Os dias corridos de um período, incluindo as duas pontas. */
export const diasCorridos = (inicio: string, fim: string): number => {
  const a = new Date(`${inicio}T12:00:00`).getTime();
  const b = new Date(`${fim}T12:00:00`).getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return 0;
  return Math.round((b - a) / 86400000) + 1;
};

/**
 * Quem da equipe já tem férias encostando neste período.
 *
 * "Encostando" e não "dentro": um período que termina no dia em que o
 * outro começa deixa a loja sem os dois na virada, e é justamente o
 * caso que passa despercebido quando se compara só o início.
 *
 * Devolve informação, não recusa. Dois vendedores fora na mesma semana
 * pode ser tranquilo numa loja e impossível noutra — quem sabe disso é
 * quem está lá.
 */
export const conflitosDeFerias = (
  inicio: string,
  fim: string,
  ignorarIds: string[] = []
): Array<{ colaborador: Colaborador; justificativa: JustificativaAusencia }> => {
  const aIgnorar = new Set(ignorarIds);

  return ler()
    .filter(
      (j) =>
        j.tipo === 'ferias' &&
        j.estado !== 'recusada' &&
        !aIgnorar.has(j.colaboradorId) &&
        j.dataInicio <= fim &&
        j.dataFim >= inicio
    )
    .map((justificativa) => ({
      justificativa,
      colaborador: bancoDados.obterColaboradorPorId(justificativa.colaboradorId),
    }))
    .filter(
      (item): item is { colaborador: Colaborador; justificativa: JustificativaAusencia } =>
        !!item.colaborador && servicoPonto.podeDecidirSobre(item.colaborador)
    );
};

/** Quantos dias de férias esta pessoa já tem lançados no ano. */
export const diasDeFeriasNoAno = (colaboradorId: string, ano: number): number =>
  ler()
    .filter(
      (j) =>
        j.colaboradorId === colaboradorId &&
        j.tipo === 'ferias' &&
        j.estado !== 'recusada' &&
        j.dataInicio.slice(0, 4) === String(ano)
    )
    .reduce((total, j) => total + diasCorridos(j.dataInicio, j.dataFim), 0);

/**
 * Lança o MESMO período para várias pessoas.
 *
 * Como a escala de sábado, o lote não é tudo-ou-nada: quem escala cinco
 * e esbarra na alçada de uma quer as outras quatro gravadas, e o que
 * falhou volta com nome e motivo.
 */
export const salvarEscalaDeFerias = async (dados: {
  colaboradorIds: string[];
  dataInicio: string;
  dataFim: string;
  observacao?: string;
}): Promise<{ aplicadas: number; falhas: Array<{ nome: string; erro: string }> }> => {
  const falhas: Array<{ nome: string; erro: string }> = [];
  let aplicadas = 0;

  for (const colaboradorId of dados.colaboradorIds) {
    const nome = bancoDados.obterColaboradorPorId(colaboradorId)?.nome || 'Colaborador';

    const res = await lancarAusenciaPelaLideranca({
      colaboradorId,
      dataInicio: dados.dataInicio,
      dataFim: dados.dataFim,
      tipo: 'ferias',
      observacao: dados.observacao,
    });

    if (res.sucesso) aplicadas += 1;
    else falhas.push({ nome, erro: res.erro || 'Não foi possível lançar as férias.' });
  }

  return { aplicadas, falhas };
};

/**
 * ===================================================================
 * A ESCALA DO MÊS, GRAVADA DE UMA VEZ
 * ===================================================================
 *
 * A tela de escala monta o mês arrastando gente para os sábados. Isso é
 * RASCUNHO até alguém apertar salvar — e o rascunho é local, porque
 * gravar a cada arrastão encheria o banco de folga que o gestor ia
 * desfazer no segundo seguinte.
 *
 * O LOTE NÃO É TUDO-OU-NADA, e é de propósito. Quem monta a escala de
 * doze pessoas e esbarra num limite de mês numa delas quer as outras
 * onze gravadas — não quer perder o trabalho inteiro por causa de uma.
 * Então cada uma passa pela regra sozinha, e o que falhou volta com
 * NOME e MOTIVO, para a tela dizer exatamente quem ficou de fora.
 *
 * Nenhuma regra nova mora aqui: cada adição chama
 * `lancarAusenciaPelaLideranca`, que já carrega a alçada (é ela que faz
 * a separação por loja), o limite de uma folga por mês e a trava de só
 * sábado. Uma segunda cópia disso aqui divergiria no primeiro ajuste.
 */
export const salvarEscalaDeFolgas = async (alteracoes: {
  adicionar: Array<{ colaboradorId: string; sabado: string }>;
  remover: Array<{ justificativaId: string; motivo?: string }>;
}): Promise<{
  aplicadas: number;
  falhas: Array<{ nome: string; erro: string }>;
}> => {
  const falhas: Array<{ nome: string; erro: string }> = [];
  let aplicadas = 0;

  /**
   * REMOVE ANTES DE ADICIONAR.
   *
   * Trocar alguém de sábado é uma remoção e uma adição. Na ordem
   * contrária, a adição esbarra na folga que ainda não saiu e o limite
   * do mês recusa a própria troca que o gestor acabou de desenhar.
   */
  for (const { justificativaId, motivo } of alteracoes.remover) {
    const alvo = ler().find((j) => j.id === justificativaId);
    const nome =
      bancoDados.obterColaboradorPorId(alvo?.colaboradorId || '')?.nome || 'Colaborador';

    /**
     * Sai como RECUSADA, e não apagada.
     *
     * `folgaDoMes` já ignora recusada, então o direito do mês volta a
     * ficar livre — que é o que a troca precisa. E o registro continua
     * no histórico: folga é documento, e documento que some não se
     * audita depois.
     */
    const res = await decidirAusencia(
      justificativaId,
      false,
      motivo?.trim() || 'Retirado da escala pela liderança.'
    );

    if (res.sucesso) aplicadas += 1;
    else falhas.push({ nome, erro: res.erro || 'Não foi possível retirar da escala.' });
  }

  for (const { colaboradorId, sabado } of alteracoes.adicionar) {
    const nome = bancoDados.obterColaboradorPorId(colaboradorId)?.nome || 'Colaborador';

    const res = await lancarAusenciaPelaLideranca({
      colaboradorId,
      dataInicio: sabado,
      dataFim: sabado,
      tipo: 'folga_sabado',
    });

    if (res.sucesso) aplicadas += 1;
    else falhas.push({ nome, erro: res.erro || 'Não foi possível marcar a folga.' });
  }

  return { aplicadas, falhas };
};
