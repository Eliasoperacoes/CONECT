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
  registerPlugin: () => ({}),
  SystemBars: {},
  SystemBarsStyle: { Dark: 'DARK', Light: 'LIGHT', Default: 'DEFAULT' },
}));

/* `aplicativo.ts` liga o voltar e os atalhos por este plugin */
mock.module('@capacitor/app', () => ({
  App: {
    addListener: async () => ({ remove: async () => {} }),
    getLaunchUrl: async () => undefined,
    minimizeApp: async () => {},
  },
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
    createChannel: async (canal: any) => {
      chamadas.push(`createChannel:${canal.id}:${canal.importance}`);
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

/** O que chegou ao banco. */
let registrados: any[] = [];
let escritasDiretas: string[] = [];
let apagados: string[] = [];

mock.module('./supabase', () => ({
  supabase: {
    rpc: async (funcao: string, args: any) => {
      registrados.push({ funcao, ...args });
      return { error: null };
    },
    from: (tabela: string) => ({
      insert: async () => {
        escritasDiretas.push(`insert:${tabela}`);
        return { error: null };
      },
      update: () => ({
        eq: async () => {
          escritasDiretas.push(`update:${tabela}`);
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

const { ligarAvisoNativo, desligarAvisoNativo, destinoDoPush } = await import('./pushNativo');

beforeEach(async () => {
  /* O token lembrado é estado do módulo: sai do teste anterior aqui */
  dentroDoAplicativo = true;
  await desligarAvisoNativo();

  dentroDoAplicativo = false;
  chamadas = [];
  ouvintes = {};
  registrados = [];
  escritasDiretas = [];
  apagados = [];
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
  const res = await ligarAvisoNativo(() => {});

  expect(res.ligado).toBe(false);
  expect(chamadas).toEqual([]);
  expect(registrados).toEqual([]);
});

test('desligar no navegador também não faz nada', async () => {
  await desligarAvisoNativo();

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

  await ligarAvisoNativo(() => {});

  expect(chamadas).toContain('checkPermissions');
  expect(chamadas).toContain('requestPermissions');
});

test('permissão negada NÃO registra, e explica onde ligar', async () => {
  dentroDoAplicativo = true;
  permissaoDoAparelho = 'denied';

  const res = await ligarAvisoNativo(() => {});

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

  await ligarAvisoNativo(() => {});

  expect(chamadas.indexOf('addListener:registration')).toBeLessThan(
    chamadas.indexOf('register')
  );
  expect(chamadas).toContain('addListener:pushNotificationActionPerformed');
});

test('O ENDEREÇO DO APARELHO É GUARDADO quando o Firebase o entrega', async () => {
  dentroDoAplicativo = true;
  await ligarAvisoNativo(() => {});

  ouvintes['registration']({ value: 'token-do-firebase' });
  await Bun.sleep(1);

  expect(registrados).toEqual([
    { funcao: 'registrar_aparelho', p_token: 'token-do-firebase', p_plataforma: 'android' },
  ]);
});

test('APARELHO QUE TROCA DE DONO passa pela função do banco, nunca por update', async () => {
  /**
   * O celular do balcão é o mesmo em todos os turnos. O caminho antigo
   * era insert e, no 23505, update. Só que a política de UPDATE exige
   * que a linha JÁ SEJA da pessoa — na troca, ainda é da anterior. O
   * update afetava zero linhas, devolvia sucesso, e o chat da manhã
   * seguia chegando no bolso da tarde.
   *
   * `registrar_aparelho` grava no nome de quem chama, pela sessão. Nada
   * de colaborador no parâmetro: senão daria para registrar o aparelho
   * no nome de outro.
   */
  dentroDoAplicativo = true;

  await ligarAvisoNativo(() => {});
  ouvintes['registration']({ value: 'token-do-balcao' });
  await Bun.sleep(1);

  expect(escritasDiretas).toEqual([]);
  expect(registrados).toHaveLength(1);
  expect(Object.keys(registrados[0]).sort()).toEqual(['funcao', 'p_plataforma', 'p_token']);
});

test('a função do banco não recebe colaborador, e passa por cima da RLS', async () => {
  const sql = await Bun.file('supabase/aparelho-troca-de-dono.sql').text();
  const cabecalho = sql.slice(
    sql.indexOf('create or replace function public.registrar_aparelho('),
    sql.indexOf('returns void')
  );

  expect(cabecalho.length).toBeGreaterThan(0);
  expect(cabecalho).not.toContain('colaborador');
  expect(sql).toContain('security definer');
  expect(sql).toContain('public.meu_colaborador_id()');
  expect(sql).toContain('from public, anon');
});

test('O TOQUE NO AVISO LEVA AO LUGAR, e não à tela inicial', async () => {
  /**
   * Mesmo pedido do sino: "as notificações devem levar direto para as
   * seções nas quais estão sendo notificadas".
   */
  dentroDoAplicativo = true;
  const destinos: any[] = [];

  await ligarAvisoNativo((d) => destinos.push(d));

  ouvintes['pushNotificationActionPerformed']({
    notification: { data: { tipo: 'conversa', conversaId: 'conv-9' } },
  });

  expect(destinos).toEqual([{ tipo: 'conversa', conversaId: 'conv-9' }]);
});

test('aviso com dado incompleto abre a tela inicial, e não uma janela vazia', async () => {
  dentroDoAplicativo = true;
  const destinos: any[] = [];
  await ligarAvisoNativo((d) => destinos.push(d));

  ouvintes['pushNotificationActionPerformed']({ notification: { data: { tipo: 'conversa' } } });
  ouvintes['pushNotificationActionPerformed']({ notification: {} });

  expect(destinos).toEqual([]);
  expect(destinoDoPush({ tipo: 'publicacao', publicacaoId: 'pub-1' })).toEqual({
    tipo: 'publicacao',
    publicacaoId: 'pub-1',
  });
  expect(destinoDoPush({ tipo: 'secao' })).toBeNull();
});

test('O AVISO DO PONTO leva à seção que veio no conversaId, e só às que existem', () => {
  /* O aparelho só repassa `tipo` e `conversaId` no toque: a seção viaja ali */
  expect(destinoDoPush({ tipo: 'secao', conversaId: 'aprovar_jornadas' })).toEqual({
    tipo: 'secao',
    secao: 'aprovar_jornadas',
  });
  expect(destinoDoPush({ tipo: 'secao', conversaId: 'meu_ponto' })).toEqual({
    tipo: 'secao',
    secao: 'meu_ponto',
  });
  expect(destinoDoPush({ tipo: 'secao', conversaId: 'painel-admin' })).toBeNull();
});

test('o aviso da publicação dirigida abre a publicação pelo conversaId', () => {
  /* O aparelho perde o `publicacaoId` no toque: só `tipo` e `conversaId` passam */
  expect(destinoDoPush({ tipo: 'publicacao', conversaId: 'pub-7' })).toEqual({
    tipo: 'publicacao',
    publicacaoId: 'pub-7',
  });
});

test('COM O APLICATIVO ABERTO o aviso não vira tarja na tela', async () => {
  /**
   * Mesma regra do aviso do navegador: uma tarja por cima de um sistema
   * que a pessoa está usando, avisando de algo a um toque dali, é só um
   * susto. O sino conta; quem precisa do aviso é quem não está olhando.
   */
  dentroDoAplicativo = true;
  await ligarAvisoNativo(() => {});

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
  await ligarAvisoNativo(() => {});
  ouvintes['registration']({ value: 'token-do-balcao' });
  await Bun.sleep(1);

  /* Quem sai não sabe o token — o aparelho tem de lembrar sozinho */
  await desligarAvisoNativo();

  expect(apagados).toEqual(['token-do-balcao']);
  expect(chamadas).toContain('removeAllListeners');
});

test('SAIR tira o aparelho ANTES de encerrar a sessão', async () => {
  /**
   * Só a própria pessoa apaga o próprio aparelho. Depois do `sair()`, o
   * delete afeta zero linhas e devolve sucesso — o celular seguiria
   * recebendo o chat de quem já foi embora, e nada acusaria.
   */
  const fonte = await Bun.file('src/App.tsx').text();
  const inicio = fonte.indexOf('const lidarDeslogar');
  const corpo = fonte.slice(inicio, fonte.indexOf('setAutenticado(false)', inicio));

  expect(corpo.length).toBeGreaterThan(0);
  const desligar = corpo.indexOf('await desligarAvisoNativo()');
  const sair = corpo.indexOf('nuvem.sair()');
  expect(desligar).toBeGreaterThan(-1);
  expect(sair).toBeGreaterThan(desligar);
});

test('o aviso nativo é ligado depois do login', async () => {
  /* Estava escrito no App sem o import: o lint quebrava e nada ligava */
  const fonte = await Bun.file('src/App.tsx').text();
  expect(fonte).toMatch(/import \{[^}]*ligarAvisoNativo[^}]*\} from '\.\/servicos\/pushNativo'/);
  expect(fonte).toContain('ligarAvisoNativo(');
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
