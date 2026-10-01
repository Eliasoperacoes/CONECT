// @ts-nocheck
/**
 * GERADO — NÃO EDITE. Fonte: src/servidor/funcaoApurarPonto.ts
 * Para atualizar: bun scripts/gerar-funcao-apurar.ts, e cole este arquivo
 * inteiro em Edge Functions → apurar-ponto → Code.
 */
// src/tipos.ts
var NIVEL_COLABORADOR = 1;
var NIVEL_LIDER_SETOR = 2;
var NIVEL_GERENTE = 3;
var NIVEL_DIRETORIA = 4;
var NIVEL_TI = 5;
var TURNOS = [
  {
    chave: "A",
    nome: "Turno A · 07:30 às 17:10",
    entrada: "07:30",
    saida: "17:10",
    intervalo: { saida: "12:30", retorno: "14:00", desconta: true },
    perfil: "integral",
    sabado: true
  },
  {
    chave: "B",
    nome: "Turno B · 08:20 às 18:00",
    entrada: "08:20",
    saida: "18:00",
    intervalo: { saida: "11:00", retorno: "12:30", desconta: true },
    perfil: "integral",
    sabado: true
  },
  {
    chave: "E0",
    nome: "Estágio · 6h direto (turno a definir)",
    entrada: "07:30",
    saida: "13:30",
    perfil: "estagio",
    sabado: false
  },
  {
    chave: "E1",
    nome: "Estágio manhã · 07:30 às 13:30 · 6h",
    entrada: "07:30",
    saida: "13:30",
    intervalo: { saida: "10:30", retorno: "10:45", desconta: false },
    perfil: "estagio",
    sabado: false
  },
  {
    chave: "E2",
    nome: "Estágio escola · 07:30 às 12:30 · 5h",
    entrada: "07:30",
    saida: "12:30",
    perfil: "estagio",
    sabado: false
  },
  {
    chave: "E3",
    nome: "Estágio tarde · 13:00 às 18:00 · 5h",
    entrada: "13:00",
    saida: "18:00",
    intervalo: { saida: "15:30", retorno: "15:45", desconta: false },
    perfil: "estagio",
    sabado: false
  }
];
var TURNO_SABADO = { entrada: "08:00", saida: "12:00" };
var INICIO_DA_COBRANCA_DE_FALTAS = "2026-10-01";
var emMinutos = (hora) => {
  const [h, m] = hora.split(":").map(Number);
  return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0);
};
var minutosDoTurno = (turno) => {
  const permanencia = emMinutos(turno.saida) - emMinutos(turno.entrada);
  if (!turno.intervalo || !turno.intervalo.desconta)
    return permanencia;
  return permanencia - (emMinutos(turno.intervalo.retorno) - emMinutos(turno.intervalo.saida));
};
var minutosPausaDoTurno = (turno) => {
  if (!turno.intervalo || turno.intervalo.desconta)
    return 0;
  return emMinutos(turno.intervalo.retorno) - emMinutos(turno.intervalo.saida);
};
var turnosDoPerfil = (ehEstagio) => TURNOS.filter((t) => t.perfil === (ehEstagio ? "estagio" : "integral"));
var turnoDe = (colaborador) => {
  const doPerfil = turnosDoPerfil(ehDeEstagio(colaborador));
  return doPerfil.find((t) => t.chave === colaborador?.turno) || doPerfil[0];
};
var MINUTOS_SABADO = emMinutos(TURNO_SABADO.saida) - emMinutos(TURNO_SABADO.entrada);
var JORNADA_CLT_DIA_UTIL = 8 * 60;
var compensacaoDoSabadoDe = (colaborador) => {
  if (colaborador?.cargaHorariaDiariaMinutos != null)
    return 0;
  const turno = turnoDe(colaborador);
  if (turno.perfil !== "integral")
    return 0;
  return Math.max(0, minutosDoTurno(turno) - JORNADA_CLT_DIA_UTIL);
};
var CARGA_HORARIA_PADRAO_MINUTOS = JORNADA_CLT_DIA_UTIL;
var MINUTOS_SEMANA_PADRAO = CARGA_HORARIA_PADRAO_MINUTOS * 5 + MINUTOS_SABADO;
var MINUTOS_SEMANA_ESTAGIO = 30 * 60;
var MINUTOS_DIA_ESTAGIO = 6 * 60;
var ehDeEstagio = (colaborador) => (colaborador?.setor || "").toLowerCase().includes("está") || (colaborador?.setor || "").toLowerCase().includes("esta") || (colaborador?.cargo || "").toLowerCase().includes("estagi");
var minutosDeDiaUtilDe = (colaborador) => colaborador?.cargaHorariaDiariaMinutos != null ? colaborador.cargaHorariaDiariaMinutos : minutosDoTurno(turnoDe(colaborador)) - compensacaoDoSabadoDe(colaborador);
var cargaSemanalDe = (colaborador) => {
  if (colaborador?.cargaSemanalMinutos != null) {
    return colaborador.cargaSemanalMinutos;
  }
  const uteis = minutosDeDiaUtilDe(colaborador) * 5;
  return uteis + (trabalhaNoSabado(colaborador) ? MINUTOS_SABADO : 0);
};
var trabalhaNoSabado = (colaborador) => colaborador?.trabalhaSabado ?? turnoDe(colaborador).sabado;
var temIntervaloNoDia = (colaborador) => colaborador?.temIntervalo ?? !!turnoDe(colaborador).intervalo?.desconta;
var TOLERANCIA_PONTO_PADRAO_MINUTOS = 10;
var TOLERANCIA_POR_MARCACAO_PADRAO_MINUTOS = 5;
var TOLERANCIA_INTERVALO_PADRAO_MINUTOS = 5;
var ORDEM_MARCACOES = [
  "entrada",
  "saida_almoco",
  "retorno_almoco",
  "saida"
];
var SITUACAO_POR_TIPO = {
  atestado: "abonado_atestado",
  falta_justificada: "falta_justificada",
  comparecimento: "comparecimento",
  folga_sabado: "folga",
  ferias: "ferias",
  outro: "abonado_outro"
};
var minutosComSinal = (ajuste) => {
  if (ajuste.tipo === "dia_incompleto")
    return 0;
  return ajuste.tipo === "debito" ? -ajuste.minutos : ajuste.minutos;
};
var INFORMACOES_LOJAS = [
  {
    nome: "Pirassununga",
    tipo: "Matriz",
    cidade: "Pirassununga - SP",
    gerente: "Carlos Malachias / Marcos",
    telefone: "(19) 3561-1000",
    grupoId: "grupo-loja-pirassununga"
  },
  {
    nome: "Porto Ferreira",
    tipo: "Filial",
    cidade: "Porto Ferreira - SP",
    gerente: "Roberto Fagundes",
    telefone: "(19) 3581-2000",
    grupoId: "grupo-loja-porto-ferreira"
  },
  {
    nome: "Palmeiras",
    tipo: "Filial",
    cidade: "Santa Cruz das Palmeiras - SP",
    gerente: "Márcio Prado",
    telefone: "(19) 3672-3000",
    grupoId: "grupo-loja-palmeiras"
  },
  {
    nome: "Descalvado",
    tipo: "Filial",
    cidade: "Descalvado - SP",
    gerente: "Fernanda Alves",
    telefone: "(19) 3583-4000",
    grupoId: "grupo-loja-descalvado"
  },
  {
    nome: "Santa Rita",
    tipo: "Filial",
    cidade: "Santa Rita do Passa Quatro - SP",
    gerente: "André Villanova",
    telefone: "(19) 3582-5000",
    grupoId: "grupo-loja-santa-rita"
  },
  {
    nome: "Rede",
    tipo: "Central",
    cidade: "Operações Centrais",
    gerente: "Vanessa / Marcelo",
    telefone: "(19) 3561-9900",
    grupoId: "grupo-avisos-da-rede"
  }
];

