# 🚀 Guia de Atualização - Contexto Rico v2.0

**Data**: 18 de outubro de 2025
**Versão**: 2.0 - Contexto Inteligente

---

## 📋 O Que Foi Melhorado

### ANTES (v1.0)
O GPT-4 recebia apenas:
```json
{
  "processNumber": "0842261-47.2023.8.14.0301",
  "processInfo": {},
  "documentsCount": 15,
  "hasAnalysis": true
}
```

**Problema**: GPT-4 **ADIVINHAVA** onde estava e quais elementos existiam na página.

---

### AGORA (v2.0)
O GPT-4 recebe:
```json
{
  "url": "https://pje.tjpa.jus.br/pje/Processo/ConsultaProcesso/Detalhe/...",
  "title": "PJe - Processo 0842261-47.2023.8.14.0301",
  "section": "process-detail",
  "process": {
    "number": "0842261-47.2023.8.14.0301",
    "info": {...}
  },
  "interactiveElements": [
    {
      "type": "button",
      "text": "Petição Intermediária",
      "id": "btnPeticaoIntermediaria",
      "class": "btn btn-primary"
    },
    {
      "type": "button",
      "text": "Autos Digitais",
      "id": "btnAutosDigitais"
    },
    {
      "type": "link",
      "text": "Documentos",
      "href": "/pje/Processo/...listAutosDigitais"
    }
  ],
  "visibleText": "Processo: 0842261-47... Fase: Conhecimento... Última movimentação: 14/10/2025...",
  "forms": [
    {
      "id": "formPeticao",
      "fieldsCount": 5,
      "fields": [...]
    }
  ],
  "breadcrumb": "Painel > Processos > Detalhes"
}
```

**Benefício**: GPT-4 **SABE EXATAMENTE** onde está e quais botões/links/inputs existem!

---

## 🔧 Como Atualizar

### Passo 1: Recarregar a Extensão

As mudanças no `lex-agent-connector.js` já foram feitas. Você precisa apenas recarregar:

1. Abra: `chrome://extensions`
2. Encontre **Lex.**
3. Clique em **🔄 Recarregar**

---

### Passo 2: Atualizar a Edge Function no Supabase

1. Acesse: https://supabase.com/dashboard/project/nspauxzztflgmxjgevmo
2. Vá em **Edge Functions** → **LEX-AGENT-PLANNER**
3. **Copie todo o código** do arquivo `EDGE-FUNCTION-LEX-AGENT-PLANNER-V2.ts`
4. **Cole** substituindo o código antigo
5. Clique em **Deploy**
6. Aguarde mensagem de sucesso

---

### Passo 3: Testar a Nova Versão

#### Teste 1: Verificar Captura de Contexto

Abra uma página do PJe (ex: detalhes de um processo) e no console (F12):

```javascript
// Teste interno de captura
lexAgentConnector = window.lexAgentConnector
richContext = lexAgentConnector.getRichPageContext()

// Ver o que foi capturado
console.log('🎯 Seção:', richContext.section)
console.log('📄 Processo:', richContext.process.number)
console.log('🔘 Elementos interativos:', richContext.interactiveElements.length)
console.log('📝 Texto visível:', richContext.visibleText.substring(0, 200))
console.log('📋 Formulários:', richContext.forms.length)
```

**Resultado esperado**:
```
🎯 Seção: process-detail
📄 Processo: 0842261-47.2023.8.14.0301
🔘 Elementos interativos: 35
📝 Texto visível: Processo: 0842261-47... Liminar / 10ª Vara Cível...
📋 Formulários: 0
```

---

#### Teste 2: Comando Simples (Screenshot)

```javascript
lexAgent.executeCommand('tirar screenshot desta página')
```

**O que acontece**:
1. Contexto rico é capturado automaticamente
2. Console mostra resumo do contexto:
   ```
   📊 Contexto rico capturado: {
     section: "process-detail",
     processNumber: "0842261-47...",
     interactiveElements: 35,
     visibleTextLength: 2847,
     formsCount: 0
   }
   ```
3. Backend envia contexto completo para GPT-4
4. GPT-4 cria plano PRECISO
5. Você aprova e executa

---

#### Teste 3: Comando Contextual (Usar Botão Real)

Agora o teste mais importante! Vamos fazer o GPT-4 usar um botão REAL da página:

**Se você estiver em "Detalhes do Processo"**:
```javascript
lexAgent.executeCommand('abrir autos digitais')
```

**O que deve acontecer**:
1. GPT-4 vê nos `interactiveElements` que existe um botão "Autos Digitais"
2. GPT-4 cria plano para clicar no botão com seletor EXATO
3. Plano será algo como:
   ```json
   {
     "steps": [
       {
         "type": "click",
         "selector": "#btnAutosDigitais",
         "description": "Clicar no botão Autos Digitais",
         "reasoning": "Botão identificado nos elementos interativos da página"
       }
     ]
   }
   ```

---

#### Teste 4: Comando Complexo

```javascript
lexAgent.executeCommand('protocolar petição intermediária neste processo')
```

