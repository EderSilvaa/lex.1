/**
 * Lex Agent Memory
 *
 * Sistema de memória persistente usando electron-store.
 * Armazena contexto entre sessões para personalização e continuidade.
 */

import Store from 'electron-store';

// ============================================================================
// TYPES
// ============================================================================

export interface MemoriaData {
    processosRecentes: string[];
    interacoes: InteracaoSalva[];
    aprendizados: string[];
    preferencias: Record<string, any>;
    usuario: UsuarioData;
}

export interface InteracaoSalva {
    timestamp: string;
    objetivo: string;
    resposta: string;
    passos: number;
    duracao: number;
    sucesso: boolean;
}

export interface UsuarioData {
    nome?: string;
    oab?: string;
    email?: string;
    tribunal_preferido?: string;
    escritorio?: string;
    estilo_escrita?: 'formal' | 'semiformal' | 'informal';
}

// ============================================================================
// MEMORY CLASS (Singleton)
// ============================================================================

export class Memory {
    private static instance: Memory;
    private store: Store<MemoriaData>;

    private constructor() {
        this.store = new Store<MemoriaData>({
            name: 'lex-agent-memory',
            defaults: {
                processosRecentes: [],
                interacoes: [],
                aprendizados: [],
                preferencias: {},
                usuario: {}
            }
        });
        console.log('[Memory] Inicializado');
    }

    static getInstance(): Memory {
        if (!Memory.instance) {
            Memory.instance = new Memory();
        }
        return Memory.instance;
    }

    // ========================================================================
    // CARREGAR MEMÓRIA
    // ========================================================================

    /**
     * Carrega memória completa para uso no Agent Loop
     */
    async carregar(): Promise<{
        processosRecentes: string[];
        aprendizados: string[];
        preferencias: Record<string, any>;
    }> {
        return {
            processosRecentes: this.store.get('processosRecentes', []),
            aprendizados: this.store.get('aprendizados', []),
            preferencias: this.store.get('preferencias', {})
        };
    }

    // ========================================================================
    // USUÁRIO
    // ========================================================================

    /**
     * Retorna dados do usuário
     */
    async getUsuario(): Promise<UsuarioData> {
        return this.store.get('usuario', {});
    }

    /**
     * Salva dados do usuário
     */
    async setUsuario(dados: Partial<UsuarioData>): Promise<void> {
        const atual = this.store.get('usuario', {});
        this.store.set('usuario', { ...atual, ...dados });
        console.log('[Memory] Usuário atualizado');
    }

    // ========================================================================
    // PROCESSOS
    // ========================================================================

    /**
     * Registra processo acessado (mantém últimos 20)
     */
    async registrarProcesso(numero: string): Promise<void> {
        const recentes = this.store.get('processosRecentes', []);

        // Remove duplicatas e adiciona no início
        const novos = [numero, ...recentes.filter(p => p !== numero)].slice(0, 20);

        this.store.set('processosRecentes', novos);
        console.log(`[Memory] Processo registrado: ${numero}`);
    }

    /**
     * Retorna processos recentes
     */
    async getProcessosRecentes(limite: number = 10): Promise<string[]> {
        return this.store.get('processosRecentes', []).slice(0, limite);
    }

    // ========================================================================
    // INTERAÇÕES
    // ========================================================================

    /**
     * Salva interação completa (mantém últimas 100)
     */
    async salvarInteracao(interacao: Omit<InteracaoSalva, 'timestamp'>): Promise<void> {
        const interacoes = this.store.get('interacoes', []);

        interacoes.push({
            ...interacao,
            timestamp: new Date().toISOString()
        });

        // Mantém últimas 100 interações
        this.store.set('interacoes', interacoes.slice(-100));
        console.log('[Memory] Interação salva');
    }

