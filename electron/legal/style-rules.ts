/**
 * Legal Style Rules — Regras de Estilo Jurídico
 *
 * Tratamento por destinatário, verbos preferidos, conectivos formais,
 * expressões por tipo de peça e formato de citação.
 *
 * Usado pelo Legal Language Engine para enriquecer prompts
 * com regras de escrita jurídica contextual.
 */

// ── Tratamento por Destinatário ─────────────────────────────────────

export interface TreatmentRule {
    destinatario: string;
    tratamento: string;
    contexto: string;
}

const TREATMENTS: TreatmentRule[] = [
    { destinatario: 'juiz_1a', tratamento: 'Excelentíssimo(a) Senhor(a) Doutor(a) Juiz(a) de Direito', contexto: 'Endereçamento de petições a juízo de 1ª instância cível' },
    { destinatario: 'juiz_trabalho', tratamento: 'Excelentíssimo(a) Senhor(a) Doutor(a) Juiz(a) do Trabalho', contexto: 'Endereçamento a Vara do Trabalho' },
    { destinatario: 'juiz_federal', tratamento: 'Excelentíssimo(a) Senhor(a) Doutor(a) Juiz(a) Federal', contexto: 'Endereçamento a Vara Federal' },
    { destinatario: 'desembargador', tratamento: 'Egrégio Tribunal / Colenda Turma / Eminentes Desembargadores', contexto: 'Endereçamento a TJ ou TRT (razões de recurso)' },
    { destinatario: 'ministro', tratamento: 'Excelentíssimo(a) Senhor(a) Ministro(a)', contexto: 'Endereçamento a STF, STJ, TST' },
    { destinatario: 'mp', tratamento: 'Douto Representante do Ministério Público', contexto: 'Referência ao membro do MP no processo' },
    { destinatario: 'juizo', tratamento: 'Douto Juízo / Meritíssimo Juiz', contexto: 'Referência ao juiz no corpo do texto' },
    { destinatario: 'parte_contraria_civil', tratamento: 'Requerido(a) / Réu / Ré', contexto: 'Referência à parte contrária em ação cível' },
    { destinatario: 'parte_contraria_trabalhista', tratamento: 'Reclamada / Reclamado', contexto: 'Referência à parte contrária em reclamação trabalhista' },
    { destinatario: 'perito', tratamento: 'Senhor(a) Perito(a)', contexto: 'Referência ao perito judicial' },
    { destinatario: 'delegado', tratamento: 'Ilustríssimo(a) Senhor(a) Delegado(a) de Polícia', contexto: 'Endereçamento a delegacia' },
];

/** Retorna tratamento adequado para o destinatário */
export function getTreatmentFor(destinatario: string): TreatmentRule | undefined {
    return TREATMENTS.find(t => t.destinatario === destinatario);
}

/** Retorna todos os tratamentos */
export function getAllTreatments(): TreatmentRule[] {
    return TREATMENTS;
}

// ── Verbos Preferidos por Contexto ──────────────────────────────────

export interface VerbPreference {
    acao: string;
    preferidos: string[];
    evitar: string[];
    exemplo: string;
}

