/**
 * BrowserUseExecutor — Wrapper do browser-use CLI
 *
 * Motor principal de navegação para PJe e outros sistemas.
 * Conecta no Chrome existente via CDP (porta 19222).
 * Usa BrowserLock para garantir acesso exclusivo (Playwright desconecta).
 *
 * Fallback: se browser-use não estiver disponível, usa runBrowserTask.
 */

import { spawn, ChildProcess } from 'child_process';
import { getPythonEnv } from '../python';
import { getActiveConfig } from '../provider-config';
import { withExternalLock } from './browser-lock';
import { isBrowserUseAvailable } from './browser-use-setup';
import { lookupSelectors, recordSuccess } from './selector-memory';
import { agentEmitter } from '../agent/loop';
import { injectOverlay, runBrowserTask } from '../browser-manager';

const CDP_PORT = 19222;
const DEFAULT_TIMEOUT = 120_000; // 120s — mesmo timeout da categoria PJe

// ── Types ────────────────────────────────────────────────────────────────────

export interface BrowserUseOptions {
    /** Instrução em linguagem natural para o agente */
    task: string;
    /** Tribunal (para selector-memory hints) */
    tribunal?: string;
    /** Contexto da ação (para selector-memory key) */
    context?: string;
    /** Max steps do agente browser-use */
    maxSteps?: number;
    /** Callback de progresso por step */
    onStep?: (step: BrowserUseStep) => void;
    /** Timeout em ms (default: 120s) */
    timeout?: number;
}

export interface BrowserUseStep {
    step_number: number;
    description: string;
    action?: string;
    selector?: string;
    url?: string;
}

export interface BrowserUseResult {
    success: boolean;
    result: string;
    steps: BrowserUseStep[];
    captcha?: boolean;
    usedFallback?: boolean;
}

// ── Model mapping ────────────────────────────────────────────────────────────

/**
 * Mapeia o modelo ativo da LEX para o formato do browser-use CLI.
 * browser-use usa LangChain internamente — aceita provider/model.
 */
function mapModelForBrowserUse(): { model: string; envVars: Record<string, string> } {
    const cfg = getActiveConfig();
    const envVars: Record<string, string> = {};

    switch (cfg.providerId) {
        case 'anthropic':
            envVars['ANTHROPIC_API_KEY'] = cfg.apiKey;
            return { model: cfg.visionModel, envVars };
        case 'openai':
            envVars['OPENAI_API_KEY'] = cfg.apiKey;
            return { model: cfg.visionModel, envVars };
        case 'openrouter':
            envVars['OPENROUTER_API_KEY'] = cfg.apiKey;
            return { model: `openrouter/${cfg.visionModel}`, envVars };
        case 'google':
            envVars['GOOGLE_API_KEY'] = cfg.apiKey;
            return { model: `google/${cfg.visionModel}`, envVars };
        case 'groq':
            envVars['GROQ_API_KEY'] = cfg.apiKey;
            return { model: `groq/${cfg.visionModel}`, envVars };
        case 'ollama':
            envVars['OLLAMA_BASE_URL'] = 'http://localhost:11434';
            return { model: `ollama/${cfg.visionModel}`, envVars };
        default:
            envVars['ANTHROPIC_API_KEY'] = cfg.apiKey;
            return { model: cfg.visionModel, envVars };
    }
}

// ── Selector hints ───────────────────────────────────────────────────────────

/**
 * Injeta hints de seletores conhecidos no prompt da task.
 * Se selector-memory tem seletores para este tribunal+contexto,
 * adiciona como contexto extra para o agente ser mais rápido.
 */
function buildTaskWithHints(task: string, tribunal?: string, context?: string): string {
    if (!tribunal || !context) return task;

    const selectors = lookupSelectors(tribunal, context);
    if (selectors.length === 0) return task;

    const hints = selectors.slice(0, 5).map(s => `  - ${s}`).join('\n');
    return `${task}\n\nSeletores CSS conhecidos nesta página (use de preferência):\n${hints}`;
}

// ── Main executor ────────────────────────────────────────────────────────────

/**
 * Executa uma tarefa via browser-use CLI com acesso exclusivo ao Chrome.
 *
 * Fluxo:
 * 1. Verifica disponibilidade (Python + browser-use)
 * 2. Injeta selector-memory hints no prompt
 * 3. Acquire lock (desconecta Playwright)
 * 4. Spawn browser-use CLI
 * 5. Parse stdout JSON lines
 * 6. Release lock (reconecta Playwright)
 *
 * Se browser-use não disponível → fallback para runBrowserTask.
 */
