# Lex Prompt-Layer Architecture

> **Princípio Central**: Alto nível de personalização SEM tocar no core.
> Customização via configuração e prompts, não código.

---

## 1. Os 3 Pilares da Arquitetura

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                             │
│   PILAR 1: CORE INTOCÁVEL                                                  │
│   ════════════════════════                                                  │
│   NUNCA customiza. É o motor que todos usam igual.                         │
│                                                                             │
│   • Engine de IA (Agent Loop)                                              │
│   • Regras legais/jurídicas                                                │
│   • Governança e compliance                                                │
│   • Segurança e autenticação                                               │
│   • Integrações base (PJe, tribunais)                                      │
│   • Skills padrão (consultar, monitorar, peticionar)                       │
│                                                                             │
│   ───────────────────────────────────────────────────────────────────────   │
│                                                                             │
│   PILAR 2: CONFIGURAÇÃO SELF-SERVICE                                       │
│   ════════════════════════════════════                                      │
│   Escritório configura sozinho. Sem código. Painel admin.                  │
│                                                                             │
│   • Tipos de processo habilitados                                          │
│   • Nível de profundidade de análise                                       │
│   • Estilo de linguagem                                                    │
│   • Prioridades e alertas                                                  │
│   • Checklists personalizados                                              │
│   • Templates de output                                                    │
│                                                                             │
│   ───────────────────────────────────────────────────────────────────────   │
│                                                                             │
│   PILAR 3: WHITE LABEL PARCIAL                                             │
│   ════════════════════════════                                              │
│   Só branding. Nada de lógica customizada.                                 │
│                                                                             │
│   • Nome do agente                                                         │
│   • Logo e favicon                                                         │
│   • Paleta de cores                                                        │
│   • Vocabulário (termos preferidos)                                        │
│   • Domínio próprio (futuro)                                               │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. O Cheat Code: Prompt-Layer

### O Segredo

**Toda configuração vira prompt dinamicamente.**

O escritório não sabe que está "programando" - ele só preenche um formulário.
O sistema converte essas configurações em instruções para a IA.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                             │
│   CONFIGURAÇÃO DO USUÁRIO              PROMPT GERADO AUTOMATICAMENTE       │
│   ════════════════════════             ══════════════════════════════       │
│                                                                             │
│   Estilo: "Formal"             →       "Use linguagem formal e técnica.    │
│                                         Evite coloquialismos."              │
│                                                                             │
│   Profundidade: "Detalhada"    →       "Forneça análises completas com     │
│                                         fundamentação legal detalhada."     │
│                                                                             │
│   Área: "Trabalhista"          →       "Você é especialista em Direito     │
│                                         do Trabalho. Priorize CLT,          │
│                                         súmulas TST, jurisprudência TRT."   │
│                                                                             │
│   Tom: "Empático"              →       "Seja acolhedor. Demonstre           │
│                                         compreensão. Use 'entendo que...'   │
│                                         antes de explicações técnicas."     │
│                                                                             │
│   Política: "Acordo primeiro"  →       "Sempre sugira possibilidade de     │
│                                         acordo antes de recomendar ação     │
│                                         judicial. Mencione vantagens."      │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Fluxo do Prompt-Layer

```
┌──────────────────┐
│   CONFIGURAÇÃO   │
│   (JSON/Admin)   │
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│  PROMPT-LAYER    │ ←── Traduz config em instruções
│  (Engine)        │
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│  SYSTEM PROMPT   │ ←── Prompt final montado dinamicamente
│  (Dinâmico)      │
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│   CORE (IA)      │ ←── Recebe prompt e executa
│   (Intocável)    │
└──────────────────┘
```

---

## 3. Schema de Configuração

### TenantConfig (o que o escritório configura)

