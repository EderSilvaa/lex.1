# Re-plugar masking de PII e enforcement de consent no boundary LLM

**Status:** backlog (gap aberto, não iniciado).
**Origem:** descoberto durante o cleanup do agent loop (2026-05). Detalhe em
[../SECURITY-ARCHITECTURE.md](../SECURITY-ARCHITECTURE.md).

## Problema

PII jurídico (CPF, CNPJ, OAB, nomes de partes, valores monetários) **não é
mascarado hoje** antes de ir ao provider LLM. As proteções existem no código mas
estão desconectadas do caminho atual:

- **PII Vault** ([../../electron/privacy/pii-vault.ts](../../electron/privacy/pii-vault.ts))
  está implementado (`mask`, `unmask`, `maskObject`, patterns BR completos) mas
  **não tem chamador vivo**. O ponto de integração era `think.ts`/`loop.ts` do
  agent loop, removidos no cleanup.
- **Consent Gate** ([../../electron/privacy/consent-manager.ts](../../electron/privacy/consent-manager.ts))
  é configurável na UI e persiste o nível escolhido, mas o boundary LLM não checa:
  [../../electron/lex-engine.ts](../../electron/lex-engine.ts) não consulta
  `getEffectiveLevel` antes de mandar o prompt pro Hermes.
- **Hermes** redige segredos (`agent/redact.py`, `redact_secrets` on por padrão),
  mas não PII jurídico. O config `redact_pii` é default `False` e, mesmo ligado, é
  genérico (hash de user IDs, strip de telefones) — não cobre CPF/OAB/partes/valores.

Resultado: pelo Console Lex (caminho principal) e pelos caminhos Desktop que ainda
usam `callAI` (resumo de sessão, análise de documento, vision), o texto vai cru ao
provider. Relevante para LGPD.

## Boundaries que precisam de proteção

1. **Desktop → Hermes** ([lex-engine.ts](../../electron/lex-engine.ts), `askLexEngine`
   e o spawn do Console Lex). O prompt do usuário cruza aqui rumo ao Hermes/WSL.
2. **Desktop → LLM direto** (`callAI` em [ai-handler.ts](../../electron/ai-handler.ts)),
   usado por session summary, document-analyzer e vision.
3. **Hermes → LLM** (lado Python). Se a Lex decidir que o masking deve viver no
   Engine, é aqui — exigiria implementar PII jurídico BR no `redact.py` ou
   equivalente.

## Decisões em aberto

- **Onde mascarar?** No Desktop antes de cruzar pro Hermes (re-plugar o PII Vault
  no boundary), no Hermes (implementar PII jurídico no lado Python), ou nos dois?
- **Como re-hidratar?** O vault é reversível por design (token → valor real). Se o
  masking é no Desktop e a resposta volta pelo Hermes, precisa de um ponto de
  unmask no caminho de volta. O Console Lex (terminal interativo) complica isso —
  a resposta vai direto pro terminal, sem passar por um unmask do Desktop.
- **Enforcement de consent:** Nível 1 (anonimizado) deveria bloquear envio sem
  masking; Nível 3 (completo) libera; Nível 0 (Ollama) nem sai da máquina. Onde
  checar o nível? Provavelmente no mesmo boundary onde o masking entrar.
- **Caminho interativo (Console Lex):** o terminal spawna o Hermes direto. Masking
  transparente nesse fluxo é difícil — talvez exija o Engine cooperar, ou aceitar
  que o modo Console é "Nível 3 implícito" e documentar isso.

## Aceite

- [ ] PII jurídico mascarado antes de qualquer chamada LLM no caminho principal
- [ ] Nível de consent enforced no boundary (não só configurável na UI)
- [ ] Re-hidratação correta na resposta (quando aplicável)
- [ ] Comportamento do Console Lex definido e documentado
- [ ] Audit log registrando envios no caminho atual
- [ ] SECURITY-ARCHITECTURE atualizado quando o gap fechar

## Referências de código

- [../../electron/privacy/pii-vault.ts](../../electron/privacy/pii-vault.ts) — masking reversível (órfão)
- [../../electron/privacy/consent-manager.ts](../../electron/privacy/consent-manager.ts) — níveis de consent
- [../../electron/lex-engine.ts](../../electron/lex-engine.ts) — boundary Desktop→Hermes
- [../../electron/ai-handler.ts](../../electron/ai-handler.ts) — `callAI` (boundary Desktop→LLM)
- [../../electron/observer/privacy.ts](../../electron/observer/privacy.ts) — sanitização do Brain (já ativa, modelo de referência)
- `engine/lex-engine/agent/redact.py` — redação de segredos do Hermes