const VERBS: VerbPreference[] = [
    { acao: 'pedir', preferidos: ['requer', 'postula', 'pugna', 'pleiteia', 'roga'], evitar: ['quer', 'pede', 'gostaria', 'precisa'], exemplo: 'Requer-se a concessão de tutela de urgência.' },
    { acao: 'alegar', preferidos: ['aduz', 'assevera', 'sustenta', 'alega', 'argui', 'ventila'], evitar: ['fala', 'diz', 'acha', 'conta'], exemplo: 'O autor aduz que foi dispensado sem justa causa.' },
    { acao: 'provar', preferidos: ['demonstra', 'comprova', 'evidencia', 'atesta', 'corrobora'], evitar: ['mostra', 'prova'], exemplo: 'A documentação acostada comprova a relação de emprego.' },
    { acao: 'discordar', preferidos: ['impugna', 'rechaça', 'refuta', 'rebate', 'contesta'], evitar: ['discorda', 'não concorda', 'acha errado'], exemplo: 'A ré impugna os valores pleiteados na exordial.' },
    { acao: 'concluir', preferidos: ['destarte', 'posto isso', 'ante o exposto', 'diante do exposto', 'pelo exposto'], evitar: ['então', 'portanto', 'assim sendo', 'em conclusão'], exemplo: 'Ante o exposto, requer-se a total procedência dos pedidos.' },
    { acao: 'informar', preferidos: ['esclarece', 'informa', 'noticia', 'consigna', 'registra'], evitar: ['avisa', 'comunica'], exemplo: 'Esclarece-se que o prazo foi observado rigorosamente.' },
    { acao: 'decidir', preferidos: ['deliberou', 'determinou', 'dispôs', 'consignou', 'assentou'], evitar: ['resolveu', 'mandou'], exemplo: 'O r. Juízo determinou a citação do réu.' },
    { acao: 'fundamentar', preferidos: ['com fulcro em', 'com fundamento no', 'nos termos do', 'à luz do', 'conforme'], evitar: ['baseado em', 'por causa de', 'de acordo com'], exemplo: 'Com fulcro no art. 300 do CPC, requer-se tutela de urgência.' },
    { acao: 'contestar_sentenca', preferidos: ['data venia', 'com a devida vênia', 'salvo melhor juízo', 's.m.j.'], evitar: ['com todo respeito', 'discordando'], exemplo: 'Data venia ao entendimento do d. Juízo, a sentença merece reforma.' },
    { acao: 'citar_lei', preferidos: ['nos termos do art.', 'conforme dispõe o art.', 'à luz do art.', 'consoante art.'], evitar: ['segundo a lei', 'como diz a lei', 'a lei fala que'], exemplo: 'Nos termos do art. 927 do Código Civil, a responsabilidade é objetiva.' },
    { acao: 'requerer_liminar', preferidos: ['requer a concessão de medida liminar', 'pugna pela tutela de urgência', 'postula o deferimento in limine'], evitar: ['pede liminar', 'quer uma liminar'], exemplo: 'Requer a concessão de medida liminar inaudita altera parte.' },
    { acao: 'narrar_fatos', preferidos: ['narra', 'relata', 'expõe', 'aduz os fatos', 'reporta'], evitar: ['conta', 'fala sobre', 'explica o que aconteceu'], exemplo: 'O autor narra que, em 15/03/2026, foi dispensado imotivadamente.' },
    { acao: 'impugnar_documento', preferidos: ['impugna', 'refuta a autenticidade', 'contesta a veracidade', 'desconstitui'], evitar: ['diz que é falso', 'não aceita'], exemplo: 'Impugna-se, por falso, o documento acostado às fls. 45.' },
    { acao: 'reconhecer', preferidos: ['reconhece', 'admite', 'confessa', 'não controverte'], evitar: ['aceita', 'concorda'], exemplo: 'A reclamada reconhece o vínculo empregatício no período indicado.' },
    { acao: 'quantificar_pedido', preferidos: ['perfaz o montante de', 'totaliza', 'importa em', 'monta ao valor de'], evitar: ['dá', 'soma', 'vale'], exemplo: 'O crédito trabalhista perfaz o montante de R$ 45.000,00.' },
];

/** Retorna verbos preferidos para determinada ação */
export function getVerbsFor(acao: string): VerbPreference | undefined {
    return VERBS.find(v => v.acao === acao);
}

/** Retorna todos os verbos */
export function getAllVerbs(): VerbPreference[] {
    return VERBS;
}

// ── Conectivos Formais ──────────────────────────────────────────────

export interface Connective {
    conectivo: string;
    funcao: string;
    exemplo: string;
}

