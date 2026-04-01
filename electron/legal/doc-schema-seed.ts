/**
 * Document Schema Seed — Schemas builtin para Knowledge Base
 *
 * ~45 schemas cobrindo 12 categorias de documentos jurídicos.
 * Os 7 primeiros mapeiam para as PetitionTemplates existentes (backward compat).
 */

import { DocumentSchema, secao } from './doc-schemas';

const hoje = new Date().toISOString().split('T')[0]!;

// ═══════════════════════════════════════════════════════════════════════
// PEÇAS PROCESSUAIS (mapeia templates existentes)
// ═══════════════════════════════════════════════════════════════════════

const peticaoInicial: DocumentSchema = {
    id: 'peticao_inicial',
    nome: 'Petição Inicial',
    categoria: 'pecas_processuais',
    legacyTemplateId: 'peticao_inicial',
    secoes: [
        secao('enderecamento', 'ENDEREÇAMENTO', 'Juízo competente com vara, comarca e UF', 1),
        secao('qualificacao', 'QUALIFICAÇÃO DAS PARTES', 'Nome completo, CPF/CNPJ, endereço de autor e réu', 2),
        secao('dos_fatos', 'DOS FATOS', 'Narrativa cronológica e objetiva dos fatos', 3),
        secao('do_direito', 'DO DIREITO', 'Fundamentos jurídicos com artigos e jurisprudência', 4),
        secao('dos_pedidos', 'DOS PEDIDOS', 'Pedidos numerados, específicos e fundamentados', 5),
        secao('valor_causa', 'VALOR DA CAUSA', 'Valor numérico e por extenso', 6),
        secao('fecho', 'FECHO', 'Nestes termos, pede deferimento + local, data, advogado', 7),
    ],
    estilo: { tratamento: 'Excelentíssimo(a) Senhor(a) Doutor(a) Juiz(a)', tom: 'formal', formatacao: 'judicial', tempoVerbal: 'presente/pretérito', pessoaGramatical: '3a' },
    fundamentosComuns: ['Art. 319 CPC', 'Art. 320 CPC'],
    areas: ['civil', 'trabalhista', 'consumidor', 'familia'],
    fonte: 'builtin',
    dataAtualizacao: hoje,
};

const contestacao: DocumentSchema = {
    id: 'contestacao',
    nome: 'Contestação',
    categoria: 'pecas_processuais',
    legacyTemplateId: 'contestacao',
    secoes: [
        secao('enderecamento', 'ENDEREÇAMENTO', 'Juízo da ação', 1),
        secao('qualificacao', 'QUALIFICAÇÃO', 'Referência ao processo e partes', 2),
        secao('preliminares', 'PRELIMINARMENTE', 'Preliminares processuais (inépcia, ilegitimidade, prescrição)', 3, false),
        secao('dos_fatos', 'DOS FATOS', 'Versão dos fatos sob ótica do réu', 4),
        secao('do_direito', 'DO DIREITO', 'Refutação ponto a ponto dos argumentos do autor', 5),
        secao('dos_pedidos', 'DOS PEDIDOS', 'Improcedência total + condenação em sucumbência', 6),
        secao('fecho', 'FECHO', 'Nestes termos, pede deferimento', 7),
    ],
    estilo: { tratamento: 'Excelentíssimo(a) Senhor(a) Doutor(a) Juiz(a)', tom: 'formal', formatacao: 'judicial', tempoVerbal: 'presente', pessoaGramatical: '3a' },
    fundamentosComuns: ['Art. 335 CPC', 'Art. 336 CPC', 'Art. 337 CPC'],
    areas: ['civil', 'trabalhista', 'consumidor'],
    fonte: 'builtin',
    dataAtualizacao: hoje,
};

const apelacao: DocumentSchema = {
    id: 'apelacao',
    nome: 'Apelação',
    categoria: 'recursos',
    legacyTemplateId: 'apelacao',
    secoes: [
        secao('interposicao', 'PETIÇÃO DE INTERPOSIÇÃO', 'Endereçamento e requerimento de remessa ao tribunal', 1),
        secao('tempestividade', 'DA TEMPESTIVIDADE', 'Demonstração do prazo recursal', 2),
        secao('sintese', 'DOS FATOS E DA SENTENÇA', 'Resumo do caso e do dispositivo impugnado', 3),
        secao('razoes', 'DAS RAZÕES PARA REFORMA', 'Argumentação demonstrando erro da sentença', 4),
        secao('dos_pedidos', 'DOS PEDIDOS', 'Conhecimento, provimento e reforma específica', 5),
        secao('fecho', 'FECHO', 'Nestes termos, pede deferimento', 6),
    ],
    estilo: { tratamento: 'Egrégio Tribunal / Colenda Turma', tom: 'formal', formatacao: 'judicial', tempoVerbal: 'presente/pretérito', pessoaGramatical: '3a' },
    fundamentosComuns: ['Art. 1.009 CPC', 'Art. 1.010 CPC', 'Art. 1.012 CPC'],
    areas: ['civil', 'consumidor', 'familia'],
    fonte: 'builtin',
    dataAtualizacao: hoje,
};

const recursoOrdinario: DocumentSchema = {
    id: 'recurso_ordinario',
    nome: 'Recurso Ordinário',
    categoria: 'recursos',
    legacyTemplateId: 'recurso_ordinario',
    secoes: [
        secao('interposicao', 'PETIÇÃO DE INTERPOSIÇÃO', 'Endereçamento ao juízo de origem + remessa ao TRT', 1),
        secao('tempestividade', 'DA TEMPESTIVIDADE', 'Prazo do octídio legal (art. 895 CLT)', 2),
        secao('sintese', 'BREVE SÍNTESE DA DEMANDA', 'O que foi pedido e decidido', 3),
        secao('razoes', 'DAS RAZÕES DE REFORMA', 'Impugnação específica de cada ponto', 4),
        secao('dos_pedidos', 'DOS PEDIDOS', 'Recebimento, provimento e reforma', 5),
        secao('fecho', 'FECHO', 'Nestes termos, pede deferimento', 6),
    ],
    estilo: { tratamento: 'Egrégio Tribunal Regional do Trabalho', tom: 'formal', formatacao: 'judicial', tempoVerbal: 'presente', pessoaGramatical: '3a' },
    fundamentosComuns: ['Art. 895 CLT', 'Art. 1.010 CPC'],
    areas: ['trabalhista'],
    fonte: 'builtin',
    dataAtualizacao: hoje,
};

const embargosDeclaracao: DocumentSchema = {
    id: 'embargos_declaracao',
    nome: 'Embargos de Declaração',
    categoria: 'recursos',
    legacyTemplateId: 'embargos_declaracao',
    secoes: [
        secao('enderecamento', 'ENDEREÇAMENTO', 'Juízo ou tribunal prolator da decisão', 1),
        secao('tempestividade', 'DA TEMPESTIVIDADE', 'Prazo de 5 dias', 2),
        secao('vicio', 'DA OMISSÃO/CONTRADIÇÃO/OBSCURIDADE', 'Apontar vício com precisão', 3),
        secao('prequestionamento', 'DO PREQUESTIONAMENTO', 'Artigos que necessitam manifestação', 4, false),
        secao('pedido', 'DO PEDIDO', 'Efeito modificativo ou integrativo', 5),
        secao('fecho', 'FECHO', 'Nestes termos, pede deferimento', 6),
    ],
    estilo: { tratamento: 'Excelentíssimo(a) Senhor(a)', tom: 'formal', formatacao: 'judicial', tempoVerbal: 'presente', pessoaGramatical: '3a' },
    fundamentosComuns: ['Art. 1.022 CPC', 'Art. 897-A CLT'],
    areas: ['civil', 'trabalhista', 'penal'],
    fonte: 'builtin',
    dataAtualizacao: hoje,
};

