// @ts-nocheck
/**
 * GERADO — NÃO EDITE. Fonte: src/servidor/funcaoLembrarPendencias.ts
 * Para atualizar: bun scripts/gerar-funcao-apurar.ts, e cole este arquivo
 * inteiro em Edge Functions → lembrar-pendencias → Code.
 */
// src/tipos.ts
var TURNO_SABADO = { entrada: "08:00", saida: "12:00" };
var emMinutos = (hora) => {
  const [h, m] = hora.split(":").map(Number);
  return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0);
};
var MINUTOS_SABADO = emMinutos(TURNO_SABADO.saida) - emMinutos(TURNO_SABADO.entrada);
var JORNADA_CLT_DIA_UTIL = 8 * 60;
var CARGA_HORARIA_PADRAO_MINUTOS = JORNADA_CLT_DIA_UTIL;
var MINUTOS_SEMANA_PADRAO = CARGA_HORARIA_PADRAO_MINUTOS * 5 + MINUTOS_SABADO;
var MINUTOS_SEMANA_ESTAGIO = 30 * 60;
var MINUTOS_DIA_ESTAGIO = 6 * 60;

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
  return lembretes;
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
Deno.serve(async (req) => {
  const segredo = Deno.env.get("APURAR_SEGREDO");
  if (!segredo || req.headers.get("x-apurar-segredo") !== segredo) {
    return responder({ erro: "Sem autorização." }, 401);
  }
  const simular = new URL(req.url).searchParams.has("simular");
  try {
    const { ler, ausentes } = criarLeitor();
    const agora = new Date;
    const desde = new Date(agora.getTime() - PUBLICACAO_COBRADA_DIAS * 86400000).toISOString();
    const [colaboradores, holerites, recebimentos, advertencias, publicacoes] = await Promise.all([
      ler("colaboradores?select=*"),
      ler("holerites?select=id,colaborador_id,competencia,criado_em", true),
      ler("recebimentos_holerite?select=holerite_id", true),
      ler("advertencias?select=id,colaborador_id,ciencia_em,criado_em&ciencia_em=is.null", true),
      ler(`avisos_rede?select=*&exige_confirmacao=eq.true&criado_em=gte.${encodeURIComponent(desde)}`)
    ]);
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
      publicacoes: publicacoes.map((p) => paraAvisoRede(p, [], confirmaram.get(p.id) || []))
    }, agora);
    const lidos = {
      colaboradores: colaboradores.length,
      holerites: holerites.length,
      assinados: recebimentos.length,
      advertenciasSemCiencia: advertencias.length,
      publicacoesEmCobranca: publicacoes.length
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
    return responder({ ok: true, lidos, lembretes: lembretes.length, entregues });
  } catch (erro) {
    console.error("Lembretes do dia:", erro);
    return responder({ erro: erro instanceof Error ? erro.message : String(erro) }, 500);
  }
});
