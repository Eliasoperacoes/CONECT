---
name: testes-que-mordem
description: Escreve testes que de fato pegam a regressão, verificando por mutação que cada teste falha quando a regra é quebrada. Inclui testes que leem o código-fonte para impedir que uma regra volte a ser duplicada, e o isolamento de processo exigido pelo mock.module do Bun. Use ao escrever ou revisar testes, especialmente de regra de negócio e de segurança.
---

# Testes que mordem

Um teste que passa não prova nada. Prova quem **falha quando a regra é
quebrada**.

---

## A verificação por mutação

Depois de escrever o teste, quebre a regra de propósito e confirme a falha.
Trinta segundos, e é o que separa um teste de um enfeite.

```bash
cp src/servicos/regra.ts /tmp/bak
perl -0pi -e "s/if \(condicao\) return false;/\/\/ mutado/" src/servicos/regra.ts
bun test src/servicos/regra.test.ts        # TEM que falhar
cp /tmp/bak src/servicos/regra.ts
bun test src/servicos/regra.test.ts        # e voltar a passar
```

Casos reais em que isso mudou o resultado:

- Um teste de "ninguém aprova a própria hora" passava **com e sem** a trava.
  A mutação expôs o buraco e rendeu um teste novo, específico, para quem
  cuida de pessoas.
- Um teste de permissão continuava verde depois de remover a trava que
  impedia o administrador de se trancar para fora.

Se a mutação não derruba nada, o teste está olhando para outra coisa.

**No commit, diga o que a mutação provou**, não só "testes passando":

> Conferido por mutação: transformar o organograma em "só amplia" derruba o
> teste da alçada, e tirar a trava de auto-aprovação derruba o do RH.

---

## Testes que leem o código-fonte

Nem toda regra cabe num `expect` de comportamento. Algumas são estruturais —
e são justamente as que voltam.

Servem para: "esta lista não pode ser duplicada", "esta função só pode ser
definida uma vez", "esta tela não pode decidir permissão sozinha".

```ts
test('nenhuma tela pode ter uma cópia da lista de setores', async () => {
  for (const caminho of TELAS) {
    const codigo = await Bun.file(new URL(caminho, import.meta.url)).text();
    expect(codigo).toContain('SETORES');
    expect(codigo).not.toMatch(/'Tesouraria',\s*\n\s*'RH',/);
  }
});
```

Três cuidados:

1. **Tire os comentários antes de procurar.** Um teste assim já achou a
   própria explicação escrita em comentário e reprovou o arquivo correto.
2. Ancore em algo estável (a chamada da função, o nome do símbolo), não na
   formatação.
3. Escreva no teste **qual defeito** ele impede. Sem isso, o próximo a
   esbarrar nele o apaga achando que é frescura.

Regressões que esse tipo de teste pegou aqui:

| Teste | Defeito que impede |
|---|---|
| Lista de setores duplicada | Setor novo não aparecia no filtro |
| Função SQL definida em 2 arquivos | Login criava cadastro duplicado |
| Abas com `visivel: true` fixo | Permissão configurada não tinha efeito |
| Delimitador `$$` quebrado em `.sql` | Arquivo SQL inteiro inválido |
| `upsert` em tabela só com política de UPDATE | Gravação recusada pela RLS |

---

## Isolamento de processo (Bun)

`mock.module` do Bun é **global ao processo**. Arquivos de teste rodando
juntos contaminam uns aos outros: um deles instala um mock e os seguintes
passam a testar o mock, não o código.

Já fez testes passarem por engano aqui. A solução é um processo por arquivo:

```ts
// scripts/testar.ts
import { readdirSync } from 'node:fs';
const arquivos = /* todos os *.test.ts */;
for (const arquivo of arquivos) {
  const r = Bun.spawnSync(['bun', 'test', arquivo], { stdio: ['inherit','inherit','inherit'] });
  if (r.exitCode !== 0) process.exit(r.exitCode);
}
```

```json
{ "scripts": { "test": "bun scripts/testar.ts" } }
```

Custa alguns segundos e devolve a confiança no resultado.

---

## O que testar primeiro

Por ordem de dano se quebrar em silêncio:

1. **Quem pode o quê.** Aprovar, ver, editar. E o negativo: quem **não**
   pode. O teste de "gerente de outra loja não aprova" pegou um buraco real.
2. **Trava contra si mesmo.** Auto-aprovação, autopromoção, administrador se
   trancando para fora.
3. **Importação e conversão.** Valor desconhecido tem que **falhar**, não
   virar o primeiro da lista em silêncio. Aqui, "setor desconhecido" mandava
   32 pessoas para o Balcão — e o setor decide quem aprova a jornada delas.
4. **Dado ruim não trava a tela.** Ciclo na hierarquia, referência para quem
   já saiu, data inválida. Na dúvida, o sistema mostra a mais, não a menos.
5. **Documento sai completo.** Campo vazio num documento trabalhista também
   é informação: mostra o que falta cadastrar.

---

## Escrever o porquê, não o quê

O nome e o comentário do teste são para quem chega daqui a um ano e pensa em
apagá-lo.

```ts
test('ADMINISTRATIVO NÃO VIRA TI', () => {
  // Contém "admin" e contém "ti". Com busca por trecho, esta linha dava
  // acesso total a um cargo de nível 1.
  expect(resolverNivelDaPlanilha('Administrativo').nivel).toBe(NIVEL_COLABORADOR);
});
```

Compare com `test('resolverNivelDaPlanilha retorna 1')`. O segundo alguém
apaga sem pensar.
