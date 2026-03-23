import type { LexPlugin, LexPluginManifest, PluginTokens } from '../../types';
import type { Skill } from '../../../agent/types';
import { excelLer } from './skills/excel-read';
import { excelCriar } from './skills/excel-create';
import { excelInfo } from './skills/excel-info';
import { excelParaCsv } from './skills/excel-csv';

const manifest: LexPluginManifest = {
    id: 'excel',
    name: 'Excel / Planilhas',
    description: 'Ler, criar e converter planilhas Excel (.xlsx) locais.',
    version: '1.0.0',
    author: 'LEX',
    skillCategory: 'excel',
    agentType: {
        typeId: 'excel',
        displayName: 'Agente Excel',
        allowedSkillCategories: ['excel', 'os'],
        systemPromptExtra: 'Você manipula planilhas Excel. Use excel_ler para ler, excel_criar para criar, excel_info para metadados e excel_para_csv para converter.',
    },
    auth: null,
};

export class ExcelPlugin implements LexPlugin {
    manifest = manifest;
    async initialize(_tokens: PluginTokens | null): Promise<void> {}
    getSkills(): Skill[] { return [excelLer, excelCriar, excelInfo, excelParaCsv]; }
}
export default new ExcelPlugin();
