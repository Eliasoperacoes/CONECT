# Operação do CONECTA

O que fazer quando alguma coisa trava. Escrito para quem tem acesso ao
projeto no Supabase e ao repositório.

---

## Os arquivos SQL

Todos ficam em `supabase/` e **podem ser rodados mais de uma vez**.

| Arquivo | Quando usar |
|---|---|
## Banco novo do zero — A ORDEM IMPORTA

> ⚠️ **`esquema.sql` sozinho NÃO monta o sistema inteiro.**
>
> Ele tem a base, mas as funções que vieram depois moram em arquivos
> próprios. Rodar só ele produz um sistema onde folga, resposta de mensagem
> e jornada da semana ficam **mudas** — sem erro na tela, simplesmente não
> gravam. Descobrimos isso numa varredura, não num incidente; mas seria um
> incidente caro.

Numa base nova, nesta ordem:

| # | Arquivo | O que acrescenta |
|---|---|---|
| 1 | `esquema.sql` | A base: tabelas, regras de segurança, gatilhos de login |
| 2 | `organograma.sql` | Quem responde por quem |
| 3 | `permissoes.sql` | A coluna de permissões por ferramenta |
| 4 | `qr-por-loja.sql` | Os códigos de ponto de cada loja |
| 5 | `escala-turnos.sql` | Os turnos A e B |
| 6 | `ponto-tolerancia-justificativas.sql` | Tolerância e a tabela de **ausências** |
| 7 | `folga-sabado.sql` | A folga de sábado como tipo de ausência |
| 8 | `jornada-por-pessoa.sql` | Carga semanal, sábado e intervalo por pessoa |
| 9 | `mensagem-fixada.sql` | Fixar mensagem |
| 10 | `preferencias-conversa.sql` | Fixar e arquivar conversa |
| 11 | `responder-mensagem.sql` | Responder mensagem |
| 12 | `conversa-removida.sql` | Excluir conversa da lista |
| 13 | `participantes-atualizacao.sql` | **A regra de UPDATE que faltava.** Sem ela, fixar, arquivar e excluir conversa não gravam — e falham em silêncio |
| 14 | `periodo-de-teste.sql` | A faixa de "sistema em teste". Nasce desligada; liga no painel ADM |
| 15 | `rh-holerite-advertencia.sql` | Holerites e advertências. **Leitura apertada:** a pessoa vê só os dela, o RH vê todos, mais ninguém vê nada |
| 16 | `documentos-pessoais-no-balde.sql` | **Protege o ARQUIVO**, não só a linha. Sem ele, o caminho do holerite de um colega era adivinhável |
| 17 | `aprovar-jornada-lider.sql` | **O líder consegue aprovar.** Sem ele a aba mostra "new row violates row-level security policy": a criação da pendência não conhecia líder, só a própria pessoa e o RH. Também deixa o líder decidir a própria jornada |
| 18 | `corrigir-ponto-pelo-lider.sql` | O botão **Editar** na fila de aprovação. Quem responde pela pessoa corrige o horário e reapura o dia. **Apagar marcação continua só do RH.** Depende do 17 |
| 19 | `lider-enxerga-o-ponto.sql` | **A outra metade do 18.** A leitura do ponto só conhecia nível 3+, então o líder de setor aprovava um dia cujas marcações não conseguia ver |
| 20 | `ponto-do-lider-completo.sql` | **Reúne 17, 18 e 19 num arquivo só, na ordem certa** — e é o único que precisa ser rodado. Os três separados abortavam se rodados fora de ordem, e script que aborta deixa tudo como estava. Também TIRA o `meu_nivel() >= 3` da leitura do ponto: qualquer gerente lia o ponto de qualquer pessoa da rede, inclusive de outra loja |
| 21 | `escala-pela-lideranca.sql` | **Férias como tipo** e a liderança montando a escala da equipe sem esperar pedido. O pedido do colaborador continua nascendo pendente. Depende do 20 |
| 22 | `calendario-feriados.sql` | **O calendário de feriados.** Sem ele, todo 7 de setembro vira um dia inteiro de débito para a rede — e o espelho mostra o dia como se a pessoa não tivesse batido. Feriado por loja, porque as 5 unidades ficam em cidades diferentes |
| 23 | `apuracao-que-se-corrige.sql` | **A apuração consegue se corrigir.** Dia dentro da tolerância não gravava no banco (a regra só aceitava "pendente"), e pendência de dia já corrigido não saía — o débito voltava na sincronização seguinte. Depende do 20 |
| 24 | `jornada-vem-do-turno.sql` | **A jornada diária volta a ser opcional.** O cálculo era `ficha ?? turno`, mas a coluna é `not null default 480` e o cadastro gravava 490 em toda ficha nova: ela nunca vinha vazia, então o turno nunca era consultado. A estagiária da tarde devia 3h25 por dia contra uma jornada que ninguém escolheu. Limpa os 480 e 490 automáticos; quem tem 4h00, 6h00 e afins continua intocado |
| 25 | `correcao-nao-pede-aprovacao.sql` | **Quem corrige a batida já decidiu o dia.** Corrigir o espelho pelo RH mandava o resultado para o líder aprovar — pedindo carimbo de terceiro sobre o horário que o RH acabou de afirmar. Libera a origem `correcao_manual` e deixa a liderança decidir o dia que ela mesma corrigiu. **Sem ele a correção é recusada em silêncio**: a recusa da apuração só aparece no console, e o sintoma vira "corrigi e o saldo não mudou". Depende do 20 |
| 27 | `preencher-espelho-pelo-turno.sql` | **O preenchimento automático do espelho.** A coluna `metodo` tinha CHECK com quatro valores e recusava `preenchimento_turno` — o erro aparecia na tela ao usar o botão. Também ajusta a política de criação: ninguém preenche o PRÓPRIO espelho, e a liderança preenche o da equipe como o RH |
| 26 | `atestado-e-do-rh.sql` | **Atestado é do RH; folga é da cadeia.** Uma líder recusou o atestado de outra pessoa porque a regra de decisão era a mesma da hora extra. Atestado é documento — o líder não tem como julgá-lo, e nem deveria lê-lo (dado de saúde). Muda leitura, decisão e criação por **tipo**. Depende do 20 |

