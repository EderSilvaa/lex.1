/**
 * Lex Agent Memory
 *
 * Sistema de memória persistente usando JSON puro (sem dependência do Electron).
 * Armazena contexto entre sessões para personalização e continuidade.
 */

import * as fs from 'fs';
import * as path from 'path';
import { saveEncrypted, loadEncrypted } from '../privacy/encrypted-storage';
import type { CrossSessionFact } from './types';

// ============================================================================
// TYPES
// ============================================================================

export interface MemoriaData {
    processosRecentes: string[];
    interacoes: InteracaoSalva[];
    aprendizados: string[];
    preferencias: Record<string, any>;
    usuario: UsuarioData;
    /** Cross-session facts — contexto persistente de processos entre sessões */
    fatos: CrossSessionFact[];
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

// ── userDataDir injetado externamente — sem dependência do Electron ──
let _memoryDir: string | null = null;

/** Deve ser chamado uma vez no boot (main.ts ou backend/server.ts) */
export function initMemoryDir(userDataDir: string): void {
    _memoryDir = userDataDir;
}

const DEFAULTS: MemoriaData = {
    processosRecentes: [],
    interacoes: [],
    aprendizados: [],
    preferencias: {},
    usuario: {},
    fatos: []
};

export class Memory {
    private static instance: Memory;
    private data: MemoriaData;
    private filePath: string;
    private saveTimer: ReturnType<typeof setTimeout> | null = null;

    private constructor() {
        if (!_memoryDir) throw new Error('[Memory] Chame initMemoryDir() antes de usar Memory');
        this.filePath = path.join(_memoryDir, 'lex-agent-memory.json');
        this.data = this.load();
        console.log('[Memory] Inicializado:', this.filePath);
    }

    static getInstance(): Memory {
        if (!Memory.instance) {
            Memory.instance = new Memory();
        }
        return Memory.instance;
    }

    private load(): MemoriaData {
        const parsed = loadEncrypted<Partial<MemoriaData>>(this.filePath, {});
        return { ...DEFAULTS, ...parsed };
    }

    private save(): void {
        if (this.saveTimer) clearTimeout(this.saveTimer);
        this.saveTimer = setTimeout(() => this.flush(), 500);
    }

    /** Persiste imediatamente no disco (criptografado) */
    flush(): void {
        try {
            saveEncrypted(this.filePath, this.data);
        } catch (err) {
            console.error('[Memory] Erro ao salvar:', err);
        }
    }

    // ========================================================================
    // CARREGAR MEMÓRIA
    // ========================================================================

    async carregar(): Promise<{
        processosRecentes: string[];
        aprendizados: string[];
        preferencias: Record<string, any>;
    }> {
        return {
            processosRecentes: this.data.processosRecentes ?? [],
            aprendizados: this.data.aprendizados ?? [],
            preferencias: this.data.preferencias ?? {}
        };
    }

    // ========================================================================
    // USUÁRIO
    // ========================================================================

    async getUsuario(): Promise<UsuarioData> {
        return this.data.usuario ?? {};
    }

    async setUsuario(dados: Partial<UsuarioData>): Promise<void> {
        this.data.usuario = { ...this.data.usuario, ...dados };
        this.save();
        console.log('[Memory] Usuário atualizado');
    }

    // ========================================================================
    // PROCESSOS
    // ========================================================================

    async registrarProcesso(numero: string): Promise<void> {
        const recentes = this.data.processosRecentes ?? [];
        this.data.processosRecentes = [numero, ...recentes.filter(p => p !== numero)].slice(0, 20);
        this.save();
        console.log(`[Memory] Processo registrado: ${numero}`);
    }

    async getProcessosRecentes(limite: number = 10): Promise<string[]> {
        return (this.data.processosRecentes ?? []).slice(0, limite);
    }

    // ========================================================================
    // INTERAÇÕES
    // ========================================================================

    async salvarInteracao(interacao: Omit<InteracaoSalva, 'timestamp'>): Promise<void> {
        const interacoes = this.data.interacoes ?? [];
        interacoes.push({ ...interacao, timestamp: new Date().toISOString() });
        this.data.interacoes = interacoes.slice(-100);
        this.save();
        console.log('[Memory] Interação salva');
    }

