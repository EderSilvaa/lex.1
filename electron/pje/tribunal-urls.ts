export interface TribunalRoutes {
    loginUrl: string;
    consultaUrl: string;
    /**
     * Mapa de destinos semânticos → URLs diretas.
     * Chave: palavras-chave normalizadas (lowercase, sem acento).
     * Valor: URL completa da página no tribunal.
     * Priorizado sobre navegação por click DOM — muito mais confiável em SPAs.
     */
    pages: Record<string, string>;
}

/**
 * Gera páginas padrão para PJe JSF (versão legada usada por TJPA, TRF1, maioria dos TJs/TRTs).
 * Caminho base: https://{host}/pje/
 */
function buildJsfPages(base: string): Record<string, string> {
    return {
        'painel':                       `${base}/painel.seam`,
        'inicio':                       `${base}/painel.seam`,
        'home':                         `${base}/painel.seam`,
        'consulta processo':            `${base}/Processo/ConsultaProcesso/listView.seam`,
        'consulta publica':             `${base}/consultapublica/listView.seam`,
        'novo processo':                `${base}/Processo/Peticionamento/NovoProcessoSubmit.seam`,
        'peticionamento':               `${base}/Processo/Peticionamento/NovoProcessoSubmit.seam`,
        'peticionamento novo processo': `${base}/Processo/Peticionamento/NovoProcessoSubmit.seam`,
        'novo':                         `${base}/Processo/Peticionamento/NovoProcessoSubmit.seam`,
        'cadastro processo':            `${base}/Processo/Peticionamento/NovoProcessoSubmit.seam`,
        'processo existente':           `${base}/Processo/Peticionamento/PeticaoIntercorrente/listView.seam`,
        'peticao intercorrente':        `${base}/Processo/Peticionamento/PeticaoIntercorrente/listView.seam`,
        'intimacao':                    `${base}/Processo/Intimacao/listView.seam`,
        'intimacoes':                   `${base}/Processo/Intimacao/listView.seam`,
        'pauta':                        `${base}/Processo/Pauta/listView.seam`,
        'audiencia':                    `${base}/Processo/Audiencia/listView.seam`,
        'documentos':                   `${base}/Processo/Documento/listView.seam`,
    };
}

const ROUTES: Record<string, TribunalRoutes> = {
    tjpa: {
        loginUrl: 'https://pje.tjpa.jus.br/pje/login.seam',
        consultaUrl: 'https://pje.tjpa.jus.br/pje/Processo/ConsultaProcesso/listView.seam',
        pages: buildJsfPages('https://pje.tjpa.jus.br/pje')
    },
    trf1: {
        loginUrl: 'https://pje1g.trf1.jus.br/pje/login.seam',
        consultaUrl: 'https://pje1g.trf1.jus.br/pje/Processo/ConsultaProcesso/listView.seam',
        pages: buildJsfPages('https://pje1g.trf1.jus.br/pje')
    },
    trt8: {
        // TRT8 usa pjekz (Angular SPA) — URL base diferente
        loginUrl: 'https://pje.trt8.jus.br/primeirograu/login.seam',
        consultaUrl: 'https://pje.trt8.jus.br/pjekz/consulta-publica',
        pages: {
            'painel':                       'https://pje.trt8.jus.br/pjekz/painel/usuario-externo',
            'painel usuario externo':        'https://pje.trt8.jus.br/pjekz/painel/usuario-externo',
            'inicio':                        'https://pje.trt8.jus.br/pjekz/painel/usuario-externo',
            'home':                          'https://pje.trt8.jus.br/pjekz/painel/usuario-externo',
            'consulta processo':             'https://pje.trt8.jus.br/pjekz/consulta-publica',
            'consulta publica':              'https://pje.trt8.jus.br/pjekz/consulta-publica',
            'peticionamento novo processo':  'https://pje.trt8.jus.br/pjekz/processo/cadastro',
            'novo processo':                 'https://pje.trt8.jus.br/pjekz/processo/cadastro',
            'peticionamento':                'https://pje.trt8.jus.br/pjekz/processo/cadastro',
            'cadastro processo':             'https://pje.trt8.jus.br/pjekz/processo/cadastro',
            'processo novo':                 'https://pje.trt8.jus.br/pjekz/processo/cadastro',
            'novo':                          'https://pje.trt8.jus.br/pjekz/processo/cadastro',
            'processo existente':            'https://pje.trt8.jus.br/pjekz/processo/intercorrente',
            'peticao intercorrente':         'https://pje.trt8.jus.br/pjekz/processo/intercorrente',
            'intimacao':                     'https://pje.trt8.jus.br/pjekz/painel/usuario-externo',
            'intimacoes':                    'https://pje.trt8.jus.br/pjekz/painel/usuario-externo',
        }
    }
};

const DEFAULT_ROUTES: TribunalRoutes = ROUTES['tjpa'] || {
    loginUrl: 'https://pje.tjpa.jus.br/pje/login.seam',
    consultaUrl: 'https://pje.tjpa.jus.br/pje/Processo/ConsultaProcesso/listView.seam',
    pages: {}
};

