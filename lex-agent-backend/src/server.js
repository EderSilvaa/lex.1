// LEX Agent Backend - Servidor Principal
// Gerencia comunicação com a extensão e coordena agentes

const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const cors = require('cors');
const dotenv = require('dotenv');
const ActionPlanner = require('./action-planner');
const PJeExecutor = require('./pje-executor');

dotenv.config();

// Inicializar módulos inteligentes
const actionPlanner = new ActionPlanner(); // Usa Supabase Edge Function
const pjeExecutor = new PJeExecutor();

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Middleware
app.use(cors());
app.use(express.json());

// Armazenamento de sessões ativas
const activeSessions = new Map();

// ====================================
// WebSocket - Comunicação com Extension
// ====================================

wss.on('connection', (ws, req) => {
  const sessionId = generateSessionId();

  console.log(`🔌 Nova conexão WebSocket: ${sessionId}`);

  // Registrar sessão
  activeSessions.set(sessionId, {
    ws: ws,
    connected: true,
    connectedAt: new Date(),
    lastActivity: new Date(),
    context: null,
    currentTask: null
  });

  // Enviar confirmação de conexão
  ws.send(JSON.stringify({
    type: 'connection_established',
    sessionId: sessionId,
    timestamp: new Date().toISOString()
  }));

  // Listener de mensagens
  ws.on('message', async (message) => {
    try {
      const data = JSON.parse(message);
      console.log(`📨 Mensagem recebida [${sessionId}]:`, data.type);

      await handleWebSocketMessage(sessionId, data, ws);

      // Atualizar última atividade
      const session = activeSessions.get(sessionId);
      if (session) {
        session.lastActivity = new Date();
      }

    } catch (error) {
      console.error('❌ Erro ao processar mensagem:', error);
      ws.send(JSON.stringify({
        type: 'error',
        error: error.message,
        timestamp: new Date().toISOString()
      }));
    }
  });

  // Listener de desconexão
  ws.on('close', () => {
    console.log(`🔌 Conexão fechada: ${sessionId}`);
    activeSessions.delete(sessionId);
  });

  // Listener de erros
  ws.on('error', (error) => {
    console.error(`❌ Erro no WebSocket [${sessionId}]:`, error);
  });
});

// ====================================
// Handler de Mensagens WebSocket
// ====================================

async function handleWebSocketMessage(sessionId, data, ws) {
  const { type, payload } = data;

  switch (type) {
    case 'ping':
      ws.send(JSON.stringify({ type: 'pong', timestamp: new Date().toISOString() }));
      break;

    case 'update_context':
      // Atualizar contexto da sessão (dados do processo, documentos, etc)
      const session = activeSessions.get(sessionId);
      if (session) {
        session.context = payload;
        console.log(`📊 Contexto atualizado [${sessionId}]`);
      }
      ws.send(JSON.stringify({
        type: 'context_updated',
        success: true
      }));
      break;

    case 'execute_command':
      // Executar comando do usuário (ex: "protocolar petição")
      console.log(`🚀 Executando comando: "${payload.command}"`);
      await handleUserCommand(sessionId, payload, ws);
      break;

    case 'approve_action':
      // Usuário aprovou ação planejada
      console.log(`✅ Ação aprovada pelo usuário`);
      await executeApprovedAction(sessionId, payload, ws);
      break;

    case 'cancel_action':
      // Usuário cancelou ação
      console.log(`❌ Ação cancelada pelo usuário`);
      const cancelSession = activeSessions.get(sessionId);
      if (cancelSession) {
        cancelSession.currentTask = null;
      }
      ws.send(JSON.stringify({
        type: 'action_cancelled',
        success: true
      }));
      break;

    case 'test_action':
      // Comando de teste do Playwright
      console.log(`🧪 Executando teste: ${payload.action}`);
      await handleTestAction(sessionId, payload, ws);
      break;

    default:
      console.warn(`⚠️ Tipo de mensagem desconhecido: ${type}`);
  }
}

// ====================================
// Handlers de Comandos
// ====================================

