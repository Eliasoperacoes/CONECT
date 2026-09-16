# Ponto, jornada e banco de horas — como funciona hoje

Documento de trabalho para desenhar melhorias. Descreve o que o sistema
**faz de fato** hoje (lido do código, não de memória), onde isso gera
trabalho desnecessário, e quais decisões precisam ser tomadas antes de
mexer.

Contexto: Malachias Autopeças, 5 lojas, ~89 colaboradores. Matriz em
Pirassununga com líderes de setor; nas filiais o gerente acumula.

---

## 1. Os atores

| Nível | Quem é | O que faz no ponto |
|---|---|---|
| 1 | Colaborador | Bate o próprio ponto |
| 2 | Líder de setor | Aprova a jornada de quem responde a ele |
| 3 | Gerente | Aprova a jornada da equipe dele. **Não bate ponto** |
| 4 | Diretoria | Aprova a rede inteira |
| 5 | TI | Aprova a rede inteira, administra o sistema |

**Quem aprova quem** não é decidido pelo nível sozinho:

- Pessoa **posicionada no Organograma** → só quem está acima dela na cadeia
  decide. A cadeia inteira vale: se o líder não decide, o chefe do líder
  decide.
- Pessoa **ainda não posicionada** → regra automática: líder aprova o
  próprio setor, gerente aprova a própria loja.
- RH, Diretoria e TI aprovam sempre, por fora da cadeia.
- **Ninguém aprova a própria hora**, em nenhuma hipótese.

---

## 2. O fluxo de hoje, passo a passo

```
1. BATIDA
   O colaborador lê o QR afixado na loja (ou digita o código impresso).
   São 4 batidas por dia, nesta ordem:
       entrada → saída almoço → retorno almoço → saída
   O sistema decide sozinho qual das 4 está sendo batida.

2. APURAÇÃO (automática, na 4ª batida)
   trabalhado = saída − entrada − intervalo
   previsto   = carga diária do colaborador (padrão 8h; 0 em sábado e domingo)
   diferença  = trabalhado − previsto

   diferença = 0  → nada acontece
   diferença ≠ 0  → cria uma APURAÇÃO PENDENTE
                    tipo "hora extra" se positiva, "débito" se negativa

3. DECISÃO
   A apuração aparece na fila de quem responde pela pessoa.
   Aprovar é um clique. Recusar exige motivo escrito.

4. BANCO DE HORAS
   Só o que foi APROVADO entra no saldo.
   O que está pendente aparece à parte, como "esperando decisão".
```

**Correção de marcação** (esqueceu de bater, bateu errado) é exclusiva do
RH/TI, exige justificativa, e fica gravada com data e autor. Ela reprocessa
o dia — mas **um dia já decidido não volta para a fila sozinho**.

---

## 3. As regras exatas, como estão no código

Estas são as decisões que já estão tomadas. Mudá-las é o assunto.

| Regra | Valor atual | Onde |
|---|---|---|
| Batidas por dia | 4, fixas | `ORDEM_MARCACOES` |
| Dia considerado "completo" | só com as **4** batidas | `obterJornadaDoDia` |
| Jornada prevista | `cargaHorariaDiariaMinutos` da pessoa, ou 480 | `cargaPrevistaEmMinutos` |
| Sábado e domingo | previsto = 0 | idem |
| **Tolerância** | **nenhuma — qualquer diferença ≠ 0 vira pendência** | `apurarDia` |
| Intervalo | só desconta se as duas batidas do almoço existirem | `obterJornadaDoDia` |
| Saldo acumulado | soma **só** das apurações aprovadas | `obterSaldoAcumulado` |
| Dia incompleto | **não gera apuração nenhuma** | `apurarDia` |
| Dia já decidido | não reabre sozinho | idem |
| Feriado | **não existe no sistema** | — |
| Falta, atestado, férias | **não existem no sistema** | — |
| Uso/compensação do saldo | **não existe** | — |
| Fechamento de período | **não existe** | — |

