# Aprendizados do CONECTA

Os erros que custaram caro, com o sintoma de cada um. Se algo estranho está
acontecendo, procure o sintoma aqui antes de investigar do zero.

As lições que servem para qualquer projeto viraram skills:
[supabase-rls-e-postgrest](../.claude/skills/supabase-rls-e-postgrest/SKILL.md),
[testes-que-mordem](../.claude/skills/testes-que-mordem/SKILL.md),
[editar-codigo-sem-corromper](../.claude/skills/editar-codigo-sem-corromper/SKILL.md).

---

## Banco de dados

**"Sem permissão no banco" ao enviar mensagem.**
`upsert` vira `ON CONFLICT`, que exige enxergar a linha em conflito — e a
RLS a escondia. Quatro tentativas de correção às cegas não chegaram lá;
medir contra uma conta de teste mostrou em minutos que o `insert` simples
passava. Hoje: `insert` e `23505` tolerado.

**"A nova linha viola a política" ao salvar configuração.**
A tabela tinha só política de UPDATE. O `upsert` mandava um INSERT mesmo com
a linha existindo. Hoje: `.update().eq()`, com teste que reprova upsert em
tabela sem política de INSERT.

**"Could not find the column ... in the schema cache".**
A coluna existia; o PostgREST é que não sabia. `notify pgrst, 'reload
schema'` no fim de todo script de estrutura.

**Login criava um colaborador novo a cada primeiro acesso.**
`criar_colaborador_do_usuario()` existia em **dois** arquivos `.sql` com
comportamentos opostos. `create or replace` não reclama: vale o último
rodado. O gerente entrava e nascia um cadastro nível 1, em branco, enquanto
a ficha da planilha ficava órfã. Hoje: uma função, um arquivo, e teste que
conta as definições.

**Qualquer senha ativava a conta.**
Descoberto ao consertar o item acima. Com 89 logins carregados e nenhum
ativado, quem descobrisse a URL e chutasse um login viraria aquela pessoa,
com o nível dela. Hoje: `senha_ativacao` conferida pelo banco.

**Os dois gatilhos de `auth.users` apontavam para a mesma função.**
Defeito meu, pego antes de subir: a adoção rodaria duas vezes e a segunda
recusaria, derrubando **todo** primeiro acesso do sistema.

---

## Regra escrita em dois lugares

O padrão que mais se repetiu aqui. Quatro vezes.

**Setores.** Lista copiada em duas telas. Logística, Estágio,
Administrativo e Gerência entraram na rede e o filtro não achava as pessoas
— com o cadastro certo no banco. O painel ADM nem oferecia esses setores no
cadastro manual.

**Campos da ficha.** Cada tela montava a sua lista. O CNPJ entrou no
cadastro e ficou preso ao formulário: o espelho de ponto, documento
trabalhista, saía sem dizer contra qual empregador a jornada corria.

**Alçada.** `obterColaboradoresVisiveis()` tinha a própria cópia da regra e
ignorava o organograma. O gerente aprovava pela cadeia e enxergava a loja
inteira — via saldo de gente sobre quem não decidia nada.

**Dois guardiões na mesma tela.** O administrador ligou "Banco de Horas"
para o gerente no painel e a aba continuou sumida: havia a permissão e um
`podeAcessarPainelRH` escrito dentro do componente, que recusava calado.

**Abas que decidiam sozinhas.** O catálogo dizia que gerente não bate ponto;
`App.tsx` montava a barra com `visivel: true` fixo. Eu afirmei que a aba
tinha sumido — não tinha.

Todos hoje têm teste que lê o código-fonte e reprova a volta da cópia.

---

## Configuração salva antes da regra

Mudar o padrão no código **não alcança quem já salvou**: o valor gravado
vence. O ponto continuou aparecendo para a gerência mesmo depois de a regra
mudar.

Hoje o padrão carrega uma versão. Configuração antiga recebe a correção uma
vez, carimbada; depois disso a configuração volta a mandar. E a migração
**só tira acesso, nunca acrescenta** — migração que amplia acesso sozinha
ninguém percebe até ser tarde.

---

## Interface

**Tailwind: atalho vence lado.** `inset-0` define os quatro lados de uma vez
e vencia `md:bottom-0` no CSS gerado. A janela do chat voltava a ocupar a
tela inteira e tampava o RH — exatamente o que ela existia para evitar.
Hoje: lados declarados um a um.

