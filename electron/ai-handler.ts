/**
 * AI Handler
 *
 * Wrapper para chamadas à API de IA.
 * Provider padrão: Anthropic Claude Sonnet 4.6
 */

import { withAIRetry } from './agent/retry';

interface CallAIOptions {
    system: string;
    user: string;
    temperature?: number;
    model?: string;
    maxTokens?: number;
}

export interface CallAIWithVisionOptions {
    system: string;
    user: string;
    imageBase64: string;
    mediaType?: 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp';
    temperature?: number;
    maxTokens?: number;
}

interface AIConfig {
    provider: 'supabase' | 'openai' | 'anthropic';
    apiKey: string;
    baseUrl: string;
    model?: string;
}

// Config padrão: Anthropic direto
let aiConfig: AIConfig = {
    provider: 'anthropic',
    apiKey: '',
    baseUrl: 'https://api.anthropic.com'
};

/**
 * Inicializa a configuração de IA
 */
export function initAI(config: Partial<AIConfig>): void {
    aiConfig = { ...aiConfig, ...config };
    console.log(`[AI] Inicializado com provider: ${aiConfig.provider}`);
    console.log(`[AI] Modelo: ${aiConfig.model || 'claude-sonnet-4-6'}`);
}

/**
 * Chama a API de IA (texto)
 */
export async function callAI(options: CallAIOptions): Promise<string> {
    console.log('[AI] Chamando API...');
    console.log('[AI] Provider:', aiConfig.provider);

    // C3: Retry automático para rate limits e erros de rede
    return withAIRetry(async () => {
        switch (aiConfig.provider) {
            case 'anthropic':
                return await callAnthropic(options);
            case 'openai':
                return await callOpenAI(options);
            case 'supabase':
                return await callSupabase(options);
            default:
                return await callAnthropic(options);
        }
    });
}

/**
 * Chama Anthropic com imagem (Vision)
 */
export async function callAIWithVision(options: CallAIWithVisionOptions): Promise<string> {
    console.log('[AI Vision] Chamando Claude Vision...');

    if (!aiConfig.apiKey) {
        throw new Error('Anthropic API key não configurada');
    }

    // C3: Retry automático para Vision API
    const response = await withAIRetry(() => fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': aiConfig.apiKey,
            'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
            model: aiConfig.model || 'claude-sonnet-4-6',
            system: options.system,
            messages: [{
                role: 'user',
                content: [
                    {
                        type: 'image',
                        source: {
                            type: 'base64',
                            media_type: options.mediaType || 'image/png',
                            data: options.imageBase64
                        }
                    },
                    { type: 'text', text: options.user }
                ]
            }],
            temperature: options.temperature ?? 0.1,
            max_tokens: options.maxTokens || 1000
        })
    }));

    if (!response.ok) {
        const error = await response.text();
        throw new Error(`Anthropic Vision API error: ${response.status} - ${error}`);
    }

    const data = await response.json() as { content: Array<{ text: string }> };
    const text = data.content?.[0]?.text;
    if (!text) throw new Error('Resposta vazia do Claude Vision');
    return text;
}

/**
 * Chama Supabase Edge Function (OPENIA)
 * Mesma lógica do main.ts ai-chat-send
 */
