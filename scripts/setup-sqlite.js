/**
 * setup-sqlite.js
 *
 * Compila better-sqlite3 para os dois contextos e salva cópias:
 *   better_sqlite3_node.node     → Node.js do sistema (CLI)
 *   better_sqlite3_electron.node → Node.js interno do Electron
 *
 * Uso: node scripts/setup-sqlite.js
 */

const { execSync } = require('child_process');
const fs   = require('fs');
const path = require('path');

const root     = path.join(__dirname, '..');
const buildDir = path.join(root, 'node_modules/better-sqlite3/build/Release');
const active   = path.join(buildDir, 'better_sqlite3.node');
const nodeCopy = path.join(buildDir, 'better_sqlite3_node.node');
const eleCopy  = path.join(buildDir, 'better_sqlite3_electron.node');

function step(label, fn) {
    process.stdout.write(`\n▸ ${label}...\n`);
    try {
        fn();
        process.stdout.write('  ✓ ok\n');
        return true;
    } catch (err) {
        process.stdout.write(`  ✗ falhou: ${err.message?.split('\n')[0] ?? err}\n`);
        return false;
    }
}

// ── 1. Compila para Node do sistema ──────────────────────────────────────────

const nodeOk = step('Compilando para Node.js do sistema (CLI)', () => {
    execSync('npm rebuild better-sqlite3', { stdio: 'inherit', cwd: root });
    fs.copyFileSync(active, nodeCopy);
});

// ── 2. Compila para Electron ──────────────────────────────────────────────────

const electronVersion = (() => {
    try {
        return require(path.join(root, 'node_modules/electron/package.json')).version;
    } catch { return null; }
})();

let eleOk = false;
if (electronVersion) {
    eleOk = step(`Compilando para Electron v${electronVersion}`, () => {
        // Usa @electron/rebuild (instalado em devDependencies)
        const rebuildBin = path.join(root, 'node_modules/@electron/rebuild/lib/cli.js');
        execSync(
            `node "${rebuildBin}" --only better-sqlite3 -v ${electronVersion}`,
            { stdio: 'inherit', cwd: root },
        );
        fs.copyFileSync(active, eleCopy);
    });
} else {
    process.stdout.write('\n  ⚠ Electron não encontrado em node_modules — pulando build Electron.\n');
}

// ── 3. Restaura versão Node como padrão ──────────────────────────────────────

if (nodeOk) {
    step('Restaurando versão Node como padrão', () => {
        fs.copyFileSync(nodeCopy, active);
    });
}

// ── Resumo ────────────────────────────────────────────────────────────────────

process.stdout.write('\n─────────────────────────────────\n');
process.stdout.write(`CLI (Node):    ${nodeOk  ? '✓ pronto' : '✗ falhou — rode: npm rebuild better-sqlite3'}\n`);
process.stdout.write(`Electron:      ${eleOk   ? '✓ pronto' : '⚠ não compilado (Electron pode não funcionar com brain)'}\n`);
process.stdout.write('─────────────────────────────────\n\n');
