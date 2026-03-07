/**
 * Lex Skill Executor
 *
 * Executa skills registradas com validação e tratamento de erro.
 * Inspirado no OpenClaw.
 */

import { Skill, SkillResult, SkillRegistry, AgentContext } from './types';
import * as path from 'path';
import * as fs from 'fs';

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
 * Executa uma skill
 */
export async function executeSkill(
    nome: string,
    parametros: Record<string, any>,
    context: AgentContext
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

    // Executa
    try {
        const startTime = Date.now();
        const resultado = await skill.execute(paramsComDefaults, context);
        const duration = Date.now() - startTime;

        console.log(`[Executor] ${nome} completou em ${duration}ms`);
        console.log(`[Executor] Sucesso: ${resultado.sucesso}`);

        return resultado;

    } catch (error: any) {
        console.error(`[Executor] Erro em ${nome}:`, error);

        return {
            sucesso: false,
            erro: error.message || 'Erro desconhecido na execução da skill'
        };
    }
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
export function getSkillsForPrompt(iteracao = 1): string {
    const skills = Object.values(skillRegistry);

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

    const compacto = iteracao > 1;

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
        documentos: 'Documentos',
        pesquisa: 'Pesquisa',
        utils: 'Utilitários'
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
