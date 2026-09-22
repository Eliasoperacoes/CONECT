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
  turnoDe,
  turnosDoPerfil,
  minutosDoTurno,
  marcacoesDoTurno,
  minutosDeIntervaloDe,
  cargaSemanalDe,
  trabalhaNoSabado,
  ehDeEstagio,
  MINUTOS_SABADO,
} from '../tipos';
import { formatarMinutos } from '../servicos/ponto';
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
    cargaHorariaDiariaMinutos: undefined as number | undefined,
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
      cargaHorariaDiariaMinutos: colaborador.cargaHorariaDiariaMinutos,
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

  /**
   * Os turnos que cabem neste contrato, e o escolhido.
   *
   * O perfil sai do SETOR/CARGO que já está sendo preenchido no
   * formulário, e não do cadastro salvo: quem acabou de mudar o cargo
   * para Estagiário precisa ver os turnos de estágio na hora, e não
   * depois de salvar e reabrir.
   */
  const turnosOferecidos = turnosDoPerfil(ehDeEstagio(form));
  const turnoEscolhido = turnoDe(form);

  /**
   * O que o HORÁRIO desta pessoa soma na semana.
   *
   * É o número que o espelho usa de verdade — cinco dias do turno mais o
   * sábado, quando ela vem. A carga semanal da ficha só serve para dizer
   * se o contrato bate com isso; ela não entra mais na apuração, porque
   * ratear a diferença produzia previstos sem relógio nenhum.
   */
  const semanaPeloHorario =
    minutosDoTurno(turnoEscolhido) * 5 +
    (trabalhaNoSabado({ ...form, turno: turnoEscolhido.chave }) ? MINUTOS_SABADO : 0);

  /**
   * Trocar de contrato pode deixar a pessoa num turno que não existe mais
   * para ela — um estagiário com o Turno A de 8h10. Aqui o turno cai para
   * o primeiro da lista nova, em vez de ficar num valor que a tela nem
   * mostra e que o espelho obedeceria em silêncio.
   */
  useEffect(() => {
    if (turnosOferecidos.some((t) => t.chave === form.turno)) return;
    setForm((atual) => ({ ...atual, turno: turnosOferecidos[0]?.chave || TURNO_PADRAO }));
  }, [form.setor, form.cargo]);

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
              {/*
                SÓ OS TURNOS DESTE CONTRATO.
                Oferecer a jornada de 8h10 a um estagiário é convidar ao
                erro — e turno errado desalinha o espelho da pessoa por
                meses sem ninguém notar.
              */}
              {turnosOferecidos.map((t) => (
                <option key={t.chave} value={t.chave}>
                  {t.nome}
                </option>
              ))}
            </select>

            {/*
              O QUE O TURNO ESCOLHIDO IMPLICA, à vista.

              Antes a tela mostrava só o nome, e as consequências ficavam
              escondidas em três campos mais abaixo que repetiam a mesma
              informação por outro caminho. Quem cadastra precisa ver o
              que acabou de escolher: quanto o dia prevê, quantas batidas
              fecham o dia e quanto fecha a semana.
            */}
            <div className="mt-2 rounded-lg border border-[var(--c-borda)] bg-[var(--c-canvas)] px-3 py-2">
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px]">
                <span className="text-[var(--c-texto-2)]">
                  Jornada do dia{' '}
                  <strong className="text-[var(--c-texto)]">
                    {formatarMinutos(minutosDoTurno(turnoEscolhido))}
                  </strong>
                </span>
                <span className="text-[var(--c-texto-2)]">
                  Batidas{' '}
                  <strong className="text-[var(--c-texto)]">
                    {marcacoesDoTurno(turnoEscolhido)}
                  </strong>
                  {turnoEscolhido.intervalo
                    ? ` · intervalo de ${formatarMinutos(
                        minutosDeIntervaloDe({ turno: turnoEscolhido.chave })
                      )}`
                    : ' · direto, sem intervalo'}
                </span>
                <span className="text-[var(--c-texto-2)]">
                  Semana{' '}
                  <strong className="text-[var(--c-texto)]">
                    {formatarMinutos(cargaSemanalDe({ ...form, turno: turnoEscolhido.chave }))}
                  </strong>
                </span>
                <span className="text-[var(--c-texto-2)]">
                  Sábado{' '}
                  <strong className="text-[var(--c-texto)]">
                    {trabalhaNoSabado({ ...form, turno: turnoEscolhido.chave })
                      ? '08:00 às 12:00'
                      : 'não vem'}
                  </strong>
                </span>
              </div>

              {/*
                A ficha pode ter um "tem intervalo" gravado de antes,
                quando essa pergunta era respondida em dois lugares. Se
                ele contradiz o turno, é melhor dizer do que esconder.
              */}
              {/*
                A CARGA SEMANAL QUE NÃO BATE COM O HORÁRIO.

                Antes o sistema rateava a diferença pelos dias, e o
                previsto virava um número sem relógio — 5h18 para quem tem
                turno de 6h. O Elias perguntou qual era o sentido daquilo,
                e não havia nenhum: espalhava um débito falso por todos os
                dias e escondia a causa, que era o turno errado na ficha.

                Divergência de cadastro se resolve no cadastro. Aqui ela
                fica à vista, com os dois números, em vez de virar conta.
              */}
              {form.cargaSemanalMinutos !== undefined &&
                form.cargaSemanalMinutos !== semanaPeloHorario && (
                  <p className="text-[11px] text-amber-600 mt-1.5">
                    A carga semanal da ficha ({formatarMinutos(form.cargaSemanalMinutos)}) não
                    bate com o horário deste turno (
                    {formatarMinutos(semanaPeloHorario)}
                    {trabalhaNoSabado({ ...form, turno: turnoEscolhido.chave })
                      ? ', com sábado'
                      : ', sem sábado'}
                    ). Vale o horário no espelho — corrija o turno ou apague a carga.
                  </p>
                )}

              {form.temIntervalo !== undefined &&
                form.temIntervalo !== !!turnoEscolhido.intervalo?.desconta && (
                  <p className="text-[11px] text-amber-600 mt-1.5">
                    A ficha desta pessoa força{' '}
                    {form.temIntervalo ? '4 batidas' : '2 batidas'}, contrariando o
                    turno. Quem manda é a ficha — avise o TI se não for intencional.
                  </p>
                )}
            </div>

            <span className="text-[11px] text-[var(--c-texto-3)] block mt-1">
              O turno define o horário cobrado na batida e o que o dia prevê. Não é
              enfeite de cadastro: escolher errado desalinha o espelho.
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
            {/*
              "JORNADA DIÁRIA" SAIU DAQUI, e foi o campo que quebrou o
              espelho da Lyvia.

              Era uma lista de números solta, escolhida na mão, que vencia
              o turno no cálculo do previsto. A ficha dela tinha 490
              minutos gravados de quando foi cadastrada, e esse número
              cobrava 8h10 por dia de uma estagiária da tarde — −3h25 todo
              dia, com a carga certa aparecendo na tela ao lado.

              Um número que não conversa com o horário de entrada nem com
              as batidas esperadas não é jornada, é palpite. Quem precisa
              de jornada diferente recebe um TURNO, que traz as três
              respostas juntas.
            */}
            <div>
              <label htmlFor="cad-jornada" className={rotuloCampo}>
                <Clock className="w-3 h-3 inline mr-1" />
                Jornada diária
              </label>
              <select
                id="cad-jornada"
                value={form.cargaHorariaDiariaMinutos ?? ''}
                onChange={(e) =>
                  setForm({
                    ...form,
                    cargaHorariaDiariaMinutos: e.target.value
                      ? Number(e.target.value)
                      : undefined,
                  })
                }
                className={campo}
              >
                {/*
                  "PADRÃO DO TURNO" É A ESCOLHA CERTA PARA QUASE TODO MUNDO,
                  e por isso vem primeiro e vazia.

                  Antes não havia opção vazia: o campo nascia com 8h10
                  escolhido e gravava esse número em toda ficha nova. Como
                  ele vencia o turno no cálculo, a Lyvia — estagiária da
                  tarde — passou a dever 3h25 por dia contra uma jornada
                  que ninguém tinha escolhido para ela.
                */}
                <option value="">
                  Padrão do turno · {formatarMinutos(minutosDoTurno(turnoEscolhido))}
                </option>
                <option value={240}>4h00</option>
                <option value={300}>5h00</option>
                <option value={360}>6h00</option>
                <option value={396}>6h36</option>
                <option value={440}>7h20</option>
                <option value={480}>8h00</option>
                <option value={490}>8h10</option>
                <option value={528}>8h48</option>
              </select>
              <span className="text-[11px] text-[var(--c-texto-3)] block mt-1">
                Só preencha em contrato individual — meio período, por exemplo.
              </span>
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

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
                  {/*
                    O NÚMERO DO TURNO FICA À VISTA, e "do setor" saiu do
                    rótulo porque a carga deixou de sair do setor.

                    O RH conferiu e os estagiários fecham 27h45 — que é
                    exatamente o horário deles somado. Só que a tela
                    oferecia "30h (estágio)" como se fosse o número da
                    categoria, e escolher isso fazia o sistema encolher
                    todos os dias para caber numa carga que ninguém tem.

                    Vazio é a resposta certa quando o horário JÁ é o
                    contrato — e agora dá para ver que é.
                  */}
                  <option value="">
                    Padrão do turno ·{' '}
                    {formatarMinutos(
                      cargaSemanalDe({ ...form, cargaSemanalMinutos: undefined })
                    )}
                  </option>
                  <option value={1200}>20h</option>
                  <option value={1500}>25h</option>
                  <option value={1665}>27h45</option>
                  <option value={1800}>30h</option>
                  <option value={2400}>40h</option>
                  <option value={2640}>44h</option>
                  <option value={2690}>44h50</option>
                </select>
                <span className="text-[11px] text-[var(--c-texto-3)] block mt-1">
                  Só preencha se o contrato for diferente do horário.
                </span>
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

            </div>

            {/*
              "TEM INTERVALO" SAIU DAQUI.

              Era a mesma pergunta que o turno já responde, num segundo
              lugar — e os dois podiam discordar. O turno traz o intervalo
              dele: 1h30 nos integrais, 15 minutos no estágio da manhã e
              da tarde, nenhum no da escola.
            */}
            <p className="text-[11px] text-[var(--c-texto-3)] leading-snug mt-2">
              O padrão sai do <strong>turno</strong> escolhido acima, e está resumido
              lá. Só preencha aqui quando o contrato desta pessoa for diferente —
              por exemplo, o estagiário que vem ao sábado completar a carga, ou
              quem tem carga combinada em contrato.
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
