# Fase 6: Build e Distribuição

**Duração estimada:** 1 dia (8 horas)
**Esforço:** Baixo-Médio
**Status:** ⏳ Pendente

---

## Objetivos

✅ Configurar electron-builder para produção
✅ Criar executável Windows (.exe)
✅ Testar instalação e desinstalação
✅ Preparar auto-update
✅ Criar documentação de distribuição
✅ Gerar primeira release

---

## Sub-tarefas Detalhadas

### 6.1 Configurar electron-builder (2 horas)

**Editar `package.json`:**

```json
{
  "name": "lex-desktop",
  "version": "1.0.0",
  "description": "LEX Agent - Assistente Jurídico Inteligente para PJe",
  "author": "LEX Team",
  "main": "src/main/main.js",

  "build": {
    "appId": "com.lexagent.desktop",
    "productName": "LEX Desktop",
    "copyright": "Copyright © 2025 LEX Team",

    "directories": {
      "output": "dist",
      "buildResources": "build"
    },

    "files": [
      "src/**/*",
      "assets/**/*",
      "node_modules/**/*",
      "package.json",
      ".env"
    ],

    "extraFiles": [
      {
        "from": "screenshots",
        "to": "screenshots",
        "filter": ["**/*"]
      }
    ],

    "win": {
      "target": [
        {
          "target": "nsis",
          "arch": ["x64"]
        },
        {
          "target": "portable",
          "arch": ["x64"]
        }
      ],
      "icon": "assets/icons/icon.ico",
      "publisherName": "LEX Team",
      "verifyUpdateCodeSignature": false
    },

    "nsis": {
      "oneClick": false,
      "allowToChangeInstallationDirectory": true,
      "allowElevation": true,
      "installerIcon": "assets/icons/icon.ico",
      "uninstallerIcon": "assets/icons/icon.ico",
      "installerHeaderIcon": "assets/icons/icon.ico",
      "createDesktopShortcut": true,
      "createStartMenuShortcut": true,
      "shortcutName": "LEX Desktop",
      "perMachine": false,
      "menuCategory": true
    },

    "portable": {
      "artifactName": "LEX-Desktop-Portable-${version}.exe"
    },

    "publish": {
      "provider": "github",
      "owner": "EderSilvaa",
      "repo": "lex-desktop",
      "private": false
    }
  },

  "scripts": {
    "start": "electron .",
    "dev": "electron . --dev",
    "build": "electron-builder",
    "build:win": "electron-builder --win --x64",
    "build:portable": "electron-builder --win portable",
    "build:all": "electron-builder -mwl",
    "dist": "npm run build:win",
    "pack": "electron-builder --dir",
    "postinstall": "electron-builder install-app-deps"
  }
}
```

**Checklist:**
- [ ] package.json configurado
- [ ] Targets definidos (nsis, portable)
- [ ] Ícones referenciados

---

### 6.2 Criar Ícones da Aplicação (90 min)

**Formatos necessários:**
- `icon.ico` (256×256, 128×128, 64×64, 48×48, 32×32, 16×16)
- `icon.png` (1024×1024 para build)
- `icon.icns` (para macOS, futuro)

**Opções:**

