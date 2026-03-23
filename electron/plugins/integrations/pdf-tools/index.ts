import type { LexPlugin, LexPluginManifest, PluginTokens } from '../../types';
import type { Skill } from '../../../agent/types';
import { pdfMerge } from './skills/pdf-merge';
import { pdfSplit } from './skills/pdf-split';
import { pdfLer } from './skills/pdf-read';
import { pdfInfo } from './skills/pdf-info';

const manifest: LexPluginManifest = {
    id: 'pdf-tools',
    name: 'PDF Tools',
    description: 'Merge, split, ler texto e info de arquivos PDF locais.',
    version: '1.0.0',
    author: 'LEX',
    skillCategory: 'pdf',
    agentType: {
        typeId: 'pdf',
        displayName: 'Agente PDF',
        allowedSkillCategories: ['pdf', 'os'],
        systemPromptExtra: 'Você é um agente para manipulação de PDFs. Use pdf_merge para juntar, pdf_split para dividir, pdf_ler para extrair texto e pdf_info para metadados.',
    },
    auth: null,
};

export class PdfToolsPlugin implements LexPlugin {
    manifest = manifest;
    async initialize(_tokens: PluginTokens | null): Promise<void> {}
    getSkills(): Skill[] { return [pdfMerge, pdfSplit, pdfLer, pdfInfo]; }
}
export default new PdfToolsPlugin();
