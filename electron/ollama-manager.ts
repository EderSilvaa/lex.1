/**
 * Ollama Manager — Gerenciamento de Modelos Locais
 *
 * Detecta, gerencia e controla o Ollama para inferência 100% local.
 * Padrão B1: Ollama como dependência invisível — o usuário só vê "Modelo Local".
 *
 * API do Ollama usada:
 *   GET  /api/tags       → lista modelos instalados
 *   POST /api/pull        → baixa modelo (streaming de progresso)
 *   DELETE /api/delete    → remove modelo
 *   GET  /                → health check
 */

import { EventEmitter } from 'events';

// ============================================================================
// CONFIG
// ============================================================================

const OLLAMA_BASE = 'http://localhost:11434';
const HEALTH_TIMEOUT_MS = 3000;
const PULL_TIMEOUT_MS = 30 * 60 * 1000; // 30min para downloads grandes

// ============================================================================
// TYPES
// ============================================================================

export interface OllamaModel {
    name: string;          // ex: "llama3.1:8b"
    size: number;          // bytes
    sizeHuman: string;     // ex: "4.7 GB"
    modifiedAt: string;    // ISO date
    digest: string;
}

export interface OllamaStatus {
    running: boolean;
    models: OllamaModel[];
    version?: string;
}

export interface PullProgress {
    status: string;        // "pulling manifest", "downloading", "verifying", "success"
    digest?: string;
    total?: number;
    completed?: number;
    percent: number;       // 0-100
}

/** Modelos recomendados para a LEX com metadados para a UI */
export interface RecommendedModel {
    id: string;
    name: string;
    size: string;          // ex: "4.7 GB"
    description: string;
    vision: boolean;
    minRam: string;        // ex: "8 GB"
    quality: 'basico' | 'bom' | 'otimo';
}

export const RECOMMENDED_MODELS: RecommendedModel[] = [
    // Texto
    {
        id: 'llama3.1:8b',
        name: 'Llama 3.1 8B',
        size: '4.7 GB',
        description: 'Leve e rapido — roda em qualquer PC com 8GB RAM',
        vision: false,
        minRam: '8 GB',
        quality: 'basico'
    },
    {
        id: 'qwen2.5:14b',
        name: 'Qwen 2.5 14B',
        size: '8.9 GB',
        description: 'Bom equilibrio entre qualidade e velocidade',
        vision: false,
        minRam: '16 GB',
        quality: 'bom'
    },
    {
        id: 'deepseek-r1:14b',
        name: 'DeepSeek R1 14B',
        size: '9.0 GB',
        description: 'Especializado em raciocinio passo-a-passo',
        vision: false,
        minRam: '16 GB',
        quality: 'bom'
    },
    {
        id: 'llama3.1:70b',
        name: 'Llama 3.1 70B',
        size: '39 GB',
        description: 'Qualidade proxima de modelos cloud — requer GPU forte',
        vision: false,
        minRam: '48 GB',
        quality: 'otimo'
    },
    // Vision
    {
        id: 'llava:13b',
        name: 'LLaVA 13B',
        size: '8.0 GB',
        description: 'Analise de imagens e screenshots — browser automation local',
        vision: true,
        minRam: '16 GB',
        quality: 'bom'
    },
    {
        id: 'llava:34b',
        name: 'LLaVA 34B',
        size: '20 GB',
        description: 'Melhor vision local — requer GPU',
        vision: true,
        minRam: '24 GB',
        quality: 'otimo'
    },
];

// ============================================================================
// EMITTER (progresso de download para a UI)
// ============================================================================

export const ollamaEmitter = new EventEmitter();

// ============================================================================
// HEALTH CHECK
// ============================================================================

/**
 * Verifica se o Ollama está rodando.
 */
export async function isOllamaRunning(): Promise<boolean> {
    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), HEALTH_TIMEOUT_MS);
        const res = await fetch(OLLAMA_BASE, { signal: controller.signal });
        clearTimeout(timeout);
        return res.ok;
    } catch {
        return false;
    }
}

/**
 * Retorna status completo: running + modelos instalados.
 */
