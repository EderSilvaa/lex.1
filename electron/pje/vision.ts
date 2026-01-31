/**
 * PJe Vision AI
 *
 * Fallback visual para localizar elementos no PJe usando GPT-4o Vision.
 * Usado quando seletores DOM falham devido ao HTML caótico.
 */

import { Page } from 'playwright-core';

// ============================================================================
// TYPES
// ============================================================================

export interface VisionAnalysisRequest {
    screenshot: Buffer;
    task: string;
    context?: string;
}

export interface VisionElement {
    description: string;
    coordinates: { x: number; y: number };
    confidence: number;
    action?: 'click' | 'fill' | 'select';
}

export interface VisionAnalysisResult {
    success: boolean;
    elements: VisionElement[];
    pageDescription?: string;
    error?: string;
}

export interface VisionClickResult {
    success: boolean;
    coordinates?: { x: number; y: number };
    error?: string;
}

// ============================================================================
// VISION AI CLASS
// ============================================================================

export class PJeVision {
    private apiKey: string | null = null;
    private model: string = 'gpt-4o';

    constructor(apiKey?: string) {
        this.apiKey = apiKey || process.env['OPENAI_API_KEY'] || null;
    }

    /**
     * Configura a API key
     */
    setApiKey(key: string): void {
        this.apiKey = key;
    }

    /**
     * Analisa screenshot e encontra elementos
     */
    async analyzeScreenshot(
        screenshot: Buffer,
        task: string,
        context?: string
    ): Promise<VisionAnalysisResult> {
        if (!this.apiKey) {
            return { success: false, elements: [], error: 'API Key não configurada' };
        }

        console.log('[Vision] Analisando screenshot...');
        console.log(`[Vision] Tarefa: ${task}`);

        try {
            const base64 = screenshot.toString('base64');

            const systemPrompt = `Você é um assistente especializado em automação do sistema PJe (Processo Judicial Eletrônico).
Analise o screenshot e identifique elementos visuais para completar a tarefa.
Retorne APENAS JSON válido, sem markdown.

Formato de resposta:
{
  "success": true,
  "pageDescription": "Descrição breve da tela",
  "elements": [
    {
      "description": "Descrição do elemento",
      "coordinates": { "x": 123, "y": 456 },
      "confidence": 0.9,
      "action": "click"
    }
  ]
}

Se não encontrar o elemento, retorne:
{
  "success": false,
  "error": "Motivo"
}`;

            const userMessage = context
                ? `${task}\n\nContexto adicional: ${context}`
                : task;

            const response = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.apiKey}`
                },
                body: JSON.stringify({
                    model: this.model,
                    messages: [
                        { role: 'system', content: systemPrompt },
                        {
                            role: 'user',
                            content: [
                                {
                                    type: 'image_url',
                                    image_url: {
                                        url: `data:image/png;base64,${base64}`,
                                        detail: 'high'
                                    }
                                },
                                { type: 'text', text: userMessage }
                            ]
                        }
                    ],
                    max_tokens: 1000,
                    temperature: 0.1
                })
            });

            if (!response.ok) {
                const error = await response.text();
                console.error('[Vision] Erro API:', error);
                return { success: false, elements: [], error: `API Error: ${response.status}` };
            }

            const data = await response.json() as any;
            const content = data.choices?.[0]?.message?.content;

            if (!content) {
                return { success: false, elements: [], error: 'Resposta vazia da API' };
            }

            // Parse JSON da resposta
            const result = JSON.parse(content) as VisionAnalysisResult;

            console.log(`[Vision] Encontrados ${result.elements?.length || 0} elementos`);

            return result;

        } catch (error: any) {
            console.error('[Vision] Erro:', error.message);
            return { success: false, elements: [], error: error.message };
        }
    }

    /**
     * Encontra e clica em elemento usando visão
     */
    async findAndClick(
        page: Page,
        description: string,
        context?: string
    ): Promise<VisionClickResult> {
        console.log(`[Vision] Buscando elemento: "${description}"`);

        // Tirar screenshot
        const screenshot = await page.screenshot({ fullPage: false });

        // Analisar
        const result = await this.analyzeScreenshot(
            screenshot,
            `Encontre o elemento: "${description}". Retorne as coordenadas exatas para clicar.`,
            context
        );

        if (!result.success || !result.elements || result.elements.length === 0) {
            return { success: false, error: result.error || 'Elemento não encontrado' };
        }

        const element = result.elements[0];

        if (!element || !element.coordinates) {
            return { success: false, error: 'Coordenadas não retornadas' };
        }

        const coords = element.coordinates;
        console.log(`[Vision] Clicando em (${coords.x}, ${coords.y})`);

        try {
            await page.mouse.click(coords.x, coords.y);
            return { success: true, coordinates: coords };
        } catch (error: any) {
            return { success: false, error: error.message };
        }
    }

    /**
     * Extrai texto/dados de área específica
     */
    async extractData(
        page: Page,
        query: string
    ): Promise<{ success: boolean; data?: any; error?: string }> {
        console.log(`[Vision] Extraindo: "${query}"`);

        const screenshot = await page.screenshot({ fullPage: false });

        const result = await this.analyzeScreenshot(
            screenshot,
            `Extraia as seguintes informações desta tela do PJe: ${query}
            
Retorne em formato:
{
  "success": true,
  "data": {
    // dados extraídos
  }
}`
        );

        if (!result.success) {
            return { success: false, error: result.error || 'Falha na extração' };
        }

        // A resposta já contém os dados
        return { success: true, data: result };
    }

    /**
     * Descreve a tela atual
     */
    async describeScreen(page: Page): Promise<string> {
        const screenshot = await page.screenshot({ fullPage: false });

        const result = await this.analyzeScreenshot(
            screenshot,
            'Descreva brevemente esta tela do PJe: em que seção estamos, o que é possível fazer, e destaque informações importantes visíveis.'
        );

        return result.pageDescription || 'Não foi possível descrever a tela';
    }
}

// ============================================================================
// SINGLETON
// ============================================================================

let visionInstance: PJeVision | null = null;

export function getPJeVision(apiKey?: string): PJeVision {
    if (!visionInstance) {
        visionInstance = new PJeVision(apiKey);
    }
    return visionInstance;
}
