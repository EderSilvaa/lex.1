/**
 * Dual-Agent Validator (P3c AIOS — padrão MassGen)
 *
 * Para ações de alto risco (protocolar petição, assinar documento, prazo crítico),
 * dois modelos independentes analisam a ação. Concordam → executa. Discordam → escala ao usuário.
 *
 * Princípio: "measure twice, cut once" aplicado a automação jurídica.
 */

import type { ThinkDecision, CriticDecision, AgentContext } from './types';

// ─────────────────────────────────────────────────────────────────────────────

export interface ValidationRequest {
    /** Decisão original do agent loop (think.ts) */
    decision: ThinkDecision;
    /** Contexto do agente (processo, documentos, etc.) */
    context: AgentContext;
    /** Objetivo original do usuário */
    goal: string;
}

export interface ValidationResult {
    /** Ambos concordam → approved. Discordam → rejected (escala ao usuário). */
    approved: boolean;
    /** Nível de confiança combinado (0-1) */
    confidence: number;
    /** Modelo primário */
    primaryVerdict: AgentVerdict;
    /** Modelo secundário */
    secondaryVerdict: AgentVerdict;
    /** Razão humana para a decisão */
    reason: string;
}

interface AgentVerdict {
    model: string;
    approved: boolean;
    confidence: number;
    reasoning: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Detecção de ações de alto risco
// ─────────────────────────────────────────────────────────────────────────────

/** Skills que exigem validação dual-agent */
const HIGH_RISK_SKILLS = new Set([
    'pje_protocolar',
    'pje_assinar',
    'pje_peticionar',
    'pje_juntar_documento',
    'pje_agir',             // pje_agir pode fazer ações irreversíveis
]);

/** Padrões textuais que indicam risco na instrução */
const HIGH_RISK_PATTERNS = [
    /protocola/i,
    /assina/i,
    /peticiona/i,
    /junta.*documento/i,
    /envia.*peti[cç][aã]o/i,
    /prazo.*venc/i,
    /prazo.*fatal/i,
    /desist/i,               // desistência de ação
    /renunci/i,              // renúncia
    /acordo.*homolog/i,      // homologação de acordo
];

/**
 * Detecta se uma ação requer validação dual-agent.
 */
export function requiresDualValidation(decision: ThinkDecision): boolean {
    if (decision.tipo !== 'skill') return false;

    // Skill explicitamente de alto risco
    if (decision.skill && HIGH_RISK_SKILLS.has(decision.skill)) {
        return true;
    }

    // Padrão textual indica risco
    const text = `${decision.pensamento || ''} ${decision.skill || ''} ${JSON.stringify(decision.parametros || {})}`;
    return HIGH_RISK_PATTERNS.some(p => p.test(text));
}

// ─────────────────────────────────────────────────────────────────────────────
// Validação
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Executa validação dual-agent.
 * Chama 2 modelos com prompts independentes e compara os vereditos.
 */
export async function validateWithDualAgent(
    request: ValidationRequest
): Promise<ValidationResult> {
    const { callAI } = await import('../ai-handler');
    const { getActiveConfig } = await import('../provider-config');

    const config = getActiveConfig();
    const primaryModel = config.agentModel;

    // Modelo secundário: mesmo modelo, temperature diferente para diversidade de análise
    const secondaryModel = primaryModel;

    const validationPrompt = buildValidationPrompt(request);

    // Executa ambas as validações em paralelo
    const [primaryResponse, secondaryResponse] = await Promise.all([
        callAI({
            system: validationPrompt.system,
            user: validationPrompt.user,
            model: primaryModel,
            temperature: 0.1,
            maxTokens: 800,
        }).catch(err => `ERRO: ${err.message}`),

        callAI({
            system: validationPrompt.system,
            user: validationPrompt.user,
            model: secondaryModel,
            temperature: 0.3, // Temperature diferente para diversidade
            maxTokens: 800,
        }).catch(err => `ERRO: ${err.message}`),
    ]);

    const primaryVerdict = parseVerdict(primaryResponse, primaryModel);
    const secondaryVerdict = parseVerdict(secondaryResponse, secondaryModel);

    // Decisão: ambos devem concordar para aprovar
    const bothApprove = primaryVerdict.approved && secondaryVerdict.approved;
    const combinedConfidence = (primaryVerdict.confidence + secondaryVerdict.confidence) / 2;

    let reason: string;
    if (bothApprove) {
        reason = `Ambos os modelos aprovaram a ação (confiança: ${(combinedConfidence * 100).toFixed(0)}%).`;
    } else if (!primaryVerdict.approved && !secondaryVerdict.approved) {
        reason = `Ambos os modelos rejeitaram a ação. ${primaryVerdict.reasoning}`;
    } else {
        const disagreer = !primaryVerdict.approved ? 'primário' : 'secundário';
        const disagreerVerdict = !primaryVerdict.approved ? primaryVerdict : secondaryVerdict;
        reason = `Modelos discordaram (${disagreer} rejeitou): ${disagreerVerdict.reasoning}`;
    }

    console.log(`[DualValidator] primary=${primaryVerdict.approved} secondary=${secondaryVerdict.approved} → ${bothApprove ? 'APROVADO' : 'REJEITADO'}`);

    return {
        approved: bothApprove,
        confidence: combinedConfidence,
        primaryVerdict,
        secondaryVerdict,
        reason,
    };
}

/**
 * Converte o resultado da validação dual em CriticDecision para integrar com o agent loop.
 */
export function validationToCriticDecision(
    validation: ValidationResult,
    originalDecision: ThinkDecision
): CriticDecision {
    if (validation.approved) {
        return {
            approved: true,
            riskLevel: 'high',
            reason: validation.reason,
        };
    }

    return {
        approved: false,
        riskLevel: 'high',
        reason: validation.reason,
        requiresUserConfirmation: true,
        suggestedQuestion: `Ação de alto risco detectada: ${originalDecision.skill}.\n\n` +
            `${validation.reason}\n\n` +
            `Deseja prosseguir mesmo assim?`,
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// Prompts e parsing
// ─────────────────────────────────────────────────────────────────────────────

function buildValidationPrompt(request: ValidationRequest): { system: string; user: string } {
    const { decision, context, goal } = request;

    const processoInfo = context.processo
        ? `Processo: ${context.processo.numero} (${context.processo.tribunal})\nClasse: ${context.processo.classe}\nPartes: ${context.processo.partes.autor.join(', ')} vs ${context.processo.partes.reu.join(', ')}`
        : 'Nenhum processo no contexto.';

    const system = `# Validador de Ações Jurídicas de Alto Risco

Você é um validador independente que analisa ações no PJe ANTES de serem executadas.
Sua responsabilidade é identificar riscos e prevenir erros irreversíveis.

## Critérios de REJEIÇÃO (qualquer um = rejeitar):
1. Falta de dados essenciais (número do processo, partes, valores incorretos)
2. Ação não corresponde ao objetivo do usuário
3. Parâmetros inconsistentes ou incompletos
4. Risco de dano processual (prazo, juntada errada, petição no processo errado)
5. Ação irreversível sem confirmação explícita do usuário

## Critérios de APROVAÇÃO (todos devem ser atendidos):
1. A ação é coerente com o objetivo do usuário
2. Os parâmetros estão completos e corretos
3. O processo/documento alvo está identificado
4. Não há risco evidente de dano processual

Responda APENAS com JSON:
\`\`\`json
{
    "approved": true/false,
    "confidence": 0.0-1.0,
    "reasoning": "explicação breve"
}
\`\`\``;

    const user = `## Objetivo do Usuário
"${goal}"

## Contexto
${processoInfo}

## Ação Proposta
Skill: ${decision.skill}
Parâmetros: ${JSON.stringify(decision.parametros || {}, null, 2)}

## Raciocínio do Agente
${decision.pensamento}

Analise e valide. Responda APENAS com JSON.`;

    return { system, user };
}

function parseVerdict(response: string, model: string): AgentVerdict {
    try {
        const jsonMatch = response.match(/```json\s*([\s\S]*?)\s*```/)
            || response.match(/\{[\s\S]*\}/);

        if (!jsonMatch) throw new Error('Sem JSON');

        const parsed = JSON.parse(jsonMatch[1] || jsonMatch[0]);

        return {
            model,
            approved: Boolean(parsed.approved),
            confidence: typeof parsed.confidence === 'number'
                ? Math.max(0, Math.min(1, parsed.confidence))
                : 0.5,
            reasoning: String(parsed.reasoning || parsed.reason || ''),
        };
    } catch {
        // Se não conseguiu parsear, rejeita por segurança
        console.warn(`[DualValidator] Falha ao parsear resposta do ${model}, rejeitando por precaução`);
        return {
            model,
            approved: false,
            confidence: 0,
            reasoning: response.startsWith('ERRO:')
                ? response
                : 'Falha ao validar — rejeitado por precaução.',
        };
    }
}
