# Arquitetura LEX — Assistente Jurídico Agêntico

## Visão Geral

LEX é um sistema de agente de IA para automação de processos jurídicos no PJe (Processo Judicial Eletrônico). Roda como aplicação **Electron** com:

- **Agente LLM** (Claude Sonnet) no processo principal — raciocínio jurídico
- **Stagehand v3** com Chrome externo visível — automação de browser (Claude Haiku)
- **Interface de chat** no renderer

```
┌─────────────────────────────────────────────────────┐
│                  Processo Main (Electron)             │
│                                                       │
│  ┌─────────────────┐    ┌────────────────────────┐   │
│  │  Agent Loop      │    │  Stagehand Manager     │   │
│  │  (loop.ts)       │    │  (stagehand-manager.ts)│   │
│  │                  │    │                        │   │
│  │  Think (Sonnet)  │───►│  runBrowserTask()      │   │
│  │  Critic          │    │  (Haiku agent)         │   │
│  │  Act             │    │                        │   │
│  │  Observe         │    └──────────┬─────────────┘   │
│  └────────┬─────────┘               │ CDP             │
│           │ IPC (preload.ts)        │                 │
└───────────┼─────────────────────────┼─────────────────┘
            │                         │
┌───────────▼─────────┐   ┌───────────▼──────────────┐
│  Renderer            │   │  Chrome (visível)         │
│  Chat UI · Thinking  │   │  PJe, TRT, SIGPJF, ...   │
│  accordion           │   │  Overlay de status        │
└─────────────────────┘   └──────────────────────────┘
```

---

## Estrutura de Arquivos

```
lex-test1/
├── electron/
│   ├── main.ts                   # Processo principal Electron
│   ├── preload.ts                # Bridge IPC renderer ↔ main
│   ├── stagehand-manager.ts      # Singleton Stagehand + Chrome
│   │
│   ├── agent/
│   │   ├── loop.ts               # Loop principal do agente
│   │   ├── think.ts              # Módulo de raciocínio (Claude Sonnet)
│   │   ├── critic.ts             # Camada de validação/segurança
│   │   ├── executor.ts           # Registro e execução de skills
│   │   ├── index.ts              # Exports e inicialização
│   │   ├── memory.ts             # Memória persistente do agente
│   │   ├── session.ts            # Gerenciamento de sessões multi-turn
│   │   └── cache.ts              # Cache de respostas LLM
│   │
│   ├── pje/
│   │   └── tribunal-urls.ts      # URLs e rotas por tribunal
│   │
│   └── skills/pje/
│       ├── index.ts              # Registro de skills
│       ├── abrir.ts              # pje_abrir — abre PJe no Chrome
│       ├── agir.ts               # pje_agir — ação genérica no browser
│       ├── navegar.ts            # pje_navegar — navega menus
│       ├── consultar.ts          # pje_consultar — consulta processo
│       ├── preencher.ts          # pje_preencher — preenche forms
│       ├── movimentacoes.ts      # pje_movimentacoes — lista movimentações
│       └── documentos.ts         # pje_documentos — lista documentos
│
├── src/renderer/
│   ├── index.html                # UI principal
│   └── js/app.js                 # Lógica da interface de chat
│
├── scripts/
│   └── launch-electron.js        # Launcher (remove ELECTRON_RUN_AS_NODE)
│
├── dist-electron/                # Compilado TypeScript
└── package.json
```

---

## Agent Loop

O núcleo do sistema. Implementa o padrão **Think → Critic → Act → Observe**.

