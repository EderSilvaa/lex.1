# Fase 5: Testes e Validação

**Duração estimada:** 2 dias (16 horas)
**Esforço:** Médio
**Status:** ⏳ Pendente

---

## Objetivos

✅ Testes de análise de processos
✅ Testes de geração de minutas
✅ Testes de automação Playwright
✅ Testes de performance
✅ Correção de bugs encontrados
✅ Validação de UX

---

## Categorias de Testes

### 5.1 Testes Funcionais (6 horas)

#### A. Teste de Chat e Comunicação IPC

**Cenários:**
1. Enviar mensagem no chat
2. Receber resposta da IA
3. Histórico salvar corretamente
4. Markdown renderizar
5. Comandos especiais funcionar

**Checklist:**
- [ ] Chat envia mensagens
- [ ] Respostas chegam via IPC
- [ ] Histórico persiste
- [ ] Markdown OK
- [ ] Comandos funcionam

#### B. Teste de Análise de Processos

**Cenários:**
1. Navegar para processo no PJe
2. Extrair número do processo
3. Descobrir documentos
4. Baixar e processar PDFs
5. Classificar documentos
6. Gerar análise com IA

**Checklist:**
- [ ] Descoberta de documentos
- [ ] Download funcionando
- [ ] PDF.js extrai texto
- [ ] OCR funciona (se necessário)
- [ ] Classificação correta
- [ ] Análise gerada

#### C. Teste de Geração de Minutas

**Cenários:**
1. Comando "minutar certidão"
2. Busca template PJe
3. Preenche campos
4. Formata texto
5. Exibe resultado

**Checklist:**
- [ ] Templates encontrados
- [ ] Campos preenchidos
- [ ] Formatação correta
- [ ] HTML limpo
- [ ] Botão copiar funciona

#### D. Teste de Automação

**Cenários:**
1. Comando "protocolar petição"
2. Plano criado
3. Aprovação do usuário
4. Execução das ações
5. Feedback em tempo real

**Checklist:**
- [ ] Plano gerado
- [ ] Modal de aprovação
- [ ] Ações executam
- [ ] Progresso atualiza
- [ ] Conclusão notificada

---

### 5.2 Testes de Integração (4 horas)

#### A. Backend ↔ Frontend

**Testes:**
```javascript
// 1. Criar sessão
const sessionId = await window.electronAPI.createSession();
assert(sessionId, 'Sessão criada');

// 2. Executar comando
const result = await window.electronAPI.executeCommand(
  sessionId,
  'teste',
  {}
);
assert(result.success, 'Comando executado');

// 3. Listener de evento
let planReceived = false;
window.electronAPI.onPlanCreated(() => {
  planReceived = true;
});
await delay(1000);
assert(planReceived, 'Evento recebido');
```

**Checklist:**
- [ ] IPC bidirecional funciona
- [ ] Eventos chegam corretamente
- [ ] Erros são capturados
- [ ] Timeouts não ocorrem

#### B. PJe BrowserView ↔ Backend

**Testes:**
1. Inicializar PJe
2. Navegar para página
3. Executar script
4. Capturar screenshot
5. Extrair dados

**Checklist:**
- [ ] BrowserView carrega
- [ ] Scripts executam
- [ ] Screenshots funcionam
- [ ] Dados extraídos

#### C. Supabase Edge Functions

**Testes:**
1. Chamar LEX-AGENT-PLANNER
2. Chamar OPENIA
3. Validar respostas
4. Testar com screenshot
5. Testar sem screenshot

**Checklist:**
- [ ] PLANNER responde
- [ ] OPENIA responde
- [ ] Vision funciona
- [ ] Streaming OK
- [ ] Erros tratados

---

### 5.3 Testes de Performance (3 horas)

#### A. Tempo de Resposta

**Métricas esperadas:**
- Inicialização do app: < 5s
- Carregar interface: < 1s
- Enviar mensagem: < 200ms
- Resposta da IA: < 10s
- Criar plano: < 15s
- Download de PDF (1MB): < 2s
- Extração de texto (10 páginas): < 5s
- Screenshot: < 1s

**Checklist:**
- [ ] App inicia rápido
- [ ] UI responsiva
- [ ] IA responde em tempo aceitável
- [ ] Downloads eficientes

#### B. Uso de Memória

**Monitorar:**
- Main process: < 300 MB
- Renderer process: < 200 MB
- BrowserView: < 500 MB

**Ferramentas:**
```javascript
// No main process
setInterval(() => {
  const usage = process.memoryUsage();
  console.log(`Memória: ${Math.round(usage.heapUsed / 1024 / 1024)} MB`);
}, 30000);
```

