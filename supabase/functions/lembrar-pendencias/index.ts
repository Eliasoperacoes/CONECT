// @ts-nocheck
/**
 * GERADO — NÃO EDITE. Fonte: src/servidor/funcaoLembrarPendencias.ts
 * Para atualizar: bun scripts/gerar-funcao-apurar.ts, e cole este arquivo
 * inteiro em Edge Functions → lembrar-pendencias → Code.
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
    sabado: true
  },
  {
    chave: "E3",
    nome: "Estágio tarde · 13:00 às 18:00 · 5h",
    entrada: "13:00",
    saida: "18:00",
    intervalo: { saida: "15:30", retorno: "15:45", desconta: false },
    perfil: "estagio",
    sabado: true
  }
];
var TURNO_SABADO = { entrada: "08:00", saida: "12:00" };
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
var ORDEM_MARCACOES = [
  "entrada",
  "saida_almoco",
  "retorno_almoco",
  "saida"
];
var ROTULO_MARCACAO = {
  entrada: "Entrada",
  saida_almoco: "Saída para almoço",
  retorno_almoco: "Retorno do almoço",
  saida: "Saída"
};
var SITUACAO_POR_TIPO = {
  atestado: "abonado_atestado",
  falta_justificada: "falta_justificada",
  comparecimento: "comparecimento",
  folga_sabado: "folga",
  ferias: "ferias",
  outro: "abonado_outro"
};
var SITUACOES_DE_DESCANSO = ["folga", "ferias"];
var ehDescanso = (situacao) => SITUACOES_DE_DESCANSO.includes(situacao);
var INFORMACOES_LOJAS = [
  {
    nome: "Pirassununga",
    tipo: "Matriz",
    cidade: "Pirassununga - SP",
    gerente: "Carlos Malachias / Marcos",
    telefone: "(19) 3561-1000",
    grupoId: "grupo-loja-pirassununga",
    coordenadas: { latitude: -21.996, longitude: -47.426 }
  },
  {
    nome: "Porto Ferreira",
    tipo: "Filial",
    cidade: "Porto Ferreira - SP",
    gerente: "Roberto Fagundes",
    telefone: "(19) 3581-2000",
    grupoId: "grupo-loja-porto-ferreira",
    coordenadas: { latitude: -21.854, longitude: -47.479 }
  },
  {
    nome: "Palmeiras",
    tipo: "Filial",
    cidade: "Santa Cruz das Palmeiras - SP",
    gerente: "Márcio Prado",
    telefone: "(19) 3672-3000",
    grupoId: "grupo-loja-palmeiras",
    coordenadas: { latitude: -21.827, longitude: -47.248 }
  },
  {
    nome: "Descalvado",
    tipo: "Filial",
    cidade: "Descalvado - SP",
    gerente: "Fernanda Alves",
    telefone: "(19) 3583-4000",
    grupoId: "grupo-loja-descalvado",
    coordenadas: { latitude: -21.904, longitude: -47.62 }
  },
  {
    nome: "Santa Rita",
    tipo: "Filial",
    cidade: "Santa Rita do Passa Quatro - SP",
    gerente: "André Villanova",
    telefone: "(19) 3582-5000",
    grupoId: "grupo-loja-santa-rita",
    coordenadas: { latitude: -21.711, longitude: -47.478 }
  },
  {
    nome: "Rede",
    tipo: "Central",
    cidade: "Operações Centrais",
    gerente: "Vanessa / Marcelo",
    telefone: "(19) 3561-9900",
    grupoId: "grupo-avisos-da-rede",
    coordenadas: { latitude: -21.996, longitude: -47.426 }
  }
];

// src/servicos/textoRico.ts
var pessoasCitadas = (texto) => [
  ...new Set([...(texto || "").matchAll(/@\[[^\]]+\]\(pessoa:([^)]+)\)/g)].map((m) => m[1].trim()).filter(Boolean))
];

// src/servicos/mural.ts
var destinosDe = (publicacao) => {
  const escolhidos = publicacao.destinos && publicacao.destinos.length > 0 ? publicacao.destinos : publicacao.lojaDestino && publicacao.lojaDestino !== "Todas" ? [{ alcance: "loja", valor: publicacao.lojaDestino }] : [{ alcance: "rede", valor: "" }];
  const citados = pessoasCitadas(publicacao.conteudo || "");
  if (citados.length === 0)
    return escolhidos;
  const jaEndereçados = new Set(escolhidos.filter((d) => d.alcance === "pessoa").map((d) => d.valor));
  return [
    ...escolhidos,
    ...citados.filter((id) => !jaEndereçados.has(id)).map((id) => ({ alcance: "pessoa", valor: id }))
  ];
};
var alcanca = (publicacao, pessoa) => {
  if (publicacao.autorId === pessoa.id)
    return true;
  return destinosDe(publicacao).some((destino) => {
    switch (destino.alcance) {
      case "rede":
        return true;
      case "loja":
        return pessoa.loja === destino.valor;
      case "setor":
        return pessoa.setor === destino.valor;
      case "pessoa":
        return pessoa.id === destino.valor;
      default:
        return false;
    }
  });
};
var publicoAlvo = (publicacao, todos) => todos.filter((c) => c.ativo !== false && c.id !== publicacao.autorId && alcanca(publicacao, c));

// src/servicos/mesesDoEspelho.ts
var MESES_DO_ESPELHO = 12;
var ESPELHO_ASSINADO_DESDE = "2026-09";
var NOMES_DOS_MESES = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro"
];
var doisDigitos = (n) => String(n).padStart(2, "0");
var rotuloDoMes = (mes) => {
  const [ano, m] = mes.split("-").map(Number);
  return `${NOMES_DOS_MESES[m - 1] || mes} de ${ano}`;
};
var mesesFechados = (hoje, dataAdmissao, quantos = MESES_DO_ESPELHO) => {
  const meses = [];
  let [ano, mes] = hoje.split("-").map(Number);
  const primeiro = dataAdmissao ? dataAdmissao.slice(0, 7) : "";
  for (let i = 0;i < quantos; i++) {
    mes -= 1;
    if (mes === 0) {
      mes = 12;
      ano -= 1;
    }
    const chave = `${ano}-${doisDigitos(mes)}`;
    if (primeiro && chave < primeiro)
      break;
    meses.push(chave);
  }
  return meses;
};
var espelhosParaAssinar = (colaborador, bateOPonto, hoje, assinados) => bateOPonto ? mesesFechados(hoje, colaborador.dataAdmissao).filter((m) => m >= ESPELHO_ASSINADO_DESDE && !assinados.has(m)) : [];

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
var deDataLocal = (data) => {
  const [ano, mes, dia] = data.split("-").map(Number);
  return new Date(ano, (mes || 1) - 1, dia || 1, 12, 0, 0);
};
var ehDiaDeFolga = (data) => deDataLocal(data).getDay() === 0;
var ehSabado = (data) => deDataLocal(data).getDay() === 6;
var situacaoEfetiva = (colaboradorId, data) => {
  const situacao = fonte.situacaoDoDia(colaboradorId, data);
  if (situacao === "folga" && fonte.marcacoesDoDia(colaboradorId, data).length > 0)
    return "normal";
  return situacao;
};
var marcacoesEsperadas = (data, colaborador) => {
  if (colaborador && situacaoEfetiva(colaborador.id, data) !== "normal")
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
  if (colaborador) {
    const situacao = situacaoEfetiva(colaborador.id, data);
    if (situacao !== "normal" && (ehDescanso(situacao) || fonte.marcacoesDoDia(colaborador.id, data).length === 0)) {
      return 0;
    }
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

// src/servidor/lembretes.ts
var ESPERA_HORAS = 20;
var PUBLICACAO_COBRADA_DIAS = 15;
var MESES = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro"
];
var mesPorExtenso = (competencia) => {
  const [ano, mes] = competencia.split("-");
  return `${MESES[Number(mes) - 1] || mes} de ${ano}`;
};
var porPessoa = (itens, dono) => {
  const grupos = new Map;
  for (const item of itens) {
    const id = dono(item);
    grupos.set(id, [...grupos.get(id) || [], item]);
  }
  return grupos;
};
var planejarLembretes = (d, agora) => {
  const ativos = new Set(d.colaboradores.filter((c) => c.ativo !== false).map((c) => c.id));
  const limite = agora.getTime() - ESPERA_HORAS * 3600000;
  const jaEsperou = (iso) => new Date(iso).getTime() <= limite;
  const lembretes = [];
  const aviso = (colaboradorId, assunto, dados) => ({
    colaboradorId,
    dados: { mensagemId: `lembrete-${assunto}-${colaboradorId}`, ehGrupo: "true", ...dados }
  });
  const holerites = d.holerites.filter((h) => ativos.has(h.colaboradorId) && !d.assinados.has(h.id) && jaEsperou(h.criadoEm));
  for (const [colaboradorId, seus] of porPessoa(holerites, (h) => h.colaboradorId)) {
    const texto = seus.length === 1 ? `Seu holerite de ${mesPorExtenso(seus[0].competencia)} ainda não foi assinado. Toque para assinar.` : `Você tem ${seus.length} holerites para assinar. Toque para ver.`;
    lembretes.push(aviso(colaboradorId, "holerite", {
      tipo: "secao",
      conversaId: "meus_holerites",
      remetente: "RH",
      conversa: "Holerite para assinar",
      texto
    }));
  }
  const advertencias = d.advertencias.filter((a) => ativos.has(a.colaboradorId) && !a.cienciaEm && jaEsperou(a.criadoEm));
  for (const colaboradorId of porPessoa(advertencias, (a) => a.colaboradorId).keys()) {
    lembretes.push(aviso(colaboradorId, "ciencia", {
      tipo: "secao",
      conversaId: "minhas_advertencias",
      remetente: "RH",
      conversa: "Documento do RH",
      texto: "Há um documento do RH aguardando a sua ciência. Toque para abrir."
    }));
  }
  const desde = agora.getTime() - PUBLICACAO_COBRADA_DIAS * 86400000;
  const pendentes = [];
  for (const p of d.publicacoes) {
    const criada = new Date(p.criadoEm).getTime();
    if (!p.exigeConfirmacao || criada < desde || !jaEsperou(p.criadoEm))
      continue;
    const confirmaram = new Set(p.confirmacoesIds || []);
    for (const pessoa of publicoAlvo(p, d.colaboradores)) {
      if (!confirmaram.has(pessoa.id))
        pendentes.push({ colaboradorId: pessoa.id, publicacao: p });
    }
  }
  for (const [colaboradorId, suas] of porPessoa(pendentes, (p) => p.colaboradorId)) {
    const [maisRecente] = [...suas].sort((a, b) => b.publicacao.criadoEm.localeCompare(a.publicacao.criadoEm));
    lembretes.push(aviso(colaboradorId, "publicacao", {
      tipo: "publicacao",
      conversaId: maisRecente.publicacao.id,
      publicacaoId: maisRecente.publicacao.id,
      remetente: "Central",
      conversa: "Confirme a leitura",
      texto: suas.length === 1 ? maisRecente.publicacao.titulo : `Você tem ${suas.length} publicações para confirmar a leitura.`
    }));
  }
  if (d.espelhos) {
    const hoje = hojeEmBrasilia(agora);
    for (const c of d.colaboradores) {
      if (!ativos.has(c.id))
        continue;
      const meses = espelhosParaAssinar(c, d.espelhos.batePonto(c), hoje, {
        has: (mes) => d.espelhos.assinados.has(`${c.id}|${mes}`)
      });
      if (meses.length === 0)
        continue;
      lembretes.push(aviso(c.id, "espelho", {
        tipo: "secao",
        conversaId: "meus_espelhos",
        remetente: "Ponto",
        conversa: "Espelho de ponto",
        texto: meses.length === 1 ? `Seu espelho de ponto de ${rotuloDoMes(meses[0])} está disponível para assinar. Toque para conferir.` : `Você tem ${meses.length} espelhos de ponto para assinar. Toque para ver.`
      }));
    }
  }
  return lembretes;
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

// src/servidor/apurarPonto.ts
var chave = (colaboradorId, data) => `${colaboradorId}|${data}`;
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

// src/servidor/semBater.ts
var JANELA_DO_ALERTA_MIN = 5;
var emMinutos2 = (hora) => {
  const [h, m] = hora.split(":").map(Number);
  return h * 60 + m;
};
var comoHora = (minutos) => `${String(Math.floor(minutos / 60)).padStart(2, "0")}:${String(minutos % 60).padStart(2, "0")}`;
var horaEsperada = (colaborador, data, tipo, saidaAlmoco) => {
  const horarios = horariosEsperadosDoDia(colaborador, data);
  if (tipo === "entrada") {
    return horarios?.entrada ?? emMinutos2(ehSabado(data) ? TURNO_SABADO.entrada : turnoDe(colaborador).entrada);
  }
  const esperado = horarios?.[tipo];
  if (esperado === undefined)
    return null;
  if (tipo === "retorno_almoco" && saidaAlmoco !== null && horarios?.saida_almoco !== undefined) {
    return Math.max(esperado, saidaAlmoco + (esperado - horarios.saida_almoco));
  }
  return esperado;
};
var planejarAlertasSemBater = (dados, agora) => {
  const hoje = hojeEmBrasilia(agora);
  const { batePonto } = ligarFonte({ ...dados, ajustes: [] }, hoje);
  const minutoAgora = minutosEmBrasilia(agora.toISOString());
  const batidasDe = new Map;
  for (const b of dados.batidas) {
    if (b.data !== hoje)
      continue;
    const dela = batidasDe.get(b.colaboradorId) ?? new Map;
    dela.set(b.tipo, minutosEmBrasilia(b.horario));
    batidasDe.set(b.colaboradorId, dela);
  }
  const alertas = [];
  for (const c of dados.colaboradores) {
    if (c.ativo === false || !batePonto(c))
      continue;
    const feitas = batidasDe.get(c.id) ?? new Map;
    const proxima = marcacoesEsperadas(hoje, c).find((t) => !feitas.has(t));
    if (!proxima)
      continue;
    const esperado = horaEsperada(c, hoje, proxima, feitas.get("saida_almoco") ?? null);
    if (esperado === null)
      continue;
    const fimDaTolerancia = esperado + TOLERANCIA_POR_MARCACAO_PADRAO_MINUTOS;
    if (!(minutoAgora > fimDaTolerancia && minutoAgora <= fimDaTolerancia + JANELA_DO_ALERTA_MIN))
      continue;
    const rotulo = ROTULO_MARCACAO[proxima];
    alertas.push({
      colaboradorId: c.id,
      dados: {
        tipo: "secao",
        conversaId: "meu_ponto",
        mensagemId: `sem-bater-${c.id}`,
        ehGrupo: "true",
        remetente: "Ponto",
        conversa: "Você ainda não bateu o ponto",
        texto: `${rotulo} · horário previsto ${comoHora(esperado)}. Toque para bater o ponto.`
      }
    });
  }
  return alertas;
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
  justificativa: linha.justificativa || undefined,
  nsr: linha.nsr != null ? Number(linha.nsr) : undefined,
  registradoEm: linha.registrado_em || undefined,
  cnpjEmpregador: linha.cnpj_empregador || undefined,
  codigoVerificacao: linha.codigo_verificacao || undefined
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
var horaDe = (iso) => new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
var paraAvisoRede = (linha, lidoPorIds, confirmacoesIds) => ({
  id: linha.id,
  titulo: linha.titulo,
  conteudo: linha.conteudo,
  prioridade: linha.prioridade,
  autorId: linha.autor_id || "",
  autorNome: linha.autor_nome,
  autorCargo: linha.autor_cargo,
  criadoEm: linha.criado_em,
  horaFormatada: horaDe(linha.criado_em),
  dataPorExtenso: new Date(linha.criado_em).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "long",
    year: "numeric"
  }),
  fixadoNoTopo: linha.fixado_no_topo,
  tipo: linha.tipo || "aviso",
  categoria: linha.categoria || "operacional",
  anexoCaminho: linha.anexo_caminho || undefined,
  anexoNome: linha.anexo_nome || undefined,
  exigeConfirmacao: linha.exige_confirmacao === true,
  destinos: linha.destinos || undefined,
  lojaDestino: linha.loja_destino,
  lidoPorIds,
  confirmacoesIds
});

// src/servidor/bancoNoServidor.ts
var chaveDoAmbiente = (antiga, novas, faltando) => {
  const valor = Deno.env.get(antiga);
  if (valor)
    return valor;
  const lista = Deno.env.get(novas);
  if (lista) {
    try {
      const chaves = JSON.parse(lista);
      const primeira = chaves.default ?? Object.values(chaves)[0];
      if (primeira)
        return primeira;
    } catch {
      return lista;
    }
  }
  throw new Error(faltando);
};
var chaveDeServico = () => chaveDoAmbiente("SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SECRET_KEYS", "Sem chave de serviço no ambiente da função.");
var chavePublica = () => chaveDoAmbiente("SUPABASE_ANON_KEY", "SUPABASE_PUBLISHABLE_KEYS", "Sem chave pública no ambiente da função.");
var responder = (corpo, status = 200) => new Response(JSON.stringify(corpo), { status, headers: { "content-type": "application/json" } });
var criarLeitor = () => {
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
  return { url, cabecalhos, ler, ausentes };
};

// src/servidor/funcaoLembrarPendencias.ts
var POR_ENTREGA = 500;
var entregar = async (segredo, lembretes) => {
  let entregues = 0;
  for (let i = 0;i < lembretes.length; i += POR_ENTREGA) {
    const r = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/enviar-aviso`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: chavePublica(),
        "x-apurar-segredo": segredo
      },
      body: JSON.stringify({ entregaAgendada: lembretes.slice(i, i + POR_ENTREGA) })
    });
    if (!r.ok)
      throw new Error(`enviar-aviso respondeu ${r.status}: ${await r.text()}`);
    entregues += (await r.json()).entregues || 0;
  }
  return entregues;
};
var COLUNAS_DO_ALERTA = "id,nome,login,cargo,setor,loja,nivel,responsavel_id,data_admissao,carga_horaria_diaria_minutos,turno,carga_semanal_minutos,trabalha_sabado,tem_intervalo,ativo";
var alertarSemBater = async (segredo, simular) => {
  const { ler } = criarLeitor();
  const agora = new Date;
  const hoje = hojeEmBrasilia(agora);
  const [colaboradores, batidas, ausencias, feriados, configuracoes] = await Promise.all([
    ler(`colaboradores?select=${COLUNAS_DO_ALERTA}&ativo=eq.true`),
    ler(`registros_ponto?select=id,colaborador_id,data,tipo,horario&data=eq.${hoje}`),
    ler(`justificativas_ausencia?select=*&estado=eq.aprovada&data_inicio=lte.${hoje}&data_fim=gte.${hoje}`),
    ler("feriados?select=*", true),
    ler("configuracoes?select=permissoes_ferramentas")
  ]);
  const alertas = planejarAlertasSemBater({
    colaboradores: colaboradores.map((c) => paraColaboradorDaLinha(c, "")),
    batidas: batidas.map(paraRegistroPonto),
    ausencias: ausencias.map(paraJustificativa),
    feriados: feriados.map(paraFeriado),
    permissoes: configuracoes[0]?.permissoes_ferramentas ?? null
  }, agora);
  if (simular) {
    const nomes = new Map(colaboradores.map((c) => [c.id, c.nome]));
    return responder({
      simulacao: true,
      hoje,
      batidas: batidas.length,
      alertas: alertas.length,
      seriaEnviado: alertas.map((a) => `${nomes.get(a.colaboradorId) || a.colaboradorId} · ${a.dados.texto}`)
    });
  }
  const entregues = alertas.length ? await entregar(segredo, alertas) : 0;
  return responder({ ok: true, hoje, alertas: alertas.length, entregues });
};
Deno.serve(async (req) => {
  const segredo = Deno.env.get("APURAR_SEGREDO");
  if (!segredo || req.headers.get("x-apurar-segredo") !== segredo) {
    return responder({ erro: "Sem autorização." }, 401);
  }
  const simular = new URL(req.url).searchParams.has("simular");
  try {
    if (new URL(req.url).searchParams.has("semBater"))
      return await alertarSemBater(segredo, simular);
    const { ler, ausentes } = criarLeitor();
    const agora = new Date;
    const desde = new Date(agora.getTime() - PUBLICACAO_COBRADA_DIAS * 86400000).toISOString();
    const [colaboradores, holerites, recebimentos, advertencias, publicacoes, espelhosAssinados, configuracoes] = await Promise.all([
      ler("colaboradores?select=*"),
      ler("holerites?select=id,colaborador_id,competencia,criado_em", true),
      ler("recebimentos_holerite?select=holerite_id", true),
      ler("advertencias?select=id,colaborador_id,ciencia_em,criado_em&ciencia_em=is.null", true),
      ler(`avisos_rede?select=*&exige_confirmacao=eq.true&criado_em=gte.${encodeURIComponent(desde)}`),
      ler("espelhos_assinados?select=colaborador_id,mes", true),
      ler("configuracoes?select=permissoes_ferramentas")
    ]);
    const permissoes = completarPermissoes(configuracoes[0]?.permissoes_ferramentas ?? null);
    const ids = publicacoes.map((p) => p.id);
    const confirmacoes = ids.length ? await ler(`avisos_leitura?select=aviso_id,colaborador_id&confirmado=eq.true&aviso_id=in.(${ids.map((id) => `"${id}"`).join(",")})`) : [];
    const confirmaram = new Map;
    for (const c of confirmacoes)
      confirmaram.set(c.aviso_id, [...confirmaram.get(c.aviso_id) || [], c.colaborador_id]);
    const semAssinaturas = ausentes.has("recebimentos_holerite");
    const lembretes = planejarLembretes({
      colaboradores: colaboradores.map((c) => paraColaboradorDaLinha(c, "")),
      holerites: semAssinaturas ? [] : holerites.map((h) => ({
        id: h.id,
        colaboradorId: h.colaborador_id,
        competencia: h.competencia,
        criadoEm: h.criado_em
      })),
      assinados: new Set(recebimentos.map((r) => r.holerite_id)),
      advertencias: advertencias.map((a) => ({
        id: a.id,
        colaboradorId: a.colaborador_id,
        cienciaEm: a.ciencia_em,
        criadoEm: a.criado_em
      })),
      publicacoes: publicacoes.map((p) => paraAvisoRede(p, [], confirmaram.get(p.id) || [])),
      espelhos: ausentes.has("espelhos_assinados") ? undefined : {
        assinados: new Set(espelhosAssinados.map((e) => `${e.colaborador_id}|${e.mes}`)),
        batePonto: (c) => podeUsarComMapa("ponto", c, permissoes)
      }
    }, agora);
    const lidos = {
      colaboradores: colaboradores.length,
      holerites: holerites.length,
      assinados: recebimentos.length,
      advertenciasSemCiencia: advertencias.length,
      publicacoesEmCobranca: publicacoes.length,
      espelhosAssinados: espelhosAssinados.length
    };
    if (simular) {
      const nomes = new Map(colaboradores.map((c) => [c.id, c.nome]));
      return responder({
        simulacao: true,
        lidos,
        semAssinaturas,
        lembretes: lembretes.length,
        seriaEnviado: lembretes.map((l) => `${nomes.get(l.colaboradorId) || l.colaboradorId} · ${l.dados.conversa} · ${l.dados.texto}`)
      });
    }
    const entregues = await entregar(segredo, lembretes);
    return responder({ ok: true, lidos, lembretes: lembretes.length, entregues });
  } catch (erro) {
    console.error("Lembretes do dia:", erro);
    return responder({ erro: erro instanceof Error ? erro.message : String(erro) }, 500);
  }
});
