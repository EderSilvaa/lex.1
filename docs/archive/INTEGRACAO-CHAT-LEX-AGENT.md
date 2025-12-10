# Integração Chat LEX + LEX Agent

## 🎯 Problema Resolvido

**ANTES:** Usuário precisava sair do chat e ir para o console para usar LEX Agent
**AGORA:** Tudo acontece DENTRO do chat da LEX - zero ruído!

---

## 🎨 Nova Experiência do Usuário

### CENÁRIO 1: Pergunta Analítica (LEX Normal)

```
Usuário no chat: "qual é a fase processual?"
       ↓
LEX responde com GPT-4 (análise)
```

### CENÁRIO 2: Comando de Ação (LEX Agent)

```
Usuário no chat: "pesquisar por petição inicial"
       ↓
LEX detecta que é AÇÃO (não pergunta)
       ↓
LEX Agent cria plano com contexto rico
       ↓
Modal aparece SOBRE o chat
       ↓
Usuário revisa e clica [Executar]
       ↓
Progress bar no modal
       ↓
Resultado visual + mensagem no chat
```

---

## 🔧 Modificações Implementadas

### 1. `content-simple.js` - Função `enviarMensagem()`

**Adicionada detecção de comandos de ação:**

```javascript
// 🤖 DETECTAR COMANDOS DE AÇÃO (LEX AGENT)
if (isComandoDeAcao(texto)) {
  executarComandoAgent(texto, messagesContainer);
  return;
}

// Se não for ação, continua fluxo normal (GPT-4)
```

### 2. Nova Função: `isComandoDeAcao()`

**Detecta se mensagem é comando de ação:**

```javascript
function isComandoDeAcao(texto) {
  const palavrasAcao = [
    'pesquisar', 'buscar', 'procurar', 'encontrar',
    'navegar', 'ir para', 'abrir', 'clicar',
    'protocolar', 'anexar', 'baixar', 'preencher'
    // ... mais palavras
  ];

  // Verifica se começa com palavra de ação
  for (const palavra of palavrasAcao) {
    if (textoLower.startsWith(palavra)) {
      return true;
    }
  }

  return false;
}
```

### 3. Nova Função: `executarComandoAgent()`

**Executa comando via LEX Agent com feedback no chat:**

```javascript
function executarComandoAgent(comando, messagesContainer) {
  // 1. Verificar se Agent está conectado
  if (!window.lexAgentConnector || !window.lexAgentConnector.connected) {
    adicionarMensagemAssistente('⚠️ LEX Agent não conectado...');
    return;
  }

  // 2. Mostrar "pensando..." no chat
  const thinkingMsg = adicionarMensagemAssistente(`
    <div class="lex-thinking-dots">
      <span></span><span></span><span></span>
    </div>
    Analisando comando e criando plano...
  `);

  // 3. Enviar para LEX Agent
  window.lexAgentConnector.executeCommand(comando);

  // 4. Aguardar plano ser criado
  const checkPlan = setInterval(() => {
    if (window.lexAgentConnector.lastPlan) {
      clearInterval(checkPlan);
      thinkingMsg.remove();

      // 5. Confirmar no chat
      adicionarMensagemAssistente(`
        ✓ Plano criado!
        Modal aberto - clique [Executar] para continuar
      `);
    }
  }, 500);
}
```

---

## 🎬 Fluxo Completo - Passo a Passo

```
1. Usuário digita no CHAT: "pesquisar por petição inicial"

2. enviarMensagem() é chamada

3. isComandoDeAcao() retorna TRUE
   → Detecta palavra "pesquisar"

4. executarComandoAgent() é executada
   → Verifica se Agent conectado
   → Adiciona mensagem "Analisando..." no chat
   → Chama window.lexAgentConnector.executeCommand()

5. LEX Agent Connector envia para backend

6. Backend cria plano com GPT-4 + contexto rico

7. Backend retorna plano via WebSocket

8. lex-agent-connector.js recebe plano

9. connector.ui.showPlanForApproval() abre MODAL
   → Modal aparece SOBRE o chat

10. Chat mostra: "✓ Plano criado! Modal aberto"

11. Usuário vê modal com:
    - 🎯 Objetivo
    - ⏱️ Tempo estimado
    - ⚡ Nível de risco
    - 📝 Passos detalhados
    - [Cancelar] [✓ Executar]

12. Usuário clica [Executar]

13. Modal muda para progress bar

14. Backend executa com Playwright

15. Modal mostra resultado final

16. Chat pode adicionar resumo (futuro)
```

