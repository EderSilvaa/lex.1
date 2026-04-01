/**
 * Legal Templates — Modelos de Petições e Formatação Jurídica
 *
 * Base de conhecimento embutida na LEX com:
 * 1. Estrutura e formatação padrão de cada tipo de petição
 * 2. Exemplos de trechos bem escritos
 * 3. Vocabulário jurídico e expressões formais
 * 4. Regras de formatação de documentos jurídicos (ABNT/Praxis forense)
 *
 * Essa base é injetada no prompt do worker para que o LLM
 * saiba EXATAMENTE como formatar uma petição real.
 */

// ─── Regras Gerais de Formatação ────────────────────────────────────

export const FORMATTING_RULES = `## FORMATAÇÃO DE DOCUMENTOS JURÍDICOS

### Regras Gerais (Praxis Forense Brasileira)
- Fonte: Times New Roman ou Arial, tamanho 12pt
- Espaçamento entre linhas: 1,5
- Margens: 3cm superior/esquerda, 2cm inferior/direita
- Parágrafos: texto justificado, recuo na primeira linha
- Páginas numeradas no canto superior direito (exceto primeira)

### Estrutura HTML que você deve usar:
- <h1> APENAS para o título da petição (centralizado, CAIXA ALTA, negrito)
- <h2> para seções principais (CAIXA ALTA, sublinhado, ex: "DOS FATOS", "DO DIREITO")
- <h3> para subseções (ex: "Da nulidade do ato", "Do dano moral")
- <p> para parágrafos (texto justificado)
- <strong> para destaques dentro do texto (nome de leis, artigos, termos-chave)
- <ol> para pedidos numerados (seção DOS PEDIDOS)
- <blockquote> para citações de jurisprudência e doutrina (com recuo e itálico)
- <br> para separação entre blocos

### Regras de Estilo Jurídico:
- NUNCA use bullet points (•) em petições — use parágrafos corridos ou listas numeradas
- NUNCA use markdown, emojis, ou formatação informal
- Parágrafos devem ter no MÍNIMO 3 linhas — evite parágrafos curtos demais
- Citações de artigos: "Art. 5º, inciso XXXV, da Constituição Federal"
- Citações de súmulas: "Súmula nº 331 do C. TST"
- Citações de jurisprudência: em bloco separado, com dados completos (tribunal, turma, relator, data)
- Use "Excelência" ou "Douto Juízo" ao se dirigir ao magistrado
- Use "Requerente" ou "Reclamante" (não "Autor") em petições iniciais trabalhistas
- Use "Requerido" ou "Reclamada" (não "Réu") em petições iniciais trabalhistas
- Valor por extenso: "R$ 50.000,00 (cinquenta mil reais)"
- Datas por extenso: "São Paulo, 25 de março de 2026"
- Fecho: "Nestes termos,\\npede deferimento.\\n\\n[Local], [data].\\n\\n[Nome do Advogado]\\n[OAB nº]"`;

// ─── Templates por Tipo de Petição ──────────────────────────────────

export interface PetitionTemplate {
    tipo: string;
    nome: string;
    estrutura: string;      // HTML modelo com estrutura e placeholders
    dicasEstilo: string;     // Dicas específicas desse tipo
    exemploParagrafo: string; // Exemplo de parágrafo bem escrito
}

