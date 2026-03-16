/**
 * Skill: browser_extract
 *
 * Extrai conteúdo estruturado da página atual.
 * Versão genérica (não limitada ao PJe) do que pje_consultar faz parcialmente.
 */

import { Skill, SkillResult, AgentContext } from '../../agent/types';
import { getActivePage, ensureBrowser } from '../../browser-manager';

export const browserExtract: Skill = {
    nome: 'browser_extract',
    descricao: 'Extrai conteúdo estruturado da página: tabelas, listas, ou texto de uma área específica. Genérico — funciona em qualquer site, não só PJe.',
    categoria: 'browser',

    parametros: {
        tipo: {
            tipo: 'string',
            descricao: 'Tipo de extração: "tabela" (primeira tabela ou por seletor), "lista" (itens de lista), "texto" (texto de um seletor).',
            obrigatorio: false,
            default: 'texto',
            enum: ['tabela', 'lista', 'texto']
        },
        seletor: {
            tipo: 'string',
            descricao: 'Seletor CSS do elemento alvo (ex: "table.resultados", "#conteudo", "ul.movimentacoes").',
            obrigatorio: false,
            default: ''
        },
        limite: {
            tipo: 'number',
            descricao: 'Máximo de linhas/itens a retornar.',
            obrigatorio: false,
            default: 50
        }
    },

    retorno: 'Dados extraídos no formato solicitado (tabela como array de objetos, lista como array, texto como string).',

    exemplos: [
        '{ "skill": "browser_extract", "parametros": { "tipo": "tabela" } }',
        '{ "skill": "browser_extract", "parametros": { "tipo": "lista", "seletor": ".movimentacoes" } }',
        '{ "skill": "browser_extract", "parametros": { "tipo": "texto", "seletor": "#detalhes-processo" } }'
    ],

    async execute(params: Record<string, any>, _context: AgentContext): Promise<SkillResult> {
        try {
            await ensureBrowser();
            const page = getActivePage();
            if (!page) return { sucesso: false, erro: 'Nenhuma página ativa no browser.' };

            const tipo = String(params['tipo'] || 'texto');
            const seletor = String(params['seletor'] || '');
            const limite = Number(params['limite'] || 50);

            switch (tipo) {
                case 'tabela': {
                    const data = await page.evaluate(
                        ({ sel, lim }: { sel: string; lim: number }) => {
                            const table = sel
                                ? document.querySelector(sel) as HTMLTableElement
                                : document.querySelector('table') as HTMLTableElement;
                            if (!table) return null;

                            const headers: string[] = [];
                            table.querySelectorAll('thead th, thead td, tr:first-child th, tr:first-child td').forEach(th => {
                                headers.push((th.textContent || '').trim());
                            });

                            const rows: Record<string, string>[] = [];
                            const bodyRows = table.querySelectorAll('tbody tr, tr');
                            const startIdx = headers.length > 0 ? 1 : 0;

                            for (let i = startIdx; i < bodyRows.length && rows.length < lim; i++) {
                                const cells = bodyRows[i]!.querySelectorAll('td');
                                if (cells.length === 0) continue;
                                const row: Record<string, string> = {};
                                cells.forEach((cell, j) => {
                                    const key = headers[j] || `col_${j}`;
                                    row[key] = (cell.textContent || '').trim().slice(0, 200);
                                });
                                rows.push(row);
                            }

                            return { headers, rows, totalRows: bodyRows.length - startIdx };
                        },
                        { sel: seletor, lim: limite }
                    );

                    if (!data) {
                        return { sucesso: false, erro: seletor ? `Tabela não encontrada: ${seletor}` : 'Nenhuma tabela encontrada na página.' };
                    }

                    const lines = [`Tabela: ${data.headers.join(' | ') || '(sem cabeçalho)'} — ${data.totalRows} linha(s)`];
                    for (const row of data.rows.slice(0, 10)) {
                        lines.push('  ' + Object.values(row).join(' | '));
                    }
                    if (data.rows.length > 10) lines.push(`  ... e mais ${data.rows.length - 10}`);

                    return {
                        sucesso: true,
                        dados: data,
                        mensagem: lines.join('\n')
                    };
                }

                case 'lista': {
                    const items = await page.evaluate(
                        ({ sel, lim }: { sel: string; lim: number }) => {
                            const container = sel ? document.querySelector(sel) : document.body;
                            if (!container) return null;
                            const listItems = container.querySelectorAll('li, [role="listitem"], .item, tr');
                            const results: string[] = [];
                            listItems.forEach(item => {
                                if (results.length >= lim) return;
                                const text = (item.textContent || '').trim().slice(0, 300);
                                if (text) results.push(text);
                            });
                            return results;
                        },
                        { sel: seletor, lim: limite }
                    );

                    if (!items || items.length === 0) {
                        return { sucesso: false, erro: seletor ? `Lista não encontrada: ${seletor}` : 'Nenhuma lista encontrada na página.' };
                    }

                    return {
                        sucesso: true,
                        dados: { items, count: items.length },
                        mensagem: `${items.length} item(ns):\n${items.slice(0, 15).map((item, i) => `  ${i + 1}. ${item.slice(0, 120)}`).join('\n')}${items.length > 15 ? `\n  ... e mais ${items.length - 15}` : ''}`
                    };
                }

                case 'texto':
                default: {
                    const text = await page.evaluate(
                        (sel: string) => {
                            const el = sel ? document.querySelector(sel) : document.body;
                            if (!el) return null;
                            const clone = el.cloneNode(true) as HTMLElement;
                            clone.querySelectorAll('script, style, noscript').forEach(e => e.remove());
                            return (clone.innerText || clone.textContent || '').trim();
                        },
                        seletor
                    );

                    if (text === null) {
                        return { sucesso: false, erro: `Elemento não encontrado: ${seletor}` };
                    }

                    const truncated = text.length > 10000;
                    return {
                        sucesso: true,
                        dados: { text: truncated ? text.slice(0, 10000) : text, charCount: text.length, truncated },
                        mensagem: truncated ? text.slice(0, 10000) + '\n\n[... truncado]' : text
                    };
                }
            }
        } catch (error: any) {
            return { sucesso: false, erro: error.message };
        }
    }
};

export default browserExtract;
