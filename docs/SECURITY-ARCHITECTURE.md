# LEX Security Architecture

Documento de referencia para implementacao das camadas de seguranca, privacidade e conformidade LGPD.

---

## 1. Problema Central

Hoje o fluxo de dados na LEX e:

```
PJe retorna: "Parte: Claudio Souza, CPF 123.456.789-00, Juiz Dr. Marcos"
    |
    v
think.ts monta contexto --> manda TUDO pro Claude/OpenAI
    |                       SEM FILTRO
    v
LLM responde com dados reais expostos
    |
    v
Salva em sessions.json (plaintext, sem criptografia)
```

**Nenhum dado e filtrado, anonimizado ou criptografado antes de sair da maquina.**

---

## 2. Arquitetura de Seguranca (3 Camadas)

```
                DADOS BRUTOS (PJe, documentos, usuario)
                         |
                         v
            +---------------------------+
            |  CAMADA 1: PII Vault      |
            |  Mascara reversi vel      |
            |  "Claudio" -> [PARTE_A]   |
            |  Guarda mapa local        |
            +---------------------------+
                         |
                         v
                  DADOS ANONIMIZADOS
                         |
                         v
            +---------------------------+
            |  CAMADA 2: Consent Gate   |
            |  Usuario autorizou?       |
            |  Qual provider?           |
            |  Qual nivel de acesso?    |
            +---------------------------+
                         |
                         v
              ENVIA PRO LLM (anonimizado)
                         |
                         v
              LLM RESPONDE (com tokens)
                         |
                         v
            +---------------------------+
            |  CAMADA 1: PII Vault      |
            |  Re-hidrata               |
            |  [PARTE_A] -> "Claudio"   |
            +---------------------------+
                         |
                         v
            +---------------------------+
            |  CAMADA 3: Modelo Local   |
            |  Ollama como fallback     |
            |  Zero data leak option    |
            +---------------------------+
                         |
                         v
                OUTPUT FINAL PRO USUARIO
                (com dados reais de volta)
```

---

## 3. CAMADA 1: PII Vault (Mascara Reversivel)

### Conceito

O PII Vault e um cofre de mapeamento bidirecional. Ele:
1. Detecta dados sensiveis no texto
2. Substitui por tokens opacos ([PARTE_A], [CPF_1], etc.)
3. Guarda o mapa `token <-> valor real` localmente (nunca sai da maquina)
4. Quando a resposta do LLM volta, re-substitui os tokens pelos valores reais

### Fluxo Detalhado

```
=== IDA (antes de enviar pro LLM) ===

Texto original do PJe:
  "Claudio Souza da Silva, CPF 123.456.789-00, move acao contra
   Empresa Tech Ltda, CNPJ 12.345.678/0001-90, perante o
   Juiz Dr. Marcos Oliveira, vara 3a do TRT8, valor R$ 85.000,00"

PII Vault detecta e mascara:
  "[PARTE_AUTORA], CPF [CPF_1], move acao contra
   [PARTE_RE], CNPJ [CNPJ_1], perante o
   [MAGISTRADO_1], vara 3a do TRT8, valor [VALOR_1]"

Mapa guardado localmente (NUNCA sai da maquina):
  {
    "[PARTE_AUTORA]":  "Claudio Souza da Silva",
    "[PARTE_RE]":      "Empresa Tech Ltda",
    "[CPF_1]":         "123.456.789-00",
    "[CNPJ_1]":        "12.345.678/0001-90",
    "[MAGISTRADO_1]":  "Dr. Marcos Oliveira",
    "[VALOR_1]":       "R$ 85.000,00"
  }

=== LLM PROCESSA (so ve tokens) ===

Claude recebe:
  "[PARTE_AUTORA] move acao contra [PARTE_RE]..."

Claude responde:
  "Com base nos fatos, [PARTE_AUTORA] tem direito a...
   recomendo peticionar ao [MAGISTRADO_1] solicitando
   que [PARTE_RE] pague [VALOR_1] referente a..."

=== VOLTA (antes de mostrar ao usuario) ===

PII Vault re-hidrata:
  "Com base nos fatos, Claudio Souza da Silva tem direito a...
   recomendo peticionar ao Dr. Marcos Oliveira solicitando
   que Empresa Tech Ltda pague R$ 85.000,00 referente a..."

RESULTADO: Usuario ve resposta completa. LLM nunca viu dados reais.
```

