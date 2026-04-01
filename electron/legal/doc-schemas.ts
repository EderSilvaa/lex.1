/**
 * Document Schemas — Types para Knowledge Base de Documentos Jurídicos
 *
 * Camada 1: estrutura, seções, estilo e variações por tribunal
 * para cada tipo de documento jurídico.
 */

// ── Categorias ───────────────────────────────────────────────────────

export type DocumentCategory =
    | 'pecas_processuais'
    | 'contratos'
    | 'docs_administrativos'
    | 'extrajudiciais'
    | 'societarios'
    | 'pareceres'
    | 'procuracoes'
    | 'recursos'
    | 'execucao'
    | 'cautelares'
    | 'trabalhista_especial'
    | 'outros';

export const CATEGORY_LABELS: Record<DocumentCategory, string> = {
    pecas_processuais: 'Peças Processuais',
    contratos: 'Contratos',
    docs_administrativos: 'Documentos Administrativos',
    extrajudiciais: 'Extrajudiciais',
    societarios: 'Societários',
    pareceres: 'Pareceres',
    procuracoes: 'Procurações',
    recursos: 'Recursos',
    execucao: 'Execução',
    cautelares: 'Cautelares',
    trabalhista_especial: 'Trabalhista Especial',
    outros: 'Outros',
};

// ── Schema de Documento ──────────────────────────────────────────────

export interface DocumentSchema {
    id: string;
    nome: string;
    categoria: DocumentCategory;
    subcategoria?: string;
    secoes: SecaoSchema[];
    estilo: DocumentStyle;
    variacoesTribunal?: TribunalVariacao[];
    fundamentosComuns?: string[];
    areas: string[];
    fonte: 'builtin' | 'usuario' | 'crawled';
    dataAtualizacao: string;
    legacyTemplateId?: string;
}

export interface SecaoSchema {
    id: string;
    nome: string;
    obrigatoria: boolean;
    ordem: number;
    descricao: string;
    exemplos?: string[];
    subsecoes?: SecaoSchema[];
}

export interface DocumentStyle {
    tratamento: string;
    tom: 'formal' | 'semiformal' | 'tecnico';
    formatacao: 'judicial' | 'extrajudicial' | 'administrativo' | 'contratual';
    tempoVerbal: string;
    pessoaGramatical: '1a' | '3a';
}

export interface TribunalVariacao {
    tribunal: string;
    diferencas: {
        secoes?: SecaoSchema[];
        estilo?: Partial<DocumentStyle>;
        observacoes?: string;
    };
}

// ── Exemplo de Documento (Camada 2) ──────────────────────────────────

export interface StoredDocExample {
    id: string;
    schemaId: string;
    titulo: string;
    conteudo: string;
    area: string[];
    keywords: string[];
    qualidade: QualityScore;
    fonte: 'seed' | 'usuario' | 'crawled';
    origemArquivo?: string;
    dataImportacao: string;
    vezesUsado: number;
    ultimoUso?: string;
}

export interface QualityScore {
    total: number;
    completude: number;
    formalidade: number;
    atualidade: number;
    curadoria: number;
}

// ── Helpers ──────────────────────────────────────────────────────────

/** Cria SecaoSchema com defaults */
export function secao(
    id: string, nome: string, descricao: string,
    ordem: number, obrigatoria = true,
): SecaoSchema {
    return { id, nome, obrigatoria, ordem, descricao };
}