```typescript
// core/config/tenant-schema.ts

interface TenantConfig {
    // ═══════════════════════════════════════════════════════════════════════
    // IDENTIDADE (White Label)
    // ═══════════════════════════════════════════════════════════════════════
    identity: {
        tenantId: string;
        agentName: string;              // "Lex", "Laura", "Duda"
        firmName: string;               // "Silva & Associados"
        greeting: string;               // "Olá! Como posso ajudar?"
    };

    // ═══════════════════════════════════════════════════════════════════════
    // BRANDING (visual apenas)
    // ═══════════════════════════════════════════════════════════════════════
    branding: {
        logo: string;                   // URL ou base64
        favicon: string;
        colors: {
            primary: string;
            secondary: string;
            accent: string;
        };
    };

    // ═══════════════════════════════════════════════════════════════════════
    // ESPECIALIZAÇÃO (vira prompt)
    // ═══════════════════════════════════════════════════════════════════════
    specialization: {
        areas: AreaDireito[];           // ["trabalhista", "previdenciario"]
        tribunals: string[];            // ["TRT8", "TST"]
        processTypes: string[];         // ["reclamacao_trabalhista"]
    };

    // ═══════════════════════════════════════════════════════════════════════
    // COMPORTAMENTO (vira prompt)
    // ═══════════════════════════════════════════════════════════════════════
    behavior: {
        // Estilo de comunicação
        style: 'formal' | 'semiformal' | 'informal';

        // Nível técnico
        techLevel: 'leigo' | 'basico' | 'tecnico' | 'avancado';

        // Tom emocional
        tone: 'neutro' | 'empatico' | 'assertivo' | 'didatico';

        // Profundidade das análises
        depth: 'resumido' | 'normal' | 'detalhado' | 'exaustivo';

        // Idioma
        language: 'pt-BR';
    };

    // ═══════════════════════════════════════════════════════════════════════
    // POLÍTICAS DO ESCRITÓRIO (vira prompt)
    // ═══════════════════════════════════════════════════════════════════════
    policies: {
        // Preferência de resolução
        preferSettlement: boolean;      // true = sugere acordo primeiro

        // Mencionar histórico do escritório
        mentionTrackRecord: boolean;
        trackRecordText?: string;       // "85% de êxito em acordos"

        // Disclaimer obrigatório
        disclaimer?: string;

        // Frases que NUNCA usar
        forbiddenPhrases: string[];

        // Frases preferidas
        preferredPhrases: string[];
    };

    // ═══════════════════════════════════════════════════════════════════════
    // OUTPUTS (templates de resposta)
    // ═══════════════════════════════════════════════════════════════════════
    outputs: {
        // Formato de análise de processo
        processAnalysis: {
            includeSummary: boolean;
            includeRisks: boolean;
            includeDeadlines: boolean;
            includeRecommendations: boolean;
            includeJurisprudence: boolean;
        };

        // Formato de documentos
        documents: {
            headerTemplate: string;
            footerTemplate: string;
            signatureBlock: string;
        };
    };

    // ═══════════════════════════════════════════════════════════════════════
    // FEATURES HABILITADAS (liga/desliga do core)
    // ═══════════════════════════════════════════════════════════════════════
    features: {
        pjeAutomation: boolean;
        documentGeneration: boolean;
        jurisprudenceSearch: boolean;
        deadlineAlerts: boolean;
        calculators: boolean;
    };

    // ═══════════════════════════════════════════════════════════════════════
    // LIMITES (plano)
    // ═══════════════════════════════════════════════════════════════════════
    limits: {
        users: number;
        monitoredProcesses: number;
        documentsPerMonth: number;
        aiTokensPerMonth: number;
    };
}

type AreaDireito =
    | 'trabalhista'
    | 'previdenciario'
    | 'civil'
    | 'familia'
    | 'consumidor'
    | 'empresarial'
    | 'tributario'
    | 'penal'
    | 'administrativo';
```

---

## 4. Prompt-Layer Engine

### O Motor de Tradução