const TEMPLATES: Record<string, PetitionTemplate> = {

    peticao_inicial: {
        tipo: 'peticao_inicial',
        nome: 'Petição Inicial',
        estrutura: `
<h1>EXCELENTÍSSIMO(A) SENHOR(A) DOUTOR(A) JUIZ(A) DE DIREITO DA [NÚMERO] VARA [TIPO] DA COMARCA DE [CIDADE] — ESTADO DE [UF]</h1>

<p><br></p>

<p><strong>[NOME DO AUTOR]</strong>, [nacionalidade], [estado civil], [profissão], portador(a) do RG nº [RG] e inscrito(a) no CPF sob nº [CPF], residente e domiciliado(a) na [endereço completo], por seu advogado que esta subscreve, conforme instrumento de procuração em anexo (doc. [nº]), vem, respeitosamente, à presença de Vossa Excelência, propor a presente</p>

<h2>AÇÃO [TIPO DA AÇÃO]</h2>

<p>com pedido de [tutela antecipada/liminar, se aplicável], em face de <strong>[NOME DO RÉU]</strong>, [pessoa jurídica de direito privado], inscrita no CNPJ sob nº [CNPJ], com sede na [endereço completo], pelos fatos e fundamentos a seguir expostos.</p>

<h2>I — DOS FATOS</h2>

<p>[Narrativa factual detalhada, em ordem cronológica, com parágrafos substanciais]</p>

<h2>II — DO DIREITO</h2>

<h3>a) [Primeiro fundamento jurídico]</h3>
<p>[Argumentação com citação de artigos de lei]</p>

<blockquote>
<p>"[Citação de jurisprudência com dados completos]" (Tribunal, Turma, Relator, Data)</p>
</blockquote>

<h3>b) [Segundo fundamento jurídico]</h3>
<p>[Argumentação com citação de artigos de lei e doutrina]</p>

<h2>III — DOS PEDIDOS</h2>

<p>Ante o exposto, requer a Vossa Excelência:</p>

<ol>
<li>A citação do réu para, querendo, contestar a presente ação no prazo legal;</li>
<li>[Pedido principal, específico e fundamentado];</li>
<li>[Pedido subsidiário, se aplicável];</li>
<li>A condenação do réu ao pagamento das custas processuais e honorários advocatícios;</li>
<li>A produção de todas as provas admitidas em direito, especialmente [provas específicas].</li>
</ol>

<p>Dá-se à causa o valor de <strong>R$ [VALOR] ([valor por extenso])</strong>.</p>

<p>Nestes termos,<br>pede deferimento.</p>

<p>[Cidade], [data por extenso].</p>

<p><br></p>
<p><strong>[Nome do Advogado]</strong><br>OAB/[UF] nº [número]</p>`,

        dicasEstilo: `- O endereçamento deve ser completo e específico ao juízo competente
- A qualificação das partes deve ser detalhada (nome completo, documentos, endereço)
- DOS FATOS: narrativa cronológica, objetiva, sem opinião — apenas fatos
- DO DIREITO: cada fundamento em subseção separada com artigos e jurisprudência
- DOS PEDIDOS: numerados, específicos, e juridicamente precisos
- Valor da causa obrigatório por extenso`,

        exemploParagrafo: `O Reclamante foi admitido pela Reclamada em 15 de março de 2020, para exercer a função de Analista de Sistemas, percebendo remuneração mensal de R$ 8.500,00 (oito mil e quinhentos reais), conforme demonstrado pela CTPS em anexo (doc. 03). Durante todo o período contratual, que perdurou até a dispensa imotivada em 12 de janeiro de 2026, o Reclamante esteve sujeito a jornada de trabalho extenuante, frequentemente ultrapassando 10 (dez) horas diárias, sem o correspondente pagamento das horas extraordinárias devidas, em flagrante violação ao disposto no art. 59, caput, da Consolidação das Leis do Trabalho.`,
    },

    recurso_ordinario: {
        tipo: 'recurso_ordinario',
        nome: 'Recurso Ordinário',
        estrutura: `
<h1>EXCELENTÍSSIMO(A) SENHOR(A) DOUTOR(A) JUIZ(A) DO TRABALHO DA [NÚMERO] VARA DO TRABALHO DE [CIDADE/UF]</h1>

<p><br></p>

<p><strong>Processo nº [NÚMERO CNJ]</strong></p>
<p><strong>Recorrente:</strong> [NOME]</p>
<p><strong>Recorrido:</strong> [NOME]</p>

<p><br></p>

<p><strong>[NOME DO RECORRENTE]</strong>, já qualificado(a) nos autos da <strong>Reclamação Trabalhista</strong> que move em face de <strong>[NOME DO RECORRIDO]</strong>, igualmente qualificado(a), vem, por seu advogado, inconformado(a) com a r. sentença de fls. [XX/XX], respeitosamente interpor o presente</p>

<h2>RECURSO ORDINÁRIO</h2>

<p>com fulcro no art. 895, inciso I, da CLT, e art. 1.010 e seguintes do CPC, requerendo seu recebimento, processamento e, ao final, provimento pelo Egrégio Tribunal Regional do Trabalho da [Região], pelas razões a seguir aduzidas.</p>

<p>Requer, desde já, a remessa dos autos ao E. TRT da [Região] para apreciação do presente recurso.</p>

<p>[Cidade], [data por extenso].</p>

<p><strong>[Nome do Advogado]</strong><br>OAB/[UF] nº [número]</p>

<p style="page-break-before: always;"></p>

<h1>RAZÕES DE RECURSO ORDINÁRIO</h1>

<p><strong>Processo nº [NÚMERO CNJ]</strong></p>
<p><strong>Recorrente:</strong> [NOME]</p>
<p><strong>Recorrido:</strong> [NOME]</p>

<p><strong>Egrégio Tribunal,</strong></p>
<p><strong>Colenda Turma,</strong></p>
<p><strong>Eminentes Desembargadores,</strong></p>

<h2>I — DA TEMPESTIVIDADE</h2>
<p>O presente recurso é tempestivo, vez que a intimação da r. sentença ocorreu em [data], iniciando-se o prazo recursal em [data], com término em [data], sendo este recurso interposto dentro do octídio legal previsto no art. 895 da CLT.</p>

<h2>II — BREVE SÍNTESE DA DEMANDA</h2>
<p>[Resumo do que foi pedido e o que a sentença decidiu]</p>

<h2>III — DAS RAZÕES DE REFORMA</h2>

<h3>a) [Primeiro ponto de reforma]</h3>
<p>[Argumentação demonstrando o erro da sentença, com transcrição do trecho impugnado]</p>

<blockquote>
<p>"[Trecho da sentença que se impugna]"</p>
</blockquote>

<p>Data vênia, o r. Juízo de origem incorreu em equívoco, pois [argumentação jurídica com artigos e jurisprudência].</p>

<h2>IV — DOS PEDIDOS</h2>

<p>Ante o exposto, requer a Vossa Excelência:</p>

<ol>
<li>O recebimento e regular processamento do presente Recurso Ordinário;</li>
<li>O provimento do recurso para reformar a r. sentença no tocante a [pontos específicos];</li>
<li>[Pedidos específicos de reforma];</li>
<li>A inversão dos ônus sucumbenciais.</li>
</ol>

<p>Nestes termos,<br>pede deferimento.</p>

<p>[Cidade], [data por extenso].</p>

<p><strong>[Nome do Advogado]</strong><br>OAB/[UF] nº [número]</p>`,

        dicasEstilo: `- O recurso tem DUAS peças: petição de interposição + razões recursais
- Tempestividade é obrigatória no início das razões
- Deve impugnar ESPECIFICAMENTE os pontos da sentença (transcrever trechos)
- Usar "data vênia", "s.m.j.", "com o devido respeito" ao discordar do juiz
- Fundamentar com CLT + CPC + jurisprudência do TRT da região`,

        exemploParagrafo: `Com a devida vênia ao entendimento esposado pelo d. Juízo de origem, a r. sentença merece reforma quanto ao indeferimento do pedido de horas extras. Conforme restou demonstrado nos autos, os cartões de ponto juntados pela Reclamada (fls. 85/120) apresentam horários invariáveis — entrada às 08h00 e saída às 17h00 em todos os dias —, o que constitui prova britânica, nos termos da Súmula nº 338, inciso III, do C. TST, invertendo-se o ônus da prova quanto à jornada efetivamente cumprida.`,
    },

    contestacao: {
        tipo: 'contestacao',
        nome: 'Contestação',
        estrutura: `
<h1>EXCELENTÍSSIMO(A) SENHOR(A) DOUTOR(A) JUIZ(A) DE DIREITO DA [NÚMERO] VARA [TIPO] DA COMARCA DE [CIDADE/UF]</h1>

<p><br></p>

<p><strong>Processo nº [NÚMERO CNJ]</strong></p>

<p><br></p>

<p><strong>[NOME DO RÉU]</strong>, já qualificado(a) nos autos da ação [tipo] que lhe move <strong>[NOME DO AUTOR]</strong>, por seu advogado infra-assinado, vem, respeitosamente, à presença de Vossa Excelência, no prazo legal, apresentar</p>

<h2>CONTESTAÇÃO</h2>

<p>com fundamento no art. 335 e seguintes do Código de Processo Civil, pelas razões de fato e de direito a seguir expostas.</p>

<h2>I — PRELIMINARMENTE</h2>

<h3>a) [Preliminar, se houver — ex: inépcia, ilegitimidade, prescrição]</h3>
<p>[Argumentação da preliminar]</p>

<h2>II — DOS FATOS</h2>
<p>[Versão dos fatos sob a ótica do réu]</p>

<h2>III — DO DIREITO</h2>

<h3>a) Da improcedência do pedido de [X]</h3>
<p>[Argumentação rebatendo cada pedido do autor]</p>

<h2>IV — DOS PEDIDOS</h2>

<p>Ante o exposto, requer:</p>

<ol>
<li>O acolhimento da(s) preliminar(es) arguida(s), com a extinção do feito sem resolução do mérito;</li>
<li>No mérito, a total improcedência dos pedidos formulados na inicial;</li>
<li>A condenação do autor ao pagamento das custas processuais e honorários advocatícios.</li>
</ol>

<p>Protesta provar o alegado por todos os meios de prova admitidos em direito.</p>

<p>Nestes termos,<br>pede deferimento.</p>

<p>[Cidade], [data por extenso].</p>

<p><strong>[Nome do Advogado]</strong><br>OAB/[UF] nº [número]</p>`,

        dicasEstilo: `- Preliminares ANTES do mérito (inépcia, ilegitimidade, prescrição)
- No mérito, rebater CADA pedido do autor individualmente
- Tom mais defensivo e técnico — demonstrar inconsistências da inicial
- Ônus da prova: invocar art. 373 CPC quando favorável`,

        exemploParagrafo: `Alega o Autor que teria sido dispensado sem justa causa, fazendo jus às verbas rescisórias correlatas. Contudo, tal assertiva não corresponde à realidade dos fatos. Conforme farta documentação acostada aos autos (docs. 05 a 12), o Autor foi dispensado por justa causa, nos termos do art. 482, alínea "b", da CLT, em razão de incontinência de conduta devidamente apurada em procedimento interno, no qual lhe foi assegurado o pleno exercício do contraditório e da ampla defesa, consoante ata de audiência disciplinar (doc. 08).`,
    },

    apelacao: {
        tipo: 'apelacao',
        nome: 'Apelação',
        estrutura: `
<h1>EXCELENTÍSSIMO(A) SENHOR(A) DOUTOR(A) JUIZ(A) DE DIREITO DA [NÚMERO] VARA [TIPO] DA COMARCA DE [CIDADE/UF]</h1>

<p><strong>Processo nº [NÚMERO CNJ]</strong></p>

<p><strong>[NOME DO APELANTE]</strong>, nos autos da ação [tipo] que move [ou que lhe move] <strong>[NOME DO APELADO]</strong>, inconformado(a) com a r. sentença prolatada, vem interpor</p>

<h2>APELAÇÃO</h2>

<p>com fundamento no art. 1.009 e seguintes do Código de Processo Civil, requerendo o recebimento do presente recurso em seus efeitos legais e a remessa dos autos ao Egrégio Tribunal de Justiça do Estado de [UF], conforme razões em anexo.</p>

<p>[Cidade], [data].</p>
<p><strong>[Advogado]</strong> — OAB/[UF] nº [número]</p>

<p style="page-break-before: always;"></p>

<h1>RAZÕES DE APELAÇÃO</h1>

<h2>I — DOS FATOS E DA SENTENÇA RECORRIDA</h2>
<p>[Síntese dos fatos e do dispositivo da sentença]</p>

<h2>II — DO CABIMENTO E DA TEMPESTIVIDADE</h2>
<p>[Demonstrar tempestividade e preparo]</p>

<h2>III — DAS RAZÕES PARA REFORMA</h2>

<h3>a) [Erro in judicando ou in procedendo]</h3>
<p>[Argumentação]</p>

<h2>IV — DOS PEDIDOS</h2>
<ol>
<li>O conhecimento e provimento da presente apelação;</li>
<li>A reforma da sentença para [pedido específico];</li>
<li>A inversão dos ônus sucumbenciais.</li>
</ol>

<p>Nestes termos, pede deferimento.</p>
<p>[Cidade], [data]. [Advogado] — OAB nº [número]</p>`,

        dicasEstilo: `- Estrutura em duas peças: interposição + razões
- Devolutividade: só será analisado o que for impugnado
- Transcrever trechos da sentença antes de rebatê-los
- Fundamentar com CPC art. 1.009+, artigos de mérito, jurisprudência do TJ`,

        exemploParagrafo: `A r. sentença, ao julgar improcedente o pedido de danos morais, desconsiderou por completo a prova testemunhal produzida em audiência, que demonstrou de forma inequívoca a conduta abusiva da ré ao expor o apelante a situação vexatória perante clientes e colegas de trabalho. O depoimento da testemunha Sr. Carlos Alberto (ata de fl. 156) foi categórico ao afirmar que "o gerente gritava com o reclamante na frente de todos, chamando-o de incompetente", situação que se repetiu por meses. Tal conduta configura inequívoco assédio moral, nos termos dos arts. 186 e 927 do Código Civil.`,
    },

    embargos_declaracao: {
        tipo: 'embargos_declaracao',
        nome: 'Embargos de Declaração',
        estrutura: `
<h1>EXCELENTÍSSIMO(A) SENHOR(A) DOUTOR(A) JUIZ(A) [COMPETÊNCIA] DA [VARA/TURMA]</h1>

<p><strong>Processo nº [NÚMERO CNJ]</strong></p>

<p><strong>[NOME DO EMBARGANTE]</strong>, nos autos supra, vem, tempestivamente, opor</p>

<h2>EMBARGOS DE DECLARAÇÃO</h2>

<p>com fundamento no art. 1.022 do CPC [ou art. 897-A da CLT], em face da r. [sentença/acórdão] que contém [omissão/contradição/obscuridade], conforme a seguir demonstrado.</p>

<h2>I — DA TEMPESTIVIDADE</h2>
<p>A intimação ocorreu em [data]. O prazo de 5 (cinco) dias encerra-se em [data]. Tempestivo.</p>

<h2>II — DA [OMISSÃO/CONTRADIÇÃO/OBSCURIDADE]</h2>
<p>[Apontar especificamente o vício da decisão]</p>

<h2>III — DO PREQUESTIONAMENTO</h2>
<p>Para fins de prequestionamento, requer-se a manifestação expressa sobre os arts. [artigos].</p>

<h2>IV — DO PEDIDO</h2>
<p>Requer o conhecimento e provimento dos presentes embargos para [sanar a omissão/contradição/obscuridade], conferindo-se efeito [modificativo/integrativo] à decisão embargada.</p>

<p>Nestes termos, pede deferimento.</p>
<p>[Cidade], [data]. [Advogado] — OAB nº [número]</p>`,

        dicasEstilo: `- Embargos são OBJETIVOS — apontar o vício com precisão cirúrgica
- Fundamentar em omissão (art. 1.022, II), contradição (I) ou obscuridade (I)
- Prequestionamento: listar artigos que precisam ser analisados para recurso futuro
- NÃO é recurso de mérito — não rediscutir a matéria, apenas apontar o vício
- Prazo: 5 dias (CPC e CLT)`,

        exemploParagrafo: `A r. sentença, ao analisar o pedido de adicional de insalubridade, limitou-se a consignar que "não restou comprovada a exposição a agentes insalubres". Contudo, o laudo pericial de fls. 200/215, elaborado pelo perito judicial nomeado pelo próprio Juízo, concluiu expressamente que "o reclamante esteve exposto a ruído contínuo acima de 85 dB(A), sem fornecimento de EPI adequado, durante todo o contrato" (fl. 212). A r. sentença é, portanto, OMISSA quanto à análise do laudo pericial, em violação ao art. 479 do CPC.`,
    },

    agravo_instrumento: {
        tipo: 'agravo_instrumento',
        nome: 'Agravo de Instrumento',
        estrutura: `
<h1>EXCELENTÍSSIMO(A) SENHOR(A) DOUTOR(A) DESEMBARGADOR(A) PRESIDENTE DO EGRÉGIO TRIBUNAL [COMPETENTE]</h1>

<p><strong>Processo de origem nº [NÚMERO CNJ]</strong></p>

<p><strong>[NOME DO AGRAVANTE]</strong>, nos autos em epígrafe, inconformado(a) com a r. decisão interlocutória de fls. [XX], vem interpor</p>

<h2>AGRAVO DE INSTRUMENTO</h2>

<p>com fundamento no art. 1.015 e seguintes do CPC, requerendo a formação do instrumento com as peças obrigatórias e facultativas indicadas.</p>

<h2>I — DA DECISÃO AGRAVADA</h2>
<p>[Transcrição ou resumo da decisão]</p>

<h2>II — DO CABIMENTO</h2>
<p>[Enquadramento no art. 1.015 CPC]</p>

<h2>III — DO PEDIDO DE EFEITO SUSPENSIVO / TUTELA RECURSAL</h2>
<p>[Se aplicável — demonstrar fumus boni juris e periculum in mora]</p>

<h2>IV — DAS RAZÕES</h2>
<p>[Argumentação para reforma da decisão]</p>

<h2>V — DOS PEDIDOS</h2>
<ol>
<li>A concessão de efeito suspensivo [se requerido];</li>
<li>O provimento do agravo para reformar a decisão agravada;</li>
</ol>

<p>Nestes termos, pede deferimento.</p>`,

        dicasEstilo: `- Hipóteses de cabimento: art. 1.015 CPC (rol taxativo, com exceção da tese de taxatividade mitigada - STJ Tema 988)
- Peças obrigatórias: decisão agravada, certidão de intimação, procurações
- Efeito suspensivo: demonstrar fumus boni juris + periculum in mora
- Se urgente, pedir tutela antecipada recursal (art. 1.019, I, CPC)`,

        exemploParagrafo: `A r. decisão agravada determinou o bloqueio de valores nas contas bancárias do Agravante no importe de R$ 350.000,00, sem observar o procedimento previsto no art. 854 do CPC, que exige a prévia tentativa de localização de bens penhoráveis que gerem menor onerosidade ao executado, nos termos do art. 805 do CPC. Ademais, os valores bloqueados incluem verba de natureza salarial, absolutamente impenhorável por força do art. 833, inciso IV, do CPC, conforme extratos bancários que demonstram o crédito regular de salário na conta atingida pela constrição.`,
    },

    mandado_seguranca: {
        tipo: 'mandado_seguranca',
        nome: 'Mandado de Segurança',
        estrutura: `
<h1>EXCELENTÍSSIMO(A) SENHOR(A) DOUTOR(A) JUIZ(A) [FEDERAL/DE DIREITO] DA [VARA]</h1>

<p><strong>[NOME DO IMPETRANTE]</strong>, [qualificação], por seu advogado, vem impetrar</p>

<h2>MANDADO DE SEGURANÇA COM PEDIDO DE LIMINAR</h2>

<p>com fundamento no art. 5º, inciso LXIX, da Constituição Federal e na Lei nº 12.016/2009, em face de ato ilegal e abusivo praticado pelo(a) <strong>[AUTORIDADE COATORA — nome e cargo]</strong>, vinculado(a) ao [órgão], pelos fatos e fundamentos a seguir.</p>

<h2>I — DA AUTORIDADE COATORA E DO ATO IMPUGNADO</h2>
<p>[Identificação precisa da autoridade e descrição do ato coator]</p>

<h2>II — DOS FATOS</h2>
<p>[Narrativa factual]</p>

<h2>III — DO DIREITO LÍQUIDO E CERTO</h2>
<p>[Demonstração do direito com prova pré-constituída]</p>

<h2>IV — DA LIMINAR</h2>
<p>[Fumus boni juris + periculum in mora]</p>

<h2>V — DOS PEDIDOS</h2>
<ol>
<li>A concessão da medida liminar para [efeito pretendido];</li>
<li>A notificação da autoridade coatora para prestar informações;</li>
<li>A oitiva do Ministério Público;</li>
<li>A concessão definitiva da segurança para [pedido final].</li>
</ol>`,

        dicasEstilo: `- Direito LÍQUIDO E CERTO: deve ser comprovado de plano (prova pré-constituída)
- Autoridade coatora: pessoa física que praticou/ordenou o ato (não o órgão)
- Prazo decadencial: 120 dias do ato coator
- Liminar: art. 7º, III, Lei 12.016/2009
- Não cabe contra lei em tese (Súmula 266 STF)`,

        exemploParagrafo: `O direito líquido e certo do Impetrante resta demonstrado pela documentação acostada à presente inicial. Conforme certidão de fls. [XX], o Impetrante cumpriu integralmente todos os requisitos previstos no Edital nº [XX/XXXX] para a concessão da licença de funcionamento, tendo protocolado o requerimento administrativo em [data] (protocolo nº [XX]). Não obstante, a autoridade coatora, sem qualquer fundamentação — em flagrante violação ao art. 50 da Lei nº 9.784/1999 —, indeferiu o pedido em [data], conforme despacho de fl. [XX].`,
    },
};

