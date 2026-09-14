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

**Painel de RH** (setor `RH` e Administrador nível 4): espelho de ponto por
colaborador, saldo do período e acumulado, correção de marcações com
justificativa obrigatória e autoria registrada na auditoria, exportação em CSV e
geração/impressão dos QRs das lojas.

Se um cartaz for fotografado ou copiado, o RH gera um código novo para a loja e o
anterior deixa de funcionar imediatamente.
