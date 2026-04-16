/**
 * promptSelect — Seletor interativo com ↑↓ + Enter
 *
 * Assume que readline já está pausado (rl.pause()) quando chamado.
 * Toma controle temporário do stdin em raw mode, renderiza a lista
 * com ANSI, e resolve com o item selecionado (ou null se Esc/Ctrl-C).
 */

const C     = (s: string) => (process.stdout.isTTY ? s : '');
const CYAN  = C('\x1b[36m');
const GRAY  = C('\x1b[90m');
const BOLD  = C('\x1b[1m');
const RESET = C('\x1b[0m');

export async function promptSelect<T>(
    items: T[],
    display: (item: T) => string,
    title?: string,
): Promise<T | null> {
    if (!process.stdin.isTTY || !process.stdout.isTTY || items.length === 0) return null;

    const hasTitle = !!title;
    const numLines = (hasTitle ? 1 : 0) + items.length + 1; // +1 linha hint

    return new Promise<T | null>((resolve) => {
        let idx = 0;

        function render(redraw: boolean) {
            if (redraw) process.stdout.write(`\x1b[${numLines}A`);
            if (hasTitle) {
                process.stdout.write(`\x1b[2K  ${BOLD}${CYAN}${title}${RESET}\n`);
            }
            for (let i = 0; i < items.length; i++) {
                const sel = i === idx;
                const cur = sel ? `${CYAN}▶${RESET}` : ' ';
                const txt = display(items[i]!);
                process.stdout.write(
                    `\x1b[2K ${cur} ${sel ? BOLD + txt + RESET : GRAY + txt + RESET}\n`,
                );
            }
            process.stdout.write(
                `\x1b[2K  ${GRAY}↑↓ navegar  Enter confirmar  Esc cancelar${RESET}\n`,
            );
        }

        render(false);

        // Salva estado anterior do raw mode (readline pode ter setado true)
        const prevRaw = (process.stdin as any).isRaw as boolean | undefined;
        process.stdin.setRawMode(true);
        process.stdin.resume();

        function onData(buf: Buffer) {
            const hex = buf.toString('hex');
            if (hex === '1b5b41') {                         // ↑
                if (idx > 0) { idx--; render(true); }
            } else if (hex === '1b5b42') {                 // ↓
                if (idx < items.length - 1) { idx++; render(true); }
            } else if (hex === '0d' || hex === '0a') {     // Enter / LF
                finish(items[idx] ?? null);
            } else if (hex === '1b' || hex === '03') {     // Esc / Ctrl-C
                finish(null);
            }
        }

        function finish(result: T | null) {
            process.stdin.removeListener('data', onData);
            process.stdin.pause();
            try { process.stdin.setRawMode(prevRaw ?? false); } catch { /* ok */ }
            // Limpa as linhas do seletor
            process.stdout.write(`\x1b[${numLines}A`);
            for (let i = 0; i < numLines; i++) process.stdout.write('\x1b[2K\n');
            process.stdout.write(`\x1b[${numLines}A`);
            resolve(result);
        }

        // prependListener garante que nosso handler dispara antes do readline
        process.stdin.prependListener('data', onData);
    });
}
