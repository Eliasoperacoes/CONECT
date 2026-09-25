/**
 * Verificação da ABA PONTO no celular — CONECTA
 *
 * É a tela mais usada do sistema: 89 pessoas abrem quatro vezes por dia,
 * quase sempre no telefone, em pé, com uma mão. O que estiver fora da
 * primeira dobra não existe.
 *
 * O que este arquivo protege:
 *
 *  - o ícone do intervalo é PRATO, e não xícara. A xícara dizia "pausa
 *    do cafezinho" para um intervalo de uma a duas horas;
 *  - o histórico é por MÊS, e não por um corte de quinze dias que
 *    partia o mês ao meio;
 *  - ele começa RECOLHIDO, porque 31 linhas empurram para fora da tela
 *    o botão de bater ponto — que é a razão de a pessoa abrir a aba.
 */
import { test, expect } from 'bun:test';

const lerAba = async (): Promise<string> =>
  Bun.file(new URL('../componentes/AbaPonto.tsx', import.meta.url)).text();

/** O código sem os comentários, para a verificação não achar a explicação. */
const semComentarios = (fonte: string): string =>
  fonte.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

test('O INTERVALO É PRATO, e não xícara', async () => {
  /**
   * As duas marcações do almoço vinham com `Coffee`. O intervalo do
   * balcão é a refeição, e no celular — onde o ícone é maior do que o
   * texto — a xícara dizia outra coisa.
   *
   * Os dois são o MESMO prato, distinguidos pelo estado: talheres
   * cruzados na saída (a convenção de "parou"), postos na volta. Dois
   * ícones sem relação obrigariam a ler o rótulo para saber qual é qual.
   */
  const aba = semComentarios(await lerAba());

  expect(aba).not.toContain('Coffee');

  /**
   * Lido do mapa, e não por `toContain`.
   *
   * `'retorno_almoco: UtensilsCrossed'` CONTÉM
   * `'retorno_almoco: Utensils'` — a versão por substring passava com
   * os dois ícones iguais, que é justamente o defeito a evitar: sem
   * distinguir saída de volta, a pessoa não sabe qual botão já apertou.
   */
  const mapa = aba.slice(
    aba.indexOf('const ICONE_MARCACAO'),
    aba.indexOf('export const AbaPonto')
  );

  const lerIcone = (marcacao: string): string =>
    (mapa.match(new RegExp(`${marcacao}:\\s*(\\w+)`)) || [])[1] || '';

  expect(lerIcone('saida_almoco')).toBe('UtensilsCrossed');
  expect(lerIcone('retorno_almoco')).toBe('Utensils');

  // As quatro marcações têm quatro ícones diferentes
  const icones = ['entrada', 'saida_almoco', 'retorno_almoco', 'saida'].map(lerIcone);
  expect(icones.filter(Boolean)).toHaveLength(4);
  expect(new Set(icones).size).toBe(4);
});

test('O HISTÓRICO É O MÊS INTEIRO, e não os últimos quinze dias', async () => {
  /**
   * Quinze é um número sem significado para quem bate ponto: o que ele
   * confere é o mês, que é o período do espelho e o do pagamento.
   * Quinze dias cortam o mês ao meio — quem procurava o dia 3 no fim do
   * mês não o achava, e não havia como saber que faltava.
   */
  const aba = semComentarios(await lerAba());

  expect(aba).toContain('data.startsWith(mesEscolhido)');
  expect(aba).not.toContain('.slice(0, 15)');
});

test('DÁ PARA TROCAR DE MÊS, e só aparecem os que têm registro', async () => {
  /**
   * Oferecer doze meses fixos encheria o seletor de meses vazios — e
   * quem escolhesse um deles concluiria que perdeu o histórico.
   *
   * O mês CORRENTE entra mesmo sem batida nenhuma: é onde a pessoa cai
   * ao abrir, e um seletor sem a opção selecionada aparece em branco.
   */
  const aba = semComentarios(await lerAba());

  expect(aba).toContain('const mesesComRegistro = useMemo(');
  expect(aba).toContain('.map((data) => data.slice(0, 7))');
  expect(aba).toContain('meses.add(hoje.slice(0, 7))');
  expect(aba).toContain('setMesEscolhido(e.target.value)');

  // Começa no mês de hoje, e não no mais antigo
  expect(aba).toContain('useState(() => hoje.slice(0, 7))');
});

test('O MÊS DO SELETOR É MONTADO NO DIA 15', async () => {
  /**
   * `new Date(ano, mes, 1)` vira o último dia do mês anterior em fuso
   * negativo, e o seletor mostraria "Agosto" para setembro. O mesmo
   * defeito já apareceu no espelho de ponto.
   */
  const aba = semComentarios(await lerAba());
  expect(aba).toContain('new Date(Number(ano), Number(m) - 1, 15)');
});

test('O HISTÓRICO COMEÇA RECOLHIDO', async () => {
  /**
   * São até 31 linhas numa tela de celular — mais alto do que tudo o
   * que vem acima somado, e empurrando para fora o botão de bater
   * ponto, que é a razão de a pessoa abrir esta aba.
   */
  const aba = semComentarios(await lerAba());

  expect(aba).toContain('const [historicoAberto, setHistoricoAberto] = useState(false)');
  expect(aba).toContain('{!historicoAberto ? null :');
});

test('RECOLHIDO NÃO ESCONDE O QUE IMPORTA', async () => {
  /**
   * O cabeçalho vira o resumo do mês: quantos dias, o saldo e quantos
   * ficaram incompletos. Os incompletos são o que a pessoa precisa
   * resolver com o RH — escondê-los atrás de um clique faria o defeito
   * só aparecer no dia do pagamento.
   */
  const aba = semComentarios(await lerAba());

  expect(aba).toContain('const resumoDoMes = useMemo(');
  expect(aba).toContain('saldo: historico.reduce((t, j) => t + j.saldoMinutos, 0)');
  expect(aba).toContain('incompletos: historico.filter((j) => !j.completa).length');

  // E os três aparecem no cabeçalho que recolhe
  expect(aba).toContain('{resumoDoMes.dias}');
  expect(aba).toContain('{resumoDoMes.incompletos > 0 && (');
  expect(aba).toContain('formatarSaldo(resumoDoMes.saldo)');
});

test('o seletor de mês é NATIVO', async () => {
  /**
   * No celular ele abre a roda do sistema, que se gira com o polegar.
   * Uma lista desenhada à mão seria mais bonita e pior de usar com uma
   * mão só — que é como esta tela é usada.
   */
  const aba = await lerAba();

  expect(aba).toContain('<select');
  expect(aba).toContain('aria-label="Mês"');
});
