# Plano de Migração: LEX Extension → LEX Desktop (Electron)

## Visão Geral

Este documento organiza todo o processo de migração da LEX de extensão Chrome para aplicação desktop usando Electron.

**Objetivo:** Transformar a LEX em uma aplicação desktop profissional, eliminando dependências de extensão Chrome e simplificando a experiência do usuário.

**Timeline estimado:** 11 dias de desenvolvimento

**Status atual:** 📋 Planejamento

---

## Estrutura da Migração

A migração está dividida em **6 fases sequenciais**:

### 📋 [Fase 1: Setup Electron](FASE-1-SETUP-ELECTRON.md)
**Duração:** 1 dia | **Esforço:** Baixo
- Criar estrutura base do projeto Electron
- Configurar package.json e dependências
- Setup inicial de main.js, preload.js e renderer
- Primeiro build de teste

### 🔧 [Fase 2: Main Process e Backend](FASE-2-MAIN-PROCESS.md)
**Duração:** 2 dias | **Esforço:** Médio
- Portar backend Node.js para main process
- Implementar IPC handlers (substituir WebSocket)
- Integrar ActionPlanner e PJeExecutor
- Configurar comunicação com Supabase

### 🎨 [Fase 3: Renderer e Interface](FASE-3-RENDERER-UI.md)
**Duração:** 3 dias | **Esforço:** Alto
- Adaptar content-simple.js para renderer
- Portar componentes de UI (chat, modais)
- Implementar módulos de cache e contexto
- Integrar PDF.js e Tesseract.js

### 🌐 [Fase 4: BrowserView PJe](FASE-4-BROWSERVIEW-PJE.md)
**Duração:** 2 dias | **Esforço:** Médio
- Criar BrowserView embutido para PJe
- Implementar gestão de cookies e sessão
- Integrar Playwright para automação
- Testar extração de dados do DOM

### ✅ [Fase 5: Testes e Validação](FASE-5-TESTES.md)
**Duração:** 2 dias | **Esforço:** Médio
- Testes de análise de processos
- Testes de geração de minutas
- Testes de automação Playwright
- Testes de performance e estabilidade

### 📦 [Fase 6: Build e Distribuição](FASE-6-BUILD-DISTRIBUICAO.md)
**Duração:** 1 dia | **Esforço:** Baixo
- Configurar electron-builder
- Criar executável Windows (.exe)
- Testar instalação
- Preparar update automático

---

## Arquivos de Referência

- **[Mapeamento de APIs Chrome → Electron](MAPEAMENTO-APIS-CHROME-ELECTRON.md)**
- **[Arquitetura Electron Proposta](ARQUITETURA-ELECTRON-PROPOSTA.md)**
- **[Checklist Completa](CHECKLIST-MIGRACAO-ELECTRON.md)**

---

## Métricas do Projeto

### Arquivos a Migrar

| Categoria | Arquivos | Tamanho Total | Esforço |
|-----------|----------|---------------|---------|
| **Core (CRÍTICO)** | 6 arquivos | 270 KB | Alto |
| **Módulos (IMPORTANTE)** | 11 arquivos | 250 KB | Médio |
| **Bibliotecas (REUTILIZAR)** | 2 arquivos | 386 KB | Baixo |
| **Backend (INTEGRAR)** | 3 arquivos | 1070 linhas | Médio |
| **CSS/Assets** | 3 arquivos | 55 KB | Baixo |

**Total:** 25 arquivos principais

### Mudanças por Categoria

| Tipo de Mudança | Quantidade | Complexidade |
|-----------------|------------|--------------|
| API Replacements | 15 ocorrências | Média |
| WebSocket → IPC | 8 handlers | Média |
| Storage Migration | 5 sistemas | Baixa |
| UI Adaptation | 3 componentes | Alta |
| Browser Integration | 1 sistema | Alta |

---

## Cronograma

```
Semana 1:
├─ Seg: Fase 1 (Setup)
├─ Ter: Fase 2 (Main Process) - Dia 1
├─ Qua: Fase 2 (Main Process) - Dia 2
├─ Qui: Fase 3 (Renderer UI) - Dia 1
└─ Sex: Fase 3 (Renderer UI) - Dia 2

Semana 2:
├─ Seg: Fase 3 (Renderer UI) - Dia 3
├─ Ter: Fase 4 (BrowserView) - Dia 1
├─ Qua: Fase 4 (BrowserView) - Dia 2
├─ Qui: Fase 5 (Testes) - Dia 1
└─ Sex: Fase 5 (Testes) - Dia 2

Semana 3:
└─ Seg: Fase 6 (Build/Deploy)
```

