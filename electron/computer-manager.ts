/**
 * Computer Manager
 *
 * Controle do PC inteiro via Vision AI + nut-js.
 * Loop: Screenshot → Claude Vision analisa → executa ação (mouse/teclado) → repete.
 *
 * Espelho de browser-manager.ts para o nível de OS.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { exec } from 'child_process';
import { promisify } from 'util';
import { callAIWithVision } from './ai-handler';

const execAsync = promisify(exec);

// nut-js carregado dinamicamente (graceful degradation se binários nativos falharem)
type NutJs = typeof import('@nut-tree-fork/nut-js');
let nutjs: NutJs | null = null;
let nutjsAvailable = false;

// Estado
let initialized = false;
let realWidth = 1920;
let realHeight = 1080;

// ============================================================================
// Types
// ============================================================================

export type ComputerAction =
    | { type: 'click'; x: number; y: number }
    | { type: 'double_click'; x: number; y: number }
    | { type: 'right_click'; x: number; y: number }
    | { type: 'type'; texto: string }
    | { type: 'key'; teclas: string[] }
    | { type: 'scroll'; x: number; y: number; direcao: 'up' | 'down'; quantidade: number }
    | { type: 'screenshot' }
    | { type: 'done'; resultado: string };

interface VisionDecision {
    raciocinio: string;
    acao: string;
    x?: number;
    y?: number;
    texto?: string;
    teclas?: string[];
    direcao?: 'up' | 'down';
    quantidade?: number;
    concluido: boolean;
    resultado?: string;
}

// ============================================================================
// Prompt de sistema para Vision
// ============================================================================

const SYSTEM_PROMPT = `Você é um agente de automação de PC Windows. Recebe screenshots e controla mouse e teclado para atingir um objetivo.

Responda APENAS com JSON válido, sem markdown, sem texto extra:
{
  "raciocinio": "o que vejo e qual a próxima ação e por quê",
  "acao": "click|double_click|right_click|type|key|scroll|screenshot|done",
  "x": 500,
  "y": 300,
  "texto": "texto a digitar",
  "teclas": ["ctrl", "s"],
  "direcao": "down",
  "quantidade": 3,
  "concluido": false,
  "resultado": "descrição do resultado quando concluido=true"
}

Regras:
- click/double_click/right_click/scroll: requerem x e y em pixels da imagem recebida
- type: use "texto" com o texto a digitar
- key: use "teclas" como array, ex: ["ctrl","c"], ["enter"], ["alt","f4"]
- screenshot: só observa, sem executar ação
- done: quando o objetivo foi atingido, descreva o resultado

Teclas: enter, tab, escape, backspace, delete, ctrl, alt, shift, win, up, down, left, right, space, home, end, pageup, pagedown, f1-f12, a-z, 0-9`;

// ============================================================================
// Init
// ============================================================================

export async function initComputer(): Promise<void> {
    if (initialized) return;

    // Carrega nut-js dinamicamente
    try {
        nutjs = await import('@nut-tree-fork/nut-js');
        nutjs.mouse.config.autoDelayMs = 60;
        nutjs.keyboard.config.autoDelayMs = 30;
        nutjsAvailable = true;
        console.log('[Computer] nut-js carregado');
    } catch (e: any) {
        console.warn('[Computer] nut-js indisponível:', e.message);
        nutjsAvailable = false;
    }

    // Pega resolução real via PowerShell
    try {
        const { stdout } = await execAsync(
            'powershell -WindowStyle Hidden -Command "Add-Type -AssemblyName System.Windows.Forms; $s=[System.Windows.Forms.Screen]::PrimaryScreen; Write-Output ($s.Bounds.Width.ToString() + \' \' + $s.Bounds.Height.ToString())"'
        );
        const parts = stdout.trim().split(' ');
        if (parts.length >= 2) {
            realWidth = parseInt(parts[0]!) || 1920;
            realHeight = parseInt(parts[1]!) || 1080;
        }
    } catch {
        console.warn('[Computer] Não foi possível detectar resolução, usando 1920x1080');
    }

    console.log(`[Computer] Resolução: ${realWidth}x${realHeight}, nut-js: ${nutjsAvailable}`);
    initialized = true;
}

export async function ensureComputer(): Promise<void> {
    if (!initialized) await initComputer();
}

export function getDisplayInfo(): { width: number; height: number; nutjsAvailable: boolean } {
    return { width: realWidth, height: realHeight, nutjsAvailable };
}

export function closeComputer(): void {
    initialized = false;
    nutjs = null;
    nutjsAvailable = false;
}

// ============================================================================
// Screenshot via PowerShell (sem deps extras)
// ============================================================================

export async function takeScreenshot(maxWidth = 1280): Promise<{ buffer: Buffer; scaleX: number; scaleY: number }> {
    const tmpPng = path.join(os.tmpdir(), `lex-shot-${Date.now()}.png`);
    const tmpPs = path.join(os.tmpdir(), `lex-shot-${Date.now()}.ps1`);

    // Forward slashes funcionam no Windows para System.Drawing
    const pngPath = tmpPng.replace(/\\/g, '/');

    const script = `
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
$screen = [System.Windows.Forms.Screen]::PrimaryScreen
$origW = $screen.Bounds.Width
$origH = $screen.Bounds.Height
$maxW = ${maxWidth}
$scale = if ($origW -gt $maxW) { [double]$maxW / [double]$origW } else { 1.0 }
$newW = [int]($origW * $scale)
$newH = [int]($origH * $scale)
$bmp = New-Object System.Drawing.Bitmap($origW, $origH)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.CopyFromScreen($screen.Bounds.Location, [System.Drawing.Point]::Empty, $screen.Bounds.Size)
$g.Dispose()
$scaled = New-Object System.Drawing.Bitmap($newW, $newH)
$g2 = [System.Drawing.Graphics]::FromImage($scaled)
$g2.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$g2.DrawImage($bmp, 0, 0, $newW, $newH)
$g2.Dispose()
$bmp.Dispose()
$scaled.Save("${pngPath}")
$scaled.Dispose()
Write-Output "$origW $origH $newW $newH"
`.trim();

    await fs.writeFile(tmpPs, script, 'utf-8');

    try {
        const { stdout } = await execAsync(
            `powershell -WindowStyle Hidden -ExecutionPolicy Bypass -File "${tmpPs}"`,
            { timeout: 15000 }
        );

        const parts = stdout.trim().split(/\s+/);
        const origW = parseInt(parts[0]!) || realWidth;
        const origH = parseInt(parts[1]!) || realHeight;
        const newW = parseInt(parts[2]!) || maxWidth;
        const newH = parseInt(parts[3]!) || Math.round(realHeight * (maxWidth / realWidth));

        realWidth = origW;
        realHeight = origH;

        const buffer = await fs.readFile(tmpPng);

        return {
            buffer,
            scaleX: origW / newW,
            scaleY: origH / newH
        };
    } finally {
        await fs.unlink(tmpPs).catch(() => {});
        await fs.unlink(tmpPng).catch(() => {});
    }
}

// ============================================================================
// Execução de ações
// ============================================================================

export async function executeAction(action: ComputerAction): Promise<void> {
    if (action.type === 'screenshot' || action.type === 'done') return;

    if (!nutjsAvailable || !nutjs) {
        throw new Error('nut-js não disponível. Não é possível controlar mouse/teclado.');
    }

    const { mouse, keyboard, Key, Button } = nutjs;

    switch (action.type) {
        case 'click':
            await mouse.setPosition({ x: action.x, y: action.y });
            await mouse.leftClick();
            break;

        case 'double_click':
            await mouse.setPosition({ x: action.x, y: action.y });
            await mouse.doubleClick(Button.LEFT);
            break;

        case 'right_click':
            await mouse.setPosition({ x: action.x, y: action.y });
            await mouse.rightClick();
            break;

        case 'type':
            await keyboard.type(action.texto);
            break;

        case 'key': {
            const keys = action.teclas.map(k => resolveKey(k, Key));
            await keyboard.pressKey(...keys);
            break;
        }

        case 'scroll':
            await mouse.setPosition({ x: action.x, y: action.y });
            if (action.direcao === 'down') {
                await mouse.scrollDown(action.quantidade);
            } else {
                await mouse.scrollUp(action.quantidade);
            }
            break;
    }
}

// ============================================================================
// Loop principal: Vision → Decide → Age → Repete
// ============================================================================

export async function runComputerTask(
    instrucao: string,
    maxSteps = 15,
    onStep?: (step: string) => void
): Promise<string> {
    await ensureComputer();

    if (!nutjsAvailable) {
        return 'nut-js não disponível. Verifique se os binários nativos foram instalados corretamente (npm rebuild).';
    }

    const historico: string[] = [];

    for (let step = 1; step <= maxSteps; step++) {
        console.log(`[Computer] Passo ${step}/${maxSteps}`);

        // 1. Screenshot
        let shot: { buffer: Buffer; scaleX: number; scaleY: number };
        try {
            shot = await takeScreenshot(1280);
        } catch (e: any) {
            return `Erro ao capturar tela: ${e.message}`;
        }

        const imageBase64 = shot.buffer.toString('base64');

        // 2. Prompt com histórico dos últimos passos
        const historicoText = historico.length > 0
            ? `\n\nÚltimas ações:\n${historico.slice(-5).join('\n')}`
            : '';
        const userPrompt = `Objetivo: ${instrucao}${historicoText}\n\nPasso ${step}/${maxSteps}. O que fazer agora?`;

        // 3. Claude Vision analisa
        let raw: string;
        try {
            raw = await callAIWithVision({
                system: SYSTEM_PROMPT,
                user: userPrompt,
                imageBase64,
                mediaType: 'image/png',
                temperature: 0.1,
                maxTokens: 600
            });
        } catch (e: any) {
            return `Erro na Vision AI (passo ${step}): ${e.message}`;
        }

        // 4. Parse
        let decision: VisionDecision;
        try {
            const jsonMatch = raw.match(/\{[\s\S]*\}/);
            decision = JSON.parse(jsonMatch?.[0] || raw);
        } catch {
            console.warn('[Computer] JSON inválido:', raw.substring(0, 200));
            historico.push(`Passo ${step}: resposta inválida, tentando novamente`);
            continue;
        }

        // 5. Progresso
        const stepMsg = `[Passo ${step}] ${decision.raciocinio}`;
        onStep?.(stepMsg);
        console.log(`[Computer] ${stepMsg}`);

        const actionDesc = buildActionDescription(decision);
        historico.push(`Passo ${step}: ${actionDesc}`);

        // 6. Concluído?
        if (decision.concluido || decision.acao === 'done') {
            return decision.resultado || decision.raciocinio || 'Tarefa concluída.';
        }

        // 7. Executa ação com coordenadas escaladas de volta para resolução real
        const action = buildAction(decision, shot.scaleX, shot.scaleY);
        try {
            await executeAction(action);
        } catch (e: any) {
            console.error(`[Computer] Erro na ação "${decision.acao}":`, e.message);
            historico.push(`  ⚠️ Erro: ${e.message}`);
        }

        // Pausa para a tela reagir antes do próximo screenshot
        await new Promise(r => setTimeout(r, 600));
    }

    return `Atingi o limite de ${maxSteps} passos. Última ação: ${historico.at(-1) ?? '-'}`;
}

// ============================================================================
// Helpers
// ============================================================================

function buildAction(d: VisionDecision, scaleX: number, scaleY: number): ComputerAction {
    const x = d.x !== undefined ? Math.round(d.x * scaleX) : 0;
    const y = d.y !== undefined ? Math.round(d.y * scaleY) : 0;

    switch (d.acao) {
        case 'click':       return { type: 'click', x, y };
        case 'double_click': return { type: 'double_click', x, y };
        case 'right_click': return { type: 'right_click', x, y };
        case 'type':        return { type: 'type', texto: d.texto || '' };
        case 'key':         return { type: 'key', teclas: d.teclas || ['enter'] };
        case 'scroll':      return { type: 'scroll', x, y, direcao: d.direcao || 'down', quantidade: d.quantidade || 3 };
        case 'screenshot':  return { type: 'screenshot' };
        default:            return { type: 'done', resultado: d.resultado || '' };
    }
}

function buildActionDescription(d: VisionDecision): string {
    switch (d.acao) {
        case 'click':        return `click em (${d.x}, ${d.y})`;
        case 'double_click': return `double_click em (${d.x}, ${d.y})`;
        case 'right_click':  return `right_click em (${d.x}, ${d.y})`;
        case 'type':         return `type "${d.texto?.substring(0, 30)}"`;
        case 'key':          return `key [${d.teclas?.join('+')}]`;
        case 'scroll':       return `scroll ${d.direcao} em (${d.x}, ${d.y})`;
        case 'screenshot':   return 'observando tela';
        default:             return `done: ${d.resultado?.substring(0, 50)}`;
    }
}

const KEY_MAP: Record<string, string> = {
    enter: 'Return', return: 'Return',
    tab: 'Tab', escape: 'Escape', esc: 'Escape',
    backspace: 'Backspace', delete: 'Delete',
    ctrl: 'LeftControl', control: 'LeftControl',
    alt: 'LeftAlt', shift: 'LeftShift',
    win: 'LeftSuper', windows: 'LeftSuper',
    up: 'Up', down: 'Down', left: 'Left', right: 'Right',
    space: 'Space', home: 'Home', end: 'End',
    pageup: 'PageUp', pagedown: 'PageDown',
    f1: 'F1', f2: 'F2', f3: 'F3', f4: 'F4', f5: 'F5', f6: 'F6',
    f7: 'F7', f8: 'F8', f9: 'F9', f10: 'F10', f11: 'F11', f12: 'F12'
};

function resolveKey(key: string, Key: any): any {
    const lower = key.toLowerCase();

    // Mapa direto
    const mapped = KEY_MAP[lower];
    if (mapped && Key[mapped]) return Key[mapped];

    // Letra única: Key.A ... Key.Z
    if (/^[a-z]$/.test(lower)) {
        const k = `Key${lower.toUpperCase()}`;
        if (Key[k]) return Key[k];
    }

    // Número: Key.Num0 ... Key.Num9
    if (/^[0-9]$/.test(key)) {
        const k = `Num${key}`;
        if (Key[k]) return Key[k];
    }

    console.warn(`[Computer] Tecla desconhecida: "${key}", substituindo por Return`);
    return Key.Return;
}
