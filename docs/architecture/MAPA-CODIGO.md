# Mapa do Código — LEX v4.0

> Referência técnica da arquitetura atual. Gerado em março de 2026.

---

## Visão Geral

LEX é um assistente jurídico agêntico para PJe construído como app Electron. O núcleo é um **Agent Loop** que itera Think → Critic → Act → Observe até resolver a intenção do usuário. O agente tem acesso a skills que controlam o browser (Stagehand v3), o sistema de arquivos (Node.js nativo) e o PC inteiro (Vision AI + nut-js).

```
Renderer (HTML/JS)
    │ IPC (contextBridge)
    ▼
Main Process (Electron)
    │
    ├─ Agent Loop ──► Think ──► Critic ──► Act ──► Observe ──► (loop)
    │                  │                    │
    │               callLLM              execute skill
    │              (streaming)
    │
    ├─ Skills
    │   ├─ PJe (browser via Stagehand)
    │   ├─ PC  (Vision AI + nut-js)
    │   └─ OS  (filesystem/shell)
    │
    └─ Serviços
        ├─ ai-handler.ts     (Anthropic API)
        ├─ crypto-store.ts   (AES-256-GCM)
        ├─ session.ts        (histórico em disco)
        └─ stagehand-manager.ts (Chrome externo)
```

---

## Ponto de Entrada: `electron/main.ts`

Responsabilidades:
- Cria a `BrowserWindow` e carrega `src/renderer/index.html`
- Registra todos os handlers IPC (`ipcMain.handle`, `ipcMain.on`)
- Lê/salva configurações via `electron-store`
- Inicializa e repassa chamadas ao módulo `agent/`
- Descriptografa API key do store antes de repassar ao `ai-handler`
- Faz `getSessionManager().flush()` no `before-quit`

**IPC handlers relevantes:**

| Canal | Direção | Descrição |
|-------|---------|-----------|
| `agent-chat-message` | renderer→main | Dispara o agent loop |
| `agent-event` | main→renderer | Eventos do loop (thinking, token, completed) |
| `store-get-anthropic-key` | renderer→main | Lê key descriptografada |
| `store-set-anthropic-key` | renderer→main | Salva key criptografada |
| `pje-status-check` | renderer→main | Verifica se Chrome está ativo |

---

## Agent Loop: `electron/agent/loop.ts`

Loop principal que itera até `estado.concluido = true` ou atingir `maxIteracoes`.

### Fases por iteração

```
1. THINK   → think(estado, config, onStreamToken)
             └─ callLLM → callAI → callAnthropic (SSE stream)
             └─ createRespostaExtractor → emite tokens só do campo "resposta"

2. CRITIC  → critica o plano do think (segunda chamada LLM)
             └─ valida coerência, detecta loops, ajusta se necessário

3. ACT     → parseia JSON do think → identifica skill a chamar
             └─ executor.executeSkill(skillName, params, context)

4. OBSERVE → atualiza estado com resultado da skill
             └─ decide se continua ou encerra
```

### Eventos emitidos (`agentEmitter`)

```typescript
{ type: 'streaming_start' }               // antes do think — UI cria bubble vazia
{ type: 'token', token: string }           // cada delta do campo "resposta"
{ type: 'thinking', pensamento, iteracao } // raciocínio interno
{ type: 'completed', resposta, runId }     // fim — UI finaliza bubble
{ type: 'error', message }
```

---

## Think + Streaming: `electron/agent/think.ts`

### `think(estado, config, onToken?)`
Constrói o system prompt com o contexto do agente (skills disponíveis, histórico, estado) e chama `callLLM`.

### `callLLM(system, user, config, onToken?)`
Chama `callAI()` com `onToken: createRespostaExtractor(onToken)`.

### `createRespostaExtractor(onToken)`
State machine que filtra o stream SSE de Claude:

```
Estados: SCANNING → IN_VALUE → DONE

SCANNING:  acumula buffer, aguarda "resposta"\s*:\s*"
IN_VALUE:  emite cada char recebido, processa escapes JSON (\n \t \" \\)
DONE:      encontrou " não-escapado que fecha o valor — para de emitir

Buffer window: últimos 40 chars (para detectar padrão cross-token)
```

Isso permite que o usuário veja o campo `resposta` do JSON sendo gerado em tempo real, sem ver o `pensamento` interno.

---

## AI Handler: `electron/ai-handler.ts`

### Interface principal

```typescript
interface CallAIOptions {
    system: string;
    user: string;
    temperature?: number;
    model?: string;
    maxTokens?: number;
    onToken?: (token: string) => void;   // streaming callback
}
```

