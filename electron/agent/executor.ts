/**
 * Lex Skill Executor
 *
 * Executa skills registradas com validação e tratamento de erro.
 * Inspirado no OpenClaw.
 */

import { Skill, SkillResult, SkillRegistry, AgentContext, AgentSpec } from './types';
import * as path from 'path';
import * as fs from 'fs';
import { captureDOMSnapshot, computeValidation } from '../browser/validation';
import type { DOMSnapshot } from '../browser/validation';
import { detectCaptcha, solveCaptchaWithVision } from '../browser/captcha';

// ============================================================================
// PER-SKILL TIMEOUT
// ============================================================================

const CATEGORY_TIMEOUTS: Record<string, number> = {
    pje: 600_000,     // 10 min — browser-use tasks PJe são lentas
    browser: 600_000, // 10 min
    pesquisa: 90_000,
    documentos: 60_000,
    os: 60_000,
    pc: 60_000,
};

const VISION_SKILLS = new Set(['browser_auto_task', 'pje_agir']);
const VISION_TIMEOUT = 600_000;
const DEFAULT_TIMEOUT = 60_000;

function getSkillTimeout(skill: Skill): number {
    if (skill.timeoutMs) return skill.timeoutMs;
    if (VISION_SKILLS.has(skill.nome)) return VISION_TIMEOUT;
    return CATEGORY_TIMEOUTS[skill.categoria] ?? DEFAULT_TIMEOUT;
}

class SkillTimeoutError extends Error {
    readonly isTimeout = true;
    constructor(skillName: string, ms: number) {
        super(`Timeout após ${Math.round(ms / 1000)}s executando ${skillName}`);
        this.name = 'SkillTimeoutError';
    }
}

function withTimeout<T>(promise: Promise<T>, ms: number, skillName: string): Promise<T> {
    return new Promise<T>((resolve, reject) => {
        const timer = setTimeout(() => reject(new SkillTimeoutError(skillName, ms)), ms);
        promise.then(
            val => { clearTimeout(timer); resolve(val); },
            err => { clearTimeout(timer); reject(err); }
        );
    });
}

// ============================================================================
// TRANSIENT ERROR DETECTION (para retry)
// ============================================================================

const TRANSIENT_PATTERNS = [
    'timeout', 'navigation timeout', 'target closed', 'session closed',
    'execution context was destroyed', 'frame was detached',
    'connection refused', 'net::err_', 'protocol error', 'cdp',
    'websocket', 'econnreset', 'econnrefused', 'etimedout', 'epipe',
    'fetch failed',
];

const PERMANENT_PATTERNS = [
    'não encontrad', 'obrigatório', 'inválid', 'não disponível',
    'não logado', 'sem permissão', 'captcha', 'certificado',
];

function isTransientError(msg: string): boolean {
    const lower = (msg || '').toLowerCase();
    if (PERMANENT_PATTERNS.some(p => lower.includes(p))) return false;
    return TRANSIENT_PATTERNS.some(p => lower.includes(p));
}

function getMaxRetries(skill: Skill): number {
    if (['pje', 'browser'].includes(skill.categoria)) return 2;
    return 1;
}

// ============================================================================
// REGISTRY
// ============================================================================

// Registry de skills carregadas
let skillRegistry: SkillRegistry = {};

/**
 * Registra uma skill
 */
export function registerSkill(skill: Skill): void {
    skillRegistry[skill.nome] = skill;
    console.log(`[Executor] Skill registrada: ${skill.nome}`);
}

/**
 * Registra múltiplas skills
 */
export function registerSkills(skills: Skill[]): void {
    skills.forEach(registerSkill);
}

/**
 * Remove uma skill
 */
export function unregisterSkill(nome: string): void {
    delete skillRegistry[nome];
}

/**
 * Lista skills disponíveis
 */
export function listSkills(): string[] {
    return Object.keys(skillRegistry);
}

/**
 * Obtém uma skill pelo nome
 */
export function getSkill(nome: string): Skill | undefined {
    return skillRegistry[nome];
}

/**
 * Executa uma skill com timeout + retry para erros transientes.
 */
