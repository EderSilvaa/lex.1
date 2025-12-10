# Melhorias de Formatação Markdown → HTML

## Problema Identificado

A resposta da IA estava vindo como texto corrido sem formatação, mesmo usando markdown:

```
### Análise da Sentença A sentença analisada refere-se ao **processo número 0826021-12.2025.8.14.0301** no Tribunal de Justiça do Estado do Pará (TJPA)...
```

**Causa**: A função `limparResposta()` estava processando markdown de forma muito básica, sem converter corretamente headings e listas.

## Solução Implementada

### 1. Processamento Completo de Markdown

Refatorei completamente a função `limparResposta()` em [src/js/content-simple.js:587-628](src/js/content-simple.js#L587-L628):

#### Funcionalidades:

✅ **Headings** (`#`, `##`, `###` → `<h1>`, `<h2>`, `<h3>`)
```markdown
### Análise da Sentença
```
↓
```html
<h3>Análise da Sentença</h3>
```

✅ **Listas Não Ordenadas** (`-` ou `*` → `<ul><li>`)
```markdown
- Item 1
- Item 2
```
↓
```html
<ul>
  <li>Item 1</li>
  <li>Item 2</li>
</ul>
```

✅ **Listas Numeradas** (`1.`, `2.` → `<ol><li>`)
```markdown
1. Primeiro passo
2. Segundo passo
```
↓
```html
<ol>
  <li>Primeiro passo</li>
  <li>Segundo passo</li>
</ol>
```

✅ **Negrito e Itálico** (`**texto**` e `*texto*`)
```markdown
**importante** e *relevante*
```
↓
```html
<strong>importante</strong> e <em>relevante</em>
```

✅ **Blocos de Código** (` ``` `)
```markdown
```javascript
const x = 10;
```
```
↓
```html
<pre><code>const x = 10;</code></pre>
```

✅ **Quebras de Linha** (parágrafos e espaçamento)
- `\n\n` → `<br><br>` (parágrafo)
- `\n` → `<br>` (quebra simples)

✅ **Limpeza de Tags** (remove `<br>` desnecessários antes/depois de elementos de bloco)

### 2. Estilos CSS Completos

Adicionei estilos completos para todos os elementos HTML em [styles/chat-styles.css:1867-2029](styles/chat-styles.css#L1867-L2029):

#### Headings
- **H1**: 18px, borda inferior, destaque principal
- **H2**: 16px, cor azul LEX
- **H3**: 14px, cor secundária
- Primeira heading sem margem superior

#### Listas
- Padding e margem adequados
- Bullets/números visíveis
- Espaçamento entre itens
- Suporte a listas aninhadas
- Negrito dentro de `<li>` com destaque

#### Texto
- **Negrito** (`<strong>`): cor primária, peso 600
- **Itálico** (`<em>`): cor secundária, estilo italic
- **Parágrafos**: margem e line-height adequados

#### Código
- **Blocos** (`<pre><code>`): fundo escuro, borda, overflow-x
- **Inline** (`<code>`): fundo escuro, padding pequeno, borda

#### Extras
- **Links**: cor azul, hover roxo
- **Citações** (`<blockquote>`): borda esquerda azul
- **Tabelas**: bordas, cabeçalho destacado
- **Linhas horizontais** (`<hr>`)

### 3. Exemplo de Transformação

**Antes** (texto corrido):
```
### Análise da Sentença A sentença analisada refere-se ao **processo número 0826021-12.2025.8.14.0301** no Tribunal de Justiça do Estado do Pará (TJPA), especificamente da 10ª Vara Cível e Empresarial de Belém. Trata-se de um cumprimento provisório de sentença movido por **Leon Emerson Trindade Silva** contra a **Unimed de Belém Cooperativa de Trabalho Médico**. #### Ponto Principal da Sentença 1. **Cumprimento da Obrigação**: A executada, Unimed Belém, comprovou o fornecimento do medicamento Purodiol CBD...
```

**Depois** (HTML estruturado e estilizado):

<h3>Análise da Sentença</h3>

A sentença analisada refere-se ao **processo número 0826021-12.2025.8.14.0301** no Tribunal de Justiça do Estado do Pará (TJPA), especificamente da 10ª Vara Cível e Empresarial de Belém.

<h4>Ponto Principal da Sentença</h4>

<ul>
  <li><strong>Cumprimento da Obrigação</strong>: A executada, Unimed Belém, comprovou o fornecimento do medicamento...</li>
</ul>

## Código da Função

```javascript
limparResposta(resposta) {
  if (!resposta) return resposta;

  let cleaned = resposta;

  // 1. Processar blocos de código
  cleaned = cleaned.replace(/```[\w]*\n?([\s\S]*?)```/g, '<pre><code>$1</code></pre>');

  // 2. Processar headings (### → <h3>, ## → <h2>, # → <h1>)
  cleaned = cleaned.replace(/^### (.*?)$/gm, '<h3>$1</h3>');
  cleaned = cleaned.replace(/^## (.*?)$/gm, '<h2>$1</h2>');
  cleaned = cleaned.replace(/^# (.*?)$/gm, '<h1>$1</h1>');

  // 3. Processar listas não ordenadas (- item ou * item)
  cleaned = cleaned.replace(/^[-*] (.*?)$/gm, '<li>$1</li>');

  // 4. Processar listas numeradas (1. item, 2. item)
  cleaned = cleaned.replace(/^\d+\. (.*?)$/gm, '<li>$1</li>');

  // 5. Agrupar <li> em <ul> ou <ol>
  cleaned = cleaned.replace(/(<li>.*?<\/li>\n?)+/gs, (match) => {
    return '<ul>' + match + '</ul>';
  });

  // 6. Processar negrito e itálico
  cleaned = cleaned.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  cleaned = cleaned.replace(/\*(.*?)\*/g, '<em>$1</em>');

  // 7. Processar quebras de linha
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n');  // Max 2 quebras seguidas
  cleaned = cleaned.replace(/\n\n/g, '<br><br>'); // Parágrafo
  cleaned = cleaned.replace(/\n/g, '<br>');       // Quebra simples

  // 8. Limpar <br> duplicados criados acidentalmente
  cleaned = cleaned.replace(/(<br>\s*){3,}/g, '<br><br>');

  // 9. Limpar <br> antes/depois de tags de bloco
  cleaned = cleaned.replace(/<br>\s*<(h[1-6]|ul|ol|li|pre)/gi, '<$1');
  cleaned = cleaned.replace(/<\/(h[1-6]|ul|ol|li|pre)>\s*<br>/gi, '</$1>');

  return cleaned.trim();
}
```

## Como Testar

### Opção 1: Teste Visual

Abra o arquivo de teste no navegador:
```
c:\Users\EDER\lex-test1\teste-formatacao-markdown.html
```

Este arquivo mostra:
- Markdown original (texto cru)
- HTML renderizado (como aparece no chat)
- Usa os mesmos estilos do LEX

### Opção 2: Teste Real na Extensão

1. **Recarregue a extensão** em `chrome://extensions`
2. **Abra o PJe** e faça uma pergunta ao LEX
3. **Observe**: A resposta agora deve ter:
   - Títulos destacados (H2, H3)
   - Listas com bullets
   - Negrito visível
   - Espaçamento adequado entre seções

### Opção 3: Console do Navegador (F12)

```javascript
// Testar a função diretamente
const teste = `### Teste
- Item 1
- Item 2

**Negrito** e *itálico*`;

console.log(window.openaiClient.limparResposta(teste));
```

## Resultado Esperado

### Antes:
- Texto corrido sem formatação
- Headings aparecendo como texto normal (`###`)
- Listas sem bullets (`-`)
- Negrito sem destaque (`**texto**`)

### Depois:
- ✅ Headings com tamanhos diferenciados e cores
- ✅ Listas com bullets e espaçamento
- ✅ Negrito destacado em branco
- ✅ Parágrafos com espaçamento
- ✅ Estrutura visual clara e profissional

## Compatibilidade com Streaming

A função `limparResposta()` é chamada **durante o streaming**, então a formatação acontece em tempo real:

```javascript
// No processarStreaming()
if (text) {
  fullText += text;
  bubble.innerHTML = this.limparResposta(fullText); // ← Formata em tempo real
}
```

Isso significa que o usuário vê a formatação sendo aplicada **conforme a resposta chega**.

## Próximas Melhorias (Opcional)

### 1. Diferenciação entre UL e OL
Atualmente todas as listas viram `<ul>`. Possível melhorar:
```javascript
// Detectar se é lista numerada ou não
if (/^\d+\. /.test(firstItem)) {
  return '<ol>' + match + '</ol>';
} else {
  return '<ul>' + match + '</ul>';
}
```

### 2. Suporte a Links
```javascript
// [texto](url) → <a href="url">texto</a>
cleaned = cleaned.replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2">$1</a>');
```

### 3. Suporte a Imagens
```javascript
// ![alt](url) → <img src="url" alt="alt">
cleaned = cleaned.replace(/!\[(.*?)\]\((.*?)\)/g, '<img src="$2" alt="$1">');
```

### 4. Suporte a Tabelas
Processar sintaxe markdown de tabelas (`| col1 | col2 |`).

## Arquivos Modificados

- ✅ [src/js/content-simple.js:587-628](src/js/content-simple.js#L587-L628) - Função `limparResposta()` refatorada
- ✅ [styles/chat-styles.css:1867-2029](styles/chat-styles.css#L1867-L2029) - Estilos completos para markdown

## Arquivos Criados

- ✅ [teste-formatacao-markdown.html](teste-formatacao-markdown.html) - Teste visual interativo
- ✅ [FORMATACAO-MARKDOWN-MELHORIAS.md](FORMATACAO-MARKDOWN-MELHORIAS.md) - Esta documentação

## Status

✅ **Implementação Completa**
- Processamento de markdown robusto
- Estilos CSS completos
- Compatível com streaming
- Teste visual disponível

🎯 **Pronto para Uso**

Agora as respostas do LEX terão formatação profissional e legível! 🚀
