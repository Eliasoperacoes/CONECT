# Arquitetura do CONECTA

O que sustenta o sistema, e o que quebra se for afrouxado. Não é um índice
de arquivos — para isso, o próprio código, que é comentado.

---

## As três camadas de autorização

São diferentes de propósito. Confundi-las é o erro mais caro possível aqui,
porque ele **parece** funcionar.

```
 FERRAMENTA  →  quais TELAS a pessoa enxerga
               servicos/ferramentas.ts + servicos/permissoes.ts
               configurável pelo ADM, gravado no banco

 ALÇADA      →  sobre QUEM ela decide (aprovar hora, ver saldo, ver ficha)
               servicos/organograma.ts
               NÃO é configurável por painel: vem do organograma

 AÇÃO        →  o que ela pode FAZER lá dentro (corrigir ponto, editar ficha)
               travado no serviço E na RLS do banco
               sobrevive a qualquer configuração de tela
```

**Ligar uma ferramenta abre a porta, nunca a sala.** Dar "Banco de Horas"
ao gerente no painel não faz ele ver a rede inteira: o conteúdo continua
filtrado por `obterColaboradoresVisiveis()`, que é a mesma alçada da
aprovação.

Se um dia isso for fundido "para simplificar", o administrador passará a
liberar folha de ponto da rede inteira marcando uma caixa, e a tela ficará
igual. Ninguém percebe.

### Quem aprova a hora de quem

```
pessoa POSICIONADA no organograma  → só a cadeia acima dela decide
                                     (a regra de setor/loja deixa de valer)
pessoa AINDA NÃO POSICIONADA       → regra automática:
                                       líder → o próprio setor
                                       gerente → a própria loja
RH, Diretoria e TI                 → a rede inteira, sempre
NINGUÉM                            → a própria hora
```

A regra automática é **rede de segurança**, não legado: com 89 pessoas o
organograma é montado loja por loja, e sem ela quem ainda não foi arrastado
ficaria com as horas paradas na fila.

A mesma regra vive em dois lugares porque precisa: `organograma.ts` para a
tela, e `posso_decidir_jornada()` no banco para a RLS. **Mudou uma, mude a
outra** — a do banco é a que vale de verdade.

---

## Fontes únicas

| Fonte | O que define | Quem consome |
|---|---|---|
| `tipos.ts` | Setores, níveis, cargos, lojas | Filtros, cadastro, importação de planilha |
| `fichaColaborador.ts` | O que é a ficha de alguém | Espelho de ponto, CSV, quadro, aba Eu, aprovação |
| `organograma.ts` | Alçada e cadeia | Aprovação, painel de gestão, visibilidade |
| `ferramentas.ts` | Toda tela do sistema | Painel de permissões, barra de navegação |

**Campo novo entra uma vez.** Acrescentar à ficha em `fichaColaborador.ts`
faz o campo aparecer no espelho, no quadro e na aba Eu sem tocar em nenhuma
tela. Foi assim que o CNPJ deixou de existir só no formulário.

Há testes que leem o código-fonte e reprovam a volta das cópias
(`planilha.test.ts`, `permissoes.test.ts`, `login.test.ts`).

---

## Nuvem e cache

**O banco é a verdade. O navegador é cache de leitura.**

- Gravou: banco primeiro, cache depois. Uma permissão que não subiu não
  pode parecer salva.
- Leu: cache para a tela abrir na hora, com o banco corrigindo em seguida.
- Banco de horas, ponto e mensagens pertencem à **pessoa**, não ao
  aparelho: bater a entrada no celular e a saída no PC é um dia só.

Exceção consciente: fixar e ocultar conversa
(`preferenciasConversa.ts`) ficam **só no navegador**. São preferência de
cada um e não valem entre aparelhos. Está anotado como pendência.

---

## Acesso e identidade

Ninguém cria conta pela tela de login. O colaborador é cadastrado dentro do
sistema (pelo RH ou pela planilha) e só então **ativa** o acesso.

```
1ª entrada  →  não existe conta de autenticação
            →  o gatilho ao_criar_usuario ADOTA a ficha, casando pelo login
            →  nível, loja, CNPJ e organograma da planilha ficam intactos
            →  exige a senha de primeiro acesso (senha_ativacao, ou 123456)
            →  obriga a trocar a senha em seguida

login desconhecido  →  recusado. Não vira cadastro novo.
ficha já ativada    →  recusado. Não se adota duas vezes.
```

O login é comparado **sem caixa e sem espaço sobrando**, com índice único em
`lower(trim(login))`. "Fabio" e " fabio " são a mesma pessoa.

Esqueceu a senha? Não há recuperação: a senha vive cifrada na autenticação.
O caminho é `supabase/resetar-acesso.sql` — apaga a conta de autenticação e
**deixa a ficha intacta**, devolvendo a pessoa ao primeiro acesso.

### Colunas que a pessoa não muda em si mesma

A política de UPDATE da tabela deixa cada um gravar na própria linha, e
`responsavel_id`, `nivel`, `loja` e `setor` moram nela. RLS é por LINHA, não
por coluna — então a trava é um **gatilho**
(`apenas_rh_move_o_organograma`), que devolve o valor antigo em vez de
recusar a gravação inteira.

Devolver em vez de recusar porque o aplicativo grava a linha toda ao salvar
qualquer coisa: recusar faria uma troca de foto morrer com erro sobre
organograma, se o cache estivesse velho.

---

## Retenção

O histórico é base de controle da rede. **Ninguém apaga mensagem por
clique**: "excluir conversa" oculta da lista de quem clicou, e o histórico
fica.

Quem apaga é a regra de limpeza, no banco: a cada 3 meses cai o mês mais
antigo, sempre guardando 2 meses. Vale para mensagem, áudio e imagem.
**Ponto, banco de horas e ficha nunca são apagados.**

Conversa oculta guarda o **instante** em que foi ocultada, não um sim/não:
mensagem posterior a ele traz a conversa de volta. Sem isso, alguém seria
chamado numa conversa invisível e nunca saberia.

---

## Travas que não podem cair

| Trava | Onde | Sem ela |
|---|---|---|
| Ninguém aprova a própria hora | `temAlcadaSobre` + `posso_decidir_jornada()` | Quem está no topo da cadeia se auto-aprova |
| TI não se tranca para fora | `sempreParaTI` em `permissoes.ts` | Desligar a tela de Permissões deixa o sistema sem ninguém capaz de religar |
| Migração de permissão só TIRA acesso | `obterPermissoes` | Migração que amplia acesso sozinha ninguém percebe |
| Ciclo no organograma | `podeSerResponsavelDe` (cria) e limite de profundidade (lê) | A tela entra em recursão e o navegador morre |
| Corrigir marcação é do RH | `ajustarMarcacao` | Cinco pessoas alterando registro trabalhista |
| Setor desconhecido na planilha **falha** | `resolverSetorDaPlanilha` | 32 pessoas foram para o Balcão em silêncio — e o setor decide quem aprova a jornada delas |

---

## Onde o sistema ainda tem dívida

- Fixar/ocultar conversa vive no navegador, não no banco.
- Anexos anteriores à migração para o Storage continuam embutidos na
  mensagem.
- O Quadro de Equipe lista a rede toda para quem o abre; o filtro por loja é
  manual. Limitar por alçada é mudança de escopo de dado, não de permissão.
- A Preview da Vercel não tem as variáveis de ambiente.
