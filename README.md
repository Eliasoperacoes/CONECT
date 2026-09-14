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
