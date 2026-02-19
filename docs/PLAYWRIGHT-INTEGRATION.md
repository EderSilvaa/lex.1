# Integração Playwright no Lex

> Documento de arquitetura para integração do Playwright como motor de automação do PJe.

---

## 1. Visão Geral

### Por que Playwright?

| Problema Atual | Solução Playwright |
|----------------|-------------------|
| `executeJavaScript()` manual e frágil | API nativa robusta |
| `setTimeout()` para esperar elementos | Auto-wait inteligente |
| Seletores CSS básicos quebram fácil | Múltiplos seletores, text, role |
| Debug difícil | Playwright Inspector |
| Sessão perde no restart | `storageState()` persiste |
| Popup de processo difícil | `waitForEvent('popup')` nativo |

### Abordagem: Human-in-the-Loop (HITL)

O PJe exige certificado digital A3 (token físico). A solução é:

```
1. Playwright abre navegador VISÍVEL
2. Navega para login do PJe
3. PAUSA - usuário loga com certificado
4. Detecta login OK
5. Continua automação
6. Usuário acompanha em tempo real
```

---

## 2. Estrutura Atual

```
electron/
├── main.ts              # 685 linhas - Entry + AI + IPC + Execução (MUITO GRANDE)
├── browser-manager.ts   # 170 linhas - Gerencia abas BrowserView
├── pje-manager.ts       # 139 linhas - BrowserView PJe (duplicado?)
├── crawler.ts           # 152 linhas - Jurisprudência via scraping
├── preload.ts           # Bridge Electron ↔ Renderer
├── polyfill.js          # Compatibilidade Chrome Extension
├── overlay.js           # UI injetada no PJe
└── overlay.css          # Estilos do overlay
```

### Problemas da Estrutura Atual

1. **main.ts muito grande** - mistura AI, IPC, execução, arquivos
2. **Duplicação** - browser-manager.ts e pje-manager.ts fazem coisas similares
3. **Automação frágil** - usa `executeJavaScript()` com `setTimeout()`
4. **Sem persistência de sessão** - precisa logar toda vez

---

## 3. Estrutura Proposta

```
electron/
│
├── main.ts                    # Entry point mínimo (só inicialização)
│
├── core/
│   ├── ipc-handlers.ts        # Todos os IPC handlers organizados
│   ├── store.ts               # Electron-store isolado
│   └── window.ts              # Criação de janelas
│
├── ai/
│   ├── chat-handler.ts        # Lógica do chat com AI
│   ├── prompt-engine.ts       # Engenharia de prompts (7 tipos)
│   └── plan-parser.ts         # Parser de planos JSON da AI
│
├── pje/
│   ├── agent.ts               # Playwright Agent principal
│   ├── actions.ts             # Ações: login, consultar, protocolar
│   ├── selectors.ts           # Mapa de seletores PJe
│   ├── session.ts             # Gerenciamento de sessão/cookies
│   └── browser-view.ts        # BrowserView para visualização na UI
│
├── services/
│   ├── crawler.ts             # Jurisprudência (atual)
│   ├── files.ts               # Operações de arquivos
│   └── documents.ts           # Geração de documentos jurídicos
│
├── ui/
│   ├── overlay.js             # Overlay injetado (atual)
│   ├── overlay.css            # Estilos (atual)
│   └── polyfill.js            # Polyfill (atual)
│
└── preload.ts                 # Bridge (atual)
```

---

## 4. Módulos Playwright

### 4.1 `pje/agent.ts` - Agente Principal

