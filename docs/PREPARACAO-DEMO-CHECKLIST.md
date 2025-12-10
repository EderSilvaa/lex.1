# Checklist de Preparação - Demo LEX para TJPA

## ✅ Checklist Completo

### 📋 1 Semana Antes

#### Ambiente de Desenvolvimento
- [ ] Atualizar repositório
  ```bash
  git pull origin main
  git status  # Verificar se está limpo
  ```

- [ ] Verificar dependências
  ```bash
  npm install  # Frontend
  cd lex-agent-backend && npm install  # Backend
  ```

- [ ] Testar build TypeScript
  ```bash
  npm run build  # Se tiver script de build
  tsc --noEmit  # Verificar erros de tipo
  ```

#### Credenciais e APIs
- [ ] Verificar API Key OpenAI
  - Acesso em: https://platform.openai.com/api-keys
  - Saldo suficiente ($5+ recomendado)
  - Rate limit: 10 RPM mínimo

- [ ] Testar Supabase Edge Function
  ```bash
  curl -X POST https://nspauxzztflgmxjgevmo.supabase.co/functions/v1/OPENIA \
    -H "Content-Type: application/json" \
    -d '{"messages":[{"role":"user","content":"teste"}]}'
  ```

- [ ] Configurar variáveis de ambiente
  ```bash
  # Criar .env se não existir
  echo "OPENAI_API_KEY=sk-..." > .env
  echo "SUPABASE_URL=https://nspauxzztflgmxjgevmo.supabase.co" >> .env
  ```

#### PJe Homologação
- [ ] Conseguir acesso ao PJe de homologação do TJPA
  - URL: [preencher]
  - Usuário: [preencher]
  - Senha: [preencher]

- [ ] Preparar 3-5 processos de teste variados:
  - [ ] Processo simples (cobrança, 5-10 páginas)
  - [ ] Processo complexo (direito constitucional, 50+ páginas)
  - [ ] Processo com prazos próximos ao vencimento
  - [ ] Processo com múltiplas partes
  - [ ] Processo com documentos escaneados (testar OCR)

- [ ] Criar documentos fictícios para testar juntada:
  - [ ] documento-teste.pdf (5 páginas)
  - [ ] procuracao.pdf
  - [ ] contestacao.pdf

### 📋 1 Dia Antes

#### Teste Completo da Extensão
- [ ] Desinstalar extensão atual
- [ ] Reinstalar do zero (simular fresh install)
  ```
  1. chrome://extensions
  2. Ativar "Modo do desenvolvedor"
  3. "Carregar sem compactação"
  4. Selecionar pasta do projeto
  5. Verificar se não há erros
  ```

- [ ] Testar cada funcionalidade:
  - [ ] Chat básico ("Olá")
  - [ ] Análise automática (Ctrl+;)
  - [ ] Extração de PDF
  - [ ] Geração de minuta
  - [ ] LEX Agent (ação simples)

#### Teste do Backend
- [ ] Iniciar servidor
  ```bash
  cd lex-agent-backend
  npm start
  ```

- [ ] Verificar health check
  ```bash
  curl http://localhost:3000/health
  # Deve retornar: {"status":"ok"}
  ```

- [ ] Testar WebSocket
  ```bash
  # Em outro terminal
  npx wscat -c ws://localhost:3000
  # Deve conectar sem erro
  ```

- [ ] Verificar Chrome debugger
  ```
  1. Iniciar Chrome com debug:
     chrome.exe --remote-debugging-port=9222

  2. Abrir http://localhost:9222
  3. Verificar se lista abas abertas
  ```

#### Preparar Plano B
- [ ] Gravar vídeo de backup de cada funcionalidade
  - [ ] Video 1: Análise automática (1 min)
  - [ ] Video 2: Chat inteligente (2 min)
  - [ ] Video 3: Geração de minuta (1 min)
  - [ ] Video 4: LEX Agent (2 min)

- [ ] Screenshots de alta qualidade
  - [ ] Interface LEX
  - [ ] Exemplo de análise
  - [ ] Exemplo de minuta
  - [ ] Logs do Agent

- [ ] Ter segunda máquina/notebook com backup completo