---

## 4. Onde isso gera trabalho desnecessário

Esta é a parte que interessa. Em ordem de impacto.

### 4.1 Não há tolerância — e isso é o problema central

Qualquer diferença diferente de zero vira uma pendência de aprovação.
**Um minuto a mais gera uma aprovação.**

Ninguém bate ponto e fecha exatamente 8h00. Na prática:

```
89 colaboradores
− os que não batem ponto (gerência para cima)
≈ 85 pessoas × ~22 dias úteis = ~1.870 dias por mês

Quase todos com diferença ≠ 0
→ ~1.800 aprovações por mês
→ ~90 decisões por dia útil, espalhadas entre líderes e gerentes
```

Isso não é controle de banco de horas. É uma fila que ninguém consegue
manter, e que vai ser aprovada no automático em poucas semanas — o que
esvazia o sentido de ter aprovação.

**O que precisa ser decidido:** qual diferença merece decisão humana. Ideias
a avaliar (não implementadas):

- faixa de tolerância diária (ex.: ±10 min entra direto no saldo, sem fila)
- só o que passar de X minutos vira pendência
- débito pequeno compensa automaticamente com crédito da mesma semana

### 4.2 A decisão é dia a dia, uma por uma

Não existe aprovar em lote, nem fechar a semana, nem "aprovar tudo desta
pessoa neste período". O líder decide 40 itens clicando 40 vezes.

**A decidir:** a unidade de decisão é o dia, a semana ou o mês? Uma
aprovação semanal por pessoa reduziria de ~1.800 para ~340 decisões/mês
mesmo sem tolerância.

### 4.3 O aprovador decide no escuro

A apuração mostra números: trabalhou 9h10 de 8h00 previstas. Não mostra
**por quê**. O colaborador não informa nada no ato da batida.

O gerente não sabe se foi entrega atrasada, cliente no balcão, ou a pessoa
esqueceu de bater a saída e o RH corrigiu. Sem o motivo, a decisão vira
carimbo.

**A decidir:** o colaborador justifica no ato (campo na batida), justifica
depois (a pendência vira uma solicitação que ele preenche), ou o motivo é
opcional e só para casos acima de X minutos?

### 4.4 Dia incompleto some em silêncio

Se a pessoa esquece a 4ª batida, o dia **não é apurado** — não gera
pendência, não gera débito, não aparece na fila de ninguém. Ela aparece
como "dia em aberto" no painel de quem gerencia, mas nada obriga a
resolver, e o dia simplesmente não conta.

Hoje isso é o caminho mais fácil para quem quiser sumir com um dia.

**A decidir:** dia incompleto vira pendência de correção obrigatória para o
RH? Trava alguma coisa? Gera aviso automático para a pessoa e o gestor no
mesmo dia?

### 4.5 O saldo acumula e nunca é usado

O banco de horas só cresce. Não existe:

- **compensar** (folgar um dia consumindo 8h do saldo)
- **pagar** (converter saldo em hora extra na folha)
- **vencer** (prazo de compensação — a lei costuma tratar disso por acordo)
- **zerar no fechamento**

Ou seja: hoje o sistema é um **contador**, não um banco de horas. A parte
que a lei e o acordo coletivo regulam — o que acontece com o saldo — não
existe.

**A decidir, e é a decisão mais importante depois da tolerância:** qual é o
ciclo? Compensa em quantos meses? O que sobra no fim do ciclo vira o quê?
Quem autoriza a folga que consome saldo?

### 4.6 Não existe calendário

Feriado é tratado como dia útil comum. Na prática ninguém bate ponto no
feriado, e como dia sem batida não é apurado, não gera débito — **funciona
por acidente, não por desenho**. Mas:

