# 🚀 LEX Agent - Roadmap Completo

**Versão:** 2.0 - Com Loop Cognitivo Adaptativo
**Data:** Outubro 2025
**Autor:** Eder + Claude

---

## 📊 Estado Atual (Baseline)

### ✅ O Que Já Funciona (70% da Sprint 0)

| Componente | Status | Localização |
|------------|--------|-------------|
| **GPT-4 Vision** | ✅ 100% | `EDGE-FUNCTION-LEX-AGENT-PLANNER-V3-VISION.ts` |
| **Multi-Estratégia Executor** | ✅ 100% | `lex-agent-backend/src/pje-executor.js` |
| **Rich Context v2.0** | ✅ 100% | `src/js/lex-agent-connector.js` |
| **WebSocket Real-Time** | ✅ 100% | `lex-agent-backend/src/server.js` |
| **Screenshot Base64** | ✅ 100% | `pje-executor.screenshotBase64()` |
| **Interface Chat** | ✅ 100% | `src/js/content-simple.js` + modais |

**Taxa de Sucesso Atual:** ~70-80%
**Cobertura de Estratégias:** 5 (CSS, texto, aria, visual, heurística)
**HIL:** ⚠️ Básico (apenas aprovação binária)
**Logs:** ⚠️ Console apenas

---

## 🎯 Sprint 0 - Base Cognitiva (2-3 dias)

**Objetivo:** Fechar o ciclo "planeja → age → verifica → adapta"

### O Que Falta Implementar

#### 1. Schema Formal com `criteriaOfSuccess` ⏱️ 4 horas

**Problema:** Hoje não sabemos formalmente quando um step teve sucesso.

**Solução:** Adicionar ao plano:

```json
{
  "steps": [
    {
      "order": 1,
      "type": "fill",
      "selector": "input[placeholder*='Pesquisar']",
      "value": "petição inicial",
      "visualDescription": "Campo branco no topo",
      "criteriaOfSuccess": {
        "type": "element_state",
        "condition": "value_equals",
        "expected": "petição inicial",
        "timeout": 3000
      }
    },
    {
      "order": 2,
      "type": "click",
      "selector": "button:has-text('Consultar')",
      "criteriaOfSuccess": {
        "type": "element_visible",
        "selector": ".resultado-pesquisa",
        "timeout": 5000
      }
    }
  ]
}
```

**Tipos de Critério:**
- `element_visible` - Elemento apareceu na tela
- `element_state` - Estado do elemento (value, checked, enabled)
- `text_present` - Texto específico apareceu
- `url_change` - URL mudou (navegação)
- `element_count` - Número de elementos (ex: resultados)

**Arquivos a Modificar:**
- ✅ `EDGE-FUNCTION-LEX-AGENT-PLANNER-V3-VISION.ts` - Adicionar no system prompt
- ✅ `lex-agent-backend/src/pje-executor.js` - Implementar `evaluateSuccess()`

---

#### 2. Verificação Pós-Ação Automática ⏱️ 1 dia

**Problema:** Hoje executamos e assumimos sucesso se não der erro.

**Solução:** Após cada ação, verificar `criteriaOfSuccess`:

```javascript
async executeStepWithValidation(step) {
  // 1. Executar ação
  const result = await this.executeAction(step);

  // 2. Verificar critério de sucesso
  const evaluation = await this.evaluateSuccess(step.criteriaOfSuccess);

  if (!evaluation.success) {
    throw new Error(`Action succeeded but criteria failed: ${evaluation.reason}`);
  }

  return { ...result, evaluation };
}
```

**Arquivo a Criar:**
- ✅ `lex-agent-backend/src/step-validator.js` - Lógica de validação

---

#### 3. 🧠 Executor Adaptativo (Loop Cognitivo) ⏱️ 1-2 dias

**FEATURE PRINCIPAL DA SPRINT 0!**

