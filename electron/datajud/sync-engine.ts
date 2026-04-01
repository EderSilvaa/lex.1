/**
 * Sync Engine — Orquestrador HOT/WARM/COLD
 *
 * Self-managed timers (mesmo padrão do legislacao-downloader):
 * - HOT: polling 30min dos processos monitorados via DataJud
 * - WARM: sync 1x/dia de jurisprudência dos tribunais
 * - COLD: query on-demand, sem persistência
 *
 * Backoff exponencial em erros consecutivos.
 * Offline-safe: skip ciclo sem crash.
 */

import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
    SyncState, SyncEvent, SyncResult, ProcessoDataJud, StoredDecisao,
    DEFAULT_SYNC_STATE, DEFAULT_HOT_INTERVAL_MS, DEFAULT_WARM_INTERVAL_MS,
    MAX_BACKOFF_MS, RATE_LIMIT_MS,
} from './types';
import { DataJudClient, hashMovimentacoes } from './datajud-client';
import { getProfile, getActiveProcessos, updateMonitoredProcesso, getDataJudApiKey } from './user-profile';
import { upsertProcesso } from './processo-store';
import { addDecisoes } from './jurisprudencia-store';

const DATAJUD_DIR = path.join(os.homedir(), '.lex', 'datajud');
const SYNC_STATE_FILE = path.join(DATAJUD_DIR, 'sync-state.json');
const RAG_DIR = path.join(DATAJUD_DIR, 'rag');

// ── Sync Engine ──────────────────────────────────────────────────────

export class SyncEngine {
    private hotTimer: ReturnType<typeof setInterval> | null = null;
    private warmTimer: ReturnType<typeof setInterval> | null = null;
    private client: DataJudClient | null = null;
    private state: SyncState = { ...DEFAULT_SYNC_STATE };
    private running = false;
    private hotRunning = false;
    private warmRunning = false;

    readonly emitter = new EventEmitter();

    // ── Lifecycle ────────────────────────────────────────────────────

    async start(): Promise<void> {
        if (this.running) return;

        // Carrega estado persistido
        this.loadState();

        // Verifica se tem API key
        const apiKey = await getDataJudApiKey();
        if (!apiKey) {
            console.log('[SyncEngine] Sem API key DataJud — dormindo. Configure em Configurações > DataJud.');
            return;
        }

        this.client = new DataJudClient(apiKey);
        this.running = true;

        // HOT: primeira execução em 30s, depois a cada intervalo
        const hotInterval = this.getEffectiveHotInterval();
        setTimeout(() => {
            this.runHotSync().catch(e => console.warn('[SyncEngine] HOT sync falhou:', e.message));
        }, 30_000);
        this.hotTimer = setInterval(() => {
            this.runHotSync().catch(e => console.warn('[SyncEngine] HOT sync falhou:', e.message));
        }, hotInterval);

        // WARM: primeira execução em 5min, depois a cada intervalo
        const warmInterval = this.state.warmSyncIntervalMs || DEFAULT_WARM_INTERVAL_MS;
        setTimeout(() => {
            this.runWarmSync().catch(e => console.warn('[SyncEngine] WARM sync falhou:', e.message));
        }, 5 * 60_000);
        this.warmTimer = setInterval(() => {
            this.runWarmSync().catch(e => console.warn('[SyncEngine] WARM sync falhou:', e.message));
        }, warmInterval);

        console.log(`[SyncEngine] Iniciado — HOT: ${Math.round(hotInterval / 60_000)}min, WARM: ${Math.round(warmInterval / 3600_000)}h`);
    }

    stop(): void {
        if (this.hotTimer) { clearInterval(this.hotTimer); this.hotTimer = null; }
        if (this.warmTimer) { clearInterval(this.warmTimer); this.warmTimer = null; }
        this.running = false;
        this.saveState();
        console.log('[SyncEngine] Parado');
    }

    /** Reinicia com nova API key (ex: após configuração) */
    async restart(): Promise<void> {
        this.stop();
        await this.start();
    }