const agravoInstrumento: DocumentSchema = {
    id: 'agravo_instrumento',
    nome: 'Agravo de Instrumento',
    categoria: 'recursos',
    legacyTemplateId: 'agravo_instrumento',
    secoes: [
        secao('enderecamento', 'ENDEREÇAMENTO', 'Tribunal competente', 1),
        secao('decisao_agravada', 'DA DECISÃO AGRAVADA', 'Transcrição ou resumo da decisão interlocutória', 2),
        secao('cabimento', 'DO CABIMENTO', 'Enquadramento no art. 1.015 CPC', 3),
        secao('efeito_suspensivo', 'DO EFEITO SUSPENSIVO / TUTELA RECURSAL', 'Fumus boni juris + periculum in mora', 4, false),
        secao('razoes', 'DAS RAZÕES', 'Argumentação para reforma', 5),
        secao('dos_pedidos', 'DOS PEDIDOS', 'Provimento + efeito suspensivo', 6),
        secao('fecho', 'FECHO', 'Nestes termos, pede deferimento', 7),
    ],
    estilo: { tratamento: 'Excelentíssimo(a) Senhor(a) Desembargador(a)', tom: 'formal', formatacao: 'judicial', tempoVerbal: 'presente', pessoaGramatical: '3a' },
    fundamentosComuns: ['Art. 1.015 CPC', 'Art. 1.019 CPC'],
    areas: ['civil', 'trabalhista'],
    fonte: 'builtin',
    dataAtualizacao: hoje,
};

const mandadoSeguranca: DocumentSchema = {
    id: 'mandado_seguranca',
    nome: 'Mandado de Segurança',
    categoria: 'pecas_processuais',
    legacyTemplateId: 'mandado_seguranca',
    secoes: [
        secao('enderecamento', 'ENDEREÇAMENTO', 'Juízo competente', 1),
        secao('qualificacao', 'QUALIFICAÇÃO', 'Impetrante e autoridade coatora', 2),
        secao('autoridade', 'DA AUTORIDADE COATORA E DO ATO IMPUGNADO', 'Pessoa física + ato ilegal', 3),
        secao('dos_fatos', 'DOS FATOS', 'Narrativa factual', 4),
        secao('direito_liquido', 'DO DIREITO LÍQUIDO E CERTO', 'Prova pré-constituída', 5),
        secao('liminar', 'DA LIMINAR', 'Fumus boni juris + periculum in mora', 6),
        secao('dos_pedidos', 'DOS PEDIDOS', 'Liminar + notificação + segurança definitiva', 7),
        secao('fecho', 'FECHO', 'Nestes termos, pede deferimento', 8),
    ],
    estilo: { tratamento: 'Excelentíssimo(a) Senhor(a) Doutor(a) Juiz(a)', tom: 'formal', formatacao: 'judicial', tempoVerbal: 'presente', pessoaGramatical: '3a' },
    fundamentosComuns: ['Art. 5º, LXIX CF', 'Lei 12.016/2009'],
    areas: ['administrativo', 'tributário'],
    fonte: 'builtin',
    dataAtualizacao: hoje,
};

// ═══════════════════════════════════════════════════════════════════════
// PEÇAS PROCESSUAIS (novas)
// ═══════════════════════════════════════════════════════════════════════

const habeasCorpus: DocumentSchema = {
    id: 'habeas_corpus',
    nome: 'Habeas Corpus',
    categoria: 'pecas_processuais',
    secoes: [
        secao('enderecamento', 'ENDEREÇAMENTO', 'Tribunal competente', 1),
        secao('qualificacao', 'QUALIFICAÇÃO', 'Paciente e autoridade coatora', 2),
        secao('do_constrangimento', 'DO CONSTRANGIMENTO ILEGAL', 'Descrição da privação/ameaça de liberdade', 3),
        secao('dos_fatos', 'DOS FATOS', 'Narrativa factual', 4),
        secao('do_direito', 'DO DIREITO', 'Fundamentos jurídicos — ilegalidade/abuso de poder', 5),
        secao('liminar', 'DA LIMINAR', 'Urgência da concessão', 6, false),
        secao('dos_pedidos', 'DOS PEDIDOS', 'Concessão da ordem + liminar', 7),
        secao('fecho', 'FECHO', 'Nestes termos, pede deferimento', 8),
    ],
    estilo: { tratamento: 'Excelentíssimo(a) Senhor(a) Desembargador(a)', tom: 'formal', formatacao: 'judicial', tempoVerbal: 'presente', pessoaGramatical: '3a' },
    fundamentosComuns: ['Art. 5º, LXVIII CF', 'Art. 647 CPP'],
    areas: ['penal'],
    fonte: 'builtin',
    dataAtualizacao: hoje,
};

const reconvencao: DocumentSchema = {
    id: 'reconvencao',
    nome: 'Reconvenção',
    categoria: 'pecas_processuais',
    secoes: [
        secao('enderecamento', 'ENDEREÇAMENTO', 'Juízo da ação principal', 1),
        secao('qualificacao', 'QUALIFICAÇÃO', 'Reconvinte e reconvindo', 2),
        secao('dos_fatos', 'DOS FATOS', 'Fatos que fundamentam o pedido reconvencional', 3),
        secao('do_direito', 'DO DIREITO', 'Fundamentos jurídicos da pretensão', 4),
        secao('dos_pedidos', 'DOS PEDIDOS', 'Pedidos reconvencionais', 5),
        secao('valor_causa', 'VALOR DA CAUSA', 'Valor da reconvenção', 6),
        secao('fecho', 'FECHO', 'Nestes termos, pede deferimento', 7),
    ],
    estilo: { tratamento: 'Excelentíssimo(a) Senhor(a) Doutor(a) Juiz(a)', tom: 'formal', formatacao: 'judicial', tempoVerbal: 'presente', pessoaGramatical: '3a' },
    fundamentosComuns: ['Art. 343 CPC'],
    areas: ['civil', 'trabalhista'],
    fonte: 'builtin',
    dataAtualizacao: hoje,
};

const replica: DocumentSchema = {
    id: 'replica',
    nome: 'Réplica / Impugnação à Contestação',
    categoria: 'pecas_processuais',
    secoes: [
        secao('enderecamento', 'ENDEREÇAMENTO', 'Juízo da ação', 1),
        secao('preambulo', 'PREÂMBULO', 'Referência ao processo e à contestação', 2),
        secao('das_preliminares', 'DAS PRELIMINARES ARGUIDAS PELO RÉU', 'Refutação das preliminares', 3, false),
        secao('do_merito', 'DO MÉRITO', 'Refutação ponto a ponto da contestação', 4),
        secao('dos_pedidos', 'DOS PEDIDOS', 'Reiteração dos pedidos iniciais', 5),
        secao('fecho', 'FECHO', 'Nestes termos, pede deferimento', 6),
    ],
    estilo: { tratamento: 'Excelentíssimo(a) Senhor(a) Doutor(a) Juiz(a)', tom: 'formal', formatacao: 'judicial', tempoVerbal: 'presente', pessoaGramatical: '3a' },
    fundamentosComuns: ['Art. 351 CPC'],
    areas: ['civil', 'trabalhista', 'consumidor'],
    fonte: 'builtin',
    dataAtualizacao: hoje,
};

// ═══════════════════════════════════════════════════════════════════════
// EXECUÇÃO
// ═══════════════════════════════════════════════════════════════════════