---

## ✨ Palavras-Chave que Ativam LEX Agent

### Ações de Pesquisa:
- ✅ "pesquisar por..."
- ✅ "buscar..."
- ✅ "procurar..."
- ✅ "encontrar..."

### Ações de Navegação:
- ✅ "navegar para..."
- ✅ "ir para..."
- ✅ "abrir..."

### Ações de Interação:
- ✅ "clicar em..."
- ✅ "selecionar..."
- ✅ "preencher..."
- ✅ "digitar..."

### Ações de Protocolo:
- ✅ "protocolar..."
- ✅ "anexar..."
- ✅ "enviar..."

### Ações de Download:
- ✅ "baixar..."
- ✅ "download..."

---

## 🧪 Exemplos de Uso

### ANÁLISE (LEX Normal):
```
❓ "qual é o número do processo?"
❓ "quem é o autor?"
❓ "qual a fase processual?"
❓ "resumir este documento"
```

### AUTOMAÇÃO (LEX Agent):
```
🤖 "pesquisar por petição inicial"
🤖 "navegar para aba documentos"
🤖 "baixar último PDF"
🤖 "protocolar petição"
🤖 "clicar no botão consultar"
```

---

## 🎨 Interface Visual

### No Chat:
```
┌─────────────────────────────────────┐
│ Você: pesquisar por petição inicial│
├─────────────────────────────────────┤
│ LEX:                                │
│ ●●● Analisando comando e criando   │
│     plano de ação...                │
└─────────────────────────────────────┘
```

**Após plano pronto:**
```
┌─────────────────────────────────────┐
│ LEX:                                │
│ ✓ Plano de ação criado!             │
│                                     │
│ Um modal foi aberto com os          │
│ detalhes do plano.                  │
│ Revise e clique [Executar]         │
└─────────────────────────────────────┘
```

### Modal Sobreposto:
```
┌─────────────────────────────────────┐
│  🤖 LEX Agent - Plano de Ação      │
├─────────────────────────────────────┤
│  🎯 Pesquisar por "petição inicial"│
│  ⏱️ 10s • ⚡ Risco: BAIXO          │
│                                     │
│  ✓ 1. Preencher #txtPesquisa       │
│  ✓ 2. Aguardar resultados          │
│                                     │
│     [Cancelar]  [✓ Executar]       │
└─────────────────────────────────────┘
```

---

## 🔄 Tratamento de Erros

### Agent Não Conectado:
```javascript
if (!window.lexAgentConnector || !window.lexAgentConnector.connected) {
  adicionarMensagemAssistente(`
    ⚠️ LEX Agent não está conectado

    O sistema de automação não está disponível.
    Certifique-se de que o backend está rodando:

    cd lex-agent-backend && npm start
  `);
  return;
}
```

### Timeout (30 segundos):
```javascript
setTimeout(() => {
  clearInterval(checkPlan);
  if (!window.lexAgentConnector.lastPlan) {
    adicionarMensagemAssistente(`
      ⏱️ Timeout ao criar plano

      O planejamento demorou mais que o esperado.
      Tente novamente ou verifique o backend.
    `);
  }
}, 30000);
```

### Erro Genérico:
```javascript
catch (error) {
  adicionarMensagemAssistente(`
    ❌ Erro ao executar comando

    ${error.message || 'Erro desconhecido'}
  `);
}
```

---

## 📊 Comparação: ANTES vs AGORA

### ANTES (Console):
| Passo | Ação | Onde |
|-------|------|------|
| 1 | Abrir DevTools (F12) | Console |
| 2 | Digitar `lexAgent.executeCommand()` | Console |
| 3 | Ver logs no console | Console |
| 4 | Modal aparece | PJe |
| 5 | Voltar para PJe | - |

