/**
 * A FICHA RÁPIDA — a mini janela de uma pessoa, aberta pela busca do topo.
 *
 * Pedido do Elias (06/10/2026): "ao clicar sobre o usuário deve abrir uma
 * mini janela com atalhos (espelho, folha…) para facilitar a utilização".
 *
 * CADA ATALHO SÓ APARECE PARA QUEM JÁ PODE FAZER AQUILO, pela regra que já
 * existe — nenhuma regra nova de acesso mora aqui:
 *
 *   Conversar ............ todos (menos consigo mesmo)
 *   Espelho e saldo ...... quem enxerga o ponto da pessoa (`obterColaboradoresVisiveis`)
 *   Folha (holerite) ..... quem tem a tela Holerites (`telasQueVejo`)
 *   Ficha (cadastro) ..... quem gerencia pessoas (`podeGerenciarPessoas`)
 *
 * E o banco ainda confere cada dado (RLS): o atalho que escapasse daqui
 * abriria vazio, não o dado de outra pessoa.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { X, MessageSquare, FileClock, Receipt, UserCog, Loader2, Wallet } from 'lucide-react';
import { Colaborador } from '../tipos';
import type { TelaId } from '../servicos/telasPorAssunto';
import { bancoDados } from '../servicos/bancoDados';
import { servicoPonto, dataDeHoje, formatarSaldo } from '../servicos/ponto';
import { mesesFechados, periodoDoMes, rotuloDoMes } from '../servicos/meuRH';
import { assinaturasDoEspelho, listarRecebimentos } from '../servicos/assinatura';
import { listarHolerites, abrirDocumento, gerarComprovantes } from '../servicos/rh';
import { mostrarDocumento, mostrarPdf, mostrarPdfGerado } from '../servicos/visorDeDocumento';
import { nuvem } from '../servicos/nuvem';
import { usandoNuvem } from '../servicos/supabase';
import { useVoltar } from '../servicos/voltar';
import { AvatarSuave } from './PadraoWeb';
import { ModalCadastroColaborador } from './ModalCadastroColaborador';

/** Um atalho: ícone, o que faz, e a linha que diz de quê. */
const Atalho: React.FC<{
  id: string;
  icone: React.ReactNode;
  titulo: string;
  detalhe: string;
  aoTocar: () => void;
  ocupado?: boolean;
}> = ({ id, icone, titulo, detalhe, aoTocar, ocupado }) => (
  <button
    type="button"
    id={id}
    onClick={aoTocar}
    disabled={ocupado}
    className="group flex items-center gap-3 rounded-xl border border-[var(--c-borda)] bg-[var(--c-superficie)] p-3 text-left transition hover:border-[var(--c-acento)] hover:shadow-[var(--s-1)] disabled:opacity-60"
  >
    <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-[var(--c-acento-suave)] text-[var(--c-acento)]">
      {ocupado ? <Loader2 className="h-4 w-4 animate-spin" /> : icone}
    </span>
    <span className="min-w-0">
      <span className="block text-sm font-bold text-[var(--c-texto)] group-hover:text-[var(--c-acento)]">{titulo}</span>
      <span className="block truncate text-[11px] text-[var(--c-texto-3)]">{detalhe}</span>
    </span>
  </button>
);