export async function executeSkill(
    nome: string,
    parametros: Record<string, any>,
    context: AgentContext,
    abortSignal?: AbortSignal
): Promise<SkillResult> {
    console.log(`[Executor] Executando: ${nome}`);
    console.log(`[Executor] Parâmetros:`, JSON.stringify(parametros, null, 2));

    // Busca skill
    const skill = skillRegistry[nome];

    if (!skill) {
        const disponiveis = Object.keys(skillRegistry).join(', ') || 'nenhuma';
        return {
            sucesso: false,
            erro: `Skill "${nome}" não encontrada. Disponíveis: ${disponiveis}`
        };
    }

    // Valida parâmetros
    const validacao = validateParams(skill, parametros);
    if (!validacao.valido) {
        return {
            sucesso: false,
            erro: `Parâmetros inválidos: ${validacao.erro}`
        };
    }

    // Aplica defaults
    const paramsComDefaults = applyDefaults(skill, parametros);

    // Captura snapshot DOM antes da ação (se for skill de browser/pje)
    const isBrowserAction = skill.categoria === 'browser' || skill.categoria === 'pje';
    let snapshot: DOMSnapshot | null = null;
    if (isBrowserAction) {
        try {
            const { getActivePage } = require('../browser-manager');
            const page = getActivePage();
            if (page) snapshot = await captureDOMSnapshot(page);
        } catch { /* non-blocking */ }
    }

    // Executa com retry + timeout
    const startTime = Date.now();
    const maxRetries = getMaxRetries(skill);
    const timeoutMs = getSkillTimeout(skill);
    let resultado: SkillResult | null = null;
    let lastError: any = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        // Checar abort entre tentativas
        if (abortSignal?.aborted) {
            return { sucesso: false, erro: 'Operação cancelada.' };
        }

        try {
            resultado = await withTimeout(
                skill.execute(paramsComDefaults, context),
                timeoutMs,
                nome
            );

            // Sucesso ou erro permanente → para
            if (resultado.sucesso || !isTransientError(resultado.erro || '')) break;

            // Erro transiente retornado pela skill → retry
            console.log(`[Executor] ${nome} transient (attempt ${attempt + 1}/${maxRetries + 1}): ${resultado.erro}`);
            lastError = resultado;

        } catch (thrown: any) {
            // Timeout → não retryable (já consumiu seu tempo)
            if (thrown instanceof SkillTimeoutError) {
                console.warn(`[Executor] ${nome} timeout após ${timeoutMs}ms`);
                return { sucesso: false, erro: thrown.message };
            }

            // Erro permanente → não retryar
            if (!isTransientError(thrown.message || '')) {
                console.error(`[Executor] Erro em ${nome}:`, thrown);
                return { sucesso: false, erro: thrown.message || 'Erro desconhecido na execução da skill' };
            }

            // Erro transiente thrown → retry
            console.log(`[Executor] ${nome} threw transient (attempt ${attempt + 1}/${maxRetries + 1}): ${thrown.message}`);
            lastError = thrown;
        }

        // Backoff entre retries (não no último attempt)
        if (attempt < maxRetries) {
            const delay = 1000 * Math.pow(2, attempt) + Math.random() * 500;
            await new Promise(r => setTimeout(r, delay));
        }
    }

    // Se todas as tentativas falharam
    if (!resultado) {
        return { sucesso: false, erro: lastError?.message || 'Erro após retries esgotados' };
    }

    const duration = Date.now() - startTime;
    console.log(`[Executor] ${nome} completou em ${duration}ms`);
    console.log(`[Executor] Sucesso: ${resultado.sucesso}`);

    // Validação pós-ação: compara DOM antes/depois
    let afterSnapshot: DOMSnapshot | null = null;
    let postValidation: ReturnType<typeof computeValidation> | null = null;
    let domCompacto = '';

    if (snapshot && resultado.sucesso) {
        try {
            const { getActivePage } = require('../browser-manager');
            const page = getActivePage();
            if (page) {
                afterSnapshot = await captureDOMSnapshot(page);
                postValidation = computeValidation(snapshot, afterSnapshot, nome, paramsComDefaults);
                resultado.dados = { ...(resultado.dados || {}), validation: postValidation };
                if (resultado.mensagem) {
                    resultado.mensagem += `\n[Validação: ${postValidation.summary}]`;
                }
                // Captura DOM compacto para dataset de treino (non-blocking)
                try {
                    const { compactDOM } = require('./training-collector');
                    domCompacto = await compactDOM(page);
                } catch { /* training collector não disponível */ }
            }
        } catch { /* non-blocking */ }
    }

    // Training data collection (fire-and-forget, non-blocking)
    if (isBrowserAction && resultado.sucesso && snapshot && afterSnapshot && postValidation && postValidation.confidence !== 'low') {
        try {
            const { collectTrainingExample } = require('./training-collector');
            collectTrainingExample({
                snapshot,
                afterSnapshot,
                validation: postValidation,
                skillName: nome,
                params: paramsComDefaults,
                context,
                duration,
                domCompacto,
            }).catch(() => {});
        } catch { /* training collector não inicializado — ok */ }
    }

    // CAPTCHA detection pós-ação
    if (isBrowserAction) {
        try {
            const { getActivePage } = require('../browser-manager');
            const page = getActivePage();
            if (page) {
                const detection = await detectCaptcha(page);
                if (detection) {
                    const url = page.url();
                    const isPje = url.includes('pje.') || url.includes('cnj.jus.br');

                    if (isPje) {
                        resultado.dados = { ...(resultado.dados || {}), captcha: detection };
                        resultado.mensagem = (resultado.mensagem || '') +
                            '\n⚠️ CAPTCHA detectado na página PJe. O usuário precisa resolver manualmente no browser.';
                    } else {
                        const solveResult = await solveCaptchaWithVision(page, detection);
                        if (solveResult.solved) {
                            resultado.mensagem = (resultado.mensagem || '') +
                                `\n✅ CAPTCHA resolvido automaticamente: "${solveResult.answer}"`;
                        } else {
                            resultado.dados = { ...(resultado.dados || {}), captcha: detection, autoSolveFailed: true };
                            resultado.mensagem = (resultado.mensagem || '') +
                                `\n⚠️ CAPTCHA detectado mas auto-solve falhou: ${solveResult.error}`;
                        }
                    }
                }
            }
        } catch (captchaErr: any) {
            console.warn('[Executor] Erro na detecção de CAPTCHA:', captchaErr.message);
        }
    }

    return resultado;
}