```typescript
import { chromium, Browser, BrowserContext, Page } from 'playwright-core';
import { PJeSession } from './session';
import { PJE_SELECTORS } from './selectors';

export interface AgentOptions {
    headless?: boolean;
    slowMo?: number;
    sessionPath?: string;
}

export class PJeAgent {
    private browser: Browser | null = null;
    private context: BrowserContext | null = null;
    private mainPage: Page | null = null;
    private processPages: Map<string, Page> = new Map();
    private session: PJeSession;

    constructor(private options: AgentOptions = {}) {
        this.session = new PJeSession(options.sessionPath);
    }

    async init(): Promise<void> {
        this.browser = await chromium.launch({
            headless: this.options.headless ?? false,
            slowMo: this.options.slowMo ?? 50
        });

        // Tenta carregar sessão existente
        const savedSession = await this.session.load();

        this.context = await this.browser.newContext({
            storageState: savedSession || undefined
        });

        // Captura automática de popups (processos abrem em nova janela)
        this.context.on('page', (page) => this.handleNewPage(page));

        this.mainPage = await this.context.newPage();
    }

    private async handleNewPage(page: Page): Promise<void> {
        await page.waitForLoadState();
        const url = page.url();

        if (url.includes('processo') || url.includes('Processo')) {
            const numero = await this.extractProcessNumber(page);
            if (numero) {
                this.processPages.set(numero, page);
                console.log(`[PJeAgent] Processo ${numero} aberto`);
            }
        }
    }

    private async extractProcessNumber(page: Page): Promise<string | null> {
        try {
            return await page.locator(PJE_SELECTORS.processo.numero).first().textContent();
        } catch {
            return null;
        }
    }

    async login(): Promise<boolean> {
        if (!this.mainPage) throw new Error('Agent not initialized');

        await this.mainPage.goto(PJE_SELECTORS.login.page);

        console.log('[PJeAgent] Aguardando login com certificado digital...');

        // PAUSA - Aguarda usuário logar (timeout 5 minutos)
        try {
            await this.mainPage.waitForURL('**/painel**', { timeout: 300000 });
            console.log('[PJeAgent] Login detectado!');

            // Salva sessão para próxima vez
            await this.saveSession();
            return true;
        } catch {
            console.error('[PJeAgent] Timeout aguardando login');
            return false;
        }
    }

    async saveSession(): Promise<void> {
        if (this.context) {
            await this.session.save(this.context);
        }
    }

    async isLoggedIn(): Promise<boolean> {
        if (!this.mainPage) return false;

        try {
            await this.mainPage.goto(PJE_SELECTORS.login.painelUrl);
            await this.mainPage.waitForSelector(PJE_SELECTORS.login.painelLogado, { timeout: 5000 });
            return true;
        } catch {
            return false;
        }
    }

    getPage(): Page | null {
        return this.mainPage;
    }

    getProcessPage(numero: string): Page | undefined {
        return this.processPages.get(numero);
    }

    getAllPages(): Page[] {
        return this.context?.pages() || [];
    }

    async close(): Promise<void> {
        await this.browser?.close();
        this.browser = null;
        this.context = null;
        this.mainPage = null;
        this.processPages.clear();
    }
}
```

### 4.2 `pje/selectors.ts` - Mapa de Seletores

```typescript
/**
 * Seletores resilientes para o PJe
 * Usa múltiplas opções para cada elemento (fallback)
 */
export const PJE_SELECTORS = {

    login: {
        page: 'https://pje.tjpa.jus.br/pje/login.seam',
        painelUrl: 'https://pje.tjpa.jus.br/pje/Painel/painel_usuario/usuarioPanel.seam',
        btnCertificado: [
            '#btnCertificado',
            '.certificado-digital',
            'button:has-text("Certificado")'
        ].join(', '),
        painelLogado: [
            '.painel-usuario',
            '#painelPrincipal',
            '[id*="painel"]'
        ].join(', ')
    },

    consulta: {
        page: 'https://pje.tjpa.jus.br/pje/Processo/ConsultaProcesso/listView.seam',
        inputNumero: [
            '#numeroProcesso',
            'input[name*="numero"]',
            'input[placeholder*="processo"]'
        ].join(', '),
        btnPesquisar: [
            '#btnPesquisar',
            'button[type="submit"]',
            'input[type="submit"]'
        ].join(', '),
        resultados: [
            '.lista-processos tr',
            '.resultado-processo',
            'table tbody tr'
        ].join(', '),
        linkProcesso: [
            'a[id*="processo"]',
            '.numero-processo a',
            'a[href*="processo"]'
        ].join(', ')
    },

    processo: {
        numero: [
            '#numeroProcesso',
            '.numero-processo',
            '[id*="numProcesso"]'
        ].join(', '),
        classe: [
            '#classeProcessual',
            '.classe-processual',
            '[id*="classe"]'
        ].join(', '),
        assunto: [
            '#assunto',
            '.assunto-processo',
            '[id*="assunto"]'
        ].join(', '),
        partes: [
            '.parte-processo',
            '[id*="parte"]',
            '.polo-ativo, .polo-passivo'
        ].join(', '),
        abaDocumentos: [
            'text=Documentos',
            '[id*="abaDoc"]',
            '[id*="tabDoc"]',
            'a:has-text("Documentos")'
        ].join(', '),
        abaMovimentacoes: [
            'text=Movimentações',
            '[id*="abaMov"]',
            '[id*="tabMov"]',
            'a:has-text("Movimentações")'
        ].join(', ')
    },

    documentos: {
        lista: [
            '.documento',
            '.lista-documentos tr',
            'table[id*="doc"] tbody tr'
        ].join(', '),
        nome: [
            '.nome-documento',
            'td:nth-child(1)',
            '.descricao'
        ].join(', '),
        tipo: [
            '.tipo-documento',
            'td:nth-child(2)'
        ].join(', '),
        data: [
            '.data-documento',
            'td:nth-child(3)'
        ].join(', '),
        btnDownload: [
            'a[href*="download"]',
            'button[title*="download"]',
            '.btn-download'
        ].join(', ')
    },

    movimentacoes: {
        lista: [
            '.movimentacao',
            '.lista-movimentacoes tr',
            'table[id*="mov"] tbody tr'
        ].join(', '),
        data: '.data-movimentacao, td:nth-child(1)',
        descricao: '.descricao-movimentacao, td:nth-child(2)'
    },

    protocolo: {
        btnNovaPeticao: [
            'text=Nova Petição',
            '#btnPeticao',
            'a:has-text("Petição")'
        ].join(', '),
        selectTipo: [
            '#tipoPeticao',
            'select[id*="tipo"]'
        ].join(', '),
        inputArquivo: 'input[type="file"]',
        btnEnviar: [
            '#btnEnviar',
            'text=Protocolar',
            'button[type="submit"]'
        ].join(', '),
        comprovante: [
            '.comprovante',
            '.mensagem-sucesso',
            'text=protocolado com sucesso'
        ].join(', ')
    }
};
```

