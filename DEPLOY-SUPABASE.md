# 🚀 Deploy da Edge Function no Supabase

Este guia explica como fazer o deploy da Edge Function `analisar-processo-completo` no Supabase.

## 📋 Pré-requisitos

1. **Conta no Supabase**: [supabase.com](https://supabase.com)
2. **Supabase CLI instalado**:
   ```bash
   npm install -g supabase
   ```

3. **Projeto Supabase criado**: Você já tem (`nspauxzztflgmxjgevmo`)

## 🔑 Passo 1: Configurar OpenAI API Key no Supabase

1. Acesse seu projeto no Supabase Dashboard
2. Vá em **Settings → Edge Functions → Secrets**
3. Adicione a secret:
   - **Name**: `OPENAI_API_KEY`
   - **Value**: `sk-proj-...` (sua chave da OpenAI)

## 🔐 Passo 2: Login no Supabase CLI

```bash
supabase login
```

Isso abrirá o navegador para autenticação.

## 🔗 Passo 3: Link com seu projeto

```bash
supabase link --project-ref nspauxzztflgmxjgevmo
```

## 🚀 Passo 4: Deploy da Edge Function

```bash
supabase functions deploy analisar-processo-completo
```

## ✅ Passo 5: Verificar Deploy

Após o deploy, você verá a URL:
```
https://nspauxzztflgmxjgevmo.supabase.co/functions/v1/analisar-processo-completo
```

## 🧪 Passo 6: Testar a função

### Via curl:

```bash
curl -X POST https://nspauxzztflgmxjgevmo.supabase.co/functions/v1/analisar-processo-completo \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_SUPABASE_ANON_KEY" \
  -d '{
    "processoNumero": "0850709-38.2025.8.14.0301",
    "documentos": [
      {
        "id": "143305287",
        "nome": "ET-Vanessa.pdf",
        "tipo": "PDF",
        "conteudo": "Este é um teste de documento...",
        "metadata": {
          "processedAt": "2025-01-15T10:30:00Z",
          "stats": {
            "totalPages": 5,
            "totalCharacters": 1234
          }
        }
      }
    ],
    "analiseCompleta": true
  }'
```

### Via extensão LEX:

1. Recarregue a extensão no Chrome
2. Abra um processo no PJe
3. Expanda a aba "Docs"
4. Clique no botão 🔍
5. A extensão agora usará o endpoint REAL!

## 📊 Passo 7: Monitorar logs

Para ver os logs em tempo real:

```bash
supabase functions logs analisar-processo-completo --tail
```

Ou no Dashboard:
- **Edge Functions → analisar-processo-completo → Logs**

## 🔧 Troubleshooting

### Erro: "OPENAI_API_KEY não configurada"

Certifique-se de ter adicionado a secret no Supabase Dashboard (Passo 1).

### Erro: CORS

A função já inclui headers CORS. Se ainda tiver problemas, verifique se está usando `https://` na URL.

### Erro: 401 Unauthorized

Verifique se está passando o header `Authorization: Bearer YOUR_SUPABASE_ANON_KEY` correto.

## 🎯 Próximos passos

Após o deploy bem-sucedido:

1. ✅ A extensão automaticamente usará o endpoint real
2. ✅ Os documentos serão analisados com GPT-4
3. ✅ Você receberá análises completas e detalhadas

## 📝 Atualizar a função

Se precisar fazer alterações:

1. Edite `supabase/functions/analisar-processo-completo/index.ts`
2. Execute novamente:
   ```bash
   supabase functions deploy analisar-processo-completo
   ```

---

## 🆘 Suporte

- Documentação Supabase: https://supabase.com/docs/guides/functions
- Supabase Discord: https://discord.supabase.com
- OpenAI API Docs: https://platform.openai.com/docs