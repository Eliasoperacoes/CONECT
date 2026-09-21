/**
 * Calendário de feriados — CONECTA
 *
 * O defeito que isto fecha é do tipo mais difícil de enxergar: a causa é
 * a AUSÊNCIA de um registro. Sem feriado cadastrado, todo 7 de setembro
 * virava um dia inteiro de débito para a rede inteira, e o espelho
 * mostrava um dia sem batida — que se lê como falta.
 */
import { test, expect } from 'bun:test';

class ArmazenamentoFalso {
  private dados = new Map<string, string>();
  getItem(k: string) { return this.dados.has(k) ? this.dados.get(k)! : null; }
  setItem(k: string, v: string) { this.dados.set(k, String(v)); }
  removeItem(k: string) { this.dados.delete(k); }
  clear() { this.dados.clear(); }
}
(globalThis as any).localStorage = new ArmazenamentoFalso();

const { feriadosNacionaisDe, domingoDePascoa } = await import('./feriadosNacionais');
const { lerFeriados, gravarFeriados, feriadoEm, CHAVE_FERIADOS } = await import(
  './feriadosCache'
);

// ============================================================
// OS MÓVEIS, QUE SÃO ONDE O ERRO ENTRA
// ============================================================

test('A PÁSCOA BATE COM O CALENDÁRIO DE VERDADE', () => {
  /**
   * Carnaval, Sexta-feira Santa e Corpus Christi saem daqui. Errar a
   * Páscoa por um dia desloca os três, e a rede inteira acumula um
   * débito que ninguém entende.
   *
   * As datas abaixo são as reais, conferidas fora do sistema.
   */
  const emTexto = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
      d.getDate()
    ).padStart(2, '0')}`;

  expect(emTexto(domingoDePascoa(2024))).toBe('2024-03-31');
  expect(emTexto(domingoDePascoa(2025))).toBe('2025-04-20');
  expect(emTexto(domingoDePascoa(2026))).toBe('2026-04-05');
  expect(emTexto(domingoDePascoa(2027))).toBe('2027-03-28');
});

test('os feriados móveis saem certos a partir da Páscoa', () => {
  const de2026 = feriadosNacionaisDe(2026);
  const acharData = (nome: string) => de2026.find((f) => f.nome === nome)?.data;

  // Páscoa 2026 é 05/04
  expect(acharData('Carnaval')).toBe('2026-02-17');
  expect(acharData('Sexta-feira Santa')).toBe('2026-04-03');
  expect(acharData('Corpus Christi')).toBe('2026-06-04');
});

test('os fixos estão todos lá, e em ordem', () => {
  const lista = feriadosNacionaisDe(2026);

  const datas = lista.map((f) => f.data);
  expect(datas).toContain('2026-01-01');
  expect(datas).toContain('2026-04-21');
  expect(datas).toContain('2026-05-01');
  expect(datas).toContain('2026-09-07');
  expect(datas).toContain('2026-10-12');
  expect(datas).toContain('2026-11-02');
  expect(datas).toContain('2026-11-15');
  expect(datas).toContain('2026-11-20');
  expect(datas).toContain('2026-12-25');

  // Em ordem, para a tela não precisar reordenar
  expect([...datas].sort()).toEqual(datas);

  // Todos fecham o dia: meio expediente é decisão da empresa, não do país
  expect(lista.every((f) => f.minutosPrevistos === 0)).toBe(true);
});

// ============================================================
// O FERIADO DA LOJA VENCE O DA REDE
// ============================================================

const comCalendario = <T,>(lista: any[], corpo: () => T): T => {
  localStorage.setItem(CHAVE_FERIADOS, JSON.stringify(lista));
  try {
    return corpo();
  } finally {
    localStorage.removeItem(CHAVE_FERIADOS);
  }
};

test('O FERIADO DA LOJA VENCE O DA REDE NO MESMO DIA', () => {
  /**
   * As cinco unidades ficam em cidades diferentes. Se a rede marcou meio
   * expediente e a loja de Leme fecha por um feriado municipal, quem é
   * de Leme não trabalha.
   *
   * O contrário — a rede vencer — faria o feriado da cidade da pessoa
   * ser ignorado, que é exatamente o caso que a coluna existe para
   * resolver.
   */
  comCalendario(
    [
      { id: 'a', data: '2026-07-10', nome: 'Meio expediente da rede', minutosPrevistos: 240, criadoEm: '' },
      { id: 'b', data: '2026-07-10', nome: 'Aniversário de Leme', loja: 'Leme', minutosPrevistos: 0, criadoEm: '' },
    ],
    () => {
      expect(feriadoEm('2026-07-10', 'Leme' as any)?.nome).toBe('Aniversário de Leme');
      expect(feriadoEm('2026-07-10', 'Pirassununga' as any)?.minutosPrevistos).toBe(240);
    }
  );
});

test('feriado de uma loja não vale para as outras', () => {
  comCalendario(
    [
      { id: 'b', data: '2026-07-10', nome: 'Aniversário de Leme', loja: 'Leme', minutosPrevistos: 0, criadoEm: '' },
    ],
    () => {
      expect(feriadoEm('2026-07-10', 'Leme' as any)).toBeDefined();
      // Sem feriado da rede naquele dia, quem é de outra loja trabalha normal
      expect(feriadoEm('2026-07-10', 'Pirassununga' as any)).toBeUndefined();
    }
  );
});

test('dia sem feriado não inventa feriado', () => {
  comCalendario([], () => {
    expect(feriadoEm('2026-07-10', 'Leme' as any)).toBeUndefined();
  });
});

test('o cache aguenta lixo no armazenamento', () => {
  // Armazenamento corrompido não pode derrubar a apuração inteira
  localStorage.setItem(CHAVE_FERIADOS, 'isto não é json');
  expect(lerFeriados()).toEqual([]);
  localStorage.removeItem(CHAVE_FERIADOS);
});

test('O CACHE SÓ IMPORTA FOLHAS', async () => {
  /**
   * `nuvem` precisa entregar os feriados vindos do banco. Se este arquivo
   * importasse o serviço de regra, o ciclo nuvem → feriados → ponto →
   * nuvem fecharia — e `ponto` roda no carregamento, o que derruba o
   * aplicativo inteiro com "Cannot access 'nuvem' before initialization".
   *
   * É o mesmo ciclo que já apagou a tela deste sistema uma vez.
   *
   * A regra era "só `../tipos`". Ficou estreita demais quando o feriado
   * nacional passou a ser CALCULADO em vez de cadastrado: o cache precisa
   * da tabela do ano, e ela mora em `feriadosNacionais`.
   *
   * O que protege contra o ciclo não é a lista de nomes, é a FOLHA: um
   * módulo que não importa ninguém não pode fechar ciclo com ninguém. Por
   * isso o teste deixou de conferir de quem se importa e passou a
   * conferir o que essas importações arrastam junto.
   */
  const fonte = await Bun.file('src/servicos/feriadosCache.ts').text();
  const imports = [...fonte.matchAll(/from\s+'([^']+)'/g)].map((m) => m[1]);

  expect(imports).toEqual(['../tipos', './feriadosNacionais']);

  // E a folha tem de continuar folha, senão a proteção acima é decorativa
  const folha = await Bun.file('src/servicos/feriadosNacionais.ts').text();
  expect([...folha.matchAll(/from\s+'([^']+)'/g)].map((m) => m[1])).toEqual([]);
});
