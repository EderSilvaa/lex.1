# Integração Lex ↔ Word Add-in

> Arquitetura para comunicação entre o Lex Desktop e o Add-in Word para geração de documentos jurídicos com IA.

---

## 1. Visão Geral

### O Problema

```
Hoje:
┌─────────┐     ┌─────────┐     ┌─────────┐
│   Lex   │     │  Word   │     │   PJe   │
│ (análise)│     │ (edição)│     │(protocolo)│
└─────────┘     └─────────┘     └─────────┘
     │               │               │
     └───────────────┴───────────────┘
              DESCONECTADOS
              Usuário copia/cola manualmente
```

### A Solução

```
Proposta:
┌─────────┐     ┌─────────┐     ┌─────────┐
│   Lex   │────▶│  Word   │────▶│   PJe   │
│ (análise)│◀────│ (edição)│     │(protocolo)│
└─────────┘     └─────────┘     └─────────┘
     │               │               │
     └───────────────┴───────────────┘
              INTEGRADOS
              Fluxo automatizado
```

### Benefícios

| Benefício | Descrição |
|-----------|-----------|
| **Contexto automático** | Dados do processo vão direto pro Word |
| **IA com contexto real** | Add-in gera documento baseado no processo |
| **Formatação profissional** | Word cuida da formatação jurídica |
| **Edição humana** | Advogado revisa antes de protocolar |
| **Protocolo direto** | Lex pode protocolar o documento final |

---

## 2. Arquitetura

### Fluxo Completo

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              FLUXO COMPLETO                              │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                         1. LEX DESKTOP                           │   │
│  │                                                                  │   │
│  │   [Chat] "Crie uma contestação para este processo"              │   │
│  │      │                                                           │   │
│  │      ▼                                                           │   │
│  │   [Playwright] Extrai dados do PJe:                             │   │
│  │      - Número do processo                                        │   │
│  │      - Partes (autor/réu)                                       │   │
│  │      - Classe processual                                         │   │
│  │      - Petição inicial (texto completo)                         │   │
│  │      - Movimentações relevantes                                  │   │
│  │      │                                                           │   │
│  │      ▼                                                           │   │
│  │   [Prepara JSON] Contexto estruturado                           │   │
│  │      │                                                           │   │
│  └──────┼──────────────────────────────────────────────────────────┘   │
│         │                                                               │
│         │  Salva arquivo + Abre protocolo                              │
│         │  lexword://create?file=C:\temp\lex-request.json              │
│         ▼                                                               │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                      2. MICROSOFT WORD                           │   │
│  │                                                                  │   │
│  │   [Add-in carrega]                                              │   │
│  │      │                                                           │   │
│  │      ▼                                                           │   │
│  │   [Lê JSON] Recebe contexto do Lex                              │   │
│  │      │                                                           │   │
│  │      ▼                                                           │   │
│  │   [IA] Gera documento baseado no contexto:                      │   │
│  │      - Cabeçalho formatado                                       │   │
│  │      - Qualificação das partes                                   │   │
│  │      - Preliminares                                              │   │
│  │      - Mérito (resposta aos pedidos)                            │   │
│  │      - Pedidos                                                   │   │
│  │      │                                                           │   │
│  │      ▼                                                           │   │
│  │   [Preview] Usuário revisa e edita                              │   │
│  │      │                                                           │   │
│  │      ▼                                                           │   │
│  │   [Salva] Exporta .docx ou .pdf                                 │   │
│  │      │                                                           │   │
│  └──────┼──────────────────────────────────────────────────────────┘   │
│         │                                                               │
│         │  Notifica Lex (arquivo ou protocolo)                         │
│         │  lex://document-ready?path=C:\docs\contestacao.docx          │
│         ▼                                                               │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                     3. LEX DESKTOP (retorno)                     │   │
│  │                                                                  │   │
│  │   [Recebe documento]                                            │   │
│  │      │                                                           │   │
│  │      ▼                                                           │   │
│  │   [Pergunta] "Documento pronto! Deseja protocolar no PJe?"      │   │
│  │      │                                                           │   │
│  │      ▼                                                           │   │
│  │   [Playwright] Se sim, protocola automaticamente                │   │
│  │      │                                                           │   │
│  │      ▼                                                           │   │
│  │   [Confirma] "Petição protocolada com sucesso!"                 │   │
│  │                                                                  │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### Componentes

