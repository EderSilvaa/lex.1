# 📋 Plano de Implementação: Fetch de Documentos (Qualquer Aba)

**Data:** 30/09/2025
**Solução:** Fetch direto da página de documentos
**Tempo estimado:** 2-3 horas

---

## 🎯 Objetivo

Permitir que o usuário execute "Análise Completa" **de qualquer aba** do processo no PJe, sem precisar navegar até a aba "Docs".

---

## 🏗️ Arquitetura da Solução

```
┌─────────────────────────────────────────────────────────────┐
│ Usuário clica "Análise Completa" (QUALQUER ABA)            │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│ ProcessCrawler.discoverAllDocuments()                       │
│                                                              │
│ ┌──────────────────────────────────────────────────────┐  │
│ │ VERIFICAÇÃO: Estou na aba de documentos?             │  │
│ │                                                        │  │
│ │ isOnDocumentsPage()                                   │  │
│ │ ├─ Verifica URL: contains('listAutosDigitais')       │  │
│ │ └─ Verifica DOM: existe 'a[href*="idProcessoDo..."]' │  │
│ └──────────────────────────────────────────────────────┘  │
│                    │                │                        │
│                    ▼                ▼                        │
│                  SIM              NÃO                        │
│                    │                │                        │
│   ┌────────────────┘                └──────────────┐        │
│   │                                                 │        │
│   ▼                                                 ▼        │
│ ┌───────────────────────┐      ┌────────────────────────┐ │
│ │ ESTRATÉGIA A:         │      │ ESTRATÉGIA B:          │ │
│ │ DOM Scraping Direto   │      │ Fetch da Página Docs   │ │
│ │                       │      │                        │ │
│ │ • Mais rápido (~50ms) │      │ • Invisível (~500ms)   │ │
│ │ • Sem requisição      │      │ • Funciona de qualquer │ │
│ │ • Confiável 100%      │      │   aba                  │ │
│ └───────────────────────┘      └────────────────────────┘ │
│            │                              │                 │
│            └──────────┬──────────────────┘                 │
│                       ▼                                     │
│         Array de documentos descobertos                     │
└─────────────────────────────────────────────────────────────┘
```

---

## 📝 Especificação Técnica

### **1. Detector de Aba de Documentos**

#### **Método:** `isOnDocumentsPage()`

**Objetivo:** Verificar se usuário já está na aba de documentos

**Lógica:**
```javascript
isOnDocumentsPage() {
  // Verifica 1: URL contém identificador da página de docs
  if (window.location.href.includes('listAutosDigitais.seam')) {
    return true;
  }

  // Verifica 2: Existem links de documentos no DOM atual
  const docLinks = document.querySelectorAll('a[href*="idProcessoDocumento"]');
  if (docLinks.length > 0) {
    return true;
  }

  // Não está na página de docs
  return false;
}
```

**Casos de teste:**
```javascript
// URL: https://pje.tjpa.jus.br/.../listAutosDigitais.seam?...
isOnDocumentsPage() // → true

// URL: https://pje.tjpa.jus.br/.../consultaProcesso.seam?...
// (aba "Dados do Processo")
isOnDocumentsPage() // → false
```

---

### **2. Extrator de ID do Processo**

#### **Método:** `extractProcessIdFromUrl()`

**Objetivo:** Extrair ID do processo da URL atual (qualquer aba)

**URLs observadas no PJe-TJPA:**
```
1. Aba Docs:
   https://pje.tjpa.jus.br/.../listAutosDigitais.seam?idProcesso=7940963&...

2. Aba Dados:
   https://pje.tjpa.jus.br/.../consultaProcesso.seam?idProcesso=7940963&...

3. Aba Movimentações:
   https://pje.tjpa.jus.br/.../movimentacoes.seam?idProcesso=7940963&...

Padrão: SEMPRE tem "idProcesso=XXXXXX" na query string
```

**Implementação:**
```javascript
extractProcessIdFromUrl() {
  try {
    // Extrair da URL atual
    const url = new URL(window.location.href);
    const idProcesso = url.searchParams.get('idProcesso');

    if (idProcesso) {
      console.log(`✅ ID do processo extraído: ${idProcesso}`);
      return idProcesso;
    }

    // Fallback: tentar extrair do DOM (pode estar em elementos)
    const processElement = document.querySelector('[data-id-processo], #idProcesso');
    if (processElement) {
      const id = processElement.getAttribute('data-id-processo') ||
                 processElement.value ||
                 processElement.textContent;
      console.log(`✅ ID do processo do DOM: ${id}`);
      return id;
    }

    console.warn('⚠️ ID do processo não encontrado');
    return null;

  } catch (error) {
    console.error('❌ Erro ao extrair ID do processo:', error);
    return null;
  }
}
```