### 4.3 `pje/actions.ts` - Ações do PJe

```typescript
import { Page, Download } from 'playwright-core';
import { PJeAgent } from './agent';
import { PJE_SELECTORS } from './selectors';

export interface ProcessoData {
    numero: string;
    classe: string;
    assunto: string;
    partes: string[];
}

export interface Documento {
    nome: string;
    tipo: string;
    data: string;
}

export interface Movimentacao {
    data: string;
    descricao: string;
}

export interface Comprovante {
    sucesso: boolean;
    protocolo?: string;
    mensagem: string;
    screenshot?: string;
}

export class PJeActions {
    constructor(private agent: PJeAgent) {}

    /**
     * Consulta um processo pelo número
     */
    async consultarProcesso(numero: string): Promise<Page> {
        const page = this.agent.getPage();
        if (!page) throw new Error('Agent not initialized');

        await page.goto(PJE_SELECTORS.consulta.page);
        await page.fill(PJE_SELECTORS.consulta.inputNumero, numero);

        // Clique que pode abrir popup
        const [popup] = await Promise.all([
            page.waitForEvent('popup').catch(() => null),
            page.click(PJE_SELECTORS.consulta.linkProcesso)
        ]);

        const processPage = popup || page;
        await processPage.waitForLoadState();

        return processPage;
    }

    /**
     * Extrai dados básicos do processo
     */
    async extrairDadosProcesso(processPage: Page): Promise<ProcessoData> {
        await processPage.waitForSelector(PJE_SELECTORS.processo.numero);

        const dados = await processPage.evaluate((sel) => {
            const getText = (selector: string) => {
                const el = document.querySelector(selector);
                return el?.textContent?.trim() || '';
            };

            const getAll = (selector: string) => {
                return Array.from(document.querySelectorAll(selector))
                    .map(el => el.textContent?.trim() || '')
                    .filter(Boolean);
            };

            return {
                numero: getText(sel.numero),
                classe: getText(sel.classe),
                assunto: getText(sel.assunto),
                partes: getAll(sel.partes)
            };
        }, {
            numero: PJE_SELECTORS.processo.numero.split(', ')[0],
            classe: PJE_SELECTORS.processo.classe.split(', ')[0],
            assunto: PJE_SELECTORS.processo.assunto.split(', ')[0],
            partes: PJE_SELECTORS.processo.partes.split(', ')[0]
        });

        return dados;
    }

    /**
     * Lista documentos do processo
     */
    async listarDocumentos(processPage: Page): Promise<Documento[]> {
        // Clica na aba de documentos
        await processPage.click(PJE_SELECTORS.processo.abaDocumentos);
        await processPage.waitForSelector(PJE_SELECTORS.documentos.lista);

        const documentos = await processPage.$$eval(
            PJE_SELECTORS.documentos.lista,
            (rows, selectors) => {
                return rows.map(row => ({
                    nome: row.querySelector(selectors.nome)?.textContent?.trim() || '',
                    tipo: row.querySelector(selectors.tipo)?.textContent?.trim() || '',
                    data: row.querySelector(selectors.data)?.textContent?.trim() || ''
                }));
            },
            {
                nome: PJE_SELECTORS.documentos.nome.split(', ')[0],
                tipo: PJE_SELECTORS.documentos.tipo.split(', ')[0],
                data: PJE_SELECTORS.documentos.data.split(', ')[0]
            }
        );

        return documentos;
    }

    /**
     * Lista movimentações do processo
     */
    async listarMovimentacoes(processPage: Page): Promise<Movimentacao[]> {
        await processPage.click(PJE_SELECTORS.processo.abaMovimentacoes);
        await processPage.waitForSelector(PJE_SELECTORS.movimentacoes.lista);

        const movimentacoes = await processPage.$$eval(
            PJE_SELECTORS.movimentacoes.lista,
            (rows, selectors) => {
                return rows.map(row => ({
                    data: row.querySelector(selectors.data)?.textContent?.trim() || '',
                    descricao: row.querySelector(selectors.descricao)?.textContent?.trim() || ''
                }));
            },
            {
                data: PJE_SELECTORS.movimentacoes.data,
                descricao: PJE_SELECTORS.movimentacoes.descricao
            }
        );

        return movimentacoes;
    }

    /**
     * Faz download de um documento
     */
    async downloadDocumento(processPage: Page, index: number): Promise<string> {
        const [download] = await Promise.all([
            processPage.waitForEvent('download'),
            processPage.locator(PJE_SELECTORS.documentos.lista)
                .nth(index)
                .locator(PJE_SELECTORS.documentos.btnDownload)
                .click()
        ]);

        const path = await download.path();
        return path || '';
    }

    /**
     * Protocola uma petição
     */
    async protocolarPeticao(
        processPage: Page,
        arquivoPath: string,
        tipoPeticao?: string
    ): Promise<Comprovante> {
        try {
            // Clica em nova petição
            await processPage.click(PJE_SELECTORS.protocolo.btnNovaPeticao);

            // Seleciona tipo se especificado
            if (tipoPeticao) {
                await processPage.selectOption(PJE_SELECTORS.protocolo.selectTipo, tipoPeticao);
            }

            // Upload do arquivo
            await processPage.setInputFiles(PJE_SELECTORS.protocolo.inputArquivo, arquivoPath);

            // PAUSA OPCIONAL - usuário confirma antes de enviar
            // await processPage.pause();

            // Envia
            await processPage.click(PJE_SELECTORS.protocolo.btnEnviar);

            // Aguarda confirmação
            await processPage.waitForSelector(PJE_SELECTORS.protocolo.comprovante);

            // Screenshot do comprovante
            const screenshot = await processPage.screenshot({
                path: `comprovante-${Date.now()}.png`
            });

            return {
                sucesso: true,
                mensagem: 'Petição protocolada com sucesso',
                screenshot: screenshot.toString('base64')
            };

        } catch (error: any) {
            return {
                sucesso: false,
                mensagem: `Erro ao protocolar: ${error.message}`
            };
        }
    }
}
```

