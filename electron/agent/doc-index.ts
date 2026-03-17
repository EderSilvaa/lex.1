/**
 * Lex RAG — Document Index
 *
 * Indexa documentos do workspace do escritório usando TF-IDF + Similaridade Coseno.
 * Permite buscar chunks relevantes antes de cada resposta do agente.
 * Roda 100% local, sem custo de API de embeddings.
 */

import * as fs from 'fs';
import * as path from 'path';
import { saveEncrypted, loadEncrypted } from '../privacy/encrypted-storage';

const CHUNK_SIZE = 600;       // chars por chunk
const CHUNK_OVERLAP = 120;    // overlap para não perder contexto entre chunks
const MAX_CHUNKS_PER_DOC = 60;
const MIN_CHUNK_LENGTH = 60;
const EXTS_SUPORTADAS = ['.txt', '.md', '.docx', '.pdf'];

// ============================================================================
// TYPES
// ============================================================================

export interface DocChunk {
    id: string;        // `${filePath}::${index}`
    arquivo: string;   // nome do arquivo (basename)
    trecho: string;    // texto do chunk
    tokens: string[];  // tokens pré-calculados para reutilizar
}

export interface RagResultado {
    arquivo: string;
    trecho: string;
    score: number;
}

interface IndexStore {
    chunks: DocChunk[];
    indexadoEm: string;
    workspacePaths: string[];
}

// ============================================================================
// DOC INDEX (Singleton)
// ============================================================================

class DocIndex {
    private static instance: DocIndex;
    private chunks: DocChunk[] = [];
    private storePath: string | null = null;

    private constructor() {}

    static getInstance(): DocIndex {
        if (!DocIndex.instance) DocIndex.instance = new DocIndex();
        return DocIndex.instance;
    }

    /**
     * Deve ser chamado antes de qualquer uso, com app.getPath('userData').
     * Carrega o índice persistido em disco.
     */
    init(userDataDir: string): void {
        this.storePath = path.join(userDataDir, 'lex-doc-index.json');
        const data = loadEncrypted<IndexStore>(this.storePath, { chunks: [], indexadoEm: '', workspacePaths: [] });
        this.chunks = data.chunks ?? [];
        if (this.chunks.length > 0) {
            console.log(`[DocIndex] Carregados ${this.chunks.length} chunks do índice (criptografado)`);
        }
    }

    /**
     * Indexa todos os documentos dos workspaces.
     * Re-indexação completa — substitui o índice anterior.
     */
    async indexarWorkspace(workspacePaths: string[]): Promise<{ chunks: number; arquivos: number }> {
        const novosChunks: DocChunk[] = [];
        let arquivosIndexados = 0;

        for (const wsPath of workspacePaths) {
            if (!fs.existsSync(wsPath)) continue;
            const arquivos = this.listarArquivos(wsPath);

            for (const arquivo of arquivos) {
                const texto = await this.lerArquivo(arquivo);
                if (!texto || texto.length < MIN_CHUNK_LENGTH) continue;

                const chunks = this.chunkar(texto, arquivo);
                novosChunks.push(...chunks);
                arquivosIndexados++;
            }
        }

        this.chunks = novosChunks;
        this.persistir(workspacePaths);

        console.log(`[DocIndex] Indexados ${novosChunks.length} chunks de ${arquivosIndexados} arquivos`);
        return { chunks: novosChunks.length, arquivos: arquivosIndexados };
    }

    /**
     * Busca os chunks mais relevantes para uma query.
     * Retorna topK resultados ordenados por score TF-IDF.
     */
    buscarContexto(query: string, topK: number = 4): RagResultado[] {
        if (this.chunks.length === 0) return [];

        const queryTokens = this.tokenize(query);
        if (queryTokens.length === 0) return [];

        const allDocs = this.chunks.map(c => c.tokens);
        const idf = this.calcularIDF(allDocs, queryTokens);
        const queryVec = this.tfidfVector(queryTokens, idf);

        const scored = this.chunks.map(chunk => ({
            arquivo: chunk.arquivo,
            trecho: chunk.trecho,
            score: this.cosineSimilarity(queryVec, this.tfidfVector(chunk.tokens, idf))
        }));

        return scored
            .filter(s => s.score > 0.05)
            .sort((a, b) => b.score - a.score)
            .slice(0, topK);
    }

    getStats() {
        return {
            chunks: this.chunks.length,
            arquivos: new Set(this.chunks.map(c => c.arquivo)).size,
        };
    }

    // ========================================================================
    // HELPERS DE ARQUIVO
    // ========================================================================

    private listarArquivos(dir: string): string[] {
        const result: string[] = [];
        try {
            const entries = fs.readdirSync(dir, { withFileTypes: true });
            for (const e of entries) {
                if (e.name.startsWith('.')) continue;
                const full = path.join(dir, e.name);
                if (e.isDirectory()) {
                    result.push(...this.listarArquivos(full));
                } else if (EXTS_SUPORTADAS.includes(path.extname(e.name).toLowerCase())) {
                    result.push(full);
                }
            }
        } catch { /* ignora erros de permissão */ }
        return result;
    }

