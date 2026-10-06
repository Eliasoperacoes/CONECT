import React, { useEffect, useState } from 'react';
import { useVoltar } from '../servicos/voltar';
import { IndicadorNuvem } from './IndicadorNuvem';
import { NIVEL_TI } from '../tipos';
import {
  Bell,
  Moon,
  BellOff,
  LogOut,
  Users,
  Check,
  ShieldCheck,
  IdCard,
  CircleDot,
  Settings,
  Sliders,
  Building2,
  Phone,
  Camera,
  Fingerprint,
} from 'lucide-react';
import { biometriaDisponivel, confirmarIdentidade, gravarPreferencia, lerPreferencia } from '../servicos/desbloqueio';
import { Colaborador, EstadoPresenca, ROTULO_PRESENCA } from '../tipos';
import { bancoDados, FOTO_PADRAO_LOGO_EMPRESA } from '../servicos/bancoDados';
import {
  PreferenciaTema,
  definirTema,
  obterTemaSalvo,
  ROTULO_TEMA,
} from '../servicos/tema';
import {
  PermissaoAviso,
  definirSom,
  pedirPermissaoDeAviso,
  permissaoDeAviso,
  prepararSom,
  somLigado,
  testarAvisos,
  tocarAvisoDeMensagem,
} from '../servicos/notificacoes';
import { FotoPresenca } from './FotoPresenca';
import { FichaColaborador } from './FichaColaborador';
import { ModalAlterarFoto } from './ModalAlterarFoto';
import { versaoLegivel } from '../servicos/versao';
import { MeuRH } from './MeuRH';
import { SecaoRecolhivel } from './SecaoRecolhivel';

interface PropsAbaEu {
  colaboradorAtual: Colaborador;
  aoTrocarColaborador: (id: string) => void;
  aoSair?: () => void;
  aoAbrirAdmin?: () => void;
  /**
   * Sem o Meu RH. No computador ele se divide pelos assuntos da barra
   * lateral (Ponto, Folgas e férias, Documentos); repeti-lo no perfil seria
   * uma segunda porta para as mesmas folhas.
   */
  semMeuRH?: boolean;
}