async function handleUserCommand(sessionId, payload, ws) {
  const { command, context } = payload;

  try {
    // Notificar que está analisando
    ws.send(JSON.stringify({
      type: 'status_update',
      status: 'analyzing',
      message: 'Analisando seu comando com GPT-4 Vision...'
    }));

    // 🎨 CAPTURAR SCREENSHOT DO NAVEGADOR
    let screenshot = null;
    try {
      // SEMPRE reconectar para garantir que temos acesso à página
      console.log('🔌 Conectando ao navegador para capturar screenshot...');
      const connected = await pjeExecutor.initialize();

      if (!connected) {
        console.warn('⚠️ Navegador não conectado, continuando sem screenshot');
        throw new Error('Browser not connected');
      }

      // Capturar screenshot em base64
      screenshot = await pjeExecutor.screenshotBase64();
      console.log('👁️ Screenshot capturado para análise visual');
    } catch (error) {
      console.warn('⚠️ Não foi possível capturar screenshot:', error.message);
      console.log('📝 Continuando apenas com contexto textual...');
    }

    // Usar ActionPlanner para criar plano inteligente (COM VISÃO!)
    const plan = await actionPlanner.createPlan(command, context, screenshot);

    // Armazenar plano na sessão
    const session = activeSessions.get(sessionId);
    if (session) {
      session.currentTask = {
        command: command,
        plan: plan,
        status: 'awaiting_approval',
        createdAt: new Date()
      };
    }

    // Enviar plano para aprovação
    ws.send(JSON.stringify({
      type: 'plan_created',
      plan: plan,
      timestamp: new Date().toISOString()
    }));

  } catch (error) {
    console.error('❌ Erro ao criar plano:', error);
    ws.send(JSON.stringify({
      type: 'error',
      error: `Erro ao analisar comando: ${error.message}`
    }));
  }
}

async function handleTestAction(sessionId, payload, ws) {
  const { action } = payload;

  try {
    ws.send(JSON.stringify({
      type: 'status_update',
      status: 'testing',
      message: `Executando teste: ${action}...`
    }));

    let result;

    switch (action) {
      case 'connect':
        // Testar conexão com navegador
        const connected = await pjeExecutor.initialize();
        result = {
          action: 'connect',
          success: connected,
          message: connected
            ? '✅ Conectado ao navegador com sucesso!'
            : '❌ Falha ao conectar. Abra o Chrome com: chrome.exe --remote-debugging-port=9222'
        };
        break;

      case 'screenshot':
        // Tirar screenshot
        if (!pjeExecutor.connected) {
          await pjeExecutor.initialize();
        }
        const screenshotPath = `./screenshots/test-${Date.now()}.png`;
        await pjeExecutor.screenshot(screenshotPath);
        result = {
          action: 'screenshot',
          success: true,
          message: `✅ Screenshot salvo em: ${screenshotPath}`,
          path: screenshotPath
        };
        break;

      case 'pageInfo':
        // Obter informações da página
        if (!pjeExecutor.connected) {
          await pjeExecutor.initialize();
        }
        const pageContext = await pjeExecutor.getPageContext();
        result = {
          action: 'pageInfo',
          success: true,
          message: '✅ Informações da página coletadas',
          data: pageContext
        };
        break;

      case 'readProcess':
        // Ler número do processo
        if (!pjeExecutor.connected) {
          await pjeExecutor.initialize();
        }
        const context = await pjeExecutor.getPageContext();
        result = {
          action: 'readProcess',
          success: true,
          message: `✅ Processo identificado: ${context.processNumber || 'Não encontrado'}`,
          processNumber: context.processNumber
        };
        break;

      default:
        result = {
          action: action,
          success: false,
          message: `❌ Ação de teste desconhecida: ${action}`
        };
    }

    ws.send(JSON.stringify({
      type: 'test_result',
      result: result,
      timestamp: new Date().toISOString()
    }));

  } catch (error) {
    console.error(`❌ Erro no teste ${action}:`, error);
    ws.send(JSON.stringify({
      type: 'test_result',
      result: {
        action: action,
        success: false,
        message: `❌ Erro: ${error.message}`,
        error: error.message
      },
      timestamp: new Date().toISOString()
    }));
  }
}

