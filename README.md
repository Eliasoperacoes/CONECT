# CONECTA

Comunicador interno da **Malachias Autopeças** — conversas individuais, canais por loja,
comunicados da direção, quadro de funcionários, rádio ao vivo (push‑to‑talk) e painel
administrativo.

Versão atual: **v1.0.B**

## Rede atendida

| Loja | Tipo |
|---|---|
| Pirassununga | Matriz |
| Porto Ferreira | Filial |
| Palmeiras | Filial |
| Descalvado | Filial |
| Santa Rita | Filial |

## Stack

React 19 · TypeScript (strict) · Vite 6 · Tailwind CSS 4 · lucide-react · SheetJS (xlsx)

Todo o código — arquivos, funções e variáveis — está em português do Brasil.

## Rodando localmente

Requisitos: Node.js 18 ou superior.

```bash
npm install
npm run dev     # http://localhost:3000
```

Outros comandos:

```bash
npm run lint     # checagem de tipos (tsc --noEmit)
npm run build    # checagem de tipos + build de produção em dist/
npm run preview  # serve o build de produção
```

Não é necessária nenhuma variável de ambiente.

## Acesso

A conta mestre de administrador (nível 4) é criada na primeira execução:

```
login: Elias
senha: 123
```

Troque essa senha pelo Painel Administrativo antes de colocar em uso.

Depois do primeiro login, cada aparelho passa a sugerir a última conta usada
nele, permitindo entrar com um clique.

## Hierarquia de acesso

| Nível | Perfil | Alcance |
|---|---|---|
| 1 | Operador | Conversas e canais da própria loja |
| 2 | Supervisor | Publica comunicados |
| 3 | Gestor | Canais de todas as lojas; remove comunicados |
| 4 | Administrador (TI) | Painel completo, cadastro de pessoas, backup |

Cada colaborador vê apenas as conversas de que participa e os canais da própria
loja. Contadores de não lidas, confirmação de leitura e dispensa de avisos são
individuais por pessoa.

## Estrutura

```
src/
  tipos.ts                 Modelo de dados central
  servicos/
    bancoDados.ts          Persistência, autenticação, permissões e auditoria
    audioRadio.ts          Rádio push-to-talk (Web Audio + BroadcastChannel)
    planilhaFuncionarios.ts  Importação/modelo de planilha de funcionários
    tema.ts                Preferência de tema (claro/escuro/automático)
  componentes/             Telas e modais
```

## Implantação (Vercel)

O projeto é estático. A [vercel.json](vercel.json) já define o build (`dist/`) e o
rewrite de SPA; nenhuma configuração adicional é necessária.

## Limitações conhecidas

Os dados ficam no `localStorage` do navegador e o rádio usa `BroadcastChannel`.
Na prática isso significa que **cada navegador é uma instalação isolada**: mensagens
enviadas em um aparelho não chegam a outro. Para operação real entre as cinco lojas
é necessário um backend com banco de dados e transporte em tempo real.

## Banco de horas e registro de ponto

Cada loja tem um **QR de ponto** gerado pelo sistema, impresso pelo painel de RH
e afixado na entrada. O funcionário abre a aba **Ponto**, toca no botão único e
aponta a câmera para o QR — o sistema decide sozinho qual das quatro marcações do
dia está sendo batida (entrada, saída para almoço, retorno, saída). Se a câmera
falhar, o mesmo modal aceita o código de 6 caracteres impresso no cartaz.

O saldo é calculado contra a jornada diária cadastrada para cada pessoa
(padrão 8h; sábados e domingos não geram jornada prevista).

**Aba RH** (setor `RH`, Administrador e gestores nível 3+): espelho de ponto por
colaborador, saldo do período e acumulado, correção de marcações com
justificativa obrigatória e autoria registrada na auditoria, exportação em CSV e
geração/impressão dos QRs das lojas.

Se um cartaz for fotografado ou copiado, o RH gera um código novo para a loja e o
anterior deixa de funcionar imediatamente.

## Banco de dados na nuvem (Supabase)

O sistema roda em dois modos. **Sem** as variáveis de ambiente configuradas,
tudo é guardado no navegador — cada aparelho é uma instalação isolada, bom para
testar. **Com** as variáveis, os dados passam a viver no banco e as cinco lojas
enxergam a mesma informação. O indicador no topo da tela mostra em qual modo o
sistema está: **Local** (âmbar) ou **Rede** (verde).

### Configurando

1. Crie um projeto em [supabase.com](https://supabase.com) (o plano gratuito
   atende com folga o tamanho da rede).
2. Abra **SQL Editor → New query**, cole o conteúdo de
   [supabase/esquema.sql](supabase/esquema.sql) e execute. Isso cria as tabelas,
   as regras de acesso e o tempo real. O arquivo pode ser rodado novamente sem
   quebrar nada.
3. Em **Settings → API**, copie a *Project URL* e a chave *anon public*.
4. Crie um arquivo `.env` na raiz do projeto (veja
   [.env.example](.env.example)):

   ```
   VITE_SUPABASE_URL="https://seu-projeto.supabase.co"
   VITE_SUPABASE_ANON_KEY="sua-chave-anon"
   ```

5. Na Vercel, cadastre as mesmas duas variáveis em
   **Settings → Environment Variables** e refaça o deploy.

A chave *anon* é pública por natureza — ela vai para o navegador. Quem protege
os dados são as regras de acesso (RLS) definidas no esquema, que repetem no
banco as mesmas permissões que existem na tela. Nunca use a chave *service_role*
no aplicativo.

### Como o acesso é protegido no banco

As regras não confiam na interface: mesmo que alguém chame a API diretamente,

- conversas e mensagens só são lidas por quem participa delas;
- ninguém envia mensagem no nome de outra pessoa;
- cada um apaga as próprias mensagens; o Administrador apaga qualquer uma;
- o ponto é batido pelo próprio colaborador, e só RH e Administrador corrigem;
- nível hierárquico e credenciais continuam exclusivos do Administrador;
- a auditoria aceita novos registros, mas não permite alterar nem apagar os
  existentes.

### Desligue a confirmação por e-mail

No painel do Supabase, em **Authentication → Sign In / Providers → Email**,
desligue **Confirm email**.

Os logins do CONECTA usam um domínio interno e fictício (`@conecta.malachias.local`),
que existe apenas para atender à exigência de e-mail da autenticação. Nenhuma
mensagem chegaria a esse endereço. Com a confirmação ligada, a ativação do
acesso trava e o Supabase ainda bate no limite de envio de e-mails.