#### Documentação
- [ ] Imprimir/ter aberto:
  - [ ] APRESENTACAO-TJPA.md
  - [ ] PONTOS-CHAVE-APRESENTACAO.md
  - [ ] Este checklist
  - [ ] docs/ARQUITETURA.md (para dúvidas técnicas)

- [ ] Preparar slides (opcional)
  - [ ] Usar APRESENTACAO-TJPA.md como base
  - [ ] Incluir screenshots
  - [ ] Máximo 20 slides

### 📋 2 Horas Antes

#### Setup do Ambiente de Apresentação
- [ ] Fechar todas as abas desnecessárias do Chrome
- [ ] Desativar notificações do sistema
  ```
  Windows: Configurações → Sistema → Notificações
  Ativar "Modo foco" ou "Não perturbe"
  ```

- [ ] Limpar histórico/cache do navegador (opcional)
  ```
  chrome://settings/clearBrowserData
  ```

- [ ] Verificar conexão de internet
  - [ ] Velocidade: >10 Mbps
  - [ ] Latência: <100ms
  - [ ] Ter hotspot mobile como backup

#### Iniciar Serviços
- [ ] Backend Node.js
  ```bash
  cd lex-agent-backend
  npm start

  # Verificar log:
  # ✓ WebSocket server running on ws://localhost:3000
  # ✓ HTTP server running on http://localhost:3000
  ```

- [ ] Chrome com debugger
  ```bash
  # Windows
  "C:\Program Files\Google\Chrome\Application\chrome.exe" --remote-debugging-port=9222 --user-data-dir="C:\temp\chrome-debug"

  # Verificar: http://localhost:9222/json
  ```

- [ ] DevTools aberto (F12)
  - [ ] Aba Console limpa
  - [ ] Aba Network preparada para filtrar WS
  - [ ] Aba Application → localStorage visível

#### Carregar Dados de Teste
- [ ] Fazer login no PJe homologação
- [ ] Abrir processo de teste principal
- [ ] Fazer 1 análise para cachear dados
  ```
  1. Ctrl+; (análise automática)
  2. Aguardar conclusão
  3. Verificar localStorage tem dados
  ```

- [ ] Testar chat rapidamente
  - [ ] "Olá" → Deve responder
  - [ ] "Quem é o autor?" → Deve responder com contexto

- [ ] Ter documentos de teste prontos
  - [ ] documento-teste.pdf no Desktop
  - [ ] Caminho copiado para clipboard

#### Configurar Display
- [ ] Resolução adequada (1920x1080 recomendado)
- [ ] Zoom do navegador: 100%
- [ ] Extensão LEX visível no canto inferior direito
- [ ] Fonte grande o suficiente para plateia ver

### 📋 30 Minutos Antes

#### Teste Final Completo (Dry Run)

**Cronometrar cada passo:**

1. **Análise Automática (2 min)**
   - [ ] Ctrl+; → Funciona?
   - [ ] Streaming aparece?
   - [ ] Resposta completa em <30s?
   - [ ] Formatação markdown OK?

2. **Chat Inteligente (3 min)**
   - [ ] "Há prazos próximos ao vencimento?" → Resposta?
   - [ ] "Qual a jurisprudência relevante?" → Resposta?
   - [ ] "Gere um resumo" → Resposta?
   - [ ] Tempo total <3 min?

3. **Geração de Minuta (2 min)**
   - [ ] Botão "Gerar Minuta" → Funciona?
   - [ ] Modal abre?
   - [ ] Selecionar tipo → Gera em <5s?
   - [ ] Botão "Copiar" → Funciona?

4. **LEX Agent (3 min)**
   - [ ] Abrir LEX Agent
   - [ ] Comando "Juntar documento X"
   - [ ] Planejamento aparece?
   - [ ] Execução step-by-step?
   - [ ] HIL solicita aprovação?
   - [ ] Sucesso ao final?

**Se QUALQUER teste falhar:**
- [ ] Reiniciar serviços
- [ ] Limpar cache/localStorage
- [ ] Reinstalar extensão
- [ ] Usar Plano B (vídeos)

#### Preparação Pessoal
- [ ] Beber água
- [ ] Ir ao banheiro
- [ ] Respirar fundo 3x
- [ ] Revisar pontos-chave mentalmente
- [ ] Ter papel e caneta para anotar perguntas

### 📋 5 Minutos Antes

