"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.AgoraStore = void 0;
exports.getAgoraStore = getAgoraStore;
const crypto_1 = require("crypto");
const types_1 = require("./types");
const DEFAULT_CARD = {
    column: 'entrada',
    type: 'Tarefa',
    summary: 'Rascunho local pronto para conectar ao orquestrador.',
    agent: 'Orquestrador',
    guardrail: 'Aguardando escopo',
    priority: 'Media',
    progress: 5,
    source: 'local',
};
class AgoraStore {
    constructor() {
        this.store = null;
        this.storeReady = false;
        this.tryLoadStore();
    }
    async tryLoadStore() {
        try {
            const Store = (await Promise.resolve().then(() => __importStar(require('electron-store')))).default;
            this.store = new Store({ name: 'lex-agora-board' });
            this.storeReady = true;
        }
        catch {
            // Fora do Electron, degrada sem persistencia.
        }
    }
    async ensureStore() {
        if (this.storeReady)
            return true;
        await this.tryLoadStore();
        return this.storeReady;
    }
    async addCard(input) {
        if (!await this.ensureStore())
            throw new Error('Agora store nao disponivel');
        const now = new Date().toISOString();
        const card = this.normalizeCard({
            ...DEFAULT_CARD,
            ...input,
            id: (0, crypto_1.randomUUID)(),
            title: input.title || 'Nova tarefa juridica',
            createdAt: now,
            updatedAt: now,
        });
        const cards = this.getCardsMap();
        cards[card.id] = card;
        this.store.set('cards', cards);
        return card;
    }
    async updateCard(id, updates) {
        if (!await this.ensureStore())
            return null;
        const cards = this.getCardsMap();
        if (!cards[id])
            return null;
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
    async moveCard(id, direction) {
        if (!await this.ensureStore())
            return null;
        const card = this.getCardsMap()[id];
        if (!card)
            return null;
        const index = types_1.AGORA_COLUMNS.indexOf(card.column);
        const nextColumn = types_1.AGORA_COLUMNS[index + direction];
        if (!nextColumn)
            return card;
        const nextProgress = Math.max(5, Math.min(100, card.progress + (direction > 0 ? 20 : -20)));
        return this.updateCard(id, { column: nextColumn, progress: nextProgress });
    }
    async removeCard(id) {
        if (!await this.ensureStore())
            return false;
        const cards = this.getCardsMap();
        if (!cards[id])
            return false;
        delete cards[id];
        this.store.set('cards', cards);
        return true;
    }
    async getCard(id) {
        if (!await this.ensureStore())
            return null;
        return this.getCardsMap()[id] || null;
    }
    async getAllCards() {
        if (!await this.ensureStore())
            return [];
        return Object.values(this.getCardsMap()).sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    }
    getCardsMap() {
        return this.store.get('cards', {});
    }
    normalizeCard(card) {
        const column = types_1.AGORA_COLUMNS.includes(card.column) ? card.column : 'entrada';
        const priority = ['Alta', 'Media', 'Baixa'].includes(card.priority) ? card.priority : 'Media';
        const source = ['local', 'batch', 'engine'].includes(card.source) ? card.source : 'local';
        const progress = Math.max(0, Math.min(100, Number(card.progress) || 0));
        return {
            ...card,
            column: column,
            priority: priority,
            progress,
            type: String(card.type || 'Tarefa').slice(0, 40),
            title: String(card.title || 'Nova tarefa juridica').slice(0, 160),
            summary: String(card.summary || '').slice(0, 420),
            agent: String(card.agent || 'Orquestrador').slice(0, 80),
            guardrail: String(card.guardrail || 'Aguardando escopo').slice(0, 80),
            source: source,
        };
    }
}
exports.AgoraStore = AgoraStore;
let instance = null;
function getAgoraStore() {
    if (!instance)
        instance = new AgoraStore();
    return instance;
}
//# sourceMappingURL=agora-store.js.map