### 4.4 `pje/session.ts` - Persistência de Sessão

```typescript
import { BrowserContext } from 'playwright-core';
import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';

export class PJeSession {
    private sessionPath: string;

    constructor(customPath?: string) {
        this.sessionPath = customPath || path.join(
            app.getPath('userData'),
            'pje-session.json'
        );
    }

    async save(context: BrowserContext): Promise<void> {
        const state = await context.storageState();
        fs.writeFileSync(this.sessionPath, JSON.stringify(state, null, 2));
        console.log('[PJeSession] Sessão salva em:', this.sessionPath);
    }

    async load(): Promise<any | null> {
        try {
            if (fs.existsSync(this.sessionPath)) {
                const data = fs.readFileSync(this.sessionPath, 'utf-8');
                console.log('[PJeSession] Sessão carregada');
                return JSON.parse(data);
            }
        } catch (error) {
            console.warn('[PJeSession] Erro ao carregar sessão:', error);
        }
        return null;
    }

    async isValid(): Promise<boolean> {
        const session = await this.load();
        if (!session) return false;

        // Verifica se cookies não expiraram
        const now = Date.now() / 1000;
        const cookies = session.cookies || [];

        return cookies.some((cookie: any) => {
            return !cookie.expires || cookie.expires > now;
        });
    }

    async clear(): Promise<void> {
        try {
            if (fs.existsSync(this.sessionPath)) {
                fs.unlinkSync(this.sessionPath);
                console.log('[PJeSession] Sessão limpa');
            }
        } catch (error) {
            console.warn('[PJeSession] Erro ao limpar sessão:', error);
        }
    }
}
```

---

## 5. Integração com IPC

### `core/ipc-handlers.ts`