**Casos de teste:**
```javascript
// URL: ...?idProcesso=7940963&ca=abc123
extractProcessIdFromUrl() // → "7940963"

// URL: ...?processo=0003398-66.1997.8.14.0301&idProcesso=7940963
extractProcessIdFromUrl() // → "7940963"

// URL sem idProcesso (raro)
extractProcessIdFromUrl() // → null
```

---

### **3. Fetch da Página de Documentos**

#### **Método:** `discoverViaFetch()`

**Objetivo:** Buscar página de documentos via fetch, parsear HTML e extrair links

**Fluxo:**
```
1. Extrair ID do processo da URL atual
   ↓
2. Construir URL da página de documentos
   ↓
3. Fazer fetch com credenciais (sessão)
   ↓
4. Receber HTML completo
   ↓
5. Parsear HTML em memória (DOMParser)
   ↓
6. Buscar links de documentos no HTML parseado
   ↓
7. Chamar método existente parseDocumentLinks()
   ↓
8. Retornar array de documentos
```

**Implementação:**
```javascript
/**
 * Descobre documentos via fetch da página de documentos
 * Funciona de QUALQUER aba do processo
 * @returns {Promise<Array>} Array de documentos
 */
async discoverViaFetch() {
  console.log('📡 LEX: Buscando documentos via fetch...');

  try {
    // 1. Extrair ID do processo
    const processId = this.extractProcessIdFromUrl();

    if (!processId) {
      throw new Error('ID do processo não encontrado na URL');
    }

    console.log(`📋 ID do processo: ${processId}`);

    // 2. Construir URL da página de documentos
    // URL observada: https://pje.tjpa.jus.br/pje/Processo/ConsultaProcesso/Detalhe/listAutosDigitais.seam
    const docsUrl = `${this.baseUrl}/pje/Processo/ConsultaProcesso/Detalhe/listAutosDigitais.seam?idProcesso=${processId}`;

    console.log(`🌐 URL de documentos: ${docsUrl}`);

    // 3. Fazer fetch com sessão autenticada
    const response = await fetch(docsUrl, {
      method: 'GET',
      credentials: 'include',  // CRÍTICO: usa cookies da sessão
      headers: {
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache'
      },
      // Importante: não seguir redirects que podem levar para login
      redirect: 'follow'
    });

    // 4. Verificar resposta
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    // Verificar se foi redirecionado para login
    if (response.url.includes('login') || response.url.includes('auth')) {
      throw new Error('Sessão expirada - redirecionado para login');
    }

    console.log(`✅ Fetch concluído: ${response.status} ${response.statusText}`);
    console.log(`📄 Content-Type: ${response.headers.get('content-type')}`);

    // 5. Obter HTML
    const html = await response.text();
    console.log(`📊 HTML recebido: ${(html.length / 1024).toFixed(2)} KB`);

    // 6. Parsear HTML em memória (sem afetar DOM atual)
    const parser = new DOMParser();
    const virtualDoc = parser.parseFromString(html, 'text/html');

    // Verificar se parse foi bem-sucedido
    if (!virtualDoc || !virtualDoc.documentElement) {
      throw new Error('Falha ao parsear HTML');
    }

    console.log('✅ HTML parseado com sucesso');

    // 7. Buscar links de documentos (mesmo seletor que já funciona)
    const pjeDocLinks = virtualDoc.querySelectorAll('a[href*="idProcessoDocumento"]');

    console.log(`📄 LEX: Encontrados ${pjeDocLinks.length} links de documentos via fetch`);

    if (pjeDocLinks.length === 0) {
      console.warn('⚠️ Nenhum link de documento encontrado no HTML');
      console.log('📋 HTML preview:', html.substring(0, 500));
    }

    // 8. Parsear links usando método existente
    const documents = this.parseDocumentLinks(pjeDocLinks);

    console.log(`✅ ${documents.length} documentos parseados com sucesso`);

    return documents;

  } catch (error) {
    console.error('❌ LEX: Erro no fetch de documentos:', error);
    console.error('Stack:', error.stack);

    // Retornar array vazio (não lançar erro - fallback pode tentar outra estratégia)
    return [];
  }
}

/**
 * Parseia links de documentos do DOM (ou virtualDOM)
 * MÉTODO JÁ EXISTE - apenas extrair para reutilização
 */
parseDocumentLinks(linkElements) {
  const documents = [];

  for (const link of linkElements) {
    try {
      const href = link.href || link.getAttribute('href');
      if (!href) continue;

      const url = new URL(href, this.baseUrl);

      // Extrair parâmetros
      const idProcessoDocumento = url.searchParams.get('idProcessoDocumento');
      const nomeArqProcDocBin = url.searchParams.get('nomeArqProcDocBin');
      const idBin = url.searchParams.get('idBin');
      const numeroDocumento = url.searchParams.get('numeroDocumento');

      if (!idProcessoDocumento || !nomeArqProcDocBin) {
        continue; // skip links inválidos
      }

      // Construir URL de download
      const downloadUrl = this.buildDownloadUrl({
        idProcessoDocumento,
        nomeArqProcDocBin,
        idBin,
        numeroDocumento
      });

      // Criar objeto documento
      const document = {
        id: idProcessoDocumento,
        name: decodeURIComponent(nomeArqProcDocBin),
        url: downloadUrl,
        type: this.inferDocumentType(nomeArqProcDocBin, nomeArqProcDocBin),
        source: 'pje_autos_digitais',
        metadata: {
          idBin: idBin,
          numeroDocumento: numeroDocumento,
          originalUrl: href
        }
      };

      documents.push(document);

    } catch (error) {
      console.warn('⚠️ Erro ao parsear link:', error);
      continue;
    }
  }

  return documents;
}
```