### `callAnthropic(options, onToken?)`
- Chama `POST https://api.anthropic.com/v1/messages` com `stream: true`
- Lê SSE: para cada `content_block_delta` com `delta.text`, chama `onToken?.(delta)`
- Retorna `fullText` acumulado ao final (compatibilidade com callers não-streaming)

### `callAIWithVision(options)`
- Envia imagem base64 + prompt de texto para Claude
- Usado pelo `computer-manager.ts` no Vision loop

---

## Criptografia: `electron/crypto-store.ts`

**Algoritmo:** AES-256-GCM (autenticado, sem padding attack)

**Derivação de chave:** `scryptSync(hostname + "-" + username, 'lex-crypto-salt-v1', 32)`
- Sem segredo hardcoded no binário
- Vinculado à máquina — não funciona em outra máquina

**Formato armazenado:** `enc:v1:<ivHex>:<tagHex>:<encryptedHex>`

**API:**
```typescript
encryptApiKey(plaintext: string): string   // cifra
decryptApiKey(stored: string): string      // decifra, lança se inválido
isEncrypted(value: string): boolean        // detecta formato
safeDecrypt(stored: string): string        // fallback para legado plain text
```

**Migração automática:** `main.ts` detecta key plain text no store → re-salva criptografada na inicialização.

---

## Sessões: `electron/agent/session.ts`

### `SessionManager`

```typescript
class SessionManager {
    getOrCreate(sessionId?): ChatSession
    addMessage(sessionId, role, content, meta?): void
    getHistory(sessionId, limit?): ChatMessage[]
    formatHistoryForPrompt(sessionId, limit?): string
    flush(): Promise<void>   // salvar imediatamente (no quit)
}
```

**Persistência:**
- Arquivo: `%APPDATA%\lex-test1\sessions.json`
- Salva com debounce de 1s após cada `addMessage()`
- Carrega no construtor, filtra sessões > 30 dias
- Limite: 50 sessões armazenadas, 50 mensagens por sessão

---

## Browser Automation: `electron/stagehand-manager.ts`

Gerencia um Chrome externo via chrome-launcher + Stagehand v3.

**API pública:**
```typescript
initStagehand(): Promise<void>       // inicia Chrome (mutex: concurrent calls esperam)
ensureStagehand(): Promise<void>     // garante init; auto-recupera se falhou
getStagehand(): Stagehand            // retorna instance ou lança
runBrowserTask(instruction, maxSteps, onStep): Promise<string>
injectOverlay(text, done?): void     // overlay visual no Chrome
closeStagehand(): Promise<void>      // força kill
```

**Modelo Stagehand:** `anthropic/claude-sonnet-4-6`

---

## PC Automation: `electron/computer-manager.ts`

Controla o PC inteiro via loop de Vision AI.

### Screenshot
- PowerShell + `System.Drawing` + `System.Windows.Forms`
- Script `.ps1` em arquivo temp (evita escaping de quotes)
- Retorna: `{ buffer: Buffer, scaleX: number, scaleY: number }`
- Escala máx 1280px para economizar tokens

### Vision Loop: `runComputerTask(instrucao, maxSteps, onStep)`

```
1. takeScreenshot()
2. callAIWithVision(screenshot, instrucao)
   → Claude retorna JSON:
     { raciocinio, acao, x, y, texto, teclas, direcao, quantidade, concluido, resultado }
3. executeAction(decision, scaleX, scaleY)
   → nut-js: click, double_click, right_click, type, key, scroll
4. Se !concluido && passo < maxSteps → goto 1
```

**Coordenadas:** Claude vê imagem em 1280px → retorna x,y nessa escala → multiplicados por `scaleX/scaleY` para resolução real.

---

## Skills Registry: `electron/agent/executor.ts`

```typescript
registerSkill(skill: Skill): void
getSkill(nome: string): Skill | undefined
listSkills(): Skill[]
executeSkill(nome, params, context): Promise<SkillResult>
```

Todas as skills são registradas em `electron/agent/index.ts` via `initializeAgent()`.

---

## Skills Disponíveis

### PJe (`electron/skills/pje/`)

| Skill | Arquivo | Descrição |
|-------|---------|-----------|
| `pje_abrir` | `abrir.ts` | Navega para login do tribunal via `page.goto()` |
| `pje_agir` | `agir.ts` | Ação livre via `runBrowserTask()`, emite `🌐` |
| `pje_consultar` | `consultar.ts` | Consulta processo por número |
| `pje_movimentacoes` | `movimentacoes.ts` | Lista movimentações do processo |
| `pje_documentos` | `documentos.ts` | Acessa documentos anexados |