const cumprimentoSentenca: DocumentSchema = {
    id: 'cumprimento_sentenca',
    nome: 'Cumprimento de Sentença',
    categoria: 'execucao',
    secoes: [
        secao('enderecamento', 'ENDEREÇAMENTO', 'Juízo prolator da sentença', 1),
        secao('qualificacao', 'QUALIFICAÇÃO', 'Exequente e executado', 2),
        secao('do_titulo', 'DO TÍTULO EXECUTIVO', 'Sentença transitada em julgado', 3),
        secao('do_calculo', 'DOS CÁLCULOS', 'Memória de cálculo discriminada', 4),
        secao('dos_pedidos', 'DOS PEDIDOS', 'Intimação para pagamento em 15 dias + multa 10%', 5),
        secao('fecho', 'FECHO', 'Nestes termos, pede deferimento', 6),
    ],
    estilo: { tratamento: 'Excelentíssimo(a) Senhor(a) Doutor(a) Juiz(a)', tom: 'formal', formatacao: 'judicial', tempoVerbal: 'presente', pessoaGramatical: '3a' },
    fundamentosComuns: ['Art. 523 CPC', 'Art. 524 CPC'],
    areas: ['civil', 'trabalhista'],
    fonte: 'builtin',
    dataAtualizacao: hoje,
};

const execucaoTitulo: DocumentSchema = {
    id: 'execucao_titulo_extrajudicial',
    nome: 'Execução de Título Extrajudicial',
    categoria: 'execucao',
    secoes: [
        secao('enderecamento', 'ENDEREÇAMENTO', 'Juízo competente', 1),
        secao('qualificacao', 'QUALIFICAÇÃO DAS PARTES', 'Exequente e executado', 2),
        secao('do_titulo', 'DO TÍTULO EXECUTIVO', 'Descrição do título (cheque, NP, contrato)', 3),
        secao('do_debito', 'DO DÉBITO', 'Valor principal + juros + correção', 4),
        secao('dos_pedidos', 'DOS PEDIDOS', 'Citação para pagamento em 3 dias + penhora', 5),
        secao('fecho', 'FECHO', 'Nestes termos, pede deferimento', 6),
    ],
    estilo: { tratamento: 'Excelentíssimo(a) Senhor(a) Doutor(a) Juiz(a)', tom: 'formal', formatacao: 'judicial', tempoVerbal: 'presente', pessoaGramatical: '3a' },
    fundamentosComuns: ['Art. 784 CPC', 'Art. 786 CPC', 'Art. 829 CPC'],
    areas: ['civil'],
    fonte: 'builtin',
    dataAtualizacao: hoje,
};

const embargosExecucao: DocumentSchema = {
    id: 'embargos_execucao',
    nome: 'Embargos à Execução',
    categoria: 'execucao',
    secoes: [
        secao('enderecamento', 'ENDEREÇAMENTO', 'Juízo da execução', 1),
        secao('qualificacao', 'QUALIFICAÇÃO', 'Embargante (executado) e embargado (exequente)', 2),
        secao('da_tempestividade', 'DA TEMPESTIVIDADE', 'Prazo de 15 dias da juntada do mandado', 3),
        secao('dos_fatos', 'DOS FATOS', 'Contexto da execução', 4),
        secao('do_excesso', 'DO EXCESSO DE EXECUÇÃO', 'Demonstração do excesso ou nulidade', 5, false),
        secao('do_direito', 'DO DIREITO', 'Fundamentos para desconstituição do título', 6),
        secao('dos_pedidos', 'DOS PEDIDOS', 'Acolhimento dos embargos + efeito suspensivo', 7),
        secao('fecho', 'FECHO', 'Nestes termos, pede deferimento', 8),
    ],
    estilo: { tratamento: 'Excelentíssimo(a) Senhor(a) Doutor(a) Juiz(a)', tom: 'formal', formatacao: 'judicial', tempoVerbal: 'presente', pessoaGramatical: '3a' },
    fundamentosComuns: ['Art. 914 CPC', 'Art. 917 CPC'],
    areas: ['civil'],
    fonte: 'builtin',
    dataAtualizacao: hoje,
};

// ═══════════════════════════════════════════════════════════════════════
// CAUTELARES
// ═══════════════════════════════════════════════════════════════════════

const tutelaAntecipada: DocumentSchema = {
    id: 'tutela_antecipada',
    nome: 'Tutela Antecipada Antecedente',
    categoria: 'cautelares',
    secoes: [
        secao('enderecamento', 'ENDEREÇAMENTO', 'Juízo competente', 1),
        secao('qualificacao', 'QUALIFICAÇÃO', 'Requerente e requerido', 2),
        secao('dos_fatos', 'DOS FATOS', 'Narrativa da urgência', 3),
        secao('do_direito', 'DO DIREITO', 'Probabilidade do direito', 4),
        secao('da_urgencia', 'DO PERIGO DE DANO OU RISCO AO RESULTADO ÚTIL', 'Demonstração da urgência', 5),
        secao('dos_pedidos', 'DOS PEDIDOS', 'Concessão da tutela + citação do réu', 6),
        secao('fecho', 'FECHO', 'Nestes termos, pede deferimento', 7),
    ],
    estilo: { tratamento: 'Excelentíssimo(a) Senhor(a) Doutor(a) Juiz(a)', tom: 'formal', formatacao: 'judicial', tempoVerbal: 'presente', pessoaGramatical: '3a' },
    fundamentosComuns: ['Art. 300 CPC', 'Art. 303 CPC'],
    areas: ['civil', 'consumidor', 'familia'],
    fonte: 'builtin',
    dataAtualizacao: hoje,
};

const tutelaCautelar: DocumentSchema = {
    id: 'tutela_cautelar',
    nome: 'Tutela Cautelar Antecedente',
    categoria: 'cautelares',
    secoes: [
        secao('enderecamento', 'ENDEREÇAMENTO', 'Juízo competente', 1),
        secao('qualificacao', 'QUALIFICAÇÃO', 'Requerente e requerido', 2),
        secao('dos_fatos', 'DOS FATOS', 'Situação de risco', 3),
        secao('fumus_periculum', 'DO FUMUS BONI JURIS E PERICULUM IN MORA', 'Elementos cautelares', 4),
        secao('dos_pedidos', 'DOS PEDIDOS', 'Medida cautelar específica', 5),
        secao('fecho', 'FECHO', 'Nestes termos, pede deferimento', 6),
    ],
    estilo: { tratamento: 'Excelentíssimo(a) Senhor(a) Doutor(a) Juiz(a)', tom: 'formal', formatacao: 'judicial', tempoVerbal: 'presente', pessoaGramatical: '3a' },
    fundamentosComuns: ['Art. 300 CPC', 'Art. 305 CPC'],
    areas: ['civil'],
    fonte: 'builtin',
    dataAtualizacao: hoje,
};

// ═══════════════════════════════════════════════════════════════════════
// CONTRATOS
// ═══════════════════════════════════════════════════════════════════════

