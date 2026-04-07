/**
 * Remove o URL scheme lex:// do registry do Windows.
 * Executado no preuninstall / npm uninstall.
 */

'use strict';

const { execSync } = require('child_process');

if (process.platform !== 'win32') {
    process.exit(0);
}

try {
    execSync(
        'reg delete "HKEY_CURRENT_USER\\Software\\Classes\\lex" /f',
        { stdio: 'pipe' },
    );
    console.log('[lex] URL scheme lex:// removido.');
} catch {
    // Pode não existir — ignora silenciosamente
}
