/**
 * Lex Prompt-Layer Integration
 *
 * Traduz TenantConfig em System Prompt dinâmico.
 * Cada configuração vira instrução para a IA.
 */

import { TenantConfig } from './types';

/**
 * Constrói system prompt a partir da config do tenant
 */
export function buildPromptLayerSystem(config: TenantConfig): string {
    const sections: string[] = [];

    // 1. Identidade
    sections.push(buildIdentity(config));

    // 2. Comportamento
    sections.push(buildBehavior(config));

    // 3. Especialização
    sections.push(buildSpecialization(config));

    // 4. Políticas
    sections.push(buildPolicies(config));

    // 5. Regras imutáveis
    sections.push(buildCoreRules());

    return sections.filter(Boolean).join('\n\n---\n\n');
}

/**
 * Seção de Identidade
 */
function buildIdentity(config: TenantConfig): string {
    const { identity } = config;

    return `# Identidade

Você é **${identity.agentName}**, assistente jurídica virtual do escritório **${identity.firmName}**.

Quando o usuário iniciar conversa, cumprimente com: "${identity.greeting}"

Sempre se refira a si mesma como ${identity.agentName}.`;
}

/**
 * Seção de Comportamento
 */
function buildBehavior(config: TenantConfig): string {
    const { behavior } = config;

    const styleMap: Record<string, string> = {
        formal: 'Use linguagem formal e técnica. Evite coloquialismos. Trate o usuário por "Senhor(a)" ou "Doutor(a)".',
        semiformal: 'Use linguagem profissional mas acessível. Trate o usuário por "você" de forma respeitosa.',
        informal: 'Use linguagem amigável e próxima. Seja como um colega de confiança.'
    };

    const techMap: Record<string, string> = {
        leigo: 'Explique TODOS os termos técnicos. Use analogias do dia-a-dia. Evite juridiquês.',
        basico: 'Explique termos técnicos complexos. Use linguagem acessível.',
        tecnico: 'Pode usar terminologia jurídica padrão. Explique apenas termos muito específicos.',
        avancado: 'Use linguagem técnica completa. O usuário é especialista.'
    };

    const toneMap: Record<string, string> = {
        neutro: 'Mantenha tom neutro e objetivo. Foque nos fatos.',
        empatico: 'Seja acolhedor. Demonstre compreensão antes de análises técnicas. Use "entendo que..." e "compreendo sua preocupação".',
        assertivo: 'Seja direto e confiante. Dê recomendações claras.',
        didatico: 'Explique passo a passo. Use exemplos. Pergunte se ficou claro.'
    };

    const depthMap: Record<string, string> = {
        resumido: 'Seja conciso. Máximo 3-4 parágrafos. Vá direto ao ponto.',
        normal: 'Forneça análise equilibrada. Inclua fundamentação essencial.',
        detalhado: 'Forneça análise completa. Inclua fundamentação legal, jurisprudência relevante.',
        exaustivo: 'Análise exaustiva. Inclua todas as teses possíveis, jurisprudência ampla, riscos detalhados.'
    };

    return `# Comportamento

## Estilo de Comunicação
${styleMap[behavior.style] || styleMap['semiformal']}

## Nível Técnico
${techMap[behavior.techLevel] || techMap['basico']}

## Tom
${toneMap[behavior.tone] || toneMap['neutro']}

## Profundidade das Respostas
${depthMap[behavior.depth] || depthMap['normal']}`;
}

/**
 * Seção de Especialização
 */
function buildSpecialization(config: TenantConfig): string {
    const { specialization } = config;

    if (!specialization.areas || specialization.areas.length === 0) {
        return '';
    }

    const areasText = specialization.areas
        .map(area => areaToText(area))
        .filter(Boolean)
        .join(', ');

    const tribunaisText = specialization.tribunals?.join(', ') || 'Todos';

    const conhecimentos = specialization.areas
        .map(area => `- ${areaToKnowledge(area)}`)
        .filter(Boolean)
        .join('\n');

    return `# Especialização

Você é especialista em: ${areasText}.

Tribunais de atuação prioritária: ${tribunaisText}.

Ao analisar casos, priorize:
${conhecimentos}`;
}

/**
 * Converte código de área para texto legível
 */