---

### **4. Estratégia Híbrida (Orquestrador)**

#### **Método:** `discoverAllDocuments()` (ATUALIZADO)

**Objetivo:** Tentar scraping direto primeiro, fallback para fetch se necessário

**Implementação:**
```javascript
/**
 * Descobre todos os documentos do processo
 * ESTRATÉGIA HÍBRIDA: tenta scraping direto, depois fetch
 * @returns {Promise<Array>} Array de documentos descobertos
 */
async discoverAllDocuments() {
  console.log('🔍 LEX: Iniciando descoberta de documentos...');

  // ESTRATÉGIA 1: Scraping direto do DOM (se já estiver na aba docs)
  if (this.isOnDocumentsPage()) {
    console.log('✅ LEX: Já estamos na página de documentos');
    console.log('⚡ LEX: Usando scraping direto do DOM (mais rápido)');

    const documents = this.discoverViaDomScraping();

    if (documents.length > 0) {
      console.log(`✅ LEX: ${documents.length} documentos encontrados via DOM`);
      return documents;
    }

    console.warn('⚠️ LEX: DOM scraping retornou 0 documentos (inesperado)');
  }

  // ESTRATÉGIA 2: Fetch da página de documentos (qualquer aba)
  console.log('📡 LEX: Não estamos na página de docs, usando fetch...');

  const documents = await this.discoverViaFetch();

  if (documents.length > 0) {
    console.log(`✅ LEX: ${documents.length} documentos encontrados via fetch`);
    return documents;
  }

  // NENHUMA ESTRATÉGIA FUNCIONOU
  console.error('❌ LEX: Nenhum documento encontrado');
  console.warn('⚠️ Possíveis causas:');
  console.warn('  • Sessão expirada');
  console.warn('  • Estrutura do PJe mudou');
  console.warn('  • Processo não tem documentos');
  console.warn('  • ID do processo não encontrado na URL');

  return [];
}
```

---

## 🧪 Casos de Teste

### **Teste 1: Aba "Dados do Processo"**

```javascript
// URL: https://pje.tjpa.jus.br/.../consultaProcesso.seam?idProcesso=7940963
const crawler = new ProcessCrawler();

console.log('Teste 1: Descoberta de aba "Dados"');
const docs = await crawler.discoverAllDocuments();

// Esperado:
// 📡 LEX: Não estamos na página de docs, usando fetch...
// 🌐 URL de documentos: .../listAutosDigitais.seam?idProcesso=7940963
// ✅ Fetch concluído: 200 OK
// 📄 LEX: Encontrados 14 links de documentos via fetch
// ✅ 14 documentos parseados com sucesso

console.assert(docs.length === 14, 'Deve encontrar 14 documentos');
console.assert(docs[0].name === 'Doc 01 PETIÇÃO INICIAL.pdf', 'Nome correto');
```

