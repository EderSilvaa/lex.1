# Lex Windows Bridge Contract

This contract describes the first bridge between Lex Agent Engine running in
WSL2/Linux and the Lex Electron app running on Windows.

## Principle

Hermes-derived engine code plans, remembers, reasons, and calls tools. The
Windows app executes Windows-sensitive actions: PJe, browser automation,
certificate handling, local files, notifications, and user confirmations.

## Transport

Start with localhost HTTP or MCP. Keep the API local-only.

Minimum security:

- Bind to `127.0.0.1`.
- Require a per-install shared token.
- Log every tool call.
- Support dry-run mode.
- Require confirmation for irreversible actions.

## Minimal Endpoints

```http
GET /health
POST /tools/list
POST /tools/call
```

Example call:

```json
{
  "tool": "pje.consultar_processo",
  "args": {
    "numero": "0000000-00.0000.0.00.0000",
    "tribunal": "trt"
  },
  "run_id": "lex-run-id",
  "dry_run": false
}
```

Example response:

```json
{
  "ok": true,
  "tool": "pje.consultar_processo",
  "result": {
    "status": "stub",
    "message": "Bridge contract only; implementation pending."
  }
}
```

## First Tool Names

- `pje.consultar_processo`
- `pje.abrir_processo`
- `pje.baixar_documentos`
- `pje.protocolar_peticao`
- `documento.analisar`
- `documento.gerar_peticao`
- `jurisprudencia.buscar`
- `os.listar`
- `os.buscar`
- `os.mover`

## Safety

The engine should never bypass the Windows app for:

- PJe filings.
- Certificate/A3 prompts.
- Payments.
- Deadline-altering actions.
- Data deletion.
- Bulk file changes.
