// Supabase Edge Function - Análise Completa de Processo com OpenAI
// Recebe documentos processados e envia para análise com GPT-4

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import "https://deno.land/x/xhr@0.1.0/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface Documento {
  id: string;
  nome: string;
  tipo: string;
  conteudo: string;
  metadata: {
    processedAt: string;
    contentType?: string;
    size?: number;
    stats?: {
      totalPages?: number;
      totalCharacters?: number;
    };
  };
}

interface RequestPayload {
  processoNumero: string;
  documentos: Documento[];
  batchInfo?: {
    current: number;
    total: number;
  };
  analiseCompleta: boolean;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    console.log('📥 Recebendo requisição de análise completa...');

    // Parse request body
    const payload: RequestPayload = await req.json();

    console.log(`📋 Processo: ${payload.processoNumero}`);
    console.log(`📄 Documentos recebidos: ${payload.documentos.length}`);

    // Validar payload
    if (!payload.processoNumero || !payload.documentos || payload.documentos.length === 0) {
      throw new Error('Payload inválido: processoNumero e documentos são obrigatórios');
    }

    // Get OpenAI API key from environment
    const openaiApiKey = Deno.env.get('OPENAI_API_KEY');
    if (!openaiApiKey) {
      throw new Error('OPENAI_API_KEY não configurada');
    }

    // Preparar contexto dos documentos para a IA
    const documentosContexto = payload.documentos.map((doc, index) => {
      const stats = doc.metadata.stats;
      const resumo = stats
        ? `(${stats.totalPages || '?'} páginas, ${stats.totalCharacters || '?'} caracteres)`
        : '';

      return `
## DOCUMENTO ${index + 1}: ${doc.nome} ${resumo}

${doc.conteudo}

---
`;
    }).join('\n\n');

    console.log('🤖 Enviando para OpenAI...');

    // Chamar OpenAI API
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${openaiApiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4-turbo-preview',
        messages: [
          {
            role: 'system',
            content: `Você é um assistente jurídico especializado em análise de processos judiciais brasileiros.

Sua função é analisar TODOS os documentos de um processo e fornecer:

1. **RESUMO EXECUTIVO**: Visão geral do processo em 2-3 parágrafos
2. **PARTES DO PROCESSO**: Quem são os envolvidos (autor, réu, advogados)
3. **PEDIDOS**: Quais os pedidos da ação
4. **FUNDAMENTOS**: Base legal e argumentos principais
5. **DOCUMENTOS IMPORTANTES**: Lista dos documentos mais relevantes encontrados
6. **CRONOLOGIA**: Timeline dos principais eventos/documentos
7. **ANÁLISE TÉCNICA**: Pontos fortes, fracos, e próximos passos recomendados

Seja objetivo, técnico e use linguagem jurídica apropriada. Cite os documentos específicos quando relevante.`
          },
          {
            role: 'user',
            content: `Analise completamente o processo **${payload.processoNumero}** com base nos documentos abaixo:

${documentosContexto}

Forneça uma análise completa e detalhada conforme o template solicitado.`
          }
        ],
        temperature: 0.3,
        max_tokens: 4000,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ Erro OpenAI:', errorText);
      throw new Error(`OpenAI API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    const analise = data.choices[0]?.message?.content;

    if (!analise) {
      throw new Error('Resposta vazia da OpenAI');
    }

    console.log('✅ Análise concluída com sucesso');

    // Preparar resposta
    const resultado = {
      success: true,
      processoNumero: payload.processoNumero,
      analise: analise,
      metadata: {
        documentosAnalisados: payload.documentos.length,
        totalCaracteres: payload.documentos.reduce((acc, doc) => acc + doc.conteudo.length, 0),
        processadoEm: new Date().toISOString(),
        modelo: 'gpt-4-turbo-preview',
        tokens: {
          prompt: data.usage?.prompt_tokens || 0,
          completion: data.usage?.completion_tokens || 0,
          total: data.usage?.total_tokens || 0,
        }
      }
    };

    return new Response(
      JSON.stringify(resultado),
      {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
        status: 200,
      },
    );

  } catch (error) {
    console.error('❌ Erro:', error);

    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || 'Erro desconhecido',
        stack: error.stack,
      }),
      {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
        status: 500,
      },
    );
  }
});