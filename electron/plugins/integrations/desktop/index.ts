import type { LexPlugin, LexPluginManifest, PluginTokens } from '../../types';
import type { Skill } from '../../../agent/types';
import { desktopAbrir } from './skills/app-launch';
import { desktopJanelas } from './skills/window-list';
import { desktopFocar } from './skills/window-focus';
import { desktopProcessos } from './skills/app-list';

const manifest: LexPluginManifest = {
    id: 'desktop',
    name: 'Desktop Control',
    description: 'Abrir programas, listar e controlar janelas do Windows.',
    version: '1.0.0',
    author: 'LEX',
    skillCategory: 'desktop',
    agentType: {
        typeId: 'desktop',
        displayName: 'Agente Desktop',
        allowedSkillCategories: ['desktop', 'os'],
        systemPromptExtra: 'Você controla o desktop Windows. Use desktop_abrir para abrir programas, desktop_janelas para listar janelas, desktop_focar para trazer janela ao foco e desktop_processos para ver processos.',
    },
    auth: null,
};

export class DesktopPlugin implements LexPlugin {
    manifest = manifest;
    async initialize(_tokens: PluginTokens | null): Promise<void> {}
    getSkills(): Skill[] { return [desktopAbrir, desktopJanelas, desktopFocar, desktopProcessos]; }
}
export default new DesktopPlugin();
