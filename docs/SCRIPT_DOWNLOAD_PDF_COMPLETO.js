/**
 * SCRIPT: Download do PDF Completo dos Autos
 *
 * Baseado na análise, encontramos 3 links de download de autos:
 * 1. "Download meus favoritos" (documentos marcados como favorito)
 * 2. "Download documentos com lembretes da unidade"
 * 3. "Download documentos com lembretes pra mim"
 *
 * Vamos buscar o botão de download COMPLETO dos autos
 */

console.log('🔍 LEX: Buscando botão de download do PDF completo...');

// ========================================
// MÉTODO 1: Buscar por onclick com "autos do processo"
// ========================================
console.log('\n📋 MÉTODO 1: Buscar por onclick com "autos do processo"...');

const botoesAutos = Array.from(document.querySelectorAll('a[onclick]')).filter(link => {
  const onclick = link.getAttribute('onclick') || '';
  const texto = link.textContent.trim();

  // Buscar confirmação de download de autos
  return onclick.includes('download dos autos') ||
         texto.toLowerCase().includes('download') ||
         onclick.includes('linkDownloadOculto');
});

console.log(`✅ ${botoesAutos.length} botões de download de autos encontrados:`);
botoesAutos.forEach((btn, i) => {
  const onclick = btn.getAttribute('onclick');
  const titulo = btn.getAttribute('title') || btn.textContent.trim();
  const id = btn.id;

  console.log(`\n${i + 1}. ${titulo}`);
  console.log(`   ID: ${id}`);
  console.log(`   Confirmação: ${onclick.match(/confirm\('([^']+)'/)?.[1] || 'N/A'}`);
  console.log(`   Elemento:`, btn);
});

// ========================================
// MÉTODO 2: Buscar no menu "Outras ações"
// ========================================
console.log('\n\n📋 MÉTODO 2: Buscar no menu dropdown "Outras ações"...');

// Procurar dropdown menu
const menuOutrasAcoes = Array.from(document.querySelectorAll('.dropdown-menu, [class*="dropdown"]')).find(menu => {
  return menu.textContent.includes('Outras ações') ||
         menu.textContent.includes('Juntar documentos');
});

if (menuOutrasAcoes) {
  console.log('✅ Menu "Outras ações" encontrado:', menuOutrasAcoes);

  // Listar todos os links do menu
  const linksMenu = menuOutrasAcoes.querySelectorAll('a');
  console.log(`📋 ${linksMenu.length} itens no menu:`);

  linksMenu.forEach((link, i) => {
    const texto = link.textContent.trim();
    if (texto.length > 0 && texto.length < 100) {
      console.log(`   ${i + 1}. ${texto}`, link);
    }
  });
} else {
  console.log('❌ Menu "Outras ações" não encontrado');
}

// ========================================
// MÉTODO 3: Buscar por título/title attribute
// ========================================
console.log('\n\n📋 MÉTODO 3: Buscar por atributo title...');

const comTitle = Array.from(document.querySelectorAll('a[title*="download" i], a[title*="autos" i], a[title*="PDF" i]'));
console.log(`✅ ${comTitle.length} links com title relevante:`);

comTitle.forEach((link, i) => {
  console.log(`   ${i + 1}. Title: "${link.title}" - Texto: "${link.textContent.trim().substring(0, 40)}"`, link);
});

// ========================================
// MÉTODO 4: Identificar o link específico para download COMPLETO
// ========================================
console.log('\n\n📋 MÉTODO 4: Identificar link de download COMPLETO (não filtrado)...');

// Queremos o link que baixa TUDO, não apenas favoritos/lembretes
// Geralmente tem texto como "Baixar autos" ou "Download dos autos" SEM filtros

const linkCompleto = botoesAutos.find(btn => {
  const onclick = btn.getAttribute('onclick') || '';
  const titulo = btn.getAttribute('title') || '';
  const texto = btn.textContent.trim();

  // Excluir os que são filtrados (favoritos, lembretes)
  const ehFiltrado = onclick.includes('favorito') ||
                     onclick.includes('lembrete') ||
                     texto.toLowerCase().includes('favorito') ||
                     texto.toLowerCase().includes('lembrete');

  // Queremos o genérico de "autos do processo"
  const ehCompleto = onclick.includes('autos do processo') &&
                     !ehFiltrado;

  return ehCompleto;
});