```
┌─────────────────┐         ┌─────────────────┐         ┌─────────────────┐
│   LEX DESKTOP   │         │   WORD ADD-IN   │         │      PJe        │
│   (Electron)    │         │   (Office.js)   │         │   (Tribunal)    │
├─────────────────┤         ├─────────────────┤         ├─────────────────┤
│                 │         │                 │         │                 │
│ • Chat/UI       │         │ • Taskpane UI   │         │ • Login         │
│ • Playwright    │◀───────▶│ • AI Generator  │         │ • Consulta      │
│ • Word Service  │ JSON/   │ • Templates     │         │ • Protocolo     │
│ • File Manager  │ Protocol│ • Formatação    │         │                 │
│                 │         │                 │         │                 │
└─────────────────┘         └─────────────────┘         └─────────────────┘
        │                                                       ▲
        │                                                       │
        └───────────────────────────────────────────────────────┘
                            Playwright
```

---

## 3. Métodos de Comunicação

### 3.1 Protocolo Customizado (Recomendado)

**Como funciona:**
1. Lex registra protocolo `lexword://` no sistema
2. Word Add-in registra protocolo `lex://`
3. Comunicação via URLs customizadas

**Lex → Word:**
```
lexword://create?type=contestacao&file=C:\temp\request.json
```

**Word → Lex:**
```
lex://document-ready?path=C:\docs\contestacao.docx&status=success
```

**Vantagens:**
- Funciona mesmo com apps fechados (abre automaticamente)
- Simples de implementar
- Nativo do sistema operacional

### 3.2 Arquivo Compartilhado

**Estrutura:**
```
C:\Users\{user}\AppData\Local\Lex\
├── requests\
│   └── {uuid}.json          # Lex escreve
├── responses\
│   └── {uuid}.json          # Add-in escreve
└── documents\
    └── {uuid}.docx          # Documento gerado
```

**Polling ou FileWatcher:**
```typescript
// Add-in monitora pasta de requests
fs.watch(requestsPath, (event, filename) => {
    if (event === 'rename' && filename.endsWith('.json')) {
        processRequest(filename);
    }
});
```

### 3.3 WebSocket Local

**Para comunicação real-time:**

```typescript
// Lex inicia servidor WebSocket
const wss = new WebSocketServer({ port: 9876 });

wss.on('connection', (ws) => {
    ws.on('message', (data) => {
        const msg = JSON.parse(data);
        if (msg.type === 'document-ready') {
            handleDocumentReady(msg.path);
        }
    });
});

// Add-in conecta
const ws = new WebSocket('ws://localhost:9876');
ws.send(JSON.stringify({ type: 'document-ready', path: docPath }));
```

### 3.4 Comparativo

| Método | Complexidade | Real-time | Funciona offline | Recomendado |
|--------|--------------|-----------|------------------|-------------|
| Protocolo Custom | Baixa | Não | Sim | ✅ Principal |
| Arquivo Compartilhado | Baixa | Não | Sim | ✅ Fallback |
| WebSocket | Média | Sim | Não | ⚠️ Opcional |
| REST API | Média | Não | Não | ❌ |

---

## 4. Estrutura de Dados

### 4.1 Request (Lex → Word)

```typescript
interface LexWordRequest {
    // Identificação
    id: string;                    // UUID único
    timestamp: string;             // ISO 8601
    version: string;               // Versão do protocolo

    // Tipo de documento
    documento: {
        tipo: TipoDocumento;
        subtipo?: string;          // Ex: "agravo_instrumento"
    };

    // Dados do processo
    processo: {
        numero: string;
        tribunal: string;          // Ex: "TJPA"
        classe: string;            // Ex: "Procedimento Comum"
        assunto: string;
        vara: string;
        juiz?: string;
        dataDistribuicao?: string;
    };

    // Partes
    partes: {
        autor: Parte[];
        reu: Parte[];
        outros?: Parte[];          // Terceiros, assistentes, etc.
    };

    // Contexto para IA
    contexto: {
        peticaoInicial?: DocumentoContexto;
        contestacao?: DocumentoContexto;
        sentenca?: DocumentoContexto;
        acordao?: DocumentoContexto;
        outrosDocumentos?: DocumentoContexto[];
        movimentacoes?: Movimentacao[];
    };

    // Instruções do usuário
    instrucoes?: {
        texto: string;             // Pedido original do usuário
        enfase?: string[];         // Pontos a enfatizar
        evitar?: string[];         // O que não incluir
        template?: string;         // Template específico
    };

    // Configurações
    config?: {
        idioma: string;            // "pt-BR"
        formatacao: 'abnt' | 'tribunal' | 'custom';
        incluirJurisprudencia: boolean;
        incluirDoutrina: boolean;
    };
}

type TipoDocumento =
    | 'contestacao'
    | 'replica'
    | 'apelacao'
    | 'agravo'
    | 'embargos_declaracao'
    | 'peticao_simples'
    | 'parecer'
    | 'contrarrazoes'
    | 'memoriais'
    | 'minuta';

interface Parte {
    nome: string;
    tipo: 'fisica' | 'juridica';
    documento?: string;            // CPF/CNPJ
    qualificacao?: string;
    advogado?: {
        nome: string;
        oab: string;
    };
}

interface DocumentoContexto {
    tipo: string;
    data?: string;
    resumo?: string;               // Resumo gerado por IA
    textoCompleto?: string;        // Texto integral
    pontosPrincipais?: string[];   // Bullet points
}

interface Movimentacao {
    data: string;
    descricao: string;
    relevancia?: 'alta' | 'media' | 'baixa';
}
```

