/**
 * Ponte com o banco da rede — CONECTA / Malachias Autopeças
 *
 * Estratégia de migração: o armazenamento do navegador continua sendo a
 * memória de leitura do sistema, agora no papel de CACHE. Na inicialização o
 * cache é preenchido a partir do banco; cada alteração é gravada localmente
 * (como sempre foi) e empurrada para o banco em seguida; o tempo real traz de
 * volta o que os outros aparelhos fizeram.
 *
 * Isso mantém toda a aplicação lendo dados de forma instantânea e sobrevive à
 * oscilação de wi-fi da loja, sem reescrever as vinte telas.
 */

import {
  Colaborador,
  CodigoPontoLoja,
  Loja,
  MetodoMarcacao,
  NivelHierarquico,
  RegistroPonto,
  Setor,
  TipoMarcacao,
  AjusteJornada,
  Feriado,
  JustificativaAusencia,
  TURNO_PADRAO,
  TipoAjuste,
  EstadoAjuste,
  SENHA_PADRAO_PRIMEIRO_ACESSO,
} from '../tipos';
import {
  supabase,
  usandoNuvem,
  loginParaEmailInterno,
  normalizarLogin,
} from './supabase';
import { explicarRecusaDoBanco } from './recusaDoBanco';
import { ehCaminhoDeFotoPerfil, resolverCaminhos } from './anexos';
import { nuvemComunicacao } from './nuvemComunicacao';
/**
 * A folha, e não `justificativas`: aquele arquivo importa `ponto`, que
 * importa este — o ciclo fechava e o aplicativo não abria
 * ("Cannot access 'nuvem' before initialization", tela branca).
 */
import { aplicarJustificativasDaNuvem } from './justificativasCache';
import { aplicarFeriadosDaNuvem } from './feriadosCache';
import { buscarTodasAsLinhas } from './paginacao';
import {
  LinhaColaborador,
  LinhaRegistroPonto,
  LinhaAjuste,
  paraColaboradorDaLinha,
  paraRegistroPonto,
  paraLinhaPonto,
  paraAjuste,
  paraLinhaAjuste,
  paraLinhaJustificativa,
  paraJustificativa,
  paraFeriado,
  LinhaCompensacao,
  paraCompensacao,
} from './linhasDoBanco';
import { CHAVE_COMPENSACAO } from './compensacaoDoSabado';
import { acompanharCanal, definirRecarga, recarregarAoVoltar } from './reconexao';
import { FOTO_DA_LOGO } from './avatar';

/**
 * Enche o cache de conversa, aviso, configuração e auditoria. Fica aqui e não
 * dentro da classe porque é a entrada no sistema que dispara isso, e a ponte
 * de comunicação não precisa saber nada sobre autenticação.
 */
const carregarComunicacao = async (): Promise<void> => {
  await Promise.all([
    nuvemComunicacao.sincronizarConversas(),
    nuvemComunicacao.sincronizarAvisos(),
    nuvemComunicacao.sincronizarConfiguracoes(),
    nuvemComunicacao.sincronizarAuditoria(),
  ]);
};

const CHAVE_COLABORADORES = 'conecta_v4_colaboradores';
const CHAVE_COLABORADOR_ATUAL = 'conecta_v4_colaborador_atual';
const CHAVE_REGISTROS_PONTO = 'conecta_v4_registros_ponto';
const CHAVE_CODIGOS_PONTO = 'conecta_v4_codigos_ponto_loja';
const CHAVE_AJUSTES = 'conecta_v4_ajustes_jornada';

/**
 * ===================================================================
 * A JANELA DO PONTO — por que o cache não pode ser "tudo"
 * ===================================================================
 *
 * `sincronizarPonto` baixava TODAS as marcações da rede e as gravava no
 * `localStorage`. Com as 8 pessoas do piloto isso eram 314 linhas, 80
 * KB, e funcionava. Medido para as 89:
 *
 *     89 pessoas × 4 batidas × 22 dias = 7.832 marcações POR MÊS
 *
 *     mês    marcações    localStorage
 *       1        7.832        1,96 MB
 *       3       23.496        5,87 MB   <- estoura o limite de ~5 MB
 *      12       93.984       23,48 MB
 *
 * O `localStorage` do navegador guarda ~5 MB. Passado disso, `setItem`
 * LANÇA — e `sincronizarPonto` roda DENTRO de `registrarMarcacaoPorCodigo`,
 * antes de cada batida. O terceiro mês de uso derrubaria o bater ponto.
 *
 * A RLS já poupa a maioria: cada pessoa só enxerga as próprias
 * marcações, o que dá ~1.000 linhas por ano. Quem carrega a rede inteira
 * é o RH e a gestão — justamente quem abre o Banco de Horas todo dia.
 *
 * E APAGAR NÃO É SAÍDA: marcação de ponto é documento trabalhista, e a
 * regra da casa é que ela não se apaga em hipótese alguma. O que muda é
 * o quanto o APARELHO guarda de cada vez.
 *
 * Então o cache cobre uma JANELA. O padrão cobre o mês corrente e o
 * anterior, que é o que a aba Ponto e a apuração da semana precisam. O
 * Banco de Horas pede o período que está mostrando.
 */
const DIAS_DA_JANELA_PADRAO = 62;

/** AAAA-MM-DD de hoje, no fuso do aparelho. */
const hojeLocal = (): string => {
  const d = new Date();
  const doisDigitos = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${doisDigitos(d.getMonth() + 1)}-${doisDigitos(d.getDate())}`;
};

const diasAtras = (dias: number): string => {
  const d = new Date();
  d.setDate(d.getDate() - dias);
  const doisDigitos = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${doisDigitos(d.getMonth() + 1)}-${doisDigitos(d.getDate())}`;
};

export interface JanelaDoPonto {
  inicio: string;
  fim: string;
}

/**
 * ===================================================================
 * A FOTO CHEGA PRONTA PARA A TELA, sempre.
 * ===================================================================
 *
 * O banco passou a guardar o CAMINHO da foto no balde, e não mais o
 * base64. Mas vinte e tantas telas leem `colaborador.foto` e o entregam
 * direto ao `<img src>` — de `AbaEu` a `Organograma`, passando pelo
 * chat e pelo espelho de ponto.
 *
 * Fazer cada uma resolver o caminho seria vinte lugares aprendendo a
 * mesma coisa, e o primeiro que esquecesse mostraria um quadrado
 * quebrado no lugar do rosto de alguém.
 *
 * Então a tradução acontece AQUI, na fronteira: o que entra é o que o
 * banco guardou, o que sai é sempre um endereço que o `<img>` abre.
 * Nenhuma tela precisou mudar.
 *
 * TRÊS FORMATOS convivem, e é de propósito:
 *
 *   `perfil/<id>/<hora>.jpg`  o caminho no balde — vira endereço assinado
 *   `data:image/...`          o base64 antigo, que ainda funciona
 *   `/logo-malachias.svg`     quem nunca trocou a foto
 *
 * O base64 continua sendo aceito porque as fotos que já existem não
 * podem sumir enquanto ninguém as converte. Elas desaparecem sozinhas
 * conforme cada pessoa troca a sua.
 */
