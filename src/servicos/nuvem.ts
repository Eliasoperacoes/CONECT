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
} from '../tipos';
import { supabase, usandoNuvem, loginParaEmailInterno, normalizarLogin } from './supabase';
import { nuvemComunicacao } from './nuvemComunicacao';
/**
 * A folha, e não `justificativas`: aquele arquivo importa `ponto`, que
 * importa este — o ciclo fechava e o aplicativo não abria
 * ("Cannot access 'nuvem' before initialization", tela branca).
 */
import { aplicarJustificativasDaNuvem } from './justificativasCache';
import { aplicarFeriadosDaNuvem } from './feriadosCache';
import { buscarTodasAsLinhas } from './paginacao';

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

/** Linha da tabela `colaboradores`, como ela vem do banco. */
interface LinhaColaborador {
  id: string;
  nome: string;
  login: string;
  cargo: string;
  setor: string;
  loja: string;
  nivel: number;
  foto: string | null;
  cnpj: string | null;
  presenca: string;
  visto_por_ultimo: string | null;
  ramal: string | null;
  telefone: string | null;
  email: string | null;
  matricula: string | null;
  departamento: string | null;
  responsavel_id: string | null;
  data_admissao: string | null;
  observacoes: string | null;
  carga_horaria_diaria_minutos: number;
  turno: string | null;
  carga_semanal_minutos: number | null;
  trabalha_sabado: boolean | null;
  tem_intervalo: boolean | null;
  ativo: boolean;
  criado_em: string;
}

const paraColaborador = (linha: LinhaColaborador): Colaborador => ({
  id: linha.id,
  nome: linha.nome,
  login: linha.login,
  cargo: linha.cargo,
  setor: linha.setor as Setor,
  loja: linha.loja as Loja,
  nivel: linha.nivel as NivelHierarquico,
  foto: linha.foto || '/logo-malachias.svg',
  presenca: (linha.presenca || 'desconectado') as Colaborador['presenca'],
  vistoPorUltimo: linha.visto_por_ultimo || 'Agora',
  ramal: linha.ramal || undefined,
  telefone: linha.telefone || undefined,
  email: linha.email || undefined,
  matricula: linha.matricula || undefined,
  cnpj: linha.cnpj || undefined,
  departamento: linha.departamento || undefined,
  responsavelId: linha.responsavel_id || undefined,
  dataAdmissao: linha.data_admissao || undefined,
  observacoes: linha.observacoes || undefined,
  cargaHorariaDiariaMinutos: linha.carga_horaria_diaria_minutos,
  turno: linha.turno || undefined,
  /**
   * A jornada da pessoa. Vazio no banco quer dizer "vale o padrão do
   * setor" — e não zero: uma carga semanal de zero minutos faria a pessoa
   * fechar todo ciclo com crédito da semana inteira.
   */
  cargaSemanalMinutos: linha.carga_semanal_minutos ?? undefined,
  trabalhaSabado: linha.trabalha_sabado ?? undefined,
  temIntervalo: linha.tem_intervalo ?? undefined,
  // Não volta do banco: é segredo de entrega, e a tela do RH mostra a
  // partir do que ela própria guardou
  senhaAtivacao: undefined,
  ativo: linha.ativo,
  criadoEm: linha.criado_em,
});

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
  carga_horaria_diaria_minutos: c.cargaHorariaDiariaMinutos ?? 490,
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

/** Linha da tabela `registros_ponto`, como ela vem do banco. */
interface LinhaRegistroPonto {
  id: string;
  colaborador_id: string;
  data: string;
  tipo: string;
  horario: string;
  hora_formatada: string;
  metodo: string;
  loja: string;
  ajustado_por_id: string | null;
  ajustado_por_nome: string | null;
  justificativa: string | null;
  criado_em: string;
}

const paraRegistroPonto = (linha: LinhaRegistroPonto): RegistroPonto => ({
  id: linha.id,
  colaboradorId: linha.colaborador_id,
  data: linha.data,
  tipo: linha.tipo as TipoMarcacao,
  horario: linha.horario,
  horaFormatada: linha.hora_formatada,
  metodo: linha.metodo as MetodoMarcacao,
  loja: linha.loja as Loja,
  criadoEm: linha.criado_em,
  ajustadoPorId: linha.ajustado_por_id || undefined,
  ajustadoPorNome: linha.ajustado_por_nome || undefined,
  justificativa: linha.justificativa || undefined,
});

