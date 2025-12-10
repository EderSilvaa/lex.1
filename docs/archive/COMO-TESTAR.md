# 🧪 Como Testar a Análise Completa com OpenAI

## 📋 Situação Atual

Atualmente os documentos estão **em cache mas sem texto extraído** (foram processados com fallback). Precisamos:

1. **Limpar o cache**
2. **Fazer deploy da Edge Function**
3. **Testar com análise real**

---

## 🚀 Opção 1: Testar Localmente (SEM deploy ainda)

Se você ainda **NÃO quer fazer deploy** no Supabase, podemos testar localmente:

### Passo 1: Limpar o Cache

1. Abra o Chrome no PJe
2. Abra o Console (F12)
3. Cole o conteúdo do arquivo `limpar-cache.js` e pressione Enter
4. Você verá:
   ```
   🗑️ X entradas removidas com sucesso!
   ✅ Cache limpo!
   ```

### Passo 2: Deixar Mock Ativado (Por Enquanto)

Edite `src/js/process-analyzer.js` linha 469:
```javascript
const useMock = true; // Manter TRUE para teste local
```

### Passo 3: Testar Novamente

1. **Recarregue a extensão** no Chrome
2. **Recarregue a página** do PJe (F5)
3. **Expanda a aba "Docs"**
4. **Clique no botão 🔍**
5. **Aguarde o processamento** - Agora vai baixar e extrair texto dos PDFs!

Você verá no console:
```
🔧 LEX: Inicializando PDF.js...
✅ LEX: PDF.js inicializado com sucesso
📄 LEX: Processando PDF...
✅ LEX: Texto extraído: 1234 caracteres
```

O mock ainda vai retornar uma resposta genérica, **MAS** os documentos agora terão o texto extraído e cacheado!

---

## 🌐 Opção 2: Testar com OpenAI REAL (Deploy no Supabase)

### Passo 1: Instalar Supabase CLI

```bash
npm install -g supabase
```

### Passo 2: Login no Supabase

```bash
supabase login
```

### Passo 3: Configurar OpenAI API Key

1. Acesse: https://supabase.com/dashboard/project/nspauxzztflgmxjgevmo/settings/functions
2. Vá em **Edge Functions → Secrets**
3. Adicione:
   - **Name**: `OPENAI_API_KEY`
   - **Value**: `sk-proj-...` (sua chave OpenAI)

### Passo 4: Deploy da Edge Function

No terminal, dentro da pasta do projeto:

```bash
# Windows (PowerShell)
supabase link --project-ref nspauxzztflgmxjgevmo
supabase functions deploy analisar-processo-completo
```

Ou use o script:
```bash
bash deploy.sh
```

### Passo 5: Limpar Cache (IMPORTANTE!)

Cole no console do Chrome (na página do PJe):
```javascript
// Copie o conteúdo de limpar-cache.js
```

### Passo 6: Verificar que Mock está DESATIVADO

O arquivo `src/js/process-analyzer.js` linha 469 já está com:
```javascript
const useMock = false; // ✅ ENDPOINT REAL ATIVADO!
```

### Passo 7: Testar!

1. **Recarregue a extensão** no Chrome
2. **Recarregue a página** do PJe (F5)
3. **Expanda a aba "Docs"**
4. **Clique no botão 🔍**
5. **Aguarde a análise REAL**

Agora você verá:
```
📤 LEX: Enviando documentos para API...
✅ LEX: Resposta recebida da API
🎉 LEX: Análise completa concluída!
```

E a análise será REAL, com:
- ✅ Resumo executivo
- ✅ Partes do processo
- ✅ Pedidos
- ✅ Fundamentos legais
- ✅ Cronologia
- ✅ Análise técnica completa

---

## 🔍 Verificar Logs no Supabase

Para ver os logs da Edge Function em tempo real:

```bash
supabase functions logs analisar-processo-completo --tail
```

Ou no Dashboard:
https://supabase.com/dashboard/project/nspauxzztflgmxjgevmo/functions/analisar-processo-completo/logs

---

## ❓ Problemas Comuns

### "PDFProcessor não disponível"

- ✅ Já corrigido! O PDFProcessor agora está no manifest.json

### "Documento encontrado no cache"

- 🧹 Limpe o cache usando o script `limpar-cache.js`

### "CORS error"

- ✅ A Edge Function já tem headers CORS configurados
- Se ainda ocorrer, verifique se a URL está com `https://`

### "OpenAI API error"

- Verifique se a `OPENAI_API_KEY` está configurada no Supabase
- Verifique se tem créditos na conta OpenAI

---

## 📊 Qual opção escolher?

- **Opção 1** (Mock): Use se quiser testar a extração de PDF primeiro, sem gastar créditos OpenAI
- **Opção 2** (Real): Use quando quiser ver a análise completa e real dos documentos

Recomendo testar primeiro a **Opção 1** para garantir que a extração de PDF está funcionando, depois partir para a **Opção 2**!

---

## 🎯 Status Atual

- ✅ Descoberta de documentos funcionando (4 docs encontrados)
- ✅ PDFProcessor configurado e carregando
- ✅ Edge Function criada e pronta para deploy
- ⏳ Aguardando: Limpeza de cache + teste

**Próximo passo**: Escolha uma das opções acima e teste! 🚀