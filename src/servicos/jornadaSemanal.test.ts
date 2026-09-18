/**
 * Verificação da jornada semanal — CONECTA
 *
 * O QUE MOTIVOU, relatado por quem usa: "o app na hora de bater o ponto
 * está considerando que todo colaborador sairia às 18h ou não cumpriu sua
 * carga diária".
 *
 * A rede não tem uma jornada só:
 *
 *   - colaborador     8h10 por dia + 4h de sábado  = 44h50 na semana
 *   - estagiário A    6h por dia, NÃO vem sábado   = 30h na semana
 *   - estagiário B    menos por dia, VEM no sábado = 30h na semana
 *
 * Cobrar por DIA reprovava os dois estagiários todo dia, sem que nada
 * estivesse errado.
 */
import { test, expect } from 'bun:test';
import {
  cargaSemanalDe,
  trabalhaNoSabado,
  temIntervaloNoDia,
  ehDeEstagio,
  MINUTOS_SEMANA_PADRAO,
  MINUTOS_SEMANA_ESTAGIO,
  CARGA_HORARIA_PADRAO_MINUTOS,
  MINUTOS_SABADO,
} from '../tipos';

test('a semana do colaborador sai do relogio do turno, e nao de um numero escolhido', () => {
  // 8h10 por dia, com o almoço de 1h30 que a rede pratica
  expect(CARGA_HORARIA_PADRAO_MINUTOS).toBe(490);
  expect(MINUTOS_SABADO).toBe(240);

  // Cinco dias úteis mais o sábado
  expect(MINUTOS_SEMANA_PADRAO).toBe(490 * 5 + 240);
  expect(MINUTOS_SEMANA_PADRAO).toBe(2690); // 44h50
});

test('a semana do estagio e 30h, cheguem elas como chegarem', () => {
  expect(MINUTOS_SEMANA_ESTAGIO).toBe(1800);

  const estagiario = { setor: 'Estágio', cargo: 'Estagiário' };
  expect(cargaSemanalDe(estagiario)).toBe(1800);

  /**
   * Os DOIS casos fecham 30h. O que muda é como: um faz 6h de segunda a
   * sexta, o outro faz menos por dia e vem no sábado completar.
   */
  const vemNoSabado = { setor: 'Estágio', trabalhaSabado: true };
  expect(cargaSemanalDe(vemNoSabado)).toBe(1800);
});

test('o padrao do estagio e NAO vir ao sabado, e o do colaborador e vir', () => {
  expect(trabalhaNoSabado({ setor: 'Estágio' })).toBe(false);
  expect(trabalhaNoSabado({ setor: 'Balcão' })).toBe(true);

  /**
   * E a ficha VENCE o padrão: entre os estagiários há os dois contratos, e
   * deduzir pelo setor deixaria metade deles errada. O padrão é só o ponto
   * de partida.
   */
  expect(trabalhaNoSabado({ setor: 'Estágio', trabalhaSabado: true })).toBe(true);
  expect(trabalhaNoSabado({ setor: 'Balcão', trabalhaSabado: false })).toBe(false);
});

test('jornada de ate 6h nao tem intervalo, e por isso bate duas vezes', () => {
  /**
   * Cobrar do estagiário a saída e o retorno do almoço deixava o dia
   * eternamente "pela metade" — era isto que fazia o sistema dizer que ele
   * não cumpriu a jornada.
   */
  expect(temIntervaloNoDia({ setor: 'Estágio' })).toBe(false);
  expect(temIntervaloNoDia({ setor: 'Estoque' })).toBe(true);

  // E a ficha vence também aqui
  expect(temIntervaloNoDia({ setor: 'Estágio', temIntervalo: true })).toBe(true);
});

test('a ficha vence o setor na carga da semana', () => {
  /**
   * O setor é o PADRÃO, nunca a verdade. Um dia pode haver estagiário fora
   * do setor Estágio, e há contratos de 20h e 25h.
   */
  expect(cargaSemanalDe({ setor: 'Estágio', cargaSemanalMinutos: 20 * 60 })).toBe(1200);
  expect(cargaSemanalDe({ setor: 'Balcão', cargaSemanalMinutos: 1800 })).toBe(1800);
});

