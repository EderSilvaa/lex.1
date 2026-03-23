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
import { browserClick } from './click';
import { browserType } from './type';
import { browserFill } from './fill';
import { browserNavigate } from './navigate';
import { browserPress } from './press';
import { browserWait } from './wait';
import { browserAutoTask } from './auto-task';
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
export { browserClick } from './click';
export { browserType } from './type';
export { browserFill } from './fill';
export { browserNavigate } from './navigate';
export { browserPress } from './press';
export { browserWait } from './wait';
export { browserAutoTask } from './auto-task';

/**
 * Registra todas as skills de browser no Agent Loop
 */
export function registerBrowserSkills(): void {
    console.log('[Skills:Browser] Registrando skills...');

    // Observação (read-only)
    registerSkill(browserGetState);
    registerSkill(browserGetHtml);
    registerSkill(browserScreenshot);
    registerSkill(browserScroll);
    registerSkill(browserGoBack);
    registerSkill(browserListTabs);
    registerSkill(browserSwitchTab);
    registerSkill(browserCloseTab);
    registerSkill(browserExtract);

    // Ação (interação direta — atômicas)
    registerSkill(browserClick);
    registerSkill(browserType);
    registerSkill(browserFill);
    registerSkill(browserNavigate);
    registerSkill(browserPress);
    registerSkill(browserWait);

    // Fallback (vision agent loop — caro, para telas complexas)
    registerSkill(browserAutoTask);

    console.log('[Skills:Browser] 16 skills registradas');
}
