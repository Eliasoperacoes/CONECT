/**
 * A EQUIPE EM LINHAS — CONECTA / Malachias Autopeças
 *
 * O QUE ISTO SUBSTITUI, e por quê.
 *
 * Cada pessoa da equipe ocupava um cartão de uns 90 pixels, com foto de
 * 40, dois blocos de números e três botões. Num gerente com 23 pessoas
 * isso dava mais de dois metros de rolagem — e o cartão não dizia nada
 * que uma linha não diga.
 *
 * Agora é linha: 40 pixels, colunas alinhadas. Cabe o triplo na tela, e
 * COLUNA ALINHADA COMPARA — que é o que o gestor faz de verdade ali:
 * procurar quem está fora da curva. Trinta cartões empilhados não se
 * comparam entre si; trinta linhas, sim.
 *
 * AGRUPADO POR UNIDADE, e recolhível.
 *
 * Quem responde por mais de uma loja não lê 23 nomes seguidos — lê a
 * loja que tem problema. O cabeçalho do grupo carrega o que decide se
 * vale abrir: quantos são, o saldo somado e quantos estão devendo
 * batida. Recolhido, o bloco continua respondendo "preciso olhar aqui?".
 *
 * A UNIDADE DE QUEM ABRE NASCE ABERTA, e as outras fechadas. É a que
 * ele olha todo dia; obrigá-lo a abrir seria trocar rolagem por clique,
 * e não é isso que se pediu.
 */
import React, { useMemo, useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  Users,
  FileText,
  MessageSquare,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  Maximize2,
  Minimize2,
} from 'lucide-react';
import { Colaborador, ResumoPontoColaborador } from '../tipos';
import { formatarMinutos, formatarSaldo, servicoPonto } from '../servicos/ponto';
import { FotoPresenca } from './FotoPresenca';

interface Props {
  linhas: ResumoPontoColaborador[];
  colaboradorAtual: Colaborador;
  aoAbrirFicha: (c: Colaborador) => void;
  aoAbrirEspelho: (id: string) => void;
  aoAbrirConversa: (id: string) => void;
}

/** Saldo colorido pelo sinal: verde credita a pessoa, âmbar deve. */
const Saldo: React.FC<{ minutos: number; className?: string }> = ({
  minutos,
  className = '',
}) => (
  <span
    className={`font-bold tabular-nums ${
      minutos < 0 ? 'text-amber-600' : 'text-emerald-600'
    } ${className}`}
  >
    {formatarSaldo(minutos)}
  </span>
);

