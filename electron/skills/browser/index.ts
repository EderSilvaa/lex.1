/**
 * Skills Browser - Exports
 *
 * Tools atômicas de browser inspiradas no browser-use.
 * Dão ao agente controle granular e consciência do estado do browser.
 */

import { browserGetState } from './get-state';
import { browserGetHtml } from './get-html';
import { browserScreenshot } from './screenshot';
import { browserScroll } from './scroll';
import { browserGoBack } from './go-back';
import { browserListTabs } from './list-tabs';
import { browserSwitchTab } from './switch-tab';
import { browserCloseTab } from './close-tab';
import { browserExtract } from './extract';
import { registerSkill } from '../../agent/executor';

export { browserGetState } from './get-state';
export { browserGetHtml } from './get-html';
export { browserScreenshot } from './screenshot';
export { browserScroll } from './scroll';
export { browserGoBack } from './go-back';
export { browserListTabs } from './list-tabs';
export { browserSwitchTab } from './switch-tab';
export { browserCloseTab } from './close-tab';
export { browserExtract } from './extract';

/**
 * Registra todas as skills de browser no Agent Loop
 */
export function registerBrowserSkills(): void {
    console.log('[Skills:Browser] Registrando skills...');

    registerSkill(browserGetState);
    registerSkill(browserGetHtml);
    registerSkill(browserScreenshot);
    registerSkill(browserScroll);
    registerSkill(browserGoBack);
    registerSkill(browserListTabs);
    registerSkill(browserSwitchTab);
    registerSkill(browserCloseTab);
    registerSkill(browserExtract);

    console.log('[Skills:Browser] 9 skills registradas');
}
