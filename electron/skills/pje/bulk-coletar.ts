/**
 * Skill: pje_bulk_coletar
 *
 * Coleta dados de múltiplos processos do PJe em lote via RPA (sem LLM).
 * Conecta ao Chrome existente via CDP porta 19222, abre aba em background,
 * itera os processos e extrai texto do DOM com delay humanizado.
 *
 * Arquitetura híbrida: coleta = RPA puro | análise = LLM em batch posterior.
 */

import { Skill, SkillResult, AgentContext } from '../../agent/types';
import { ensureBrowser } from '../../browser-manager';
import { resolveTribunalRoutes } from '../../pje/tribunal-urls';
import { agentEmitter } from '../../agent/loop';
import { getPythonEnv } from '../../python';
import { spawn } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

const CDP_PORT = 19222;

// ─────────────────────────────────────────────────────────────────────────────
// Script Python embutido — escrito em disco no primeiro uso (padrão CDP_BRIDGE)
// ─────────────────────────────────────────────────────────────────────────────
const BULK_COLLECTOR_PY = `
import asyncio
import json
import sys
import os
import random
from pathlib import Path

async def main():
    args = {}
    i = 1
    while i < len(sys.argv):
        if sys.argv[i].startswith('--') and i + 1 < len(sys.argv):
            args[sys.argv[i][2:]] = sys.argv[i + 1]
            i += 2
        else:
            i += 1

    cdp_port   = int(args.get('cdp-port', '19222'))
    consulta_url = args.get('consulta-url', '')
    processos  = json.loads(args.get('processos', '[]'))
    output     = args.get('output', str(Path.home() / '.lex' / 'bulk' / 'resultado.json'))
    min_delay  = float(args.get('min-delay', '2.0'))
    max_delay  = float(args.get('max-delay', '4.5'))
    total      = len(processos)

    if total == 0:
        print(json.dumps({"type": "error", "message": "Nenhum processo informado"}), flush=True)
        sys.exit(1)

    try:
        from playwright.async_api import async_playwright
    except ImportError:
        print(json.dumps({"type": "error", "message": "playwright nao instalado"}), flush=True)
        sys.exit(1)

    NUM_SELECTORS = [
        'input[id*="numeroProcesso"]',
        'input[id*="numProcesso"]',
        'input[name*="numeroProcesso"]',
        'input[placeholder*="rocesso"]',
        'input[placeholder*="mero"]',
    ]
    BTN_SELECTORS = [
        'input[id*="pesquisar"][type="submit"]',
        'button[id*="pesquisar"]',
        'input[value*="esquisa"]',
        'input[value*="uscar"]',
        'button[type="submit"]',
    ]

    results = []

    async with async_playwright() as p:
        try:
            browser = await p.chromium.connect_over_cdp(f"http://localhost:{cdp_port}")
        except Exception as e:
            print(json.dumps({"type": "error", "message": f"Chrome indisponivel na porta {cdp_port}: {e}"}), flush=True)
            sys.exit(1)

        contexts = browser.contexts
        context  = contexts[0] if contexts else await browser.new_context()
        page     = await context.new_page()

        try:
            for idx, numero in enumerate(processos):
                numero = str(numero).strip()
                status = 'erro'
                texto  = ''
                url    = ''

                try:
                    await page.goto(consulta_url, wait_until='domcontentloaded', timeout=20000)
                    await asyncio.sleep(1.2)

                    filled = False
                    for sel in NUM_SELECTORS:
                        try:
                            el = page.locator(sel).first
                            if await el.is_visible(timeout=2000):
                                await el.fill(numero)
                                filled = True
                                break
                        except Exception:
                            continue

                    if not filled:
                        inputs = await page.query_selector_all('input[type="text"]:visible')
                        if inputs:
                            await inputs[0].fill(numero)
                            filled = True

                    if filled:
                        clicked = False
                        for sel in BTN_SELECTORS:
                            try:
                                btn = await page.query_selector(sel)
                                if btn and await btn.is_visible():
                                    await btn.click()
                                    clicked = True
                                    break
                            except Exception:
                                continue
                        if not clicked:
                            await page.keyboard.press('Enter')
                        await asyncio.sleep(2.5)

                    texto = await page.evaluate("""() => {
                        const el = document.body.cloneNode(true);
                        el.querySelectorAll('script,style,nav,header,footer').forEach(e => e.remove());
                        return (el.textContent || '').replace(/\\\\s+/g,' ').trim().slice(0,3000);
                    }""")
                    url    = page.url
                    status = 'ok'

                except Exception as e:
                    pass

                results.append({"numero": numero, "texto": texto, "url": url, "status": status})
                print(json.dumps({
                    "type": "progress",
                    "current": idx + 1,
                    "total": total,
                    "processo": numero,
                    "status": status
                }), flush=True)

                if idx < total - 1:
                    await asyncio.sleep(random.uniform(min_delay, max_delay))

        finally:
            await page.close()

    os.makedirs(os.path.dirname(output), exist_ok=True)
    with open(output, 'w', encoding='utf-8') as f:
        json.dump(results, f, ensure_ascii=False, indent=2)

    erros = sum(1 for r in results if r['status'] == 'erro')
    print(json.dumps({"type": "done", "total": total, "errors": erros, "output": output}), flush=True)

if __name__ == '__main__':
    asyncio.run(main())
`.trimStart();

