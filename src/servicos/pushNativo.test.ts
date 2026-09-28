/**
 * AVISO COM O APLICATIVO FECHADO — CONECTA
 *
 * ===================================================================
 * O QUE MOTIVOU
 * ===================================================================
 *
 * O Elias: "precisamos de notificações com o app fechado, mensagem,
 * avisos, notificações, mas de maneira nativa no android" e "o app não
 * pode dar notificações de navegador, apenas notificações do próprio
 * aplicativo".
 *
 * O aviso do navegador só existe enquanto o sistema está aberto. Quem
 * fecha o CONECTA para usar o cadastro de peça fica sem saber de nada
 * até abrir de novo — e num balcão isso é o dia inteiro.
 *
 * ===================================================================
 * O QUE ESTE ARQUIVO PROTEGE
 * ===================================================================
 *
 * Duas coisas, e a primeira vale mesmo antes de o APK existir:
 *
 *  1. NADA DISTO ENCOSTA EM QUEM ESTÁ NO NAVEGADOR. Enquanto o
 *     aplicativo não existe, todo mundo está no navegador — e um erro
 *     aqui derrubaria o sistema de 89 pessoas por causa de um recurso
 *     que ainda não foi distribuído.
 *
 *  2. O REGISTRO DO APARELHO não usa `upsert`. É a armadilha que já
 *     derrubou a gravação de conversa uma vez, e ela volta mais forte
 *     aqui: a regra da tabela só deixa a pessoa ler os PRÓPRIOS
 *     aparelhos, então o aparelho que trocou de dono é invisível na
 *     hora do conflito.
 */
import { test, expect, mock, beforeEach } from 'bun:test';

(globalThis as any).localStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
};

/** Quando falso, estamos no navegador — que é o estado de hoje. */
let dentroDoAplicativo = false;

/** O que o plugin do Capacitor recebeu. */
let chamadas: string[] = [];
let permissaoDoAparelho: 'granted' | 'denied' | 'prompt' = 'granted';
let ouvintes: Record<string, (dado: any) => void> = {};

mock.module('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => dentroDoAplicativo },
}));

mock.module('@capacitor/push-notifications', () => ({
  PushNotifications: {
    checkPermissions: async () => {
      chamadas.push('checkPermissions');
      return { receive: permissaoDoAparelho };
    },
    requestPermissions: async () => {
      chamadas.push('requestPermissions');
      return { receive: permissaoDoAparelho };
    },
    register: async () => {
      chamadas.push('register');
    },
    removeAllListeners: async () => {
      chamadas.push('removeAllListeners');
      ouvintes = {};
    },
    addListener: async (evento: string, fn: (d: any) => void) => {
      chamadas.push(`addListener:${evento}`);
      ouvintes[evento] = fn;
    },
  },
}));

/** O que foi parar na tabela `aparelhos`. */
let inseridos: any[] = [];
let atualizados: any[] = [];
let apagados: string[] = [];
/** Ligado, o insert é recusado como já existente. */
let tokenJaExiste = false;

mock.module('./supabase', () => ({
  supabase: {
    from: (tabela: string) => ({
      insert: async (linha: any) => {
        if (tabela !== 'aparelhos') return { error: null };
        if (tokenJaExiste) {
          return { error: { code: '23505', message: 'duplicate key' } };
        }
        inseridos.push(linha);
        return { error: null };
      },
      update: (linha: any) => ({
        eq: async (_coluna: string, valor: string) => {
          atualizados.push({ ...linha, token: valor });
          return { error: null };
        },
      }),
      delete: () => ({
        eq: async (_coluna: string, valor: string) => {
          apagados.push(valor);
          return { error: null };
        },
      }),
    }),
  },
  usandoNuvem: () => true,
  temSessaoViva: () => true,
}));

const { ligarAvisoNativo, desligarAvisoNativo } = await import('./pushNativo');

