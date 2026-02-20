/**
 * Lex Agent Critic
 *
 * Revisor semântico para aprovar, ajustar ou bloquear ações antes da execução.
 */

import { AgentConfig, AgentState, CriticDecision } from './types';

interface PlannedSkillAction {
    skill: string;
    parametros: Record<string, any>;
}

const HIGH_RISK_KEYWORDS = [
    'protocol',
    'protocolo',
    'peticion',
    'enviar',
    'submit',
    'assinar',
    'finalizar',
    'excluir',
    'delete',
    'remover'
];

/**
 * Skills de leitura que não precisam de LLM review.
 * Apenas heurísticas são suficientes para aprovação.
 */
const READ_ONLY_SKILLS = new Set([
    'pje_consultar',
    'pje_movimentacoes',
    'pje_documentos',
    'pesquisa_jurisprudencia',
    'doc_analisar',
    'util_calcular_prazo'
]);

/**
 * Avalia a ação planejada antes da execução.
 */
export async function critic(
    state: AgentState,
    action: PlannedSkillAction,
    config: AgentConfig
): Promise<CriticDecision> {
    const heuristicDecision = runHeuristics(state, action);

    // Heurística já detectou bloqueio/confirmação obrigatória.
    if (!heuristicDecision.approved || heuristicDecision.requiresUserConfirmation) {
        return heuristicDecision;
    }

    // B2: Skip LLM review para skills de leitura (economia ~40-50% de chamadas Critic)
    const skillLowerName = String(action.skill || '').toLowerCase();
    if (READ_ONLY_SKILLS.has(skillLowerName) && heuristicDecision.approved) {
        console.log(`[Critic] Skip LLM review — skill de leitura: ${action.skill}`);
        return { ...heuristicDecision, reason: 'Skill de leitura — aprovada sem LLM review.' };
    }

    try {
        const llmDecision = await runLlmCritic(state, action, config);
        return mergeDecisions(heuristicDecision, llmDecision);
    } catch (error: any) {
        console.warn('[Critic] Falha no review por LLM, mantendo decisão heurística:', error?.message || error);
        return heuristicDecision;
    }
}

function runHeuristics(state: AgentState, action: PlannedSkillAction): CriticDecision {
    const skillLower = String(action.skill || '').toLowerCase();
    const paramsJson = JSON.stringify(action.parametros || {}).toLowerCase();
    const highRisk = HIGH_RISK_KEYWORDS.some(keyword => skillLower.includes(keyword) || paramsJson.includes(keyword));

    if (highRisk) {
        return {
            approved: true,
            riskLevel: 'high',
            reason: 'A ação pode gerar efeito irreversível e precisa de confirmação explícita do usuário.',
            requiresUserConfirmation: true,
            suggestedQuestion: `A ação "${action.skill}" tem risco alto. Deseja confirmar a execução?`
        };
    }

    if (skillLower.startsWith('pje_') && !hasProcessReference(state, action.parametros)) {
        return {
            approved: false,
            riskLevel: 'medium',
            reason: 'Skill de PJe sem referência clara de processo no contexto ou nos parâmetros.',
            suggestedQuestion: 'Qual o número do processo que devo usar antes de executar esta ação?'
        };
    }

    if (skillLower === 'doc_gerar' && !state.contexto.processo && !isObject(action.parametros?.['processo'])) {
        return {
            approved: false,
            riskLevel: 'medium',
            reason: 'Geração de documento sem dados mínimos do processo.',
            suggestedQuestion: 'Preciso dos dados do processo para gerar o documento. Deseja consultar o processo primeiro?'
        };
    }

    return {
        approved: true,
        riskLevel: 'low',
        reason: 'Ação consistente com as regras básicas de segurança e contexto.'
    };
}

function hasProcessReference(state: AgentState, parametros: Record<string, any>): boolean {
    if (state.contexto.processo?.numero) return true;
    if (!parametros || typeof parametros !== 'object') return false;

    const directNumber = toNonEmptyString(parametros['numero'])
        || toNonEmptyString(parametros['processNumber'])
        || toNonEmptyString(parametros['processoNumero']);
    if (directNumber) return true;

    if (isObject(parametros['processo'])) {
        const nestedProcess = parametros['processo'] as Record<string, any>;
        const nestedNumber = toNonEmptyString(nestedProcess['numero'])
            || toNonEmptyString(nestedProcess['processNumber']);
        if (nestedNumber) return true;
    }

    return false;
}

async function runLlmCritic(
    state: AgentState,
    action: PlannedSkillAction,
    config: AgentConfig
): Promise<CriticDecision> {
    const { callAI } = await import('../ai-handler');
    const response = await callAI({
        system: buildCriticSystemPrompt(),
        user: buildCriticUserPrompt(state, action),
        temperature: config.criticTemperature ?? 0.1,
        ...(config.criticModel ? { model: config.criticModel } : (config.model ? { model: config.model } : {}))
    });

    return parseCriticResponse(response);
}

