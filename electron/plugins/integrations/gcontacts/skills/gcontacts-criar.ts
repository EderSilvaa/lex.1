import type { Skill, SkillResult, AgentContext } from '../../../../agent/types';
import { createContact } from '../gcontacts-client';

export const gcontactsCriar: Skill = {
    nome: 'gcontacts_criar',
    descricao: 'Cria um novo contato no Google Contacts.',
    categoria: 'gcontacts',
    parametros: {
        nome: { tipo: 'string', descricao: 'Nome do contato', obrigatorio: true },
        email: { tipo: 'string', descricao: 'Email do contato', obrigatorio: false },
        telefone: { tipo: 'string', descricao: 'Telefone do contato', obrigatorio: false },
        empresa: { tipo: 'string', descricao: 'Empresa/organização', obrigatorio: false },
    },
    retorno: 'Contato criado com resourceName.',

    async execute(params: Record<string, any>, _ctx: AgentContext): Promise<SkillResult> {
        const nome = String(params['nome'] || '').trim();
        if (!nome) return { sucesso: false, erro: 'Parâmetro "nome" é obrigatório.' };

        try {
            const result = await createContact({
                nome,
                email: params['email'] ? String(params['email']) : undefined,
                telefone: params['telefone'] ? String(params['telefone']) : undefined,
                empresa: params['empresa'] ? String(params['empresa']) : undefined,
            });

            return {
                sucesso: true,
                dados: { resourceName: result['resourceName'] },
                mensagem: `Contato "${nome}" criado com sucesso.`,
            };
        } catch (err: any) {
            return { sucesso: false, erro: err.message };
        }
    },
};
