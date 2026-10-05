/**
 * A ÁREA PRINCIPAL DO COMPUTADOR — o topo, as abas do assunto e a tela.
 *
 * Cada tela aqui é A MESMA de antes (Elias, 05/10/2026: "realocar as
 * funções existentes"), só que aberta pela porta do assunto. O que muda é
 * a organização; nenhuma regra mora neste arquivo. Quem decide quais abas
 * a pessoa tem é `assuntosDe` (telasPorAssunto.ts).
 */
import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown, LogOut, User } from 'lucide-react';
import { Colaborador } from '../tipos';
import type { Assunto, TelaId, TelaWeb } from '../servicos/telasPorAssunto';
import { bancoDados } from '../servicos/bancoDados';
import { InicioWeb } from './InicioWeb';
import { AbasRolaveis } from './AbasRolaveis';
import { CentralAvisos } from './CentralAvisos';
import { AbaPonto } from './AbaPonto';
import { MeuRH } from './MeuRH';
import { PainelGestao } from './PainelGestao';
import { BancoDeHoras } from './BancoDeHoras';
import { AbaJustificar } from './AbaJustificar';
import { EscalaDeFolgas } from './EscalaDeFolgas';
import { AbaFerias } from './AbaFerias';
import { AbaAtestados } from './AbaAtestados';
import { AbaAssinaturas } from './AbaAssinaturas';
import { AbaHolerites } from './AbaHolerites';
import { AbaAdvertencias } from './AbaAdvertencias';
import { PainelRede } from './PainelRede';
import { AbaEu } from './AbaEu';
import type { SecaoDestino } from '../servicos/destinoDoAviso';

/** O topo da área: o assunto à esquerda, a pessoa à direita. */
const TopoWeb: React.FC<{
  titulo: string;
  colaboradorAtual: Colaborador;
  ehAdmin: boolean;
  aoAbrirPerfil: () => void;
  aoSair: () => void;
}> = ({ titulo, colaboradorAtual, ehAdmin, aoAbrirPerfil, aoSair }) => {
  const [menuAberto, setMenuAberto] = useState(false);
  const menu = useRef<HTMLDivElement>(null);

  // Clique fora fecha o menu, como em qualquer menu
  useEffect(() => {
    if (!menuAberto) return;
    const fora = (e: MouseEvent) => {
      if (menu.current && !menu.current.contains(e.target as Node)) setMenuAberto(false);
    };
    document.addEventListener('mousedown', fora);
    return () => document.removeEventListener('mousedown', fora);
  }, [menuAberto]);

  return (
    <header className="h-16 flex items-center gap-3 px-6 bg-[var(--c-superficie)] border-b border-[var(--c-borda)] flex-shrink-0">
      <h1 className="text-base font-bold text-[var(--c-texto)] truncate">{titulo}</h1>
      <div className="flex-1" />
      <div ref={menu} className="relative">
        <button
          type="button"
          id="topo-web-perfil"
          onClick={() => setMenuAberto((a) => !a)}
          aria-expanded={menuAberto}
          className="flex items-center gap-2 py-1.5 pl-1.5 pr-2 rounded-xl hover:bg-[var(--c-superficie-2)] transition-colors"
        >
          <span className="w-8 h-8 rounded-full overflow-hidden bg-[var(--c-canvas)] border border-[var(--c-borda)] flex items-center justify-center font-bold text-xs flex-shrink-0">
            {colaboradorAtual.foto ? (
              <img src={colaboradorAtual.foto} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
            ) : (
              colaboradorAtual.nome.charAt(0)
            )}
          </span>
          <span className="text-left hidden lg:block">
            <span className="block text-xs font-bold text-[var(--c-texto)] max-w-[160px] truncate">
              {colaboradorAtual.nome}
            </span>
            <span className="block text-[10px] text-[var(--c-texto-3)] max-w-[160px] truncate">
              {ehAdmin ? 'Administrador' : colaboradorAtual.cargo}
            </span>
          </span>
          <ChevronDown className="w-3.5 h-3.5 text-[var(--c-texto-3)]" />
        </button>
        {menuAberto && (
          <div
            role="menu"
            className="absolute right-0 top-12 z-40 w-52 p-1.5 rounded-2xl bg-[var(--c-superficie)] border border-[var(--c-borda)] shadow-[var(--s-3)]"
          >
            <button
              type="button"
              role="menuitem"
              id="menu-meu-perfil"
              onClick={() => {
                setMenuAberto(false);
                aoAbrirPerfil();
              }}
              className="w-full h-10 px-3 rounded-xl flex items-center gap-2.5 text-sm text-[var(--c-texto-2)] hover:bg-[var(--c-superficie-2)] hover:text-[var(--c-texto)]"
            >
              <User className="w-4 h-4" />
              Meu perfil
            </button>
            <button
              type="button"
              role="menuitem"
              id="menu-sair"
              onClick={aoSair}
              className="w-full h-10 px-3 rounded-xl flex items-center gap-2.5 text-sm text-red-600 hover:bg-red-500/10"
            >
              <LogOut className="w-4 h-4" />
              Sair
            </button>
          </div>
        )}
      </div>
    </header>
  );
};