const paraColaborador = (
  linha: LinhaColaborador,
  fotosAssinadas?: Map<string, string>
): Colaborador =>
  paraColaboradorDaLinha(
    linha,
    /* Caminho que não foi assinado cai no logo, e não num quadrado
       quebrado: a assinatura é uma ida à rede, e ela pode falhar */
    ehCaminhoDeFotoPerfil(linha.foto)
      ? fotosAssinadas?.get(linha.foto!) || FOTO_DA_LOGO
      : linha.foto || FOTO_DA_LOGO
  );

/**
 * A senha de LOGIN nunca vai para a tabela: quem guarda é a autenticação do
 * Supabase, cifrada.
 *
 * A de PRIMEIRO ACESSO vai, em `senha_ativacao`. São coisas diferentes: essa
 * é a que o RH entrega em mão e que o gatilho confere uma única vez, sendo
 * apagada na ativação.
 *
 * Sem isso, o painel mostrava a senha que o administrador escolheu e o
 * sistema exigia a padrão — duas verdades, e a pessoa não entrava.
 */
const paraLinha = (c: Colaborador) => ({
  id: c.id,
  nome: c.nome,
  login: c.login,
  cargo: c.cargo,
  setor: c.setor,
  loja: c.loja,
  nivel: c.nivel,
  foto: c.foto,
  presenca: c.presenca,
  visto_por_ultimo: c.vistoPorUltimo,
  ramal: c.ramal ?? null,
  telefone: c.telefone ?? null,
  email: c.email ?? null,
  matricula: c.matricula ?? null,
  cnpj: c.cnpj ?? null,
  departamento: c.departamento ?? null,
  responsavel_id: c.responsavelId ?? null,
  data_admissao: c.dataAdmissao ?? null,
  observacoes: c.observacoes ?? null,
  // Nunca 490 de volta: salvar uma ficha qualquer desfaria a migração que
  // limpou a jornada que ninguém escolheu.
  carga_horaria_diaria_minutos: c.cargaHorariaDiariaMinutos ?? null,
  /**
   * NUNCA `null`: a coluna e `not null default 'A'`, e um null EXPLICITO
   * anula o default em vez de cair nele. Cada cadastro novo era recusado
   * com 23502 — e como a gravacao era disparada sem ninguem esperar, o
   * painel dizia "cadastrado com sucesso" e a pessoa nao existia no banco.
   */
  turno: c.turno || TURNO_PADRAO,
  /**
   * Null quando não foi definido: é o que diz "siga o padrão do setor".
   * Gravar um número inventado aqui congelaria a pessoa numa jornada que
   * ninguém escolheu, e mudar o padrão depois não a alcançaria mais.
   */
  carga_semanal_minutos: c.cargaSemanalMinutos ?? null,
  trabalha_sabado: c.trabalhaSabado ?? null,
  tem_intervalo: c.temIntervalo ?? null,
  /**
   * A senha de primeiro acesso só viaja quando foi informada.
   *
   * `salvarColaborador` roda em toda alteração — foto, presença, ramal. Se o
   * campo fosse sempre enviado, cada uma delas mandaria `null` e apagaria a
   * senha de quem ainda não entrou, deixando a pessoa com a padrão sem
   * ninguém saber.
   */
  ...(c.senhaAtivacao ? { senha_ativacao: c.senhaAtivacao } : {}),
  // Mesma regra do campo acima: só viaja quando dito, senão cada alteração
  // de ramal reabriria a troca de senha de quem já definiu a dele
  ...(c.precisaTrocarSenha === undefined
    ? {}
    : { precisa_trocar_senha: c.precisaTrocarSenha }),
  ativo: c.ativo,
});

/** Linha da tabela `codigos_ponto_loja`. */
interface LinhaCodigoPonto {
  loja: string;
  codigo: string;
  atualizado_por_nome: string | null;
  atualizado_em: string;
}

const paraCodigoPonto = (linha: LinhaCodigoPonto): CodigoPontoLoja => ({
  loja: linha.loja as Loja,
  codigo: linha.codigo,
  atualizadoEm: linha.atualizado_em,
  atualizadoPorNome: linha.atualizado_por_nome || undefined,
});

type Ouvinte = () => void;

class PonteNuvem {
  private ouvintes: Ouvinte[] = [];
  private canalAberto = false;

  /** Avisa a aplicação de que o cache mudou por conta do banco. */
  assinarAtualizacoes(ouvinte: Ouvinte): () => void {
    this.ouvintes.push(ouvinte);
    return () => {
      this.ouvintes = this.ouvintes.filter((o) => o !== ouvinte);
    };
  }

  private avisar(): void {
    this.ouvintes.forEach((o) => o());
  }

  private gravarCacheColaboradores(lista: Colaborador[]): void {
    localStorage.setItem(CHAVE_COLABORADORES, JSON.stringify(lista));
  }

  // --- AUTENTICAÇÃO ---