// ─── Fallback genérico ──────────────────────────────────────────────

const GENERIC_TEMPLATE: PetitionTemplate = {
    tipo: 'generico',
    nome: 'Petição Genérica',
    estrutura: `
<h1>[ENDEREÇAMENTO AO JUÍZO COMPETENTE]</h1>

<p><strong>Processo nº [NÚMERO CNJ]</strong></p>

<p><strong>[NOME DA PARTE]</strong>, [qualificação], por seu advogado, vem, respeitosamente, apresentar [TIPO DA PEÇA], pelos fatos e fundamentos a seguir.</p>

<h2>I — DOS FATOS</h2>
<p>[Narrativa factual]</p>

<h2>II — DO DIREITO</h2>
<p>[Fundamentos jurídicos]</p>

<h2>III — DOS PEDIDOS</h2>
<ol>
<li>[Pedidos específicos];</li>
</ol>

<p>Nestes termos, pede deferimento.</p>
<p>[Cidade], [data]. [Advogado] — OAB nº [número]</p>`,

    dicasEstilo: `- Adapte a estrutura ao tipo específico de peça
- Mantenha sempre: endereçamento, qualificação, fatos, direito, pedidos, fecho
- Linguagem formal e técnica`,

    exemploParagrafo: ``,
};

// ─── Modelos Reais (arquivos .txt em modelos/) ─────────────────────