### Arquivo: `electron/privacy/pii-vault.ts`

```typescript
// Estrutura do PII Vault
interface PIIVault {
  // Mapa bidirecional: token <-> valor real
  entries: Map<string, string>;       // "[PARTE_A]" -> "Claudio Souza"
  reverse: Map<string, string>;       // "Claudio Souza" -> "[PARTE_A]"

  // Contadores por categoria (pra gerar tokens unicos)
  counters: {
    parte_autora: number;
    parte_re: number;
    magistrado: number;
    cpf: number;
    cnpj: number;
    oab: number;
    email: number;
    telefone: number;
    valor: number;
    endereco: number;
    rg: number;
  };
}

// API publica
export function createVault(): PIIVault;
export function mask(vault: PIIVault, text: string): string;      // anonimiza
export function unmask(vault: PIIVault, text: string): string;    // re-hidrata
export function maskObject(vault: PIIVault, obj: any): any;       // anonimiza objeto recursivo
export function unmaskObject(vault: PIIVault, obj: any): any;     // re-hidrata objeto recursivo
export function clearVault(vault: PIIVault): void;                // limpa apos uso
```

### Deteccao de PII (patterns brasileiros)

```typescript
const PII_PATTERNS = {
  // CPF: 123.456.789-00
  cpf: /\d{3}\.\d{3}\.\d{3}-\d{2}/g,

  // CNPJ: 12.345.678/0001-90
  cnpj: /\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/g,

  // OAB: OAB 12345/SP ou OAB/SP 12345
  oab: /OAB\s*[\/]?\s*\d{3,6}\s*[\/]?\s*[A-Z]{2}/gi,

  // Email
  email: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,

  // Telefone: (91) 98765-4321 ou 91987654321
  telefone: /\(?\d{2}\)?\s*\d{4,5}-?\d{4}/g,

  // Valores monetarios: R$ 1.234,56 ou R$1234.56
  valor: /R\$\s*[\d.,]+/g,

  // Numero de processo CNJ: 0000000-00.0000.0.00.0000
  processo_cnj: /\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}/g,

  // RG: 12.345.678-9 ou 1234567
  rg: /\d{1,2}\.?\d{3}\.?\d{3}-?[\dxX]/g,
};
```

### Deteccao de Nomes (NER simplificado)

Para nomes de partes e magistrados, regex nao basta. Estrategia hibrida:

```typescript
// 1. Nomes ja conhecidos: vem do PJe (partes.autor, partes.reu, juiz)
//    Esses sao 100% confiaveis — o PJe ja diz quem e quem
function maskKnownEntities(vault: PIIVault, text: string, processo: ProcessoData): string {
  // Mascara nomes das partes (vem estruturado do PJe)
  for (const autor of processo.partes.autor) {
    text = replaceAll(text, autor, getOrCreateToken(vault, 'parte_autora', autor));
  }
  for (const reu of processo.partes.reu) {
    text = replaceAll(text, reu, getOrCreateToken(vault, 'parte_re', reu));
  }
  // Juiz
  if (processo.juiz) {
    text = replaceAll(text, processo.juiz, getOrCreateToken(vault, 'magistrado', processo.juiz));
  }
  // Advogados
  for (const adv of processo.advogados ?? []) {
    text = replaceAll(text, adv.nome, getOrCreateToken(vault, 'advogado', adv.nome));
  }
  return text;
}

// 2. Nomes desconhecidos: heuristica para padroes brasileiros
//    "Dr.", "Dra.", nomes proprios antes de sobrenomes comuns
//    Menos confiavel — usado como segunda passada
function maskUnknownNames(vault: PIIVault, text: string): string {
  // Titulos seguidos de nomes: "Dr. Fulano de Tal", "Juiz(a) Nome"
  const titlePattern = /(?:Dr\.?a?|Juiz(?:a)?|Des(?:embargador)?a?|Min(?:istro)?a?)\s+([A-Z][a-z]+(?:\s+(?:de|da|do|dos|das|e)\s+)?(?:[A-Z][a-z]+\s*)+)/g;
  // ... aplica mascaramento
}
```