### 4.2 Response (Word → Lex)

```typescript
interface WordLexResponse {
    // Identificação
    requestId: string;             // ID do request original
    timestamp: string;

    // Status
    status: 'success' | 'error' | 'cancelled';
    mensagem?: string;

    // Documento gerado
    documento?: {
        path: string;              // Caminho do arquivo
        formato: 'docx' | 'pdf';
        tamanho: number;           // Bytes
        paginas?: number;

        // Metadados
        titulo: string;
        tipo: TipoDocumento;
        geradoEm: string;
        editadoPeloUsuario: boolean;
    };

    // Preview (opcional)
    preview?: {
        primeirasLinhas: string;   // Primeiros parágrafos
        estrutura: string[];       // Seções do documento
    };

    // Ação sugerida
    acaoSugerida?: 'protocolar' | 'revisar' | 'salvar';
}
```

### 4.3 Exemplo Completo

**Request:**
```json
{
    "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "timestamp": "2026-01-30T14:30:00.000Z",
    "version": "1.0",

    "documento": {
        "tipo": "contestacao"
    },

    "processo": {
        "numero": "0001234-56.2026.8.14.0001",
        "tribunal": "TJPA",
        "classe": "Procedimento Comum Cível",
        "assunto": "Indenização por Dano Moral",
        "vara": "1ª Vara Cível de Belém"
    },

    "partes": {
        "autor": [{
            "nome": "João da Silva",
            "tipo": "fisica",
            "documento": "123.456.789-00",
            "advogado": {
                "nome": "Dr. Carlos Advogado",
                "oab": "PA 12345"
            }
        }],
        "reu": [{
            "nome": "Empresa XYZ Ltda",
            "tipo": "juridica",
            "documento": "12.345.678/0001-90"
        }]
    },

    "contexto": {
        "peticaoInicial": {
            "tipo": "Petição Inicial",
            "data": "2026-01-15",
            "resumo": "Autor alega ter sofrido danos morais por cobrança indevida...",
            "pontosPrincipais": [
                "Cobrança de R$ 5.000,00 indevida",
                "Negativação no SPC/Serasa",
                "Pedido de indenização de R$ 20.000,00"
            ]
        },
        "movimentacoes": [
            {
                "data": "2026-01-15",
                "descricao": "Distribuição",
                "relevancia": "alta"
            },
            {
                "data": "2026-01-20",
                "descricao": "Citação do réu",
                "relevancia": "alta"
            }
        ]
    },

    "instrucoes": {
        "texto": "Crie uma contestação alegando que a cobrança era devida e que não houve negativação indevida",
        "enfase": ["pagamento em atraso do autor", "notificação prévia enviada"],
        "evitar": ["linguagem agressiva"]
    },

    "config": {
        "idioma": "pt-BR",
        "formatacao": "tribunal",
        "incluirJurisprudencia": true,
        "incluirDoutrina": false
    }
}
```

**Response:**
```json
{
    "requestId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "timestamp": "2026-01-30T14:32:15.000Z",

    "status": "success",
    "mensagem": "Contestação gerada com sucesso",

    "documento": {
        "path": "C:\\Users\\Advogado\\Documents\\Lex\\contestacao_0001234-56.docx",
        "formato": "docx",
        "tamanho": 45678,
        "paginas": 8,
        "titulo": "Contestação - Processo 0001234-56.2026.8.14.0001",
        "tipo": "contestacao",
        "geradoEm": "2026-01-30T14:32:15.000Z",
        "editadoPeloUsuario": true
    },

    "preview": {
        "primeirasLinhas": "EXCELENTÍSSIMO SENHOR DOUTOR JUIZ DE DIREITO DA 1ª VARA CÍVEL...",
        "estrutura": [
            "I - SÍNTESE DA DEMANDA",
            "II - PRELIMINARES",
            "III - DO MÉRITO",
            "IV - DOS PEDIDOS"
        ]
    },

    "acaoSugerida": "protocolar"
}
```

---

## 5. Implementação Lex (Electron)

### 5.1 Estrutura de Arquivos

```
electron/
├── services/
│   ├── word-integration.ts      # Serviço principal
│   ├── word-protocol.ts         # Registro de protocolo
│   └── word-watcher.ts          # Monitor de respostas
```

### 5.2 `word-integration.ts`

