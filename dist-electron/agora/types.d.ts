export type AgoraColumnId = 'entrada' | 'especificacao' | 'pronto_execucao' | 'execucao' | 'revisao' | 'pronto';
export type AgoraPriority = 'Alta' | 'Media' | 'Baixa';
export type AgoraSource = 'local' | 'batch' | 'engine';
export interface AgoraCard {
    id: string;
    column: AgoraColumnId;
    type: string;
    title: string;
    summary: string;
    agent: string;
    guardrail: string;
    priority: AgoraPriority;
    progress: number;
    source: AgoraSource;
    createdAt: string;
    updatedAt: string;
}
export interface AgoraCardInput {
    column?: AgoraColumnId;
    type?: string;
    title: string;
    summary?: string;
    agent?: string;
    guardrail?: string;
    priority?: AgoraPriority;
    progress?: number;
    source?: AgoraSource;
}
export type AgoraCardUpdate = Partial<Omit<AgoraCardInput, 'source'>> & {
    source?: AgoraSource;
};
export interface AgoraEvent {
    type: 'card_created' | 'card_updated' | 'card_moved' | 'card_removed';
    cardId: string;
    card?: AgoraCard;
    timestamp: string;
}
export declare const AGORA_COLUMNS: AgoraColumnId[];
//# sourceMappingURL=types.d.ts.map