> `conferir-ponto-do-lider.sql` não altera nada: só responde se as regras acima estão valendo. **Uma consulta só, de propósito** — o SQL Editor mostra apenas o resultado da última consulta do arquivo, então conferência em vários `select` entrega respostas invisíveis.
>
> `conferir-equipe-da-fernanda.sql` também não altera nada: mostra quem responde a um líder, o setor inteiro e nomes parecidos. Serve quando o banco está correto e a correção ainda falha — aí a causa costuma ser o Organograma, não SQL.
>
> `conferir-carga-horaria.sql` mostra a carga cadastrada de cada pessoa — diária, semanal, sábado e intervalo. Serve quando o saldo do dia não bate com o que a pessoa cumpriu: o cálculo do dia é simples, quem costuma estar errado é o **previsto**, que sai da ficha.
>
> `conferir-preenchimento.sql` não altera nada: mostra a política `ponto_criacao` como o banco a guardou. Serve quando a conferência do preenchimento acusa "NÃO" — o Postgres reescreve `not in (...)` como `<> ALL (ARRAY[...])`, e conferência que procura a frase original dá falso alarme com a política correta no lugar.
>
> `conferir-sem-responsavel.sql` lista quem está solto no organograma, separando **o topo da cadeia** (gerentes, RH, ADM — que não têm ninguém acima porque não existe ninguém acima) de quem **bate ponto e ficou sem aprovador**, que é o caso que precisa de conserto. A terceira consulta mostra o responsável que o banco realmente guardou, para o caso de o gatilho `apenas_rh_move_o_organograma` ter revertido a gravação calada.

Todos são idempotentes: rodar de novo não quebra nada.

## A publicação chegou ao ar?

```bash
bun scripts/conferir-deploy.ts
```

**`git push` não é publicação.** Sete commits seguidos já foram escritos,
testados e empurrados sem nenhum chegar ao ar: o `vercel.json` tinha uma
chave `"//"` usada como comentário, e a Vercel valida esse arquivo
estritamente — propriedade desconhecida derruba o deploy **antes de
compilar**.

Nada acusou. Os testes passavam, o `build` passava, o `push` passava. O
sintoma chegou dias depois como "não atualizou".

JSON não tem comentário: o porquê de cada regra do `vercel.json` está em
[ARQUITETURA.md](ARQUITETURA.md), e há teste recusando chave fora do
esquema.

---

## Quando algo dá errado