test('reconhece o estagio pelo setor e pelo cargo', () => {
  expect(ehDeEstagio({ setor: 'Estágio' })).toBe(true);
  expect(ehDeEstagio({ setor: 'Balcão', cargo: 'Estagiário de TI' })).toBe(true);
  expect(ehDeEstagio({ setor: 'Compras', cargo: 'Comprador' })).toBe(false);
});

/**
 * AS BATIDAS ESPERADAS SÃO DA PESSOA, NÃO DA DATA.
 *
 * Era daqui que vinha o defeito: `marcacoesEsperadas(data)` olhava só o
 * calendário, então cobrava de todo mundo quatro batidas e um sábado.
 */
test('quem nao vem ao sabado nao tem batida esperada no sabado', async () => {
  const { marcacoesEsperadas } = await import('./ponto');

  // 2026-09-19 é um sábado
  const sabado = '2026-09-19';
  const estagiario = { id: 'e1', setor: 'Estágio' } as never;
  const colaborador = { id: 'c1', setor: 'Balcão' } as never;

  expect(marcacoesEsperadas(sabado, estagiario)).toEqual([]);
  expect(marcacoesEsperadas(sabado, colaborador)).toEqual(['entrada', 'saida']);
});

test('quem nao tem intervalo bate duas vezes no dia util', async () => {
  const { marcacoesEsperadas } = await import('./ponto');

  const terca = '2026-09-15';
  const estagiario = { id: 'e1', setor: 'Estágio' } as never;
  const colaborador = { id: 'c1', setor: 'Balcão' } as never;

  expect(marcacoesEsperadas(terca, estagiario)).toEqual(['entrada', 'saida']);
  expect(marcacoesEsperadas(terca, colaborador)).toHaveLength(4);
});

test('sem a pessoa, vale o dia comum da rede', async () => {
  const { marcacoesEsperadas } = await import('./ponto');

  /**
   * Há chamadas que só sabem a data. Para elas o dia comum é a resposta
   * certa — e mudar isso para uma lista vazia sumiria com pendência de
   * verdade.
   */
  expect(marcacoesEsperadas('2026-09-15')).toHaveLength(4);
  expect(marcacoesEsperadas('2026-09-19')).toEqual(['entrada', 'saida']);
});

/**
 * O CICLO É DE SÁBADO A SEXTA. É o ciclo da casa, e não uma semana de
 * calendário.
 *
 * Eu havia feito de segunda a domingo por conta própria, argumentando que
 * assim o sábado caía no fim. Estava errado, e o Elias corrigiu: quem fecha
 * o ciclo é a SEXTA, e o sábado ABRE o seguinte.
 *
 * E faz sentido justamente por causa da conferência: quando o líder senta
 * no sábado para olhar o banco de horas, o ciclo que ele confere terminou
 * na véspera. Com o sábado no fim, ele estaria conferindo um ciclo que
 * ainda não acabou — o dia dele mesmo.
 */
test('o ciclo vai de sabado a sexta', async () => {
  const { semanaDe } = await import('./ponto');

  // 2026-09-19 é um sábado: ele ABRE o ciclo
  expect(semanaDe('2026-09-19')).toEqual({ inicio: '2026-09-19', fim: '2026-09-25' });

  // 2026-09-18 é a sexta anterior: ela FECHA o ciclo que começou dia 12
  expect(semanaDe('2026-09-18')).toEqual({ inicio: '2026-09-12', fim: '2026-09-18' });

  // Domingo, segunda e quarta caem no ciclo aberto pelo sábado dia 19
  expect(semanaDe('2026-09-20').inicio).toBe('2026-09-19');
  expect(semanaDe('2026-09-21').inicio).toBe('2026-09-19');
  expect(semanaDe('2026-09-23').inicio).toBe('2026-09-19');

  // E todo ciclo tem sete dias
  const ciclo = semanaDe('2026-09-16');
  expect(ciclo).toEqual({ inicio: '2026-09-12', fim: '2026-09-18' });
});

