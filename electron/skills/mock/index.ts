/**
 * Mock Skills
 *
 * Skills simuladas para teste sem PJe real.
 * Retornam dados fictícios mas realistas.
 */

import { Skill, SkillResult, AgentContext } from '../../agent/types';
import { registerSkills } from '../../agent/executor';

// ============================================================================
// PJE SKILLS (Mock)
// ============================================================================

const pjeConsultar: Skill = {
    nome: 'pje_consultar',
    descricao: 'Consulta um processo no PJe e retorna dados completos (partes, movimentações, documentos)',
    categoria: 'pje',
    parametros: {
        numero: {
            tipo: 'string',
            descricao: 'Número do processo (ex: 0000123-45.2024.8.14.0001)',
            obrigatorio: true
        }
    },
    retorno: 'Dados do processo incluindo partes, classe, assunto, movimentações e documentos',
    exemplos: [
        '{ "skill": "pje_consultar", "parametros": { "numero": "0000123-45.2024.8.14.0001" } }'
    ],
    execute: async (params, context): Promise<SkillResult> => {
        const { numero } = params;

        // Simula delay de rede
        await delay(800);

        // Dados mock realistas
        return {
            sucesso: true,
            dados: {
                processo: {
                    numero,
                    tribunal: 'TJPA',
                    classe: 'Procedimento Comum Cível',
                    assunto: 'Indenização por Dano Moral',
                    vara: '1ª Vara Cível de Belém',
                    juiz: 'Dr. João Silva Santos',
                    status: 'Em andamento',
                    valor_causa: 50000.00,
                    data_distribuicao: '2024-03-15',
                    partes: {
                        autor: ['Maria da Silva'],
                        reu: ['Empresa XYZ Ltda']
                    },
                    ultima_movimentacao: '2024-06-20 - Conclusos para despacho'
                },
                movimentacoes: [
                    { data: '2024-06-20', descricao: 'Conclusos para despacho' },
                    { data: '2024-06-15', descricao: 'Juntada de petição - Contestação' },
                    { data: '2024-05-10', descricao: 'Citação realizada' },
                    { data: '2024-03-15', descricao: 'Distribuição automática' }
                ],
                documentos: [
                    { id: '1', nome: 'Petição Inicial', tipo: 'peticao', data: '2024-03-15' },
                    { id: '2', nome: 'Procuração', tipo: 'procuracao', data: '2024-03-15' },
                    { id: '3', nome: 'Contestação', tipo: 'contestacao', data: '2024-06-15' }
                ],
                resumo: `Processo ${numero} - Ação de indenização por dano moral movida por Maria da Silva contra Empresa XYZ Ltda. Valor da causa: R$ 50.000,00. Última movimentação: Conclusos para despacho (20/06/2024).`
            }
        };
    }
};

const pjeMovimentacoes: Skill = {
    nome: 'pje_movimentacoes',
    descricao: 'Lista as últimas movimentações de um processo',
    categoria: 'pje',
    parametros: {
        numero: {
            tipo: 'string',
            descricao: 'Número do processo',
            obrigatorio: true
        },
        limite: {
            tipo: 'number',
            descricao: 'Quantidade máxima de movimentações',
            obrigatorio: false,
            default: 10
        }
    },
    retorno: 'Lista de movimentações com data e descrição',
    execute: async (params): Promise<SkillResult> => {
        await delay(500);

        return {
            sucesso: true,
            dados: {
                movimentacoes: [
                    { data: '2024-06-20 14:30', descricao: 'Conclusos para despacho', tipo: 'conclusao' },
                    { data: '2024-06-15 10:15', descricao: 'Juntada de petição - Contestação', tipo: 'juntada' },
                    { data: '2024-06-14 16:00', descricao: 'Prazo de contestação - Iniciado', tipo: 'prazo' },
                    { data: '2024-05-10 09:00', descricao: 'Citação realizada via correio', tipo: 'citacao' },
                    { data: '2024-04-20 11:30', descricao: 'Expedição de mandado de citação', tipo: 'expedicao' },
                    { data: '2024-03-20 15:00', descricao: 'Despacho: Cite-se', tipo: 'despacho' },
                    { data: '2024-03-15 08:30', descricao: 'Distribuição automática', tipo: 'distribuicao' }
                ],
                total: 7
            }
        };
    }
};

