# 🔍 Mapeamento Sistêmico - LEX Extension

## 🎯 Objetivo
Mapa completo das dependências, fluxos e pontos críticos para análise e debugging sistemático.

---

## 📊 Fluxo de Carregamento da Extensão

### 1. Inicialização (Manifest → Background → Content)
```
manifest.json
├── background: service_worker
├── content_scripts: injeção automática
├── web_accessible_resources: recursos disponíveis
└── permissions: acessos necessários
```

### 2. Carregamento de Recursos
```
Content Script (content-simple.js)
├── CSS Loading
│   ├── chrome.runtime.getURL('styles/chat-styles.css')
│   ├── Promise-based loading
│   └── Google Fonts: Michroma
├── DOM Injection
│   ├── Chat container creation
│   ├── HTML structure insertion
│   └── Event listeners setup
└── Dependencies
    ├── pdf.min.js
    ├── document-detector.js
    ├── pdf-processor.js
    └── openai-client.js
```

---

## 🚨 Pontos Críticos de Falha

### CSS & Fontes
- **Local**: `styles/chat-styles.css` deve estar em `web_accessible_resources`
- **Externa**: Google Fonts podem falhar por CSP/conexão
- **Timing**: CSS deve carregar ANTES da criação do DOM
- **Conflitos**: Outros CSS da página podem sobrescrever

### JavaScript Injection
- **Ordem**: Scripts devem carregar na ordem correta
- **Permissions**: Sites podem bloquear content scripts
- **CSP**: Content Security Policy pode bloquear recursos
- **Timing**: `document_end` vs `document_start`
- **Manifest V3**: Restrições específicas de segurança

### DOM Manipulation
- **Conflitos**: IDs/classes podem conflitar com a página
- **Z-index**: Overlay deve ficar acima de outros elementos
- **Events**: Event listeners podem ser sobrescritos

---

## ⚠️ Limitações do Manifest V3

### Restrições de Segurança Aplicadas
- **Inline Scripts**: Proibidos - todo JS deve estar em arquivos separados
- **Eval()**: Completamente bloqueado - não funciona em content scripts
- **Dynamic Code**: `new Function()`, `setTimeout(string)` bloqueados
- **External Scripts**: Apenas de origens permitidas em CSP
- **Background Scripts**: Apenas Service Workers (não persistent pages)

### Impactos na Nossa Extensão
```javascript
// ❌ NÃO FUNCIONA (Manifest V3)
element.innerHTML = '<script>alert("test")</script>';
element.onclick = "myFunction()";  // inline event handlers
eval('myCode');
new Function('return 1+1')();

// ✅ FUNCIONA (Manifest V3 Compatible)
element.addEventListener('click', myFunction);
chrome.scripting.executeScript({...});
importScripts('external-lib.js');
```

### CSP Restrictions
```
Content-Security-Policy: 
├── script-src 'self' - apenas scripts da extensão
├── object-src 'none' - sem plugins/embeds
├── style-src 'self' 'unsafe-inline' - CSS inline permitido
└── connect-src específicos - APIs externas precisam permissão
```

### Workarounds Implementados
- **Dynamic HTML**: Template strings ao invés de innerHTML com scripts
- **Event Handlers**: addEventListener ao invés de inline onclick
- **External APIs**: Declarados explicitamente em host_permissions
- **Resource Loading**: chrome.runtime.getURL() para recursos internos

---

## 🔧 Debug Checklist

### Verificações Básicas
- [ ] Extensão carregada no Chrome?
- [ ] Permissões corretas no manifest?
- [ ] Content script injetado na página?
- [ ] CSS carregado (Dev Tools → Network)?
- [ ] Fontes carregadas (Dev Tools → Network)?
- [ ] Console errors?

### Verificações Avançadas
- [ ] `chrome.runtime.getURL()` funciona?
- [ ] `web_accessible_resources` inclui todos os recursos?
- [ ] CSP da página permite recursos?
- [ ] Timing do DOM ready?
- [ ] Event propagation funcionando?