```typescript
import { shell, app, ipcMain } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';

// Diretórios de comunicação
const LEX_DATA_DIR = path.join(app.getPath('userData'), 'word-integration');
const REQUESTS_DIR = path.join(LEX_DATA_DIR, 'requests');
const RESPONSES_DIR = path.join(LEX_DATA_DIR, 'responses');
const DOCUMENTS_DIR = path.join(LEX_DATA_DIR, 'documents');

// Garante que diretórios existem
function ensureDirectories() {
    [LEX_DATA_DIR, REQUESTS_DIR, RESPONSES_DIR, DOCUMENTS_DIR].forEach(dir => {
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
    });
}

// Pendentes aguardando resposta
const pendingRequests = new Map<string, {
    resolve: (response: any) => void;
    reject: (error: Error) => void;
    timeout: NodeJS.Timeout;
}>();

/**
 * Envia request para o Word Add-in
 */
export async function sendToWordAddin(request: LexWordRequest): Promise<WordLexResponse> {
    ensureDirectories();

    // Gera ID único se não tiver
    if (!request.id) {
        request.id = uuidv4();
    }
    request.timestamp = new Date().toISOString();
    request.version = '1.0';

    // Salva arquivo de request
    const requestPath = path.join(REQUESTS_DIR, `${request.id}.json`);
    fs.writeFileSync(requestPath, JSON.stringify(request, null, 2), 'utf-8');

    console.log(`[WordIntegration] Request salvo: ${requestPath}`);

    // Abre Word com protocolo customizado
    const protocolUrl = `lexword://create?id=${request.id}&file=${encodeURIComponent(requestPath)}`;

    try {
        await shell.openExternal(protocolUrl);
        console.log(`[WordIntegration] Protocolo aberto: ${protocolUrl}`);
    } catch (error) {
        // Fallback: tenta abrir Word diretamente
        console.warn('[WordIntegration] Protocolo falhou, tentando abrir Word...');
        await shell.openPath('winword.exe');
    }

    // Aguarda resposta (com timeout)
    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
            pendingRequests.delete(request.id);
            reject(new Error('Timeout aguardando resposta do Word'));
        }, 30 * 60 * 1000); // 30 minutos

        pendingRequests.set(request.id, { resolve, reject, timeout });
    });
}

/**
 * Processa resposta do Word Add-in
 */
export function processWordResponse(response: WordLexResponse) {
    const pending = pendingRequests.get(response.requestId);

    if (pending) {
        clearTimeout(pending.timeout);
        pendingRequests.delete(response.requestId);
        pending.resolve(response);
    }

    // Limpa arquivo de request
    const requestPath = path.join(REQUESTS_DIR, `${response.requestId}.json`);
    if (fs.existsSync(requestPath)) {
        fs.unlinkSync(requestPath);
    }
}

/**
 * Registra handlers IPC
 */
export function registerWordHandlers() {

    // Envia para Word
    ipcMain.handle('word-create-document', async (_, request: LexWordRequest) => {
        try {
            const response = await sendToWordAddin(request);
            return response;
        } catch (error: any) {
            return {
                status: 'error',
                mensagem: error.message
            };
        }
    });

    // Verifica se Word Add-in está instalado
    ipcMain.handle('word-check-addin', async () => {
        // Verifica se protocolo está registrado
        return app.isDefaultProtocolClient('lexword');
    });

    // Abre documento no Word
    ipcMain.handle('word-open-document', async (_, filePath: string) => {
        await shell.openPath(filePath);
    });
}
```

### 5.3 `word-protocol.ts`

```typescript
import { app, protocol } from 'electron';
import { processWordResponse } from './word-integration';

/**
 * Registra protocolo lex:// para receber respostas do Word
 */
export function registerLexProtocol() {
    // Registra como cliente padrão
    if (!app.isDefaultProtocolClient('lex')) {
        app.setAsDefaultProtocolClient('lex');
    }

    // Handler para quando app já está aberto
    app.on('open-url', (event, url) => {
        event.preventDefault();
        handleLexProtocol(url);
    });

    // Handler para Windows (segundo instância)
    app.on('second-instance', (event, commandLine) => {
        const url = commandLine.find(arg => arg.startsWith('lex://'));
        if (url) {
            handleLexProtocol(url);
        }
    });
}