```typescript
import { ipcMain } from 'electron';
import { PJeAgent } from '../pje/agent';
import { PJeActions } from '../pje/actions';

let agent: PJeAgent | null = null;
let actions: PJeActions | null = null;

export function registerPJeHandlers() {

    // Inicializa o agente
    ipcMain.handle('pje-agent-init', async () => {
        agent = new PJeAgent({ headless: false });
        await agent.init();
        actions = new PJeActions(agent);
        return { success: true };
    });

    // Login (HITL)
    ipcMain.handle('pje-agent-login', async () => {
        if (!agent) throw new Error('Agent not initialized');
        const success = await agent.login();
        return { success };
    });

    // Verifica se está logado
    ipcMain.handle('pje-agent-check-session', async () => {
        if (!agent) return { loggedIn: false };
        const loggedIn = await agent.isLoggedIn();
        return { loggedIn };
    });

    // Consulta processo
    ipcMain.handle('pje-consultar-processo', async (_, numero: string) => {
        if (!actions) throw new Error('Actions not initialized');
        const page = await actions.consultarProcesso(numero);
        const dados = await actions.extrairDadosProcesso(page);
        return dados;
    });

    // Lista documentos
    ipcMain.handle('pje-listar-documentos', async (_, numero: string) => {
        if (!actions) throw new Error('Actions not initialized');
        const page = agent?.getProcessPage(numero) || agent?.getPage();
        if (!page) throw new Error('Page not found');
        return await actions.listarDocumentos(page);
    });

    // Lista movimentações
    ipcMain.handle('pje-listar-movimentacoes', async (_, numero: string) => {
        if (!actions) throw new Error('Actions not initialized');
        const page = agent?.getProcessPage(numero) || agent?.getPage();
        if (!page) throw new Error('Page not found');
        return await actions.listarMovimentacoes(page);
    });

    // Protocola petição
    ipcMain.handle('pje-protocolar', async (_, { numero, arquivoPath, tipo }) => {
        if (!actions) throw new Error('Actions not initialized');
        const page = agent?.getProcessPage(numero) || agent?.getPage();
        if (!page) throw new Error('Page not found');
        return await actions.protocolarPeticao(page, arquivoPath, tipo);
    });

    // Fecha o agente
    ipcMain.handle('pje-agent-close', async () => {
        await agent?.close();
        agent = null;
        actions = null;
        return { success: true };
    });
}
```

---

## 6. Distribuição e Escala

### Opção Recomendada: playwright-core

```bash
# Instala SEM browser (~5MB)
npm install playwright-core
```

**Tamanho final do app:**
- Electron + Lex: ~150MB
- playwright-core: ~5MB
- **Total: ~155MB** (vs 430MB com browser dedicado)

### Reutilização do Chromium

```typescript
import { chromium } from 'playwright-core';

// Usa o Chromium do sistema ou especifica caminho
const browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH || undefined
});
```

---

## 7. Cronograma de Implementação

| Fase | Tarefas | Tempo |
|------|---------|-------|
| **1. Setup** | Instalar playwright-core, criar pastas | 30min |
| **2. Core** | pje/agent.ts, pje/session.ts | 2h |
| **3. Seletores** | pje/selectors.ts (mapear PJe real) | 1h |
| **4. Actions** | pje/actions.ts (operações) | 2h |
| **5. IPC** | core/ipc-handlers.ts | 1h |
| **6. Refactor** | Extrair código do main.ts | 2h |
| **7. Testes** | Testar fluxo completo no PJe | 2h |

**Total estimado: ~10 horas**

---

## 8. Fluxo de Uso

```
┌─────────────────────────────────────────────────────────────┐
│                         USUÁRIO                              │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  1. Abre Lex Desktop                                        │
│  2. Clica "Conectar PJe"                                    │
│  3. Playwright abre navegador                               │
│  4. Usuário faz login com certificado A3                    │
│  5. Lex detecta login e salva sessão                        │
│  6. Usuário interage via chat:                              │
│     - "consulte processo 123"                               │
│     - "liste os documentos"                                 │
│     - "protocole esta petição"                              │
│  7. Playwright executa, usuário acompanha                   │
└─────────────────────────────────────────────────────────────┘
```

---

## 9. Próximos Passos

1. [ ] Aprovar esta arquitetura
2. [ ] Instalar `playwright-core`
3. [ ] Criar estrutura de pastas
4. [ ] Implementar `pje/agent.ts`
5. [ ] Mapear seletores reais do PJe TJPA
6. [ ] Implementar ações básicas
7. [ ] Integrar com chat existente
8. [ ] Testes end-to-end

---

*Documento criado em: Janeiro 2026*
*Versão: 1.0*