export const ConteudoWeb: React.FC<{
  tela: TelaWeb;
  /** O assunto da tela, já só com as telas da pessoa (`assuntosDe`). */
  assunto: Assunto | null;
  aoIrPara: (tela: TelaWeb) => void;
  colaboradorAtual: Colaborador;
  ehAdmin: boolean;
  temEquipe: boolean;
  /** As telas da pessoa (`telasQueVejo`) — o Início mostra só o que ela tem. */
  visiveis: Set<TelaId>;
  /** O número do Meu RH: o que espera a assinatura ou a ciência dela. */
  pendenciasDoMeuRH: number;
  /** Abre uma conversa pelo id dela (a janela de chat de hoje). */
  aoAbrirConversa: (conversaId: string) => void;
  aoAbrirAdmin: () => void;
  aoTrocarColaborador: (id: string) => void;
  aoSair: () => void;
  // O que já chegava às telas de hoje, e continua chegando
  codigoDoCartaz: string | null;
  aoConsumirCodigo: () => void;
  pedidoDeBater: boolean;
  aoAtenderPedido: () => void;
  publicacaoAAbrir: string | null;
  aoConsumirPublicacao: () => void;
  secaoAlvo: SecaoDestino | null;
  aoConsumirSecao: () => void;
}> = (p) => {
  const { tela, assunto, colaboradorAtual } = p;

  /** O PainelGestao conversa com o COLEGA; a janela abre pela conversa. */
  const conversarCom = (colegaId: string) =>
    p.aoAbrirConversa(bancoDados.obterOuCriarConversaIndividual(colegaId).id);

  const titulo = tela === 'perfil' ? 'Meu perfil' : assunto?.rotulo || 'CONECTA';
  const abas = assunto && assunto.telas.length > 1 ? assunto.telas : null;

  const telaDoAssunto = (): React.ReactNode => {
    switch (tela) {
      case 'inicio':
        return (
          <InicioWeb
            colaboradorAtual={colaboradorAtual}
            visiveis={p.visiveis}
            pendenciasDoMeuRH={p.pendenciasDoMeuRH}
            aoIrPara={p.aoIrPara}
          />
        );
      case 'central':
        return (
          <CentralAvisos
            colaboradorAtual={colaboradorAtual}
            publicacaoAAbrir={p.publicacaoAAbrir}
            aoConsumirPublicacao={p.aoConsumirPublicacao}
          />
        );
      case 'meu_ponto':
        return (
          <AbaPonto
            colaboradorAtual={colaboradorAtual}
            codigoDoEndereco={p.codigoDoCartaz}
            aoConsumirCodigo={p.aoConsumirCodigo}
            pedidoDeBater={p.pedidoDeBater}
            aoAtenderPedido={p.aoAtenderPedido}
            soOPonto
          />
        );
      case 'meu_espelho':
        return <MeuRH colaboradorAtual={colaboradorAtual} cartoes={['espelho']} semTitulo />;
      case 'equipe_banco':
      case 'equipe_pendencias':
        return (
          <div className="p-4 sm:p-6">
            <PainelGestao
              colaboradorAtual={colaboradorAtual}
              aoAbrirConversa={conversarCom}
              temEquipe={p.temEquipe}
              secaoAlvo={p.secaoAlvo}
              aoConsumirSecao={p.aoConsumirSecao}
              abaFixa={tela === 'equipe_banco' ? 'equipe' : 'pendencias'}
            />
          </div>
        );
      case 'ponto_rede':
        return <BancoDeHoras colaboradorAtual={colaboradorAtual} abaFixa="banco_horas" />;
      case 'qr_ponto':
        return <BancoDeHoras colaboradorAtual={colaboradorAtual} abaFixa="qrcodes" />;
      case 'pedir_ausencia':
        return <AbaJustificar colaboradorAtual={colaboradorAtual} />;
      case 'minhas_ausencias':
        return <MeuRH colaboradorAtual={colaboradorAtual} cartoes={['folgas', 'ferias', 'documentos']} semTitulo />;
      case 'escala_folgas':
        return (
          <div className="p-4 sm:p-6">
            <EscalaDeFolgas colaboradorAtual={colaboradorAtual} />
          </div>
        );
      case 'ferias_planejamento':
        return <AbaFerias colaboradorAtual={colaboradorAtual} />;
      case 'atestados':
        return <AbaAtestados colaboradorAtual={colaboradorAtual} />;
      case 'meus_documentos':
        return <MeuRH colaboradorAtual={colaboradorAtual} cartoes={['holerites', 'advertencias']} semTitulo />;
      case 'assinaturas':
        return <AbaAssinaturas colaboradorAtual={colaboradorAtual} />;
      case 'holerites':
        return <AbaHolerites colaboradorAtual={colaboradorAtual} />;
      case 'advertencias':
        return <AbaAdvertencias colaboradorAtual={colaboradorAtual} />;
      case 'unidades':
      case 'organograma':
        return (
          <PainelRede
            colaboradorAtual={colaboradorAtual}
            aoAbrirConversa={p.aoAbrirConversa}
            aoAlternarParaGestor={p.aoAbrirAdmin}
            subAbaFixa={tela === 'unidades' ? 'visao_geral' : 'organograma'}
          />
        );
      case 'perfil':
        return (
          <AbaEu
            colaboradorAtual={colaboradorAtual}
            aoTrocarColaborador={p.aoTrocarColaborador}
            aoSair={p.aoSair}
            aoAbrirAdmin={p.aoAbrirAdmin}
            semMeuRH
          />
        );
      default:
        return null;
    }
  };

  return (
    <div className="w-full h-full flex flex-col min-w-0 bg-[var(--c-canvas)]">
      <TopoWeb
        titulo={titulo}
        colaboradorAtual={colaboradorAtual}
        ehAdmin={p.ehAdmin}
        aoAbrirPerfil={() => p.aoIrPara('perfil')}
        aoSair={p.aoSair}
      />
      {abas && (
        <div className="bg-[var(--c-superficie)] border-b border-[var(--c-borda)] flex-shrink-0">
          <div className="max-w-7xl mx-auto w-full">
            <AbasRolaveis
              className="px-3"
              variante="sublinhado"
              ativa={tela}
              aoEscolher={(id) => p.aoIrPara(id as TelaWeb)}
              abas={abas.map((t) => ({ id: t.id, rotulo: t.rotulo, domId: `tela-${t.id}` }))}
            />
          </div>
        </div>
      )}
      <div id="conteudo-web" className="flex-1 overflow-y-auto">
        {/* Cada tela de uma vez — a troca de aba recomeça a tela, como no celular */}
        <div key={tela} className="max-w-7xl mx-auto w-full pb-10">
          {telaDoAssunto()}
        </div>
      </div>
    </div>
  );
};
