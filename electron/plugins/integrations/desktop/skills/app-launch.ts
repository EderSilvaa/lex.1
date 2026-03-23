import type { Skill, SkillResult, AgentContext } from '../../../../agent/types';
import { launchApp } from '../desktop-client';

export const desktopAbrir: Skill = {
    nome: 'desktop_abrir',
    descricao: 'Abre um programa no Windows. Aceita nome simples (ex: "notepad", "chrome") ou caminho completo.',
    categoria: 'desktop',
    parametros: {
        programa: { tipo: 'string', descricao: 'Nome ou caminho do programa a abrir', obrigatorio: true },
    },
    retorno: 'PID e nome do processo aberto.',

    async execute(params: Record<string, any>, _ctx: AgentContext): Promise<SkillResult> {
        const programa = String(params['programa'] || '').trim();
        if (!programa) return { sucesso: false, erro: 'Parâmetro "programa" é obrigatório.' };
        try {
            const result = await launchApp(programa);
            return {
                sucesso: true,
                dados: result,
                mensagem: result.pid
                    ? `Programa "${result.name}" aberto (PID: ${result.pid}).`
                    : `Programa "${programa}" aberto com sucesso.`,
            };
        } catch (err: any) {
            return { sucesso: false, erro: err.message };
        }
    },
};
