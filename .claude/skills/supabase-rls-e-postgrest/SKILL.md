---
name: supabase-rls-e-postgrest
description: Diagnostica e evita as armadilhas de Row Level Security, PostgREST e gatilhos do Supabase — erros de "viola a política de segurança", coluna que "não existe" no cache, upsert recusado, e função SQL definida em dois arquivos. Use ao escrever políticas RLS, gravar em tabelas protegidas, criar colunas ou depurar erro de permissão que não faz sentido.
---

# Supabase: RLS, PostgREST e gatilhos

Cada item abaixo custou horas num sistema real. O padrão comum: **a mensagem
de erro aponta para o lugar errado**.

---

## 1. `upsert` esbarra na RLS, mesmo quando a linha já existe

**Sintoma:** `new row violates row-level security policy for table "x"` —
numa gravação que não criava linha nenhuma.

**Causa:** `upsert` vira `insert ... on conflict` no banco. Um INSERT exige
política de INSERT **sempre**, mesmo quando o conflito só ia atualizar. E o
`ON CONFLICT` precisa **enxergar a linha em conflito** — se a política de
SELECT esconder a linha, o banco recusa em vez de atualizar.

**Como resolver, por caso:**

| Situação | O que usar |
|---|---|
| Linha única, semeada pelo esquema (configurações) | `.update(...).eq('id', ...)`, nunca upsert |
| Inserção normal que pode repetir | `.insert(...)` e tratar `23505` como sucesso |
| Precisa mesmo de upsert | Garanta política de INSERT **e** que o SELECT enxergue a linha |

```ts
// Insert simples tolerando repetição — não vira ON CONFLICT
const { error } = await supabase.from('conversas').insert(linha);
if (error && error.code !== '23505') throw error;
```

**Armadilha do update:** um `update` que não acha linha nenhuma **não é
erro** — volta vazio e "deu certo". Numa tela de configuração isso é o pior
desfecho: diz "Salvo" e nada foi gravado.

```ts
const { data, error } = await supabase.from('x').update({...}).eq('id', true).select('id');
if (!error && (!data || data.length === 0)) {
  // a linha não existe, ou a RLS a escondeu
}
```

**Teste que prende isso** (lê o esquema e o código, sem precisar de banco):

```ts
const comInsert = new Set([...esquema.matchAll(
  /create policy \w+ on public\.(\w+)\s+for insert/g)].map(m => m[1]));
const comUpsert = new Set([...codigo.matchAll(
  /from\('(\w+)'\)\s*\.upsert/g)].map(m => m[1]));

for (const tabela of comUpsert) expect(comInsert.has(tabela)).toBe(true);
```

---

## 2. A coluna existe e a API jura que não

**Sintoma:** `Could not find the 'x' column of 'y' in the schema cache`,
com a coluna visível no banco.

**Causa:** o PostgREST guarda o desenho das tabelas em memória. `alter table`
não avisa ele.

```sql
notify pgrst, 'reload schema';
```

Ponha isso no **fim** de todo script que mexe em estrutura, depois de todas
as alterações, para a releitura pegar tudo de uma vez.

---

## 3. RLS é por LINHA — para proteger COLUNA, use gatilho

Uma política como `using (id = auth.uid())` deixa a pessoa gravar na
própria linha. Se `nivel`, `perfil` ou `responsavel_id` moram nessa linha,
ela pode alterá-los pela API, mesmo que nenhuma tela ofereça isso.

```sql
create or replace function public.protege_colunas()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if public.e_admin() then return new; end if;

  -- Devolve o valor antigo em vez de RECUSAR: o cliente costuma gravar a
  -- linha inteira ao salvar qualquer coisa, e um cache velho faria uma
  -- troca de foto morrer com erro sobre permissão.
  new.nivel := old.nivel;
  new.perfil := old.perfil;
  return new;
end;
$$;

create trigger x_protege before update on public.x
  for each row execute function public.protege_colunas();
```