    // ── HOT Sync ─────────────────────────────────────────────────────

    async runHotSync(): Promise<SyncResult> {
        if (this.hotRunning || !this.client) {
            return { type: 'hot', checked: 0, newItems: 0, errors: 0, durationMs: 0 };
        }

        this.hotRunning = true;
        const startTime = Date.now();
        let checked = 0;
        let newMovements = 0;
        let errors = 0;

        this.emit({ type: 'hot_start', data: null, timestamp: new Date().toISOString() });

        try {
            const processos = await getActiveProcessos();

            for (const proc of processos) {
                try {
                    const movs = await this.client.buscarMovimentacoes(proc.numero, proc.tribunal);
                    checked++;

                    if (movs.length > 0) {
                        const newHash = hashMovimentacoes(movs);

                        if (proc.ultimaMovimentacaoHash && newHash !== proc.ultimaMovimentacaoHash) {
                            // Nova movimentação detectada!
                            newMovements++;

                            // Busca dados completos do processo
                            const full = await this.client.buscarPorNumero(proc.numero, proc.tribunal);
                            if (full) upsertProcesso(full);

                            // Atualiza hash no profile
                            await updateMonitoredProcesso(proc.numero, {
                                ultimaMovimentacaoHash: newHash,
                                ultimaMovimentacaoData: movs[0]!.dataHora,
                            });

                            // Notifica
                            const movNome = movs[0]!.nome || 'Nova movimentação';
                            this.emit({
                                type: 'movement_detected',
                                data: {
                                    numero: proc.numero,
                                    apelido: proc.apelido,
                                    tribunal: proc.tribunal,
                                    movimentacao: movNome,
                                    dataHora: movs[0]!.dataHora,
                                },
                                timestamp: new Date().toISOString(),
                            });

                            // Notificação via sistema de notificações
                            try {
                                const { notify } = await import('../notifications');
                                await notify({
                                    title: `Nova movimentação: ${proc.apelido || proc.numero}`,
                                    body: `${movNome}${movs[0]!.dataHora ? ` — ${movs[0]!.dataHora}` : ''}`,
                                    urgency: 'high',
                                    channels: ['toast', 'telegram', 'badge'],
                                });
                            } catch { /* notification optional */ }

                            console.log(`[SyncEngine] 🔴 Movimentação nova: ${proc.apelido || proc.numero} — ${movNome}`);
                        } else if (!proc.ultimaMovimentacaoHash) {
                            // Primeira vez — salva hash sem notificar
                            await updateMonitoredProcesso(proc.numero, {
                                ultimaMovimentacaoHash: newHash,
                                ultimaMovimentacaoData: movs[0]!.dataHora,
                            });

                            // Salva dados completos
                            const full = await this.client.buscarPorNumero(proc.numero, proc.tribunal);
                            if (full) upsertProcesso(full);
                        }
                    }

                    // Rate limit entre processos
                    if (processos.indexOf(proc) < processos.length - 1) {
                        await delay(RATE_LIMIT_MS);
                    }
                } catch (err: any) {
                    errors++;
                    console.warn(`[SyncEngine] Erro ao consultar ${proc.numero}:`, err.message);
                }
            }

            // Reset erro counter em caso de sucesso
            if (errors === 0) {
                this.state.consecutiveErrors = 0;
            } else {
                this.state.consecutiveErrors++;
            }

            this.state.lastHotSync = new Date().toISOString();
            this.saveState();

        } catch (err: any) {
            this.state.consecutiveErrors++;
            this.state.lastError = err.message;
            this.saveState();
            this.emit({ type: 'error', data: { phase: 'hot', error: err.message }, timestamp: new Date().toISOString() });
        }

        this.hotRunning = false;

        const result: SyncResult = {
            type: 'hot',
            checked,
            newItems: newMovements,
            errors,
            durationMs: Date.now() - startTime,
        };

        this.emit({ type: 'hot_complete', data: result, timestamp: new Date().toISOString() });

        if (checked > 0) {
            console.log(`[SyncEngine] HOT sync: ${checked} consultados, ${newMovements} novas movimentações, ${errors} erros (${result.durationMs}ms)`);
        }

        return result;
    }