**Conceito:**
```
Tenta Estratégia 1 → Valida → ❌ Falhou
  ↓
Tenta Estratégia 2 → Valida → ❌ Falhou
  ↓
Tenta Estratégia 3 → Valida → ❌ Falhou
  ↓
Replaneja Localmente → Valida → ❌ Falhou
  ↓
🙋 HIL Interativo (só agora!)
```

**Fluxo Detalhado:**

```javascript
async executeStepAdaptive(step, context) {
  const strategies = ['css', 'text', 'aria', 'visual', 'heuristic'];
  const attempts = [];

  for (const strategy of strategies) {
    try {
      // Executar com estratégia
      const result = await this.executeWithStrategy(step, strategy);

      // Validar sucesso
      const evaluation = await this.evaluateSuccess(step.criteriaOfSuccess);

      if (evaluation.success) {
        return { success: true, strategy, attempts };
      }

      attempts.push({ strategy, result, evaluation });

    } catch (error) {
      attempts.push({ strategy, error: error.message });
    }
  }

  // Esgotou estratégias → Replanejamento Local
  const replan = await this.replanLocally(step, context, attempts);

  if (replan.success) {
    return replan;
  }

  // Última opção → HIL Interativo
  return {
    success: false,
    needsHIL: true,
    hilRequest: this.createHILRequest(step, attempts)
  };
}
```

**Arquivo a Criar:**
- ✅ `lex-agent-backend/src/adaptive-executor.js` - Loop cognitivo completo

**Benefícios:**
- ✅ Taxa de sucesso sobe de 70% → 90%+
- ✅ Reduz chamadas HIL em 80%
- ✅ Aprende com falhas e se adapta
- ✅ Usuário só é chamado quando realmente necessário

---

#### 4. HIL Interativo (não apenas binário) ⏱️ 1 dia

**Problema:** Hoje HIL é só "Aprovar ou Cancelar".

**Solução:** HIL contextual e inteligente:

```javascript
{
  type: 'hil_interactive',
  message: "Tentei clicar em 'Consultar' mas não funcionou. Encontrei 2 opções:",
  options: [
    {
      label: "Botão azul 'Consultar Processo' (topo direito)",
      selector: "#btnConsultarProcesso",
      screenshot: "base64...",
      confidence: 0.85
    },
    {
      label: "Link 'Consulta Avançada' (menu lateral)",
      selector: "a[href*='consulta']",
      screenshot: "base64...",
      confidence: 0.60
    }
  ],
  actions: [
    { label: "Opção 1", value: "option_0" },
    { label: "Opção 2", value: "option_1" },
    { label: "Nenhuma (pular step)", value: "skip" },
    { label: "Cancelar tudo", value: "cancel" }
  ]
}
```

**Arquivo a Criar:**
- ✅ `src/js/lex-hil-interactive.js` - Modal HIL inteligente

**UI/UX:**
- Modal com screenshots dos elementos encontrados
- Blur automático de dados sensíveis (CPF, NPU)
- Preview de cada opção ao passar mouse
- Histórico de decisões HIL (aprendizado)

---

#### 5. Timeline Textual (Logs na Sidebar) ⏱️ 4 horas

**Problema:** Hoje logs só no console.

**Solução:** Timeline visual na sidebar da LEX:

```
🤖 LEX Agent - Execução em andamento

✅ Step 1 - Preencher campo de pesquisa
   └─ Estratégia: CSS selector
   └─ Seletor: input[placeholder*='Pesquisar']
   └─ Validação: ✓ Valor preenchido corretamente
   └─ Tempo: 1.2s

🔄 Step 2 - Clicar em Consultar
   └─ Estratégia 1 (CSS): ❌ Timeout
   └─ Estratégia 2 (texto): ✅ Sucesso!
   └─ Validação: ✓ Resultados apareceram
   └─ Tempo: 3.5s

⏳ Step 3 - Aguardando resultados...
```

**Arquivo a Criar:**
- ✅ `src/js/lex-timeline.js` - Componente de timeline

---

