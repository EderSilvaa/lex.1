import type { Page } from 'playwright-core';
import { getActivePage } from '../browser-manager';
import { inferPjeEnvironmentContext, type PjeEnvironmentContext } from './environment-context';
import { inspectActivePjePageContext } from './context-inspector';

function samplePageText(page: Page): Promise<string> {
    return page.evaluate(() => String(document.body?.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 2000));
}

export async function inferPjeEnvironmentFromPage(page: Page, tribunal?: string): Promise<PjeEnvironmentContext | undefined> {
    try {
        const [url, title, textSample] = await Promise.all([
            Promise.resolve(page.url()),
            page.title().catch(() => ''),
            samplePageText(page).catch(() => ''),
        ]);
        const environment = inferPjeEnvironmentContext({
            url,
            title,
            tribunal,
            textSnippets: textSample ? [textSample] : [],
        });
        return Object.keys(environment).length > 0 ? environment : undefined;
    } catch {
        return undefined;
    }
}

export async function inferCurrentPjeEnvironment(tribunal?: string): Promise<PjeEnvironmentContext | undefined> {
    try {
        const inspected = await inspectActivePjePageContext({
            maxElementsPerFrame: 40,
            maxTextSnippetsPerFrame: 12,
            includeScreenshot: false,
        });
        const environment = inspected?.ok ? inspected.environment : null;
        if (environment && typeof environment === 'object') {
            const merged = tribunal && !environment.tribunal
                ? { tribunal, ...environment }
                : environment;
            return Object.keys(merged).length > 0 ? merged as PjeEnvironmentContext : undefined;
        }
    } catch {
        // Fallback below.
    }

    const page = getActivePage();
    if (!page) return undefined;
    return inferPjeEnvironmentFromPage(page, tribunal);
}