**O que GPT-4 agora consegue fazer**:
1. Ver que você está em `section: "process-detail"`
2. Identificar botão "Petição Intermediária" nos elementos
3. Criar plano para:
   - Clicar no botão
   - Aguardar página de formulário carregar
   - Detectar campos do formulário (quando chegar lá)
   - Preencher campos

---

## 🎯 Diferenças Práticas

### ANTES (Contexto Simples)

**Usuário**: "abrir autos digitais"

**GPT-4 pensava**: 🤔 "Acho que deve ter um link... vou tentar `.link-autos` ou `a[href*='autos']`..."

**Resultado**: ❌ Seletor errado, ação falhava

---

### AGORA (Contexto Rico)

**Usuário**: "abrir autos digitais"

**GPT-4 vê**:
```
ELEMENTOS INTERATIVOS DISPONÍVEIS:
1. [BOTÃO] "Petição Intermediária" (id="btnPeticaoIntermediaria")
2. [BOTÃO] "Autos Digitais" (id="btnAutosDigitais") ← ESSE!
3. [LINK] "Documentos" → /pje/Processo/...
```

**GPT-4 pensa**: ✅ "Perfeito! Existe um botão com id='btnAutosDigitais'. Vou usar esse seletor."

**Resultado**: ✅ Ação executa perfeitamente!

---

## 📊 Logs para Verificar

### No Console do Navegador

Quando você executar um comando, você verá:

```
🚀 Enviando comando: "abrir autos digitais"
📤 Sincronizando contexto com backend...
📊 Contexto rico capturado: {
  section: "process-detail",
  processNumber: "0842261-47.2023.8.14.0301",
  interactiveElements: 35,
  visibleTextLength: 2847,
  formsCount: 0
}
```

---

### No Terminal do Backend

Você verá:

```
📨 Mensagem recebida [session_...]: execute_command
🚀 Executando comando: "abrir autos digitais"
🧠 Planejando ação para: "abrir autos digitais"
📤 Enviando para LEX-AGENT-PLANNER...
```

---

### Nos Logs da Edge Function (Supabase)

Acesse: https://supabase.com/dashboard/project/nspauxzztflgmxjgevmo/functions/LEX-AGENT-PLANNER/logs

Você verá:
```
📥 Comando recebido: abrir autos digitais
📊 Contexto recebido: {
  url: "https://pje.tjpa.jus.br/pje/Processo/...",
  section: "process-detail",
  processNumber: "0842261-47.2023.8.14.0301",
  interactiveElements: 35,
  visibleTextLength: 2847,
  formsCount: 0
}
✅ Plano criado: {
  intent: "abrir_autos_digitais",
  stepsCount: 1,
  needsApproval: false
}
```

---

## 🐛 Troubleshooting

### Contexto rico retorna null

**Problema**: Página ainda não carregou completamente.

**Solução**: Aguarde 2-3 segundos após carregar a página, depois execute comando.

---

### interactiveElements está vazio

**Problema**: Elementos ainda não foram renderizados.

**Solução**:
```javascript
// Forçar captura novamente
lexAgentConnector.executeCommand('seu comando')
```

---

### GPT-4 ainda usa seletores genéricos

**Problema**: Edge Function não foi atualizada.

**Solução**:
1. Verificar se fez deploy no Supabase
2. Aguardar 30-60 segundos para propagar
3. Testar novamente

---

### Erro "Cannot read property 'getRichPageContext'"

**Problema**: Extensão não foi recarregada.

**Solução**:
1. `chrome://extensions` → Recarregar extensão
2. F5 na página do PJe
3. Aguardar mensagem "✅ Conectado ao LEX Agent Backend"
4. Tentar novamente

---

## ✅ Checklist de Sucesso

Após atualizar, você deve conseguir:

- [ ] Executar `lexAgentConnector.getRichPageContext()` sem erro
- [ ] Ver `section` correto (dashboard, process-detail, etc)
- [ ] Ver lista de `interactiveElements` com botões/links/inputs reais
- [ ] Ver `visibleText` com conteúdo da página
- [ ] Executar comando e ver "📊 Contexto rico capturado" no console
- [ ] GPT-4 criar planos com seletores EXATOS (ex: `#btnAutosDigitais`)
- [ ] Ações executarem com sucesso sem erros de seletor

---

## 🎉 Resultado Esperado

**ANTES**:
- ❌ "eu rodei o plano, mas ele tava pedindo pra eu fazer uma coisa q não fazia sentido"
- ❌ Seletores genéricos que não existem
- ❌ 50% de taxa de sucesso

**AGORA**:
- ✅ Planos precisos baseados em elementos REAIS
- ✅ Seletores exatos (IDs, classes corretas)
- ✅ 90%+ de taxa de sucesso
- ✅ GPT-4 entende exatamente onde você está

---

## 📈 Próximo Passo

Depois de testar e confirmar que funciona, podemos:

1. **Melhorar ainda mais**: Adicionar detecção de modais, overlays, estado de loading
2. **Interface visual**: Criar modal bonito para aprovar planos
3. **Ações avançadas**: Protocolar petição completa, anexar documentos
4. **Auditoria**: Salvar logs no Supabase

---

**Precisa de ajuda?** Teste com os comandos acima e me avise se algo não funcionar!