function handleLexProtocol(url: string) {
    console.log(`[LexProtocol] Recebido: ${url}`);

    try {
        const parsed = new URL(url);

        switch (parsed.hostname) {
            case 'document-ready':
                const docPath = parsed.searchParams.get('path');
                const requestId = parsed.searchParams.get('id');
                const status = parsed.searchParams.get('status') || 'success';

                if (requestId) {
                    processWordResponse({
                        requestId,
                        timestamp: new Date().toISOString(),
                        status: status as any,
                        documento: docPath ? {
                            path: decodeURIComponent(docPath),
                            formato: docPath.endsWith('.pdf') ? 'pdf' : 'docx',
                            tamanho: 0,
                            titulo: '',
                            tipo: 'contestacao',
                            geradoEm: new Date().toISOString(),
                            editadoPeloUsuario: true
                        } : undefined
                    });
                }
                break;

            case 'error':
                const errorRequestId = parsed.searchParams.get('id');
                const errorMsg = parsed.searchParams.get('message');

                if (errorRequestId) {
                    processWordResponse({
                        requestId: errorRequestId,
                        timestamp: new Date().toISOString(),
                        status: 'error',
                        mensagem: decodeURIComponent(errorMsg || 'Erro desconhecido')
                    });
                }
                break;
        }
    } catch (error) {
        console.error('[LexProtocol] Erro ao processar URL:', error);
    }
}
```

### 5.4 `word-watcher.ts`

```typescript
import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';
import { processWordResponse } from './word-integration';

const RESPONSES_DIR = path.join(app.getPath('userData'), 'word-integration', 'responses');

/**
 * Monitora pasta de respostas (fallback para protocolo)
 */
export function startResponseWatcher() {
    if (!fs.existsSync(RESPONSES_DIR)) {
        fs.mkdirSync(RESPONSES_DIR, { recursive: true });
    }

    const watcher = fs.watch(RESPONSES_DIR, (eventType, filename) => {
        if (eventType === 'rename' && filename?.endsWith('.json')) {
            const filePath = path.join(RESPONSES_DIR, filename);

            // Pequeno delay para garantir que arquivo foi escrito completamente
            setTimeout(() => {
                try {
                    if (fs.existsSync(filePath)) {
                        const content = fs.readFileSync(filePath, 'utf-8');
                        const response = JSON.parse(content);

                        processWordResponse(response);

                        // Remove arquivo processado
                        fs.unlinkSync(filePath);
                    }
                } catch (error) {
                    console.error('[WordWatcher] Erro ao processar resposta:', error);
                }
            }, 100);
        }
    });

    console.log('[WordWatcher] Monitorando:', RESPONSES_DIR);

    return watcher;
}
```

---

## 6. Implementação Word Add-in

### 6.1 Estrutura de Arquivos

```
word-addin/
├── manifest.xml                 # Manifesto do Add-in
├── src/
│   ├── taskpane/
│   │   ├── taskpane.html       # UI do painel
│   │   ├── taskpane.ts         # Lógica principal
│   │   └── taskpane.css        # Estilos
│   ├── services/
│   │   ├── lex-bridge.ts       # Comunicação com Lex
│   │   ├── ai-generator.ts     # Geração de documentos
│   │   └── document-writer.ts  # Escrita no Word
│   └── templates/
│       ├── contestacao.ts
│       ├── recurso.ts
│       └── peticao.ts
└── package.json
```

### 6.2 `manifest.xml`

```xml
<?xml version="1.0" encoding="UTF-8"?>
<OfficeApp xmlns="http://schemas.microsoft.com/office/appforoffice/1.1"
           xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
           xsi:type="TaskPaneApp">

    <Id>lex-word-addin-001</Id>
    <Version>1.0.0</Version>
    <ProviderName>Lex</ProviderName>
    <DefaultLocale>pt-BR</DefaultLocale>
    <DisplayName DefaultValue="Lex Documentos"/>
    <Description DefaultValue="Gerador de documentos jurídicos com IA"/>

    <Hosts>
        <Host Name="Document"/>
    </Hosts>

    <DefaultSettings>
        <SourceLocation DefaultValue="https://localhost:3000/taskpane.html"/>
    </DefaultSettings>

    <Permissions>ReadWriteDocument</Permissions>

    <!-- Protocolo customizado -->
    <AppDomains>
        <AppDomain>lexword://</AppDomain>
    </AppDomains>

</OfficeApp>
```

### 6.3 `lex-bridge.ts`

```typescript
import * as fs from 'fs';
import * as path from 'path';

const LEX_DATA_DIR = process.env.APPDATA + '\\Lex\\word-integration';
const REQUESTS_DIR = path.join(LEX_DATA_DIR, 'requests');
const RESPONSES_DIR = path.join(LEX_DATA_DIR, 'responses');

/**
 * Carrega request do Lex
 */
export async function loadLexRequest(requestId: string): Promise<LexWordRequest | null> {
    const requestPath = path.join(REQUESTS_DIR, `${requestId}.json`);

    try {
        if (fs.existsSync(requestPath)) {
            const content = fs.readFileSync(requestPath, 'utf-8');
            return JSON.parse(content);
        }
    } catch (error) {
        console.error('Erro ao carregar request:', error);
    }

    return null;
}

/**
 * Envia resposta para o Lex
 */
