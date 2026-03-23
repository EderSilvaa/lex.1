/**
 * CAPTCHA Detection & Solving
 *
 * Detecta CAPTCHAs na página via heurísticas DOM (zero LLM).
 * Resolve CAPTCHAs de imagem via vision model (callAIWithVision).
 *
 * Estratégias:
 *   PJe → detecta + notifica usuário (resolve manualmente)
 *   Gov/pesquisa → detecta + vision model → resolve automaticamente
 */

import type { Page } from 'playwright-core';

// ============================================================================
// TYPES
// ============================================================================

export interface CaptchaDetection {
    type: 'image' | 'recaptcha' | 'hcaptcha' | 'text' | 'unknown';
    selector: string;         // seletor do elemento CAPTCHA (img, iframe, div)
    inputSelector: string;    // seletor do campo de resposta
    confidence: number;       // 0-1
}

export interface CaptchaSolveResult {
    solved: boolean;
    answer?: string;
    error?: string;
}

// ============================================================================
// DETECTION — heurística DOM, zero LLM
// ============================================================================

/**
 * Detecta presença de CAPTCHA na página atual.
 * Retorna null se nenhum CAPTCHA encontrado.
 */
export async function detectCaptcha(page: Page): Promise<CaptchaDetection | null> {
    try {
        const result = await page.evaluate(() => {
            // --- reCAPTCHA ---
            const recaptchaIframe = document.querySelector('iframe[src*="recaptcha"]');
            const recaptchaDiv = document.querySelector('.g-recaptcha, #recaptcha');
            if (recaptchaIframe || recaptchaDiv) {
                const el = recaptchaIframe || recaptchaDiv;
                return {
                    type: 'recaptcha' as const,
                    selector: el?.id ? `#${el.id}` : '.g-recaptcha',
                    inputSelector: '',
                    confidence: 0.95,
                };
            }

            // --- hCaptcha ---
            const hcaptchaIframe = document.querySelector('iframe[src*="hcaptcha"]');
            const hcaptchaDiv = document.querySelector('.h-captcha');
            if (hcaptchaIframe || hcaptchaDiv) {
                const el = hcaptchaIframe || hcaptchaDiv;
                return {
                    type: 'hcaptcha' as const,
                    selector: el?.id ? `#${el.id}` : '.h-captcha',
                    inputSelector: '',
                    confidence: 0.95,
                };
            }

            // --- CAPTCHA de imagem (PJe, gov, securimage, jcaptcha) ---
            const imgSelectors = [
                'img[src*="captcha" i]',
                'img[src*="securimage" i]',
                'img[src*="jcaptcha" i]',
                'img[alt*="captcha" i]',
                'img[id*="captcha" i]',
                'img[class*="captcha" i]',
            ];
            let captchaImg: Element | null = null;
            let captchaImgSelector = '';
            for (const sel of imgSelectors) {
                const el = document.querySelector(sel);
                if (el) {
                    captchaImg = el;
                    captchaImgSelector = sel;
                    // Prefer ID-based selector if available
                    if (el.id) captchaImgSelector = `#${CSS.escape(el.id)}`;
                    break;
                }
            }

            // --- Campo de resposta CAPTCHA ---
            const inputSelectors = [
                'input[name*="captcha" i]',
                'input[id*="captcha" i]',
                'input[placeholder*="captcha" i]',
                'input[placeholder*="caracteres" i]',
                'input[placeholder*="código" i]',
                'input[placeholder*="codigo" i]',
                'input[aria-label*="captcha" i]',
            ];
            let captchaInput: Element | null = null;
            let captchaInputSelector = '';
            for (const sel of inputSelectors) {
                const el = document.querySelector(sel);
                if (el) {
                    captchaInput = el;
                    captchaInputSelector = sel;
                    if (el.id) captchaInputSelector = `#${CSS.escape(el.id)}`;
                    else if ((el as HTMLInputElement).name) captchaInputSelector = `input[name="${(el as HTMLInputElement).name}"]`;
                    break;
                }
            }

            // If we found a captcha image
            if (captchaImg) {
                return {
                    type: 'image' as const,
                    selector: captchaImgSelector,
                    inputSelector: captchaInputSelector,
                    confidence: captchaInput ? 0.9 : 0.7,
                };
            }

            // --- Text-based detection (labels, spans) ---
            const textHints = [
                'digite os caracteres',
                'informe o código',
                'código de verificação',
                'codigo de verificacao',
                'código da imagem',
                'codigo da imagem',
                'digite o texto da imagem',
            ];
            const allText = document.body?.innerText?.toLowerCase() || '';
            for (const hint of textHints) {
                if (allText.includes(hint)) {
                    // Found text hint — look for nearby input
                    return {
                        type: 'text' as const,
                        selector: '',
                        inputSelector: captchaInputSelector,
                        confidence: captchaInput ? 0.75 : 0.5,
                    };
                }
            }

            return null;
        });

        return result;
    } catch (err: any) {
        console.warn('[Captcha] Erro na detecção:', err.message);
        return null;
    }
}

// ============================================================================
// SCREENSHOT — captura só a imagem do CAPTCHA
// ============================================================================

/**
 * Captura screenshot apenas do elemento CAPTCHA (imagem).
 * Retorna base64 JPEG ou null se não for tipo image.
 */