/**
 * Normaliza texto para comparação de tribunal: lowercase, sem acentos, sem caracteres especiais.
 */
function normalizeForTribunal(value: unknown): string {
    return String(value || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]/g, '');
}

/**
 * Infere a chave do tribunal a partir de texto livre (nome, URL, sigla, etc.).
 * Retorna a chave lowercase (ex: 'tjpa', 'trt8') ou null.
 */
export function inferTribunalKey(textRaw: string): string | null {
    const text = normalizeForTribunal(textRaw);
    if (!text) return null;

    if (text.includes('tjpa')) return 'tjpa';
    if (text.includes('trf1')) return 'trf1';
    if (text.includes('trt8')) return 'trt8';

    const trtMatch = text.match(/trt\d{1,2}/);
    if (trtMatch && trtMatch[0]) return trtMatch[0];

    const trfMatch = text.match(/trf\d/);
    if (trfMatch && trfMatch[0]) return trfMatch[0];

    const tjMatch = text.match(/tj[a-z]{2}/);
    if (tjMatch && tjMatch[0]) return tjMatch[0];

    const treMatch = text.match(/tre[a-z0-9]{1,2}/);
    if (treMatch && treMatch[0]) return treMatch[0];

    return null;
}

/**
 * Normaliza qualquer valor para código de tribunal uppercase (ex: 'TRT8', 'TJPA').
 * Retorna null se o valor estiver vazio ou não for reconhecível.
 */
export function normalizeTribunalCode(value: unknown): string | null {
    const key = inferTribunalKey(String(value || ''));
    if (key) return key.toUpperCase();

    const trimmed = String(value || '').trim();
    if (!trimmed) return null;
    return trimmed.toUpperCase();
}

export function resolveTribunalRoutes(tribunalRaw: string): TribunalRoutes {
    const raw = String(tribunalRaw || 'tjpa').trim().toLowerCase();
    const key = inferTribunalKey(raw);

    if (key && ROUTES[key]) {
        return ROUTES[key];
    }

    // Tenta como URL direta
    const normalized = raw.replace(/[^a-z0-9.-]/g, '');
    if (normalized.startsWith('http://') || normalized.startsWith('https://') || normalized.includes('.')) {
        const host = normalized.replace(/^https?:\/\//, '').replace(/\/.*$/, '');
        const keyFromHost = inferTribunalKey(host);
        if (keyFromHost && ROUTES[keyFromHost]) return ROUTES[keyFromHost];
        return buildDefaultRoutes(host);
    }

    if (key) {
        return buildDefaultRoutes(`pje.${key}.jus.br`);
    }

    return DEFAULT_ROUTES;
}

/**
 * Tenta resolver uma URL direta para um destino semântico dentro de um tribunal.
 * Normaliza o destino e busca no mapa de `pages`.
 * Retorna null se não encontrado (cai no fluxo de click DOM/Vision).
 */
export function resolveDestinationUrl(routes: TribunalRoutes, destino: string): string | null {
    if (!routes.pages || !destino) return null;

    const normalized = String(destino)
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')   // remove acentos
        .replace(/[^a-z0-9\s]/g, ' ')      // só letras, números, espaços
        .replace(/\s+/g, ' ')
        .trim();

    // 1. Match exato
    if (routes.pages[normalized]) return routes.pages[normalized];

    // 2. Verifica se alguma chave do mapa está contida no destino normalizado
    let bestKey: string | null = null;
    let bestScore = 0;
    for (const key of Object.keys(routes.pages)) {
        if (normalized.includes(key) && key.length > bestScore) {
            bestKey = key;
            bestScore = key.length;
        }
    }
    if (bestKey) return routes.pages[bestKey] ?? null;

    // 3. Verifica se o destino está contido em alguma chave (parcial)
    for (const key of Object.keys(routes.pages)) {
        if (key.includes(normalized) && normalized.length >= 5) {
            return routes.pages[key] ?? null;
        }
    }

    return null;
}

function buildDefaultRoutes(hostRaw: string): TribunalRoutes {
    const host = String(hostRaw || '').toLowerCase().replace(/^https?:\/\//, '').replace(/\/+$/, '');
    const isTrtHost = host.includes('.trt') || host.includes('trt');
    if (isTrtHost) {
        const base = `https://${host}/primeirograu`;
        return {
            loginUrl: `${base}/login.seam`,
            consultaUrl: `${base}/Processo/ConsultaProcesso/listView.seam`,
            pages: buildJsfPages(base)
        };
    }
    const base = `https://${host}/pje`;
    return {
        loginUrl: `${base}/login.seam`,
        consultaUrl: `${base}/Processo/ConsultaProcesso/listView.seam`,
        pages: buildJsfPages(base)
    };
}

export function getKnownPJeHosts(): string[] {
    return Array.from(new Set(Object.values(ROUTES).map(route => {
        const parsed = new URL(route.loginUrl);
        return parsed.hostname.toLowerCase();
    })));
}
