/**
 * Legal Module — Entry point.
 *
 * Exporta o Legal Language Engine, glossário, regras de estilo,
 * store dinâmico e extrator de citações.
 */

// Engine (funções principais)
export { detectLegalArea, detectSubAreas, getRelevantTerms, buildLegalContextBlock } from './legal-language-engine';
export type { BudgetTier } from './legal-language-engine';

// Glossário
export { LEGAL_GLOSSARY, getTermsByArea, searchTerms, getGlossaryStats } from './glossary';
export type { LegalTerm } from './glossary';

// Regras de estilo
export {
    getTreatmentFor, getAllTreatments,
    getTribunalTreatment, getAllTribunalTreatments,
    getVerbsFor, getAllVerbs,
    getConnectives, getConnectivesByFunction,
    getExpressionsFor,
    getCitationFormats, CITATION_FORMATS,
    getFullStyleBlock,
} from './style-rules';
export type { TreatmentRule, TribunalTreatment, VerbPreference, Connective, DocTypeExpressions } from './style-rules';

// Store dinâmico (súmulas, artigos, teses em JSON)
export {
    initLegalStore,
    getSumulas, searchSumulas, addSumula, hasSumula,
    getArticles, searchArticles, addArticle, hasArticle,
    getTheses, searchTheses, addThesis,
    getStoreStats, getSyncLog,
} from './legal-store';
export type { StoredSumula, StoredArticle, StoredThesis } from './legal-store';

// Extrator de citações (aprendizado do uso)
export { extractAndSave, extractCitations } from './legal-extractor';

// Knowledge Base — Schemas (Camada 1)
export type { DocumentSchema, DocumentCategory, SecaoSchema, DocumentStyle, TribunalVariacao, StoredDocExample, QualityScore } from './doc-schemas';
export { CATEGORY_LABELS, secao } from './doc-schemas';
export {
    initDocSchemaRegistry,
    getSchema, getSchemasByCategory, searchSchemas, addSchema, removeSchema,
    getAllSchemas, getSchemaForLegacyTemplate, getSchemasByArea, getSchemaStats,
    listCategories,
} from './doc-schema-registry';

// Knowledge Base — Examples (Camada 2)
export {
    initDocExamples,
    addExample, addExamples, getExamples, getTopExamples,
    searchExamples, getExamplesByArea, incrementUsage, removeExample,
    getAllExamples, hasExamples, getExampleStats, computeQualityScore,
} from './doc-examples';

// Knowledge Base — Import & Seed
export { importFile, importFolder } from './doc-importer';
export { runSeedPipeline, seedIfEmpty } from './doc-seed-pipeline';
