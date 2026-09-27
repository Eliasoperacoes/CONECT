/**
 * QUANDO O BANCO RECUSA A APURAÇÃO — CONECTA
 *
 * ===================================================================
 * O QUE MOTIVOU
 * ===================================================================
 *
 * Os −47h50 da Lyvia não saíam de lá por caminho nenhum, e o motivo era
 * este: "Reapurar período" é a ferramenta de desfazer um saldo errado, e
 * ela não sabia dizer que tinha falhado.
 *
 * A cadeia inteira, cada elo calado:
 *
 *  1. Zerar uma apuração grava `minutos = 0`.
 *  2. O banco tinha `check (minutos > 0)` e recusava.
 *  3. `gravarAjusteCorrigido` escrevia no console e voltava.
 *  4. `apurarDia` devolvia `{ criou: false }`, indistinguível de "não
 *     havia nada a fazer".
 *  5. `reapurarPeriodo` contava zero dias alterados.
 *  6. A tela dizia "Nada mudou: as contas já estavam com a regra de
 *     hoje."
 *
 * Seis camadas, e a última afirmava o contrário do que havia
 * acontecido. Quem reapurava um saldo errado ia embora convencido de
 * que o saldo estava certo.
 *
 * É o terceiro defeito deste sistema por resposta de banco engolida — o
 * login e a publicação da Central foram os outros dois. O padrão é
 * sempre o mesmo: a camada de baixo sabe o motivo, e cada camada acima
 * troca o motivo por um silêncio mais confortável.
 *
 * ===================================================================
 * ESTE ARQUIVO RODA COM A NUVEM LIGADA
 * ===================================================================
 *
 * É a única forma de exercitar a recusa: sem nuvem não há banco para
 * recusar nada. Por isso ele é um arquivo separado — `mock.module` do
 * Bun vale para o processo inteiro, e `usandoNuvem: true` aqui
 * contaminaria os testes que dependem do modo local.
 */
import { test, expect, mock, beforeEach, setSystemTime } from 'bun:test';

class ArmazenamentoFalso {
  private dados = new Map<string, string>();
  getItem(k: string) { return this.dados.has(k) ? this.dados.get(k)! : null; }
  setItem(k: string, v: string) { this.dados.set(k, String(v)); }
  removeItem(k: string) { this.dados.delete(k); }
  clear() { this.dados.clear(); }
  get length() { return this.dados.size; }
  key(i: number) { return [...this.dados.keys()][i] ?? null; }
}
const armazenamento = new ArmazenamentoFalso();
(globalThis as any).localStorage = armazenamento;

const SEXTA = '2026-09-25';
const DEPOIS = '2026-09-28';

const BASE = {
  cargo: 'Vendedora', setor: 'Vendas', loja: 'Pirassununga', foto: '',
  presenca: 'disponivel', vistoPorUltimo: 'agora', ativo: true,
  nivel: 1, responsavelId: 'chefe', turno: 'A',
};
const ANA = { ...BASE, id: 'ana', nome: 'Ana', login: 'ana' };
const RH = {
  ...BASE, id: 'rh', nome: 'Rita', login: 'rita', nivel: 5,
  cargo: 'Administrador', setor: 'RH',
};

/** O que o banco vai responder. Cada teste escolhe. */
let respostaDoBanco: { sucesso: boolean; erro?: string } = { sucesso: true };
let salvosNoBanco = 0;

mock.module('./supabase', () => ({ usandoNuvem: () => true, supabase: null }));
mock.module('./nuvem', () => ({
  nuvem: {
    /* O serviço assina as mudanças de outro aparelho ao nascer */
    assinarAtualizacoes: () => () => {},
    sincronizarPonto: async () => {},
    sincronizarAjustes: async () => {},
    salvarAjuste: async () => {
      salvosNoBanco += 1;
      return respostaDoBanco;
    },
  },
}));
mock.module('./bancoDados', () => ({
  bancoDados: {
    obterColaboradorAtual: () => RH,
    obterColaboradorPorId: (id: string) => [ANA, RH].find((c) => c.id === id),
    obterColaboradores: () => [ANA, RH],
    estaAutenticado: () => true,
    registrarAuditoria: () => {},
    assinarAlteracoes: () => () => {},
    obterConfiguracoes: () => ({}),
  },
}));

const { servicoPonto } = await import('./ponto');

const CHAVE = 'conecta_v4_registros_ponto';

const bater = (data: string, horas: Record<string, string>) => {
  const atuais = JSON.parse(localStorage.getItem(CHAVE) || '[]');
  for (const [tipo, hora] of Object.entries(horas)) {
    atuais.push({
      id: `r-${data}-${tipo}`, colaboradorId: 'ana', data, tipo,
      horario: new Date(`${data}T${hora}:00`).toISOString(),
      loja: 'Pirassununga', origem: 'qr',
    });
  }
  localStorage.setItem(CHAVE, JSON.stringify(atuais));
};

