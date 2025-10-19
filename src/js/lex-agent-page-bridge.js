// LEX Agent - Bridge para contexto da página
// Este script roda no contexto da página (não no content script)
(function() {
  'use strict';

  console.log('🔧 LEX Agent Page Bridge carregando...');

  // Armazenar último plano recebido
  let lastPlan = null;

  // Escutar mensagens do content script
  window.addEventListener('message', (event) => {
    if (event.source !== window) return;

    if (event.data.type === 'LEX_AGENT_PLAN_RECEIVED') {
      lastPlan = event.data.plan;
      console.log('📋 Plano recebido e armazenado!');
    } else if (event.data.type === 'LEX_AGENT_TEST_RESULT') {
      const result = event.data.result;
      console.log('\n' + '='.repeat(60));
      console.log('🧪 RESULTADO DO TESTE');
      console.log('='.repeat(60));
      console.log(`Ação: ${result.action}`);
      console.log(`Status: ${result.success ? '✅ SUCESSO' : '❌ FALHA'}`);
      console.log(`Mensagem: ${result.message}`);
      if (result.data) {
        console.log('Dados:', result.data);
      }
      if (result.path) {
        console.log(`Caminho: ${result.path}`);
      }
      console.log('='.repeat(60) + '\n');
    }
  });

  // Criar proxy para comunicar com o content script
  window.lexAgent = {
    executeCommand: function(command) {
      console.log('🚀 LEX Agent: Enviando comando:', command);
      window.postMessage({
        type: 'LEX_AGENT_COMMAND',
        command: command
      }, '*');
      return 'Comando enviado para processamento';
    },

    getStatus: function() {
      console.log('📊 LEX Agent: Solicitando status...');
      window.postMessage({
        type: 'LEX_AGENT_GET_STATUS'
      }, '*');
    },

    isConnected: function() {
      console.log('🔍 LEX Agent: Verificando conexão...');
      window.postMessage({
        type: 'LEX_AGENT_IS_CONNECTED'
      }, '*');
    },

    getLastPlan: function() {
      if (!lastPlan) {
        console.warn('⚠️ Nenhum plano recebido ainda. Execute um comando primeiro.');
        return null;
      }
      console.log('📋 Último plano recebido:');
      console.table(lastPlan.steps);
      console.log('⚠️ Riscos identificados:', lastPlan.risks);
      console.log('🔒 Requer aprovação:', lastPlan.needsApproval);
      console.log('⏱️ Tempo estimado:', lastPlan.estimatedTime + 's');
      return lastPlan;
    },

    showPlanDetails: function() {
      if (!lastPlan) {
        console.warn('⚠️ Nenhum plano recebido ainda. Execute um comando primeiro.');
        return;
      }

      console.log('\n' + '='.repeat(60));
      console.log('📋 DETALHES DO PLANO DE AÇÃO');
      console.log('='.repeat(60));

      console.log('\n🎯 INTENÇÃO:');
      console.log(`  Ação: ${lastPlan.intent.action}`);
      console.log(`  Descrição: ${lastPlan.intent.description}`);

      console.log('\n📝 PASSOS A EXECUTAR:');
      lastPlan.steps.forEach((step, i) => {
        console.log(`\n  ${i + 1}. ${step.description}`);
        console.log(`     Tipo: ${step.type}`);
        if (step.selector) console.log(`     Seletor: ${step.selector}`);
        if (step.value) console.log(`     Valor: ${step.value}`);
        if (step.url) console.log(`     URL: ${step.url}`);
        console.log(`     Motivo: ${step.reasoning}`);
      });

      console.log('\n⚠️ RISCOS IDENTIFICADOS:');
      lastPlan.risks.forEach((risk, i) => {
        console.log(`\n  ${i + 1}. [${risk.level.toUpperCase()}] ${risk.description}`);
        console.log(`     Mitigação: ${risk.mitigation}`);
      });

      console.log('\n🔒 APROVAÇÃO NECESSÁRIA:', lastPlan.needsApproval ? 'SIM' : 'NÃO');
      console.log('⏱️ TEMPO ESTIMADO:', lastPlan.estimatedTime + ' segundos');
      console.log('\n' + '='.repeat(60) + '\n');
    },

    approvePlan: function() {
      if (!lastPlan) {
        console.error('❌ Nenhum plano para aprovar');
        return;
      }
      console.log('✅ Aprovando execução do plano...');
      window.postMessage({
        type: 'LEX_AGENT_APPROVE_ACTION',
        planId: 'current'
      }, '*');
    },

    // 🔍 TESTAR CONTEXTO RICO
    getRichContext: function() {
      console.log('📊 Solicitando contexto rico da página...');
      window.postMessage({
        type: 'LEX_AGENT_GET_RICH_CONTEXT'
      }, '*');
    },

    // 🧪 COMANDOS DE TESTE DO PLAYWRIGHT
    test: {
      screenshot: function() {
        console.log('📸 Solicitando screenshot da página...');
        window.postMessage({
          type: 'LEX_AGENT_TEST',
          action: 'screenshot'
        }, '*');
      },

      getPageInfo: function() {
        console.log('📄 Solicitando informações da página...');
        window.postMessage({
          type: 'LEX_AGENT_TEST',
          action: 'pageInfo'
        }, '*');
      },

      readProcessNumber: function() {
        console.log('🔍 Solicitando leitura do número do processo...');
        window.postMessage({
          type: 'LEX_AGENT_TEST',
          action: 'readProcess'
        }, '*');
      },

      connectBrowser: function() {
        console.log('🌐 Testando conexão com navegador...');
        window.postMessage({
          type: 'LEX_AGENT_TEST',
          action: 'connect'
        }, '*');
      }
    }
  };

  console.log('✅ window.lexAgent criado e acessível!');
  console.log('📋 Comandos disponíveis:');
  console.log('  - lexAgent.executeCommand("analisar processo")');
  console.log('  - lexAgent.getLastPlan() - Ver último plano');
  console.log('  - lexAgent.showPlanDetails() - Ver detalhes do plano');
  console.log('  - lexAgent.approvePlan() - Aprovar e executar');
  console.log('  - lexAgent.getRichContext() - Ver contexto rico da página');
  console.log('  - lexAgent.getStatus()');
  console.log('  - lexAgent.isConnected()');
  console.log('');
  console.log('🧪 Comandos de teste Playwright:');
  console.log('  - lexAgent.test.connectBrowser() - Conectar ao navegador');
  console.log('  - lexAgent.test.screenshot() - Tirar screenshot');
  console.log('  - lexAgent.test.getPageInfo() - Ler info da página');
  console.log('  - lexAgent.test.readProcessNumber() - Ler número do processo');

})();