**Tailwind: classe montada com string não existe.** Valor calculado em tempo
de execução não pode virar `right-[${x}px]` — a classe não está na folha
gerada. Use variável de CSS: `style={{'--direita': x}}` +
`md:right-[var(--direita)]`. E **confira no CSS do build**.

**Hook depois de `return` derruba a aplicação inteira.** Declarei dois
`useMemo` no meio do JSX do `App.tsx`, depois dos `return` da tela de login
e da verificação de sessão. React conta os hooks a cada render e exige o
mesmo número sempre: com o `return` no caminho, eles rodavam numa passada e
não na outra. **Tela branca, sem nada no lugar.**

O compilador não pega — é TypeScript válido, e `bun run build` passa. Só
quebra no navegador, e quebra por inteiro. Hoje há teste lendo o `App.tsx` e
reprovando qualquer hook abaixo do primeiro `return` condicional.

**Ciclo de importação derruba a aplicação inteira.** `nuvem` passou a
importar `justificativas`, que importa `ponto`, que importa `nuvem`. E
`ponto` roda `new ServicoPonto()` no carregamento, cujo construtor chama
`nuvem` — ainda em TDZ. **"Cannot access 'nuvem' before initialization",
tela branca.**

Segunda vez que o app caiu por algo que `tsc` e `build` aprovam. A correção
foi mover o cache das ausências para um módulo SEM IMPORT NENHUM
(`justificativasCache`), que a camada de dados pode importar sem fechar a
volta. Hoje há teste que carrega os serviços na ordem do pacote e reprova
import de serviço de regra dentro de `nuvem`.

Regra que ficou: **a camada que fala com o banco não importa serviço de
regra.** O serviço importa a camada de dados, nunca o contrário.

**A aba padrão sumiu junto com a permissão.** Ao tirar "Visão & Lojas" do
gerente, o painel abria em branco: era a aba padrão. Toda navegação
configurável precisa cair na primeira opção que a pessoa realmente tem.

**Notificações.** Android recusa `new Notification()` — precisa de service
worker. E o som precisa de um gesto do usuário antes: a mensagem que chega
não é gesto, e o primeiro aviso saía mudo.

---

## Importação de planilha

**Classificação silenciosa é pior que erro.** "Administrativo" contém
"admin" e contém "ti" — com busca por trecho virava TI, o nível mais alto da
rede, vindo de um cargo nível 1. Hoje: mapa de correspondência exata.

**Setor desconhecido virava Balcão.** 32 pessoas foram para lá sem ninguém
ver, e o setor decide quem aprova a jornada delas. Hoje: setor desconhecido
**falha** e a mensagem diz quais valem.

**A planilha podia rebaixar quem a estava subindo.** A proteção comparava
com um id fixo de demonstração. Hoje compara com quem está logado.

**Modelo desalinhado.** 13 cabeçalhos para 14 valores — sobra de uma coluna
de senha removida. O cargo entraria como "123".

---

## Processo

**Medir contra o sistema real.** Vale a pena parar de tentar correções em
rodadas e reproduzir o erro direto na API ou no banco. Uma conta de teste
resolveu em minutos o que quatro palpites não resolveram.

**"Success" não prova o que ficou valendo.** Um arquivo antigo também
termina com sucesso. Todo script termina com um `select` de conferência.

**Não afirmar sem verificar.** Afirmei que a ficha do Fabio estava
corrigida quando os números diziam o contrário, e que a aba Ponto tinha
sumido quando nenhuma tela consultava o catálogo. As duas custaram uma
rodada.

**Ler o erro exato.** "Login ou senha incorretos" vinha do ramo `already
registered`, que não é ambíguo: a conta existe, a senha é que não bate. A
mensagem mandava conferir o login — que estava certo — e escondia o único
caminho que resolvia.

## Manda e não espera

**Se a ação muda o banco, a tela só confirma depois que o banco confirmou.**

Custou três rodadas com um cadastro que "dava certo" e não entrava. Três
lugares tinham o mesmo formato — `nuvem.alguma(coisa)` chamado sem `await`,
com o resultado ignorado:

| Onde | O que a tela dizia | O que era verdade |
|---|---|---|
| Cadastrar colaborador | "Cadastrado com sucesso" | A ficha nunca chegou ao banco; a pessoa existia só naquele navegador e ouvia "login não cadastrado na rede" |
| Excluir colaborador | "Removido com sucesso" | A ficha continuava no banco, com o login ocupado e a senha de ativação velha |
| Salvar ficha | Nada | A alteração se perdia em silêncio |

O segundo é o mais cruel: apagar e recriar é a primeira coisa que qualquer
um tenta quando um cadastro não entra, e estava **piorando** o problema.

Sinal para procurar: uma chamada a `nuvem.` que não começa com `await` e
cujo retorno ninguém lê.

## Duas verdades na mesma tela

**Uma delas ganha, e não é a que a pessoa lê.**

O painel de cadastro *mostrava* "Entra com 123456" e o estado do formulário
mandava `'123'`. Enquanto a senha nem chegava ao banco, a diferença não
aparecia. Quando a gravação foi consertada, a senha passou a chegar —
**errada**. O banco esperava `123`, a pessoa digitava o que a tela mandava, e
o erro "persistiu" depois da correção.

A saída não foi validar o tamanho: foi **tirar a escolha**. Cadastro manual
não escolhe senha, nasce sempre com a padrão da rede. Uma senha a menos para
errar é uma senha a menos para explicar depois.

## Recortar arquivo por número de caracteres

Vários testes liam o código-fonte com `slice(inicio, inicio + 4500)`. Bastou
um comentário novo no meio do método para o fim dele cair fora da janela:
dois testes falharam apontando para código correto.

O caso grave era o teste que protege a **carga por planilha**: recortava 6000
caracteres e afirmava `not.toContain`. Janela curta demais o fazia **passar
por não enxergar** — o pior tipo de teste, justo no que guarda as 88 pessoas
que entraram por ali.

Recorte sempre até o **método seguinte**, nunca por tamanho. E, quando a
asserção for `not.toContain`, confirme por mutação que ela ainda morde no
**fim** do trecho.

## Reescrever o cache por inteiro

**O banco é a verdade, menos para o que ainda não chegou nele.**

Irmão do "manda e não espera", e apareceu três vezes na mesma auditoria do
chat. A sincronização substituía o cache local inteiro pelo que veio do
banco, e atropelava tudo que estava em trânsito:

| Onde | O que a pessoa via |
|---|---|
| Mensagens | A mensagem que ela acabou de mandar **sumia** da tela quando qualquer outra pessoa da rede mandava qualquer coisa. Voltava um segundo depois — e ela já tinha mandado de novo |
| Fixar conversa | A conversa se **desfixava** sozinha |
| Excluir conversa | A conversa **voltava** para a lista |

A causa é sempre a mesma corrida: a ação responde na tela na hora e sobe
depois; uma sincronização que já estava a caminho chega no meio e escreve o
estado antigo por cima. **Com 88 pessoas conectadas isso não é exceção, é o
normal** — qualquer mensagem de qualquer pessoa dispara uma sincronização em
todos os aparelhos.

A saída não é parar de reescrever: é marcar o que está em trânsito e
proteger só isso. Quando a subida termina, a proteção acaba — dando certo ou
não. Preferência que não subiu não vale nos outros aparelhos, e uma tela
dizendo que vale seria outra tela mentindo.

**Sinal para procurar:** um `localStorage.setItem` que grava direto o que
veio do banco, sem olhar o que já estava lá.

## Tempo real sem juntar rajada

Cada evento do Supabase disparava uma sincronização completa — e completa
quer dizer *todas* as mensagens da rede, mais os endereços assinados de todo
anexo.

O multiplicador estava onde ninguém olhava: as **marcações de leitura**.
Abrir uma conversa com trinta não lidas grava trinta marcações, que viram
trinta eventos, e cada aparelho conectado baixava o histórico inteiro trinta
vezes — por causa de alguém abrindo uma conversa do outro lado da rede.

Ao juntar rajada, **não atrase a primeira**: seria trocar o atraso do envio
por um atraso no recebimento. O primeiro evento depois de uma calmaria vai
na hora; a janela só junta o que vem grudado nele.

## Indicador que soma o futuro

O painel do RH abriu numa segunda-feira dizendo duas coisas ao mesmo tempo:

