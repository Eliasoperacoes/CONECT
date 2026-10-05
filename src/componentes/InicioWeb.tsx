/**
 * O INÍCIO DO COMPUTADOR — "Bom dia, Fernanda" e o resumo do dia.
 *
 * Pedido do Elias (05/10/2026): abrir cumprimentando a pessoa e mostrando,
 * em resumo, o que importa hoje. Nada aqui é dado novo: cada número vem do
 * mesmo lugar que a tela do assunto usa (o ponto, o Meu RH), e cada cartão
 * leva para lá. Para quem decide (RH), o "Precisa de você" vem logo abaixo.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Clock, Wallet, CalendarDays, FileText, ArrowRight } from 'lucide-react';
import { Colaborador, ORDEM_MARCACOES, ROTULO_MARCACAO } from '../tipos';
import type { TelaId, TelaWeb } from '../servicos/telasPorAssunto';
import { TELA_DA_SECAO_DO_RH } from '../servicos/telasPorAssunto';
import { saudacaoDaHora, primeiroNome, dataPorExtenso, horaDeBrasilia } from '../servicos/saudacao';
import { servicoPonto, dataDeHoje, formatarSaldo, formatarDataBR } from '../servicos/ponto';
import { proximaAusenciaDe } from '../servicos/meuRH';
import { lerJustificativas, assinarJustificativas } from '../servicos/justificativasCache';
import { PainelRH } from './PainelRH';

/** Um cartão do resumo: o que é, o número, e o toque leva à tela do assunto. */
const CartaoDoDia: React.FC<{
  id: string;
  rotulo: string;
  icone: React.ReactNode;
  valor: React.ReactNode;
  detalhe: string;
  acao: string;
  aoAbrir: () => void;
  destaque?: boolean;
}> = ({ id, rotulo, icone, valor, detalhe, acao, aoAbrir, destaque }) => (
  <button
    type="button"
    id={id}
    onClick={aoAbrir}
    className={`group text-left p-4 rounded-2xl border flex flex-col gap-3 transition-colors ${
      destaque
        ? 'bg-amber-500/8 border-amber-500/40 hover:border-amber-500/60'
        : 'bg-[var(--c-superficie)] border-[var(--c-borda)] hover:border-[var(--c-borda-forte)]'
    }`}
  >
    <span className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-[var(--c-texto-3)]">
      {icone}
      {rotulo}
    </span>
    <span className="text-xl font-black tracking-tight text-[var(--c-texto)]">{valor}</span>
    <span className="text-xs text-[var(--c-texto-3)] leading-snug min-h-[2rem]">{detalhe}</span>
    <span className="mt-auto inline-flex items-center gap-1 text-xs font-bold text-[var(--c-acento)] group-hover:underline">
      {acao}
      <ArrowRight className="w-3.5 h-3.5" />
    </span>
  </button>
);