```typescript
// core/prompt-layer/engine.ts

interface PromptLayerEngine {
    buildSystemPrompt(config: TenantConfig): string;
}

class PromptLayer implements PromptLayerEngine {

    buildSystemPrompt(config: TenantConfig): string {
        const sections: string[] = [];

        // 1. IDENTIDADE (sempre primeiro)
        sections.push(this.buildIdentity(config));

        // 2. ESPECIALIZAÇÃO
        sections.push(this.buildSpecialization(config));

        // 3. COMPORTAMENTO
        sections.push(this.buildBehavior(config));

        // 4. POLÍTICAS
        sections.push(this.buildPolicies(config));

        // 5. OUTPUTS
        sections.push(this.buildOutputs(config));

        // 6. REGRAS CORE (imutáveis, sempre incluídas)
        sections.push(this.buildCoreRules());

        return sections.filter(Boolean).join('\n\n---\n\n');
    }

    // ═══════════════════════════════════════════════════════════════════════
    // BUILDERS: Config → Prompt
    // ═══════════════════════════════════════════════════════════════════════

    private buildIdentity(config: TenantConfig): string {
        const { identity } = config;

        return `
# Identidade

Você é **${identity.agentName}**, assistente jurídica virtual do escritório **${identity.firmName}**.

Quando o usuário iniciar conversa, cumprimente com: "${identity.greeting}"

Sempre se refira a si mesma como ${identity.agentName}.
        `.trim();
    }

    private buildSpecialization(config: TenantConfig): string {
        const { specialization } = config;

        const areasText = specialization.areas
            .map(a => this.areaToText(a))
            .join(', ');

        const tribunalsText = specialization.tribunals.join(', ');

        return `
# Especialização

Você é especialista em: ${areasText}.

Tribunais de atuação: ${tribunalsText}.

Ao analisar casos, priorize:
${specialization.areas.map(a => `- ${this.areaToKnowledge(a)}`).join('\n')}
        `.trim();
    }

    private buildBehavior(config: TenantConfig): string {
        const { behavior } = config;

        const styleMap = {
            formal: 'Use linguagem formal e técnica. Evite coloquialismos. Trate o usuário por "Senhor(a)" ou "Doutor(a)".',
            semiformal: 'Use linguagem profissional mas acessível. Trate o usuário por "você" de forma respeitosa.',
            informal: 'Use linguagem amigável e próxima. Seja como um colega de confiança.'
        };

        const techMap = {
            leigo: 'Explique TODOS os termos técnicos. Use analogias do dia-a-dia. Evite juridiquês.',
            basico: 'Explique termos técnicos complexos. Use linguagem acessível.',
            tecnico: 'Pode usar terminologia jurídica padrão. Explique apenas termos muito específicos.',
            avancado: 'Use linguagem técnica completa. O usuário é especialista.'
        };

        const toneMap = {
            neutro: 'Mantenha tom neutro e objetivo. Foque nos fatos.',
            empatico: 'Seja acolhedor. Demonstre compreensão antes de análises técnicas. Use "entendo que..." e "compreendo sua preocupação".',
            assertivo: 'Seja direto e confiante. Dê recomendações claras.',
            didatico: 'Explique passo a passo. Use exemplos. Pergunte se ficou claro.'
        };

        const depthMap = {
            resumido: 'Seja conciso. Máximo 3-4 parágrafos. Vá direto ao ponto.',
            normal: 'Forneça análise equilibrada. Inclua fundamentação essencial.',
            detalhado: 'Forneça análise completa. Inclua fundamentação legal, jurisprudência relevante.',
            exaustivo: 'Análise exaustiva. Inclua todas as teses possíveis, jurisprudência ampla, riscos detalhados.'
        };

        return `
# Comportamento

## Estilo de Comunicação
${styleMap[behavior.style]}

## Nível Técnico
${techMap[behavior.techLevel]}

## Tom
${toneMap[behavior.tone]}