export const FichaRapida: React.FC<{
  pessoa: Colaborador;
  colaboradorAtual: Colaborador;
  /** As telas de quem abriu (`telasQueVejo`). */
  visiveis: Set<TelaId>;
  aoFechar: () => void;
  aoConversar: (colaboradorId: string) => void;
}> = ({ pessoa, colaboradorAtual, visiveis, aoFechar, aoConversar }) => {
  useVoltar(true, aoFechar);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [emCadastro, setEmCadastro] = useState(false);

  // Esc fecha, como toda janela
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !emCadastro) aoFechar();
    };
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  }, [aoFechar, emCadastro]);

  const hoje = dataDeHoje();
  const souEu = pessoa.id === colaboradorAtual.id;
  const vePonto = useMemo(
    () => servicoPonto.obterColaboradoresVisiveis().some((c) => c.id === pessoa.id),
    [pessoa.id]
  );
  const veFolha = visiveis.has('holerites');
  const editaFicha = bancoDados.podeGerenciarPessoas(colaboradorAtual);
  const saldo = vePonto ? servicoPonto.obterSaldoAcumulado(pessoa.id) : null;
  const mesAtual = hoje.slice(0, 7);
  const ultimoFechado = mesesFechados(hoje, pessoa.dataAdmissao)[0];

  /** O espelho do mês, com as assinaturas — o mesmo documento do RH. */
  const abrirEspelho = async (mes: string, chave: string) => {
    setOcupado(chave);
    setAviso(null);
    const periodo = periodoDoMes(mes);
    const fim = mes === mesAtual ? hoje : periodo.fim;
    if (usandoNuvem()) await nuvem.sincronizarPonto({ inicio: periodo.inicio, fim });
    const assinaturas = await assinaturasDoEspelho([pessoa.id], mes);
    setOcupado(null);
    if (!mostrarDocumento(servicoPonto.gerarHtmlEspelho(periodo.inicio, fim, [pessoa.id], assinaturas))) {
      setAviso('Permita as janelas pop-up para abrir o espelho.');
    }
  };

  /** O último holerite: o assinado com o carimbo; o publicado, se ainda não assinou. */
  const abrirFolha = async () => {
    setOcupado('folha');
    setAviso(null);
    const [maisNovo] = (await listarHolerites(pessoa.id)).sort((a, b) => b.competencia.localeCompare(a.competencia));
    if (!maisNovo) {
      setOcupado(null);
      return setAviso('Nenhum holerite publicado para esta pessoa.');
    }
    const titulo = `Holerite · ${pessoa.nome} · ${rotuloDoMes(maisNovo.competencia)}`;
    const recebimento = (await listarRecebimentos({ holeriteIds: [maisNovo.id] })).get(maisNovo.id);
    if (recebimento) {
      const res = await gerarComprovantes([{ holerite: maisNovo, recebimento, nome: pessoa.nome }]);
      setOcupado(null);
      if (!res.pdf) return setAviso(res.erro || 'Não foi possível montar o holerite assinado.');
      return mostrarPdfGerado(res.pdf, titulo, `Holerite assinado ${pessoa.nome} ${maisNovo.competencia}.pdf`);
    }
    const url = await abrirDocumento(maisNovo.arquivoCaminho);
    setOcupado(null);
    if (!url) return setAviso('Não foi possível abrir o holerite. Tente de novo em instantes.');
    mostrarPdf(url, titulo, maisNovo.arquivoNome);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/30 px-4 pt-24"
      onMouseDown={(e) => e.target === e.currentTarget && aoFechar()}
    >
      <section
        id="ficha-rapida"
        role="dialog"
        aria-label={`Atalhos de ${pessoa.nome}`}
        className="w-full max-w-md rounded-2xl border border-[var(--c-borda)] bg-[var(--c-superficie)] shadow-[var(--s-3)]"
      >
        <header className="flex items-start gap-3 border-b border-[var(--c-borda)] p-5">
          <AvatarSuave nome={pessoa.nome} foto={pessoa.foto} grande />
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-base font-extrabold text-[var(--c-texto)]">{pessoa.nome}</h2>
            <p className="truncate text-xs text-[var(--c-texto-3)]">
              {pessoa.cargo} · {pessoa.setor} · {pessoa.loja}
            </p>
            {saldo !== null && (
              <p className="mt-1.5 inline-flex items-center gap-1 text-xs text-[var(--c-texto-2)]">
                <Wallet className="h-3.5 w-3.5" />
                Banco de horas:{' '}
                <strong className={saldo < 0 ? 'text-[var(--c-erro)]' : 'text-[var(--c-ok)]'}>{formatarSaldo(saldo)}</strong>
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={aoFechar}
            aria-label="Fechar"
            className="rounded-lg p-1.5 text-[var(--c-texto-3)] hover:bg-[var(--c-superficie-2)] hover:text-[var(--c-texto)]"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="grid grid-cols-1 gap-2 p-4 sm:grid-cols-2">
          {!souEu && (
            <Atalho
              id="ficha-rapida-conversar"
              icone={<MessageSquare className="h-4 w-4" />}
              titulo="Conversar"
              detalhe="Abrir a conversa"
              aoTocar={() => {
                aoFechar();
                aoConversar(pessoa.id);
              }}
            />
          )}
          {vePonto && (
            <Atalho
              id="ficha-rapida-espelho"
              icone={<FileClock className="h-4 w-4" />}
              titulo="Espelho do mês"
              detalhe={`${rotuloDoMes(mesAtual).split(' ')[0]}, até hoje`}
              ocupado={ocupado === 'espelho-atual'}
              aoTocar={() => abrirEspelho(mesAtual, 'espelho-atual')}
            />
          )}
          {vePonto && ultimoFechado && (
            <Atalho
              id="ficha-rapida-espelho-fechado"
              icone={<FileClock className="h-4 w-4" />}
              titulo="Espelho fechado"
              detalhe={rotuloDoMes(ultimoFechado)}
              ocupado={ocupado === 'espelho-fechado'}
              aoTocar={() => abrirEspelho(ultimoFechado, 'espelho-fechado')}
            />
          )}
          {veFolha && (
            <Atalho
              id="ficha-rapida-folha"
              icone={<Receipt className="h-4 w-4" />}
              titulo="Folha"
              detalhe="Último holerite"
              ocupado={ocupado === 'folha'}
              aoTocar={abrirFolha}
            />
          )}
          {editaFicha && (
            <Atalho
              id="ficha-rapida-cadastro"
              icone={<UserCog className="h-4 w-4" />}
              titulo="Ficha"
              detalhe="Cadastro e turno"
              aoTocar={() => setEmCadastro(true)}
            />
          )}
        </div>

        {aviso && <p className="px-5 pb-4 text-xs font-semibold text-[var(--c-erro)]">{aviso}</p>}
        {souEu && !vePonto && !veFolha && !editaFicha && (
          <p className="px-5 pb-5 text-xs text-[var(--c-texto-3)]">É você. Os seus documentos ficam em Documentos.</p>
        )}
      </section>

      {emCadastro && <ModalCadastroColaborador colaborador={pessoa} aoFechar={() => setEmCadastro(false)} />}
    </div>
  );
};
