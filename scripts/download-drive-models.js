#!/usr/bin/env node
/**
 * Download de modelos jurídicos do Google Drive (pasta pública compartilhada).
 *
 * Uso: node scripts/download-drive-models.js
 *
 * Salva em: electron/batch/modelos/drive/<AREA>/<arquivo>.txt
 */

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

// ─── Pastas do Drive ─────────────────────────────────────────────────
const FOLDERS = [
    { id: '1wmaUiWMFfgJ8Q80k4sCyQMxdYgRMp1pq', name: 'ADMINISTRATIVO' },
    { id: '1HxXWHPgUjZ5QE_6GIvkeJceGjaZx9nZ4', name: 'AMBIENTAL' },
    { id: '1mGrUlzXCoZDtFcWBfv0g2oCVDh0rgsCs', name: 'BANCARIO' },
    { id: '1KIB6F71C6WFGCec0HE4PJm2SM-EkSMiC', name: 'CIVEL_SUCESSOES' },
    { id: '1gIcgJu6KBw58p9rhBBLpTFLV-suFGfhD', name: 'CONSUMIDOR' },
    { id: '1B_eo3TGdspy-28BHa1Hd8dyheU5mUE_I', name: 'CONTRATOS' },
    { id: '1SzO-I2jEFHEQKIhtYuA76uc_DjlfRMVA', name: 'DICIONARIO_JURIDICO' },
    { id: '1L809J6pMBxHxrYKG3ggVwr0rgHZqZCkB', name: 'DOCUMENTOS_ADVOGADO' },
    { id: '1EekmxaRzc2EbJC9x23yUEJrHNmbiIy2g', name: 'FAMILIA' },
    { id: '1aHFN_4i421tl4tPTmjzjm1r4KIHePUBQ', name: 'IMOBILIARIO' },
    { id: '1qHj3XZnbeVOWgyGI3mepKGs0H2sZd4TF', name: 'MATERIAL_BASE' },
    { id: '1fmfjSqLI7h1JrWpx1peUj0VS9yWuPGRV', name: 'PENAL' },
    { id: '1S6D9kbBG9UxDUZvSRh8NMrH-Ll049U-Y', name: 'PETICOES_DIVERSAS' },
    { id: '1-mMW33Pz0ZiEMfW6fJw6aLbVWGuSn_Pk', name: 'PLANO_SAUDE' },
    { id: '1wJMbu7T9_u5pH68un9yZKPlfkmdOxB7v', name: 'PREVIDENCIARIO' },
    { id: '13SbR_GaoQHMPH4DYCpWb5sBD-vIOLjol', name: 'RECURSOS_DIVERSOS' },
    { id: '1ZpbBawDNO2-ISDPML7F6b2ZM2Iw46rCJ', name: 'TRABALHISTA' },
    { id: '1dDMyliMjNToWcBfAtnzmeZYud_X08Yfk', name: 'TRANSITO' },
    { id: '1gqa6zhVPiWazPOsdxoICb6dQQPMlrGuC', name: 'TRIBUTARIO' },
];

const OUTPUT_DIR = path.join(__dirname, '..', 'electron', 'batch', 'modelos', 'drive');
const DELAY_MS = 1500; // delay entre requests para não ser bloqueado

// ─── Helpers ─────────────────────────────────────────────────────────

function fetchUrl(url) {
    return new Promise((resolve, reject) => {
        const get = url.startsWith('https') ? https.get : http.get;
        get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
            // Follow redirects
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                return fetchUrl(res.headers.location).then(resolve).catch(reject);
            }
            if (res.statusCode !== 200) {
                res.resume();
                return reject(new Error(`HTTP ${res.statusCode}`));
            }
            let data = '';
            res.setEncoding('utf-8');
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve(data));
            res.on('error', reject);
        }).on('error', reject);
    });
}

