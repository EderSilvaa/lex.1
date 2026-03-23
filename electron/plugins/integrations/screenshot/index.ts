import type { LexPlugin, LexPluginManifest, PluginTokens } from '../../types';
import type { Skill } from '../../../agent/types';
import { screenshotCapturar } from './skills/screenshot-capture';
import { screenshotOcr } from './skills/screenshot-ocr';
import { screenshotInfo } from './skills/screenshot-info';

const manifest: LexPluginManifest = {
    id: 'screenshot',
    name: 'Screenshot & OCR',
    description: 'Captura de tela e extracao de texto via visao.',
    version: '1.0.0',
    author: 'LEX',
    skillCategory: 'screenshot',
    agentType: {
        typeId: 'screenshot',
        displayName: 'Agente Screenshot',
        allowedSkillCategories: ['screenshot'],
        systemPromptExtra: 'Voce captura e analisa screenshots. Use screenshot_capturar para capturar a tela e screenshot_ocr para extrair texto de imagens.',
    },
    auth: null,
};

export class ScreenshotPlugin implements LexPlugin {
    manifest = manifest;
    async initialize(_tokens: PluginTokens | null): Promise<void> {}
    getSkills(): Skill[] { return [screenshotCapturar, screenshotOcr, screenshotInfo]; }
}
export default new ScreenshotPlugin();
