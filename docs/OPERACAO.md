# Operação do CONECTA

O que fazer quando alguma coisa trava. Escrito para quem tem acesso ao
projeto no Supabase e ao repositório.

---

## Os arquivos SQL

Todos ficam em `supabase/` e **podem ser rodados mais de uma vez**.

| Arquivo | Quando usar |
|---|---|
| `esquema.sql` | Banco novo do zero, ou desconfiança de que algo se perdeu. ~1200 linhas |
| `resetar-acesso.sql` | **O mais usado.** Pessoa não entra e não lembra a senha |
| `conserto-login.sql` | Só se o cadastro duplicado voltar. Já aplicado |
| `liberar-acesso.sql` | Contas de autenticação órfãs (sem ficha do outro lado) |
| `permissoes.sql` | Só a coluna de permissões. Já aplicado |
| `organograma.sql` | Só a parte do organograma. Já aplicado |
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

**Solução:** `supabase/resetar-acesso.sql`. Troque o login na linha marcada:

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