function fetchBinary(url) {
    return new Promise((resolve, reject) => {
        const get = url.startsWith('https') ? https.get : http.get;
        get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                return fetchBinary(res.headers.location).then(resolve).catch(reject);
            }
            if (res.statusCode !== 200) {
                res.resume();
                return reject(new Error(`HTTP ${res.statusCode}`));
            }
            const chunks = [];
            res.on('data', chunk => chunks.push(chunk));
            res.on('end', () => resolve(Buffer.concat(chunks)));
            res.on('error', reject);
        }).on('error', reject);
    });
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function sanitizeFilename(name) {
    return name
        .replace(/[<>:"/\\|?*]/g, '_')
        .replace(/\s+/g, ' ')
        .trim()
        .substring(0, 120);
}

// ─── Extract files from folder page ──────────────────────────────────

async function listFilesInFolder(folderId) {
    const url = `https://drive.google.com/drive/folders/${folderId}`;
    const html = await fetchUrl(url);

    const files = [];

    // Extract file IDs from data-id attributes
    const idRe = /data-id="([A-Za-z0-9_-]{20,60})"/g;
    const tooltipRe = /data-tooltip="([^"]+)"/g;

    const ids = [];
    let m;
    while ((m = idRe.exec(html)) !== null) {
        if (m[1] !== folderId) ids.push(m[1]);
    }

    const tooltips = [];
    while ((m = tooltipRe.exec(html)) !== null) {
        const t = m[1].trim();
        if (t && !t.startsWith('Classificar') && t.length > 2) {
            tooltips.push(t);
        }
    }

    // Unique IDs
    const uniqueIds = [...new Set(ids)];

    // Match IDs with names
    // Filter out subfolder tooltips (they end with "Shared folder")
    const fileTooltips = tooltips.filter(t => !t.includes('Shared folder'));
    const folderTooltips = tooltips.filter(t => t.includes('Shared folder'));

    for (let i = 0; i < uniqueIds.length; i++) {
        const id = uniqueIds[i];
        const name = fileTooltips[i] || `file_${i}`;
        const isFolder = folderTooltips.some(t => t.replace(' Shared folder', '') === name);

        files.push({
            id,
            name: name.replace(' Shared folder', ''),
            isFolder: isFolder || name.includes('Shared folder'),
        });
    }

    return files;
}

// ─── Download a file ─────────────────────────────────────────────────

async function downloadFile(fileId, fileName, destDir) {
    fs.mkdirSync(destDir, { recursive: true });

    const isGoogleDoc = !fileName.match(/\.(pdf|docx|doc|txt|odt|rtf|xlsx|pptx|csv)$/i);

    let content;
    let ext;

    if (isGoogleDoc) {
        // Google Docs → export as plain text
        const url = `https://docs.google.com/document/d/${fileId}/export?format=txt`;
        try {
            content = await fetchUrl(url);
            ext = '.txt';
        } catch (e) {
            // Maybe it's a Google Sheets or Slides
            try {
                const url2 = `https://docs.google.com/spreadsheets/d/${fileId}/export?format=csv`;
                content = await fetchUrl(url2);
                ext = '.csv';
            } catch {
                // Try direct download
                try {
                    const url3 = `https://drive.google.com/uc?export=download&id=${fileId}`;
                    content = await fetchUrl(url3);
                    ext = '.txt';
                } catch {
                    console.log(`  [SKIP] ${fileName} — não conseguiu baixar`);
                    return null;
                }
            }
        }
    } else {
        // Regular file — direct download
        const url = `https://drive.google.com/uc?export=download&id=${fileId}`;
        try {
            const buf = await fetchBinary(url);
            // Check if it's a virus scan page (large files)
            const text = buf.toString('utf-8', 0, Math.min(buf.length, 500));
            if (text.includes('Google Drive - Virus scan warning')) {
                // Extract confirm token and retry
                const confirmMatch = text.match(/confirm=([a-zA-Z0-9_-]+)/);
                if (confirmMatch) {
                    const confirmUrl = `https://drive.google.com/uc?export=download&confirm=${confirmMatch[1]}&id=${fileId}`;
                    const buf2 = await fetchBinary(confirmUrl);
                    fs.writeFileSync(path.join(destDir, sanitizeFilename(fileName)), buf2);
                    return fileName;
                }
            }
            fs.writeFileSync(path.join(destDir, sanitizeFilename(fileName)), buf);
            return fileName;
        } catch (e) {
            console.log(`  [SKIP] ${fileName} — ${e.message}`);
            return null;
        }
    }

    if (content && content.length > 50) {
        // Check if we got an HTML error page instead of actual content
        if (content.includes('<!DOCTYPE html>') && content.includes('ServiceLogin')) {
            console.log(`  [SKIP] ${fileName} — requer autenticação`);
            return null;
        }

        const safeName = sanitizeFilename(fileName.replace(/\.[^.]+$/, '')) + ext;
        fs.writeFileSync(path.join(destDir, safeName), content, 'utf-8');
        return safeName;
    }

    console.log(`  [SKIP] ${fileName} — conteúdo vazio`);
    return null;
}

