# Até onde o Supabase aguenta este projeto

Escrito para o Elias, ao abrir o sistema para as 89 pessoas da rede.
O que está medido diz "medido"; o que é conta diz "estimado".

Para trocar estimativa por medição:
`supabase/medir-consumo.sql` — não altera nada.

---

## O retrato de hoje (medido, 28/09/2026)

| | |
|---|---|
| Pessoas ativas | 89 |
| Já bateram ponto | 8 |
| Marcações de ponto | 314 |
| Apurações | 65 |
| Conversas | 55 |
| Mensagens | 90 |
| Publicações | 1 |

**8 de 89.** Tudo o que está abaixo é o efeito de multiplicar por onze.

---

## Os quatro limites que importam aqui

O Supabase cobra por quatro coisas diferentes, e este projeto bate em
cada uma por um motivo próprio.

| Limite | Gratuito | Pro (US$ 25/mês) | O que consome aqui |
|---|---|---|---|
| Banco (Postgres) | 500 MB | 8 GB | Ponto, mensagens, **fotos de perfil** |
| Storage (arquivos) | 1 GB | 100 GB | Anexo de conversa, atestado, imagem de publicação |
| Tráfego de saída | 5 GB/mês | 250 GB/mês | **Toda sincronização** |
| Usuários ativos | 50.000 | 100.000 | 89 — nunca será problema |

O quarto nunca aperta. Os três primeiros apertam em ordem diferente da
que se imagina, e o terceiro é o que aperta primeiro.

---

## 1. O banco: o ponto cresce para sempre

Marcação de ponto é documento trabalhista e **não se apaga**. É regra da
casa e é o certo — então esta linha da conta só sobe.

Medido: uma marcação ocupa cerca de **260 bytes** em JSON. No Postgres,
com índice, fica em torno de 400 bytes.

Estimado, a 89 pessoas × 4 batidas × 22 dias úteis:

| | marcações | no banco |
|---|---|---|
| 1 mês | 7.832 | ~3 MB |
| 1 ano | 94.000 | ~38 MB |
| 5 anos | 470.000 | ~190 MB |

**Cinco anos de ponto cabem no plano gratuito.** Esta não é a
preocupação.

Mensagem é outra história, mas ela tem retenção: o sistema apaga o mês
mais antigo a cada três meses, e o histórico fica limitado por
`mesesHistoricoConversas`. Isso mantém o tamanho estável em vez de
crescente.

---

## 2. A foto de perfil: a linha de conta que não se vê

**A foto não está no Storage.** Ela é gravada como texto dentro da
coluna `colaboradores.foto`, em base64 — um JPEG de 400px que o
navegador converte em letras.

Isso tem três consequências, e a terceira é a que morde:

1. Ela conta no limite do **banco**, não no do Storage.
2. Ela não tem cache de navegador: não é um endereço, é conteúdo.
3. **Ela viaja inteira a cada sincronização de colaboradores.**

Estimado: uma foto de 400px a 85% de qualidade dá 25–45 KB, e o base64
acrescenta 33%. Com as 89 pessoas usando foto própria, a tabela
`colaboradores` passa de alguns KB para **3 a 5 MB**.

E `sincronizarColaboradores` baixa a tabela inteira. Toda vez.

> A consulta 2 de `medir-consumo.sql` dá o número exato: quantas pessoas
> já trocaram a foto, o peso médio de cada uma e quanto uma
> sincronização baixa hoje.

---

## 3. O tráfego: é aqui que aperta primeiro

O limite de saída do plano gratuito é **5 GB por mês**. Parece muito.

O que consome:

**A sincronização de colaboradores.** Ela roda ao entrar, e de novo a
cada alteração em QUALQUER ficha — o canal de tempo real avisa todos os
aparelhos, e cada um rebaixa as 89 fichas com as fotos dentro.

Estimado, com as fotos em 4 MB e cada pessoa entrando duas vezes por
dia:

