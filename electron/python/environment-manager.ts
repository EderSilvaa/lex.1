/**
 * Python Environment Manager
 *
 * Gerencia o runtime Python embedded para o LEX.
 * Waterfall de detecção:
 *   1. ~/.lex/python/python.exe (setup já feito)
 *   2. resources/python-embedded/ (bundled, extrai no primeiro uso)
 *   3. python no PATH do sistema (fallback)
 *   4. null (skills usam fallback Node)
 */

import { EventEmitter } from 'events';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { execSync } from 'child_process';

export interface PythonEnvStatus {
    ready: boolean;
    pythonPath: string | null;
    version: string | null;
    source: 'embedded' | 'system' | 'none';
    packagesDir: string | null;
}

export class PythonEnvironmentManager extends EventEmitter {
    private _pythonPath: string | null = null;
    private _source: 'embedded' | 'system' | 'none' = 'none';
    private _version: string | null = null;
    private _ready = false;
    private _setupDone = false;

    /** Diretório onde o Python embedded fica extraído */
    private get lexPythonDir(): string {
        return path.join(os.homedir(), '.lex', 'python');
    }

    /** Diretório de resources do app (bundled) */
    private get resourcesDir(): string {
        // Em dev: process.resourcesPath não existe, usa path relativo
        // Em produção: process.resourcesPath aponta para resources/
        try {
            const { app } = require('electron');
            if (app.isPackaged) {
                return path.join(process.resourcesPath, 'python-embedded');
            }
        } catch { /* não é Electron ou não tem app */ }

        // Dev: procura em resources/ relativo ao projeto
        return path.join(__dirname, '..', '..', 'resources', 'python-embedded');
    }

    /** Caminho do python.exe no diretório embedded */
    private embeddedPythonExe(dir: string): string {
        return path.join(dir, 'python.exe');
    }

    /**
     * Detecta e configura o Python disponível.
     * Chamado no boot — não bloqueia, roda em background.
     */
    async setup(): Promise<void> {
        if (this._setupDone) return;
        this._setupDone = true;

        console.log('[Python] Iniciando detecção...');

        // 1. Já extraído em ~/.lex/python/?
        const lexPython = this.embeddedPythonExe(this.lexPythonDir);
        if (this.testPython(lexPython)) {
            this._pythonPath = lexPython;
            this._source = 'embedded';
            this._ready = true;
            console.log(`[Python] Encontrado embedded: ${lexPython} (${this._version})`);
            return;
        }

        // 2. Bundled em resources/? Extrai para ~/.lex/python/
        const bundledPython = this.embeddedPythonExe(this.resourcesDir);
        if (fs.existsSync(bundledPython)) {
            console.log('[Python] Extraindo embedded de resources...');
            this.emit('setup-progress', 'Configurando Python...');

            try {
                await this.extractEmbedded(this.resourcesDir, this.lexPythonDir);
                if (this.testPython(lexPython)) {
                    this._pythonPath = lexPython;
                    this._source = 'embedded';
                    this._ready = true;
                    console.log(`[Python] Embedded extraído: ${lexPython} (${this._version})`);
                    this.emit('setup-progress', 'Python pronto');
                    return;
                }
            } catch (err: any) {
                console.error('[Python] Erro ao extrair embedded:', err.message);
            }
        }

        // 3. Python no PATH do sistema?
        const systemPython = this.findSystemPython();
        if (systemPython) {
            this._pythonPath = systemPython;
            this._source = 'system';
            this._ready = true;
            console.log(`[Python] Usando sistema: ${systemPython} (${this._version})`);
            return;
        }

        // 4. Nenhum Python disponível
        this._source = 'none';
        this._ready = false;
        console.log('[Python] Nenhum Python encontrado — skills usarão fallback Node');
    }

    /** Testa se um python.exe funciona e captura a versão */
    private testPython(pythonPath: string): boolean {
        if (!fs.existsSync(pythonPath)) return false;
        try {
            const output = execSync(`"${pythonPath}" --version`, {
                timeout: 5000,
                encoding: 'utf-8',
                windowsHide: true,
            }).trim();
            // "Python 3.12.8"
            const match = output.match(/Python\s+(\d+\.\d+\.\d+)/i);
            if (match) {
                this._version = match[1]!;
                return true;
            }
        } catch { /* falhou */ }
        return false;
    }

    /** Procura python/python3 no PATH do sistema */
    private findSystemPython(): string | null {
        const candidates = process.platform === 'win32'
            ? ['python', 'python3', 'py']
            : ['python3', 'python'];

        for (const cmd of candidates) {
            try {
                const whichCmd = process.platform === 'win32' ? 'where' : 'which';
                const result = execSync(`${whichCmd} ${cmd}`, {
                    timeout: 3000,
                    encoding: 'utf-8',
                    windowsHide: true,
                }).trim().split('\n')[0]!.trim();

                if (result && this.testPython(result)) {
                    return result;
                }
            } catch { /* não encontrou */ }
        }
        return null;
    }