#### 6. Relatório JSON + Hash Criptográfico ⏱️ 4 horas

**Problema:** Nenhuma auditoria formal das execuções.

**Solução:** Gerar relatório JSON ao final:

```json
{
  "executionId": "exec_20251020_143052",
  "timestamp": "2025-10-20T14:30:52.123Z",
  "command": "pesquisar por petição inicial",
  "process": "0003276-57.2014.8.14.0301",
  "user": "hash_user_123",
  "steps": [
    {
      "order": 1,
      "action": "fill",
      "selector": "input[placeholder*='Pesquisar']",
      "value": "petição inicial",
      "strategy": "css",
      "attempts": 1,
      "duration_ms": 1234,
      "success": true,
      "evidence": {
        "screenshot": "path/to/evidence_step1.png",
        "pageUrl": "https://pje.tjpa.jus.br/..."
      }
    }
  ],
  "result": "success",
  "totalDuration_ms": 5678,
  "hash": "sha256:abc123..." // Prova de integridade
}
```

**Arquivo a Criar:**
- ✅ `lex-agent-backend/src/report-generator.js`

**Storage:**
- Local: `~/.lex-agent/reports/{executionId}.json`
- Encrypted com chave do usuário
- Opção de export para PDF

---

### ✅ Critérios de Aceitação Sprint 0

- [ ] Schema com `criteriaOfSuccess` implementado e documentado
- [ ] Validação automática pós-ação funcionando em 100% dos steps
- [ ] Loop cognitivo com 5 estratégias + replanejamento local
- [ ] HIL interativo com múltiplas opções e screenshots
- [ ] Timeline textual visível na sidebar durante execução
- [ ] Relatório JSON gerado e hashado ao final
- [ ] Taxa de sucesso >90% nos 3 fluxos principais:
  - Buscar documento no PJe
  - Abrir autos digitais
  - Extrair informações de processo
- [ ] Redução de 80% nas chamadas HIL (comparado com versão binária)

---

## 🔐 Sprint 1 - Segurança Jurídica (1 semana)

**Objetivo:** Garantir compliance CNJ e auditabilidade completa

### Funcionalidades

#### 1. HIL Obrigatório para Ações Críticas

**Ações que SEMPRE exigem HIL:**
- Assinatura digital
- Protocolo/envio de petição
- Upload de documentos
- Exclusão de dados
- Ações irreversíveis

**Implementação:**
```javascript
const CRITICAL_ACTIONS = ['sign', 'submit', 'upload', 'delete'];

if (CRITICAL_ACTIONS.includes(step.type)) {
  step.needsApproval = true;
  step.hilType = 'critical';
}
```

---

#### 2. Logs Auditáveis CNJ-Compliant

**Requisitos CNJ:**
- Hash criptográfico (SHA-256)
- Timestamp confiável (servidor NTP ou blockchain)
- Não-repúdio (assinatura digital)
- Armazenamento seguro (encrypted)

**Estrutura:**
```json
{
  "executionId": "...",
  "timestamp": {
    "iso": "2025-10-20T14:30:52.123Z",
    "ntp_verified": true,
    "server": "pool.ntp.br"
  },
  "user": {
    "id_hash": "sha256:...",
    "certificate": "OAB/PA 12345"
  },
  "actions": [...],
  "hash": "sha256:...",
  "signature": "RSA:..."
}
```

---

#### 3. Exportação PDF do Relatório

**Template CNJ-friendly:**
```
┌─────────────────────────────────────────┐
│  RELATÓRIO DE EXECUÇÃO - LEX AGENT     │
│  Resolução CNJ nº 335/2020             │
└─────────────────────────────────────────┘

Execução ID: exec_20251020_143052
Data/Hora: 20/10/2025 14:30:52 (verificado via NTP)
Usuário: [HASH]
Processo: 0003276-57.2014.8.14.0301

AÇÕES EXECUTADAS:

1. Preencher campo de pesquisa
   └─ Seletor: input[placeholder*='Pesquisar']
   └─ Estratégia: CSS (sucesso na 1ª tentativa)
   └─ Validação: ✓ Valor preenchido
   └─ Evidência: evidence_step1.png

[...]

HASH DE INTEGRIDADE: sha256:abc123...
ASSINATURA DIGITAL: [RSA]
```

