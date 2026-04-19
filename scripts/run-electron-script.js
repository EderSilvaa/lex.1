/* eslint-disable no-console */
const { spawn } = require('child_process');
const path = require('path');
const electronPath = require('electron');

const script = process.argv[2];
if (!script) {
    console.error('Usage: node scripts/run-electron-script.js <script> [...args]');
    process.exit(1);
}

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;

const scriptPath = path.resolve(process.cwd(), script);
const args = [scriptPath, ...process.argv.slice(3)];
const child = spawn(electronPath, args, {
    stdio: 'inherit',
    env,
    windowsHide: false,
});

child.on('close', (code) => process.exit(code || 0));
child.on('error', (err) => {
    console.error(err);
    process.exit(1);
});