### PC (`electron/skills/pc/`)

| Skill | Arquivo | Descrição |
|-------|---------|-----------|
| `pc_agir` | `agir.ts` | Controla Windows via Vision loop, emite `🖥️` |

Caso especial: queries de observação ("o que está na tela?") → só screenshot + descrição, sem actions.

### OS (`electron/skills/os/`)

| Skill | Arquivo | Descrição |
|-------|---------|-----------|
| `os_listar` | `listar.ts` | Lista diretórios (aliases: downloads, desktop, documentos) |
| `os_arquivos` | `arquivos.ts` | ler/mover/copiar/deletar/buscar/info |
| `os_escrever` | `escrever.ts` | Cria arquivos e pastas |
| `os_sistema` | `sistema.ts` | Shell com HITL (`confirmado: true` obrigatório) |

### Camada base: `electron/tools/os-tools.ts`
Node.js puro (`fs`, `path`, `child_process`, `os`). Inclui blocklist de comandos perigosos.

---

## Renderer: `src/renderer/js/app.js`

Vanilla JS. Toda a lógica da UI está aqui (~1200 linhas).

**Fluxo de mensagem:**

```
User digita → sendMessage()
  → ipcRenderer.invoke('agent-chat-message', { message, sessionId })
  → escuta 'agent-event':
      streaming_start → createStreamingBubble() → currentStreamingMsg
      token           → currentStreamingMsg.querySelector('.stream-text').textContent += token
      thinking        → accordion de raciocínio (colapsado)
      completed       → finalizeStreamingBubble(fullText) → renderMarkdownSafe()
      error           → bubble de erro
```

**Funções principais:**

| Função | Descrição |
|--------|-----------|
| `createStreamingBubble()` | Cria `.message.ai.streaming` com `.stream-text` e cursor ▋ |
| `finalizeStreamingBubble(div, text)` | Remove `.streaming`, aplica Markdown |
| `renderMarkdownSafe(text)` | marked + DOMPurify |
| `addMessageToUI(role, content)` | Adiciona bubble estática |
| `createNewChat()` | Nova sessão UUID |
| `loadConversation(id)` | Restaura histórico da sidebar |

---

## Fluxo de API Key

```
Primeira configuração:
  User digita key → renderer
    → IPC: store-set-anthropic-key
    → main.ts: encryptApiKey(key) → store.set('anthropicApiKey', encrypted)

Uso:
  main.ts initStore():
    → key = store.get('anthropicApiKey')
    → if !isEncrypted(key): re-salva criptografado (migração)
    → safeDecrypt(key) → initAI({ apiKey: plain })

Proteção:
  - Arquivo: %APPDATA%\lex-test1\config.json
  - Valor: enc:v1:... (hex, nunca plain text pós-migração)
  - Chave criptográfica: derivada de hostname+username, não armazenada
```

---

## Arquivo de Sessões

**Localização:** `%APPDATA%\lex-test1\sessions.json`

**Estrutura:**
```json
{
  "uuid-da-sessao": {
    "id": "uuid",
    "messages": [
      { "role": "user", "content": "...", "timestamp": 1234567890 },
      { "role": "assistant", "content": "...", "timestamp": 1234567891, "skillsUsed": ["pje_agir"] }
    ],
    "createdAt": 1234567890,
    "updatedAt": 1234567891
  }
}
```

---

## Dependências Principais

| Pacote | Versão | Uso |
|--------|--------|-----|
| `electron` | ^28 | Shell desktop |
| `@browserbasehq/stagehand` | ^3 | Automação browser |
| `@nut-tree-fork/nut-js` | ^4 | Controle mouse/teclado |
| `electron-store` | ^8 | Persistência de config |
| `marked` | (bundled) | Renderização Markdown |
| `dompurify` | (bundled) | Sanitização HTML |

`node:crypto`, `fs`, `path`, `os`, `child_process` — apenas built-ins do Node.js.

---

## Convenções

- Todos os logs usam prefixo `[NomeModulo]` para filtragem no DevTools
- Skills retornam `SkillResult { sucesso, dados?, mensagem, erro? }`
- Eventos do agente emitidos via `agentEmitter` (EventEmitter singleton em `loop.ts`)
- Skills com efeitos destrutivos exigem `confirmado: true` nos params (HITL pattern)
- Paths usam `path.join()` — nunca concatenação de strings