/**
 * Um dia 30 minutos além da carga — hora extra de verdade.
 * 07:30 às 17:40 são 610 minutos; menos 1h30 de almoço, 8h40.
 */
const diaComExtra = () =>
  bater(SEXTA, {
    entrada: '07:30', saida_almoco: '12:30', retorno_almoco: '14:00', saida: '17:40',
  });

/** Um dia que fecha EXATAMENTE na carga de 8h10: 580 − 90 = 490. */
const diaExato = () =>
  bater(SEXTA, {
    entrada: '07:30', saida_almoco: '12:30', retorno_almoco: '14:00', saida: '17:10',
  });

const CHAVE_AJUSTES = 'conecta_v4_ajustes_jornada';

/** Põe um débito já gravado, como os que ficaram no banco da Lyvia. */
const debitoJaGravado = (estado: 'pendente' | 'aprovado') => {
  localStorage.setItem(
    CHAVE_AJUSTES,
    JSON.stringify([
      {
        id: 'ajuste-velho',
        colaboradorId: 'ana',
        data: SEXTA,
        tipo: 'debito',
        minutos: 15,
        minutosTrabalhados: 475,
        minutosPrevistos: 490,
        estado,
        origem: 'pendencia',
        criadoEm: `${SEXTA}T18:00:00.000Z`,
      },
    ])
  );
};

beforeEach(() => {
  armazenamento.clear();
  respostaDoBanco = { sucesso: true };
  salvosNoBanco = 0;
  setSystemTime(new Date(`${DEPOIS}T09:00:00`));
});

// ===============================================================

test('REAPURAR DIZ QUE FALHOU quando o banco recusa', async () => {
  /**
   * O caso que custou os −47h50. Antes disto a função devolvia
   * `{ sucesso: true, dias: 0 }`, e a tela traduzia isso em "Nada
   * mudou: as contas já estavam com a regra de hoje."
   */
  diaComExtra();
  respostaDoBanco = {
    sucesso: false,
    erro: 'new row violates check constraint "ajustes_jornada_minutos_check"',
  };

  const res = await servicoPonto.reapurarPeriodo('ana', SEXTA, SEXTA);

  expect(res.sucesso).toBe(false);
  expect(res.erro).toBeTruthy();
  // O motivo do BANCO chega inteiro: é ele que diz qual é o conserto
  expect(res.erro).toContain('ajustes_jornada_minutos_check');
  // E a data do dia recusado, para não ter de procurar
  expect(res.erro).toContain('25/09/2026');
});

test('a recusa NÃO é confundida com "não havia nada a mudar"', async () => {
  /**
   * As duas situações terminavam na mesma frase. São opostas: uma quer
   * dizer que o saldo está certo, a outra que ele está errado e não deu
   * para consertar.
   */
  diaComExtra();

  respostaDoBanco = { sucesso: true };
  const semNada = await servicoPonto.reapurarPeriodo('ana', SEXTA, SEXTA);

  armazenamento.clear();
  diaComExtra();
  respostaDoBanco = { sucesso: false, erro: 'recusado' };
  const recusado = await servicoPonto.reapurarPeriodo('ana', SEXTA, SEXTA);

  expect(semNada.sucesso).toBe(true);
  expect(recusado.sucesso).toBe(false);
  expect(semNada.erro).toBeUndefined();
});

test('o dia recusado NÃO entra no aparelho', async () => {
  /**
   * O banco antes do aparelho. Gravar aqui e falhar lá deixaria a tela
   * mostrando um dia resolvido que o banco ainda tem como pendente — e
   * a próxima sincronização traria o número velho de volta, sem
   * explicação.
   */
  diaComExtra();
  respostaDoBanco = { sucesso: false, erro: 'recusado' };

  await servicoPonto.reapurarPeriodo('ana', SEXTA, SEXTA);

  expect(salvosNoBanco).toBeGreaterThan(0);
  expect(servicoPonto.obterAjusteDoDia('ana', SEXTA)).toBeNull();
});

test('apurarDia devolve o MOTIVO, e não só um `criou: false`', async () => {
  /**
   * O elo do meio. `{ criou: false }` era a mesma resposta para "o dia
   * está certo", "o dia não fechou" e "o banco recusou" — três coisas
   * que pedem três reações diferentes de quem chamou.
   */
  diaComExtra();
  respostaDoBanco = { sucesso: false, erro: 'permissão negada' };

  const recusado = await servicoPonto.apurarDia('ana', SEXTA, undefined, RH as any);
  expect(recusado.criou).toBe(false);
  expect(recusado.erro).toBe('permissão negada');

  // E o dia que simplesmente não fechou não inventa erro nenhum
  armazenamento.clear();
  bater(SEXTA, { entrada: '07:30' });
  const incompleto = await servicoPonto.apurarDia('ana', SEXTA, undefined, RH as any);
  expect(incompleto.criou).toBe(false);
  expect(incompleto.erro).toBeUndefined();
});

