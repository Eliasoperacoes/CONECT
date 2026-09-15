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

import { Colaborador, Loja, NivelHierarquico, Setor } from '../tipos';
import { supabase, usandoNuvem, loginParaEmailInterno } from './supabase';

const CHAVE_COLABORADORES = 'conecta_v4_colaboradores';
const CHAVE_COLABORADOR_ATUAL = 'conecta_v4_colaborador_atual';

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
  presenca: string;
  visto_por_ultimo: string | null;
  ramal: string | null;
  telefone: string | null;
  email: string | null;
  matricula: string | null;
  departamento: string | null;
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
  departamento: linha.departamento || undefined,
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
  departamento: c.departamento ?? null,
  data_admissao: c.dataAdmissao ?? null,
  observacoes: c.observacoes ?? null,
  carga_horaria_diaria_minutos: c.cargaHorariaDiariaMinutos ?? 480,
  ativo: c.ativo,
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
      const ativacao = await supabase.auth.signUp({
        email,
        password: senha,
        options: { data: { login: login.trim() } },
      });

      if (ativacao.error) {
        const msg = ativacao.error.message.toLowerCase();

        // O Supabase mascara a mensagem do gatilho como 'Database error
        // saving new user'. Nesta tela a causa é sempre a mesma: o gatilho
        // recusou porque o login não está cadastrado na rede.
        if (
          msg.includes('não cadastrado') ||
          msg.includes('nao cadastrado') ||
          msg.includes('database error')
        ) {
          return { sucesso: false, erro: 'Login não cadastrado na rede. Procure o RH.' };
        }
        if (msg.includes('already registered') || msg.includes('already been registered')) {
          return { sucesso: false, erro: 'Login ou senha incorretos.' };
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
    }
    nuvem.iniciarTempoReal();
  } catch (erro) {
    console.error('Falha ao iniciar a conexão com o banco:', erro);
  }
};