#### Setup Final
- [ ] Fechar todas as janelas exceto:
  - [ ] Chrome com PJe + LEX
  - [ ] Editor com APRESENTACAO-TJPA.md (segunda tela)
  - [ ] Terminal com backend rodando (minimizado)

- [ ] Verificar áudio (se apresentação online)
  - [ ] Microfone funcionando
  - [ ] Som do computador desligado (evitar notificações)

- [ ] Compartilhar tela (se online)
  - [ ] Escolher "Janela específica" (não desktop completo)
  - [ ] Testar se plateia vê bem

- [ ] Posicionar cursor no local de início
  - [ ] Chrome: Processo carregado
  - [ ] LEX: Botão ▲ visível

#### Mental Check
- [ ] "Estou preparado"
- [ ] "A ferramenta funciona"
- [ ] "Tenho plano B se algo der errado"
- [ ] "Vou demonstrar valor, não vender"
- [ ] "Perguntas são oportunidades, não ameaças"

---

## 🚨 Troubleshooting Rápido Durante Demo

### Problema: Chat não responde

**Diagnóstico:**
```javascript
// Abrir DevTools (F12) → Console
console.log(localStorage.getItem('openai_api_key'))  // API key existe?
```

**Solução:**
1. Verificar console: erro de CORS? Network?
2. Testar Edge Function manualmente
3. **Plano B:** Mostrar screenshot de funcionamento anterior

### Problema: LEX Agent não conecta

**Diagnóstico:**
```bash
# Terminal
curl http://localhost:3000/health
```

**Solução:**
1. Backend rodando? `npm start`
2. Chrome debugger ativo? Port 9222?
3. **Plano B:** Mostrar vídeo de execução anterior

### Problema: PDF não extrai

**Diagnóstico:**
```javascript
// Console
DocumentCache.getAll()  // Cache tem dados?
```

**Solução:**
1. PDF acessível? Sem senha?
2. Erro de CORS? Configurar PJe
3. **Plano B:** Usar documento já em cache

### Problema: Extensão não aparece

**Diagnóstico:**
```
chrome://extensions → LEX → Detalhes
```

**Solução:**
1. Recarregar extensão
2. Verificar erros: botão "Erros"
3. **Plano B:** Reinstalar extensão (30s)

### Problema: Internet caiu

**Solução:**
1. Ativar hotspot mobile
2. Conectar e continuar
3. **Plano B:** Mostrar vídeos offline

---

## 📊 Métricas para Medir Durante Demo

### Criar planilha simples:

| Funcionalidade | Tempo Esperado | Tempo Real | Sucesso? |
|---------------|---------------|-----------|----------|
| Análise automática | 10-30s | ? | ✓/✗ |
| Chat (3 perguntas) | <3 min | ? | ✓/✗ |
| Geração minuta | 2-5s | ? | ✓/✗ |
| LEX Agent | 15-30s | ? | ✓/✗ |

**Compartilhar métricas ao final:**
> "Vejam, cumprimos todos os tempos prometidos em produção real!"

---

## 🎯 Lista de Verificação Pré-Demo (Imprimir)

```
┌─────────────────────────────────────────┐
│  CHECKLIST PRÉ-DEMO - IMPRIMIR         │
├─────────────────────────────────────────┤
│                                         │
│  SERVIÇOS                               │
│  [ ] Backend rodando (localhost:3000)   │
│  [ ] Chrome debugger (localhost:9222)   │
│  [ ] PJe homolog logado                 │
│  [ ] Processo de teste carregado        │
│                                         │
│  TESTES                                 │
│  [ ] Chat: "Olá" funciona               │
│  [ ] Análise: Ctrl+; funciona           │
│  [ ] Minuta: Modal abre                 │
│  [ ] Agent: Conecta ao backend          │
│                                         │
│  BACKUP                                 │
│  [ ] Vídeos de backup prontos           │
│  [ ] Screenshots prontos                │
│  [ ] Segunda máquina disponível         │
│                                         │
│  DOCUMENTOS                             │
│  [ ] APRESENTACAO-TJPA.md aberto        │
│  [ ] PONTOS-CHAVE-APRESENTACAO.md       │
│  [ ] docs/ARQUITETURA.md (referência)   │
│                                         │
│  AMBIENTE                               │
│  [ ] Notificações desligadas            │
│  [ ] Zoom 100%                          │
│  [ ] Display/tela OK                    │
│  [ ] Áudio/mic testado (se online)      │
│                                         │
│  MENTAL                                 │
│  [ ] Água ao lado                       │
│  [ ] Papel e caneta                     │
│  [ ] Respirei fundo 3x                  │
│  [ ] Estou preparado! 💪                │
│                                         │
└─────────────────────────────────────────┘
```

