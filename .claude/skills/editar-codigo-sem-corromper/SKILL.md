---
name: editar-codigo-sem-corromper
description: Evita corromper arquivos ao editá-los por linha de comando — sed e perl comendo cifrões em SQL, quebrando tipos TypeScript e duplicando blocos JSX. Diz quando usar a ferramenta de edição, quando um script de substituição é seguro, e como conferir depois. Use antes de editar arquivos com sed, perl ou scripts de substituição em massa.
---

# Editar código sem corromper

Substituição por linha de comando estraga arquivo em silêncio. Estes casos
são reais, todos num mesmo projeto.

---

## O que já aconteceu

| Arquivo | Estrago | Como apareceu |
|---|---|---|
| `tipos.ts` | União de tipo duplicada, **duas vezes** | Erro do compilador longe da edição |
| `nuvem.ts` | Cabeçalho e interface embaralhados | Idem |
| `App.tsx` | Anotação de tipo duplicada | Idem |
| `esquema.sql` | `$$` virou `$` em duas linhas | **Nada.** O arquivo só falha no banco, e o erro aponta para outro lugar |

O último é o pior: `$$` delimita o corpo de função e de bloco `DO` em
Postgres. Perder um cifrão **invalida o arquivo inteiro** — não a linha —, e
o editor do Supabase reclama de um ponto distante do defeito.

---

## A regra

**TypeScript, JSX e SQL com mais de uma linha: ferramenta de edição.** Ela
casa o texto exato e falha em vez de estragar.

Linha de comando serve para:

- ler (`cat`, `sed -n`, `grep`)
- substituir **uma linha inteira**, curta e sem caracteres especiais
- acrescentar no fim (`cat >> arquivo <<'FIM'`)

---

## Quando o script de substituição compensa

Muitas edições no mesmo arquivo, ou a mesma edição em vários. Aí vale — com
**verificação obrigatória**:

```ts
const trocas: [string, string][] = [ /* [de, para] */ ];

for (const [de, para] of trocas) {
  // Falhar ANTES de escrever. Sem isto, uma âncora que não casa vira uma
  // edição que não aconteceu e ninguém percebe.
  if (!s.includes(de)) throw new Error('nao achei: ' + de.slice(0, 60));
  s = s.replace(de, para);
}
await Bun.write(p, s);   // grava só depois de todas casarem
```

Três hábitos que evitam o resto:

1. **Âncore em texto único e literal.** Se aparece duas vezes, inclua linhas
   vizinhas até ficar único.
2. **Grave uma vez, no fim.** Gravar a cada troca deixa o arquivo pela
   metade quando uma falha.
3. **Cuidado com o encadeamento de trocas.** A troca 3 procura texto que a
   troca 1 já alterou? Ordene, ou ancore em trecho que não mudou.

---

## Cifrão, crase e chaves

Os caracteres que mais somem:

| Caractere | Onde dói | Cuidado |
|---|---|---|
| `$$` | Corpo de função e bloco `DO` em SQL | `perl -0pi -e "s/.../$$/"` come um. Escreva por ferramenta de edição |
| `` ` `` e `${` | Template literal de JS dentro de script | Heredoc **entre aspas** (`<<'FIM'`) não expande; sem aspas, expande |
| `\n` | Regex de `sed` | `sed` não casa quebra de linha; para multilinha, `perl -0p` |
| `&` | Lado direito do `sed` | Vira "o texto casado" |

---

## Conferir depois

```bash
# TypeScript
bun run lint

# SQL: delimitadores tem que fechar, e nenhum cifrão solto
grep -o '\$\$' arquivo.sql | wc -l          # par
grep -n '\$' arquivo.sql | grep -v '\$\$'   # vazio
```

Vale virar teste, porque isto volta:

```ts
test('os .sql não têm delimitador de corpo quebrado', async () => {
  for (const arquivo of ARQUIVOS_SQL) {
    const sql = await lerSql(arquivo);
    const solto = sql.split('\n')
      .map((linha, i) => ({ linha, numero: i + 1 }))
      .filter(({ linha }) => linha.includes('$') && !linha.includes('$$'));
    expect(solto).toEqual([]);
    expect((sql.match(/\$\$/g) || []).length % 2).toBe(0);
  }
});
```

Esse teste pegou o mesmo defeito num arquivo gerado, **antes** de ele chegar
ao usuário.

---

## Gerar arquivo a partir de outro

Recortar um trecho de um arquivo grande para entregar um script curto é útil
— e propaga qualquer corrupção junto. Depois de gerar, rode as mesmas
conferências no arquivo gerado, não só no original.

E prefira **âncoras de conteúdo** a números de linha: o arquivo muda.

```ts
const i = texto.indexOf('-- INICIO DA SECAO');
const j = texto.indexOf('-- FIM DA SECAO');
if (i === -1 || j === -1) throw new Error('nao achei as ancoras');
```
