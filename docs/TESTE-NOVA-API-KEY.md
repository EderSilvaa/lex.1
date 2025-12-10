# 🧪 Teste da Nova API Key

## 📋 Checklist de Verificação:

### ✅ **1. API Key Configurada no Supabase**
- [x] Environment variable `OPENAI_API_KEY` criada
- [x] Nova API key da OpenAI inserida
- [ ] Função redployada (se necessário)

### 🧪 **2. Teste Manual da API Key**
Teste direto na OpenAI para confirmar que a chave funciona:

```bash
curl https://api.openai.com/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer SUA_NOVA_CHAVE_AQUI" \
  -d '{
    "model": "gpt-4o-mini",
    "messages": [{"role": "user", "content": "teste simples"}],
    "max_tokens": 50
  }'
```

### 🔄 **3. Redeploy da Edge Function (se necessário)**
No Supabase:
1. Vá em **Edge Functions**
2. Encontre sua função
3. Clique nos **3 pontinhos**
4. Clique em **"Redeploy"**

### 🎯 **4. Teste na Extensão**
1. Abra o PJe
2. Selecione um texto
3. Clique no botão da extensão
4. Veja se funciona!

## 📝 **Resultado do Teste:**
- [ ] ✅ Funcionou perfeitamente
- [ ] ❌ Ainda deu erro (anotar qual erro)

## 🚨 **Se ainda der erro:**
1. Aguarde 2-3 minutos (API keys novas podem demorar para ativar)
2. Verifique se copiou a chave completa
3. Teste a chave diretamente na OpenAI primeiro