import * as fs from 'fs';
import * as path from 'path';

/**
 * Mapeamento tipo de petição → arquivo de modelo real.
 * Esses modelos são petições reais (anonimizadas) que servem como
 * referência de qualidade, tom, estrutura e vocabulário jurídico.
 */
const MODELO_FILES: Record<string, string> = {
    peticao_inicial: 'peticao-inicial-trabalhista.txt',
    recurso_ordinario: 'recurso-ordinario-trabalhista.txt',
    contestacao: 'contestacao-civel.txt',
    apelacao: 'apelacao-civel.txt',
    embargos_declaracao: 'embargos-declaracao.txt',
};

/**
 * Carrega o texto do modelo real do disco.
 * Retorna string vazia se o arquivo não existir.
 */
function loadModeloReal(tipoPeticao: string): string {
    const filename = MODELO_FILES[tipoPeticao];
    if (!filename) return '';

    try {
        const filePath = path.join(__dirname, 'modelos', filename);
        if (!fs.existsSync(filePath)) {
            // Fallback: path relativo ao source (dev mode)
            const devPath = path.join(__dirname, '..', 'electron', 'batch', 'modelos', filename);
            if (fs.existsSync(devPath)) {
                return fs.readFileSync(devPath, 'utf-8');
            }
            return '';
        }
        return fs.readFileSync(filePath, 'utf-8');
    } catch {
        return '';
    }
}

