# 📝 Feature: Minutar Documentos - Guia Completo

## 🎯 Visão Geral

A **feature Minutar** permite que a Lex gere automaticamente rascunhos de petições e documentos jurídicos usando modelos extraídos do próprio PJe, preenchidos com dados do processo atual.

---

## 🚀 Como Usar (Passo a Passo)

### **1️⃣ Primeira Vez: Capturar Modelos do PJe**

Antes de gerar minutas, você precisa ensinar a Lex quais modelos usar:

**Passo a passo:**

1. **Entre no PJe** e navegue até a tela de **"Nova Petição"** ou **"Novo Documento"**
2. **Selecione um modelo** no dropdown (ex: "Contestação - Cível")
3. **Aguarde 2 segundos** - a Lex captura automaticamente!
4. Você verá um toast: **"✅ Modelo capturado com sucesso!"**

**Importante:**
- Repita para cada tipo de documento que você usa (contestação, inicial, agravo, etc)
- Modelos ficam salvos por **30 dias** no navegador
- Você pode capturar até **20 modelos diferentes**

---

### **2️⃣ Usar: Gerar Minuta**

Depois de capturar modelos, gerar minutas é super simples:

**No chat da Lex, digite:**

```
Minuta uma contestação
```

**Ou:**

```
Minuta de petição inicial
Gerar minuta de agravo
Minutar um ofício
```

**O que acontece:**

1. ✅ Lex busca modelo apropriado no cache
2. ✅ Preenche campos automáticos (nome, processo, data, etc)
3. ✅ Chama IA para gerar partes complexas (fatos, fundamentação)
4. ✅ Mostra minuta pronta com botões:
   - 📋 **Copiar** (para colar em qualquer lugar)
   - 💾 **Baixar TXT**

---

## 📋 Exemplo de Uso Completo

### **Cenário:** Advogado precisa contestar uma ação

**1. Preparação (primeira vez):**
```
1. Abrir PJe → Nova Petição
2. Selecionar "Contestação - Cível" no dropdown
3. Aguardar toast de confirmação ✅
```

**2. Análise do processo:**
```
1. Abrir processo no PJe
2. Pressionar Ctrl+; (ou clicar "Análise Completa")
3. Aguardar Lex processar documentos
```

**3. Gerar minuta:**
```
No chat:
"Minuta uma contestação"
```

**4. Resultado:**
```
✅ Minuta gerada com sucesso!

📋 Modelo: Contestação - Cível
📏 Tamanho: 3457 caracteres

[Minuta aparece em bloco copiável]

EXCELENTÍSSIMO SENHOR DOUTOR JUIZ DE DIREITO DA 1ª VARA CÍVEL

Processo nº 0001234-56.2024.8.14.0000

MARIA SANTOS LTDA, já qualificada nos autos, vem, respeitosamente...

[Botões: 📋 Copiar | 💾 Baixar TXT]
```

---

## 🔧 Arquitetura Técnica

### **Módulos Criados**

```
src/js/
├── pje-model-detector.js   (detecta tela de petição + extrai modelos)
├── model-cache.js          (armazena modelos no localStorage)
└── minuta-generator.js     (gera minutas com IA)
```

### **Fluxo de Dados**

```
1. PJE Model Detector
   ↓ (monitora DOM)
   Detecta dropdown de modelos
   ↓
   Captura conteúdo quando usuário seleciona
   ↓
2. Model Cache
   ↓
   Salva no localStorage (TTL: 30 dias)
   ↓
   Identifica placeholders [CAMPO]
   ↓
3. Minuta Generator (quando usuário pede)
   ↓
   Busca modelo apropriado
   ↓
   Preenche campos simples (processNumber, autor, etc)
   ↓
   Chama IA para campos complexos (FATOS, FUNDAMENTACAO)
   ↓
   Retorna minuta pronta
```

---

## 📊 Placeholders Suportados

### **Campos Automáticos (preenchidos sem IA):**

| Placeholder | Fonte |
|-------------|-------|
| `[NUMERO_PROCESSO]` | `sessionContext.processNumber` |
| `[NOME_AUTOR]` | `processInfo.autor` |
| `[NOME_REU]` | `processInfo.reu` |
| `[CLASSE_PROCESSUAL]` | `processInfo.classeProcessual` |
| `[TRIBUNAL]` | `processInfo.tribunal` (padrão: TJPA) |
| `[DATA]` | Data atual por extenso |
| `[LOCAL]` | Comarca extraída ou "Belém - PA" |
| `[VARA]` | `processInfo.vara` |

### **Campos com IA (gerados por contexto):**

| Placeholder | Prompt para IA |
|-------------|----------------|
| `[FATOS_PROCESSO]` | "Resuma os fatos principais em 2-3 parágrafos" |
| `[FUNDAMENTACAO_JURIDICA]` | "Elabore fundamentação baseada nos documentos" |
| `[PEDIDOS]` | "Liste os pedidos cabíveis baseado no tipo de ação" |
| `[DIREITO]` | "Apresente os direitos aplicáveis ao caso" |

---

## 🎨 Personalização

### **Adicionar novos tipos de documento:**