Recusar (`raise exception`) é tentador e costuma ser pior na prática.

---

## 4. A mesma função em dois arquivos `.sql`

**Sintoma:** o banco se comporta como uma versão antiga do código que você
está lendo.

**Causa:** `create or replace function` não reclama de conflito. Se dois
arquivos definem a mesma função com comportamentos diferentes, **vale o
último executado** — e ninguém controla essa ordem.

Num caso real: um arquivo adotava a ficha existente no primeiro acesso, o
outro criava uma ficha nova. O segundo foi rodado por último, várias vezes,
e cada login gerava um cadastro duplicado.

**Regra:** uma função, um arquivo. Ao consolidar, **não apague** o arquivo
antigo — esvazie-o deixando um comentário do que aconteceu. O texto antigo
continua salvo em alguma aba e um dia seria colado de novo.

**Teste:**

```ts
const definicoes = arquivos.reduce((total, sql) =>
  total + (semComentarios(sql).match(
    /create or replace function public\.minha_funcao/g) || []).length, 0);
expect(definicoes).toBe(1);
```

O `semComentarios` importa: a primeira versão desse teste achou a própria
explicação escrita em comentário e reprovou o arquivo certo.

---

## 5. Gatilho em `auth.users`: adotar, nunca criar

Para "o cadastro vem de dentro do sistema, o login só ativa":

```sql
-- 1. procura ficha pelo login, sem caixa nem espaço
-- 2. não achou            -> raise exception (NÃO cria)
-- 3. já tem auth_user_id  -> raise exception (não adota duas vezes)
-- 4. senha de ativação não confere -> raise exception
-- 5. adota: set auth_user_id = new.id
--    e NÃO toca em nivel, loja, setor, cargo
```

Três cuidados:

- **Dois gatilhos na mesma tabela precisam de funções diferentes.** Apontar
  os dois para a mesma função roda a adoção duas vezes, e a segunda recusa —
  derrubando todo primeiro acesso.
- O Supabase mascara qualquer erro do gatilho como `Database error saving
  new user`. A mensagem do cliente precisa cobrir todas as causas, em vez de
  afirmar uma que pode estar errada.
- `already registered` **não é ambíguo**: a conta existe, a senha é que não
  bate. Dizer "login ou senha incorretos" manda a pessoa conferir o login,
  que estava certo, e esconde o único caminho que resolve.

**Índice único sem caixa,** senão "Fabio" e "fabio" viram duas pessoas:

```sql
create unique index if not exists x_login_unico on public.x (lower(trim(login)));
```

---

## 6. Recursão em SQL precisa de limite

Cadeia de hierarquia com CTE recursiva: um ciclo nos dados trava a consulta,
e com ela tudo que depende dela.

```sql
with recursive acima as (
  select responsavel_id as id, 1 as depth from colaboradores where id = alvo
  union all
  select c.responsavel_id, a.depth + 1 from acima a
    join colaboradores c on c.id = a.id
   where c.responsavel_id is not null and a.depth < 20   -- <<<
)
```

A tela deve impedir criar o ciclo; a leitura deve **tolerá-lo** sem travar.
Dado ruim aparece.

---

## 7. Medir, não deduzir

Quando um erro de permissão não faz sentido, pare de tentar correções em
rodadas. Cada tentativa custa tempo e não ensina nada.

Reproduza contra o banco de verdade — uma conta de teste, uma consulta
direta — e descubra **qual** operação é recusada. Num caso real, medir
mostrou em minutos que o `insert` simples passava e as duas formas de
`upsert` eram recusadas; quatro tentativas às cegas não tinham chegado lá.

E **"Success" no editor não prova o que ficou valendo.** Termine todo script
com um `select` de conferência:

```sql
select
  exists (select 1 from information_schema.columns
           where table_name = 'x' and column_name = 'y') as coluna_existe,
  exists (select 1 from pg_proc
           where proname = 'f' and prosrc ilike '%marca da versao certa%') as funcao_certa;
```
