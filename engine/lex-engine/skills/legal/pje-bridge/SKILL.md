---
name: pje-bridge
description: "Bridge PJe and Windows-only legal automation through the Lex Electron app instead of controlling PJe directly from WSL/Linux."
version: 0.1.0
author: Lex
license: MIT
metadata:
  hermes:
    tags: [legal, pje, windows, bridge, electron, mcp]
    related_skills: [lex-legal-brief, native-mcp]
---

# PJe Bridge

Use this skill when the user asks Lex to consult, open, download, upload,
protocol, or navigate PJe. The engine runs in WSL2/Linux, but PJe, certificates,
browser state, and local Windows automation belong to the Lex Electron app.

## Principle

Do not try to control PJe directly from WSL. Route PJe actions through the local
Lex Windows bridge.

## When to Use

Use this skill for:

- Open a PJe process.
- Consult process movements.
- Download documents from PJe.
- Upload/protocol a petition.
- Check whether a user is logged in.
- Ask the Windows app for browser state, selected tribunal, or certificate
  status.

## Required Bridge Contract

The bridge should expose a local-only API or MCP server with tool calls like:

```json
{
  "tool": "pje.consultar_processo",
  "args": {
    "numero": "0000000-00.0000.0.00.0000",
    "tribunal": "trt"
  }
}
```

Until the bridge is implemented, report that the action is planned but not yet
executable.

## Safety Rules

- Ask confirmation before filing, signing, uploading, deleting, or changing
  process data.
- Never assume a deadline from memory; verify source data.
- Never expose certificate secrets or tokens to the LLM context.
- Prefer dry-run previews before irreversible actions.
- Keep an audit trail of tool calls and user confirmations.

## Response Pattern

When the bridge exists:

1. State the intended PJe action.
2. Call the bridge tool.
3. Summarize the observed result.
4. Suggest the next safe action.

When the bridge does not exist:

1. Say that the PJe bridge is not implemented yet.
2. Provide the exact bridge tool call that should be implemented.
3. Ask whether the user wants to continue manually or prioritize bridge work.
