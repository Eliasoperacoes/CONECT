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
| `aparelhos-para-push.sql` | **Rode uma vez, antes de distribuir o APK.** Cria a tabela dos aparelhos que recebem aviso com o app fechado. Sem ela o aplicativo não consegue guardar o endereço de entrega, e o aviso nativo não chega |
| `aparelho-troca-de-dono.sql` | **Rode uma vez, depois do anterior.** Cria `registrar_aparelho()`, que o aplicativo usa para guardar o endereço de entrega. Sem ela, o celular que troca de dono (o do balcão, de turno em turno) seguiria recebendo o chat de quem saiu — a política de UPDATE esconde a linha do dono anterior, e o update antigo afetava zero linhas calado |
| `foto-de-perfil-no-balde.sql` | **Rode uma vez.** A foto de perfil passou a viver no armazenamento em vez de base64 dentro da ficha — este script acrescenta o prefixo `perfil/` às regras do balde, para ninguém subir foto na pasta de outro. No fim diz quantas fotos ainda faltam converter |
| `medir-consumo.sql` | **Não altera nada.** Quanto o projeto gasta dos limites do Supabase: tamanho de cada tabela, peso das fotos de perfil (que são base64 dentro do banco), arquivos no Storage e o crescimento mês a mês. A leitura dos números está em [LIMITES-SUPABASE.md](LIMITES-SUPABASE.md) |
| `conferir-prontidao.sql` | **Não altera nada. Rode antes de abrir o sistema para mais gente.** Confere se o banco tem TODA coluna que o código manda (é o que teria pego o `publicacao_id` antes de o chat parar), se as tabelas que o sistema escreve têm política de INSERT e UPDATE, e mostra o retrato do que já está lá dentro |
| `apuracao-rodar-agora.sql` | **ALTERA.** Roda a apuração do ponto já, sem esperar as 03:00 — a mesma chamada do agendamento, com o segredo do cofre. Use depois de publicar uma regra nova em `apurar-ponto`. Troque `URL_DO_PROJETO` pelo endereço do projeto. A resposta chega depois: o `select` comentado no fim mostra o que a função respondeu |
| `conferir-sabado-da-fernanda.sql` | **Não altera nada.** Sábado de folga trabalhado que não foi para o banco de horas: mostra a ficha, as batidas dos sábados, a folga lançada, o que a apuração gerou (e se espera aprovação) e a compensação do sábado. Troque `fernanda%` pelo nome de outra pessoa para o mesmo caso |
| `ficha-propria-protegida.sql` | **ALTERA.** A trava por coluna da própria ficha (`apenas_rh_move_o_organograma`) passa a devolver também nome, login, matrícula, CNPJ, departamento, data de admissão e "ativo" quando quem grava não cuida de pessoas. Necessária desde que o app grava a ficha por UPDATE (e não upsert, que barrava a foto e a presença de todo colaborador). Pode rodar de novo |
| `cpf-e-comprovante.sql` | **ALTERA.** O CPF do colaborador numa tabela própria (só a pessoa e quem cuida de pessoas leem; a pessoa registra o dela uma vez por `registrar_meu_cpf`, o RH corrige por `corrigir_cpf`, os dois conferem os dígitos) e o carimbo do comprovante de cada batida: NSR, hora registrada, CNPJ do empregador e código de verificação (SHA-256), gravados pelo gatilho `carimbar_batida` e devolvidos ao original em toda alteração. Numera as batidas antigas na ordem em que foram gravadas. Pode rodar de novo |
| `corrigir-sabado-do-estagio.sql` | **ALTERA.** O sábado do estagiário de 5h (E2/E3) que entrou como hora extra com previsto zero, antes de o turno passar a prever o sábado (05/10/2026): reescrito com zero minutos, aprovado, quando o trabalhado ficou a até 10 min das 4h. Pode rodar de novo sem efeito |
| `corrigir-saida-de-sabado.sql` | **ALTERA.** A saída do sábado que entrou como "saída para almoço" (estagiário num sábado fora da escala, antes da `sequenciaDoDia`): vira saída. Pode rodar de novo sem efeito. Depois rode a `apuracao-rodar-agora.sql` |
| `conferir-quem-le-o-que.sql` | **Não altera nada.** Para cada tabela: se a RLS está ligada e qual é a regra de LEITURA em produção — "TODOS LEEM" é linha que chega ao aparelho de qualquer pessoa logada. Regra do sistema: o que não é para a pessoa não vai para ela, nem escondido. A última linha conta as fichas com senha de 1º acesso guardada (só o número) |
| `zerar-saldo-sem-ponto.sql` | **ALTERA.** Antes de abrir para a loja: apaga as apurações de quem não tem marcação de ponto nenhuma, para ninguém entrar no sistema vendo um débito de dia que não trabalhou. Não toca em quem já bateu ponto |
| `conferir-sabado.sql` | **Não altera nada.** O sábado de alguém previu zero e o que a pessoa trabalhou virou hora extra — separa as duas causas: `trabalha_sabado` desligado na ficha (cadastro errado) ou folga aprovada naquele dia (previsto zero está certo) |
| `conferir-tolerancia.sql` | **Não altera nada.** Saldo de alguém não bate com o que a pessoa diz ter trabalhado — mostra quanto do saldo dela veio de minutos que a tolerância aprovou sozinha (art. 58 §1º da CLT manda não descontá-los) |
| `aviso-no-chat.sql` | **Rode uma vez.** Dá ao recado do chat o id da publicação, para o botão "Abrir publicação" levar à certa |
| `central-da-direcao.sql` | **Rode uma vez.** Dá à Central da Direção tipo, categoria, destinos e anexo, e põe o filtro de quem vê o quê no banco |
| `resetar-senha-inicial.sql` | **Rode uma vez.** Cria a função do botão "Resetar para a senha padrão", na ficha do colaborador |
| `apuracao-pode-zerar.sql` | **Rode uma vez.** Solta a trava que recusava apuração de ZERO minuto — sem ela, "Reapurar período" não consegue desfazer um débito errado, e a tela diz "0 dias mudaram" como se estivesse tudo certo. No fim ele **lista quem tem débito com cara de pausa cobrada**, sem alterar nada |
| `horario-pelo-turno.sql` | **Rode uma vez (29/09/2026).** Tira a carga própria que o Painel ADM gravava ao salvar a ficha, para o previsto e a tolerância saírem do turno; põe a Lyvia no turno de estágio da tarde (E3) |
| `pontos-incompletos.sql` | **Rode uma vez (01/10/2026).** "Pontos incompletos", o aviso de Espelhos de ponto e o cartão do RH passam a perguntar ao banco quais dias têm batida faltando — antes liam o cache do aparelho, que muda com a tela aberta. Sem ele, continuam lendo o cache |
| `grupos-de-todos-2.sql` | **Rode uma vez (03/10/2026), depois de `grupos-de-todos.sql`.** Só o que mudou: quem entra num grupo lê só do momento em que entrou; quem sai e volta não lê o intervalo em que esteve fora; quem é removido vê "Fulano removeu você"; admin desligado não segura o grupo. Conversa individual e canal oficial não mudam. A conferência sai `1 · 1 · 1 · 1` |
| `grupos-de-todos.sql` | **Rode uma vez (03/10/2026).** Qualquer pessoa cria grupo e vira administradora dele; o administrador adiciona, remove, edita e promove; qualquer um sai (fica com o histórico até a saída) e depois apaga o grupo da própria lista; os canais oficiais seguem com o TI. **Fecha uma porta:** a regra de `participantes` deixava qualquer pessoa logada se inscrever em qualquer conversa e ler tudo. Testado num Postgres de verdade (`gruposNoBanco.test.ts`). Sem ele, quem tenta criar grupo ouve "avise o TI" |
| `conferir-funcoes-de-nivel.sql` | **Só leitura (02/10/2026).** Mostra a definição no ar de `sou_admin()` e `cuido_de_pessoas()`, que estavam duplicadas no esquema com regras diferentes. O certo: `>= 5` e `>= 4 or ... 'RH'` |
| `assinatura-holerite.sql` | **Rode uma vez (02/10/2026), depois de `rh-holerite-advertencia.sql`.** A assinatura do holerite: cada pessoa desenha a assinatura uma vez (com o termo de adesão), e assina cada holerite com a senha, conferida no banco. O RH vê quem assinou e baixa os comprovantes carimbados. Holerite assinado não é mais substituído nem removido pelo sistema — só pelo SQL Editor. Sem ele, o botão Assinar responde "avise o TI". A conferência precisa sair `5 · 5 · 1 · true` (com o espelho e o responsável, abaixo): o `true` é a conferência de senha (pgcrypto) funcionando. É a FONTE da assinatura: holerite, espelho e responsável |
| `assinatura-espelho.sql` | **Delta (05/10/2026), depois de `assinatura-holerite.sql`.** O espelho de ponto assinado como o holerite: a mesma assinatura, a mesma senha; um por pessoa e mês fechado. A conferência da senha virou uma função só (`conferir_senha_de_quem_assina`), usada pelos dois. Sem ele, o Assinar do espelho responde "avise o TI". A conferência precisa sair `1 · 3 · true` |
| `assinatura-responsavel.sql` | **Delta (05/10/2026), depois de `assinatura-espelho.sql`.** A assinatura do responsável: o RH assina de uma vez, em RH → Assinaturas, os espelhos de ponto que os colaboradores já assinaram. Só o espelho: o holerite leva só a assinatura do funcionário. Só entra o que o colaborador assinou, e nunca o espelho de quem assina. O colaborador passa a ver a assinatura do RH no próprio espelho. Sem ele, o Assinar do RH responde "avise o TI". A conferência precisa sair `1 · 1 · true` |
| `compensacao-sabado.sql` | **Rode uma vez (01/10/2026).** O saldo de compensação do sábado (os 10 min diários do turno integral, que pagam a folga) passa de um mês ao outro: a apuração da madrugada fecha o mês anterior de cada pessoa nesta tabela, e o espelho mostra o que veio, o que juntou, a folga consumida e o que segue. Sem ele a madrugada segue sem gravar a compensação |
| `lembretes-1-simular.sql`, `lembretes-2-ver-simulacao.sql`, `lembretes-3-agendar.sql` | **Em ordem, uma vez (02/10/2026)**, depois de publicar `lembrar-pendencias` e de publicar de novo `enviar-aviso` — ver "Os lembretes das 9h" abaixo. O endereço em maiúsculas é trocado na entrega |
| `apuracao-1-preparar.sql`, `apuracao-2-ver-simulacao.sql`, `apuracao-3-agendar.sql` | **Em ordem, uma vez (01/10/2026)**, depois de publicar a função `apurar-ponto` — ver "A apuração da madrugada" abaixo. Os valores em maiúsculas são trocados na entrega |
| `dias-com-batida.sql` | **Rode uma vez (01/10/2026).** O espelho incompleto passa a contar também os dias de trabalho sem batida nenhuma, perguntando ao banco em que dias cada pessoa bateu (uma linha por pessoa). Sem ele, a conta alarga o cache do aparelho para o período |
| `ponto-pelo-servidor.sql` | **Rode uma vez (01/10/2026), DEPOIS de a versão nova estar no ar e fora do horário de entrada e saída.** A batida passa a ser carimbada pelo servidor (dia e hora do banco, em Brasília) e o código do cartaz é conferido lá; o aparelho não grava mais batida própria direto na tabela, e só quem cuida do cartaz lê os códigos. Quem estiver com o sistema antigo aberto precisa recarregar. **Não rode de novo `corrigir-ponto-pelo-lider.sql` nem `ponto-do-lider-completo.sql`**: eles recriam a política antiga e reabrem a batida direta |
| `limpar-dias-sem-fechar.sql` | **Rode uma vez (01/10/2026).** Apaga os pedidos PENDENTES de "dia sem fechar" de dias que têm batida — eles viraram "Pontos incompletos" (Equipe e ponto). As faltas ficam. Só dados, sem estrutura |
| `falta-na-fila.sql` | **Rode uma vez (30/09/2026).** O banco passa a aceitar o lançamento de "dia sem fechar" e de FALTA (dia útil sem batida, a partir de 01/10/2026), que vão para Aprovar jornadas. Sem ele a fila recusa esses dias em silêncio |
| `ciencia-da-advertencia.sql` | **Rode uma vez (30/09/2026).** Quem recebeu a advertência só consegue dar ciência nela, uma vez; motivo, tipo e data deixam de ser editáveis pela própria pessoa. Rode depois de `rh-holerite-advertencia.sql` |
| `turno-escolhido-uma-vez.sql` | **Rode uma vez (30/09/2026).** A pessoa confirma o próprio horário na primeira batida, uma vez só; depois só RH e TI mudam. Tira da própria pessoa o poder de mudar turno, cargas e cargo da ficha. Sem ele, a escolha falha e a batida segue com o Turno A |
| `lideres-publicam.sql` | **Rode uma vez.** O banco passa a aceitar publicação na Central do líder de setor para cima, como a tela já mostrava. Sem ele, o líder monta a publicação e é recusado no fim |
| `resetar-acesso.sql` | Pessoa não entra e não lembra a senha, e o botão não está à mão |
| `liberar-acesso.sql` | Contas de autenticação órfãs (sem ficha do outro lado) |
| `conserto-login.sql` | Só se o cadastro duplicado voltar. Já aplicado |
| `conferir-exclusao.sql` | Conversa excluída que volta sozinha |
| `medir-chat.sql` | Chat lento: mede o custo de uma sincronização |
| `testar-cadastro.sql` | Cadastro recusado sem motivo claro |
| `conferir-batida-pelo-servidor.sql` | Só leitura. Diz, para as batidas das últimas horas, se cada uma passou por `bater_ponto` (hora do servidor) ou veio pronta do aparelho |
| `diagnostico-*.sql`, `verificar-*.sql` | Investigações pontuais, já resolvidas. Servem de modelo |
| `corrigir-turno-maria-clara.sql` | Já aplicado (01/10/2026). Modelo para corrigir o turno de alguém pelo SQL Editor: o gatilho aceita a troca e grava a confirmação |
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