const CONNECTIVES: Connective[] = [
    { conectivo: 'destarte', funcao: 'conclusão', exemplo: 'Destarte, resta comprovada a responsabilidade da ré.' },
    { conectivo: 'outrossim', funcao: 'adição', exemplo: 'Outrossim, cabe ressaltar que o prazo prescricional não se consumou.' },
    { conectivo: 'nesse diapasão', funcao: 'concordância/reforço', exemplo: 'Nesse diapasão, a jurisprudência do TST é pacífica.' },
    { conectivo: 'ad argumentandum tantum', funcao: 'argumento hipotético', exemplo: 'Ad argumentandum tantum, ainda que se admitisse a tese contrária...' },
    { conectivo: 'com efeito', funcao: 'confirmação', exemplo: 'Com efeito, a prova documental confirma as alegações.' },
    { conectivo: 'sem embargo', funcao: 'concessão', exemplo: 'Sem embargo das razões da defesa, os pedidos merecem acolhimento.' },
    { conectivo: 'nada obstante', funcao: 'concessão', exemplo: 'Nada obstante a alegação de prescrição, o prazo não se consumou.' },
    { conectivo: 'em que pese', funcao: 'concessão', exemplo: 'Em que pese o argumento da reclamada, a prova testemunhal é convincente.' },
    { conectivo: 'data maxima venia', funcao: 'discordância respeitosa', exemplo: 'Data maxima venia, o entendimento adotado não encontra amparo legal.' },
    { conectivo: 'com a devida vênia', funcao: 'discordância respeitosa', exemplo: 'Com a devida vênia ao entendimento do Parquet, a denúncia é inepta.' },
    { conectivo: 'salvo melhor juízo', funcao: 'ressalva de opinião', exemplo: 'A sentença, salvo melhor juízo, aplicou incorretamente a norma.' },
    { conectivo: 'mormente', funcao: 'especialmente/sobretudo', exemplo: 'A prova é robusta, mormente a confissão da parte adversa.' },
    { conectivo: 'dessarte', funcao: 'conclusão', exemplo: 'Dessarte, impõe-se a reforma do julgado.' },
    { conectivo: 'por derradeiro', funcao: 'conclusão final', exemplo: 'Por derradeiro, requer-se a condenação em honorários sucumbenciais.' },
    { conectivo: 'não é despiciendo ressaltar', funcao: 'destaque', exemplo: 'Não é despiciendo ressaltar que o contrato previa cláusula penal.' },
    { conectivo: 'in verbis', funcao: 'citação literal', exemplo: 'O art. 5º da CF dispõe, in verbis: "Todos são iguais..."' },
    { conectivo: 'ipsis litteris', funcao: 'citação literal exata', exemplo: 'A cláusula contratual dispõe, ipsis litteris:...' },
    { conectivo: 'a fortiori', funcao: 'argumento por maioria de razão', exemplo: 'Se a norma protege o menor, a fortiori protege o nascituro.' },
    { conectivo: 'a contrario sensu', funcao: 'argumento por interpretação contrária', exemplo: 'A contrario sensu, quem não se enquadra na exceção submete-se à regra.' },
    { conectivo: 'mutatis mutandis', funcao: 'analogia com adaptações', exemplo: 'O precedente aplica-se, mutatis mutandis, ao caso em análise.' },
    { conectivo: 'via de consequência', funcao: 'consequência lógica', exemplo: 'Via de consequência, impõe-se a reforma do julgado.' },
    { conectivo: 'à guisa de', funcao: 'a título de', exemplo: 'À guisa de fundamentação, transcreve-se o precedente vinculante.' },
    { conectivo: 'ao revés', funcao: 'contrariedade', exemplo: 'Ao revés do que sustenta a ré, a prova é robusta e convincente.' },
    { conectivo: 'sobremodo', funcao: 'ênfase/especialmente', exemplo: 'O dano é evidente, sobremodo quando se considera a vulnerabilidade do autor.' },
    { conectivo: 'inobstante', funcao: 'concessão/apesar de', exemplo: 'Inobstante a alegação de boa-fé, a conduta é ilícita.' },
];

/** Retorna todos os conectivos formais */
export function getConnectives(): Connective[] {
    return CONNECTIVES;
}

/** Retorna conectivos por função */
export function getConnectivesByFunction(funcao: string): Connective[] {
    return CONNECTIVES.filter(c => c.funcao.includes(funcao));
}

// ── Expressões por Tipo de Peça ─────────────────────────────────────

export interface DocTypeExpressions {
    tipo: string;
    abertura: string[];
    transicoes: string[];
    fechamento: string[];
}