// ─────────────────────────────────────────────────────────────────────────────

function getScriptPath(): string {
    const dir = path.join(os.homedir(), '.lex', 'python', 'scripts');
    fs.mkdirSync(dir, { recursive: true });
    const p = path.join(dir, 'bulk_collector.py');
    fs.writeFileSync(p, BULK_COLLECTOR_PY, 'utf-8');
    return p;
}

function emitProgress(texto: string): void {
    agentEmitter.emit('agent-event', { type: 'thinking', pensamento: `⚙️ ${texto}`, iteracao: 0 });
}

export const pjeBulkColetar: Skill = {
    nome: 'pje_bulk_coletar',
    descricao: 'Coleta dados de múltiplos processos do PJe em lote sem usar LLM para navegação (RPA puro). Use quando precisar analisar uma lista de processos (5 ou mais). Retorna JSON estruturado para análise posterior.',
    categoria: 'pje',

    parametros: {
        processos: {
            tipo: 'string',
            descricao: 'JSON array com os números dos processos. Ex: ["0001234-56.2024.8.26.0100","0007890-12.2024.8.26.0200"]',
            obrigatorio: true,
        },
        tribunal: {
            tipo: 'string',
            descricao: 'Tribunal alvo (ex: TJSP, TRT8, TJPA). Usado para resolver a URL de consulta.',
            obrigatorio: false,
            default: '',
        },
    },

    retorno: 'JSON com dados de todos os processos: número, texto extraído, URL, status.',

    exemplos: [
        '{ "skill": "pje_bulk_coletar", "parametros": { "processos": "[\\\"0001234-56.2024.8.26.0100\\\",\\\"0007890-12.2024.8.26.0200\\\"]", "tribunal": "TJSP" } }',
    ],

    async execute(params: Record<string, any>, _context: AgentContext): Promise<SkillResult> {
        // Parse da lista de processos (aceita JSON array ou string com vírgulas)
        let processos: string[] = [];
        const rawProcessos = String(params['processos'] || '').trim();
        try {
            const parsed = JSON.parse(rawProcessos);
            processos = Array.isArray(parsed) ? parsed.map(String) : [String(parsed)];
        } catch {
            processos = rawProcessos.split(',').map(s => s.trim()).filter(Boolean);
        }

        if (processos.length === 0) {
            return { sucesso: false, erro: 'Nenhum processo informado.', mensagem: 'Informe a lista de processos.' };
        }

        const tribunal = String(params['tribunal'] || '').trim();

        // Garante Chrome ativo
        await ensureBrowser();

        // Resolve URL de consulta do tribunal (reutiliza lógica existente)
        const routes = resolveTribunalRoutes(tribunal);
        const consultaUrl = routes.consultaUrl;

        // Verifica Python
        const pyEnv = getPythonEnv();
        if (!pyEnv.isReady()) {
            return {
                sucesso: false,
                erro: 'Python não disponível.',
                mensagem: 'Configure o Python no LEX para usar coleta em lote.',
            };
        }

        // Verifica playwright instalado (silent — só instala se necessário)
        if (!pyEnv.hasPackage('playwright')) {
            emitProgress('Instalando playwright Python (única vez)...');
            const install = await pyEnv.installPackage('playwright');
            if (!install.success) {
                return { sucesso: false, erro: 'Falha ao instalar playwright.', mensagem: install.error || 'Erro desconhecido.' };
            }
        }

        const scriptPath = getScriptPath();
        const outputFile = path.join(os.homedir(), '.lex', 'bulk', `resultado_${Date.now()}.json`);
        fs.mkdirSync(path.dirname(outputFile), { recursive: true });

        emitProgress(`Iniciando coleta de ${processos.length} processos no ${tribunal || 'PJe'}...`);

        return new Promise<SkillResult>((resolve) => {
            const pythonPath = pyEnv.getPythonPath()!;

            const proc = spawn(pythonPath, [
                scriptPath,
                '--cdp-port',    String(CDP_PORT),
                '--consulta-url', consultaUrl,
                '--processos',   JSON.stringify(processos),
                '--output',      outputFile,
            ], { windowsHide: true });

            proc.stdout.on('data', (data: Buffer) => {
                for (const line of data.toString().split('\n')) {
                    if (!line.trim()) continue;
                    try {
                        const msg = JSON.parse(line);
                        if (msg.type === 'progress') {
                            const pct = Math.round((msg.current / msg.total) * 100);
                            emitProgress(`[${pct}%] ${msg.current}/${msg.total} — ${msg.processo} (${msg.status})`);
                        } else if (msg.type === 'error') {
                            resolve({ sucesso: false, erro: msg.message, mensagem: msg.message });
                        }
                    } catch { /* linha não-JSON (ex: warnings do Python) */ }
                }
            });

            proc.stderr.on('data', (data: Buffer) => {
                console.error('[pje_bulk_coletar] stderr:', data.toString().trim());
            });

            proc.on('close', (code: number | null) => {
                if (code !== 0) {
                    resolve({ sucesso: false, erro: `Python encerrou com código ${code}`, mensagem: 'Erro na coleta em lote.' });
                    return;
                }

                try {
                    const resultados: any[] = JSON.parse(fs.readFileSync(outputFile, 'utf-8'));
                    const ok    = resultados.filter(r => r.status === 'ok').length;
                    const erros = resultados.filter(r => r.status === 'erro').length;

                    emitProgress(`Coleta concluída — ${ok} ok, ${erros} erros.`);

                    resolve({
                        sucesso: true,
                        dados: {
                            processos: resultados,
                            total:     resultados.length,
                            ok,
                            erros,
                            arquivo:   outputFile,
                        },
                        mensagem: `Coleta concluída: ${ok}/${resultados.length} processos coletados.${erros > 0 ? ` ${erros} erros.` : ''}\nDados disponíveis para análise.`,
                    });
                } catch (err: any) {
                    resolve({ sucesso: false, erro: err.message, mensagem: 'Erro ao ler resultado da coleta.' });
                }
            });

            proc.on('error', (err: Error) => {
                resolve({ sucesso: false, erro: err.message, mensagem: `Erro ao iniciar Python: ${err.message}` });
            });
        });
    },
};

export default pjeBulkColetar;
