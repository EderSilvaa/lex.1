import type { Skill, SkillResult, AgentContext } from '../../../../agent/types';
import { listRunningApps } from '../desktop-client';

export const desktopProcessos: Skill = {
    nome: 'desktop_processos',
    descricao: 'Lista processos em execução no Windows com uso de memória. Opcionalmente filtra por nome.',
    categoria: 'desktop',
    parametros: {
        filtro: { tipo: 'string', descricao: 'Filtro por nome do processo (opcional)', obrigatorio: false },
    },
    retorno: 'Lista de processos com nome, PID e memória.',

    async execute(params: Record<string, any>, _ctx: AgentContext): Promise<SkillResult> {
        const filtro = params['filtro'] ? String(params['filtro']).trim() : undefined;
        try {
            const procs = await listRunningApps(filtro);
            if (procs.length === 0) {
                const msg = filtro
                    ? `Nenhum processo encontrado para "${filtro}".`
                    : 'Nenhum processo encontrado.';
                return { sucesso: true, dados: { count: 0, processes: [] }, mensagem: msg };
            }
            const formatMem = (bytes: number) => {
                if (bytes >= 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
                if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
                return `${(bytes / 1024).toFixed(0)} KB`;
            };
            const formatted = procs
                .map((p, i) => `${i + 1}. **${p.name}** (PID: ${p.pid}) — ${formatMem(p.memory)}`)
                .join('\n');
            return {
                sucesso: true,
                dados: { count: procs.length, processes: procs },
                mensagem: `${procs.length} processo(s):\n\n${formatted}`,
            };
        } catch (err: any) {
            return { sucesso: false, erro: err.message };
        }
    },
};