| Cartão | Valor |
|---|---|
| Sem bater | **0** — faltou batida no ciclo |
| Saldo da rede | **−3924h33** — somado no ciclo |

Os dois saíam do mesmo `apurarSemana`, e não podiam ser as duas verdade. A
conta que fecha a pergunta: 3924h33 são 235.473 minutos, e a carga semanal
da rede é 2690 (44h50). **235.473 ÷ 2690 = 87,5 pessoas devendo a semana
inteira**, com 89 na rede.

Duas causas somadas, e a segunda nunca apareceria sozinha:

1. **O previsto somava os sete dias do ciclo**, hoje e amanhã incluídos,
   contra o que a pessoa tinha trabalhado *até agora*. Havia um
   `if (data >= hoje) continue` no laço, mas ele estava **depois** da soma —
   valia só para a pendência. Toda segunda a rede devia a semana que ainda
   não tinha acontecido, e ia quitando sozinha até sexta.
2. **Quem não bate ponto entrava na conta.** Da gerência para cima não se
   bate — está no catálogo — mas a relação do banco de horas incluía essas
   pessoas assim mesmo. Zero trabalhado contra a carga cheia: devendo a
   semana toda, toda semana, para sempre. E a linha delas ia para o **topo**
   da relação, que ordena pelo maior débito.

O "Sem bater: 0" não era erro de contagem, era o sintoma: dia futuro não
tem batida faltando. Um número olhava o futuro e o outro não, no mesmo laço.

Tinha ainda um terceiro, menor, escondido pelos dois: a pendência era
`feitas > 0 && feitas < esperadas.length` — só o dia batido **pela metade**
contava. O dia sem nenhuma batida, que é a falta mais completa que existe,
passava calado enquanto o previsto dele pesava no saldo.

**Sinal para procurar:** indicador cujo valor você não consegue explicar em
uma frase. Divida pelo número de pessoas antes de investigar o código — se
der um número redondo (uma carga diária, uma semanal), o laço está contando
gente ou dia que não devia.

**A regra:** saldo acumulado só conta período **encerrado**. O dia em
andamento fica fora dos dois lados — nem previsto, nem trabalhado — senão a
rede inteira parece devedora toda manhã.

## Teste que passa porque o ambiente não tem a peça

Os testes da memória de navegação — a que faz atualizar a página não jogar
a pessoa na tela inicial — passaram de primeira em nove dos doze casos.
Pareciam bons. Não eram.

**O Bun não tem `localStorage`.** Toda chamada caía no `catch`, e o `catch`
devolve o padrão da tela — que é exatamente o que metade das asserções
esperava. Os três que falharam foram os únicos que pediam para *lembrar*
alguma coisa; sem eles, o arquivo inteiro teria passado sem exercitar uma
linha do que ia para produção.

O falso de `localStorage` que o projeto já usava em outros testes tem
`getItem`/`setItem`/`removeItem`, e nada mais. Não bastava: `esquecer`
varre o armazenamento, e varrer precisa de `length` e `key(i)`.

Isso expôs um segundo defeito, este no código: `esquecerOndeParei` varria
com `Object.keys(localStorage)`. Funciona no navegador, mas não é contrato
de `Storage` — é detalhe de implementação. Trocado pela API padrão, que
além de correta é testável.

**Sinal para procurar:** teste novo que passa inteiro de primeira, sobre
código que toca o navegador. Antes de comemorar, quebre a regra de
propósito. Se um teste que deveria falhar continua verde, o ambiente não
tem a peça que ele acha que está usando.

**A regra:** quando o teste depende de um falso, o falso ganha um teste
próprio. Uma asserção que confirme que ele guarda, devolve e se deixa
varrer — senão um falso quebrado transforma o arquivo inteiro em enfeite.

## `replaceAll` num arquivo de teste

Repontando testes depois de remover o quadro de equipe, troquei
`podeUsar('organograma', gerente)` por `aprovar_jornadas` com um
`replaceAll`. A expressão aparecia em **dois** testes: o que eu queria
mudar e outro, vinte linhas acima, que afirmava o contrário. O segundo
passou a exigir que o gerente não tivesse uma permissão que ele tem.

