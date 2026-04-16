/**
 * Launcher que remove ELECTRON_RUN_AS_NODE antes de iniciar o Electron.
 * Esta variável é setada pelo VSCode extension host e impede o Electron
 * de funcionar corretamente quando lançado de dentro do VSCode.
 *
 * Também troca o binário do better-sqlite3 para a versão compilada para
 * o Node interno do Electron (se disponível via scripts/setup-sqlite.js).
 */
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const electronPath = require('electron');

// ── Troca binário do sqlite3 para versão Electron ─────────────────────────────
const buildDir  = path.join(__dirname, '../node_modules/better-sqlite3/build/Release');
const active    = path.join(buildDir, 'better_sqlite3.node');
const eleCopy   = path.join(buildDir, 'better_sqlite3_electron.node');
if (fs.existsSync(eleCopy)) {
    try { fs.copyFileSync(eleCopy, active); } catch { /* ignora se não conseguir */ }
}

const env = Object.assign({}, process.env);
delete env.ELECTRON_RUN_AS_NODE;

// Repassa args extras para o Electron (ex: --view=brain passado pelo CLI)
const extraArgs = process.argv.slice(2);
const child = spawn(electronPath, ['.', ...extraArgs], {
  stdio: 'inherit',
  env: env,
  windowsHide: false
});

child.on('close', (code) => process.exit(code || 0));
