# Capacidades exclusivas do Desktop (preservadas para referência)

**Status:** backlog / referência. Capacidades que existiam no ecossistema de
skills/plugins do Electron e **não têm equivalente direto no Hermes**, removidas
na limpeza do ecossistema de skills (o cérebro que as chamava — agent loop — foi
removido antes). Registradas aqui para decisão futura de re-conexão via Hermes/MCP.

> O código real está preservado no histórico git, no commit **imediatamente
> anterior** ao commit "remove skills/plugins ecosystem". Para recuperar:
> `git log --oneline` → achar o commit de remoção → `git show <commit>^:<caminho>`.

## Por que foram removidas

O Hermes (cérebro atual) cobre nativamente quase tudo que as skills/plugins do
Electron faziam: mensageria (email/slack/telegram/whatsapp/discord via
`gateway/platforms/`), arquivos, browser, terminal, Google Workspace
(`skills/productivity/google-workspace`), criação de planilha/PDF (via
`code_execution_tool` rodando Python), e tem OAuth próprio (`mcp_oauth_manager`).
Manter as versões do Electron era duplicata desconectada. Ver
[../SECURITY-ARCHITECTURE.md](../SECURITY-ARCHITECTURE.md) e
[../CURRENT-ARCHITECTURE.md](../CURRENT-ARCHITECTURE.md).

## O que era exclusivo (sem equivalente claro no Hermes)

| Capacidade | O que fazia | Arquivos (no commit anterior à remoção) |
|---|---|---|
| **Controle de PC por visão** | Tirava screenshot, Vision AI analisava, executava mouse/teclado fora do browser (nut-js). "Abra o Word e digite X". | `electron/skills/pc/agir.ts`, `electron/computer-manager.ts` |
| **DocuSign** | Enviar/assinar envelopes, status, baixar assinado. | `electron/plugins/integrations/docusign/` |
| **Apify** | Rodar actors de scraping da Apify. | `electron/plugins/integrations/apify/` |
| **Zapier** | Disparar webhooks/zaps. | `electron/plugins/integrations/zapier/` |

## Como re-conectar no futuro (se decidir)

Mesma estratégia do PJe: expor a capacidade como tool via a ponte
`lex-desktop` (MCP) — `scripts/lex-desktop-mcp-server.mjs` → bridge HTTP →
backend RPC → módulo de execução. Aí o Hermes pode invocar. Sem isso, a
capacidade fica inerte (foi exatamente o que aconteceu quando o agent loop
saiu).

Antes de re-conectar, avaliar se vale vs deixar o Hermes resolver:
- **PC por visão:** genuíno gap do Hermes. Mas não é MVP (produto é PJe).
- **DocuSign/Apify/Zapier:** nicho. Avaliar se o Hermes não cobre via MCP de
  terceiros antes de reimplementar.

## Tudo o mais foi duplicata

O resto do ecossistema (skills os/browser/documentos/pesquisa, plugins
gmail/outlook/slack/whatsapp/teams/notion/trello/todoist/google*/dropbox/onedrive/
pdf/excel/screenshot/clipboard/desktop) era duplicata do que o Hermes já faz, e
não foi catalogado aqui — recuperável pelo git se necessário.