const pjeDocumentos: Skill = {
    nome: 'pje_documentos',
    descricao: 'Lista documentos anexados a um processo',
    categoria: 'pje',
    parametros: {
        numero: {
            tipo: 'string',
            descricao: 'Número do processo',
            obrigatorio: true
        }
    },
    retorno: 'Lista de documentos com nome, tipo e data',
    execute: async (params): Promise<SkillResult> => {
        await delay(400);

        return {
            sucesso: true,
            dados: {
                documentos: [
                    { id: '1', nome: 'Petição Inicial', tipo: 'peticao', paginas: 15, data: '2024-03-15' },
                    { id: '2', nome: 'Procuração ad judicia', tipo: 'procuracao', paginas: 1, data: '2024-03-15' },
                    { id: '3', nome: 'Documentos pessoais', tipo: 'documento', paginas: 3, data: '2024-03-15' },
                    { id: '4', nome: 'Comprovantes', tipo: 'comprovante', paginas: 8, data: '2024-03-15' },
                    { id: '5', nome: 'Contestação', tipo: 'contestacao', paginas: 20, data: '2024-06-15' },
                    { id: '6', nome: 'Documentos da ré', tipo: 'documento', paginas: 12, data: '2024-06-15' }
                ],
                total: 6,
                total_paginas: 59
            }
        };
    }
};

// ============================================================================
// DOCUMENTO SKILLS (Mock)
// ============================================================================

const docGerar: Skill = {
    nome: 'doc_gerar',
    descricao: 'Gera um documento jurídico (petição, contestação, recurso) e abre no Word',
    categoria: 'documentos',
    parametros: {
        tipo: {
            tipo: 'string',
            descricao: 'Tipo de documento',
            obrigatorio: true,
            enum: ['peticao', 'contestacao', 'apelacao', 'agravo', 'embargos', 'parecer']
        },
        processo: {
            tipo: 'object',
            descricao: 'Dados do processo (numero, partes, etc)',
            obrigatorio: true
        },
        instrucoes: {
            tipo: 'string',
            descricao: 'Instruções específicas para o documento',
            obrigatorio: false
        }
    },
    retorno: 'Confirmação de criação e caminho do arquivo',
    exemplos: [
        '{ "skill": "doc_gerar", "parametros": { "tipo": "contestacao", "processo": { "numero": "123" } } }'
    ],
    execute: async (params): Promise<SkillResult> => {
        await delay(1500);

        const { tipo, processo } = params;
        const arquivo = `${tipo}_${processo.numero || 'novo'}_${Date.now()}.docx`;

        return {
            sucesso: true,
            dados: {
                arquivo,
                caminho: `C:/Users/Documents/Lex/${arquivo}`,
                tipo,
                mensagem: `Documento ${tipo} gerado com sucesso`
            },
            mensagem: `✅ ${formatTipoDoc(tipo)} gerado! O documento foi aberto no Word para revisão.`
        };
    }
};

const docAnalisar: Skill = {
    nome: 'doc_analisar',
    descricao: 'Analisa um documento e extrai informações relevantes',
    categoria: 'documentos',
    parametros: {
        documento_id: {
            tipo: 'string',
            descricao: 'ID do documento no processo',
            obrigatorio: false
        },
        texto: {
            tipo: 'string',
            descricao: 'Texto do documento para análise',
            obrigatorio: false
        }
    },
    retorno: 'Análise com resumo, pontos principais e tipo de documento',
    execute: async (params): Promise<SkillResult> => {
        await delay(1000);

        return {
            sucesso: true,
            dados: {
                tipo_detectado: 'Contestação',
                resumo: 'Contestação apresentada pela ré alegando inexistência de dano moral e impugnando os valores pleiteados.',
                pontos_principais: [
                    'Alega ausência de prova do dano moral',
                    'Impugna o valor de R$ 50.000,00 como excessivo',
                    'Afirma que agiu dentro da legalidade',
                    'Requer produção de prova testemunhal'
                ],
                teses: [
                    'Inexistência de ato ilícito',
                    'Ausência de nexo causal',
                    'Mero aborrecimento x dano moral'
                ],
                riscos: [
                    { risco: 'Prova testemunhal pode ser desfavorável', nivel: 'medio' },
                    { risco: 'Valor do pedido pode ser reduzido', nivel: 'alto' }
                ]
            }
        };
    }
};

// ============================================================================
// PESQUISA SKILLS (Mock)
// ============================================================================