- quem trabalha no feriado tem a hora contada como hora comum
- não há distinção entre feriado nacional, municipal e ponto facultativo
- férias, atestado e falta justificada não existem: são todos "dia sem
  batida"

**A decidir:** o sistema precisa de calendário e de tipos de ausência? Se
sim, quais tipos, e quem lança?

### 4.7 A fila não cobra ninguém

A aba de aprovação só aparece quando há pendência, e não há lembrete,
prazo, nem escalonamento. Se o gerente não olhar, a hora fica parada
indefinidamente — e o colaborador não sabe que está parada.

Se o aprovador entra de férias, a fila dele trava; só RH/TI conseguem
destravar, e ninguém é avisado disso.

**A decidir:** prazo para decidir? Depois de N dias sobe para o chefe do
aprovador? O colaborador vê o estado do que ele gerou?

### 4.8 Não há fechamento

Qualquer dia pode ser corrigido pelo RH a qualquer momento, e o saldo muda
retroativamente. Não existe "período fechado" nem espelho assinado pelo
colaborador.

**A decidir:** fecha mensalmente? O colaborador confirma o espelho dele? O
que é preciso para reabrir um período fechado?

---

## 5. O que já existe e deve ser preservado

Ao desenhar as melhorias, estas decisões já foram tomadas e têm motivo:

1. **Ninguém aprova a própria hora.** Nem a Diretoria, nem o TI, nem quem
   está no topo do organograma.
2. **Corrigir marcação é do RH.** Marcação é registro trabalhista; a
   alteração fica com data, motivo e autor, e o gerente não altera.
3. **Sem pular etapas.** O caminho é batida → decisão de quem responde →
   banco de horas. Hora não entra no saldo sem alguém ter decidido.
4. **A regra vive no banco, não só na tela.** A alçada é verificada também
   pela RLS do Postgres — mudar a tela não afrouxa a regra.
5. **Quem aprova é quem acompanha.** A lista de quem o gestor vê no painel
   é exatamente a lista de quem ele pode aprovar.
6. **O histórico de ponto nunca é apagado.** A limpeza de 3 meses vale para
   mensagem, áudio e imagem — ponto, banco de horas e ficha ficam.
7. **O espelho de ponto sai identificado**: nome completo, matrícula, CNPJ
   do empregador, cargo, setor, loja, admissão, jornada contratada e a quem
   a pessoa responde.

---

## 6. As perguntas a levar para o desenho

Em ordem. As duas primeiras destravam o resto.

1. **Tolerância:** qual diferença diária entra no saldo sem decisão humana?
2. **Ciclo do banco de horas:** em quanto tempo compensa, e o que acontece
   com o saldo no fim do ciclo (folga, pagamento, perda)?
3. **Unidade de aprovação:** dia, semana ou mês?
4. **Justificativa:** quem informa o motivo, quando, e a partir de qual
   tamanho de diferença?
5. **Dia incompleto:** o que acontece, e quem é cobrado?
6. **Calendário e ausências:** feriado, férias, atestado e falta entram no
   sistema? Quem lança?
7. **Prazo e escalonamento:** quanto tempo o aprovador tem, e para quem
   sobe se ele não decidir?
8. **Fechamento:** existe período fechado? O colaborador confirma o espelho?

---

## 7. Números para dimensionar qualquer proposta

| | |
|---|---|
| Colaboradores ativos | ~89 |
| Que batem ponto | ~85 (gerência para cima não bate) |
| Lojas | 5 (1 matriz, 4 filiais) |
| Dias úteis por mês | ~22 |
| Dias de jornada por mês | ~1.870 |
| Aprovações/mês no desenho atual | ~1.800 |
| Aprovadores | líderes de setor + 5 gerentes + RH/Diretoria/TI |

Qualquer proposta deve dizer quantas decisões humanas por mês ela produz.
Se o número não couber na rotina de quem decide, a aprovação vira carimbo e
o controle deixa de existir na prática — que é o risco do desenho atual.