    /**
     * Busca interações similares usando TF-IDF + Similaridade Coseno (A1)
     * Muito mais preciso que a busca simples por keywords.
     * Roda localmente, sem custo de API.
     */
    async buscarSimilares(objetivo: string, limite: number = 5): Promise<InteracaoSalva[]> {
        const interacoes = this.store.get('interacoes', []);
        if (interacoes.length === 0) return [];

        // Tokeniza query e todos os documentos
        const queryTokens = this.tokenize(objetivo);
        if (queryTokens.length === 0) return [];

        const allDocs = interacoes.map(i => this.tokenize(i.objetivo));

        // Calcular IDF para todos os termos
        const idf = this.calculateIDF(allDocs, queryTokens);

        // Calcular TF-IDF vector da query
        const queryVector = this.tfidfVector(queryTokens, idf);

        // Calcular similaridade coseno com cada interação
        const scored = interacoes.map((interacao, idx) => {
            const docVector = this.tfidfVector(allDocs[idx]!, idf);
            const similarity = this.cosineSimilarity(queryVector, docVector);
            return { interacao, similarity };
        });

        // Ordenar por similaridade (maior primeiro) e filtrar score > 0
        return scored
            .filter(s => s.similarity > 0.05) // threshold mínimo
            .sort((a, b) => b.similarity - a.similarity)
            .slice(0, limite)
            .map(s => s.interacao);
    }

    // ========================================================================
    // TF-IDF HELPERS (A1)
    // ========================================================================

    /**
     * Tokeniza texto: lowercase, remove stopwords, normaliza acentos
     */
    private tokenize(text: string): string[] {
        const stopwords = new Set([
            'o', 'a', 'os', 'as', 'um', 'uma', 'de', 'do', 'da', 'dos', 'das',
            'em', 'no', 'na', 'nos', 'nas', 'por', 'para', 'com', 'sem', 'sob',
            'que', 'se', 'não', 'mais', 'muito', 'como', 'mas', 'ou', 'e', 'é',
            'foi', 'ser', 'ter', 'está', 'são', 'tem', 'seu', 'sua', 'esse',
            'essa', 'este', 'esta', 'isso', 'isto', 'aqui', 'ali', 'lá',
            'the', 'is', 'at', 'which', 'on', 'and', 'or', 'to', 'in', 'of'
        ]);

        return text
            .toLowerCase()
            .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // remove acentos
            .replace(/[^\w\s]/g, ' ') // remove pontuação
            .split(/\s+/)
            .filter(word => word.length > 2 && !stopwords.has(word));
    }

    /**
     * Calcula IDF (Inverse Document Frequency) para cada termo
     */
    private calculateIDF(docs: string[][], queryTokens: string[]): Map<string, number> {
        const idf = new Map<string, number>();
        const totalDocs = docs.length + 1; // +1 para a query

        // Todos os termos únicos (query + docs)
        const allTerms = new Set([...queryTokens]);
        for (const doc of docs) {
            for (const term of doc) {
                allTerms.add(term);
            }
        }

        for (const term of allTerms) {
            // Quantos documentos contêm este termo
            let docCount = 0;
            for (const doc of docs) {
                if (doc.includes(term)) docCount++;
            }
            if (queryTokens.includes(term)) docCount++;

            idf.set(term, Math.log(totalDocs / (docCount + 1)) + 1); // smooth IDF
        }

        return idf;
    }

    /**
     * Calcula vetor TF-IDF para um documento
     */
    private tfidfVector(tokens: string[], idf: Map<string, number>): Map<string, number> {
        const vector = new Map<string, number>();
        const termCount = new Map<string, number>();

        // Contar frequência de cada termo
        for (const token of tokens) {
            termCount.set(token, (termCount.get(token) || 0) + 1);
        }

        // TF-IDF = (freq / total_tokens) * IDF
        for (const [term, count] of termCount) {
            const tf = count / tokens.length;
            const idfValue = idf.get(term) || 0;
            vector.set(term, tf * idfValue);
        }

        return vector;
    }

