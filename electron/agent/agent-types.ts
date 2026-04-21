/**
 * Agent Type Registry (Phase 1 AIOS)
 *
 * Define tipos de agentes especializados.
 */

import type { AgentTypeId, AgentSpec } from './types';

const AGENT_TYPES: Record<AgentTypeId, AgentSpec> = {
    general: {
        typeId: 'general',
        displayName: 'Agente Geral',
        allowedSkillCategories: ['pje', 'documentos', 'pesquisa', 'utils', 'os', 'pc', 'browser'],
    },
    pje: {
        typeId: 'pje',
        displayName: 'Agente PJe',
        allowedSkillCategories: ['pje', 'browser'],
        systemPromptExtra: `Voce e um agente especializado em automacao do PJe (Processo Judicial Eletronico).
Use browser_get_state antes de interagir para ver seletores disponiveis.
Prefira browser_click, browser_fill, browser_type (atomicos e rapidos) a pje_agir (lento, usa visao).
Use pje_agir APENAS quando os seletores nao sao claros ou a tela e desconhecida.
Use pje_abrir para garantir que o Chrome esta no PJe.`,
        configOverrides: { enableCritic: true, timeoutMs: 5 * 60 * 1000 },
        maxConcurrent: 1,
        requiresBrowser: true,
    },
    document: {
        typeId: 'document',
        displayName: 'Agente de Documentos',
        allowedSkillCategories: ['documentos', 'os'],
        systemPromptExtra: `Voce e um agente especializado em analise e geracao de documentos juridicos.
Seu foco e ler, analisar, gerar e salvar documentos.
Use os_arquivos para ler arquivos do disco e doc_gerar para criar documentos.`,
        maxConcurrent: 6,
        configOverrides: { timeoutMs: 3 * 60 * 1000 },
    },
    research: {
        typeId: 'research',
        displayName: 'Agente de Pesquisa',
        allowedSkillCategories: ['pesquisa', 'browser', 'os'],
        systemPromptExtra: `Voce e um agente especializado em pesquisa juridica e jurisprudencia.
Seu foco e buscar jurisprudencia, consultar legislacao e pesquisar na web.
Use pesquisa_jurisprudencia para buscar decisoes e os_fetch para consultar fontes externas.`,
        maxConcurrent: 4,
        configOverrides: { timeoutMs: 2 * 60 * 1000 },
    },
    browser: {
        typeId: 'browser',
        displayName: 'Agente Browser',
        allowedSkillCategories: ['browser'],
        systemPromptExtra: `Voce e um agente especializado em controle do navegador Chrome.
Use browser_get_state para ver elementos antes de agir.
Use browser_click, browser_fill, browser_type, browser_press para interacoes diretas.
Use browser_navigate para navegar a URLs.
Use browser_wait para aguardar elementos.
Use browser_auto_task APENAS quando a pagina e complexa demais para skills atomicas.`,
        maxConcurrent: 1,
        requiresBrowser: true,
        configOverrides: { timeoutMs: 5 * 60 * 1000 },
    },
    os: {
        typeId: 'os',
        displayName: 'Agente OS',
        allowedSkillCategories: ['os', 'pc'],
        systemPromptExtra: `Voce e um agente especializado em operacoes do sistema operacional.
Use os_listar para ver pastas, os_buscar para procurar arquivos/duplicados, os_arquivos para ler/grep/info, os_mover para mover/copiar/renomear/criar pastas, os_deletar para apagar com Lixeira/confirmacao, os_tamanho para medir espaco, os_clipboard para area de transferencia e os_sistema para info/pastas/abrir/processos.
Use terminal_executar somente como ultimo recurso para shell e comandos de desenvolvimento (pip, python, git, npm, scripts). Nao use terminal para operacoes comuns de arquivo quando existir skill os_* especifica.`,
        configOverrides: { timeoutMs: 60 * 1000 },
    },
};

export function getAgentSpec(typeId: AgentTypeId): AgentSpec {
    return AGENT_TYPES[typeId] || AGENT_TYPES['general']!;
}

export function listAgentTypes(): AgentSpec[] {
    return Object.values(AGENT_TYPES);
}

export function getAgentTypeIds(): AgentTypeId[] {
    return Object.keys(AGENT_TYPES) as AgentTypeId[];
}

export function registerAgentType(spec: AgentSpec): void {
    AGENT_TYPES[spec.typeId] = spec;
    const general = AGENT_TYPES['general'];
    if (general) {
        for (const cat of spec.allowedSkillCategories) {
            if (!general.allowedSkillCategories.includes(cat)) {
                general.allowedSkillCategories.push(cat);
            }
        }
    }
    console.log(`[AgentTypes] Registrado: ${spec.typeId} (${spec.displayName})`);
}

export function unregisterAgentType(typeId: string): void {
    if (typeId === 'general') return;
    delete AGENT_TYPES[typeId];
    console.log(`[AgentTypes] Removido: ${typeId}`);
}