## Profundidade
${depthMap[behavior.depth]}
        `.trim();
    }

    private buildPolicies(config: TenantConfig): string {
        const { policies } = config;
        const rules: string[] = [];

        if (policies.preferSettlement) {
            rules.push('- Sempre mencione a possibilidade de acordo/negociação antes de recomendar ação judicial');
            rules.push('- Destaque vantagens de resolução consensual (tempo, custo, desgaste)');
        }

        if (policies.mentionTrackRecord && policies.trackRecordText) {
            rules.push(`- Quando relevante, mencione: "${policies.trackRecordText}"`);
        }

        if (policies.forbiddenPhrases.length > 0) {
            rules.push(`- NUNCA use estas frases: ${policies.forbiddenPhrases.map(p => `"${p}"`).join(', ')}`);
        }

        if (policies.preferredPhrases.length > 0) {
            rules.push(`- Prefira usar: ${policies.preferredPhrases.map(p => `"${p}"`).join(', ')}`);
        }

        if (policies.disclaimer) {
            rules.push(`- Inclua este disclaimer quando der orientações: "${policies.disclaimer}"`);
        }

        if (rules.length === 0) {
            return '';
        }

        return `
# Políticas do Escritório

${rules.join('\n')}
        `.trim();
    }

    private buildOutputs(config: TenantConfig): string {
        const { outputs } = config;
        const analysis = outputs.processAnalysis;

        const sections: string[] = [];

        if (analysis.includeSummary) sections.push('Resumo executivo');
        if (analysis.includeRisks) sections.push('Análise de riscos');
        if (analysis.includeDeadlines) sections.push('Prazos importantes');
        if (analysis.includeRecommendations) sections.push('Recomendações');
        if (analysis.includeJurisprudence) sections.push('Jurisprudência relevante');

        return `
# Formato de Outputs

Ao analisar processos, estruture a resposta com:
${sections.map((s, i) => `${i + 1}. ${s}`).join('\n')}

Ao gerar documentos:
- Cabeçalho: ${outputs.documents.headerTemplate || '[Nome do Cliente] - [Número do Processo]'}
- Rodapé: ${outputs.documents.footerTemplate || '[Escritório] - [Data]'}
        `.trim();
    }

    private buildCoreRules(): string {
        // REGRAS QUE NUNCA MUDAM - proteção do core
        return `
# Regras Fundamentais (Imutáveis)

## Ética e Compliance
- NUNCA forneça orientação que viole o Código de Ética da OAB
- NUNCA garanta resultados específicos de processos
- NUNCA oriente sobre práticas ilegais ou antiéticas
- Sempre recomende consulta presencial para decisões importantes

## Segurança
- NUNCA revele informações de outros clientes ou processos
- NUNCA armazene ou transmita dados sensíveis fora do contexto
- Respeite sigilo profissional advocatício

## Limitações
- Você é uma assistente, não substitui advogado
- Suas análises são auxiliares, não pareceres definitivos
- Sempre indique que o advogado responsável deve validar
        `.trim();
    }

    // ═══════════════════════════════════════════════════════════════════════
    // HELPERS
    // ═══════════════════════════════════════════════════════════════════════

    private areaToText(area: AreaDireito): string {
        const map: Record<AreaDireito, string> = {
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
        return map[area];
    }

    private areaToKnowledge(area: AreaDireito): string {
        const map: Record<AreaDireito, string> = {
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
        return map[area];
    }
}

export const promptLayer = new PromptLayer();
```

---

## 5. Exemplo Completo: Config → Prompt

### Configuração do Silva & Associados

