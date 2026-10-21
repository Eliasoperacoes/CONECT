# Tarefas: precificacao

Especificação: [docs/cotador/SPEC-precificacao.md](../docs/cotador/SPEC-precificacao.md).
Tudo 100% local, na pasta `CONECTA-cotador`. Commit só local e só com a autorização do Elias.

## P1: Fator por marca e o preço de venda (banco) ✅
- [x] `margens_por_marca` (marca, fator) com `(padrão)` = 1,80. `apelidos_de_marca` (apelido → marca). `normalizar_marca()`.
- [x] `preco_de_venda(custo, marca)`: acha a marca (direto ou pelo apelido) ou usa o padrão; custo × fator; arredonda para cima em ,90.
- [x] Margens: leem quem vê custo; gravam nível ≥ 3.
- Verificação: `precificacaoNoBanco.test.ts` mordendo. Casos: arredondamento (13,42 → 13,90; 13,90 → 13,90; 13,95 → 14,90); apelido; padrão; R$ 100 → R$ 180,90; Balcão sem leitura; Compras lê e não grava; Gerente grava.

## P2: O resultado da cotação para a tela (banco) ✅
- [x] `resultado_da_cotacao(codigo)`: para a peça e cada similar, por fornecedor, devolve:
  - melhor local, SP ou fora, quantidade, marca, descrição;
  - venda, e se usou o fator padrão;
  - custo e fator só para quem vê custo.
- [x] "Marcas sem margem": as marcas que apareceram nas cotações e não têm fator nem apelido.
- Verificação: a Bia recebe venda com custo e fator nulos; o Gil recebe tudo. Teste mordendo e conferência no Docker com a OC90 real.

## P3: Carga da planilha do Elias ✅ (185 linhas, 180 marcas; ISAPA, MAGNETI MARELLI e GRAZZIMETAL por tipo de peça)
- [x] Quando o Elias mandar: `cotador-margens-carga.sql` gerado da planilha, aplicado só no local.
- Verificação: contagem de marcas carregadas e a OC90 com a venda certa.

- Marca com fatores por tipo de peça (pedido do Elias, 20/10): aviso com todas as possibilidades, e a que a descrição cita vem marcada.

## P4: Tela "Margens por marca" ✅ (falta a conferência do Elias na tela)
- [x] `margens.ts` (ler, gravar, apelidar) + `TelaMargens.tsx` no catálogo de ferramentas (`margens_cotador`), para nível ≥ 3, no assunto novo "Cotação B2B".
- [x] Lista de marcas e fatores, o fator padrão, e as "marcas sem margem" com os botões cadastrar e apontar apelido.
- [x] Gravar passa por `salvar_fator` e `apontar_apelido` no banco: validação e normalização num lugar só.
- Efeito colateral: as funções do servidor (apurar-ponto, lembrar-pendencias) foram regeradas, porque levam o catálogo de ferramentas. Ao subir para a produção, colar de novo no Supabase.
- Verificação: teste do serviço; na mão, o Gil muda o fator da MAHLE e a venda da OC90 muda.

### Checkpoint com o Elias
- [ ] Todos os critérios de pronto da especificação no local.
