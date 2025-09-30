# Supabase Edge Function - Análise Completa de Processo

## 📋 Visão Geral

Este documento descreve como criar a Edge Function no Supabase para receber e processar documentos completos de processos judiciais.

## 🎯 Endpoint

**URL:** `https://nspauxzztflgmxjgevmo.supabase.co/functions/v1/analisar-processo-completo`

**Método:** `POST`

**Headers:**
```json
{
  "Content-Type": "application/json",
  "Authorization": "Bearer YOUR_SUPABASE_KEY",
  "apikey": "YOUR_SUPABASE_KEY"
}
```

---

## 📤 Payload de Entrada

```json
{
  "processoNumero": "0801943-25.2023.8.14.0301",
  "documentos": [
    {
      "id": "138900735",
      "nome": "Petição Inicial",
      "tipo": "PDF",
      "conteudo": "texto extraído do documento...",
      "metadata": {
        "processedAt": "2025-01-15T10:30:00Z",
        "contentType": "application/pdf",
        "size": 45678,
        "stats": {
          "totalPages": 5,
          "totalCharacters": 12345
        }
      }
    }
  ],
  "batchInfo": {
    "current": 1,
    "total": 3
  },
  "analiseCompleta": true
}
```

---

## 📥 Payload de Resposta

```json
{
  "success": true,
  "resumo": "Análise detalhada do processo...",
  "processoNumero": "0801943-25.2023.8.14.0301",
  "documentosAnalisados": 5,
  "insights": {
    "tipoProcesso": "Recuperação Judicial",
    "partes": {
      "autor": "Empresa ABC LTDA",
      "reu": "N/A"
    },
    "faseAtual": "Decisão",
    "documentosCriticos": [
      {
        "id": "138900735",
        "tipo": "Petição Inicial",
        "relevancia": "alta",
        "resumo": "Pedido de recuperação judicial..."
      }
    ],
    "prazos": [
      {
        "descricao": "Manifestação dos credores",
        "prazo": "30 dias",
        "vencimento": "2025-02-15"
      }
    ],
    "proximosPassos": [
      "Aguardar manifestação dos credores",
      "Elaborar plano de recuperação",
      "Apresentar documentação contábil"
    ]
  },
  "timestamp": "2025-01-15T10:35:00Z"
}
```

---

## 🔧 Código da Edge Function (Deno/TypeScript)

Crie um arquivo `supabase/functions/analisar-processo-completo/index.ts`:

```typescript
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

// Configuração da OpenAI
const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
const OPENAI_MODEL = 'gpt-4-turbo-preview'; // ou gpt-3.5-turbo para economia

serve(async (req) => {
  // CORS headers
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Content-Type': 'application/json',
  };

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers });
  }

  try {
    // Parse request body
    const body = await req.json();
    const { processoNumero, documentos, batchInfo, analiseCompleta } = body;

    console.log(`📥 Recebendo análise do processo ${processoNumero}`);
    console.log(`📄 Batch ${batchInfo.current}/${batchInfo.total} com ${documentos.length} documentos`);

    // Validar entrada
    if (!processoNumero || !documentos || documentos.length === 0) {
      return new Response(
        JSON.stringify({ error: 'Dados inválidos' }),
        { status: 400, headers }
      );
    }

    // Construir prompt para OpenAI
    const prompt = construirPromptAnalise(processoNumero, documentos, batchInfo);

    // Chamar OpenAI
    const analise = await analisarComOpenAI(prompt);

    // Resposta
    const resposta = {
      success: true,
      resumo: analise,
      processoNumero: processoNumero,
      documentosAnalisados: documentos.length,
      batchInfo: batchInfo,
      timestamp: new Date().toISOString()
    };

    console.log(`✅ Análise concluída para batch ${batchInfo.current}/${batchInfo.total}`);

    return new Response(
      JSON.stringify(resposta),
      { status: 200, headers }
    );

  } catch (error) {
    console.error('❌ Erro:', error);

    return new Response(
      JSON.stringify({
        error: error.message,
        fallback: 'Erro ao processar análise. Tente novamente.'
      }),
      { status: 500, headers }
    );
  }
});

/**
 * Constrói prompt para análise do processo
 */
function construirPromptAnalise(
  processoNumero: string,
  documentos: any[],
  batchInfo: any
): string {
  const isUltimoBatch = batchInfo.current === batchInfo.total;

  let prompt = `Você é Lex, uma assistente jurídica especializada em análise processual.

PROCESSO: ${processoNumero}
BATCH: ${batchInfo.current} de ${batchInfo.total}

DOCUMENTOS PARA ANÁLISE:
`;

  // Adicionar cada documento
  for (const doc of documentos) {
    prompt += `
---
DOCUMENTO ${doc.id}: ${doc.nome}
TIPO: ${doc.tipo}
CONTEÚDO:
${doc.conteudo.substring(0, 5000)} ${doc.conteudo.length > 5000 ? '...' : ''}
---
`;
  }

  if (isUltimoBatch) {
    prompt += `

