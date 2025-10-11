/**
 * SCRIPT FINAL: Download Automático do PDF Completo dos Autos
 *
 * Descobertas:
 * - Dropdown: a[title="Download autos do processo"]
 * - Botão download: input#navbar:j_id255
 * - Filtros disponíveis: Tipo doc, ID, Período, Cronologia, Expediente, Movimentos
 *
 * Para PDF COMPLETO: Deixar todos os filtros vazios/padrão
 */

console.log('📥 LEX: Script de Download do PDF Completo dos Autos');

// ========================================
// FUNÇÃO PRINCIPAL: Baixar PDF Completo
// ========================================
window.lexBaixarPDFCompleto = function(opcoes = {}) {
  console.log('🚀 LEX: Iniciando download do PDF completo...');

  // PASSO 1: Abrir dropdown
  const btnDropdown = document.querySelector('a[title="Download autos do processo"]');

  if (!btnDropdown) {
    console.error('❌ Botão dropdown não encontrado');
    return false;
  }

  console.log('✅ Abrindo dropdown...');
  btnDropdown.click();

  // Aguardar dropdown abrir
  setTimeout(() => {
    console.log('✅ Dropdown aberto');

    // PASSO 2: Configurar filtros para PDF COMPLETO
    console.log('⚙️ Configurando para download completo...');

    // Tipo de documento: "Selecione" (todos)
    const selectTipo = document.getElementById('navbar:cbTipoDocumento');
    if (selectTipo) {
      selectTipo.value = '0'; // Selecione (todos)
      console.log('✅ Tipo: Todos os documentos');
    }

    // ID: Deixar vazio (todos)
    const idDe = document.getElementById('navbar:idDe');
    const idAte = document.getElementById('navbar:idAte');
    if (idDe) idDe.value = '';
    if (idAte) idAte.value = '';
    console.log('✅ ID: Todos');

    // Período: Deixar vazio (todos)
    const dtInicio = document.getElementById('navbar:dtInicioInputDate');
    const dtFim = document.getElementById('navbar:dtFimInputDate');
    if (dtInicio) dtInicio.value = '';
    if (dtFim) dtFim.value = '';
    console.log('✅ Período: Todos');

    // Cronologia: Aplicar preferência do usuário
    const selectCronologia = document.getElementById('navbar:cbCronologia');
    if (selectCronologia) {
      const cronologia = opcoes.cronologia || 'Decrescente'; // Padrão: mais recente primeiro
      selectCronologia.value = cronologia;
      console.log(`✅ Cronologia: ${cronologia}`);
    }

    // Incluir expediente
    const selectExpediente = document.getElementById('navbar:cbExpediente');
    if (selectExpediente) {
      const expediente = opcoes.incluirExpediente !== false ? 'Sim' : 'Não'; // Padrão: Sim
      selectExpediente.value = expediente;
      console.log(`✅ Expediente: ${expediente}`);
    }

    // Incluir movimentos
    const selectMovimentos = document.getElementById('navbar:cbMovimentos');
    if (selectMovimentos) {
      const movimentos = opcoes.incluirMovimentos !== false ? 'Sim' : 'Não'; // Padrão: Sim
      selectMovimentos.value = movimentos;
      console.log(`✅ Movimentos: ${movimentos}`);
    }

    // PASSO 3: Clicar no botão de download
    console.log('🎯 Iniciando download...');

    const btnDownload = document.getElementById('navbar:j_id255');

    if (!btnDownload) {
      console.error('❌ Botão de download não encontrado');
      return false;
    }

    console.log('✅ Botão encontrado, clicando...');
    btnDownload.click();

    console.log('✅ Download iniciado!');
    console.log('⏳ Aguarde o processamento do PDF (pode demorar alguns minutos)...');

    return true;

  }, 300); // Aguardar 300ms para dropdown abrir

  return true;
};