**Checklist:**
- [ ] Sem memory leaks
- [ ] Uso de memória estável
- [ ] Garbage collector funciona

#### C. Concorrência

**Testes:**
- 6 downloads simultâneos
- 3 sessões ativas
- Múltiplos comandos na fila

**Checklist:**
- [ ] Downloads paralelos OK
- [ ] Sessões independentes
- [ ] Fila de comandos funciona

---

### 5.4 Testes de Estabilidade (2 horas)

#### A. Testes de Longa Duração

**Cenário:**
1. Abrir app
2. Executar 50 comandos
3. Processar 20 documentos
4. Gerar 10 minutas
5. Manter aberto por 2 horas

**Checklist:**
- [ ] Sem crashes
- [ ] Sem travamentos
- [ ] Memória estável
- [ ] Performance mantida

#### B. Testes de Recuperação de Erros

**Cenários:**
1. Perda de conexão com internet
2. Supabase indisponível
3. PJe não responde
4. PDF corrompido
5. Comando inválido

**Checklist:**
- [ ] Erros capturados
- [ ] Mensagens claras
- [ ] App não trava
- [ ] Recuperação automática

---

### 5.5 Testes de UX (2 horas)

#### A. Usabilidade

**Critérios:**
- Interface intuitiva
- Feedback visual claro
- Transições suaves
- Botões responsivos
- Atalhos de teclado funcionam

**Checklist:**
- [ ] UI intuitiva
- [ ] Feedback adequado
- [ ] Animações suaves
- [ ] Atalhos funcionam

#### B. Acessibilidade

**Verificar:**
- Contraste de cores
- Tamanho de fonte
- Navegação por teclado
- Mensagens de erro claras

**Checklist:**
- [ ] Contraste adequado
- [ ] Fonte legível
- [ ] Navegável por teclado
- [ ] Erros claros

---

### 5.6 Correção de Bugs (4 horas)

**Processo:**
1. Documentar bug encontrado
2. Reproduzir bug
3. Identificar causa
4. Implementar fix
5. Testar fix
6. Validar não quebrou outras funcionalidades

**Criar `docs/BUGS-ENCONTRADOS.md` para documentar**

**Checklist:**
- [ ] Todos os bugs documentados
- [ ] Bugs críticos corrigidos
- [ ] Regression tests passando

---

## Matriz de Testes

| Funcionalidade | Status | Prioridade | Notas |
|----------------|--------|------------|-------|
| Chat básico | ⏳ | Alta | - |
| IPC comunicação | ⏳ | Alta | - |
| Análise processos | ⏳ | Alta | - |
| Geração minutas | ⏳ | Média | - |
| Automação PJe | ⏳ | Alta | - |
| BrowserView | ⏳ | Alta | - |
| PDF processing | ⏳ | Média | - |
| OCR | ⏳ | Baixa | - |
| Performance | ⏳ | Média | - |
| Estabilidade | ⏳ | Alta | - |

**Legenda:** ⏳ Pendente | 🔄 Em teste | ✅ Aprovado | ❌ Reprovado

---

## Ferramentas de Teste

### Console de Debug

```javascript
// Adicionar no renderer
window.debug = {
  sessionId: null,
  logs: [],
  async testChat() {
    const msg = 'teste de chat';
    await window.lex.sendMessage(msg);
  },
  async testPJe() {
    await window.electronAPI.pjeNavigate('https://pje.tjpa.jus.br');
  },
  memoryUsage() {
    return performance.memory;
  }
};
```

### Logs Estruturados

```javascript
// src/main/logger.js
class Logger {
  static log(level, message, data = {}) {
    const timestamp = new Date().toISOString();
    const log = { timestamp, level, message, data };
    console.log(JSON.stringify(log));
    // Salvar em arquivo se necessário
  }

  static info(msg, data) { this.log('INFO', msg, data); }
  static warn(msg, data) { this.log('WARN', msg, data); }
  static error(msg, data) { this.log('ERROR', msg, data); }
}
```

---

## Validação da Fase 5

### Critérios de Sucesso

✅ Todos os testes funcionais passando
✅ Performance dentro dos limites
✅ Sem memory leaks
✅ Bugs críticos corrigidos
✅ UX validada
✅ App estável por 2+ horas

### Entregáveis

1. ✅ Matriz de testes completa
2. ✅ Documentação de bugs
3. ✅ Relatório de performance
4. ✅ Todos os fixes implementados

---

## Próxima Fase

➡️ **[Fase 6: Build e Distribuição](FASE-6-BUILD-DISTRIBUICAO.md)**

---

**Status:** ⏳ Aguardando início
**Atualizado:** 2025-12-10
