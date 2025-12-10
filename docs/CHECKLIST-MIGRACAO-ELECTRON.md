# Checklist Completo de Migração: LEX Extension → Electron

Este documento consolida TODAS as tarefas necessárias para a migração completa.

**Status geral:** ⏳ Não iniciado
**Última atualização:** 2025-12-10

---

## 📋 FASE 1: Setup Electron (1 dia)

### Estrutura de Projeto
- [ ] Criar diretório `lex-desktop`
- [ ] Criar estrutura de pastas (src/main, src/renderer, src/preload, src/backend)
- [ ] Inicializar projeto Node.js (`npm init -y`)
- [ ] Criar .gitignore

### Dependências
- [ ] Instalar Electron (`npm install electron --save-dev`)
- [ ] Instalar electron-builder (`npm install electron-builder --save-dev`)
- [ ] Instalar electron-store (`npm install electron-store --save`)
- [ ] Instalar express (`npm install express --save`)
- [ ] Instalar ws (`npm install ws --save`)
- [ ] Instalar playwright (`npm install playwright --save`)
- [ ] Instalar openai (`npm install openai --save`)
- [ ] Instalar dotenv (`npm install dotenv --save`)
- [ ] Instalar node-fetch@2 (`npm install node-fetch@2 --save`)

### Arquivos Principais
- [ ] Criar `src/main/main.js` (Main process)
- [ ] Criar `src/preload/preload.js` (Preload script)
- [ ] Criar `src/renderer/index.html` (Interface básica)
- [ ] Criar `src/renderer/styles.css` (Estilos básicos)
- [ ] Criar `src/renderer/renderer.js` (Script do renderer)

### Configuração
- [ ] Configurar package.json (scripts, main, build)
- [ ] Configurar electron-builder básico

### Validação
- [ ] App Electron executa (`npm start`)
- [ ] Janela abre sem erros
- [ ] DevTools funciona
- [ ] IPC básico funciona (ping/pong)
- [ ] Versões aparecem na interface

---

## 🔧 FASE 2: Main Process e Backend (2 dias)

### Copiar Backend
- [ ] Copiar `lex-agent-backend/src/action-planner.js`
- [ ] Copiar `lex-agent-backend/src/pje-executor.js`
- [ ] Copiar `lex-agent-backend/src/server.js` (para referência)
- [ ] Copiar `.env` com chaves Supabase

### Adaptar Action Planner
- [ ] Importar dependências corretas
- [ ] Configurar carregamento de .env
- [ ] Validar integração com Supabase Edge Function
- [ ] Testar criação de plano
- [ ] Adicionar logs de debug

### Adaptar PJE Executor
- [ ] Adaptar paths para app.getPath()
- [ ] Criar diretório de screenshots automaticamente
- [ ] Manter conexão CDP (temporariamente)
- [ ] Adicionar logs de debug
- [ ] Testar conexão com navegador

### Backend Manager
- [ ] Criar `src/main/backend-manager.js`
- [ ] Implementar gestão de sessões
- [ ] Implementar `createSession()`
- [ ] Implementar `executeCommand()`
- [ ] Implementar `executePlan()`
- [ ] Implementar `testBrowserConnection()`
- [ ] Implementar `getPageContext()`
- [ ] Implementar `takeScreenshot()`

### IPC Handlers
- [ ] Handler: `create-session`
- [ ] Handler: `update-context`
- [ ] Handler: `execute-command`
- [ ] Handler: `execute-plan`
- [ ] Handler: `cancel-action`
- [ ] Handler: `test-browser-connection`
- [ ] Handler: `get-page-context`
- [ ] Handler: `take-screenshot`
- [ ] Handler: `ping`
- [ ] Handler: `get-app-version`

### Preload Script
- [ ] Expor `createSession()`
- [ ] Expor `updateContext()`
- [ ] Expor `executeCommand()`
- [ ] Expor `executePlan()`
- [ ] Expor `cancelAction()`
- [ ] Expor `testBrowserConnection()`
- [ ] Expor `getPageContext()`
- [ ] Expor `takeScreenshot()`
- [ ] Expor listeners: `onPlanCreated`, `onExecutionStarted`, etc.