```
runAgentLoop(objetivo, config, tenantConfig, sessionId)
        │
        ▼
  ┌─── THINK ───────────────────────────────────────┐
  │  think.ts — Claude Sonnet                        │
  │  • Monta prompt com skills + contexto + memória  │
  │  • Retorna ThinkDecision:                        │
  │    { tipo: 'skill'|'resposta'|'pergunta',        │
  │      skill, parametros, pensamento }             │
  └─────────────────────────────────────────────────┘
        │
        ▼
  ┌─── CRITIC ──────────────────────────────────────┐
  │  critic.ts                                       │
  │  • Heurísticas rápidas (sem LLM):                │
  │    - Keywords de alto risco: "protocolar",        │
  │      "enviar", "assinar", "finalizar", "excluir" │
  │  • LLM Critic apenas para skills de escrita      │
  │  • Skills read-only pulam o LLM critic           │
  └─────────────────────────────────────────────────┘
        │
        ▼
  ┌─── ACT ─────────────────────────────────────────┐
  │  executor.ts                                     │
  │  • executeSkill(nome, parametros, context)       │
  │  • Skills PJe chamam runBrowserTask() →          │
  │    Stagehand agent (Claude Haiku) executa        │
  └─────────────────────────────────────────────────┘
        │
        ▼
  ┌─── OBSERVE ─────────────────────────────────────┐
  │  • Atualiza AgentState com resultado             │
  │  • Persiste na memória                           │
  │  • Emite eventos para a UI via agentEmitter      │
  └─────────────────────────────────────────────────┘
        │
        ├─ tipo === 'resposta' → resposta final ao usuário
        ├─ tipo === 'pergunta' → aguarda input do usuário
        └─ tipo === 'skill'   → volta ao THINK (próxima iteração)
```

---

## Stagehand Manager

Singleton que gerencia Chrome externo via Stagehand v3.

```typescript
// electron/stagehand-manager.ts

initStagehand()          // sobe Chrome junto com o app (mutex — evita duplo init)
ensureStagehand()        // auto-recupera se o init em background falhou
getStagehand()           // retorna instância ou lança erro
closeStagehand()         // mata Chrome via PID + fecha Stagehand

runBrowserTask(
  instruction: string,   // instrução em linguagem natural
  maxSteps = 20,         // limite de passos do agent
  onStep?: callback      // progresso em tempo real
): Promise<string>

injectOverlay(text, done?)  // injeta status visual no Chrome via page.evaluate()
```

### Ciclo de vida do Chrome

```
app.whenReady()
  └── initStagehand()
        ├── killPreviousChrome()   // mata PID salvo em chrome-profile/chrome.pid
        ├── new Stagehand({ keepAlive: true, ... })
        └── sh.init()             // sobe Chrome visível com perfil persistente

Skills → ensureStagehand() → runBrowserTask()
  └── stagehand.agent({ model: 'haiku' })
        └── agent.execute({ instruction, maxSteps, onStepFinish })
              ├── screenshot → decide ação → executa → repete
              └── injectOverlay() a cada passo (overlay no Chrome)

app.before-quit → closeStagehand()
  └── state.chrome.kill() + instance.close()
```

### Overlay Visual no Chrome

Injeta um `<div id="__lex_overlay__">` fixo no canto superior direito do Chrome a cada passo do agent, mostrando a ação atual em tempo real.

- Estado normal: `⚡ Navegando para PJe...` (azul)
- Concluído: `✓ PJe aberto` (verde, auto-remove em 2.5s)
- `pointer-events: none` — não interfere na automação

### Modelos por camada

| Camada | Modelo | Motivo |
|--------|--------|--------|
| LEX Agent (think.ts) | Claude Sonnet 4.6 | Raciocínio jurídico complexo |
| Stagehand browser agent | Claude Haiku 4.5 | Automação visual — ~80% mais barato |

---

## Skills PJe

### Interface

```typescript
interface Skill {
  nome: string;
  descricao: string;
  categoria: string;
  parametros: Record<string, ParamConfig>;
  retorno: string;
  exemplos: string[];
  execute(params, context): Promise<SkillResult>;
}
```

### pje_abrir

Abre o PJe no Chrome externo (Stagehand).

```
Parâmetros: tribunal? (default: TRT8)
Comportamento:
  1. ensureStagehand() — auto-recupera se necessário
  2. Verifica URL atual — reutiliza sessão se já no mesmo tribunal
  3. page.goto(loginUrl) — navegação direta via CDP
  4. injectOverlay("Aguardando login com certificado")
  5. Retorna aguardandoLogin: true — HITL: usuário autentica
Retorna: { url, tribunal, aguardandoLogin }
```

### pje_agir

