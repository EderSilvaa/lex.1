/**
 * PJe Types
 *
 * Tipos para automação do PJe via Playwright CDP.
 */

// ============================================================================
// ACTIONS
// ============================================================================

export type PJeActionType =
    | 'navigate'
    | 'click'
    | 'fill'
    | 'select'
    | 'upload'
    | 'wait'
    | 'waitForSelector'
    | 'getText'
    | 'screenshot'
    | 'evaluate';

export interface PJeAction {
    type: PJeActionType;
    selector?: string;
    value?: string;
    url?: string;
    filePath?: string;
    milliseconds?: number;
    script?: string;

    // Descrições visuais para fallback
    visualDescription?: string;
    textDescription?: string;

    // HITL
    requiresConfirmation?: boolean;
    confirmMessage?: string;
}

// ============================================================================
// RESULTS
// ============================================================================

export interface PJeResult {
    success: boolean;
    action: PJeActionType;
    data?: any;
    error?: string;
    strategy?: string;
    duration?: number;
}

// ============================================================================
// STATE
// ============================================================================

export type PJeConnectionState =
    | 'disconnected'
    | 'connecting'
    | 'connected'
    | 'waiting_login'
    | 'ready'
    | 'executing'
    | 'error';

export interface PJeState {
    connectionState: PJeConnectionState;
    isLoggedIn: boolean;
    currentUrl: string | null;
    currentSection: PJeSection | null;
    processNumber: string | null;
    lastError: string | null;
}

export type PJeSection =
    | 'login'
    | 'dashboard'
    | 'process-search'
    | 'process-view'
    | 'process-new'
    | 'intimations'
    | 'unknown';

// ============================================================================
// EVENTS
// ============================================================================

export type PJeEvent =
    | { type: 'connecting' }
    | { type: 'connected'; url: string }
    | { type: 'disconnected'; reason?: string }
    | { type: 'waiting_login' }
    | { type: 'logged_in' }
    | { type: 'action_start'; action: PJeAction }
    | { type: 'action_complete'; result: PJeResult }
    | { type: 'confirmation_required'; action: PJeAction }
    | { type: 'error'; error: string };

// ============================================================================
// CONFIG
// ============================================================================

export interface PJeConfig {
    cdpUrl: string;            // Default: http://localhost:9222
    debugPort: number;         // Default: 9222
    autoLaunchChrome: boolean; // Default: true
    chromePath?: string;       // Path to Chrome executable
    timeout: number;           // Action timeout in ms
    hitlActions: PJeActionType[]; // Actions that require confirmation
}

export const DEFAULT_PJE_CONFIG: PJeConfig = {
    cdpUrl: 'http://localhost:9222',
    debugPort: 9222,
    autoLaunchChrome: true,
    timeout: 30000,
    hitlActions: ['upload'] // Protocolar sempre pede confirmação
};

// ============================================================================
// PJE URLs
// ============================================================================

export const PJE_URLS = {
    TJPA: 'https://pje.tjpa.jus.br',
    TRT8: 'https://pje.trt8.jus.br',
    // Adicionar outros tribunais conforme necessário
} as const;

export type PJeTribunal = keyof typeof PJE_URLS;