// ========================================
// FUNÇÃO: Baixar PDF com Filtros Customizados
// ========================================
window.lexBaixarPDFFiltrado = function(filtros = {}) {
  console.log('🚀 LEX: Iniciando download com filtros customizados...');
  console.log('Filtros:', filtros);

  const btnDropdown = document.querySelector('a[title="Download autos do processo"]');
  if (!btnDropdown) {
    console.error('❌ Botão dropdown não encontrado');
    return false;
  }

  btnDropdown.click();

  setTimeout(() => {
    // Aplicar filtros customizados

    // Tipo de documento
    if (filtros.tipoDocumento) {
      const select = document.getElementById('navbar:cbTipoDocumento');
      if (select) {
        select.value = filtros.tipoDocumento;
        console.log(`✅ Tipo: ${select.options[select.selectedIndex].text}`);
      }
    }

    // Range de ID
    if (filtros.idDe) {
      const input = document.getElementById('navbar:idDe');
      if (input) input.value = filtros.idDe;
    }

    if (filtros.idAte) {
      const input = document.getElementById('navbar:idAte');
      if (input) input.value = filtros.idAte;
    }

    // Período
    if (filtros.dataInicio) {
      const input = document.getElementById('navbar:dtInicioInputDate');
      if (input) input.value = filtros.dataInicio;
    }

    if (filtros.dataFim) {
      const input = document.getElementById('navbar:dtFimInputDate');
      if (input) input.value = filtros.dataFim;
    }

    // Cronologia
    if (filtros.cronologia) {
      const select = document.getElementById('navbar:cbCronologia');
      if (select) select.value = filtros.cronologia;
    }

    // Expediente e Movimentos
    if (filtros.incluirExpediente !== undefined) {
      const select = document.getElementById('navbar:cbExpediente');
      if (select) select.value = filtros.incluirExpediente ? 'Sim' : 'Não';
    }

    if (filtros.incluirMovimentos !== undefined) {
      const select = document.getElementById('navbar:cbMovimentos');
      if (select) select.value = filtros.incluirMovimentos ? 'Sim' : 'Não';
    }

    // Clicar em download
    const btnDownload = document.getElementById('navbar:j_id255');
    if (btnDownload) {
      btnDownload.click();
      console.log('✅ Download iniciado com filtros customizados!');
    }

  }, 300);

  return true;
};

// ========================================
// FUNÇÃO: Obter Tipos de Documento Disponíveis
// ========================================
window.lexObterTiposDocumento = function() {
  const select = document.getElementById('navbar:cbTipoDocumento');

  if (!select) {
    console.error('❌ Select de tipo de documento não encontrado');
    return [];
  }

  const tipos = Array.from(select.options).map(option => ({
    valor: option.value,
    texto: option.text
  }));

  console.log('📋 Tipos de documento disponíveis:');
  tipos.forEach((tipo, i) => {
    console.log(`  ${i + 1}. [${tipo.valor}] ${tipo.texto}`);
  });

  return tipos;
};

// ========================================
// RESUMO E INSTRUÇÕES
// ========================================
console.log('\n\n═══════════════════════════════════════════════════════════');
console.log('📊 FUNÇÕES DISPONÍVEIS');
console.log('═══════════════════════════════════════════════════════════');
console.log('\n🎯 1. DOWNLOAD COMPLETO (TODOS OS DOCUMENTOS):');
console.log('   window.lexBaixarPDFCompleto()');
console.log('\n   Opções:');
console.log('   window.lexBaixarPDFCompleto({');
console.log('     cronologia: "Crescente",      // ou "Decrescente" (padrão)');
console.log('     incluirExpediente: true,      // true (padrão) ou false');
console.log('     incluirMovimentos: true       // true (padrão) ou false');
console.log('   })');

console.log('\n🎯 2. DOWNLOAD FILTRADO:');
console.log('   window.lexBaixarPDFFiltrado({');
console.log('     tipoDocumento: "57",          // ID do tipo (ex: 57 = Certidão)');
console.log('     idDe: "100",                  // ID inicial');
console.log('     idAte: "200",                 // ID final');
console.log('     dataInicio: "01/01/2024",    // Data início (DD/MM/AAAA)');
console.log('     dataFim: "31/12/2024",       // Data fim (DD/MM/AAAA)');
console.log('     cronologia: "Decrescente",   // Crescente ou Decrescente');
console.log('     incluirExpediente: true,     // true ou false');
console.log('     incluirMovimentos: true      // true ou false');
console.log('   })');

console.log('\n🎯 3. LISTAR TIPOS DE DOCUMENTO:');
console.log('   window.lexObterTiposDocumento()');

console.log('\n═══════════════════════════════════════════════════════════');
console.log('💡 EXEMPLO DE USO RÁPIDO:');
console.log('═══════════════════════════════════════════════════════════');
console.log('\n   // Baixar PDF completo de todos os documentos');
console.log('   window.lexBaixarPDFCompleto()');
console.log('\n   // Baixar apenas sentenças');
console.log('   window.lexBaixarPDFFiltrado({ tipoDocumento: "62" })');
console.log('\n   // Baixar documentos de 2024');
console.log('   window.lexBaixarPDFFiltrado({');
console.log('     dataInicio: "01/01/2024",');
console.log('     dataFim: "31/12/2024"');
console.log('   })');
console.log('\n═══════════════════════════════════════════════════════════');

console.log('\n✅ Script carregado! Execute as funções acima para baixar PDFs.');