test('o sabado da conferencia olha o ciclo que ACABOU', async () => {
  const { semanaDe } = await import('./ponto');

  /**
   * No sábado o líder confere o ciclo anterior — o que fechou na sexta. O
   * ciclo do próprio sábado mal começou, e conferir ele seria olhar um dia
   * só.
   */
  const sabado = '2026-09-19';
  const doProprioSabado = semanaDe(sabado);
  expect(doProprioSabado.inicio).toBe(sabado);

  // O anterior é o que interessa na conferência: fecha na véspera
  const anterior = semanaDe('2026-09-18');
  expect(anterior.fim).toBe('2026-09-18');
});

/**
 * A RELAÇÃO DO BANCO DE HORAS DO CICLO.
 *
 * É o que o líder abre no sábado: uma linha por pessoa da equipe dele, com
 * o que ela trabalhou no ciclo que fechou, o que devia, o saldo e o que
 * ficou pendente de batida.
 */
const lerPonto = async (): Promise<string> =>
  Bun.file(new URL('./ponto.ts', import.meta.url)).text();

const semComentarios = (fonte: string): string =>
  fonte.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

test('a relacao do ciclo e so da equipe de quem abre', async () => {
  const codigo = semComentarios(await lerPonto());
  const inicio = codigo.indexOf('relacaoSemanalDaEquipe');
  const corpo = codigo.slice(inicio, inicio + 3000);

  /**
   * A relação da rede inteira não é do líder para olhar — e a pergunta é a
   * MESMA da fila de decisão. Se esta lista divergisse, apareceria
   * pendência sem quem a decida, ou o contrário.
   */
  expect(corpo).toContain('this.obterColaboradoresVisiveis()');
  expect(corpo).toContain('this.podeDecidirSobre(c)');
});

test('a folga do sabado JA VEM DESCONTADA do previsto do ciclo', async () => {
  const codigo = await lerPonto();

  /**
   * É automático, e precisa ser: o previsto de cada dia zera em ausência
   * APROVADA, e a folga de sábado é uma delas. Quem folgou naquele sábado
   * específico tem 4 horas a menos de previsto no ciclo e fecha em dia.
   *
   * Se alguém acrescentar um desconto de folga à parte, a folga passa a
   * ser descontada DUAS vezes e a pessoa fecha o ciclo com crédito falso.
   */
  expect(codigo).toContain(
    "if (colaborador && situacaoDoDia(colaborador.id, data) !== 'normal') return 0;"
  );

  const inicio = codigo.indexOf('relacaoSemanalDaEquipe');
  const corpo = codigo.slice(inicio, inicio + 3000);
  expect(corpo).not.toContain('MINUTOS_SABADO');
});

test('o ciclo marca QUEM folgou, para a conta nao parecer errada', async () => {
  const codigo = semComentarios(await lerPonto());
  const inicio = codigo.indexOf('relacaoSemanalDaEquipe');
  const corpo = codigo.slice(inicio, inicio + 3000);

  /**
   * Sem esta marca o líder vê 40h50 numa linha e 44h50 na de baixo sem
   * explicação, e desconfia da conta.
   */
  expect(corpo).toContain('folgouNoCiclo');
  expect(corpo).toContain("situacaoDoDia(colaborador.id, data) === 'folga'");
});

test('quem precisa de decisao vem primeiro na relacao', async () => {
  const codigo = semComentarios(await lerPonto());
  const inicio = codigo.indexOf('relacaoSemanalDaEquipe');
  const corpo = codigo.slice(inicio, inicio + 3500);

  /**
   * A relação existe para agir, não para consultar: o que precisa de
   * decisão tem de estar no alto, e não no meio de oitenta linhas
   * ordenadas por nome.
   */
  expect(corpo).toContain('b.diasComPendencia.length - a.diasComPendencia.length');
  expect(corpo).toContain('a.saldoMinutos - b.saldoMinutos');
});

test('o painel do ciclo abre no ciclo FECHADO, nao no de hoje', async () => {
  const tela = await Bun.file(
    new URL('../componentes/CicloSemanal.tsx', import.meta.url)
  ).text();

  /**
   * A conferência é de sábado, e no sábado o ciclo do dia mal começou —
   * olhar para ele mostraria um dia só.
   */
  expect(tela).toContain('useState(-1)');

  // E não deixa avançar para o futuro
  expect(tela).toContain('Math.min(d + 1, 0)');
});

