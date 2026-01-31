/**
 * PJe Executor
 *
 * Controla automação do PJe via Playwright CDP.
 * Human-in-the-Loop obrigatório para login e ações críticas.
 */

import { chromium, Browser, BrowserContext, Page } from 'playwright-core';
import { EventEmitter } from 'events';
import { exec } from 'child_process';
import { promisify } from 'util';
import {
    PJeAction,
    PJeResult,
    PJeState,
    PJeEvent,
    PJeConfig,
    PJeSection,
    DEFAULT_PJE_CONFIG,
    PJE_URLS
} from './types';
import {
    CONSULTA_SELECTORS,
    LOGIN_SELECTORS,
    PROCESSO_SELECTORS
} from './selectors';

const execAsync = promisify(exec);

// ============================================================================
// PJE EXECUTOR CLASS
// ============================================================================

export class PJeExecutor extends EventEmitter {
    private browser: Browser | null = null;
    private context: BrowserContext | null = null;
    private page: Page | null = null;
    private config: PJeConfig;
    private state: PJeState;

    constructor(config: Partial<PJeConfig> = {}) {
        super();
        this.config = { ...DEFAULT_PJE_CONFIG, ...config };
        this.state = {
            connectionState: 'disconnected',
            isLoggedIn: false,
            currentUrl: null,
            currentSection: null,
            processNumber: null,
            lastError: null
        };
    }

    // ========================================================================
    // CONNECTION
    // ========================================================================

    /**
     * Abre Chrome com debug port habilitado
     */
    async launchChrome(url?: string): Promise<boolean> {
        const targetUrl = url || PJE_URLS.TJPA;

        console.log('[PJeExecutor] Abrindo Chrome com debug port...');
        this.emit('event', { type: 'connecting' } as PJeEvent);
        this.state.connectionState = 'connecting';

        try {
            // Detectar caminho do Chrome
            const chromePath = this.config.chromePath || this.detectChromePath();

            // Abrir Chrome com remote debugging
            const cmd = `"${chromePath}" --remote-debugging-port=${this.config.debugPort} "${targetUrl}"`;

            console.log(`[PJeExecutor] Comando: ${cmd}`);

            // Executa sem esperar (Chrome fica aberto)
            exec(cmd);

            // Aguarda Chrome iniciar
            await this.sleep(2000);

            return true;
        } catch (error: any) {
            console.error('[PJeExecutor] Erro ao abrir Chrome:', error.message);
            this.state.lastError = error.message;
            return false;
        }
    }

    /**
     * Conecta ao Chrome via CDP
     */
    async connect(): Promise<boolean> {
        console.log(`[PJeExecutor] Conectando via CDP: ${this.config.cdpUrl}`);
        this.emit('event', { type: 'connecting' } as PJeEvent);
        this.state.connectionState = 'connecting';

        try {
            this.browser = await chromium.connectOverCDP(this.config.cdpUrl, {
                timeout: this.config.timeout
            });

            console.log('[PJeExecutor] Conectado ao Chrome');

            // Pegar contexto existente
            const contexts = this.browser.contexts();
            if (!contexts || contexts.length === 0) {
                throw new Error('Nenhum contexto encontrado no Chrome');
            }
            const firstContext = contexts[0];
            if (!firstContext) {
                throw new Error('Contexto não encontrado');
            }
            this.context = firstContext;

            // Pegar página do PJe (ou primeira disponível)
            const pages = this.context.pages();
            if (!pages || pages.length === 0) {
                throw new Error('Nenhuma página encontrada no Chrome');
            }

            const foundPage = pages.find(p =>
                p.url().includes('pje') ||
                p.url().includes('tjpa') ||
                p.url().includes('trt')
            ) || pages[0];

            if (!foundPage) {
                throw new Error('Nenhuma página encontrada no Chrome');
            }
            this.page = foundPage;

            if (!this.page) {
                throw new Error('Nenhuma página encontrada no Chrome');
            }

            this.state.currentUrl = this.page.url();
            this.state.connectionState = 'connected';
            this.state.currentSection = this.detectSection(this.page.url());

            // Verificar se já está logado
            this.state.isLoggedIn = await this.checkLoggedIn();

            console.log(`[PJeExecutor] Página: ${this.state.currentUrl}`);
            console.log(`[PJeExecutor] Logado: ${this.state.isLoggedIn}`);

            this.emit('event', {
                type: 'connected',
                url: this.state.currentUrl
            } as PJeEvent);

            // Listener para mudanças de URL
            this.page.on('framenavigated', (frame) => {
                if (frame === this.page?.mainFrame()) {
                    this.state.currentUrl = frame.url();
                    this.state.currentSection = this.detectSection(frame.url());
                }
            });

            return true;

        } catch (error: any) {
            console.error('[PJeExecutor] Erro ao conectar:', error.message);
            this.state.connectionState = 'error';
            this.state.lastError = error.message;

            this.emit('event', {
                type: 'error',
                error: error.message
            } as PJeEvent);

            return false;
        }
    }