| Arquivo | Quando usar |
|---|---|
| `conferir-central.sql` | **Não altera nada.** Publicar na Central falhou — diz se a causa é coluna faltando, política ou nível |
| `central-da-direcao.sql` | **Rode uma vez.** Dá à Central da Direção tipo, categoria, destinos e anexo, e põe o filtro de quem vê o quê no banco |
| `resetar-senha-inicial.sql` | **Rode uma vez.** Cria a função do botão "Resetar para a senha padrão", na ficha do colaborador |
| `resetar-acesso.sql` | Pessoa não entra e não lembra a senha, e o botão não está à mão |
| `liberar-acesso.sql` | Contas de autenticação órfãs (sem ficha do outro lado) |
| `conserto-login.sql` | Só se o cadastro duplicado voltar. Já aplicado |
| `conferir-exclusao.sql` | Conversa excluída que volta sozinha |
| `medir-chat.sql` | Chat lento: mede o custo de uma sincronização |
| `testar-cadastro.sql` | Cadastro recusado sem motivo claro |
| `diagnostico-*.sql`, `verificar-*.sql` | Investigações pontuais, já resolvidas. Servem de modelo |
| `acessos.sql` | **Não rode.** Está vazio de propósito — leia o cabeçalho dele |

### Como entregar um SQL para o Elias

```powershell
Get-Content -Path "supabase\arquivo.sql" -Encoding utf8 -Raw | Set-Clipboard
```

O `-Encoding utf8` não é opcional: os arquivos têm acento. Confira depois
com `Get-Clipboard -Raw` e diga quantos caracteres foram, para ele saber que
veio inteiro.

Todo script termina com um `select` de conferência. **"Success" no editor
não prova nada** — um arquivo antigo também termina com sucesso. Foi assim
que passamos horas num problema de RLS que já estava resolvido no arquivo
certo e não no rodado.

---

## "Login ou senha incorretos"

A mensagem da tela diz qual é o caso. Em ordem de frequência:

### "Este login já tem acesso ativado, e a senha digitada não é a dele"

A pessoa ativou o acesso algum dia e esqueceu a senha. A senha de primeiro
acesso não vale mais.

**Solução, pelo sistema:** Painel Administrativo → Colaboradores → editar a
pessoa → **Senha Inicial → "Resetar para a senha padrão"**. Pede confirmação
e devolve a pessoa ao primeiro acesso, com `123456`.

Depende de `supabase/resetar-senha-inicial.sql` ter sido rodado uma vez. O
botão não aparece em cadastro novo nem sobre a sua própria ficha, e o banco
recusa resetar alguém de nível acima do seu.

**Solução, pelo SQL:** `supabase/resetar-acesso.sql`. Troque o login na linha
marcada:

```sql
login_alvo  text := 'Dani';
```

Apaga a conta de autenticação e **deixa a ficha intacta** — nível, loja,
CNPJ, organograma, banco de horas. A pessoa volta ao primeiro acesso e entra
com `123456`.

A conferência no fim mostra `pronto_para_entrar = true` e a senha a digitar.

### "Login não cadastrado na rede"

Não existe ficha com esse login. Confira a grafia no Quadro de Equipe — o
login é comparado sem caixa e sem espaço, mas `fabio` e `fabio.tavares` são
pessoas diferentes.

### A pessoa tenta e nada acontece

Conta de autenticação **órfã**: existe na autenticação e não tem ficha
ligada. Rode `supabase/liberar-acesso.sql`, que lista e remove as órfãs sem
tocar em quem tem ficha.

---

## Erros do banco e o que significam

### `Could not find the 'X' column of 'Y' in the schema cache`

A coluna existe; quem não sabe dela é o **PostgREST**, que guarda o desenho
das tabelas em memória. Criar coluna não avisa ele.

```sql
notify pgrst, 'reload schema';
```

Já está no fim do `esquema.sql`. Todo script que mexe em estrutura deve
terminar assim.

### `a nova linha viola a política de segurança em nível de linha`

Quase sempre **upsert numa tabela que só tem política de UPDATE**. O
`upsert` vira `insert ... on conflict`, e um INSERT exige política de
INSERT mesmo quando a linha já existe e o conflito só ia atualizar.

Troque por `.update(...).eq(...)`. Detalhe e o outro sabor desse erro em
[.claude/skills/supabase-rls-e-postgrest](../.claude/skills/supabase-rls-e-postgrest/SKILL.md).

Há teste que lê o esquema e o código e reprova upsert em tabela sem política
de INSERT.

---

## Carga de colaboradores por planilha

Painel ADM → **Subir Planilha Excel**. O modelo sai do próprio painel.

- Marque **"Atualizar funcionários se login já existir"** para corrigir
  fichas já carregadas sem duplicar ninguém.
- **Setor desconhecido é erro e para a linha**, de propósito: antes virava
  "Balcão" em silêncio, e o setor decide quem aprova a jornada da pessoa.
- Nível desconhecido entra como Colaborador **com aviso** — nunca escala.
- O login vira endereço de autenticação: sem acento, sem espaço.