  /**
   * Entra no sistema. Se a conta ainda não foi ativada neste banco, a
   * primeira entrada com a senha padrão ativa o acesso — desde que o login
   * já esteja cadastrado. O gatilho no banco recusa login desconhecido, que
   * é o que impede alguém de criar conta por fora do sistema.
   */
  async entrar(
    login: string,
    senha: string
  ): Promise<{
    sucesso: boolean;
    colaborador?: Colaborador;
    precisaTrocarSenha?: boolean;
    erro?: string;
  }> {
    if (!supabase) return { sucesso: false, erro: 'Banco não configurado.' };

    const email = loginParaEmailInterno(login);

    let { data, error } = await supabase.auth.signInWithPassword({
      email,
      password: senha,
    });

    // Credencial inexistente: pode ser o primeiro acesso deste colaborador
    if (error) {
      /**
        * Primeiro acesso. O gatilho do banco não CRIA ficha — ele procura a
        * que já existe pelo login e a adota, mantendo nível, loja, CNPJ e
        * tudo o que veio da planilha.
        *
        * O login vai NORMALIZADO porque é assim que o gatilho compara. Ia
        * cru antes, e quem digitasse "Fabio Engle" onde a planilha gravou
        * "fabio.tavares" não casava com ficha nenhuma — nascia um cadastro
        * novo, nível 1, em branco.
        *
        * A senha vai junto para o gatilho conferir se é mesmo a de primeiro
        * acesso. Sem essa conferência, QUALQUER senha ativava a conta: quem
        * descobrisse a URL e chutasse um login viraria aquela pessoa. O
        * banco apaga esse campo assim que confere.
        */
      const ativacao = await supabase.auth.signUp({
        email,
        password: senha,
        options: {
          data: { login: normalizarLogin(login), ativacao: senha },
        },
      });

      if (ativacao.error) {
        const msg = ativacao.error.message.toLowerCase();

        /**
         * SENHA CURTA VEM PRIMEIRO.
         *
         * A autenticação do Supabase exige 6 caracteres e recusa antes de o
         * gatilho do banco rodar. Esta verificação estava por ÚLTIMO no
         * encadeamento, e a busca larga por "email" logo acima engolia o
         * caso — a pessoa recebia um texto sobre confirmação de e-mail
         * quando o problema era o tamanho da senha.
         */
        if (msg.includes('password') || msg.includes('senha')) {
          return {
            sucesso: false,
            erro:
              'A senha de primeiro acesso precisa ter ao menos 6 caracteres. ' +
              'Peça ao RH para cadastrar uma senha maior.',
          };
        }

        // A confirmação por e-mail precisa estar desligada no projeto: o
        // domínio dos logins é interno e nunca receberia a mensagem.
        if (msg.includes('rate limit') || msg.includes('email')) {
          return {
            sucesso: false,
            erro:
              'A confirmação por e-mail está ligada no Supabase e precisa ser desativada ' +
              '(Authentication › Sign In / Providers › Email › Confirm email).',
          };
        }

        // O Supabase mascara a mensagem do gatilho como 'Database error
        // saving new user'. Nesta tela a causa é sempre a mesma: o gatilho
        // recusou porque o login não está cadastrado na rede.
        /**
         * O Supabase mascara qualquer erro do gatilho como 'Database error
         * saving new user', então daqui não dá para separar "login não
         * existe" de "senha de primeiro acesso errada". A mensagem cobre os
         * três motivos possíveis em vez de afirmar um que pode estar errado.
         */
        if (
          msg.includes('não cadastrado') ||
          msg.includes('nao cadastrado') ||
          msg.includes('ja tem acesso') ||
          msg.includes('primeiro acesso') ||
          msg.includes('database error')
        ) {
          return {
            sucesso: false,
            erro:
              'Não foi possível entrar. Confira o login e use a senha de primeiro ' +
              'acesso. Se o seu acesso já estiver ativado, use a sua senha. Em caso ' +
              'de dúvida, procure o RH.',
          };
        }
        /**
         * "already registered" quer dizer uma coisa só, e não é ambígua: a
         * conta de acesso EXISTE. O login está certo; a senha é que não.
         *
         * Dizer "login ou senha incorretos" aqui mandava a pessoa conferir o
         * login — que estava certo — e escondia o único caminho que resolve:
         * pedir ao RH para resetar o acesso. A senha vive cifrada na
         * autenticação e ninguém a recupera lendo o banco.
         */
        if (msg.includes('already registered') || msg.includes('already been registered')) {
          return {
            sucesso: false,
            erro:
              'Este login já tem acesso ativado, e a senha digitada não é a dele. ' +
              'A senha de primeiro acesso não vale mais. Peça ao RH para resetar o seu acesso.',
          };
        }
        return { sucesso: false, erro: 'Login ou senha incorretos.' };
      }

      // Conta ativada: entra com ela
      const entrada = await supabase.auth.signInWithPassword({ email, password: senha });
      data = entrada.data;
      error = entrada.error;
    }

    if (error || !data.user) {
      if (error?.message.toLowerCase().includes('not confirmed')) {
        return {
          sucesso: false,
          erro:
            'A confirmação por e-mail está ligada no Supabase e precisa ser desativada ' +
            '(Authentication › Sign In / Providers › Email › Confirm email).',
        };
      }
      return { sucesso: false, erro: 'Login ou senha incorretos.' };
    }

    const colaborador = await this.obterMeuColaborador();
    if (!colaborador) {
      await supabase.auth.signOut();
      return {
        sucesso: false,
        erro: 'Conta sem ficha de colaborador. Procure o TI.',
      };
    }
    if (!colaborador.ativo) {
      await supabase.auth.signOut();
      return { sucesso: false, erro: 'Esta conta está desativada pela administração.' };
    }

    localStorage.setItem(CHAVE_COLABORADOR_ATUAL, colaborador.id);
    await this.sincronizarColaboradores();
    await this.sincronizarPonto();
    await this.sincronizarAjustes();
    await this.sincronizarJustificativas();
    await this.sincronizarFeriados();
    await carregarComunicacao();

    return {
      sucesso: true,
      colaborador,
      precisaTrocarSenha: await this.precisaTrocarSenha(),
    };
  }

  /** Ainda está com a senha padrão? */
  async precisaTrocarSenha(): Promise<boolean> {
    if (!supabase) return false;
    const { data: sessao } = await supabase.auth.getUser();
    if (!sessao.user) return false;

    const { data } = await supabase
      .from('colaboradores')
      .select('precisa_trocar_senha')
      .eq('auth_user_id', sessao.user.id)
      .maybeSingle();

    return !!data?.precisa_trocar_senha;
  }

  /** Define a senha própria e encerra a obrigação de trocá-la. */
  async definirNovaSenha(novaSenha: string): Promise<{ sucesso: boolean; erro?: string }> {
    if (!supabase) return { sucesso: false, erro: 'Banco não configurado.' };

    const { error } = await supabase.auth.updateUser({ password: novaSenha });
    if (error) {
      const msg = error.message.toLowerCase();
      if (msg.includes('password') && msg.includes('6')) {
        return { sucesso: false, erro: 'A senha precisa ter ao menos 6 caracteres.' };
      }
      if (msg.includes('should be different')) {
        return { sucesso: false, erro: 'A nova senha precisa ser diferente da atual.' };
      }
      return { sucesso: false, erro: error.message };
    }

    await supabase.rpc('concluir_troca_de_senha');
    await this.sincronizarColaboradores();
    return { sucesso: true };
  }

  /**
   * DEVOLVE ALGUÉM AO PRIMEIRO ACESSO, com a senha padrão da rede.
   *
   * É para quando a pessoa já trocou a senha dela e esqueceu. Ninguém
   * consegue ler a senha de ninguém — nem o TI —, então não há "ver qual
   * é": o caminho é zerar e deixar a pessoa criar outra na entrada.
   *
   * O trabalho todo acontece no banco, em `resetar_senha_inicial`, porque
   * apagar conta de acesso é coisa que o navegador não alcança. As travas
   * de quem pode resetar quem moram lá pelo mesmo motivo: trava que mora
   * na tela se contorna abrindo o console.
   */
  async resetarSenhaInicial(
    colaboradorId: string
  ): Promise<{ sucesso: boolean; senha?: string; erro?: string }> {
    if (!supabase) return { sucesso: false, erro: 'Banco não configurado.' };

    const { data, error } = await supabase.rpc('resetar_senha_inicial', {
      colaborador_alvo: colaboradorId,
    });

    if (error) return { sucesso: false, erro: error.message };

    await this.sincronizarColaboradores();
    const linha = Array.isArray(data) ? data[0] : data;
    return { sucesso: true, senha: linha?.senha || SENHA_PADRAO_PRIMEIRO_ACESSO };
  }

  async sair(): Promise<void> {
    if (!supabase) return;
    await supabase.auth.signOut();
    localStorage.removeItem(CHAVE_COLABORADOR_ATUAL);
    // Ponto e conversa são pessoais: o cache não pode sobrar no aparelho para
    // quem entrar depois
    localStorage.removeItem(CHAVE_REGISTROS_PONTO);
    nuvemComunicacao.limparCache();
  }

