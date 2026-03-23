/**
 * Clipboard Client — Electron built-in clipboard utilities
 *
 * No external dependencies — uses Electron's clipboard and nativeImage modules.
 */

import { clipboard, nativeImage } from 'electron';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Reads plain text from the system clipboard.
 */
export function readText(): string {
    return clipboard.readText() || '';
}

/**
 * Writes plain text to the system clipboard.
 */
export function writeText(text: string): void {
    clipboard.writeText(text);
}

/**
 * Reads HTML content from the system clipboard.
 */
export function readHTML(): string {
    return clipboard.readHTML() || '';
}

/**
 * Writes HTML content to the system clipboard.
 * Also sets a plain-text fallback by stripping tags.
 */
export function writeHTML(html: string): void {
    // Strip HTML tags for plain-text fallback
    const plainText = html.replace(/<[^>]*>/g, '').trim();
    clipboard.write({ html, text: plainText });
}

/**
 * Reads an image from the clipboard and returns it as base64 PNG.
 * Returns null if no image is present.
 */
export function readImage(): { base64: string; width: number; height: number } | null {
    const image = clipboard.readImage();
    if (image.isEmpty()) return null;

    const size = image.getSize();
    const base64 = image.toPNG().toString('base64');

    return {
        base64,
        width: size.width,
        height: size.height,
    };
}

/**
 * Writes an image file to the clipboard.
 * Supports PNG, JPG, BMP, GIF and other formats nativeImage can decode.
 */
export function writeImage(imagePath: string): void {
    const resolved = path.resolve(imagePath);
    if (!fs.existsSync(resolved)) {
        throw new Error(`Arquivo não encontrado: ${resolved}`);
    }

    const image = nativeImage.createFromPath(resolved);
    if (image.isEmpty()) {
        throw new Error(`Não foi possível carregar a imagem: ${resolved}`);
    }

    clipboard.writeImage(image);
}

/**
 * Reads RTF content from the system clipboard.
 */
export function readRTF(): string {
    return clipboard.readRTF() || '';
}

/**
 * Returns an array of available clipboard format strings.
 */
export function getFormats(): string[] {
    return clipboard.availableFormats() || [];
}

/**
 * Clears all clipboard content.
 */
export function clear(): void {
    clipboard.clear();
}