const contratoPrestacaoServicos: DocumentSchema = {
    id: 'contrato_prestacao_servicos',
    nome: 'Contrato de Prestação de Serviços',
    categoria: 'contratos',
    secoes: [
        secao('cabecalho', 'CABEÇALHO', 'Título e número do contrato', 1),
        secao('qualificacao', 'QUALIFICAÇÃO DAS PARTES', 'CONTRATANTE e CONTRATADA com dados completos', 2),
        secao('objeto', 'DO OBJETO', 'Descrição detalhada dos serviços', 3),
        secao('obrigacoes_contratada', 'DAS OBRIGAÇÕES DA CONTRATADA', 'Obrigações de fazer', 4),
        secao('obrigacoes_contratante', 'DAS OBRIGAÇÕES DO CONTRATANTE', 'Obrigações (pagamento, informações)', 5),
        secao('preco_pagamento', 'DO PREÇO E CONDIÇÕES DE PAGAMENTO', 'Valor, parcelas, forma de pagamento', 6),
        secao('prazo', 'DO PRAZO', 'Vigência, renovação, denúncia', 7),
        secao('rescisao', 'DA RESCISÃO', 'Hipóteses de rescisão e multa', 8),
        secao('confidencialidade', 'DA CONFIDENCIALIDADE', 'NDA e proteção de informações', 9, false),
        secao('disposicoes_gerais', 'DAS DISPOSIÇÕES GERAIS', 'Foro, integralidade, comunicações', 10),
        secao('assinaturas', 'ASSINATURAS', 'Local, data, partes e testemunhas', 11),
    ],
    estilo: { tratamento: 'CONTRATANTE / CONTRATADA', tom: 'formal', formatacao: 'contratual', tempoVerbal: 'presente/futuro', pessoaGramatical: '3a' },
    fundamentosComuns: ['Art. 593 CC', 'Art. 594 CC'],
    areas: ['civil', 'empresarial'],
    fonte: 'builtin',
    dataAtualizacao: hoje,
};

const contratoHonorarios: DocumentSchema = {
    id: 'contrato_honorarios',
    nome: 'Contrato de Honorários Advocatícios',
    categoria: 'contratos',
    secoes: [
        secao('cabecalho', 'CABEÇALHO', 'Contrato de Prestação de Serviços Advocatícios', 1),
        secao('qualificacao', 'QUALIFICAÇÃO DAS PARTES', 'Advogado/escritório e cliente', 2),
        secao('objeto', 'DO OBJETO', 'Serviços jurídicos contratados e escopo', 3),
        secao('honorarios', 'DOS HONORÁRIOS', 'Valor fixo, ad exitum, percentual, parcelas', 4),
        secao('despesas', 'DAS DESPESAS', 'Custas, deslocamentos, perícias — por conta de quem', 5),
        secao('obrigacoes_advogado', 'DAS OBRIGAÇÕES DO ADVOGADO', 'Diligência, sigilo, prestação de contas', 6),
        secao('obrigacoes_cliente', 'DAS OBRIGAÇÕES DO CLIENTE', 'Documentos, informações, pagamento pontual', 7),
        secao('substabelecimento', 'DO SUBSTABELECIMENTO', 'Autorização ou vedação', 8, false),
        secao('rescisao', 'DA RESCISÃO E REVOGAÇÃO DO MANDATO', 'Hipóteses e consequências financeiras', 9),
        secao('foro', 'DO FORO', 'Foro de eleição para disputas', 10),
        secao('assinaturas', 'ASSINATURAS', 'Local, data, partes e testemunhas', 11),
    ],
    estilo: { tratamento: 'CONTRATANTE / CONTRATADO(A)', tom: 'formal', formatacao: 'contratual', tempoVerbal: 'presente/futuro', pessoaGramatical: '3a' },
    fundamentosComuns: ['Art. 22 Lei 8.906/94 (Estatuto da OAB)', 'Tabela de honorários da OAB'],
    areas: ['civil'],
    fonte: 'builtin',
    dataAtualizacao: hoje,
};

const contratoLocacao: DocumentSchema = {
    id: 'contrato_locacao',
    nome: 'Contrato de Locação',
    categoria: 'contratos',
    secoes: [
        secao('cabecalho', 'CABEÇALHO', 'Contrato de Locação de Imóvel', 1),
        secao('qualificacao', 'QUALIFICAÇÃO DAS PARTES', 'LOCADOR e LOCATÁRIO', 2),
        secao('objeto', 'DO OBJETO', 'Descrição do imóvel (endereço, matrícula)', 3),
        secao('finalidade', 'DA FINALIDADE', 'Residencial ou comercial', 4),
        secao('prazo', 'DO PRAZO', 'Vigência e renovação', 5),
        secao('aluguel', 'DO ALUGUEL E REAJUSTE', 'Valor, vencimento, índice de correção', 6),
        secao('garantia', 'DA GARANTIA', 'Caução, fiador, seguro-fiança', 7),
        secao('obrigacoes_locador', 'DAS OBRIGAÇÕES DO LOCADOR', 'Entrega, manutenção estrutural', 8),
        secao('obrigacoes_locatario', 'DAS OBRIGAÇÕES DO LOCATÁRIO', 'Pagamento, conservação, uso adequado', 9),
        secao('rescisao', 'DA RESCISÃO', 'Hipóteses e multa', 10),
        secao('vistoria', 'DA VISTORIA', 'Laudo de entrada e saída', 11),
        secao('foro', 'DO FORO', 'Foro da situação do imóvel', 12),
        secao('assinaturas', 'ASSINATURAS', 'Local, data, partes e testemunhas', 13),
    ],
    estilo: { tratamento: 'LOCADOR / LOCATÁRIO', tom: 'formal', formatacao: 'contratual', tempoVerbal: 'presente/futuro', pessoaGramatical: '3a' },
    fundamentosComuns: ['Lei 8.245/91 (Lei do Inquilinato)', 'Art. 565 CC'],
    areas: ['imobiliário', 'civil'],
    fonte: 'builtin',
    dataAtualizacao: hoje,
};

const contratoCompraVenda: DocumentSchema = {
    id: 'contrato_compra_venda',
    nome: 'Contrato de Compra e Venda',
    categoria: 'contratos',
    secoes: [
        secao('cabecalho', 'CABEÇALHO', 'Contrato Particular de Compra e Venda', 1),
        secao('qualificacao', 'QUALIFICAÇÃO DAS PARTES', 'VENDEDOR e COMPRADOR', 2),
        secao('objeto', 'DO OBJETO', 'Bem vendido com descrição completa', 3),
        secao('preco', 'DO PREÇO E PAGAMENTO', 'Valor, forma e prazo de pagamento', 4),
        secao('entrega', 'DA ENTREGA / TRADIÇÃO', 'Quando e como o bem será entregue', 5),
        secao('garantias', 'DAS GARANTIAS', 'Vícios ocultos, evicção', 6, false),
        secao('rescisao', 'DA RESCISÃO', 'Hipóteses e consequências', 7),
        secao('foro', 'DO FORO', 'Foro eleito', 8),
        secao('assinaturas', 'ASSINATURAS', 'Local, data, partes e testemunhas', 9),
    ],
    estilo: { tratamento: 'VENDEDOR / COMPRADOR', tom: 'formal', formatacao: 'contratual', tempoVerbal: 'presente/futuro', pessoaGramatical: '3a' },
    fundamentosComuns: ['Art. 481 CC', 'Art. 482 CC'],
    areas: ['civil', 'imobiliário'],
    fonte: 'builtin',
    dataAtualizacao: hoje,
};

