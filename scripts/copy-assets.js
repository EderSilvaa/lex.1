#!/usr/bin/env node
/**
 * Copia assets não-TS para dist-electron (modelos jurídicos, etc.)
 */
const fs = require('fs');
const path = require('path');

function copyRecursive(src, dest) {
    if (!fs.existsSync(src)) return 0;
    fs.mkdirSync(dest, { recursive: true });

    let count = 0;
    const entries = fs.readdirSync(src, { withFileTypes: true });

    for (const entry of entries) {
        const srcPath = path.join(src, entry.name);
        const destPath = path.join(dest, entry.name);

        if (entry.isDirectory()) {
            count += copyRecursive(srcPath, destPath);
        } else if (/\.(txt|md|json|csv)$/i.test(entry.name)) {
            fs.copyFileSync(srcPath, destPath);
            count++;
        }
    }
    return count;
}

// Copiar modelos jurídicos
const modelosSrc = path.join('electron', 'batch', 'modelos');
const modelosDest = path.join('dist-electron', 'batch', 'modelos');
const count = copyRecursive(modelosSrc, modelosDest);
console.log(`[Build] ${count} arquivos de modelos copiados`);

// Copiar xterm.js assets para o renderer
function copyFile(src, dest) {
    if (!fs.existsSync(src)) {
        console.warn(`[Build] Arquivo não encontrado: ${src}`);
        return;
    }
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
    console.log(`[Build] Copiado: ${path.basename(src)}`);
}

// CSS do xterm
copyFile(
    path.join('node_modules', '@xterm', 'xterm', 'css', 'xterm.css'),
    path.join('src', 'renderer', 'styles', 'xterm.css')
);

// JS do xterm (UMD bundles para uso via <script> tag)
copyFile(
    path.join('node_modules', '@xterm', 'xterm', 'lib', 'xterm.js'),
    path.join('src', 'renderer', 'js', 'xterm.js')
);
copyFile(
    path.join('node_modules', '@xterm', 'addon-fit', 'lib', 'addon-fit.js'),
    path.join('src', 'renderer', 'js', 'xterm-addon-fit.js')
);
copyFile(
    path.join('node_modules', '@xterm', 'addon-web-links', 'lib', 'addon-web-links.js'),
    path.join('src', 'renderer', 'js', 'xterm-addon-web-links.js')
);