---

## Publicação

Push em `main` → a Vercel publica sozinha. Espere ~1 minuto e recarregue com
**Ctrl+F5** (o navegador segura o pacote antigo).

Variáveis de ambiente: Settings → Environment Variables. **A Preview não tem
as variáveis** — só a produção.

---

## Conferências rápidas

```sql
-- Quantas fichas e quantos acessos ativados
select count(*) as fichas,
       count(*) filter (where auth_user_id is not null) as ativados
from public.colaboradores;

-- Quem ainda não ativou o acesso, e com qual senha entra
select nome, login, nivel, loja,
       coalesce(nullif(senha_ativacao, ''), '123456') as senha
from public.colaboradores
where auth_user_id is null and ativo
order by nivel desc, nome;

-- O gatilho de primeiro acesso está na versão certa?
select exists (
  select 1 from pg_proc
   where proname = 'criar_colaborador_do_usuario'
     and prosrc ilike '%Login nao cadastrado na rede%'
) as gatilho_correto;
```

---

## Gerar o APK no PWABuilder

O CONECTA é um site instalável. O [pwabuilder.com](https://pwabuilder.com)
lê o endereço publicado e devolve um APK nativo — uma casca Android que abre
o site em tela cheia, sem barra de navegador.

### Antes de subir o endereço

```bash
bun scripts/conferir-pwa.ts https://SEU-ENDERECO.vercel.app
```

Ele confere **o que está no ar**, e não o repositório — que é o que o
PWABuilder vê. O defeito que ele pega antes de todos: o `vercel.json`
reescreve `/(.*)` para `/index.html`, então um arquivo que não esteja no
pacote publicado responde **a página, com status 200**. Um `manifest.json`
que devolve HTML e não dá erro é o tipo de coisa que se procura por uma
tarde inteira.

Dá para pôr `CONECTA_URL` no `.env` para não repetir o endereço.

### Os passos

1. **Gerar o pacote.** No PWABuilder, cole o endereço → *Package for stores*
   → *Android*. Anote o **Package ID** que ele mostrar.
2. **Conferir o Package ID.** Ele precisa bater com o
   `public/.well-known/assetlinks.json`, que hoje está como
   `br.com.malachias.conecta`. Se você mudar num lado, mude no outro.
3. **Pegar o fingerprint.** O zip do PWABuilder vem com `assetlinks.json`
   pronto, contendo o SHA-256 da chave de assinatura.
4. **Colar o fingerprint** em `public/.well-known/assetlinks.json`, no lugar
   de `SUBSTITUA_PELO_FINGERPRINT_DO_PWABUILDER`, e publicar.
5. **Conferir de novo:** `bun scripts/conferir-pwa.ts <endereço>` tem que
   dizer "servido e preenchido".

### Por que o passo 4 não é opcional

Sem o `assetlinks.json` respondendo certo, o Android **abre o aplicativo com
a barra do navegador por cima** — parece um atalho, não um aplicativo. E o
erro é silencioso: nada avisa, nem no celular nem no PWABuilder.

Guarde a chave de assinatura (`signing.keystore` e a senha) que o PWABuilder
gera. **Sem ela não dá para publicar atualização do APK** — só um aplicativo
novo, e quem já instalou não recebe.

### O que o aplicativo faz sem sinal

O trabalhador de segundo plano (`public/sw-avisos.js`) guarda a casca do
sistema com estratégia **rede primeiro**: com sinal, a resposta vem sempre do
servidor; sem sinal, abre com o que já tinha em vez da página de erro. Foi
pensado para o corredor dos fundos e o galpão, onde o celular perde sinal.

Dado do Supabase **não** é guardado: ponto e conversa servidos do cache
seriam informação errada apresentada como certa.

### Os prints da caixa de instalação

`screenshots` é o que o Android mostra ao perguntar se a pessoa quer
instalar, e o que a Play Store exibe na ficha. É a única coisa que ela vê
antes de decidir.

Não é gerado por script: seria propaganda de uma tela que não existe. Tire
dois prints do sistema rodando, salve em `public/` e rode:

```bash
bun scripts/registrar-screenshots.ts
```

| Arquivo | Como | Sugestão de tela |
|---|---|---|
| `public/print-celular.png` | em pé (~390x844) | a aba Ponto |
| `public/print-computador.png` | deitado (~1280x800) | o painel de gestão |

O script lê o tamanho **do arquivo** e recusa print na orientação errada.
`sizes` digitado à mão e errado faz o Android descartar o print em silêncio.