    /**
     * Desconecta do Chrome
     */
    async disconnect(): Promise<void> {
        console.log('[PJeExecutor] Desconectando...');

        if (this.browser) {
            await this.browser.close();
            this.browser = null;
            this.context = null;
            this.page = null;
        }

        this.state.connectionState = 'disconnected';
        this.emit('event', { type: 'disconnected' } as PJeEvent);
    }

    // ========================================================================
    // HITL - HUMAN IN THE LOOP
    // ========================================================================

    /**
     * Aguarda usuário fazer login com certificado
     */
    async waitForLogin(timeoutMs: number = 120000): Promise<boolean> {
        if (!this.page) throw new Error('Não conectado');

        console.log('[PJeExecutor] Aguardando login do usuário...');
        this.state.connectionState = 'waiting_login';
        this.emit('event', { type: 'waiting_login' } as PJeEvent);

        const startTime = Date.now();

        while (Date.now() - startTime < timeoutMs) {
            const isLoggedIn = await this.checkLoggedIn();

            if (isLoggedIn) {
                console.log('[PJeExecutor] Login detectado!');
                this.state.isLoggedIn = true;
                this.state.connectionState = 'ready';
                this.emit('event', { type: 'logged_in' } as PJeEvent);
                return true;
            }

            await this.sleep(1000);
        }

        console.log('[PJeExecutor] Timeout aguardando login');
        return false;
    }

    /**
     * Verifica se usuário está logado
     */
    async checkLoggedIn(): Promise<boolean> {
        if (!this.page) return false;

        try {
            for (const selector of LOGIN_SELECTORS.userLoggedIn) {
                const element = await this.page.$(selector);
                if (element) return true;
            }
            return false;
        } catch {
            return false;
        }
    }

    // ========================================================================
    // ACTIONS
    // ========================================================================

    /**
     * Executa uma ação no PJe
     */
    async executeAction(action: PJeAction): Promise<PJeResult> {
        if (!this.page) {
            return { success: false, action: action.type, error: 'Não conectado' };
        }

        console.log(`[PJeExecutor] Executando: ${action.type}`);
        this.state.connectionState = 'executing';
        this.emit('event', { type: 'action_start', action } as PJeEvent);

        const startTime = Date.now();

        try {
            let result: PJeResult;

            switch (action.type) {
                case 'navigate':
                    result = await this.actionNavigate(action.url!);
                    break;

                case 'click':
                    result = await this.actionClick(
                        action.selector,
                        action.visualDescription,
                        action.textDescription
                    );
                    break;

                case 'fill':
                    result = await this.actionFill(
                        action.selector,
                        action.value!,
                        action.visualDescription,
                        action.textDescription
                    );
                    break;

                case 'getText':
                    result = await this.actionGetText(action.selector!);
                    break;

                case 'wait':
                    await this.sleep(action.milliseconds || 1000);
                    result = { success: true, action: 'wait' };
                    break;

                case 'waitForSelector':
                    await this.page.waitForSelector(action.selector!, {
                        timeout: this.config.timeout
                    });
                    result = { success: true, action: 'waitForSelector' };
                    break;

                case 'screenshot':
                    const buffer = await this.page.screenshot({ fullPage: false });
                    result = {
                        success: true,
                        action: 'screenshot',
                        data: buffer.toString('base64')
                    };
                    break;

                default:
                    result = {
                        success: false,
                        action: action.type,
                        error: `Ação não suportada: ${action.type}`
                    };
            }

            result.duration = Date.now() - startTime;
            this.state.connectionState = 'ready';
            this.emit('event', { type: 'action_complete', result } as PJeEvent);

            return result;

        } catch (error: any) {
            const result: PJeResult = {
                success: false,
                action: action.type,
                error: error.message,
                duration: Date.now() - startTime
            };

            this.state.connectionState = 'ready';
            this.emit('event', { type: 'action_complete', result } as PJeEvent);

            return result;
        }
    }

    // ========================================================================
    // ACTION IMPLEMENTATIONS
    // ========================================================================

    private async actionNavigate(url: string): Promise<PJeResult> {
        console.log(`[PJeExecutor] Navegando: ${url}`);
        await this.page!.goto(url, { waitUntil: 'domcontentloaded' });
        return { success: true, action: 'navigate', data: { url: this.page!.url() } };
    }

    private async actionClick(
        selector?: string,
        visualDescription?: string,
        textDescription?: string
    ): Promise<PJeResult> {
        const strategies = this.buildClickStrategies(selector, visualDescription, textDescription);

        for (const strategy of strategies) {
            try {
                console.log(`[PJeExecutor] Tentando click: ${strategy.name}`);
                await this.page!.click(strategy.selector, { timeout: 5000 });
                console.log(`[PJeExecutor] Click OK: ${strategy.name}`);
                return {
                    success: true,
                    action: 'click',
                    strategy: strategy.name
                };
            } catch (e) {
                // Tentar próxima estratégia
            }
        }

        return {
            success: false,
            action: 'click',
            error: 'Nenhuma estratégia funcionou'
        };
    }