/**
 * Valida parâmetros contra schema da skill
 */
function validateParams(
    skill: Skill,
    params: Record<string, any>
): { valido: boolean; erro?: string } {
    const schema = skill.parametros;

    for (const [nome, config] of Object.entries(schema)) {
        // Verifica obrigatórios
        if (config.obrigatorio && !(nome in params)) {
            return {
                valido: false,
                erro: `Parâmetro obrigatório ausente: "${nome}"`
            };
        }

        // Verifica tipo (se fornecido)
        if (nome in params && params[nome] !== undefined) {
            const valor = params[nome];
            const tipoRecebido = Array.isArray(valor) ? 'array' : typeof valor;

            if (tipoRecebido !== config.tipo) {
                return {
                    valido: false,
                    erro: `Parâmetro "${nome}" deve ser ${config.tipo}, recebeu ${tipoRecebido}`
                };
            }

            // Verifica enum
            if (config.enum && !config.enum.includes(valor)) {
                return {
                    valido: false,
                    erro: `Parâmetro "${nome}" deve ser um de: ${config.enum.join(', ')}`
                };
            }
        }
    }

    return { valido: true };
}

/**
 * Aplica valores default
 */
function applyDefaults(
    skill: Skill,
    params: Record<string, any>
): Record<string, any> {
    const resultado = { ...params };

    for (const [nome, config] of Object.entries(skill.parametros)) {
        if (!(nome in resultado) && config.default !== undefined) {
            resultado[nome] = config.default;
        }
    }

    return resultado;
}

/**
 * Gera descrição das skills para o prompt do LLM.
 * Na primeira iteração (iteracao <= 1), formato completo com parâmetros e exemplos.
 * A partir da 2ª iteração, formato compacto (nome + descrição) para economizar tokens.
 */
export function getSkillsForPrompt(iteracao = 1, allowedCategories?: Array<Skill['categoria']>, forceCompact?: boolean): string {
    let skills = Object.values(skillRegistry);

    if (allowedCategories && allowedCategories.length > 0) {
        skills = skills.filter(s => allowedCategories.includes(s.categoria));
    }

    if (skills.length === 0) {
        return '# Skills Disponíveis\n\nNenhuma skill registrada.';
    }

    const categorias: Record<string, Skill[]> = {};

    // Agrupa por categoria
    for (const skill of skills) {
        const cat = skill.categoria || 'outros';
        if (!categorias[cat]) {
            categorias[cat] = [];
        }
        categorias[cat].push(skill);
    }

    const compacto = forceCompact || iteracao > 1;

    // Formata
    const partes: string[] = [
        compacto
            ? '# Skills Disponíveis (resumo — use os nomes exatos)'
            : '# Skills Disponíveis'
    ];

    for (const [categoria, skillsCategoria] of Object.entries(categorias)) {
        partes.push(`\n## ${formatCategoria(categoria)}`);

        for (const skill of skillsCategoria) {
            partes.push(compacto
                ? formatSkillForPromptCompact(skill)
                : formatSkillForPrompt(skill)
            );
        }
    }

    return partes.join('\n');
}

/**
 * Formato compacto: apenas nome e descrição curta (sem parâmetros/exemplos)
 */