**Problemas:**
- ❌ Usuário sai do fluxo
- ❌ Precisa saber comando exato
- ❌ Console poluído
- ❌ Curva de aprendizado

### AGORA (Chat):
| Passo | Ação | Onde |
|-------|------|------|
| 1 | Digitar comando natural | Chat |
| 2 | Modal aparece | Sobre chat |
| 3 | Clicar [Executar] | Modal |
| 4 | Ver resultado | Modal + Chat |

**Benefícios:**
- ✅ Usuário NUNCA sai do chat
- ✅ Linguagem natural
- ✅ Interface visual clean
- ✅ Zero curva de aprendizado

---

## 🚀 Como Testar

### 1. Certifique-se que backend está rodando:
```bash
cd lex-agent-backend
npm start
```

### 2. Recarregue a extensão no Chrome

### 3. Abra uma página do PJe

### 4. Abra o chat da LEX (ícone no canto)

### 5. Digite comando de ação:
```
pesquisar por petição inicial
```

### 6. Observe:
- ✅ Chat mostra "Analisando..."
- ✅ Modal aparece automaticamente
- ✅ Plano visível com passos
- ✅ Chat confirma "Plano criado!"

### 7. Clique [Executar] e observe:
- ✅ Progress bar atualiza
- ✅ Modal mostra resultado
- ✅ Ação executada no PJe

---

## 🎓 Detecção Inteligente

A função `isComandoDeAcao()` é **inteligente**:

### Detecta AÇÃO (LEX Agent):
```
✅ "pesquisar por petição"      → começa com "pesquisar"
✅ "buscar documento X"          → começa com "buscar"
✅ "navegar para timeline"       → começa com "navegar"
✅ "baixar último PDF"           → começa com "baixar"
```

### Detecta PERGUNTA (LEX Normal):
```
❓ "qual é o número?"           → não é ação
❓ "quando foi protocolado?"    → não é ação
❓ "quem é o advogado?"         → não é ação
❓ "explique a decisão"         → não é ação
```

---

## 💡 Melhorias Futuras

### 1. Resumo no Chat Após Execução:
```javascript
// Após execução completa, adicionar no chat:
adicionarMensagemAssistente(`
  ✅ Comando executado com sucesso!

  Resultado: 3 resultados encontrados
  Tempo: 8 segundos
`);
```

### 2. Histórico de Comandos:
```javascript
// Botão no chat mostrando últimos 5 comandos
📜 Histórico:
  - pesquisar por petição inicial (há 2 min)
  - baixar PDF da sentença (há 5 min)
  - navegar para timeline (há 10 min)
```

### 3. Sugestões Inteligentes:
```javascript
// Se usuário digita "pesqui", mostrar autocomplete:
💡 Você quis dizer:
  - pesquisar por petição inicial
  - pesquisar por decisão
  - pesquisar por despacho
```

### 4. Atalhos:
```
/p petição  → pesquisar por petição
/n timeline → navegar para timeline
/b pdf      → baixar último PDF
```

---

## ✅ Checklist de Implementação

- [x] Detectar comandos de ação em `enviarMensagem()`
- [x] Criar função `isComandoDeAcao()`
- [x] Criar função `executarComandoAgent()`
- [x] Feedback "pensando..." no chat
- [x] Confirmação "plano criado" no chat
- [x] Modal automático quando plano chega
- [x] Tratamento de erros (não conectado, timeout)
- [x] Documentar integração

---

## 🎉 Resultado Final

**Usuário agora pode:**

1. ✅ **Conversar com LEX** sobre processos (análise)
2. ✅ **Comandar LEX Agent** via chat (automação)
3. ✅ **Ver planos visualmente** em modal bonito
4. ✅ **Aprovar/rejeitar ações** com um clique
5. ✅ **Acompanhar execução** em tempo real
6. ✅ **NUNCA sair do chat** - zero ruído!

---

**Integração 100% completa!** 🚀

O usuário agora tem:
- 🧠 **LEX** para análise jurídica
- 🤖 **LEX Agent** para automação
- 💬 **Tudo no mesmo chat**
- 🎨 **Interface zero ruído**
