# Tarefas: estacao

Especificação: [docs/cotador/SPEC-estacao.md](../docs/cotador/SPEC-estacao.md), aprovada pelo Elias em 20/10/2026.
Perguntas em aberto fechadas assim:
- similares gravados com preço;
- uma estação só, chamada `compras`;
- 90 s sem resposta da extensão = pedido em `erro`.

As tarefas do `banco-cotacao` continuam em [todo.md](todo.md); falta só levar à produção.

## E1: Similares com preço (banco) ✅
- [x] `gravar_cotacao` aceita similares com `ofertas` e grava o preço deles em `precos_b2b` (e o melhor no histórico) com o código do próprio similar. O vínculo fica em `similares_b2b`.
- [x] Continua aceitando similar só com `{ codigo, marca }`.
- [x] Para não repetir a regra: `gravar_ofertas` é uma função interna, que ninguém logado consegue chamar.
- Verificação: `bun test src/servicos/cotadorNoBanco.test.ts`, morde. Aplicar no Docker.
- Arquivos: `supabase/cotador-banco.sql` e o teste. **P**

## E2: `cotacao.js` compartilhado (extensão) ✅ (`d0279a4` na extensão)
- [x] `cotarSite` e `lerNaPagina` saem do `cotar.js` para `cotacao.js`. O painel usa o novo arquivo e o "Cotar" continua igual.
- [x] Cada site ganha `fornecedor` (`roles`, `pellegrino`, `dpk`).
- [x] `paraBanco(resultado)` monta o item no formato do `gravar_cotacao`: sem peça, erro de sessão, similares com ofertas.
- Verificação: `bun test` na extensão (morde), mais o "Cotar" do painel testado à mão por você.
- Arquivos: `cotacao.js`, `cotar.js`, `painel.html`, `teste/cotacao.test.js`. **M**

## E3: Ponte com o CONECTA (extensão) ✅ (`02499f0` na extensão)
- [x] `conecta-ponte.js` nas origens do CONECTA (local e produção). Aceita só mensagem da própria janela com a marca `cotador-b2b`.
- [x] O `servico.js` responde a `ola` (versão e sites) e a `cotar` (os 3 B2Bs em paralelo).
- [x] A situação de cada site: `fora`, `deslogado` ou `ok`.
- Verificação: `bun test` (a ponte ignora mensagem de fora). Na mão: no console do CONECTA, o `ola` responde.
- Arquivos: `conecta-ponte.js`, `servico.js`, `manifest.json`, `teste/conecta-ponte.test.js`. **M**

## E4: O laço da estação (CONECTA) ✅
- [x] `estacaoCotacao.ts`: sem extensão ou sem `podeAtenderFila`, não chama nada. Sinal a cada 60 s; fila a cada 5 s; um pedido por vez; 90 s sem resposta grava erro em todos os fornecedores.
- Verificação: teste com banco falso e extensão falsa (morde). Mais `bun run test` e `bun run lint`.
- Arquivos: `src/servicos/estacaoCotacao.ts` e o teste. **P**

## Depois (pedido do Elias, 20/10)
- [ ] Avisar qual site específico está fora do ar ou deslogado, conferindo a sessão de cada B2B junto com o sinal de cada minuto, e não só quando uma cotação falha.
- [ ] Uma aba própria da estação no CONECTA, com tudo num lugar: sites, fila, últimos pedidos e erros.
- [ ] Ao recarregar a extensão, avisar que as abas dos B2Bs também precisam de F5.

## E5: Ligar e provar ponta a ponta ✅ (no local, 20/10)
- [x] Ligar no `App.tsx`, com um aviso discreto para quem atende a fila ("Estação de cotação ativa · 3 sites ok").
- [x] Os critérios de pronto da especificação no local: a Bia pediu a OC90 e o pedido ficou pronto em 15 s com os 3 B2Bs, sem erro (DPK R$ 8,69, Roles R$ 9,06, Pellegrino R$ 10,25).
- [x] Achados na prova e corrigidos:
  - preço zero da DPK contava como disponível (WEGA WO130);
  - extensão recarregada fazia a estação gastar o pedido como erro: agora ela para e pede F5.
- **Não enviar ao main** (Elias, 20/10): tudo 100% local até subir a estrutura completa junto com o banco da produção.
- Depende de: E1–E4. **Checkpoint com o Elias**: ele vê a OC90 ficar pronta sozinha.
- Arquivos: `src/App.tsx` e um componente pequeno do aviso. **P**
