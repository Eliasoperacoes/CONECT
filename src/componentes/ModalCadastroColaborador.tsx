/**
 * Cadastro rápido do colaborador — CONECTA / Malachias Autopeças
 *
 * Usado pelo RH direto no Quadro de Equipe, sem precisar abrir o Painel
 * Administrativo. Traz só a ficha funcional: hierarquia, login e senha
 * continuam sendo do Administrador de TI.
 */

import { cnpjEhValido, formatarCnpj } from '../servicos/documentos';
import React, { useEffect, useState } from 'react';
import { X, UserCog, AlertCircle, Save, Clock } from 'lucide-react';
import {
  Colaborador,
  Loja,
  Setor,
  SETORES,
  INFORMACOES_LOJAS,
  CARGA_HORARIA_PADRAO_MINUTOS,
} from '../tipos';
import { bancoDados } from '../servicos/bancoDados';

interface PropsModalCadastroColaborador {
  colaborador: Colaborador | null;
  aoFechar: () => void;
  aoSalvar?: (nome: string) => void;
}

export const ModalCadastroColaborador: React.FC<PropsModalCadastroColaborador> = ({
  colaborador,
  aoFechar,
  aoSalvar,
}) => {
  const [form, setForm] = useState({
    nome: '',
    cargo: '',
    setor: 'Balcão' as Setor,
    loja: 'Pirassununga' as Loja,
    ramal: '',
    telefone: '',
    email: '',
    matricula: '',
    cnpj: '',
    dataAdmissao: '',
    cargaHorariaDiariaMinutos: CARGA_HORARIA_PADRAO_MINUTOS,
    observacoes: '',
    ativo: true,
  });
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  // Recarrega o formulário sempre que outro colaborador é aberto
  useEffect(() => {
    if (!colaborador) return;
    setErro(null);
    setForm({
      nome: colaborador.nome,
      cargo: colaborador.cargo,
      setor: colaborador.setor,
      loja: colaborador.loja,
      ramal: colaborador.ramal || '',
      telefone: colaborador.telefone || '',
      email: colaborador.email || '',
      matricula: colaborador.matricula || '',
      cnpj: colaborador.cnpj || '',
      dataAdmissao: colaborador.dataAdmissao || '',
      cargaHorariaDiariaMinutos:
        colaborador.cargaHorariaDiariaMinutos ?? CARGA_HORARIA_PADRAO_MINUTOS,
      observacoes: colaborador.observacoes || '',
      ativo: colaborador.ativo,
    });
  }, [colaborador]);

  if (!colaborador) return null;

  const submeter = (e: React.FormEvent) => {
    e.preventDefault();
    setErro(null);

    if (!form.nome.trim()) {
      setErro('O nome é obrigatório.');
      return;
    }

    setSalvando(true);
    const res = bancoDados.atualizarColaborador(colaborador.id, {
      nome: form.nome.trim(),
      cargo: form.cargo.trim() || 'Colaborador',
      setor: form.setor,
      loja: form.loja,
      ramal: form.ramal.trim(),
      telefone: form.telefone.trim(),
      email: form.email.trim(),
      matricula: form.matricula.trim(),
      cnpj: form.cnpj.trim() ? formatarCnpj(form.cnpj) : undefined,
      dataAdmissao: form.dataAdmissao.trim(),
      cargaHorariaDiariaMinutos: form.cargaHorariaDiariaMinutos,
      observacoes: form.observacoes.trim(),
      ativo: form.ativo,
    });
    setSalvando(false);

    if (res.sucesso) {
      if (aoSalvar) aoSalvar(form.nome.trim());
      aoFechar();
    } else {
      setErro(res.erro || 'Falha ao salvar o cadastro.');
    }
  };

  const rotuloCampo =
    'block text-[11px] font-bold text-[var(--c-texto-2)] uppercase tracking-wider mb-1';
  const campo =
    'w-full px-3 py-2 rounded-xl bg-[var(--c-canvas)] border border-[var(--c-borda)] text-[var(--c-texto)] placeholder-[var(--c-texto-3)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--c-acento)]';

  return (
    <div
      id="modal-cadastro-colaborador"
      className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 animate-in fade-in"
    >
      <form
        onSubmit={submeter}
        className="bg-[var(--c-superficie)] w-full max-w-lg rounded-2xl border border-[var(--c-borda)] shadow-[var(--s-3)] flex flex-col max-h-[92dvh] overflow-hidden"
      >
        <div className="px-4 py-3 border-b border-[var(--c-borda)] flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-violet-500/10 text-violet-600 border border-violet-500/20 flex items-center justify-center flex-shrink-0">
              <UserCog className="w-4.5 h-4.5" />
            </div>
            <div className="min-w-0">
              <h3 className="font-bold text-sm text-[var(--c-texto)] truncate">
                Cadastro de {colaborador.nome}
              </h3>
              <span className="text-[11px] text-[var(--c-texto-3)] block truncate">
                Ficha funcional · nível e senha ficam com o TI
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={aoFechar}
            className="p-1.5 rounded-lg text-[var(--c-texto-3)] hover:text-[var(--c-texto)] hover:bg-[var(--c-superficie-2)] transition-colors flex-shrink-0"
            aria-label="Fechar"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
          {erro && (
            <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 text-xs font-semibold flex items-center gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{erro}</span>
            </div>
          )}

          <div>
            <label htmlFor="cad-nome" className={rotuloCampo}>
              Nome completo *
            </label>
            <input
              id="cad-nome"
              type="text"
              required
              value={form.nome}
              onChange={(e) => setForm({ ...form, nome: e.target.value })}
              className={campo}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="cad-cargo" className={rotuloCampo}>
                Cargo
              </label>
              <input
                id="cad-cargo"
                type="text"
                value={form.cargo}
                onChange={(e) => setForm({ ...form, cargo: e.target.value })}
                placeholder="Ex: Balconista"
                className={campo}
              />
            </div>
            <div>
              <label htmlFor="cad-matricula" className={rotuloCampo}>
                Matrícula
              </label>
              <input
                id="cad-matricula"
                type="text"
                value={form.matricula}
                onChange={(e) => setForm({ ...form, matricula: e.target.value })}
                className={campo}
              />
            </div>
          </div>

          <div>
            <label htmlFor="cad-cnpj" className={rotuloCampo}>
              CNPJ da empresa
            </label>
            <input
              id="cad-cnpj"
              type="text"
              inputMode="numeric"
              value={form.cnpj}
              placeholder="00.000.000/0000-00"
              /* Formata ao sair do campo, não a cada tecla: reescrever o que
                 está sendo digitado empurra o cursor e atrapalha quem digita
                 rápido. */
              onChange={(e) => setForm({ ...form, cnpj: e.target.value })}
              onBlur={(e) => {
                const valor = e.target.value.trim();
                if (valor && cnpjEhValido(valor)) {
                  setForm({ ...form, cnpj: formatarCnpj(valor) });
                }
              }}
              className={campo}
            />
            {form.cnpj.trim() && !cnpjEhValido(form.cnpj) && (
              <span className="text-[11px] text-amber-600 mt-1 block">
                Os dígitos não conferem. Confira o número antes de salvar.
              </span>
            )}
            <span className="text-[11px] text-[var(--c-texto-3)] mt-1 block">
              Onde a pessoa está registrada — nem sempre é o CNPJ da loja onde trabalha.
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="cad-loja" className={rotuloCampo}>
                Loja
              </label>
              <select
                id="cad-loja"
                value={form.loja}
                onChange={(e) => setForm({ ...form, loja: e.target.value as Loja })}
                className={campo}
              >
                {INFORMACOES_LOJAS.map((info) => (
                  <option key={info.nome} value={info.nome}>
                    {info.nome}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="cad-setor" className={rotuloCampo}>
                Setor
              </label>
              <select
                id="cad-setor"
                value={form.setor}
                onChange={(e) => setForm({ ...form, setor: e.target.value as Setor })}
                className={campo}
              >
                {SETORES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="cad-ramal" className={rotuloCampo}>
                Ramal
              </label>
              <input
                id="cad-ramal"
                type="text"
                value={form.ramal}
                onChange={(e) => setForm({ ...form, ramal: e.target.value })}
                className={campo}
              />
            </div>
            <div>
              <label htmlFor="cad-telefone" className={rotuloCampo}>
                Telefone
              </label>
              <input
                id="cad-telefone"
                type="text"
                value={form.telefone}
                onChange={(e) => setForm({ ...form, telefone: e.target.value })}
                placeholder="(19) 99999-0000"
                className={campo}
              />
            </div>
          </div>

          <div>
            <label htmlFor="cad-email" className={rotuloCampo}>
              E-mail
            </label>
            <input
              id="cad-email"
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              className={campo}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="cad-admissao" className={rotuloCampo}>
                Data de admissão
              </label>
              <input
                id="cad-admissao"
                type="date"
                value={form.dataAdmissao}
                onChange={(e) => setForm({ ...form, dataAdmissao: e.target.value })}
                className={campo}
              />
            </div>
            <div>
              <label htmlFor="cad-jornada" className={rotuloCampo}>
                <Clock className="w-3 h-3 inline mr-1" />
                Jornada diária
              </label>
              <select
                id="cad-jornada"
                value={form.cargaHorariaDiariaMinutos}
                onChange={(e) =>
                  setForm({ ...form, cargaHorariaDiariaMinutos: Number(e.target.value) })
                }
                className={campo}
              >
                <option value={240}>4h00</option>
                <option value={360}>6h00</option>
                <option value={396}>6h36</option>
                <option value={440}>7h20</option>
                <option value={480}>8h00 (padrão)</option>
                <option value={528}>8h48</option>
              </select>
            </div>
          </div>

          <div>
            <label htmlFor="cad-observacoes" className={rotuloCampo}>
              Observações
            </label>
            <textarea
              id="cad-observacoes"
              rows={2}
              value={form.observacoes}
              onChange={(e) => setForm({ ...form, observacoes: e.target.value })}
              className={`${campo} resize-none`}
            />
          </div>

          <label className="flex items-center gap-2.5 p-3 rounded-xl bg-[var(--c-superficie-2)] border border-[var(--c-borda)] cursor-pointer">
            <input
              type="checkbox"
              checked={form.ativo}
              onChange={(e) => setForm({ ...form, ativo: e.target.checked })}
              className="w-4 h-4 accent-[var(--c-acento)]"
            />
            <div>
              <span className="text-xs font-bold text-[var(--c-texto)] block">
                Colaborador ativo
              </span>
              <span className="text-[11px] text-[var(--c-texto-3)]">
                Desmarque no desligamento: a conta deixa de acessar o sistema
              </span>
            </div>
          </label>
        </div>

        <div className="p-4 border-t border-[var(--c-borda)] grid grid-cols-2 gap-2 flex-shrink-0">
          <button
            type="button"
            onClick={aoFechar}
            className="py-2.5 rounded-xl bg-[var(--c-superficie-2)] border border-[var(--c-borda)] text-xs font-bold text-[var(--c-texto)] hover:border-[var(--c-borda-forte)] transition-all"
          >
            Cancelar
          </button>
          <button
            type="submit"
            id="botao-salvar-cadastro-colaborador"
            disabled={salvando}
            className="py-2.5 rounded-xl bg-[var(--c-acento)] text-[var(--c-sobre-acento)] text-xs font-bold flex items-center justify-center gap-1.5 hover:brightness-110 active:scale-[0.99] disabled:opacity-50 transition-all"
          >
            <Save className="w-3.5 h-3.5" />
            {salvando ? 'Salvando…' : 'Salvar cadastro'}
          </button>
        </div>
      </form>
    </div>
  );
};