export async function runBrowserUseTask(options: BrowserUseOptions): Promise<BrowserUseResult> {
    const {
        task,
        tribunal,
        context: taskContext,
        maxSteps = 15,
        onStep,
        timeout = DEFAULT_TIMEOUT,
    } = options;

    // Verifica disponibilidade
    if (!isBrowserUseAvailable()) {
        console.log('[BrowserUse] Não disponível — usando fallback runBrowserTask');
        return runFallback(task, maxSteps, onStep);
    }

    const pyEnv = getPythonEnv();
    const pythonPath = pyEnv.getPythonPath();
    if (!pythonPath) {
        console.log('[BrowserUse] Python path não encontrado — usando fallback');
        return runFallback(task, maxSteps, onStep);
    }

    // Injeta hints do selector-memory
    const enrichedTask = buildTaskWithHints(task, tribunal, taskContext);

    // Modelo e env vars
    const { model, envVars } = mapModelForBrowserUse();

    const steps: BrowserUseStep[] = [];

    // Executa com lock exclusivo
    return withExternalLock('browser-use', async () => {
        return new Promise<BrowserUseResult>((resolve) => {
            const args = [
                '-m', 'browser_use',
                '--cdp-url', `http://localhost:${CDP_PORT}`,
                '--json',
                '--model', model,
                '--max-steps', String(maxSteps),
                'run', enrichedTask,
            ];

            const proc: ChildProcess = spawn(pythonPath, args, {
                env: { ...process.env, ...envVars },
                windowsHide: true,
            });

            let lastResult = '';
            let captchaDetected = false;

            // Timeout handler
            const timer = setTimeout(() => {
                console.warn('[BrowserUse] Timeout atingido — matando processo');
                try { proc.kill(); } catch { /* ignorar */ }
                resolve({
                    success: false,
                    result: 'Timeout: tarefa excedeu o limite de tempo.',
                    steps,
                    captcha: captchaDetected,
                });
            }, timeout);

            proc.stdout?.on('data', (data: Buffer) => {
                for (const line of data.toString().split('\n')) {
                    if (!line.trim()) continue;
                    try {
                        const msg = JSON.parse(line);
                        handleStdoutMessage(msg, steps, onStep, tribunal, taskContext);
                        if (msg.result) lastResult = msg.result;
                        if (msg.captcha) captchaDetected = true;
                    } catch {
                        // Linha não-JSON — pode ser log do browser-use
                        if (line.toLowerCase().includes('captcha')) captchaDetected = true;
                        if (!lastResult && line.trim().length > 10) lastResult = line.trim();
                    }
                }
            });

            proc.stderr?.on('data', (data: Buffer) => {
                const text = data.toString().trim();
                if (text) console.log('[BrowserUse:stderr]', text.slice(0, 300));
                if (text.toLowerCase().includes('captcha')) captchaDetected = true;
            });

            proc.on('close', (code: number | null) => {
                clearTimeout(timer);
                if (code === 0) {
                    resolve({
                        success: true,
                        result: lastResult || 'Tarefa concluída pelo browser-use.',
                        steps,
                        captcha: captchaDetected,
                    });
                } else {
                    resolve({
                        success: false,
                        result: lastResult || `browser-use encerrou com código ${code}`,
                        steps,
                        captcha: captchaDetected,
                    });
                }
            });

            proc.on('error', (err: Error) => {
                clearTimeout(timer);
                console.error('[BrowserUse] Erro ao iniciar:', err.message);
                resolve({
                    success: false,
                    result: `Erro ao iniciar browser-use: ${err.message}`,
                    steps,
                });
            });
        });
    });
}

// ── Stdout message handler ───────────────────────────────────────────────────

function handleStdoutMessage(
    msg: any,
    steps: BrowserUseStep[],
    onStep: BrowserUseOptions['onStep'],
    tribunal?: string,
    taskContext?: string,
): void {
    // Step progress
    if (msg.step || msg.step_number) {
        const step: BrowserUseStep = {
            step_number: msg.step_number || msg.step || steps.length + 1,
            description: msg.description || msg.action || 'acao',
            action: msg.action,
            selector: msg.selector,
            url: msg.url,
        };
        steps.push(step);
        onStep?.(step);

        // Overlay no Chrome (browser-use tem o controle, mas overlay pode não funcionar
        // pois Playwright está desconectado — apenas emite para o chat)
        agentEmitter.emit('agent-event', {
            type: 'thinking',
            pensamento: `[browser-use] ${step.description}`,
            iteracao: step.step_number,
        });
    }

    // Selector success — alimenta o cache
    if (msg.action === 'click' || msg.action === 'fill' || msg.action === 'type') {
        if (msg.selector && tribunal && taskContext) {
            recordSuccess(tribunal, taskContext, msg.selector);
        }
    }
}

// ── Fallback ─────────────────────────────────────────────────────────────────

async function runFallback(
    task: string,
    maxSteps: number,
    onStep?: BrowserUseOptions['onStep'],
): Promise<BrowserUseResult> {
    try {
        const result = await runBrowserTask(task, maxSteps, (stepDesc: string) => {
            onStep?.({
                step_number: 0,
                description: stepDesc,
            });
        });
        return {
            success: true,
            result,
            steps: [],
            usedFallback: true,
        };
    } catch (err: any) {
        return {
            success: false,
            result: err.message || 'Fallback falhou',
            steps: [],
            usedFallback: true,
        };
    }
}
