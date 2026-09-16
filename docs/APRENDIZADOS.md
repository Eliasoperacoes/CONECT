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
