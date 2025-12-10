// Edge Function: OPENIA com Streaming
// Supabase Edge Function que retorna respostas da OpenAI em tempo real (streaming)
// Deploy: supabase functions deploy OPENIA

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY')

serve(async (req) => {
  // CORS headers
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  }

  // Handle OPTIONS (preflight)
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { pergunta, contexto } = await req.json()

    if (!pergunta) {
      return new Response(
        JSON.stringify({ error: 'Pergunta é obrigatória' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log('📥 Recebido:', { pergunta: pergunta.substring(0, 100), contexto: contexto?.substring(0, 100) })

    // Chamar OpenAI com streaming
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [
          {
            role: 'system',
            content: contexto || 'Você é uma assistente jurídica especializada.'
          },
          {
            role: 'user',
            content: pergunta
          }
        ],
        temperature: 0.7,
        max_tokens: 4000,
        stream: true  // ← ATIVA STREAMING
      })
    })

    if (!response.ok) {
      const error = await response.text()
      console.error('❌ Erro OpenAI:', error)
      return new Response(
        JSON.stringify({ error: 'Erro ao consultar OpenAI', details: error }),
        { status: response.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Retornar como Server-Sent Events (SSE)
    const stream = new ReadableStream({
      async start(controller) {
        const reader = response.body?.getReader()
        const decoder = new TextDecoder()

        if (!reader) {
          controller.close()
          return
        }

        try {
          while (true) {
            const { done, value } = await reader.read()

            if (done) {
              // Enviar evento de conclusão
              controller.enqueue(new TextEncoder().encode('data: [DONE]\n\n'))
              controller.close()
              break
            }

            // Decodificar chunk
            const chunk = decoder.decode(value, { stream: true })

            // OpenAI retorna múltiplas linhas "data: {...}"
            const lines = chunk.split('\n').filter(line => line.trim() !== '')

            for (const line of lines) {
              if (line.startsWith('data: ')) {
                const data = line.substring(6) // Remove "data: "

                if (data === '[DONE]') {
                  controller.enqueue(new TextEncoder().encode('data: [DONE]\n\n'))
                  continue
                }

                try {
                  const parsed = JSON.parse(data)
                  const text = parsed.choices?.[0]?.delta?.content || ''

                  if (text) {
                    // Reenviar apenas o texto para o cliente
                    const sseMessage = `data: ${JSON.stringify({ text })}\n\n`
                    controller.enqueue(new TextEncoder().encode(sseMessage))
                  }
                } catch (e) {
                  console.error('Erro ao parsear chunk:', e)
                }
              }
            }
          }
        } catch (error) {
          console.error('❌ Erro no streaming:', error)
          controller.error(error)
        }
      }
    })

    return new Response(stream, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      }
    })

  } catch (error) {
    console.error('❌ Erro:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