  /** Há uma sessão válida guardada neste aparelho? */
  async temSessao(): Promise<boolean> {
    if (!supabase) return false;
    const { data } = await supabase.auth.getSession();
    return !!data.session;
  }

  /** A ficha do colaborador ligada à sessão atual. */
  async obterMeuColaborador(): Promise<Colaborador | null> {
    if (!supabase) return null;
    const { data: sessao } = await supabase.auth.getUser();
    if (!sessao.user) return null;

    const { data, error } = await supabase
      .from('colaboradores')
      .select('*')
      .eq('auth_user_id', sessao.user.id)
      .maybeSingle();

    if (error || !data) return null;
    return paraColaborador(data as LinhaColaborador);
  }

  // --- COLABORADORES ---

  /** Traz a lista do banco para o cache local. */
  async sincronizarColaboradores(): Promise<boolean> {
    if (!supabase) return false;

    const { data, error } = await supabase.from('colaboradores').select('*').order('nome');
    if (error || !data) return false;

    const linhas = data as LinhaColaborador[];

    /**
     * AS 89 ASSINATURAS NUMA CHAMADA SÓ.
     *
     * `createSignedUrls` assina em lote. Uma por pessoa seriam 89 idas
     * à rede a cada sincronização — e ela roda ao entrar e a cada
     * alteração em qualquer ficha.
     *
     * A assinatura vale oito horas, que cobre um turno. O aparelho que
     * ficar aberto além disso sem sincronizar volta a mostrar o logo,
     * e não um quadrado quebrado.
     */
    const caminhos = linhas
      .map((l) => l.foto)
      .filter((f): f is string => ehCaminhoDeFotoPerfil(f));

    const assinadas = caminhos.length > 0 ? await resolverCaminhos(caminhos) : undefined;

    this.gravarCacheColaboradores(linhas.map((l) => paraColaborador(l, assinadas)));
    this.avisar();
    return true;
  }

  /**
   * A PESSOA CONFIRMA O PRÓPRIO TURNO — uma vez só.
   *
   * Não passa por `salvarColaborador`: aquele grava a linha inteira, e a
   * confirmação precisa ir explícita. Quem decide se vale é o gatilho
   * `turno_escolhido_uma_vez`: já confirmado, ou turno fora do perfil, e
   * ele devolve o valor antigo SEM erro. Por isso a resposta é conferida
   * — update que o banco desfez em silêncio não pode virar "salvo".
   */
  async escolherMeuTurno(
    colaboradorId: string,
    turno: string
  ): Promise<{ sucesso: boolean; erro?: string; confirmadoEm?: string }> {
    if (!supabase) return { sucesso: true, confirmadoEm: new Date().toISOString() };

    const { data, error } = await supabase
      .from('colaboradores')
      .update({ turno, turno_confirmado_em: new Date().toISOString() })
      .eq('id', colaboradorId)
      .select('turno, turno_confirmado_em')
      .maybeSingle();

    if (error) {
      console.error('Falha ao confirmar o turno:', error.message);
      return { sucesso: false, erro: await explicarRecusaDoBanco(error) };
    }
    if (!data || data.turno !== turno || !data.turno_confirmado_em) {
      return {
        sucesso: false,
        erro: 'O seu horário já foi definido. Para mudar, fale com o RH.',
      };
    }
    return { sucesso: true, confirmadoEm: data.turno_confirmado_em };
  }

  /** Cria ou atualiza a ficha no banco. Chamado após a gravação local. */
  async salvarColaborador(colaborador: Colaborador): Promise<{ sucesso: boolean; erro?: string }> {
    if (!supabase) return { sucesso: true };

    const { error } = await supabase
      .from('colaboradores')
      .upsert(paraLinha(colaborador), { onConflict: 'id' });

    if (error) {
      console.error('Falha ao salvar colaborador no banco:', error.message);
      return { sucesso: false, erro: error.message };
    }
    return { sucesso: true };
  }

  /**
   * Grava no banco as fichas vindas da planilha. Elas nascem SEM acesso
   * ativado: cada colaborador ativa o próprio na primeira entrada, usando a
   * senha padrão, e define a senha dele em seguida. Isso evita ter que criar
   * quarenta contas de autenticação a partir do navegador, o que trocaria a
   * sessão do administrador a cada uma.
   */
  async salvarColaboradoresEmLote(
    lista: Colaborador[]
  ): Promise<{ sucesso: boolean; gravados: number; erro?: string }> {
    if (!supabase) return { sucesso: true, gravados: lista.length };
    if (lista.length === 0) return { sucesso: true, gravados: 0 };

    const { error } = await supabase
      .from('colaboradores')
      .upsert(lista.map(paraLinha), { onConflict: 'id' });

    if (error) {
      console.error('Falha ao importar colaboradores:', error.message);
      // Login repetido é o erro esperado quando a planilha traz alguém que já existe
      if (error.code === '23505') {
        return {
          sucesso: false,
          gravados: 0,
          erro: 'Há login repetido: algum já está cadastrado na rede com outra ficha.',
        };
      }
      return { sucesso: false, gravados: 0, erro: error.message };
    }

    await this.sincronizarColaboradores();
    return { sucesso: true, gravados: lista.length };
  }

  /** Fichas já cadastradas, para a planilha saber quem é novo e quem é atualização. */
  async obterColaboradores(): Promise<Colaborador[]> {
    if (!supabase) return [];
    const { data, error } = await supabase.from('colaboradores').select('*').order('nome');
    if (error || !data) return [];
    return (data as LinhaColaborador[]).map((l) => paraColaborador(l));
  }

  async removerColaborador(id: string): Promise<{ sucesso: boolean; erro?: string }> {
    if (!supabase) return { sucesso: true };

    const { error } = await supabase.from('colaboradores').delete().eq('id', id);
    if (error) {
      console.error('Falha ao remover colaborador no banco:', error.message);
      return { sucesso: false, erro: error.message };
    }
    return { sucesso: true };
  }

  /**
   * Cadastra um colaborador com acesso ao sistema. Diferente de salvar a
   * ficha: aqui também nasce a credencial de entrada.
   *
   * Observação honesta: criar a conta pela tela do administrador troca a
   * sessão para o usuário recém-criado, então em seguida o administrador
   * precisa entrar de novo. Resolver isso exige uma função no servidor, que
   * fica para quando o cadastro em massa for usado de verdade.
   */
  async criarAcesso(dados: {
    nome: string;
    login: string;
    senha: string;
    cargo: string;
    setor: string;
    loja: string;
  }): Promise<{ sucesso: boolean; erro?: string }> {
    if (!supabase) return { sucesso: false, erro: 'Banco não configurado.' };

    const { error } = await supabase.auth.signUp({
      email: loginParaEmailInterno(dados.login),
      password: dados.senha,
      options: {
        data: {
          login: dados.login.trim(),
          nome: dados.nome.trim(),
          cargo: dados.cargo,
          setor: dados.setor,
          loja: dados.loja,
        },
      },
    });

    if (error) {
      if (error.message.toLowerCase().includes('already registered')) {
        return { sucesso: false, erro: 'Já existe uma conta com este login.' };
      }
      return { sucesso: false, erro: error.message };
    }
    return { sucesso: true };
  }