### Onde o Vault se conecta no codigo existente

```
HOJE (think.ts buildContextSection):
  state.contexto.processo.partes.autor  -->  direto pro prompt

COM VAULT:
  state.contexto.processo.partes.autor  -->  vault.mask()  -->  prompt anonimizado
                                                                      |
                                                                      v
                                                                 LLM responde
                                                                      |
                                                                      v
                                                              vault.unmask()  -->  resposta real

Pontos de integracao:
  1. think.ts L261-378  (buildContextSection) --> mask antes de montar contexto
  2. think.ts callLLM() --> garantir que prompt ja esta masked
  3. loop.ts (onde emite 'token') --> unmask no streaming de resposta
  4. critic.ts (onde envia pro LLM avaliar) --> mask tambem
  5. skills/pje/consultar.ts --> mask o resultado antes de guardar no state
  6. skills/documentos/analisar.ts --> mask o conteudo do documento
  7. skills/browser/get-html.ts --> mask HTML extraido
```

### Vault Lifecycle

```
1. Usuario manda mensagem
2. Agent loop inicia --> cria PIIVault vazio para este run
3. Skills executam, extraem dados do PJe --> dados reais entram no vault
4. buildContextSection() --> chama vault.mask() em tudo
5. callLLM() --> envia contexto anonimizado
6. Resposta chega --> vault.unmask() antes de emitir tokens pro UI
7. Agent loop termina --> vault e descartado (nao persiste)

O vault vive APENAS durante um run do agent loop.
Dados reais nunca tocam disco em formato mapeavel.
```

---

## 4. CAMADA 2: Consent Gate (Consentimento e Transparencia)

### Conceito

Antes de enviar qualquer dado pra um LLM externo, o usuario precisa:
1. Saber QUE dados serao enviados
2. Saber PRA ONDE serao enviados
3. Autorizar explicitamente
4. Poder revogar a qualquer momento

### Niveis de Consentimento

```
+------------------------------------------------------------------+
|                    CONSENT LEVELS                                  |
|                                                                    |
|  NIVEL 1: Anonimizado (padrao)                                   |
|  - PII Vault ativo                                                |
|  - LLM so ve tokens ([PARTE_A], [CPF_1])                        |
|  - Maximo de privacidade                                          |
|  - Pode perder contexto em casos muito especificos               |
|                                                                    |
|  NIVEL 2: Parcial                                                 |
|  - Anonimiza CPF, CNPJ, email, telefone, valores                |
|  - Nomes de partes MANTIDOS (LLM precisa pra peticoes)           |
|  - Bom pra quem precisa de output mais natural                   |
|                                                                    |
|  NIVEL 3: Completo (opt-in explicito)                             |
|  - Nenhuma anonimizacao                                           |
|  - Usuario sabe e aceita o risco                                  |
|  - Aviso claro: "dados reais enviados para [provider]"           |
|                                                                    |
|  NIVEL 0: Modelo Local (Ollama)                                   |
|  - Nada sai da maquina                                            |
|  - Zero risco de vazamento                                        |
|  - Performance/qualidade menor                                    |
+------------------------------------------------------------------+
```

### Arquivo: `electron/privacy/consent-manager.ts`

