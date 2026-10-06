/**
 * A ÁREA PRINCIPAL DO COMPUTADOR — o topo, as abas do assunto e a tela.
 *
 * Cada tela aqui é A MESMA de antes (Elias, 05/10/2026: "realocar as
 * funções existentes"), só que aberta pela porta do assunto. O que muda é
 * a organização; nenhuma regra mora neste arquivo. Quem decide quais abas
 * a pessoa tem é `assuntosDe` (telasPorAssunto.ts).
 */
import React, { useEffect, useRef, useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  LogOut,
  User,
  Clock,
  FileText,
  Users,
  ListChecks,
  Network,
  QrCode,
  Send,
  CalendarDays,
  CalendarRange,
  Plane,
  Stethoscope,
  FolderOpen,
  PenLine,
  Receipt,
  TriangleAlert,
  Store,
  type LucideIcon,
} from 'lucide-react';
import { Colaborador } from '../tipos';
import type { Assunto, TelaId, TelaWeb } from '../servicos/telasPorAssunto';
import { DESCRICAO_DA_TELA, DESCRICAO_DO_ASSUNTO, DE_QUEM_E_A_TELA } from '../servicos/telasPorAssunto';
import { bancoDados } from '../servicos/bancoDados';
import { contarParaOResponsavel } from '../servicos/assinatura';
import { InicioWeb } from './InicioWeb';
import { ContextoTelaEmbutida, ContextoAcaoDaTela } from './TelaEmbutida';
import { CabecalhoDeSecao } from './PadraoWeb';
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

/** O ícone de cada aba — o desenho reconhece a aba antes de ler o nome. */
const ICONE_DA_TELA: Partial<Record<TelaId, LucideIcon>> = {
  meu_ponto: Clock,
  equipe_banco: Users,
  equipe_pendencias: ListChecks,
  ponto_rede: Network,
  qr_ponto: QrCode,
  pedir_ausencia: Send,
  minhas_ausencias: CalendarDays,
  escala_folgas: CalendarRange,
  ferias_planejamento: Plane,
  atestados: Stethoscope,
  meus_documentos: FolderOpen,
  assinaturas: PenLine,
  holerites: Receipt,
  advertencias: TriangleAlert,
  unidades: Store,
  organograma: Network,
};