  // --- PONTO ---

  /**
   * Traz o ponto do banco para o cache. O que cada um enxerga já vem
   * filtrado pela RLS: o colaborador recebe só as próprias marcações, o RH e
   * o Administrador recebem a rede inteira.
   */
  /**
   * A janela que o cache cobre AGORA.
   *
   * Vive na memória, e não no `localStorage`, de propósito: cada sessão
   * começa no padrão. Guardá-la faria a janela que o RH abriu uma vez
   * para consultar um mês antigo valer para sempre, naquele aparelho, e
   * o cache voltaria a crescer sem ninguém pedir.
   */
  private janelaDoPonto: JanelaDoPonto | null = null;

  /** A janela em vigor — o padrão, ou a última que alguém pediu. */
  obterJanelaDoPonto(): JanelaDoPonto {
    return (
      this.janelaDoPonto || {
        inicio: diasAtras(DIAS_DA_JANELA_PADRAO),
        fim: hojeLocal(),
      }
    );
  }

  /**
   * @param periodo O trecho a carregar. Sem ele, mantém a janela em
   * vigor — é o que as chamadas de rotina fazem, inclusive a que roda
   * antes de cada batida.
   */
  async sincronizarPonto(periodo?: JanelaDoPonto): Promise<boolean> {
    if (!supabase) return false;

    if (periodo) this.janelaDoPonto = periodo;
    const janela = this.obterJanelaDoPonto();

    const [registros, codigos] = await Promise.all([
      buscarTodasAsLinhas<LinhaRegistroPonto>(
        () =>
          supabase!
            .from('registros_ponto')
            .select('*')
            /* A coluna `data` é indexada (`registros_ponto_por_data`), e
               é por ela que o período se recorta — `horario` é timestamp
               com fuso, e comparar data com ele erra a virada do dia */
            .gte('data', janela.inicio)
            .lte('data', janela.fim)
            .order('horario'),
        'as marcações de ponto'
      ),
      supabase.from('codigos_ponto_loja').select('*'),
    ]);

    if (!registros) return false;

    /**
     * O CACHE QUE NÃO COUBE NÃO PODE DERRUBAR A BATIDA.
     *
     * `setItem` LANÇA quando estoura o limite do navegador, e esta
     * função roda dentro de `registrarMarcacaoPorCodigo`. Sem esta
     * guarda, o aparelho do RH que passasse do limite deixaria de bater
     * ponto — com uma exceção subindo até a tela, sem nome nem
     * explicação.
     *
     * E NÃO SE GRAVA PELA METADE. Truncar para caber deixaria o espelho
     * com dias faltando e ninguém saberia: documento de ponto incompleto
     * é pior do que documento que não abriu. Ou entra inteiro, ou o
     * cache fica como estava e a função diz que falhou.
     */
    try {
      localStorage.setItem(
        CHAVE_REGISTROS_PONTO,
        JSON.stringify(registros.map(paraRegistroPonto))
      );
    } catch (erro) {
      console.error(
        `Não coube no aparelho a janela ${janela.inicio} a ${janela.fim} ` +
          `(${registros.length} marcações):`,
        erro
      );
      return false;
    }

    if (!codigos.error && codigos.data) {
      localStorage.setItem(
        CHAVE_CODIGOS_PONTO,
        JSON.stringify((codigos.data as LinhaCodigoPonto[]).map(paraCodigoPonto))
      );
    }

    this.avisar();
    return true;
  }

  /**
   * OS DIAS COM ALGUMA BATIDA E MENOS DE QUATRO, perguntados ao banco.
   *
   * Para "Pontos incompletos" e o aviso de Espelhos de ponto, que liam o
   * cache — uma janela que as telas trocam (a lista oscilava). A função
   * `dias_com_batida_incompleta` obedece à segurança de leitura do ponto.
   * `null` quando ela ainda não existe (pontos-incompletos.sql não rodado):
   * quem chama volta ao cache.
   */
  async buscarDiasComBatidaIncompleta(
    inicio: string,
    fim: string
  ): Promise<Array<{ colaboradorId: string; data: string; tipos: string[]; horas: string[] }> | null> {
    if (!supabase) return null;
    const { data, error } = await supabase.rpc('dias_com_batida_incompleta', { inicio, fim });
    if (error) {
      console.warn('Dias incompletos pelo banco indisponíveis; usando o aparelho:', error.message);
      return null;
    }
    return ((data || []) as Array<{ colaborador_id: string; data: string; tipos: string[]; horas: string[] }>).map(
      (l) => ({ colaboradorId: l.colaborador_id, data: l.data, tipos: l.tipos || [], horas: l.horas || [] })
    );
  }

  /**
   * EM QUE DIAS CADA PESSOA BATEU, uma linha por pessoa.
   *
   * Para contar os dias vazios do espelho sem baixar as batidas da rede:
   * dois meses de 89 pessoas seriam dezenas de milhares de linhas, e aqui
   * são 89. A segurança de `registros_ponto` vale (security invoker).
   * Sem a função no banco (dias-com-batida.sql), devolve null.
   */
  async buscarDiasComBatida(
    inicio: string,
    fim: string
  ): Promise<Array<{ colaboradorId: string; dias: string[] }> | null> {
    if (!supabase) return null;
    const { data, error } = await supabase.rpc('dias_com_batida', { inicio, fim });
    if (error) {
      console.warn('Dias com batida pelo banco indisponíveis; usando o aparelho:', error.message);
      return null;
    }
    return ((data || []) as Array<{ colaborador_id: string; dias: string[] }>).map((l) => ({
      colaboradorId: l.colaborador_id,
      dias: l.dias || [],
    }));
  }

  /**
   * AS BATIDAS DE UMA PESSOA NUM MÊS FECHADO, somadas ao cache.
   *
   * Para o espelho do mês na aba Eu. Não troca a janela, de propósito:
   * `sincronizarPonto(periodo)` baixa tudo o que a pessoa ENXERGA no
   * período — para o RH, a rede inteira —, e doze meses da rede estouram
   * o aparelho. Aqui vem só a própria pessoa: umas 90 linhas por mês.
   *
   * As do período são TROCADAS, e não somadas: o que o RH corrigiu ou
   * apagou lá não pode sobrar aqui e sair no documento.
   */
  async trazerMarcacoesDe(colaboradorId: string, periodo: JanelaDoPonto): Promise<boolean> {
    if (!supabase) return true;

    const linhas = await buscarTodasAsLinhas<LinhaRegistroPonto>(
      () =>
        supabase!
          .from('registros_ponto')
          .select('*')
          .eq('colaborador_id', colaboradorId)
          .gte('data', periodo.inicio)
          .lte('data', periodo.fim)
          .order('horario'),
      'as marcações do mês'
    );
    if (!linhas) return false;

    const novas = linhas.map(paraRegistroPonto);
    let atuais: RegistroPonto[] = [];
    try {
      atuais = JSON.parse(localStorage.getItem(CHAVE_REGISTROS_PONTO) || '[]');
    } catch {
      atuais = [];
    }
    const mantidas = atuais.filter(
      (r) =>
        !(
          r.colaboradorId === colaboradorId &&
          r.data >= periodo.inicio &&
          r.data <= periodo.fim
        )
    );

    try {
      localStorage.setItem(CHAVE_REGISTROS_PONTO, JSON.stringify([...mantidas, ...novas]));
    } catch (erro) {
      console.error('Não coube no aparelho o mês pedido para o espelho:', erro);
      return false;
    }
    return true;
  }