---

## Riscos e Mitigações

### 🔴 Riscos Altos

**1. Gestão de Cookies do PJe**
- **Risco:** PJe tem autenticação complexa, cookies podem não ser preservados
- **Mitigação:** Usar `session.cookies` do Electron + testes extensivos
- **Plano B:** CDP com Playwright (como funciona hoje)

**2. Performance do Main Process**
- **Risco:** Backend embutido pode sobrecarregar main process
- **Mitigação:** Usar workers para tarefas pesadas (PDF processing, OCR)
- **Plano B:** Manter backend separado (híbrido)

**3. Tamanho do Executável**
- **Risco:** ~150-200 MB pode ser grande para alguns usuários
- **Mitigação:** Compressão com electron-builder, remover dependências não usadas
- **Plano B:** Download sob demanda de componentes pesados

### 🟡 Riscos Médios

**4. Compatibilidade de Dados**
- **Risco:** Migração de localStorage pode falhar
- **Mitigação:** Ferramenta de migração automática
- **Plano B:** Usuário reconfigura manualmente

**5. Debugging Complexo**
- **Risco:** Mais difícil debugar que extensão
- **Mitigação:** Chrome DevTools ainda funciona + logs detalhados
- **Plano B:** Modo debug separado

---

## Decisões Arquiteturais

### ✅ Decisões Tomadas

1. **Electron** (vs Tauri/PWA)
   - Melhor suporte para automação web
   - Backend Node.js reaproveitável
   - Playwright funciona nativamente

2. **BrowserView embutido** (vs CDP externo)
   - Mais integrado e profissional
   - Gestão de sessão centralizada
   - Fallback para CDP se necessário

3. **IPC direto** (vs WebSocket interno)
   - Mais performático
   - Menos overhead
   - Mais simples de manter

4. **electron-store** (vs localStorage)
   - Suporte nativo a persistência
   - Melhor performance
   - Mais seguro

### ⏳ Decisões Pendentes (para POC)

1. **BrowserView vs BrowserWindow separado**
   - Testar UX de cada abordagem
   - Validar performance

2. **Main process único vs Workers**
   - Medir overhead do main process
   - Decidir se PDF/OCR vai para worker

3. **Chromium embutido vs Chrome externo**
   - Validar se cookies funcionam bem
   - Testar estabilidade da automação

---

## Próximos Passos Imediatos

### Hoje:
1. ✅ Análise completa da arquitetura (CONCLUÍDO)
2. ✅ Criação de documentação de migração (CONCLUÍDO)
3. 🔄 Review e alinhamento do plano
4. ⏭️ Iniciar Fase 1 (Setup Electron)

### Esta Semana:
1. Completar Fases 1 e 2
2. Iniciar Fase 3
3. Validar viabilidade técnica

### Próxima Semana:
1. Completar Fases 3, 4 e 5
2. Ter versão beta funcional

---

## Recursos e Referências

### Documentação Oficial
- [Electron Documentation](https://www.electronjs.org/docs)
- [electron-builder](https://www.electron.build/)
- [Playwright with Electron](https://playwright.dev/docs/api/class-electron)

### Código de Exemplo
- `docs/examples/electron-poc/` (a ser criado na Fase 1)

### Arquitetura Atual
- [ARQUITETURA.md](architecture/ARQUITETURA.md) - Documentação completa
- [MIGRACAO-ELECTRON.md](MIGRACAO-ELECTRON.md) - Guia inicial

---

## Contato e Suporte

**Dúvidas durante migração:**
- Consultar documentação oficial do Electron
- Revisar código de exemplo em `docs/examples/`
- Consultar mapeamento de APIs

**Issues conhecidos:**
- Serão documentados em `docs/ISSUES-MIGRACAO.md` conforme aparecerem

---

## Status das Fases

| Fase | Status | Progresso | Data Início | Data Conclusão |
|------|--------|-----------|-------------|----------------|
| Fase 1 | ⏳ Pendente | 0% | - | - |
| Fase 2 | ⏳ Pendente | 0% | - | - |
| Fase 3 | ⏳ Pendente | 0% | - | - |
| Fase 4 | ⏳ Pendente | 0% | - | - |
| Fase 5 | ⏳ Pendente | 0% | - | - |
| Fase 6 | ⏳ Pendente | 0% | - | - |

**Legenda:**
- ⏳ Pendente
- 🔄 Em Progresso
- ✅ Concluído
- ❌ Bloqueado
- ⚠️ Com Issues

---

**Última atualização:** 2025-12-10
**Versão do documento:** 1.0