```json
{
    "identity": {
        "tenantId": "silva-associados",
        "agentName": "Laura",
        "firmName": "Silva & Associados",
        "greeting": "Olá! Sou a Laura, assistente do Silva & Associados. Como posso ajudar você hoje?"
    },
    "branding": {
        "logo": "/assets/silva-logo.png",
        "favicon": "/assets/silva-favicon.ico",
        "colors": {
            "primary": "#1a365d",
            "secondary": "#2b6cb0",
            "accent": "#ed8936"
        }
    },
    "specialization": {
        "areas": ["trabalhista", "previdenciario"],
        "tribunals": ["TRT8", "TST", "TRF1"],
        "processTypes": ["reclamacao_trabalhista", "auxilio_doenca", "aposentadoria"]
    },
    "behavior": {
        "style": "semiformal",
        "techLevel": "basico",
        "tone": "empatico",
        "depth": "detalhado"
    },
    "policies": {
        "preferSettlement": true,
        "mentionTrackRecord": true,
        "trackRecordText": "O escritório tem histórico de 85% de êxito em acordos trabalhistas",
        "disclaimer": "Esta orientação não substitui consulta presencial com advogado",
        "forbiddenPhrases": [
            "com certeza você vai ganhar",
            "processo garantido",
            "é muito simples"
        ],
        "preferredPhrases": [
            "entendo sua preocupação",
            "vamos analisar juntos",
            "no escritório, costumamos"
        ]
    },
    "outputs": {
        "processAnalysis": {
            "includeSummary": true,
            "includeRisks": true,
            "includeDeadlines": true,
            "includeRecommendations": true,
            "includeJurisprudence": true
        },
        "documents": {
            "headerTemplate": "EXCELENTÍSSIMO(A) SENHOR(A) JUIZ(A)",
            "footerTemplate": "Silva & Associados - Advocacia Trabalhista",
            "signatureBlock": "Dr. Roberto Silva\nOAB/PA 12345"
        }
    },
    "features": {
        "pjeAutomation": true,
        "documentGeneration": true,
        "jurisprudenceSearch": true,
        "deadlineAlerts": true,
        "calculators": true
    },
    "limits": {
        "users": 5,
        "monitoredProcesses": 100,
        "documentsPerMonth": 50,
        "aiTokensPerMonth": 500000
    }
}
```

### Prompt Gerado Automaticamente

```markdown
# Identidade

Você é **Laura**, assistente jurídica virtual do escritório **Silva & Associados**.

Quando o usuário iniciar conversa, cumprimente com: "Olá! Sou a Laura, assistente do Silva & Associados. Como posso ajudar você hoje?"

Sempre se refira a si mesma como Laura.

---

# Especialização

Você é especialista em: Direito do Trabalho, Direito Previdenciário.

Tribunais de atuação: TRT8, TST, TRF1.

Ao analisar casos, priorize:
- CLT, súmulas do TST, jurisprudência dos TRTs
- Lei 8.213/91, IN INSS, súmulas da TNU

---

# Comportamento

## Estilo de Comunicação
Use linguagem profissional mas acessível. Trate o usuário por "você" de forma respeitosa.

## Nível Técnico
Explique termos técnicos complexos. Use linguagem acessível.

## Tom
Seja acolhedor. Demonstre compreensão antes de análises técnicas. Use "entendo que..." e "compreendo sua preocupação".

## Profundidade
Forneça análise completa. Inclua fundamentação legal, jurisprudência relevante.

---

# Políticas do Escritório

- Sempre mencione a possibilidade de acordo/negociação antes de recomendar ação judicial
- Destaque vantagens de resolução consensual (tempo, custo, desgaste)
- Quando relevante, mencione: "O escritório tem histórico de 85% de êxito em acordos trabalhistas"
- NUNCA use estas frases: "com certeza você vai ganhar", "processo garantido", "é muito simples"
- Prefira usar: "entendo sua preocupação", "vamos analisar juntos", "no escritório, costumamos"
- Inclua este disclaimer quando der orientações: "Esta orientação não substitui consulta presencial com advogado"

---

# Formato de Outputs

Ao analisar processos, estruture a resposta com:
1. Resumo executivo
2. Análise de riscos
3. Prazos importantes
4. Recomendações
5. Jurisprudência relevante

Ao gerar documentos:
- Cabeçalho: EXCELENTÍSSIMO(A) SENHOR(A) JUIZ(A)
- Rodapé: Silva & Associados - Advocacia Trabalhista

---

# Regras Fundamentais (Imutáveis)

## Ética e Compliance
- NUNCA forneça orientação que viole o Código de Ética da OAB
- NUNCA garanta resultados específicos de processos
- NUNCA oriente sobre práticas ilegais ou antiéticas
- Sempre recomende consulta presencial para decisões importantes

## Segurança
- NUNCA revele informações de outros clientes ou processos
- NUNCA armazene ou transmita dados sensíveis fora do contexto
- Respeite sigilo profissional advocatício

## Limitações
- Você é uma assistente, não substitui advogado
- Suas análises são auxiliares, não pareceres definitivos
- Sempre indique que o advogado responsável deve validar
```

