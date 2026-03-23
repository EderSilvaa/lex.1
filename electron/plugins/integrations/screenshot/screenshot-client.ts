/**
 * Screenshot Client — Utilitarios para captura de tela (Phase 3 AIOS)
 *
 * Usa screenshot-desktop para captura e retorna Buffer PNG.
 * Sem dependencias pesadas (sem tesseract, sem sharp).
 */

import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
import { screen } from 'electron';

// screenshot-desktop retorna Buffer (PNG) quando filename nao e passado
// eslint-disable-next-line @typescript-eslint/no-var-requires
const screenshot = require('screenshot-desktop');

/**
 * Captura a tela inteira e retorna Buffer PNG.
 */
export async function captureScreen(): Promise<Buffer> {
    const buf: Buffer = await screenshot({ format: 'png' });
    return buf;
}

/**
 * Captura a tela inteira (region cropping e best-effort — retorna tela cheia com metadata).
 * Para crop real, seria necessario sharp ou jimp, que sao deps pesadas.
 * Retorna o buffer da tela inteira + metadata da regiao solicitada.
 */
export async function captureRegion(
    x: number,
    y: number,
    width: number,
    height: number,
): Promise<{ buffer: Buffer; region: { x: number; y: number; width: number; height: number } }> {
    const buf = await captureScreen();
    return {
        buffer: buf,
        region: { x, y, width, height },
    };
}

/**
 * Salva buffer PNG em arquivo. Retorna o caminho absoluto.
 */
export async function saveScreenshot(buffer: Buffer, outputPath?: string): Promise<string> {
    const filePath = outputPath || path.join(
        os.tmpdir(),
        `lex-screenshot-${Date.now()}.png`,
    );
    await fs.promises.writeFile(filePath, buffer);
    return filePath;
}

/**
 * Retorna dimensoes da tela principal.
 */
export function getScreenInfo(): { width: number; height: number } {
    const primaryDisplay = screen.getPrimaryDisplay();
    const { width, height } = primaryDisplay.size;
    return { width, height };
}