Ação genérica — passa instrução em linguagem natural ao Stagehand agent.

```
Parâmetros: objetivo (string), tribunal?
Comportamento:
  runBrowserTask(objetivo, maxSteps=15)
  → Stagehand Haiku decide e executa autonomamente
Retorna: resultado em texto do agent
```

### pje_consultar / pje_movimentacoes / pje_documentos / pje_navegar / pje_preencher

Todas delegam para `runBrowserTask()` com instrução contextualizada em português.

---

## Tribunais Suportados

```typescript
// tribunal-urls.ts
const ROUTES = {
  TJPA: {
    loginUrl: 'https://pje.tjpa.jus.br/pje/login.seam',
    consultaUrl: 'https://pje.tjpa.jus.br/pje/Processo/ConsultaProcesso/listView.seam',
  },
  TRT8: {
    loginUrl: 'https://pje.trt8.jus.br/primeirograu/login.seam',
    consultaUrl: 'https://pje.trt8.jus.br/pjekz/consulta-publica',
    pages: {
      painel: 'https://pje.trt8.jus.br/pjekz/painel/usuario-externo',
      peticionamento: 'https://pje.trt8.jus.br/pjekz/processo/cadastro'
    }
  },
  TRF1: { loginUrl: 'https://pje1g.trf1.jus.br/pje/login.seam' },
  // ...
}
```

Resolução: aceita `"TRT8"`, `"trt 8"`, `"trt8.jus.br"`, URL completa.

---

## Memória e Persistência

| Módulo | Arquivo | Conteúdo |
|--------|---------|----------|
| Memory | `userData/lex-memory.json` | processosRecentes, aprendizados, preferencias, histórico |
| Sessions | `userData/sessions/{id}.json` | Histórico multi-turn por sessão |
| Chrome profile | `userData/chrome-profile/` | Login salvo (cookies, sessão PJe) |
| Config | `AppData/Roaming/lex-extension/config.json` | anthropicKey, workspaces, supabaseUrl |
| Cache | in-memory | Respostas LLM para objetivos idênticos |

---

## IPC Bridge (preload.ts)

APIs expostas ao renderer via `contextBridge`:

```typescript
// Agent
lexApi.runAgent(objetivo, config, sessionId)
lexApi.cancelAgent()
lexApi.onAgentEvent(callback)   // stream de eventos do loop

// Arquivos
filesApi.selectFolder()
filesApi.listFiles(path)
filesApi.readFile(path)
filesApi.writeFile(path, content)

// Workspaces
workspacesApi.get()
workspacesApi.add(path)
workspacesApi.remove(path)
```

---

## UI (Renderer)

`src/renderer/js/app.js` — JavaScript puro, sem compilação.

```
Mensagem do usuário
      │
      ▼
lexApi.runAgent(objetivo, config, sessionId)
      │
      ▼ stream de eventos IPC
agent-event: started    → showStopBtn(), inicia accordion de thinking
agent-event: thinking   → updateAgentThinking() — mostra raciocínio
agent-event: step       → adiciona linha de log no accordion
agent-event: response   → renderiza resposta + quick replies
agent-event: error      → showAgentError() — log vermelho + mensagem no chat
agent-event: done       → hideStopBtn(), completeAgentSession()

Chrome overlay (paralelo, via Stagehand):
  ⚡ Navegando para PJe TRT8...
  ⚡ Clicando em Consulta Pública...
  ✓ Processo encontrado
```

---

## Build e Launch

### Scripts npm

```bash
npm run electron:dev    # watch TS + lança Electron (desenvolvimento)
npm run electron:start  # apenas lança (sem watch)
npm run build           # compila TS
npm run build:watch     # watch compile
```

### Launcher (scripts/launch-electron.js)

```javascript
// FIX CRÍTICO: VSCode seta ELECTRON_RUN_AS_NODE no extension host.
// Isso faz require('electron') retornar string em vez da API.
delete process.env.ELECTRON_RUN_AS_NODE;
spawn('electron', ['dist-electron/main.js'], { stdio: 'inherit' });
```

---

## Padrões Arquiteturais

### Singletons Globais