### Interface de Teste
- [ ] Criar UI de teste do backend
- [ ] Botão: Testar conexão navegador
- [ ] Botão: Criar sessão
- [ ] Botão: Executar comando
- [ ] Botão: Obter contexto página
- [ ] Visualizar resultados

### Integração
- [ ] Inicializar BackendManager no main.js
- [ ] Testar ActionPlanner cria planos
- [ ] Testar PJeExecutor conecta
- [ ] Testar IPC bidirecional
- [ ] Verificar sem memory leaks

### Validação
- [ ] Backend integrado sem erros
- [ ] IPC handlers funcionando
- [ ] ActionPlanner gerando planos
- [ ] PJeExecutor conectando
- [ ] Logs claros no console
- [ ] Testes passando

---

## 🎨 FASE 3: Renderer e Interface (3 dias)

### Copiar Módulos
- [ ] Copiar `session-context.js`
- [ ] Copiar `document-cache.js`
- [ ] Copiar `document-classifier.js`
- [ ] Copiar `process-analyzer.js`
- [ ] Copiar `process-crawler.js`
- [ ] Copiar `minuta-generator.js`
- [ ] Copiar `document-detector.js`
- [ ] Copiar `model-cache.js`
- [ ] Copiar `pje-model-detector.js`
- [ ] Copiar `pdf.min.js`
- [ ] Copiar `tesseract.min.js`

### Adaptar content-simple.js
- [ ] Criar `src/renderer/js/chat-controller.js`
- [ ] Remover APIs Chrome (`chrome.runtime.*`, `chrome.storage.*`)
- [ ] Substituir por IPC (`window.electronAPI.*`)
- [ ] Adaptar carregamento de CSS
- [ ] Adaptar sistema de chat
- [ ] Implementar `initialize()`
- [ ] Implementar `sendMessage()`
- [ ] Implementar `addMessage()`
- [ ] Implementar `prepareContext()`
- [ ] Implementar `handlePlanCreated()`
- [ ] Implementar `showApprovalButtons()`
- [ ] Implementar `loadHistory()`
- [ ] Implementar `saveHistory()`
- [ ] Configurar listeners de backend

### Interface HTML
- [ ] Criar `src/renderer/chat.html`
- [ ] Estrutura HTML completa
- [ ] Referenciar bibliotecas (PDF.js, Tesseract, Marked)
- [ ] Referenciar módulos LEX
- [ ] Referenciar chat-controller.js
- [ ] Script de inicialização
- [ ] Meta tags CSP

### CSS
- [ ] Copiar e adaptar `chat-styles.css`
- [ ] Ajustar para fullscreen (não overlay)
- [ ] Ajustar tamanhos para desktop
- [ ] Manter design system v3.0
- [ ] Criar `styles/main.css`
- [ ] Criar `styles/modal.css`

### Markdown
- [ ] Baixar `marked.min.js`
- [ ] Integrar no chat-controller.js
- [ ] Testar renderização de markdown

### Modais e Toasts
- [ ] Criar `src/renderer/js/ui-components.js`
- [ ] Implementar `ModalManager.show()`
- [ ] Implementar `ModalManager.toast()`
- [ ] Criar CSS de modais
- [ ] Criar CSS de toasts
- [ ] Testar modais
- [ ] Testar toasts

### Bibliotecas
- [ ] Validar PDF.js funciona
- [ ] Validar Tesseract.js funciona
- [ ] Testar extração de PDF
- [ ] Testar OCR de imagem

### Validação
- [ ] Interface completa carrega
- [ ] Chat envia mensagens
- [ ] Chat recebe respostas
- [ ] Markdown renderiza
- [ ] Modais funcionam
- [ ] Toasts funcionam
- [ ] Histórico persiste
- [ ] PDF.js integrado
- [ ] Tesseract integrado
- [ ] Sem erros no console

