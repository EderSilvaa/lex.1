import type { Skill, SkillResult, AgentContext } from '../../../../agent/types';
import { searchContacts } from '../gcontacts-client';

export const gcontactsBuscar: Skill = {
    nome: 'gcontacts_buscar',
    descricao: 'Busca contatos no Google Contacts por nome, email ou telefone.',
    categoria: 'gcontacts',
    parametros: {
        consulta: { tipo: 'string', descricao: 'Termo de busca', obrigatorio: true },
    },
    retorno: 'Contatos encontrados.',

    async execute(params: Record<string, any>, _ctx: AgentContext): Promise<SkillResult> {
        const consulta = String(params['consulta'] || '').trim();
        if (!consulta) return { sucesso: false, erro: 'Parâmetro "consulta" é obrigatório.' };

        try {
            const results = await searchContacts(consulta);

            const formatted = results.map((c: any) => {
                const name = c['names']?.[0]?.['displayName'] || '(sem nome)';
                const email = c['emailAddresses']?.[0]?.['value'] || '';
                return `• ${name}${email ? ` — ${email}` : ''}`;
            }).join('\n');

            return {
                sucesso: true,
                dados: { total: results.length, contatos: results },
                mensagem: results.length ? `${results.length} resultado(s):\n${formatted}` : 'Nenhum contato encontrado.',
            };
        } catch (err: any) {
            return { sucesso: false, erro: err.message };
        }
    },
};
