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
  TipoAjuste,
  EstadoAjuste,
} from '../tipos';
import { supabase, usandoNuvem, loginParaEmailInterno, normalizarLogin } from './supabase';
import { nuvemComunicacao } from './nuvemComunicacao';

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
  ativo: linha.ativo,
  criadoEm: linha.criado_em,
});

/** A senha nunca vai para a tabela: quem guarda é a autenticação do Supabase. */
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
  carga_horaria_diaria_minutos: c.cargaHorariaDiariaMinutos ?? 480,
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
        if (msg.includes('password')) {
          return {
            sucesso: false,
            erro: 'A senha precisa ter ao menos 6 caracteres.',
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
      supabase.from('registros_ponto').select('*').order('horario'),
      supabase.from('codigos_ponto_loja').select('*'),
    ]);

    if (registros.error || !registros.data) {
      console.error('Falha ao sincronizar o ponto:', registros.error?.message);
      return false;
    }

    localStorage.setItem(
      CHAVE_REGISTROS_PONTO,
      JSON.stringify((registros.data as LinhaRegistroPonto[]).map(paraRegistroPonto))
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

    const { error } = await supabase
      .from('registros_ponto')
      .upsert(paraLinhaPonto(registro), { onConflict: 'colaborador_id,data,tipo' });

    if (error) {
      console.error('Falha ao ajustar a marcação no banco:', error.message);
      return { sucesso: false, erro: error.message };
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
  async sincronizarAjustes(): Promise<boolean> {
    if (!supabase) return false;

    const { data, error } = await supabase
      .from('ajustes_jornada')
      .select('*')
      .order('data', { ascending: false });

    if (error || !data) {
      console.error('Falha ao sincronizar as apurações:', error?.message);
      return false;
    }

    localStorage.setItem(
      CHAVE_AJUSTES,
      JSON.stringify((data as LinhaAjuste[]).map(paraAjuste))
    );
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
      await carregarComunicacao();
    }
    nuvem.iniciarTempoReal();
    nuvemComunicacao.iniciarTempoReal();
  } catch (erro) {
    console.error('Falha ao iniciar a conexão com o banco:', erro);
  }
};
