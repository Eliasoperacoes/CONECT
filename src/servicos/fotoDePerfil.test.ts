/**
 * A FOTO DE PERFIL SAIU DA COLUNA — CONECTA
 *
 * ===================================================================
 * O QUE MOTIVOU
 * ===================================================================
 *
 * A foto era gravada como TEXTO dentro de `colaboradores.foto`, em
 * base64 — um JPEG de 400px que o navegador converte em letras. Três
 * consequências, e a terceira é a que custava caro:
 *
 *   1. contava no limite do BANCO, não no do Storage
 *   2. não tinha cache de navegador: não era endereço, era conteúdo
 *   3. VIAJAVA INTEIRA a cada sincronização de colaboradores — e essa
 *      roda ao entrar e a cada alteração em QUALQUER ficha, porque o
 *      tempo real avisa todos os aparelhos
 *
 * Estimado com as 89 pessoas e duas entradas por dia: 15,7 GB por mês,
 * três vezes o limite de tráfego do plano gratuito, só para mostrar as
 * caras na lista de conversas.
 *
 * ===================================================================
 * O QUE ESTE ARQUIVO PROTEGE
 * ===================================================================
 *
 * Vinte e tantas telas leem `colaborador.foto` e o entregam direto ao
 * `<img src>` — de `AbaEu` a `Organograma`, passando pelo chat e pelo
 * espelho de ponto. Nenhuma delas mudou, e é essa a propriedade:
 *
 *   o que sai da fronteira com o banco é SEMPRE um endereço que abre
 *
 * Se um caminho vazar para uma dessas telas, o rosto de alguém vira um
 * quadrado quebrado — em vinte lugares de uma vez.
 */
import { test, expect, mock, beforeEach } from 'bun:test';

class ArmazenamentoFalso {
  dados = new Map<string, string>();
  getItem(k: string) { return this.dados.has(k) ? this.dados.get(k)! : null; }
  setItem(k: string, v: string) { this.dados.set(k, String(v)); }
  removeItem(k: string) { this.dados.delete(k); }
  clear() { this.dados.clear(); }
  get length() { return this.dados.size; }
  key(i: number) { return [...this.dados.keys()][i] ?? null; }
}
const armazenamento = new ArmazenamentoFalso();
(globalThis as any).localStorage = armazenamento;

/** As linhas que o banco devolve em `colaboradores`. */
let linhasDoBanco: any[] = [];
/** Os caminhos que alguém mandou assinar. */
let caminhosAssinados: string[] = [];
/** Quando ligado, a assinatura falha — a rede caiu. */
let assinaturaFalha = false;

const consulta = () => {
  const encadeado: any = {
    select: () => encadeado,
    order: () => Promise.resolve({ data: linhasDoBanco, error: null }),
    eq: () => encadeado,
    then: (f: any) => Promise.resolve({ data: linhasDoBanco, error: null }).then(f),
  };
  return encadeado;
};

mock.module('./supabase', () => ({
  supabase: {
    from: () => consulta(),
    storage: {
      from: () => ({
        createSignedUrls: async (caminhos: string[]) => {
          caminhosAssinados.push(...caminhos);
          if (assinaturaFalha) return { data: null, error: { message: 'rede caiu' } };
          return {
            data: caminhos.map((path) => ({
              path,
              signedUrl: `https://assinado.exemplo/${path}?token=abc`,
            })),
            error: null,
          };
        },
      }),
    },
  },
  usandoNuvem: () => true,
  temSessaoViva: () => true,
  loginParaEmailInterno: (l: string) => `${l}@conecta.local`,
  normalizarLogin: (l: string) => l.trim().toLowerCase(),
}));
mock.module('./nuvemComunicacao', () => ({
  nuvemComunicacao: {
    sincronizarConversas: async () => true,
    sincronizarAvisos: async () => true,
    sincronizarConfiguracoes: async () => true,
    sincronizarAuditoria: async () => true,
    assinarAtualizacoes: () => () => {},
  },
}));

const { nuvem } = await import('./nuvem');
const { ehCaminhoDeFotoPerfil, PREFIXO_FOTO_PERFIL } = await import('./anexos');