// src/servicos/toleranciaDoPonto.ts
var abaterPausa = (diferenca, pausa) => diferenca < 0 ? diferenca + Math.min(pausa, -diferenca) : diferenca;
function aplicarTolerancia(dados) {
  const { batidas, esperados, diferenca, pausa, jornadaFechada, limites } = dados;
  if (!jornadaFechada)
    return { saldoApurado: 0, modo: "sem_jornada" };
  if (!esperados) {
    const bruto = abaterPausa(diferenca, pausa);
    return { saldoApurado: Math.abs(bruto) <= limites.diaria ? 0 : bruto, modo: "dia" };
  }
  let neutralizado = 0;
  const resultado = { saldoApurado: 0, modo: "marcacoes" };
  if (esperados.entrada !== undefined && esperados.saida !== undefined && batidas.entrada !== null && batidas.saida !== null) {
    const efeitoEntrada = esperados.entrada - batidas.entrada;
    const efeitoSaida = batidas.saida - esperados.saida;
    const tolerado = Math.abs(efeitoEntrada) <= limites.porMarcacao && Math.abs(efeitoSaida) <= limites.porMarcacao && Math.abs(efeitoEntrada) + Math.abs(efeitoSaida) <= limites.diaria;
    if (tolerado)
      neutralizado += efeitoEntrada + efeitoSaida;
    resultado.entradaESaida = { efeitoEntrada, efeitoSaida, tolerado };
  }
  if (esperados.saida_almoco !== undefined && esperados.retorno_almoco !== undefined && batidas.saidaAlmoco !== null && batidas.retornoAlmoco !== null) {
    const variacaoSaida = batidas.saidaAlmoco - esperados.saida_almoco;
    const variacaoRetorno = batidas.retornoAlmoco - esperados.retorno_almoco;
    const variacao = Math.abs(variacaoSaida) + Math.abs(variacaoRetorno);
    const efeito = esperados.retorno_almoco - esperados.saida_almoco - (batidas.retornoAlmoco - batidas.saidaAlmoco);
    const tolerado = variacao <= limites.intervalo;
    if (tolerado)
      neutralizado += efeito;
    resultado.intervalo = {
      variacaoSaida,
      variacaoRetorno,
      variacao,
      efeito,
      tolerado,
      reducaoMinutos: tolerado ? 0 : Math.max(0, efeito)
    };
  }
  const relogio = abaterPausa(diferenca, pausa);
  if (Math.abs(relogio) <= limites.diaria) {
    resultado.saldoApurado = 0;
    return resultado;
  }
  const calculado = abaterPausa(diferenca - neutralizado, pausa);
  resultado.saldoApurado = relogio >= 0 ? Math.min(Math.max(calculado, 0), relogio) : Math.max(Math.min(calculado, 0), relogio);
  return resultado;
}