A suíte acusou na hora — mas só porque a asserção atingida era forte. Uma
troca em comentário, em `id` de elemento ou em texto de tela teria passado
calada.

**A regra:** `replaceAll` só quando todas as ocorrências são o alvo. Na
dúvida, conte antes (`grep -c`) e confira o `git diff` linha a linha
depois. Vale para arquivo de teste tanto quanto para código — o arquivo de
teste é que não tem ninguém conferindo *ele*.

## Número que leva para uma tela onde o item não está

Aconteceu duas vezes na mesma semana, nos dois casos com o cartão clicável
do painel do RH:

| Cartão | Contava | Levava para |
|---|---|---|
| "N pedidos aguardam sua decisão" | toda ausência pendente | aba de documentos, que não mostra férias nem folga |
| "Sem responsável: 9" | todo mundo sem alguém acima | organograma, onde não havia nada a fazer — os 9 eram o topo da cadeia |

A Dani clicava num 4 e caía numa lista de 1. O número não estava errado em
si: estava errado **em relação ao destino**.

**Sinal para procurar:** todo indicador que abre uma tela ao ser clicado. A
pergunta é sempre a mesma — *o filtro da tela é o mesmo do contador?* Se a
tela filtra por algo que o contador ignora, o número mente.

**A regra:** contador e destino leem a mesma fonte. Quando a tela filtra
por uma lista (`SE_COMPROVA_COM_DOCUMENTO`, uma permissão, um tipo), o
contador filtra pela mesma — nunca por uma condição parecida escrita ao
lado.

## Mutação que se conserta sozinha, e o teste que parece fraco

Ao provar os testes da citação, uma mutação declarou o teste inútil e
estava mentindo. A mutação fazia o desenho vazar o id da pessoa para a
tela:

```
<span class="tr-citado">@Fabio Souza (@[Fabio Souza](pessoa:c-12))</span>
```

O teste conferia `not.toContain('c-12')` e passou. Fui atrás: a regra
de **link**, que roda logo abaixo na mesma cadeia de trocas, achou o
`[Fabio Souza](pessoa:c-12)` que a mutação acabara de injetar, viu que
`pessoa:` não é um endereço seguro, e devolveu só o rótulo. O id
desapareceu — a mutação se curou no caminho.

O teste estava certo. A mutação é que testava outra coisa.

**Sinal para procurar:** mutação cujo texto injetado ainda passa por
regras adiante na mesma função. Em cadeia de `.replace`, tudo o que uma
regra escreve é entrada das seguintes.

**A regra:** mutação que passa não condena o teste na hora. Antes de
escrever mais asserção, rode o caso mutado à mão e veja a saída. Se a
saída estiver certa, a mutação é que estava errada — e a certa aqui foi
mexer no *capture group*, não no texto.

Aconteceu duas vezes na mesma rodada. A segunda mutação apagava a troca
de `@[Nome](pessoa:id)` por `@Nome` no resumo do cartão, e o teste
continuou verde: a regra de link, mais abaixo, já entregava exatamente
`@Nome`. Ali a mutação estava certa e o **código** estava errado — eram
duas regras fazendo o mesmo trabalho. A segunda saiu.

**A regra:** mutação que passa com o código funcionando igual é código
morto encontrado. Apague, e deixe o teste guardando o comportamento.

## Faixa de caracteres invisíveis escrita à mão

Escrevi a faixa de acentos combinantes num `replace`, como se escreve em
qualquer lugar:

```js
.replace(/[\u0300-\u036f]/g, '')
```

O que entrou no arquivo foram os **dois caracteres de verdade**, não o
escape — dois acentos soltos, invisíveis, no meio do código-fonte. Só
apareceu num `od -c`.

É o mesmo erro que já custou caro aqui uma vez: o marcador interno de
`textoRico.ts` era o byte nulo, e o `grep` e o `git diff` passaram a
tratar o arquivo como **binário**. O código sumia da revisão e da busca.

**A regra:** nada de caractere invisível escolhido à mão. Quando a
intenção é "qualquer acento", existe nome para isso —
`/\p{Diacritic}/gu`, que se lê e não depende de o editor ter preservado
dois bytes que ninguém vê. Para o resto, `String.fromCharCode` deixa o
número à vista. E confira com `od -c` quando o arquivo tiver de conter
um caractere especial de propósito.
