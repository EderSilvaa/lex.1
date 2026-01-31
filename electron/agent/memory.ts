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
     * Busca interações similares por palavras-chave
     */
    async buscarSimilares(objetivo: string, limite: number = 5): Promise<InteracaoSalva[]> {
        const interacoes = this.store.get('interacoes', []);

        // Busca simples por palavras-chave
        const palavras = objetivo.toLowerCase().split(/\s+/).filter(p => p.length > 3);

        if (palavras.length === 0) return [];

        return interacoes
            .filter(i => {
                const texto = i.objetivo.toLowerCase();
                return palavras.some(p => texto.includes(p));
            })
            .slice(-limite);
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