// src/servicos/apuracaoDoDia.ts
var SEM_FONTE = new Proxy({}, {
  get: () => {
    throw new Error("Regras do ponto sem fonte de dados: chame usarFonteDaApuracao antes.");
  }
});
var fonte = SEM_FONTE;
var usarFonteDaApuracao = (nova) => {
  fonte = nova;
};
var RELOGIO_DA_LOJA = new Intl.DateTimeFormat("en-GB", {
  timeZone: "America/Sao_Paulo",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23"
});
var minutosEmBrasilia = (horarioIso) => {
  const partes = RELOGIO_DA_LOJA.formatToParts(new Date(horarioIso));
  const h = Number(partes.find((p) => p.type === "hour")?.value);
  const m = Number(partes.find((p) => p.type === "minute")?.value);
  return h * 60 + m;
};
var hojeEmBrasilia = (agora = new Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(agora);
var paraDataLocal = (data) => {
  const ano = data.getFullYear();
  const mes = String(data.getMonth() + 1).padStart(2, "0");
  const dia = String(data.getDate()).padStart(2, "0");
  return `${ano}-${mes}-${dia}`;
};
var deDataLocal = (data) => {
  const [ano, mes, dia] = data.split("-").map(Number);
  return new Date(ano, (mes || 1) - 1, dia || 1, 12, 0, 0);
};
var listarDatasDoPeriodo = (dataInicio, dataFim) => {
  const datas = [];
  const fim = deDataLocal(dataFim);
  let atual = deDataLocal(dataInicio);
  let limite = 0;
  while (atual <= fim && limite < 400) {
    datas.push(paraDataLocal(atual));
    atual = new Date(atual.getFullYear(), atual.getMonth(), atual.getDate() + 1, 12);
    limite++;
  }
  return datas;
};
var ehDiaDeFolga = (data) => deDataLocal(data).getDay() === 0;
var ehSabado = (data) => deDataLocal(data).getDay() === 6;
var marcacoesEsperadas = (data, colaborador) => {
  if (colaborador && fonte.situacaoDoDia(colaborador.id, data) !== "normal")
    return [];
  const feriado = fonte.feriadoEm(data, colaborador?.loja);
  if (feriado)
    return feriado.minutosPrevistos > 0 ? ["entrada", "saida"] : [];
  if (ehDiaDeFolga(data))
    return [];
  if (ehSabado(data)) {
    if (colaborador && !trabalhaNoSabado(colaborador))
      return [];
    return ["entrada", "saida"];
  }
  if (colaborador && !temIntervaloNoDia(colaborador))
    return ["entrada", "saida"];
  return ORDEM_MARCACOES;
};
var cargaPrevistaEmMinutos = (colaborador, data) => {
  if (ehDiaDeFolga(data))
    return 0;
  if (colaborador && fonte.situacaoDoDia(colaborador.id, data) !== "normal" && fonte.marcacoesDoDia(colaborador.id, data).length === 0) {
    return 0;
  }
  const feriado = fonte.feriadoEm(data, colaborador?.loja);
  if (feriado)
    return feriado.minutosPrevistos;
  if (ehSabado(data)) {
    if (!trabalhaNoSabado(colaborador))
      return 0;
    const turno = turnoDe(colaborador);
    if (turno.perfil !== "estagio")
      return MINUTOS_SABADO;
    const uteis = minutosDeDiaUtilDe(colaborador) * 5;
    return Math.min(MINUTOS_SABADO, Math.max(0, cargaSemanalDe(colaborador) - uteis));
  }
  return minutosDeDiaUtilDe(colaborador);
};
var compensacaoEsperadaDoDia = (colaborador, data) => {
  if (!colaborador || ehDiaDeFolga(data) || ehSabado(data))
    return 0;
  if (fonte.feriadoEm(data, colaborador.loja))
    return 0;
  return compensacaoDoSabadoDe(colaborador);
};
var horariosEsperadosDoDia = (colaborador, data) => {
  const esperadas = marcacoesEsperadas(data, colaborador);
  if (esperadas.length === 0)
    return null;
  const emMinutos = (hora) => {
    const [h, m] = hora.split(":").map(Number);
    return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0);
  };
  const turno = turnoDe(colaborador);
  const horarios = ehSabado(data) ? esperadas.length === 2 ? {
    entrada: emMinutos(TURNO_SABADO.entrada),
    saida: emMinutos(TURNO_SABADO.saida)
  } : {} : esperadas.length === 4 && turno.intervalo ? {
    entrada: emMinutos(turno.entrada),
    saida_almoco: emMinutos(turno.intervalo.saida),
    retorno_almoco: emMinutos(turno.intervalo.retorno),
    saida: emMinutos(turno.saida)
  } : esperadas.length === 2 ? {
    entrada: emMinutos(turno.entrada),
    saida: emMinutos(turno.saida)
  } : {};
  if (Object.keys(horarios).length === 0)
    return null;
  const implicado = ehSabado(data) ? (horarios.saida ?? 0) - (horarios.entrada ?? 0) : (horarios.saida_almoco ?? 0) - (horarios.entrada ?? 0) + ((horarios.saida ?? 0) - (horarios.retorno_almoco ?? 0));
  if (implicado !== cargaPrevistaEmMinutos(colaborador, data) + compensacaoEsperadaDoDia(colaborador, data)) {
    return null;
  }
  return horarios;
};
var jornadaDoDia = (colaboradorId, data) => {
  const colaborador = fonte.colaborador(colaboradorId);
  const registros = fonte.marcacoesDoDia(colaboradorId, data);
  const marcacoes = {};
  registros.forEach((r) => {
    marcacoes[r.tipo] = r;
  });
  const minutosDe = (tipo) => {
    const reg = marcacoes[tipo];
    if (!reg)
      return null;
    return fonte.minutosDoHorario(reg.horario);
  };
  const entrada = minutosDe("entrada");
  const saidaAlmoco = minutosDe("saida_almoco");
  const retornoAlmoco = minutosDe("retorno_almoco");
  const saida = minutosDe("saida");
  let minutosIntervalo = 0;
  if (saidaAlmoco !== null && retornoAlmoco !== null && retornoAlmoco > saidaAlmoco) {
    minutosIntervalo = retornoAlmoco - saidaAlmoco;
  }
  let minutosTrabalhados = 0;
  if (entrada !== null && saida !== null && saida > entrada) {
    minutosTrabalhados = saida - entrada - minutosIntervalo;
  }
  const minutosPrevistos = cargaPrevistaEmMinutos(colaborador, data);
  const completa = marcacoesEsperadas(data, colaborador).every((tipo) => !!marcacoes[tipo]);
  const emAndamento = entrada !== null && saida === null;
  const pausa = ehSabado(data) ? 0 : minutosPausaDoTurno(turnoDe(colaborador));
  const faltando = minutosPrevistos - minutosTrabalhados;
  const abatidoPelaPausa = minutosTrabalhados > 0 && faltando > 0 ? Math.min(pausa, faltando) : 0;
  const minutosPrevistosEfetivos = minutosPrevistos - abatidoPelaPausa;
  const saldoBrutoMinutos = minutosTrabalhados > 0 ? minutosTrabalhados - minutosPrevistosEfetivos : 0;
  const compensacaoEsperada = compensacaoEsperadaDoDia(colaborador, data);
  const tolerancia = aplicarTolerancia({
    batidas: { entrada, saidaAlmoco, retornoAlmoco, saida },
    esperados: horariosEsperadosDoDia(colaborador, data),
    diferenca: minutosTrabalhados - minutosPrevistos - compensacaoEsperada,
    pausa,
    jornadaFechada: minutosTrabalhados > 0,
    limites: {
      porMarcacao: fonte.tolerancias().porMarcacao,
      diaria: fonte.tolerancias().diaria,
      intervalo: TOLERANCIA_INTERVALO_PADRAO_MINUTOS
    }
  });
  const abonado = fonte.situacaoDoDia(colaboradorId, data) !== "normal";
  let saldoMinutos = abonado ? Math.max(0, tolerancia.saldoApurado) : tolerancia.saldoApurado;
  let saldoBrutoDoDia = saldoBrutoMinutos;
  const falta = ehFalta(colaborador, data, registros.length, minutosPrevistos);
  if (falta) {
    const decidido = fonte.ajusteDoDia(colaboradorId, data);
    saldoBrutoDoDia = -minutosPrevistos;
    saldoMinutos = decidido && decidido.estado === "aprovado" && decidido.tipo !== "dia_incompleto" ? minutosComSinal(decidido) : -minutosPrevistos;
  }
  return {
    data,
    colaboradorId,
    marcacoes,
    minutosTrabalhados,
    minutosIntervalo,
    minutosPrevistos,
    minutosPrevistosEfetivos,
    abatidoPelaPausa,
    compensacaoMinutos: minutosTrabalhados > 0 && completa ? compensacaoEsperada : 0,
    saldoMinutos,
    saldoBrutoMinutos: saldoBrutoDoDia,
    tolerancia,
    completa,
    emAndamento,
    falta
  };
};
var ehFalta = (colaborador, data, batidas, minutosPrevistos) => {
  if (batidas > 0 || minutosPrevistos <= 0)
    return false;
  if (colaborador && !fonte.batePonto(colaborador))
    return false;
  if (data >= fonte.hoje() || data < INICIO_DA_COBRANCA_DE_FALTAS)
    return false;
  if (colaborador?.dataAdmissao && data < colaborador.dataAdmissao)
    return false;
  return true;
};
var decidirApuracao = (colaboradorId, data, opcoes) => {
  const jornada = jornadaDoDia(colaboradorId, data);
  if (!jornada.completa)
    return { acao: "nada" };
  const diferenca = jornada.saldoMinutos;
  const existente = fonte.ajusteDoDia(colaboradorId, data);
  if (diferenca === 0) {
    const precisaReescrever = existente && (existente.estado === "pendente" || !!opcoes.corrigidoPor);
    if (precisaReescrever) {
      return {
        acao: "gravar",
        reescrita: true,
        entrouNaFila: false,
        ajuste: {
          ...existente,
          minutos: 0,
          minutosTrabalhados: jornada.minutosTrabalhados,
          minutosPrevistos: jornada.minutosPrevistos,
          estado: "aprovado",
          origem: opcoes.corrigidoPor ? "correcao_manual" : "tolerancia_automatica",
          aprovadorId: opcoes.corrigidoPor?.id,
          aprovadorNome: opcoes.corrigidoPor?.nome || "Tolerância automática",
          decididoEm: opcoes.agora
        }
      };
    }
    return { acao: "nada" };
  }
  if (existente && existente.estado !== "pendente" && !opcoes.corrigidoPor) {
    return { acao: "nada" };
  }
  const agora = opcoes.agora;
  const ajuste = {
    id: existente?.id || opcoes.novoId(),
    colaboradorId,
    data,
    tipo: diferenca > 0 ? "hora_extra" : "debito",
    minutos: Math.abs(diferenca),
    minutosTrabalhados: jornada.minutosTrabalhados,
    minutosPrevistos: jornada.minutosPrevistos,
    estado: opcoes.corrigidoPor ? "aprovado" : "pendente",
    origem: opcoes.corrigidoPor ? "correcao_manual" : "pendencia",
    aprovadorId: opcoes.corrigidoPor?.id,
    aprovadorNome: opcoes.corrigidoPor?.nome,
    decididoEm: opcoes.corrigidoPor ? agora : undefined,
    motivoColaborador: opcoes.motivo || existente?.motivoColaborador,
    anexoCaminho: opcoes.anexoCaminho || existente?.anexoCaminho,
    criadoEm: existente?.criadoEm || agora
  };
  return {
    acao: "gravar",
    reescrita: false,
    ajuste,
    entrouNaFila: ajuste.estado === "pendente" && existente?.estado !== "pendente"
  };
};
var decidirLevantamento = (pessoa, data, agora) => {
  if (data >= fonte.hoje())
    return { acao: "nada" };
  const esperadas = marcacoesEsperadas(data, pessoa);
  const jornada = jornadaDoDia(pessoa.id, data);
  const batidas = Object.keys(jornada.marcacoes).length;
  const feitas = esperadas.filter((t) => !!jornada.marcacoes[t]).length;
  if (ehDiaDeFolga(data))
    return { acao: "nada" };
  if (fonte.situacaoDoDia(pessoa.id, data) !== "normal")
    return { acao: "nada" };
  if (esperadas.length === 0)
    return { acao: "nada" };
  const existente = fonte.ajusteDoDia(pessoa.id, data);
  const fechou = batidas > 0 && feitas >= esperadas.length;
  if (fechou) {
    return existente?.tipo === "dia_incompleto" && existente.estado === "pendente" ? { acao: "reapurar" } : { acao: "nada" };
  }
  if (!jornada.falta)
    return { acao: "nada" };
  if (existente)
    return { acao: "nada" };
  return {
    acao: "criarFalta",
    ajuste: {
      id: `inc-${pessoa.id}-${data}`,
      colaboradorId: pessoa.id,
      data,
      tipo: "dia_incompleto",
      minutos: jornada.minutosPrevistos,
      minutosTrabalhados: jornada.minutosTrabalhados,
      minutosPrevistos: jornada.minutosPrevistos,
      estado: "pendente",
      origem: "pendencia",
      criadoEm: agora
    }
  };
};

