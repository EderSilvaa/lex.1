# Segurança e Privacidade — LEX

Estado **real** das proteções de privacidade no código atual. Este doc é honesto
sobre o que está plugado vs implementado-mas-desconectado. Para arquitetura geral
ver [CURRENT-ARCHITECTURE.md](CURRENT-ARCHITECTURE.md).

## Status atual (leia primeiro)

| Camada | Implementada | Plugada no caminho ativo |
|---|---|---|
| Criptografia em repouso | Sim | **Sim** — chaves de provider e sessões cifradas |
| Modelo local (Ollama) | Sim | **Sim** — disponível como provider (zero-leak opcional) |
| Redação de segredos (Hermes) | Sim | **Sim** — `redact_secrets` on por padrão (API keys/tokens) |
| Consent Gate (UI + storage) | Sim | **Parcial** — usuário configura nível, mas não é enforced no boundary LLM |
| Audit Log | Sim | **Parcial** — inicializado; principal escritor era o agent loop (removido) |
| **PII Vault** (masking jurídico) | Sim | **NÃO** — sem chamador vivo; integração morreu com o agent loop |

### Gap aberto (importante)

**PII jurídico (CPF, CNPJ, OAB, nomes de partes, valores) NÃO é mascarado hoje**,
em nenhum dos dois lados:

- **Desktop:** o PII Vault ([electron/privacy/pii-vault.ts](../electron/privacy/pii-vault.ts))
  está implementado mas órfão — `mask()`/`createVault()` não têm chamador vivo. O
  ponto de integração era o `think.ts`/`loop.ts` do agent loop, removidos no cleanup.
- **Hermes:** redige **segredos** (`redact_sensitive_text`, on por padrão), mas
  não PII jurídico. Existe `redact_pii` no config, porém default `False` e genérico
  (hash de user IDs, telefones) — não cobre CPF/OAB/partes/valores.

Consequência: quando o usuário manda algo pelo Console Lex, o texto vai cru ao
provider LLM. O mesmo vale para os caminhos Desktop que ainda usam `callAI`
(resumo de sessão, análise de documento, vision). Relevante para LGPD.

Re-plugar masking/consent no boundary atual (Hermes e/ou Desktop) é tarefa de
código pendente — não resolvida por este doc.

## Onde os dados vão hoje

```
Console Lex (usuário) → Hermes (WSL) → provider LLM        [sem masking de PII jurídico]
Desktop callAI (análise/sessão/vision) → provider LLM      [sem masking de PII jurídico]
Brain (gravação) → observer/privacy.ts sanitiza            [sanitização irreversível, ATIVA]
```

Nota: a sanitização do Brain ([electron/observer/privacy.ts](../electron/observer/privacy.ts),
`sanitizeInput`/`sanitizeOutputPreview`) é separada do PII Vault e **está ativa** —
mas é para o que é gravado no Brain, não para o que vai ao LLM.

## Camadas — projeto vs realidade

### PII Vault — implementado, NÃO plugado

Mascaramento reversível: substitui PII por tokens (`[PARTE_AUTORA_1]`, `[CPF_1]`)
antes de enviar ao LLM, e re-hidrata na volta. API completa em
[electron/privacy/pii-vault.ts](../electron/privacy/pii-vault.ts) (`createVault`,
`mask`, `unmask`, `maskObject`, `unmaskObject`, `clearVault`). **Sem chamador no
caminho atual.**

Patterns brasileiros que o vault detecta (referência — continua válida se
re-plugado):

```
cpf          \d{3}\.\d{3}\.\d{3}-\d{2}
cnpj         \d{2}\.\d{3}\.\d{3}/\d{4}-\d{2}
oab          OAB\s*[/]?\s*\d{3,6}\s*[/]?\s*[A-Z]{2}
email        [\w.%+-]+@[\w.-]+\.[A-Za-z]{2,}
telefone     \(?\d{2}\)?\s*\d{4,5}-?\d{4}
valor        R\$\s*[\d.,]+
processo_cnj \d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}
rg           \d{1,2}\.?\d{3}\.?\d{3}-?[\dxX]
```

Nomes de partes/magistrados: estratégia híbrida — entidades conhecidas vêm
estruturadas do PJe (`partes.autor`, `partes.reu`, juiz, advogados) e são 100%
confiáveis; nomes desconhecidos usam heurística (títulos "Dr.", "Juiz(a)", etc.).

### Consent Gate — UI/storage ativo, enforcement ausente

[electron/privacy/consent-manager.ts](../electron/privacy/consent-manager.ts),
inicializado em [main.ts](../electron/main.ts) (`initConsentManager`), exposto via
IPC `privacy-*`. Usuário escolhe e o app persiste o nível. **Mas o boundary LLM
não checa o nível antes de enviar** — [lex-engine.ts](../electron/lex-engine.ts)
não consulta `getEffectiveLevel`.

Níveis projetados (referência):

```
Nível 1  Anonimizado (padrão)  PII Vault ativo; LLM só vê tokens
Nível 2  Parcial               anonimiza CPF/CNPJ/email/telefone/valor; nomes mantidos
Nível 3  Completo (opt-in)     nenhuma anonimização; aviso explícito de risco
Nível 0  Local (Ollama)        nada sai da máquina
```

### Criptografia em repouso — ativo

Chaves de provider cifradas via [electron/crypto-store.ts](../electron/crypto-store.ts);
sessões e dados sensíveis via [electron/privacy/encrypted-storage.ts](../electron/privacy/encrypted-storage.ts).

### Modelo local (Ollama) — ativo

Provider opcional sem saída de dados da máquina. É o caminho de zero-leak real
disponível hoje (Nível 0).

### Audit Log — parcial

[main.ts](../electron/main.ts) chama `initAuditLog`/`flushAuditLog` e expõe
`getAuditSummary`. O escritor principal de eventos era o agent loop (removido), então
a cobertura de registro de envios hoje é parcial.

## Checklist LGPD (status real)

```
[x] Criptografia em repouso (chaves, sessões)
[x] Provider local (Ollama)
[~] Consent Manager (UI/storage ok; enforcement no boundary ausente)
[~] Audit log (init ok; cobertura parcial)
[ ] PII Vault plugado no caminho ativo          ← GAP
[ ] Masking de PII jurídico antes do LLM        ← GAP
[ ] Direito de exclusão (deletar todos os dados)
[ ] Direito de portabilidade (exportar)
[ ] Política de privacidade (documento visível)
[ ] Data retention automático
[ ] Base legal / aviso de privacidade no app
[ ] Registro de operações de tratamento
[ ] DPO / ponto de contato
[ ] Plano de notificação de incidentes
```

## Código relevante

- [electron/privacy/](../electron/privacy/) — pii-vault, consent-manager, encrypted-storage, audit
- [electron/observer/privacy.ts](../electron/observer/privacy.ts) — sanitização do Brain (ativa)
- [electron/crypto-store.ts](../electron/crypto-store.ts) — chaves cifradas
- [electron/lex-engine.ts](../electron/lex-engine.ts) — boundary Desktop→Hermes (onde o enforcement falta)
- `engine/lex-engine/agent/redact.py` — redação de segredos do Hermes (não PII jurídico)
