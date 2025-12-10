# 🧪 Guia Completo de Testes - LEX Agent

> **Consolidado de**: COMO-TESTAR.md, INSTRUCOES-TESTE.md, GUIA-TESTE-AGENT.md

---

## 📑 Índice

1. [Testes Básicos](#testes-básicos)
2. [Testar Correções de Bugs](#testar-correções-de-bugs)
3. [Testar LEX Agent Backend](#testar-lex-agent-backend)
4. [Testar Análise Completa com OpenAI](#testar-análise-completa-com-openai)
5. [Problemas Comuns](#problemas-comuns)

---

## 🚀 Testes Básicos

### 1. Recarregar a Extensão

1. Abra `chrome://extensions`
2. Encontre **Lex.**
3. Clique em **🔄 Recarregar**
4. Aguarde "Service worker (ativo)"

### 2. Verificar Funcionamento Básico

1. Abra uma página do PJe
2. Pressione **F12** (console)
3. Verifique logs:
   ```
   🚀 LEX: Iniciando inicialização...
   ✅ LEX: OpenAI Client disponível
   ```

### 3. Limpar Cache (Quando Necessário)

```javascript
// Cole no console do navegador (F12):
for (let i = localStorage.length - 1; i >= 0; i--) {
  const key = localStorage.key(i);
  if (key?.startsWith('lex_doc_cache_') || key === 'lex_session') {
    localStorage.removeItem(key);
  }
}
console.log('✅ Cache e sessão limpos. Recarregue a página (F5)');
```

---

## 🐛 Testar Correções de Bugs

### Problema: IA Retorna Respostas Vazias/Genéricas

**Correções aplicadas**:
- ✅ Compatibilidade de estrutura de dados (`content` vs `texto`)
- ✅ Cache re-inicializado após restauração de sessão
- ✅ Fallback para cache quando texto não está em memória

#### Teste:

**Passo 1**: Limpar dados antigos (recomendado)
```javascript
// Cole no console:
for (let i = localStorage.length - 1; i >= 0; i--) {
  const key = localStorage.key(i);
  if (key?.startsWith('lex_doc_cache_') || key === 'lex_session') {
    localStorage.removeItem(key);
  }
}
```

**Passo 2**: Recarregar extensão e página (F5)

**Passo 3**: Processar documentos do processo

**Passo 4**: Verificar se texto foi salvo
```javascript
// Cole no console:
const savedSession = localStorage.getItem('lex_session');
if (savedSession) {
  const session = JSON.parse(savedSession);
  console.log('📄 Documentos na sessão:', session.processedDocuments?.length || 0);

  if (session.processedDocuments?.length > 0) {
    const doc = session.processedDocuments[0];
    console.log('\n🔍 Verificando primeiro documento:');
    console.log('Nome:', doc.name);
    console.log('Tem texto?', !!doc.data?.texto);
    console.log('Tamanho do texto:', doc.data?.texto?.length || 0, 'caracteres');

    if (doc.data?.texto) {
      console.log('✅ SUCESSO! Texto foi salvo');
      console.log('Preview:', doc.data.texto.substring(0, 100) + '...');
    } else {
      console.log('❌ PROBLEMA: Texto não foi salvo');
    }
  }
}
```

**Passo 5**: Fazer pergunta à IA e verificar resposta
- ✅ Deve conter informações **específicas** dos documentos
- ✅ Deve citar trechos ou detalhes dos PDFs
- ❌ Não deve ser genérica ou vazia

**Passo 6**: Recarregar página (F5) e testar novamente
- Resposta deve continuar usando conteúdo dos documentos
- Console deve mostrar: `📦 LEX: Texto do documento XXXXX recuperado do cache`

#### Resultado Esperado:

**❌ ANTES** (problema):
```
"Com base nas informações disponíveis, apresento um resumo:
- Processo: XXXXXXX
- Tribunal: TJPA
[Informações genéricas sem conteúdo dos documentos]"
```

**✅ AGORA** (corrigido):
```
"Com base nos 16 documentos processados:

**Petição Inicial (ID 12345678)**:
A parte autora alega que [trecho extraído do documento]...

**Decisão Liminar (ID 87654321)**:
O juiz determinou [conteúdo específico da decisão]..."
```

---

## 🤖 Testar LEX Agent Backend

### Status Atual

- [x] Backend criado e rodando
- [x] WebSocket funcionando
- [x] Connector criado na extensão
- [x] GPT-4 Planner integrado via Supabase
- [x] Playwright conectado ao Chrome via CDP
- [x] Fluxo completo: Comando → Plan → Aprovação → Execução

### Passo a Passo:

#### 1. Verificar Backend Rodando

```bash
curl http://localhost:3000/health
```

**Resposta esperada**:
```json
{
  "status": "ok",
  "uptime": 20.05,
  "activeSessions": 0,
  "timestamp": "2025-10-30T..."
}
```

#### 2. Verificar Conexão no Console (F12)

Logs esperados:
```
🔌 LexAgentConnector inicializado
✅ LexAgentConnector carregado
🔌 Tentando conectar ao LEX Agent Backend...
✅ Conectado ao LEX Agent Backend
🔑 Session ID: session_1728...
```

Se não aparecer, forçar:
```javascript
window.lexAgentConnector.connect()
```

#### 3. Testar Status da Conexão

```javascript
lexAgent.getStatus()
```

#### 4. Testar Comando Completo

```javascript
// No chat do LEX, envie um comando de ação:
"clique no botão 'Documentos'"
"navegue até a aba 'Movimentações'"
"tire um screenshot da página"
```

---

## 📊 Testar Análise Completa com OpenAI

### Opção 1: Teste Local (Com Mock)

**Quando usar**: Testar extração de PDF sem gastar créditos OpenAI

**Passos**:

1. **Limpar cache** (script acima)
2. **Editar** `src/js/process-analyzer.js` linha 469:
   ```javascript
   const useMock = true; // Manter TRUE para teste local
   ```
3. **Recarregar** extensão e página
4. **Expandir aba "Docs"** e clicar no botão 🔍
5. **Verificar logs**:
   ```
   🔧 LEX: Inicializando PDF.js...
   ✅ LEX: PDF.js inicializado com sucesso
   📄 LEX: Processando PDF...
   ✅ LEX: Texto extraído: 1234 caracteres
   ```

**Resultado**: Documentos terão texto extraído e cacheado, mas resposta será mock.

---

### Opção 2: Teste Real (Com OpenAI)

**Quando usar**: Análise completa e real dos documentos

#### Pré-requisitos:

**1. Instalar Supabase CLI**:
```bash
npm install -g supabase
```

**2. Login**:
```bash
supabase login
```

**3. Configurar OpenAI API Key**:
1. Acesse: https://supabase.com/dashboard/project/nspauxzztflgmxjgevmo/settings/functions
2. **Edge Functions → Secrets**
3. Adicione:
   - **Name**: `OPENAI_API_KEY`
   - **Value**: `sk-proj-...` (sua chave)

**4. Deploy da Edge Function**:
```bash
supabase link --project-ref nspauxzztflgmxjgevmo
supabase functions deploy OPENIA
```

Ou use:
```bash
bash deploy.sh
```

#### Teste:

1. **Limpar cache** (importante!)
2. **Verificar mock desativado** em `process-analyzer.js`:
   ```javascript
   const useMock = false; // ✅ ENDPOINT REAL
   ```
3. **Recarregar** extensão e página
4. **Expandir aba "Docs"** e clicar no botão 🔍
5. **Verificar logs**:
   ```
   📤 LEX: Enviando documentos para API...
   ✅ LEX: Resposta recebida da API
   🎉 LEX: Análise completa concluída!
   ```

**Resultado**: Análise REAL com:
- ✅ Resumo executivo
- ✅ Partes do processo
- ✅ Pedidos
- ✅ Fundamentos legais
- ✅ Cronologia
- ✅ Análise técnica completa

#### Ver Logs da Edge Function:

```bash
supabase functions logs OPENIA --tail
```

Ou no Dashboard:
https://supabase.com/dashboard/project/nspauxzztflgmxjgevmo/functions/OPENIA/logs

---

## ❓ Problemas Comuns

### "PDFProcessor não disponível"
- ✅ **Corrigido**: PDFProcessor agora está no manifest.json

### "Documento encontrado no cache"
- 🧹 **Solução**: Limpe o cache usando o script

### "CORS error"
- ✅ **Corrigido**: Edge Function tem headers CORS
- Se persistir, verifique se URL está com `https://`

### "OpenAI API error"
- Verifique se `OPENAI_API_KEY` está configurada no Supabase
- Verifique se tem créditos na conta OpenAI

### IA ainda dá respostas vazias após reload
- **Causa**: Cache foi limpo pelo navegador ou expirou
- **Solução**: Reprocessar os documentos do processo

### Cache expirou (TTL de 30 minutos)
- **Solução**: Reprocessar os documentos

### Extensão não carregou correções
- **Solução**:
  1. Recarregar extensão em `chrome://extensions`
  2. Limpar cache
  3. Recarregar página
  4. Reprocessar documentos

---

## 🔍 Debug Avançado

### Ativar Logs Detalhados

```javascript
// Antes de usar o LEX:
localStorage.setItem('lex_debug', 'true');

// Use o LEX normalmente - verá logs detalhados

// Desativar:
localStorage.removeItem('lex_debug');
```

### Verificar HTML Formatado

```javascript
// Verificar se mensagem tem HTML formatado:
document.querySelector('.lex-bubble').innerHTML
```

**Esperado**:
```html
<h3>Análise da Sentença</h3>
<ul>
  <li><strong>Item 1</strong>: Descrição...</li>
</ul>
```

**Não esperado** (bug):
```
### Análise da Sentença\n- Item 1
```

---

## 📋 Checklist de Testes

### Antes de Deploy:
- [ ] Backend rodando (`curl localhost:3000/health`)
- [ ] Extensão recarregada
- [ ] Cache limpo
- [ ] OpenAI API Key configurada (se teste real)

### Teste Básico:
- [ ] Extensão carrega sem erros
- [ ] Logs aparecem no console
- [ ] Modal abre e fecha

### Teste de Documentos:
- [ ] Documentos são processados
- [ ] Texto é extraído de PDFs
- [ ] Cache salva texto corretamente
- [ ] Sessão restaura após reload

### Teste de IA:
- [ ] Pergunta retorna resposta específica
- [ ] Resposta usa conteúdo dos documentos
- [ ] Formatação markdown funciona
- [ ] Streaming funciona (se habilitado)

### Teste de Agent:
- [ ] Backend conecta via WebSocket
- [ ] Comandos de ação funcionam
- [ ] GPT-4 Planner gera planos
- [ ] Playwright executa ações

---

## 📞 Reportar Problemas

Se encontrar problemas:

1. **Copie logs do console** (F12)
2. **Tire screenshots** da resposta da IA
3. **Execute script de verificação** (seção "Testar Correções")
4. **Copie resultado** do script
5. **Reporte** com essas informações

---

**Última atualização**: 30 de outubro de 2025
**Status**: Guia consolidado e atualizado