export async function screenshotCaptchaImage(
    page: Page,
    detection: CaptchaDetection
): Promise<string | null> {
    if (detection.type !== 'image' || !detection.selector) {
        return null;
    }

    try {
        const element = await page.$(detection.selector);
        if (!element) {
            console.warn('[Captcha] Elemento CAPTCHA não encontrado:', detection.selector);
            return null;
        }

        const buf = await element.screenshot({ type: 'jpeg', quality: 85 });
        return buf.toString('base64');
    } catch (err: any) {
        console.warn('[Captcha] Erro ao capturar screenshot:', err.message);
        return null;
    }
}

// ============================================================================
// SOLVER — resolve via vision model
// ============================================================================

const CAPTCHA_VISION_PROMPT =
    'Esta imagem contém um CAPTCHA com caracteres distorcidos. ' +
    'Leia e retorne APENAS os caracteres visíveis, sem explicação, sem aspas, sem pontuação extra. ' +
    'Se não conseguir ler com certeza, retorne exatamente a palavra INCERTO.';

const MAX_SOLVE_ATTEMPTS = 2;

/**
 * Tenta resolver CAPTCHA de imagem usando vision model.
 * Preenche o campo de resposta e retorna resultado.
 *
 * Suporta retry (até 2 tentativas).
 * reCAPTCHA/hCaptcha não são suportados (retorna solved=false).
 */
export async function solveCaptchaWithVision(
    page: Page,
    detection: CaptchaDetection
): Promise<CaptchaSolveResult> {
    // reCAPTCHA/hCaptcha não são solucionáveis por visão simples
    if (detection.type === 'recaptcha' || detection.type === 'hcaptcha') {
        return {
            solved: false,
            error: `CAPTCHA tipo ${detection.type} não suportado para resolução automática.`,
        };
    }

    if (!detection.inputSelector) {
        return {
            solved: false,
            error: 'Campo de resposta do CAPTCHA não encontrado na página.',
        };
    }

    const { callAIWithVision } = await import('../ai-handler');
    const { fillInFrames } = await import('../browser-manager');

    for (let attempt = 1; attempt <= MAX_SOLVE_ATTEMPTS; attempt++) {
        console.log(`[Captcha] Tentativa ${attempt}/${MAX_SOLVE_ATTEMPTS} de resolver via visão`);

        // 1. Screenshot da imagem CAPTCHA
        const base64 = await screenshotCaptchaImage(page, detection);
        if (!base64) {
            return { solved: false, error: 'Não foi possível capturar a imagem do CAPTCHA.' };
        }

        // 2. Envia para vision model
        let answer: string;
        try {
            answer = await callAIWithVision({
                imageBase64: base64,
                mediaType: 'image/jpeg',
                user: CAPTCHA_VISION_PROMPT,
                system: 'Você é um leitor de CAPTCHA. Retorne apenas os caracteres visíveis.',
                maxTokens: 50,
                temperature: 0.1,
            });
        } catch (err: any) {
            console.warn('[Captcha] Erro na chamada de visão:', err.message);
            return { solved: false, error: `Erro na API de visão: ${err.message}` };
        }

        // 3. Valida resposta
        answer = answer.trim().replace(/['"]/g, '');
        if (!answer || answer.toUpperCase() === 'INCERTO' || answer.length > 20) {
            console.warn(`[Captcha] Resposta incerta na tentativa ${attempt}: "${answer}"`);
            if (attempt < MAX_SOLVE_ATTEMPTS) {
                // Recarrega CAPTCHA se possível (clica na imagem para gerar novo)
                try {
                    const imgEl = await page.$(detection.selector);
                    if (imgEl) await imgEl.click();
                    await page.waitForTimeout(1000);
                } catch { /* ignore */ }
                continue;
            }
            return { solved: false, error: `Não conseguiu ler o CAPTCHA após ${MAX_SOLVE_ATTEMPTS} tentativas.` };
        }

        // 4. Preenche o campo de resposta
        try {
            await fillInFrames(page, detection.inputSelector, answer);
        } catch (err: any) {
            console.warn('[Captcha] Erro ao preencher campo:', err.message);
            return { solved: false, error: `Erro ao preencher campo do CAPTCHA: ${err.message}` };
        }

        console.log(`[Captcha] Resolvido na tentativa ${attempt}: "${answer}"`);
        return { solved: true, answer };
    }

    return { solved: false, error: 'Esgotou tentativas de resolver o CAPTCHA.' };
}

// ============================================================================
// HTML CAPTCHA DETECTION — para respostas HTTP (jurisprudencia.ts)
// ============================================================================

/**
 * Verifica se HTML de resposta contém indicadores de CAPTCHA.
 * Usado pelo skill pesquisa_jurisprudencia que faz HTTP fetch direto.
 */
export function htmlHasCaptcha(html: string): boolean {
    const lower = html.toLowerCase();
    return (
        lower.includes('captcha') ||
        lower.includes('recaptcha') ||
        lower.includes('hcaptcha') ||
        lower.includes('codigo de verificacao') ||
        lower.includes('código de verificação') ||
        lower.includes('digite os caracteres') ||
        lower.includes('digite o texto da imagem') ||
        (lower.includes('securimage') && lower.includes('<img'))
    );
}
