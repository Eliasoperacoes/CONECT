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
  MotivoForaDaJornada,
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
import { coletorDaMarcacao } from './aplicativo';
import { ehCaminhoDeFotoPerfil, esquecerAssinaturas, resolverCaminhos } from './anexos';
import { apagarSenhaGuardada, limparAoSair } from './limpezaDoAparelho';
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
  LinhaMarcacaoOriginal,
  comprovanteDaOriginal,
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

/**
 * UPDATE QUE NÃO ALTEROU LINHA NENHUMA (laudo de 13/10/2026, item 3).
 *
 * A RLS não dá erro quando barra um update: ele afeta zero linhas e volta
 * "sucesso". A alçada mora em dois lugares (organograma.ts na tela,
 * posso_decidir_jornada no banco); se discordarem, a tela dizia "aprovado"
 * ou "corrigido", gravava a auditoria, e o banco continuava como estava.
 * Quem grava decisão de ponto pede as linhas de volta e confere.
 */
/**
 * O DIRETÓRIO — as colunas da ficha que todo logado lê (nível 1 de
 * fichas-por-nivel.sql). A MESMA lista de `travar_colunas_da_ficha()`: há
 * teste conferindo. Pedir uma coluna fora dela é recusado pelo banco.
 */
const COLUNAS_DO_DIRETORIO =
  'id, nome, cargo, setor, loja, nivel, foto, presenca, visto_por_ultimo, ramal, responsavel_id, ativo, criado_em';

const RECUSA_SEM_LINHAS =
  'O banco não gravou: pela regra de alçada do banco, você não responde por esta pessoa. Nada foi alterado. Procure o RH.';
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
  // Só quando a ficha diz algo: sem a coluna no banco (antes de ponto-desde.sql)
  // a gravação inteira seria recusada. '' na ficha limpa a data.
  ...(c.pontoDesde !== undefined ? { ponto_desde: c.pontoDesde || null } : {}),
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
  // A antiga padrão não viaja: desde senha-de-ativacao-aleatoria.sql o
  // banco sorteia a senha de quem não tem uma individual (e, por garantia,
  // trata "123456" como "sem senha" se ela chegar)
  ...(c.senhaAtivacao && c.senhaAtivacao !== SENHA_PADRAO_PRIMEIRO_ACESSO ? { senha_ativacao: c.senhaAtivacao } : {}),
  // Mesma regra do campo acima: só viaja quando dito, senão cada alteração
  // de ramal reabriria a troca de senha de quem já definiu a dele
  ...(c.precisaTrocarSenha === undefined
    ? {}
    : { precisa_trocar_senha: c.precisaTrocarSenha }),
  ativo: c.ativo,
});

/**
 * A COLUNA DE CADA CAMPO que a pessoa pode mudar na própria ficha
 * (CAMPOS_PROPRIOS em bancoDados.ts) — para gravar só eles.
 */
