// Script de debug avançado para diagnosticar problemas da extensão Lex
console.log('🔍 === DIAGNÓSTICO AVANÇADO EXTENSÃO LEX ===');

// Função principal de diagnóstico
function diagnosticarExtensaoLex() {
  const diagnostico = {
    timestamp: new Date().toISOString(),
    url: window.location.href,
    userAgent: navigator.userAgent,
    scripts: {},
    openaiClient: {},
    dom: {},
    timing: {},
    errors: []
  };

  console.log('🚀 Iniciando diagnóstico completo...');

  // 1. Verificar carregamento de scripts
  console.log('📜 1. VERIFICANDO SCRIPTS CARREGADOS');
  
  // Verificar se window.lexAssistantActive existe
  diagnostico.scripts.lexAssistantActive = !!window.lexAssistantActive;
  console.log(`   - window.lexAssistantActive: ${diagnostico.scripts.lexAssistantActive ? '✅' : '❌'}`);
  
  // Verificar se window.openaiClient existe
  diagnostico.scripts.openaiClientExists = !!window.openaiClient;
  console.log(`   - window.openaiClient existe: ${diagnostico.scripts.openaiClientExists ? '✅' : '❌'}`);
  
  // Verificar se window.pjeAssistantActive existe (do content.js)
  diagnostico.scripts.pjeAssistantActive = !!window.pjeAssistantActive;
  console.log(`   - window.pjeAssistantActive: ${diagnostico.scripts.pjeAssistantActive ? '✅' : '❌'}`);

  // 2. Diagnóstico detalhado do OpenAI Client
  console.log('🤖 2. DIAGNÓSTICO OPENAI CLIENT');
  
  if (window.openaiClient) {
    try {
      diagnostico.openaiClient.exists = true;
      diagnostico.openaiClient.type = typeof window.openaiClient;
      diagnostico.openaiClient.constructor = window.openaiClient.constructor?.name;
      
      // Verificar métodos disponíveis
      diagnostico.openaiClient.methods = Object.getOwnPropertyNames(window.openaiClient);
      console.log('   - Métodos disponíveis:', diagnostico.openaiClient.methods);
      
      // Verificar se está configurado
      if (typeof window.openaiClient.isConfigured === 'function') {
        diagnostico.openaiClient.configured = window.openaiClient.isConfigured();
        console.log(`   - Configurado: ${diagnostico.openaiClient.configured ? '✅' : '❌'}`);
      } else {
        diagnostico.openaiClient.configured = null;
        console.log('   - Método isConfigured não encontrado ❌');
      }
      
      // Verificar API key
      if (window.openaiClient.apiKey) {
        diagnostico.openaiClient.hasApiKey = true;
        diagnostico.openaiClient.apiKeyLength = window.openaiClient.apiKey.length;
        diagnostico.openaiClient.apiKeyPrefix = window.openaiClient.apiKey.substring(0, 10) + '...';
        diagnostico.openaiClient.isPlaceholder = window.openaiClient.apiKey === 'SUBSTITUA_PELA_SUA_CHAVE_OPENAI_AQUI';
        console.log(`   - API Key presente: ✅ (${diagnostico.openaiClient.apiKeyLength} chars)`);
        console.log(`   - É placeholder: ${diagnostico.openaiClient.isPlaceholder ? '❌' : '✅'}`);
      } else {
        diagnostico.openaiClient.hasApiKey = false;
        console.log('   - API Key: ❌ Não encontrada');
      }
      
    } catch (error) {
      diagnostico.openaiClient.error = error.message;
      diagnostico.errors.push(`OpenAI Client Error: ${error.message}`);
      console.error('   - Erro ao analisar OpenAI Client:', error);
    }
  } else {
    diagnostico.openaiClient.exists = false;
    console.log('   - OpenAI Client: ❌ Não encontrado');
  }

  // 3. Verificar elementos DOM da extensão
  console.log('🎨 3. VERIFICANDO ELEMENTOS DOM');
  
  // Botões da extensão
  const botaoLex = document.querySelector('.lex-button');
  const botaoPje = document.querySelector('[id^="pje-assistant-btn-"]');
  const chatContainer = document.querySelector('.lex-chat');
  
  diagnostico.dom.botaoLex = !!botaoLex;
  diagnostico.dom.botaoPje = !!botaoPje;
  diagnostico.dom.chatContainer = !!chatContainer;
  
  console.log(`   - Botão Lex (.lex-button): ${diagnostico.dom.botaoLex ? '✅' : '❌'}`);
  console.log(`   - Botão PJe (pje-assistant-btn): ${diagnostico.dom.botaoPje ? '✅' : '❌'}`);
  console.log(`   - Container Chat (.lex-chat): ${diagnostico.dom.chatContainer ? '✅' : '❌'}`);

  // 4. Verificar informações do processo
  console.log('📋 4. VERIFICANDO EXTRAÇÃO DE DADOS');
  
  const texto = document.body.innerText;
  const numeroMatch = texto.match(/(\d{7}-\d{2}\.\d{4}\.\d{1}\.\d{2}\.\d{4})/g);
  const tribunalMatch = texto.match(/TRIBUNAL DE JUSTIÇA/i);
  
  diagnostico.dom.numeroProcesso = numeroMatch ? numeroMatch[0] : null;
  diagnostico.dom.tribunal = tribunalMatch ? tribunalMatch[0] : null;
  
  console.log(`   - Número do processo: ${diagnostico.dom.numeroProcesso || '❌ Não encontrado'}`);
  console.log(`   - Tribunal: ${diagnostico.dom.tribunal || '❌ Não encontrado'}`);

  // 5. Verificar timing
  console.log('⏱️ 5. ANÁLISE DE TIMING');
  
  diagnostico.timing.domReady = document.readyState;
  diagnostico.timing.pageLoadTime = performance.now();
  
  console.log(`   - DOM State: ${diagnostico.timing.domReady}`);
  console.log(`   - Page Load Time: ${diagnostico.timing.pageLoadTime.toFixed(2)}ms`);

  // 6. Resumo final
  console.log('📊 6. RESUMO DO DIAGNÓSTICO');
  
  const problemas = [];
  const sucessos = [];
  
  if (!diagnostico.scripts.openaiClientExists) {
    problemas.push('OpenAI Client não carregado');
  } else {
    sucessos.push('OpenAI Client carregado');
  }
  
  if (diagnostico.openaiClient.isPlaceholder) {
    problemas.push('API Key não configurada (ainda é placeholder)');
  } else if (diagnostico.openaiClient.configured) {
    sucessos.push('API Key configurada');
  }
  
  if (!diagnostico.dom.botaoLex && !diagnostico.dom.botaoPje) {
    problemas.push('Nenhum botão da extensão encontrado');
  } else {
    sucessos.push('Botão da extensão encontrado');
  }
  
  console.log('✅ SUCESSOS:');
  sucessos.forEach(sucesso => console.log(`   - ${sucesso}`));
  
  console.log('❌ PROBLEMAS:');
  problemas.forEach(problema => console.log(`   - ${problema}`));
  
  // Salvar diagnóstico globalmente para inspeção
  window.diagnosticoLex = diagnostico;
  
  console.log('💾 Diagnóstico completo salvo em window.diagnosticoLex');
  console.log('🔍 Para ver o relatório completo, digite: console.log(window.diagnosticoLex)');
  
  return diagnostico;
}