    private async lerArquivo(filePath: string): Promise<string> {
        try {
            const ext = path.extname(filePath).toLowerCase();

            if (ext === '.txt' || ext === '.md') {
                return fs.readFileSync(filePath, 'utf8');
            }
            if (ext === '.docx') {
                const mammoth = await import('mammoth');
                const result = await mammoth.extractRawText({ path: filePath });
                return result.value;
            }
            if (ext === '.pdf') {
                const pdfParseModule: any = await import('pdf-parse');
                const buf = fs.readFileSync(filePath);
                const pdfParseFn = pdfParseModule?.default ?? pdfParseModule;
                if (typeof pdfParseFn !== 'function') return '';
                const data = await pdfParseFn(buf);
                return data.text;
            }
        } catch (e: any) {
            console.warn(`[DocIndex] Erro ao ler ${path.basename(filePath)}:`, e.message);
        }
        return '';
    }

    private chunkar(texto: string, filePath: string): DocChunk[] {
        const arquivo = path.basename(filePath);
        const chunks: DocChunk[] = [];
        // Prefere quebrar em parágrafos, depois em janelas fixas
        const paragrafos = texto.split(/\n{2,}/);
        let buffer = '';
        let index = 0;

        const salvarChunk = () => {
            const trecho = buffer.trim();
            if (trecho.length >= MIN_CHUNK_LENGTH && index < MAX_CHUNKS_PER_DOC) {
                chunks.push({
                    id: `${filePath}::${index++}`,
                    arquivo,
                    trecho,
                    tokens: this.tokenize(trecho)
                });
            }
        };

        for (const paragrafo of paragrafos) {
            if (buffer.length + paragrafo.length > CHUNK_SIZE) {
                salvarChunk();
                // Overlap: mantém últimos CHUNK_OVERLAP chars do buffer anterior
                buffer = buffer.slice(-CHUNK_OVERLAP) + '\n' + paragrafo;
            } else {
                buffer += (buffer ? '\n' : '') + paragrafo;
            }
        }
        salvarChunk(); // último chunk

        return chunks;
    }

    private persistir(workspacePaths: string[]): void {
        if (!this.storePath) return;
        try {
            const data: IndexStore = {
                chunks: this.chunks,
                indexadoEm: new Date().toISOString(),
                workspacePaths
            };
            saveEncrypted(this.storePath, data);
        } catch (e: any) {
            console.warn('[DocIndex] Falha ao persistir índice:', e.message);
        }
    }

    // ========================================================================
    // TF-IDF
    // ========================================================================

    private tokenize(text: string): string[] {
        const stopwords = new Set([
            'o', 'a', 'os', 'as', 'um', 'uma', 'de', 'do', 'da', 'dos', 'das',
            'em', 'no', 'na', 'nos', 'nas', 'por', 'para', 'com', 'sem', 'sob',
            'que', 'se', 'nao', 'mais', 'muito', 'como', 'mas', 'ou', 'e', 'e',
            'foi', 'ser', 'ter', 'esta', 'sao', 'tem', 'seu', 'sua', 'esse',
            'essa', 'este', 'esta', 'isso', 'isto', 'aqui', 'ali', 'la',
        ]);
        return text
            .toLowerCase()
            .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
            .replace(/[^\w\s]/g, ' ')
            .split(/\s+/)
            .filter(w => w.length > 2 && !stopwords.has(w));
    }

    private calcularIDF(docs: string[][], queryTokens: string[]): Map<string, number> {
        const idf = new Map<string, number>();
        const totalDocs = docs.length + 1;
        const allTerms = new Set([...queryTokens, ...docs.flat()]);

        for (const term of allTerms) {
            let count = queryTokens.includes(term) ? 1 : 0;
            for (const doc of docs) if (doc.includes(term)) count++;
            idf.set(term, Math.log(totalDocs / (count + 1)) + 1);
        }
        return idf;
    }

    private tfidfVector(tokens: string[], idf: Map<string, number>): Map<string, number> {
        const freq = new Map<string, number>();
        for (const t of tokens) freq.set(t, (freq.get(t) || 0) + 1);
        const vec = new Map<string, number>();
        for (const [term, count] of freq) {
            vec.set(term, (count / tokens.length) * (idf.get(term) || 0));
        }
        return vec;
    }

    private cosineSimilarity(a: Map<string, number>, b: Map<string, number>): number {
        let dot = 0, normA = 0, normB = 0;
        for (const [t, va] of a) {
            dot += va * (b.get(t) || 0);
            normA += va * va;
        }
        for (const [, v] of b) normB += v * v;
        const denom = Math.sqrt(normA) * Math.sqrt(normB);
        return denom === 0 ? 0 : dot / denom;
    }
}

export const getDocIndex = () => DocIndex.getInstance();
