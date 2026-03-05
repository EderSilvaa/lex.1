/**
 * Response Cache (B1)
 *
 * Cache em memória para respostas do agente.
 * Evita chamadas duplicadas de LLM para perguntas recentes.
 */

import { createHash } from 'crypto';

// ============================================================================
// TYPES
// ============================================================================

interface CacheEntry {
    response: string;
    timestamp: number;
    hitCount: number;
    queryOriginal: string;
}

interface CacheStats {
    size: number;
    hits: number;
    misses: number;
    estimatedSavings: string;  // em USD aproximado
}

// ============================================================================
// CACHE CLASS
// ============================================================================

export class ResponseCache {
    private cache = new Map<string, CacheEntry>();
    private ttlMs: number;
    private maxSize: number;
    private hits = 0;
    private misses = 0;

    /**
     * @param ttlMs - Time-to-live em ms (default: 30 minutos)
     * @param maxSize - Máximo de entradas no cache (default: 200)
     */
    constructor(ttlMs: number = 30 * 60 * 1000, maxSize: number = 200) {
        this.ttlMs = ttlMs;
        this.maxSize = maxSize;
    }

    /**
     * Busca resposta no cache
     */
    get(query: string): string | null {
        const key = this.hashQuery(query);
        const entry = this.cache.get(key);

        if (!entry) {
            this.misses++;
            return null;
        }

        // Verificar TTL
        if (Date.now() - entry.timestamp > this.ttlMs) {
            this.cache.delete(key);
            this.misses++;
            return null;
        }

        entry.hitCount++;
        this.hits++;
        console.log(`[Cache] HIT para: "${query.substring(0, 60)}..." (${entry.hitCount}x)`);
        return entry.response;
    }

    /**
     * Salva resposta no cache
     * Não salva respostas que vieram de execução de skills (apenas respostas diretas)
     */
    set(query: string, response: string): void {
        // Não cachear respostas muito curtas (provavelmente erros)
        if (response.length < 20) return;

        // Evict mais antigo se cheio
        if (this.cache.size >= this.maxSize) {
            this.evictOldest();
        }

        const key = this.hashQuery(query);
        this.cache.set(key, {
            response,
            timestamp: Date.now(),
            hitCount: 0,
            queryOriginal: query.substring(0, 100)
        });

        console.log(`[Cache] Salvo: "${query.substring(0, 60)}..." (total: ${this.cache.size})`);
    }

    /**
     * Verifica se uma query deve usar cache
     * Skills de ação real (PJe, gerar docs) NÃO devem ser cacheadas
     */
    shouldCache(query: string): boolean {
        const lowerQuery = query.toLowerCase();
        const noCache = [
            // Ações destrutivas / protocolares
            'protocolar', 'assinar', 'juntar', 'peticionar',
            'gerar documento', 'gerar petição', 'criar',
            // Comandos operacionais do PJe — sempre precisam executar a skill
            'pje', 'abre', 'abrir', 'abra', 'login',
            'navega', 'navegar', 'naveg',
            'consulta', 'consultar', 'processo',
            'movimentac', 'documento', 'peticionamento',
            'clica', 'clicar', 'preenche', 'preencher'
        ];
        return !noCache.some(term => lowerQuery.includes(term));
    }

    /**
     * Estatísticas do cache
     */
    getStats(): CacheStats {
        const total = this.hits + this.misses;
        const avgCostPerCall = 0.005; // ~$0.005/chamada
        return {
            size: this.cache.size,
            hits: this.hits,
            misses: this.misses,
            estimatedSavings: `$${(this.hits * avgCostPerCall).toFixed(2)} (${total > 0 ? Math.round((this.hits / total) * 100) : 0}% hit rate)`
        };
    }

    /**
     * Limpa cache
     */
    clear(): void {
        this.cache.clear();
        console.log('[Cache] Cache limpo');
    }

    /**
     * Remove entradas expiradas
     */
    cleanup(): void {
        const now = Date.now();
        let removed = 0;
        for (const [key, entry] of this.cache) {
            if (now - entry.timestamp > this.ttlMs) {
                this.cache.delete(key);
                removed++;
            }
        }
        if (removed > 0) {
            console.log(`[Cache] Cleanup: ${removed} entradas expiradas removidas`);
        }
    }

    // ========================================================================
    // PRIVATE
    // ========================================================================

    private hashQuery(query: string): string {
        // Normaliza: lowercase, remove espaços extras, pontuação
        const normalized = query
            .toLowerCase()
            .replace(/\s+/g, ' ')
            .replace(/[.,!?;:]+/g, '')
            .trim();

        return createHash('sha256').update(normalized).digest('hex').substring(0, 16);
    }

    private evictOldest(): void {
        let oldestKey: string | null = null;
        let oldestTime = Infinity;

        for (const [key, entry] of this.cache) {
            if (entry.timestamp < oldestTime) {
                oldestTime = entry.timestamp;
                oldestKey = key;
            }
        }

        if (oldestKey) {
            this.cache.delete(oldestKey);
        }
    }
}

// ============================================================================
// SINGLETON
// ============================================================================

let cacheInstance: ResponseCache | null = null;

export function getResponseCache(): ResponseCache {
    if (!cacheInstance) {
        cacheInstance = new ResponseCache();
    }
    return cacheInstance;
}
