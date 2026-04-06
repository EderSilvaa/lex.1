/**
 * BrowserUseExecutor — Wrapper do browser-use CLI
 *
 * Spawna browser-use como processo Python conectado ao Chrome via CDP.
 * Playwright e browser-use coexistem no mesmo Chrome — sem lock/desconexão.
 * Fallback: se browser-use não estiver disponível, usa runBrowserTask.
 */

import { spawn, ChildProcess } from 'child_process';
import fs from 'fs';
import path from 'path';
import { getPythonEnv } from '../python';
import { getActiveConfig } from '../provider-config';
import { isBrowserUseAvailable } from './browser-use-setup';
import { withExternalLock } from './browser-lock';
import { lookupSelectors, recordSuccess } from './selector-memory';
import { agentEmitter } from '../agent/loop';
import { ensureBrowser, runBrowserTask } from '../browser-manager';

const CDP_PORT = 19222;
const DEFAULT_TIMEOUT = 600_000; // 10 min — browser-use tasks PJe são lentas

// ── Types ────────────────────────────────────────────────────────────────────

export interface BrowserUseOptions {
    task: string;
    tribunal?: string;
    context?: string;
    maxSteps?: number;
    onStep?: (step: BrowserUseStep) => void;
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

function mapModelForBrowserUse(): { provider: string; model: string; apiKey: string } {
    const cfg = getActiveConfig();

    switch (cfg.providerId) {
        case 'anthropic':
            return { provider: 'anthropic', model: cfg.visionModel, apiKey: cfg.apiKey };
        case 'openai':
            return { provider: 'openai', model: cfg.visionModel, apiKey: cfg.apiKey };
        case 'openrouter':
            return { provider: 'openrouter', model: cfg.visionModel, apiKey: cfg.apiKey };
        case 'google':
            return { provider: 'google', model: cfg.visionModel, apiKey: cfg.apiKey };
        case 'groq':
            return { provider: 'groq', model: cfg.visionModel, apiKey: cfg.apiKey };
        default:
            return { provider: 'anthropic', model: cfg.visionModel, apiKey: cfg.apiKey };
    }
}

// ── Selector hints ───────────────────────────────────────────────────────────

function buildTaskWithHints(task: string, tribunal?: string, context?: string): string {
    if (!tribunal || !context) return task;
    const selectors = lookupSelectors(tribunal, context);
    if (selectors.length === 0) return task;
    const hints = selectors.slice(0, 5).map(s => `  - ${s}`).join('\n');
    return `${task}\n\nSeletores CSS conhecidos nesta página (use de preferência):\n${hints}`;
}

// ── Main executor ────────────────────────────────────────────────────────────

function resolveRunnerScriptPath(): string | null {
    const candidates = new Set<string>();
    const resourcesPath = (process as any).resourcesPath as string | undefined;

    // Build output colocates runner near compiled executor.
    candidates.add(path.resolve(__dirname, 'browser-use-runner.py'));

    // Dev fallback from source tree.
    candidates.add(path.resolve(__dirname, '../../electron/browser/browser-use-runner.py'));

    // In packaged apps, Python cannot read files inside app.asar directly.
    if (__dirname.includes('app.asar')) {
        candidates.add(path.resolve(__dirname.replace('app.asar', 'app.asar.unpacked'), 'browser-use-runner.py'));
    }

    if (resourcesPath) {
        candidates.add(path.join(resourcesPath, 'app.asar.unpacked', 'dist-electron', 'browser', 'browser-use-runner.py'));
        candidates.add(path.join(resourcesPath, 'dist-electron', 'browser', 'browser-use-runner.py'));
    }

    for (const candidate of candidates) {
        if (fs.existsSync(candidate)) return candidate;
    }

    console.error('[BrowserUse] Runner script nao encontrado. Caminhos tentados:', Array.from(candidates));
    return null;
}

export async function runBrowserUseTask(options: BrowserUseOptions): Promise<BrowserUseResult> {
    const {
        task,
        tribunal,
        context: taskContext,
        maxSteps = 15,
        onStep,
        timeout = DEFAULT_TIMEOUT,
    } = options;

    // Garante Chrome em pé antes de browser-use tentar conectar
    await ensureBrowser();

    const buAvailable = isBrowserUseAvailable();
    console.log(`[BrowserUse] Disponível: ${buAvailable}`);
    if (!buAvailable) {
        console.log('[BrowserUse] Não disponível — usando fallback runBrowserTask');
        return runFallback(task, maxSteps, onStep);
    }

    const pyEnv = getPythonEnv();
    const pythonPath = pyEnv.getPythonPath();
    console.log(`[BrowserUse] Python path: ${pythonPath || 'NULL'}`);
    if (!pythonPath) {
        console.log('[BrowserUse] Python path não encontrado — usando fallback');
        return runFallback(task, maxSteps, onStep);
    }

    const enrichedTask = buildTaskWithHints(task, tribunal, taskContext);
    const { provider, model, apiKey } = mapModelForBrowserUse();
    const steps: BrowserUseStep[] = [];

    // Resolve runner path for dev and packaged builds.
    const runnerScript = resolveRunnerScriptPath();
    if (!runnerScript) {
        console.log('[BrowserUse] Runner script indisponivel - usando fallback');
        return runFallback(task, maxSteps, onStep);
    }
    console.log(`[BrowserUse] Iniciando: "${task.slice(0, 80)}..." (runner: ${runnerScript})`);
    console.log(`[BrowserUse] provider=${provider}, model=${model}, apiKey=${apiKey ? apiKey.slice(0,8) + '...' : 'MISSING'}`);

    const executeBrowserUse = (): Promise<BrowserUseResult> => new Promise<BrowserUseResult>((resolve) => {
        const args = [
            runnerScript,
            '--cdp-url', `http://localhost:${CDP_PORT}`,
            '--provider', provider,
            '--model', model,
            '--api-key', apiKey,
            '--max-steps', String(maxSteps),
            '--task', enrichedTask,
        ];

        const proc: ChildProcess = spawn(pythonPath, args, {
            env: { ...process.env },
            windowsHide: true,
        });

        let lastResult = '';
        let captchaDetected = false;
        let timedOut = false;
        let settled = false;

        const finalize = (result: BrowserUseResult): void => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            resolve(result);
        };

        const timer = setTimeout(() => {
            timedOut = true;
            console.warn('[BrowserUse] Timeout - aguardando encerramento do processo');
            try { proc.kill(); } catch { /* ignorar */ }
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
            console.log(`[BrowserUse] Processo encerrou com codigo ${code}, lastResult="${(lastResult || '').slice(0, 100)}", steps=${steps.length}`);
            if (timedOut) {
                finalize({
                    success: false,
                    result: 'Timeout: tarefa excedeu o limite de tempo.',
                    steps,
                    captcha: captchaDetected,
                });
                return;
            }

            finalize({
                success: code === 0,
                result: lastResult || (code === 0 ? 'Tarefa concluida.' : `browser-use encerrou com codigo ${code}`),
                steps,
                captcha: captchaDetected,
            });
        });

        proc.on('error', (err: Error) => {
            console.error('[BrowserUse] Erro ao iniciar:', err.message);
            if (timedOut) {
                finalize({
                    success: false,
                    result: 'Timeout: tarefa excedeu o limite de tempo.',
                    steps,
                    captcha: captchaDetected,
                });
                return;
            }
            finalize({ success: false, result: `Erro ao iniciar browser-use: ${err.message}`, steps });
        });
    });

    const lockOwner = `browser-use:${process.pid}:${Date.now()}`;
    try {
        return await withExternalLock(lockOwner, executeBrowserUse);
    } catch (err: any) {
        console.warn('[BrowserUse] Falha ao gerenciar lock externo:', err?.message || err);
        return runFallback(task, maxSteps, onStep);
    }
}

// ── Stdout message handler ───────────────────────────────────────────────────

function handleStdoutMessage(
    msg: any,
    steps: BrowserUseStep[],
    onStep: BrowserUseOptions['onStep'],
    tribunal?: string,
    taskContext?: string,
): void {
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

        agentEmitter.emit('agent-event', {
            type: 'thinking',
            pensamento: `[browser-use] ${step.description}`,
            iteracao: step.step_number,
        });
    }

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
            onStep?.({ step_number: 0, description: stepDesc });
        });
        return { success: true, result, steps: [], usedFallback: true };
    } catch (err: any) {
        return { success: false, result: err.message || 'Fallback falhou', steps: [], usedFallback: true };
    }
}