const DOC_EXPRESSIONS: DocTypeExpressions[] = [
    {
        tipo: 'peticao_inicial',
        abertura: [
            'vem, respeitosamente, à presença de Vossa Excelência, propor a presente',
            'vem, por seu advogado que esta subscreve, propor',
            'pelos fatos e fundamentos a seguir expostos',
        ],
        transicoes: [
            'Passa-se à exposição dos fatos',
            'No mérito, cumpre destacar',
            'Quanto ao direito aplicável à espécie',
        ],
        fechamento: [
            'Ante o exposto, requer a Vossa Excelência',
            'Nestes termos, pede deferimento',
            'Dá-se à causa o valor de R$',
            'Protesta provar o alegado por todos os meios de prova admitidos em direito',
        ],
    },
    {
        tipo: 'contestacao',
        abertura: [
            'vem, no prazo legal, apresentar CONTESTAÇÃO',
            'com fundamento no art. 335 e seguintes do Código de Processo Civil',
            'pelas razões de fato e de direito a seguir expostas',
        ],
        transicoes: [
            'Em sede de preliminar',
            'No mérito, as razões do autor não prosperam',
            'Quanto ao pedido de danos morais, não merece acolhimento',
            'Impugna-se especificamente',
        ],
        fechamento: [
            'Requer a total improcedência dos pedidos',
            'Protesta provar o alegado por todos os meios de prova admitidos em direito',
            'A condenação do autor ao pagamento das custas processuais e honorários advocatícios',
        ],
    },
    {
        tipo: 'recurso_ordinario',
        abertura: [
            'inconformado(a) com a r. sentença de fls.',
            'vem, respeitosamente, interpor RECURSO ORDINÁRIO',
            'com fulcro no art. 895, inciso I, da CLT',
            'requerendo seu recebimento, processamento e provimento',
        ],
        transicoes: [
            'O presente recurso é tempestivo',
            'A r. sentença merece reforma quanto',
            'Data venia ao entendimento do d. Juízo de origem',
            'O r. Juízo de origem incorreu em equívoco ao',
        ],
        fechamento: [
            'Requer o provimento do presente recurso para reformar a r. sentença',
            'A inversão dos ônus sucumbenciais',
        ],
    },
    {
        tipo: 'apelacao',
        abertura: [
            'inconformado(a) com a r. sentença prolatada',
            'vem interpor APELAÇÃO',
            'com fundamento no art. 1.009 e seguintes do CPC',
        ],
        transicoes: [
            'Da tempestividade e do preparo',
            'Do cabimento da apelação',
            'Das razões para reforma',
        ],
        fechamento: [
            'Requer o conhecimento e provimento da presente apelação',
            'A reforma da sentença para',
        ],
    },
    {
        tipo: 'embargos_declaracao',
        abertura: [
            'vem, tempestivamente, opor EMBARGOS DE DECLARAÇÃO',
            'com fundamento no art. 1.022 do CPC',
            'em face da r. decisão que contém',
        ],
        transicoes: [
            'A r. decisão é OMISSA quanto',
            'Há CONTRADIÇÃO no julgado, pois',
            'A OBSCURIDADE reside no fato de que',
            'Para fins de prequestionamento',
        ],
        fechamento: [
            'Requer o conhecimento e provimento dos presentes embargos',
            'conferindo-se efeito modificativo/integrativo à decisão embargada',
        ],
    },
    {
        tipo: 'agravo_instrumento',
        abertura: [
            'inconformado(a) com a r. decisão interlocutória',
            'vem interpor AGRAVO DE INSTRUMENTO',
            'com fundamento no art. 1.015 e seguintes do CPC',
        ],
        transicoes: [
            'Da decisão agravada',
            'Do cabimento do agravo',
            'Do pedido de efeito suspensivo / tutela recursal',
            'Demonstrado o fumus boni juris e o periculum in mora',
        ],
        fechamento: [
            'Requer a concessão de efeito suspensivo',
            'O provimento do agravo para reformar a decisão agravada',
        ],
    },
    {
        tipo: 'mandado_seguranca',
        abertura: [
            'vem impetrar MANDADO DE SEGURANÇA COM PEDIDO DE LIMINAR',
            'com fundamento no art. 5º, inciso LXIX, da Constituição Federal',
            'e na Lei nº 12.016/2009',
            'em face de ato ilegal e abusivo praticado pelo(a)',
        ],
        transicoes: [
            'Da autoridade coatora e do ato impugnado',
            'Do direito líquido e certo',
            'Da concessão da medida liminar',
        ],
        fechamento: [
            'Requer a concessão da medida liminar',
            'A notificação da autoridade coatora para prestar informações',
            'A concessão definitiva da segurança',
        ],
    },
    {
        tipo: 'habeas_corpus',
        abertura: [
            'impetra o presente HABEAS CORPUS, com pedido de liminar',
            'em favor de [PACIENTE], contra ato coator do(a)',
            'com fundamento no art. 5º, LXVIII, da Constituição Federal',
        ],
        transicoes: [
            'Da autoridade coatora e do ato constritivo',
            'Do constrangimento ilegal',
            'Da necessidade da concessão da ordem',
        ],
        fechamento: [
            'Requer a concessão da ordem para cessar o constrangimento ilegal',
            'A expedição de alvará de soltura em favor do paciente',
            'A notificação da autoridade coatora para prestar informações',
        ],
    },
    {
        tipo: 'reconvencao',
        abertura: [
            'vem apresentar RECONVENÇÃO',
            'nos termos do art. 343 do Código de Processo Civil',
            'pelos fatos e fundamentos a seguir deduzidos',
        ],
        transicoes: [
            'O autor-reconvindo causou danos ao réu-reconvinte',
            'Demonstra-se o direito ao ressarcimento',
        ],
        fechamento: [
            'Requer a procedência do pedido reconvencional',
            'A condenação do autor-reconvindo ao pagamento de',
        ],
    },
    {
        tipo: 'replica',
        abertura: [
            'vem apresentar RÉPLICA à contestação',
            'nos termos do art. 351 do Código de Processo Civil',
            'nos seguintes termos',
        ],
        transicoes: [
            'As preliminares arguidas não merecem acolhimento',
            'No mérito, as alegações da ré não prosperam',
            'Impugna-se especificamente',
        ],
        fechamento: [
            'Reitera-se o pedido de total procedência da ação',
            'Requer que sejam afastadas as preliminares e, no mérito, acolhidos os pedidos iniciais',
        ],
    },
    {
        tipo: 'cumprimento_sentenca',
        abertura: [
            'vem promover CUMPRIMENTO DE SENTENÇA',
            'com fundamento nos arts. 523 e seguintes do CPC',
            'em face de [EXECUTADO]',
        ],
        transicoes: [
            'O título executivo transitou em julgado em',
            'Dos cálculos atualizados',
            'Da intimação para pagamento em 15 dias',
        ],
        fechamento: [
            'Requer a intimação do executado para pagamento em 15 dias, sob pena de multa de 10%',
            'A penhora de bens suficientes à satisfação do crédito',
        ],
    },
    {
        tipo: 'execucao_titulo',
        abertura: [
            'vem promover EXECUÇÃO DE TÍTULO EXTRAJUDICIAL',
            'com fundamento nos arts. 784 e seguintes do CPC',
            'para cobrança da quantia de R$',
        ],
        transicoes: [
            'Do título executivo e sua liquidez',
            'Da certeza e exigibilidade do crédito',
        ],
        fechamento: [
            'Requer a citação do executado para pagamento em 3 dias',
            'A penhora e avaliação de bens suficientes à garantia do juízo',
        ],
    },
    {
        tipo: 'embargos_execucao',
        abertura: [
            'vem opor EMBARGOS À EXECUÇÃO',
            'com fundamento nos arts. 914 e seguintes do CPC',
            'no prazo legal de 15 dias',
        ],
        transicoes: [
            'Da tempestividade e garantia do juízo',
            'Do excesso de execução',
            'Da nulidade do título executivo',
        ],
        fechamento: [
            'Requer o acolhimento dos presentes embargos',
            'A desconstituição total/parcial do título executivo',
        ],
    },
    {
        tipo: 'tutela_antecipada',
        abertura: [
            'vem requerer TUTELA ANTECIPADA em caráter antecedente',
            'com fundamento nos arts. 303 e seguintes do CPC',
            'demonstrando a probabilidade do direito e o perigo de dano',
        ],
        transicoes: [
            'Da probabilidade do direito (fumus boni juris)',
            'Do perigo de dano ou risco ao resultado útil (periculum in mora)',
            'Da reversibilidade da medida',
        ],
        fechamento: [
            'Requer a concessão da tutela antecipada para',
            'A citação do réu para audiência de conciliação',
        ],
    },
    {
        tipo: 'recurso_especial',
        abertura: [
            'vem interpor RECURSO ESPECIAL',
            'com fundamento no art. 105, inciso III, da Constituição Federal',
            'para o Superior Tribunal de Justiça',
        ],
        transicoes: [
            'Do cabimento e prequestionamento da matéria',
            'Da violação à legislação federal infraconstitucional',
            'Da divergência jurisprudencial',
        ],
        fechamento: [
            'Requer o conhecimento e provimento do presente recurso especial',
            'A reforma do v. acórdão recorrido',
        ],
    },
    {
        tipo: 'recurso_extraordinario',
        abertura: [
            'vem interpor RECURSO EXTRAORDINÁRIO',
            'com fundamento no art. 102, inciso III, da Constituição Federal',
            'para o Supremo Tribunal Federal',
        ],
        transicoes: [
            'Da repercussão geral da questão constitucional',
            'Do prequestionamento da matéria constitucional',
            'Da violação ao dispositivo constitucional',
        ],
        fechamento: [
            'Requer o conhecimento e provimento do recurso extraordinário',
            'A reforma do v. acórdão para adequação à Constituição Federal',
        ],
    },
    {
        tipo: 'agravo_interno',
        abertura: [
            'vem interpor AGRAVO INTERNO',
            'com fundamento no art. 1.021 do Código de Processo Civil',
            'em face da r. decisão monocrática que',
        ],
        transicoes: [
            'Da decisão agravada',
            'Do erro na aplicação do precedente',
            'Da necessidade de julgamento pelo colegiado',
        ],
        fechamento: [
            'Requer a reconsideração da decisão monocrática ou, alternativamente, o provimento pelo colegiado',
        ],
    },
    {
        tipo: 'notificacao_extrajudicial',
        abertura: [
            'vem, pela presente, NOTIFICAR',
            'para que tome ciência e providencie',
            'no prazo de [X] dias',
        ],
        transicoes: [
            'Dos fatos que ensejam a presente notificação',
            'Das providências requeridas',
        ],
        fechamento: [
            'Fica o(a) notificado(a) ciente de que o descumprimento ensejará as medidas judiciais cabíveis',
            'A presente serve como constituição em mora',
        ],
    },
    {
        tipo: 'acordo_extrajudicial',
        abertura: [
            'celebram o presente ACORDO EXTRAJUDICIAL',
            'que se regerá pelas cláusulas e condições seguintes',
        ],
        transicoes: [
            'Das obrigações das partes',
            'Do valor e forma de pagamento',
            'Das penalidades por descumprimento',
        ],
        fechamento: [
            'E por estarem assim justas e contratadas, assinam o presente em 2 vias',
            'As partes elegem o foro de [COMARCA] para dirimir quaisquer dúvidas',
        ],
    },
    {
        tipo: 'parecer_juridico',
        abertura: [
            'apresenta o presente PARECER JURÍDICO',
            'em resposta à consulta formulada',
            'sobre a matéria a seguir analisada',
        ],
        transicoes: [
            'Da consulta',
            'Do enquadramento legal',
            'Da análise e fundamentação',
            'Das conclusões',
        ],
        fechamento: [
            'É o parecer, salvo melhor juízo',
            'Submete-se à apreciação superior',
        ],
    },
];