INSTRUÇÕES:
Este é o último batch de documentos. Forneça uma análise COMPLETA e CONSOLIDADA do processo, incluindo:

1. **Resumo Executivo** (3-4 parágrafos)
   - Natureza do processo
   - Partes envolvidas
   - Fase processual atual
   - Pedidos principais

2. **Documentos Críticos**
   - Liste os 3-5 documentos mais importantes
   - Explique a relevância de cada um

3. **Timeline Cronológica**
   - Principais marcos processuais
   - Datas importantes

4. **Análise Jurídica**
   - Teses sustentadas pelas partes
   - Argumentos principais
   - Questões de direito envolvidas

5. **Prazos e Obrigações**
   - Prazos pendentes ou próximos
   - Ações necessárias

6. **Próximos Passos Recomendados**
   - Ações imediatas
   - Estratégia sugerida
   - Pontos de atenção

Use linguagem clara e profissional. Formate com HTML simples (use <br>, <strong>, <em>).
`;
  } else {
    prompt += `

INSTRUÇÕES:
Este é o batch ${batchInfo.current} de ${batchInfo.total}. Faça uma análise PARCIAL destes documentos:

1. Identifique o tipo de cada documento
2. Extraia informações-chave de cada um
3. Destaque pontos relevantes

Aguarde os próximos batches para análise consolidada final.

Use linguagem clara e profissional. Formate com HTML simples.
`;
  }

  return prompt;
}

/**
 * Chama OpenAI para análise
 */
async function analisarComOpenAI(prompt: string): Promise<string> {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      messages: [
        {
          role: 'system',
          content: 'Você é Lex, uma assistente jurídica especializada em análise processual. Forneça análises precisas, objetivas e bem estruturadas.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.7,
      max_tokens: 2000
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenAI API erro: ${error}`);
  }

  const data = await response.json();
  return data.choices[0].message.content;
}
```

---

## 🚀 Deploy

### 1. Instalar Supabase CLI

```bash
npm install -g supabase
```

### 2. Login no Supabase

```bash
supabase login
```

### 3. Inicializar projeto (se necessário)

```bash
supabase init
```

### 4. Criar a função

```bash
supabase functions new analisar-processo-completo
```

### 5. Copiar o código acima para o arquivo criado

```bash
# Editar: supabase/functions/analisar-processo-completo/index.ts
```

### 6. Adicionar variáveis de ambiente

Criar arquivo `.env`:

```
OPENAI_API_KEY=sk-...your-key-here
```

### 7. Deploy

```bash
supabase functions deploy analisar-processo-completo --no-verify-jwt
```

### 8. Testar

```bash
curl -X POST https://nspauxzztflgmxjgevmo.supabase.co/functions/v1/analisar-processo-completo \
  -H "Authorization: Bearer YOUR_SUPABASE_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "processoNumero": "0801943-25.2023.8.14.0301",
    "documentos": [{"id": "1", "nome": "Teste", "tipo": "PDF", "conteudo": "Teste"}],
    "batchInfo": {"current": 1, "total": 1},
    "analiseCompleta": true
  }'
```

---

## ⚙️ Configuração do Projeto

1. No dashboard do Supabase, vá em **Settings > Edge Functions**
2. Adicione a variável de ambiente `OPENAI_API_KEY`
3. Configure o timeout para 60 segundos (análises grandes podem demorar)

---

## 💰 Custos Estimados

**OpenAI GPT-4:**
- Input: $0.03 / 1K tokens
- Output: $0.06 / 1K tokens

**Exemplo:**
- Processo com 10 documentos
- Média de 2000 tokens por documento
- Total: ~20K tokens input + 2K tokens output
- Custo: ~$0.72 por análise completa

**Supabase Edge Functions:**
- Gratuito até 500K invocações/mês
- Depois: $2 por 1M invocações

---

## 🔒 Segurança

1. ✅ **Nunca exponha a API key da OpenAI no client-side**
2. ✅ **Use variáveis de ambiente no Supabase**
3. ✅ **Implemente rate limiting se necessário**
4. ✅ **Valide todos os inputs**
5. ✅ **Limite tamanho dos documentos (já implementado no client)**

---

## 📊 Monitoramento

No dashboard do Supabase, você pode ver:
- Número de invocações
- Tempo de resposta
- Erros
- Logs em tempo real

---

## 🐛 Troubleshooting

### Erro: "Function not found"
- Verifique se o deploy foi bem-sucedido
- Confirme o nome da função no URL

### Erro: "OpenAI API erro"
- Verifique se a OPENAI_API_KEY está configurada
- Confirme que a key tem créditos

### Timeout
- Reduza o tamanho dos batches
- Aumente o timeout do Supabase
- Considere usar GPT-3.5-turbo para respostas mais rápidas

---

## ✅ Próximos Passos

Após criar o endpoint:

1. ✅ Testar com processo real
2. ✅ Ajustar prompts baseado nos resultados
3. ✅ Implementar cache de análises no Supabase (opcional)
4. ✅ Adicionar webhook para análises longas (opcional)
5. ✅ Implementar sistema de priorização (opcional)