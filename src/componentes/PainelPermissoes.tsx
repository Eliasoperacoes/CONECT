/**
 * Permissões de ferramenta — CONECTA / Malachias Autopeças
 *
 * A grade que decide quais telas cada nível enxerga. Linha = ferramenta,
 * coluna = nível.
 *
 * O aviso do topo não é enfeite: é a distinção que faz esta tela ser segura
 * de usar. Ligar uma ferramenta abre a PORTA; o que aparece dentro dela
 * continua preso à cadeia de responsabilidade e às regras do banco. Sem
 * isso escrito, o administrador marcaria uma caixinha achando que está
 * dando "acesso ao banco de horas da loja" e daria outra coisa.
 */
import React, { useMemo, useState } from 'react';
import {
  ShieldCheck,
  Check,
  AlertTriangle,
  RotateCcw,
  Lock,
  Info,
  Save,
} from 'lucide-react';
import {
  Colaborador,
  NivelHierarquico,
  NIVEIS_EM_ORDEM,
  ROTULO_NIVEL,
  DESCRICAO_NIVEL,
  ConfiguracaoSistema,
} from '../tipos';
import { FERRAMENTAS, ROTULO_AREA, AreaDaFerramenta } from '../servicos/ferramentas';
import {
  obterPermissoes,
  alternarNivel,
  restaurarPadrao,
  aplicarPermissoes,
  MapaDePermissoes,
} from '../servicos/permissoes';
import { bancoDados } from '../servicos/bancoDados';
import { nuvemComunicacao } from '../servicos/nuvemComunicacao';

interface Props {
  colaboradorAtual: Colaborador;
  configuracoes: ConfiguracaoSistema;
}

