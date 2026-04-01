/**
 * Agent Type Registry (Phase 1 AIOS)
 *
 * Define os tipos de agentes especializados.
 * Cada AgentSpec é uma configuração — a execução usa o mesmo runAgentLoop,
 * mas com skills filtradas e prompt customizado.
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
        systemPromptExtra: `Você é um agente especializado em automação do PJe (Processo Judicial Eletrônico).
Use browser_get_state antes de interagir — veja os seletores disponíveis.
Prefira browser_click, browser_fill, browser_type (atômicos e rápidos) a pje_agir (lento, usa visão).
Use pje_agir APENAS quando os seletores não são claros ou a tela é desconhecida.
Use pje_abrir para garantir que o Chrome está no PJe.`,
        configOverrides: { enableCritic: true },
    },
    document: {
        typeId: 'document',
        displayName: 'Agente de Documentos',
        allowedSkillCategories: ['documentos', 'os'],
        systemPromptExtra: `Você é um agente especializado em análise e geração de documentos jurídicos.
Seu foco é ler, analisar, gerar e salvar documentos.
Use os_arquivos para ler arquivos do disco e doc_gerar para criar documentos.`,
    },
    research: {
        typeId: 'research',
        displayName: 'Agente de Pesquisa',
        allowedSkillCategories: ['pesquisa', 'browser', 'os'],
        systemPromptExtra: `Você é um agente especializado em pesquisa jurídica e jurisprudência.
Seu foco é buscar jurisprudência, consultar legislação e pesquisar na web.
Use pesquisa_jurisprudencia para buscar decisões e os_fetch para consultar fontes externas.`,
    },
    browser: {
        typeId: 'browser',
        displayName: 'Agente Browser',
        allowedSkillCategories: ['browser'],
        systemPromptExtra: `Você é um agente especializado em controle do navegador Chrome.
Use browser_get_state para ver elementos antes de agir.
Use browser_click, browser_fill, browser_type, browser_press para interações diretas.
Use browser_navigate para navegar a URLs.
Use browser_wait para aguardar elementos.
Use browser_auto_task APENAS quando a página é complexa demais para skills atômicas.`,
    },
    os: {
        typeId: 'os',
        displayName: 'Agente OS',
        allowedSkillCategories: ['os', 'pc'],
        systemPromptExtra: `Você é um agente especializado em operações do sistema operacional.
Use skills os_* para manipular arquivos, clipboard, processos e comandos do sistema.
Use terminal_executar para executar comandos shell com saída em tempo real (pip, python, git, npm, scripts, etc).`,
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

/** Registra novo tipo de agente (usado por plugins) */
export function registerAgentType(spec: AgentSpec): void {
    AGENT_TYPES[spec.typeId] = spec;
    // Atualiza o 'general' para incluir a nova categoria
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

/** Remove tipo de agente (usado ao desconectar plugin) */
export function unregisterAgentType(typeId: string): void {
    if (typeId === 'general') return; // nunca remove o general
    delete AGENT_TYPES[typeId];
    console.log(`[AgentTypes] Removido: ${typeId}`);
}