beforeEach(() => {
  dentroDoAplicativo = false;
  chamadas = [];
  ouvintes = {};
  inseridos = [];
  atualizados = [];
  apagados = [];
  tokenJaExiste = false;
  permissaoDoAparelho = 'granted';
});

// ===============================================================
// 1. NO NAVEGADOR, NADA ACONTECE
// ===============================================================

test('NO NAVEGADOR o push nativo nem é tentado', async () => {
  /**
   * Hoje TODO MUNDO está no navegador — o APK não foi distribuído. Um
   * erro aqui derrubaria o sistema de 89 pessoas por causa de um
   * recurso que ainda não existe para elas.
   */
  const res = await ligarAvisoNativo('colab-ana', () => {});

  expect(res.ligado).toBe(false);
  expect(chamadas).toEqual([]);
  expect(inseridos).toEqual([]);
});

test('desligar no navegador também não faz nada', async () => {
  await desligarAvisoNativo('token-x');

  expect(chamadas).toEqual([]);
  expect(apagados).toEqual([]);
});

// ===============================================================
// 2. NO APLICATIVO
// ===============================================================

test('A PERMISSÃO É PEDIDA, e não suposta', async () => {
  /**
   * Do Android 13 em diante o aviso é negado por padrão. Sem pedir, o
   * token chega, o servidor entrega e o aparelho não mostra nada — a
   * pior falha possível, porque tudo "funciona".
   */
  dentroDoAplicativo = true;
  permissaoDoAparelho = 'prompt';

  await ligarAvisoNativo('colab-ana', () => {});

  expect(chamadas).toContain('checkPermissions');
  expect(chamadas).toContain('requestPermissions');
});

test('permissão negada NÃO registra, e explica onde ligar', async () => {
  dentroDoAplicativo = true;
  permissaoDoAparelho = 'denied';

  const res = await ligarAvisoNativo('colab-ana', () => {});

  expect(res.ligado).toBe(false);
  expect(res.motivo).toContain('Notificações');
  expect(chamadas).not.toContain('register');
});

test('OS OUVINTES SÃO LIGADOS ANTES DO REGISTRO', async () => {
  /**
   * `register()` dispara `registration` — às vezes na mesma volta. Com
   * o ouvinte ainda desligado, o token passa e ninguém o guarda: o
   * aparelho fica sem endereço até a próxima abertura, e o aviso some
   * sem erro nenhum.
   */
  dentroDoAplicativo = true;

  await ligarAvisoNativo('colab-ana', () => {});

  expect(chamadas.indexOf('addListener:registration')).toBeLessThan(
    chamadas.indexOf('register')
  );
  expect(chamadas).toContain('addListener:pushNotificationActionPerformed');
});

test('O ENDEREÇO DO APARELHO É GUARDADO quando o Firebase o entrega', async () => {
  dentroDoAplicativo = true;
  await ligarAvisoNativo('colab-ana', () => {});

  ouvintes['registration']({ value: 'token-do-firebase' });
  await Bun.sleep(1);

  expect(inseridos).toHaveLength(1);
  expect(inseridos[0].token).toBe('token-do-firebase');
  expect(inseridos[0].colaborador_id).toBe('colab-ana');
});

test('APARELHO QUE TROCA DE DONO passa a ser de quem entrou', async () => {
  /**
   * O celular do balcão é o mesmo em todos os turnos. Sem isto, o aviso
   * da pessoa da manhã continuaria chegando no aparelho depois de a da
   * tarde entrar — as mensagens de chat inclusive.
   *
   * E é por isso que o registro NÃO usa `upsert`: ele vira `ON
   * CONFLICT`, que exige ENXERGAR a linha em conflito — e a regra da
   * tabela só deixa a pessoa ler os próprios aparelhos. Na hora do
   * conflito, aquele aparelho ainda é de outra pessoa.
   */
  dentroDoAplicativo = true;
  tokenJaExiste = true;

  await ligarAvisoNativo('colab-bia', () => {});
  ouvintes['registration']({ value: 'token-do-balcao' });
  await Bun.sleep(1);

  expect(inseridos).toHaveLength(0);
  expect(atualizados).toHaveLength(1);
  expect(atualizados[0].colaborador_id).toBe('colab-bia');
  expect(atualizados[0].token).toBe('token-do-balcao');
});

