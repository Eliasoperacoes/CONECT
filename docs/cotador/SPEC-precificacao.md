# Spec: precificacao

Módulo 3 do [MAPA.md](MAPA.md). Depende de `banco-cotacao`, que está pronto
no local. Quem consome: `orcamento`, a tela de cotar.

## Objetivo

Transformar o custo do B2B em **preço de venda**, para o balconista vender
sem nunca ver o custo.

Decisões do Elias (20/10/2026):

- **A margem é por marca**, e não por grupo (o mapa dizia "grupo/linha"; corrigido).
- Só linha leve.
- **Marca sem margem cadastrada usa a margem padrão**, e a tela avisa
  "margem padrão" para o gerente cadastrar depois.
- **Gerente para cima** (nível ≥ 3) muda as margens.
- **Arredonda para cima, em ,90.** R$ 13,42 vira R$ 13,90; R$ 13,95 vira
  R$ 14,90; R$ 13,90 fica R$ 13,90.
- A lista de margens por marca já existe: o Elias manda, e eu carrego no
  banco local.

**Sucesso:** a Bia (Balcão) cota a OC90 e vê o preço de venda de cada
fornecedor e de cada similar, sem nenhum custo chegar ao navegador dela. O Gil
(Gerente) vê custo e venda lado a lado.

## A marca em cada B2B

Cada site escreve a marca de um jeito: "MANN" na DPK, "Mann-filter" no Roles,
"MAHLE METAL LEVE" e "Mahle". Por isso há duas tabelas:

| Tabela | Uma linha é | Exemplo |
|---|---|---|
| `margens_por_marca` | uma marca de vocês e o fator dela | `MANN`, fator 1,80 |
| `apelidos_de_marca` | um jeito de escrever que aponta para a marca | `MANNFILTER` → `MANN` |

A marca é comparada **normalizada**: maiúsculas, só letras e números
("Mann-filter" vira `MANNFILTER`). Uma linha especial, `(padrão)`, guarda o
fator padrão: 1,80.

A marca que chega sem margem nem apelido fica numa lista ("marcas sem
margem"), para o gerente cadastrar ou apontar o apelido.

## O preço, num lugar só

`preco_de_venda(custo, marca)` no banco, uma função só, usada por todo
lugar que mostra venda:

1. acha a marca (direto ou pelo apelido); se não achar, usa a `(padrão)`;
2. multiplica o custo pelo fator da marca (1,80 = custo × 1,80);
3. arredonda para cima em ,90: `ceil(valor - 0,90) + 0,90`.

**O balconista não recebe custo.** A tela lê o resultado por uma função,
`resultado_da_cotacao(codigo)`. Ela devolve, para a peça e para cada
similar e fornecedor:
- melhor local, se é SP ou fora, quantidade, marca, descrição;
- **venda**, e se a margem usada foi a padrão;
- **custo e margem só para quem vê custo** (`posso_ver_custo()`); para os
  outros, os dois vão nulos.

As tabelas de margem também são fechadas: a margem junto com a venda
revelaria o custo. Leem só quem vê custo; gravam só nível ≥ 3.

## Tela "Margens por marca"

Uma tela simples para Gerente para cima, dentro do CONECTA:
- lista de marcas com a margem, para editar e incluir;
- a margem padrão;
- a lista "marcas sem margem" que já apareceram nas cotações, com um botão
  para cadastrar a margem ou apontar o apelido de outra marca.

## Comandos

```bash
cd C:\Users\malac\antigravity\CONECTA-cotador
bun test src/servicos/precificacaoNoBanco.test.ts
bun run test && bun run lint
```

## Estrutura

- `supabase/cotador-precificacao.sql`: delta (tabelas, funções, regras).
- `supabase/cotador-margens-carga.sql`: carga da planilha do Elias, só no local.
- `src/servicos/precificacaoNoBanco.test.ts`: o banco montado em memória,
  entrando como cada pessoa (o padrão do `cotadorNoBanco.test.ts`).
- `src/servicos/margens.ts` + `src/componentes/TelaMargens.tsx`: a tela,
  registrada no catálogo de ferramentas (`ferramentas.ts`) para nível ≥ 3.

## Estratégia de testes

Todos precisam falhar quando a regra for quebrada de propósito:
1. Arredondamento: 13,42 → 13,90; 13,90 → 13,90; 13,95 → 14,90; 0,50 → 0,90.
2. Marca por apelido ("Mann-filter" → MANN) e marca desconhecida → padrão, com a
   marcação "margem padrão".
3. A Bia recebe `resultado_da_cotacao` com venda e **custo e margem nulos**;
   o Gil recebe os dois.
4. A Bia lê `margens_por_marca` e recebe vazio; não consegue gravar.
5. O Gil grava margem; o Caio (Compras, nível 1) lê mas não grava.

## Limites

- **Sempre:** a venda só sai de `preco_de_venda`; tela nenhuma calcula preço.
- **Perguntar antes:** mudar o arredondamento ou quem edita.
- **Nunca:** custo ou margem no resultado de quem não vê custo; commit sem
  autorização; nada na produção (a construção é 100% local).

## Critérios de pronto

- [ ] A planilha do Elias carregada no banco local.
- [ ] A Bia cota a OC90 e vê a venda de cada fornecedor e similar, sem custo.
- [ ] O Gil vê custo, margem e venda.
- [ ] O Gil muda a margem da MAHLE na tela, e a venda da OC90 muda na hora.
- [ ] Testes passando e mordendo.

## Perguntas respondidas (Elias, 20/10)

1. **A margem é um fator de multiplicação:** venda = custo × fator.
   "R$ 100 × 1,80 = R$ 180." Na tabela, a coluna se chama `fator`
   (1,80), não porcentagem. Com o arredondamento: R$ 180,00 vira R$ 180,90.
2. **Fator padrão: 1,80.**
3. **Planilha:** uma coluna com a marca e outra com o fator, em xlsx ou csv.
   Marca do ERP com outro nome entra como apelido.