Edite `minuta-generator.js`, método `identificarTipoDocumento()`:

```javascript
const tipos = {
  'contestação': ['contestação', 'contestacao', 'defesa'],
  'inicial': ['inicial', 'petição inicial', 'ação'],
  // Adicione seu tipo:
  'embargos': ['embargos', 'embargos de declaração']
};
```

### **Customizar prompts de IA:**

Edite `obterPromptParaCampo()`:

```javascript
const prompts = {
  'FATOS_PROCESSO': 'Seu prompt customizado aqui',
  // ...
};
```

---

## 🛠️ Comandos de Debug

### **Console do navegador (F12):**

```javascript
// Ver modelos salvos
window.ModelCache.listarModelos()

// Estatísticas do cache
window.ModelCache.obterEstatisticas()

// Limpar cache
window.ModelCache.limparTudo()

// Exportar backup
window.ModelCache.exportar()

// Forçar extração de modelos
window.PjeModelDetector.iniciar()

// Ver status do detector
window.PjeModelDetector.modelosExtraidos
```

---

## 📱 Exemplo de Mensagens

### **Modelo não encontrado:**

```
⚠️ Modelo não encontrado

Ainda não tenho um modelo de contestação salvo.

Como resolver:
1. Abra a tela de "Nova Petição" no PJe
2. Selecione um modelo de contestação no dropdown
3. Aguarde alguns segundos
4. Voltarei a tentar automaticamente

💡 Estou monitorando o PJe em segundo plano!
```

### **Sem contexto de processo:**

```
⚠️ Nenhum processo em contexto

Para gerar uma minuta, preciso que você:

1. Analise um processo primeiro (Ctrl+; ou "Análise Completa")
2. Depois peça: "Minuta uma contestação"

💡 Preciso dos dados do processo para preencher a minuta!
```

---

## 🔒 Privacidade e Armazenamento

### **O que é salvo localmente?**

✅ **No localStorage (`lex_pje_models`):**
- Conteúdo dos modelos extraídos
- Metadados (nome, tribunal, data de extração)
- Placeholders identificados

❌ **NÃO é salvo:**
- Minutas geradas
- Dados sensíveis do processo
- Informações das partes

### **Tamanho médio:**
- Cache vazio: ~500 bytes
- 10 modelos: ~200 KB
- 20 modelos: ~400 KB

### **Expiração:**
- Modelos expiram em **30 dias**
- Auto-limpeza na inicialização

---

## 🐛 Troubleshooting

### **"Módulo de minutas não carregado"**

**Causa:** Arquivos JS não foram carregados
**Solução:**
1. Recarregue a página (F5)
2. Verifique console: `window.MinutaGenerator` deve existir
3. Reinstale extensão se necessário

---

### **"Modelo não encontrado" mesmo após capturar**

**Causa:** Modelo não foi salvo ou nome não corresponde
**Solução:**
1. Verifique cache: `ModelCache.listarModelos()`
2. Tente capturar novamente selecionando modelo no PJe
3. Use nome exato ao pedir minuta

---

### **Minuta com muitos campos vazios [CAMPO]**

**Causa:** Processo não foi analisado ou falta contexto
**Solução:**
1. Execute "Análise Completa" primeiro
2. Verifique `lexSession.isActive()`
3. Preencha campos manualmente após copiar minuta

---

### **IA não gera conteúdo para campos complexos**

**Causa:** Erro na API ou sem documentos processados
**Solução:**
1. Verifique internet/API key
2. Certifique-se que documentos foram processados
3. Preencha campos `[FATOS]` etc manualmente

---

## 📈 Estatísticas de Performance

| Operação | Tempo Médio |
|----------|-------------|
| Capturar modelo do PJe | 1-2 segundos |
| Buscar modelo no cache | < 10 ms |
| Preencher campos simples | 50-100 ms |
| Gerar conteúdo com IA | 3-8 segundos |
| **Total (minuta completa)** | **4-10 segundos** |

---

## 🔮 Roadmap Futuro

- [ ] Inserção automática no editor do PJe
- [ ] Export para DOCX com formatação
- [ ] Templates customizáveis pelo usuário
- [ ] Sugestão inteligente de modelo baseado no processo
- [ ] Versionamento de minutas (histórico)
- [ ] Compartilhamento de modelos entre usuários
- [ ] Suporte a tribunais estaduais além do TJPA

---

## 💡 Dicas de Uso

✅ **Capture modelos variados** - quanto mais tipos, mais útil
✅ **Revise sempre** - IA pode errar, confirme dados antes de usar
✅ **Use Ctrl+;** antes de minutar - contexto é essencial
✅ **Personalize depois** - minuta é base, ajuste conforme necessário
✅ **Exporte backup** - `ModelCache.exportar()` salva seus modelos

---

## 📞 Suporte

**Problemas?**
1. Verifique console do navegador (F12)
2. Consulte logs: `console.log` com prefixo `LEX:`, `PJE:`, `📝`
3. Reporte issues com prints + logs do console

---

**Última atualização:** 6 de outubro de 2025
**Versão da Feature:** 1.0 (MVP)