    async buscarSimilares(objetivo: string, limite: number = 5): Promise<InteracaoSalva[]> {
        const interacoes = this.data.interacoes ?? [];
        if (interacoes.length === 0) return [];

        const queryTokens = this.tokenize(objetivo);
        if (queryTokens.length === 0) return [];

        const allDocs = interacoes.map((i: InteracaoSalva) => this.tokenize(i.objetivo));
        const idf = this.calculateIDF(allDocs, queryTokens);
        const queryVector = this.tfidfVector(queryTokens, idf);

        const scored = interacoes.map((interacao: InteracaoSalva, idx: number) => {
            const docVector = this.tfidfVector(allDocs[idx]!, idf);
            const similarity = this.cosineSimilarity(queryVector, docVector);
            return { interacao, similarity };
        });

        return scored
            .filter((s: { similarity: number }) => s.similarity > 0.05)
            .sort((a: { similarity: number }, b: { similarity: number }) => b.similarity - a.similarity)
            .slice(0, limite)
            .map((s: { interacao: InteracaoSalva }) => s.interacao);
    }

    // ========================================================================
    // TF-IDF HELPERS
    // ========================================================================

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
            .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
            .replace(/[^\w\s]/g, ' ')
            .split(/\s+/)
            .filter(word => word.length > 2 && !stopwords.has(word));
    }

    private calculateIDF(docs: string[][], queryTokens: string[]): Map<string, number> {
        const idf = new Map<string, number>();
        const totalDocs = docs.length + 1;

        const allTerms = new Set([...queryTokens]);
        for (const doc of docs) {
            for (const term of doc) allTerms.add(term);
        }

        for (const term of allTerms) {
            let docCount = 0;
            for (const doc of docs) {
                if (doc.includes(term)) docCount++;
            }
            if (queryTokens.includes(term)) docCount++;
            idf.set(term, Math.log(totalDocs / (docCount + 1)) + 1);
        }

        return idf;
    }

    private tfidfVector(tokens: string[], idf: Map<string, number>): Map<string, number> {
        const vector = new Map<string, number>();
        const termCount = new Map<string, number>();

        for (const token of tokens) {
            termCount.set(token, (termCount.get(token) || 0) + 1);
        }

        for (const [term, count] of termCount) {
            const tf = count / tokens.length;
            const idfValue = idf.get(term) || 0;
            vector.set(term, tf * idfValue);
        }

        return vector;
    }