const CHAVE = 'conecta_v4_colaboradores';

const linha = (id: string, foto: string | null) => ({
  id,
  nome: `Pessoa ${id}`,
  login: id,
  cargo: 'Vendedor',
  setor: 'Vendas',
  loja: 'Pirassununga',
  nivel: 1,
  foto,
  ativo: true,
  criado_em: '2026-01-01T00:00:00.000Z',
});

const doCache = (id: string) =>
  JSON.parse(armazenamento.getItem(CHAVE) || '[]').find((c: any) => c.id === id);

beforeEach(() => {
  armazenamento.clear();
  caminhosAssinados = [];
  assinaturaFalha = false;
});

// ===============================================================

test('O CAMINHO NO BANCO VIRA ENDEREÇO NA TELA', async () => {
  /**
   * A propriedade que sustenta tudo. Vinte telas põem `colaborador.foto`
   * num `<img src>` sem perguntar nada — se o caminho vazar para elas, o
   * rosto de alguém vira quadrado quebrado em vinte lugares de uma vez.
   */
  linhasDoBanco = [linha('ana', 'perfil/ana/1759000000000.jpg')];

  await nuvem.sincronizarColaboradores();

  expect(doCache('ana').foto).toBe(
    'https://assinado.exemplo/perfil/ana/1759000000000.jpg?token=abc'
  );

  /**
   * O que importa é que ABRA. O endereço assinado contém o caminho por
   * natureza — minha primeira asserção aqui exigia que ele NÃO
   * contivesse, e falhou sobre um resultado certo.
   *
   * A propriedade é esta: o que chega à tela nunca é o caminho cru.
   */
  expect(doCache('ana').foto.startsWith('https://')).toBe(true);
  expect(ehCaminhoDeFotoPerfil(doCache('ana').foto)).toBe(false);
});

test('as 89 assinaturas saem numa chamada SÓ', async () => {
  /**
   * `createSignedUrls` assina em lote. Uma por pessoa seriam 89 idas à
   * rede a cada sincronização — e ela roda ao entrar e a cada alteração
   * em qualquer ficha.
   */
  linhasDoBanco = Array.from({ length: 89 }, (_, i) =>
    linha(`p${i}`, `perfil/p${i}/1.jpg`)
  );

  await nuvem.sincronizarColaboradores();

  expect(caminhosAssinados).toHaveLength(89);
  expect(doCache('p88').foto).toContain('https://assinado.exemplo/');
});

test('O BASE64 ANTIGO CONTINUA FUNCIONANDO', async () => {
  /**
   * As fotos que já existem não podem sumir enquanto ninguém as
   * converte. Elas desaparecem sozinhas conforme cada pessoa troca a
   * sua — e até lá abrem do mesmo jeito.
   */
  const antiga = 'data:image/jpeg;base64,/9j/4AAQSkZJRg==';
  linhasDoBanco = [linha('bia', antiga)];

  await nuvem.sincronizarColaboradores();

  expect(doCache('bia').foto).toBe(antiga);
  // E não foi mandada para assinatura: não é caminho
  expect(caminhosAssinados).toHaveLength(0);
});

test('quem nunca trocou a foto fica com o logo', async () => {
  linhasDoBanco = [linha('caio', null), linha('dara', '/logo-malachias.svg')];

  await nuvem.sincronizarColaboradores();

  expect(doCache('caio').foto).toBe('/logo-malachias.svg');
  expect(doCache('dara').foto).toBe('/logo-malachias.svg');
});

test('CAMINHO SEM ASSINATURA CAI NO LOGO, e não em quadrado quebrado', async () => {
  /**
   * Assinar é uma ida à rede, e ela pode falhar. Um `<img>` apontando
   * para `perfil/ana/1.jpg` mostra o ícone de imagem partida no lugar
   * do rosto — e numa lista de conversas isso se lê como defeito do
   * sistema, não como rede ruim.
   *
   * O logo diz a mesma coisa que diria se a pessoa não tivesse foto.
   */
  assinaturaFalha = true;
  linhasDoBanco = [linha('ana', 'perfil/ana/1.jpg')];

  await nuvem.sincronizarColaboradores();

  expect(doCache('ana').foto).toBe('/logo-malachias.svg');
});