test('o painel do ciclo mostra so quem precisa de decisao', async () => {
  const tela = await Bun.file(
    new URL('../componentes/CicloSemanal.tsx', import.meta.url)
  ).text();

  /**
   * Não é uma segunda lista da equipe: a de baixo responde "como está minha
   * equipe no mês", esta responde "o que precisa de mim neste ciclo". Duas
   * listas iguais seriam duas telas para a mesma coisa.
   */
  expect(tela).toContain('const precisamDeVoce = [...totais.comPendencia, ...totais.devendo]');
  expect(tela).toContain('aoEscolherPeriodo(relacao.inicio, relacao.fim)');
});

/**
 * A JORNADA PRECISA TER ONDE SER EDITADA E TEM QUE CHEGAR AO BANCO.
 *
 * Achado no pente fino: os três campos existiam no tipo e na regra, mas não
 * tinham tela nem coluna. Na prática só o padrão do setor funcionava — e o
 * estagiário que VEM ao sábado, que é justamente a exceção, não tinha como
 * ser marcado.
 */
test('a jornada da semana chega ao banco nos dois sentidos', async () => {
  const ponte = await Bun.file(new URL('./nuvem.ts', import.meta.url)).text();

  // Sobe
  expect(ponte).toContain('carga_semanal_minutos: c.cargaSemanalMinutos ?? null');
  expect(ponte).toContain('trabalha_sabado: c.trabalhaSabado ?? null');
  expect(ponte).toContain('tem_intervalo: c.temIntervalo ?? null');

  // E desce
  expect(ponte).toContain('cargaSemanalMinutos: linha.carga_semanal_minutos ?? undefined');
  expect(ponte).toContain('trabalhaSabado: linha.trabalha_sabado ?? undefined');
  expect(ponte).toContain('temIntervalo: linha.tem_intervalo ?? undefined');
});

test('VAZIO quer dizer "padrao do setor", e nunca zero', async () => {
  const ponte = await Bun.file(new URL('./nuvem.ts', import.meta.url)).text();

  /**
   * Uma carga semanal de ZERO faria a pessoa fechar todo ciclo com crédito
   * da semana inteira. E um número copiado do padrão congelaria a pessoa
   * numa jornada que ninguém escolheu — mudar o padrão depois não a
   * alcançaria mais.
   */
  expect(ponte).not.toContain('carga_semanal_minutos: c.cargaSemanalMinutos ?? 0');
  expect(ponte).not.toContain('cargaSemanalMinutos: linha.carga_semanal_minutos ?? 0');

  const sql = await Bun.file(
    new URL('../../supabase/jornada-por-pessoa.sql', import.meta.url)
  ).text();
  // Sem `not null` e sem default: é o nulo que guarda o sentido de "padrão"
  expect(sql).toContain('add column if not exists carga_semanal_minutos integer');
  expect(sql).not.toContain('not null');
  expect(sql).toContain("notify pgrst, 'reload schema'");
});

test('a ficha deixa marcar o estagiario que VEM ao sabado', async () => {
  const modal = await Bun.file(
    new URL('../componentes/ModalCadastroColaborador.tsx', import.meta.url)
  ).text();

  // Os três campos, e todos com a opção de seguir o padrão
  expect(modal).toContain('id="cad-semanal"');
  expect(modal).toContain('id="cad-sabado"');
  expect(modal).toContain('id="cad-intervalo"');
  expect((modal.match(/Padrão do setor/g) || []).length).toBe(3);

  // E o que for escolhido tem de sair do formulário para a ficha
  expect(modal).toContain('cargaSemanalMinutos: form.cargaSemanalMinutos');
  expect(modal).toContain('trabalhaSabado: form.trabalhaSabado');
  expect(modal).toContain('temIntervalo: form.temIntervalo');
});

/**
 * O AVISO DE PENDÊNCIA JÁ EXISTIA — E NUNCA DISPARAVA.
 *
 * Dois bugs se protegendo:
 *
 *  - `levantarDiasIncompletos` só rodava DENTRO da aba "Aprovar jornadas".
 *    A pendência só nascia se o responsável abrisse exatamente a tela que a
 *    lista — e o aviso que deveria chamá-lo até lá depende dela existir;
 *  - o aviso ficava calado na primeira passada, para não dar susto com
 *    coisa antiga. Só que quem abre o sistema de manhã com cinco jornadas
 *    paradas não era avisado de nenhuma.
 *
 * Na prática, o aviso existia para quem já estava com a tela aberta quando
 * a pendência nascesse. Ou seja: ninguém.
 */
