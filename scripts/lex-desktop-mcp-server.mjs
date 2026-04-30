#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const bridgeUrl = (process.env.LEX_DESKTOP_BRIDGE_URL || 'http://127.0.0.1:32179').replace(/\/+$/, '');
const brainNodeTypes = [
  'processo',
  'tese',
  'parte',
  'aprendizado',
  'tribunal',
  'selector',
  'prazo',
  'decisao',
  'page_state',
  'action',
  'flow',
];
const observationStateSchema = z.object({
  url: z.string().optional(),
  title: z.string().optional(),
  domHash: z.string().optional(),
  tribunal: z.string().optional(),
  pjeContext: z.string().optional(),
  canonicalUrl: z.string().optional(),
  canonicalContext: z.string().optional(),
  canonicalStateKey: z.string().optional(),
}).passthrough();

async function bridgeGet(pathname) {
  const response = await fetch(`${bridgeUrl}${pathname}`, {
    method: 'GET',
    headers: { accept: 'application/json' },
  });

  const text = await response.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { ok: false, raw: text };
  }

  if (!response.ok) {
    throw new Error(`Lex Desktop bridge ${response.status}: ${JSON.stringify(json)}`);
  }
  return json;
}

async function bridgePost(pathname, payload) {
  const response = await fetch(`${bridgeUrl}${pathname}`, {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
    },
    body: JSON.stringify(payload || {}),
  });

  const text = await response.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { ok: false, raw: text };
  }

  if (!response.ok) {
    throw new Error(`Lex Desktop bridge ${response.status}: ${JSON.stringify(json)}`);
  }
  return json;
}

async function healthTool() {
  const health = await bridgeGet('/health');
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(health, null, 2),
      },
    ],
  };
}

async function pjeStatusTool() {
  const status = await bridgeGet('/pje/status');
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(status, null, 2),
      },
    ],
  };
}

async function pjeConsultarProcessoTool(input) {
  const result = await bridgePost('/pje/consultar-processo', input);
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(result, null, 2),
      },
    ],
  };
}

async function pjeAbrirConsultaTool(input) {
  const result = await bridgePost('/pje/abrir-consulta', input);
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(result, null, 2),
      },
    ],
  };
}

async function pjeInspecionarContextoTool(input) {
  const result = await bridgePost('/pje/inspecionar-contexto', input);
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(result, null, 2),
      },
    ],
  };
}

async function pjePreencherNumeroTool(input) {
  const result = await bridgePost('/pje/preencher-numero', input);
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(result, null, 2),
      },
    ],
  };
}

async function pjeClicarConsultarTool(input) {
  const result = await bridgePost('/pje/clicar-consultar', input);
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(result, null, 2),
      },
    ],
  };
}

async function pjeLerResultadosTool(input) {
  const result = await bridgePost('/pje/ler-resultados', input);
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(result, null, 2),
      },
    ],
  };
}

async function pjeAbrirResultadoTool(input) {
  const result = await bridgePost('/pje/abrir-resultado', input);
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(result, null, 2),
      },
    ],
  };
}

async function confirmTool(input) {
  const result = await bridgePost('/confirm', input);
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(result, null, 2),
      },
    ],
  };
}

async function brainSearchTool(input) {
  const result = await bridgePost('/brain/search', input);
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(result, null, 2),
      },
    ],
  };
}

async function brainFlowsTool(input) {
  const result = await bridgePost('/brain/flows', input);
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(result, null, 2),
      },
    ],
  };
}

async function brainGetFlowTool(input) {
  const result = await bridgePost('/brain/flow', input);
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(result, null, 2),
      },
    ],
  };
}

async function brainRecordObservationTool(input) {
  const result = await bridgePost('/brain/record-observation', input);
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(result, null, 2),
      },
    ],
  };
}