/** Retorna expressões para um tipo de peça jurídica */
export function getExpressionsFor(docType: string): DocTypeExpressions | undefined {
    return DOC_EXPRESSIONS.find(d => d.tipo === docType);
}

// ── Tratamento por Tribunal ──────────────────────────────────────────

export interface TribunalTreatment {
    tribunal: string;
    enderecamento: string;
    referencia: string;
    orgaoJulgador: string;
}

const TRIBUNAL_TREATMENTS: TribunalTreatment[] = [
    { tribunal: 'TJ', enderecamento: 'Egrégio Tribunal de Justiça', referencia: 'Colenda Câmara / Eminentes Desembargadores', orgaoJulgador: 'Câmara Cível / Câmara Criminal' },
    { tribunal: 'TRT', enderecamento: 'Egrégio Tribunal Regional do Trabalho', referencia: 'Colenda Turma / Eminentes Desembargadores', orgaoJulgador: 'Turma' },
    { tribunal: 'TRF', enderecamento: 'Egrégio Tribunal Regional Federal', referencia: 'Colenda Turma / Eminentes Desembargadores Federais', orgaoJulgador: 'Turma' },
    { tribunal: 'STJ', enderecamento: 'Colendo Superior Tribunal de Justiça', referencia: 'Eminentes Ministros', orgaoJulgador: 'Turma / Seção' },
    { tribunal: 'STF', enderecamento: 'Excelso Supremo Tribunal Federal', referencia: 'Eminentes Ministros', orgaoJulgador: 'Turma / Plenário' },
    { tribunal: 'TST', enderecamento: 'Colendo Tribunal Superior do Trabalho', referencia: 'Eminentes Ministros', orgaoJulgador: 'Turma / SDI / SDC' },
];