## Aviso com o aplicativo fechado (Android)

O caminho tem três peças, e as três precisam estar de pé — faltando
qualquer uma, o aviso simplesmente não chega, sem erro em lugar nenhum:

| Peça | Onde | Feito uma vez |
|---|---|---|
| Tabela dos aparelhos | `aparelhos-para-push.sql` e `aparelho-troca-de-dono.sql` | SQL Editor |
| O APK (Capacitor) | pasta `android/`, pacote `br.com.malachiasautopecas.conecta` | Android Studio |
| A função que envia | `supabase/functions/enviar-aviso/index.ts` | painel do Supabase |

### Publicar a função (sem instalar nada)

1. **Chave do Firebase.** Firebase → ⚙ Configurações do projeto → *Contas
   de serviço* → *Gerar nova chave privada*. Baixa um `.json`.
2. **Guardar no Supabase.** Edge Functions → *Secrets* → nome
   `FCM_CONTA_SERVICO`, valor = o conteúdo **inteiro** do `.json`.
3. **Criar a função.** Edge Functions → *Deploy a new function* → *Via
   Editor*, nome **`enviar-aviso`** (exatamente esse), colar o
   `index.ts` inteiro, publicar.
4. **Desligar "Verify JWT"** nos detalhes da função. A resposta rápida
   da notificação chega sem sessão (o app está fechado) e se identifica
   pelo vale assinado; com a verificação ligada, o Supabase a recusa
   antes. A função confere a identidade dos dois caminhos por conta
   própria.

