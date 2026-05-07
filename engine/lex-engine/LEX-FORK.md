# Lex Agent Engine Fork Notes

## Decision

Lex Agent Engine uses Hermes Agent as the base engine and adds a Brazilian legal
product layer. Hermes remains the upstream technical base; Lex is the product
name, legal workflow, Windows integration, PJe bridge, and commercial packaging.

## Boundaries

- Keep Hermes engine code recognizable and attribution-safe.
- Do not remove `LICENSE` or `THIRD-PARTY-NOTICES.md`.
- Do not imply Lex is an official Nous Research or Hermes product.
- Avoid native Windows port work at this stage.
- Run the engine in WSL2 on Windows and expose Lex/Windows capabilities through
  a local bridge.

## Target Runtime

```text
Windows
  Lex Electron app
  PJe/browser/certificate handling
  Windows filesystem and local legal tools

WSL2/Linux
  Lex Agent Engine
  Hermes-derived agent loop, memory, skills, gateway, scheduler

Local bridge
  localhost API, RPC, or MCP
  Lex tools exposed to the agent with confirmation and audit
```

## First Migration Targets

1. Legal drafting and analysis skills.
2. PJe bridge tools that call the existing Lex/Electron automation layer.
3. Document generation and template reuse.
4. Research/jurisprudence tools.
5. Privacy, PII masking, and action audit.
6. Windows/WSL2 installer and health checks.

## Non-Goals For The First Fork

- Rename every Hermes package/module.
- Port Hermes to native Windows.
- Make WSL control certificates, PJe, or Windows browser sessions directly.
- Remove upstream credits.
- Rebuild the agent loop from scratch.

## Validation Spike

The fork is viable when these three user-visible flows work:

1. Ask Lex to analyze a legal fact pattern and return a structured brief.
2. Ask Lex to call a local bridge stub for a PJe/process action.
3. Start the engine in WSL2 and connect from the Windows Electron app over a
   localhost bridge.
