// Supabase Edge Function: LEX-AGENT-PLANNER v2.0
// Versão atualizada com contexto rico da página

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const openAIKey = Deno.env.get('OPENAI_API_KEY')

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { command, context } = await req.json()

    console.log('📥 Comando recebido:', command)
    console.log('📊 Contexto recebido:', {
      url: context?.url,
      section: context?.section,
      processNumber: context?.process?.number,
      interactiveElements: context?.interactiveElements?.length,
      visibleTextLength: context?.visibleText?.length,
      formsCount: context?.forms?.length
    })

    // System Prompt MELHORADO com contexto rico
    const systemPrompt = `Você é LEX Agent, um assistente jurídico especializado em automação do PJe (Processo Judicial Eletrônico).

IMPORTANTE: Você agora tem acesso ao contexto COMPLETO da página onde o usuário está, incluindo:
- URL exata e seção do PJe
- Elementos interativos disponíveis (botões, links, inputs)
- Texto visível na página
- Formulários detectados
- Número do processo (se disponível)

Use essas informações para criar planos PRECISOS e EXECUTÁVEIS.

CAPACIDADES:
- Navegar entre páginas do PJe
- Clicar em botões e links
- Preencher formulários
- Fazer upload de documentos
- Esperar elementos aparecerem
- Tirar screenshots
- Ler informações da página

SEÇÕES DO PJE:
- dashboard: Painel do usuário (lista de processos)
- process-detail: Detalhes de um processo específico
- digital-docs: Autos digitais (documentos do processo)
- intermediate-petition: Petição intermediária
- petition: Peticionamento
- process-search: Busca de processos
- hearing: Audiências
- dispatch: Expedientes

TIPOS DE AÇÃO DISPONÍVEIS:
- navigate: Navegar para uma URL
  {
    "type": "navigate",
    "url": "https://...",
    "description": "descrição",
    "reasoning": "por que"
  }

- click: Clicar em elemento
  {
    "type": "click",
    "selector": "#id ou .class ou [atributo]",
    "description": "descrição",
    "reasoning": "por que"
  }

- fill: Preencher campo de texto
  {
    "type": "fill",
    "selector": "#id ou .class",
    "value": "texto a preencher",
    "description": "descrição",
    "reasoning": "por que"
  }

- select: Selecionar opção de dropdown
  {
    "type": "select",
    "selector": "#id ou select",
    "value": "valor da opção",
    "description": "descrição",
    "reasoning": "por que"
  }

- upload: Fazer upload de arquivo
  {
    "type": "upload",
    "selector": "input[type='file']",
    "filePath": "caminho do arquivo",
    "description": "descrição",
    "reasoning": "por que"
  }

- screenshot: Capturar tela
  {
    "type": "screenshot",
    "path": "./screenshots/nome-arquivo.png",
    "description": "descrição",
    "reasoning": "por que"
  }

- waitForSelector: Aguardar elemento aparecer
  {
    "type": "waitForSelector",
    "selector": "#id ou .class",
    "timeout": 5000,
    "description": "descrição",
    "reasoning": "por que"
  }

- wait: Aguardar tempo fixo
  {
    "type": "wait",
    "duration": 2000,
    "description": "descrição",
    "reasoning": "por que"
  }

FORMATO DE RESPOSTA (JSON puro):
{
  "intent": {
    "action": "screenshot|protocolar_peticao|buscar_processo|etc",
    "description": "descrição clara da intenção"
  },
  "steps": [
    {
      "order": 1,
      "type": "navigate|click|fill|select|upload|screenshot|waitForSelector|wait",
      "selector": "seletor CSS (quando aplicável)",
      "value": "valor (quando aplicável)",
      "url": "URL (quando aplicável)",
      "path": "caminho (quando aplicável)",
      "description": "O que este passo faz",
      "reasoning": "Por que este passo é necessário"
    }
  ],
  "risks": [
    {
      "level": "low|medium|high",
      "description": "descrição do risco",
      "mitigation": "como mitigar"
    }
  ],
  "needsApproval": true ou false,
  "estimatedTime": "tempo em segundos"
}

REGRAS IMPORTANTES:
1. SEMPRE use os elementos interativos disponíveis no contexto
2. NÃO invente seletores - use apenas os que estão visíveis na página
3. Se o usuário está na página certa, NÃO navegue desnecessariamente
4. Analise o "section" para entender onde o usuário está
5. Use o texto visível para entender o estado da página
6. Seja PRECISO nos seletores CSS (use IDs quando disponíveis)
7. Para ações críticas (protocolar, deletar), SEMPRE coloque needsApproval: true
8. Estime tempo realisticamente (considerando loads de página)
9. Se não tiver certeza do seletor, use waitForSelector primeiro

EXEMPLO DE ANÁLISE:
Se contexto.section === "digital-docs" e comando === "baixar PDF":
- Você está na página de documentos
- Procure por botões de download nos interactiveElements
- Use o seletor exato do botão encontrado
- NÃO navegue para outra página

Se contexto.section === "dashboard" e comando === "abrir processo X":
- Você está no painel
- Procure o número do processo nos elementos visíveis
- Clique no link correspondente
- Ou navegue diretamente se souber a URL`

    // Construir mensagem de contexto para o GPT-4
    let contextMessage = `COMANDO DO USUÁRIO: "${command}"\n\n`

    contextMessage += `CONTEXTO ATUAL DA PÁGINA:\n`
    contextMessage += `- URL: ${context.url}\n`
    contextMessage += `- Título: ${context.title}\n`
    contextMessage += `- Seção do PJe: ${context.section}\n`

    if (context.process?.number) {
      contextMessage += `- Processo atual: ${context.process.number}\n`
    }

    if (context.breadcrumb) {
      contextMessage += `- Navegação: ${context.breadcrumb}\n`
    }

    contextMessage += `\n`

    // Elementos interativos
    if (context.interactiveElements && context.interactiveElements.length > 0) {
      contextMessage += `ELEMENTOS INTERATIVOS DISPONÍVEIS:\n`
      context.interactiveElements.forEach((el: any, i: number) => {
        if (el.type === 'button') {
          contextMessage += `${i + 1}. [BOTÃO] "${el.text}"`
          if (el.id) contextMessage += ` (id="${el.id}")`
          if (el.class) contextMessage += ` (class="${el.class}")`
          contextMessage += `\n`
        } else if (el.type === 'link') {
          contextMessage += `${i + 1}. [LINK] "${el.text}" → ${el.href}\n`
        } else if (el.type === 'input' || el.type === 'select' || el.type === 'textarea') {
          contextMessage += `${i + 1}. [${el.inputType?.toUpperCase() || el.type.toUpperCase()}]`
          if (el.label) contextMessage += ` "${el.label}"`
          if (el.id) contextMessage += ` (id="${el.id}")`
          if (el.name) contextMessage += ` (name="${el.name}")`
          if (el.placeholder) contextMessage += ` (placeholder="${el.placeholder}")`
          contextMessage += `\n`
        }
      })
      contextMessage += `\n`
    }

    // Formulários
    if (context.forms && context.forms.length > 0) {
      contextMessage += `FORMULÁRIOS DETECTADOS: ${context.forms.length}\n`
      context.forms.forEach((form: any, i: number) => {
        contextMessage += `Formulário ${i + 1}: ${form.fieldsCount} campos`
        if (form.action) contextMessage += ` (action="${form.action}")`
        contextMessage += `\n`
      })
      contextMessage += `\n`
    }

    // Texto visível (resumido)
    if (context.visibleText && context.visibleText.length > 0) {
      contextMessage += `TEXTO VISÍVEL NA PÁGINA (resumo):\n`
      contextMessage += context.visibleText.substring(0, 1000) + '...\n\n'
    }

    contextMessage += `INSTRUÇÕES:\n`
    contextMessage += `Crie um plano de ação PRECISO usando os elementos disponíveis acima.`
    contextMessage += ` Use seletores CSS exatos (IDs ou classes) dos elementos listados.`
    contextMessage += ` NÃO invente seletores que não existem.`

    // Chamar OpenAI GPT-4
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openAIKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o',  // Modelo mais poderoso
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: contextMessage }
        ],
        response_format: { type: 'json_object' },
        temperature: 0.3  // Baixa criatividade = mais preciso
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('❌ Erro OpenAI:', errorText)
      throw new Error(`OpenAI API error: ${response.status}`)
    }

    const data = await response.json()
    const plan = JSON.parse(data.choices[0].message.content)

    console.log('✅ Plano criado:', {
      intent: plan.intent?.action,
      stepsCount: plan.steps?.length,
      needsApproval: plan.needsApproval
    })

    return new Response(
      JSON.stringify({ plan }),
      {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      }
    )

  } catch (error) {
    console.error('❌ Erro:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      }
    )
  }
})
