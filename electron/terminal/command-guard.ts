/**
 * Command Guard — Blocklist de comandos perigosos para o terminal.
 */

const BLOCKED_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
    // Destruição de dados
    { pattern: /\brm\s+(-[a-z]*r[a-z]*f|--force)\b/i, reason: 'Remoção recursiva forçada' },
    { pattern: /\brm\s+-[a-z]*f[a-z]*r\b/i, reason: 'Remoção recursiva forçada' },
    { pattern: /\bdel\s+\/[a-z]*f\b/i, reason: 'Exclusão forçada de arquivos' },
    { pattern: /\brmdir\s+\/s\b/i, reason: 'Remoção recursiva de diretório' },
    { pattern: /\brd\s+\/s\b/i, reason: 'Remoção recursiva de diretório' },
    { pattern: /\bformat\s+[a-z]:/i, reason: 'Formatação de disco' },
    { pattern: /\bcipher\s+\/w/i, reason: 'Wipe de dados' },

    // Sistema
    { pattern: /\bshutdown\b/i, reason: 'Desligamento do sistema' },
    { pattern: /\brestart\b.*\bcomputer\b/i, reason: 'Reinicialização do sistema' },
    { pattern: /\bdiskpart\b/i, reason: 'Manipulação de partições' },
    { pattern: /\bbcdedit\b/i, reason: 'Alteração de boot' },

    // Segurança / Usuários
    { pattern: /\bnet\s+user\b/i, reason: 'Manipulação de usuários' },
    { pattern: /\bnet\s+localgroup\b/i, reason: 'Manipulação de grupos' },
    { pattern: /\breg\s+delete\b/i, reason: 'Exclusão de registro do Windows' },
    { pattern: /\btakeown\b/i, reason: 'Alteração de ownership' },
    { pattern: /\bicacls\b.*\/grant/i, reason: 'Alteração de permissões' },

    // Execução ofuscada
    { pattern: /\bpowershell\b.*-[eE]ncoded[cC]ommand/i, reason: 'Comando PowerShell ofuscado' },
    { pattern: /\bcertutil\b.*-decode/i, reason: 'Decodificação de payload' },
    { pattern: /\bcertutil\b.*-urlcache/i, reason: 'Download via certutil' },

    // Fork bombs e loops infinitos
    { pattern: /:\(\)\s*\{\s*:\|:&\s*\};\s*:/i, reason: 'Fork bomb' },
    { pattern: /%0\|%0/i, reason: 'Fork bomb (Windows)' },
];

export interface CommandCheckResult {
    blocked: boolean;
    reason?: string;
}

/**
 * Verifica se um comando é potencialmente perigoso.
 */
export function isCommandBlocked(command: string): CommandCheckResult {
    const trimmed = command.trim();
    for (const { pattern, reason } of BLOCKED_PATTERNS) {
        if (pattern.test(trimmed)) {
            return { blocked: true, reason };
        }
    }
    return { blocked: false };
}