export async function sendResponseToLex(response: WordLexResponse): Promise<void> {
    // Método 1: Protocolo customizado (preferido)
    try {
        const url = new URL('lex://document-ready');
        url.searchParams.set('id', response.requestId);
        url.searchParams.set('status', response.status);

        if (response.documento?.path) {
            url.searchParams.set('path', response.documento.path);
        }

        window.open(url.toString());
        return;
    } catch (error) {
        console.warn('Protocolo falhou, usando arquivo:', error);
    }

    // Método 2: Arquivo de resposta (fallback)
    const responsePath = path.join(RESPONSES_DIR, `${response.requestId}.json`);

    if (!fs.existsSync(RESPONSES_DIR)) {
        fs.mkdirSync(RESPONSES_DIR, { recursive: true });
    }

    fs.writeFileSync(responsePath, JSON.stringify(response, null, 2), 'utf-8');
}

/**
 * Verifica parâmetros da URL (quando aberto via protocolo)
 */
export function checkProtocolParams(): { requestId?: string; filePath?: string } {
    const params = new URLSearchParams(window.location.search);

    return {
        requestId: params.get('id') || undefined,
        filePath: params.get('file') || undefined
    };
}
```

### 6.4 `ai-generator.ts`

```typescript
/**
 * Gera documento usando IA
 */
export async function generateDocument(request: LexWordRequest): Promise<string> {
    // Monta prompt baseado no tipo de documento
    const prompt = buildPrompt(request);

    // Chama API de IA (sua implementação)
    const response = await callAI(prompt);

    return response;
}

function buildPrompt(request: LexWordRequest): string {
    const { documento, processo, partes, contexto, instrucoes } = request;

    let prompt = `Você é um advogado experiente. Crie uma ${documento.tipo} para o seguinte processo:\n\n`;

    prompt += `## Dados do Processo\n`;
    prompt += `- Número: ${processo.numero}\n`;
    prompt += `- Classe: ${processo.classe}\n`;
    prompt += `- Assunto: ${processo.assunto}\n`;
    prompt += `- Vara: ${processo.vara}\n\n`;

    prompt += `## Partes\n`;
    prompt += `### Autor(es):\n`;
    partes.autor.forEach(p => {
        prompt += `- ${p.nome} (${p.tipo})\n`;
    });

    prompt += `### Réu(s):\n`;
    partes.reu.forEach(p => {
        prompt += `- ${p.nome} (${p.tipo})\n`;
    });
    prompt += '\n';

    if (contexto.peticaoInicial) {
        prompt += `## Petição Inicial\n`;
        prompt += `${contexto.peticaoInicial.resumo || contexto.peticaoInicial.textoCompleto}\n\n`;

        if (contexto.peticaoInicial.pontosPrincipais) {
            prompt += `### Pontos Principais:\n`;
            contexto.peticaoInicial.pontosPrincipais.forEach(p => {
                prompt += `- ${p}\n`;
            });
            prompt += '\n';
        }
    }

    if (instrucoes?.texto) {
        prompt += `## Instruções Específicas\n`;
        prompt += `${instrucoes.texto}\n\n`;

        if (instrucoes.enfase?.length) {
            prompt += `### Enfatizar:\n`;
            instrucoes.enfase.forEach(e => prompt += `- ${e}\n`);
        }

        if (instrucoes.evitar?.length) {
            prompt += `### Evitar:\n`;
            instrucoes.evitar.forEach(e => prompt += `- ${e}\n`);
        }
    }

    prompt += `\n## Formato\n`;
    prompt += `Gere o documento completo, formatado profissionalmente, pronto para protocolar.\n`;
    prompt += `Inclua: cabeçalho, qualificação das partes, fundamentação, pedidos e fechamento.\n`;

    return prompt;
}

async function callAI(prompt: string): Promise<string> {
    // Implemente a chamada para sua API de IA
    // Exemplo com fetch:
    const response = await fetch('https://sua-api.com/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt })
    });

    const data = await response.json();
    return data.text;
}
```

### 6.5 `document-writer.ts`

```typescript
/**
 * Escreve conteúdo no documento Word
 */
export async function writeToDocument(content: string): Promise<void> {
    await Word.run(async (context) => {
        const body = context.document.body;

        // Limpa documento
        body.clear();

        // Insere conteúdo
        body.insertText(content, Word.InsertLocation.start);

        // Aplica formatação básica
        const paragraphs = body.paragraphs;
        paragraphs.load('items');
        await context.sync();

        // Formata primeiro parágrafo como título
        if (paragraphs.items.length > 0) {
            paragraphs.items[0].style = 'Heading 1';
        }

        await context.sync();
    });
}

/**
 * Salva documento
 */