test('com o banco aceitando, reapurar conta os dias que mudaram', async () => {
  /**
   * A guarda dos testes acima: se `reapurarPeriodo` passasse a devolver
   * erro sempre, todos eles passariam e a ferramenta estaria morta.
   */
  diaComExtra();

  const res = await servicoPonto.reapurarPeriodo('ana', SEXTA, SEXTA);

  expect(res.sucesso).toBe(true);
  expect(res.dias).toBe(1);

  const ajuste = servicoPonto.obterAjusteDoDia('ana', SEXTA);
  expect(ajuste?.tipo).toBe('hora_extra');
  expect(ajuste?.minutos).toBe(30);
});

test('O SQL LIBERA O ZERO, que é o que a reescrita grava', async () => {
  /**
   * A trava está no banco, e nenhum teste de código a alcança. Este
   * confere o arquivo que o Elias roda: sem ele, a correção continua
   * sendo recusada por mais claras que fiquem as mensagens.
   *
   * E confere que a trava que IMPORTA segue de pé: o sinal vem do campo
   * `tipo`, nunca do sinal de `minutos` — número negativo ali daria dois
   * jeitos de ler a mesma linha.
   */
  const sql = await Bun.file('supabase/apuracao-pode-zerar.sql').text();

  expect(sql).toContain('check (minutos >= 0)');
  expect(sql).toContain('drop constraint if exists ajustes_jornada_minutos_check');
  // Todo script que mexe em estrutura recarrega o cache do PostgREST
  expect(sql).toContain("notify pgrst, 'reload schema'");
  // E termina com conferência: "Success" aparece igual ao rodar arquivo velho
  expect(sql).toContain('aceita_zero');
  expect(sql).toContain('recusa_negativo');
});

// ===============================================================
// O CAMINHO QUE ZERA — é ele que desfaz um saldo errado
// ===============================================================

test('ZERAR UMA APURAÇÃO RECUSADA é reportado, e não engolido', async () => {
  /**
   * O caminho exato dos −47h50, e o que faltava aos testes acima: eles
   * exercitavam o dia COM diferença, que grava um número positivo e
   * passa pela trava. O que a trava barrava era o outro — o dia que
   * passou a fechar certo e precisa ter a apuração REESCRITA COM ZERO.
   *
   * Descobri isso por mutação: pôr `gravarAjusteCorrigido` de volta a
   * engolir a recusa não quebrava teste nenhum, porque nenhum teste
   * chegava até ele.
   */
  debitoJaGravado('pendente');
  diaExato();
  respostaDoBanco = {
    sucesso: false,
    erro: 'new row violates check constraint "ajustes_jornada_minutos_check"',
  };

  const res = await servicoPonto.reapurarPeriodo('ana', SEXTA, SEXTA);

  expect(res.sucesso).toBe(false);
  expect(res.erro).toContain('ajustes_jornada_minutos_check');

  // E o débito velho continua lá: o banco não aceitou trocá-lo
  expect(servicoPonto.obterAjusteDoDia('ana', SEXTA)?.minutos).toBe(15);
});

test('com o banco aceitando, o débito velho VAI A ZERO', async () => {
  /**
   * A cura. É o que "Reapurar período" faz por quem ficou com débito de
   * uma regra que mudou — e é o que estava recusado, calado, desde
   * sempre.
   *
   * ZERADO E APROVADO, não apagado: apagar exigiria dar permissão de
   * remoção a quem bate o ponto, e aí bastaria apagar a linha para um
   * débito sumir.
   */
  debitoJaGravado('pendente');
  diaExato();

  const res = await servicoPonto.reapurarPeriodo('ana', SEXTA, SEXTA);

  expect(res.sucesso).toBe(true);
  expect(res.dias).toBe(1);

  const ajuste = servicoPonto.obterAjusteDoDia('ana', SEXTA);
  expect(ajuste?.minutos).toBe(0);
  expect(ajuste?.estado).toBe('aprovado');

  // E o saldo do banco de horas dela volta a zero
  expect(servicoPonto.obterSaldoAcumulado('ana')).toBe(0);
  expect(servicoPonto.obterSaldoPendente('ana')).toBe(0);
});

test('débito JÁ APROVADO também é reescrito quando o dia muda', async () => {
  /**
   * Era só `estado === 'pendente'`. Os débitos da Lyvia já estavam
   * aprovados — aprovados em lote, por quem confiava no sistema. Se a
   * reescrita não os alcançasse, reapurar não serviria para nada
   * justamente no caso em que é preciso.
   *
   * Só alcança com `corrigidoPor` preenchido, que é o que
   * `reapurarPeriodo` faz: quem reapura tem alçada, e assina.
   */
  debitoJaGravado('aprovado');
  diaExato();

  const res = await servicoPonto.reapurarPeriodo('ana', SEXTA, SEXTA);

  expect(res.sucesso).toBe(true);
  expect(servicoPonto.obterAjusteDoDia('ana', SEXTA)?.minutos).toBe(0);
  expect(servicoPonto.obterSaldoAcumulado('ana')).toBe(0);
});
