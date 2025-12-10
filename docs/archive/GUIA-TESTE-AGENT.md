# 🧪 Guia de Teste - LEX Agent Backend

## ✅ Status Atual - SISTEMA FUNCIONAL

- [x] Backend criado e rodando
- [x] WebSocket funcionando
- [x] Connector criado na extensão
- [x] Teste de conexão Extension ↔ Backend ✅
- [x] Teste de execução de comando ✅
- [x] GPT-4 Planner integrado via Supabase Edge Function ✅
- [x] Playwright conectado ao Chrome via CDP ✅
- [x] Fluxo completo testado: Comando → Plan → Aprovação → Execução ✅
- [x] Screenshot funcional ✅

**Data da última atualização**: 18 de outubro de 2025
**Versão**: MVP 1.0 - Funcional

---

## 🚀 Passo a Passo para Testar

### 1. Verificar que o Backend está Rodando

O backend já está rodando em segundo plano. Verifique com:

```bash
curl http://localhost:3000/health
```

Deve retornar:
```json
{
  "status": "ok",
  "uptime": 20.05,
  "activeSessions": 0,
  "timestamp": "2025-10-14T19:19:03.494Z"
}
```

---

### 2. Recarregar a Extensão

1. Abra o Chrome
2. Vá em `chrome://extensions`
3. Encontre **Lex.**
4. Clique em **🔄 Recarregar**

---

### 3. Acessar uma Página do PJe

1. Navegue para: https://pje.tjpa.jus.br
2. Faça login (se necessário)
3. Entre em qualquer processo

---

### 4. Abrir o Console do Desenvolvedor

1. Pressione **F12**
2. Vá na aba **Console**

---

### 5. Verificar Conexão

No console, você deve ver mensagens automáticas:

```
🔌 LexAgentConnector inicializado
✅ LexAgentConnector carregado
🔌 Tentando conectar ao LEX Agent Backend...
🔌 Conectando ao backend: ws://localhost:3000
✅ Conectado ao LEX Agent Backend
🔑 Session ID: session_1728...
📤 Sincronizando contexto com backend...
```

Se **NÃO** ver essas mensagens, aguarde alguns segundos ou digite:

```javascript
window.lexAgentConnector.connect()
```

---

### 6. Testar Manualmente a Conexão

**IMPORTANTE**: Devido ao isolamento de contexto dos content scripts, use a API `lexAgent` (não `lexAgentConnector`).

No console, digite:

```javascript
// Verificar status
lexAgent.getStatus()
```

---

### 7. Abrir Chrome com Remote Debugging (Obrigatório para Playwright)

Para que o Playwright possa controlar o navegador, você precisa abri-lo com remote debugging:

**Windows**:
```bash
"C:\Program Files\Google\Chrome\Application\chrome.exe" --remote-debugging-port=9222
```

**Windows com perfil separado** (recomendado):
```bash
"C:\Program Files\Google\Chrome\Application\chrome.exe" --remote-debugging-port=9222 --user-data-dir="C:\chrome-debug-profile"
```

Mantenha esta janela do Chrome aberta para o LEX Agent funcionar.

---

### 8. Testar Conexão do Playwright

No console da página do PJe, digite:

```javascript
// Conectar ao navegador
lexAgent.test.connectBrowser()
```

Você verá:
```
🧪 RESULTADO DO TESTE
Ação: connect
Status: ✅ SUCESSO
Mensagem: ✅ Conectado ao navegador com sucesso!
```

---

### 9. Enviar um Comando de Teste

```javascript
// Enviar comando simples
lexAgent.executeCommand('tirar screenshot desta página')
```

No console, você verá:
```
🚀 LEX Agent: Enviando comando: tirar screenshot desta página
```

Após alguns segundos, a extensão receberá um **plano de ação**:

```
📋 Plano recebido e armazenado!
```

---

### 10. Ver Detalhes do Plano

```javascript
// Ver último plano recebido
lexAgent.showPlanDetails()
```

