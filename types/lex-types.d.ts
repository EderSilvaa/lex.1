// LEX Extension specific types

export interface PDFExtractionResult {
  text: string;
  pages: PageResult[];
  metadata: PDFMetadata | null;
  stats: ExtractionStats;
  success: boolean;
  fileSize: number;
  fileSizeFormatted: string;
}

export interface PageResult {
  pageNumber: number;
  text: string;
  characterCount: number;
}

export interface ExtractionStats {
  totalPages: number;
  processedPages: number;
  totalCharacters: number;
  averageCharsPerPage: number;
  processingTime: number;
  errors: PageError[];
}

export interface PageError {
  page: number;
  error: string;
}

export interface PDFMetadata {
  title: string | null;
  author: string | null;
  subject: string | null;
  creator: string | null;
  producer: string | null;
  creationDate: string | null;
  modificationDate: string | null;
  pdfVersion: string | null;
}

export interface WorkerConfig {
  type: 'local' | 'inline' | 'cdn' | 'blob';
  source: string;
  status: 'pending' | 'active' | 'failed' | 'fallback';
  lastError: Error | null;
  diagnostics: WorkerDiagnostics;
}

export interface WorkerDiagnostics {
  chromeExtension: boolean;
  manifestVersion: number;
  workerSupported: boolean;
  fallbackAvailable: boolean;
}

export interface EnvironmentInfo {
  isExtension: boolean;
  manifestVersion: number | null;
  userAgent: string;
  chromeVersion: string | null;
  workerSupported: boolean;
}

export interface PDFProcessorStatus {
  initialized: boolean;
  loading: boolean;
  version: string;
  workerConfigured: boolean;
  workerSource: string | null;
  libraryAvailable: boolean;
  ready: boolean;
  environment: EnvironmentInfo;
}

export interface OpenAIConfig {
  apiKey: string;
  model: string;
  maxTokens: number;
  temperature: number;
  baseURL?: string;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
  timestamp?: Date;
}

export interface DocumentInfo {
  type: 'pdf' | 'text' | 'html';
  title: string;
  url: string;
  size: number;
  lastModified?: Date;
}

export interface ExtractionOptions {
  includeMetadata?: boolean;
  includePageNumbers?: boolean;
  maxPages?: number | null;
  progressCallback?: (progress: ExtractionProgress) => void;
  pageDelimiter?: string;
  combineTextItems?: boolean;
  normalizeWhitespace?: boolean;
}

export interface ExtractionProgress {
  currentPage: number;
  totalPages: number;
  progress: number;
}

export interface SearchResult {
  searchTerm: string;
  results: SearchMatch[];
  totalMatches: number;
  searchOptions: SearchOptions;
  success: boolean;
}

export interface SearchMatch {
  page: number;
  match: string;
  context: string;
  startIndex: number;
  endIndex: number;
}

export interface SearchOptions {
  caseSensitive?: boolean;
  wholeWords?: boolean;
  maxResults?: number;
}