Mudou o `index.ts`? Cole de novo em *enviar-aviso → Code* e publique:
o repositório não chega à função sozinho, como chega à Vercel.

### A apuração da madrugada (`apurar-ponto`)

Toda madrugada, às 03:00 de Brasília, o servidor apura os últimos 35
dias da rede com as mesmas regras do aplicativo (`apuracaoDoDia.ts`):
cria a falta do dia sem batida, reapura o dia que se resolveu e
transforma em pedido o dia fechado que nunca chegou à fila. Antes isso
só acontecia quando alguém abria a fila no aparelho.

| Peça | Onde |
|---|---|
| A fonte | `src/servidor/funcaoApurarPonto.ts` (+ `apurarPonto.ts`, testado) |
| O arquivo colado no Supabase | `supabase/functions/apurar-ponto/index.ts` — **gerado**, não edite |
| Gerar de novo | `bun scripts/gerar-funcao-apurar.ts` (há teste cobrando que esteja em dia) |

1. **Gerar e colar.** Edge Functions → *Deploy a new function* → *Via
   Editor*, nome **`apurar-ponto`**, colar o `index.ts` gerado, publicar.
   **Desligar "Verify JWT"**: quem chama é o agendador do banco, que se
   identifica pelo segredo, e não por sessão.
2. **Segredo.** Edge Functions → *Secrets* → `APURAR_SEGREDO` = um valor
   aleatório. O mesmo valor vai no passo seguinte.
