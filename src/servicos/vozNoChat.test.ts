/**
 * Gravação de voz no chat — CONECTA
 *
 * O Rádio saiu do sistema, e com ele a única forma de mandar áudio: lá o
 * recado de voz era um EFEITO COLATERAL. A pessoa abria a transmissão ao
 * vivo, falava, e se ninguém estivesse ouvindo o sistema salvava o que ela
 * disse como recado.
 *
 * Funcionava — e obrigava quem só queria mandar um áudio a passar por uma
 * chamada ao vivo, e a entender a diferença entre as duas coisas.
 */
import { test, expect } from 'bun:test';

const lerTela = async (): Promise<string> =>
  Bun.file(new URL('../componentes/TelaConversa.tsx', import.meta.url)).text();

test('o RADIO saiu do sistema por inteiro', async () => {
  const arquivos = [...new Bun.Glob('src/**/*.{ts,tsx}').scanSync('.')];

  // Os dois arquivos do rádio não existem mais
  const nomes = arquivos.map((c) =>
    c.split('/').flatMap((p) => p.split(String.fromCharCode(92))).pop()
  );
  expect(nomes).not.toContain('audioRadio.ts');
  expect(nomes).not.toContain('TelaRadioAoVivo.tsx');

  // E o estado que só existia para ele
  const tela = await lerTela();
  expect(tela).not.toContain('EstadoTransmissaoRadio');
  expect(tela).not.toContain('servicoAudioRadio');
});

test('o microfone NAO fica mais aberto o tempo todo', async () => {
  const tela = await lerTela();

  /**
   * O rádio preparava o microfone ao abrir a conversa, para a chamada sair
   * em menos de um segundo. Sem rádio isso vira o sistema segurando o
   * aparelho ocupado por nada — e no celular aparece como "gravando" o dia
   * inteiro, que é o tipo de coisa que faz a pessoa desinstalar.
   */
  expect(tela).not.toContain('prepararMicrofone');

  const gravador = await Bun.file(
    new URL('./gravadorVoz.ts', import.meta.url)
  ).text();

  /**
   * Abre ao tocar no botão, e fecha ao terminar — mas por `midia`, nunca
   * direto no navegador.
   *
   * Antes esta linha exigia `navigator.mediaDevices.getUserMedia` aqui
   * dentro. Só que fluxo aberto direto é fluxo que só esta classe conhece:
   * se ela não fechar, ninguém mais consegue. `midia` guarda a referência
   * e solta junto com as outras quando o aplicativo vai para segundo
   * plano, que é quando a queixa da câmera acesa aparecia.
   */
  expect(gravador).toContain('abrirFluxo(');
  expect(gravador).toContain('soltarFluxo(');
  expect(gravador).not.toContain('navigator.mediaDevices.getUserMedia');
});

test('o formato do audio e NEGOCIADO com o aparelho', async () => {
  const gravador = await Bun.file(
    new URL('./gravadorVoz.ts', import.meta.url)
  ).text();

  /**
   * iPhone não grava webm; Android não grava mp4 em toda versão. Fixar um
   * formato faz a gravação falhar em silêncio na metade da rede.
   */
  expect(gravador).toContain('MediaRecorder.isTypeSupported(formato)');
  expect(gravador).toContain("'audio/webm;codecs=opus'");
  expect(gravador).toContain("'audio/mp4'");
});

test('desistir da gravacao NAO devolve audio', async () => {
  const gravador = await Bun.file(
    new URL('./gravadorVoz.ts', import.meta.url)
  ).text();

  /**
   * Um cancelamento que devolve o blob vira mensagem enviada por engano na
   * primeira distração de quem chama. Por isso `cancelar` e `parar` são
   * funções diferentes, e a primeira não devolve nada.
   */
  /**
   * A verificação olha DENTRO de `cancelar`: `this.pedacos = []` também
   * aparece em `iniciar`, e procurar no arquivo inteiro deixava o teste
   * passar mesmo com a limpeza removida daqui.
   */
  const inicio = gravador.indexOf('cancelar(): void');
  expect(inicio).toBeGreaterThan(-1);
  const corpo = gravador.slice(inicio, gravador.indexOf('soltarMicrofone(): void', inicio));

  expect(corpo).toContain('this.pedacos = [];');
  // E não pode devolver nada: o retorno é void, não o áudio
  expect(corpo).not.toContain('return {');

  const tela = await lerTela();
  expect(tela).toContain('gravadorVoz.cancelar()');
});

test('o audio espera o fim da gravacao antes de ser lido', async () => {
  const gravador = await Bun.file(
    new URL('./gravadorVoz.ts', import.meta.url)
  ).text();

  /**
   * Parar o gravador não entrega os últimos pedaços na hora. Ler os dados
   * antes do `onstop` corta o fim da frase — e o defeito é sutil: o áudio
   * chega, só que sem a última palavra.
   */
  expect(gravador).toContain('gravador.onstop = () => {');
  expect(gravador).toContain('await new Promise<Blob>');
});

test('gravando, a barra inteira vira a gravacao', async () => {
  const tela = await lerTela();

  /**
   * Câmera, clipe e caixa de texto não fazem sentido com o microfone
   * aberto — e deixá-los ali convida a pessoa a tocar num deles no meio da
   * frase.
   */
  expect(tela).toContain('{gravandoVoz ? (');
  expect(tela).toContain('id="botao-enviar-audio"');
  expect(tela).toContain('desistirDaGravacao');

  // E o relógio, para a pessoa saber que o microfone pegou
  expect(tela).toContain('formatarSegundos(segundosGravados)');
});

test('o microfone so aparece com a caixa vazia', async () => {
  const tela = await lerTela();

  /**
   * Com texto digitado, o lugar é do botão de enviar: dois botões
   * disputando o mesmo canto é como se manda um áudio no meio de uma frase
   * escrita — e perde as duas coisas.
   */
  expect(tela).toContain('{!textoMensagem.trim() && (');
  expect(tela).toContain('id="botao-gravar-audio"');
});
