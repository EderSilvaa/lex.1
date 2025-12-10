// Diagnóstico de Carregamento da Extensão
// Execute no console da página do PJe

console.log('=== DIAGNÓSTICO EXTENSÃO LEX ===\n');

// 1. Verificar se elementos LEX existem mas scripts não
console.log('1️⃣ VERIFICANDO INCONSISTÊNCIA:');
const lexElements = document.querySelectorAll('[id*="lex"], [class*="lex"]');
console.log('Elementos LEX no DOM:', lexElements.length);
console.log('Scripts chrome-extension:', document.querySelectorAll('script[src*="chrome-extension"]').length);
console.log('window.DocumentCache:', typeof window.DocumentCache);

if (lexElements.length > 0 && typeof window.DocumentCache === 'undefined') {
  console.log('\n⚠️ PROBLEMA DETECTADO:');
  console.log('Elementos LEX existem MAS scripts não foram carregados!');
  console.log('Isso indica que a extensão foi carregada antes mas não está mais ativa.');
}

// 2. Listar alguns elementos LEX
console.log('\n2️⃣ PRIMEIROS 10 ELEMENTOS LEX:');
Array.from(lexElements).slice(0, 10).forEach((el, i) => {
  console.log(`${i + 1}. <${el.tagName.toLowerCase()}> id="${el.id}" class="${el.className}"`);
});

// 3. Verificar se há chat/interface do LEX
console.log('\n3️⃣ INTERFACE DO LEX:');
const chatContainer = document.getElementById('lex-chat-container');
const agentUI = document.getElementById('lex-agent-ui');
const modal = document.querySelector('.lex-modal');

console.log('Chat container:', chatContainer ? '✅ Existe' : '❌ Não existe');
console.log('Agent UI:', agentUI ? '✅ Existe' : '❌ Não existe');
console.log('Modal:', modal ? '✅ Existe' : '❌ Não existe');

// 4. Verificar CSS da extensão
console.log('\n4️⃣ CSS DA EXTENSÃO:');
const lexStyles = Array.from(document.styleSheets).filter(sheet => {
  try {
    return sheet.href && sheet.href.includes('chrome-extension');
  } catch (e) {
    return false;
  }
});
console.log('Folhas de estilo da extensão:', lexStyles.length);
lexStyles.forEach((sheet, i) => {
  console.log(`${i + 1}. ${sheet.href}`);
});

// 5. Verificar erros no console
console.log('\n5️⃣ VERIFICAR ERROS:');
console.log('Abra a aba "Console" e procure por mensagens em VERMELHO');
console.log('Especialmente erros relacionados a:');
console.log('  - chrome-extension://...');
console.log('  - Failed to load resource');
console.log('  - Content Security Policy');
console.log('  - CORS');

// 6. Teste de injeção manual
console.log('\n6️⃣ TESTE DE CARGA DOS SCRIPTS:');
console.log('Vou tentar verificar se os arquivos da extensão existem...');

// Pegar ID da extensão dos elementos existentes
const lexElement = lexElements[0];
if (lexElement) {
  const computedStyle = window.getComputedStyle(lexElement);
  console.log('Estilo computado do primeiro elemento LEX:', computedStyle.display);
}

// 7. Verificar manifest da extensão
console.log('\n7️⃣ INFORMAÇÕES DA EXTENSÃO:');
console.log('Para verificar a extensão:');
console.log('1. Abra: chrome://extensions');
console.log('2. Ative "Modo do desenvolvedor" (canto superior direito)');
console.log('3. Localize "Lex." e copie o ID (algo como: abcdefghijklmnopqrstuvwxyz)');
console.log('4. Verifique se tem erros (botão vermelho "Erros")');
console.log('5. Veja o "Service Worker" - deve estar "ativo"');

// 8. Estado do localStorage
console.log('\n8️⃣ DADOS NO LOCALSTORAGE:');
let lexKeys = 0;
for (let i = 0; i < localStorage.length; i++) {
  const key = localStorage.key(i);
  if (key?.startsWith('lex_')) {
    lexKeys++;
  }
}
console.log('Chaves LEX no localStorage:', lexKeys);

// 9. Verificar se página foi recarregada recentemente
console.log('\n9️⃣ PERFORMANCE TIMING:');
const perfData = performance.getEntriesByType('navigation')[0];
if (perfData) {
  console.log('Tipo de navegação:', perfData.type);
  console.log('Tempo desde carregamento:', ((Date.now() - perfData.fetchStart) / 1000).toFixed(1), 'segundos');
}

console.log('\n=== POSSÍVEIS CAUSAS ===');
console.log('1. Extensão foi desativada mas deixou elementos no DOM');
console.log('2. Erro ao carregar scripts (CSP, CORS, permissões)');
console.log('3. Scripts foram bloqueados por política de segurança');
console.log('4. Manifest.json tem erro na declaração de scripts');
console.log('5. Extensão precisa ser recarregada');

console.log('\n=== SOLUÇÃO RECOMENDADA ===');
console.log('1. Vá em chrome://extensions');
console.log('2. Encontre a extensão "Lex."');
console.log('3. Clique em "Recarregar" (ícone de reload)');
console.log('4. Verifique se há erros (botão "Erros")');
console.log('5. Volte aqui e pressione Ctrl+Shift+R (reload hard)');
console.log('6. Execute: console.log(typeof window.DocumentCache)');
console.log('   Deve mostrar: "function"');