3. **`apuracao-1-preparar.sql`** — liga `pg_cron`/`pg_net`, guarda o
   segredo no cofre e chama a função em **simulação** (não grava).
4. **`apuracao-2-ver-simulacao.sql`** — ~20 s depois: o que ela gravaria.
5. **`apuracao-3-agendar.sql`** — conferida a simulação, liga a madrugada.

Nos SQLs do repositório o segredo e o endereço são marcadores
(`COLE_O_SEGREDO`, `URL_DO_PROJETO`); os valores entram só na cópia
entregue. Mudou alguma regra do ponto? Gere de novo e cole: o
repositório não chega à função sozinho.

### Os lembretes das 9h (`lembrar-pendencias`)

Todo dia às 09:00 de Brasília o servidor lembra, até resolver (pedido do
Elias, 02/10/2026): o **holerite não assinado**, o **documento do RH sem
ciência** e a **publicação que pede confirmação** (das últimas duas
semanas). Um aviso por assunto por pessoa; o primeiro só 20 horas depois
do documento. Quem a publicação alcança é `publicoAlvo` (`mural.ts`),
embutido na função.

| Peça | Onde |
|---|---|
| A regra | `src/servidor/lembretes.ts` (testado) |
| A fonte da função | `src/servidor/funcaoLembrarPendencias.ts` |
| O arquivo colado no Supabase | `supabase/functions/lembrar-pendencias/index.ts` — **gerado**, não edite |
| Gerar de novo | `bun scripts/gerar-funcao-apurar.ts` (gera as duas funções) |