### **Teste 2: Aba "Docs" (Scraping Direto)**

```javascript
// URL: https://pje.tjpa.jus.br/.../listAutosDigitais.seam?idProcesso=7940963
const crawler = new ProcessCrawler();

console.log('Teste 2: Descoberta de aba "Docs"');
const docs = await crawler.discoverAllDocuments();

// Esperado:
// ✅ LEX: Já estamos na página de documentos
// ⚡ LEX: Usando scraping direto do DOM (mais rápido)
// ✅ LEX: 14 documentos encontrados via DOM

console.assert(docs.length === 14, 'Deve encontrar 14 documentos');
```

### **Teste 3: Aba "Movimentações"**

```javascript
// URL: https://pje.tjpa.jus.br/.../movimentacoes.seam?idProcesso=7940963
const crawler = new ProcessCrawler();

console.log('Teste 3: Descoberta de aba "Movimentações"');
const docs = await crawler.discoverAllDocuments();

// Esperado:
// 📡 LEX: Não estamos na página de docs, usando fetch...
// ✅ 14 documentos encontrados via fetch

console.assert(docs.length === 14, 'Deve encontrar 14 documentos');
```

### **Teste 4: Sessão Expirada**

```javascript
// Simular: limpar cookies antes do teste
const crawler = new ProcessCrawler();

console.log('Teste 4: Sessão expirada');
const docs = await crawler.discoverAllDocuments();

// Esperado:
// 📡 LEX: Não estamos na página de docs, usando fetch...
// ❌ LEX: Erro no fetch de documentos: Sessão expirada - redirecionado para login
// ❌ LEX: Nenhum documento encontrado

console.assert(docs.length === 0, 'Deve retornar array vazio');
// Usuário verá erro amigável no modal
```

### **Teste 5: ID do Processo Não Encontrado**

```javascript
// URL sem idProcesso (cenário raro): https://pje.tjpa.jus.br/...
const crawler = new ProcessCrawler();

console.log('Teste 5: URL sem idProcesso');
const docs = await crawler.discoverAllDocuments();

// Esperado:
// ⚠️ ID do processo não encontrado
// ❌ LEX: Erro no fetch de documentos: ID do processo não encontrado na URL
// ❌ LEX: Nenhum documento encontrado

console.assert(docs.length === 0, 'Deve retornar array vazio');
```

---

## 📦 Alterações nos Arquivos

### **Arquivo: `src/js/process-crawler.js`**

**Métodos a adicionar:**
```javascript
// Linha ~50 (após construtor)
isOnDocumentsPage() { ... }

// Linha ~70
extractProcessIdFromUrl() { ... }

// Linha ~100
async discoverViaFetch() { ... }

// Linha ~200
parseDocumentLinks(linkElements) { ... }  // extrair do método atual
```

**Método a atualizar:**
```javascript
// Linha ~400 (método existente)
async discoverAllDocuments() {
  // Substituir por lógica híbrida
  if (this.isOnDocumentsPage()) {
    return this.discoverViaDomScraping();
  }
  return await this.discoverViaFetch();
}
```

**Linhas de código estimadas:** +150 linhas

---

## ⏱️ Cronograma de Implementação

### **Fase 1: Preparação (30min)**
- ✅ Ler código atual de `process-crawler.js`
- ✅ Identificar onde adicionar novos métodos
- ✅ Extrair `parseDocumentLinks()` do método existente

### **Fase 2: Implementação Core (1h)**
- ✅ Implementar `isOnDocumentsPage()`
- ✅ Implementar `extractProcessIdFromUrl()`
- ✅ Implementar `discoverViaFetch()`
- ✅ Refatorar `parseDocumentLinks()`

### **Fase 3: Integração (30min)**
- ✅ Atualizar `discoverAllDocuments()` com estratégia híbrida
- ✅ Adicionar logs detalhados
- ✅ Tratamento de erros

### **Fase 4: Testes (1h)**
- ✅ Testar de aba "Dados do Processo"
- ✅ Testar de aba "Movimentações"
- ✅ Testar de aba "Partes"
- ✅ Testar de aba "Docs" (scraping direto)
- ✅ Testar sessão expirada
- ✅ Testar processo sem documentos