const contratoSocial: DocumentSchema = {
    id: 'contrato_social',
    nome: 'Contrato Social',
    categoria: 'societarios',
    secoes: [
        secao('cabecalho', 'CABEÇALHO', 'Contrato Social da Sociedade', 1),
        secao('qualificacao', 'QUALIFICAÇÃO DOS SÓCIOS', 'Todos os sócios com dados completos', 2),
        secao('denominacao', 'DA DENOMINAÇÃO E SEDE', 'Razão social, nome fantasia, endereço', 3),
        secao('objeto_social', 'DO OBJETO SOCIAL', 'Atividades da empresa (CNAEs)', 4),
        secao('capital', 'DO CAPITAL SOCIAL', 'Valor, divisão em quotas, integralização', 5),
        secao('administracao', 'DA ADMINISTRAÇÃO', 'Quem administra, poderes, pro labore', 6),
        secao('deliberacoes', 'DAS DELIBERAÇÕES SOCIAIS', 'Quórum para decisões', 7),
        secao('distribuicao_lucros', 'DA DISTRIBUIÇÃO DE LUCROS', 'Proporcional ou desproporcional', 8),
        secao('cessao_quotas', 'DA CESSÃO DE QUOTAS', 'Regras para transferência', 9),
        secao('dissolucao', 'DA DISSOLUÇÃO', 'Hipóteses de dissolução e liquidação', 10),
        secao('foro', 'DO FORO', 'Foro da sede', 11),
        secao('assinaturas', 'ASSINATURAS', 'Sócios e testemunhas', 12),
    ],
    estilo: { tratamento: 'SÓCIOS', tom: 'formal', formatacao: 'contratual', tempoVerbal: 'presente/futuro', pessoaGramatical: '3a' },
    fundamentosComuns: ['Art. 997 CC', 'Art. 1.052 CC'],
    areas: ['empresarial', 'societário'],
    fonte: 'builtin',
    dataAtualizacao: hoje,
};

// ═══════════════════════════════════════════════════════════════════════
// DOCUMENTOS ADMINISTRATIVOS
// ═══════════════════════════════════════════════════════════════════════

const oficio: DocumentSchema = {
    id: 'oficio',
    nome: 'Ofício',
    categoria: 'docs_administrativos',
    secoes: [
        secao('cabecalho', 'CABEÇALHO', 'Ofício nº XXX/AAAA + local e data', 1),
        secao('destinatario', 'DESTINATÁRIO', 'A(o) Ilustríssimo(a) Sr(a). + cargo + órgão', 2),
        secao('assunto', 'ASSUNTO', 'Resumo em uma linha', 3),
        secao('vocativo', 'VOCATIVO', 'Senhor(a) + cargo', 4),
        secao('corpo', 'CORPO', 'Texto objetivo e impessoal', 5),
        secao('fecho', 'FECHO', 'Atenciosamente / Respeitosamente', 6),
        secao('assinatura', 'ASSINATURA', 'Nome, cargo e órgão', 7),
    ],
    estilo: { tratamento: 'Ilustríssimo(a) Senhor(a)', tom: 'formal', formatacao: 'administrativo', tempoVerbal: 'presente', pessoaGramatical: '1a' },
    areas: ['administrativo'],
    fonte: 'builtin',
    dataAtualizacao: hoje,
};

const requerimentoAdministrativo: DocumentSchema = {
    id: 'requerimento_administrativo',
    nome: 'Requerimento Administrativo',
    categoria: 'docs_administrativos',
    secoes: [
        secao('destinatario', 'DESTINATÁRIO', 'Autoridade competente', 1),
        secao('qualificacao', 'QUALIFICAÇÃO DO REQUERENTE', 'Nome, CPF, endereço', 2),
        secao('do_requerimento', 'DO REQUERIMENTO', 'O que se requer e com base em quê', 3),
        secao('fundamentacao', 'DA FUNDAMENTAÇÃO', 'Base legal do pedido', 4),
        secao('documentos', 'DOS DOCUMENTOS', 'Lista de documentos anexos', 5, false),
        secao('fecho', 'FECHO', 'Nestes termos, pede deferimento', 6),
        secao('assinatura', 'ASSINATURA', 'Local, data, nome', 7),
    ],
    estilo: { tratamento: 'Ilustríssimo(a) Senhor(a)', tom: 'formal', formatacao: 'administrativo', tempoVerbal: 'presente', pessoaGramatical: '1a' },
    areas: ['administrativo'],
    fonte: 'builtin',
    dataAtualizacao: hoje,
};

const recursoAdministrativo: DocumentSchema = {
    id: 'recurso_administrativo',
    nome: 'Recurso Administrativo',
    categoria: 'docs_administrativos',
    secoes: [
        secao('destinatario', 'DESTINATÁRIO', 'Autoridade hierarquicamente superior', 1),
        secao('qualificacao', 'QUALIFICAÇÃO DO RECORRENTE', 'Dados do recorrente', 2),
        secao('da_decisao', 'DA DECISÃO RECORRIDA', 'Processo administrativo e decisão impugnada', 3),
        secao('da_tempestividade', 'DA TEMPESTIVIDADE', 'Prazo legal cumprido', 4),
        secao('das_razoes', 'DAS RAZÕES DO RECURSO', 'Argumentação para reforma', 5),
        secao('dos_pedidos', 'DOS PEDIDOS', 'Reconsideração ou provimento do recurso', 6),
        secao('fecho', 'FECHO', 'Nestes termos, pede deferimento', 7),
    ],
    estilo: { tratamento: 'Ilustríssimo(a) Senhor(a)', tom: 'formal', formatacao: 'administrativo', tempoVerbal: 'presente', pessoaGramatical: '1a' },
    fundamentosComuns: ['Art. 56 Lei 9.784/99', 'Art. 59 Lei 9.784/99'],
    areas: ['administrativo'],
    fonte: 'builtin',
    dataAtualizacao: hoje,
};

// ═══════════════════════════════════════════════════════════════════════
// EXTRAJUDICIAIS
// ═══════════════════════════════════════════════════════════════════════

const notificacaoExtrajudicial: DocumentSchema = {
    id: 'notificacao_extrajudicial',
    nome: 'Notificação Extrajudicial',
    categoria: 'extrajudiciais',
    secoes: [
        secao('cabecalho', 'CABEÇALHO', 'NOTIFICAÇÃO EXTRAJUDICIAL', 1),
        secao('destinatario', 'DESTINATÁRIO', 'Notificado com dados completos', 2),
        secao('remetente', 'REMETENTE', 'Notificante com dados completos', 3),
        secao('dos_fatos', 'DOS FATOS', 'Situação que motiva a notificação', 4),
        secao('da_obrigacao', 'DA OBRIGAÇÃO', 'O que o notificado deve fazer e em qual prazo', 5),
        secao('consequencias', 'DAS CONSEQUÊNCIAS', 'Medidas judiciais cabíveis em caso de descumprimento', 6),
        secao('fecho', 'FECHO', 'Local, data, assinatura com firma reconhecida', 7),
    ],
    estilo: { tratamento: 'Prezado(a) Senhor(a)', tom: 'formal', formatacao: 'extrajudicial', tempoVerbal: 'presente', pessoaGramatical: '1a' },
    areas: ['civil', 'consumidor', 'imobiliário', 'trabalhista'],
    fonte: 'builtin',
    dataAtualizacao: hoje,
};