// src/servicos/cacheDeLeitura.ts
var cache = new Map;

// src/servicos/justificativasCache.ts
var situacaoNaLista = (ausencias, colaboradorId, data) => {
  const achada = ausencias.find((j) => j.colaboradorId === colaboradorId && j.estado === "aprovada" && data >= j.dataInicio && data <= j.dataFim);
  return achada ? SITUACAO_POR_TIPO[achada.tipo] : "normal";
};

// src/servicos/feriadosNacionais.ts
var emTexto = (ano, mes, dia) => `${ano}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
var domingoDePascoa = (ano) => {
  const a = ano % 19;
  const b = Math.floor(ano / 100);
  const c = ano % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31);
  const dia = (h + l - 7 * m + 114) % 31 + 1;
  return new Date(ano, mes - 1, dia, 12);
};
var deslocar = (base, dias) => {
  const d = new Date(base);
  d.setDate(d.getDate() + dias);
  return emTexto(d.getFullYear(), d.getMonth() + 1, d.getDate());
};
var feriadosNacionaisDe = (ano) => {
  const pascoa = domingoDePascoa(ano);
  const lista = [
    { data: emTexto(ano, 1, 1), nome: "Confraternização Universal", minutosPrevistos: 0 },
    { data: deslocar(pascoa, -47), nome: "Carnaval", minutosPrevistos: 0 },
    { data: deslocar(pascoa, -2), nome: "Sexta-feira Santa", minutosPrevistos: 0 },
    { data: emTexto(ano, 4, 21), nome: "Tiradentes", minutosPrevistos: 0 },
    { data: emTexto(ano, 5, 1), nome: "Dia do Trabalho", minutosPrevistos: 0 },
    { data: deslocar(pascoa, 60), nome: "Corpus Christi", minutosPrevistos: 0 },
    { data: emTexto(ano, 9, 7), nome: "Independência do Brasil", minutosPrevistos: 0 },
    { data: emTexto(ano, 10, 12), nome: "Nossa Senhora Aparecida", minutosPrevistos: 0 },
    { data: emTexto(ano, 11, 2), nome: "Finados", minutosPrevistos: 0 },
    { data: emTexto(ano, 11, 15), nome: "Proclamação da República", minutosPrevistos: 0 },
    { data: emTexto(ano, 11, 20), nome: "Consciência Negra", minutosPrevistos: 0 },
    { data: emTexto(ano, 12, 25), nome: "Natal", minutosPrevistos: 0 }
  ];
  return lista.sort((a, b) => a.data.localeCompare(b.data));
};

// src/servicos/feriadosMunicipais.ts
var ESTADUAIS_SP = [
  { dia: 9, mes: 7, nome: "Revolução Constitucionalista" }
];
var POR_CIDADE = {
  "Pirassununga - SP": [
    { dia: 6, mes: 8, nome: "Aniversário de Pirassununga" },
    { dia: 8, mes: 12, nome: "Piracema" }
  ],
  "Porto Ferreira - SP": [
    { dia: 20, mes: 1, nome: "São Sebastião" },
    { dia: 29, mes: 7, nome: "Aniversário de Porto Ferreira" }
  ],
  "Santa Cruz das Palmeiras - SP": [
    { dia: 3, mes: 5, nome: "Aniversário de Santa Cruz das Palmeiras" }
  ],
  "Descalvado - SP": [
    { dia: 8, mes: 9, nome: "Aniversário de Descalvado" }
  ],
  "Santa Rita do Passa Quatro - SP": [
    { dia: 22, mes: 5, nome: "Aniversário de Santa Rita do Passa Quatro" }
  ]
};
var emTexto2 = (ano, mes, dia) => `${ano}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
var montar = (ano, itens, origem) => itens.map((f) => ({
  data: emTexto2(ano, f.mes, f.dia),
  nome: f.nome,
  minutosPrevistos: f.minutosPrevistos ?? 0,
  origem
}));
var feriadosLocaisDe = (ano, cidade) => {
  const municipais = cidade ? POR_CIDADE[cidade] || [] : [];
  return [
    ...montar(ano, ESTADUAIS_SP, "estadual"),
    ...montar(ano, municipais, "municipal")
  ].sort((a, b) => a.data.localeCompare(b.data));
};
var cidadeDaLoja = (loja, lojas) => {
  if (!loja)
    return;
  return lojas.find((l) => l.nome === loja)?.cidade;
};

// src/servicos/feriadosCache.ts
var feriadoNaLista = (cadastrados, data, loja) => {
  const doDia = cadastrados.filter((f) => f.data === data);
  const cadastrado = doDia.find((f) => f.loja && f.loja === loja) || doDia.find((f) => !f.loja);
  if (cadastrado)
    return cadastrado;
  const ano = Number(data.slice(0, 4));
  if (!Number.isFinite(ano))
    return;
  const cidade = cidadeDaLoja(loja, INFORMACOES_LOJAS);
  const local = feriadosLocaisDe(ano, cidade).find((f) => f.data === data);
  if (local) {
    return {
      id: `${local.origem}-${local.data}`,
      data: local.data,
      nome: local.nome,
      loja,
      minutosPrevistos: local.minutosPrevistos,
      criadoEm: ""
    };
  }
  const nacional = feriadosNacionaisDe(ano).find((f) => f.data === data);
  if (!nacional)
    return;
  return {
    id: `nacional-${nacional.data}`,
    data: nacional.data,
    nome: nacional.nome,
    minutosPrevistos: nacional.minutosPrevistos,
    criadoEm: ""
  };
};