    private async actionFill(
        selector?: string,
        value?: string,
        visualDescription?: string,
        textDescription?: string
    ): Promise<PJeResult> {
        if (!value) {
            return { success: false, action: 'fill', error: 'Valor não fornecido' };
        }

        const strategies = this.buildFillStrategies(selector, visualDescription, textDescription);

        for (const strategy of strategies) {
            try {
                console.log(`[PJeExecutor] Tentando fill: ${strategy.name}`);
                await this.page!.fill(strategy.selector, value, { timeout: 5000 });
                console.log(`[PJeExecutor] Fill OK: ${strategy.name}`);
                return {
                    success: true,
                    action: 'fill',
                    strategy: strategy.name,
                    data: { value }
                };
            } catch (e) {
                // Tentar próxima estratégia
            }
        }

        return {
            success: false,
            action: 'fill',
            error: 'Nenhuma estratégia funcionou'
        };
    }

    private async actionGetText(selector: string): Promise<PJeResult> {
        const text = await this.page!.textContent(selector);
        return {
            success: true,
            action: 'getText',
            data: { text }
        };
    }

    // ========================================================================
    // HELPERS
    // ========================================================================

    private buildClickStrategies(
        selector?: string,
        visualDescription?: string,
        textDescription?: string
    ): Array<{ name: string; selector: string }> {
        const strategies: Array<{ name: string; selector: string }> = [];

        // 1. CSS selector direto
        if (selector) {
            strategies.push({ name: 'css', selector });
        }

        // 2. Extrair texto do description
        if (textDescription) {
            const textMatch = textDescription.match(/["']([^"']+)["']/);
            if (textMatch) {
                strategies.push({ name: 'text-exact', selector: `text="${textMatch[1]}"` });
                strategies.push({ name: 'text-partial', selector: `text=${textMatch[1]}` });
            }
        }

        // 3. Keywords visuais
        if (visualDescription) {
            const keywords = visualDescription.match(/\b(pesquis|consult|enviar|salvar|buscar|abrir|fechar)\w*/gi);
            if (keywords) {
                for (const kw of keywords.slice(0, 2)) {
                    strategies.push({ name: `visual-${kw}`, selector: `button:has-text("${kw}")` });
                }
            }
        }

        // 4. Botões comuns
        strategies.push({ name: 'submit', selector: 'button[type="submit"]:visible' });
        strategies.push({ name: 'first-button', selector: 'button:visible >> nth=0' });

        return strategies;
    }

    private buildFillStrategies(
        selector?: string,
        visualDescription?: string,
        textDescription?: string
    ): Array<{ name: string; selector: string }> {
        const strategies: Array<{ name: string; selector: string }> = [];

        if (selector) {
            strategies.push({ name: 'css', selector });
        }

        // Placeholder
        if (textDescription) {
            const placeholderMatch = textDescription.match(/placeholder\s*["']([^"']+)["']/i);
            if (placeholderMatch) {
                strategies.push({
                    name: 'placeholder',
                    selector: `[placeholder*="${placeholderMatch[1]}" i]`
                });
            }
        }

        // Primeiro input visível
        strategies.push({ name: 'first-input', selector: 'input:visible >> nth=0' });

        return strategies;
    }

    private detectSection(url: string): PJeSection {
        if (url.includes('login')) return 'login';
        if (url.includes('painel')) return 'dashboard';
        if (url.includes('consulta')) return 'process-search';
        if (url.includes('processo')) return 'process-view';
        if (url.includes('intimacao')) return 'intimations';
        return 'unknown';
    }

    private detectChromePath(): string {
        // Windows paths comuns
        const localAppData = process.env['LOCALAPPDATA'] || '';
        const paths: string[] = [
            'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
            'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
            `${localAppData}\\Google\\Chrome\\Application\\chrome.exe`
        ];

        // Retornar primeiro (assumir que existe)
        return paths[0] || 'chrome.exe';
    }

    private sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // ========================================================================
    // PUBLIC GETTERS
    // ========================================================================

    getState(): PJeState {
        return { ...this.state };
    }

    isConnected(): boolean {
        return this.state.connectionState === 'connected' ||
            this.state.connectionState === 'ready';
    }

    isReady(): boolean {
        return this.state.connectionState === 'ready' && this.state.isLoggedIn;
    }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

let executorInstance: PJeExecutor | null = null;

export function getPJeExecutor(config?: Partial<PJeConfig>): PJeExecutor {
    if (!executorInstance) {
        executorInstance = new PJeExecutor(config);
    }
    return executorInstance;
}

export function resetPJeExecutor(): void {
    if (executorInstance) {
        executorInstance.disconnect();
        executorInstance = null;
    }
}
