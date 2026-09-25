/**
 * ONDE O TEMPO VAI — CONECTA / Malachias Autopeças
 *
 *   bun scripts/medir-paineis.ts
 *
 * "Equipe & Ponto" e "Recursos Humanos" abrem devagar. Antes de mexer em
 * qualquer coisa, este script monta uma rede do tamanho da real — 89
 * pessoas, dois meses de batidas — e cronometra exatamente as funções que
 * essas duas telas chamam ao montar.
 *
 * Também CONTA as leituras do armazenamento. `lerRegistros()` faz
 * `JSON.parse` da lista inteira a cada chamada, e a suspeita é que ela
 * seja chamada uma vez por pessoa por dia.
 */

/** Armazenamento de mentira que conta quantas vezes foi lido. */
class ArmazenamentoQueConta {
  private dados = new Map<string, string>();
  leituras = new Map<string, number>();

  get length() {
    return this.dados.size;
  }
  key(i: number) {
    return [...this.dados.keys()][i] ?? null;
  }
  getItem(k: string) {
    this.leituras.set(k, (this.leituras.get(k) || 0) + 1);
    return this.dados.has(k) ? this.dados.get(k)! : null;
  }
  setItem(k: string, v: string) {
    this.dados.set(k, String(v));
  }
  removeItem(k: string) {
    this.dados.delete(k);
  }
  clear() {
    this.dados.clear();
  }
  zerarContagem() {
    this.leituras.clear();
  }
}

const armazenamento = new ArmazenamentoQueConta();
(globalThis as any).localStorage = armazenamento;

const { servicoPonto, dataDeHoje } = await import('../src/servicos/ponto');
const { bancoDados } = await import('../src/servicos/bancoDados');

// ------------------------------------------------------------
// A REDE, do tamanho da real
// ------------------------------------------------------------
const PESSOAS = 89;
const DIAS = 60;

const LOJAS = ['Pirassununga', 'Porto Ferreira', 'Palmeiras', 'Descalvado', 'Santa Rita'];

const colaboradores = Array.from({ length: PESSOAS }, (_, i) => ({
  id: `c${i}`,
  nome: `Pessoa ${i}`,
  login: `p${i}`,
  cargo: 'Vendedor',
  setor: 'Balcão',
  loja: LOJAS[i % LOJAS.length],
  nivel: i === 0 ? 5 : 1,
  ativo: true,
  presenca: 'disponivel',
  foto: '',
  turnoChave: 'A',
  responsavelId: i === 0 ? undefined : 'c0',
}));

const diaAtras = (n: number): string => {
  const d = new Date(`${dataDeHoje()}T12:00:00`);
  d.setDate(d.getDate() - n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate()
  ).padStart(2, '0')}`;
};

const registros: unknown[] = [];
for (let p = 0; p < PESSOAS; p++) {
  for (let d = 1; d <= DIAS; d++) {
    const data = diaAtras(d);
    for (const [tipo, hora] of [
      ['entrada', '07:30'],
      ['saida_almoco', '12:30'],
      ['retorno_almoco', '14:00'],
      ['saida', '17:10'],
    ] as const) {
      registros.push({
        id: `r-${p}-${d}-${tipo}`,
        colaboradorId: `c${p}`,
        data,
        tipo,
        hora: `${data}T${hora}:00.000Z`,
        horaFormatada: hora,
        metodo: 'qr_loja',
      });
    }
  }
}

armazenamento.setItem('conecta_v4_colaboradores', JSON.stringify(colaboradores));
armazenamento.setItem('conecta_v4_colaborador_atual', 'c0');
armazenamento.setItem('conecta_v4_registros_ponto', JSON.stringify(registros));
armazenamento.setItem('conecta_v4_ajustes_jornada', JSON.stringify([]));

console.log(
  `Rede simulada: ${PESSOAS} pessoas, ${DIAS} dias, ${registros.length} marcações ` +
    `(${(JSON.stringify(registros).length / 1024).toFixed(0)} KB no armazenamento)\n`
);

// ------------------------------------------------------------
// A MEDIÇÃO
// ------------------------------------------------------------
const medir = async (nome: string, fn: () => unknown) => {
  armazenamento.zerarContagem();
  const inicio = performance.now();
  fn();
  const ms = performance.now() - inicio;

  const lidos = [...armazenamento.leituras.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([k, n]) => `${k.replace('conecta_', '')}×${n}`)
    .join('  ');

  const marca = ms > 300 ? ' <<< LENTO' : ms > 100 ? ' <<< pesado' : '';
  console.log(`${ms.toFixed(0).padStart(6)} ms   ${nome.padEnd(42)} ${lidos}${marca}`);
};

const fim = diaAtras(1);
const inicio = diaAtras(30);

console.log('EQUIPE & PONTO');
await medir('obterResumoDoPeriodo (a lista da equipe)', () =>
  servicoPonto.obterResumoDoPeriodo(inicio, fim)
);
await medir('relacaoSemanalDaEquipe (o ciclo)', () =>
  servicoPonto.relacaoSemanalDaEquipe(dataDeHoje())
);
await medir('obterSaldoPendente × 89 (uma por linha)', () => {
  for (const c of colaboradores) servicoPonto.obterSaldoPendente(c.id);
});

console.log('\nRECURSOS HUMANOS');
await medir('relacaoSemanalDaEquipe (os números do topo)', () =>
  servicoPonto.relacaoSemanalDaEquipe(dataDeHoje())
);
await medir('obterColaboradores', () => bancoDados.obterColaboradores());

console.log('\nAS PEÇAS');
await medir('obterJornadasDoPeriodo de UMA pessoa (30 dias)', () =>
  servicoPonto.obterJornadasDoPeriodo('c1', inicio, fim)
);
await medir('obterJornadaDoDia de UM dia', () =>
  servicoPonto.obterJornadaDoDia('c1', fim)
);