### Verificações Específicas Manifest V3
- [ ] Nenhum inline script/handler usado?
- [ ] Service Worker ativo (não background page)?
- [ ] APIs externas em `host_permissions`?
- [ ] Content scripts seguros (sem eval/Function)?
- [ ] HTTPS para todas as origens externas?

---

## 🏗️ Arquitetura de Classes CSS

### Hierarquia
```
.lex-chat (container principal)
├── .lex-header
│   ├── .lex-title
│   │   └── .lex-name [MICHROMA]
│   └── .lex-close
├── .lex-info
│   └── .lex-card
│       ├── .lex-card-header [MICHROMA]
│       └── .lex-card-content
├── .lex-messages
│   └── .lex-message
│       └── .lex-bubble
└── .lex-input-area
    ├── .lex-input
    └── .lex-send
```

### Reset CSS Conflicts
⚠️ **CUIDADO**: `.lex-chat, .lex-chat *` pode sobrescrever tudo
- Usar apenas para reset básico (margin, padding, box-sizing)
- NUNCA incluir `font-family` no reset global
- Fontes específicas devem usar `!important`

---

## 📝 Problemas Conhecidos & Soluções

### Problema: Fonte Michroma não carrega
**Causas possíveis:**
1. CSS não carregou antes do DOM
2. Reset CSS sobrescrevendo
3. Google Fonts bloqueado
4. Especificidade CSS insuficiente

**Solução sistêmica:**
1. Promise-based CSS loading
2. Font-display: swap
3. Fallback fonts adequados
4. !important nas fontes críticas

### Problema: Chat não aparece
**Causas possíveis:**
1. Content script não injetado
2. Z-index insuficiente
3. CSS conflitos
4. Permissões insuficientes
5. **Manifest V3**: CSP bloqueando recursos

**Debug steps:**
1. Console → Verificar logs LEX
2. Elements → Verificar se .lex-chat existe
3. Network → Verificar recursos carregados
4. Computed → Verificar CSS aplicado
5. **Security → CSP** → Verificar violações

### Problema: APIs externas falham
**Causas Manifest V3:**
1. URL não em `host_permissions`
2. HTTP ao invés de HTTPS
3. CORS não configurado
4. Service Worker inativo

**Solução:**
1. Adicionar domínio ao manifest
2. Forçar HTTPS em todas as APIs  
3. Verificar CORS headers
4. Manter Service Worker ativo

---

## 🎨 Padrões de Design Implementados

### Sistema de Cores
- **Primário**: #4a1a5c (roxo)
- **Secundário**: #2d4a4a (verde-escuro)
- **Background**: #1a1a1a (preto)
- **Cards**: #2a2a2a (cinza-escuro)

### Tipografia
- **Títulos**: Michroma (Google Fonts)
- **Corpo**: System fonts (-apple-system, BlinkMacSystemFont)
- **Fallback**: Courier New, monospace

### Layout
- **Position**: Fixed (bottom-right)
- **Responsive**: Largura fixa 320px
- **Z-index**: 999999 (muito alto para overlay)

---

## 🔄 Fluxo de Dados

### Detecção de Documentos
```
Page Load → Document Detector → PDF Processor → OpenAI Client
```

### Chat Interaction
```
User Input → Message Processing → API Call → Response Display
```

### Estado da Aplicação
```javascript
// Variáveis globais críticas
window.lexAssistantActive // Previne múltiplas instâncias
domCache // Cache de elementos DOM
chatContainer // Container principal
```

---

## 🚀 Otimizações Implementadas

### Performance
- DOM caching para elementos frequentemente acessados
- Promise-based resource loading
- Lazy loading de componentes pesados

### UX
- Loading states
- Error handling gracioso
- Fallback fonts para melhor experiência

### Desenvolvimento
- Console logs estruturados
- Error boundaries
- Debugging helpers

---

*Última atualização: $(date)*