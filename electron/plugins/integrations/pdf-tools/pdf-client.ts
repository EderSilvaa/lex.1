/**
 * PDF Tools Client (Phase 3 AIOS — Plugins)
 *
 * Utility functions for local PDF manipulation.
 * Uses pdf-lib for merge/split and pdf-parse v2 (PDFParse class) for text extraction.
 */

import * as fs from 'fs/promises';
import { PDFDocument } from 'pdf-lib';

export interface PdfInfo {
    pages: number;
    title?: string;
    author?: string;
}

/**
 * Merge multiple PDF files into a single PDF.
 */
export async function mergePdfs(filePaths: string[]): Promise<Buffer> {
    const merged = await PDFDocument.create();

    for (const filePath of filePaths) {
        const bytes = await fs.readFile(filePath);
        const doc = await PDFDocument.load(bytes);
        const pages = await merged.copyPages(doc, doc.getPageIndices());
        for (const page of pages) {
            merged.addPage(page);
        }
    }

    const resultBytes = await merged.save();
    return Buffer.from(resultBytes);
}

/**
 * Parse a page ranges string like "1-3,5,7-10" into an array of 0-based page indices.
 */
function parsePageRanges(rangeStr: string, totalPages: number): number[] {
    const indices: Set<number> = new Set();
    const parts = rangeStr.split(',').map(s => s.trim()).filter(Boolean);

    for (const part of parts) {
        if (part.includes('-')) {
            const sides = part.split('-');
            const start = Math.max(1, parseInt(sides[0] || '1', 10));
            const end = Math.min(totalPages, parseInt(sides[1] || String(totalPages), 10));
            for (let i = start; i <= end; i++) {
                indices.add(i - 1);
            }
        } else {
            const page = parseInt(part, 10);
            if (page >= 1 && page <= totalPages) {
                indices.add(page - 1);
            }
        }
    }

    return Array.from(indices).sort((a, b) => a - b);
}

/**
 * Split a PDF by page ranges. Each range produces a separate PDF Buffer.
 * Range format: "1-3,5,7-10" — each comma-separated segment becomes one output PDF.
 */
export async function splitPdf(filePath: string, pageRanges: string): Promise<Buffer[]> {
    const bytes = await fs.readFile(filePath);
    const source = await PDFDocument.load(bytes);
    const totalPages = source.getPageCount();

    const segments = pageRanges.split(',').map(s => s.trim()).filter(Boolean);
    const results: Buffer[] = [];

    for (const segment of segments) {
        const indices = parsePageRanges(segment, totalPages);
        if (indices.length === 0) continue;

        const newDoc = await PDFDocument.create();
        const pages = await newDoc.copyPages(source, indices);
        for (const page of pages) {
            newDoc.addPage(page);
        }
        const docBytes = await newDoc.save();
        results.push(Buffer.from(docBytes));
    }

    return results;
}

/**
 * Extract text content from a PDF file using pdf-parse.
 * Optionally extract only specific pages.
 */
export async function extractText(filePath: string, pageRanges?: string): Promise<string> {
    const buffer = await fs.readFile(filePath);
    const pdfParseModule: any = await import('pdf-parse');
    const pdfParse = pdfParseModule?.default ?? pdfParseModule;

    if (!pageRanges) {
        const data = await pdfParse(buffer);
        return data.text;
    }

    // If page ranges specified, extract only those pages via pdf-lib first
    const source = await PDFDocument.load(buffer);
    const totalPages = source.getPageCount();
    const indices = parsePageRanges(pageRanges, totalPages);

    if (indices.length === 0) {
        return '';
    }

    const subset = await PDFDocument.create();
    const pages = await subset.copyPages(source, indices);
    for (const page of pages) {
        subset.addPage(page);
    }
    const subsetBytes = await subset.save();
    const data = await pdfParse(Buffer.from(subsetBytes));
    return data.text;
}

/**
 * Get basic PDF metadata.
 */
export async function getPdfInfo(filePath: string): Promise<PdfInfo> {
    const bytes = await fs.readFile(filePath);
    const doc = await PDFDocument.load(bytes);

    return {
        pages: doc.getPageCount(),
        title: doc.getTitle() || undefined,
        author: doc.getAuthor() || undefined,
    };
}
