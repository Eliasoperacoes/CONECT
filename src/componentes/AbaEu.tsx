import React, { useState } from 'react';
import {
  Bell,
  Moon,
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
  const [modalTrocaAberto, setModalTrocaAberto] = useState(false);
  const [modalFotoAberto, setModalFotoAberto] = useState(false);

  const todosColaboradores = bancoDados.obterColaboradores();
  const ehAdmin = colaboradorAtual.nivel === 4;

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
            className="relative w-16 h-16 rounded-full overflow-hidden bg-white border-2 border-[var(--c-borda)] flex items-center justify-center cursor-pointer shadow-sm hover:ring-2 hover:ring-blue-500 transition-all text-left"
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
            {colaboradorAtual.nivel === 4 && (
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
                  <div className="w-10 h-10 rounded-full overflow-hidden bg-[var(--c-superficie-2)] border border-[var(--c-borda)] flex-shrink-0 flex items-center justify-center">
                    {colab.foto ? (
                      <img
                        src={colab.foto}
                        alt={colab.nome}
                        className="w-full h-full object-cover"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <span className="font-semibold text-sm">{colab.nome.charAt(0)}</span>
                    )}
                  </div>
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