// src/servicos/ferramentas.ts
var FERRAMENTAS = [
  {
    chave: "conversas",
    nome: "Conversas",
    descricao: "Chat individual com os colegas da rede.",
    area: "principal",
    nivelPadrao: NIVEL_COLABORADOR
  },
  {
    chave: "grupos",
    nome: "Grupos e canais",
    descricao: "Canais da loja e da rede.",
    area: "principal",
    nivelPadrao: NIVEL_COLABORADOR
  },
  {
    chave: "compartilhar_whatsapp",
    nome: "Compartilhar no WhatsApp",
    descricao: "Mandar mensagens do chat para fora, pelo WhatsApp do próprio aparelho.",
    area: "principal",
    nivelPadrao: NIVEL_COLABORADOR,
    cuidado: "É informação saindo da empresa. Fica registrado na Auditoria quem mandou e o quê, mas o envio em si acontece no WhatsApp da pessoa e não volta para cá."
  },
  {
    chave: "ponto",
    nome: "Meu ponto",
    descricao: 'Bater o ponto pelo QR e ver o próprio extrato. Some a aba "Ponto" da barra.',
    area: "principal",
    nivelPadrao: NIVEL_COLABORADOR,
    nivelMaximoPadrao: NIVEL_LIDER_SETOR,
    cuidado: "Da gerência para cima não se bate ponto: vem desmarcado de propósito. Marcar devolve a aba para o nível escolhido."
  },
  {
    chave: "eu",
    nome: "Meu perfil",
    descricao: "Foto, presença, dados cadastrais e preferências.",
    area: "principal",
    nivelPadrao: NIVEL_COLABORADOR
  },
  {
    chave: "painel_gestao",
    nome: "Minha Equipe",
    descricao: "Banco de horas, pendências e ficha de quem responde à pessoa. Mostra apenas a equipe dela.",
    area: "gestao",
    nivelPadrao: NIVEL_LIDER_SETOR
  },
  {
    chave: "espelho_equipe",
    nome: "Espelho de ponto da equipe",
    descricao: "O espelho dia a dia de quem responde à pessoa, com correção de horário. Mostra apenas a equipe dela.",
    area: "gestao",
    nivelPadrao: NIVEL_LIDER_SETOR,
    cuidado: "Quem tem isto corrige marcação da própria equipe — registro trabalhista, com autoria e motivo obrigatórios. Apagar batida continua só do RH."
  },
  {
    chave: "escala_folgas",
    nome: "Escala de folgas",
    descricao: "O calendário de folgas de sábado e férias da equipe, com lançamento pela liderança.",
    area: "gestao",
    nivelPadrao: NIVEL_LIDER_SETOR,
    cuidado: "Quem tem isto LANÇA folga e férias já aprovadas para a equipe. O limite de uma folga de sábado por mês continua valendo."
  },
  {
    chave: "aprovar_jornadas",
    nome: "Aprovar jornadas",
    descricao: "A fila de horas extras e saídas antecipadas aguardando decisão.",
    area: "gestao",
    nivelPadrao: NIVEL_LIDER_SETOR
  },
  {
    chave: "visao_lojas",
    nome: "Visão & Lojas",
    descricao: "Números da rede inteira: total por loja, por setor e quem está online.",
    area: "gestao",
    nivelPadrao: NIVEL_DIRETORIA,
    cuidado: "Mostra a rede toda, não só a loja de quem abre."
  },
  {
    chave: "organograma",
    nome: "Organograma",
    descricao: "A cadeia de responsabilidade. Alterar aqui muda quem aprova a hora de quem.",
    area: "gestao",
    nivelPadrao: NIVEL_DIRETORIA,
    cuidado: "Editar continua restrito a RH, Diretoria e TI, mesmo para quem enxerga."
  },
  {
    chave: "banco_horas_rh",
    nome: "Banco de Horas (RH)",
    descricao: "O painel de RH: espelho de ponto, correção de marcação e QR das lojas.",
    area: "gestao",
    nivelPadrao: NIVEL_DIRETORIA,
    cuidado: 'Espelho da REDE INTEIRA. Para o líder ver só a equipe dele, use "Espelho de ponto da equipe".'
  },
  {
    chave: "qr_ponto",
    nome: "QR do Ponto",
    descricao: "Gerar e imprimir o cartaz de ponto. O gerente vê apenas a própria loja; RH e TI, as cinco.",
    area: "gestao",
    nivelPadrao: NIVEL_GERENTE,
    cuidado: "Gerar um código novo invalida o cartaz antigo na hora — quem estiver com a foto dele não bate mais."
  },
  {
    chave: "rh_pessoal",
    nome: "RH · Pessoas e documentos",
    descricao: "Indicadores, holerite, atestado, advertência, escala e espelho.",
    area: "gestao",
    nivelPadrao: NIVEL_LIDER_SETOR
  },
  {
    chave: "adm_colaboradores",
    nome: "ADM · Colaboradores",
    descricao: "Cadastrar, editar e desligar pessoas.",
    area: "administracao",
    nivelPadrao: NIVEL_TI
  },
  {
    chave: "adm_planilha",
    nome: "ADM · Carga por planilha",
    descricao: "Importar colaboradores em lote.",
    area: "administracao",
    nivelPadrao: NIVEL_TI
  },
  {
    chave: "adm_lojas",
    nome: "ADM · Lojas",
    descricao: "Unidades da rede.",
    area: "administracao",
    nivelPadrao: NIVEL_TI
  },
  {
    chave: "adm_canais",
    nome: "ADM · Canais",
    descricao: "Criar e configurar os canais de mensagem.",
    area: "administracao",
    nivelPadrao: NIVEL_TI
  },
  {
    chave: "adm_avisos",
    nome: "ADM · Avisos",
    descricao: "Publicar e remover comunicados da direção.",
    area: "administracao",
    nivelPadrao: NIVEL_DIRETORIA
  },
  {
    chave: "adm_parametros",
    nome: "ADM · Parâmetros",
    descricao: "Ajustes gerais do sistema.",
    area: "administracao",
    nivelPadrao: NIVEL_TI
  },
  {
    chave: "adm_permissoes",
    nome: "ADM · Permissões",
    descricao: "Esta tela: define quais ferramentas cada nível enxerga.",
    area: "administracao",
    nivelPadrao: NIVEL_TI,
    sempreParaTI: true,
    cuidado: "Desligar isto trancaria o administrador para fora da própria configuração."
  },
  {
    chave: "adm_auditoria",
    nome: "ADM · Auditoria",
    descricao: "O registro do que cada pessoa fez no sistema.",
    area: "administracao",
    nivelPadrao: NIVEL_TI
  },
  {
    chave: "adm_banco",
    nome: "ADM · Banco de dados",
    descricao: "Uso de espaço e regra de limpeza do histórico.",
    area: "administracao",
    nivelPadrao: NIVEL_TI,
    sempreParaTI: true
  },
  {
    chave: "adm_backup",
    nome: "ADM · Backup",
    descricao: "Exportar e restaurar os dados do sistema.",
    area: "administracao",
    nivelPadrao: NIVEL_TI,
    sempreParaTI: true,
    cuidado: "Dá acesso ao conteúdo inteiro do sistema em arquivo."
  }
];
var acharFerramenta = (chave) => FERRAMENTAS.find((f) => f.chave === chave);
var permissoesPadrao = () => {
  const mapa = {};
  const niveis = [
    NIVEL_COLABORADOR,
    NIVEL_LIDER_SETOR,
    NIVEL_GERENTE,
    NIVEL_DIRETORIA,
    NIVEL_TI
  ];
  for (const ferramenta of FERRAMENTAS) {
    mapa[ferramenta.chave] = niveis.filter((n) => n >= ferramenta.nivelPadrao && (ferramenta.nivelMaximoPadrao === undefined || n <= ferramenta.nivelMaximoPadrao));
  }
  return mapa;
};

// src/servicos/permissoes.ts
var VERSAO_REGRAS = 1;
var CHAVE_VERSAO = "__regras";
var completarPermissoes = (gravadas) => {
  const padrao = permissoesPadrao();
  if (!gravadas)
    return { ...padrao, [CHAVE_VERSAO]: [VERSAO_REGRAS] };
  const completo = { ...padrao };
  for (const ferramenta of FERRAMENTAS) {
    const gravado = gravadas[ferramenta.chave];
    if (Array.isArray(gravado))
      completo[ferramenta.chave] = gravado;
  }
  const versaoGravada = Number(gravadas[CHAVE_VERSAO]?.[0] ?? 0);
  if (versaoGravada < VERSAO_REGRAS) {
    for (const ferramenta of FERRAMENTAS) {
      if (ferramenta.nivelMaximoPadrao === undefined)
        continue;
      const atuais = completo[ferramenta.chave];
      if (!Array.isArray(atuais))
        continue;
      completo[ferramenta.chave] = atuais.filter((n) => n <= ferramenta.nivelMaximoPadrao);
    }
  }
  completo[CHAVE_VERSAO] = [VERSAO_REGRAS];
  return completo;
};
var podeUsarComMapa = (chave, colaborador, mapa) => {
  const ferramenta = acharFerramenta(chave);
  if (!ferramenta)
    return false;
  if (ferramenta.sempreParaTI && colaborador.nivel >= NIVEL_TI)
    return true;
  const niveis = mapa[ferramenta.chave];
  return Array.isArray(niveis) && niveis.includes(colaborador.nivel);
};

