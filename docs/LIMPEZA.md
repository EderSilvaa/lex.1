# 🧹 Limpeza do Projeto Lex

## 📁 Estrutura Final Recomendada

### ✅ MANTER (Arquivos Essenciais)
```
lex-extension/
├── manifest.json           # Configuração da extensão
├── content-simple.js       # Script principal (CORE)
├── background.js           # Service worker
├── popup.html             # Interface do popup
├── popup.js               # Lógica do popup
└── README-INSTALACAO.md   # Guia básico (opcional)
```

### 🗑️ PODE REMOVER (Arquivos de Desenvolvimento)

#### Arquivos de Teste:
- `teste-pje.html`
- `teste-simples.html`
- `debug.js`

#### Documentação de Desenvolvimento:
- `TESTE-API-KEY.md`
- `TESTE-DOCUMENTO.md`
- `TESTE-OPENAI-CLIENT.md`
- `TESTE-RAPIDO.md`
- `TROUBLESHOOTING.md`

#### Arquivos Não Utilizados:
- `content.js` (versão antiga)
- `chat-styles.css` (estilos já estão no content-simple.js)
- `openai-client.js` (funcionalidade integrada no content-simple.js)

#### Pastas do Sistema:
- `.kiro/` (documentação técnica do desenvolvimento)
- `.vscode/` (configurações do editor - opcional)

## 🚀 Comandos para Limpeza

### Windows (PowerShell):
```powershell
# Remover arquivos de teste
Remove-Item teste-*.html, debug.js

# Remover documentação de desenvolvimento
Remove-Item TESTE-*.md, TROUBLESHOOTING.md

# Remover arquivos não utilizados
Remove-Item content.js, chat-styles.css, openai-client.js

# Remover pasta do Kiro (opcional)
Remove-Item -Recurse -Force .kiro
```

### Linux/Mac:
```bash
# Remover arquivos de teste
rm teste-*.html debug.js

# Remover documentação de desenvolvimento
rm TESTE-*.md TROUBLESHOOTING.md

# Remover arquivos não utilizados
rm content.js chat-styles.css openai-client.js

# Remover pasta do Kiro (opcional)
rm -rf .kiro
```

## 📋 Resultado Final

Após a limpeza, você terá apenas os arquivos essenciais:
- **5-6 arquivos** principais
- **Extensão 100% funcional**
- **Código limpo e organizado**

## ⚠️ Backup Recomendado

Antes de remover, faça backup dos arquivos importantes:
- Sua API key configurada
- Qualquer customização que tenha feito

**A extensão continuará funcionando perfeitamente com apenas os arquivos essenciais!**