function areaToText(area: string): string {
    const map: Record<string, string> = {
        trabalhista: 'Direito do Trabalho',
        previdenciario: 'Direito Previdenciário',
        civil: 'Direito Civil',
        familia: 'Direito de Família',
        consumidor: 'Direito do Consumidor',
        empresarial: 'Direito Empresarial',
        tributario: 'Direito Tributário',
        penal: 'Direito Penal',
        administrativo: 'Direito Administrativo'
    };
    return map[area] || area;
}

/**
 * Converte área para conhecimento específico
 */
function areaToKnowledge(area: string): string {
    const map: Record<string, string> = {
        trabalhista: 'CLT, súmulas do TST, jurisprudência dos TRTs',
        previdenciario: 'Lei 8.213/91, IN INSS, súmulas da TNU',
        civil: 'Código Civil, CPC, jurisprudência do STJ',
        familia: 'Código Civil (família), ECA, jurisprudência',
        consumidor: 'CDC, jurisprudência do STJ em consumidor',
        empresarial: 'Lei das S/A, Código Civil empresarial, recuperação judicial',
        tributario: 'CTN, jurisprudência do STF/STJ em tributário',
        penal: 'Código Penal, CPP, jurisprudência do STF/STJ',
        administrativo: 'Lei 8.112, Lei 9.784, jurisprudência'
    };
    return map[area] || '';
}

/**
 * Seção de Políticas do Escritório
 */
function buildPolicies(config: TenantConfig): string {
    const { policies } = config;
    const rules: string[] = [];

    if (policies.preferSettlement) {
        rules.push('- Sempre mencione a possibilidade de acordo/negociação antes de recomendar ação judicial');
        rules.push('- Destaque vantagens de resolução consensual (tempo, custo, desgaste)');
    }

    if (policies.forbiddenPhrases && policies.forbiddenPhrases.length > 0) {
        const frases = policies.forbiddenPhrases.map(p => `"${p}"`).join(', ');
        rules.push(`- NUNCA use estas frases: ${frases}`);
    }

    if (policies.disclaimer) {
        rules.push(`- Inclua este disclaimer quando der orientações: "${policies.disclaimer}"`);
    }

    if (rules.length === 0) {
        return '';
    }

    return `# Políticas do Escritório

${rules.join('\n')}`;
}

/**
 * Regras imutáveis (sempre incluídas)
 */
function buildCoreRules(): string {
    return `# Regras Fundamentais (Imutáveis)

## Ética e Compliance
- NUNCA forneça orientação que viole o Código de Ética da OAB
- NUNCA garanta resultados específicos de processos
- NUNCA oriente sobre práticas ilegais ou antiéticas
- Sempre recomende consulta presencial para decisões importantes

## Precisão
- NUNCA invente informações, dados ou jurisprudência
- Se não tem certeza, diga claramente
- Cite fontes quando possível (artigos de lei, súmulas)

## Segurança
- NUNCA revele informações de outros clientes ou processos
- Respeite sigilo profissional advocatício

## Limitações
- Você é uma assistente, não substitui advogado
- Suas análises são auxiliares, não pareceres definitivos
- Sempre indique que o advogado responsável deve validar`;
}

/**
 * Carrega config de tenant de arquivo JSON
 */
export async function loadTenantConfig(tenantId: string): Promise<TenantConfig | null> {
    const fs = await import('fs').then(m => m.promises);
    const path = await import('path');

    const configPath = path.join(__dirname, '../../config/tenants', `${tenantId}.json`);

    try {
        const content = await fs.readFile(configPath, 'utf-8');
        return JSON.parse(content) as TenantConfig;
    } catch (error) {
        console.log(`[PromptLayer] Config não encontrada para tenant: ${tenantId}`);
        return null;
    }
}

/**
 * Retorna config padrão
 */
export function getDefaultTenantConfig(): TenantConfig {
    return {
        identity: {
            tenantId: 'default',
            agentName: 'Lex',
            firmName: 'Seu Escritório',
            greeting: 'Olá! Sou a Lex, sua assistente jurídica. Como posso ajudar?'
        },
        behavior: {
            style: 'semiformal',
            techLevel: 'basico',
            tone: 'empatico',
            depth: 'normal'
        },
        specialization: {
            areas: [],
            tribunals: []
        },
        policies: {
            preferSettlement: false,
            forbiddenPhrases: []
        },
        features: {
            pjeAutomation: true,
            documentGeneration: true,
            jurisprudenceSearch: true
        }
    };
}
