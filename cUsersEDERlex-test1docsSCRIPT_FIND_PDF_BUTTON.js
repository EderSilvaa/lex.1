/**
 * SCRIPT DE DESCOBERTA: Botão de Download PDF Completo do PJE
 * 
 * Objetivo: Encontrar o botão que baixa o PDF gigante com todos os documentos
 * Localização: Menu dropdown no header do PJE
 */

console.log('🔍 LEX: Iniciando busca pelo botão de PDF completo...');

// ========================================
// ESTRATÉGIA 1: Buscar por texto comum
// ========================================
console.log('\n📋 ESTRATÉGIA 1: Buscar por texto...');

const textosComuns = [
  'Baixar autos',
  'Download',
  'PDF completo',
  'Autos completos',
  'Baixar processo',
  'Exportar PDF',
  'Autos',
  'Processo completo',
  'Compilar autos'
];

textosComuns.forEach(texto => {
  const elementos = Array.from(document.querySelectorAll('*')).filter(el => {
    const textoEl = el.textContent.trim();
    return textoEl.includes(texto) && textoEl.length < 100;
  });
  
  if (elementos.length > 0) {
    console.log(`✅ Encontrado "${texto}":`, elementos);
    elementos.forEach((el, i) => {
      console.log(`  ${i + 1}. Tag: ${el.tagName}, Texto: "${el.textContent.trim()}"`, el);
    });
  }
});

// ========================================
// ESTRATÉGIA 2: Buscar dropdowns no header
// ========================================
console.log('\n📋 ESTRATÉGIA 2: Buscar dropdowns no header...');

const header = document.querySelector('header') || 
               document.querySelector('.header') ||
               document.querySelector('[class*="header"]') ||
               document.querySelector('[id*="header"]');

if (header) {
  console.log('✅ Header encontrado:', header);
  
  // Buscar elementos de dropdown
  const dropdowns = header.querySelectorAll('[class*="dropdown"], [class*="menu"], button, [role="button"]');
  console.log(`📦 ${dropdowns.length} elementos dropdown/button encontrados:`, dropdowns);
  
  dropdowns.forEach((el, i) => {
    console.log(`  ${i + 1}. ${el.tagName} - Class: "${el.className}" - Text: "${el.textContent.trim().substring(0, 50)}"`);
  });
} else {
  console.log('❌ Header não encontrado');
}

// ========================================
// ESTRATÉGIA 3: Buscar por ícones comuns
// ========================================
console.log('\n📋 ESTRATÉGIA 3: Buscar por ícones...');

const icones = document.querySelectorAll('i[class*="fa"], i[class*="icon"], svg, [class*="icon"]');
console.log(`🎨 ${icones.length} ícones encontrados no header`);

const iconesHeader = header ? Array.from(header.querySelectorAll('i, svg, [class*="icon"]')) : [];
iconesHeader.forEach((icone, i) => {
  const parent = icone.closest('a, button, [role="button"]');
  if (parent) {
    console.log(`  ${i + 1}. Ícone em ${parent.tagName}:`, parent.className, parent.textContent.trim());
  }
});

// ========================================
// ESTRATÉGIA 4: Buscar por atributos href/onclick
// ========================================
console.log('\n📋 ESTRATÉGIA 4: Buscar links com "pdf" ou "autos"...');

const linksPdf = Array.from(document.querySelectorAll('a[href*="pdf"], a[href*="autos"], a[href*="download"], a[href*="compilar"]'));
console.log(`🔗 ${linksPdf.length} links relacionados encontrados:`);
linksPdf.forEach((link, i) => {
  console.log(`  ${i + 1}. ${link.textContent.trim()} - href: ${link.href}`, link);
});

// ========================================
// ESTRATÉGIA 5: Buscar botões com eventos
// ========================================
console.log('\n📋 ESTRATÉGIA 5: Buscar botões com onclick...');

