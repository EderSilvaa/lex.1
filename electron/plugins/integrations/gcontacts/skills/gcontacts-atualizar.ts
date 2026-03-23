import type { Skill, SkillResult, AgentContext } from '../../../../agent/types';
import { updateContact, getContact } from '../gcontacts-client';

export const gcontactsAtualizar: Skill = {
    nome: 'gcontacts_atualizar',
    descricao: 'Atualiza um contato existente no Google Contacts.',
    categoria: 'gcontacts',
    parametros: {
        resourceName: { tipo: 'string', descricao: 'Resource name do contato (ex: people/c123456)', obrigatorio: true },
        nome: { tipo: 'string', descricao: 'Novo nome', obrigatorio: false },
        email: { tipo: 'string', descricao: 'Novo email', obrigatorio: false },
        telefone: { tipo: 'string', descricao: 'Novo telefone', obrigatorio: false },
        empresa: { tipo: 'string', descricao: 'Nova empresa', obrigatorio: false },
    },
    retorno: 'Contato atualizado.',

    async execute(params: Record<string, any>, _ctx: AgentContext): Promise<SkillResult> {
        const resourceName = String(params['resourceName'] || '').trim();
        if (!resourceName) return { sucesso: false, erro: 'Parâmetro "resourceName" é obrigatório.' };

        const nome = params['nome'] ? String(params['nome']) : undefined;
        const email = params['email'] ? String(params['email']) : undefined;
        const telefone = params['telefone'] ? String(params['telefone']) : undefined;
        const empresa = params['empresa'] ? String(params['empresa']) : undefined;

        if (!nome && !email && !telefone && !empresa) {
            return { sucesso: false, erro: 'Informe ao menos um campo para atualizar.' };
        }

        try {
            const current = await getContact(resourceName);
            const result = await updateContact(resourceName, { nome, email, telefone, empresa }, current['etag']);

            return {
                sucesso: true,
                dados: { resourceName: result['resourceName'] },
                mensagem: `Contato atualizado com sucesso.`,
            };
        } catch (err: any) {
            return { sucesso: false, erro: err.message };
        }
    },
};