Você verá algo como:
```
============================================================
📋 DETALHES DO PLANO DE AÇÃO
============================================================

🎯 INTENÇÃO:
  Ação: screenshot
  Descrição: Capturar screenshot da página atual

📝 PASSOS A EXECUTAR:

  1. Aguardar o carregamento completo da página do processo
     Tipo: waitForSelector
     Seletor: body
     Motivo: Garantir que a página está totalmente carregada

  2. Capturar a tela atual
     Tipo: screenshot
     Motivo: Registrar visualmente o estado atual da página

⚠️ RISCOS IDENTIFICADOS:

  1. [LOW] Nenhum risco significativo
     Mitigação: Operação de leitura apenas

🔒 APROVAÇÃO NECESSÁRIA: NÃO
⏱️ TEMPO ESTIMADO: 3 segundos
============================================================
```

---

### 11. Aprovar e Executar

```javascript
// Aprovar o plano
lexAgent.approvePlan()
```

Você verá a execução em progresso:

```
✅ Aprovando execução do plano...
🚀 Execução iniciada
⏳ Progresso: 50% - Aguardar o carregamento completo da página do processo
⏳ Progresso: 100% - Capturar a tela atual
✅ Execução concluída
```

O screenshot será salvo em `lex-agent-backend/screenshots/test-[timestamp].png`

---

## 🎯 Próximos Passos

Agora que a **comunicação funciona**, os próximos passos são:

1. **Integrar com a Interface da LEX**
   - Mostrar planos de ação no chat
   - Botões de aprovar/cancelar
   - Barra de progresso

2. **Implementar Execução Real com Playwright**
   - Navegação no PJe
   - Preenchimento de formulários
   - Anexo de documentos

3. **Adicionar Análise de Contexto com GPT-4**
   - Entender fase processual
   - Identificar próximas ações
   - Gerar recomendações

---

## 🐛 Troubleshooting

### Erro: "Não foi possível conectar ao backend"

✅ **Solução**: Verificar se o servidor está rodando

```bash
# No terminal
curl http://localhost:3000/health
```

Se não responder, reinicie:
```bash
cd lex-agent-backend
npm run dev
```

---

### Erro: "WebSocket connection failed"

✅ **Solução 1**: Verificar se a porta 3000 está livre

```bash
# Windows
netstat -ano | findstr :3000
```

✅ **Solução 2**: Mudar porta no `.env`

```env
PORT=3001
```

E no `lex-agent-connector.js`:
```javascript
this.backendUrl = 'ws://localhost:3001';
```

---

### Conexão cai constantemente

✅ **Solução**: Verificar firewall/antivírus

- Permitir conexões localhost na porta 3000
- Desabilitar temporariamente para testar

---

### Mensagens não aparecem no console

✅ **Solução**: Recarregar extensão E página

1. `chrome://extensions` → Recarregar extensão
2. F5 na página do PJe
3. F12 → Console → Verificar mensagens

---

## 📊 Verificar Logs do Backend

No terminal onde o backend está rodando, você verá:

```
🔌 Nova conexão WebSocket: session_1728...
📨 Mensagem recebida [...]: update_context
📊 Contexto atualizado [...]
📨 Mensagem recebida [...]: execute_command
🚀 Executando comando: "protocolar petição"
✅ Step 1 concluído: Navegar para "Nova Petição"
✅ Step 2 concluído: Preencher campos obrigatórios
...
```

---

## ✨ Teste Bem-Sucedido!

Se você conseguiu:

- ✅ Ver mensagens de conexão
- ✅ Enviar comando
- ✅ Receber plano de ação
- ✅ Ver progresso de execução

**Parabéns! A base do LEX Agent está funcionando!** 🎉

Agora podemos evoluir para:
- Interface visual dos planos
- Automação real com Playwright
- Análise inteligente com GPT-4

---

**Precisa de ajuda?** Verifique os logs do backend e do console do navegador.
