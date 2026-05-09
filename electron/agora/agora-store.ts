import { randomUUID } from 'crypto';
import type { AgoraCard, AgoraCardInput, AgoraCardUpdate, AgoraColumnId } from './types';
import { AGORA_COLUMNS } from './types';

type AgoraCardMap = Record<string, AgoraCard>;

const DEFAULT_CARD: Omit<AgoraCard, 'id' | 'title' | 'createdAt' | 'updatedAt'> = {
    column: 'entrada',
    type: 'Tarefa',
    summary: 'Rascunho local pronto para conectar ao orquestrador.',
    agent: 'Orquestrador',
    guardrail: 'Aguardando escopo',
    priority: 'Media',
    progress: 5,
    source: 'local',
};

export class AgoraStore {
    private store: any = null;
    private storeReady = false;

    constructor() {
        this.tryLoadStore();
    }

    private async tryLoadStore(): Promise<void> {
        try {
            const Store = (await import('electron-store')).default;
            this.store = new Store({ name: 'lex-agora-board' });
            this.storeReady = true;
        } catch {
            // Fora do Electron, degrada sem persistencia.
        }
    }

    private async ensureStore(): Promise<boolean> {
        if (this.storeReady) return true;
        await this.tryLoadStore();
        return this.storeReady;
    }

    async addCard(input: AgoraCardInput): Promise<AgoraCard> {
        if (!await this.ensureStore()) throw new Error('Agora store nao disponivel');

        const now = new Date().toISOString();
        const card: AgoraCard = this.normalizeCard({
            ...DEFAULT_CARD,
            ...input,
            id: randomUUID(),
            title: input.title || 'Nova tarefa juridica',
            createdAt: now,
            updatedAt: now,
        });

        const cards = this.getCardsMap();
        cards[card.id] = card;
        this.store.set('cards', cards);
        return card;
    }

    async updateCard(id: string, updates: AgoraCardUpdate): Promise<AgoraCard | null> {
        if (!await this.ensureStore()) return null;

        const cards = this.getCardsMap();
        if (!cards[id]) return null;

        const next = this.normalizeCard({
            ...cards[id],
            ...updates,
            id,
            updatedAt: new Date().toISOString(),
        });

        cards[id] = next;
        this.store.set('cards', cards);
        return next;
    }

    async moveCard(id: string, direction: number): Promise<AgoraCard | null> {
        if (!await this.ensureStore()) return null;

        const card = this.getCardsMap()[id];
        if (!card) return null;

        const index = AGORA_COLUMNS.indexOf(card.column);
        const nextColumn = AGORA_COLUMNS[index + direction];
        if (!nextColumn) return card;

        const nextProgress = Math.max(5, Math.min(100, card.progress + (direction > 0 ? 20 : -20)));
        return this.updateCard(id, { column: nextColumn, progress: nextProgress });
    }

    async removeCard(id: string): Promise<boolean> {
        if (!await this.ensureStore()) return false;

        const cards = this.getCardsMap();
        if (!cards[id]) return false;

        delete cards[id];
        this.store.set('cards', cards);
        return true;
    }

    async getCard(id: string): Promise<AgoraCard | null> {
        if (!await this.ensureStore()) return null;
        return this.getCardsMap()[id] || null;
    }

    async getAllCards(): Promise<AgoraCard[]> {
        if (!await this.ensureStore()) return [];
        return Object.values(this.getCardsMap()).sort((a, b) =>
            new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
        );
    }

    private getCardsMap(): AgoraCardMap {
        return this.store.get('cards', {}) as AgoraCardMap;
    }

    private normalizeCard(card: AgoraCard): AgoraCard {
        const column = AGORA_COLUMNS.includes(card.column) ? card.column : 'entrada';
        const priority = ['Alta', 'Media', 'Baixa'].includes(card.priority) ? card.priority : 'Media';
        const source = ['local', 'batch', 'engine'].includes(card.source) ? card.source : 'local';
        const progress = Math.max(0, Math.min(100, Number(card.progress) || 0));

        return {
            ...card,
            column: column as AgoraColumnId,
            priority: priority as AgoraCard['priority'],
            progress,
            type: String(card.type || 'Tarefa').slice(0, 40),
            title: String(card.title || 'Nova tarefa juridica').slice(0, 160),
            summary: String(card.summary || '').slice(0, 420),
            agent: String(card.agent || 'Orquestrador').slice(0, 80),
            guardrail: String(card.guardrail || 'Aguardando escopo').slice(0, 80),
            source: source as AgoraCard['source'],
        };
    }
}

let instance: AgoraStore | null = null;

export function getAgoraStore(): AgoraStore {
    if (!instance) instance = new AgoraStore();
    return instance;
}