// src/servicos/compensacaoDoSabado.ts
var fecharCompensacao = (anterior, juntada, folgas) => {
  const disponivel = Math.max(0, anterior) + Math.max(0, juntada);
  const consumida = Math.min(disponivel, Math.max(0, folgas) * MINUTOS_SABADO);
  return { consumida, saldoFinal: disponivel - consumida };
};
var mesAnterior = (mes) => {
  const [ano, m] = mes.split("-").map(Number);
  return m === 1 ? `${ano - 1}-12` : `${ano}-${String(m - 1).padStart(2, "0")}`;
};
var diasDoMes = (mes) => {
  const [ano, m] = mes.split("-").map(Number);
  const ultimo = new Date(ano, m, 0).getDate();
  return { inicio: `${mes}-01`, fim: `${mes}-${String(ultimo).padStart(2, "0")}` };
};

// src/servidor/apurarPonto.ts
var DIAS_REVISADOS = 35;
var chave = (colaboradorId, data) => `${colaboradorId}|${data}`;
var mudou = (antes, depois) => !antes || antes.tipo !== depois.tipo || antes.minutos !== depois.minutos || antes.minutosTrabalhados !== depois.minutosTrabalhados || antes.minutosPrevistos !== depois.minutosPrevistos || antes.estado !== depois.estado;
var ligarFonte = (dados, hoje) => {
  const porId = new Map(dados.colaboradores.map((c) => [c.id, c]));
  const batidasDoDia = new Map;
  for (const b of dados.batidas) {
    const k = chave(b.colaboradorId, b.data);
    batidasDoDia.set(k, [...batidasDoDia.get(k) || [], b]);
  }
  for (const lista of batidasDoDia.values()) {
    lista.sort((a, b) => ORDEM_MARCACOES.indexOf(a.tipo) - ORDEM_MARCACOES.indexOf(b.tipo));
  }
  const ajusteDoDia = new Map(dados.ajustes.map((a) => [chave(a.colaboradorId, a.data), a]));
  const permissoes = completarPermissoes(dados.permissoes);
  const batePonto = (c) => podeUsarComMapa("ponto", c, permissoes);
  usarFonteDaApuracao({
    colaborador: (id) => porId.get(id),
    marcacoesDoDia: (id, data) => batidasDoDia.get(chave(id, data)) || [],
    situacaoDoDia: (id, data) => situacaoNaLista(dados.ausencias, id, data),
    feriadoEm: (data, loja) => feriadoNaLista(dados.feriados, data, loja),
    ajusteDoDia: (id, data) => ajusteDoDia.get(chave(id, data)) ?? null,
    batePonto,
    hoje: () => hoje,
    minutosDoHorario: minutosEmBrasilia,
    tolerancias: () => ({
      porMarcacao: TOLERANCIA_POR_MARCACAO_PADRAO_MINUTOS,
      diaria: TOLERANCIA_PONTO_PADRAO_MINUTOS
    })
  });
  return { ajusteDoDia, batePonto };
};
var decidirDiaNoServidor = (dados, opcoes) => {
  ligarFonte(dados, opcoes.hoje);
  return decidirApuracao(opcoes.colaboradorId, opcoes.data, {
    motivo: opcoes.motivo,
    anexoCaminho: opcoes.anexoCaminho,
    corrigidoPor: opcoes.corrigidoPor,
    agora: opcoes.agora,
    novoId: opcoes.novoId
  });
};
var planejarApuracao = (dados, opcoes) => {
  const { ajusteDoDia, batePonto } = ligarFonte(dados, opcoes.hoje);
  const gravar = [];
  const novosNaFila = [];
  const registrar = (ajuste, entrouNaFila) => {
    gravar.push(ajuste);
    ajusteDoDia.set(chave(ajuste.colaboradorId, ajuste.data), ajuste);
    if (entrouNaFila)
      novosNaFila.push(ajuste);
  };
  const pessoas = dados.colaboradores.filter((c) => c.ativo !== false && batePonto(c));
  const dias = opcoes.diasParaTras ?? DIAS_REVISADOS;
  let faltas = 0;
  let apurados = 0;
  let diasFechados = 0;
  for (const pessoa of pessoas) {
    for (let i = 1;i <= dias; i++) {
      const referencia = deDataLocal(opcoes.hoje);
      referencia.setDate(referencia.getDate() - i);
      const data = paraDataLocal(referencia);
      const levantamento = decidirLevantamento(pessoa, data, opcoes.agora);
      if (levantamento.acao === "criarFalta") {
        registrar(levantamento.ajuste, true);
        faltas++;
        continue;
      }
      const jornada = jornadaDoDia(pessoa.id, data);
      if (!jornada.completa)
        continue;
      if (Object.keys(jornada.marcacoes).length > 0)
        diasFechados++;
      const apuracao = decidirApuracao(pessoa.id, data, { agora: opcoes.agora, novoId: opcoes.novoId });
      if (apuracao.acao === "nada")
        continue;
      if (!mudou(ajusteDoDia.get(chave(pessoa.id, data)) ?? undefined, apuracao.ajuste))
        continue;
      registrar(apuracao.ajuste, apuracao.entrouNaFila);
      apurados++;
    }
  }
  const mes = mesAnterior(opcoes.hoje.slice(0, 7));
  const { inicio, fim } = diasDoMes(mes);
  const gravados = new Map((dados.compensacoes || []).map((c) => [`${c.colaboradorId}|${c.mes}`, c]));
  const compensacoes = [];
  for (const pessoa of pessoas) {
    const datas = listarDatasDoPeriodo(inicio, fim);
    const juntada = datas.reduce((t, d) => t + jornadaDoDia(pessoa.id, d).compensacaoMinutos, 0);
    const folgas = datas.filter((d) => deDataLocal(d).getDay() === 6 && situacaoNaLista(dados.ausencias, pessoa.id, d) === "folga").length;
    const anterior = gravados.get(`${pessoa.id}|${mesAnterior(mes)}`)?.saldoFinal ?? 0;
    const atual = gravados.get(`${pessoa.id}|${mes}`);
    if (!atual && juntada === 0 && anterior === 0 && folgas === 0)
      continue;
    const { consumida, saldoFinal } = fecharCompensacao(anterior, juntada, folgas);
    const linha = { colaboradorId: pessoa.id, mes, anterior, juntada, folgas, consumida, saldoFinal };
    const igual = atual && atual.anterior === anterior && atual.juntada === juntada && atual.folgas === folgas && atual.consumida === consumida && atual.saldoFinal === saldoFinal;
    if (!igual)
      compensacoes.push(linha);
  }
  return {
    gravar,
    novosNaFila,
    compensacoes,
    resumo: { pessoas: pessoas.length, dias, diasFechados, faltas, apurados }
  };
};