---

## 🌐 FASE 4: BrowserView PJe (2 dias)

### PJe Manager
- [ ] Criar `src/main/pje-manager.js`
- [ ] Implementar `initialize()`
- [ ] Criar BrowserView
- [ ] Configurar bounds e auto-resize
- [ ] Implementar `setupEventListeners()`
- [ ] Implementar `navigateTo()`
- [ ] Implementar `executeScript()`
- [ ] Implementar `getPageData()`
- [ ] Implementar `screenshot()`
- [ ] Implementar `getCookies()`
- [ ] Implementar `clearCookies()`
- [ ] Implementar `show()` / `hide()`
- [ ] Implementar `destroy()`

### Integração Main Process
- [ ] Inicializar PJeManager no main.js
- [ ] Handler: `pje-initialize`
- [ ] Handler: `pje-navigate`
- [ ] Handler: `pje-execute-script`
- [ ] Handler: `pje-get-page-data`
- [ ] Handler: `pje-screenshot`
- [ ] Handler: `pje-show`
- [ ] Handler: `pje-hide`
- [ ] Expor handlers no preload.js

### Adaptar PJeExecutor
- [ ] Modificar para usar PJeManager em vez de CDP
- [ ] Adaptar `initialize()`
- [ ] Adaptar `getPageContext()`
- [ ] Adaptar `screenshotBase64()`
- [ ] Adaptar `executeAction()` para BrowserView
- [ ] Testar actions (click, fill, navigate, wait)

### UI de Controle
- [ ] Adicionar controles PJe no chat.html
- [ ] Botão: Abrir PJe
- [ ] Botão: Ocultar PJe
- [ ] Botão: Mostrar PJe
- [ ] Input: URL personalizada
- [ ] Botão: Navegar
- [ ] Implementar handlers em chat-controller.js

### Sincronização Backend
- [ ] Modificar BackendManager para usar PJeManager
- [ ] Capturar screenshot do BrowserView
- [ ] Incluir pageData no contexto
- [ ] Testar integração completa

### Testes
- [ ] BrowserView carrega
- [ ] Navegação funciona
- [ ] Cookies persistem
- [ ] Scripts executam
- [ ] Screenshots capturam
- [ ] Dados extraem corretamente
- [ ] Show/Hide funciona

### Validação
- [ ] PJe abre no BrowserView
- [ ] Login persiste (cookies)
- [ ] Extração de dados OK
- [ ] Automação executa ações
- [ ] Screenshots funcionam
- [ ] Sincronização com backend OK

---

## ✅ FASE 5: Testes e Validação (2 dias)

### Testes Funcionais
- [ ] Teste: Chat envia mensagem
- [ ] Teste: Chat recebe resposta
- [ ] Teste: Histórico salva
- [ ] Teste: Markdown renderiza
- [ ] Teste: Comandos especiais funcionam
- [ ] Teste: Análise de processos completa
- [ ] Teste: Descoberta de documentos
- [ ] Teste: Download de PDFs
- [ ] Teste: Extração de texto (PDF.js)
- [ ] Teste: OCR (Tesseract)
- [ ] Teste: Classificação de documentos
- [ ] Teste: Geração de análise com IA
- [ ] Teste: Geração de minutas
- [ ] Teste: Busca de templates PJe
- [ ] Teste: Preenchimento de campos
- [ ] Teste: Formatação de texto
- [ ] Teste: Comando de automação
- [ ] Teste: Plano criado
- [ ] Teste: Modal de aprovação
- [ ] Teste: Execução de ações
- [ ] Teste: Progresso em tempo real
- [ ] Teste: Conclusão notificada

### Testes de Integração
- [ ] IPC bidirecional (invoke/handle)
- [ ] Eventos chegam corretamente
- [ ] Erros são capturados
- [ ] Sem timeouts
- [ ] BrowserView carrega
- [ ] Scripts executam
- [ ] Screenshots funcionam
- [ ] Dados extraídos
- [ ] PLANNER responde
- [ ] OPENIA responde
- [ ] Vision funciona
- [ ] Streaming OK
- [ ] Erros tratados