// Executar diagnóstico após carregamento
setTimeout(() => {
  diagnosticarExtensaoLex();
}, 3000);

// Executar diagnóstico adicional após mais tempo
setTimeout(() => {
  console.log('🔄 Executando diagnóstico adicional após 10 segundos...');
  diagnosticarExtensaoLex();
}, 10000);

// Função para forçar criação do botão (para debug)
window.forcarCriacaoBotao = function() {
  console.log('Forçando criação do botão...');
  
  const botao = document.createElement('button');
  botao.id = 'pje-chat-toggle-debug';
  botao.innerHTML = '💬 DEBUG';
  botao.style.cssText = `
    position: fixed !important;
    top: 10px !important;
    right: 10px !important;
    background: red !important;
    color: white !important;
    padding: 10px !important;
    border: none !important;
    border-radius: 5px !important;
    cursor: pointer !important;
    z-index: 999999 !important;
  `;
  
  botao.onclick = function() {
    alert('Botão de debug funcionando!');
  };
  
  document.body.appendChild(botao);
  console.log('Botão de debug criado!');
};

console.log('Para forçar criação do botão, digite: forcarCriacaoBotao()');
// Função e
specífica para testar OpenAI Client
function testarOpenAIClient() {
  console.log('🧪 === TESTE ESPECÍFICO OPENAI CLIENT ===');
  
  const teste = {
    timestamp: new Date().toISOString(),
    clienteExiste: !!window.openaiClient,
    tentativasCarregamento: 0,
    maxTentativas: 20,
    intervalos: []
  };
  
  function verificarCliente() {
    teste.tentativasCarregamento++;
    const agora = Date.now();
    
    console.log(`🔄 Tentativa ${teste.tentativasCarregamento}/${teste.maxTentativas}`);
    
    if (window.openaiClient) {
      console.log('✅ OpenAI Client encontrado!');
      console.log('📊 Detalhes do cliente:');
      console.log('   - Tipo:', typeof window.openaiClient);
      console.log('   - Constructor:', window.openaiClient.constructor?.name);
      console.log('   - API Key configurada:', window.openaiClient.apiKey ? 'SIM' : 'NÃO');
      console.log('   - É placeholder:', window.openaiClient.apiKey === 'SUBSTITUA_PELA_SUA_CHAVE_OPENAI_AQUI');
      
      if (typeof window.openaiClient.isConfigured === 'function') {
        console.log('   - isConfigured():', window.openaiClient.isConfigured());
      }
      
      // Testar uma chamada simples
      if (typeof window.openaiClient.analisarDocumento === 'function') {
        console.log('🧪 Testando método analisarDocumento...');
        window.openaiClient.analisarDocumento({}, 'teste')
          .then(resposta => {
            console.log('✅ Método analisarDocumento funcionou:', resposta.substring(0, 100) + '...');
          })
          .catch(erro => {
            console.log('⚠️ Método analisarDocumento com erro (esperado se API key inválida):', erro.message);
          });
      }
      
      teste.clienteExiste = true;
      teste.tempoTotal = agora - teste.inicioTeste;
      console.log(`⏱️ Cliente carregado em ${teste.tempoTotal}ms`);
      
      window.testeOpenAI = teste;
      return;
    }
    
    if (teste.tentativasCarregamento >= teste.maxTentativas) {
      console.log('❌ OpenAI Client NÃO foi carregado após', teste.maxTentativas, 'tentativas');
      console.log('🔍 Possíveis causas:');
      console.log('   - Arquivo openai-client.js não foi carregado');
      console.log('   - Erro de JavaScript impedindo execução');
      console.log('   - Problema na ordem de carregamento dos scripts');
      console.log('   - Conflito de namespace');
      
      window.testeOpenAI = teste;
      return;
    }
    
    // Continuar verificando
    setTimeout(verificarCliente, 500);
  }
  
  teste.inicioTeste = Date.now();
  verificarCliente();
}