// ─── Main ────────────────────────────────────────────────────────────

async function main() {
    console.log('=== Download de Modelos Jurídicos do Google Drive ===\n');
    console.log(`Destino: ${OUTPUT_DIR}\n`);

    fs.mkdirSync(OUTPUT_DIR, { recursive: true });

    let totalDownloaded = 0;
    let totalFailed = 0;
    const summary = {};

    for (const folder of FOLDERS) {
        console.log(`\n📁 ${folder.name} (${folder.id})`);
        const destDir = path.join(OUTPUT_DIR, folder.name);

        try {
            const files = await listFilesInFolder(folder.id);
            const nonFolderFiles = files.filter(f => !f.isFolder);
            console.log(`  ${files.length} itens encontrados (${nonFolderFiles.length} arquivos)`);

            let folderCount = 0;

            for (const file of nonFolderFiles) {
                await sleep(DELAY_MS);
                process.stdout.write(`  [↓] ${file.name}... `);

                try {
                    const result = await downloadFile(file.id, file.name, destDir);
                    if (result) {
                        console.log('OK');
                        folderCount++;
                        totalDownloaded++;
                    }
                } catch (e) {
                    console.log(`ERRO: ${e.message}`);
                    totalFailed++;
                }
            }

            // Also check subfolders (1 level deep)
            const subfolders = files.filter(f => f.isFolder);
            for (const sub of subfolders) {
                console.log(`  📂 Subpasta: ${sub.name}`);
                await sleep(DELAY_MS);

                try {
                    const subFiles = await listFilesInFolder(sub.id);
                    const subNonFolder = subFiles.filter(f => !f.isFolder);

                    for (const sf of subNonFolder) {
                        await sleep(DELAY_MS);
                        process.stdout.write(`    [↓] ${sf.name}... `);

                        try {
                            const subDestDir = path.join(destDir, sanitizeFilename(sub.name));
                            const result = await downloadFile(sf.id, sf.name, subDestDir);
                            if (result) {
                                console.log('OK');
                                folderCount++;
                                totalDownloaded++;
                            }
                        } catch (e) {
                            console.log(`ERRO: ${e.message}`);
                            totalFailed++;
                        }
                    }
                } catch (e) {
                    console.log(`    [SKIP] subpasta — ${e.message}`);
                }
            }

            summary[folder.name] = folderCount;

        } catch (e) {
            console.log(`  ERRO ao listar: ${e.message}`);
            summary[folder.name] = 0;
        }
    }

    // ─── Summary ──────────────────────────────────────────────────────
    console.log('\n\n=== RESUMO ===');
    console.log(`Total baixados: ${totalDownloaded}`);
    console.log(`Total falhas: ${totalFailed}`);
    console.log('\nPor pasta:');
    for (const [name, count] of Object.entries(summary)) {
        console.log(`  ${name}: ${count} arquivo(s)`);
    }
    console.log(`\nArquivos salvos em: ${OUTPUT_DIR}`);
}

main().catch(err => {
    console.error('Erro fatal:', err);
    process.exit(1);
});
