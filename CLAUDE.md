# CONECTA — instruções do projeto

Sistema interno de comunicação e gestão de pessoas da **Malachias Autopeças**:
5 lojas, ~89 colaboradores. Chat, rádio PTT, ponto, banco de horas,
organograma e permissões.

Dono do sistema: Elias (TI/Administrador). Escreve e lê em **português do
Brasil** — código, comentários, commits e conversa, tudo em português.

---

## Como rodar

```bash
bun install
bun run dev      # http://localhost:3000
bun run lint     # tsc --noEmit
bun run test     # scripts/testar.ts — um processo POR ARQUIVO (ver abaixo)
bun run build
```

Variáveis em `.env` (modelo em `.env.example`). Sem elas o sistema roda em
**modo local**, com dados só no navegador.

Publicação: Vercel, automática a cada push em `main`.

---

## Leia antes de mexer

- [docs/ARQUITETURA.md](docs/ARQUITETURA.md) — as regras que sustentam o
  sistema e o que quebra ao afrouxá-las.
- [docs/OPERACAO.md](docs/OPERACAO.md) — o que rodar no Supabase, como
  liberar o acesso de alguém, o que fazer quando o login trava.
- [docs/APRENDIZADOS.md](docs/APRENDIZADOS.md) — os erros que já custaram
  caro aqui, com o sintoma de cada um. Vale a leitura antes de depurar.

---

## Regras deste projeto

### Commits

Commitar e empurrar para `main` **sem perguntar**. A exceção é mudança de
possível grande impacto — aí pergunte antes. Mensagem em português,
explicando **por que**, não o que o diff já mostra.

### Uma regra, um lugar

Este sistema já foi mordido quatro vezes pela mesma coisa: a mesma decisão
escrita em dois lugares, divergindo depois.

| O que duplicou | O que aconteceu |
|---|---|
| Lista de setores copiada em 2 telas | Setores novos não apareciam no filtro; pessoas cadastradas certo sumiam da busca |
| Campos da ficha montados por tela | CNPJ entrou no cadastro e não apareceu no espelho de ponto |
| Regra de alçada em 2 funções | Gerente aprovava pela cadeia mas enxergava a loja inteira |
| `criar_colaborador_do_usuario()` em 2 arquivos `.sql` | Login criava cadastro duplicado — venceu a versão do arquivo rodado por último |

Antes de escrever uma lista ou uma regra, procure se ela já existe.
Fontes únicas atuais: `tipos.ts` (setores, níveis, cargos),
`fichaColaborador.ts` (dados individuais), `organograma.ts` (alçada),
`ferramentas.ts` (telas do sistema).

### Antes de afirmar que algo funciona

**Meça.** Rode o teste, leia o CSS gerado, consulte o banco. Já afirmei
aqui que a aba Ponto tinha sumido para o gerente quando eu só havia mudado
o catálogo e nenhuma tela o consultava. E afirmei que a ficha do Fabio
estava corrigida quando os próprios números diziam o contrário.

Quando o dado estiver do lado do Elias (banco em produção), peça a consulta
e espere a resposta em vez de deduzir em rodadas.

### Testes

Todo teste novo precisa **morder**: quebre a regra de propósito e confirme
que ele falha. Detalhe em
[.claude/skills/testes-que-mordem](.claude/skills/testes-que-mordem/SKILL.md).

`bun run test` roda **um processo por arquivo** de propósito — `mock.module`
do Bun é global ao processo, e arquivos juntos contaminavam uns aos outros,
fazendo testes passarem por engano.

### Editar arquivos

Para TypeScript, JSX e SQL com várias linhas, use a ferramenta de edição —
não `sed`/`perl`. Já corromperam `tipos.ts`, `nuvem.ts`, `App.tsx` e o
`esquema.sql` (comeram um `$` de `$$`, o que invalida o arquivo SQL
inteiro). Há teste conferindo os delimitadores dos `.sql`.

### SQL para o Elias rodar

Ele cola no SQL Editor do Supabase e responde "Rodei". Então:

1. Gere um arquivo **só com o delta**, não o esquema de 1200 linhas.
2. Jogue na área de transferência dele:
   `Get-Content -Path "supabase\arquivo.sql" -Encoding utf8 -Raw | Set-Clipboard`
   (o `-Encoding utf8` não é opcional: os arquivos têm acento).
3. Termine o script com um `select` de conferência. "Success" no editor
   aparece igual quando se roda um arquivo antigo.
4. Todo script que mexe em estrutura termina com `notify pgrst, 'reload schema'`.

---

## Vocabulário

Nomes em português, inclusive no código. Alguns que se repetem:

| Termo | O que é |
|---|---|
| **Colaborador** | Pessoa cadastrada. Nunca "usuário" |
| **Ficha** | Os dados individuais de um colaborador |
| **Alçada** | Sobre quem alguém pode decidir (aprovar hora, ver saldo) |
| **Cadeia / organograma** | Quem responde a quem |
| **Ferramenta** | Uma tela do sistema, no catálogo de permissões |
| **Espelho de ponto** | O documento com as marcações do período |
| **Jornada** | O dia de trabalho apurado |