// ─── API Pública ────────────────────────────────────────────────────

/**
 * Retorna o template para o tipo de petição.
 * Fallback para template genérico se o tipo não existir.
 */
export function getTemplate(tipoPeticao: string): PetitionTemplate {
    return TEMPLATES[tipoPeticao] || GENERIC_TEMPLATE;
}

/**
 * Retorna o bloco completo de formatação + template + modelo real
 * pronto para injetar no system prompt do worker.
 */
export function getFormattingBlock(tipoPeticao: string): string {
    const template = getTemplate(tipoPeticao);

    let block = FORMATTING_RULES;

    block += `\n\n## MODELO DE ESTRUTURA: ${template.nome.toUpperCase()}

### Estrutura HTML de Referência
Use esta estrutura como BASE. Adapte ao caso concreto, mas mantenha o padrão formal:

${template.estrutura}

### Dicas Específicas para ${template.nome}
${template.dicasEstilo}`;

    if (template.exemploParagrafo) {
        block += `\n\n### Exemplo de Parágrafo Bem Escrito (use como referência de qualidade)
${template.exemploParagrafo}`;
    }

    // Injetar modelo real como referência de qualidade
    const modeloReal = loadModeloReal(tipoPeticao);
    if (modeloReal) {
        // Limitar a ~4000 chars para não estourar contexto
        const truncated = modeloReal.length > 4000
            ? modeloReal.substring(0, 4000) + '\n\n[... modelo continua ...]'
            : modeloReal;

        block += `\n\n## PETIÇÃO REAL DE REFERÊNCIA
Abaixo está uma petição REAL do mesmo tipo para referência de tom, vocabulário, estrutura argumentativa e nível de detalhe.
NÃO copie este texto — use como REFERÊNCIA de qualidade. Sua petição deve ter o MESMO nível de detalhe e formalidade, adaptada ao caso concreto.

---
${truncated}
---`;
    }

    return block;
}