const acordoExtrajudicial: DocumentSchema = {
    id: 'acordo_extrajudicial',
    nome: 'Acordo Extrajudicial',
    categoria: 'extrajudiciais',
    secoes: [
        secao('cabecalho', 'CABEÇALHO', 'TERMO DE ACORDO EXTRAJUDICIAL', 1),
        secao('qualificacao', 'QUALIFICAÇÃO DAS PARTES', 'Todas as partes com dados completos', 2),
        secao('consideracoes', 'CONSIDERANDO', 'Contexto e motivação do acordo', 3),
        secao('clausulas', 'DAS CLÁUSULAS', 'Obrigações de cada parte em cláusulas numeradas', 4),
        secao('valor', 'DO VALOR E PAGAMENTO', 'Valor do acordo e forma de pagamento', 5, false),
        secao('multa', 'DA MULTA', 'Penalidade por descumprimento', 6),
        secao('quitacao', 'DA QUITAÇÃO', 'Abrangência da quitação (geral ou parcial)', 7),
        secao('foro', 'DO FORO', 'Foro para execução do acordo', 8),
        secao('assinaturas', 'ASSINATURAS', 'Partes, advogados e testemunhas', 9),
    ],
    estilo: { tratamento: 'PARTES', tom: 'formal', formatacao: 'extrajudicial', tempoVerbal: 'presente/futuro', pessoaGramatical: '3a' },
    fundamentosComuns: ['Art. 840 CC', 'Art. 855-B CLT (trabalhista)'],
    areas: ['civil', 'trabalhista'],
    fonte: 'builtin',
    dataAtualizacao: hoje,
};

const declaracao: DocumentSchema = {
    id: 'declaracao',
    nome: 'Declaração',
    categoria: 'extrajudiciais',
    secoes: [
        secao('cabecalho', 'CABEÇALHO', 'DECLARAÇÃO', 1),
        secao('corpo', 'CORPO', 'Eu, [nome], [qualificação], DECLARO para os devidos fins que...', 2),
        secao('fecho', 'FECHO', 'Declaro sob as penas da lei + local, data, assinatura', 3),
    ],
    estilo: { tratamento: '', tom: 'formal', formatacao: 'extrajudicial', tempoVerbal: 'presente', pessoaGramatical: '1a' },
    areas: ['civil', 'administrativo'],
    fonte: 'builtin',
    dataAtualizacao: hoje,
};

// ═══════════════════════════════════════════════════════════════════════
// PROCURAÇÕES
// ═══════════════════════════════════════════════════════════════════════

const procuracaoAdJudicia: DocumentSchema = {
    id: 'procuracao_ad_judicia',
    nome: 'Procuração Ad Judicia',
    categoria: 'procuracoes',
    secoes: [
        secao('cabecalho', 'CABEÇALHO', 'INSTRUMENTO PARTICULAR DE PROCURAÇÃO', 1),
        secao('outorgante', 'OUTORGANTE', 'Nome, CPF, RG, endereço completo', 2),
        secao('outorgado', 'OUTORGADO', 'Advogado, OAB, endereço profissional', 3),
        secao('poderes', 'PODERES', 'Poderes da cláusula ad judicia + poderes especiais', 4),
        secao('finalidade', 'FINALIDADE', 'Para que processo ou matéria', 5, false),
        secao('fecho', 'FECHO', 'Local, data e assinatura do outorgante', 6),
    ],
    estilo: { tratamento: '', tom: 'formal', formatacao: 'extrajudicial', tempoVerbal: 'presente', pessoaGramatical: '3a' },
    fundamentosComuns: ['Art. 105 CPC', 'Art. 5º Lei 8.906/94'],
    areas: ['civil', 'trabalhista', 'penal'],
    fonte: 'builtin',
    dataAtualizacao: hoje,
};

const procuracaoParticular: DocumentSchema = {
    id: 'procuracao_particular',
    nome: 'Procuração Particular',
    categoria: 'procuracoes',
    secoes: [
        secao('cabecalho', 'CABEÇALHO', 'PROCURAÇÃO PARTICULAR', 1),
        secao('outorgante', 'OUTORGANTE', 'Dados completos de quem outorga', 2),
        secao('outorgado', 'OUTORGADO', 'Dados completos de quem recebe poderes', 3),
        secao('poderes', 'PODERES', 'Poderes específicos concedidos', 4),
        secao('validade', 'VALIDADE', 'Prazo de validade da procuração', 5, false),
        secao('fecho', 'FECHO', 'Local, data, assinatura', 6),
    ],
    estilo: { tratamento: '', tom: 'formal', formatacao: 'extrajudicial', tempoVerbal: 'presente', pessoaGramatical: '3a' },
    fundamentosComuns: ['Art. 653 CC', 'Art. 654 CC'],
    areas: ['civil'],
    fonte: 'builtin',
    dataAtualizacao: hoje,
};

// ═══════════════════════════════════════════════════════════════════════
// PARECERES
// ═══════════════════════════════════════════════════════════════════════

const parecerJuridico: DocumentSchema = {
    id: 'parecer_juridico',
    nome: 'Parecer Jurídico',
    categoria: 'pareceres',
    secoes: [
        secao('cabecalho', 'CABEÇALHO', 'PARECER JURÍDICO nº XXX/AAAA', 1),
        secao('consulente', 'CONSULENTE', 'Quem solicitou o parecer', 2),
        secao('assunto', 'ASSUNTO', 'Matéria consultada', 3),
        secao('ementa', 'EMENTA', 'Resumo da conclusão em 3-5 linhas', 4),
        secao('relatorio', 'I — RELATÓRIO', 'Fatos narrados pelo consulente', 5),
        secao('fundamentacao', 'II — FUNDAMENTAÇÃO', 'Análise jurídica aprofundada com doutrina e jurisprudência', 6),
        secao('conclusao', 'III — CONCLUSÃO', 'Resposta objetiva à consulta', 7),
        secao('ressalvas', 'IV — RESSALVAS', 'Limitações do parecer, matéria não analisada', 8, false),
        secao('fecho', 'FECHO', 'Local, data, assinatura do parecerista', 9),
    ],
    estilo: { tratamento: '', tom: 'tecnico', formatacao: 'extrajudicial', tempoVerbal: 'presente', pessoaGramatical: '1a' },
    areas: ['civil', 'empresarial', 'administrativo', 'tributário'],
    fonte: 'builtin',
    dataAtualizacao: hoje,
};

// ═══════════════════════════════════════════════════════════════════════
// SOCIETÁRIOS
// ═══════════════════════════════════════════════════════════════════════

const ataAssembleia: DocumentSchema = {
    id: 'ata_assembleia',
    nome: 'Ata de Assembleia / Reunião de Sócios',
    categoria: 'societarios',
    secoes: [
        secao('cabecalho', 'CABEÇALHO', 'ATA DA [NÚMERO] ASSEMBLEIA [ORDINÁRIA/EXTRAORDINÁRIA]', 1),
        secao('preambulo', 'PREÂMBULO', 'Data, hora, local, quórum, presidente e secretário', 2),
        secao('ordem_do_dia', 'ORDEM DO DIA', 'Matérias a serem deliberadas', 3),
        secao('deliberacoes', 'DAS DELIBERAÇÕES', 'Cada matéria com discussão e votação', 4),
        secao('encerramento', 'ENCERRAMENTO', 'Hora de encerramento, leitura e aprovação', 5),
        secao('assinaturas', 'ASSINATURAS', 'Presidente, secretário e sócios presentes', 6),
    ],
    estilo: { tratamento: '', tom: 'formal', formatacao: 'contratual', tempoVerbal: 'pretérito', pessoaGramatical: '3a' },
    fundamentosComuns: ['Art. 1.072 CC', 'Art. 1.074 CC'],
    areas: ['empresarial', 'societário'],
    fonte: 'builtin',
    dataAtualizacao: hoje,
};

