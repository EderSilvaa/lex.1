# ⚡ LEX Agent - Comandos Rápidos

**Versão**: 1.0 | **Data**: 18/10/2025

---

## 🚀 Iniciar Sistema

### 1. Abrir Chrome com Debug
```bash
"C:\Program Files\Google\Chrome\Application\chrome.exe" --remote-debugging-port=9222 --user-data-dir="C:\chrome-debug-profile"
```

### 2. Iniciar Backend
```bash
cd lex-agent-backend
npm start
```

### 3. Verificar Saúde
```bash
curl http://localhost:3000/health
```

---

## 🎮 Comandos do Console (Página PJe)

### Testes Básicos
```javascript
// Verificar status da conexão
lexAgent.getStatus()

// Conectar ao navegador via Playwright
lexAgent.test.connectBrowser()

// Tirar screenshot
lexAgent.test.screenshot()

// Informações da página
lexAgent.test.getPageInfo()
```

### Comandos com GPT-4
```javascript
// Enviar comando em linguagem natural
lexAgent.executeCommand('tirar screenshot desta página')
lexAgent.executeCommand('ler informações do processo')
lexAgent.executeCommand('buscar número do processo')

// Ver último plano recebido
lexAgent.getLastPlan()

// Ver detalhes formatados do plano
lexAgent.showPlanDetails()

// Aprovar e executar plano
lexAgent.approvePlan()
```

---

## 📁 Arquivos Importantes

```
lex-agent-backend/
├── src/server.js           → Backend principal
├── src/action-planner.js   → GPT-4 integration
├── src/pje-executor.js     → Playwright automation
├── .env                    → Configuração (PORT, SUPABASE_KEY)
└── screenshots/            → Screenshots gerados

src/js/
├── lex-init.js             → DOM ready handler
├── lex-agent-connector.js  → WebSocket client
└── lex-agent-page-bridge.js→ Page API (window.lexAgent)
```

---

## 🐛 Troubleshooting Rápido

### Backend não conecta
```bash
# Verificar se porta 3000 está ocupada
netstat -ano | findstr :3000

# Matar processos Node.js
taskkill /F /IM node.exe
```

### Playwright não conecta
```bash
# Verificar se Chrome está em debug mode
curl http://localhost:9222/json/version
```

### Recarregar tudo
1. `Ctrl+C` no backend
2. `cd lex-agent-backend && npm start`
3. `chrome://extensions` → Recarregar extensão
4. `F5` na página do PJe
5. `F12` → Console → Verificar logs

---

## 📊 Mensagens de Sucesso

### Conexão OK
```
✅ Conectado ao LEX Agent Backend
🔑 Session ID: session_...
📤 Sincronizando contexto com backend...
```

### Plano Recebido
```
📋 Plano recebido e armazenado!
```

### Execução Completa
```
🚀 Execução iniciada
⏳ Progresso: 50% - Aguardar carregamento
⏳ Progresso: 100% - Capturar tela
✅ Execução concluída
```

---

## 🔗 Links Úteis

- **Backend Health**: http://localhost:3000/health
- **Chrome Extensions**: chrome://extensions
- **Chrome DevTools**: F12
- **Supabase Edge Functions**: https://nspauxzztflgmxjgevmo.supabase.co/functions/v1/LEX-AGENT-PLANNER

---

## 💡 Dicas

1. **Sempre mantenha o Chrome em debug mode aberto** para Playwright funcionar
2. **Verifique logs do backend** para debugar problemas
3. **Use lexAgent.showPlanDetails()** para ver o que será executado antes de aprovar
4. **Screenshots são salvos em** `lex-agent-backend/screenshots/`
5. **Mensagens do backend aparecem no terminal**, não no console do navegador

---

**Para mais detalhes**: Ver [LEX-AGENT-RESUMO-IMPLEMENTACAO.md](./LEX-AGENT-RESUMO-IMPLEMENTACAO.md)
