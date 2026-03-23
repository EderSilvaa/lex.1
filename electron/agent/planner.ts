/**
 * Planner (Phase 1 AIOS)
 *
 * Usa o LLM para decompor um objetivo complexo em subtasks.
 * Cada subtask é atribuída a um tipo de agente especializado.
 */

import { randomUUID } from 'crypto';
import { Plan, SubTask, AgentTypeId } from './types';
import { listAgentTypes } from './agent-types';

/**
 * Cria um plano decompondo o objetivo em subtasks via LLM.
 */
export async function createPlan(goal: string): Promise<Plan> {
    const { callAI } = await import('../ai-handler');

    const systemPrompt = buildPlannerSystemPrompt();
    const userPrompt = `## Objetivo do Usuário\n"${goal}"\n\nDecomponha em subtasks. Responda APENAS com JSON válido.`;

    const response = await callAI({
        system: systemPrompt,
        user: userPrompt,
        temperature: 0.2,
        maxTokens: 2000,
    });

    return await parsePlanResponse(response, goal);
}

/**
 * Heurística: objetivo precisa de planner (composto) ou é simples (direto)?
 */
export function shouldUsePlanner(objetivo: string): boolean {
    const lower = objetivo.toLowerCase().trim();

    // Muito curto = simples
    if (lower.length < 30) return false;

    // Indicadores de composição
    const compositeIndicators = [
        /\be\s+(depois|também|em seguida|após|ainda)\b/,   // "e depois", "e também"
        /,\s*(depois|também|e)\s/,                          // vírgula + conjunção
        /\bprimeiro\b.*\bdepois\b/,                        // "primeiro X depois Y"
        /\b(gere|crie|faça).*\b(com base|usando|a partir)\b/, // composição de dados
        /\bconsulte?.*\be\s+(gere|crie|envie|faça)\b/,     // consulta + ação
        /\bverifique?.*\be\s+(gere|crie|envie|faça|informe)\b/,
        /\bpara\s+cada\b/,                                  // iteração
        /\btodos?\s+os?\b.*\bprocessos?\b/,                 // múltiplos processos
    ];

    return compositeIndicators.some(re => re.test(lower));
}

function buildPlannerSystemPrompt(): string {
    const agentTypes = listAgentTypes();
    const agentList = agentTypes
        .map(a => `- **${a.typeId}** (${a.displayName}): categorias ${a.allowedSkillCategories.join(', ')}`)
        .join('\n');

    return `# Lex Planner — Decompositor de Objetivos

Você é o módulo de planejamento da Lex, assistente jurídica inteligente.
Sua tarefa é decompor um objetivo complexo em subtasks sequenciais/paralelas.

## Tipos de Agente Disponíveis
${agentList}

## Regras
1. Decomponha em 1 a 7 subtasks (pragmático, não excessivo)
2. Cada subtask tem um agentType que determina quais skills o agente terá acesso
3. Use dependsOn para expressar ordem (DAG). Tasks sem dependências rodam em paralelo
4. Se o objetivo é simples (uma ação), retorne apenas 1 subtask com agentType "general"
5. PJe sempre precisa do browser aberto — se precisar de PJe, a primeira subtask deve ser preparação
6. Use "document" para geração/análise de documentos, "research" para pesquisa jurídica
7. Use "general" quando não há especialização clara
8. Descrições devem ser claras e autocontidas — cada agente não vê o objetivo original

## Formato de Resposta (JSON)
\`\`\`json
{
    "subtasks": [
        {
            "id": "t1",
            "description": "Descrição clara do que este agente deve fazer",
            "agentType": "pje",
            "dependsOn": []
        },
        {
            "id": "t2",
            "description": "...",
            "agentType": "document",
            "dependsOn": ["t1"]
        }
    ]
}
\`\`\`

IMPORTANTE: Responda SOMENTE o JSON, sem texto adicional.`;
}

async function parsePlanResponse(response: string, goal: string): Promise<Plan> {
    const planId = randomUUID();

    try {
        // Extrai JSON
        const jsonMatch = response.match(/```json\s*([\s\S]*?)\s*```/)
            || response.match(/```\s*([\s\S]*?)\s*```/)
            || response.match(/\{[\s\S]*\}/);

        if (!jsonMatch) {
            throw new Error('Resposta do planner não contém JSON');
        }

        const jsonStr = jsonMatch[1] || jsonMatch[0];
        const parsed = JSON.parse(jsonStr);

        if (!parsed.subtasks || !Array.isArray(parsed.subtasks) || parsed.subtasks.length === 0) {
            throw new Error('Plano sem subtasks');
        }

        // Valida e normaliza subtasks
        const { getAgentTypeIds } = await import('./agent-types');
        const validAgentTypes = new Set<string>(getAgentTypeIds());

        const subtasks: SubTask[] = parsed.subtasks.map((raw: any, i: number) => ({
            id: raw.id || `t${i + 1}`,
            description: String(raw.description || ''),
            agentType: validAgentTypes.has(raw.agentType) ? raw.agentType as AgentTypeId : 'general',
            params: raw.params || {},
            dependsOn: Array.isArray(raw.dependsOn) ? raw.dependsOn : [],
            status: 'pending' as const,
        }));

        // Valida que dependsOn referencia IDs existentes
        const ids = new Set(subtasks.map(t => t.id));
        for (const task of subtasks) {
            task.dependsOn = task.dependsOn.filter(dep => ids.has(dep));
        }

        return {
            id: planId,
            goal,
            subtasks,
            createdAt: Date.now(),
            status: 'planning',
        };

    } catch (error: any) {
        console.error('[Planner] Erro ao parsear plano:', error.message);
        console.error('[Planner] Resposta raw:', response.substring(0, 500));

        // Fallback: plano com uma única subtask general
        return {
            id: planId,
            goal,
            subtasks: [{
                id: 't1',
                description: goal,
                agentType: 'general',
                dependsOn: [],
                status: 'pending',
            }],
            createdAt: Date.now(),
            status: 'planning',
        };
    }
}