---

## 6. Interface Admin (Self-Service)

### Painel de Configuração

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  LEX ADMIN - Silva & Associados                                   [Sair]   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │  🏠 Geral  │  🎨 Visual  │  💬 Personalidade  │  📋 Outputs  │  ⚙️   │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
│  ═══════════════════════════════════════════════════════════════════════   │
│                                                                             │
│  💬 PERSONALIDADE DA ASSISTENTE                                            │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  Nome da Assistente                                                  │   │
│  │  ┌───────────────────────────────────────────────────────────────┐  │   │
│  │  │ Laura                                                         │  │   │
│  │  └───────────────────────────────────────────────────────────────┘  │   │
│  │  💡 Este nome aparecerá nas conversas com os usuários               │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  Estilo de Comunicação                                               │   │
│  │                                                                      │   │
│  │  ○ Formal      "Senhor(a)", "Doutor(a)", linguagem técnica          │   │
│  │  ● Semiformal  "Você", profissional mas acessível ← Selecionado     │   │
│  │  ○ Informal    Amigável, como um colega de confiança                │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  Tom da Assistente                                                   │   │
│  │                                                                      │   │
│  │  ○ Neutro      Objetivo, foca nos fatos                             │   │
│  │  ● Empático    Acolhedor, demonstra compreensão ← Selecionado       │   │
│  │  ○ Assertivo   Direto, recomendações claras                         │   │
│  │  ○ Didático    Explica passo a passo                                │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  Nível de Detalhe                                                    │   │
│  │                                                                      │   │
│  │       Resumido ────●───────────────────────────── Exaustivo         │   │
│  │                    ↑                                                 │   │
│  │               Detalhado                                              │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  Políticas do Escritório                                             │   │
│  │                                                                      │   │
│  │  ☑ Sugerir acordo antes de ação judicial                            │   │
│  │  ☑ Mencionar histórico do escritório                                │   │
│  │    └─ "O escritório tem histórico de 85% de êxito em acordos"       │   │
│  │  ☑ Incluir disclaimer nas orientações                               │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  🧪 PREVIEW                                         [Atualizar]     │   │
│  │  ───────────────────────────────────────────────────────────────    │   │
│  │                                                                      │   │
│  │  Usuário: "Fui demitido ontem, o que devo receber?"                 │   │
│  │                                                                      │   │
│  │  Laura: "Entendo sua preocupação, ser demitido é sempre uma        │   │
│  │  situação difícil. Vamos analisar juntos seus direitos.            │   │
│  │                                                                      │   │
│  │  Na demissão sem justa causa, você tem direito a:                  │   │
│  │  • Saldo de salário                                                 │   │
│  │  • Aviso prévio (indenizado ou trabalhado)                         │   │
│  │  • Férias + 1/3                                                     │   │
│  │  • 13º proporcional                                                 │   │
│  │  • FGTS + multa 40%                                                 │   │
│  │                                                                      │   │
│  │  O escritório tem histórico de 85% de êxito em acordos. Antes de   │   │
│  │  ajuizar ação, podemos tentar uma negociação direta..."            │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│                                                        [Salvar Alterações] │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 7. Arquitetura Técnica

### Estrutura de Pastas (Simplificada)