if (process.argv.includes('--self-test')) {
  healthTool()
    .then((result) => {
      console.log(result.content[0].text);
    })
    .catch((error) => {
      console.error(error?.message || String(error));
      process.exit(1);
    });
} else {
  const server = new McpServer({
    name: 'lex-desktop',
    version: '0.1.0',
  });

  server.registerTool('lex_health', {
    title: 'Lex Desktop Health',
    description: 'Retorna status local do Lex Desktop, bridge e Lex Engine.',
    inputSchema: {},
    annotations: {
      readOnlyHint: true,
      openWorldHint: false,
    },
  }, healthTool);

  server.registerTool('lex_confirm', {
    title: 'Lex Desktop Confirm',
    description: 'Abre uma confirmacao no Lex Desktop e retorna se o usuario aceitou.',
    inputSchema: {
      message: z.string().min(1).describe('Mensagem objetiva para o usuario confirmar.'),
      title: z.string().optional().describe('Titulo curto da janela de confirmacao.'),
      detail: z.string().optional().describe('Detalhes adicionais, riscos ou contexto da acao.'),
      level: z.enum(['info', 'warning', 'danger']).optional().describe('Nivel visual da confirmacao.'),
      confirmLabel: z.string().optional().describe('Texto do botao de aceite.'),
      cancelLabel: z.string().optional().describe('Texto do botao de cancelamento.'),
      requestId: z.string().optional().describe('Identificador opcional para correlacao/auditoria.'),
    },
    annotations: {
      readOnlyHint: false,
      openWorldHint: false,
    },
  }, confirmTool);

  server.registerTool('pje_status', {
    title: 'Lex PJe Status',
    description: 'Retorna status read-only do navegador/PJe na Lex Desktop, sem abrir navegador nem executar acoes.',
    inputSchema: {},
    annotations: {
      readOnlyHint: true,
      openWorldHint: false,
    },
  }, pjeStatusTool);

  server.registerTool('pje_consultar_processo', {
    title: 'Lex PJe Consultar Processo',
    description: 'Prepara uma consulta read-only de processo por numero CNJ: valida o numero, infere tribunal, resolve URLs do PJe e retorna readiness. Nao automatiza o browser; se includeDataJud=true, tenta consultar a API DataJud configurada na Lex Desktop.',
    inputSchema: {
      numero: z.string().min(1).describe('Numero do processo em formato CNJ. Ex: 0801234-56.2024.8.14.0301.'),
      tribunal: z.string().optional().describe('Tribunal opcional. Ex: TJPA, TRT8, TRF1. Se ausente, a Lex tenta inferir pelo CNJ.'),
      includeDataJud: z.boolean().optional().describe('Quando true, tenta consulta DataJud pela Lex Desktop se a chave estiver configurada. Pode acessar API externa do CNJ.'),
    },
    annotations: {
      readOnlyHint: true,
      openWorldHint: true,
    },
  }, pjeConsultarProcessoTool);

  server.registerTool('pje_abrir_consulta', {
    title: 'Lex PJe Abrir Consulta',
    description: 'Abre ou navega o Chrome controlado da Lex para a tela de consulta do PJe apos confirmacao visual no Electron. Nao preenche campos e nao pratica atos processuais.',
    inputSchema: {
      numero: z.string().min(1).describe('Numero do processo em formato CNJ usado para confirmar o contexto.'),
      tribunal: z.string().optional().describe('Tribunal opcional. Ex: TJPA, TRT8, TRF1. Se ausente, a Lex tenta inferir pelo CNJ.'),
    },
    annotations: {
      readOnlyHint: false,
      openWorldHint: true,
    },
  }, pjeAbrirConsultaTool);

  server.registerTool('pje_inspecionar_contexto', {
    title: 'Lex PJe Inspecionar Contexto',
    description: 'Inspeciona de forma read-only o browser controlado da Lex: abas/popups, URL, titulo, iframes, textos visiveis, elementos interativos e candidatos a campo de numero do processo ou botao de consulta. Nao clica, nao preenche e nao navega.',
    inputSchema: {
      waitMs: z.number().int().min(0).max(5000).optional().describe('Espera passiva antes da leitura, util para PJe/JSF terminar de renderizar. Maximo 5000 ms.'),
      maxPages: z.number().int().min(1).max(20).optional().describe('Maximo de abas/popups a inspecionar. Padrao: 8.'),
      maxElementsPerFrame: z.number().int().min(1).max(150).optional().describe('Maximo de elementos interativos por iframe. Padrao: 60.'),
      maxTextSnippetsPerFrame: z.number().int().min(0).max(60).optional().describe('Maximo de trechos de texto visivel por iframe. Padrao: 16.'),
      includeScreenshot: z.boolean().optional().describe('Quando true, inclui screenshot JPEG base64 da aba ativa. Pode aumentar bastante a resposta.'),
      fullPageScreenshot: z.boolean().optional().describe('Quando includeScreenshot=true, captura a pagina inteira em vez da viewport atual.'),
    },
    annotations: {
      readOnlyHint: true,
      openWorldHint: false,
    },
  }, pjeInspecionarContextoTool);

  server.registerTool('pje_preencher_numero', {
    title: 'Lex PJe Preencher Numero',
    description: 'Valida e normaliza um numero CNJ, confere possivel divergencia de tribunal e preenche os campos segmentados do numero do processo no PJe. Por padrao roda em dryRun=true. Com dryRun=false, pede confirmacao visual no Electron e nao clica em Consultar/Pesquisar.',
    inputSchema: {
      numero: z.string().min(1).describe('Numero do processo CNJ, com ou sem mascara. Ex: 0886971-84.2025.8.14.0301 ou 08869718420258140301.'),
      tribunal: z.string().optional().describe('Tribunal esperado, ex: TJPA. Se divergir do CNJ, a Lex bloqueia salvo allowTribunalMismatch=true.'),
      dryRun: z.boolean().optional().describe('Padrao true. Quando true, valida e mostra o plano sem alterar campos. Quando false, pede confirmacao e preenche.'),
      allowTribunalMismatch: z.boolean().optional().describe('Permite preencher mesmo quando o tribunal inferido pelo CNJ diverge do tribunal informado. Use apenas com confirmacao humana.'),
    },
    annotations: {
      readOnlyHint: false,
      openWorldHint: false,
    },
  }, pjePreencherNumeroTool);

  server.registerTool('pje_clicar_consultar', {
    title: 'Lex PJe Clicar Consultar',
    description: 'Encontra um botao seguro de Pesquisar/Consultar na tela atual do PJe e clica uma unica vez. Por padrao roda em dryRun=true. Com dryRun=false, pede confirmacao visual no Electron. Bloqueia consulta vazia salvo allowEmptySearch=true. Nao abre resultado, nao baixa documentos e nao protocola.',
    inputSchema: {
      dryRun: z.boolean().optional().describe('Padrao true. Quando true, identifica candidatos e criterios sem clicar. Quando false, pede confirmacao e clica uma vez.'),
      waitAfterMs: z.number().int().min(500).max(10000).optional().describe('Espera apos o clique para o PJe atualizar a tela. Padrao: 2500 ms.'),
      allowEmptySearch: z.boolean().optional().describe('Padrao false. Quando false, bloqueia clique se nao houver criterio de busca preenchido.'),
      candidateRef: z.string().optional().describe('Ref opcional retornada pelo dry run para forcar um botao especifico, ex: search:0:12.'),
    },
    annotations: {
      readOnlyHint: false,
      openWorldHint: false,
    },
  }, pjeClicarConsultarTool);

  server.registerTool('pje_ler_resultados', {
    title: 'Lex PJe Ler Resultados',
    description: 'Le de forma read-only os resultados visiveis da consulta atual do PJe. Extrai tabelas/linhas com numero do processo, orgao julgador, classe, polos e ultima movimentacao quando disponiveis. Nao clica, nao abre processo, nao baixa documentos e nao navega.',
    inputSchema: {
      waitMs: z.number().int().min(0).max(10000).optional().describe('Espera passiva antes da leitura, util para o PJe terminar AJAX/JSF. Padrao: 1000 ms.'),
      maxRows: z.number().int().min(1).max(100).optional().describe('Maximo de linhas de resultado a retornar. Padrao: 20.'),
      includeRawText: z.boolean().optional().describe('Quando true, inclui um preview textual bruto da pagina para diagnostico. Padrao false.'),
    },
    annotations: {
      readOnlyHint: true,
      openWorldHint: false,
    },
  }, pjeLerResultadosTool);

  server.registerTool('pje_abrir_resultado', {
    title: 'Lex PJe Abrir Resultado',
    description: 'Seleciona um resultado visivel da consulta do PJe e prepara a abertura dos autos com travas. Por padrao roda em dryRun=true. Com dryRun=false e aceitarAviso=false, pede confirmacao e clica somente no link do processo, parando no aviso/modal. Com aceitarAviso=true, pede confirmacao forte e tenta clicar em Continuar/Aceitar no aviso para abrir os autos. Nao baixa documentos e nao peticiona.',
    inputSchema: {
      numero: z.string().optional().describe('Numero CNJ esperado para selecionar a linha correta. Se ausente, usa resultadoIndex.'),
      resultadoIndex: z.number().int().min(1).max(100).optional().describe('Indice humano do resultado visivel, comecando em 1. Padrao: 1.'),
      dryRun: z.boolean().optional().describe('Padrao true. Quando true, escolhe a linha/link e mostra o plano sem clicar.'),
      aceitarAviso: z.boolean().optional().describe('Padrao false. Quando false, abre apenas o aviso/modal. Quando true, tenta aceitar/continuar e abrir os autos apos confirmacao visual.'),
      waitAfterMs: z.number().int().min(500).max(15000).optional().describe('Espera apos clique para modal/aba carregar. Padrao: 3000 ms.'),
    },
    annotations: {
      readOnlyHint: false,
      openWorldHint: false,
    },
  }, pjeAbrirResultadoTool);

  server.registerTool('brain_search', {
    title: 'Lex Brain Search',
    description: 'Busca read-only no Brain local da Lex por processos, teses, aprendizados e fluxos.',
    inputSchema: {
      query: z.string().min(1).describe('Termo de busca no Brain local.'),
      types: z.array(z.enum(brainNodeTypes)).optional().describe('Tipos opcionais de nodes para filtrar.'),
      limit: z.number().int().min(1).max(20).optional().describe('Maximo de resultados, de 1 a 20.'),
    },
    annotations: {
      readOnlyHint: true,
      openWorldHint: false,
    },
  }, brainSearchTool);

  server.registerTool('brain_flows', {
    title: 'Lex Brain Flows',
    description: 'Lista fluxos operacionais aprendidos no Brain local da Lex, sem executar acoes.',
    inputSchema: {
      limit: z.number().int().min(1).max(50).optional().describe('Maximo de flows retornados, de 1 a 50.'),
    },
    annotations: {
      readOnlyHint: true,
      openWorldHint: false,
    },
  }, brainFlowsTool);

  server.registerTool('brain_get_flow', {
    title: 'Lex Brain Get Flow',
    description: 'Carrega detalhes read-only de um flow operacional do Brain local da Lex.',
    inputSchema: {
      flowId: z.string().optional().describe('ID do node flow no Brain.'),
      label: z.string().optional().describe('Label exata do flow no Brain, usado se flowId nao for informado.'),
    },
    annotations: {
      readOnlyHint: true,
      openWorldHint: false,
    },
  }, brainGetFlowTool);

  server.registerTool('brain_record_observation', {
    title: 'Lex Brain Record Observation',
    description: 'Registra uma observacao operacional controlada no Brain local da Lex para aprendizado de fluxos.',
    inputSchema: {
      tool: z.string().min(1).describe('Nome da acao observada, por exemplo browser_click ou pje_consultar_processo.'),
      server: z.string().optional().describe('Origem logica da observacao. Padrao: lex-desktop-mcp.'),
      input: z.record(z.string(), z.unknown()).optional().describe('Entrada sanitizada da acao observada.'),
      outputPreview: z.string().optional().describe('Resumo curto do resultado observado.'),
      output: z.string().optional().describe('Resultado textual usado apenas para hash/preview, limitado pela Lex Desktop.'),
      success: z.boolean().optional().describe('Se a acao observada teve sucesso. Padrao: true.'),
      error: z.string().optional().describe('Erro observado quando success=false.'),
      durationMs: z.number().int().min(0).optional().describe('Duracao aproximada da acao em milissegundos.'),
      before: observationStateSchema.optional().describe('Estado da tela antes da acao.'),
      after: observationStateSchema.optional().describe('Estado da tela depois da acao.'),
      traceId: z.string().optional().describe('ID opcional para agrupar observacoes do mesmo fluxo.'),
      detectFlows: z.boolean().optional().describe('Quando true, tenta detectar flows apos gravar. Use com parcimonia.'),
      flowOptions: z.object({
        minActions: z.number().int().min(1).max(12).optional(),
        minInstances: z.number().int().min(1).max(20).optional(),
        minEdgeWeight: z.number().int().min(1).max(20).optional(),
      }).optional(),
    },
    annotations: {
      readOnlyHint: false,
      openWorldHint: false,
    },
  }, brainRecordObservationTool);

  const transport = new StdioServerTransport();
  server.connect(transport).catch((error) => {
    console.error('Lex Desktop MCP server failed:', error);
    process.exit(1);
  });
}