async function callSupabase(options: CallAIOptions): Promise<string> {
    const functionUrl = `${aiConfig.baseUrl}/functions/v1/OPENIA`;

    console.log('[AI Supabase] Enviando para:', functionUrl);
    console.log('[AI Supabase] Config:', { baseUrl: aiConfig.baseUrl, hasKey: !!aiConfig.apiKey });

    // Combina system + user em uma pergunta única
    const pergunta = `${options.system}\n\n---\n\nUSUÁRIO: ${options.user}`;

    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 60000); // 60s timeout

        const response = await fetch(functionUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${aiConfig.apiKey}`,
                'apikey': aiConfig.apiKey
            },
            body: JSON.stringify({
                pergunta,
                contexto: JSON.stringify({})
            }),
            signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
            const errText = await response.text();
            console.error('[AI Supabase] Erro HTTP:', response.status, errText);
            throw new Error(`Supabase API error: ${response.status} - ${errText}`);
        }

        console.log('[AI Supabase] Resposta OK, lendo stream...');

        // Handle SSE Stream
        const reader = response.body?.getReader();
        if (!reader) throw new Error('Response body is null');

        const decoder = new TextDecoder();
        let fullText = '';
        let done = false;

        while (!done) {
            const { value, done: isDone } = await reader.read();
            done = isDone;
            if (value) {
                const chunk = decoder.decode(value, { stream: true });
                const lines = chunk.split('\n');
                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        const dataVal = line.slice(6).trim();
                        if (dataVal === '[DONE]') continue;
                        try {
                            const parsed = JSON.parse(dataVal);
                            if (parsed.text) fullText += parsed.text;
                            if (parsed.resposta) fullText += parsed.resposta;
                        } catch {
                            // Ignora linhas que não são JSON
                        }
                    }
                }
            }
        }

        console.log('[AI Supabase] Resposta recebida:', fullText.substring(0, 100) + '...');
        return fullText;
    } catch (error: any) {
        if (error.name === 'AbortError') {
            throw new Error('Timeout: API demorou mais de 60s para responder');
        }
        console.error('[AI Supabase] Erro de conexão:', error.message);
        throw error;
    }
}

/**
 * Chama OpenAI API (fallback)
 */
async function callOpenAI(options: CallAIOptions): Promise<string> {
    const url = 'https://api.openai.com/v1/chat/completions';

    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${aiConfig.apiKey}`
        },
        body: JSON.stringify({
            model: options.model || aiConfig.model || 'gpt-4-turbo-preview',
            messages: [
                { role: 'system', content: options.system },
                { role: 'user', content: options.user }
            ],
            temperature: options.temperature ?? 0.7,
            max_tokens: options.maxTokens || 2000
        })
    });

    if (!response.ok) {
        const error = await response.text();
        throw new Error(`OpenAI API error: ${response.status} - ${error}`);
    }

    const data = await response.json() as { choices: Array<{ message: { content: string } }> };
    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new Error('Invalid OpenAI response: no content');
    return content;
}

/**
 * Chama Anthropic Claude com streaming SSE
 */
async function callAnthropic(options: CallAIOptions): Promise<string> {
    if (!aiConfig.apiKey) {
        throw new Error('Anthropic API key não configurada. Configure em Configurações.');
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': aiConfig.apiKey,
            'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
            model: options.model || aiConfig.model || 'claude-sonnet-4-6',
            system: options.system,
            messages: [{ role: 'user', content: options.user }],
            temperature: options.temperature ?? 0.7,
            max_tokens: options.maxTokens || 4000,
            stream: true
        })
    });

    if (!response.ok) {
        const error = await response.text();
        throw new Error(`Anthropic API error: ${response.status} - ${error}`);
    }

    // Lê stream SSE do Claude
    const reader = response.body?.getReader();
    if (!reader) throw new Error('Response body is null');

    const decoder = new TextDecoder();
    let fullText = '';
    let done = false;

    while (!done) {
        const { value, done: isDone } = await reader.read();
        done = isDone;
        if (value) {
            const chunk = decoder.decode(value, { stream: true });
            const lines = chunk.split('\n');
            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    const dataVal = line.slice(6).trim();
                    if (dataVal === '[DONE]' || dataVal === '') continue;
                    try {
                        const parsed = JSON.parse(dataVal);
                        // Formato SSE do Claude: content_block_delta
                        if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
                            fullText += parsed.delta.text;
                        }
                    } catch {
                        // ignora linhas não-JSON
                    }
                }
            }
        }
    }

    if (!fullText) throw new Error('Resposta vazia do Claude');
    return fullText;
}
