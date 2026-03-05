/**
 * Launcher que remove ELECTRON_RUN_AS_NODE antes de iniciar o Electron.
 * Esta variável é setada pelo VSCode extension host e impede o Electron
 * de funcionar corretamente quando lançado de dentro do VSCode.
 */
const { spawn } = require('child_process');
const electronPath = require('electron');

const env = Object.assign({}, process.env);
delete env.ELECTRON_RUN_AS_NODE;

const child = spawn(electronPath, ['.'], {
  stdio: 'inherit',
  env: env,
  windowsHide: false
});

child.on('close', (code) => process.exit(code || 0));