```typescript
instance (stagehand-manager.ts)  // Stagehand + Chrome — mutex com initPromise
getMemory()                       // memória do agente
```

### Stagehand Auto-Recovery

```
ensureStagehand():
  if (!instance) → initStagehand()
  → garante que Chrome está vivo antes de qualquer skill
```

### Event-Driven

- `agentEmitter` — eventos do loop do agente para a UI
- IPC events — bridge main ↔ renderer

### HITL (Human-in-the-Loop)

- Critic pode pausar e pedir confirmação para ações de alto risco
- `pje_abrir` aguarda login com certificado digital
- Chrome sempre visível — usuário acompanha e intervém quando necessário

### Degradação Graciosa

```
runBrowserTask() onStepFinish lança mas com mensagem "limite":
  → retorna "Ação executada no browser" (não propaga erro falso)

agent.execute() throws com "limite":
  → capturado no try/catch → retorna fallback sem erro
```

---

## Exemplos de Fluxo

### Abrir PJe

```
User: "abre o PJe do TRT8"

1. Think (Sonnet): skill=pje_abrir, {tribunal:'TRT8'}
2. Critic: read-only → skip LLM → aprovado
3. Act: pje_abrir({tribunal:'TRT8'})
   a. ensureStagehand() — Chrome já está vivo
   b. page.goto('https://pje.trt8.jus.br/primeirograu/login.seam')
   c. injectOverlay('Aguardando login com certificado digital', done=true)
4. Observe: sucesso
5. Resposta: "PJe aberto. Faça login com certificado e me avise."
```

### Ação Genérica no Browser

```
User: "vai para peticionamento novo processo"

1. Think (Sonnet): skill=pje_agir, {objetivo:'ir para peticionamento novo processo'}
2. Critic: read-only → aprovado
3. Act: pje_agir → runBrowserTask(instrução, 15)
   Stagehand Haiku:
     passo 1: screenshot → vê menu → clica "Processo"
     passo 2: screenshot → vê submenu → clica "Peticionamento"
     passo 3: screenshot → vê "Novo Processo" → clica
     done: "Navegado para Novo Processo"
   injectOverlay a cada passo
4. Resposta: "Abri o Peticionamento > Novo Processo."
```

---

## Bugs Conhecidos e Fixes

| Bug | Causa | Fix |
|-----|-------|-----|
| `require('electron')` retorna string | VSCode seta `ELECTRON_RUN_AS_NODE` | `scripts/launch-electron.js` deleta a variável |
| Chrome "Abrindo em sessão existente" | `keepAlive:true` deixa Chrome vivo — perfil travado | `killPreviousChrome()` via PID salvo em `chrome.pid` |
| "Tempo limite atingido" falso positivo | `agent.execute()` pode lançar ou retornar com msg "limite" | `isLimitMsg()` + try/catch → retorna mensagem amigável |
| Stagehand não inicializado ao chamar skill | Init fire-and-forget pode falhar silenciosamente | `ensureStagehand()` em todas as skills antes de `getStagehand()` |
| Dois Chromes abrindo simultâneos | Duas chamadas concorrentes a `initStagehand()` | Mutex `initPromise` — segunda chamada espera a primeira |
| Quick reply buttons desabilitados | Input não dispara evento antes do click | `chatInput.dispatchEvent(new Event('input'))` |

---

## Extensibilidade

### Adicionar Nova Skill

1. Criar `electron/skills/pje/nova-skill.ts` implementando `Skill`
2. Registrar em [electron/skills/pje/index.ts](electron/skills/pje/index.ts)
3. A skill chama `runBrowserTask(instrução)` com contexto em português

### Adicionar Novo Tribunal

1. Adicionar entrada em `ROUTES` em [electron/pje/tribunal-urls.ts](electron/pje/tribunal-urls.ts)
2. Incluir `loginUrl`, `consultaUrl`, `pages`
3. Adicionar aliases de resolução (nome curto, hostname regex)

### Customizar Agente por Cliente

1. Criar JSON de `tenantConfig`
2. Passar para `runAgentLoop()` via IPC
3. O módulo `think.ts` aplica automaticamente no system prompt