export async function getOllamaStatus(): Promise<OllamaStatus> {
    const running = await isOllamaRunning();
    if (!running) {
        return { running: false, models: [] };
    }

    const models = await listModels();

    let version: string | undefined;
    try {
        const res = await fetch(`${OLLAMA_BASE}/api/version`);
        if (res.ok) {
            const data = await res.json();
            version = data.version;
        }
    } catch { /* ignore */ }

    return { running, models, version };
}

// ============================================================================
// MODEL MANAGEMENT
// ============================================================================

/**
 * Lista modelos instalados no Ollama.
 */
export async function listModels(): Promise<OllamaModel[]> {
    try {
        const res = await fetch(`${OLLAMA_BASE}/api/tags`);
        if (!res.ok) return [];

        const data = await res.json();
        const models = data.models || [];

        return models.map((m: any) => ({
            name: m.name || m.model,
            size: m.size || 0,
            sizeHuman: formatBytes(m.size || 0),
            modifiedAt: m.modified_at || '',
            digest: m.digest || ''
        }));
    } catch {
        return [];
    }
}

/**
 * Baixa um modelo. Emite eventos de progresso via ollamaEmitter.
 * Retorna true se sucesso.
 */
export async function pullModel(modelName: string): Promise<boolean> {
    console.log(`[Ollama] Iniciando download: ${modelName}`);
    ollamaEmitter.emit('pull-start', { model: modelName });

    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), PULL_TIMEOUT_MS);

        const res = await fetch(`${OLLAMA_BASE}/api/pull`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: modelName, stream: true }),
            signal: controller.signal
        });

        clearTimeout(timeout);

        if (!res.ok || !res.body) {
            throw new Error(`HTTP ${res.status}`);
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
                if (!line.trim()) continue;
                try {
                    const data = JSON.parse(line);
                    const progress: PullProgress = {
                        status: data.status || '',
                        digest: data.digest,
                        total: data.total,
                        completed: data.completed,
                        percent: data.total ? Math.round((data.completed || 0) / data.total * 100) : 0
                    };

                    ollamaEmitter.emit('pull-progress', {
                        model: modelName,
                        ...progress
                    });

                    if (data.status === 'success') {
                        console.log(`[Ollama] Download concluido: ${modelName}`);
                        ollamaEmitter.emit('pull-complete', { model: modelName });
                        return true;
                    }
                } catch { /* linha JSON malformada, ignora */ }
            }
        }

        // Se saiu do loop sem "success", verifica se o modelo existe
        const models = await listModels();
        const exists = models.some(m => m.name === modelName || m.name.startsWith(modelName.split(':')[0]!));
        if (exists) {
            ollamaEmitter.emit('pull-complete', { model: modelName });
            return true;
        }

        ollamaEmitter.emit('pull-error', { model: modelName, error: 'Download terminou sem confirmacao' });
        return false;

    } catch (e: any) {
        console.error(`[Ollama] Erro no download de ${modelName}:`, e.message);
        ollamaEmitter.emit('pull-error', { model: modelName, error: e.message });
        return false;
    }
}

/**
 * Remove um modelo instalado.
 */
export async function deleteModel(modelName: string): Promise<boolean> {
    try {
        const res = await fetch(`${OLLAMA_BASE}/api/delete`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: modelName })
        });
        if (res.ok) {
            console.log(`[Ollama] Modelo removido: ${modelName}`);
        }
        return res.ok;
    } catch {
        return false;
    }
}

/**
 * Verifica se um modelo específico está instalado.
 */
export async function hasModel(modelName: string): Promise<boolean> {
    const models = await listModels();
    const baseName = modelName.split(':')[0]!;
    return models.some(m => m.name === modelName || m.name.startsWith(baseName + ':'));
}

/**
 * Retorna lista de modelos recomendados com status de instalação.
 */
export async function getRecommendedModelsWithStatus(): Promise<Array<RecommendedModel & { installed: boolean }>> {
    const installed = await listModels();
    const installedNames = new Set(installed.map(m => m.name));

    return RECOMMENDED_MODELS.map(rec => ({
        ...rec,
        installed: installedNames.has(rec.id) || installed.some(m => m.name.startsWith(rec.id.split(':')[0]! + ':'))
    }));
}

// ============================================================================
// HELPERS
// ============================================================================

function formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    const value = bytes / Math.pow(1024, i);
    return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[i]}`;
}
