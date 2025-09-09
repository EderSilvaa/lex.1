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

### Verificações de Sintaxe JavaScript
- [ ] **Syntax check**: `node -c src/js/content-simple.js`
- [ ] **Template strings**: Backticks (`) conflitantes?
- [ ] **Regex patterns**: Caracteres especiais escapados?
- [ ] **Comentários**: Sem caracteres que quebram parsing?
- [ ] **Console errors**: F12 → Console para erros runtime

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

### Problema: Extensão não aparece/funciona
**Causas comuns:**
1. **Erro de sintaxe JavaScript** (mais comum)
2. Content script não injetado
3. CSS não carregado
4. Conflitos com outras extensões

**Debug sistemático:**
1. **Console → Verificar erros JavaScript**
2. **Syntax check**: `node -c arquivo.js`
3. **Extensions → Reload** da extensão
4. **Network → Verificar recursos**
5. **Elements → Verificar DOM injection**

---

## 🤖 Fluxo de IA e Integração Supabase

### Arquitetura de IA
```
PJe → DocumentDetector → PDFProcessor → OpenAIClient → Supabase Edge Function → OpenAI API
```

### Fluxo de Análise Automática (v2.3)
```
Ctrl+; → abrirLexComAnaliseAutomatica() → Interface LEX → enviarMensagem() → 
gerarRespostaIA() → extrairConteudoDocumento() → criarPromptJuridico('analise_tecnica') → 
Supabase Edge Function → OpenAI API → limparResposta() → HTML estruturado
```

### Supabase Edge Function Integration
- **URL**: `https://nspauxzztflgmxjgevmo.supabase.co/functions/v1/OPENIA`
- **Auth**: Bearer token + apikey (público Supabase)
- **Payload**: `{ pergunta: prompt, contexto: 'Processo judicial via extensão Lex' }`
- **Vantagens**: API key OpenAI escondida, rate limiting, logs centralizados

### Sistema de Prompts Otimizado

#### Prompt Structure (v2.0)
```
Você é Lex, assistente jurídico especializado em direito brasileiro.

INSTRUÇÕES ESSENCIAIS:
• Resposta MÁXIMO 300 palavras, concisa e prática
• Use HTML simples: <strong>, <em>, <br>, <ul>, <li>
• NUNCA use markdown
• Estruture em seções claras

ESTRUTURA OBRIGATÓRIA:
1. 📄 Resumo: [2-3 linhas]
2. ⚠️ Ação Necessária: [o que fazer]
3. 📅 Prazo: [quando fazer]
4. 💡 Dica: [recomendação prática]
```

#### Melhorias Implementadas
- ✅ **Limite de palavras**: 500 → 300 (mais conciso)
- ✅ **Estrutura fixa**: 4 seções obrigatórias  
- ✅ **Formatação consistente**: HTML puro, sem markdown
- ✅ **Emojis organizacionais**: Melhor UX visual
- ✅ **Linguagem acessível**: Menos juridiquês

### Sistema de Limpeza de Resposta

#### Função `limparResposta()`
```javascript
// Remove markdown malformado
.replace(/```html\s*/gi, '') 
.replace(/```\s*/g, '')      
.replace(/#{1,6}\s*/g, '')   
.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') 
.replace(/\*(.*?)\*/g, '<em>$1</em>')

// Melhora formatação
.replace(/\n{3,}/g, '<br><br>')
.replace(/\n{2}/g, '<br><br>')
.replace(/\n/g, '<br>')
```

#### Problemas Resolvidos
- ❌ ````html` sem fechamento
- ❌ Texto corrido sem estrutura  
- ❌ Markdown malformado
- ❌ Excesso de quebras de linha

### Fallback System
- **Trigger**: OpenAI indisponível/não configurado
- **Responses**: Estáticas baseadas em keywords
- **Status**: Feedback específico do problema
- **Categories**: análise, documento, prazo, geral

### Performance Metrics (Análise Automática)
- **Tempo total**: ~2-4 segundos (atalho → resultado)
- **Interface**: 200ms (abertura LEX)
- **Extração**: 300-800ms (dependendo do tamanho do PDF)
- **IA**: 1-3 segundos (Supabase Edge Function + OpenAI)
- **Renderização**: ~100ms (HTML limpo)
- **UX**: Feedback visual imediato via notificações

---

## ⌨️ Sistema de Atalhos de Teclado

### Atalhos Disponíveis
- **`Ctrl + M`**: Abrir/fechar LEX (toggle)
- **`Ctrl + ;`**: **Análise automática do documento** 🚀
- **`Ctrl + ,`**: Abrir LEX com foco no input
- **`ESC`**: Fechar LEX (quando aberta)

### Funcionalidades Especiais
- **`Ctrl + ;`**: **Análise One-Click** → Abre LEX + extrai documento + analisa automaticamente
- **Resposta instantânea**: Resultado da IA em segundos
- **Sem digitação**: Não precisa escrever "analisar documento"
- **Fluxo otimizado**: Perfeito para análise rápida de petições/documentos

### Notas sobre Compatibilidade  
- **`Ctrl + Shift + L`**: Removido (conflita com Logitech/Discord)
- **Diferenciação**: `;` para análise automática, `,` para foco manual
- **Teclas seguras**: Símbolos raramente usados por outros softwares

### Funcionalidades dos Atalhos
- **Precedência**: Event capture para garantir funcionamento
- **Feedback visual**: Notificações animadas no canto superior direito
- **Prevenção de conflitos**: `preventDefault()` e `stopPropagation()`
- **Placeholder dinâmico**: Input mostra "ativada via atalho" temporariamente
- **Logs detalhados**: Console tracking para debugging

### Notificações Visuais
- **Design**: Gradient matching LEX visual identity
- **Animação**: Slide-in from right, auto-dismiss after 2s
- **Z-index**: 999999 (acima de outros elementos)
- **Responsivo**: Adapta-se ao viewport

### Sistema de Análise Automática

#### One-Click Analysis (`Ctrl + ;`)
```javascript
function abrirLexComAnaliseAutomatica() {
  abrirLex();  // Abre interface
  setTimeout(() => {
    const input = chatContainer?.querySelector('.lex-input');
    if (input) {
      input.value = 'Analisar este documento automaticamente';
      enviarMensagem('Analisar este documento automaticamente');
    }
  }, 200);
}
```

#### Fluxo Completo
1. **Trigger**: `Ctrl + ;` pressionado
2. **Interface**: LEX abre automaticamente
3. **Comando**: Simula "Analisar este documento automaticamente"
4. **Extração**: `extrairConteudoDocumento()` → PDF/HTML parsing
5. **Contexto**: Metadados do processo + conteúdo do documento
6. **IA**: Prompt "analise_tecnica" → Supabase Edge Function
7. **Resultado**: Resposta estruturada em HTML limpo

#### Vantagens
- **Zero friction**: Sem cliques ou digitação manual
- **Análise completa**: Documento + contexto processual
- **Resposta otimizada**: Prompt específico para análise técnica
- **Feedback visual**: Notificação + placeholder dinâmico

### Implementação Técnica Base
```javascript
// Event listener com capture
document.addEventListener('keydown', handler, true);

// Controle de estado
function toggleLex() {
  if (!chatContainer) criarInterfaceChat();
  else chatContainer.classList.toggle('visible');
}

// Feedback visual
function mostrarNotificacaoAtalho(mensagem) {
  // Notificação animada com gradient LEX
}
```

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

## 📈 Changelog de Melhorias

### v2.3 - Análise Automática One-Click (2025-01-09)
- ✅ **Ctrl+; para análise automática**: Abre LEX + extrai documento + analisa instantaneamente
- ✅ **Fluxo otimizado**: Zero cliques, zero digitação, resultado em segundos
- ✅ **Múltiplas alternativas**: Ctrl+; (análise), Ctrl+, (foco), Ctrl+M (toggle)
- ✅ **Compatibilidade melhorada**: Removido Ctrl+Shift+L conflitante

### v2.2 - Sistema de Atalhos de Teclado (2025-01-09)
- ✅ **Atalhos de teclado**: Fundação do sistema de comandos
- ✅ **Notificações visuais**: Feedback animado para ações
- ✅ **Controle avançado**: Toggle, foco automático, fechamento
- ✅ **UX aprimorada**: Placeholder dinâmico, prevenção de conflitos

### v2.1 - Sistema de Prompts Dinâmicos (2025-01-09)
- ✅ **Prompts adaptativos**: 6 tipos de conversa diferentes
- ✅ **Personalidades variáveis**: Tom se adapta ao contexto
- ✅ **Limpeza de resposta**: Remove markdown malformado automaticamente  
- ✅ **Debug de sintaxe**: Comando `node -c` para validação JavaScript
- ✅ **Integração Supabase**: Edge Functions para segurança da API key
- ✅ **Fallback inteligente**: Respostas úteis mesmo sem IA

### v2.0 - Fonte Michroma e UX (2025-01-09)  
- ✅ **Tipografia**: Fonte Michroma nos títulos
- ✅ **CSS otimizado**: Carregamento assíncrono com Promise
- ✅ **Cleanup**: 12 arquivos de teste obsoletos removidos
- ✅ **Documentação**: Mapeamento sistêmico completo

### v1.0 - Base LEX (2025-01-08)
- ✅ **Extração**: PDF, HTML e detecção de imagens
- ✅ **Processamento**: PDF.js integrado com worker
- ✅ **Interface**: Chat moderno e responsivo
- ✅ **Arquitetura**: Manifest V3 compliant

---

*Última atualização: 09/01/2025 - v2.3 com Análise Automática One-Click*