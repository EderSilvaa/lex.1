"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.searchJurisprudence = searchJurisprudence;
exports.registerCrawlerHandlers = registerCrawlerHandlers;
const electron_1 = require("electron");
// Specialized Crawler for Jurisprudence
// Uses a hidden BrowserWindow to scrape results without user interference.
let crawlerWindow = null;
function ensureCrawlerWindow() {
    if (crawlerWindow && !crawlerWindow.isDestroyed())
        return crawlerWindow;
    crawlerWindow = new electron_1.BrowserWindow({
        show: false, // HIDDEN
        width: 1024,
        height: 768,
        webPreferences: {
            offscreen: true, // Render in background
            nodeIntegration: false,
            contextIsolation: true
        }
    });
    // Set User Agent to avoid simple blocking
    crawlerWindow.webContents.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    return crawlerWindow;
}
function searchJurisprudence(query) {
    return __awaiter(this, void 0, void 0, function* () {
        const win = ensureCrawlerWindow();
        console.log(`[CRAWLER] Searching for: ${query}`);
        // Switch to DuckDuckGo (html version is lighter and less likely to blocking)
        // CHANGED: Targeting only official Justice domains (.jus.br)
        const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query + ' site:jus.br')}`;
        try {
            yield win.loadURL(searchUrl);
        }
        catch (e) {
            if (e.code === 'ERR_ABORTED' || e.errno === -3) {
                console.log('[CRAWLER] Navigation redirected/aborted, continuing...');
            }
            else {
                throw e;
            }
        }
        // Initial wait for load
        yield new Promise(r => setTimeout(r, 2000));
        // Scrape Logic (DuckDuckGo HTML)
        const results = yield win.webContents.executeJavaScript(`
        (function() {
            const items = [];
            // DDG HTML structure
            document.querySelectorAll('.result').forEach(el => {
                const titleEl = el.querySelector('.result__a');
                const snippetEl = el.querySelector('.result__snippet');

                if (titleEl) {
                    const url = titleEl.href;
                    // client-side filtering (extra safety)
                    if (url.includes('amazon') || url.includes('mercadolivre') || url.includes('jusbrasil')) return;

                    items.push({
                        title: titleEl.innerText,
                        url: url,
                        snippet: snippetEl ? snippetEl.innerText : ''
                    });
                }
            });
            return items;
        })()
    `);
        // Server-side strict filtering
        const cleanResults = results.filter((r) => {
            const u = r.url.toLowerCase();
            // Allow ONLY official domains (.jus.br), exclude generic aggregators AND PDFs (scrapers fail on PDFs)
            return u.includes('.jus.br') &&
                !u.includes('jusbrasil') &&
                !u.endsWith('.pdf');
        }).slice(0, 3); // Top 3 relevant only
        console.log(`[CRAWLER] Raw Results: ${results.length} | Clean Results (.jus.br): ${cleanResults.length}`);
        // Debug: Log rejected URLs to understand why
        if (cleanResults.length === 0) {
            console.log('[CRAWLER] All results were filtered out! Sample rejected:', results.slice(0, 2).map((r) => r.url));
            return [{
                    title: "Nenhum resultado oficial encontrado",
                    url: "#",
                    snippet: "A busca não retornou processuais em domínios .jus.br. Tente remover o filtro de 'oficial' ou mudar os termos."
                }];
        }
        console.log(`[CRAWLER] Starting Deep Search on ${cleanResults.length} items...`);
        // DEEP SEARCH: Visit each link and extract full content
        for (const item of cleanResults) {
            try {
                console.log(`[CRAWLER] Deep searching: ${item.url}`);
                yield win.loadURL(item.url);
                // Wait for content (randomized slightly)
                yield new Promise(r => setTimeout(r, 1500 + Math.random() * 1000));
                // Extract Main Content Heuristic regarding Official Sites (often messy HTML)
                const fullText = yield win.webContents.executeJavaScript(`
                (function() {
                    // Common classes for decisions in Tribunals
                    const selectors = [
                        'article', 
                        '#conteudo', 
                        '.decision-body', 
                        '.texto-acordao',
                        '#ementa',
                        '.inteiro-teor',
                        '#divConteudo'
                    ];

                    for (const s of selectors) {
                        const el = document.querySelector(s);
                        if (el && el.innerText.length > 200) return el.innerText;
                    }

                    // Fallback: Get body text but try to exclude navs/footers
                    return document.body ? document.body.innerText : "";
                })()
            `);
                if (fullText && fullText.length > 100) {
                    // Remove excessive whitespace
                    const cleanText = fullText.replace(/\s+/g, ' ').substring(0, 1500);
                    item.snippet = "🏛️ [DECISÃO OFICIAL EXTRAÍDA]\\n\\n" + cleanText + "...";
                }
            }
            catch (e) {
                console.error(`[CRAWLER] Failed deep search for ${item.url}`, e);
                item.snippet += "\\n(Não foi possível ler o conteúdo completo deste site oficial).";
            }
        }
        return cleanResults;
    });
}
// Register IPC Handler
function registerCrawlerHandlers() {
    electron_1.ipcMain.handle('crawler-search', (_event, query) => __awaiter(this, void 0, void 0, function* () {
        return yield searchJurisprudence(query);
    }));
}
//# sourceMappingURL=crawler.js.map