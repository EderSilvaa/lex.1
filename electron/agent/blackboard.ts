/**
 * Blackboard — Shared Context Store (Phase 1 AIOS)
 *
 * Padrão blackboard: agentes postam resultados, outros lêem.
 * Uma instância por execução de Plan.
 */

export class Blackboard {
    private store = new Map<string, any>();

    set(key: string, value: any): void {
        this.store.set(key, value);
    }

    get<T = any>(key: string): T | undefined {
        return this.store.get(key) as T | undefined;
    }

    has(key: string): boolean {
        return this.store.has(key);
    }

    getAll(): Record<string, any> {
        const obj: Record<string, any> = {};
        this.store.forEach((v, k) => { obj[k] = v; });
        return obj;
    }

    /** Retorna todos os resultados de subtasks postados até agora */
    getSubtaskResults(): Record<string, string> {
        const results: Record<string, string> = {};
        this.store.forEach((v, k) => {
            if (k.startsWith('result:')) {
                results[k.replace('result:', '')] = String(v);
            }
        });
        return results;
    }

    /** Formata resultados como contexto para injetar no prompt de um agente */
    formatAsContext(): string {
        const results = this.getSubtaskResults();
        const entries = Object.entries(results);
        if (entries.length === 0) return '';

        return entries
            .map(([id, result]) => `[Subtask ${id}]: ${result.substring(0, 1000)}`)
            .join('\n\n');
    }

    clear(): void {
        this.store.clear();
    }
}
