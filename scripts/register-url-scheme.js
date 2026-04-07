/**
 * Registra o URL scheme lex:// no Windows.
 *
 * Executado automaticamente no postinstall do npm.
 * Permite que a landing page abra o CLI com:
 *   <a href="lex://run?goal=analisa+processo+123">Abrir LEX</a>
 *
 * Registry key criada:
 *   HKEY_CURRENT_USER\Software\Classes\lex
 *
 * Usa HKEY_CURRENT_USER (não requer admin) — funciona para o usuário atual.
 * O Windows redireciona HKCU automaticamente quando o browser tenta abrir lex://.
 */

'use strict';

const { execSync } = require('child_process');
const path = require('path');
const fs   = require('fs');

if (process.platform !== 'win32') {
    console.log('[lex] URL scheme lex:// não suportado nesta plataforma (apenas Windows).');
    process.exit(0);
}

// Caminho do bin/lex.js relativo a este script (scripts/ → raiz → bin/)
const lexBin = path.resolve(__dirname, '..', 'bin', 'lex.js');

if (!fs.existsSync(lexBin)) {
    console.warn('[lex] bin/lex.js não encontrado — pulando registro de URL scheme.');
    console.warn('      Execute "npm run build" primeiro.');
    process.exit(0);
}

// Node.js que está rodando agora — usa o mesmo executável para invocar o CLI
const nodeBin = process.execPath;

// Comando registrado: node "C:\...\bin\lex.js" "%1"
// %1 é o argumento passado pelo Windows quando o usuário clica em lex://...
const command = `"${nodeBin}" "${lexBin}" "%1"`;

function reg(key, value, data, type = 'REG_SZ') {
    try {
        execSync(
            `reg add "${key}" /v "${value}" /t ${type} /d "${data}" /f`,
            { stdio: 'pipe' },
        );
    } catch (err) {
        console.error(`[lex] Falha ao escrever registry: ${key} → ${err.message}`);
        throw err;
    }
}

function regDefault(key, data) {
    // Usa array de args para evitar problemas de escaping no cmd.exe
    try {
        execSync(
            `reg add "${key}" /ve /t REG_SZ /d "${data.replace(/"/g, '\\"')}" /f`,
            { stdio: 'pipe', shell: true },
        );
    } catch (err) {
        console.error(`[lex] Falha ao escrever registry: ${key} → ${err.message}`);
        throw err;
    }
}

try {
    const base = 'HKEY_CURRENT_USER\\Software\\Classes\\lex';

    // Chave raiz — informa ao Windows que é um URL handler
    regDefault(base, 'URL:LEX Protocol');
    reg(base, 'URL Protocol', '');

    // Ícone (opcional — usa o node.exe como ícone padrão)
    regDefault(`${base}\\DefaultIcon`, `"${nodeBin}",0`);

    // Comando que será executado
    regDefault(`${base}\\shell\\open\\command`, command);

    console.log('[lex] URL scheme lex:// registrado com sucesso.');
    console.log(`      Comando: ${command}`);
} catch {
    // Não bloqueia a instalação — é só uma feature extra
    console.warn('[lex] Falha ao registrar URL scheme. Instale manualmente se necessário.');
    process.exit(0);
}