/** Retorna tratamento adequado para o tribunal */
export function getTribunalTreatment(tribunal: string): TribunalTreatment | undefined {
    return TRIBUNAL_TREATMENTS.find(t => t.tribunal === tribunal.toUpperCase());
}

/** Retorna todos os tratamentos por tribunal */
export function getAllTribunalTreatments(): TribunalTreatment[] {
    return TRIBUNAL_TREATMENTS;
}

// ── Formato de Citação ──────────────────────────────────────────────

export const CITATION_FORMATS = {
    artigo: 'Art. Xº, inciso Y, da [Nome da Lei]',
    sumula: 'Súmula nº X do C. [Tribunal]',
    jurisprudencia: '([Tribunal], [Tipo Recurso] [Número], Rel. [Título] [Nome], [Turma/Câmara], j. [dd/mm/aaaa])',
    doutrina: '[SOBRENOME], [Nome]. [Título da obra]. [Edição]. [Editora], [Ano]. p. [página]',
    lei: 'Lei nº X.XXX/AAAA',
    constituicao: 'Constituição Federal de 1988',
    clausula: 'Cláusula [Xª] do [contrato/acordo/convenção]',
};

/** Retorna todos os formatos de citação */
export function getCitationFormats(): typeof CITATION_FORMATS {
    return CITATION_FORMATS;
}