    /**
     * Calcula similaridade coseno entre dois vetores TF-IDF
     */
    private cosineSimilarity(vecA: Map<string, number>, vecB: Map<string, number>): number {
        let dotProduct = 0;
        let normA = 0;
        let normB = 0;

        // Todos os termos de ambos os vetores
        const allTerms = new Set([...vecA.keys(), ...vecB.keys()]);

        for (const term of allTerms) {
            const a = vecA.get(term) || 0;
            const b = vecB.get(term) || 0;
            dotProduct += a * b;
            normA += a * a;
            normB += b * b;
        }

        const denominator = Math.sqrt(normA) * Math.sqrt(normB);
        return denominator === 0 ? 0 : dotProduct / denominator;
    }

    // ========================================================================
    // APRENDIZADOS
    // ========================================================================

    /**
     * Adiciona aprendizado (mantém últimos 50)
     */
    async addAprendizado(aprendizado: string): Promise<void> {
        const aprendizados = this.store.get('aprendizados', []);

        if (!aprendizados.includes(aprendizado)) {
            aprendizados.push(aprendizado);
            this.store.set('aprendizados', aprendizados.slice(-50));
            console.log('[Memory] Aprendizado adicionado');
        }
    }

    // ========================================================================
    // PREFERÊNCIAS
    // ========================================================================

    /**
     * Define preferência
     */
    async setPreferencia(chave: string, valor: any): Promise<void> {
        const prefs = this.store.get('preferencias', {});
        prefs[chave] = valor;
        this.store.set('preferencias', prefs);
    }

    /**
     * Obtém preferência
     */
    async getPreferencia<T>(chave: string, padrao?: T): Promise<T | undefined> {
        const prefs = this.store.get('preferencias', {});
        return prefs[chave] ?? padrao;
    }

    // ========================================================================
    // CONTEXTO PARA PROMPT
    // ========================================================================

    /**
     * Retorna contexto relevante formatado para o prompt
     */
    async getRelevante(objetivo: string): Promise<string> {
        const similares = await this.buscarSimilares(objetivo);
        const recentes = await this.getProcessosRecentes(5);
        const aprendizados = this.store.get('aprendizados', []).slice(-5);
        const usuario = await this.getUsuario();

        const partes: string[] = [];

        // Usuário
        if (usuario.nome) {
            partes.push(`Usuário: ${usuario.nome}${usuario.oab ? ` (OAB: ${usuario.oab})` : ''}`);
        }

        // Processos recentes
        if (recentes.length > 0) {
            partes.push(`Processos recentes: ${recentes.join(', ')}`);
        }

        // Interações similares
        if (similares.length > 0) {
            const resumo = similares.map(s =>
                `• "${s.objetivo.substring(0, 50)}..." → ${s.sucesso ? 'OK' : 'Falha'}`
            ).join('\n');
            partes.push(`Interações anteriores similares:\n${resumo}`);
        }

        // Aprendizados
        if (aprendizados.length > 0) {
            partes.push(`Aprendizados: ${aprendizados.join('; ')}`);
        }

        return partes.join('\n\n') || 'Sem contexto prévio relevante';
    }

    // ========================================================================
    // UTILIDADES
    // ========================================================================

    /**
     * Limpa toda a memória
     */
    async limpar(): Promise<void> {
        this.store.clear();
        console.log('[Memory] Memória limpa');
    }

    /**
     * Retorna estatísticas da memória
     */
    async getStats(): Promise<{
        totalInteracoes: number;
        totalProcessos: number;
        totalAprendizados: number;
    }> {
        return {
            totalInteracoes: this.store.get('interacoes', []).length,
            totalProcessos: this.store.get('processosRecentes', []).length,
            totalAprendizados: this.store.get('aprendizados', []).length
        };
    }
}

// Export singleton instance getter
export const getMemory = () => Memory.getInstance();