### Testes de Performance
- [ ] Inicialização < 5s
- [ ] Interface carrega < 1s
- [ ] Envio mensagem < 200ms
- [ ] Resposta IA < 10s
- [ ] Criar plano < 15s
- [ ] Download PDF (1MB) < 2s
- [ ] Extração texto (10 pág) < 5s
- [ ] Screenshot < 1s
- [ ] Main process < 300 MB
- [ ] Renderer < 200 MB
- [ ] BrowserView < 500 MB
- [ ] 6 downloads simultâneos OK
- [ ] 3 sessões ativas OK
- [ ] Múltiplos comandos em fila OK

### Testes de Estabilidade
- [ ] 50 comandos executados sem crash
- [ ] 20 documentos processados sem crash
- [ ] 10 minutas geradas sem crash
- [ ] App aberto por 2+ horas sem crash
- [ ] Memória estável ao longo do tempo
- [ ] Performance mantida
- [ ] Perda de internet tratada
- [ ] Supabase indisponível tratado
- [ ] PJe não responde tratado
- [ ] PDF corrompido tratado
- [ ] Comando inválido tratado

### Testes de UX
- [ ] Interface intuitiva
- [ ] Feedback visual claro
- [ ] Transições suaves
- [ ] Botões responsivos
- [ ] Atalhos de teclado funcionam
- [ ] Contraste adequado
- [ ] Fonte legível
- [ ] Navegável por teclado
- [ ] Mensagens de erro claras

### Correção de Bugs
- [ ] Todos os bugs documentados
- [ ] Bugs críticos corrigidos
- [ ] Regression tests passando
- [ ] Documento `BUGS-ENCONTRADOS.md` criado

### Validação
- [ ] Matriz de testes completa
- [ ] 100% dos testes funcionais passando
- [ ] Performance dentro dos limites
- [ ] Sem memory leaks
- [ ] App estável
- [ ] UX aprovada

---

## 📦 FASE 6: Build e Distribuição (1 dia)

### Configuração
- [ ] electron-builder configurado no package.json
- [ ] Seção "build" completa
- [ ] Targets definidos (nsis, portable)
- [ ] Scripts de build criados

### Ícones
- [ ] Criar/obter ícone da aplicação
- [ ] Gerar icon.ico (múltiplos tamanhos)
- [ ] Gerar icon.png (1024×1024)
- [ ] Salvar em `assets/icons/`
- [ ] Referenciar no package.json

### Arquivos de Build
- [ ] Criar LICENSE
- [ ] Criar README.md (distribuição)
- [ ] Criar CHANGELOG.md

### Primeiro Build
- [ ] Executar `npm run build:win`
- [ ] Validar .exe gerado
- [ ] Verificar tamanho (< 250 MB)
- [ ] Testar em máquina limpa

### Testes de Instalação
- [ ] Executar instalador
- [ ] Verificar atalhos criados
- [ ] Abrir app
- [ ] Testar funcionalidades
- [ ] Reabrir app (verificar persistência)
- [ ] Desinstalar
- [ ] Verificar limpeza completa

### Auto-Update
- [ ] Instalar electron-updater
- [ ] Criar `src/main/updater.js`
- [ ] Implementar UpdateManager
- [ ] Integrar em main.js
- [ ] Criar GitHub repository
- [ ] Configurar publish no package.json

### Documentação
- [ ] Criar `docs/DISTRIBUICAO.md`
- [ ] Documentar processo de build
- [ ] Documentar versionamento
- [ ] Documentar distribuição

### Material de Marketing
- [ ] Capturar screenshots (4-5)
- [ ] Criar descrição curta
- [ ] Salvar em `marketing/`

### Release
- [ ] Criar tag `v1.0.0`
- [ ] Criar GitHub Release
- [ ] Título: "LEX Desktop 1.0.0 - Initial Release"
- [ ] Copiar CHANGELOG para descrição
- [ ] Upload `LEX-Desktop-Setup-1.0.0.exe`
- [ ] Upload `latest.yml`
- [ ] Marcar como "Latest release"
- [ ] Publicar