function formatSkillForPromptCompact(skill: Skill): string {
    return `- \`${skill.nome}\`: ${skill.descricao}`;
}

/**
 * Formata uma skill para o prompt
 */
function formatSkillForPrompt(skill: Skill): string {
    const params = Object.entries(skill.parametros)
        .map(([nome, config]) => {
            const obr = config.obrigatorio ? '(obrigatório)' : `(opcional, default: ${config.default})`;
            return `  - \`${nome}\`: ${config.tipo} ${obr} - ${config.descricao}`;
        })
        .join('\n');

    let texto = `
### ${skill.nome}
${skill.descricao}

**Parâmetros:**
${params || '  Nenhum parâmetro'}

**Retorna:** ${skill.retorno}`;

    if (skill.exemplos && skill.exemplos.length > 0) {
        texto += `\n\n**Exemplo:**\n\`\`\`json\n${skill.exemplos[0]}\n\`\`\``;
    }

    return texto;
}

/**
 * Formata nome da categoria
 */
function formatCategoria(cat: string): string {
    const map: Record<string, string> = {
        pje: 'PJe - Processo Judicial Eletrônico',
        browser: 'Browser - Controle do Navegador',
        documentos: 'Documentos',
        pesquisa: 'Pesquisa',
        utils: 'Utilitários',
        os: 'Sistema Operacional',
        pc: 'PC - Mouse/Teclado',
        gmail: 'Gmail - Email',
        gcalendar: 'Google Calendar - Agenda',
        outlook: 'Outlook - Email Office 365',
        gdrive: 'Google Drive - Arquivos',
        gdocs: 'Google Docs - Documentos',
        whatsapp: 'WhatsApp Business',
        notion: 'Notion - Organização',
        trello: 'Trello - Kanban',
        todoist: 'Todoist - Tarefas',
        zapier: 'Zapier - Automação',
        apify: 'Apify - Web Scraping',
        gcontacts: 'Google Contacts - Contatos',
        teams: 'Microsoft Teams - Comunicação',
        docusign: 'DocuSign - Assinatura Eletrônica',
        dropbox: 'Dropbox - Armazenamento',
        onedrive: 'OneDrive / SharePoint',
        slack: 'Slack - Mensagens',
        pdf: 'PDF - Ferramentas',
        screenshot: 'Screenshot - Captura de Tela',
        excel: 'Excel - Planilhas',
        desktop: 'Desktop - Controle do Sistema',
        clipboard: 'Clipboard - Área de Transferência',
    };
    return map[cat] || cat.charAt(0).toUpperCase() + cat.slice(1);
}

/**
 * Carrega skills de um diretório (C1)
 *
 * Busca todos os arquivos .ts/.js no diretório (exceto index.ts).
 * Cada módulo deve exportar um Skill (default ou named com 'nome' e 'execute').
 */
export async function loadSkillsFromDir(dir: string): Promise<void> {
    const fullDir = path.resolve(__dirname, '..', dir);

    if (!fs.existsSync(fullDir)) {
        console.warn(`[Executor] Diretório não encontrado: ${fullDir}`);
        return;
    }

    const entries = fs.readdirSync(fullDir, { withFileTypes: true });
    let loaded = 0;

    for (const entry of entries) {
        // Pular index, diretórios, e arquivos não-TS/JS
        if (!entry.isFile()) continue;
        if (entry.name === 'index.ts' || entry.name === 'index.js') continue;
        if (entry.name.endsWith('.d.ts')) continue;

        const ext = path.extname(entry.name);
        if (ext !== '.ts' && ext !== '.js') continue;

        try {
            const modulePath = path.join(fullDir, entry.name);
            const mod = require(modulePath);

            // Buscar Skill: export default ou primeiro export com 'nome' e 'execute'
            const skill: Skill | undefined =
                mod.default ||
                Object.values(mod).find((v: any) => v?.nome && typeof v?.execute === 'function') as Skill | undefined;

            if (skill && skill.nome && typeof skill.execute === 'function') {
                // Evitar duplicatas (mock pode já ter registrado)
                if (skillRegistry[skill.nome]) {
                    console.log(`[Executor] Substituindo skill mock: ${skill.nome} → real`);
                }
                registerSkill(skill);
                loaded++;
            } else {
                console.warn(`[Executor] Módulo sem Skill válida: ${entry.name}`);
            }
        } catch (error: any) {
            console.error(`[Executor] Erro ao carregar ${entry.name}:`, error.message);
        }
    }

    console.log(`[Executor] Carregadas ${loaded} skills de ${dir}`);
}
