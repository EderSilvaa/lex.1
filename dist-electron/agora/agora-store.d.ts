import type { AgoraCard, AgoraCardInput, AgoraCardUpdate } from './types';
export declare class AgoraStore {
    private store;
    private storeReady;
    constructor();
    private tryLoadStore;
    private ensureStore;
    addCard(input: AgoraCardInput): Promise<AgoraCard>;
    updateCard(id: string, updates: AgoraCardUpdate): Promise<AgoraCard | null>;
    moveCard(id: string, direction: number): Promise<AgoraCard | null>;
    removeCard(id: string): Promise<boolean>;
    getCard(id: string): Promise<AgoraCard | null>;
    getAllCards(): Promise<AgoraCard[]>;
    private getCardsMap;
    private normalizeCard;
}
export declare function getAgoraStore(): AgoraStore;
//# sourceMappingURL=agora-store.d.ts.map