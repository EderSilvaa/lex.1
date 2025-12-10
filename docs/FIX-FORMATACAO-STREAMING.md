# Fix: Formatação Perdida Após Streaming

## Problema Identificado

**Sintoma**: Durante o streaming, a resposta aparecia formatada corretamente (títulos, listas, negrito). Porém, quando o streaming terminava, a formatação desaparecia e voltava a ser texto corrido.

**Causa Raiz**:

No arquivo [src/js/content-simple.js:2845-2850](src/js/content-simple.js#L2845-L2850), após o streaming terminar, o `.then()` sobrescrevia o conteúdo da mensagem **sem preservar a formatação**:

```javascript
gerarRespostaComContexto(texto, assistantMessage).then(resposta => {
  const bubble = assistantMessage.querySelector('.lex-bubble');
  if (bubble) {
    bubble.innerHTML = resposta; // ← SOBRESCREVE sem formatação! ❌
  }
});
```

### Fluxo do Problema:

1. **Durante streaming** (linha 560):
   ```javascript
   bubble.innerHTML = this.limparResposta(fullText); // ✅ Formatado
   ```
   → Resposta aparece formatada em tempo real

2. **Quando streaming termina** (linha 2849):
   ```javascript
   bubble.innerHTML = resposta; // ❌ Sobrescreve SEM formatação
   ```
   → Formatação é perdida!

## Solução Implementada

Modificado [src/js/content-simple.js:2846-2858](src/js/content-simple.js#L2846-L2858) para:

1. **Detectar se foi streaming**: verifica se ainda tem "Pensando..." no texto
2. **Se foi streaming**: NÃO sobrescrever (conteúdo já está formatado)
3. **Se foi JSON**: aplicar `limparResposta()` antes de atualizar

### Código Corrigido:

```javascript
gerarRespostaComContexto(texto, assistantMessage).then(resposta => {
  const bubble = assistantMessage.querySelector('.lex-bubble');
  if (bubble) {
    // Se ainda tem "Pensando...", significa que não foi streaming (ou falhou)
    // Neste caso, atualizar com resposta formatada
    if (bubble.textContent.includes('Pensando')) {
      // Aplicar formatação markdown antes de atualizar
      bubble.innerHTML = window.openaiClient ?
        window.openaiClient.limparResposta(resposta) : resposta;
    }
    // Se não tem "Pensando...", o streaming já atualizou o conteúdo formatado
    // Não fazer nada para preservar a formatação ✅
  }
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
});
```

### Lógica:

```
┌─────────────────────────────────────┐
│ Resposta retorna da IA              │
└─────────────┬───────────────────────┘
              │
              ▼
     ┌────────────────────┐
     │ Tem "Pensando..."? │
     └────────┬───────────┘
              │
      ┌───────┴───────┐
      │               │
     SIM             NÃO
      │               │
      ▼               ▼
┌─────────────┐  ┌──────────────────┐
│ Modo JSON   │  │ Modo Streaming   │
│ (fallback)  │  │ (já formatado)   │
└──────┬──────┘  └────────┬─────────┘
       │                  │
       ▼                  ▼
┌─────────────────┐  ┌─────────────────┐
│ Aplicar         │  │ NÃO fazer nada  │
│ limparResposta()│  │ (preservar HTML)│
│ e atualizar     │  │                 │
└─────────────────┘  └─────────────────┘
```

## Resultado

### Antes do Fix:
- ✅ Durante streaming: formatado
- ❌ Após streaming: texto corrido (formatação perdida)

### Depois do Fix:
- ✅ Durante streaming: formatado
- ✅ Após streaming: formatado (preservado)

## Como Testar

### Teste 1: Com Streaming (Edge Function deployada)
1. Fazer uma pergunta ao LEX
2. Observar resposta aparecer palavra por palavra **formatada**
3. Aguardar streaming terminar
4. **Verificar**: Formatação permanece! ✅

### Teste 2: Sem Streaming (Fallback JSON)
1. Desabilitar streaming (Edge Function antiga)
2. Fazer uma pergunta ao LEX
3. Aguardar resposta completa
4. **Verificar**: Formatação é aplicada! ✅

### Teste Visual:
```bash
# Console do navegador (F12)
# Verificar se mensagem tem HTML formatado:
document.querySelector('.lex-bubble').innerHTML
```

**Esperado**:
```html
<h3>Análise da Sentença</h3>
<ul>
  <li><strong>Item 1</strong>: Descrição...</li>
  <li><strong>Item 2</strong>: Descrição...</li>
</ul>
```

**Não esperado** (bug):
```
### Análise da Sentença\n- Item 1\n- Item 2
```

## Arquivos Modificados

- ✅ [src/js/content-simple.js:2846-2858](src/js/content-simple.js#L2846-L2858)
  - Adicionada detecção de streaming
  - Preservação de HTML formatado
  - Aplicação de `limparResposta()` para fallback JSON

## Compatibilidade

### Modos Suportados:

✅ **Streaming (Edge Function com SSE)**:
- Formatação aplicada durante streaming
- Preservada após conclusão

✅ **JSON (Edge Function antiga)**:
- Formatação aplicada ao final
- Compatível com resposta completa

✅ **Erro/Timeout**:
- Mensagem de erro exibida
- Não quebra a interface

## Observações Técnicas

### Por que "Pensando..." como flag?

Opções consideradas:
1. ✅ **Verificar "Pensando..."** (escolhida)
   - Simples e confiável
   - Não adiciona variáveis extras
   - Sempre presente antes de streaming/resposta

2. ❌ Adicionar flag `message.dataset.streamed = true`
   - Mais verboso
   - Requer lógica adicional
   - Desnecessário para caso de uso simples

3. ❌ Verificar tamanho do HTML
   - Não confiável (pode ter respostas curtas)
   - Complexo de debugar

### Alternativa Futura (Opcional):

Se quiser flag explícita:
```javascript
// No processarStreaming()
if (messageElement) {
  messageElement.dataset.wasStreamed = 'true';
}

// No then()
if (!assistantMessage.dataset.wasStreamed) {
  bubble.innerHTML = limparResposta(resposta);
}
```

## Status

✅ **Fix Implementado**
✅ **Testável Imediatamente**
✅ **Compatível com Streaming e JSON**

## Próximo Passo

**Recarregar a extensão** e testar:
1. `chrome://extensions`
2. Encontrar "Lex."
3. Clicar em 🔄 **Recarregar**
4. Fazer pergunta ao LEX
5. Verificar formatação após streaming ✅

---

**Data**: 2025-10-30
**Fix**: Preservação de formatação markdown após streaming
**Impacto**: Alto (UX crítica)
**Risco**: Baixo (apenas melhoria de lógica condicional)