    // ── WARM Sync ────────────────────────────────────────────────────

    async runWarmSync(): Promise<SyncResult> {
        if (this.warmRunning) {
            return { type: 'warm', checked: 0, newItems: 0, errors: 0, durationMs: 0 };
        }

        this.warmRunning = true;
        const startTime = Date.now();
        let fetched = 0;
        let indexed = 0;
        let errors = 0;

        this.emit({ type: 'warm_start', data: null, timestamp: new Date().toISOString() });

        try {
            const profile = await getProfile();
            const { areasAtuacao, keywords } = profile;

            if (areasAtuacao.length === 0 && keywords.length === 0) {
                console.log('[SyncEngine] WARM sync: sem áreas ou keywords configuradas, pulando.');
                this.warmRunning = false;
                return { type: 'warm', checked: 0, newItems: 0, errors: 0, durationMs: Date.now() - startTime };
            }

            // Importa buscadores do jurisprudencia.ts
            let BUSCADORES: Record<string, (consulta: string, limite: number) => Promise<any[]>>;
            let AREAS: Record<string, string[]>;
            try {
                const jurisp = require('../skills/pesquisa/jurisprudencia');
                BUSCADORES = jurisp.BUSCADORES;
                AREAS = jurisp.AREAS;
                if (!BUSCADORES || !AREAS) throw new Error('Exports not found');
            } catch {
                console.warn('[SyncEngine] WARM sync: parsers de jurisprudência não disponíveis.');
                this.warmRunning = false;
                return { type: 'warm', checked: 0, newItems: 0, errors: 0, durationMs: Date.now() - startTime };
            }

            // Para cada keyword, busca nos tribunais da área
            const decisoesColetadas: StoredDecisao[] = [];

            for (const keyword of keywords.slice(0, 10)) { // max 10 keywords por ciclo
                // Determina tribunais relevantes pelas áreas do perfil
                const tribunais = new Set<string>();
                for (const area of areasAtuacao) {
                    const areaTribunais = AREAS[area] || AREAS['todos'] || [];
                    for (const t of areaTribunais) tribunais.add(t);
                }

                for (const tribunal of tribunais) {
                    const buscador = BUSCADORES[tribunal];
                    if (!buscador) continue;

                    try {
                        const resultados = await buscador(keyword, 5);
                        fetched += resultados.length;

                        for (const r of resultados) {
                            decisoesColetadas.push({
                                id: `${r.tribunal || tribunal}:${r.numero || `${Date.now()}`}`,
                                tribunal: r.tribunal || tribunal,
                                numero: r.numero || '',
                                ementa: r.ementa || '',
                                data: r.data,
                                relator: r.relator,
                                url: r.url,
                                area: areasAtuacao[0],
                                keywords: keyword.toLowerCase().split(/\s+/).filter((w: string) => w.length >= 3),
                                fonte: 'sync',
                                fetchedAt: new Date().toISOString(),
                            });
                        }

                        // Rate limit entre tribunais
                        await delay(RATE_LIMIT_MS);
                    } catch (err: any) {
                        errors++;
                        console.warn(`[SyncEngine] WARM: erro em ${tribunal} para "${keyword}":`, err.message);
                    }
                }
            }

            // Salva no store
            if (decisoesColetadas.length > 0) {
                indexed = addDecisoes(decisoesColetadas);
            }

            // Gera arquivos para RAG
            this.generateRagFiles(decisoesColetadas);

            // Extrai citações jurídicas das ementas para enriquecer legal-store
            try {
                const { extractAndSave } = require('../legal/legal-extractor');
                const allEmentas = decisoesColetadas.map(d => d.ementa).join('\n');
                if (allEmentas.length > 10) {
                    extractAndSave(allEmentas);
                }
            } catch { /* legal extractor optional */ }

            this.state.lastWarmSync = new Date().toISOString();
            this.saveState();

        } catch (err: any) {
            this.state.lastError = err.message;
            this.saveState();
            this.emit({ type: 'error', data: { phase: 'warm', error: err.message }, timestamp: new Date().toISOString() });
        }

        this.warmRunning = false;

        const result: SyncResult = {
            type: 'warm',
            checked: fetched,
            newItems: indexed,
            errors,
            durationMs: Date.now() - startTime,
        };

        this.emit({ type: 'warm_complete', data: result, timestamp: new Date().toISOString() });
        console.log(`[SyncEngine] WARM sync: ${fetched} coletados, ${indexed} novos, ${errors} erros (${result.durationMs}ms)`);

        return result;
    }

