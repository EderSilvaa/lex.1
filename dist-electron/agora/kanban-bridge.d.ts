export interface KanbanBridgeResult {
    ok: boolean;
    cards?: any[];
    card?: any;
    removed?: boolean;
    dispatch?: any;
    runs?: any[];
    log?: string;
    error?: string;
}
export declare function isKanbanBridgeAvailable(): boolean;
export declare function runKanbanBridge(action: string, args?: Record<string, any>): Promise<KanbanBridgeResult>;
//# sourceMappingURL=kanban-bridge.d.ts.map