  /**
   * Grava a marcação no banco. O banco é quem decide se ela vale: a restrição
   * `unique (colaborador_id, data, tipo)` recusa a segunda batida do mesmo
   * passo, mesmo que tenha vindo de outro aparelho com o cache atrasado.
   */
  async salvarRegistroPonto(
    registro: RegistroPonto
  ): Promise<{ sucesso: boolean; erro?: string; duplicado?: boolean }> {
    if (!supabase) return { sucesso: true };

    const { error } = await supabase.from('registros_ponto').insert(paraLinhaPonto(registro));

    if (error) {
      if (error.code === '23505') return { sucesso: false, duplicado: true };
      console.error('Falha ao gravar a marcação no banco:', error.message);
      /**
       * A MESMA EXPLICAÇÃO DO CHAT, e não a mensagem crua.
       *
       * Devolvia `error.message` direto: uma pessoa no balcão, com o
       * celular na mão, lendo "Could not find the 'x' column of
       * 'registros_ponto' in the schema cache". Agora lê que falta rodar
       * um script e que o TI resolve — e o TI lê o nome da coluna.
       */
      return { sucesso: false, erro: await explicarRecusaDoBanco(error) };
    }
    return { sucesso: true };
  }

  /**
   * A BATIDA DE QUEM ESTÁ NA LOJA, carimbada pelo SERVIDOR (bater_ponto).
   *
   * O aparelho só diz o que leu no cartaz e qual batida é a próxima. A
   * hora e o dia saem do relógio do banco, e é o banco que confere o
   * código da loja: antes os dois vinham prontos do aparelho, e o banco
   * aceitava qualquer horário que chegasse (ponto-pelo-servidor.sql).
   *
   * `semFuncao`: o script ainda não rodou. Quem chama volta ao caminho
   * antigo, para o ponto não parar entre a publicação e o SQL.
   */
  async baterPonto(dados: {
    codigo: string;
    loja: string | null;
    tipo: TipoMarcacao;
  }): Promise<{ sucesso: boolean; registro?: RegistroPonto; erro?: string; duplicado?: boolean; semFuncao?: boolean }> {
    if (!supabase) return { sucesso: false, semFuncao: true };
    const { data, error } = await supabase.rpc('bater_ponto', {
      p_codigo: dados.codigo,
      p_loja: dados.loja,
      p_tipo: dados.tipo,
    });
    if (error) {
      if (error.code === 'PGRST202' || error.code === '42883') return { sucesso: false, semFuncao: true };
      if (error.code === '23505') return { sucesso: false, duplicado: true };
      // A recusa escrita pelo próprio banco ("Código não reconhecido...") vai como está
      if (error.code === 'P0001') return { sucesso: false, erro: error.message };
      console.error('Falha ao bater o ponto no banco:', error.message);
      return { sucesso: false, erro: await explicarRecusaDoBanco(error) };
    }
    return { sucesso: true, registro: paraRegistroPonto(data as LinhaRegistroPonto) };
  }

  /**
   * O DIA APURADO PELO SERVIDOR (\`apurar-ponto\`, modo "dia").
   *
   * Na saída, e quando o RH ou o líder corrige uma batida, o aparelho não
   * decide nem grava a apuração: pede ao servidor, que decide com as linhas
   * do banco e as mesmas regras (\`decidirApuracao\`), confere a alçada pela
   * regra do banco e grava. Volta a apuração para a tela e para o aviso.
   *
   * \`indisponivel\`: a função não respondeu (não publicada, sem rede). Quem
   * chama segue pelo caminho antigo enquanto o banco ainda o aceitar.
   */
  async apurarDiaNoServidor(pedido: {
    data: string;
    colaboradorId: string;
    motivo?: string;
    anexoCaminho?: string;
    corrigido?: boolean;
  }): Promise<
    | { acao: 'nada' }
    | { acao: 'gravar'; ajuste: AjusteJornada; entrouNaFila: boolean }
    | { erro: string }
    | { indisponivel: true }
  > {
    if (!supabase) return { indisponivel: true };
    try {
      const { data, error } = await supabase.functions.invoke('apurar-ponto', {
        body: { modo: 'dia', ...pedido },
      });
      if (error) {
        /*
          Recusa de regra (403: sem alçada; 400) sobe como erro. O resto —
          função ausente, 500, rede — cai no caminho antigo.
        */
        const status = (error as { context?: { status?: number } }).context?.status;
        if (status === 403 || status === 400) {
          const corpo = await (error as { context?: Response }).context?.json?.().catch(() => null);
          return { erro: (corpo as { erro?: string } | null)?.erro || 'O servidor recusou a apuração.' };
        }
        console.warn('Apuração no servidor indisponível; seguindo pelo aparelho:', error.message);
        return { indisponivel: true };
      }
      const r = data as { acao: 'nada' | 'gravar'; ajuste?: AjusteJornada; entrouNaFila?: boolean };
      if (r?.acao === 'gravar' && r.ajuste) return { acao: 'gravar', ajuste: r.ajuste, entrouNaFila: !!r.entrouNaFila };
      if (r?.acao === 'nada') return { acao: 'nada' };
      return { indisponivel: true };
    } catch {
      return { indisponivel: true };
    }
  }

  /** Lança ou corrige a marcação do RH — aqui sobrescrever é o objetivo. */
  async salvarAjustePonto(
    registro: RegistroPonto
  ): Promise<{ sucesso: boolean; erro?: string }> {
    if (!supabase) return { sucesso: true };

    /**
     * NADA DE `upsert`. É a mesma razão explicada em `salvarAjuste`, e este
     * era o segundo lugar onde a armadilha estava armada.
     *
     * `upsert` vira `ON CONFLICT DO UPDATE` no banco, e para resolver o
     * conflito o Postgres precisa ENXERGAR a linha existente. Quem não
     * pode lê-la pela segurança por linha não recebe "sem permissão": a
     * gravação inteira falha, e a tela culpa a conexão.
     *
     * Foi exatamente o que aconteceu com a líder corrigindo a hora da
     * equipe. Insert comum, e o 23505 (chave repetida) vira a atualização
     * explícita.
     */
    const { error } = await supabase.from('registros_ponto').insert(paraLinhaPonto(registro));
    if (!error) return { sucesso: true };

    if (error.code !== '23505') {
      console.error('Falha ao ajustar a marcação no banco:', error.message);
      return { sucesso: false, erro: error.message };
    }

    const { error: erroUpdate } = await supabase
      .from('registros_ponto')
      .update(paraLinhaPonto(registro))
      .eq('colaborador_id', registro.colaboradorId)
      .eq('data', registro.data)
      .eq('tipo', registro.tipo);

    if (erroUpdate) {
      console.error('Falha ao reescrever a marcação:', erroUpdate.message);
      return { sucesso: false, erro: erroUpdate.message };
    }
    return { sucesso: true };
  }

