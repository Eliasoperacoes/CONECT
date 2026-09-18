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
  CARGOS_SUGERIDOS,
  TURNOS,
  TURNO_PADRAO,
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
    turno: TURNO_PADRAO,
    dataAdmissao: '',
    cargaHorariaDiariaMinutos: CARGA_HORARIA_PADRAO_MINUTOS,
    cargaSemanalMinutos: undefined as number | undefined,
    trabalhaSabado: undefined as boolean | undefined,
    temIntervalo: undefined as boolean | undefined,
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
      turno: colaborador.turno || TURNO_PADRAO,
      dataAdmissao: colaborador.dataAdmissao || '',
      cargaHorariaDiariaMinutos:
        colaborador.cargaHorariaDiariaMinutos ?? CARGA_HORARIA_PADRAO_MINUTOS,
      cargaSemanalMinutos: colaborador.cargaSemanalMinutos,
      trabalhaSabado: colaborador.trabalhaSabado,
      temIntervalo: colaborador.temIntervalo,
      observacoes: colaborador.observacoes || '',
      ativo: colaborador.ativo,
    });
  }, [colaborador]);

  if (!colaborador) return null;

  const submeter = async (e: React.FormEvent) => {
    e.preventDefault();
    setErro(null);

    if (!form.nome.trim()) {
      setErro('O nome é obrigatório.');
      return;
    }

    setSalvando(true);
    const res = await bancoDados.atualizarColaborador(colaborador.id, {
      nome: form.nome.trim(),
      cargo: form.cargo.trim() || 'Colaborador',
      setor: form.setor,
      loja: form.loja,
      ramal: form.ramal.trim(),
      telefone: form.telefone.trim(),
      email: form.email.trim(),
      matricula: form.matricula.trim(),
      cnpj: form.cnpj.trim() ? formatarCnpj(form.cnpj) : undefined,
      turno: form.turno,
      dataAdmissao: form.dataAdmissao.trim(),
      cargaHorariaDiariaMinutos: form.cargaHorariaDiariaMinutos,
      cargaSemanalMinutos: form.cargaSemanalMinutos,
      trabalhaSabado: form.trabalhaSabado,
      temIntervalo: form.temIntervalo,
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
                list="cargos-sugeridos"
                className={campo}
              />
              {/* Sugestão, não restrição: cargo novo continua podendo ser
                  digitado. A lista existe para a mesma função não virar três
                  grafias diferentes nos filtros. */}
              <datalist id="cargos-sugeridos">
                {CARGOS_SUGERIDOS.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
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
            <label htmlFor="cad-turno" className={rotuloCampo}>
              Turno da escala
            </label>
            <select
              id="cad-turno"
              className={campo}
              value={form.turno}
              onChange={(e) => setForm({ ...form, turno: e.target.value })}
            >
              {TURNOS.map((t) => (
                <option key={t.chave} value={t.chave}>
                  {t.nome}
                </option>
              ))}
            </select>
            {/* O turno decide de que horário o atraso é contado e quanto o
                dia prevê — não é enfeite de cadastro */}
            <span className="text-[11px] text-[var(--c-texto-3)] block mt-1">
              Define o horário cobrado na batida. No sábado vale 08:00 às 12:00
              para os dois turnos.
            </span>
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
                <option value={490}>8h10 (turno da rede)</option>
                <option value={480}>8h00</option>
                <option value={528}>8h48</option>
              </select>
            </div>
          </div>

          {/*
            A JORNADA QUE MANDA NO BANCO DE HORAS.

            O saldo é apurado por SEMANA, não por dia: o estagiário que faz
            menos de segunda a sexta e vem no sábado completar fecha as 30h
            dele, e cobrar por dia o reprovaria cinco vezes por semana sem
            que nada estivesse errado.

            Os três campos começam em "padrão do setor" de propósito. Quem
            não tem contrato diferente não precisa escolher nada, e mudar o
            padrão depois alcança essa pessoa — o que não aconteceria se a
            ficha guardasse um número copiado do padrão.
          */}
          <div className="rounded-xl border border-[var(--c-borda)] bg-[var(--c-canvas)] p-3">
            <span className="block text-[11px] font-bold uppercase tracking-wider text-[var(--c-texto-2)] mb-2">
              Banco de horas · jornada da semana
            </span>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label htmlFor="cad-semanal" className={rotuloCampo}>
                  Carga semanal
                </label>
                <select
                  id="cad-semanal"
                  value={form.cargaSemanalMinutos ?? ''}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      cargaSemanalMinutos: e.target.value ? Number(e.target.value) : undefined,
                    })
                  }
                  className={campo}
                >
                  <option value="">Padrão do setor</option>
                  <option value={1200}>20h</option>
                  <option value={1500}>25h</option>
                  <option value={1800}>30h (estágio)</option>
                  <option value={2400}>40h</option>
                  <option value={2640}>44h</option>
                  <option value={2690}>44h50 (turno + sábado)</option>
                </select>
              </div>

              <div>
                <label htmlFor="cad-sabado" className={rotuloCampo}>
                  Trabalha aos sábados
                </label>
                <select
                  id="cad-sabado"
                  value={form.trabalhaSabado === undefined ? '' : String(form.trabalhaSabado)}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      trabalhaSabado: e.target.value === '' ? undefined : e.target.value === 'true',
                    })
                  }
                  className={campo}
                >
                  <option value="">Padrão do setor</option>
                  <option value="true">Sim</option>
                  <option value="false">Não</option>
                </select>
              </div>

              <div>
                <label htmlFor="cad-intervalo" className={rotuloCampo}>
                  Tem intervalo
                </label>
                <select
                  id="cad-intervalo"
                  value={form.temIntervalo === undefined ? '' : String(form.temIntervalo)}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      temIntervalo: e.target.value === '' ? undefined : e.target.value === 'true',
                    })
                  }
                  className={campo}
                >
                  <option value="">Padrão do setor</option>
                  <option value="true">Sim · 4 batidas</option>
                  <option value="false">Não · 2 batidas</option>
                </select>
              </div>
            </div>

            <p className="text-[11px] text-[var(--c-texto-3)] leading-snug mt-2">
              O padrão do setor: <strong>Estágio</strong> fecha 30h na semana, sem sábado e sem
              intervalo. Os demais fecham 44h50, com sábado e com intervalo. Só preencha aqui
              quando o contrato desta pessoa for diferente disso — por exemplo, o estagiário que
              vem ao sábado completar a carga.
            </p>
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