// src/servicos/linhasDoBanco.ts
var paraColaboradorDaLinha = (linha, foto) => ({
  id: linha.id,
  nome: linha.nome,
  login: linha.login,
  cargo: linha.cargo,
  setor: linha.setor,
  loja: linha.loja,
  nivel: linha.nivel,
  foto,
  presenca: linha.presenca || "desconectado",
  vistoPorUltimo: linha.visto_por_ultimo || "Agora",
  ramal: linha.ramal || undefined,
  telefone: linha.telefone || undefined,
  email: linha.email || undefined,
  matricula: linha.matricula || undefined,
  cnpj: linha.cnpj || undefined,
  departamento: linha.departamento || undefined,
  responsavelId: linha.responsavel_id || undefined,
  dataAdmissao: linha.data_admissao || undefined,
  observacoes: linha.observacoes || undefined,
  cargaHorariaDiariaMinutos: linha.carga_horaria_diaria_minutos ?? undefined,
  turno: linha.turno || undefined,
  turnoConfirmadoEm: linha.turno_confirmado_em || undefined,
  cargaSemanalMinutos: linha.carga_semanal_minutos ?? undefined,
  trabalhaSabado: linha.trabalha_sabado ?? undefined,
  temIntervalo: linha.tem_intervalo ?? undefined,
  senhaAtivacao: undefined,
  ativo: linha.ativo,
  criadoEm: linha.criado_em
});
var paraRegistroPonto = (linha) => ({
  id: linha.id,
  colaboradorId: linha.colaborador_id,
  data: linha.data,
  tipo: linha.tipo,
  horario: linha.horario,
  horaFormatada: linha.hora_formatada,
  metodo: linha.metodo,
  loja: linha.loja,
  criadoEm: linha.criado_em,
  ajustadoPorId: linha.ajustado_por_id || undefined,
  ajustadoPorNome: linha.ajustado_por_nome || undefined,
  justificativa: linha.justificativa || undefined
});
var paraAjuste = (linha) => ({
  id: linha.id,
  colaboradorId: linha.colaborador_id,
  data: linha.data,
  tipo: linha.tipo,
  minutos: linha.minutos,
  minutosTrabalhados: linha.minutos_trabalhados,
  minutosPrevistos: linha.minutos_previstos,
  estado: linha.estado,
  aprovadorId: linha.aprovador_id || undefined,
  aprovadorNome: linha.aprovador_nome || undefined,
  decididoEm: linha.decidido_em || undefined,
  observacao: linha.observacao || undefined,
  origem: linha.origem || undefined,
  motivoColaborador: linha.motivo_colaborador || undefined,
  anexoCaminho: linha.anexo_caminho || undefined,
  criadoEm: linha.criado_em
});
var paraLinhaAjuste = (a) => ({
  id: a.id,
  colaborador_id: a.colaboradorId,
  data: a.data,
  tipo: a.tipo,
  minutos: a.minutos,
  minutos_trabalhados: a.minutosTrabalhados,
  minutos_previstos: a.minutosPrevistos,
  estado: a.estado,
  aprovador_id: a.aprovadorId ?? null,
  aprovador_nome: a.aprovadorNome ?? null,
  decidido_em: a.decididoEm ?? null,
  observacao: a.observacao ?? null,
  origem: a.origem ?? "pendencia",
  motivo_colaborador: a.motivoColaborador ?? null,
  anexo_caminho: a.anexoCaminho ?? null
});
var paraJustificativa = (linha) => ({
  id: String(linha.id),
  colaboradorId: String(linha.colaborador_id),
  dataInicio: String(linha.data_inicio),
  dataFim: String(linha.data_fim),
  tipo: linha.tipo,
  observacao: linha.observacao || undefined,
  anexoCaminho: linha.anexo_caminho || undefined,
  anexoNome: linha.anexo_nome || undefined,
  estado: linha.estado,
  aprovadorId: linha.aprovador_id || undefined,
  aprovadorNome: linha.aprovador_nome || undefined,
  decididoEm: linha.decidido_em || undefined,
  motivoRecusa: linha.motivo_recusa || undefined,
  criadoEm: String(linha.criado_em)
});
var paraFeriado = (l) => ({
  id: String(l.id),
  data: String(l.data),
  nome: String(l.nome),
  loja: l.loja || undefined,
  minutosPrevistos: Number(l.minutos_previstos) || 0,
  criadoEm: String(l.criado_em)
});
var paraCompensacao = (l) => ({
  colaboradorId: l.colaborador_id,
  mes: l.mes,
  anterior: l.anterior,
  juntada: l.juntada,
  folgas: l.folgas,
  consumida: l.consumida,
  saldoFinal: l.saldo_final
});
var paraLinhaCompensacao = (c) => ({
  colaborador_id: c.colaboradorId,
  mes: c.mes,
  anterior: c.anterior,
  juntada: c.juntada,
  folgas: c.folgas,
  consumida: c.consumida,
  saldo_final: c.saldoFinal
});

