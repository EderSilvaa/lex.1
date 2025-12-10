# Como Iniciar Chrome em Modo Debug (CDP)

## Problema Identificado

O backend está tentando conectar ao Chrome via **Chrome DevTools Protocol (CDP)** na porta **9222**, mas o Chrome não está rodando nesse modo.

**Erro nos logs:**
```
❌ Erro ao conectar ao navegador: browserType.connectOverCDP: Timeout 30000ms exceeded.
💡 Dica: Abra o Chrome com: chrome.exe --remote-debugging-port=9222
```

## Solução: Iniciar Chrome com Debug Port

### Opção 1: Via Linha de Comando (Recomendado)

1. **Feche TODAS as instâncias do Chrome** (importante!)

2. Abra o Chrome com o flag de debug:

```cmd
"C:\Program Files\Google\Chrome\Application\chrome.exe" --remote-debugging-port=9222
```

3. Navegue para o PJe e faça login normalmente

4. Verifique se está funcionando: acesse http://localhost:9222/json no navegador
   - Deve mostrar lista de páginas abertas em JSON

### Opção 2: Criar Atalho Permanente

1. Clique com botão direito no ícone do Chrome
2. Selecione **Propriedades**
3. No campo **Destino**, adicione no final:
   ```
   --remote-debugging-port=9222
   ```
4. O campo deve ficar assim:
   ```
   "C:\Program Files\Google\Chrome\Application\chrome.exe" --remote-debugging-port=9222
   ```
5. Clique em **Aplicar** e **OK**

### Opção 3: Script Automático (Windows)

Crie um arquivo `start-chrome-debug.bat`:

```batch
@echo off
echo Fechando Chrome...
taskkill /F /IM chrome.exe /T 2>nul
timeout /t 2 /nobreak >nul

echo Iniciando Chrome em modo debug na porta 9222...
start "" "C:\Program Files\Google\Chrome\Application\chrome.exe" --remote-debugging-port=9222

echo Chrome iniciado! Acesse: http://localhost:9222/json para verificar
pause
```

Execute esse arquivo sempre que for usar o LEX Agent.

## Verificar se Está Funcionando

### Teste 1: Endpoint JSON
Acesse http://localhost:9222/json no navegador
- **Sucesso**: Mostra JSON com lista de páginas
- **Falha**: "Site não pode ser acessado"

### Teste 2: Backend Connection
Execute no terminal do backend:
```bash
curl http://localhost:9222/json
```
Deve retornar JSON com as páginas abertas.

### Teste 3: LEX Agent
1. Abra o PJe
2. Execute no console: `window.lexAgent.executeCommand('teste')`
3. Verifique os logs do backend:
   - ✅ **Sucesso**: "✅ Conectado ao navegador existente"
   - ❌ **Falha**: "❌ Erro ao conectar ao navegador: Timeout 30000ms exceeded"

## Troubleshooting

### Problema: "Timeout 30000ms exceeded"
**Causa**: Chrome não está em modo debug
**Solução**: Feche o Chrome completamente e reabra com `--remote-debugging-port=9222`

### Problema: "Port 9222 already in use"
**Causa**: Já existe um Chrome rodando em debug mode
**Solução**:
```cmd
netstat -ano | findstr :9222
taskkill /F /PID [número_do_pid]
```

### Problema: "Cannot connect to Chrome"
**Causa**: Firewall bloqueando porta 9222
**Solução**: Adicione exceção no firewall para localhost:9222

## Próximos Passos Após Configurar

1. **Reiniciar backend** para aplicar o fix de screenshot:
   ```bash
   cd lex-agent-backend
   npm start
   ```

2. **Testar comando completo**:
   - Abra PJe
   - Execute: `window.lexAgent.executeCommand('pesquisar por petição inicial')`
   - Verifique logs do backend mostrando:
     - `🔌 Conectando ao navegador para capturar screenshot...`
     - `✅ Conectado ao navegador existente`
     - `📸 Capturando screenshot para análise visual...`
     - `✅ Screenshot capturado: XXkB`
     - `👁️ Screenshot capturado para análise visual`

3. **Aprovar ação** e ver execução funcionar sem "page closed" error

---

**Status Atual:**
- [x] Fix aplicado no código para sempre reconectar
- [ ] Chrome precisa ser iniciado em modo debug
- [ ] Backend precisa ser restartado
- [ ] Testar fluxo completo
