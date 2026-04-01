/**
 * Lote Store — Persistência de BatchLotes
 *
 * Segue o padrão GoalStore (electron-store, singleton, async CRUD).
 */

import { randomUUID } from 'crypto';
import type { LoteId, BatchLote, LoteStatus } from './types';

export class LoteStore {
    private store: any = null;
    private storeReady = false;

    constructor() {
        this.tryLoadStore();
    }

    private async tryLoadStore(): Promise<void> {
        try {
            const Store = (await import('electron-store')).default;
            this.store = new Store({ name: 'lex-batch-lotes' });
            this.storeReady = true;
        } catch {
            // Fora do Electron — silently degrade
        }
    }

    private async ensureStore(): Promise<boolean> {
        if (this.storeReady) return true;
        await this.tryLoadStore();
        return this.storeReady;
    }

    // ========================================================================
    // LOTES CRUD
    // ========================================================================

    async addLote(input: Omit<BatchLote, 'id' | 'createdAt' | 'updatedAt'>): Promise<BatchLote> {
        if (!await this.ensureStore()) throw new Error('Store não disponível');

        const lote: BatchLote = {
            ...input,
            id: randomUUID(),
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        };

        const lotes = this.getLotesMap();
        lotes[lote.id] = lote;
        this.store.set('lotes', lotes);

        console.log(`[LoteStore] Lote criado: ${lote.nome} (${lote.id}) — ${lote.totalProcessos} processos`);
        return lote;
    }

    async updateLote(id: LoteId, updates: Partial<BatchLote>): Promise<BatchLote | null> {
        if (!await this.ensureStore()) return null;

        const lotes = this.getLotesMap();
        if (!lotes[id]) return null;

        lotes[id] = {
            ...lotes[id],
            ...updates,
            id,  // id nunca muda
            updatedAt: new Date().toISOString(),
        };
        this.store.set('lotes', lotes);
        return lotes[id];
    }

    async removeLote(id: LoteId): Promise<boolean> {
        if (!await this.ensureStore()) return false;

        const lotes = this.getLotesMap();
        if (!lotes[id]) return false;

        delete lotes[id];
        this.store.set('lotes', lotes);

        console.log(`[LoteStore] Lote removido: ${id}`);
        return true;
    }

    getLote(id: LoteId): BatchLote | null {
        if (!this.storeReady) return null;
        const lotes = this.getLotesMap();
        return lotes[id] || null;
    }

    getAllLotes(): BatchLote[] {
        if (!this.storeReady) return [];
        const lotes = Object.values(this.getLotesMap());
        // Ordena por mais recente primeiro
        return lotes.sort((a, b) =>
            new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
        );
    }

    getActiveLotes(): BatchLote[] {
        return this.getAllLotes().filter(l =>
            !['completed', 'cancelled', 'error'].includes(l.status)
        );
    }

    async setStatus(id: LoteId, status: LoteStatus): Promise<void> {
        await this.updateLote(id, { status });
    }

    // ========================================================================
    // WAVE UPDATES
    // ========================================================================

    async updateWave(loteId: LoteId, waveIndex: number, updates: Record<string, any>): Promise<BatchLote | null> {
        const lote = this.getLote(loteId);
        if (!lote) return null;

        const wave = lote.waves[waveIndex];
        if (!wave) return null;

        lote.waves[waveIndex] = { ...wave, ...updates };
        return this.updateLote(loteId, { waves: lote.waves });
    }

    // ========================================================================
    // INTERNALS
    // ========================================================================

    private getLotesMap(): Record<LoteId, BatchLote> {
        return this.store.get('lotes', {}) as Record<LoteId, BatchLote>;
    }
}

// Singleton
let instance: LoteStore | null = null;
export function getLoteStore(): LoteStore {
    if (!instance) instance = new LoteStore();
    return instance;
}
