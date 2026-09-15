import React, { useState } from 'react';
import { NIVEL_TI } from '../tipos';
import {
  Bell,
  Moon,
  BellOff,
  LogOut,
  Users,
  Check,
  ShieldCheck,
  Sliders,
  Building2,
  Phone,
  Camera,
} from 'lucide-react';
import { Colaborador, EstadoPresenca } from '../tipos';
import { bancoDados, FOTO_PADRAO_LOGO_EMPRESA } from '../servicos/bancoDados';
import { PreferenciaTema, definirTema, obterTemaSalvo } from '../servicos/tema';
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
import { ModalAlterarFoto } from './ModalAlterarFoto';

interface PropsAbaEu {
  colaboradorAtual: Colaborador;
  aoTrocarColaborador: (id: string) => void;
  aoSair?: () => void;
  aoAbrirAdmin?: () => void;
}

export const AbaEu: React.FC<PropsAbaEu> = ({
  colaboradorAtual,
  aoTrocarColaborador,
  aoSair,
  aoAbrirAdmin,
}) => {
  const [somAtivo, setSomAtivo] = useState(true);
  const [temaEscolhido, setTemaEscolhido] = useState<PreferenciaTema>(obterTemaSalvo);
  const [permissao, setPermissao] = useState<PermissaoAviso>(permissaoDeAviso);
  const [comSom, setComSom] = useState<boolean>(somLigado);
  const [resultadoTeste, setResultadoTeste] = useState<string | null>(null);
  const [modalTrocaAberto, setModalTrocaAberto] = useState(false);
  const [modalFotoAberto, setModalFotoAberto] = useState(false);

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
    <div id="aba-eu" className="flex-1 overflow-y-auto bg-[var(--c-canvas)] pb-24">
      {/* 1. Perfil */}
      <div className="bg-[var(--c-superficie)] border-b border-[var(--c-borda)] p-5 flex items-center gap-4">
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
            className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-blue-600 hover:text-blue-700 hover:underline"
          >
            <Camera className="w-3.5 h-3.5" />
            <span>Alterar Foto / Usar Logo Malachias</span>
          </button>
        </div>
      </div>

      {/* Atalho ao Painel ADM exclusivo para Administrador (Elias) */}
      {ehAdmin && aoAbrirAdmin && (
        <div className="mt-4 px-4">
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

      {/* 2. Presença */}
      <div className="mt-4 bg-[var(--c-superficie)] border-y border-[var(--c-borda)]">
        <div className="px-4 py-2 text-xs font-semibold text-[var(--c-texto-3)] uppercase tracking-wider">
          Presença
        </div>
        <div className="divide-y divide-[var(--c-borda)]">
          {(
            [
              { valor: 'disponivel', rotulo: 'Disponível', cor: 'bg-[var(--c-ok)]' },
              { valor: 'ocupado', rotulo: 'Ocupado (vira recado de voz)', cor: 'bg-[var(--c-atencao)]' },
              { valor: 'ausente', rotulo: 'Ausente (vira recado de voz)', cor: 'bg-[var(--c-texto-3)]' },
              { valor: 'desconectado', rotulo: 'Desconectado', cor: 'bg-[var(--c-borda-forte)]' },
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
                  <span className="text-sm text-[var(--c-texto)]">{item.rotulo}</span>
                </div>
                {selecionado && <Check className="w-4 h-4 text-[var(--c-acento)]" />}
              </button>
            );
          })}
        </div>
      </div>

      {/* 3. Notificações */}
      <div className="mt-4 bg-[var(--c-superficie)] border-y border-[var(--c-borda)]">
        <div className="px-4 py-2 text-xs font-semibold text-[var(--c-texto-3)] uppercase tracking-wider">
          Notificações e Sons
        </div>
        <div className="px-4 py-3 flex items-center justify-between min-h-[52px]">
          <div className="flex items-center gap-3">
            <Bell className="w-5 h-5 text-[var(--c-texto-2)]" />
            <div>
              <p className="text-sm font-medium text-[var(--c-texto)]">Sons do rádio e mensagens</p>
              <p className="text-xs text-[var(--c-texto-3)]">Bipes de transmissão ao vivo</p>
            </div>
          </div>
          <input
            id="chave-som-radio"
            type="checkbox"
            checked={somAtivo}
            onChange={(e) => setSomAtivo(e.target.checked)}
            className="w-5 h-5 accent-[var(--c-acento)] cursor-pointer"
          />
        </div>
      </div>

      {/* 4. Tema */}
      <div className="mt-4 bg-[var(--c-superficie)] border-y border-[var(--c-borda)]">
        <div className="px-4 py-2 text-xs font-semibold text-[var(--c-texto-3)] uppercase tracking-wider">
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
      </div>
      {/* 5. Avisos de mensagem */}
      <div className="mt-4 bg-[var(--c-superficie)] border-y border-[var(--c-borda)]">
        <div className="px-4 py-2 text-xs font-semibold text-[var(--c-texto-3)] uppercase tracking-wider">
          Avisos de Mensagem
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
      </div>


      {/* 5. Alternância de Colaborador (Exclusivo para testes do Administrador) */}
      {ehAdmin && (
        <div className="mt-4 bg-[var(--c-superficie)] border-y border-[var(--c-borda)]">
          <div className="px-4 py-2 text-xs font-semibold text-[var(--c-texto-3)] uppercase tracking-wider">
            Hierarquia e Demonstração (Admin)
          </div>
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
        </div>
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
