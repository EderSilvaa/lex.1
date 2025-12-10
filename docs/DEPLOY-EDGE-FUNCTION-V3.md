# 🚀 Deploy Edge Function V3 - GPT-4 Vision + Criteria

## 📦 Arquivo para Deploy

**Fonte:** `EDGE-FUNCTION-LEX-AGENT-PLANNER-V3-VISION.ts`

## 📍 Passos para Deploy

### 1. Copiar para projeto Supabase

```bash
# Na sua máquina local, onde está o projeto Supabase
cd ~/supabase-project  # ou onde você tem o projeto

# Copiar o arquivo
cp c:/Users/EDER/lex-test1/EDGE-FUNCTION-LEX-AGENT-PLANNER-V3-VISION.ts \
   ./supabase/functions/LEX-AGENT-PLANNER/index.ts
```

### 2. Deploy via Supabase CLI

```bash
# Fazer login (se ainda não estiver)
supabase login

# Deploy da função
supabase functions deploy LEX-AGENT-PLANNER

# Verificar deploy
supabase functions list
```

### 3. Verificar Variáveis de Ambiente

```bash
# Verificar se OPENAI_API_KEY está configurada
supabase secrets list

# Se não estiver, configurar:
supabase secrets set OPENAI_API_KEY=sk-your-key-here
```

### 4. Testar Edge Function

```bash
# Teste básico
curl -i --location --request POST \
  'https://nspauxzztflgmxjgevmo.supabase.co/functions/v1/LEX-AGENT-PLANNER' \
  --header 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' \
  --header 'Content-Type: application/json' \
  --data '{
    "command": "teste",
    "context": {
      "url": "https://pje.tjpa.jus.br/test",
      "section": "dashboard"
    }
  }'
```

### 5. Verificar Logs

```bash
# Ver logs em tempo real
supabase functions logs LEX-AGENT-PLANNER --tail
```

---

## ✅ Checklist de Deploy

- [ ] Arquivo copiado para `supabase/functions/LEX-AGENT-PLANNER/index.ts`
- [ ] Deploy realizado com sucesso
- [ ] `OPENAI_API_KEY` configurada nos secrets
- [ ] Teste básico retornou status 200
- [ ] Logs mostrando funcionamento correto

---

## 🔧 Alternativa: Deploy Manual (Painel Supabase)

Se preferir fazer pelo painel web:

1. Acesse: https://supabase.com/dashboard
2. Selecione seu projeto
3. Vá em **Edge Functions**
4. Crie/Edite `LEX-AGENT-PLANNER`
5. Cole o conteúdo de `EDGE-FUNCTION-LEX-AGENT-PLANNER-V3-VISION.ts`
6. Clique em **Deploy**
7. Configure `OPENAI_API_KEY` em **Settings → Secrets**

---

## 📝 O Que Mudou na V3

### Novidades:

1. **📸 Recebe screenshot em base64**
   ```typescript
   const { command, context, screenshot } = await req.json();
   ```

2. **👁️ Usa GPT-4o (modelo com visão)**
   ```typescript
   model: screenshot ? 'gpt-4o' : 'gpt-4o-mini'
   ```

3. **🎨 Envia imagem para GPT-4**
   ```typescript
   messages[1].content.push({
     type: 'image_url',
     image_url: {
       url: `data:image/png;base64,${screenshot}`,
       detail: 'high'
     }
   });
   ```

4. **✅ Retorna plano com visualDescription**
   ```json
   {
     "visualDescription": "Campo branco no topo com ícone de lupa",
     "selector": "input[placeholder*='Pesquisar']"
   }
   ```

5. **🎯 Inclui criteriaOfSuccess**
   ```json
   {
     "criteriaOfSuccess": {
       "type": "element_visible",
       "selector": ".resultado-pesquisa",
       "timeout": 5000
     }
   }
   ```

---

## 🧪 Teste Pós-Deploy

Quando estiver deployado, teste com:

```javascript
// No console do navegador (página PJe)
window.lexAgent.executeCommand('pesquisar por petição inicial')

// Aguardar modal aparecer
// Clicar em [Executar]

// Verificar logs do backend:
// 📸 Capturando screenshot para análise visual...
// ✅ Screenshot capturado: 245KB
// 👁️ Incluindo screenshot para análise visual (GPT-4 Vision)
// 📤 Enviando para LEX-AGENT-PLANNER...
```

---

## ⚠️ Troubleshooting

### Erro: "OPENAI_API_KEY not found"
```bash
supabase secrets set OPENAI_API_KEY=sk-your-key
```

### Erro: "Function not found"
```bash
supabase functions deploy LEX-AGENT-PLANNER
```

### Erro: "Screenshot too large"
Reduzir qualidade do screenshot:
```javascript
const screenshot = await this.page.screenshot({
  type: 'jpeg',  // ao invés de 'png'
  quality: 80    // comprimir
});
```

---

**Próximo passo após deploy:** Reiniciar backend e testar! 🚀