export async function saveDocument(filename: string): Promise<string> {
    return new Promise((resolve, reject) => {
        Office.context.document.getFileAsync(
            Office.FileType.Compressed,
            { sliceSize: 65536 },
            (result) => {
                if (result.status === Office.AsyncResultStatus.Succeeded) {
                    const file = result.value;
                    const slices: Uint8Array[] = [];

                    const readSlice = (index: number) => {
                        file.getSliceAsync(index, (sliceResult) => {
                            if (sliceResult.status === Office.AsyncResultStatus.Succeeded) {
                                slices.push(new Uint8Array(sliceResult.value.data));

                                if (index < file.sliceCount - 1) {
                                    readSlice(index + 1);
                                } else {
                                    file.closeAsync();

                                    // Combina slices e salva
                                    const blob = new Blob(slices, {
                                        type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
                                    });

                                    // Salva arquivo
                                    const savePath = `${process.env.USERPROFILE}\\Documents\\Lex\\${filename}`;
                                    // ... lógica de salvamento

                                    resolve(savePath);
                                }
                            } else {
                                reject(sliceResult.error);
                            }
                        });
                    };

                    readSlice(0);
                } else {
                    reject(result.error);
                }
            }
        );
    });
}
```

### 6.6 `taskpane.ts` (Principal)

```typescript
import { loadLexRequest, sendResponseToLex, checkProtocolParams } from '../services/lex-bridge';
import { generateDocument } from '../services/ai-generator';
import { writeToDocument, saveDocument } from '../services/document-writer';

Office.onReady(async (info) => {
    if (info.host === Office.HostType.Word) {
        await initializeAddin();
    }
});

async function initializeAddin() {
    // Verifica se foi chamado via protocolo
    const params = checkProtocolParams();

    if (params.requestId) {
        await processLexRequest(params.requestId);
    } else {
        showWelcomeScreen();
    }
}

async function processLexRequest(requestId: string) {
    try {
        showLoading('Carregando dados do processo...');

        // Carrega request do Lex
        const request = await loadLexRequest(requestId);

        if (!request) {
            showError('Request não encontrado');
            return;
        }

        showLoading('Gerando documento com IA...');

        // Gera documento
        const content = await generateDocument(request);

        showLoading('Inserindo no documento...');

        // Escreve no Word
        await writeToDocument(content);

        // Mostra preview e opções
        showPreview(request, content);

    } catch (error: any) {
        showError(error.message);

        await sendResponseToLex({
            requestId,
            timestamp: new Date().toISOString(),
            status: 'error',
            mensagem: error.message
        });
    }
}

async function handleSaveAndSend(requestId: string, request: LexWordRequest) {
    try {
        showLoading('Salvando documento...');

        const filename = `${request.documento.tipo}_${request.processo.numero.replace(/\D/g, '')}.docx`;
        const savePath = await saveDocument(filename);

        // Envia resposta para Lex
        await sendResponseToLex({
            requestId,
            timestamp: new Date().toISOString(),
            status: 'success',
            mensagem: 'Documento gerado com sucesso',
            documento: {
                path: savePath,
                formato: 'docx',
                tamanho: 0,
                titulo: filename,
                tipo: request.documento.tipo,
                geradoEm: new Date().toISOString(),
                editadoPeloUsuario: true
            },
            acaoSugerida: 'protocolar'
        });

        showSuccess('Documento salvo! O Lex foi notificado.');

    } catch (error: any) {
        showError(`Erro ao salvar: ${error.message}`);
    }
}

// UI Helpers
function showLoading(message: string) {
    document.getElementById('status')!.innerHTML = `
        <div class="loading">
            <div class="spinner"></div>
            <p>${message}</p>
        </div>
    `;
}

function showError(message: string) {
    document.getElementById('status')!.innerHTML = `
        <div class="error">
            <p>Erro: ${message}</p>
            <button onclick="location.reload()">Tentar novamente</button>
        </div>
    `;
}

function showSuccess(message: string) {
    document.getElementById('status')!.innerHTML = `
        <div class="success">
            <p>${message}</p>
        </div>
    `;
}

function showPreview(request: LexWordRequest, content: string) {
    document.getElementById('status')!.innerHTML = `
        <div class="preview">
            <h3>${request.documento.tipo.toUpperCase()}</h3>
            <p>Processo: ${request.processo.numero}</p>
            <hr/>
            <div class="actions">
                <button id="btnSave" class="primary">Salvar e Enviar para Lex</button>
                <button id="btnEdit">Continuar Editando</button>
            </div>
        </div>
    `;

    document.getElementById('btnSave')!.onclick = () => {
        handleSaveAndSend(request.id, request);
    };
}