// Função para verificar carregamento de scripts
function verificarScriptsCarregados() {
  console.log('📜 === VERIFICAÇÃO DE SCRIPTS CARREGADOS ===');
  
  const scripts = document.querySelectorAll('script');
  const scriptsExtensao = [];
  
  scripts.forEach((script, index) => {
    const src = script.src;
    if (src && (src.includes('openai-client') || src.includes('content-simple') || src.includes('content.js'))) {
      scriptsExtensao.push({
        index,
        src,
        loaded: script.readyState || 'unknown'
      });
    }
  });
  
  console.log('📋 Scripts da extensão encontrados:', scriptsExtensao);
  
  // Verificar se os scripts estão na ordem correta
  const openaiScript = scriptsExtensao.find(s => s.src.includes('openai-client'));
  const contentScript = scriptsExtensao.find(s => s.src.includes('content'));
  
  if (openaiScript && contentScript) {
    if (openaiScript.index < contentScript.index) {
      console.log('✅ Ordem dos scripts correta: openai-client.js carrega antes do content script');
    } else {
      console.log('❌ PROBLEMA: content script carrega antes do openai-client.js');
      console.log('   Isso pode causar problemas de dependência!');
    }
  }
  
  return scriptsExtensao;
}

// Executar testes específicos
setTimeout(() => {
  verificarScriptsCarregados();
  testarOpenAIClient();
}, 1000);

