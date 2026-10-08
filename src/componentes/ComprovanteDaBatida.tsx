/**
 * O COMPROVANTE DE UMA BATIDA, na tela — com baixar e compartilhar.
 *
 * Abre do "Ponto registrado" (logo depois de bater) e de cada batida do
 * dia no Meu ponto. O documento é o do banco (comprovanteDeBatida.ts):
 * a hora registrada na batida, mesmo que o horário tenha sido corrigido.
 */
import React, { useEffect, useState } from 'react';
import { Download, Share2, Loader2, ShieldCheck } from 'lucide-react';
import type { Colaborador, RegistroPonto } from '../tipos';
import {
  montarComprovante,
  linhasDoComprovante,
  codigoEmBlocos,
  gerarPdfDoComprovante,
  nomeDoArquivo,
  TITULO_DO_COMPROVANTE,
  type IdentificacaoDoRep,
} from '../servicos/comprovanteDeBatida';
import { carregarEstabelecimentos, soDigitos } from '../servicos/estabelecimentos';
import { nuvem } from '../servicos/nuvem';
import { usandoNuvem } from '../servicos/supabase';
import { baixarArquivo, compartilharArquivo } from '../servicos/compartilharArquivo';
import { FolhaInferior } from './FolhaInferior';

export const ComprovanteDaBatida: React.FC<{
  registro: RegistroPonto | null;
  colaborador: Colaborador;
  aoFechar: () => void;
}> = ({ registro, colaborador, aoFechar }) => {
  const [cpf, setCpf] = useState<string | null>(null);
  const [rep, setRep] = useState<IdentificacaoDoRep>({});
  const [ocupado, setOcupado] = useState<'baixar' | 'compartilhar' | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  // O CPF de quem bateu: só a própria pessoa e o RH o leem
  useEffect(() => {
    if (!registro || !usandoNuvem()) return;
    let vivo = true;
    nuvem.obterMeuCpf().then(({ cpf: c }) => vivo && setCpf(c));
    return () => {
      vivo = false;
    };
  }, [registro?.colaboradorId]);

  // A razão social do CNPJ da batida e o INPI do REP-P (art. 79, III e VII)
  useEffect(() => {
    if (!registro || !usandoNuvem()) return;
    let vivo = true;
    Promise.all([carregarEstabelecimentos(), nuvem.inpiDoRep()]).then(([lista, inpi]) => {
      if (!vivo) return;
      const doCnpj = lista.find((e) => e.cnpj === soDigitos(registro.cnpjEmpregador));
      setRep({ razaoSocial: doCnpj?.razaoSocial, inpi });
    });
    return () => {
      vivo = false;
    };
  }, [registro?.cnpjEmpregador]);
  useEffect(() => setAviso(null), [registro?.id]);

  if (!registro) return null;
  const dados = montarComprovante(registro, { nome: colaborador.nome, cpf }, rep);

  const baixar = async () => {
    setOcupado('baixar');
    const pdf = await gerarPdfDoComprovante(dados);
    baixarArquivo(pdf, nomeDoArquivo(dados), 'application/pdf');
    setOcupado(null);
  };

  const compartilhar = async () => {
    setOcupado('compartilhar');
    const pdf = await gerarPdfDoComprovante(dados);
    const r = await compartilharArquivo(pdf.buffer as ArrayBuffer, nomeDoArquivo(dados), 'application/pdf', 'Comprovante de ponto');
    setOcupado(null);
    if (r === 'baixado') setAviso('Este aparelho não compartilha arquivo: o comprovante foi baixado.');
    else if (r === 'atualizar_app') setAviso('Atualize o aplicativo para compartilhar. Por enquanto, use "Baixar PDF".');
    else if (r === 'falhou') setAviso('Não foi possível compartilhar. Tente "Baixar PDF".');
  };

  const botao =
    'flex-1 h-12 rounded-2xl text-sm font-bold flex items-center justify-center gap-2 transition disabled:opacity-60';

  return (
    <FolhaInferior
      aberto={!!registro}
      titulo="Comprovante de ponto"
      subtitulo={`${dados.marcacao} · ${dados.data} às ${dados.hora.slice(0, 5)}`}
      aoFechar={aoFechar}
      rodape={
        <div className="flex flex-col gap-2">
          {aviso && <p className="text-xs font-semibold text-[var(--c-texto-2)]">{aviso}</p>}
          <div className="flex gap-2">
            <button
              type="button"
              id="comprovante-baixar"
              onClick={baixar}
              disabled={ocupado !== null}
              className={`${botao} border border-[var(--c-borda)] bg-[var(--c-superficie)] text-[var(--c-texto)]`}
            >
              {ocupado === 'baixar' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              Baixar PDF
            </button>
            <button
              type="button"
              id="comprovante-compartilhar"
              onClick={compartilhar}
              disabled={ocupado !== null}
              className={`${botao} bg-[var(--c-marca)] text-[var(--c-sobre-marca)] shadow-md`}
            >
              {ocupado === 'compartilhar' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Share2 className="w-4 h-4" />}
              Compartilhar
            </button>
          </div>
        </div>
      }
    >
      <div className="p-5">
        <div className="rounded-2xl border border-[var(--c-borda)] bg-[var(--c-superficie)] overflow-hidden">
          <div className="px-4 py-3 bg-[var(--c-acento-suave)] flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-[var(--c-acento)]" />
            {/* O título do art. 79, I, como a Portaria o escreve: sem caixa alta do CSS */}
            <span className="text-xs font-bold text-[var(--c-acento)]">
              {TITULO_DO_COMPROVANTE}
            </span>
          </div>
          <dl className="divide-y divide-[var(--c-borda)]">
            {linhasDoComprovante(dados).map(([rotulo, valor]) => (
              <div key={rotulo} className="px-4 py-2.5 flex items-baseline justify-between gap-4">
                <dt className="text-[11px] font-bold uppercase tracking-wider text-[var(--c-texto-3)]">{rotulo}</dt>
                <dd
                  className={`text-sm text-right ${rotulo === 'NSR' || rotulo === 'Hora' ? 'font-bold tabular-nums' : ''} ${
                    valor.startsWith('Não informado') ? 'text-[var(--c-atencao)]' : 'text-[var(--c-texto)]'
                  }`}
                >
                  {valor}
                </dd>
              </div>
            ))}
          </dl>
          <div className="px-4 py-3 border-t border-[var(--c-borda)] bg-[var(--c-canvas)]">
            <span className="block text-[11px] font-bold uppercase tracking-wider text-[var(--c-texto-3)]">
              Código hash da marcação (SHA-256)
            </span>
            <span id="comprovante-codigo" className="mt-1 block font-mono text-xs leading-relaxed break-all text-[var(--c-texto-2)]">
              {codigoEmBlocos(dados.codigo)}
            </span>
          </div>
        </div>
        <p className="mt-3 text-[11px] leading-relaxed text-[var(--c-texto-3)]">
          Gravado no momento da batida e protegido no banco: uma correção de horário feita depois aparece no espelho, e
          este comprovante continua com o registro original.
        </p>
      </div>
    </FolhaInferior>
  );
};