---

#### 4. 🧩 Classificador de Falhas + Recuperação

**Tipos de Falha:**
- `modal_overlay` - Modal bloqueando interação
- `focus_trap` - Focus preso em elemento
- `random_id` - ID gerado dinamicamente
- `lazy_load` - Elemento ainda carregando
- `network_slow` - Conexão lenta

**Recuperação Automática:**
```javascript
async handleFailure(error, step, context) {
  const failureType = this.classifyFailure(error);

  switch (failureType) {
    case 'modal_overlay':
      return await this.closeModalAndRetry(step);

    case 'focus_trap':
      return await this.resetFocusAndRetry(step);

    case 'random_id':
      return await this.useVisualStrategyInstead(step);

    case 'lazy_load':
      return await this.waitLongerAndRetry(step);

    default:
      return await this.replanLocally(step, context);
  }
}
```

---

#### 5. 🧠 Replanejamento Local

**Quando usar:**
- Estratégias falharam
- Página mudou inesperadamente
- Seletores obsoletos

**Como funciona:**
```javascript
async replanLocally(failedStep, context) {
  // 1. Capturar novo screenshot
  const screenshot = await this.screenshotBase64();

  // 2. Contexto atualizado
  const freshContext = await this.getRichPageContext();

  // 3. Prompt de replanejamento
  const prompt = `
  Tentei: ${failedStep.description}
  Falhou porque: ${attempts.map(a => a.error).join(', ')}

  Página atual: ${freshContext.url}
  Elementos visíveis: ${freshContext.interactiveElements}

  Crie um mini-plano alternativo (1-3 steps) para atingir o mesmo objetivo.
  `;

  // 4. GPT-4 Vision cria mini-plano
  const miniPlan = await this.planner.createPlan(prompt, freshContext, screenshot);

  // 5. Executar mini-plano
  return await this.executeSteps(miniPlan.steps);
}
```

---

#### 6. 🔍 Detecção de Contexto Jurídico

**O que detectar:**
- Tipo de documento (petição, decisão, despacho, certidão)
- Fase processual (conhecimento, execução, recurso)
- Urgência (prazo fatal, ordinário, sem prazo)
- Partes (autor, réu, terceiro)

**Implementação:**
```javascript
async detectLegalContext(pageContent) {
  const keywords = {
    document_type: {
      petition: ['petição', 'inicial', 'contestação'],
      decision: ['sentença', 'decisão', 'acórdão'],
      dispatch: ['despacho', 'expediente']
    },
    phase: {
      knowledge: ['conhecimento', 'ordinário'],
      execution: ['execução', 'cumprimento'],
      appeal: ['recurso', 'apelação', 'agravo']
    }
  };

  // Análise por keywords + GPT-4
  const context = await this.analyzeWithGPT4(pageContent, keywords);

  return {
    documentType: context.document_type,
    phase: context.phase,
    urgency: context.urgency,
    parties: context.parties
  };
}
```

---

### ✅ Critérios de Aceitação Sprint 1

- [ ] HIL obrigatório implementado para 5 tipos de ação crítica
- [ ] Logs com hash SHA-256 + timestamp NTP
- [ ] Export PDF funcionando com template CNJ
- [ ] Classificador de falhas detectando 5 tipos + recuperação
- [ ] Replanejamento local funcionando em 80% dos casos
- [ ] Detecção de contexto jurídico em 3 tipos de documento
- [ ] 3 fluxos completos com recuperação automática:
  - Certidão (falha → recupera → completa)
  - Despacho (modal → fecha → completa)
  - Minuta (ID dinâmico → visão → completa)

---