const pesquisaJurisprudencia: Skill = {
    nome: 'pesquisa_jurisprudencia',
    descricao: 'Busca jurisprudência nos tribunais sobre um tema',
    categoria: 'pesquisa',
    parametros: {
        termo: {
            tipo: 'string',
            descricao: 'Termo de busca',
            obrigatorio: true
        },
        tribunais: {
            tipo: 'array',
            descricao: 'Lista de tribunais (ex: STJ, TJPA)',
            obrigatorio: false,
            default: ['STJ', 'TJPA']
        },
        limite: {
            tipo: 'number',
            descricao: 'Quantidade máxima de resultados',
            obrigatorio: false,
            default: 5
        }
    },
    retorno: 'Lista de decisões com ementa e link',
    execute: async (params): Promise<SkillResult> => {
        await delay(1200);

        const { termo } = params;

        return {
            sucesso: true,
            dados: {
                termo_buscado: termo,
                resultados: [
                    {
                        tribunal: 'STJ',
                        tipo: 'REsp',
                        numero: '1.234.567/PA',
                        relator: 'Min. Maria Souza',
                        data: '2024-03-15',
                        ementa: `CIVIL. DANO MORAL. ${termo.toUpperCase()}. QUANTUM INDENIZATÓRIO. O valor da indenização por dano moral deve ser fixado com moderação, considerando a gravidade do fato e a capacidade econômica das partes.`,
                        favoravel: true
                    },
                    {
                        tribunal: 'TJPA',
                        tipo: 'Apelação',
                        numero: '0012345-67.2023.8.14.0001',
                        relator: 'Des. João Santos',
                        data: '2024-02-20',
                        ementa: `APELAÇÃO CÍVEL. AÇÃO DE INDENIZAÇÃO. ${termo.toUpperCase()}. DANO MORAL CONFIGURADO. Mantida a sentença que condenou a ré ao pagamento de indenização.`,
                        favoravel: true
                    },
                    {
                        tribunal: 'STJ',
                        tipo: 'AgInt',
                        numero: '9.876.543/PA',
                        relator: 'Min. Pedro Lima',
                        data: '2024-01-10',
                        ementa: `AGRAVO INTERNO. DANO MORAL. MERO DISSABOR. NÃO CONFIGURAÇÃO. Situações de mero aborrecimento não ensejam reparação por dano moral.`,
                        favoravel: false
                    }
                ],
                total: 3,
                resumo: `Encontradas 3 decisões sobre "${termo}". 2 favoráveis, 1 desfavorável.`
            }
        };
    }
};

// ============================================================================
// UTILS SKILLS (Mock)
// ============================================================================

const calcularPrazo: Skill = {
    nome: 'util_calcular_prazo',
    descricao: 'Calcula prazo processual considerando dias úteis e feriados',
    categoria: 'utils',
    parametros: {
        data_inicial: {
            tipo: 'string',
            descricao: 'Data inicial (YYYY-MM-DD)',
            obrigatorio: true
        },
        dias: {
            tipo: 'number',
            descricao: 'Quantidade de dias',
            obrigatorio: true
        },
        tipo: {
            tipo: 'string',
            descricao: 'Tipo de prazo: uteis ou corridos',
            obrigatorio: false,
            default: 'uteis',
            enum: ['uteis', 'corridos']
        }
    },
    retorno: 'Data final do prazo',
    execute: async (params): Promise<SkillResult> => {
        await delay(200);

        const { data_inicial, dias, tipo = 'uteis' } = params;
        const inicio = new Date(data_inicial);

        let diasContados = 0;
        const dataFinal = new Date(inicio);

        while (diasContados < dias) {
            dataFinal.setDate(dataFinal.getDate() + 1);

            if (tipo === 'uteis') {
                const diaSemana = dataFinal.getDay();
                if (diaSemana !== 0 && diaSemana !== 6) {
                    diasContados++;
                }
            } else {
                diasContados++;
            }
        }

        return {
            sucesso: true,
            dados: {
                data_inicial,
                dias,
                tipo,
                data_final: dataFinal.toISOString().split('T')[0],
                data_formatada: dataFinal.toLocaleDateString('pt-BR')
            },
            mensagem: `Prazo de ${dias} dias ${tipo}: vence em ${dataFinal.toLocaleDateString('pt-BR')}`
        };
    }
};

// ============================================================================
// HELPERS
// ============================================================================

function delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function formatTipoDoc(tipo: string): string {
    const map: Record<string, string> = {
        peticao: 'Petição',
        contestacao: 'Contestação',
        apelacao: 'Apelação',
        agravo: 'Agravo de Instrumento',
        embargos: 'Embargos de Declaração',
        parecer: 'Parecer'
    };
    return map[tipo] || tipo;
}

// ============================================================================
// LOADER
// ============================================================================

const mockSkills: Skill[] = [
    // PJe
    pjeConsultar,
    pjeMovimentacoes,
    pjeDocumentos,
    // Documentos
    docGerar,
    docAnalisar,
    // Pesquisa
    pesquisaJurisprudencia,
    // Utils
    calcularPrazo
];

export function loadMockSkills(): void {
    console.log('[MockSkills] Carregando skills mock...');
    registerSkills(mockSkills);
    console.log(`[MockSkills] ${mockSkills.length} skills carregadas`);
}

export { mockSkills };