    private cosineSimilarity(vecA: Map<string, number>, vecB: Map<string, number>): number {
        let dotProduct = 0;
        let normA = 0;
        let normB = 0;

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

    async addAprendizado(aprendizado: string): Promise<void> {
        const aprendizados = this.data.aprendizados ?? [];
        if (!aprendizados.includes(aprendizado)) {
            aprendizados.push(aprendizado);
            this.data.aprendizados = aprendizados.slice(-50);
            this.save();
            console.log('[Memory] Aprendizado adicionado');
        }
    }

    // ========================================================================
    // CROSS-SESSION FACTS
    // ========================================================================

    /**
     * Adiciona ou atualiza fato de processo. Merge teses/decisões por processoNumero.
     * Max 100 fatos, evict oldest.
     */
    async addOrUpdateFact(fact: CrossSessionFact): Promise<void> {
        const fatos = this.data.fatos ?? [];
        const existingIdx = fatos.findIndex(f => f.processoNumero === fact.processoNumero);

        if (existingIdx >= 0) {
            const old = fatos[existingIdx]!;
            fatos[existingIdx] = {
                ...old,
                ...fact,
                tesesDiscutidas: [...new Set([...old.tesesDiscutidas, ...fact.tesesDiscutidas])],
                decisoes: [...new Set([...old.decisoes, ...fact.decisoes])],
                lastUpdated: Date.now(),
            };
        } else {
            fatos.push({ ...fact, lastUpdated: Date.now() });
        }

        // Max 100, evict oldest
        this.data.fatos = fatos
            .sort((a, b) => b.lastUpdated - a.lastUpdated)
            .slice(0, 100);
        this.save();
        console.log(`[Memory] Fato cross-session: ${fact.processoNumero}`);
    }

    async getFactsForProcess(numero: string): Promise<CrossSessionFact | undefined> {
        return (this.data.fatos ?? []).find(f => f.processoNumero === numero);
    }

    async getRecentFacts(limit = 10): Promise<CrossSessionFact[]> {
        return (this.data.fatos ?? [])
            .sort((a, b) => b.lastUpdated - a.lastUpdated)
            .slice(0, limit);
    }

    // ========================================================================
    // PREFERÊNCIAS
    // ========================================================================

    async setPreferencia(chave: string, valor: any): Promise<void> {
        if (!this.data.preferencias) this.data.preferencias = {};
        this.data.preferencias[chave] = valor;
        this.save();
    }

    async getPreferencia<T>(chave: string, padrao?: T): Promise<T | undefined> {
        const prefs = this.data.preferencias ?? {};
        return prefs[chave] ?? padrao;
    }

    // ========================================================================
    // CONTEXTO PARA PROMPT
    // ========================================================================

    async getRelevante(objetivo: string): Promise<string> {
        const similares = await this.buscarSimilares(objetivo);
        const recentes = await this.getProcessosRecentes(5);
        const aprendizados = (this.data.aprendizados ?? []).slice(-5);
        const usuario = await this.getUsuario();
        const fatos = this.data.fatos ?? [];

        const partes: string[] = [];

        if (usuario.nome) {
            partes.push(`Usuário: ${usuario.nome}${usuario.oab ? ` (OAB: ${usuario.oab})` : ''}`);
        }

        if (recentes.length > 0) {
            partes.push(`Processos recentes: ${recentes.join(', ')}`);
        }

        // Cross-session facts: busca processos mencionados no objetivo
        const processRegex = /\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}/g;
        const processMatches = objetivo.match(processRegex) || [];
        for (const num of processMatches) {
            const fact = fatos.find(f => f.processoNumero === num);
            if (fact) {
                const lines = [`Contexto anterior do processo ${num}:`];
                if (fact.classe) lines.push(`  Classe: ${fact.classe}`);
                if (fact.partes?.autor) lines.push(`  Autor: ${fact.partes.autor.join(', ')}`);
                if (fact.partes?.reu) lines.push(`  Réu: ${fact.partes.reu.join(', ')}`);
                if (fact.tribunal) lines.push(`  Tribunal: ${fact.tribunal}`);
                if (fact.tesesDiscutidas.length) lines.push(`  Teses: ${fact.tesesDiscutidas.join('; ')}`);
                if (fact.decisoes.length) lines.push(`  Decisões: ${fact.decisoes.join('; ')}`);
                if (fact.status) lines.push(`  Status: ${fact.status}`);
                partes.push(lines.join('\n'));
            }
        }

        // Se não mencionou processo específico, mostra fatos recentes como contexto
        if (processMatches.length === 0 && fatos.length > 0) {
            const recentFacts = fatos.slice(0, 3);
            const factLines = recentFacts.map(f =>
                `• ${f.processoNumero}${f.classe ? ` (${f.classe})` : ''}: ${f.tesesDiscutidas.slice(0, 2).join(', ') || 'sem teses'}`
            );
            partes.push(`Processos recentes com contexto:\n${factLines.join('\n')}`);
        }

        if (similares.length > 0) {
            const resumo = similares.map(s =>
                `• "${s.objetivo.substring(0, 50)}..." → ${s.sucesso ? 'OK' : 'Falha'}`
            ).join('\n');
            partes.push(`Interações anteriores similares:\n${resumo}`);
        }

        if (aprendizados.length > 0) {
            partes.push(`Aprendizados: ${aprendizados.join('; ')}`);
        }

        return partes.join('\n\n') || 'Sem contexto prévio relevante';
    }

    // ========================================================================
    // UTILIDADES
    // ========================================================================

    async limpar(): Promise<void> {
        this.data = { ...DEFAULTS };
        this.save();
        console.log('[Memory] Memória limpa');
    }

    async getStats(): Promise<{
        totalInteracoes: number;
        totalProcessos: number;
        totalAprendizados: number;
    }> {
        return {
            totalInteracoes: (this.data.interacoes ?? []).length,
            totalProcessos: (this.data.processosRecentes ?? []).length,
            totalAprendizados: (this.data.aprendizados ?? []).length
        };
    }
}

// Export singleton instance getter
export const getMemory = () => Memory.getInstance();