const COLUNA_DO_CAMPO: Partial<Record<keyof Colaborador, string>> = {
  foto: 'foto',
  presenca: 'presenca',
  vistoPorUltimo: 'visto_por_ultimo',
  ramal: 'ramal',
  telefone: 'telefone',
  email: 'email',
  observacoes: 'observacoes',
};

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

  /**
   * A FICHA INTEIRA DE QUEM ESTÁ LOGADO (fichas-por-nivel.sql).
   *
   * A leitura direta da tabela só entrega o diretório, e filtrar pela
   * conta de login deixou de ser possível (a coluna é travada). Quem dá a
   * ficha da própria pessoa é `minha_ficha()`. Banco ainda sem a função
   * (SQL não rodado): a leitura de antes, para não haver janela quebrada.
   */
  private async lerMinhaFicha(): Promise<LinhaColaborador | null> {
    if (!supabase) return null;
    const { data, error } = await supabase.rpc('minha_ficha');
    if (!error) {
      const linhas = (data || []) as LinhaColaborador[];
      return linhas[0] ?? null;
    }
    if (error.code !== 'PGRST202' && error.code !== '42883') return null;
    const { data: sessao } = await supabase.auth.getUser();
    if (!sessao.user) return null;
    const { data: antiga } = await supabase
      .from('colaboradores')
      .select('*')
      .eq('auth_user_id', sessao.user.id)
      .maybeSingle();
    return (antiga as LinhaColaborador | null) ?? null;
  }

  /** Ainda está com a senha padrão? */
  async precisaTrocarSenha(): Promise<boolean> {
    if (!supabase) return false;
    const minha = await this.lerMinhaFicha();
    return !!(minha as { precisa_trocar_senha?: boolean } | null)?.precisa_trocar_senha;
  }

  /**
   * O CPF da própria pessoa, ou nulo se ainda não informou. Só ela e quem
   * cuida de pessoas leem (RLS de `cpf_colaborador`).
   *
   * `indisponivel`: não deu para saber — sem sessão ainda, sem cadastro
   * ligado à conta, ou a tabela ainda não existe. Aí ninguém é barrado.
   *
   * QUEM É "EU" SAI DO LOGIN, e não do colaborador que a tela tem na mão
   * (06/10/2026). Era pelo id da tela: com a sessão ainda chegando, ou a
   * tela com o cadastro guardado de antes, a consulta voltava vazia, o
   * app concluía "falta CPF", pedia de novo — e o banco recusava ("já
   * cadastrado"), prendendo a pessoa na tela. É a mesma pergunta em
   * qualquer aparelho: o CPF é pedido uma vez só, no web ou no celular.
   */
  async obterMeuCpf(): Promise<{ cpf: string | null; indisponivel?: boolean }> {
    if (!supabase) return { cpf: null, indisponivel: true };
    const eu = await this.lerMinhaFicha();
    if (!eu?.id) return { cpf: null, indisponivel: true };
    const { data, error } = await supabase
      .from('cpf_colaborador')
      .select('cpf')
      .eq('colaborador_id', eu.id)
      .maybeSingle();
    if (error) return { cpf: null, indisponivel: true };
    return { cpf: data?.cpf ?? null };
  }

  /**
   * Registra o próprio CPF — uma vez; o banco confere os dígitos.
   *
   * "JÁ ESTÁ CADASTRADO" (o próprio) É SUCESSO: a pessoa tem CPF, e é isso
   * que a tela quer saber. Tratado como erro, prendia quem já tinha
   * informado. O CPF de OUTRA pessoa continua recusado.
   */
  async registrarMeuCpf(cpf: string): Promise<{ sucesso: boolean; erro?: string }> {
    if (!supabase) return { sucesso: false, erro: 'Banco não configurado.' };
    const { error } = await supabase.rpc('registrar_meu_cpf', { p_cpf: cpf });
    if (error && error.code === 'P0001' && error.message.startsWith('Seu CPF já está cadastrado')) return { sucesso: true };
    if (error) return { sucesso: false, erro: error.code === 'P0001' ? error.message : 'Não foi possível salvar o CPF.' };
    return { sucesso: true };
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
    /*
      A senha nova é SORTEADA no banco (senha-de-ativacao-aleatoria.sql) e
      só existe nesta resposta e na lista dos cupons. Sem ela, não se
      inventa uma: a padrão "123456" não ativa mais ninguém.
    */
    if (!linha?.senha) return { sucesso: false, erro: 'O banco não devolveu a senha nova. Rode senha-de-ativacao-aleatoria.sql.' };
    return { sucesso: true, senha: linha.senha };
  }

  /**
   * Login e senha de primeiro acesso de quem ainda não entrou, para os
   * cupons. Só quem cuida de pessoas recebe (RLS de `senhas_de_ativacao`);
   * `null` se o banco não respondeu ou ainda não tem a função.
   */
  async senhasParaEntregar(): Promise<Array<{
    colaborador_id: string;
    nome: string;
    login: string;
    loja: string;
    setor: string;
    senha: string;
  }> | null> {
    if (!supabase) return null;
    const { data, error } = await supabase.rpc('senhas_para_entregar');
    if (error) return null;
    return data || [];
  }

  async sair(): Promise<void> {
    if (!supabase) return;
    await supabase.auth.signOut();
    localStorage.removeItem(CHAVE_COLABORADOR_ATUAL);
    // Ponto e conversa são pessoais: o cache não pode sobrar no aparelho para
    // quem entrar depois
    localStorage.removeItem(CHAVE_REGISTROS_PONTO);
    nuvemComunicacao.limparCache();
    esquecerAssinaturas();
    // E todo o resto do CONECTA — atestados, banco de horas, fichas, a
    // senha que ficava guardada —, menos as preferências do aparelho
    limparAoSair();
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
    const minha = await this.lerMinhaFicha();
    return minha ? paraColaborador(minha) : null;
  }

  // --- COLABORADORES ---

  /** Traz a lista do banco para o cache local. */
  /**
   * AS FICHAS QUE ESTA PESSOA PODE VER (fichas-por-nivel.sql).
   *
   * O diretório (nível 1) de todos, pela leitura direta — é só o que ela
   * entrega desde a trava por coluna. Os níveis 2 e 3 chegam de
   * `fichas_reservadas()`, e só de quem a pessoa pode ver: a própria, a
   * equipe que ela decide, e todos para o RH. Juntados aqui pelo id.
   *
   * Banco ainda sem a função (SQL não rodado): a leitura de antes. Outra
   * falha devolve `null` — a sincronização fica com o que já tinha, em vez
   * de gravar a ficha da pessoa sem turno nem jornada.
   */
  private async lerFichasVisiveis(): Promise<LinhaColaborador[] | null> {
    if (!supabase) return null;
    /*
      O "ponto desde" (ponto-desde.sql, 15/10/2026) vem junto — e, se o banco
      ainda não tem a coluna (42703) ou não a liberou (42501), a lista vem
      sem ele. Sem este segundo pedido, publicar o aplicativo antes do SQL
      deixaria a rede inteira sem a lista de colaboradores.
    */
    const lerDiretorio = async () => {
      const comPonto = await supabase!.from('colaboradores').select(`${COLUNAS_DO_DIRETORIO}, ponto_desde`).order('nome');
      if (!comPonto.error || !['42703', '42501'].includes(comPonto.error.code)) return comPonto;
      return supabase!.from('colaboradores').select(COLUNAS_DO_DIRETORIO).order('nome');
    };
    const [diretorio, reservadas] = await Promise.all([lerDiretorio(), supabase.rpc('fichas_reservadas')]);
    if (reservadas.error) {
      if (reservadas.error.code !== 'PGRST202' && reservadas.error.code !== '42883') return null;
      const { data, error } = await supabase.from('colaboradores').select('*').order('nome');
      return error || !data ? null : (data as LinhaColaborador[]);
    }
    if (diretorio.error || !diretorio.data) return null;
    const porId = new Map(((reservadas.data || []) as Array<{ id: string }>).map((r) => [r.id, r]));
    return (diretorio.data as unknown as LinhaColaborador[]).map((d) => ({ ...d, ...(porId.get(d.id) || {}) }) as LinhaColaborador);
  }

  async sincronizarColaboradores(): Promise<boolean> {
    if (!supabase) return false;

    const linhas = await this.lerFichasVisiveis();
    if (!linhas) return false;

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

    // Sem pedir o turno de volta na gravação: ele é coluna travada para a
    // leitura direta (fichas-por-nivel.sql). A conferência vem da própria
    // ficha, pela `minha_ficha()`, logo em seguida.
    const { error } = await supabase
      .from('colaboradores')
      .update({ turno, turno_confirmado_em: new Date().toISOString() })
      .eq('id', colaboradorId)
      .select('id');

    if (error) {
      console.error('Falha ao confirmar o turno:', error.message);
      return { sucesso: false, erro: await explicarRecusaDoBanco(error) };
    }
    const data = (await this.lerMinhaFicha()) as { turno?: string; turno_confirmado_em?: string } | null;
    if (!data || data.turno !== turno || !data.turno_confirmado_em) {
      return {
        sucesso: false,
        erro: 'O seu horário já foi definido. Para mudar, fale com o RH.',
      };
    }
    return { sucesso: true, confirmadoEm: data.turno_confirmado_em };
  }

  /**
   * ATUALIZA UMA FICHA QUE JÁ EXISTE — foto, presença, contato, e a edição
   * do RH e do organograma.
   *
   * NUNCA UPSERT AQUI (07/10/2026). Upsert é INSERT ... ON CONFLICT, e o
   * banco confere a regra de INSERT, que é só de quem cuida de pessoas: um
   * colaborador trocando a foto ouvia "new row violates row-level security
   * policy", e a presença dele nunca saía do aparelho. Com UPDATE vale a
   * regra de editar a própria linha, e a trava por coluna
   * (`apenas_rh_move_o_organograma`) devolve o que não é dele.
   *
   * UPDATE sem permissão não dá erro: afeta zero linhas. Por isso pede a
   * linha de volta e confere.
   */
  async atualizarFicha(
    colaborador: Colaborador,
    /**
     * SÓ ESTES CAMPOS DA FICHA (os de Colaborador), quando dito. Quem não é
     * RH manda só o que é dele: a linha inteira, vinda do cache do aparelho,
     * desfaria uma correção recente do RH no CNPJ ou na admissão a cada
     * mudança de presença.
     */
    apenas?: Array<keyof Colaborador>
  ): Promise<{ sucesso: boolean; erro?: string }> {
    if (!supabase) return { sucesso: true };
    const linha = paraLinha(colaborador) as Record<string, unknown>;
    const corpo = apenas
      ? Object.fromEntries(apenas.map((campo) => COLUNA_DO_CAMPO[campo]).filter(Boolean).map((coluna) => [coluna, linha[coluna!]]))
      : linha;
    // Nada da ficha mudou (só a senha, que não mora nesta tabela): não há o que gravar
    if (Object.keys(corpo).length === 0) return { sucesso: true };
    const { data, error } = await supabase
      .from('colaboradores')
      .update(corpo)
      .eq('id', colaborador.id)
      .select('id');
    if (error) {
      console.error('Falha ao atualizar a ficha no banco:', error.message);
      return { sucesso: false, erro: error.message };
    }
    if (!data || data.length === 0) {
      return { sucesso: false, erro: 'O banco não deixou gravar esta ficha (sem permissão).' };
    }
    return { sucesso: true };
  }

  /** Cria a ficha no banco (cadastro novo, só quem cuida de pessoas). Chamado após a gravação local. */
  async salvarColaborador(colaborador: Colaborador): Promise<{ sucesso: boolean; erro?: string }> {
    return this.gravarFicha(paraLinha(colaborador));
  }

  /**
   * GRAVA UMA FICHA DO RH: insert, e se ela já existe, update.
   *
   * Era `upsert`. Com a trava por coluna (fichas-por-nivel.sql) o banco o
   * recusa: no conflito, o Postgres precisa LER as colunas travadas da
   * linha existente — medido no Postgres local, "permission denied". O
   * update pede de volta só o id, que é do diretório, e confere a linha.
   */
  private async gravarFicha(linha: ReturnType<typeof paraLinha>): Promise<{ sucesso: boolean; erro?: string }> {
    if (!supabase) return { sucesso: true };
    const { error } = await supabase.from('colaboradores').insert(linha);
    if (!error) return { sucesso: true };
    const ehDoId = error.code === '23505' && /pkey/i.test(`${error.message} ${error.details ?? ''}`);
    if (error.code === '23505' && !ehDoId) {
      return { sucesso: false, erro: 'Há login repetido: algum já está cadastrado na rede com outra ficha.' };
    }
    if (!ehDoId) {
      console.error('Falha ao salvar colaborador no banco:', error.message);
      return { sucesso: false, erro: error.message };
    }
    const { data, error: erroUpdate } = await supabase
      .from('colaboradores')
      .update(linha)
      .eq('id', linha.id)
      .select('id');
    if (erroUpdate) {
      console.error('Falha ao reescrever colaborador no banco:', erroUpdate.message);
      return { sucesso: false, erro: erroUpdate.message };
    }
    if (!data || data.length === 0) return { sucesso: false, erro: 'O banco não deixou gravar esta ficha (sem permissão).' };
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

    /*
      Sem upsert (ver `gravarFicha`). As fichas NOVAS entram num insert só,
      como antes: um login repetido recusa o lote inteiro, e nada fica pela
      metade. As que já existem são atualizadas uma a uma, conferidas.
    */
    const { data: existentes, error: erroIds } = await supabase.from('colaboradores').select('id');
    if (erroIds || !existentes) return { sucesso: false, gravados: 0, erro: 'Não deu para ler as fichas atuais. Tente de novo.' };
    const jaExistem = new Set(existentes.map((e) => e.id as string));
    const novas = lista.filter((c) => !jaExistem.has(c.id));
    const atualizar = lista.filter((c) => jaExistem.has(c.id));

    if (novas.length > 0) {
      const { error } = await supabase.from('colaboradores').insert(novas.map(paraLinha));
      if (error) {
        console.error('Falha ao importar colaboradores:', error.message);
        // Login repetido é o erro esperado quando a planilha traz alguém que já existe
        if (error.code === '23505') {
          return { sucesso: false, gravados: 0, erro: 'Há login repetido: algum já está cadastrado na rede com outra ficha.' };
        }
        return { sucesso: false, gravados: 0, erro: error.message };
      }
    }

    let gravados = novas.length;
    for (const c of atualizar) {
      const r = await this.gravarFicha(paraLinha(c));
      if (!r.sucesso) {
        await this.sincronizarColaboradores();
        return { sucesso: false, gravados, erro: `${c.nome}: ${r.erro}` };
      }
      gravados++;
    }

    await this.sincronizarColaboradores();
    return { sucesso: true, gravados };
  }

  /** Fichas já cadastradas, para a planilha saber quem é novo e quem é atualização. */
  async obterColaboradores(): Promise<Colaborador[]> {
    if (!supabase) return [];
    // O RH (quem importa) recebe as fichas inteiras de fichas_reservadas()
    const linhas = await this.lerFichasVisiveis();
    return (linhas || []).map((l) => paraColaborador(l));
  }

  async removerColaborador(id: string): Promise<{ sucesso: boolean; erro?: string; temPonto?: boolean }> {
    if (!supabase) return { sucesso: true };

    const { error } = await supabase.from('colaboradores').delete().eq('id', id);
    if (error) {
      /*
        QUEM JÁ BATEU PONTO NÃO SE EXCLUI (marcacao-original.sql): a marcação
        original é guardada por lei, e a chave dela é RESTRICT. O banco diz
        isso em linguagem de banco; a tela diz o que fazer.
      */
      if (error.code === '23503' && error.message.includes('marcacoes_originais')) {
        return {
          sucesso: false,
          temPonto: true,
          erro: 'Este colaborador tem marcações de ponto e não pode ser excluído: a lei exige guardá-las. Desative o cadastro.',
        };
      }
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
   * O AFD DE UM ESTABELECIMENTO NUM PERÍODO (gerar_afd,
   * arquivo-fonte-de-dados.sql): as linhas já no leiaute, na ordem do
   * arquivo. Só quem cuida de pessoas; a recusa do banco vem como está.
   */
  async gerarAfd(cnpj: string, inicio: string, fim: string): Promise<{ sucesso: boolean; linhas?: string[]; erro?: string }> {
    if (!supabase) return { sucesso: false, erro: 'Sem conexão com o banco.' };
    const { data, error } = await supabase.rpc('gerar_afd', { p_cnpj: cnpj, p_inicio: inicio, p_fim: fim });
    if (error) {
      if (error.code === 'PGRST202' || error.code === '42883') {
        return { sucesso: false, erro: 'A geração do AFD ainda não foi ligada no banco (arquivo-fonte-de-dados.sql).' };
      }
      if (error.code === 'P0001') return { sucesso: false, erro: error.message };
      console.error('Falha ao gerar o AFD:', error.message);
      return { sucesso: false, erro: await explicarRecusaDoBanco(error) };
    }
    const linhas = ((data || []) as Array<{ ordem: number; linha: string }>)
      .sort((a, b) => a.ordem - b.ordem)
      .map((l) => l.linha);
    return { sucesso: true, linhas };
  }

  /**
   * As marcações originais DA PRÓPRIA PESSOA desde um instante — a fonte
   * dos comprovantes que ela baixa (art. 80, III). A RLS deixa o RH ler
   * todas: o filtro pela pessoa é daqui. `null` se o banco não respondeu.
   */
  async listarMinhasOriginais(colaboradorId: string, desdeIso: string): Promise<LinhaMarcacaoOriginal[] | null> {
    if (!supabase) return null;
    const { data, error } = await supabase
      .from('marcacoes_originais')
      .select('*')
      .eq('colaborador_id', colaboradorId)
      .gte('registrado_em', desdeIso)
      .order('registrado_em', { ascending: false });
    if (error) return null;
    return (data || []) as LinhaMarcacaoOriginal[];
  }

  /**
   * Uma original pelo par (CNPJ, NSR) — o toque no aviso do comprovante de
   * uma marcação fora da jornada. A RLS só a entrega a quem pode lê-la;
   * `null` se não veio.
   */
  async obterOriginal(cnpj: string, nsr: number): Promise<LinhaMarcacaoOriginal | null> {
    if (!supabase) return null;
    const { data, error } = await supabase
      .from('marcacoes_originais')
      .select('*')
      .eq('cnpj_empregador', cnpj)
      .eq('nsr', nsr)
      .maybeSingle();
    if (error || !data) return null;
    return data as LinhaMarcacaoOriginal;
  }

  /**
   * O número do REP-P no INPI, para o comprovante (art. 79, VII) — só o
   * número, a qualquer sessão (comprovante-inpi.sql). `null` enquanto o
   * registro não sai, ou sem a função no banco.
   */
  async inpiDoRep(): Promise<string | null> {
    if (!supabase) return null;
    const { data, error } = await supabase.rpc('inpi_do_rep');
    if (error) return null;
    return typeof data === 'string' && data ? data : null;
  }

  /**
   * O QUE O AEJ PRECISA E O CACHE DO PONTO NÃO TEM: as originais do
   * estabelecimento no período, o que o tratamento decidiu de cada uma, o
   * CPF de quem aparece e a identificação do programa. Só quem cuida de
   * pessoas lê as quatro (RLS); para os outros, volta o erro.
   */
  async dadosDoAej(
    cnpj: string,
    inicio: string,
    fim: string
  ): Promise<
    | {
        sucesso: true;
        originais: LinhaMarcacaoOriginal[];
        tratamentos: Array<{ nsr: number | string; decisao: 'incluida' | 'desconsiderada'; registro_id: string | null; justificativa: string }>;
        cpfs: Array<{ colaborador_id: string; cpf: string }>;
        identificacao: {
          inpi: string | null;
          desenvolvedor_tipo: '1' | '2';
          desenvolvedor_documento: string;
          desenvolvedor_nome: string;
          desenvolvedor_email: string | null;
          programa_nome: string;
          programa_versao: string;
        } | null;
      }
    | { sucesso: false; erro: string }
  > {
    if (!supabase) return { sucesso: false, erro: 'Sem conexão com o banco.' };
    const [originais, tratamentos, cpfs, identificacao] = await Promise.all([
      buscarTodasAsLinhas<LinhaMarcacaoOriginal>(
        () =>
          supabase!
            .from('marcacoes_originais')
            .select('*')
            .eq('cnpj_empregador', cnpj)
            .gte('data', inicio)
            .lte('data', fim)
            .order('nsr'),
        'as marcações originais'
      ),
      buscarTodasAsLinhas<{ nsr: number | string; decisao: 'incluida' | 'desconsiderada'; registro_id: string | null; justificativa: string }>(
        () => supabase!.from('tratamento_marcacao').select('nsr, decisao, registro_id, justificativa').eq('cnpj', cnpj).order('nsr'),
        'o tratamento das marcações'
      ),
      buscarTodasAsLinhas<{ colaborador_id: string; cpf: string }>(
        () => supabase!.from('cpf_colaborador').select('colaborador_id, cpf').order('colaborador_id'),
        'os CPFs'
      ),
      supabase.from('identificacao_rep').select('*').maybeSingle(),
    ]);
    if (!originais || !tratamentos || !cpfs || identificacao.error) {
      return { sucesso: false, erro: 'Não deu para ler as marcações deste estabelecimento. Tente de novo.' };
    }
    return { sucesso: true, originais, tratamentos, cpfs, identificacao: identificacao.data };
  }

  /**
   * OS ESTABELECIMENTOS — os CNPJs em que as pessoas são registradas
   * (registrador-por-estabelecimento.sql). Vazia sem a tabela ou sem
   * cadastro: quem chama (estabelecimentos.ts) volta à regra de antes.
   */
  async listarEstabelecimentos(): Promise<Array<{ cnpj: string; razao_social: string; local: string }>> {
    if (!supabase) return [];
    const { data, error } = await supabase.from('estabelecimentos').select('cnpj, razao_social, local').order('razao_social');
    if (error || !data) return [];
    return data as Array<{ cnpj: string; razao_social: string; local: string }>;
  }

  /**
   * AS MARCAÇÕES FORA DA JORNADA QUE ESPERAM DECISÃO, das pessoas que quem
   * chama pode decidir (marcacoes_para_tratar, tratamento-da-marcacao.sql).
   * `null`: o SQL ainda não rodou, ou o banco não respondeu.
   */
  async listarMarcacoesParaTratar(): Promise<LinhaMarcacaoOriginal[] | null> {
    if (!supabase) return null;
    const { data, error } = await supabase.rpc('marcacoes_para_tratar');
    if (error) {
      if (error.code !== 'PGRST202' && error.code !== '42883') {
        console.error('Falha ao ler as marcações fora da jornada:', error.message);
      }
      return null;
    }
    return (data || []) as LinhaMarcacaoOriginal[];
  }

  /**
   * A DECISÃO sobre uma marcação fora da jornada (tratar_marcacao). A chave
   * é o par (CNPJ, NSR): o NSR é por estabelecimento
   * (registrador-por-estabelecimento.sql). Banco ainda sem o CNPJ na
   * função: repete só com o NSR, como antes.
   */
  async tratarMarcacao(dados: {
    cnpj: string;
    nsr: number;
    decisao: 'incluida' | 'desconsiderada';
    tipo: TipoMarcacao | null;
    justificativa: string;
  }): Promise<{ sucesso: boolean; erro?: string }> {
    if (!supabase) return { sucesso: false, erro: 'Sem conexão com o banco.' };
    const base = {
      p_nsr: dados.nsr,
      p_decisao: dados.decisao,
      p_tipo: dados.tipo,
      p_justificativa: dados.justificativa,
    };
    let { error } = await supabase.rpc('tratar_marcacao', { ...base, p_cnpj: dados.cnpj });
    if (error && (error.code === 'PGRST202' || error.code === '42883')) {
      ({ error } = await supabase.rpc('tratar_marcacao', base));
    }
    if (error) {
      // A recusa escrita pelo banco ("Já existe essa marcação neste dia...") vai como está
      if (error.code === 'P0001') return { sucesso: false, erro: error.message };
      console.error('Falha ao tratar a marcação:', error.message);
      return { sucesso: false, erro: await explicarRecusaDoBanco(error) };
    }
    return { sucesso: true };
  }

  /**
   * A BATIDA QUE NUNCA É RECUSADA (registrar_marcacao, marcacao-original.sql).
   *
   * A Portaria 671/2021 proíbe restringir a marcação. O banco registra a
   * original SEMPRE que o código da loja confere; a que não cabe na
   * jornada (domingo, quinta batida, fora de ordem, repetida) volta com
   * `foraDaJornada` e o comprovante dela, para o RH tratar.
   *
   * `semFuncao`: o SQL ainda não rodou — quem chama volta à `baterPonto`.
   */
  async registrarMarcacao(dados: {
    codigo: string;
    loja: string | null;
    tipo: TipoMarcacao | null;
  }): Promise<{
    sucesso: boolean;
    registro?: RegistroPonto;
    comprovante?: RegistroPonto;
    foraDaJornada?: MotivoForaDaJornada;
    erro?: string;
    duplicado?: boolean;
    semFuncao?: boolean;
  }> {
    if (!supabase) return { sucesso: false, semFuncao: true };
    const base = { p_codigo: dados.codigo, p_loja: dados.loja, p_tipo: dados.tipo };
    /*
      O COLETOR (Anexo IX, 6.5): "01" no aplicativo, "02" no navegador.
      Banco ainda sem o parâmetro (registrador-por-estabelecimento.sql não
      rodado): repete sem ele, e a batida segue sem recusa do mesmo jeito.
    */
    let { data, error } = await supabase.rpc('registrar_marcacao', { ...base, p_coletor: coletorDaMarcacao() });
    if (error && (error.code === 'PGRST202' || error.code === '42883')) {
      ({ data, error } = await supabase.rpc('registrar_marcacao', base));
    }
    if (error) {
      if (error.code === 'PGRST202' || error.code === '42883') return { sucesso: false, semFuncao: true };
      // Duas batidas do mesmo passo no mesmo instante (dois aparelhos): a outra entrou
      if (error.code === '23505') return { sucesso: false, duplicado: true };
      if (error.code === 'P0001') return { sucesso: false, erro: error.message };
      console.error('Falha ao registrar a marcação no banco:', error.message);
      return { sucesso: false, erro: await explicarRecusaDoBanco(error) };
    }
    const resposta = data as {
      registro: LinhaRegistroPonto | null;
      original: LinhaMarcacaoOriginal;
      fora_da_jornada: MotivoForaDaJornada | null;
    };
    if (resposta.registro) {
      return { sucesso: true, registro: paraRegistroPonto(resposta.registro) };
    }
    return {
      sucesso: true,
      comprovante: comprovanteDaOriginal(resposta.original),
      foraDaJornada: resposta.fora_da_jornada ?? undefined,
    };
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

    const { data: reescritas, error: erroUpdate } = await supabase
      .from('registros_ponto')
      .update(paraLinhaPonto(registro))
      .eq('colaborador_id', registro.colaboradorId)
      .eq('data', registro.data)
      .eq('tipo', registro.tipo)
      .select('id');

    if (erroUpdate) {
      console.error('Falha ao reescrever a marcação:', erroUpdate.message);
      return { sucesso: false, erro: erroUpdate.message };
    }
    // Zero linhas é RECUSA, não sucesso: a regra do banco barrou sem erro
    if (!reescritas || reescritas.length === 0) return { sucesso: false, erro: RECUSA_SEM_LINHAS };
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

    const { data: reescritas, error: erroUpdate } = await supabase
      .from('ajustes_jornada')
      .update(paraLinhaAjuste(ajuste))
      .eq('colaborador_id', ajuste.colaboradorId)
      .eq('data', ajuste.data)
      .select('id');

    if (erroUpdate) {
      console.error('Falha ao reescrever a apuração:', erroUpdate.message);
      return { sucesso: false, erro: erroUpdate.message };
    }
    // Zero linhas é RECUSA, não sucesso: a regra do banco barrou sem erro
    if (!reescritas || reescritas.length === 0) return { sucesso: false, erro: RECUSA_SEM_LINHAS };
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

    /*
      O CANAL NÃO TRANSMITE MAIS A FICHA (fichas-por-nivel.sql): mandava a
      linha inteira de quem mudasse qualquer coisa a todo aparelho. Depois
      do SQL, `colaboradores` sai do canal e entra `colaboradores_versao`,
      que carrega só um número. Ao vê-lo mudar, o aparelho busca de novo o
      que pode ver. Canal à parte: antes do SQL a tabela não existe, e a
      falha dele não derruba o de cima.
    */
    supabase
      .channel('conecta-colaboradores-versao')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'colaboradores_versao' },
        () => {
          this.sincronizarColaboradores();
        }
      )
      .subscribe(acompanharCanal('colaboradores_versao'));

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

  // A senha de login que versões antigas gravavam no aparelho sai na
  // primeira abertura desta (limpezaDoAparelho.ts)
  apagarSenhaGuardada();

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