// ── Bloco Completo de Estilo ────────────────────────────────────────

/**
 * Monta bloco de estilo completo para injeção no prompt.
 * Inclui: tratamento, verbos, conectivos e expressões do tipo de peça.
 */
export function getFullStyleBlock(area: string, docType?: string, tribunal?: string): string {
    const parts: string[] = ['## Vocabulário e Estilo Jurídico'];

    // Tratamento por tribunal (prioridade) ou por área
    if (tribunal) {
        const tt = getTribunalTreatment(tribunal);
        if (tt) {
            parts.push(`### Tratamento (${tt.tribunal})\n- Endereçamento: "${tt.enderecamento}"\n- Referência: "${tt.referencia}"\n- Órgão julgador: ${tt.orgaoJulgador}`);
        }
    } else {
        const areaToRecipient: Record<string, string> = {
            trabalhista: 'juiz_trabalho',
            civil: 'juiz_1a',
            penal: 'juiz_1a',
            familia: 'juiz_1a',
            consumidor: 'juiz_1a',
            tributario: 'juiz_federal',
            previdenciario: 'juiz_federal',
            administrativo: 'juiz_federal',
            empresarial: 'juiz_1a',
            ambiental: 'juiz_federal',
            digital: 'juiz_1a',
            imobiliario: 'juiz_1a',
            eleitoral: 'juiz_1a',
        };

        const recipient = areaToRecipient[area] || 'juiz_1a';
        const treatment = getTreatmentFor(recipient);
        if (treatment) {
            parts.push(`### Tratamento\n- Endereçamento: "${treatment.tratamento}"\n- No corpo: use "Douto Juízo", "Vossa Excelência" ou "Excelência"`);
        }
    }

    // Verbos (top 5 mais relevantes)
    const topVerbs = VERBS.slice(0, 5);
    const verbLines = topVerbs.map(v =>
        `- Para ${v.acao}: use "${v.preferidos.slice(0, 3).join('", "')}" (NÃO "${v.evitar.slice(0, 2).join('", "')}")`
    );
    parts.push(`### Verbos Preferidos\n${verbLines.join('\n')}`);

    // Conectivos (top 6)
    const topConn = CONNECTIVES.slice(0, 6);
    parts.push(`### Conectivos Formais\nUse: ${topConn.map(c => `"${c.conectivo}"`).join(', ')}`);

    // Expressões do tipo de peça
    if (docType) {
        const expr = getExpressionsFor(docType);
        if (expr) {
            parts.push(`### Expressões para ${docType.replace(/_/g, ' ')}\n- Abertura: "${expr.abertura[0]}"\n- Transição: "${expr.transicoes[0]}"\n- Fechamento: "${expr.fechamento[0]}"`);
        }
    }

    // Citação
    parts.push(`### Formato de Citação\n- Artigo: "${CITATION_FORMATS.artigo}"\n- Súmula: "${CITATION_FORMATS.sumula}"\n- Jurisprudência: "${CITATION_FORMATS.jurisprudencia}"`);

    return parts.join('\n\n');
}