  async removerRegistroPonto(id: string): Promise<{ sucesso: boolean; erro?: string }> {
    if (!supabase) return { sucesso: true };

    const { error } = await supabase.from('registros_ponto').delete().eq('id', id);
    if (error) {
      console.error('Falha ao remover a marcação no banco:', error.message);
      return { sucesso: false, erro: error.message };
    }
    return { sucesso: true };
  }

  /** Publica o código da loja. Só RH e Administrador passam pela RLS. */
  async salvarCodigoPonto(
    codigo: CodigoPontoLoja
  ): Promise<{ sucesso: boolean; erro?: string }> {
    if (!supabase) return { sucesso: true };

    const { error } = await supabase.from('codigos_ponto_loja').upsert(
      {
        loja: codigo.loja,
        codigo: codigo.codigo,
        atualizado_por_nome: codigo.atualizadoPorNome ?? null,
        atualizado_em: codigo.atualizadoEm,
      },
      { onConflict: 'loja' }
    );

    if (error) {
      console.error('Falha ao gravar o código de ponto no banco:', error.message);
      return { sucesso: false, erro: error.message };
    }
    return { sucesso: true };
  }

  /**
   * Cria no banco o código das lojas que ainda não têm um, sem tocar nos que
   * já existem. Chamado na entrada de quem pode escrever; para os demais a
   * RLS recusa em silêncio e eles seguem com o que veio do banco.
   */
  async provisionarCodigosPonto(
    codigos: CodigoPontoLoja[]
  ): Promise<boolean> {
    if (!supabase || codigos.length === 0) return false;

    const { error } = await supabase.from('codigos_ponto_loja').upsert(
      codigos.map((c) => ({
        loja: c.loja,
        codigo: c.codigo,
        atualizado_por_nome: c.atualizadoPorNome ?? null,
        atualizado_em: c.atualizadoEm,
      })),
      { onConflict: 'loja', ignoreDuplicates: true }
    );

    return !error;
  }

  // --- APURAÇÃO DO DIA E APROVAÇÃO ---

  /**
   * Traz as apurações que a pessoa pode ver. A RLS já filtra: a própria, e a
   * de quem ela responde.
   */
  /**
   * Grava a solicitação de ausência — abertura e decisão pelo mesmo caminho.
   *
   * Insert comum com atualização explícita no conflito, e não upsert: upsert
   * vira `ON CONFLICT`, que exige enxergar a linha em conflito e esbarra na
   * RLS. Mesma pedra de `salvarConversa` e de `salvarAjuste`.
   *
   * Se a decisão voltar recusada pelo banco, foi a RLS dizendo que quem
   * chamou não responde por aquela pessoa — e é isso que impede pular
   * etapas mesmo que a tela deixe.
   */
  async salvarJustificativa(
    justificativa: JustificativaAusencia
  ): Promise<{ sucesso: boolean; erro?: string }> {
    if (!supabase) return { sucesso: true };

    const linha = paraLinhaJustificativa(justificativa);
    const { error } = await supabase.from('justificativas_ausencia').insert(linha);
    if (!error) return { sucesso: true };

    if (error.code !== '23505') {
      console.error('Falha ao gravar a ausência:', error.message);
      return { sucesso: false, erro: error.message };
    }

    const { data, error: erroUpdate } = await supabase
      .from('justificativas_ausencia')
      .update(linha)
      .eq('id', justificativa.id)
      .select('id');

    if (erroUpdate) {
      console.error('Falha ao reescrever a ausência:', erroUpdate.message);
      return { sucesso: false, erro: erroUpdate.message };
    }
    // Update que não alterou nada é a RLS recusando em silêncio
    if (!data || data.length === 0) {
      return {
        sucesso: false,
        erro: 'Sem permissão no banco para decidir sobre esta solicitação.',
      };
    }
    return { sucesso: true };
  }

  async sincronizarJustificativas(): Promise<boolean> {
    if (!supabase) return false;

    // A RLS já filtra: volta o que é meu e o de quem eu aprovo
    const data = await buscarTodasAsLinhas<Record<string, unknown>>(
      () =>
        supabase!
          .from('justificativas_ausencia')
          .select('*')
          .order('data_inicio', { ascending: false }),
      'as ausências'
    );

    if (!data) return false;

    aplicarJustificativasDaNuvem(data.map(paraJustificativa));
    return true;
  }

  /**
   * Os feriados da rede.
   *
   * Sem cuidado com quem lê: feriado não é dado de ninguém, é o
   * calendário da empresa. Todo mundo precisa dele para o próprio
   * espelho fechar.
   */
  async sincronizarFeriados(): Promise<boolean> {
    if (!supabase) return false;

    const { data, error } = await supabase.from('feriados').select('*').order('data');
    if (error || !data) {
      console.error('Falha ao sincronizar os feriados:', error?.message);
      return false;
    }

    aplicarFeriadosDaNuvem(
      (data as Record<string, unknown>[]).map(paraFeriado)
    );
    this.avisar();
    return true;
  }

  /** Grava um ou vários de uma vez, sem upsert: ver salvarAjuste. */
  async salvarFeriados(lista: Feriado[]): Promise<{ sucesso: boolean; erro?: string }> {
    if (!supabase) return { sucesso: true };

    for (const f of lista) {
      const linha = {
        id: f.id,
        data: f.data,
        nome: f.nome,
        loja: f.loja ?? null,
        minutos_previstos: f.minutosPrevistos,
      };

      const { error } = await supabase.from('feriados').insert(linha);
      if (!error) continue;

      if (error.code !== '23505') {
        console.error('Falha ao gravar o feriado:', error.message);
        return { sucesso: false, erro: error.message };
      }

      const { error: erroUpdate } = await supabase
        .from('feriados')
        .update(linha)
        .eq('id', f.id);
      if (erroUpdate) {
        console.error('Falha ao reescrever o feriado:', erroUpdate.message);
        return { sucesso: false, erro: erroUpdate.message };
      }
    }
    return { sucesso: true };
  }

  async removerFeriado(id: string): Promise<{ sucesso: boolean; erro?: string }> {
    if (!supabase) return { sucesso: true };
    const { error } = await supabase.from('feriados').delete().eq('id', id);
    if (error) return { sucesso: false, erro: error.message };
    return { sucesso: true };
  }