```
lex/
│
├── core/                           # 🔒 INTOCÁVEL
│   ├── agent/                      # Agent Loop (think → act → observe)
│   │   ├── loop.ts
│   │   ├── think.ts
│   │   └── executor.ts
│   ├── skills/                     # Skills padrão (todos usam igual)
│   │   ├── pje-consultar.ts
│   │   ├── pje-monitorar.ts
│   │   ├── doc-gerar.ts
│   │   └── jurisprudencia.ts
│   ├── prompt-layer/               # 🎯 MOTOR DE TRADUÇÃO
│   │   ├── engine.ts               # Config → Prompt
│   │   ├── builders.ts             # Builders por seção
│   │   └── validators.ts           # Valida configs
│   ├── rules/                      # Regras imutáveis
│   │   ├── ethics.ts               # Ética OAB
│   │   └── security.ts             # Segurança
│   └── services/
│       ├── ai-handler.ts
│       └── pje-integration.ts
│
├── config/                         # ⚙️ CONFIGURAÇÕES
│   ├── schema.json                 # Schema de validação
│   ├── defaults.json               # Config padrão
│   └── tenants/                    # Configs por tenant
│       ├── silva-associados.json
│       ├── advocacia-xyz.json
│       └── defensoria-popular.json
│
├── admin/                          # 🖥️ PAINEL ADMIN (web)
│   ├── pages/
│   │   ├── identity.tsx
│   │   ├── branding.tsx
│   │   ├── behavior.tsx
│   │   └── policies.tsx
│   └── components/
│       ├── StylePicker.tsx
│       ├── TonePicker.tsx
│       └── PreviewChat.tsx
│
└── electron/                       # Desktop app
    └── main.ts
```

### Fluxo de Inicialização

```typescript
// electron/main.ts (simplificado)

import { promptLayer } from '../core/prompt-layer/engine';
import { loadTenantConfig } from '../config/loader';
import { AgentLoop } from '../core/agent/loop';

async function initializeLex(tenantId: string) {
    // 1. Carrega configuração do tenant (JSON)
    const config = await loadTenantConfig(tenantId);

    // 2. Prompt-Layer traduz config → prompt
    const systemPrompt = promptLayer.buildSystemPrompt(config);

    // 3. Inicializa Agent Loop com prompt dinâmico
    const agent = new AgentLoop({
        systemPrompt,           // ← Gerado dinamicamente
        enabledFeatures: config.features,
        limits: config.limits
    });

    // 4. Aplica branding
    applyBranding(config.branding);

    return agent;
}
```

---