export const AbaEu: React.FC<PropsAbaEu> = ({
  colaboradorAtual,
  aoTrocarColaborador,
  aoSair,
  aoAbrirAdmin,
  semMeuRH,
}) => {
  const [somAtivo, setSomAtivo] = useState(true);
  const [temaEscolhido, setTemaEscolhido] = useState<PreferenciaTema>(obterTemaSalvo);
  const [permissao, setPermissao] = useState<PermissaoAviso>(permissaoDeAviso);
  const [comSom, setComSom] = useState<boolean>(somLigado);
  // A digital: a linha só aparece onde funciona
  const [temBiometria, setTemBiometria] = useState(false);
  const [biometriaLigada, setBiometriaLigada] = useState(() => lerPreferencia() === 'ligada');
  useEffect(() => {
    let vivo = true;
    biometriaDisponivel().then((tem) => vivo && setTemBiometria(tem));
    return () => {
      vivo = false;
    };
  }, []);
  const [resultadoTeste, setResultadoTeste] = useState<string | null>(null);
  const [modalTrocaAberto, setModalTrocaAberto] = useState(false);
  const [modalFotoAberto, setModalFotoAberto] = useState(false);
  useVoltar(modalTrocaAberto, () => setModalTrocaAberto(false));

  const todosColaboradores = bancoDados.obterColaboradores();
  const ehAdmin = colaboradorAtual.nivel >= NIVEL_TI;

  // Aplica o tema escolhido e guarda a preferência no dispositivo
  const aplicarTema = (novoTema: PreferenciaTema) => {
    setTemaEscolhido(novoTema);
    definirTema(novoTema);
  };

  const mudarPresenca = (novaPresenca: EstadoPresenca) => {
    bancoDados.atualizarPresenca(colaboradorAtual.id, novaPresenca);
  };

  const lidarLogout = () => {
    bancoDados.deslogar();
    if (aoSair) {
      aoSair();
    }
  };

  return (
    /*
      NO COMPUTADOR, DUAS COLUNAS: quem a pessoa é e os ajustes à esquerda,
      estreita; o Meu RH, que é o que se veio ver, ocupando o resto. Era uma
      coluna de 900px no meio da tela, com as laterais vazias.

      No celular nada muda: as classes de coluna só valem a partir de `lg`,
      e a ordem do código é a ordem da tela pequena.
    */
    <div
      id="aba-eu"
      className="flex-1 overflow-y-auto bg-[var(--c-canvas)] pb-24 md:flex-none md:overflow-visible lg:grid lg:grid-cols-[360px_minmax(0,1fr)] lg:grid-rows-[auto_1fr] lg:gap-x-6 lg:gap-y-4 lg:items-start lg:px-6 lg:pt-4"
    >
      {/* 1. Perfil */}
      <div className="bg-[var(--c-superficie)] border-b border-[var(--c-borda)] p-5 flex items-center gap-4 lg:col-start-1 lg:row-start-1 lg:border lg:rounded-2xl">
        <div className="relative group/avatar flex-shrink-0">
          <button
            type="button"
            id="botao-avatar-perfil-eu"
            onClick={() => setModalFotoAberto(true)}
            className={`relative w-16 h-16 rounded-full overflow-hidden bg-white flex items-center justify-center cursor-pointer shadow-sm transition-all text-left ring-2 ring-offset-2 ring-offset-[var(--c-superficie)] ${
              colaboradorAtual.presenca === 'disponivel'
                ? 'ring-emerald-500'
                : colaboradorAtual.presenca === 'ocupado'
                ? 'ring-amber-500'
                : colaboradorAtual.presenca === 'ausente'
                ? 'ring-slate-400'
                : 'ring-[var(--c-borda-forte)]'
            }`}
            title="Clique para alterar a foto do seu perfil"
          >
            <img
              src={colaboradorAtual.foto || FOTO_PADRAO_LOGO_EMPRESA}
              alt={colaboradorAtual.nome}
              className="w-full h-full object-cover"
              referrerPolicy="no-referrer"
            />
            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/avatar:opacity-100 transition-opacity flex items-center justify-center text-white">
              <Camera className="w-5 h-5" />
            </div>
          </button>
          <button
            type="button"
            onClick={() => setModalFotoAberto(true)}
            className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-blue-600 text-white flex items-center justify-center shadow-md border-2 border-[var(--c-superficie)] hover:scale-110 active:scale-95 transition-all"
            title="Alterar foto"
          >
            <Camera className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-bold text-[var(--c-texto)] truncate">
              {colaboradorAtual.nome}
            </h2>
            {colaboradorAtual.nivel >= NIVEL_TI && (
              <span className="text-[10px] bg-indigo-500/10 text-indigo-600 font-bold px-1.5 py-0.5 rounded border border-indigo-500/20">
                ADMIN
              </span>
            )}
            {/* Morava na barra de cima, que saiu do celular. O modo local
                não pode ser surpresa: o que se faz nele não chega às lojas. */}
            <span className="md:hidden">
              <IndicadorNuvem />
            </span>
          </div>
          <p className="text-sm text-[var(--c-texto-2)] truncate">
            {colaboradorAtual.cargo} · {colaboradorAtual.loja}
          </p>
          <div className="flex items-center gap-3 mt-1 text-xs text-[var(--c-texto-3)]">
            <span>Setor: {colaboradorAtual.setor}</span>
            {colaboradorAtual.ramal && (
              <span className="font-mono text-emerald-600 font-bold">
                Ramal: {colaboradorAtual.ramal}
              </span>
            )}
          </div>
          <button
            type="button"
            id="botao-alterar-foto-texto"
            onClick={() => setModalFotoAberto(true)}
            className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--c-acento)] min-h-[32px]"
          >
            <Camera className="w-3.5 h-3.5" />
            <span>Alterar foto</span>
          </button>
        </div>
      </div>

      {/*
        MEU RH VEM LOGO ABAIXO DO NOME.

        É o que a pessoa abre a aba Eu para ver: o holerite que chegou, a
        folga que foi aprovada, o espelho do mês que fechou. Presença e
        preferências são ajuste de aparelho, que se mexe uma vez e se
        esquece — ficam embaixo.
      */}
      {!semMeuRH && (
        <div className="lg:col-start-2 lg:row-start-1 lg:row-span-2">
          <MeuRH colaboradorAtual={colaboradorAtual} />
        </div>
      )}

      {/* A coluna estreita do computador: ficha, presença, preferências, sair */}
      <div className="lg:col-start-1 lg:row-start-2 lg:rounded-2xl lg:border lg:border-[var(--c-borda)] lg:overflow-hidden lg:bg-[var(--c-superficie)] lg:pb-4">

      {/*
        A FICHA É CONSULTA, e por isso nasce fechada.

        São os dados como saem no espelho de ponto e em qualquer
        documento — é aqui que a pessoa percebe o que falta e pede ao RH
        para corrigir, e por isso os campos em branco aparecem. Mas não
        há um botão sequer: ninguém volta aqui depois de conferir uma
        vez, e aberta ela era o bloco mais alto da aba.

        O resumo diz o cargo e a loja, que é o que responde "é a minha
        ficha mesmo?" sem precisar abrir.
      */}
      <SecaoRecolhivel
        titulo="Meus dados"
        icone={<IdCard className="w-5 h-5" />}
        resumo={`${colaboradorAtual.cargo} · ${colaboradorAtual.loja}`}
      >
        <div className="p-4">
          <FichaColaborador
            colaborador={colaboradorAtual}
            responsavel={
              colaboradorAtual.responsavelId
                ? bancoDados.obterColaboradorPorId(colaboradorAtual.responsavelId)
                : null
            }
            mostrarVazios
          />
        </div>
      </SecaoRecolhivel>

      {/* Atalho ao Painel ADM exclusivo para Administrador (Elias) */}
      {/* No computador o Painel ADM já está no cabeçalho: aqui seria o segundo caminho */}
      {ehAdmin && aoAbrirAdmin && (
        <div className="mt-4 px-4 md:hidden">
          <button
            type="button"
            id="botao-acessar-painel-adm-aba-eu"
            onClick={aoAbrirAdmin}
            className="w-full p-4 rounded-2xl bg-gradient-to-r from-indigo-600 to-blue-700 text-white font-bold text-sm shadow-md hover:brightness-110 active:scale-[0.99] transition-all flex items-center justify-between"
          >
            <div className="flex items-center gap-3 text-left">
              <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center">
                <ShieldCheck className="w-6 h-6 text-white" />
              </div>
              <div>
                <span className="block font-black text-sm">Painel Administrativo Geral</span>
                <span className="text-xs text-white/80 font-normal">
                  Gerenciar Colaboradores, Lojas, Canais e Configurações
                </span>
              </div>
            </div>
            <span className="text-xs uppercase tracking-wider bg-white/20 px-2 py-1 rounded-lg">
              Abrir
            </span>
          </button>
        </div>
      )}

      {/*
        PRESENÇA: o resumo mostra o estado atual, que é a única coisa que
        se quer saber com a seção fechada — e mudá-lo é raro.
      */}
      <SecaoRecolhivel
        titulo="Presença"
        icone={<CircleDot className="w-5 h-5" />}
        resumo={ROTULO_PRESENCA[colaboradorAtual.presenca] || 'Disponível'}
      >
        <div className="divide-y divide-[var(--c-borda)]">
          {/*
            O NOME vem de `ROTULO_PRESENCA`; aqui ficam só a cor e a
            consequência. Escrever "Ocupado" de novo nesta lista era a
            segunda cópia — e o resumo do cabeçalho seria a terceira.
          */}
          {(
            [
              { valor: 'disponivel', consequencia: '', cor: 'bg-[var(--c-ok)]' },
              {
                valor: 'ocupado',
                consequencia: ' (vira recado de voz)',
                cor: 'bg-[var(--c-atencao)]',
              },
              {
                valor: 'ausente',
                consequencia: ' (vira recado de voz)',
                cor: 'bg-[var(--c-texto-3)]',
              },
              { valor: 'desconectado', consequencia: '', cor: 'bg-[var(--c-borda-forte)]' },
            ] as const
          ).map((item) => {
            const selecionado = colaboradorAtual.presenca === item.valor;
            return (
              <button
                key={item.valor}
                type="button"
                id={`opcao-presenca-${item.valor}`}
                onClick={() => mudarPresenca(item.valor)}
                className="w-full px-4 py-3 flex items-center justify-between hover:bg-[var(--c-superficie-2)] transition-colors min-h-[50px]"
              >
                <div className="flex items-center gap-3">
                  <span className={`w-3 h-3 rounded-full ${item.cor}`} />
                  <span className="text-sm text-[var(--c-texto)]">
                    {ROTULO_PRESENCA[item.valor]}
                    {item.consequencia}
                  </span>
                </div>
                {selecionado && <Check className="w-4 h-4 text-[var(--c-acento)]" />}
              </button>
            );
          })}
        </div>
      </SecaoRecolhivel>

      {/*
        TEMA, SONS E AVISOS VIRARAM UMA SEÇÃO SÓ: "Preferências".

        Eram três blocos separados — "Notificações e Sons", "Tema" e
        "Avisos de Mensagem" —, e os três respondem à mesma pergunta:
        como este aparelho se comporta. Separados, ocupavam três
        cabeçalhos para o que cabe num, e ninguém sabia em qual procurar
        o som da mensagem.
      */}
      <SecaoRecolhivel
        titulo="Preferências"
        icone={<Settings className="w-5 h-5" />}
        resumo={`${ROTULO_TEMA[temaEscolhido]} · ${comSom ? 'com som' : 'sem som'}`}
      >
        <div className="px-4 py-3 flex items-center justify-between min-h-[52px]">
          <div className="flex items-center gap-3">
            <Bell className="w-5 h-5 text-[var(--c-texto-2)]" />
            <div>
              <p className="text-sm font-medium text-[var(--c-texto)]">Sons das mensagens</p>
              <p className="text-xs text-[var(--c-texto-3)]">Bipes de transmissão ao vivo</p>
            </div>
          </div>
          <input
            id="chave-som-mensagens"
            type="checkbox"
            checked={somAtivo}
            onChange={(e) => setSomAtivo(e.target.checked)}
            className="w-5 h-5 accent-[var(--c-acento)] cursor-pointer"
          />
        </div>

        {/* A digital: só onde funciona — o app Android, com digital cadastrada (desbloqueio.ts) */}
        {temBiometria && (
          <div className="px-4 py-3 flex items-center justify-between min-h-[52px] border-t border-[var(--c-borda)]">
            <div className="flex items-center gap-3">
              <Fingerprint className="w-5 h-5 text-[var(--c-texto-2)]" />
              <div>
                <p className="text-sm font-medium text-[var(--c-texto)]">Desbloquear com a digital</p>
                <p className="text-xs text-[var(--c-texto-3)]">Ao abrir o app e ao voltar depois de 1 minuto</p>
              </div>
            </div>
            <input
              id="chave-biometria"
              type="checkbox"
              checked={biometriaLigada}
              onChange={async (e) => {
                if (!e.target.checked) {
                  gravarPreferencia('desligada');
                  return setBiometriaLigada(false);
                }
                // Ligar confirma a digital antes: quem liga vê na hora que funciona
                if (await confirmarIdentidade('Ativar o desbloqueio pela digital')) {
                  gravarPreferencia('ligada');
                  setBiometriaLigada(true);
                }
              }}
              className="w-5 h-5 accent-[var(--c-acento)] cursor-pointer"
            />
          </div>
        )}

        <div className="px-4 pt-3 text-[10px] font-bold uppercase tracking-wider text-[var(--c-texto-3)]">
          Tema
        </div>
        <div className="p-3 grid grid-cols-3 gap-2">
          {(
            [
              { valor: 'sistema', rotulo: 'Automático' },
              { valor: 'claro', rotulo: 'Claro' },
              { valor: 'escuro', rotulo: 'Escuro' },
            ] as const
          ).map((t) => (
            <button
              key={t.valor}
              type="button"
              id={`tema-${t.valor}`}
              onClick={() => aplicarTema(t.valor)}
              className={`py-2.5 px-3 rounded-lg text-xs font-medium border flex items-center justify-center gap-1.5 transition-colors ${
                temaEscolhido === t.valor
                  ? 'bg-[var(--c-acento)] text-[var(--c-sobre-acento)] border-[var(--c-acento)]'
                  : 'bg-[var(--c-superficie-2)] text-[var(--c-texto)] border-[var(--c-borda)]'
              }`}
            >
              <Moon className="w-3.5 h-3.5" />
              {t.rotulo}
            </button>
          ))}
        </div>

        <div className="px-4 pt-1 text-[10px] font-bold uppercase tracking-wider text-[var(--c-texto-3)]">
          Avisos de mensagem
        </div>

        <div className="p-3 space-y-2.5">
          {/* Aviso do sistema: aparece por cima de qualquer programa */}
          <div className="flex items-center justify-between gap-3 p-3 rounded-lg bg-[var(--c-superficie-2)] border border-[var(--c-borda)]">
            <div className="min-w-0">
              <span className="text-xs font-bold text-[var(--c-texto)] block">
                Aviso na tela do computador
              </span>
              <span className="text-[11px] text-[var(--c-texto-3)] leading-snug block">
                {permissao === 'concedida'
                  ? 'Ligado. Aparece mesmo com o CONECTA atrás de outro programa.'
                  : permissao === 'negada'
                  ? 'Bloqueado no navegador. Libere no cadeado ao lado do endereço.'
                  : permissao === 'indisponivel'
                  ? 'Este navegador não mostra avisos do sistema.'
                  : 'Desligado. O som e a contagem no título continuam funcionando.'}
              </span>
            </div>

            {permissao === 'nao_perguntada' && (
              <button
                type="button"
                id="botao-ligar-avisos"
                onClick={async () => setPermissao(await pedirPermissaoDeAviso())}
                className="flex-shrink-0 py-1.5 px-3 rounded-lg bg-[var(--c-acento)] text-[var(--c-sobre-acento)] text-xs font-bold cursor-pointer"
              >
                Ligar
              </button>
            )}
            {permissao === 'concedida' && (
              <Bell className="w-4 h-4 text-emerald-600 flex-shrink-0" />
            )}
            {(permissao === 'negada' || permissao === 'indisponivel') && (
              <BellOff className="w-4 h-4 text-[var(--c-texto-3)] flex-shrink-0" />
            )}
          </div>

          {/* Som: escolha de quem senta neste aparelho */}
          <div className="flex items-center justify-between gap-3 p-3 rounded-lg bg-[var(--c-superficie-2)] border border-[var(--c-borda)]">
            <div className="min-w-0">
              <span className="text-xs font-bold text-[var(--c-texto)] block">
                Som ao chegar mensagem
              </span>
              <span className="text-[11px] text-[var(--c-texto-3)] leading-snug block">
                Dois toques curtos. Vale só neste aparelho.
              </span>
            </div>
            <input
              type="checkbox"
              id="alternar-som-mensagem"
              checked={comSom}
              onChange={(e) => {
                setComSom(e.target.checked);
                definirSom(e.target.checked);
                if (e.target.checked) {
                  prepararSom();
                  tocarAvisoDeMensagem();
                }
              }}
              className="w-5 h-5 rounded flex-shrink-0 cursor-pointer accent-[var(--c-acento)]"
            />
          </div>

          {/* Testar não é enfeite: "não apareceu nada" não diz se travou na
              permissão, no som ou na chegada da mensagem. Aqui dá para
              descobrir sem depender de alguém mandar mensagem. */}
          <button
            type="button"
            id="botao-testar-avisos"
            onClick={async () => {
              setResultadoTeste('Testando…');
              const r = await testarAvisos();
              setPermissao(permissaoDeAviso());
              setResultadoTeste(
                r.motivo
                  ? `${r.som ? 'Som tocou. ' : 'Som não tocou. '}${r.motivo}`
                  : `${r.som ? 'Som tocou' : 'Som desligado'} e o aviso foi enviado. Se ele não apareceu na tela, o bloqueio é do sistema operacional.`
              );
            }}
            className="w-full py-2 rounded-lg border border-[var(--c-borda)] text-xs font-bold text-[var(--c-texto-2)] hover:text-[var(--c-texto)] hover:bg-[var(--c-superficie-2)] transition-colors cursor-pointer"
          >
            Testar avisos agora
          </button>

          {resultadoTeste && (
            <p className="text-[11px] text-[var(--c-texto-3)] leading-snug px-1">
              {resultadoTeste}
            </p>
          )}
        </div>
      </SecaoRecolhivel>

      {/* 5. Alternância de Colaborador (Exclusivo para testes do Administrador) */}
      {ehAdmin && (
        <SecaoRecolhivel
          titulo="Demonstração (Admin)"
          icone={<Users className="w-5 h-5" />}
          resumo="Alternar colaborador"
        >
          <button
            type="button"
            id="botao-alternar-colaborador"
            onClick={() => setModalTrocaAberto(true)}
            className="w-full px-4 py-3.5 flex items-center justify-between text-left hover:bg-[var(--c-superficie-2)] transition-colors min-h-[52px]"
          >
            <div className="flex items-center gap-3">
              <Users className="w-5 h-5 text-[var(--c-texto-2)]" />
              <div>
                <p className="text-sm font-medium text-[var(--c-texto)]">
                  Alternar colaborador conectado
                </p>
                <p className="text-xs text-[var(--c-texto-3)]">
                  Simular visão de operador (nível 1), supervisor (nível 2) ou gestor (nível 3)
                </p>
              </div>
            </div>
            <span className="text-xs text-[var(--c-acento)] font-medium">Trocar</span>
          </button>
        </SecaoRecolhivel>
      )}

      {/* 6. Sair */}
      <div className="mt-6 px-4">
        <button
          type="button"
          id="botao-sair-app"
          onClick={lidarLogout}
          className="w-full py-3 rounded-xl border border-[var(--c-erro)] text-[var(--c-erro)] font-medium text-sm flex items-center justify-center gap-2 hover:bg-[var(--c-superficie)] active:opacity-75 transition-colors"
        >
          <LogOut className="w-4 h-4" />
          Encerrar Sessão (Sair)
        </button>

        {/*
          A versão carregada NESTA aba.
          Existe para "atualizei e não apareceu" virar uma pergunta com
          resposta: basta comparar este carimbo com o da publicação.
        */}
        <p className="mt-3 text-center text-[10px] text-[var(--c-texto-3)]">
          Versão {versaoLegivel()}
        </p>
      </div>
      </div>

      {/* Modal para alternar o colaborador atual */}
      {modalTrocaAberto && (
        <div
          id="modal-escolha-colaborador"
          className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
        >
          <div className="bg-[var(--c-superficie)] w-full max-w-sm rounded-2xl max-h-[85dvh] flex flex-col overflow-hidden border border-[var(--c-borda)] shadow-[var(--s-3)]">
            <div className="p-4 border-b border-[var(--c-borda)] flex items-center justify-between">
              <h3 className="font-bold text-base text-[var(--c-texto)]">
                Escolher colaborador
              </h3>
              <button
                type="button"
                onClick={() => setModalTrocaAberto(false)}
                className="text-[var(--c-texto-3)] hover:text-[var(--c-texto)] p-1"
              >
                ✕
              </button>
            </div>

            <div className="flex-1 overflow-y-auto divide-y divide-[var(--c-borda)]">
              {todosColaboradores.map((colab) => (
                <button
                  key={colab.id}
                  type="button"
                  id={`trocar-para-${colab.id}`}
                  onClick={() => {
                    aoTrocarColaborador(colab.id);
                    setModalTrocaAberto(false);
                  }}
                  className={`w-full p-3.5 flex items-center gap-3 text-left transition-colors ${
                    colab.id === colaboradorAtual.id
                      ? 'bg-[var(--c-acento-suave)]'
                      : 'hover:bg-[var(--c-superficie-2)]'
                  }`}
                >
                  <FotoPresenca
                    foto={colab.foto}
                    nome={colab.nome}
                    presenca={colab.presenca}
                    tamanho="w-10 h-10"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-sm text-[var(--c-texto)] truncate">
                        {colab.nome}
                      </span>
                      <span className="text-xs text-[var(--c-texto-3)] font-mono">
                        Nível {colab.nivel}
                      </span>
                    </div>
                    <span className="text-xs text-[var(--c-texto-3)] block truncate">
                      {colab.cargo} · {colab.loja} ({colab.setor})
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Modal para alterar a foto do usuário atual ou redefinir para a logo */}
      <ModalAlterarFoto
        aberto={modalFotoAberto}
        colaborador={colaboradorAtual}
        aoFechar={() => setModalFotoAberto(false)}
      />
    </div>
  );
};