A função não fala com o Firebase: ela decide e entrega pela
`enviar-aviso` (caminho "entrega agendada"), com o mesmo segredo da
madrugada (`APURAR_SEGREDO`), que já está nos Secrets e no cofre.

1. **Publicar de novo a `enviar-aviso`** (ela ganhou a entrega agendada
   e o aviso de documento do RH).
2. **Publicar `lembrar-pendencias`**: Deploy via Editor, colar o
   `index.ts` gerado, **"Verify JWT" desligado**.
3. **`lembretes-1-simular.sql`** e, ~10 s depois,
   **`lembretes-2-ver-simulacao.sql`**: quem seria lembrado de quê.
4. **`lembretes-3-agendar.sql`** — conferida a simulação, liga as 9h.

### A resposta rápida

O aviso chega com o campo **Responder** em conversas individuais e
grupos abertos. No grupo de avisos da rede e nos grupos só de gestores
ele vem sem o campo: quem publica ali depende do nível da pessoa, e essa
regra mora no aplicativo — o servidor não a copia, só não oferece.

Quem responde se identifica por um **vale** que a função assina para
cada destinatário (quem, qual conversa, até quando — 48 horas). Um vale
adulterado ou vencido é recusado; quem saiu da conversa ou foi desligado
depois do aviso também. Os testes que executam a função estão em
`src/servicos/respostaRapida.test.ts`.

Essa chave envia aviso para qualquer aparelho do projeto: **não vai para o
repositório**, nem para conversa, nem para e-mail. O `google-services.json`
que está no `android/` é outra coisa — é do aplicativo e não envia nada.

### O que dispara o aviso

Toda mensagem gravada — chat, o recado de publicação no grupo de avisos e
o aviso de citação. Quem recebe é quem participa da conversa, menos o
remetente, quem **removeu** a conversa e quem está inativo. Várias
mensagens da mesma conversa viram **um** aviso só na tela de bloqueio,
atualizado.

Cada mensagem é uma chamada à função. O plano gratuito dá 500 mil por mês.

### Conferir

Na tabela `aparelhos` tem de aparecer uma linha por celular com o app
aberto e logado. Sem linha, o problema está no aparelho (permissão de
notificação negada, ou o app não chegou a registrar). Com linha e sem
aviso, o problema está na função: *Edge Functions → enviar-aviso → Logs*.

---

## Gerar o APK no PWABuilder

> **Substituído pela casca Capacitor** (seção acima). O PWABuilder não
> recebe aviso com o app fechado. Fica aqui só como registro.

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
