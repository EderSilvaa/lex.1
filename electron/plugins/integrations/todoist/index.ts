import type { LexPlugin, LexPluginManifest, PluginTokens } from '../../types';
import type { Skill } from '../../../agent/types';
import { todoistListar } from './skills/todoist-listar';
import { todoistCriar } from './skills/todoist-criar';
import { todoistCompletar } from './skills/todoist-completar';
import { todoistAtualizar } from './skills/todoist-atualizar';
import { todoistProjetos } from './skills/todoist-projetos';

const manifest: LexPluginManifest = {
    id: 'todoist', name: 'Todoist', description: 'Gerenciar tarefas e prazos processuais no Todoist.',
    version: '1.0.0', author: 'LEX', skillCategory: 'todoist',
    agentType: { typeId: 'todoist', displayName: 'Agente Todoist', allowedSkillCategories: ['todoist'],
        systemPromptExtra: 'Você é um agente Todoist. Use todoist_listar para ver tarefas, todoist_criar para novos prazos, todoist_completar para finalizar, todoist_atualizar para editar e todoist_projetos para ver projetos.' },
    auth: { type: 'api_key', apiKey: { instructions: 'Obtenha o API token em todoist.com → Settings → Integrations → Developer', url: 'https://todoist.com/app/settings/integrations/developer' } },
};

export class TodoistPlugin implements LexPlugin {
    manifest = manifest;
    async initialize(_tokens: PluginTokens | null): Promise<void> {}
    getSkills(): Skill[] { return [todoistListar, todoistCriar, todoistCompletar, todoistAtualizar, todoistProjetos]; }
}
export default new TodoistPlugin();