function showWelcomeScreen() {
    document.getElementById('status')!.innerHTML = `
        <div class="welcome">
            <h2>Lex Documentos</h2>
            <p>Aguardando comando do Lex Desktop...</p>
            <p class="hint">Ou arraste um arquivo .json para carregar manualmente</p>
        </div>
    `;
}
```

---

## 7. Tipos de Documentos Suportados

| Tipo | Input Principal | Estrutura Gerada |
|------|-----------------|------------------|
| **Contestação** | Petição Inicial | Preliminares, Mérito, Pedidos |
| **Réplica** | Contestação | Impugnação às preliminares, Reforço do mérito |
| **Apelação** | Sentença | Cabimento, Tempestividade, Razões, Pedido de reforma |
| **Agravo** | Decisão Interlocutória | Cabimento, Fumus/Periculum, Pedido |
| **Embargos** | Decisão/Sentença/Acórdão | Contradição/Omissão/Obscuridade |
| **Contrarrazões** | Recurso da outra parte | Preliminares, Mérito, Manutenção |
| **Petição Simples** | Tipo específico | Requerimento, Justificativa, Pedido |
| **Parecer** | Documentos + Pergunta | Análise, Fundamentação, Conclusão |

---

## 8. Fluxo de Uso Detalhado

### 8.1 Fluxo Normal

```
1. USUÁRIO no Lex Chat:
   "Crie uma contestação para este processo"

2. LEX:
   - Extrai dados do PJe via Playwright
   - Identifica tipo = "contestacao"
   - Monta LexWordRequest com contexto
   - Salva JSON em %APPDATA%\Lex\word-integration\requests\
   - Abre lexword://create?id=xxx&file=xxx.json

3. WINDOWS:
   - Reconhece protocolo lexword://
   - Abre Microsoft Word
   - Word carrega Add-in Lex Documentos

4. ADD-IN:
   - Detecta parâmetros na URL
   - Carrega JSON de request
   - Mostra loading "Gerando documento..."
   - Chama IA para gerar conteúdo
   - Insere no documento Word
   - Mostra preview com botões

5. USUÁRIO no Word:
   - Revisa documento gerado
   - Faz edições se necessário
   - Clica "Salvar e Enviar para Lex"

6. ADD-IN:
   - Salva documento em Documents\Lex\
   - Abre lex://document-ready?id=xxx&path=xxx.docx

7. LEX:
   - Recebe notificação via protocolo
   - Resolve Promise pendente
   - Mostra no chat: "Documento pronto! Deseja protocolar?"

8. USUÁRIO no Lex:
   - Clica "Sim, protocolar"

9. LEX:
   - Usa Playwright para protocolar no PJe
   - Confirma: "Protocolo realizado com sucesso!"
```

### 8.2 Fluxo de Erro

```
1-4. (mesmo fluxo)

5. ADD-IN encontra erro:
   - Mostra mensagem de erro
   - Abre lex://error?id=xxx&message=xxx

6. LEX:
   - Recebe notificação de erro
   - Rejeita Promise
   - Mostra no chat: "Erro ao gerar documento: xxx"
```

---

## 9. Considerações de Segurança

### 9.1 Dados Sensíveis

- Dados do processo ficam apenas localmente
- Arquivos JSON temporários são deletados após uso
- Comunicação não passa pela internet (protocolo local)

### 9.2 Validações

```typescript
// Validar request antes de processar
function validateRequest(request: LexWordRequest): boolean {
    if (!request.id || !request.documento?.tipo) return false;
    if (!request.processo?.numero) return false;
    if (!request.partes?.autor?.length) return false;
    return true;
}

// Sanitizar caminhos de arquivo
function sanitizePath(filePath: string): string {
    // Remove caracteres perigosos
    return filePath.replace(/[<>:"|?*]/g, '_');
}
```

### 9.3 Permissões

- Add-in só precisa de `ReadWriteDocument`
- Não requer acesso à internet (opcional para IA)
- Arquivos salvos apenas em pastas do usuário

---

## 10. Cronograma de Implementação

| Fase | Tarefa | Tempo |
|------|--------|-------|
| **1** | Estrutura Lex (word-integration.ts, protocol.ts) | 2h |
| **2** | Registro de protocolo lexword:// | 1h |
| **3** | Estrutura Add-in (manifest, taskpane) | 2h |
| **4** | Comunicação Lex ↔ Add-in | 2h |
| **5** | Integração com IA existente | 2h |
| **6** | Templates de documentos | 3h |
| **7** | UI do Add-in | 2h |
| **8** | Testes end-to-end | 2h |

**Total: ~16 horas**

---

## 11. Próximos Passos

1. [ ] Definir API de IA do Add-in (usar mesma do Lex?)
2. [ ] Criar estrutura base do Add-in
3. [ ] Implementar comunicação via protocolo
4. [ ] Testar fluxo básico
5. [ ] Adicionar templates de documentos
6. [ ] Refinar UI do Add-in
7. [ ] Integrar com Playwright para protocolo

---

*Documento criado em: Janeiro 2026*
*Versão: 1.0*