export const InicioWeb: React.FC<{
  colaboradorAtual: Colaborador;
  /** As telas da pessoa: cada cartão só aparece se a tela dele existir para ela. */
  visiveis: Set<TelaId>;
  /** Holerite e espelho para assinar, advertência sem ciência (`pendenciasDoMeuRH`). */
  pendenciasDoMeuRH: number;
  aoIrPara: (tela: TelaWeb) => void;
}> = ({ colaboradorAtual, visiveis, pendenciasDoMeuRH, aoIrPara }) => {
  const eu = colaboradorAtual;
  const hoje = dataDeHoje();
  const agora = new Date();

  // O ponto e as ausências mudam com a tela aberta: o resumo acompanha
  const [versao, setVersao] = useState(0);
  useEffect(() => servicoPonto.assinarAlteracoes(() => setVersao((v) => v + 1)), []);
  useEffect(() => assinarJustificativas(() => setVersao((v) => v + 1)), []);

  const dia = useMemo(() => {
    void versao;
    const jornada = servicoPonto.obterJornadaDoDia(eu.id, hoje);
    const batidas = ORDEM_MARCACOES.filter((t) => jornada.marcacoes[t]).map(
      (t) => `${jornada.marcacoes[t]!.horaFormatada}`
    );
    return {
      batidas,
      proxima: servicoPonto.obterProximaMarcacao(eu.id, hoje),
      saldo: servicoPonto.obterSaldoAcumulado(eu.id),
      proximaAusencia: proximaAusenciaDe(lerJustificativas(), eu.id, hoje),
    };
  }, [eu.id, hoje, versao]);

  const temPonto = visiveis.has('meu_ponto');
  const ausencia = dia.proximaAusencia;

  return (
    <div className="flex flex-col">
      <section className="px-6 pt-6">
        <p className="text-sm font-semibold text-[var(--c-acento)]">{dataPorExtenso(agora)}</p>
        <h2 id="saudacao-inicio" className="mt-1 text-2xl font-black tracking-tight text-[var(--c-texto)]">
          {saudacaoDaHora(horaDeBrasilia(agora))}, {primeiroNome(eu.nome)}
        </h2>
        <p className="mt-1 text-sm text-[var(--c-texto-3)]">Aqui está o que importa para você hoje.</p>
      </section>

      {/* MEU DIA — o resumo; cada cartão leva à tela do assunto */}
      <section aria-label="Meu dia" className="px-6 pt-5 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        {temPonto && (
          <CartaoDoDia
            id="inicio-ponto"
            rotulo="Ponto de hoje"
            icone={<Clock className="w-3.5 h-3.5" />}
            valor={dia.batidas.length ? dia.batidas.join(' · ') : 'Nenhuma batida'}
            detalhe={
              dia.proxima ? `Próxima: ${ROTULO_MARCACAO[dia.proxima].toLowerCase()}` : 'Jornada de hoje completa'
            }
            acao={dia.proxima ? 'Bater ponto' : 'Ver o ponto'}
            aoAbrir={() => aoIrPara('meu_ponto')}
          />
        )}
        {temPonto && (
          <CartaoDoDia
            id="inicio-banco"
            rotulo="Banco de horas"
            icone={<Wallet className="w-3.5 h-3.5" />}
            valor={
              <span className={dia.saldo < 0 ? 'text-red-600' : 'text-[var(--c-ok)]'}>{formatarSaldo(dia.saldo)}</span>
            }
            detalhe={dia.saldo >= 0 ? 'Horas a seu favor' : 'Horas a compensar'}
            acao="Ver o espelho"
            aoAbrir={() => aoIrPara(visiveis.has('meu_espelho') ? 'meu_espelho' : 'meu_ponto')}
          />
        )}
        <CartaoDoDia
          id="inicio-ausencia"
          rotulo="Próxima folga ou férias"
          icone={<CalendarDays className="w-3.5 h-3.5" />}
          valor={ausencia ? formatarDataBR(ausencia.dataInicio) : 'Nada marcado'}
          detalhe={
            ausencia
              ? `${ausencia.tipo === 'ferias' ? `Férias até ${formatarDataBR(ausencia.dataFim)}` : 'Folga de sábado'}${
                  ausencia.estado === 'pendente' ? ' · em análise' : ''
                }`
              : 'Folgas e férias aprovadas aparecem aqui'
          }
          acao={visiveis.has('pedir_ausencia') ? 'Minhas solicitações' : 'Ver férias'}
          aoAbrir={() => aoIrPara(visiveis.has('pedir_ausencia') ? 'pedir_ausencia' : 'minhas_ausencias')}
        />
        <CartaoDoDia
          id="inicio-documentos"
          rotulo="Meus documentos"
          icone={<FileText className="w-3.5 h-3.5" />}
          valor={pendenciasDoMeuRH ? `${pendenciasDoMeuRH} para você` : 'Tudo em dia'}
          detalhe={
            pendenciasDoMeuRH
              ? 'Holerite ou espelho para assinar, ou documento para dar ciência'
              : 'Holerites e documentos do RH ficam aqui'
          }
          acao="Abrir documentos"
          destaque={pendenciasDoMeuRH > 0}
          aoAbrir={() => aoIrPara('meus_documentos')}
        />
      </section>

      {/* Para o RH: o que espera uma decisão dele, com o atalho para onde se resolve */}
      {visiveis.has('painel_rh') && (
        <PainelRH
          colaboradorAtual={eu}
          secaoFixa="painel"
          aoAbrirSecao={(secao) => aoIrPara(TELA_DA_SECAO_DO_RH[secao] || 'inicio')}
        />
      )}
    </div>
  );
};