```
89 pessoas × 2 entradas × 4 MB × 22 dias = 15,7 GB/mês
```

**Três vezes o limite do plano gratuito**, só para mostrar as caras na
lista de conversas. E isso sem contar as sincronizações disparadas por
alteração de ficha, que multiplicam o número.

**A sincronização de ponto** já foi resolvida: ela baixava tudo e agora
baixa uma janela de dois meses. A conta que motivou está em
`src/servicos/nuvem.ts`.

---

## Então: dá para abrir?

**Dá.** Com 8 pessoas nada disso aperta, e a passagem para 89 não é de
um dia para o outro — as pessoas entram, batem o primeiro ponto, trocam
a primeira foto ao longo de semanas.

O que muda é que passa a haver um relógio correndo. Na ordem em que os
limites chegam:

| Quando | O que acontece | O conserto |
|---|---|---|
| ~~Ao trocarem as fotos~~ | ~~Tráfego dispara~~ | **Feito em 28/09/2026** |
| ~3 meses | Banco passa de 500 MB? Não. Segue folgado | — |
| ~5 anos | Banco perto do limite gratuito | Plano Pro |

A primeira linha era a única com prazo curto, e saiu: a foto foi para o
Storage antes de as 89 pessoas começarem a trocar as delas. O que sobra
não tem prazo de semanas.

---

## A foto: consertada em 28/09/2026

A foto FOI para o **Storage**, como os anexos de conversa já iam, e a
coluna passou a guardar só o caminho (`perfil/<id>/<hora>.jpg`). Isso
mudou três coisas de uma vez:

- sai do limite do banco e entra no de Storage, que é 200× maior no Pro
- vira endereço, então o navegador **guarda em cache** e não rebaixa
- a sincronização de colaboradores volta a ser alguns KB

O sistema já sabe fazer isso: `enviarAnexo` e `abrirDocumento`, em
`src/servicos/anexos.ts`, são exatamente esse caminho, usados pelo chat
e pelos documentos de ausência.

O base64 antigo CONTINUA funcionando: quem já tinha foto não perde
nada, e ela sai da coluna sozinha quando a pessoa trocar.

**E MEDIDO no dia do conserto: ZERO fotos em base64.** Ninguém tinha
trocado a foto ainda — as 89 usavam o logo. A projeção de 15,7 GB era
de um cenário que não havia começado, e o conserto chegou antes da
primeira foto. Não houve nada a migrar, e o caminho do base64 existe
como rede de segurança que provavelmente nunca será usada.

Isso não foi sorte de escolher a hora: foi o conferidor de consumo
perguntando ao banco em vez de eu deduzir. A pergunta que revelou o
problema — "quanto pesa uma foto?" — é a mesma que mostrou que ele
ainda não existia.

A tradução acontece num lugar só — na fronteira com o banco, em
`paraColaborador`. As vinte e tantas telas que leem `colaborador.foto`
não mudaram nenhuma linha: o que sai de lá é sempre um endereço que o
`<img>` abre.

---

## O que não é limite

- **89 usuários.** O limite gratuito é 50.000.
- **Número de requisições.** O Supabase não cobra por chamada; cobra
  pelo que trafega.
- **Conexões simultâneas.** O PostgREST usa um pool; 89 aparelhos
  fazendo chamadas HTTP não são 89 conexões de banco.
- **Tempo real.** O plano gratuito dá 200 conexões simultâneas e 2
  milhões de mensagens por mês. Com 89 aparelhos e os canais atuais,
  sobra.

---

## O que medir antes de decidir qualquer coisa

`supabase/medir-consumo.sql`, quatro consultas, nenhuma altera nada:

1. tamanho de cada tabela, com índices
2. **a foto de perfil** — quantas, quanto pesa cada uma, quanto uma
   sincronização baixa
3. os arquivos no Storage
4. o crescimento mês a mês do que já existe

A consulta 2 é a que decide se a foto vira prioridade ou se pode
esperar.
