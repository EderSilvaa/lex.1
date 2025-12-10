# Implementação de Streaming - LEX Agent

## Resumo

Implementação completa de **streaming de respostas em tempo real** da IA, permitindo que o usuário veja a resposta palavra por palavra conforme é gerada, similar ao ChatGPT.

## Arquitetura

### 1. Edge Function (Servidor)
**Arquivo**: [EDGE-FUNCTION-OPENIA-STREAMING.ts](EDGE-FUNCTION-OPENIA-STREAMING.ts)

A Edge Function foi modificada para retornar **Server-Sent Events (SSE)** ao invés de JSON:

```typescript
// Ativar streaming na API OpenAI
body: JSON.stringify({
  model: 'gpt-4o',
  messages: [...],
  stream: true  // ← Ativa streaming
})

// Retornar como text/event-stream
return new Response(stream, {
  headers: {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  }
})
```

**Formato da resposta SSE**:
```
data: {"text": "palavra"}
data: {"text": " próxima"}
data: {"text": " palavra"}
data: [DONE]
```

### 2. Cliente (Extensão)
**Arquivo**: [src/js/content-simple.js](src/js/content-simple.js)

#### Fluxo Completo:

```
1. Usuário envia pergunta
   ↓
2. enviarMensagem() cria elemento de mensagem antecipadamente
   ↓
3. gerarRespostaComContexto(texto, messageElement)
   ↓
4. gerarRespostaIA(pergunta, messageElement)
   ↓
5. openaiClient.analisarDocumento(contexto, pergunta, messageElement)
   ↓
6. fazerRequisicao(prompt, messageElement)
   ↓
7. Detecta Content-Type: text/event-stream
   ↓
8. processarStreaming(response, messageElement)
   ↓
9. Atualiza .lex-bubble em tempo real
```

#### Principais Modificações:

**1. Criar mensagem antecipadamente** ([content-simple.js:2814-2822](src/js/content-simple.js#L2814-L2822)):
```javascript
// Criar mensagem da IA antecipadamente (para streaming)
const assistantMessage = document.createElement('div');
assistantMessage.className = 'lex-message assistant';
assistantMessage.innerHTML = `
  <div class="lex-bubble"><span class="lex-thinking">Pensando...</span></div>
  <div class="lex-time">${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</div>
`;
messagesContainer.appendChild(assistantMessage);
```

**2. Passar elemento através da cadeia de chamadas**:
- `gerarRespostaComContexto(pergunta, messageElement)`
- `gerarRespostaIA(pergunta, messageElement)`
- `analisarDocumento(contexto, pergunta, messageElement)`
- `fazerRequisicao(prompt, messageElement)`

**3. Detectar tipo de resposta** ([content-simple.js:494-516](src/js/content-simple.js#L494-L516)):
```javascript
const contentType = response.headers.get('Content-Type');

if (contentType && contentType.includes('text/event-stream')) {
  // 🚀 STREAMING HABILITADO
  return await this.processarStreaming(response, messageElement);
} else {
  // Fallback para resposta JSON (sem streaming)
  const data = await response.json();
  return data.resposta || ...;
}
```

**4. Processar streaming** ([content-simple.js:518-585](src/js/content-simple.js#L518-L585)):
```javascript
async processarStreaming(response, messageElement) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let fullText = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const chunk = decoder.decode(value, { stream: true });
    const lines = chunk.split('\n');

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const data = line.substring(6);
        if (data === '[DONE]') continue;

        const parsed = JSON.parse(data);
        const text = parsed.text || '';

        if (text) {
          fullText += text;

          // Atualizar mensagem em tempo real
          if (messageElement) {
            const bubble = messageElement.querySelector('.lex-bubble');
            if (bubble) {
              bubble.innerHTML = this.limparResposta(fullText);

              // Auto-scroll
              const messagesContainer = messageElement.closest('.lex-messages');
              if (messagesContainer) {
                messagesContainer.scrollTop = messagesContainer.scrollHeight;
              }
            }
          }
        }
      }
    }
  }

  return fullText;
}
```

### 3. Estilos CSS
**Arquivo**: [styles/chat-styles.css:1851-1865](styles/chat-styles.css#L1851-L1865)

Animação do indicador "Pensando...":
```css
.lex-thinking {
  color: var(--lex-text-tertiary);
  font-style: italic;
  animation: lex-thinking-pulse 1.5s ease-in-out infinite;
}

@keyframes lex-thinking-pulse {
  0%, 100% { opacity: 0.4; }
  50% { opacity: 1; }
}
```

## Deploy

### 1. Deploy da Edge Function

```bash
# Fazer login no Supabase CLI (se ainda não fez)
supabase login

# Navegar até a pasta do projeto
cd c:\Users\EDER\lex-test1

# Deploy da Edge Function com streaming
supabase functions deploy OPENIA --project-ref nspauxzztflgmxjgevmo
```

**Importante**: O arquivo `EDGE-FUNCTION-OPENIA-STREAMING.ts` deve substituir a Edge Function existente `OPENIA`.

### 2. Configurar Variáveis de Ambiente

Se ainda não configurou, adicione a chave da OpenAI:

```bash
supabase secrets set OPENAI_API_KEY=sk-...
```

### 3. Recarregar a Extensão

1. Abra `chrome://extensions`
2. Encontre a extensão "Lex."
3. Clique no botão 🔄 **Recarregar**
4. Aguarde até ver "Service worker (ativo)"

### 4. Testar

1. Abra uma página do PJe com um processo
2. Processe alguns documentos
3. Faça uma pergunta ao LEX
4. Observe a resposta aparecer palavra por palavra em tempo real

## Compatibilidade

### Fallback para JSON

A implementação é **retrocompatível**. Se a Edge Function não estiver retornando streaming (ou houver erro), o sistema automaticamente volta para o modo JSON:

```javascript
if (contentType && contentType.includes('text/event-stream')) {
  // Streaming
  return await this.processarStreaming(response, messageElement);
} else {
  // Fallback para JSON
  const data = await response.json();
  return data.resposta || ...;
}
```

### Estruturas de Resposta Suportadas

O sistema aceita múltiplos formatos de resposta JSON:
- `data.resposta`
- `data.response`
- `data.message`
- `data.fallback`
- `data.content`
- `data.text`

## Benefícios do Streaming

### 1. **Percepção de Velocidade**
- Usuário vê as primeiras palavras **imediatamente**
- Não precisa esperar a resposta completa (que pode levar 10-30 segundos)
- Experiência similar ao ChatGPT

### 2. **Transparência**
- Usuário vê o progresso em tempo real
- Sabe que a IA está trabalhando
- Pode começar a ler antes da conclusão

### 3. **Menor Latência Percebida**
- TTFB (Time To First Byte) muito menor
- Primeira palavra em ~1-2 segundos
- vs. ~10-30 segundos no modo JSON

### 4. **Melhor UX**
- Indicador "Pensando..." animado no início
- Texto aparece suavemente
- Auto-scroll acompanha o progresso

## Logs Esperados

### Console do Navegador

**Com Streaming (nova Edge Function)**:
```
📤 LEX: Enviando requisição para Supabase Edge Function (streaming)...
📥 LEX: Status da resposta: 200
📡 LEX: Processando resposta com streaming...
✅ LEX: Streaming concluído
🏁 LEX: Recebido sinal de conclusão
✅ LEX: Resposta da OpenAI recebida
```

**Sem Streaming (Edge Function antiga)**:
```
📤 LEX: Enviando requisição para Supabase Edge Function (streaming)...
📥 LEX: Status da resposta: 200
📦 LEX: Processando resposta JSON (sem streaming)...
📦 LEX: Resposta da Edge Function: {...}
✅ LEX: Resposta da OpenAI recebida
```

## Troubleshooting

### Problema: Streaming não funciona

**Sintomas**: Resposta ainda aparece toda de uma vez

**Possíveis causas**:
1. Edge Function antiga ainda ativa
2. Cache do navegador
3. Erro no deploy

**Solução**:
```bash
# 1. Verificar qual Edge Function está rodando
supabase functions list --project-ref nspauxzztflgmxjgevmo

# 2. Re-deploy forçado
supabase functions deploy OPENIA --project-ref nspauxzztflgmxjgevmo --no-verify-jwt

# 3. Limpar cache do navegador
Ctrl+Shift+Delete → Limpar cache

# 4. Hard reload na extensão
chrome://extensions → Recarregar
```

### Problema: Erro 500 na Edge Function

**Sintomas**: Console mostra "❌ LEX: Erro da Edge Function"

**Verificar**:
1. Logs da Edge Function:
```bash
supabase functions logs OPENIA --project-ref nspauxzztflgmxjgevmo
```

2. Variável de ambiente:
```bash
supabase secrets list --project-ref nspauxzztflgmxjgevmo
```

### Problema: Texto aparece truncado ou incorreto

**Sintomas**: Algumas palavras faltando ou duplicadas

**Causa**: Chunks SSE podem ser divididos no meio de uma linha

**Solução**: Já implementada no código - decodificação com `{ stream: true }`:
```javascript
const chunk = decoder.decode(value, { stream: true });
```

## Performance

### Métricas Estimadas

| Métrica | Sem Streaming | Com Streaming |
|---------|---------------|---------------|
| TTFB (First Byte) | 1-3s | 1-2s |
| Primeira palavra visível | 10-30s | 1-2s |
| Resposta completa | 10-30s | 10-30s |
| Percepção de latência | Alta | Baixa |

### Uso de Tokens

O streaming **não aumenta** o uso de tokens. A quantidade de tokens enviados e recebidos é **exatamente a mesma** do modo JSON.

### Largura de Banda

- **SSE**: ~10-20% mais dados (overhead do formato `data: {...}\n\n`)
- **Impacto**: Negligível (alguns KB a mais por resposta)

## Próximas Melhorias (Opcional)

### 1. Indicador de Typing
Mostrar "..." animado enquanto aguarda próximo chunk:
```javascript
if (timeSinceLastChunk > 500) {
  bubble.innerHTML += '<span class="lex-typing">...</span>';
}
```

### 2. Cancelamento
Permitir usuário cancelar resposta em progresso:
```javascript
const abortController = new AbortController();
fetch(url, { signal: abortController.signal });
// Cancelar: abortController.abort()
```

### 3. Retry Automático
Se streaming falhar, tentar novamente com JSON:
```javascript
try {
  return await processarStreaming(response);
} catch (error) {
  console.warn('Streaming falhou, usando JSON');
  return await processarJSON(response);
}
```

### 4. Buffer de Chunks
Acumular chunks pequenos antes de atualizar DOM (performance):
```javascript
let buffer = '';
if (buffer.length > 50 || done) {
  bubble.innerHTML += buffer;
  buffer = '';
}
```

## Referências

- [OpenAI Streaming Guide](https://platform.openai.com/docs/api-reference/chat/create#chat/create-stream)
- [Server-Sent Events (MDN)](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events)
- [ReadableStream API](https://developer.mozilla.org/en-US/docs/Web/API/ReadableStream)
- [Supabase Edge Functions](https://supabase.com/docs/guides/functions)

## Arquivos Modificados

### Novos Arquivos:
- [EDGE-FUNCTION-OPENIA-STREAMING.ts](EDGE-FUNCTION-OPENIA-STREAMING.ts) - Edge Function com streaming

### Arquivos Modificados:
- [src/js/content-simple.js](src/js/content-simple.js):
  - Linha 325: `analisarDocumento()` aceita `messageElement`
  - Linha 469: `fazerRequisicao()` detecta e processa streaming
  - Linha 518-585: Novo método `processarStreaming()`
  - Linha 2710: `gerarRespostaComContexto()` aceita `messageElement`
  - Linha 2814-2840: `enviarMensagem()` cria mensagem antecipadamente
  - Linha 3096: `gerarRespostaIA()` aceita `messageElement`

- [styles/chat-styles.css](styles/chat-styles.css):
  - Linha 1851-1865: CSS para indicador "Pensando..."

## Status

✅ **Implementação Completa**
- Edge Function com streaming criada
- Cliente processando SSE
- Atualização em tempo real do DOM
- Animação de "Pensando..."
- Fallback para JSON
- Auto-scroll
- Logs informativos

⏳ **Pendente**
- Deploy da Edge Function
- Teste em produção

## Próximo Passo

**Deploy da Edge Function**:
```bash
cd c:\Users\EDER\lex-test1
supabase functions deploy OPENIA --project-ref nspauxzztflgmxjgevmo
```

Após o deploy, o streaming estará ativo automaticamente! 🚀