const paraLinhaPonto = (r: RegistroPonto) => ({
  id: r.id,
  colaborador_id: r.colaboradorId,
  data: r.data,
  tipo: r.tipo,
  horario: r.horario,
  hora_formatada: r.horaFormatada,
  metodo: r.metodo,
  loja: r.loja,
  ajustado_por_id: r.ajustadoPorId ?? null,
  ajustado_por_nome: r.ajustadoPorNome ?? null,
  justificativa: r.justificativa ?? null,
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

/** Linha da tabela `ajustes_jornada`. */
interface LinhaAjuste {
  id: string;
  colaborador_id: string;
  data: string;
  tipo: string;
  minutos: number;
  minutos_trabalhados: number;
  minutos_previstos: number;
  estado: string;
  aprovador_id: string | null;
  aprovador_nome: string | null;
  decidido_em: string | null;
  observacao: string | null;
  criado_em: string;
}

const paraAjuste = (linha: LinhaAjuste): AjusteJornada => ({
  id: linha.id,
  colaboradorId: linha.colaborador_id,
  data: linha.data,
  tipo: linha.tipo as TipoAjuste,
  minutos: linha.minutos,
  minutosTrabalhados: linha.minutos_trabalhados,
  minutosPrevistos: linha.minutos_previstos,
  estado: linha.estado as EstadoAjuste,
  aprovadorId: linha.aprovador_id || undefined,
  aprovadorNome: linha.aprovador_nome || undefined,
  decididoEm: linha.decidido_em || undefined,
  observacao: linha.observacao || undefined,
  criadoEm: linha.criado_em,
});

const paraLinhaAjuste = (a: AjusteJornada) => ({
  id: a.id,
  colaborador_id: a.colaboradorId,
  data: a.data,
  tipo: a.tipo,
  minutos: a.minutos,
  minutos_trabalhados: a.minutosTrabalhados,
  minutos_previstos: a.minutosPrevistos,
  estado: a.estado,
  aprovador_id: a.aprovadorId ?? null,
  aprovador_nome: a.aprovadorNome ?? null,
  decidido_em: a.decididoEm ?? null,
  observacao: a.observacao ?? null,
  origem: a.origem ?? 'pendencia',
  motivo_colaborador: a.motivoColaborador ?? null,
  anexo_caminho: a.anexoCaminho ?? null,
});

/**
 * Linha da tabela `justificativas_ausencia`.
 *
 * Atestado, falta e comparecimento: o que não passa por batida nenhuma e o
 * fluxo automático da jornada nunca enxerga.
 */
const paraLinhaJustificativa = (j: JustificativaAusencia) => ({
  id: j.id,
  colaborador_id: j.colaboradorId,
  data_inicio: j.dataInicio,
  data_fim: j.dataFim,
  tipo: j.tipo,
  observacao: j.observacao ?? null,
  anexo_caminho: j.anexoCaminho ?? null,
  anexo_nome: j.anexoNome ?? null,
  estado: j.estado,
  aprovador_id: j.aprovadorId ?? null,
  aprovador_nome: j.aprovadorNome ?? null,
  decidido_em: j.decididoEm ?? null,
  motivo_recusa: j.motivoRecusa ?? null,
});

const paraJustificativa = (linha: Record<string, unknown>): JustificativaAusencia => ({
  id: String(linha.id),
  colaboradorId: String(linha.colaborador_id),
  dataInicio: String(linha.data_inicio),
  dataFim: String(linha.data_fim),
  tipo: linha.tipo as JustificativaAusencia['tipo'],
  observacao: (linha.observacao as string) || undefined,
  anexoCaminho: (linha.anexo_caminho as string) || undefined,
  anexoNome: (linha.anexo_nome as string) || undefined,
  estado: linha.estado as JustificativaAusencia['estado'],
  aprovadorId: (linha.aprovador_id as string) || undefined,
  aprovadorNome: (linha.aprovador_nome as string) || undefined,
  decididoEm: (linha.decidido_em as string) || undefined,
  motivoRecusa: (linha.motivo_recusa as string) || undefined,
  criadoEm: String(linha.criado_em),
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

    this.gravarCacheColaboradores((data as LinhaColaborador[]).map(paraColaborador));
    this.avisar();
    return true;
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
    return (data as LinhaColaborador[]).map(paraColaborador);
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
  async sincronizarPonto(): Promise<boolean> {
    if (!supabase) return false;

    const [registros, codigos] = await Promise.all([
      buscarTodasAsLinhas<LinhaRegistroPonto>(
        () => supabase!.from('registros_ponto').select('*').order('horario'),
        'as marcações de ponto'
      ),
      supabase.from('codigos_ponto_loja').select('*'),
    ]);

    if (!registros) return false;

    localStorage.setItem(
      CHAVE_REGISTROS_PONTO,
      JSON.stringify(registros.map(paraRegistroPonto))
    );

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
      return { sucesso: false, erro: error.message };
    }
    return { sucesso: true };
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
      (data as Record<string, unknown>[]).map((l) => ({
        id: String(l.id),
        data: String(l.data),
        nome: String(l.nome),
        loja: (l.loja as any) || undefined,
        minutosPrevistos: Number(l.minutos_previstos) || 0,
        criadoEm: String(l.criado_em),
      }))
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
      .subscribe();

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
      .subscribe();
  }
}

export const nuvem = new PonteNuvem();

/**
 * Preparação da aplicação no modo rede: recupera a sessão, preenche o cache e
 * liga o tempo real. No modo local não faz nada.
 */
export const iniciarNuvem = async (): Promise<void> => {
  if (!usandoNuvem()) return;

  try {
    const logado = await nuvem.temSessao();
    if (logado) {
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
    }
    nuvem.iniciarTempoReal();
    nuvemComunicacao.iniciarTempoReal();
  } catch (erro) {
    console.error('Falha ao iniciar a conexão com o banco:', erro);
  }
};