function buildCriticSystemPrompt(): string {
    return `Você é o "Critic" da Lex, responsável por revisão semântica antes de qualquer execução.

Sua função:
- validar se a ação faz sentido para o objetivo do usuário;
- identificar riscos operacionais/jurídicos;
- pedir confirmação humana quando necessário;
- sugerir correção simples quando houver erro de direção.

Responda APENAS JSON no formato:
{
  "approved": true | false,
  "riskLevel": "low" | "medium" | "high",
  "reason": "explicação curta",
  "requiresUserConfirmation": true | false,
  "suggestedQuestion": "pergunta ao usuário quando faltar contexto ou confirmação",
  "correctedDecision": {
    "skill": "nome_da_skill",
    "parametros": {}
  }
}

Regras:
- Se a ação for incoerente, approved=false.
- Se houver risco alto, requiresUserConfirmation=true.
- correctedDecision é opcional e só deve aparecer quando a correção for clara.`;
}

function buildCriticUserPrompt(state: AgentState, action: PlannedSkillAction): string {
    const contexto = {
        objetivo: state.objetivo,
        processo: state.contexto.processo || null,
        documentos: state.contexto.documentos.slice(0, 5).map(d => ({ id: d.id, nome: d.nome, tipo: d.tipo })),
        resultadosRecentes: getRecentSkillResults(state),
        acaoPlanejada: action
    };

    return `Avalie a ação planejada abaixo:\n\n${JSON.stringify(contexto, null, 2)}`;
}

function getRecentSkillResults(state: AgentState): Array<{ skill?: string; sucesso: boolean; erro?: string }> {
    const recent = state.passos
        .filter(step => step.tipo === 'observe')
        .slice(-3)
        .map(step => {
            const item: { skill?: string; sucesso: boolean; erro?: string } = {
                sucesso: Boolean(step.resultado?.sucesso)
            };
            const skill = findSkillForObserve(state, step.timestamp);
            if (skill) {
                item.skill = skill;
            }
            if (step.resultado?.erro) {
                item.erro = step.resultado.erro;
            }
            return item;
        });

    return recent;
}

function findSkillForObserve(state: AgentState, observeTimestamp: string): string | undefined {
    const idx = state.passos.findIndex(step => step.timestamp === observeTimestamp && step.tipo === 'observe');
    if (idx <= 0) return undefined;
    for (let i = idx - 1; i >= 0; i--) {
        if (state.passos[i]?.tipo === 'act') {
            return state.passos[i]?.skill;
        }
    }
    return undefined;
}

function parseCriticResponse(response: string): CriticDecision {
    const jsonStr = extractJsonObject(response);
    const parsed = JSON.parse(jsonStr) as any;

    const decision: CriticDecision = {
        approved: Boolean(parsed?.approved),
        riskLevel: normalizeRiskLevel(parsed?.riskLevel),
        reason: toNonEmptyString(parsed?.reason) || 'Sem justificativa explícita do critic.'
    };

    if (parsed?.requiresUserConfirmation === true) {
        decision.requiresUserConfirmation = true;
    }

    const suggestedQuestion = toNonEmptyString(parsed?.suggestedQuestion);
    if (suggestedQuestion) {
        decision.suggestedQuestion = suggestedQuestion;
    }

    const corrected = parsed?.correctedDecision;
    if (isObject(corrected)) {
        const correctedSkill = toNonEmptyString((corrected as Record<string, any>)['skill']);
        if (correctedSkill) {
            const correctedDecision: { skill: string; parametros?: Record<string, any> } = {
                skill: correctedSkill
            };
            if (isObject((corrected as Record<string, any>)['parametros'])) {
                correctedDecision.parametros = (corrected as Record<string, any>)['parametros'] as Record<string, any>;
            }
            decision.correctedDecision = correctedDecision;
        }
    }

    return decision;
}

function extractJsonObject(raw: string): string {
    const text = String(raw || '').trim();
    const fenced = text.match(/```json\s*([\s\S]*?)\s*```/i) || text.match(/```\s*([\s\S]*?)\s*```/i);
    if (fenced && fenced[1]) return fenced[1].trim();

    const first = text.indexOf('{');
    const last = text.lastIndexOf('}');
    if (first >= 0 && last > first) {
        return text.slice(first, last + 1);
    }

    throw new Error('Resposta do critic sem JSON válido');
}

function mergeDecisions(base: CriticDecision, llm: CriticDecision): CriticDecision {
    const merged: CriticDecision = {
        approved: base.approved && llm.approved,
        riskLevel: maxRisk(base.riskLevel, llm.riskLevel),
        reason: llm.reason || base.reason
    };

    if (base.requiresUserConfirmation || llm.requiresUserConfirmation) {
        merged.requiresUserConfirmation = true;
    }

    const suggestedQuestion = llm.suggestedQuestion || base.suggestedQuestion;
    if (suggestedQuestion) {
        merged.suggestedQuestion = suggestedQuestion;
    }

    if (llm.correctedDecision) {
        merged.correctedDecision = llm.correctedDecision;
    }

    return merged;
}

function normalizeRiskLevel(value: unknown): 'low' | 'medium' | 'high' {
    const risk = toNonEmptyString(value)?.toLowerCase();
    if (risk === 'low' || risk === 'medium' || risk === 'high') return risk;
    return 'medium';
}

function maxRisk(a: 'low' | 'medium' | 'high', b: 'low' | 'medium' | 'high'): 'low' | 'medium' | 'high' {
    const order = { low: 1, medium: 2, high: 3 };
    return order[a] >= order[b] ? a : b;
}

function toNonEmptyString(value: unknown): string | null {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
}

function isObject(value: unknown): value is Record<string, any> {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