// Função para debug manual
window.debugLexChat = function() {
  console.log('🔧 === DEBUG MANUAL LEX CHAT ===');
  diagnosticarExtensaoLex();
  verificarScriptsCarregados();
  testarOpenAIClient();
};
/
/ Função para testar extração de informações
function testarExtracao() {
  console.log('📄 === TESTE DE EXTRAÇÃO DE INFORMAÇÕES ===');
  
  const info = {};
  const texto = document.body.innerText;
  
  // Testar extração de número do processo
  const numeroMatch = texto.match(/(\d{7}-\d{2}\.\d{4}\.\d{1}\.\d{2}\.\d{4})/g);
  if (numeroMatch) {
    info.numeroProcesso = numeroMatch[0];
    console.log('✅ Número do processo encontrado:', info.numeroProcesso);
  } else {
    console.log('❌ Número do processo não encontrado');
  }
  
  // Testar detecção de tribunal
  if (window.location.href.includes('tjsp')) {
    info.tribunal = 'TJSP';
  } else if (window.location.href.includes('tjpa')) {
    info.tribunal = 'TJPA';
  } else if (window.location.href.includes('pje.jus.br')) {
    info.tribunal = 'PJe Nacional';
  }
  
  if (info.tribunal) {
    console.log('✅ Tribunal identificado:', info.tribunal);
  } else {
    console.log('❌ Tribunal não identificado');
  }
  
  // Testar detecção de documentos
  const embeds = document.querySelectorAll('embed, iframe');
  console.log(`📋 Elementos embed/iframe encontrados: ${embeds.length}`);
  
  embeds.forEach((embed, index) => {
    const src = embed.src || embed.getAttribute('src');
    if (src && (src.includes('documento') || src.includes('pdf'))) {
      console.log(`✅ Documento ${index + 1} encontrado:`, src);
    }
  });
  
  // Salvar resultado
  window.infoExtraida = info;
  console.log('💾 Informações extraídas salvas em window.infoExtraida');
  
  return info;
}

// Função para corrigir problemas comuns
function corrigirProblemas() {
  console.log('🔧 === TENTATIVA DE CORREÇÃO DE PROBLEMAS ===');
  
  // 1. Verificar se OpenAI client não existe e tentar recriar
  if (!window.openaiClient) {
    console.log('🔄 Tentando recriar OpenAI Client...');
    
    // Tentar executar o código do openai-client.js manualmente
    try {
      // Verificar se a classe OpenAIClient existe
      if (typeof OpenAIClient !== 'undefined') {
        window.openaiClient = new OpenAIClient();
        console.log('✅ OpenAI Client recriado com sucesso!');
      } else {
        console.log('❌ Classe OpenAIClient não encontrada');
      }
    } catch (error) {
      console.log('❌ Erro ao recriar OpenAI Client:', error);
    }
  }
  
  // 2. Verificar se botão não existe e tentar recriar
  const botaoExiste = document.querySelector('.lex-button') || document.querySelector('[id^="pje-assistant-btn-"]');
  if (!botaoExiste) {
    console.log('🔄 Tentando recriar botão da extensão...');
    
    try {
      // Criar botão simples de emergência
      const botaoEmergencia = document.createElement('button');
      botaoEmergencia.id = 'lex-emergency-button';
      botaoEmergencia.innerHTML = '🆘 Lex';
      botaoEmergencia.style.cssText = `
        position: fixed !important;
        top: 10px !important;
        right: 10px !important;
        background: #ff4444 !important;
        color: white !important;
        padding: 10px !important;
        border: none !important;
        border-radius: 5px !important;
        cursor: pointer !important;
        z-index: 999999 !important;
        font-weight: bold !important;
      `;
      
      botaoEmergencia.onclick = function() {
        alert('Botão de emergência da Lex ativado!\n\nVerifique o console para diagnósticos.');
        debugLexChat();
      };
      
      document.body.appendChild(botaoEmergencia);
      console.log('✅ Botão de emergência criado!');
    } catch (error) {
      console.log('❌ Erro ao criar botão de emergência:', error);
    }
  }
  
  console.log('🔧 Correções aplicadas. Execute debugLexChat() para verificar.');
}