---

## 🎬 Ordem de Execução da Demo

### Introdução (2 min)
```
"Olá! Sou [nome], vou mostrar a LEX em ação.
LEX é uma extensão Chrome com IA que transforma
a experiência do PJe. Vamos direto ao que importa."
```

### Demo 1: Análise Automática (2 min)
```
[Mostra processo no PJe]
"Processo típico com 20+ páginas. Manualmente: 30-60 min."
[Pressiona Ctrl+;]
"Com LEX: 10-30 segundos."
[Aguarda streaming]
"Partes, pedidos, prazos, fundamentação... tudo automatizado."
```

### Demo 2: Chat Inteligente (3 min)
```
[Digita no chat]
"Há prazos próximos ao vencimento?"
[Aguarda resposta]
"Qual a jurisprudência relevante?"
[Aguarda resposta]
"Gere um resumo para o juiz"
[Aguarda resposta]
"Economia: horas de pesquisa manual."
```

### Demo 3: Geração de Minuta (2 min)
```
[Clica "Gerar Minuta"]
"Vou gerar uma certidão de trânsito em julgado..."
[Seleciona tipo]
"Combina template oficial do PJe + IA para personalizar"
[Mostra documento]
[Clica "Copiar"]
"Pronto para usar em 2-5 segundos."
```

### Demo 4: LEX Agent (3 min)
```
[Abre LEX Agent]
"Agora: automação via linguagem natural."
[Digita comando]
"Juntar documento X ao processo"
[Mostra planejamento]
"GPT-4 Vision 'enxerga' a tela e planeja."
[Execução step-by-step]
"Screenshots em tempo real."
[HIL aparece]
"Aprovação humana para ações críticas."
[Aprova]
[Sucesso]
"Log completo para auditoria CNJ."
```

### Conclusão (1 min)
```
"Recapitulando:
- 10-30s de análise vs 30-60 min
- Chat inteligente com contexto
- Documentos em 2-5s
- Automação com segurança jurídica

Próximo passo: piloto com 10 usuários por 2-4 semanas.

Perguntas?"
```

---

## 📞 Contatos de Emergência

### Se algo der MUITO errado

**Suporte Técnico:**
- [ ] Email: [seu email]
- [ ] Telefone: [seu telefone]
- [ ] Telegram: [seu telegram]

**Alternativas:**
- [ ] "Vamos remarcar para demonstração online mais detalhada"
- [ ] "Tenho vídeos de alta qualidade que mostram funcionamento"
- [ ] "Posso dar acesso ao ambiente de teste para explorarem"

### Após a Apresentação

**Enviar em até 24h:**
- [ ] Email agradecendo presença
- [ ] PDF da apresentação
- [ ] Link do repositório GitHub
- [ ] Vídeos da demo gravada (se permitido)
- [ ] Proposta de piloto formal

**Follow-up:**
- [ ] Agendar reunião em 3-5 dias
- [ ] Responder dúvidas pendentes
- [ ] Enviar documentação técnica adicional
- [ ] Marcar sessão de onboarding (se aprovado)

---

## ✅ Confirmação Final

Antes de iniciar, responder mentalmente:

1. **"Todos os serviços estão rodando?"**
   - Backend ✓
   - Chrome debugger ✓
   - PJe logado ✓

2. **"Testei a demo completa nos últimos 30 min?"**
   - Sim ✓

3. **"Tenho plano B para cada funcionalidade?"**
   - Vídeos ✓
   - Screenshots ✓
   - Segunda máquina ✓

4. **"Estou preparado para perguntas difíceis?"**
   - PONTOS-CHAVE-APRESENTACAO.md ao lado ✓
   - Documentação técnica aberta ✓
   - Confiança em 100% ✓

**Se todas as respostas são "Sim" → PODE COMEÇAR! 🚀**

---

**BOA SORTE!** 🍀

Você está tecnicamente preparado, a ferramenta funciona, e você vai arrasar! 💪