    // ── COLD Query (on-demand) ───────────────────────────────────────

    async queryCold(numero: string, tribunal?: string): Promise<ProcessoDataJud | null> {
        if (!this.client) {
            const apiKey = await getDataJudApiKey();
            if (!apiKey) return null;
            this.client = new DataJudClient(apiKey);
        }
        return this.client.buscarPorNumero(numero, tribunal);
    }

    // ── RAG file generation ──────────────────────────────────────────

    private generateRagFiles(decisoes: StoredDecisao[]): void {
        if (decisoes.length === 0) return;

        try {
            fs.mkdirSync(RAG_DIR, { recursive: true });

            // Agrupa por área
            const byArea: Record<string, StoredDecisao[]> = {};
            for (const d of decisoes) {
                const area = d.area || 'geral';
                if (!byArea[area]) byArea[area] = [];
                byArea[area]!.push(d);
            }

            // Gera 1 arquivo .txt por área
            for (const [area, areaDecisoes] of Object.entries(byArea)) {
                const lines = areaDecisoes.map(d => {
                    let line = `[${d.tribunal}] ${d.numero}`;
                    if (d.data) line += ` (${d.data})`;
                    if (d.relator) line += ` — Rel. ${d.relator}`;
                    line += `\n${d.ementa}\n`;
                    return line;
                });

                const filePath = path.join(RAG_DIR, `jurisprudencia-${area}.txt`);
                fs.writeFileSync(filePath, lines.join('\n---\n\n'), 'utf-8');
            }

            console.log(`[SyncEngine] RAG files gerados em ${RAG_DIR}`);
        } catch (err: any) {
            console.warn('[SyncEngine] Erro ao gerar RAG files:', err.message);
        }
    }

    // ── State persistence ────────────────────────────────────────────

    private loadState(): void {
        try {
            if (fs.existsSync(SYNC_STATE_FILE)) {
                const raw = fs.readFileSync(SYNC_STATE_FILE, 'utf-8');
                this.state = { ...DEFAULT_SYNC_STATE, ...JSON.parse(raw) };
            }
        } catch {
            this.state = { ...DEFAULT_SYNC_STATE };
        }
    }

    private saveState(): void {
        try {
            fs.mkdirSync(DATAJUD_DIR, { recursive: true });
            fs.writeFileSync(SYNC_STATE_FILE, JSON.stringify(this.state, null, 2));
        } catch { /* non-critical */ }
    }

    getState(): SyncState {
        return { ...this.state };
    }

    // ── Backoff ──────────────────────────────────────────────────────

    private getEffectiveHotInterval(): number {
        const base = this.state.hotSyncIntervalMs || DEFAULT_HOT_INTERVAL_MS;
        if (this.state.consecutiveErrors <= 3) return base;

        // Exponential backoff: double per error after 3
        const multiplier = Math.pow(2, this.state.consecutiveErrors - 3);
        return Math.min(base * multiplier, MAX_BACKOFF_MS);
    }

    // ── Event helpers ────────────────────────────────────────────────

    private emit(event: SyncEvent): void {
        this.emitter.emit('sync-event', event);
    }

    on(event: string, listener: (...args: any[]) => void): void {
        this.emitter.on(event, listener);
    }

    off(event: string, listener: (...args: any[]) => void): void {
        this.emitter.off(event, listener);
    }

    isRunning(): boolean { return this.running; }
}

// ── Helper ───────────────────────────────────────────────────────────

function delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}
