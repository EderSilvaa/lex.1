// LEX-AGENT-PLANNER V3 - COM GPT-4 VISION
// Supabase Edge Function
// Deploy: supabase functions deploy LEX-AGENT-PLANNER

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Configuração OpenAI
const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';

serve(async (req) => {
  // CORS headers
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
      }
    });
  }

  try {
    const { command, context, screenshot } = await req.json();

    console.log('📥 Requisição recebida');
    console.log('Comando:', command);
    console.log('Contexto URL:', context?.url);
    console.log('Screenshot:', screenshot ? `${Math.round(screenshot.length / 1024)}KB` : 'não fornecido');

    // ====================================
    // SYSTEM PROMPT - COM VISÃO
    // ====================================

    const systemPrompt = `Você é LEX Agent, assistente jurídico especializado em automação do PJe.

NOVA CAPACIDADE: VISÃO! 🎨👁️
Você agora pode VER o navegador através de screenshots.

IMPORTANTE: Você tem acesso a:
1. 👁️ SCREENSHOT da página (imagem real do navegador)
2. 📝 Contexto textual (URL, seção, elementos detectados)

COMO USAR A VISÃO:
- SEMPRE analise o screenshot PRIMEIRO
- Identifique visualmente onde estão os elementos (campos, botões, links)
- Use o contexto textual para confirmar IDs e classes
- Se não conseguir ver claramente, use descrições textuais ao invés de seletores
- Prefira descrições visuais: "campo de pesquisa no topo da página"

TIPOS DE AÇÕES:
1. **click** - Clicar em elemento
   - Se tiver screenshot: descreva localização visual
   - Exemplo: "botão azul 'Consultar' no canto superior direito"

2. **fill** - Preencher campo
   - Identifique visualmente o campo
   - Exemplo: "campo de texto com placeholder 'Pesquisar'"

3. **navigate** - Navegar para URL
4. **wait** - Aguardar tempo/elemento
5. **select** - Selecionar opção em dropdown
6. **upload** - Upload de arquivo
7. **read** - Ler texto de elemento
8. **scroll** - Rolar página
9. **screenshot** - Tirar foto

RETORNO OBRIGATÓRIO (JSON):
{
  "intent": {
    "action": "pesquisar|navegar|preencher|...",
    "description": "O que será feito (linguagem natural)"
  },
  "steps": [
    {
      "order": 1,
      "type": "click|fill|navigate|wait|...",
      "description": "Descrição clara da ação",
      "visualDescription": "ONDE está o elemento na tela (baseado no screenshot)",
      "selector": "CSS selector (se identificável) ou null",
      "value": "valor a preencher (se aplicável)",
      "url": "URL (se navegação)",
      "reasoning": "Por que esta ação",
      "criteriaOfSuccess": {
        "type": "element_visible|element_state|text_present|url_change",
        "selector": "elemento a verificar (se aplicável)",
        "condition": "value_equals|checked|enabled (se aplicável)",
        "expected": "valor esperado (se aplicável)",
        "text": "texto a procurar (se aplicável)",
        "timeout": 5000
      }
    }
  ],
  "risks": [
    {
      "level": "low|medium|high",
      "description": "Descrição do risco",
      "mitigation": "Como mitigar"
    }
  ],
  "needsApproval": false,
  "estimatedTime": "10"
}

CRITÉRIOS DE SUCESSO (obrigatório em CADA step):

1. **element_visible** - Verificar se elemento apareceu
   Exemplo: Após clicar em "Consultar", verificar se resultados apareceram
   {
     "type": "element_visible",
     "selector": ".resultado-pesquisa",
     "timeout": 5000
   }

2. **element_state** - Verificar estado do elemento
   Exemplo: Após preencher campo, verificar se valor foi preenchido
   {
     "type": "element_state",
     "condition": "value_equals",
     "expected": "petição inicial",
     "timeout": 3000
   }

3. **text_present** - Verificar se texto apareceu
   Exemplo: Após login, verificar mensagem "Bem-vindo"
   {
     "type": "text_present",
     "text": "Bem-vindo",
     "timeout": 5000
   }

4. **url_change** - Verificar se URL mudou (navegação)
   Exemplo: Após clicar em link, verificar redirecionamento
   {
     "type": "url_change",
     "urlContains": "processo-detalhes",
     "timeout": 10000
   }

REGRAS CRÍTICAS:
1. 👁️ Se receber screenshot, SEMPRE use-o para identificar elementos visualmente
2. 📍 Use "visualDescription" para descrever ONDE está o elemento
3. 🎯 Se não conseguir identificar selector, use null e confie na visualDescription
4. ⚠️ Para ações críticas (protocolar, deletar): needsApproval = true
5. ⏱️ Estime tempo realisticamente (cada ação ~2-5s, navegação ~3-5s)
6. 🔍 Se a página não tiver o que o usuário quer, sugira navegação primeiro

ANÁLISE VISUAL:
- Identifique cores, posições, tamanhos
- Descreva layout ("topo da página", "lado esquerdo", "abaixo do título")
- Note textos visíveis em botões, labels, placeholders
- Identifique ícones e símbolos

Seja preciso e USE A VISÃO para tomar decisões melhores!`;

    // ====================================
    // USER PROMPT - INCLUI CONTEXTO VISUAL
    // ====================================

    let userPrompt = `COMANDO DO USUÁRIO: "${command}"\n\n`;

    // Adicionar contexto textual
    if (context) {
      userPrompt += `CONTEXTO TEXTUAL DA PÁGINA:\n`;
      userPrompt += `- URL: ${context.url || 'desconhecido'}\n`;
      userPrompt += `- Seção: ${context.section || 'desconhecido'}\n`;
      userPrompt += `- Processo: ${context.processNumber || 'não identificado'}\n\n`;

      if (context.interactiveElements && context.interactiveElements.length > 0) {
        userPrompt += `Elementos interativos detectados:\n`;
        context.interactiveElements.slice(0, 20).forEach((el: any) => {
          userPrompt += `  - ${el.type}: ${el.text || el.id || el.class}\n`;
        });
        userPrompt += `\n`;
      }

      if (context.visibleText) {
        userPrompt += `Texto visível na página (primeiras 500 chars):\n${context.visibleText.substring(0, 500)}\n\n`;
      }
    }

    userPrompt += `IMPORTANTE: Analise o screenshot e crie um plano de ação preciso.\n`;
    userPrompt += `Use "visualDescription" para descrever ONDE cada elemento está na imagem.`;

    // ====================================
    // CHAMADA OPENAI - GPT-4 VISION
    // ====================================

    const messages: any[] = [
      { role: 'system', content: systemPrompt },
      {
        role: 'user',
        content: []
      }
    ];

    // Adicionar screenshot se disponível
    if (screenshot) {
      messages[1].content.push({
        type: 'image_url',
        image_url: {
          url: `data:image/png;base64,${screenshot}`,
          detail: 'high' // Alta qualidade para identificar seletores
        }
      });
    }

    // Adicionar texto
    messages[1].content.push({
      type: 'text',
      text: userPrompt
    });

    console.log('🤖 Enviando para GPT-4 Vision...');

    const openaiResponse = await fetch(OPENAI_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: screenshot ? 'gpt-4o' : 'gpt-4o-mini', // Vision se tiver screenshot
        messages: messages,
        response_format: { type: 'json_object' },
        temperature: 0.3, // Mais determinístico
        max_tokens: 2000
      })
    });

    if (!openaiResponse.ok) {
      const errorText = await openaiResponse.text();
      console.error('❌ Erro OpenAI:', errorText);
      throw new Error(`OpenAI Error: ${openaiResponse.status}`);
    }

    const openaiData = await openaiResponse.json();
    const planText = openaiData.choices[0].message.content;

    console.log('✅ Resposta recebida do GPT-4');

    // Parse do JSON
    const plan = JSON.parse(planText);

    console.log(`✅ Plano criado: ${plan.steps?.length || 0} passos`);

    return new Response(
      JSON.stringify({ plan }),
      {
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      }
    );

  } catch (error: any) {
    console.error('❌ Erro no planejamento:', error);

    return new Response(
      JSON.stringify({
        error: error.message || 'Erro desconhecido',
        details: error.toString()
      }),
      {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      }
    );
  }
});