// src/servidor/funcaoApurarPonto.ts
var chaveDeServico = () => {
  const antiga = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (antiga)
    return antiga;
  const novas = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (novas) {
    try {
      const lista = JSON.parse(novas);
      const primeira = lista.default ?? Object.values(lista)[0];
      if (primeira)
        return primeira;
    } catch {
      return novas;
    }
  }
  throw new Error("Sem chave de serviço no ambiente da função.");
};
var chavePublica = () => {
  const antiga = Deno.env.get("SUPABASE_ANON_KEY");
  if (antiga)
    return antiga;
  const novas = Deno.env.get("SUPABASE_PUBLISHABLE_KEYS");
  if (novas) {
    try {
      const lista = JSON.parse(novas);
      const primeira = lista.default ?? Object.values(lista)[0];
      if (primeira)
        return primeira;
    } catch {
      return novas;
    }
  }
  throw new Error("Sem chave pública no ambiente da função.");
};
var responder = (corpo, status = 200) => new Response(JSON.stringify(corpo), { status, headers: { "content-type": "application/json" } });
var banco = () => {
  const url = `${Deno.env.get("SUPABASE_URL")}/rest/v1`;
  const chave = chaveDeServico();
  const cabecalhos = { apikey: chave, Authorization: `Bearer ${chave}` };
  const ausentes = new Set;
  const ler = async (caminho, opcional = false) => {
    const todas = [];
    for (let de = 0;; de += 1000) {
      const pedir = () => fetch(`${url}/${caminho}`, {
        headers: { ...cabecalhos, Range: `${de}-${de + 999}`, "Range-Unit": "items" }
      });
      let r = await pedir();
      for (let tentativa = 1;r.status === 401 && tentativa <= 3; tentativa++) {
        await new Promise((ok) => setTimeout(ok, 2000 * tentativa));
        r = await pedir();
      }
      if (opcional && r.status === 404) {
        ausentes.add(caminho.split("?")[0]);
        return [];
      }
      if (!r.ok)
        throw new Error(`Leitura de ${caminho.split("?")[0]}: ${r.status} ${await r.text()}`);
      const pagina = await r.json();
      todas.push(...pagina);
      if (pagina.length < 1000)
        return todas;
    }
  };
  const gravarAjustes = async (linhas) => {
    for (let i = 0;i < linhas.length; i += 500) {
      const r = await fetch(`${url}/ajustes_jornada?on_conflict=id`, {
        method: "POST",
        headers: {
          ...cabecalhos,
          "Content-Type": "application/json",
          Prefer: "resolution=merge-duplicates,return=minimal"
        },
        body: JSON.stringify(linhas.slice(i, i + 500))
      });
      if (!r.ok)
        throw new Error(`Gravação das apurações: ${r.status} ${await r.text()}`);
    }
  };
  const gravarCompensacoes = async (linhas) => {
    if (linhas.length === 0 || ausentes.has("compensacao_sabado"))
      return;
    const r = await fetch(`${url}/compensacao_sabado?on_conflict=colaborador_id,mes`, {
      method: "POST",
      headers: {
        ...cabecalhos,
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates,return=minimal"
      },
      body: JSON.stringify(linhas.map((l) => ({ ...l, atualizado_em: new Date().toISOString() })))
    });
    if (!r.ok)
      throw new Error(`Gravação da compensação do sábado: ${r.status} ${await r.text()}`);
  };
  return { ler, gravarAjustes, gravarCompensacoes, ausentes };
};
var apurarUmDia = async (req, corpo) => {
  const url = Deno.env.get("SUPABASE_URL");
  const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!jwt)
    return responder({ erro: "Sem sessão." }, 401);
  const data = String(corpo.data ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data))
    return responder({ erro: "Dia inválido." }, 400);
  const quem = await fetch(`${url}/auth/v1/user`, {
    headers: { apikey: chaveDeServico(), Authorization: `Bearer ${jwt}` }
  });
  if (!quem.ok)
    return responder({ erro: "Sessão inválida." }, 401);
  const usuario = await quem.json();
  const { ler, gravarAjustes } = banco();
  const [eu] = await ler(`colaboradores?select=*&auth_user_id=eq.${usuario.id}`);
  if (!eu)
    return responder({ erro: "Sessão sem colaborador." }, 403);
  const alvoId = String(corpo.colaboradorId || eu.id);
  const corrigido = corpo.corrigido === true;
  if (alvoId !== eu.id || corrigido) {
    const r = await fetch(`${url}/rest/v1/rpc/posso_decidir_jornada`, {
      method: "POST",
      headers: { apikey: chavePublica(), Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
      body: JSON.stringify({ alvo: alvoId })
    });
    if (!r.ok || await r.json() !== true) {
      return responder({ erro: "Você não responde pela jornada desta pessoa." }, 403);
    }
  }
  const [alvo, batidas, ausencias, feriados, ajustes, configuracoes] = await Promise.all([
    ler(`colaboradores?select=*&id=eq.${encodeURIComponent(alvoId)}`),
    ler(`registros_ponto?select=*&colaborador_id=eq.${encodeURIComponent(alvoId)}&data=eq.${data}`),
    ler(`justificativas_ausencia?select=*&colaborador_id=eq.${encodeURIComponent(alvoId)}&estado=eq.aprovada&data_inicio=lte.${data}&data_fim=gte.${data}`),
    ler(`feriados?select=*&data=eq.${data}`, true),
    ler(`ajustes_jornada?select=*&colaborador_id=eq.${encodeURIComponent(alvoId)}&data=eq.${data}`),
    ler("configuracoes?select=permissoes_ferramentas")
  ]);
  if (!alvo[0])
    return responder({ erro: "Colaborador não encontrado." }, 404);
  const decisao = decidirDiaNoServidor({
    colaboradores: alvo.map((l) => paraColaboradorDaLinha(l, "")),
    batidas: batidas.map(paraRegistroPonto),
    ausencias: ausencias.map(paraJustificativa),
    feriados: feriados.map(paraFeriado),
    ajustes: ajustes.map(paraAjuste),
    permissoes: configuracoes[0]?.permissoes_ferramentas ?? null
  }, {
    colaboradorId: alvoId,
    data,
    hoje: hojeEmBrasilia(),
    agora: new Date().toISOString(),
    novoId: () => `ajuste-${crypto.randomUUID()}`,
    motivo: typeof corpo.motivo === "string" ? corpo.motivo.trim() || undefined : undefined,
    anexoCaminho: typeof corpo.anexoCaminho === "string" ? corpo.anexoCaminho || undefined : undefined,
    corrigidoPor: corrigido ? { id: eu.id, nome: eu.nome } : undefined
  });
  if (decisao.acao === "nada")
    return responder({ ok: true, acao: "nada" });
  await gravarAjustes([paraLinhaAjuste(decisao.ajuste)]);
  return responder({
    ok: true,
    acao: "gravar",
    ajuste: decisao.ajuste,
    reescrita: decisao.reescrita,
    entrouNaFila: decisao.entrouNaFila
  });
};
Deno.serve(async (req) => {
  let corpo = {};
  try {
    corpo = await req.clone().json();
  } catch {}
  if (corpo?.modo === "dia") {
    try {
      return await apurarUmDia(req, corpo);
    } catch (e) {
      console.error("Apuração do dia falhou:", e);
      return responder({ erro: String(e instanceof Error ? e.message : e) }, 500);
    }
  }
  const segredo = Deno.env.get("APURAR_SEGREDO");
  if (!segredo || req.headers.get("x-apurar-segredo") !== segredo) {
    return responder({ erro: "Não autorizado." }, 401);
  }
  try {
    const hoje = hojeEmBrasilia();
    const primeiro = deDataLocal(hoje);
    primeiro.setDate(primeiro.getDate() - DIAS_REVISADOS - 1);
    const mesFechado = mesAnterior(hoje.slice(0, 7));
    const inicioDoMesFechado = diasDoMes(mesFechado).inicio;
    const inicio = paraDataLocal(primeiro) < inicioDoMesFechado ? paraDataLocal(primeiro) : inicioDoMesFechado;
    const { ler, gravarAjustes, gravarCompensacoes, ausentes } = banco();
    const [colaboradores, batidas, ausencias, feriados, ajustes, configuracoes, compensacoes] = await Promise.all([
      ler("colaboradores?select=*&ativo=eq.true&order=id"),
      ler(`registros_ponto?select=*&data=gte.${inicio}&data=lt.${hoje}&order=id`),
      ler(`justificativas_ausencia?select=*&estado=eq.aprovada&data_fim=gte.${inicio}&order=id`),
      ler("feriados?select=*&order=id", true),
      ler(`ajustes_jornada?select=*&data=gte.${inicio}&order=id`),
      ler("configuracoes?select=permissoes_ferramentas"),
      ler(`compensacao_sabado?select=*&mes=gte.${mesAnterior(mesFechado)}`, true)
    ]);
    const plano = planejarApuracao({
      colaboradores: colaboradores.map((l) => paraColaboradorDaLinha(l, "")),
      batidas: batidas.map(paraRegistroPonto),
      ausencias: ausencias.map(paraJustificativa),
      feriados: feriados.map(paraFeriado),
      ajustes: ajustes.map(paraAjuste),
      permissoes: configuracoes[0]?.permissoes_ferramentas ?? null,
      compensacoes: compensacoes.map(paraCompensacao)
    }, { hoje, agora: new Date().toISOString(), novoId: () => `ajuste-${crypto.randomUUID()}` });
    const simular = new URL(req.url).searchParams.has("simular");
    if (!simular) {
      await gravarAjustes(plano.gravar.map(paraLinhaAjuste));
      await gravarCompensacoes(plano.compensacoes.map((c) => ({ ...paraLinhaCompensacao(c) })));
    }
    const nomes = new Map(colaboradores.map((c) => [c.id, c.nome]));
    const resultado = {
      ok: true,
      simulacao: simular,
      hoje,
      revisados: `${inicio} a ${hoje}`,
      ...plano.resumo,
      lidos: {
        colaboradores: colaboradores.length,
        batidas: batidas.length,
        ausencias: ausencias.length,
        feriados: feriados.length,
        apuracoes: ajustes.length
      },
      gravados: simular ? 0 : plano.gravar.length,
      novosNaFila: plano.novosNaFila.length,
      compensacao: {
        mes: mesFechado,
        fechados: plano.compensacoes.length,
        semTabela: ausentes.has("compensacao_sabado")
      },
      ...simular ? {
        seriaGravado: plano.gravar.map((a) => `${nomes.get(a.colaboradorId) ?? a.colaboradorId} · ${a.data} · ${a.tipo} ${a.minutos}min · ${a.estado}`),
        compensacaoQueSeriaFechada: plano.compensacoes.map((c) => `${nomes.get(c.colaboradorId) ?? c.colaboradorId} · ${c.mes} · veio ${c.anterior} + juntou ${c.juntada} − folgas ${c.consumida} = segue ${c.saldoFinal}min`)
      } : {}
    };
    console.log("Apuração da madrugada:", JSON.stringify(resultado));
    return responder(resultado);
  } catch (e) {
    console.error("Apuração da madrugada falhou:", e);
    return responder({ erro: String(e instanceof Error ? e.message : e) }, 500);
  }
});