const botoesComClick = Array.from(document.querySelectorAll('[onclick*="pdf"], [onclick*="autos"], [onclick*="download"], [onclick*="compilar"]'));
console.log(`🖱️ ${botoesComClick.length} botões com onclick encontrados:`);
botoesComClick.forEach((btn, i) => {
  console.log(`  ${i + 1}. ${btn.tagName} - onclick: ${btn.getAttribute('onclick')}`, btn);
});

// ========================================
// ESTRATÉGIA 6: Listar TODOS os menus dropdown
// ========================================
console.log('\n📋 ESTRATÉGIA 6: Listar TODOS os dropdowns da página...');

const todosDropdowns = document.querySelectorAll('[class*="dropdown"], [class*="Dropdown"], ul[class*="menu"], .menu-item, [role="menu"]');
console.log(`📦 ${todosDropdowns.length} elementos de menu encontrados:`);

todosDropdowns.forEach((menu, i) => {
  const items = menu.querySelectorAll('li, a, button');
  console.log(`\n  MENU ${i + 1}:`, menu.className);
  items.forEach((item, j) => {
    console.log(`    ${j + 1}. ${item.textContent.trim().substring(0, 60)}`);
  });
});

// ========================================
// ESTRATÉGIA 7: Buscar por data-attributes
// ========================================
console.log('\n📋 ESTRATÉGIA 7: Buscar por data-attributes...');

const comDataAttr = Array.from(document.querySelectorAll('[data-action], [data-href], [data-url], [data-download]'));
const relacionados = comDataAttr.filter(el => {
  const attrs = Array.from(el.attributes).map(a => a.value.toLowerCase()).join(' ');
  return attrs.includes('pdf') || attrs.includes('autos') || attrs.includes('download');
});

console.log(`📊 ${relacionados.length} elementos com data-attributes relevantes:`);
relacionados.forEach((el, i) => {
  console.log(`  ${i + 1}. ${el.tagName} - Attributes:`, Array.from(el.attributes).map(a => `${a.name}="${a.value}"`).join(', '));
});

// ========================================
// ESTRATÉGIA 8: Estrutura do header completa
// ========================================
console.log('\n📋 ESTRATÉGIA 8: Estrutura completa do header...');

if (header) {
  console.log('🏗️ Estrutura do header (primeiros 3 níveis):');
  
  function printStructure(element, level = 0, maxLevel = 3) {
    if (level > maxLevel) return;
    
    const indent = '  '.repeat(level);
    const tag = element.tagName;
    const id = element.id ? `#${element.id}` : '';
    const classes = element.className ? `.${element.className.split(' ').join('.')}` : '';
    const text = element.childNodes.length === 1 && element.childNodes[0].nodeType === 3 
      ? ` - "${element.textContent.trim().substring(0, 30)}"` 
      : '';
    
    console.log(`${indent}${tag}${id}${classes}${text}`);
    
    Array.from(element.children).forEach(child => {
      printStructure(child, level + 1, maxLevel);
    });
  }
  
  printStructure(header);
}

// ========================================
// RESUMO E PRÓXIMOS PASSOS
// ========================================
console.log('\n\n═══════════════════════════════════════════════════════════');
console.log('📊 RESUMO DA BUSCA');
console.log('═══════════════════════════════════════════════════════════');
console.log('1. Verifique os logs acima para identificar o botão');
console.log('2. Procure por textos como "Baixar autos", "PDF completo", etc.');
console.log('3. Identifique o seletor CSS ou XPath do botão');
console.log('4. Teste clicando no elemento encontrado');
console.log('═══════════════════════════════════════════════════════════');

// HELPER: Função para testar clique em um elemento
console.log('\n💡 DICA: Para testar um elemento encontrado, use:');
console.log('   elementoEncontrado.click()');
console.log('\n   Ou se precisar de mais controle:');
console.log('   elementoEncontrado.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }))');
