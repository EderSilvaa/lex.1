import type { LexPlugin, LexPluginManifest, PluginTokens } from '../../types';
import type { Skill } from '../../../agent/types';
import { clipboardLer } from './skills/clipboard-read';
import { clipboardEscrever } from './skills/clipboard-write';
import { clipboardImagem } from './skills/clipboard-image';

const manifest: LexPluginManifest = {
    id: 'clipboard',
    name: 'Clipboard Pro',
    description: 'Ler e escrever texto, HTML, imagens e RTF no clipboard.',
    version: '1.0.0',
    author: 'LEX',
    skillCategory: 'clipboard',
    auth: null,
};

export class ClipboardPlugin implements LexPlugin {
    manifest = manifest;
    async initialize(_tokens: PluginTokens | null): Promise<void> {}
    getSkills(): Skill[] { return [clipboardLer, clipboardEscrever, clipboardImagem]; }
}
export default new ClipboardPlugin();