test('o que é caminho e o que é conteúdo', () => {
  expect(ehCaminhoDeFotoPerfil('perfil/ana/1.jpg')).toBe(true);
  expect(ehCaminhoDeFotoPerfil('data:image/jpeg;base64,xxx')).toBe(false);
  expect(ehCaminhoDeFotoPerfil('/logo-malachias.svg')).toBe(false);
  expect(ehCaminhoDeFotoPerfil('https://exemplo.com/foto.jpg')).toBe(false);
  expect(ehCaminhoDeFotoPerfil(undefined)).toBe(false);
  expect(ehCaminhoDeFotoPerfil(null)).toBe(false);

  /**
   * O prefixo é o mesmo que a regra do balde confere. Escrito à mão nos
   * dois lugares, um dia divergiriam — e a foto pararia de subir sem
   * ninguém entender por quê.
   */
  expect(PREFIXO_FOTO_PERFIL).toBe('perfil');
});

// ===============================================================
// O CAMINHO CARREGA O DONO
// ===============================================================

test('O CAMINHO LEVA O ID DA PESSOA, que é o que a regra do balde confere', async () => {
  /**
   * `perfil/<id>/<hora>.jpg`. A regra do balde confere o segundo pedaço
   * contra quem está pedindo — sem isso, qualquer pessoa autenticada
   * poderia subir um arquivo na pasta de outra, e a foto que a rede
   * inteira veria no lugar do rosto dela seria a que o invasor pôs.
   */
  const fonte = await Bun.file('src/servicos/anexos.ts').text();
  const sql = await Bun.file('supabase/foto-de-perfil-no-balde.sql').text();

  expect(fonte).toContain('`${PREFIXO_FOTO_PERFIL}/${colaboradorId}/${Date.now()}.jpg`');

  /**
   * AS DUAS POLÍTICAS, cada uma conferida no seu próprio trecho.
   *
   * A mutação pegou isto: eu procurava a regra no arquivo INTEIRO, e o
   * mesmo bloco aparece duas vezes — em `anexos_envio` e em
   * `anexos_remocao`. Apagar a de uma delas deixava o teste verde,
   * porque a outra ainda continha o texto.
   *
   * Seria a regra de subir caindo em silêncio, com o teste dizendo que
   * estava lá.
   */
  const envio = sql.slice(sql.indexOf('anexos_envio'), sql.indexOf('anexos_remocao'));
  const remocao = sql.slice(sql.indexOf('anexos_remocao'));

  for (const [nome, trecho] of [
    ['envio', envio],
    ['remoção', remocao],
  ] as const) {
    expect({ nome, tem: trecho.includes("when split_part(name, '/', 1) = 'perfil'") }).toEqual(
      { nome, tem: true }
    );
    expect({
      nome,
      confere: trecho.includes("split_part(name, '/', 2) = public.meu_colaborador_id()"),
    }).toEqual({ nome, confere: true });
  }

  // LER continua aberto: é o rosto do colega na lista de conversas
  expect(sql).not.toContain('drop policy if exists anexos_leitura');
});

test('ARQUIVO NOVO A CADA TROCA, com a hora no nome', async () => {
  /**
   * Sobrescrever o mesmo caminho exigiria permissão de UPDATE no balde,
   * que não existe — as regras cobrem select, insert e delete. E o
   * endereço assinado do mesmo caminho seria o mesmo texto, então o
   * navegador mostraria a foto ANTIGA do cache dele.
   */
  const fonte = await Bun.file('src/servicos/anexos.ts').text();
  expect(fonte).toContain('${Date.now()}.jpg');

  // Por isso o dono precisa poder apagar o anterior
  const sql = await Bun.file('supabase/foto-de-perfil-no-balde.sql').text();
  const remocao = sql.slice(sql.indexOf('anexos_remocao'));
  expect(remocao).toContain("split_part(name, '/', 1) = 'perfil'");
});

// ===============================================================
// A REGRA MORA NO SERVIÇO, e não nas telas
// ===============================================================