const alteracaoContratual: DocumentSchema = {
    id: 'alteracao_contratual',
    nome: 'Alteração Contratual',
    categoria: 'societarios',
    secoes: [
        secao('cabecalho', 'CABEÇALHO', '[NÚMERO] ALTERAÇÃO DO CONTRATO SOCIAL', 1),
        secao('qualificacao', 'QUALIFICAÇÃO DOS SÓCIOS', 'Todos os sócios atuais', 2),
        secao('clausulas_alteradas', 'DAS CLÁUSULAS ALTERADAS', 'Cada cláusula com redação anterior e nova', 3),
        secao('consolidacao', 'DA CONSOLIDAÇÃO', 'Texto consolidado do contrato social', 4, false),
        secao('assinaturas', 'ASSINATURAS', 'Sócios e testemunhas', 5),
    ],
    estilo: { tratamento: 'SÓCIOS', tom: 'formal', formatacao: 'contratual', tempoVerbal: 'presente', pessoaGramatical: '3a' },
    fundamentosComuns: ['Art. 997 CC', 'Art. 999 CC'],
    areas: ['empresarial', 'societário'],
    fonte: 'builtin',
    dataAtualizacao: hoje,
};

const distratoSocial: DocumentSchema = {
    id: 'distrato_social',
    nome: 'Distrato Social',
    categoria: 'societarios',
    secoes: [
        secao('cabecalho', 'CABEÇALHO', 'DISTRATO SOCIAL', 1),
        secao('qualificacao', 'QUALIFICAÇÃO DOS SÓCIOS', 'Sócios remanescentes', 2),
        secao('dissolucao', 'DA DISSOLUÇÃO', 'Motivo e deliberação unânime', 3),
        secao('liquidacao', 'DA LIQUIDAÇÃO', 'Patrimônio, dívidas, partilha', 4),
        secao('responsabilidade', 'DA RESPONSABILIDADE', 'Responsabilidade dos sócios pós-dissolução', 5),
        secao('assinaturas', 'ASSINATURAS', 'Sócios e testemunhas', 6),
    ],
    estilo: { tratamento: 'SÓCIOS', tom: 'formal', formatacao: 'contratual', tempoVerbal: 'presente/pretérito', pessoaGramatical: '3a' },
    fundamentosComuns: ['Art. 1.033 CC', 'Art. 1.102 CC'],
    areas: ['empresarial', 'societário'],
    fonte: 'builtin',
    dataAtualizacao: hoje,
};

// ═══════════════════════════════════════════════════════════════════════
// TRABALHISTA ESPECIAL
// ═══════════════════════════════════════════════════════════════════════

const reclamacaoTrabalhista: DocumentSchema = {
    id: 'reclamacao_trabalhista',
    nome: 'Reclamação Trabalhista',
    categoria: 'trabalhista_especial',
    secoes: [
        secao('enderecamento', 'ENDEREÇAMENTO', 'Vara do Trabalho competente', 1),
        secao('qualificacao', 'QUALIFICAÇÃO', 'Reclamante e Reclamada', 2),
        secao('do_contrato', 'DO CONTRATO DE TRABALHO', 'Admissão, função, salário, jornada, dispensa', 3),
        secao('das_verbas', 'DAS VERBAS RESCISÓRIAS', 'Verbas devidas e não pagas', 4, false),
        secao('das_horas_extras', 'DAS HORAS EXTRAS', 'Jornada real vs contratual', 5, false),
        secao('dos_danos', 'DOS DANOS MORAIS/MATERIAIS', 'Assédio, acidente, desvio de função', 6, false),
        secao('do_direito', 'DO DIREITO', 'Fundamentos CLT + CF + súmulas TST', 7),
        secao('dos_pedidos', 'DOS PEDIDOS', 'Pedidos numerados com valores estimados', 8),
        secao('valor_causa', 'VALOR DA CAUSA', 'Soma dos pedidos líquidos', 9),
        secao('fecho', 'FECHO', 'Nestes termos, pede deferimento', 10),
    ],
    estilo: { tratamento: 'Excelentíssimo(a) Senhor(a) Doutor(a) Juiz(a) do Trabalho', tom: 'formal', formatacao: 'judicial', tempoVerbal: 'presente/pretérito', pessoaGramatical: '3a' },
    fundamentosComuns: ['Art. 840 CLT', 'Art. 7º CF'],
    areas: ['trabalhista'],
    fonte: 'builtin',
    dataAtualizacao: hoje,
};

const acordoTrabalhistaExtrajudicial: DocumentSchema = {
    id: 'acordo_trabalhista_extrajudicial',
    nome: 'Acordo Extrajudicial Trabalhista (Homologação)',
    categoria: 'trabalhista_especial',
    secoes: [
        secao('enderecamento', 'ENDEREÇAMENTO', 'Vara do Trabalho para homologação', 1),
        secao('qualificacao', 'QUALIFICAÇÃO', 'Requerentes (empregado e empregador)', 2),
        secao('do_contrato', 'DO CONTRATO DE TRABALHO', 'Período, função, salário', 3),
        secao('do_acordo', 'DO ACORDO', 'Cláusulas do acordo com valores', 4),
        secao('da_quitacao', 'DA QUITAÇÃO', 'Extensão da quitação (parcelas e período)', 5),
        secao('dos_pedidos', 'DOS PEDIDOS', 'Homologação do acordo + expedição de alvará', 6),
        secao('fecho', 'FECHO', 'Nestes termos, pede deferimento', 7),
    ],
    estilo: { tratamento: 'Excelentíssimo(a) Senhor(a) Doutor(a) Juiz(a) do Trabalho', tom: 'formal', formatacao: 'judicial', tempoVerbal: 'presente', pessoaGramatical: '3a' },
    fundamentosComuns: ['Art. 855-B CLT', 'Art. 855-C CLT', 'Art. 855-D CLT'],
    areas: ['trabalhista'],
    fonte: 'builtin',
    dataAtualizacao: hoje,
};

// ═══════════════════════════════════════════════════════════════════════
// RECURSOS (novos, além dos legacy)
// ═══════════════════════════════════════════════════════════════════════

const recursoEspecial: DocumentSchema = {
    id: 'recurso_especial',
    nome: 'Recurso Especial',
    categoria: 'recursos',
    secoes: [
        secao('interposicao', 'PETIÇÃO DE INTERPOSIÇÃO', 'Endereçamento ao Presidente/Vice do Tribunal de origem', 1),
        secao('tempestividade', 'DA TEMPESTIVIDADE', 'Prazo de 15 dias', 2),
        secao('cabimento', 'DO CABIMENTO', 'Art. 105, III CF — alíneas a, b ou c', 3),
        secao('prequestionamento', 'DO PREQUESTIONAMENTO', 'Demonstração de que a matéria foi ventilada', 4),
        secao('razoes', 'DAS RAZÕES', 'Violação de lei federal ou divergência jurisprudencial', 5),
        secao('dos_pedidos', 'DOS PEDIDOS', 'Conhecimento e provimento', 6),
        secao('fecho', 'FECHO', 'Nestes termos, pede deferimento', 7),
    ],
    estilo: { tratamento: 'Excelentíssimo(a) Senhor(a) Ministro(a)', tom: 'formal', formatacao: 'judicial', tempoVerbal: 'presente', pessoaGramatical: '3a' },
    fundamentosComuns: ['Art. 105, III CF', 'Art. 1.029 CPC'],
    areas: ['civil', 'penal'],
    fonte: 'builtin',
    dataAtualizacao: hoje,
};