### Validação
- [ ] Build funcional gerado
- [ ] Instalador testado
- [ ] Auto-update configurado
- [ ] Documentação completa
- [ ] Release publicada
- [ ] Material de marketing pronto

---

## 📊 Resumo por Fase

| Fase | Tarefas Totais | Duração | Status |
|------|----------------|---------|--------|
| Fase 1 | 20 tarefas | 1 dia | ⏳ Pendente |
| Fase 2 | 40 tarefas | 2 dias | ⏳ Pendente |
| Fase 3 | 50 tarefas | 3 dias | ⏳ Pendente |
| Fase 4 | 35 tarefas | 2 dias | ⏳ Pendente |
| Fase 5 | 85 tarefas | 2 dias | ⏳ Pendente |
| Fase 6 | 35 tarefas | 1 dia | ⏳ Pendente |
| **TOTAL** | **265 tarefas** | **11 dias** | **0% completo** |

---

## 🎯 Marcos Importantes

### Marco 1: Setup Completo (Fim da Fase 1)
- [ ] Electron executando
- [ ] IPC funcionando
- [ ] Primeira build de dev OK

### Marco 2: Backend Integrado (Fim da Fase 2)
- [ ] Backend Node.js integrado
- [ ] IPC handlers completos
- [ ] ActionPlanner e PJeExecutor funcionando

### Marco 3: Interface Completa (Fim da Fase 3)
- [ ] Chat funcional
- [ ] Módulos portados
- [ ] UI completa

### Marco 4: PJe Integrado (Fim da Fase 4)
- [ ] BrowserView funcionando
- [ ] Automação executando
- [ ] Extração de dados OK

### Marco 5: Testes Aprovados (Fim da Fase 5)
- [ ] Todos os testes passando
- [ ] Bugs corrigidos
- [ ] Performance validada

### Marco 6: Release Publicada (Fim da Fase 6)
- [ ] Build de produção gerado
- [ ] GitHub Release publicada
- [ ] Documentação completa

---

## 🚨 Bloqueadores Críticos

### Identificados
- [ ] Nenhum bloqueador no momento

### Riscos Altos
- ⚠️ Gestão de cookies do PJe pode falhar
- ⚠️ Performance do main process pode ser insuficiente
- ⚠️ Tamanho do executável pode ser muito grande

### Mitigações Planejadas
- ✅ Usar session.cookies do Electron
- ✅ Workers para tarefas pesadas
- ✅ Compressão com electron-builder

---

## 📈 Progresso Geral

```
Fase 1: [░░░░░░░░░░] 0%
Fase 2: [░░░░░░░░░░] 0%
Fase 3: [░░░░░░░░░░] 0%
Fase 4: [░░░░░░░░░░] 0%
Fase 5: [░░░░░░░░░░] 0%
Fase 6: [░░░░░░░░░░] 0%

TOTAL:  [░░░░░░░░░░] 0%
```

**Legenda:**
- `█` Completo
- `▓` Em progresso
- `░` Pendente

---

## 🎉 Ao Completar Todas as Tarefas

Quando todas as 265 tarefas estiverem marcadas como concluídas:

### Você terá:
✅ LEX Desktop funcional e estável
✅ Aplicação profissional distribuível
✅ Auto-update configurado
✅ Documentação completa
✅ Testes aprovados
✅ Release publicada

### Próximos passos:
1. Coletar feedback dos usuários
2. Monitorar issues no GitHub
3. Planejar versão 1.1.0
4. Considerar outras plataformas (macOS, Linux)
5. Implementar analytics
6. Publicar na Microsoft Store (opcional)

---

**Última atualização:** 2025-12-10
**Versão do checklist:** 1.0

**Começar migração:** Ir para [FASE-1-SETUP-ELECTRON.md](FASE-1-SETUP-ELECTRON.md)