export const PainelPermissoes: React.FC<Props> = ({ colaboradorAtual, configuracoes }) => {
  const [mapa, setMapa] = useState<MapaDePermissoes>(() => obterPermissoes());
  const [sujo, setSujo] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [aviso, setAviso] = useState<{ texto: string; erro: boolean } | null>(null);

  const mostrar = (texto: string, erro = false) => {
    setAviso({ texto, erro });
    setTimeout(() => setAviso(null), 5000);
  };

  const porArea = useMemo(() => {
    const areas: AreaDaFerramenta[] = ['principal', 'gestao', 'administracao'];
    return areas.map((area) => ({
      area,
      ferramentas: FERRAMENTAS.filter((f) => f.area === area),
    }));
  }, []);

  const alternar = (chave: string, nivel: NivelHierarquico) => {
    const r = alternarNivel(mapa, chave, nivel);
    if (r.erro) {
      mostrar(r.erro, true);
      return;
    }
    setMapa(r.mapa);
    setSujo(true);
  };

  const salvar = async () => {
    setSalvando(true);

    // O banco primeiro: uma permissão que não subiu não pode parecer salva
    const res = await nuvemComunicacao.salvarConfiguracoes({
      ...configuracoes,
      permissoesFerramentas: mapa,
    });
    setSalvando(false);

    if (!res.sucesso) {
      mostrar(res.erro || 'Não foi possível salvar no banco.', true);
      return;
    }

    aplicarPermissoes(mapa);
    setSujo(false);
    bancoDados.registrarAuditoria(
      'Permissões de ferramenta',
      'seguranca',
      `${colaboradorAtual.nome} alterou quais telas cada nível enxerga.`
    );
    mostrar('Salvo. Vale para todos os aparelhos da rede.');
  };

  const voltarAoPadrao = () => {
    setMapa(restaurarPadrao());
    setSujo(true);
    mostrar('Padrão restaurado na tela. Clique em Salvar para valer na rede.');
  };

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h3 className="text-sm font-bold text-[var(--c-texto)] flex items-center gap-2">
          <ShieldCheck className="w-4 h-4" />
          Permissões de ferramenta
        </h3>
        <p className="text-xs text-[var(--c-texto-3)]">
          Quais telas cada nível enxerga. Vale para a rede inteira.
        </p>
      </div>

      {/* A distinção que faz esta tela ser segura de usar */}
      <div className="p-3 rounded-xl bg-blue-500/5 border border-blue-500/20 flex gap-2.5 text-xs text-[var(--c-texto-2)]">
        <Info className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" />
        <div className="flex flex-col gap-1">
          <span>
            <strong>Isto abre a porta, não o conteúdo.</strong> Ligar uma ferramenta para
            o gerente não passa a mostrar a rede inteira para ele.
          </span>
          <span>
            Quem ele vê na equipe, de quem aprova hora e qual saldo consegue abrir
            continua vindo do <strong>Organograma</strong> e das regras do banco — e não
            muda por marcar uma caixa aqui.
          </span>
        </div>
      </div>

      {aviso && (
        <div
          className={`p-3 rounded-xl text-xs font-semibold flex items-start gap-2 ${
            aviso.erro
              ? 'bg-red-500/10 border border-red-500/20 text-red-600'
              : 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-700'
          }`}
        >
          <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <span>{aviso.texto}</span>
        </div>
      )}

      {/* Legenda dos níveis, para quem configura saber o que cada um é */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2">
        {NIVEIS_EM_ORDEM.map((n) => (
          <div
            key={n}
            className="p-2 rounded-xl bg-[var(--c-canvas)] border border-[var(--c-borda)]"
          >
            <span className="text-[11px] font-bold text-[var(--c-texto)] block">
              N{n} · {ROTULO_NIVEL[n]}
            </span>
            <span className="text-[10px] text-[var(--c-texto-3)] leading-tight block">
              {DESCRICAO_NIVEL[n]}
            </span>
          </div>
        ))}
      </div>

      <div className="overflow-x-auto -mx-1 px-1">
        <table className="w-full min-w-[640px] text-xs border-collapse">
          <thead>
            <tr>
              <th className="text-left p-2 text-[var(--c-texto-3)] font-semibold">
                Ferramenta
              </th>
              {NIVEIS_EM_ORDEM.map((n) => (
                <th key={n} className="p-2 text-center text-[var(--c-texto-3)] font-semibold w-[72px]">
                  N{n}
                  <span className="block text-[10px] font-normal">{ROTULO_NIVEL[n]}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {porArea.map(({ area, ferramentas }) => (
              <React.Fragment key={area}>
                <tr>
                  <td
                    colSpan={NIVEIS_EM_ORDEM.length + 1}
                    className="pt-4 pb-1 text-[11px] font-bold text-[var(--c-texto-2)] uppercase tracking-wider"
                  >
                    {ROTULO_AREA[area]}
                  </td>
                </tr>

                {ferramentas.map((f) => (
                  <tr
                    key={f.chave}
                    className="border-t border-[var(--c-borda)] hover:bg-[var(--c-canvas)]"
                  >
                    <td className="p-2 align-top">
                      <span className="font-semibold text-[var(--c-texto)] block">
                        {f.nome}
                      </span>
                      <span className="text-[11px] text-[var(--c-texto-3)] block">
                        {f.descricao}
                      </span>
                      {f.cuidado && (
                        <span className="text-[11px] text-amber-600 flex items-start gap-1 mt-0.5">
                          <AlertTriangle className="w-3 h-3 flex-shrink-0 mt-0.5" />
                          {f.cuidado}
                        </span>
                      )}
                    </td>

                    {NIVEIS_EM_ORDEM.map((n) => {
                      const ligado = (mapa[f.chave] || []).includes(n);
                      const travado = !!f.sempreParaTI && n >= 5;

                      return (
                        <td key={n} className="p-2 text-center align-top">
                          <button
                            type="button"
                            onClick={() => alternar(f.chave, n)}
                            title={
                              travado
                                ? 'Não pode ser desligada do TI'
                                : ligado
                                ? `Tirar de ${ROTULO_NIVEL[n]}`
                                : `Dar para ${ROTULO_NIVEL[n]}`
                            }
                            className={`w-7 h-7 rounded-lg border flex items-center justify-center transition-all mx-auto ${
                              ligado
                                ? 'bg-emerald-600 border-emerald-600 text-white'
                                : 'bg-[var(--c-superficie)] border-[var(--c-borda)] text-transparent hover:border-[var(--c-borda-forte)]'
                            } ${travado ? 'opacity-70 cursor-not-allowed' : 'cursor-pointer'}`}
                          >
                            {travado ? (
                              <Lock className="w-3 h-3 text-white" />
                            ) : (
                              <Check className="w-3.5 h-3.5" />
                            )}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <button
          type="button"
          onClick={salvar}
          disabled={!sujo || salvando}
          className="px-4 py-2 rounded-xl bg-[var(--c-acento)] text-[var(--c-sobre-acento)] text-xs font-bold disabled:opacity-40 hover:brightness-110 transition-all flex items-center gap-1.5"
        >
          <Save className="w-3.5 h-3.5" />
          {salvando ? 'Salvando…' : 'Salvar para a rede'}
        </button>

        <button
          type="button"
          onClick={voltarAoPadrao}
          className="px-3 py-2 rounded-xl border border-[var(--c-borda)] text-xs font-bold text-[var(--c-texto-2)] hover:text-[var(--c-texto)] transition-colors flex items-center gap-1.5"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          Voltar ao padrão
        </button>

        {sujo && (
          <span className="text-[11px] text-amber-600 font-semibold">
            Alterações ainda não salvas — só valem depois de Salvar.
          </span>
        )}
      </div>
    </div>
  );
};