const recursoExtraordinario: DocumentSchema = {
    id: 'recurso_extraordinario',
    nome: 'Recurso Extraordinário',
    categoria: 'recursos',
    secoes: [
        secao('interposicao', 'PETIÇÃO DE INTERPOSIÇÃO', 'Endereçamento ao Presidente/Vice do Tribunal de origem', 1),
        secao('tempestividade', 'DA TEMPESTIVIDADE', 'Prazo de 15 dias', 2),
        secao('repercussao_geral', 'DA REPERCUSSÃO GERAL', 'Demonstração da relevância constitucional', 3),
        secao('prequestionamento', 'DO PREQUESTIONAMENTO', 'Matéria constitucional ventilada', 4),
        secao('razoes', 'DAS RAZÕES', 'Violação de norma constitucional', 5),
        secao('dos_pedidos', 'DOS PEDIDOS', 'Conhecimento e provimento', 6),
        secao('fecho', 'FECHO', 'Nestes termos, pede deferimento', 7),
    ],
    estilo: { tratamento: 'Excelentíssimo(a) Senhor(a) Ministro(a)', tom: 'formal', formatacao: 'judicial', tempoVerbal: 'presente', pessoaGramatical: '3a' },
    fundamentosComuns: ['Art. 102, III CF', 'Art. 1.029 CPC', 'Art. 1.035 CPC'],
    areas: ['constitucional', 'civil', 'penal'],
    fonte: 'builtin',
    dataAtualizacao: hoje,
};

const agravoInterno: DocumentSchema = {
    id: 'agravo_interno',
    nome: 'Agravo Interno / Regimental',
    categoria: 'recursos',
    secoes: [
        secao('enderecamento', 'ENDEREÇAMENTO', 'Órgão colegiado do tribunal', 1),
        secao('da_decisao', 'DA DECISÃO MONOCRÁTICA AGRAVADA', 'Decisão do relator impugnada', 2),
        secao('da_tempestividade', 'DA TEMPESTIVIDADE', 'Prazo de 15 dias', 3),
        secao('razoes', 'DAS RAZÕES', 'Argumentação para reforma pela turma/câmara', 4),
        secao('dos_pedidos', 'DOS PEDIDOS', 'Provimento pelo colegiado', 5),
        secao('fecho', 'FECHO', 'Nestes termos, pede deferimento', 6),
    ],
    estilo: { tratamento: 'Egrégio Tribunal / Colenda Turma', tom: 'formal', formatacao: 'judicial', tempoVerbal: 'presente', pessoaGramatical: '3a' },
    fundamentosComuns: ['Art. 1.021 CPC'],
    areas: ['civil', 'trabalhista', 'penal'],
    fonte: 'builtin',
    dataAtualizacao: hoje,
};

// ═══════════════════════════════════════════════════════════════════════
// OUTROS
// ═══════════════════════════════════════════════════════════════════════

const peticaoSimples: DocumentSchema = {
    id: 'peticao_simples',
    nome: 'Petição Simples / Intercorrente',
    categoria: 'outros',
    secoes: [
        secao('enderecamento', 'ENDEREÇAMENTO', 'Juízo do processo', 1),
        secao('referencia', 'REFERÊNCIA', 'Número do processo', 2),
        secao('corpo', 'CORPO', 'Requerimento objetivo e direto', 3),
        secao('fecho', 'FECHO', 'Nestes termos, pede deferimento', 4),
    ],
    estilo: { tratamento: 'Excelentíssimo(a) Senhor(a) Doutor(a) Juiz(a)', tom: 'formal', formatacao: 'judicial', tempoVerbal: 'presente', pessoaGramatical: '3a' },
    areas: ['civil', 'trabalhista', 'penal'],
    fonte: 'builtin',
    dataAtualizacao: hoje,
};

const denunciaMinisterioPublico: DocumentSchema = {
    id: 'denuncia_mp',
    nome: 'Representação ao Ministério Público',
    categoria: 'outros',
    secoes: [
        secao('destinatario', 'DESTINATÁRIO', 'Promotor(a) de Justiça competente', 1),
        secao('qualificacao', 'QUALIFICAÇÃO DO REPRESENTANTE', 'Dados de quem representa', 2),
        secao('dos_fatos', 'DOS FATOS', 'Narrativa dos fatos criminosos ou irregulares', 3),
        secao('do_direito', 'DO DIREITO', 'Tipificação penal ou fundamento', 4),
        secao('das_provas', 'DAS PROVAS', 'Documentos e evidências em anexo', 5),
        secao('dos_pedidos', 'DOS PEDIDOS', 'Instauração de inquérito/procedimento', 6),
        secao('fecho', 'FECHO', 'Nestes termos, pede deferimento', 7),
    ],
    estilo: { tratamento: 'Excelentíssimo(a) Senhor(a) Promotor(a) de Justiça', tom: 'formal', formatacao: 'judicial', tempoVerbal: 'presente/pretérito', pessoaGramatical: '1a' },
    areas: ['penal', 'consumidor', 'ambiental'],
    fonte: 'builtin',
    dataAtualizacao: hoje,
};

const reclamacaoProcon: DocumentSchema = {
    id: 'reclamacao_procon',
    nome: 'Reclamação ao PROCON',
    categoria: 'docs_administrativos',
    secoes: [
        secao('destinatario', 'DESTINATÁRIO', 'PROCON competente', 1),
        secao('qualificacao', 'QUALIFICAÇÃO DO CONSUMIDOR', 'Dados pessoais', 2),
        secao('fornecedor', 'DO FORNECEDOR', 'Dados da empresa reclamada', 3),
        secao('dos_fatos', 'DOS FATOS', 'Descrição do problema de consumo', 4),
        secao('da_tentativa', 'DA TENTATIVA DE RESOLUÇÃO', 'SAC, Ouvidoria, protocolo', 5, false),
        secao('do_pedido', 'DO PEDIDO', 'O que se pretende (troca, reembolso, reparo)', 6),
        secao('documentos', 'DOCUMENTOS ANEXOS', 'Nota fiscal, prints, protocolos', 7),
        secao('fecho', 'FECHO', 'Local, data, assinatura', 8),
    ],
    estilo: { tratamento: '', tom: 'semiformal', formatacao: 'administrativo', tempoVerbal: 'presente/pretérito', pessoaGramatical: '1a' },
    fundamentosComuns: ['Art. 18 CDC', 'Art. 35 CDC'],
    areas: ['consumidor'],
    fonte: 'builtin',
    dataAtualizacao: hoje,
};

// ═══════════════════════════════════════════════════════════════════════
// EXPORT
// ═══════════════════════════════════════════════════════════════════════

export const SEED_SCHEMAS: DocumentSchema[] = [
    // Peças processuais (legacy + novas)
    peticaoInicial,
    contestacao,
    habeasCorpus,
    reconvencao,
    replica,
    mandadoSeguranca,
    reclamacaoTrabalhista,

    // Recursos
    apelacao,
    recursoOrdinario,
    embargosDeclaracao,
    agravoInstrumento,
    recursoEspecial,
    recursoExtraordinario,
    agravoInterno,

    // Execução
    cumprimentoSentenca,
    execucaoTitulo,
    embargosExecucao,

    // Cautelares
    tutelaAntecipada,
    tutelaCautelar,

    // Contratos
    contratoPrestacaoServicos,
    contratoHonorarios,
    contratoLocacao,
    contratoCompraVenda,

    // Societários
    contratoSocial,
    ataAssembleia,
    alteracaoContratual,
    distratoSocial,

    // Docs administrativos
    oficio,
    requerimentoAdministrativo,
    recursoAdministrativo,
    reclamacaoProcon,

    // Extrajudiciais
    notificacaoExtrajudicial,
    acordoExtrajudicial,
    declaracao,

    // Procurações
    procuracaoAdJudicia,
    procuracaoParticular,

    // Pareceres
    parecerJuridico,

    // Trabalhista especial
    acordoTrabalhistaExtrajudicial,

    // Outros
    peticaoSimples,
    denunciaMinisterioPublico,
];
