/**
 * SCRIPT V2: Download do PDF Completo dos Autos
 *
 * Baseado na descoberta: O botão está em um dropdown com title="Download autos do processo"
 * Precisamos clicar no dropdown e então selecionar a opção de download completo
 */

console.log('🔍 LEX: Buscando dropdown de download dos autos...');

// ========================================
// PASSO 1: Encontrar o botão dropdown
// ========================================
const btnDropdown = document.querySelector('a[title="Download autos do processo"]');

if (!btnDropdown) {
  console.error('❌ Botão dropdown não encontrado!');
  console.log('Procurando alternativas...');

  // Alternativa: buscar por classe
  const alternativo = document.querySelector('.filtros-download .dropdown-toggle');
  if (alternativo) {
    console.log('✅ Botão alternativo encontrado:', alternativo);
  }
} else {
  console.log('✅ Dropdown encontrado:', btnDropdown);

  // Salvar referência global
  window.LEX_BTN_DOWNLOAD_DROPDOWN = btnDropdown;
}

// ========================================
// PASSO 2: Encontrar o container do dropdown
// ========================================
const dropdownContainer = document.querySelector('.filtros-download');

if (dropdownContainer) {
  console.log('✅ Container do dropdown encontrado:', dropdownContainer);

  // Buscar o menu dropdown (filho)
  const dropdownMenu = dropdownContainer.querySelector('.dropdown-menu');

  if (dropdownMenu) {
    console.log('✅ Menu dropdown encontrado:', dropdownMenu);
    console.log('📋 Conteúdo do menu:', dropdownMenu.innerHTML);

    // Listar todas as opções
    const opcoes = dropdownMenu.querySelectorAll('a, button, input, label, .form-group');
    console.log(`\n📋 ${opcoes.length} elementos no menu de download:`);

    opcoes.forEach((opcao, i) => {
      const tipo = opcao.tagName;
      const texto = opcao.textContent.trim();
      const classes = opcao.className;

      console.log(`${i + 1}. [${tipo}] "${texto.substring(0, 60)}" - Class: ${classes}`);
      console.log('   Elemento:', opcao);
    });

    // Salvar referência
    window.LEX_DROPDOWN_MENU = dropdownMenu;

  } else {
    console.warn('⚠️ Menu dropdown não encontrado dentro do container');
  }

} else {
  console.error('❌ Container .filtros-download não encontrado');
}

// ========================================
// PASSO 3: Analisar estrutura completa do dropdown
// ========================================
console.log('\n\n📋 ESTRUTURA COMPLETA DO DROPDOWN:');

if (dropdownContainer) {
  console.log(dropdownContainer.outerHTML);
}

// ========================================
// PASSO 4: Procurar por form/select de tipo de documento
// ========================================
console.log('\n\n📋 BUSCANDO FORMULÁRIO DE DOWNLOAD:');

const forms = dropdownContainer?.querySelectorAll('form') || [];
console.log(`✅ ${forms.length} formulários encontrados`);

forms.forEach((form, i) => {
  console.log(`\nFormulário ${i + 1}:`, form);

  // Buscar selects
  const selects = form.querySelectorAll('select');
  selects.forEach(select => {
    console.log('  Select encontrado:', select.name, select.id);
    console.log('  Opções:', Array.from(select.options).map(o => o.text));
  });

  // Buscar checkboxes
  const checkboxes = form.querySelectorAll('input[type="checkbox"]');
  checkboxes.forEach(cb => {
    console.log('  Checkbox:', cb.name, cb.value, 'Label:', cb.nextElementSibling?.textContent);
  });

  // Buscar botão de submit
  const submitBtn = form.querySelector('button[type="submit"], input[type="submit"], a[onclick*="submit"]');
  if (submitBtn) {
    console.log('  Botão submit:', submitBtn);
  }
});

// ========================================
// PASSO 5: Criar função para abrir dropdown
// ========================================
window.lexAbrirDropdownDownload = function() {
  console.log('📂 LEX: Abrindo dropdown de download...');

  const btn = window.LEX_BTN_DOWNLOAD_DROPDOWN || document.querySelector('a[title="Download autos do processo"]');

  if (!btn) {
    console.error('❌ Botão não encontrado');
    return false;
  }

  // Método 1: Clicar no botão
  console.log('Tentando clicar no botão...');
  btn.click();

  setTimeout(() => {
    const menu = document.querySelector('.filtros-download .dropdown-menu');
    if (menu && menu.style.display !== 'none') {
      console.log('✅ Dropdown aberto com sucesso!');
      console.log('Menu:', menu);
      return true;
    } else {
      // Método 2: Toggle da classe
      console.log('Tentando toggle da classe...');
      const container = document.querySelector('.filtros-download');
      if (container) {
        container.classList.toggle('open');
        console.log('✅ Classe "open" toggleada');
        return true;
      }
    }

    console.warn('⚠️ Não foi possível abrir o dropdown');
    return false;
  }, 100);
};

// ========================================
// PASSO 6: Função para baixar PDF completo
// ========================================
window.lexBaixarPDFCompleto = function(opcoes = {}) {
  console.log('📥 LEX: Iniciando download do PDF completo dos autos...');

  // Abrir dropdown primeiro
  window.lexAbrirDropdownDownload();

  setTimeout(() => {
    const menu = window.LEX_DROPDOWN_MENU || document.querySelector('.filtros-download .dropdown-menu');

    if (!menu) {
      console.error('❌ Menu dropdown não encontrado');
      return false;
    }

    // Procurar formulário de download
    const form = menu.querySelector('form');

    if (!form) {
      console.error('❌ Formulário não encontrado no dropdown');
      return false;
    }

    console.log('✅ Formulário encontrado:', form);

    // Configurar opções (se necessário)
    // Ex: tipo de documento, incluir assinaturas, etc.

    // Buscar botão de submit
    const btnSubmit = form.querySelector('button[type="submit"], input[type="submit"], a[id*="baixar"], a[id*="download"]');

    if (btnSubmit) {
      console.log('✅ Botão de download encontrado:', btnSubmit);
      console.log('🎯 Clicando para iniciar download...');
      btnSubmit.click();
      return true;
    } else {
      console.error('❌ Botão de submit não encontrado');
      console.log('Elementos do form:', form.innerHTML);
      return false;
    }
  }, 200);
};

// ========================================
// RESUMO
// ========================================
console.log('\n\n═══════════════════════════════════════════════════════════');
console.log('📊 RESUMO');
console.log('═══════════════════════════════════════════════════════════');
console.log('✅ Dropdown encontrado:', !!btnDropdown);
console.log('✅ Container encontrado:', !!dropdownContainer);
console.log('\n🎯 FUNÇÕES DISPONÍVEIS:');
console.log('   1. window.lexAbrirDropdownDownload() - Abre o menu de download');
console.log('   2. window.lexBaixarPDFCompleto() - Baixa o PDF completo automaticamente');
console.log('\n💡 PRÓXIMO PASSO:');
console.log('   Execute: window.lexAbrirDropdownDownload()');
console.log('   Depois analise as opções disponíveis');
console.log('═══════════════════════════════════════════════════════════');
