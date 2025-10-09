# Especificações do Input para Landing Page

## Visão Geral
Design baseado nas mensagens do usuário do chat Lex, com borda animada em gradiente roxo/azul/verde-azulado e fundo escuro premium.

---

## 🎨 Paleta de Cores

### Cores Principais
```css
--lex-purple: #4a1a5c;      /* Roxo profundo */
--lex-blue: #6366f1;        /* Azul vibrante (indigo) */
--lex-teal: #2d4a4a;        /* Verde-azulado escuro */
```

### Cores de Fundo
```css
--lex-black-premium: #0f0f0f;     /* Fundo principal (quase preto) */
--lex-black-secondary: #1a1a1a;   /* Fundo do input */
--lex-black-tertiary: #2a2a2a;    /* Fundo hover */
--lex-gray-border: #333333;       /* Borda sutil */
```

### Cores de Texto
```css
--lex-text-primary: #ffffff;                /* Texto principal */
--lex-text-secondary: rgba(255, 255, 255, 0.8);  /* Texto secundário */
--lex-text-tertiary: rgba(255, 255, 255, 0.6);   /* Placeholder */
```

### Cores de Brilho (Glow)
```css
--lex-glow-purple: rgba(74, 26, 92, 0.4);
--lex-glow-blue: rgba(99, 102, 241, 0.4);
--lex-glow-teal: rgba(45, 74, 74, 0.4);
```

---

## 📐 Estrutura e Dimensões

### Container do Input
```css
.landing-input-container {
  position: relative;
  width: 100%;
  max-width: 600px;
  margin: 0 auto;
}
```

### Input Field
```css
.landing-input {
  /* Dimensões */
  padding: 12px 16px;
  width: 100%;

  /* Tipografia */
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  font-size: 14px;
  line-height: 1.4;
  color: #ffffff;

  /* Background */
  background: #1a1a1a;

  /* Borda */
  border: 2px solid transparent;
  border-radius: 8px;
  background-clip: padding-box;

  /* Efeitos */
  backdrop-filter: blur(10px);
  outline: none;

  /* Transição suave */
  transition: all 0.3s ease;
}
```

### Placeholder
```css
.landing-input::placeholder {
  color: rgba(255, 255, 255, 0.6);
}
```

---

## ✨ Animação de Borda Gradiente

### Pseudo-elemento para Borda Animada
```css
.landing-input-wrapper {
  position: relative;
  overflow: hidden;
  border-radius: 8px;
}

.landing-input-wrapper::before {
  content: '';
  position: absolute;
  top: -2px;
  left: -2px;
  right: -2px;
  bottom: -2px;
  background: linear-gradient(135deg, #4a1a5c 0%, #6366f1 50%, #2d4a4a 100%);
  border-radius: 8px;
  z-index: -1;
  animation: border-flow 3s linear infinite;
}
```

### Keyframes da Animação
```css
@keyframes border-flow {
  0% {
    background: linear-gradient(45deg, #4a1a5c, #6366f1, #2d4a4a, #4a1a5c);
    background-size: 300% 300%;
    background-position: 0% 50%;
  }

  25% {
    background: linear-gradient(135deg, #6366f1, #2d4a4a, #4a1a5c, #6366f1);
    background-size: 300% 300%;
    background-position: 50% 50%;
  }

  50% {
    background: linear-gradient(225deg, #2d4a4a, #4a1a5c, #6366f1, #2d4a4a);
    background-size: 300% 300%;
    background-position: 100% 50%;
  }

  75% {
    background: linear-gradient(315deg, #4a1a5c, #6366f1, #2d4a4a, #4a1a5c);
    background-size: 300% 300%;
    background-position: 50% 0%;
  }

  100% {
    background: linear-gradient(45deg, #4a1a5c, #6366f1, #2d4a4a, #4a1a5c);
    background-size: 300% 300%;
    background-position: 0% 50%;
  }
}
```

---

## 🎯 Estados Interativos

### Hover
```css
.landing-input:hover {
  background: #2a2a2a;
  transform: translateY(-1px);
}
```

### Focus
```css
.landing-input:focus {
  background: #1a1a1a;
  box-shadow: 0 8px 24px rgba(99, 102, 241, 0.2);
}

.landing-input-wrapper:focus-within::before {
  animation: border-flow 1.5s linear infinite;
}
```

---

## 📝 HTML Estrutura Completa

```html
<div class="landing-input-container">
  <div class="landing-input-wrapper">
    <input
      type="text"
      class="landing-input"
      placeholder="Digite sua pergunta sobre o processo..."
    />
  </div>
</div>
```

---

## 🎨 CSS Completo para Landing Page