### **Fase 5: Refinamento (30min)**
- ✅ Ajustar mensagens de erro
- ✅ Otimizar performance
- ✅ Documentar no código

**TOTAL: 3.5 horas**

---

## 🚨 Riscos e Mitigações

### **Risco 1: Estrutura da URL de Docs Varia**

**Problema:** URL de documentos pode ser diferente em outros tribunais

**Mitigação:**
```javascript
// Detectar automaticamente baseado no domínio
const docsUrls = {
  'pje.tjpa.jus.br': '/pje/Processo/ConsultaProcesso/Detalhe/listAutosDigitais.seam',
  'pje.tjsp.jus.br': '/pje/Processo/ConsultaProcesso/listView.seam',
  // ... outros tribunais
};

const docsPath = docsUrls[window.location.hostname] ||
                 '/pje/Processo/ConsultaProcesso/Detalhe/listAutosDigitais.seam';
```

### **Risco 2: Fetch Retorna HTML de Login**

**Problema:** Sessão expirada → fetch retorna página de login

**Mitigação:**
```javascript
// Verificar se response foi redirecionado para login
if (response.url.includes('login') || response.url.includes('auth')) {
  throw new Error('Sessão expirada');
}

// Verificar conteúdo HTML
if (html.includes('<form') && html.includes('login')) {
  throw new Error('Sessão expirada - HTML de login detectado');
}
```

### **Risco 3: CORS Issues**

**Problema:** Fetch pode ser bloqueado por CORS

**Mitigação:**
- ✅ **Não é problema!** Fetch é do mesmo domínio (pje.tjpa.jus.br)
- ✅ Content script tem permissões (`host_permissions` no manifest)
- ✅ `credentials: 'include'` passa cookies automaticamente

### **Risco 4: Performance (Fetch Lento)**

**Problema:** Fetch pode demorar se página de docs for pesada

**Mitigação:**
```javascript
// Timeout de 10 segundos
const controller = new AbortController();
const timeout = setTimeout(() => controller.abort(), 10000);

try {
  const response = await fetch(url, {
    signal: controller.signal,
    // ...
  });
} finally {
  clearTimeout(timeout);
}
```

---

## ✅ Checklist de Implementação

- [ ] Adicionar `isOnDocumentsPage()` ao ProcessCrawler
- [ ] Adicionar `extractProcessIdFromUrl()` ao ProcessCrawler
- [ ] Adicionar `discoverViaFetch()` ao ProcessCrawler
- [ ] Refatorar `parseDocumentLinks()` (extrair de método existente)
- [ ] Atualizar `discoverAllDocuments()` com estratégia híbrida
- [ ] Adicionar logs detalhados em cada etapa
- [ ] Adicionar tratamento de erros específicos
- [ ] Testar de aba "Dados do Processo"
- [ ] Testar de aba "Movimentações"
- [ ] Testar de aba "Partes"
- [ ] Testar de aba "Docs" (otimização de scraping direto)
- [ ] Testar com sessão expirada
- [ ] Testar com processo sem documentos
- [ ] Verificar performance (tempo de fetch)
- [ ] Atualizar documentação no código
- [ ] Commitar mudanças

---

## 📊 Métricas de Sucesso

### **Antes:**
```
✅ Funciona na aba "Docs": 100%
❌ Funciona em outras abas: 0%
Atrito do usuário: ALTO (precisa navegar)
```

### **Depois:**
```
✅ Funciona na aba "Docs": 100% (scraping direto, ~50ms)
✅ Funciona em outras abas: 90%+ (fetch, ~500ms)
Atrito do usuário: ZERO (funciona de qualquer lugar)
```

**Casos cobertos:**
- ✅ Aba "Dados do Processo"
- ✅ Aba "Movimentações"
- ✅ Aba "Partes"
- ✅ Aba "Docs" (otimizado)
- ✅ Qualquer outra aba que tenha `idProcesso` na URL

---

## 🚀 Próximos Passos Após Implementação

1. **Adicionar atalho `Ctrl+Shift+A`** para análise de qualquer lugar
2. **Remover instrução** "navegue até aba Docs" da UI
3. **Atualizar documentação** do usuário
4. **Testar em outros tribunais** (TJSP, TRF, etc)
5. **Adicionar suporte** a URLs alternativas de docs

---

**Pronto para implementar! 🎯**