  async sincronizarAjustes(): Promise<boolean> {
    if (!supabase) return false;

    const data = await buscarTodasAsLinhas<LinhaAjuste>(
      () => supabase!.from('ajustes_jornada').select('*').order('data', { ascending: false }),
      'as apurações'
    );

    if (!data) return false;

    localStorage.setItem(CHAVE_AJUSTES, JSON.stringify(data.map(paraAjuste)));

    /*
      O SALDO DE COMPENSAÇÃO DO SÁBADO vem junto: uma linha por pessoa por
      mês fechado, gravada pela apuração da madrugada. Sem a tabela
      (compensacao-sabado.sql não rodado) segue sem ela — o espelho conta
      o mês aberto sozinho, só não traz o saldo do mês anterior.
    */
    const { data: compensacoes, error: erroCompensacao } = await supabase
      .from('compensacao_sabado')
      .select('*');
    if (!erroCompensacao && compensacoes) {
      localStorage.setItem(
        CHAVE_COMPENSACAO,
        JSON.stringify((compensacoes as LinhaCompensacao[]).map(paraCompensacao))
      );
    }

    this.avisar();
    return true;
  }

  /**
   * Grava a apuração do dia.
   *
   * Nada de `upsert`: ele vira `ON CONFLICT` no banco, que exige enxergar a
   * linha em conflito — e foi assim que a gravação de conversa quebrou antes.
   * Aqui é insert comum e, se o dia já tiver apuração, uma atualização
   * explícita por colaborador e data.
   */
  async salvarAjuste(ajuste: AjusteJornada): Promise<{ sucesso: boolean; erro?: string }> {
    if (!supabase) return { sucesso: true };

    const { error } = await supabase.from('ajustes_jornada').insert(paraLinhaAjuste(ajuste));
    if (!error) return { sucesso: true };

    if (error.code !== '23505') {
      console.error('Falha ao gravar a apuração:', error.message);
      return { sucesso: false, erro: error.message };
    }

    const { error: erroUpdate } = await supabase
      .from('ajustes_jornada')
      .update(paraLinhaAjuste(ajuste))
      .eq('colaborador_id', ajuste.colaboradorId)
      .eq('data', ajuste.data);

    if (erroUpdate) {
      console.error('Falha ao reescrever a apuração:', erroUpdate.message);
      return { sucesso: false, erro: erroUpdate.message };
    }
    return { sucesso: true };
  }

  /**
   * Registra a decisão. A regra de quem pode decidir vive na RLS: se esta
   * chamada voltar sem alterar nada, foi o banco recusando — e é isso que
   * impede pular etapas mesmo que a tela deixe.
   */
  async decidirAjuste(
    id: string,
    estado: 'aprovado' | 'recusado',
    aprovador: { id: string; nome: string },
    observacao?: string
  ): Promise<{ sucesso: boolean; erro?: string }> {
    if (!supabase) return { sucesso: true };

    const { data, error } = await supabase
      .from('ajustes_jornada')
      .update({
        estado,
        aprovador_id: aprovador.id,
        aprovador_nome: aprovador.nome,
        decidido_em: new Date().toISOString(),
        observacao: observacao ?? null,
      })
      .eq('id', id)
      .select('id');

    if (error) {
      console.error('Falha ao registrar a decisão:', error.message);
      return { sucesso: false, erro: error.message };
    }

    // Sem linha alterada: a RLS recusou por falta de alçada
    if (!data || data.length === 0) {
      return {
        sucesso: false,
        erro: 'Você não responde por esta pessoa. A decisão cabe ao líder do setor ou ao gerente da loja.',
      };
    }

    return { sucesso: true };
  }

  // --- TEMPO REAL ---

  /** Ouve o que os outros aparelhos alteram e atualiza o cache. */
  iniciarTempoReal(): void {
    if (!supabase || this.canalAberto) return;
    this.canalAberto = true;

    supabase
      .channel('conecta-colaboradores')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'colaboradores' },
        () => {
          this.sincronizarColaboradores();
        }
      )
      .subscribe(acompanharCanal('colaboradores'));

    // O ponto é o dado que mais depende de chegar igual em todo aparelho:
    // a batida feita no celular tem que aparecer no computador na hora.
    supabase
      .channel('conecta-ponto')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'registros_ponto' },
        () => {
          this.sincronizarPonto();
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'codigos_ponto_loja' },
        () => {
          this.sincronizarPonto();
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'ajustes_jornada' },
        () => {
          this.sincronizarAjustes();
        }
      )
      /**
       * A DECISÃO SOBRE UMA AUSÊNCIA PRECISA CHEGAR NOS OUTROS APARELHOS.
       *
       * A tabela já estava publicada no realtime — o `.sql` até diz por
       * quê: "a decisão do gestor precisa chegar no aparelho de quem
       * pediu sem a pessoa ficar recarregando a tela". Só que ninguém
       * escutava. O banco falava sozinho.
       *
       * Foi o que o Elias viu: a Leigislaine recusou o atestado da Aline,
       * a recusa foi gravada, e na conta da Dani a solicitação continuou
       * pendente. Duas pessoas decidindo a mesma coisa, cada uma vendo um
       * estado diferente — e a segunda decisão sobrescreveria a primeira
       * sem ninguém notar.
       */
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'justificativas_ausencia' },
        () => {
          this.sincronizarJustificativas();
        }
      )
      .subscribe(acompanharCanal('ponto'));
  }
}

export const nuvem = new PonteNuvem();

/**
 * Preparação da aplicação no modo rede: recupera a sessão, preenche o cache e
 * liga o tempo real. No modo local não faz nada.
 */
export const iniciarNuvem = async (): Promise<void> => {
  if (!usandoNuvem()) return;

  /**
   * TUDO O QUE O APARELHO GUARDA, trazido de novo do banco.
   *
   * É a carga da abertura e é também a da reconexão (`reconexao.ts`): o
   * aviso que passou com o canal caído não volta, e a única forma de
   * saber o que mudou é perguntar de novo.
   */
  const carregarTudo = async (): Promise<void> => {
    if (!(await nuvem.temSessao())) return;
    const eu = await nuvem.obterMeuColaborador();
    if (eu) localStorage.setItem(CHAVE_COLABORADOR_ATUAL, eu.id);
    await nuvem.sincronizarColaboradores();
    await nuvem.sincronizarPonto();
    await nuvem.sincronizarAjustes();
    /**
     * FALTAVA AQUI, e o login tinha.
     *
     * Login acontece uma vez; abrir o aplicativo com a sessão salva
     * acontece todo dia. Sem esta linha, o cache de ausências de quem
     * não deslogava ficava parado no dia do último login — mostrando
     * como pendente o que já tinha sido decidido, e escondendo o que
     * chegou depois.
     */
    await nuvem.sincronizarJustificativas();
    await nuvem.sincronizarFeriados();
    await carregarComunicacao();
  };

  try {
    await carregarTudo();
    definirRecarga(carregarTudo);
    recarregarAoVoltar();
    nuvem.iniciarTempoReal();
    nuvemComunicacao.iniciarTempoReal();
  } catch (erro) {
    console.error('Falha ao iniciar a conexão com o banco:', erro);
  }
};