/** O topo da área: o assunto à esquerda, a pessoa à direita. */
const TopoWeb: React.FC<{
  /** Onde a pessoa está: "Ponto › Meu espelho". */
  caminho: string[];
  colaboradorAtual: Colaborador;
  ehAdmin: boolean;
  aoAbrirPerfil: () => void;
  aoSair: () => void;
  /** O que fica ao lado da pessoa (o sino). */
  acoes?: React.ReactNode;
}> = ({ caminho, colaboradorAtual, ehAdmin, aoAbrirPerfil, aoSair, acoes }) => {
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
    <header className="h-20 flex items-center gap-3 px-8 bg-[var(--c-superficie)] border-b border-[var(--c-borda)] flex-shrink-0">
      <nav aria-label="Onde você está" className="min-w-0 flex items-center gap-1.5 text-sm">
        {caminho.map((parte, i) => (
          <React.Fragment key={parte + i}>
            {i > 0 && <ChevronRight className="w-3.5 h-3.5 text-[var(--c-texto-3)] flex-shrink-0" />}
            <span
              className={`truncate ${
                i === caminho.length - 1 ? 'font-bold text-[var(--c-texto)]' : 'font-medium text-[var(--c-texto-3)]'
              }`}
            >
              {parte}
            </span>
          </React.Fragment>
        ))}
      </nav>
      <div className="flex-1" />
      {acoes}
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
  /** O que a equipe pede e espera a decisão da pessoa (aba Pendências). */
  pendenciasParaMim: number;
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
  /** O que vai no topo, ao lado da pessoa (o sino). */
  acoesDoTopo?: React.ReactNode;
  /** Abre um comunicado da Central — o mesmo caminho do aviso. */
  aoAbrirPublicacao: (id: string) => void;
}> = (p) => {
  const { tela, assunto, colaboradorAtual } = p;

  /** O PainelGestao conversa com o COLEGA; a janela abre pela conversa. */
  const conversarCom = (colegaId: string) =>
    p.aoAbrirConversa(bancoDados.obterOuCriarConversaIndividual(colegaId).id);

  const titulo = tela === 'perfil' ? 'Meu perfil' : assunto?.rotulo || 'CONECTA';
  const abas = assunto && assunto.telas.length > 1 ? assunto.telas : null;
  const rotuloDaTela = assunto?.telas.find((t) => t.id === tela)?.rotulo;
  /** O caminho do topo: o assunto, e a aba quando há mais de uma. */
  const caminho = abas && rotuloDaTela ? [titulo, rotuloDaTela] : [titulo];
  /**
   * A FRASE DO CABEÇALHO: com abas, a do assunto (o que ele reúne) — e cada
   * aba ganha a sua logo abaixo; sem abas, a da própria tela.
   */
  const descricaoDaPagina = abas && assunto ? DESCRICAO_DO_ASSUNTO[assunto.id] : DESCRICAO_DA_TELA[tela];

  /** A vaga da ação da tela no cabeçalho (`AcaoNoCabecalho`). */
  const [vagaDaAcao, setVagaDaAcao] = useState<HTMLDivElement | null>(null);

  /**
   * O que espera a assinatura do RH. Só se conta quando a pessoa tem a aba
   * e está no assunto dela — e de novo a cada troca de aba (assinou o lote,
   * o número cai).
   */
  const [paraOResponsavel, setParaOResponsavel] = useState(0);
  const contaAssinaturas = p.visiveis.has('assinaturas') && assunto?.id === 'documentos';
  useEffect(() => {
    if (!contaAssinaturas) return;
    let vivo = true;
    contarParaOResponsavel(colaboradorAtual.id).then((n) => vivo && setParaOResponsavel(n));
    return () => {
      vivo = false;
    };
  }, [contaAssinaturas, colaboradorAtual.id, tela]);

  /** O número de cada aba: o que espera a pessoa ali dentro. */
  const contadorDaAba: Partial<Record<TelaId, number>> = {
    meus_documentos: p.pendenciasDoMeuRH,
    equipe_pendencias: p.pendenciasParaMim,
    assinaturas: contaAssinaturas ? paraOResponsavel : 0,
  };

  const telaDoAssunto = (): React.ReactNode => {
    switch (tela) {
      case 'inicio':
        return (
          <InicioWeb
            colaboradorAtual={colaboradorAtual}
            visiveis={p.visiveis}
            pendenciasDoMeuRH={p.pendenciasDoMeuRH}
            aoIrPara={p.aoIrPara}
            aoAbrirPublicacao={p.aoAbrirPublicacao}
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
      case 'equipe_banco':
      case 'equipe_pendencias':
        return (
          <PainelGestao
            colaboradorAtual={colaboradorAtual}
            aoAbrirConversa={conversarCom}
            temEquipe={p.temEquipe}
            secaoAlvo={p.secaoAlvo}
            aoConsumirSecao={p.aoConsumirSecao}
            abaFixa={tela === 'equipe_banco' ? 'equipe' : 'pendencias'}
          />
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
        return <EscalaDeFolgas colaboradorAtual={colaboradorAtual} />;
      case 'ferias_planejamento':
        return <AbaFerias colaboradorAtual={colaboradorAtual} />;
      case 'atestados':
        return <AbaAtestados colaboradorAtual={colaboradorAtual} />;
      case 'meus_documentos':
        /*
          TODOS OS DOCUMENTOS DA PESSOA NUM LUGAR SÓ (Elias, 06/10/2026): o
          espelho morava em Ponto, e o selo de Documentos — que conta o
          espelho a assinar — levava a uma tela sem ele. O espelho só
          aparece para quem bate ponto (MeuRH).
        */
        return <MeuRH colaboradorAtual={colaboradorAtual} cartoes={['espelho', 'holerites', 'advertencias']} semTitulo />;
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
        caminho={caminho}
        colaboradorAtual={colaboradorAtual}
        ehAdmin={p.ehAdmin}
        aoAbrirPerfil={() => p.aoIrPara('perfil')}
        aoSair={p.aoSair}
        acoes={p.acoesDoTopo}
      />
      <div id="conteudo-web" className="flex-1 overflow-y-auto">
        {/*
          O CABEÇALHO PADRÃO de toda tela (menos o Início, que é a saudação):
          o título do assunto e o que ele reúne; as abas; e, com abas, o
          título da aba e o que se faz nela. O mesmo lugar, do mesmo jeito,
          em todas — `DESCRICAO_DA_TELA` (telasPorAssunto.ts).
        */}
        {tela !== 'inicio' && (
          <header className="max-w-7xl mx-auto w-full px-8 pt-8">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div className="min-w-0">
                <h1 id="titulo-da-pagina" className="text-3xl font-extrabold tracking-tight text-[var(--c-texto)]">
                  {titulo}
                </h1>
                <p className="mt-1.5 text-sm text-[var(--c-texto-3)] max-w-3xl">{descricaoDaPagina}</p>
              </div>
              {/* Sem abas, a ação da tela fica ao lado do título da página */}
              {!abas && <div ref={setVagaDaAcao} className="flex flex-shrink-0 flex-wrap items-center gap-2" />}
            </div>
            {abas && (
              <div className="mt-6 border-b border-[var(--c-borda)]">
                <AbasRolaveis
                  className="-mx-3 -mb-px"
                  variante="sublinhado"
                  ativa={tela}
                  aoEscolher={(id) => p.aoIrPara(id as TelaWeb)}
                  abas={abas.map((t) => {
                    const Icone = ICONE_DA_TELA[t.id];
                    return {
                      id: t.id,
                      rotulo: t.rotulo,
                      domId: `tela-${t.id}`,
                      icone: Icone ? <Icone /> : undefined,
                      contador: contadorDaAba[t.id],
                    };
                  })}
                />
              </div>
            )}
          </header>
        )}
        {abas && rotuloDaTela && assunto && (
          <div className="max-w-7xl mx-auto w-full px-8 pt-8">
            <CabecalhoDeSecao
              id="titulo-da-tela"
              rotulo={DE_QUEM_E_A_TELA[tela]}
              titulo={rotuloDaTela}
              descricao={DESCRICAO_DA_TELA[tela]}
              acao={<div ref={setVagaDaAcao} className="contents" />}
            />
          </div>
        )}
        {/* Cada tela de uma vez — a troca de aba recomeça a tela. O fim reserva o
            espaço do balão de conversas, que flutua no canto. */}
        <div key={tela} className="max-w-7xl mx-auto w-full px-2 pb-28">
          <ContextoTelaEmbutida.Provider value={true}>
            <ContextoAcaoDaTela.Provider value={tela === 'inicio' ? null : vagaDaAcao}>
              {telaDoAssunto()}
            </ContextoAcaoDaTela.Provider>
          </ContextoTelaEmbutida.Provider>
        </div>
      </div>
    </div>
  );
};
