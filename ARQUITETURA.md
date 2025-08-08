# 🏗️ Arquitetura da Extensão Lex

## 📋 Visão Geral

A **Lex** é uma extensão Chrome que funciona como assistente jurídico inteligente para o sistema PJe (Processo Judicial Eletrônico). Ela injeta um chat com IA diretamente nas páginas do PJe para análise de processos e documentos.

## 🔧 Arquitetura Técnica

### 📁 Estrutura de Arquivos

```
lex-extension/
├── manifest.json           # Configuração da extensão Chrome
├── content-simple.js       # 🎯 ARQUIVO PRINCIPAL - Todo o código da extensão
├── background.js           # Service worker (funcionalidades em background)
├── popup.html + popup.js   # Interface do popup da extensão
└── arquivos de apoio/      # Testes, documentação, etc.
```

### 🎯 Arquivo Principal: content-simple.js

**Tamanho:** ~1000+ linhas  
**Função:** Content script que roda em todas as páginas PJe  
**Arquitetura:** IIFE (Immediately Invoked Function Expression) para evitar conflitos

#### 🧩 Componentes Principais:

1. **OpenAI Client Integrado** (linhas ~30-170)
   - Classe completa dentro do content script
   - Gerencia comunicação com API da OpenAI
   - Fallbacks inteligentes quando IA não disponível

2. **Sistema de Interface** (linhas ~200-400)
   - Criação dinâmica do botão flutuante
   - Interface do chat moderna e responsiva
   - Estilos CSS inline para evitar conflitos

3. **Extração de Dados** (linhas ~500-700)
   - Extração de informações do processo
   - Leitura de conteúdo de documentos via iframe
   - Cache inteligente para performance

4. **Sistema de Chat** (linhas ~700-900)
   - Gerenciamento de mensagens
   - Integração com IA
   - Respostas de fallback estruturadas

## 🌐 Contexto de Uso

### 🏛️ Sistema PJe (Processo Judicial Eletrônico)

**O que é:** Sistema oficial do Poder Judiciário brasileiro para tramitação de processos eletrônicos.

**Características técnicas:**
- **Framework:** JSF (JavaServer Faces) + RichFaces
- **URLs típicas:** `*.pje.jus.br`, `*.tjsp.jus.br`, `*.tjpa.jus.br`
- **Estrutura:** Single Page Application com iframes para documentos
- **Autenticação:** Certificado digital ou login/senha

### 📄 Estrutura Típica de uma Página PJe

```html
<body>
  <!-- Navbar com informações do usuário -->
  <div class="navbar">...</div>
  
  <!-- Área principal com processo -->
  <div class="processo-container">
    <!-- Informações do processo -->
    <div class="processo-info">
      Processo: 1234567-89.2024.8.14.0301
      Classe: Procedimento Comum Cível
      Autor: João da Silva
      Réu: Empresa XYZ
    </div>
    
    <!-- Lista de documentos -->
    <div class="documentos-lista">...</div>
    
    <!-- Visualizador de documento (IFRAME) -->
    <iframe src="/documento/download/123456"></iframe>
  </div>
</body>
```

### 🎯 Pontos de Integração da Lex

1. **Injeção do Botão:** Canto inferior direito da tela
2. **Extração de Dados:** Leitura do DOM para informações do processo
3. **Leitura de Documentos:** Requisições autenticadas aos iframes
4. **Chat Overlay:** Interface sobreposta que não interfere no PJe

## 🔍 Fluxo de Funcionamento

### 1. Inicialização
```
Página PJe carrega → content-simple.js injeta → 
Cria OpenAI Client → Adiciona estilos → 
Cria botão flutuante → Aguarda interação
```

### 2. Interação do Usuário
```
Usuário clica botão → Extrai dados do processo → 
Cria interface do chat → Exibe informações → 
Aguarda pergunta do usuário
```

### 3. Processamento de Pergunta
```
Usuário digita pergunta → Extrai conteúdo do documento → 
Monta contexto completo → Envia para OpenAI → 
Processa resposta → Exibe no chat
```

## 🧠 Sistema de IA

### 📝 Prompt Engineering

A Lex usa prompts especializados em direito brasileiro:

```javascript
const systemPrompt = `Você é Lex, um assistente jurídico especializado em direito brasileiro e sistema PJe.

INSTRUÇÕES:
- Responda sempre em português brasileiro
- Use linguagem jurídica precisa mas acessível
- Cite artigos de lei quando relevante (CPC, CF, CLT, etc.)
- Seja objetivo e prático
- Formate a resposta em HTML simples

CONTEXTO DO PROCESSO:
${contextoExtraido}

PERGUNTA DO USUÁRIO: ${pergunta}`;
```

### 🔄 Sistema de Fallback

Quando a IA não está disponível, a Lex usa respostas estruturadas:
- Análise básica do processo
- Informações sobre prazos
- Guias de peticionamento
- Comandos de ajuda

## 🛡️ Segurança e Privacidade

### 🔐 Medidas de Segurança

1. **API Key Local:** Armazenada apenas no código local
2. **Domínios Restritos:** Funciona apenas em URLs PJe autorizadas
3. **Requisições Autenticadas:** Usa cookies de sessão do usuário
4. **Sanitização:** Limpeza de dados extraídos

### 🚫 Limitações de Segurança

- API key visível no código fonte (necessário para funcionamento)
- Dependente da sessão ativa do usuário no PJe
- Não funciona com certificados digitais em alguns casos

## 📊 Performance

### ⚡ Otimizações Implementadas

1. **Cache de DOM:** Evita re-processamento desnecessário
2. **Lazy Loading:** Interface criada apenas quando necessária
3. **Debounce:** Evita múltiplas requisições simultâneas
4. **Estilos Inline:** Evita conflitos e carregamento adicional

### 📈 Métricas Típicas

- **Tempo de inicialização:** ~500ms
- **Tempo de resposta IA:** 2-5 segundos
- **Uso de memória:** ~10-20MB
- **Impacto no PJe:** Mínimo (não interfere na funcionalidade)

## 🔧 Pontos de Melhoria Identificados

### 🚀 Funcionalidades Faltantes

1. **Histórico de conversas**
2. **Configurações avançadas**
3. **Múltiplos modelos de IA**
4. **Export de análises**
5. **Atalhos de teclado**

### 🐛 Problemas Conhecidos

1. **PDFs:** Não consegue extrair texto de PDFs
2. **Certificados:** Pode ter problemas com autenticação por certificado
3. **Performance:** Pode ser lenta em processos com muitos documentos
4. **Compatibilidade:** Testada principalmente no TJPA

### 🎯 Oportunidades de Melhoria

1. **Modularização:** Separar componentes em arquivos
2. **TypeScript:** Adicionar tipagem para melhor manutenção
3. **Testes:** Implementar testes automatizados
4. **CI/CD:** Pipeline de deploy automatizado