async function executeApprovedAction(sessionId, payload, ws) {
  const session = activeSessions.get(sessionId);

  if (!session || !session.currentTask) {
    ws.send(JSON.stringify({
      type: 'error',
      error: 'Nenhuma ação pendente para executar'
    }));
    return;
  }

  const { plan } = session.currentTask;

  // Atualizar status
  session.currentTask.status = 'executing';

  ws.send(JSON.stringify({
    type: 'execution_started',
    message: 'Iniciando execução com Playwright...'
  }));

  try {
    // SEMPRE reconectar ao navegador (fix para "page closed")
    ws.send(JSON.stringify({
      type: 'status_update',
      status: 'connecting',
      message: 'Conectando ao navegador...'
    }));

    const connected = await pjeExecutor.initialize();
    if (!connected) {
      throw new Error('Não foi possível conectar ao navegador. Abra o Chrome com: chrome.exe --remote-debugging-port=9222');
    }

    // Executar cada step do plano
    for (let i = 0; i < plan.steps.length; i++) {
      const step = plan.steps[i];

      // Notificar progresso
      ws.send(JSON.stringify({
        type: 'execution_progress',
        currentStep: i + 1,
        totalSteps: plan.steps.length,
        stepDescription: step.description,
        percentage: Math.round(((i + 1) / plan.steps.length) * 100)
      }));

      // Executar ação com Playwright
      const result = await pjeExecutor.executeAction({
        type: step.type,
        selector: step.selector,
        value: step.value,
        url: step.url
      });

      console.log(`✅ Step ${step.order} concluído:`, step.description);
    }

    // Finalizar
    session.currentTask.status = 'completed';

    ws.send(JSON.stringify({
      type: 'execution_completed',
      success: true,
      message: 'Ação executada com sucesso!',
      timestamp: new Date().toISOString()
    }));

  } catch (error) {
    console.error('❌ Erro ao executar ação:', error);

    session.currentTask.status = 'failed';

    ws.send(JSON.stringify({
      type: 'error',
      error: `Erro na execução: ${error.message}`,
      timestamp: new Date().toISOString()
    }));
  }
}

// ====================================
// REST API Endpoints
// ====================================

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    activeSessions: activeSessions.size,
    timestamp: new Date().toISOString()
  });
});

app.get('/sessions', (req, res) => {
  const sessions = Array.from(activeSessions.entries()).map(([id, session]) => ({
    sessionId: id,
    connected: session.connected,
    connectedAt: session.connectedAt,
    lastActivity: session.lastActivity,
    hasContext: !!session.context,
    currentTask: session.currentTask?.status || null
  }));

  res.json({ sessions });
});

app.post('/api/analyze-context', async (req, res) => {
  try {
    const { processData } = req.body;

    // Usar ActionPlanner para análise inteligente
    const analysis = await actionPlanner.analyzeProcessContext(processData);

    res.json({ success: true, analysis });

  } catch (error) {
    console.error('❌ Erro ao analisar contexto:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/generate-document', async (req, res) => {
  try {
    const { documentType, data } = req.body;

    // Gerar documento com GPT-4
    const document = await actionPlanner.generateDocument(documentType, data);

    res.json({ success: true, document });

  } catch (error) {
    console.error('❌ Erro ao gerar documento:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/search-jurisprudence', async (req, res) => {
  try {
    const { query, filters } = req.body;

    // Buscar jurisprudência
    const suggestions = await actionPlanner.searchJurisprudence(query, filters);

    res.json({ success: true, suggestions });

  } catch (error) {
    console.error('❌ Erro ao buscar jurisprudência:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/connect-browser', async (req, res) => {
  try {
    const connected = await pjeExecutor.initialize();

    if (connected) {
      const context = await pjeExecutor.getPageContext();
      res.json({ success: true, connected: true, context });
    } else {
      res.json({
        success: false,
        error: 'Não foi possível conectar. Abra o Chrome com: chrome.exe --remote-debugging-port=9222'
      });
    }

  } catch (error) {
    console.error('❌ Erro ao conectar ao navegador:', error);
    res.status(500).json({ error: error.message });
  }
});

// ====================================
// Utilitários
// ====================================

function generateSessionId() {
  return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// ====================================
// Inicialização
// ====================================

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log('');
  console.log('🤖 =============================================');
  console.log('🤖  LEX Agent Backend - INICIADO');
  console.log('🤖 =============================================');
  console.log(`📡 HTTP Server: http://localhost:${PORT}`);
  console.log(`🔌 WebSocket: ws://localhost:${PORT}`);
  console.log(`💚 Status: http://localhost:${PORT}/health`);
  console.log('🤖 =============================================');
  console.log('');
  console.log('Aguardando conexões da extensão...');
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('🛑 Recebido SIGTERM, encerrando...');
  server.close(() => {
    console.log('✅ Servidor encerrado');
    process.exit(0);
  });
});
