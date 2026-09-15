import React, { useState, useRef } from 'react';
import { NIVEL_TI, NIVEL_GERENTE } from '../tipos';
import {
  FileSpreadsheet,
  Download,
  UploadCloud,
  FileCheck,
  AlertCircle,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Users,
  Shield,
  HelpCircle,
  Building2,
  FileText,
  Sparkles,
  ArrowRight,
} from 'lucide-react';
import { Colaborador, Loja, Setor, NivelHierarquico } from '../tipos';
import {
  baixarPlanilhaModeloExcel,
  baixarPlanilhaModeloCSV,
  processarArquivoPlanilha,
  ResultadoProcessamentoPlanilha,
  LinhaPlanilhaProcessada,
} from '../servicos/planilhaFuncionarios';
import { bancoDados } from '../servicos/bancoDados';

interface PropsImportacaoPlanilhaFuncionarios {
  colaboradoresAtuais: Colaborador[];
  aoConcluirImportacao: (mensagem: string) => void;
  aoIrParaColaboradores: () => void;
}

export const ImportacaoPlanilhaFuncionarios: React.FC<PropsImportacaoPlanilhaFuncionarios> = ({
  colaboradoresAtuais,
  aoConcluirImportacao,
  aoIrParaColaboradores,
}) => {
  const [estaProcessando, setEstaProcessando] = useState(false);
  const [resultado, setResultado] = useState<ResultadoProcessamentoPlanilha | null>(null);
  const [erroProcessamento, setErroProcessamento] = useState<string | null>(null);
  const [atualizarExistentes, setAtualizarExistentes] = useState(true);
  const [filtroVisualizacao, setFiltroVisualizacao] = useState<'todas' | 'validas' | 'erros'>('todas');
  const [importandoBanco, setImportandoBanco] = useState(false);
  const [sucessoImportacao, setSucessoImportacao] = useState<{
    criados: number;
    atualizados: number;
    ignorados: number;
  } | null>(null);

  const [arrastandoSobre, setArrastandoSobre] = useState(false);
  const inputArquivoRef = useRef<HTMLInputElement>(null);

  // Manipular arquivo selecionado
  const lidarComArquivo = async (arquivo: File) => {
    setErroProcessamento(null);
    setSucessoImportacao(null);
    setEstaProcessando(true);

    try {
      const ext = arquivo.name.split('.').pop()?.toLowerCase();
      if (!['xlsx', 'xls', 'csv'].includes(ext || '')) {
        throw new Error('Formato inválido. Por favor, envie um arquivo .xlsx, .xls ou .csv.');
      }

      const res = await processarArquivoPlanilha(arquivo, colaboradoresAtuais);
      setResultado(res);
    } catch (err: any) {
      setErroProcessamento(err.message || 'Erro ao processar o arquivo de planilha.');
      setResultado(null);
    } finally {
      setEstaProcessando(false);
    }
  };

  const lidarComDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setArrastandoSobre(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      lidarComArquivo(e.dataTransfer.files[0]);
    }
  };

  const lidarComDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setArrastandoSobre(true);
  };

  const lidarComDragLeave = () => {
    setArrastandoSobre(false);
  };

  // Confirmar importação das linhas válidas
  const confirmarImportacao = () => {
    if (!resultado) return;

    const linhasValidas = resultado.linhas.filter((l) => l.valida);
    if (linhasValidas.length === 0) {
      setErroProcessamento('Nenhuma linha válida para importar.');
      return;
    }

    setImportandoBanco(true);
    try {
      const dadosParaGravar = linhasValidas.map((l) => l.dados);
      const res = bancoDados.importarColaboradoresEmLote(dadosParaGravar, atualizarExistentes);

      if (res.sucesso) {
        setSucessoImportacao({
          criados: res.criados,
          atualizados: res.atualizados,
          ignorados: res.ignorados,
        });
        aoConcluirImportacao(
          `Importação concluída: ${res.criados} colaboradores criados, ${res.atualizados} atualizados.`
        );
      } else {
        setErroProcessamento(res.erros.join('; ') || 'Falha na importação.');
      }
    } catch (err: any) {
      setErroProcessamento(err.message || 'Erro ao gravar dados no sistema.');
    } finally {
      setImportandoBanco(false);
    }
  };

  // Linhas filtradas para exibição no preview
  const linhasExibidas = resultado
    ? resultado.linhas.filter((l) => {
        if (filtroVisualizacao === 'validas') return l.valida;
        if (filtroVisualizacao === 'erros') return !l.valida || l.avisos.length > 0;
        return true;
      })
    : [];

  return (
    <div className="space-y-6" id="secao-importacao-excel-funcionarios">
      {/* Cabeçalho explicativo */}
      <div className="bg-[var(--c-superficie)] p-5 rounded-2xl border border-[var(--c-borda)] shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center border border-emerald-500/20 shadow-xs flex-shrink-0">
              <FileSpreadsheet className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-bold text-[var(--c-texto)] tracking-tight">
                  Importação de Funcionários via Excel (.xlsx)
                </h2>
                <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">
                  Lote & RH
                </span>
              </div>
              <p className="text-xs text-[var(--c-texto-3)] mt-1 max-w-3xl leading-relaxed">
                Baixe a planilha modelo oficial com todas as colunas necessárias, preencha os dados dos funcionários das 5 filiais da Malachias Autopeças e suba o arquivo para cadastrar os colaboradores de forma rápida e segura.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              type="button"
              onClick={aoIrParaColaboradores}
              className="px-3.5 py-2 rounded-xl bg-[var(--c-superficie-2)] border border-[var(--c-borda)] text-xs font-semibold text-[var(--c-texto)] hover:bg-[var(--c-canvas)] flex items-center gap-1.5 transition-all"
            >
              <Users className="w-4 h-4 text-[var(--c-texto-3)]" />
              <span>Ver Quadro Atual ({colaboradoresAtuais.length})</span>
            </button>
          </div>
        </div>
      </div>

      {/* Sucesso após importação */}
      {sucessoImportacao && (
        <div className="p-5 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-950 dark:text-emerald-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4 animate-in fade-in">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center flex-shrink-0">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-emerald-700 dark:text-emerald-300">
                Planilha Importada com Sucesso!
              </h3>
              <p className="text-xs text-emerald-600 dark:text-emerald-400">
                {sucessoImportacao.criados} novos funcionários cadastrados,{' '}
                {sucessoImportacao.atualizados} colaboradores atualizados e{' '}
                {sucessoImportacao.ignorados} mantidos. Todos os acessos e canais foram configurados.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={aoIrParaColaboradores}
              className="px-4 py-2 rounded-xl bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700 shadow-sm flex items-center gap-1.5 transition-all"
            >
              <span>Ir para Colaboradores</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => {
                setResultado(null);
                setSucessoImportacao(null);
              }}
              className="px-3 py-2 rounded-xl bg-white dark:bg-emerald-900 border border-emerald-500/30 text-xs font-semibold text-emerald-700 dark:text-emerald-300 hover:bg-emerald-50 transition-all"
            >
              Importar Outra Planilha
            </button>
          </div>
        </div>
      )}

      {/* Grid de 2 Etapas: 1) Download do Modelo | 2) Upload da Planilha */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Bloco 1: Download da Planilha Modelo */}
        <div className="lg:col-span-5 bg-[var(--c-superficie)] p-5 rounded-2xl border border-[var(--c-borda)] shadow-sm flex flex-col justify-between">
          <div className="space-y-4">
            <div className="flex items-center gap-2.5">
              <span className="w-6 h-6 rounded-full bg-emerald-600 text-white font-bold text-xs flex items-center justify-center">
                1
              </span>
              <h3 className="text-sm font-bold text-[var(--c-texto)]">
                Baixar Planilha Modelo Oficial
              </h3>
            </div>

            <p className="text-xs text-[var(--c-texto-3)] leading-relaxed">
              O arquivo modelo já vem formatado com os cabeçalhos corretos e 5 exemplos práticos de preenchimento para as unidades de Pirassununga, Porto Ferreira, Palmeiras, Descalvado e Santa Rita.
            </p>

            <div className="space-y-2.5 pt-2">
              <button
                type="button"
                id="botao-baixar-modelo-excel"
                onClick={baixarPlanilhaModeloExcel}
                className="w-full py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-sm transition-all hover:scale-[1.01] active:scale-[0.99]"
              >
                <Download className="w-4 h-4" />
                <span>Baixar Planilha Modelo Excel (.XLSX)</span>
              </button>

              <button
                type="button"
                id="botao-baixar-modelo-csv"
                onClick={baixarPlanilhaModeloCSV}
                className="w-full py-2.5 px-4 rounded-xl bg-[var(--c-superficie-2)] border border-[var(--c-borda)] text-[var(--c-texto)] hover:bg-[var(--c-canvas)] font-semibold text-xs flex items-center justify-center gap-2 transition-all"
              >
                <FileText className="w-3.5 h-3.5 text-[var(--c-texto-3)]" />
                <span>Baixar Alternativa em (.CSV)</span>
              </button>
            </div>

            {/* Resumo dos Campos Requeridos */}
            <div className="pt-3 border-t border-[var(--c-borda)] space-y-3">
              <span className="text-[11px] font-bold text-[var(--c-texto-2)] block uppercase tracking-wider">
                Colunas Necessárias na Planilha:
              </span>

              <div className="space-y-2 text-xs">
                <div className="p-2.5 rounded-xl bg-[var(--c-superficie-2)] border border-[var(--c-borda)]">
                  <div className="font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5 mb-1">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Campos Obrigatórios</span>
                  </div>
                  <p className="text-[11px] text-[var(--c-texto-3)] leading-relaxed">
                    <strong>Nome Completo</strong>, <strong>Login de Acesso</strong>, <strong>Cargo / Função</strong>, <strong>Loja / Filial</strong>, <strong>Setor</strong> e <strong>Nível de Acesso</strong> (1=Colaborador, 2=Supervisor, 3=Gestor, 4=Administrador).
                  </p>
                </div>

                <div className="p-2.5 rounded-xl bg-[var(--c-superficie-2)] border border-[var(--c-borda)]">
                  <div className="font-semibold text-indigo-600 dark:text-indigo-400 flex items-center gap-1.5 mb-1">
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Campos Opcionais</span>
                  </div>
                  <p className="text-[11px] text-[var(--c-texto-3)] leading-relaxed">
                    Senha Inicial (se vazia: <code>123</code>), Ramal interno, Telefone/WhatsApp, E-mail, Matrícula, Data de Admissão e Observações.
                  </p>
                </div>

                <div className="p-2.5 rounded-xl bg-[var(--c-superficie-2)] border border-[var(--c-borda)]">
                  <div className="font-semibold text-[var(--c-texto)] flex items-center gap-1.5 mb-1">
                    <Building2 className="w-3.5 h-3.5 text-amber-500" />
                    <span>Lojas da Rede</span>
                  </div>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {['Pirassununga', 'Porto Ferreira', 'Palmeiras', 'Descalvado', 'Santa Rita', 'Rede'].map((l) => (
                      <span
                        key={l}
                        className="px-1.5 py-0.5 rounded bg-[var(--c-canvas)] text-[10px] font-medium border border-[var(--c-borda)] text-[var(--c-texto-2)]"
                      >
                        {l}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-[var(--c-borda)] flex items-center gap-2 text-[11px] text-[var(--c-texto-3)]">
            <Shield className="w-3.5 h-3.5 text-indigo-600" />
            <span>A conta do Administrador Geral Elias sempre mantém acesso total.</span>
          </div>
        </div>

        {/* Bloco 2: Subir Planilha Preenchida */}
        <div className="lg:col-span-7 bg-[var(--c-superficie)] p-5 rounded-2xl border border-[var(--c-borda)] shadow-sm flex flex-col justify-between">
          <div className="space-y-4">
            <div className="flex items-center gap-2.5">
              <span className="w-6 h-6 rounded-full bg-indigo-600 text-white font-bold text-xs flex items-center justify-center">
                2
              </span>
              <h3 className="text-sm font-bold text-[var(--c-texto)]">
                Subir Planilha Preenchida
              </h3>
            </div>

            <p className="text-xs text-[var(--c-texto-3)] leading-relaxed">
              Arraste o arquivo Excel (.xlsx, .xls) ou clique na área abaixo. O sistema fará a leitura instantânea dos funcionários, conferindo os dados antes de gravar.
            </p>

            {/* Dropzone */}
            <div
              onDrop={lidarComDrop}
              onDragOver={lidarComDragOver}
              onDragLeave={lidarComDragLeave}
              onClick={() => inputArquivoRef.current?.click()}
              className={`p-8 rounded-2xl border-2 border-dashed text-center cursor-pointer transition-all flex flex-col items-center justify-center min-h-[220px] ${
                arrastandoSobre
                  ? 'border-emerald-500 bg-emerald-500/5 scale-[1.01]'
                  : 'border-[var(--c-borda)] hover:border-emerald-500/50 hover:bg-[var(--c-superficie-2)]'
              }`}
            >
              <input
                ref={inputArquivoRef}
                type="file"
                accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files && e.target.files[0]) {
                    lidarComArquivo(e.target.files[0]);
                  }
                }}
              />

              {estaProcessando ? (
                <div className="flex flex-col items-center gap-3">
                  <RefreshCw className="w-8 h-8 text-emerald-600 animate-spin" />
                  <span className="text-xs font-bold text-[var(--c-texto)]">
                    Lendo linhas da planilha Excel...
                  </span>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-3">
                  <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center shadow-xs">
                    <UploadCloud className="w-7 h-7" />
                  </div>
                  <div>
                    <span className="text-sm font-bold text-[var(--c-texto)] block">
                      Clique para selecionar ou arraste sua planilha aqui
                    </span>
                    <span className="text-xs text-[var(--c-texto-3)] mt-0.5 block">
                      Suporta arquivos .XLSX, .XLS ou .CSV
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Mensagem de Erro */}
            {erroProcessamento && (
              <div className="p-3.5 rounded-xl bg-red-500/10 border border-red-500/20 text-xs text-red-600 flex items-start gap-2.5 animate-in fade-in">
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <div>
                  <strong className="block font-bold">Aviso na Leitura:</strong>
                  <span>{erroProcessamento}</span>
                </div>
              </div>
            )}
          </div>

          <div className="mt-4 pt-3 border-t border-[var(--c-borda)] flex items-center justify-between text-xs text-[var(--c-texto-3)]">
            <span>Dúvidas com formato? Baixe o modelo na etapa 1.</span>
            <span className="font-mono text-[10px]">SheetJS / XLSX Integrado</span>
          </div>
        </div>
      </div>

      {/* Pré-visualização e Conferência dos Dados Lidos */}
      {resultado && (
        <div
          id="preview-importacao-funcionarios"
          className="bg-[var(--c-superficie)] p-5 rounded-2xl border border-[var(--c-borda)] shadow-sm space-y-4 animate-in fade-in"
        >
          {/* Barra de Status do Arquivo Lido */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-[var(--c-borda)]">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center flex-shrink-0 shadow-xs">
                <FileCheck className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-bold text-[var(--c-texto)]">
                    {resultado.nomeArquivo}
                  </h3>
                  <span className="text-[10px] bg-emerald-500/10 text-emerald-600 font-mono px-2 py-0.5 rounded-full font-bold">
                    {resultado.totalLinhas} linhas identificadas
                  </span>
                </div>
                <div className="flex items-center gap-3 text-xs text-[var(--c-texto-3)] mt-0.5">
                  <span className="text-emerald-600 font-semibold">
                    ✓ {resultado.linhasValidas} válidas
                  </span>
                  {resultado.novosCadastros > 0 && (
                    <span className="text-indigo-600 font-medium">
                      + {resultado.novosCadastros} novos
                    </span>
                  )}
                  {resultado.atualizacoes > 0 && (
                    <span className="text-amber-600 font-medium">
                      ↻ {resultado.atualizacoes} atualizações
                    </span>
                  )}
                  {resultado.linhasComErro > 0 && (
                    <span className="text-red-600 font-bold">
                      ⚠ {resultado.linhasComErro} com pendências
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Opções de Importação */}
            <div className="flex items-center gap-3 flex-wrap">
              <label className="flex items-center gap-2 text-xs font-semibold text-[var(--c-texto-2)] cursor-pointer select-none bg-[var(--c-superficie-2)] px-3 py-1.5 rounded-xl border border-[var(--c-borda)]">
                <input
                  type="checkbox"
                  checked={atualizarExistentes}
                  onChange={(e) => setAtualizarExistentes(e.target.checked)}
                  className="rounded text-emerald-600 focus:ring-emerald-500"
                />
                <span>Atualizar funcionários se login já existir</span>
              </label>

              <button
                type="button"
                onClick={() => setResultado(null)}
                className="px-3 py-1.5 rounded-xl text-xs font-semibold text-[var(--c-texto-3)] hover:text-[var(--c-texto)] hover:bg-[var(--c-superficie-2)] transition-all"
              >
                Trocar Arquivo
              </button>
            </div>
          </div>

          {/* Filtros da Tabela */}
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setFiltroVisualizacao('todas')}
                className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                  filtroVisualizacao === 'todas'
                    ? 'bg-[var(--c-acento)] text-[var(--c-sobre-acento)]'
                    : 'bg-[var(--c-superficie-2)] text-[var(--c-texto-3)] hover:text-[var(--c-texto)]'
                }`}
              >
                Todas ({resultado.linhas.length})
              </button>
              <button
                type="button"
                onClick={() => setFiltroVisualizacao('validas')}
                className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                  filtroVisualizacao === 'validas'
                    ? 'bg-emerald-600 text-white'
                    : 'bg-[var(--c-superficie-2)] text-[var(--c-texto-3)] hover:text-[var(--c-texto)]'
                }`}
              >
                Apenas Válidas ({resultado.linhasValidas})
              </button>
              <button
                type="button"
                onClick={() => setFiltroVisualizacao('erros')}
                className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                  filtroVisualizacao === 'erros'
                    ? 'bg-amber-600 text-white'
                    : 'bg-[var(--c-superficie-2)] text-[var(--c-texto-3)] hover:text-[var(--c-texto)]'
                }`}
              >
                Com Avisos / Erros ({resultado.linhas.filter((l) => !l.valida || l.avisos.length > 0).length})
              </button>
            </div>

            {/* Botão de Confirmação no Topo também */}
            <button
              type="button"
              id="botao-confirmar-importacao"
              disabled={resultado.linhasValidas === 0 || importandoBanco}
              onClick={confirmarImportacao}
              className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-bold shadow-sm flex items-center gap-2 transition-all"
            >
              {importandoBanco ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Gravando Funcionários...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Confirmar e Importar ({resultado.linhasValidas} válidos)</span>
                </>
              )}
            </button>
          </div>

          {/* Tabela de Conferência */}
          {/* A tabela tem largura mínima própria: espremer dez colunas numa
              tela estreita quebrava cargo e setor no meio da palavra. Aqui ela
              rola na horizontal e cada coluna fica legível. */}
          <div className="overflow-x-auto rounded-xl border border-[var(--c-borda)] max-h-96 overflow-y-auto">
            <table className="w-full min-w-[1080px] text-left text-xs">
              <thead className="bg-[var(--c-superficie-2)] border-b border-[var(--c-borda)] text-[var(--c-texto-3)] font-semibold uppercase tracking-wider sticky top-0 z-10">
                <tr>
                  <th className="py-2.5 px-3 whitespace-nowrap">Linha</th>
                  <th className="py-2.5 px-3 whitespace-nowrap">Status</th>
                  <th className="py-2.5 px-3 whitespace-nowrap">Colaborador</th>
                  <th className="py-2.5 px-3 whitespace-nowrap">Login</th>
                  <th className="py-2.5 px-3 whitespace-nowrap">Cargo</th>
                  <th className="py-2.5 px-3 whitespace-nowrap">Loja</th>
                  <th className="py-2.5 px-3 whitespace-nowrap">Setor</th>
                  <th className="py-2.5 px-3 whitespace-nowrap">Nível</th>
                  <th className="py-2.5 px-3 whitespace-nowrap">Contato</th>
                  <th className="py-2.5 px-3">Validação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--c-borda)] text-[var(--c-texto)]">
                {linhasExibidas.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="py-8 text-center text-[var(--c-texto-3)]">
                      Nenhuma linha encontrada para o filtro selecionado.
                    </td>
                  </tr>
                ) : (
                  linhasExibidas.map((item) => {
                    return (
                      <tr
                        key={item.indiceLinha}
                        className={`transition-colors ${
                          !item.valida
                            ? 'bg-red-500/5 hover:bg-red-500/10'
                            : item.avisos.length > 0
                            ? 'bg-amber-500/5 hover:bg-amber-500/10'
                            : 'hover:bg-[var(--c-superficie-2)]'
                        }`}
                      >
                        <td className="py-2.5 px-3 font-mono text-[11px] text-[var(--c-texto-3)]">
                          #{item.indiceLinha}
                        </td>

                        <td className="py-2.5 px-3">
                          {!item.valida ? (
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-red-500/10 text-red-600 border border-red-500/20 whitespace-nowrap">
                              Inválida
                            </span>
                          ) : item.ehAtualizacao ? (
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/10 text-amber-600 border border-amber-500/20 whitespace-nowrap">
                              Atualizará
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 whitespace-nowrap">
                              Novo
                            </span>
                          )}
                        </td>

                        <td className="py-2.5 px-3 font-semibold whitespace-nowrap">
                          {item.dados.nome || <span className="text-red-500 italic">[Ausente]</span>}
                        </td>

                        <td className="py-2.5 px-3 font-mono text-[11px] whitespace-nowrap">
                          {item.dados.login}
                        </td>

                        <td className="py-2.5 px-3 whitespace-nowrap">{item.dados.cargo}</td>

                        <td className="py-2.5 px-3 whitespace-nowrap">
                          <span className="px-2 py-0.5 rounded bg-[var(--c-superficie-2)] border border-[var(--c-borda)] font-medium text-[11px] whitespace-nowrap">
                            {item.dados.loja}
                          </span>
                        </td>

                        <td className="py-2.5 px-3 text-[var(--c-texto-2)] whitespace-nowrap">{item.dados.setor}</td>

                        <td className="py-2.5 px-3 whitespace-nowrap">
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] font-bold whitespace-nowrap ${
                              item.dados.nivel >= NIVEL_TI
                                ? 'bg-indigo-500/10 text-indigo-600 border border-indigo-500/20'
                                : item.dados.nivel === NIVEL_GERENTE
                                ? 'bg-purple-500/10 text-purple-600'
                                : item.dados.nivel === 2
                                ? 'bg-blue-500/10 text-blue-600'
                                : 'bg-zinc-500/10 text-[var(--c-texto-3)]'
                            }`}
                          >
                            Nível {item.dados.nivel}
                          </span>
                        </td>

                        <td className="py-2.5 px-3 text-[11px] text-[var(--c-texto-3)] whitespace-nowrap">
                          {item.dados.ramal && <span>Ramal: {item.dados.ramal} · </span>}
                          {item.dados.telefone && <span>{item.dados.telefone}</span>}
                          {!item.dados.ramal && !item.dados.telefone && <span>—</span>}
                        </td>

                        <td className="py-2.5 px-3 text-[11px]">
                          {item.erros.length > 0 && (
                            <div className="text-red-600 flex items-center gap-1 font-medium">
                              <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                              <span>{item.erros.join(', ')}</span>
                            </div>
                          )}
                          {item.avisos.length > 0 && (
                            <div className="text-amber-600 flex items-center gap-1">
                              <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
                              <span>{item.avisos.join(', ')}</span>
                            </div>
                          )}
                          {item.valida && item.avisos.length === 0 && (
                            <span className="text-emerald-600 flex items-center gap-1">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span>Tudo certo</span>
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Barra de Confirmação Inferior */}
          <div className="p-4 rounded-xl bg-[var(--c-superficie-2)] border border-[var(--c-borda)] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="text-xs text-[var(--c-texto-3)]">
              Ao confirmar, os funcionários serão registrados com seus respectivos logins e adicionados automaticamente aos canais das filiais.
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setResultado(null)}
                className="px-3.5 py-2 rounded-xl border border-[var(--c-borda)] text-xs font-semibold text-[var(--c-texto)] hover:bg-[var(--c-canvas)] transition-all"
              >
                Cancelar
              </button>

              <button
                type="button"
                disabled={resultado.linhasValidas === 0 || importandoBanco}
                onClick={confirmarImportacao}
                className="px-6 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-bold shadow-sm flex items-center gap-2 transition-all"
              >
                {importandoBanco ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Importando...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Gravar {resultado.linhasValidas} Funcionários no Sistema</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
