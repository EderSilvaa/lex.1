// Action Planner - Usa GPT-4 para planejar ações jurídicas inteligentes
const fetch = require('node-fetch');

class ActionPlanner {
  constructor() {
    // Usar Supabase Edge Function dedicada para planejamento
    this.plannerUrl = 'https://nspauxzztflgmxjgevmo.supabase.co/functions/v1/LEX-AGENT-PLANNER';
    this.supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5zcGF1eHp6dGZsZ214amdldm1vIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ2MTI4ODUsImV4cCI6MjA3MDE4ODg4NX0.XXJf6alnb6me4PeMCA80UmfJVUZo8VxA0BFDdFCtN1A';
  }

  /**
   * Faz requisição à Edge Function de Planejamento
   */
  async callPlanner(command, context) {
    console.log('📤 Enviando para LEX-AGENT-PLANNER...');

    try {
      const response = await fetch(this.plannerUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.supabaseKey}`,
          'apikey': this.supabaseKey
        },
        body: JSON.stringify({
          command: command,
          context: context
        })
      });

      console.log('📥 Status da resposta:', response.status);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ Erro da Edge Function:', errorText);
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();

      if (data.plan) {
        return data.plan;
      } else if (data.error) {
        throw new Error(data.error);
      } else {
        throw new Error('Resposta inválida da Edge Function');
      }

    } catch (error) {
      console.error('❌ Erro ao chamar Planner:', error.message);
      throw error;
    }
  }

  /**
   * Analisa comando do usuário e cria plano de ação
   */
  async createPlan(userCommand, context) {
    console.log(`🧠 Planejando ação para: "${userCommand}"`);

    try {
      // Usar a Edge Function dedicada que retorna JSON estruturado
      const plan = await this.callPlanner(userCommand, context);

      console.log(`✅ Plano criado: ${plan.steps?.length || 0} passos`);
      console.log(`⚠️ Riscos identificados: ${plan.risks?.length || 0}`);
      console.log(`🔒 Requer aprovação: ${plan.needsApproval ? 'SIM' : 'NÃO'}`);

      return plan;

    } catch (error) {
      console.error('❌ Erro ao criar plano:', error.message);

      // Plano fallback em caso de erro
      return {
        intent: {
          action: 'erro_planejamento',
          description: `Erro ao planejar: ${userCommand}`
        },
        steps: [
          {
            order: 1,
            type: 'wait',
            description: 'Erro no planejamento - análise manual necessária',
            reasoning: error.message
          }
        ],
        risks: [
          {
            level: 'high',
            description: 'Falha no sistema de planejamento',
            mitigation: 'Executar manualmente ou tentar novamente'
          }
        ],
        needsApproval: true,
        estimatedTime: '5'
      };
    }
  }

  /**
   * Analisa contexto jurídico de um processo
   */
  async analyzeProcessContext(processData) {
    console.log('📊 Analisando contexto jurídico do processo...');

    const systemPrompt = `Você é um assistente jurídico especializado em análise processual.

Analise os dados do processo e forneça insights jurídicos relevantes.

FORMATO DE RESPOSTA (JSON):
{
  "phase": "conhecimento|execução|recurso",
  "summary": "resumo do processo em 2-3 frases",
  "nextSteps": ["próximo passo 1", "próximo passo 2"],
  "deadlines": [
    {
      "description": "descrição do prazo",
      "date": "data estimada",
      "priority": "high|medium|low"
    }
  ],
  "recommendations": ["recomendação 1", "recomendação 2"]
}`;

    try {
      const response = await this.openai.chat.completions.create({
        model: this.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: JSON.stringify(processData, null, 2) }
        ],
        response_format: { type: 'json_object' },
        temperature: 0.5
      });

      const analysis = JSON.parse(response.choices[0].message.content);

      console.log(`✅ Análise concluída: Fase ${analysis.phase}`);

      return analysis;

    } catch (error) {
      console.error('❌ Erro ao analisar contexto:', error.message);
      throw error;
    }
  }

  /**
   * Gera minuta de documento jurídico
   */
  async generateDocument(documentType, data) {
    console.log(`📝 Gerando minuta: ${documentType}`);

    const systemPrompt = `Você é um assistente jurídico especializado em redação de peças processuais.

Gere uma minuta profissional do documento solicitado, seguindo as normas da ABNT e boas práticas jurídicas.

IMPORTANTE:
- Use linguagem técnica e formal
- Inclua fundamentação legal quando aplicável
- Estruture de forma clara com tópicos
- Deixe campos para personalização marcados como [CAMPO]

TIPOS DE DOCUMENTOS:
- peticao_inicial
- contestacao
- recurso_apelacao
- recurso_agravo
- embargos_declaracao
- peticao_simples
- peticao_juntada_documentos`;

    const userPrompt = `TIPO: ${documentType}

DADOS:
${JSON.stringify(data, null, 2)}

Gere a minuta do documento.`;

    try {
      const response = await this.openai.chat.completions.create({
        model: this.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.7 // Um pouco mais criativo para documentos
      });

      const document = response.choices[0].message.content;

      console.log(`✅ Minuta gerada: ${document.length} caracteres`);

      return {
        type: documentType,
        content: document,
        generatedAt: new Date().toISOString()
      };

    } catch (error) {
      console.error('❌ Erro ao gerar documento:', error.message);
      throw error;
    }
  }

  /**
   * Busca jurisprudência relevante
   */
  async searchJurisprudence(query, filters = {}) {
    console.log(`🔍 Buscando jurisprudência: "${query}"`);

    const systemPrompt = `Você é um assistente jurídico especializado em pesquisa de jurisprudência.

Analise a consulta do usuário e sugira termos de busca otimizados e tribunais relevantes.

FORMATO DE RESPOSTA (JSON):
{
  "searchTerms": ["termo 1", "termo 2", "termo 3"],
  "suggestedTribunals": ["STF", "STJ", "TJPA"],
  "legalBasis": ["artigo/lei relevante"],
  "similarCases": ["breve descrição de caso similar conhecido"]
}`;

    try {
      const response = await this.openai.chat.completions.create({
        model: this.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Consulta: ${query}\nFiltros: ${JSON.stringify(filters)}` }
        ],
        response_format: { type: 'json_object' },
        temperature: 0.4
      });

      const suggestions = JSON.parse(response.choices[0].message.content);

      console.log(`✅ Sugestões geradas: ${suggestions.searchTerms.length} termos`);

      return suggestions;

    } catch (error) {
      console.error('❌ Erro ao buscar jurisprudência:', error.message);
      throw error;
    }
  }
}

module.exports = ActionPlanner;
