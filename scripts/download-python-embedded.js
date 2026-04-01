/**
 * download-python-embedded.js
 *
 * Script de build que baixa o Python 3.12 embeddable para Windows,
 * extrai em resources/python-embedded/, habilita pip e pre-instala
 * pacotes essenciais para Document AI.
 *
 * Uso: node scripts/download-python-embedded.js
 * Chamado automaticamente por `npm run python:setup` e antes do `dist:win`.
 */

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { createUnzip } = require('zlib');

// ── Config ──
const PYTHON_VERSION = '3.12.8';
const PYTHON_ZIP_NAME = `python-${PYTHON_VERSION}-embed-amd64.zip`;
const PYTHON_URL = `https://www.python.org/ftp/python/${PYTHON_VERSION}/${PYTHON_ZIP_NAME}`;
const GET_PIP_URL = 'https://bootstrap.pypa.io/get-pip.py';

const DEST_DIR = path.resolve(__dirname, '..', 'resources', 'python-embedded');
const TEMP_DIR = path.resolve(__dirname, '..', 'temp');

// Pacotes para pre-instalar (wheels vão para Lib/site-packages)
const PRE_INSTALL_PACKAGES = [
    // Core para Document AI — descomente quando quiser incluir no build
    // 'docling',
    // 'paddleocr',
    // 'llama-index',
];

// ── Helpers ──

function log(msg) {
    console.log(`[python-setup] ${msg}`);
}

function ensureDir(dir) {
    fs.mkdirSync(dir, { recursive: true });
}

/** Download com redirect support e progress */
function download(url, destPath) {
    return new Promise((resolve, reject) => {
        log(`Baixando ${url}...`);
        const file = fs.createWriteStream(destPath);
        const get = url.startsWith('https') ? https.get : http.get;

        get(url, (res) => {
            // Follow redirects
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                file.close();
                fs.unlinkSync(destPath);
                return download(res.headers.location, destPath).then(resolve).catch(reject);
            }

            if (res.statusCode !== 200) {
                file.close();
                fs.unlinkSync(destPath);
                return reject(new Error(`HTTP ${res.statusCode} ao baixar ${url}`));
            }

            const totalBytes = parseInt(res.headers['content-length'] || '0', 10);
            let downloaded = 0;
            let lastPercent = -1;

            res.on('data', (chunk) => {
                downloaded += chunk.length;
                if (totalBytes > 0) {
                    const percent = Math.floor((downloaded / totalBytes) * 100);
                    if (percent !== lastPercent && percent % 10 === 0) {
                        log(`  ${percent}% (${(downloaded / 1024 / 1024).toFixed(1)} MB)`);
                        lastPercent = percent;
                    }
                }
            });

            res.pipe(file);
            file.on('finish', () => {
                file.close();
                log(`  Download completo: ${(downloaded / 1024 / 1024).toFixed(1)} MB`);
                resolve();
            });
            file.on('error', reject);
        }).on('error', (err) => {
            file.close();
            if (fs.existsSync(destPath)) fs.unlinkSync(destPath);
            reject(err);
        });
    });
}

/** Extrai ZIP usando PowerShell (disponível em todo Windows 10+) */
function extractZip(zipPath, destDir) {
    log(`Extraindo para ${destDir}...`);
    ensureDir(destDir);

    // PowerShell Expand-Archive é confiável no Windows 10+
    execSync(
        `powershell -NoProfile -Command "Expand-Archive -Path '${zipPath}' -DestinationPath '${destDir}' -Force"`,
        { stdio: 'inherit', timeout: 120_000 }
    );

    log('  Extração completa');
}