## 📄 Sprint 2 - Percepção Jurídica (1 semana)

**Objetivo:** Sair do "clicador" para "executor cognitivo jurídico"

### Funcionalidades

#### 1. Entendimento Contextual Processual

**Antes de agir, entender:**
```javascript
const processContext = {
  number: "0003276-57.2014.8.14.0301",
  nature: "Ação de Cobrança",
  status: "Em andamento - Aguardando julgamento",
  phase: "Conhecimento",
  parties: {
    author: "João Silva",
    defendant: "Empresa XYZ Ltda"
  },
  lastMovement: {
    date: "2025-10-15",
    type: "Despacho",
    content: "Intime-se..."
  },
  deadlines: [
    {
      type: "Contestação",
      date: "2025-10-25",
      days_remaining: 5,
      priority: "high"
    }
  ]
};
```

---

#### 2. Minutas Modulares com Validação

**Estrutura:**
```
50% Template Fixo (estrutura legal)
+
50% IA Contextual (fatos + fundamentos)
```

**Exemplo:**

```markdown
# PETIÇÃO INICIAL

## EXCELENTÍSSIMO SENHOR DOUTOR JUIZ DE DIREITO DA ... VARA CÍVEL

[TEMPLATE FIXO - CABEÇALHO]

**[NOME]**, [qualificação], vem, respeitosamente, à presença de Vossa Excelência, por meio de seu advogado que esta subscreve, com fundamento no art. XXX do CPC, propor

## AÇÃO DE COBRANÇA

em face de **[RÉU]**, [qualificação], pelos fatos e fundamentos que passa a expor:

---

## I - DOS FATOS

[50% IA CONTEXTUAL - baseado em dados do processo]

No dia XX/XX/XXXX, as partes celebraram contrato de prestação de serviços...
[extraído de documentos anexados]

---

## II - DO DIREITO

[TEMPLATE FIXO - estrutura]
[IA CONTEXTUAL - citações de jurisprudência REAL]

A presente demanda encontra amparo no art. XXX do Código Civil...

Nesse sentido, o STJ já decidiu:

> "EMENTA REAL DO STJ..."
> (REsp XXXXXXX/XX, Rel. Min. XXXX, julgado em XX/XX/XXXX)
> [FONTE VERIFICADA]

---

## III - DOS PEDIDOS

[TEMPLATE FIXO]

Diante do exposto, requer-se:

a) A citação do réu...
[...]

Termos em que,
Pede deferimento.

[ASSINATURA DIGITAL]
```

---

#### 3. Templates Versionados (Git)

**Estrutura:**
```
.lex-templates/
├── peticao-inicial/
│   ├── v1.0.md (original)
│   ├── v1.1.md (atualização CPC)
│   └── v2.0.md (nova resolução CNJ)
├── contestacao/
│   └── v1.0.md
└── recurso-apelacao/
    └── v1.0.md
```

**Versionamento:**
```bash
git log --oneline .lex-templates/peticao-inicial/v2.0.md

abc123 fix: ajusta citação CPC art. 330
def456 feat: adiciona seção de provas
ghi789 docs: atualiza para Resolução CNJ 123/2025
```

---

#### 4. Validação de Citações (NUNCA inventar!)

**Problema:** GPT-4 pode "alucinar" jurisprudência.

**Solução:** Validar TODAS as citações:

```javascript
async validateCitation(citation) {
  // Extrair dados
  const match = citation.match(/REsp (\d+)\/(\w+)/);
  if (!match) return { valid: false, reason: 'Formato inválido' };

  const [_, number, state] = match;

  // Buscar no STJ real
  const result = await this.searchSTJ(number, state);

  if (!result.found) {
    return {
      valid: false,
      reason: 'Jurisprudência não encontrada no STJ',
      suggestion: 'Remover citação ou buscar alternativa'
    };
  }

  // Validar ementa
  const ementaMatch = this.compareEmentas(citation.ementa, result.ementa);

  if (ementaMatch < 0.8) {
    return {
      valid: false,
      reason: 'Ementa não confere',
      expected: result.ementa,
      got: citation.ementa
    };
  }

  return {
    valid: true,
    source: result.url,
    verified_date: new Date().toISOString()
  };
}
```