```typescript
interface ConsentConfig {
  // Nivel padrao de anonimizacao
  defaultLevel: 0 | 1 | 2 | 3;

  // Consentimento por provider
  providers: {
    [providerId: string]: {
      consented: boolean;
      level: 0 | 1 | 2 | 3;
      consentedAt: string;      // ISO date
      consentVersion: string;   // versao do termo aceito
    }
  };

  // Consentimento por tipo de dado
  dataTypes: {
    nomes: boolean;          // nomes de partes
    documentos: boolean;     // conteudo de documentos
    cpf_cnpj: boolean;       // documentos de identidade
    valores: boolean;        // valores monetarios
    historico: boolean;      // historico de conversas
  };

  // Preferencia de fallback
  fallbackToLocal: boolean;  // se consent negado, usar Ollama?
}
```

### First-Run Dialog

```
+----------------------------------------------------------+
|                                                            |
|  BEM-VINDO A LEX                                          |
|                                                            |
|  A LEX usa inteligencia artificial para te ajudar.        |
|  Para funcionar, envia dados para provedores de IA        |
|  externos (Anthropic, OpenAI, etc).                       |
|                                                            |
|  COMO PROTEGEMOS SEUS DADOS:                              |
|                                                            |
|  [*] Anonimizacao automatica (recomendado)                |
|      Nomes, CPFs, valores sao substituidos por            |
|      codigos antes de sair da sua maquina.                |
|      A IA analisa sem ver dados reais.                    |
|                                                            |
|  [ ] Anonimizacao parcial                                 |
|      Nomes mantidos, documentos anonimizados.             |
|                                                            |
|  [ ] Sem anonimizacao                                     |
|      Dados enviados como estao.                           |
|      (nao recomendado para dados de clientes)             |
|                                                            |
|  [ ] Modelo local (Ollama)                                |
|      Nenhum dado sai da sua maquina.                      |
|      Qualidade reduzida.                                  |
|                                                            |
|  Voce pode mudar isso a qualquer momento em               |
|  Configuracoes > Privacidade.                             |
|                                                            |
|           [ Aceitar e Continuar ]                          |
|                                                            |
|  Ao continuar, voce concorda com nossa                    |
|  Politica de Privacidade (link).                          |
|                                                            |
+----------------------------------------------------------+
```

### Transparencia em Tempo Real

Enquanto o agent roda, o usuario pode ver:

```
+------------------------------------------+
|  PRIVACIDADE                     [=]     |
|                                          |
|  Provider: Anthropic (Claude)            |
|  Nivel: Anonimizado                      |
|  Dados mascarados: 12 entidades          |
|   - 2 nomes de partes                    |
|   - 1 CPF                               |
|   - 1 CNPJ                              |
|   - 1 magistrado                         |
|   - 1 valor                             |
|   - 3 emails                            |
|   - 3 OABs                              |
|                                          |
|  [Ver o que foi enviado]                 |
|  [Alterar nivel]                         |
+------------------------------------------+
```

---

## 5. CAMADA 3: Modelo Local (Ollama / Zero Leak)

### Conceito

Para escritorios que nao aceitam nenhum risco de vazamento, oferecer LLM local como opcao.

### Integracao

```typescript
// provider-config.ts — adicionar provider "local"
const LOCAL_PROVIDER = {
  id: 'local',
  name: 'Modelo Local (Ollama)',
  type: 'ollama',
  baseUrl: 'http://localhost:11434',
  models: [
    { id: 'llama3.1:8b', name: 'Llama 3.1 8B', context: 8192 },
    { id: 'llama3.1:70b', name: 'Llama 3.1 70B', context: 8192 },
    { id: 'qwen2.5:14b', name: 'Qwen 2.5 14B', context: 32768 },
    { id: 'deepseek-r1:14b', name: 'DeepSeek R1 14B', context: 32768 },
  ],
  requiresApiKey: false,
  privacyLevel: 'local',  // marcador especial
};
```