export const TabelaEquipe: React.FC<Props> = ({
  linhas,
  colaboradorAtual,
  aoAbrirFicha,
  aoAbrirEspelho,
  aoAbrirConversa,
}) => {
  /**
   * Os grupos, na ordem em que aparecem.
   *
   * A unidade de quem abre vem PRIMEIRO, e não em ordem alfabética: é a
   * que ele olha todo dia, e empurrá-la para baixo por causa da letra
   * inicial devolveria a rolagem que esta tela veio tirar.
   */
  const grupos = useMemo(() => {
    const porLoja = new Map<string, ResumoPontoColaborador[]>();
    for (const linha of linhas) {
      const chave = linha.colaborador.loja || 'Sem unidade';
      const lista = porLoja.get(chave) || [];
      lista.push(linha);
      porLoja.set(chave, lista);
    }

    return [...porLoja.entries()]
      .map(([loja, pessoas]) => ({
        loja,
        pessoas: pessoas.sort((a, b) =>
          a.colaborador.nome.localeCompare(b.colaborador.nome, 'pt-BR')
        ),
        /**
         * O cabeçalho do grupo responde "preciso olhar aqui?" — por isso
         * carrega o saldo somado e quem está devendo batida. Sem eles, o
         * bloco recolhido esconde justamente o que faz alguém abri-lo.
         */
        saldo: pessoas.reduce((t, p) => t + p.saldoAcumuladoMinutos, 0),
        semBater: pessoas.filter((p) => !p.registrouHoje).length,
        emAberto: pessoas.filter((p) => p.diasComPendencia > 0).length,
      }))
      .sort((a, b) => {
        if (a.loja === colaboradorAtual.loja) return -1;
        if (b.loja === colaboradorAtual.loja) return 1;
        return a.loja.localeCompare(b.loja, 'pt-BR');
      });
  }, [linhas, colaboradorAtual.loja]);

  /**
   * TUDO NASCE RECOLHIDO.
   *
   * A primeira versão abria a unidade de quem entra, com a ideia de
   * poupar um clique. Mas o pedido era tela limpa, e a unidade de quem
   * entra é justamente a maior — abrir nela é abrir com a rolagem que
   * esta tela veio tirar.
   *
   * Recolhido não é vazio: o cabeçalho de cada bloco continua dizendo
   * quantos são, o saldo somado e quem está devendo batida. A tela
   * inteira cabe numa olhada, e abre-se só o que interessa.
   *
   * Guardamos os ABERTOS, e não os fechados — é o inverso de antes,
   * pelo mesmo motivo de sempre: o conjunto guardado tem que ser o
   * pequeno, para que uma loja que apareça depois caia no padrão em vez
   * de aparecer no estado errado.
   */
  const [abertos, setAbertos] = useState<Set<string>>(() => new Set());

  const alternar = (loja: string) =>
    setAbertos((atual) => {
      const novo = new Set(atual);
      if (novo.has(loja)) novo.delete(loja);
      else novo.add(loja);
      return novo;
    });

  const tudoFechado = grupos.every((g) => !abertos.has(g.loja));

  const alternarTudo = () =>
    setAbertos(tudoFechado ? new Set(grupos.map((g) => g.loja)) : new Set());

  if (linhas.length === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      {/* Só faz sentido com mais de um grupo: com um, o botão do grupo basta */}
      {grupos.length > 1 && (
        <button
          type="button"
          onClick={alternarTudo}
          className="self-end px-2.5 py-1.5 rounded-lg border border-[var(--c-borda)] text-[11px] font-bold text-[var(--c-texto-2)] hover:text-[var(--c-texto)] flex items-center gap-1.5 transition-colors"
        >
          {tudoFechado ? (
            <>
              <Maximize2 className="w-3.5 h-3.5" /> Expandir tudo
            </>
          ) : (
            <>
              <Minimize2 className="w-3.5 h-3.5" /> Recolher tudo
            </>
          )}
        </button>
      )}

      {grupos.map((grupo) => {
        const aberto = abertos.has(grupo.loja);

        return (
          <div
            key={grupo.loja}
            className="rounded-2xl bg-[var(--c-superficie)] border border-[var(--c-borda)] overflow-hidden"
          >
            <button
              type="button"
              onClick={() => alternar(grupo.loja)}
              className="w-full px-3.5 py-2.5 flex items-center gap-2.5 hover:bg-[var(--c-superficie-2)] transition-colors text-left"
            >
              {aberto ? (
                <ChevronDown className="w-4 h-4 text-[var(--c-texto-3)] shrink-0" />
              ) : (
                <ChevronRight className="w-4 h-4 text-[var(--c-texto-3)] shrink-0" />
              )}

              <span className="text-sm font-bold text-[var(--c-texto)] truncate">
                {grupo.loja}
              </span>
              <span className="text-[11px] text-[var(--c-texto-3)] shrink-0">
                {grupo.pessoas.length}
              </span>

              <div className="flex-1" />

              {/* Recolhido, estes três números continuam decidindo se vale abrir */}
              {grupo.semBater > 0 && (
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded border bg-amber-500/10 text-amber-700 border-amber-500/20 shrink-0">
                  {grupo.semBater} sem bater
                </span>
              )}
              {grupo.emAberto > 0 && (
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded border bg-red-500/10 text-red-600 border-red-500/20 shrink-0">
                  {grupo.emAberto} em aberto
                </span>
              )}

              <span className="flex items-center gap-1 shrink-0">
                <span className="text-[10px] text-[var(--c-texto-3)]">banco</span>
                <Saldo minutos={grupo.saldo} className="text-xs" />
              </span>
            </button>

            {aberto && (
              <div className="border-t border-[var(--c-borda)] overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-[10px] font-bold uppercase tracking-wider text-[var(--c-texto-3)] border-b border-[var(--c-borda)]">
                      <th className="text-left font-bold px-3 py-1.5">Pessoa</th>
                      <th className="text-right font-bold px-2 py-1.5 whitespace-nowrap">
                        Trabalhadas
                      </th>
                      <th className="text-right font-bold px-2 py-1.5 whitespace-nowrap">
                        No período
                      </th>
                      <th className="text-right font-bold px-2 py-1.5 whitespace-nowrap">
                        Banco
                      </th>
                      <th className="px-2 py-1.5" />
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-[var(--c-borda)]">
                    {grupo.pessoas.map((r) => {
                      const c = r.colaborador;
                      const pendente = servicoPonto.obterSaldoPendente(c.id);

                      return (
                        <tr
                          key={c.id}
                          className="hover:bg-[var(--c-superficie-2)] transition-colors"
                        >
                          <td className="px-3 py-1.5">
                            <div className="flex items-center gap-2 min-w-0">
                              <FotoPresenca
                                foto={c.foto}
                                nome={c.nome}
                                presenca={c.presenca}
                                tamanho="w-7 h-7"
                              />
                              <div className="min-w-0">
                                <span className="block font-bold text-[var(--c-texto)] truncate leading-tight">
                                  {c.nome}
                                </span>
                                <span className="block text-[10px] text-[var(--c-texto-3)] truncate leading-tight">
                                  {c.cargo}
                                  {/* Os avisos entram AQUI, na linha da pessoa,
                                      e não como etiqueta solta: em tabela, o
                                      que não está numa coluna some */}
                                  {!r.registrouHoje && ' · sem bater hoje'}
                                </span>
                              </div>

                              {r.diasComPendencia > 0 && (
                                <span
                                  className="shrink-0 inline-flex items-center gap-0.5 text-[10px] font-bold text-red-600"
                                  title={`${r.diasComPendencia} dia(s) iniciados e não fechados`}
                                >
                                  <AlertTriangle className="w-3 h-3" />
                                  {r.diasComPendencia}
                                </span>
                              )}
                            </div>
                          </td>

                          <td className="px-2 py-1.5 text-right tabular-nums text-[var(--c-texto-2)] whitespace-nowrap">
                            {formatarMinutos(r.minutosTrabalhados)}
                          </td>

                          <td className="px-2 py-1.5 text-right whitespace-nowrap">
                            <Saldo minutos={r.saldoPeriodoMinutos} />
                          </td>

                          <td className="px-2 py-1.5 text-right whitespace-nowrap">
                            <span className="inline-flex items-center gap-1 justify-end">
                              {r.saldoAcumuladoMinutos >= 0 ? (
                                <TrendingUp className="w-3 h-3 text-emerald-600" />
                              ) : (
                                <TrendingDown className="w-3 h-3 text-amber-600" />
                              )}
                              <Saldo minutos={r.saldoAcumuladoMinutos} />
                            </span>
                            {pendente !== 0 && (
                              <span
                                className="block text-[10px] text-amber-600 font-semibold leading-tight"
                                title="Esperando a sua decisão"
                              >
                                {formatarSaldo(pendente)} esperando
                              </span>
                            )}
                          </td>

                          <td className="px-2 py-1.5">
                            <div className="flex items-center gap-1 justify-end">
                              <button
                                type="button"
                                onClick={() => aoAbrirFicha(c)}
                                title="Ver ficha completa"
                                className="p-1.5 rounded-lg border border-[var(--c-borda)] text-[var(--c-texto-2)] hover:text-[var(--c-texto)] transition-colors"
                              >
                                <Users className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => aoAbrirEspelho(c.id)}
                                title="Espelho de ponto do período"
                                className="p-1.5 rounded-lg border border-[var(--c-borda)] text-[var(--c-texto-2)] hover:text-[var(--c-texto)] transition-colors"
                              >
                                <FileText className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => aoAbrirConversa(c.id)}
                                title="Falar com a pessoa"
                                className="p-1.5 rounded-lg bg-[var(--c-acento)] text-[var(--c-sobre-acento)] hover:brightness-110 transition-all"
                              >
                                <MessageSquare className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};
