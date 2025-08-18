#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('🔨 Iniciando build do LEX Extension com TypeScript...');

// Limpar diretório dist
if (fs.existsSync('dist')) {
  fs.rmSync('dist', { recursive: true, force: true });
  console.log('🧹 Diretório dist limpo');
}

// Compilar TypeScript
console.log('📦 Compilando TypeScript...');
try {
  execSync('npx tsc', { stdio: 'inherit' });
  console.log('✅ TypeScript compilado com sucesso');
} catch (error) {
  console.error('❌ Erro na compilação TypeScript:', error.message);
  process.exit(1);
}

// Copiar arquivos estáticos
console.log('📁 Copiando arquivos estáticos...');

const staticFiles = [
  { src: 'src/html', dest: 'dist/html' },
  { src: 'src/js/pdf.min.js', dest: 'dist/js/pdf.min.js' },
  { src: 'src/js/pdf.worker.min.js', dest: 'dist/js/pdf.worker.min.js' },
  { src: 'styles', dest: 'dist/styles' },
  { src: 'manifest-ts.json', dest: 'dist/manifest.json' }
];

function copyRecursive(src, dest) {
  if (fs.statSync(src).isDirectory()) {
    if (!fs.existsSync(dest)) {
      fs.mkdirSync(dest, { recursive: true });
    }
    fs.readdirSync(src).forEach(file => {
      copyRecursive(path.join(src, file), path.join(dest, file));
    });
  } else {
    const destDir = path.dirname(dest);
    if (!fs.existsSync(destDir)) {
      fs.mkdirSync(destDir, { recursive: true });
    }
    fs.copyFileSync(src, dest);
  }
}

staticFiles.forEach(({ src, dest }) => {
  if (fs.existsSync(src)) {
    copyRecursive(src, dest);
    console.log(`  ✅ ${src} -> ${dest}`);
  } else {
    console.warn(`  ⚠️ ${src} não encontrado, pulando...`);
  }
});

// Atualizar manifest para usar arquivos compilados
const manifestPath = 'dist/manifest.json';
if (fs.existsSync(manifestPath)) {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  
  // Atualizar web_accessible_resources para incluir arquivos compilados
  if (manifest.web_accessible_resources) {
    manifest.web_accessible_resources[0].resources = manifest.web_accessible_resources[0].resources.map(resource => {
      if (resource.startsWith('src/js/') && !resource.includes('pdf.')) {
        return resource.replace('src/js/', 'dist/js/');
      }
      return resource;
    });
  }
  
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  console.log('✅ Manifest atualizado');
}

console.log('🎉 Build concluído com sucesso!');
console.log('📂 Arquivos compilados estão em: ./dist/');
console.log('🚀 Para testar: carregue a pasta ./dist/ como extensão no Chrome');