---

#### 5. Preview Side-by-Side

**UI:**
```
┌─────────────────┬─────────────────┐
│  Template Base  │  Minuta Gerada  │
├─────────────────┼─────────────────┤
│ # PETIÇÃO       │ # PETIÇÃO       │
│ INICIAL         │ INICIAL         │
│                 │                 │
│ ## I - FATOS    │ ## I - FATOS    │
│                 │                 │
│ [PREENCHER]     │ No dia 15/10... │
│                 │ ✨ IA           │
│                 │                 │
│ ## II - DIREITO │ ## II - DIREITO │
│                 │                 │
│ Art. XXX CC...  │ Art. 186 CC...  │
│                 │ ✅ Verificado   │
│                 │                 │
│ [JURISPRUD.]    │ REsp 123456/SP  │
│                 │ ✅ Válido       │
└─────────────────┴─────────────────┘

[Aprovar] [Editar] [Cancelar]
```

---

### ✅ Critérios de Aceitação Sprint 2

- [ ] Detecção de contexto processual em 5 tipos de processo
- [ ] 10 templates modulares criados e versionados
- [ ] Validação de citações funcionando (0% de alucinação)
- [ ] Preview side-by-side implementado
- [ ] 3 minutas geradas com validação:
  - Petição inicial (com citações verificadas)
  - Contestação (com análise de provas)
  - Recurso (com fundamentação jurídica)
- [ ] 100% das citações validadas contra fonte oficial

---

## 🌐 Sprint 3 - Browser-Use Externo (1 semana)

**Objetivo:** Buscar informações fora do PJe com mesmo nível de autonomia

### Funcionalidades

#### 1. Router de Tarefa (PJe vs Público)

```javascript
async routeTask(command, context) {
  const domain = new URL(context.url).hostname;

  if (domain.includes('pje.tjpa.jus.br')) {
    // PJe logado = extensão
    return await this.extensionExecutor.execute(command, context);
  }

  // Sites públicos = Browser-Use
  return await this.browserUseExecutor.execute(command);
}
```

---

#### 2. Browser-Use para STJ/STF/TJ

**Tarefas:**
- Buscar jurisprudência por tema
- Extrair ementas
- Baixar PDFs de decisões
- Consultar publicações DJe

**Exemplo:**
```javascript
const task = `
Busque no STJ as 5 decisões mais recentes sobre:
"responsabilidade civil por abandono afetivo"

Período: últimos 12 meses
Retorne: número, data, ementa, link oficial
`;

const results = await browserUse.run(task);

/*
[
  {
    number: "REsp 1234567/SP",
    date: "2025-09-15",
    ementa: "CIVIL. RESPONSABILIDADE CIVIL...",
    url: "https://stj.jus.br/...",
    verified: true
  },
  ...
]
*/
```

---

#### 3. Cache Inteligente

**Problema:** Re-scraping desperdiça recursos.

**Solução:**
```javascript
const cache = {
  key: sha256(taskDescription),
  ttl: 7 * 24 * 60 * 60 * 1000, // 7 dias
  data: results,
  metadata: {
    source: 'STJ',
    date: '2025-10-20',
    hits: 5
  }
};

// Próxima busca similar = cache hit
```

---

#### 4. Rate Limiting + Respeito a robots.txt

```javascript
const rateLimits = {
  'stj.jus.br': { requests: 10, per: 'minute' },
  'stf.jus.br': { requests: 5, per: 'minute' },
  'tjpa.jus.br': { requests: 20, per: 'minute' }
};

await this.respectRateLimit(domain);
await this.checkRobotsTxt(domain, path);
```

---

#### 5. Fallback para APIs Oficiais