**A. Criar ícone customizado:**
- Usar Figma/Photoshop
- Design: Símbolo de balança + IA
- Cores: Roxo (#a855f7) e azul (#6366f1)

**B. Usar ferramentas online:**
- https://www.icoconverter.com/
- Converter PNG → ICO com múltiplos tamanhos

**C. Usar ícone placeholder:**
```bash
# Baixar ícone genérico de app jurídico temporariamente
```

**Salvar em:**
```
assets/icons/
├── icon.ico      # Windows
├── icon.png      # Build resources
└── icon.icns     # macOS (futuro)
```

**Checklist:**
- [ ] Ícones criados
- [ ] Formatos corretos
- [ ] Salvos no diretório assets/icons/

---

### 6.3 Preparar Arquivos de Build (30 min)

**Criar arquivos adicionais:**

#### A. LICENSE
```txt
MIT License

Copyright (c) 2025 LEX Team

Permission is hereby granted, free of charge, to any person obtaining a copy...
```

#### B. README.md (para distribuição)
```markdown
# LEX Desktop

Assistente Jurídico Inteligente para PJe

## Instalação

1. Baixe `LEX-Desktop-Setup-1.0.0.exe`
2. Execute o instalador
3. Siga as instruções na tela
4. Abra o LEX Desktop

## Requisitos

- Windows 10/11 (64-bit)
- 4GB RAM mínimo
- 500MB espaço em disco
- Conexão com internet

## Uso

1. Abra o LEX Desktop
2. Configure sua conta Supabase (se necessário)
3. Clique em "Abrir PJe" para começar
4. Use o chat para interagir com o assistente

## Suporte

- Email: suporte@lexagent.com
- GitHub: https://github.com/EderSilvaa/lex-desktop/issues
```

**Checklist:**
- [ ] LICENSE criado
- [ ] README criado
- [ ] Arquivos revisados

---

### 6.4 Primeiro Build de Produção (90 min)

**Comandos:**

```bash
cd c:\Users\EDER\lex-desktop

# Limpar builds anteriores
rmdir /s /q dist

# Build para Windows
npm run build:win

# Aguardar build (pode demorar 10-15 min na primeira vez)
```

**Saída esperada:**
```
dist/
├── LEX-Desktop-Setup-1.0.0.exe       # Instalador NSIS (~150 MB)
├── LEX-Desktop-1.0.0.exe             # Portable (~180 MB)
└── win-unpacked/                     # Arquivos não empacotados (para debug)
```

**Troubleshooting:**

**Erro: "Cannot find icon.ico"**
```bash
# Verificar caminho
dir assets\icons\icon.ico
```

**Erro: "ENOENT: no such file or directory"**
```bash
# Verificar se todos os arquivos foram copiados
# Verificar package.json "files" array
```

**Erro: "electron-builder command not found"**
```bash
npm install electron-builder --save-dev
```

**Checklist:**
- [ ] Build executado sem erros
- [ ] .exe gerado em dist/
- [ ] Tamanho do executável razoável (< 250 MB)

---

### 6.5 Testar Instalação (60 min)

**Processo de teste:**

1. **Instalar:**
   - Executar `LEX-Desktop-Setup-1.0.0.exe`
   - Escolher diretório de instalação
   - Aguardar instalação
   - Verificar atalhos criados (Desktop + Menu Iniciar)

2. **Primeiro Run:**
   - Abrir LEX Desktop
   - Verificar interface carrega
   - Testar funcionalidades básicas
   - Fechar aplicação

3. **Testar Persistência:**
   - Reabrir LEX Desktop
   - Verificar histórico mantido
   - Verificar configurações salvas

4. **Desinstalar:**
   - Painel de Controle → Programas
   - Desinstalar LEX Desktop
   - Verificar limpeza completa

**Checklist:**
- [ ] Instalação completa sem erros
- [ ] Atalhos criados
- [ ] App abre e funciona
- [ ] Dados persistem entre aberturas
- [ ] Desinstalação limpa

---

### 6.6 Configurar Auto-Update (90 min)

**Instalar dependência:**
```bash
npm install electron-updater --save
```

**Criar `src/main/updater.js`:**

```javascript
const { autoUpdater } = require('electron-updater');
const { dialog } = require('electron');

class UpdateManager {
  constructor(mainWindow) {
    this.mainWindow = mainWindow;
    this.autoUpdater = autoUpdater;
  }

  initialize() {
    // Configurar auto-updater
    this.autoUpdater.autoDownload = false;
    this.autoUpdater.autoInstallOnAppQuit = true;

    // Eventos
    this.autoUpdater.on('update-available', (info) => {
      console.log('📦 Atualização disponível:', info.version);
      this.showUpdateDialog(info);
    });

    this.autoUpdater.on('update-not-available', () => {
      console.log('✅ App está atualizado');
    });

    this.autoUpdater.on('download-progress', (progress) => {
      console.log(`⏬ Download: ${Math.round(progress.percent)}%`);
      this.mainWindow.webContents.send('update-progress', progress.percent);
    });

    this.autoUpdater.on('update-downloaded', () => {
      console.log('✅ Atualização baixada');
      this.showRestartDialog();
    });

    this.autoUpdater.on('error', (error) => {
      console.error('❌ Erro ao atualizar:', error);
    });
  }

  checkForUpdates() {
    console.log('🔍 Verificando atualizações...');
    this.autoUpdater.checkForUpdates();
  }

  showUpdateDialog(info) {
    dialog.showMessageBox(this.mainWindow, {
      type: 'info',
      title: 'Atualização Disponível',
      message: `Nova versão ${info.version} disponível!`,
      detail: 'Deseja baixar e instalar agora?',
      buttons: ['Sim', 'Depois']
    }).then((result) => {
      if (result.response === 0) {
        this.autoUpdater.downloadUpdate();
      }
    });
  }

  showRestartDialog() {
    dialog.showMessageBox(this.mainWindow, {
      type: 'info',
      title: 'Atualização Pronta',
      message: 'Atualização baixada com sucesso!',
      detail: 'O app será reiniciado para aplicar a atualização.',
      buttons: ['Reiniciar Agora', 'Depois']
    }).then((result) => {
      if (result.response === 0) {
        this.autoUpdater.quitAndInstall();
      }
    });
  }
}

module.exports = UpdateManager;
```

**Integrar em `main.js`:**

```javascript
const UpdateManager = require('./updater');

let updateManager;

app.whenReady().then(() => {
  createMainWindow();

  // Inicializar auto-update
  updateManager = new UpdateManager(mainWindow);
  updateManager.initialize();

  // Verificar atualizações após 5 segundos
  setTimeout(() => {
    updateManager.checkForUpdates();
  }, 5000);
});
```

**Configurar GitHub Releases:**

1. Criar repositório no GitHub: `lex-desktop`
2. Criar release com tag `v1.0.0`
3. Upload `LEX-Desktop-Setup-1.0.0.exe` como asset
4. Publicar release

**Gerar `latest.yml`:**
```bash
# electron-builder gera automaticamente
# Fazer upload de dist/latest.yml junto com .exe
```

**Checklist:**
- [ ] electron-updater instalado
- [ ] UpdateManager criado
- [ ] Auto-update configurado
- [ ] GitHub release criado

---

### 6.7 Criar Documentação de Distribuição (60 min)

**Criar `docs/DISTRIBUICAO.md`:**

```markdown
# Guia de Distribuição - LEX Desktop

## Build de Produção

### Pré-requisitos
- Node.js 18+
- npm ou yarn
- Git

### Processo de Build

1. **Preparar release:**
\`\`\`bash
# Atualizar versão
npm version patch  # 1.0.0 → 1.0.1

# Build
npm run build:win
\`\`\`

2. **Validar build:**
- Testar instalador
- Verificar funcionalidades
- Validar tamanho do executável

3. **Criar GitHub Release:**
\`\`\`bash
git tag v1.0.1
git push origin v1.0.1
\`\`\`

4. **Upload de assets:**
- `LEX-Desktop-Setup-1.0.1.exe`
- `latest.yml`
- `CHANGELOG.md`

## Versionamento

Seguir Semantic Versioning (semver.org):
- `MAJOR`.`MINOR`.`PATCH`
- 1.0.0: Release inicial
- 1.0.1: Bug fixes
- 1.1.0: Novas features
- 2.0.0: Breaking changes

## Distribuição

### Canais
1. **GitHub Releases** (primário)
2. **Site próprio** (futuro)
3. **Microsoft Store** (futuro)

### Checklist de Release
- [ ] Build testado
- [ ] CHANGELOG atualizado
- [ ] Tag criada
- [ ] Assets enviados
- [ ] Release notes escrito
- [ ] Comunicado aos usuários
```

**Checklist:**
- [ ] Documentação criada
- [ ] Processo documentado
- [ ] Checklists incluídos

---

### 6.8 Gerar CHANGELOG (30 min)

**Criar `CHANGELOG.md`:**

```markdown
# Changelog

Todas as mudanças notáveis do LEX Desktop serão documentadas aqui.

## [1.0.0] - 2025-12-XX

### Added
- ✨ Primeira release do LEX Desktop
- 🤖 Integração com GPT-4 Vision para análise de processos
- 📋 Sistema de planejamento de ações com aprovação do usuário
- 🌐 BrowserView integrado para automação do PJe
- 💬 Interface de chat com suporte a Markdown
- 📄 Análise automática de processos e documentos
- ✍️ Geração de minutas jurídicas
- 🔄 Sistema de cache inteligente
- 🎨 Design system premium v3.0
- 📊 Histórico de conversas persistente

### Technical
- Electron 28.0.0
- Node.js backend integrado
- Playwright para automação
- PDF.js e Tesseract.js para processamento
- Supabase Edge Functions para IA
- IPC para comunicação main ↔ renderer

### Known Issues
- BrowserView pode não persistir cookies em alguns casos
- Performance pode ser afetada com muitos documentos grandes
```

**Checklist:**
- [ ] CHANGELOG criado
- [ ] Versão 1.0.0 documentada
- [ ] Features listadas

---

### 6.9 Criar Material de Marketing (60 min)

**Criar screenshots:**
1. Interface principal
2. Chat com análise de processo
3. Geração de minuta
4. PJe BrowserView integrado

**Salvar em:** `marketing/screenshots/`

**Criar descrição curta:**
```
LEX Desktop - Assistente Jurídico Inteligente

Automatize seu trabalho no PJe com IA.
Analise processos, gere minutas e execute ações automaticamente.

Powered by GPT-4 Vision 🤖
```

**Checklist:**
- [ ] Screenshots capturados
- [ ] Descrição criada
- [ ] Material revisado

---

### 6.10 Release Final (30 min)

**Processo:**

1. **Criar tag:**
```bash
git tag -a v1.0.0 -m "Release 1.0.0 - Initial Release"
git push origin v1.0.0
```

2. **Criar GitHub Release:**
- Ir para: https://github.com/EderSilvaa/lex-desktop/releases/new
- Tag: v1.0.0
- Title: "LEX Desktop 1.0.0 - Initial Release"
- Description: Copiar do CHANGELOG
- Upload assets:
  - LEX-Desktop-Setup-1.0.0.exe
  - latest.yml
  - CHANGELOG.md

3. **Publicar:**
- Marcar como "Latest release"
- Publicar

**Checklist:**
- [ ] Tag criada
- [ ] Release publicada
- [ ] Assets enviados
- [ ] Release notes completo

---

## Validação da Fase 6

### Critérios de Sucesso

✅ Build de produção gerando .exe funcional
✅ Instalador testado e aprovado
✅ Auto-update configurado
✅ Documentação completa
✅ Release publicada no GitHub
✅ Material de marketing pronto

### Entregáveis

1. ✅ LEX-Desktop-Setup-1.0.0.exe
2. ✅ Documentação de distribuição
3. ✅ CHANGELOG completo
4. ✅ GitHub Release publicada
5. ✅ Screenshots e material de marketing

---

## Próximos Passos

### Pós-Release
1. Monitorar issues no GitHub
2. Coletar feedback dos primeiros usuários
3. Planejar versão 1.1.0
4. Implementar analytics (opcional)
5. Considerar Microsoft Store

### Melhorias Futuras
- Code signing do executável
- Instalador MSI
- Builds para macOS e Linux
- Atualização automática silenciosa
- Telemetria anônima

---

## 🎉 Migração Concluída!

Parabéns! A LEX foi migrada com sucesso de extensão Chrome para aplicação desktop Electron.

**Próximos marcos:**
- [ ] 100 instalações
- [ ] Feedback positivo dos usuários
- [ ] Versão 1.1.0 planejada

---

**Status:** ⏳ Aguardando início
**Atualizado:** 2025-12-10