/**
 * Retorna bloco de formatação enriquecido com schemas da Knowledge Base
 * e exemplos reais rankeados por qualidade (Camada 1 + 2).
 *
 * Fallback graceful: se Knowledge Base não estiver disponível,
 * retorna getFormattingBlock() original.
 */
export function getEnrichedFormattingBlock(tipoPeticao: string, context?: { area?: string }): string {
    let block = getFormattingBlock(tipoPeticao);

    // Camada 1: Schema requirements
    try {
        const { getSchemaForLegacyTemplate } = require('../legal/doc-schema-registry');
        const schema = getSchemaForLegacyTemplate(tipoPeticao);
        if (schema) {
            const secoesInfo = schema.secoes
                .map((s: any) => `- ${s.nome}${s.obrigatoria ? ' (obrigatória)' : ' (opcional)'}: ${s.descricao}`)
                .join('\n');

            block += `\n\n## SCHEMA DE ESTRUTURA (Knowledge Base)
Seções esperadas para este tipo de documento:
${secoesInfo}`;

            if (schema.fundamentosComuns && schema.fundamentosComuns.length > 0) {
                block += `\n\nFundamentos legais comuns: ${schema.fundamentosComuns.join(', ')}`;
            }
        }
    } catch { /* Knowledge Base não disponível */ }

    // Camada 2: Exemplos reais
    try {
        const { getTopExamples } = require('../legal/doc-examples');
        const schemaId = tipoPeticao;
        const examples = getTopExamples(schemaId, 2);
        if (examples.length > 0) {
            block += '\n\n## EXEMPLOS REAIS DE REFERÊNCIA (Knowledge Base)';
            for (const ex of examples) {
                const excerpt = ex.conteudo.substring(0, 500).trim();
                block += `\n\n### ${ex.titulo} (qualidade: ${ex.qualidade.total}/100)
${excerpt}...`;
            }
        }
    } catch { /* doc-examples não disponível */ }

    return block;
}

/**
 * Lista todos os tipos de petição com templates disponíveis.
 */
export function listTemplateTypes(): string[] {
    return Object.keys(TEMPLATES);
}