```javascript
async searchJurisprudence(query, court) {
  // Tentar API oficial primeiro
  if (this.hasOfficialAPI(court)) {
    try {
      return await this.callOfficialAPI(court, query);
    } catch {
      console.log('API falhou, usando scraping...');
    }
  }

  // Fallback: Browser-Use scraping
  return await this.browserUseScrape(court, query);
}
```

---

### ✅ Critérios de Aceitação Sprint 3

- [ ] Router funcionando (PJe → extensão, público → Browser-Use)
- [ ] Busca em 3 tribunais (STJ, STF, TJPA)
- [ ] Cache com 7 dias TTL
- [ ] Rate limiting respeitado em 100% das requisições
- [ ] Fallback API funcionando para STJ
- [ ] 5 tarefas públicas executadas com sucesso:
  - Buscar 5 decisões STJ sobre tema X
  - Extrair ementas de REsp específico
  - Consultar publicações DJe de processo
  - Baixar PDF de acórdão
  - Pesquisar legislação no Planalto

---

## 🛡️ Sprint 4 - Robustez & Telemetria (1 semana)

**Objetivo:** Sistema resiliente e observável

### Funcionalidades

#### 1. Biblioteca Anti-Ruído

```javascript
const antiNoise = {
  // Fechar automaticamente
  autoClose: [
    '[class*="cookie"]',
    '[class*="banner"]',
    '[class*="modal-overlay"]',
    '[aria-label*="Fechar"]'
  ],

  // Focar automaticamente
  autoFocus: [
    'input[autofocus]',
    'input:visible:first',
    'textarea:visible:first'
  ],

  // Scroll automático
  autoScroll: [
    '[class*="error"]',
    '[class*="required"]',
    '[aria-invalid="true"]'
  ]
};
```

---

#### 2. Replay Automático (3 tentativas)

```javascript
async executeWithRetry(step, maxRetries = 3) {
  let lastError;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`Tentativa ${attempt}/${maxRetries}`);

      const result = await this.executeStepAdaptive(step);

      if (result.success) {
        return result;
      }

      // Esperar antes de tentar novamente
      await this.wait(attempt * 1000);

    } catch (error) {
      lastError = error;
      console.log(`Tentativa ${attempt} falhou: ${error.message}`);
    }
  }

  throw new Error(`Esgotadas ${maxRetries} tentativas: ${lastError.message}`);
}
```

---

#### 3. Telemetria Anonimizada

```json
{
  "metrics": {
    "success_rate": 0.93,
    "avg_duration_ms": 3456,
    "strategies_used": {
      "css": 0.60,
      "text": 0.25,
      "aria": 0.10,
      "visual": 0.05
    },
    "hil_calls": 12,
    "replans": 8,
    "errors_by_type": {
      "timeout": 5,
      "selector_not_found": 3,
      "modal_overlay": 2
    }
  },
  "privacy": {
    "user_id_hashed": true,
    "process_numbers_removed": true,
    "screenshots_excluded": true
  }
}
```

---

#### 4. Health Check Semanal

```javascript
async weeklyHealthCheck() {
  const criticalFlows = [
    'buscar_processo',
    'abrir_autos',
    'gerar_minuta',
    'protocolar_peticao'
  ];

  const results = [];

  for (const flow of criticalFlows) {
    const result = await this.testFlow(flow);
    results.push({
      flow,
      success: result.success,
      duration: result.duration,
      errors: result.errors,
      selectors_broken: result.brokenSelectors
    });
  }

  // Alertar se taxa de sucesso < 85%
  const avgSuccess = results.filter(r => r.success).length / results.length;

  if (avgSuccess < 0.85) {
    await this.notifyMaintenance(results);
  }

  return results;
}
```

---

#### 5. Confidence Score