test('O TOQUE NO AVISO LEVA AO LUGAR, e não à tela inicial', async () => {
  /**
   * Mesmo pedido do sino: "as notificações devem levar direto para as
   * seções nas quais estão sendo notificadas".
   */
  dentroDoAplicativo = true;
  const destinos: any[] = [];

  await ligarAvisoNativo('colab-ana', (d) => destinos.push(d));

  ouvintes['pushNotificationActionPerformed']({
    notification: { data: { tipo: 'conversa', conversaId: 'conv-9' } },
  });

  expect(destinos).toEqual([{ tipo: 'conversa', conversaId: 'conv-9' }]);
});

test('COM O APLICATIVO ABERTO o aviso não vira tarja na tela', async () => {
  /**
   * Mesma regra do aviso do navegador: uma tarja por cima de um sistema
   * que a pessoa está usando, avisando de algo a um toque dali, é só um
   * susto. O sino conta; quem precisa do aviso é quem não está olhando.
   */
  dentroDoAplicativo = true;
  await ligarAvisoNativo('colab-ana', () => {});

  const recebido = ouvintes['pushNotificationReceived'];
  expect(recebido).toBeTruthy();

  // Não explode, e não faz nada visível
  expect(() => recebido({ title: 'Nova mensagem', body: 'oi' })).not.toThrow();
});

test('SAIR DO SISTEMA tira o aparelho da lista de entrega', async () => {
  /**
   * Quem empresta o celular ou troca de turno no aparelho do balcão
   * continuaria recebendo as mensagens da pessoa anterior.
   */
  dentroDoAplicativo = true;

  await desligarAvisoNativo('token-do-balcao');

  expect(apagados).toEqual(['token-do-balcao']);
  expect(chamadas).toContain('removeAllListeners');
});

// ===============================================================
// 3. A FRONTEIRA COM O AVISO DO NAVEGADOR
// ===============================================================

test('O AVISO DO NAVEGADOR SAI DE CENA dentro do aplicativo', async () => {
  /**
   * Decisão do Elias. Deixar os dois caminhos rodando faria o aparelho
   * mostrar DOIS avisos da mesma mensagem — um do aplicativo e um da
   * página dentro dele. E o de dentro é o pior: ele só existe com o
   * sistema ABERTO, que é quando a pessoa não precisa ser avisada.
   */
  const fonte = await Bun.file('src/servicos/notificacoes.ts').text();
  const corpo = fonte.slice(fonte.indexOf('export const mostrarAvisoDeMensagem'));

  expect(corpo).toContain('if (rodandoNoAplicativo()) return;');
});

test('a pergunta "estamos no aplicativo?" mora num lugar só', async () => {
  /**
   * A diferença entre aplicativo e navegador não vai ficar só no aviso
   * — câmera, arquivo e o botão voltar do aparelho também divergem.
   *
   * E não se pergunta pelo user agent: um Chrome no celular diz Android
   * e NÃO é o aplicativo, e qualquer pessoa pode mudar a string.
   */
  const fonte = await Bun.file('src/servicos/aplicativo.ts').text();

  expect(fonte).toContain('Capacitor.isNativePlatform()');
  expect(fonte).not.toContain('userAgent');

  /* Quem quer saber pergunta ao serviço, e não ao Capacitor direto */
  for (const arquivo of ['src/servicos/notificacoes.ts', 'src/servicos/pushNativo.ts']) {
    const outro = await Bun.file(arquivo).text();
    expect({ arquivo, usa: outro.includes('isNativePlatform') }).toEqual({
      arquivo,
      usa: false,
    });
  }
});