if (linkCompleto) {
  console.log('✅ LINK DE DOWNLOAD COMPLETO ENCONTRADO:');
  console.log('   ID:', linkCompleto.id);
  console.log('   Title:', linkCompleto.title);
  console.log('   Texto:', linkCompleto.textContent.trim());
  console.log('   Elemento:', linkCompleto);

  // Salvar referência global para fácil acesso
  window.LEX_DOWNLOAD_COMPLETO = linkCompleto;

  console.log('\n💡 Link salvo em: window.LEX_DOWNLOAD_COMPLETO');
  console.log('💡 Para baixar, execute: window.LEX_DOWNLOAD_COMPLETO.click()');

} else {
  console.log('⚠️ Link de download completo NÃO encontrado automaticamente');
  console.log('📝 Verifique manualmente os links acima');
}

// ========================================
// MÉTODO 5: Buscar na aba "Autos" (tab ativa)
// ========================================
console.log('\n\n📋 MÉTODO 5: Buscar botões na aba "Autos"...');

const abaAutos = document.querySelector('#autosDigitais_lbl') ||
                 document.querySelector('[id*="autosDigitais"]');

if (abaAutos) {
  console.log('✅ Aba "Autos" encontrada:', abaAutos);

  // Buscar container da aba
  const containerAutos = abaAutos.closest('.rich-tab-panel') ||
                         document.querySelector('[id*="autosDigitais"]').closest('div');

  if (containerAutos) {
    const botoesNaAba = containerAutos.querySelectorAll('a[href*="download"], a[onclick*="download"], button');
    console.log(`📋 ${botoesNaAba.length} botões/links encontrados na aba:`, botoesNaAba);
  }
}

// ========================================
// MÉTODO 6: Listar TODOS os links com ícone de download
// ========================================
console.log('\n\n📋 MÉTODO 6: Links com ícone de download...');

const iconeDownload = document.querySelector('.filtros-download, [class*="download"]');
if (iconeDownload) {
  console.log('✅ Container de download encontrado:', iconeDownload);

  // Buscar dropdown associado
  const dropdown = iconeDownload.querySelector('.dropdown-menu') ||
                   iconeDownload.nextElementSibling;

  if (dropdown) {
    console.log('✅ Dropdown de opções de download:', dropdown);
    const opcoes = dropdown.querySelectorAll('a, button');
    console.log(`📋 ${opcoes.length} opções de download:`);

    opcoes.forEach((opcao, i) => {
      console.log(`   ${i + 1}. ${opcao.textContent.trim()}`, opcao);
    });

    // Salvar referência
    window.LEX_DROPDOWN_DOWNLOAD = dropdown;
    console.log('\n💡 Dropdown salvo em: window.LEX_DROPDOWN_DOWNLOAD');
  }
}

// ========================================
// RESUMO E INSTRUÇÕES
// ========================================
console.log('\n\n═══════════════════════════════════════════════════════════');
console.log('📊 RESUMO E PRÓXIMOS PASSOS');
console.log('═══════════════════════════════════════════════════════════');

if (window.LEX_DOWNLOAD_COMPLETO) {
  console.log('✅ Link de download identificado!');
  console.log('\n🎯 PARA BAIXAR O PDF COMPLETO:');
  console.log('   window.LEX_DOWNLOAD_COMPLETO.click()');
  console.log('\n🎯 PARA VER O LINK:');
  console.log('   console.log(window.LEX_DOWNLOAD_COMPLETO)');
} else {
  console.log('⚠️ Link automático não encontrado');
  console.log('\n📝 OPÇÕES MANUAIS:');
  console.log('1. Verifique os links listados acima');
  console.log('2. Identifique qual é o download completo (sem filtros)');
  console.log('3. Execute: linkEncontrado.click()');
}

console.log('\n💡 DICA: O botão geralmente está no menu dropdown do ícone de download');
console.log('    no header superior, próximo aos outros ícones de ação');
console.log('═══════════════════════════════════════════════════════════');

// ========================================
// FUNÇÃO HELPER: Baixar PDF Completo
// ========================================
window.lexBaixarPDFCompleto = function() {
  console.log('📥 LEX: Iniciando download do PDF completo...');

  if (window.LEX_DOWNLOAD_COMPLETO) {
    console.log('✅ Clicando no link de download...');
    window.LEX_DOWNLOAD_COMPLETO.click();
    return true;
  } else {
    console.error('❌ Link de download não encontrado. Execute o script de busca novamente.');
    return false;
  }
};

console.log('\n💡 FUNÇÃO CRIADA: window.lexBaixarPDFCompleto()');
console.log('   Execute para baixar o PDF automaticamente');