test('QUEM SOBE A FOTO É O SERVIÇO, não a tela', async () => {
  /**
   * São DUAS telas que trocam foto — o modal do "Eu" e o formulário do
   * Painel Administrativo. Ensinar as duas a subir arquivo é a
   * duplicação que este sistema já pagou quatro vezes: a terceira tela
   * que aparecesse gravaria base64 de novo, e ninguém notaria até a
   * conta de tráfego.
   */
  const servico = await Bun.file('src/servicos/bancoDados.ts').text();
  const modal = await Bun.file('src/componentes/ModalAlterarFoto.tsx').text();
  const painel = await Bun.file('src/componentes/PainelAdministrativo.tsx').text();

  expect(servico).toContain("dados.foto?.startsWith('data:')");
  expect(servico).toContain('enviarFotoDePerfil(dados.foto, id)');

  // E nenhuma das duas telas sobe arquivo por conta própria
  expect(modal).not.toContain('enviarFotoDePerfil');
  expect(painel).not.toContain('enviarFotoDePerfil');
});

test('quem trocou a foto vê o PRÓPRIO ROSTO na hora', async () => {
  /**
   * A ficha gravada leva o caminho, que é o que o banco guarda. Mas o
   * cache alimenta as telas AGORA, antes da próxima sincronização — e
   * um caminho num `<img src>` não abre imagem nenhuma.
   *
   * Sem isto, quem acabasse de trocar a foto veria um quadrado quebrado
   * no lugar do próprio rosto até recarregar o sistema.
   */
  const servico = await Bun.file('src/servicos/bancoDados.ts').text();

  expect(servico).toContain('let enderecoDaFotoNova: string | null = null;');
  expect(servico).toContain('enderecoDaFotoNova = enviada.url || null;');
  expect(servico).toContain(
    'colaboradores[indice] = { ...colaboradores[indice], foto: enderecoDaFotoNova };'
  );
});

test('A FICHA EXISTENTE É GRAVADA COM UPDATE, nunca upsert (07/10/2026)', async () => {
  /*
    Um colaborador trocou a foto e ouviu "new row violates row-level
    security policy for table colaboradores": o upsert vira INSERT ... ON
    CONFLICT, e a regra de INSERT é só do RH. A presença de quem não é RH
    também nunca saía do aparelho (o erro era engolido).
  */
  const banco = await Bun.file(new URL('./bancoDados.ts', import.meta.url)).text();
  // Foto, presença, edição e organograma: atualizarFicha
  expect(banco.split('nuvem.atualizarFicha(').length - 1).toBe(3);
  // O upsert sobra só no cadastro novo
  expect(banco.split('nuvem.salvarColaborador(').length - 1).toBe(1);
  const nuvem = await Bun.file(new URL('./nuvem.ts', import.meta.url)).text();
  const atualizar = nuvem.slice(nuvem.indexOf('async atualizarFicha('), nuvem.indexOf('async salvarColaborador('));
  expect(atualizar).toContain(".update(corpo)");
  // Quem não é RH manda só as colunas dele: a linha inteira do cache desfaria correções do RH
  expect(banco).toContain("nuvem.atualizarFicha(todos[indice], ['presenca', 'vistoPorUltimo']).catch(() => {});");
  expect(banco).toContain("ehAdmin || ehRh ? undefined : (Object.keys(dadosParaAplicar) as Array<keyof Colaborador>)");
  expect(atualizar).not.toContain('upsert');
  // UPDATE sem permissão afeta zero linhas e não dá erro: confere a linha de volta
  expect(atualizar).toContain("if (!data || data.length === 0) {");
  // E o banco devolve o que não é da pessoa — inclusive o CNPJ do comprovante e a admissão
  const sql = await Bun.file(new URL('../../supabase/ficha-propria-protegida.sql', import.meta.url)).text();
  for (const campo of ['nivel', 'setor', 'loja', 'responsavel_id', 'cnpj', 'data_admissao', 'ativo', 'login', 'nome']) {
    const linha = new RegExp(String.raw`new\.${campo}\s+:= old\.${campo};`);
    expect({ campo, protegido: linha.test(sql) }).toEqual({ campo, protegido: true });
  }
});
