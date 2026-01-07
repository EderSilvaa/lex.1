# Arquitetura LEX Desktop (Electron)

## 🏗️ Visão Geral

O **Lex Desktop** é uma evolução da antiga extensão do Chrome, re-arquitetada como um aplicativo Desktop autônomo baseado em [Electron](https://www.electronjs.org/).

Nesta nova arquitetura, o Lex não é apenas um "plugin", mas sim o próprio navegador dedicado para acesso ao PJe, garantindo maior controle, desempenho e capacidade de integração com o sistema operacional.

## 🧩 Componentes Principais

### 1. Main Process (`electron/main.ts`)
O "cérebro" da aplicação. Substitui o papel do navegador Chrome.
- **Gerenciamento de Janelas**: Cria e controla a janela do navegador.
- **Sistema de Injeção**: Monitora a navegação e injeta automaticamente os scripts do Lex quando o usuário acessa o PJe (`pje.jus.br`, `tjpa.jus.br`, etc).
- **IPC (Inter-Process Communication)**: Recebe mensagens da interface (Renderer) e executa ações privilegiadas (salvar arquivos, configurações).

### 2. Polyfill Layer (`electron/polyfill.js`)
Camada de compatibilidade crítica que permite reutilizar o código da extensão original.
- **Chrome API Mock**: Intercepta chamadas como `chrome.runtime.sendMessage` e `chrome.storage.local`.
- **Redirecionamento**: Encaminha essas chamadas para o IPC do Electron ou para o `electron-store`.
- **Benefício**: Permite que `background.js`, `content-simple.js` e outros scripts da extensão funcionem sem reescrita total.

### 3. Renderer Process (Aba do PJe)
Onde a mágica acontece na interface do usuário.
- **Site PJe**: Carregado normalmente via `loadURL`.
- **Lex UI**: Injetada no DOM da página (Sidebar, botões, modais).
- **Scripts Injetados**:
    - `lex-init.js`: Inicialização.
    - `lex-agent-ui.js`: Interface Visual.
    - `content-simple.js`: Lógica principal do chat e análise.

### 4. Persistência (`electron-store`)
Substituto do `chrome.storage`.
- **Armazenamento Local**: Salva histórico de chat, preferências e cache em um arquivo JSON no disco do usuário.
- **Caminho típico**: `%AppData%\lex-extension\config.json`.

## 🔄 Fluxo de Dados

```mermaid
graph TD
    subgraph Electron [Lex Desktop App]
        Main[Main Process (Node.js)]
        Store[(Arquivo JSON)]
        
        subgraph Window [Janela do Navegador]
            PJe[Site do PJe]
            LexUI[Interface Lex]
            Polyfill[Polyfill.js]
        end
    end

    Main -->|Injeta Scripts| Window
    LexUI -->|Chama chrome.storage| Polyfill
    Polyfill -->|IPC 'save-history'| Main
    Main -->|Grava| Store
```

## 📂 Estrutura de Pastas (Nova)

```
lex-test1/
├── electron/
│   ├── main.ts            # Processo Principal
│   ├── preload.ts         # Ponte de Segurança (IPC)
│   └── polyfill.js        # Camada de Compatibilidade
├── dist-electron/         # Código Electron compilado
├── src/                   # Código original da extensão (reutilizado)
├── package.json           # Scripts 'electron:dev' e 'electron:build'
└── tsconfig.electron.json # Configuração TypeScript para Electron
```

## 🚀 Benefícios da Migração

1.  **Independência de Navegador**: Não depende da versão instalada do Chrome usuário.
2.  **Persistência Robusta**: Arquivos locais são mais seguros e fáceis de gerenciar que o storage do navegador.
3.  **Experiência Unificada**: O usuário abre o "Lex" para trabalhar, não o "Chrome".
4.  **Expansibilidade**: Futuramente, pode acessar scanner, impressora e sistema de arquivos nativo.
