import type { LexPlugin, LexPluginManifest, PluginTokens } from '../../types';
import type { Skill } from '../../../agent/types';
import { trelloBoards } from './skills/trello-boards';
import { trelloListar } from './skills/trello-listar';
import { trelloCriar } from './skills/trello-criar';
import { trelloMover } from './skills/trello-mover';
import { trelloAtualizar } from './skills/trello-atualizar';

const manifest: LexPluginManifest = {
    id: 'trello', name: 'Trello', description: 'Kanban de prazos processuais — quadros, listas e cards.',
    version: '1.0.0', author: 'LEX', skillCategory: 'trello',
    agentType: { typeId: 'trello', displayName: 'Agente Trello', allowedSkillCategories: ['trello'],
        systemPromptExtra: 'Você é um agente Trello para prazos processuais. Use trello_boards para quadros, trello_listar para cards, trello_criar para novos prazos, trello_mover para mudar status e trello_atualizar para editar.' },
    auth: { type: 'api_key', apiKey: { instructions: 'Obtenha API Key e Token em trello.com/app-key. Informe no formato: APIKEY:TOKEN', url: 'https://trello.com/app-key' } },
};

export class TrelloPlugin implements LexPlugin {
    manifest = manifest;
    async initialize(_tokens: PluginTokens | null): Promise<void> {}
    getSkills(): Skill[] { return [trelloBoards, trelloListar, trelloCriar, trelloMover, trelloAtualizar]; }
}
export default new TrelloPlugin();