test('o levantamento nao depende de alguem abrir a aba certa', async () => {
  const app = await Bun.file(new URL('../App.tsx', import.meta.url)).text();
  expect(app).toContain('servicoPonto.levantarDiasIncompletos().catch(() => {})');

  // E a tela continua levantando: quem abre a fila quer o quadro do momento
  const tela = await Bun.file(
    new URL('../componentes/AprovacaoJornada.tsx', import.meta.url)
  ).text();
  expect(tela).toContain('void servicoPonto.levantarDiasIncompletos()');
});

test('o aviso fala na abertura quando ha o que decidir', async () => {
  const app = await Bun.file(new URL('../App.tsx', import.meta.url)).text();

  expect(app).toContain('const primeiraPassada = antes === null');
  expect(app).toContain('if (primeiraPassada && total === 0) return');
  expect(app).toContain('if (!primeiraPassada && total <= antes) return');

  // Uma vez na abertura, e depois só quando aumenta: o mínimo para saber,
  // e pouco o bastante para não virar barulho
  expect(app).toContain('const novas = primeiraPassada ? total : total - antes');
});

/**
 * O SALDO DO DIA SAIU DA TELA DO COLABORADOR.
 *
 * Ele ficava vermelho a manhã inteira: a pessoa tinha trabalhado duas horas
 * de oito e a tela dizia "-6h00" como se fosse dívida. Não é — o dia só
 * fecha à tarde, e quem decide é a SEMANA.
 */
test('a tela do colaborador mostra a SEMANA, e nao o debito do dia', async () => {
  const aba = await Bun.file(
    new URL('../componentes/AbaPonto.tsx', import.meta.url)
  ).text();

  expect(aba).toContain('servicoPonto.apurarSemana(colaboradorAtual.id, dataDeHoje())');
  expect(aba).toContain('Nesta semana');
  expect(aba).not.toContain('formatarSaldo(jornadaHoje.saldoMinutos)');
});

test('falta de BATIDA e dita como batida, nao como debito de hora', async () => {
  const aba = await Bun.file(
    new URL('../componentes/AbaPonto.tsx', import.meta.url)
  ).text();

  /**
   * A primeira a pessoa resolve avisando o responsável; a segunda se
   * resolve trabalhando. Dizer as duas como "débito" faria ela tentar
   * compensar uma hora que na verdade trabalhou e esqueceu de registrar.
   */
  expect(aba).toContain('com batida faltando');
  expect(aba).toContain('avise seu responsável');
  expect(aba).toContain('semana.diasComPendencia.length > 0');
});

/**
 * O DIA "COMPLETO" DEPENDE DE QUEM É A PESSOA.
 *
 * `obterJornadaDoDia` perguntava só pela data, e por isso cobrava quatro
 * batidas de quem faz seis horas direto: o dia dela nunca ficava completo, e
 * a tela dizia jornada incompleta todo santo dia.
 *
 * Era o segundo lugar que faz a mesma pergunta — corrigi o primeiro e deixei
 * este passar.
 */
test('o dia fecha conforme a jornada da pessoa, e nao do calendario', async () => {
  const ponto = await Bun.file(new URL('./ponto.ts', import.meta.url)).text();

  expect(ponto).toContain('marcacoesEsperadas(data, colaborador).every(');
  expect(ponto).not.toContain('marcacoesEsperadas(data).every(');
});

test('todo lugar que pergunta as batidas passa a PESSOA', async () => {
  const ponto = await Bun.file(new URL('./ponto.ts', import.meta.url)).text();

  /**
   * A chamada sem pessoa continua existindo de propósito — há trechos que
   * só sabem a data. O que não pode é ela aparecer onde a pessoa ESTÁ
   * disponível: foi assim que este defeito nasceu duas vezes.
   */
  const semPessoa = [...ponto.matchAll(/marcacoesEsperadas\(([^)]*)\)/g)]
    .map((m) => m[1].trim())
    .filter((args) => !args.includes(','));

  // Só a definição da própria função
  expect(semPessoa.length).toBeLessThanOrEqual(1);
});
