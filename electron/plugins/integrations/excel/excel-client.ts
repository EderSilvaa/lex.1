/**
 * Excel Client — utilitários locais via exceljs (Phase 3 AIOS)
 */

import ExcelJS from 'exceljs';

export interface SheetMeta {
    name: string;
    rowCount: number;
    columns: string[];
}

export interface WorkbookMeta {
    sheets: SheetMeta[];
}

export interface SheetData {
    headers: string[];
    rows: any[][];
}

export async function readWorkbook(filePath: string): Promise<WorkbookMeta> {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(filePath);

    const sheets: SheetMeta[] = [];
    wb.eachSheet((ws) => {
        const columns: string[] = [];
        const headerRow = ws.getRow(1);
        headerRow.eachCell({ includeEmpty: false }, (cell) => {
            columns.push(String(cell.value ?? ''));
        });
        sheets.push({
            name: ws.name,
            rowCount: ws.rowCount,
            columns,
        });
    });

    return { sheets };
}

export async function readSheet(filePath: string, sheetName?: string, maxRows?: number): Promise<SheetData> {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(filePath);

    const ws = sheetName ? wb.getWorksheet(sheetName) : wb.worksheets[0];
    if (!ws) throw new Error(sheetName ? `Planilha "${sheetName}" não encontrada.` : 'Nenhuma planilha no arquivo.');

    const headers: string[] = [];
    const headerRow = ws.getRow(1);
    headerRow.eachCell({ includeEmpty: false }, (cell) => {
        headers.push(String(cell.value ?? ''));
    });

    const limit = maxRows ?? 100;
    const rows: any[][] = [];
    const lastRow = Math.min(ws.rowCount, 1 + limit);

    for (let r = 2; r <= lastRow; r++) {
        const row = ws.getRow(r);
        const cells: any[] = [];
        for (let c = 1; c <= headers.length; c++) {
            const cell = row.getCell(c);
            cells.push(cell.value ?? '');
        }
        // Pular linhas completamente vazias
        if (cells.every((v) => v === '' || v === null || v === undefined)) continue;
        rows.push(cells);
    }

    return { headers, rows };
}

export async function createWorkbook(filePath: string, sheetName: string, headers: string[], rows: any[][]): Promise<string> {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet(sheetName);

    ws.addRow(headers);
    for (const row of rows) {
        ws.addRow(row);
    }

    // Auto-width nas colunas
    ws.columns.forEach((col) => {
        let maxLen = 10;
        col.eachCell?.({ includeEmpty: false }, (cell) => {
            const len = String(cell.value ?? '').length;
            if (len > maxLen) maxLen = len;
        });
        col.width = Math.min(maxLen + 2, 50);
    });

    await wb.xlsx.writeFile(filePath);
    return filePath;
}

export async function addSheet(filePath: string, sheetName: string, headers: string[], rows: any[][]): Promise<string> {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(filePath);

    if (wb.getWorksheet(sheetName)) {
        throw new Error(`Planilha "${sheetName}" já existe no arquivo.`);
    }

    const ws = wb.addWorksheet(sheetName);
    ws.addRow(headers);
    for (const row of rows) {
        ws.addRow(row);
    }

    ws.columns.forEach((col) => {
        let maxLen = 10;
        col.eachCell?.({ includeEmpty: false }, (cell) => {
            const len = String(cell.value ?? '').length;
            if (len > maxLen) maxLen = len;
        });
        col.width = Math.min(maxLen + 2, 50);
    });

    await wb.xlsx.writeFile(filePath);
    return filePath;
}

export async function toCSV(filePath: string, sheetName?: string): Promise<string> {
    const { headers, rows } = await readSheet(filePath, sheetName, 100000);

    const escape = (v: any): string => {
        const s = String(v ?? '');
        if (s.includes(',') || s.includes('"') || s.includes('\n')) {
            return `"${s.replace(/"/g, '""')}"`;
        }
        return s;
    };

    const lines: string[] = [headers.map(escape).join(',')];
    for (const row of rows) {
        lines.push(row.map(escape).join(','));
    }
    return lines.join('\n');
}