/** Habilita import site no .pth (necessário para pip e site-packages) */
function enableSiteImport(pythonDir) {
    const files = fs.readdirSync(pythonDir).filter(f => f.endsWith('._pth'));

    for (const pthFile of files) {
        const pthPath = path.join(pythonDir, pthFile);
        let content = fs.readFileSync(pthPath, 'utf-8');

        // Descomenta "import site"
        content = content.replace(/^#\s*import site/m, 'import site');

        // Adiciona Lib/site-packages ao path
        if (!content.includes('Lib/site-packages')) {
            content += '\nLib/site-packages\n';
        }

        fs.writeFileSync(pthPath, content);
        log(`  Habilitado import site em ${pthFile}`);
    }

    // Garante que Lib/site-packages existe
    ensureDir(path.join(pythonDir, 'Lib', 'site-packages'));
}

/** Instala pip no Python embedded */
async function installPip(pythonExe) {
    const getPipPath = path.join(TEMP_DIR, 'get-pip.py');

    // Baixa get-pip.py
    await download(GET_PIP_URL, getPipPath);

    // Roda get-pip.py
    log('Instalando pip...');
    try {
        execSync(`"${pythonExe}" "${getPipPath}" --no-warn-script-location`, {
            stdio: 'inherit',
            timeout: 120_000,
            windowsHide: true,
        });
        log('  pip instalado com sucesso');
    } catch (err) {
        log(`  AVISO: pip install falhou — ${err.message}`);
        log('  Continuando sem pip (pacotes podem ser instalados depois)');
    }
}

/** Pre-instala pacotes essenciais */
async function preInstallPackages(pythonExe) {
    if (PRE_INSTALL_PACKAGES.length === 0) {
        log('Nenhum pacote para pre-instalar (lista vazia)');
        return;
    }

    for (const pkg of PRE_INSTALL_PACKAGES) {
        log(`Instalando ${pkg}...`);
        try {
            execSync(
                `"${pythonExe}" -m pip install ${pkg} --no-warn-script-location`,
                { stdio: 'inherit', timeout: 300_000, windowsHide: true }
            );
            log(`  ${pkg} instalado`);
        } catch (err) {
            log(`  AVISO: falha ao instalar ${pkg}: ${err.message}`);
        }
    }
}

// ── Main ──

async function main() {
    log('=== Python Embedded Setup ===');
    log(`Versão: ${PYTHON_VERSION}`);
    log(`Destino: ${DEST_DIR}`);

    // Se já existe e tem python.exe, pula
    const pythonExe = path.join(DEST_DIR, 'python.exe');
    if (fs.existsSync(pythonExe)) {
        try {
            const version = execSync(`"${pythonExe}" --version`, {
                encoding: 'utf-8',
                timeout: 5000,
                windowsHide: true,
            }).trim();
            log(`Python já existe: ${version}`);
            log('Pulando download. Delete resources/python-embedded/ para forçar re-download.');
            return;
        } catch {
            log('python.exe existe mas não funciona — re-baixando...');
        }
    }

    // Limpa destino
    if (fs.existsSync(DEST_DIR)) {
        log('Limpando diretório anterior...');
        fs.rmSync(DEST_DIR, { recursive: true, force: true });
    }

    // Cria dirs
    ensureDir(DEST_DIR);
    ensureDir(TEMP_DIR);

    const zipPath = path.join(TEMP_DIR, PYTHON_ZIP_NAME);

    try {
        // 1. Baixa Python embeddable
        await download(PYTHON_URL, zipPath);

        // 2. Extrai
        extractZip(zipPath, DEST_DIR);

        // 3. Habilita import site
        enableSiteImport(DEST_DIR);

        // 4. Instala pip
        await installPip(pythonExe);

        // 5. Pre-instala pacotes
        await preInstallPackages(pythonExe);

        // Verifica
        try {
            const version = execSync(`"${pythonExe}" --version`, {
                encoding: 'utf-8',
                timeout: 5000,
                windowsHide: true,
            }).trim();
            log(`\n✓ Setup completo: ${version}`);
            log(`  Caminho: ${pythonExe}`);
        } catch {
            log('\n✗ AVISO: python.exe não responde após setup');
        }

    } finally {
        // Limpa temp
        if (fs.existsSync(TEMP_DIR)) {
            fs.rmSync(TEMP_DIR, { recursive: true, force: true });
        }
    }
}

main().catch(err => {
    console.error('[python-setup] ERRO:', err.message);
    process.exit(1);
});