    /** Copia o Python embedded de resources para ~/.lex/python/ */
    private async extractEmbedded(src: string, dest: string): Promise<void> {
        // Cria diretório destino
        fs.mkdirSync(dest, { recursive: true });

        // Copia recursivamente
        this.copyDirSync(src, dest);

        // Habilita import site no .pth (necessário para pip e site-packages)
        const pthFiles = fs.readdirSync(dest).filter(f => f.endsWith('._pth'));
        for (const pthFile of pthFiles) {
            const pthPath = path.join(dest, pthFile);
            let content = fs.readFileSync(pthPath, 'utf-8');
            // Descomenta "import site"
            content = content.replace(/^#\s*import site/m, 'import site');
            // Adiciona Lib/site-packages ao path se não existir
            if (!content.includes('Lib/site-packages')) {
                content += '\nLib/site-packages\n';
            }
            fs.writeFileSync(pthPath, content);
        }

        // Garante que Lib/site-packages existe
        fs.mkdirSync(path.join(dest, 'Lib', 'site-packages'), { recursive: true });
    }

    /** Copia diretório recursivamente (sync) */
    private copyDirSync(src: string, dest: string): void {
        fs.mkdirSync(dest, { recursive: true });
        const entries = fs.readdirSync(src, { withFileTypes: true });
        for (const entry of entries) {
            const srcPath = path.join(src, entry.name);
            const destPath = path.join(dest, entry.name);
            if (entry.isDirectory()) {
                this.copyDirSync(srcPath, destPath);
            } else {
                fs.copyFileSync(srcPath, destPath);
            }
        }
    }

    // ── API Pública ──

    /** Retorna o caminho do python.exe ou null */
    getPythonPath(): string | null {
        return this._pythonPath;
    }

    /** Verifica se Python está pronto para uso */
    isReady(): boolean {
        return this._ready && this._pythonPath !== null;
    }

    /** Retorna status completo */
    getStatus(): PythonEnvStatus {
        return {
            ready: this._ready,
            pythonPath: this._pythonPath,
            version: this._version,
            source: this._source,
            packagesDir: this._pythonPath
                ? path.join(path.dirname(this._pythonPath), 'Lib', 'site-packages')
                : null,
        };
    }

    /** Verifica se um pacote Python está instalado */
    hasPackage(packageName: string): boolean {
        if (!this._pythonPath) return false;
        try {
            execSync(`"${this._pythonPath}" -c "import ${packageName}"`, {
                timeout: 5000,
                windowsHide: true,
            });
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Instala um pacote Python.
     * Tenta offline (wheels locais) primeiro, depois PyPI.
     */
    async installPackage(packageName: string): Promise<{ success: boolean; error?: string }> {
        if (!this._pythonPath) {
            return { success: false, error: 'Python não disponível' };
        }

        const pythonDir = path.dirname(this._pythonPath);
        const wheelsDir = path.join(pythonDir, '..', 'packages');

        try {
            // Tenta instalar de wheels locais (offline)
            if (fs.existsSync(wheelsDir)) {
                this.emit('install-progress', `Instalando ${packageName} (offline)...`);
                execSync(
                    `"${this._pythonPath}" -m pip install --no-index --find-links="${wheelsDir}" ${packageName}`,
                    { timeout: 120_000, windowsHide: true }
                );
                return { success: true };
            }

            // Fallback: tenta PyPI (precisa de internet)
            this.emit('install-progress', `Instalando ${packageName} (online)...`);
            execSync(
                `"${this._pythonPath}" -m pip install ${packageName}`,
                { timeout: 300_000, windowsHide: true }
            );
            return { success: true };
        } catch (err: any) {
            return { success: false, error: err.message };
        }
    }

    /**
     * Executa um script Python inline e retorna o output.
     */
    async runScript(script: string, args: string[] = [], cwd?: string): Promise<{ success: boolean; stdout: string; exitCode: number }> {
        if (!this._pythonPath) {
            return { success: false, stdout: 'Python não disponível', exitCode: -1 };
        }

        try {
            const output = execSync(
                `"${this._pythonPath}" -c "${script.replace(/"/g, '\\"')}" ${args.join(' ')}`,
                {
                    timeout: 30_000,
                    encoding: 'utf-8',
                    cwd: cwd || os.homedir(),
                    windowsHide: true,
                }
            );
            return { success: true, stdout: output.trim(), exitCode: 0 };
        } catch (err: any) {
            return {
                success: false,
                stdout: err.stderr?.toString() || err.message,
                exitCode: err.status ?? -1,
            };
        }
    }
}