```css
/* Variáveis CSS */
:root {
  /* Cores */
  --lex-purple: #4a1a5c;
  --lex-blue: #6366f1;
  --lex-teal: #2d4a4a;
  --lex-black-premium: #0f0f0f;
  --lex-black-secondary: #1a1a1a;
  --lex-black-tertiary: #2a2a2a;

  /* Espaçamentos */
  --lex-space-sm: 4px;
  --lex-space-md: 8px;
  --lex-space-lg: 12px;
  --lex-space-xl: 16px;

  /* Border Radius */
  --lex-radius-lg: 8px;
}

/* Container */
.landing-input-container {
  position: relative;
  width: 100%;
  max-width: 600px;
  margin: 0 auto;
}

/* Wrapper com borda animada */
.landing-input-wrapper {
  position: relative;
  border-radius: var(--lex-radius-lg);
}

.landing-input-wrapper::before {
  content: '';
  position: absolute;
  top: -2px;
  left: -2px;
  right: -2px;
  bottom: -2px;
  background: linear-gradient(135deg, var(--lex-purple), var(--lex-blue), var(--lex-teal));
  border-radius: var(--lex-radius-lg);
  z-index: -1;
  animation: border-flow 3s linear infinite;
}

/* Input */
.landing-input {
  width: 100%;
  padding: var(--lex-space-lg) var(--lex-space-xl);
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  font-size: 14px;
  line-height: 1.4;
  color: #ffffff;
  background: var(--lex-black-secondary);
  border: 2px solid transparent;
  border-radius: var(--lex-radius-lg);
  background-clip: padding-box;
  backdrop-filter: blur(10px);
  outline: none;
  transition: all 0.3s ease;
}

.landing-input::placeholder {
  color: rgba(255, 255, 255, 0.6);
}

.landing-input:hover {
  background: var(--lex-black-tertiary);
  transform: translateY(-1px);
}

.landing-input:focus {
  background: var(--lex-black-secondary);
  box-shadow: 0 8px 24px rgba(99, 102, 241, 0.2);
}

.landing-input-wrapper:focus-within::before {
  animation: border-flow 1.5s linear infinite;
}

/* Animação da borda */
@keyframes border-flow {
  0% {
    background: linear-gradient(45deg, var(--lex-purple), var(--lex-blue), var(--lex-teal), var(--lex-purple));
  }
  25% {
    background: linear-gradient(135deg, var(--lex-blue), var(--lex-teal), var(--lex-purple), var(--lex-blue));
  }
  50% {
    background: linear-gradient(225deg, var(--lex-teal), var(--lex-purple), var(--lex-blue), var(--lex-teal));
  }
  75% {
    background: linear-gradient(315deg, var(--lex-purple), var(--lex-blue), var(--lex-teal), var(--lex-purple));
  }
  100% {
    background: linear-gradient(45deg, var(--lex-purple), var(--lex-blue), var(--lex-teal), var(--lex-purple));
  }
}
```

---

## 🎭 Variações Adicionais

### Com Botão de Envio
```html
<div class="landing-input-container">
  <div class="landing-input-wrapper">
    <input
      type="text"
      class="landing-input"
      placeholder="Digite sua pergunta sobre o processo..."
    />
    <button class="landing-input-submit">➤</button>
  </div>
</div>
```

```css
.landing-input-wrapper {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 2px;
}

.landing-input-submit {
  background: linear-gradient(135deg, var(--lex-purple), var(--lex-blue));
  border: none;
  color: white;
  padding: 10px 16px;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.landing-input-submit:hover {
  transform: scale(1.05);
  box-shadow: 0 4px 12px rgba(99, 102, 241, 0.4);
}
```

---

## 📱 Responsividade

```css
/* Mobile */
@media (max-width: 768px) {
  .landing-input-container {
    max-width: 100%;
    padding: 0 16px;
  }

  .landing-input {
    font-size: 16px; /* Evita zoom no iOS */
  }
}

/* Tablet */
@media (min-width: 769px) and (max-width: 1024px) {
  .landing-input-container {
    max-width: 500px;
  }
}

/* Desktop */
@media (min-width: 1025px) {
  .landing-input-container {
    max-width: 600px;
  }
}
```

---

## 💡 Dicas de Implementação

1. **Performance**: A animação usa `linear` para suavidade contínua
2. **Acessibilidade**: Manter contraste de texto adequado (WCAG AA)
3. **Z-index**: O `::before` com `z-index: -1` garante que a borda fique atrás do input
4. **Background-clip**: `padding-box` é essencial para criar o efeito de borda gradiente
5. **Blur**: `backdrop-filter: blur(10px)` adiciona profundidade premium

---

## 🎯 Casos de Uso na Landing Page

### Hero Section
- Input grande e destacado como CTA principal
- Texto placeholder persuasivo: "Experimente: Digite uma pergunta sobre seu processo..."

### Demo Interativa
- Input funcional que mostra preview do chat
- Animação mais rápida (1.5s) no focus

### Call-to-Action
- Input com botão "Começar Agora"
- Glow mais intenso ao interagir

---

## 📊 Especificações Técnicas

| Propriedade | Valor | Observação |
|-------------|-------|------------|
| **Largura máxima** | 600px | Desktop ideal |
| **Padding** | 12px 16px | Confortável para leitura |
| **Font size** | 14px | Legível sem zoom |
| **Border width** | 2px | Visível mas discreto |
| **Border radius** | 8px | Moderno e suave |
| **Animation duration** | 3s | Suave e hipnótico |
| **Transition** | 0.3s ease | Responsivo ao toque |

---

**Criado para**: Landing Page Lex
**Baseado em**: Design do Chat Lex v1.0
**Data**: Outubro 2025