### Quando usar modelo local

```
Consent Gate decide:
  - Usuario escolheu nivel 0 (local) --> sempre Ollama
  - Usuario negou consent pro provider atual --> fallback Ollama
  - Dados extremamente sensiveis detectados --> sugere Ollama
  - Sem internet --> Ollama automatico
```

### Limitacoes honestas

| Aspecto | Cloud (Claude) | Local (Ollama 8B) |
|---|---|---|
| Qualidade juridica | Excelente | Razoavel |
| Velocidade | Rapido (API) | Depende do hardware |
| Privacidade | Depende do vault | Total |
| Custo | API key / tokens | GPU/RAM local |
| Peticoes complexas | Sim | Limitado |

### Estrategia hibrida recomendada

```
Analise simples (classificar documento, extrair dados)
  --> Modelo local (nao precisa de Claude pra isso)

Geracao complexa (peticao, recurso, parecer)
  --> Cloud com PII Vault ativo (precisa de qualidade)

Dados ultra-sensiveis (sigilo de justica, menor)
  --> Modelo local obrigatorio (sem opcao de cloud)
```

---

## 6. Criptografia em Repouso

### Arquivos que precisam de criptografia

| Arquivo | Contem | Prioridade |
|---|---|---|
| `sessions.json` | Historico completo de conversas com dados de caso | CRITICA |
| `lex-agent-memory.json` | Nome, OAB, processos recentes, interacoes | CRITICA |
| `lex-doc-index.json` | Chunks de documentos do escritorio | ALTA |
| `route-memory.json` | Rotas aprendidas no PJe | MEDIA |

### Implementacao

Reusar `crypto-store.ts` que ja existe (AES-256-GCM):

```typescript
// electron/privacy/encrypted-storage.ts
import { encrypt, decrypt } from '../crypto-store';

export function saveEncrypted(filePath: string, data: any): void {
  const json = JSON.stringify(data);
  const encrypted = encrypt(json);  // AES-256-GCM
  fs.writeFileSync(filePath, encrypted, 'utf-8');
}

export function loadEncrypted(filePath: string): any {
  const encrypted = fs.readFileSync(filePath, 'utf-8');
  const json = decrypt(encrypted);
  return JSON.parse(json);
}
```

---

## 7. Audit Log

### O que registrar

```typescript
interface AuditEntry {
  timestamp: string;
  action: 'llm_call' | 'data_access' | 'consent_change' | 'data_delete';
  provider?: string;          // qual LLM recebeu dados
  piiMasked: number;          // quantas entidades foram mascaradas
  piiTypes: string[];         // quais tipos: ['cpf', 'nome', 'valor']
  consentLevel: number;       // nivel de consent ativo
  dataSize: number;           // tamanho do payload enviado (chars)
  sessionId: string;
}
```

### Onde fica

```
%APPDATA%/lex-test1/audit/
  2026-03-16.log    <-- criptografado, um arquivo por dia
  2026-03-15.log
  ...
```

Auto-delete apos 90 dias (configuravel).

---

## 8. Checklist de Conformidade LGPD

```
IMPLEMENTACAO:
  [ ] PII Vault (mascara reversivel)
  [ ] Consent Manager (first-run dialog + settings)
  [ ] Transparencia em tempo real (badge de privacidade)
  [ ] Criptografia em repouso (sessions, memory, doc-index)
  [ ] Audit log (registro de envios)
  [ ] Provider local (Ollama)
  [ ] Direito de exclusao (deletar todos os dados)
  [ ] Direito de portabilidade (exportar dados)
  [ ] Politica de privacidade (documento)
  [ ] Data retention automatico (auto-delete)

LGPD ESPECIFICO:
  [ ] Base legal para tratamento (consentimento)
  [ ] Aviso de privacidade no app
  [ ] Registro de operacoes de tratamento
  [ ] Encarregado (DPO) — ponto de contato
  [ ] Notificacao de incidentes (plano)
```

