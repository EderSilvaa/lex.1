/**
 * Smoke suite — tarefas simples pra medir baseline ao longo do tempo.
 *
 * Edite/adicione tasks conforme fluxos reais que o LEX precisa dominar.
 * IDs devem ser estáveis (não mude ao longo do tempo) — eles são a chave
 * de comparação entre snapshots.
 */

import type { EvalTask } from '../types';

export const smokeSuite: EvalTask[] = [
    {
        id: 'consulta-tjpa-basica',
        goal: 'Abrir o PJe do TJPA e localizar o campo de busca de processo. Reportar "pronto para consulta" quando o campo estiver visível.',
        tribunal: 'TJPA',
        tags: ['smoke', 'pje', 'consulta'],
        expect: { outputContains: ['pronto', 'consulta'] },
        timeoutMs: 120_000,
    },
    {
        id: 'consulta-trt8-basica',
        goal: 'Abrir o PJe do TRT8 e identificar o botão de login. Reportar "login encontrado" quando localizar.',
        tribunal: 'TRT8',
        tags: ['smoke', 'pje', 'login'],
        expect: { outputContains: ['login'] },
        timeoutMs: 120_000,
    },
    {
        id: 'os-listar-diretorio',
        goal: 'Listar os arquivos do diretório home do usuário e reportar a contagem.',
        tags: ['smoke', 'os'],
        expect: { outputMatches: '\\d+\\s*(arquivos|files)' },
        timeoutMs: 60_000,
    },
];