## 8. Vantagens da Arquitetura

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                             │
│   POR QUE PROMPT-LAYER É SUPERIOR                                          │
│                                                                             │
│   ╔═══════════════════════════════════════════════════════════════════╗    │
│   ║  ABORDAGEM ANTIGA (código)           PROMPT-LAYER (config)        ║    │
│   ╠═══════════════════════════════════════════════════════════════════╣    │
│   ║                                                                    ║    │
│   ║  Customização = código novo   →    Customização = JSON             ║    │
│   ║  Precisa de dev pra cada um   →    Self-service pelo cliente       ║    │
│   ║  N branches no git            →    1 branch, N configs             ║    │
│   ║  Bug em um = bug em todos     →    Configs isoladas                ║    │
│   ║  Deploy por cliente           →    Deploy único                    ║    │
│   ║  Manutenção O(n)              →    Manutenção O(1)                 ║    │
│   ║  Escala = mais devs           →    Escala = mais JSON              ║    │
│   ║                                                                    ║    │
│   ╚═══════════════════════════════════════════════════════════════════╝    │
│                                                                             │
│   RESULTADO:                                                                │
│   ──────────                                                                │
│   ✓ Core estável (menos bugs)                                              │
│   ✓ Onboarding rápido (horas, não semanas)                                 │
│   ✓ Cliente tem autonomia                                                  │
│   ✓ Você escala sem contratar devs                                         │
│   ✓ Updates instantâneos para todos                                        │
│   ✓ Rollback = trocar JSON                                                 │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 9. Níveis de Personalização

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                             │
│   NÍVEL 1: VISUAL (minutos)                                                │
│   ─────────────────────────                                                 │
│   • Logo, cores, nome → Upload e seleciona                                 │
│   • Zero impacto no core                                                   │
│   • Cliente faz sozinho                                                    │
│                                                                             │
│   NÍVEL 2: COMPORTAMENTO (minutos)                                         │
│   ────────────────────────────────                                          │
│   • Tom, estilo, profundidade → Sliders e radio buttons                    │
│   • Traduzido para prompt automaticamente                                  │
│   • Cliente faz sozinho                                                    │
│                                                                             │
│   NÍVEL 3: POLÍTICAS (minutos)                                             │
│   ────────────────────────────                                              │
│   • Regras do escritório → Checkboxes e texto                              │
│   • Traduzido para prompt automaticamente                                  │
│   • Cliente faz sozinho                                                    │
│                                                                             │
│   NÍVEL 4: ESPECIALIZAÇÃO (horas)                                          │
│   ───────────────────────────────                                           │
│   • Áreas de atuação → Multi-select                                        │
│   • Sistema já conhece cada área (mapeamento interno)                      │
│   • Cliente faz sozinho                                                    │
│                                                                             │
│   NÍVEL 5: TEMPLATES (horas)                                               │
│   ──────────────────────────                                                │
│   • Modelos de documentos → Upload de .docx                                │
│   • Variáveis pré-definidas ({cliente}, {processo}, etc.)                  │
│   • Cliente faz sozinho ou com suporte                                     │
│                                                                             │
│   ═══════════════════════════════════════════════════════════════════════  │
│                                                                             │
│   TUDO ACIMA: SEM CÓDIGO. SEM DEV. SEM TOCAR NO CORE.                      │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 10. Planos e Monetização

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              PLANOS LEX                                     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐             │
│  │     STARTER     │  │       PRO       │  │   ENTERPRISE    │             │
│  │   R$ 297/mês    │  │   R$ 697/mês    │  │   Sob consulta  │             │
│  ├─────────────────┤  ├─────────────────┤  ├─────────────────┤             │
│  │                 │  │                 │  │                 │             │
│  │ ✓ 2 usuários    │  │ ✓ 10 usuários   │  │ ✓ Ilimitado     │             │
│  │ ✓ Branding      │  │ ✓ Branding      │  │ ✓ Branding      │             │
│  │ ✓ Comportamento │  │ ✓ Comportamento │  │ ✓ Comportamento │             │
│  │ ✓ 1 área        │  │ ✓ 3 áreas       │  │ ✓ Todas áreas   │             │
│  │ ✗ Políticas     │  │ ✓ Políticas     │  │ ✓ Políticas     │             │
│  │ ✗ Templates     │  │ ✓ Templates     │  │ ✓ Templates     │             │
│  │                 │  │                 │  │ ✓ Onboarding    │             │
│  │ Suporte: Email  │  │ Suporte: Chat   │  │ Suporte: Ded.   │             │
│  │                 │  │                 │  │                 │             │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘             │
│                                                                             │
│  Todos os planos usam o MESMO CORE. Diferença é só CONFIG.                 │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 11. Resumo Executivo

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                             │
│   PROMPT-LAYER ARCHITECTURE                                                │
│   ═════════════════════════                                                 │
│                                                                             │
│   1. Core é LEI → Nunca muda por cliente                                   │
│                                                                             │
│   2. Config é PODER → Cliente configura, sistema traduz                    │
│                                                                             │
│   3. Prompt é MÁGICA → Toda config vira instrução pra IA                   │
│                                                                             │
│   4. Escala é MATH → 100 clientes = 100 JSONs, não 100 branches            │
│                                                                             │
│   ───────────────────────────────────────────────────────────────────────   │
│                                                                             │
│   FÓRMULA:                                                                  │
│                                                                             │
│   ┌────────────┐   ┌──────────────┐   ┌────────────────┐   ┌──────────┐   │
│   │   Config   │ → │ Prompt-Layer │ → │ System Prompt  │ → │   Core   │   │
│   │   (JSON)   │   │   (Engine)   │   │   (Dinâmico)   │   │   (IA)   │   │
│   └────────────┘   └──────────────┘   └────────────────┘   └──────────┘   │
│                                                                             │
│   Cliente toca      Sistema traduz    IA recebe            Motor executa   │
│   só aqui           automaticamente   personalizado        igual pra todos │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

*Documento atualizado em: Janeiro 2026*
*Versão: 2.0 - Prompt-Layer Architecture*