---

## 9. Prioridade de Implementacao

```
SPRINT 1 — Fundacao (bloqueia tudo)
  1. pii-vault.ts           -> mascara reversivel
  2. Integrar vault no think.ts e loop.ts

SPRINT 2 — Consentimento
  3. consent-manager.ts     -> niveis + storage
  4. First-run dialog no renderer
  5. Pagina de privacidade em settings

SPRINT 3 — Protecao em Repouso
  6. encrypted-storage.ts   -> sessions, memory, doc-index
  7. audit-log.ts           -> registro de envios

SPRINT 4 — Modelo Local
  8. Ollama como provider    -> provider-config.ts
  9. Fallback automatico     -> consent gate
  10. UI pra gerenciar modelos locais

SPRINT 5 — Compliance
  11. Direito de exclusao/portabilidade
  12. Politica de privacidade
  13. Auto-delete por retention policy
```

---

## 10. Diagrama Final

```
+================================================================+
|                    LEX SECURITY LAYERS                           |
|                                                                  |
|  DADOS BRUTOS                                                    |
|  (PJe, docs, usuario)                                          |
|         |                                                        |
|         v                                                        |
|  +------------------+                                            |
|  | PII VAULT        |  electron/privacy/pii-vault.ts            |
|  | Detecta PII      |  - Regex: CPF, CNPJ, OAB, email, tel    |
|  | Mascara          |  - NER: nomes de partes (do PJe)          |
|  | Guarda mapa      |  - Mapa bidirecional em memoria           |
|  | local            |  - Nunca persiste, morre com o run        |
|  +--------+---------+                                            |
|           |                                                      |
|           v                                                      |
|  +------------------+                                            |
|  | CONSENT GATE     |  electron/privacy/consent-manager.ts      |
|  | Nivel 0: Local   |  - Verifica consentimento do usuario      |
|  | Nivel 1: Anon    |  - Nivel 0 -> Ollama (nada sai)          |
|  | Nivel 2: Parcial |  - Nivel 1 -> mask completo               |
|  | Nivel 3: Full    |  - Nivel 2 -> mask parcial                |
|  +--------+---------+  - Nivel 3 -> sem mask (opt-in)           |
|           |                                                      |
|           v                                                      |
|  +------------------+     +------------------+                   |
|  | CLOUD LLM        |     | LOCAL LLM        |                  |
|  | (anonimizado)     | OR  | (Ollama)         |                  |
|  | Claude/OpenAI/etc |     | Zero data leak   |                  |
|  +--------+---------+     +--------+---------+                   |
|           |                         |                            |
|           +------------+------------+                            |
|                        |                                         |
|                        v                                         |
|  +------------------+                                            |
|  | PII VAULT        |                                            |
|  | Re-hidrata       |  [PARTE_A] -> "Claudio Souza"            |
|  | tokens -> reais  |  [CPF_1] -> "123.456.789-00"             |
|  +--------+---------+                                            |
|           |                                                      |
|           v                                                      |
|  +------------------+                                            |
|  | AUDIT LOG        |  electron/privacy/audit-log.ts            |
|  | Registra envio   |  - O que foi enviado (redacted)           |
|  | Criptografado    |  - Pra qual provider                      |
|  +--------+---------+  - Quantas entidades mascaradas           |
|           |                                                      |
|           v                                                      |
|  +------------------+                                            |
|  | ENCRYPTED        |  electron/privacy/encrypted-storage.ts    |
|  | STORAGE          |  - AES-256-GCM (reusa crypto-store)      |
|  | sessions.json    |  - Chave derivada da maquina             |
|  | memory.json      |  - Auto-delete por retention              |
|  | doc-index.json   |                                           |
|  +------------------+                                            |
|           |                                                      |
|           v                                                      |
|      OUTPUT PRO USUARIO                                          |
|      (dados reais restaurados)                                   |
+================================================================+
```
