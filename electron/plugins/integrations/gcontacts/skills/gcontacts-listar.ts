import type { Skill, SkillResult, AgentContext } from '../../../../agent/types';
import { listContacts } from '../gcontacts-client';

export const gcontactsListar: Skill = {
    nome: 'gcontacts_listar',
    descricao: 'Lista contatos do Google Contacts.',
    categoria: 'gcontacts',
    parametros: {
        limite: { tipo: 'number', descricao: 'Máximo de contatos (default 50)', obrigatorio: false, default: 50 },
    },
    retorno: 'Lista de contatos com nome, email, telefone.',

    async execute(params: Record<string, any>, _ctx: AgentContext): Promise<SkillResult> {
        try {
            const limite = Number(params['limite']) || 50;
            const contacts = await listContacts(limite);

            const formatted = contacts.map((c: any) => {
                const name = c['names']?.[0]?.['displayName'] || '(sem nome)';
                const email = c['emailAddresses']?.[0]?.['value'] || '';
                const phone = c['phoneNumbers']?.[0]?.['value'] || '';
                return `• ${name}${email ? ` — ${email}` : ''}${phone ? ` — ${phone}` : ''}`;
            }).join('\n');

            return {
                sucesso: true,
                dados: { total: contacts.length, contatos: contacts },
                mensagem: `${contacts.length} contato(s):\n${formatted}`,
            };
        } catch (err: any) {
            return { sucesso: false, erro: err.message };
        }
    },
};