```javascript
const confidence = {
  strategy: {
    css: 0.9,        // Alta confiança
    text: 0.8,
    aria: 0.75,
    visual: 0.6,     // Média confiança
    heuristic: 0.4   // Baixa confiança
  },

  adjustBehavior(confidence) {
    if (confidence > 0.8) {
      return 'autonomous';  // Executa sem pedir
    } else if (confidence > 0.5) {
      return 'confirm';     // Mostra preview antes
    } else {
      return 'guided';      // HIL para cada step
    }
  }
};
```

---

### ✅ Critérios de Aceitação Sprint 4

- [ ] Biblioteca anti-ruído fechando 10 tipos de modal
- [ ] Replay automático funcionando (95% sucesso em 2ª tentativa)
- [ ] Telemetria coletando 15 métricas (anonimizadas)
- [ ] Health check semanal rodando e alertando
- [ ] Confidence score ajustando comportamento
- [ ] Taxa de sucesso >95% nos 5 fluxos principais
- [ ] Tempo médio de execução reduzido em 30%

---

## 📅 Timeline Consolidado

| Sprint | Duração | Objetivo | Taxa Sucesso Alvo |
|--------|---------|----------|-------------------|
| **Sprint 0** | 2-3 dias | Base cognitiva | 90% |
| **Sprint 1** | 1 semana | Segurança jurídica | 90% |
| **Sprint 2** | 1 semana | Percepção jurídica | 92% |
| **Sprint 3** | 1 semana | Browser-Use externo | 93% |
| **Sprint 4** | 1 semana | Robustez | 95% |

**Total:** 4-5 semanas

---

## 🎯 Checklist Imediato (Próximas 48h)

### Prioridade 1 - Deploy Visão
- [ ] Deploy `EDGE-FUNCTION-LEX-AGENT-PLANNER-V3-VISION.ts`
- [ ] Restart backend com código de visão
- [ ] Teste real: "pesquisar por petição inicial"

### Prioridade 2 - Schema com Critérios
- [ ] Atualizar Edge Function para incluir `criteriaOfSuccess`
- [ ] Implementar `evaluateSuccess()` no executor
- [ ] Testar com 3 tipos de critério diferentes

### Prioridade 3 - Adaptive Executor (Protótipo)
- [ ] Criar `adaptive-executor.js` básico
- [ ] Implementar loop cognitivo (5 estratégias)
- [ ] Testar com 1 fluxo real

---

## 🚦 Decisão Estratégica

### Opção A - Deploy Visão AGORA (30min)
Coloca GPT-4 Vision em produção, testa com usuário real.

### Opção B - Sprint 0 Completo PRIMEIRO (2-3 dias)
Fecha toda a base antes de lançar.

### Opção C - Híbrido ⭐ RECOMENDADO
- **HOJE:** Deploy visão + teste
- **Amanhã-3 dias:** Sprint 0 completo
- **Próxima semana:** Sprint 1

---

## 📊 Métricas de Sucesso do Roadmap

| Métrica | Atual | Sprint 0 | Sprint 4 |
|---------|-------|----------|----------|
| Taxa de Sucesso | 70% | 90% | 95% |
| Chamadas HIL | 50% | 10% | 5% |
| Tempo Médio | 10s | 7s | 5s |
| Cobertura Fluxos | 3 | 5 | 10 |
| Citações Válidas | ❌ | ❌ | 100% |

---

## ⚠️ Riscos & Mitigação

| Risco | Probabilidade | Impacto | Mitigação |
|-------|---------------|---------|-----------|
| IDs dinâmicos do PJe | Alta | Alto | Visão + aria + texto |
| Alucinação de minutas | Média | Crítico | Validação obrigatória |
| Rate limit em tribunais | Baixa | Médio | Cache + API fallback |
| Mudanças layout PJe | Média | Alto | Health check semanal |

---

## 🎓 Referências & Compliance

- **CNJ Resolução 335/2020** - Ética e Transparência
- **LGPD** - Proteção de dados
- **OAB Provimento 205/2021** - Uso de IA
- **CPC Art. 11** - Dever de cooperação

---

**Próximo Passo:** Escolher entre Opção A, B ou C e começar! 🚀
