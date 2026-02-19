# Lex Cowork
> Estratégia e visão do Lex como parceiro de escrita jurídica — trabalhando junto ao advogado na criação de minutas, petições e documentos.

---

## 1. O que é o Cowork

O Cowork é o lado criativo do Lex. Enquanto o Agent Loop automatiza ações no PJe, o Cowork escreve junto com o advogado.

A inspiração é o **Claude Code / Claude Cowork**: uma IA que tem acesso ao contexto real do seu trabalho — arquivos, processos abertos, histórico — e produz com esse contexto, não no escuro.

```
AGENT LOOP                    COWORK
──────────────────────        ──────────────────────
Age no PJe                    Escreve documentos
Automatiza tarefas            Cria com o advogado
Faz sem supervisão            Mostra e pede aprovação
Olha para fora (sistemas)     Olha para dentro (docs)
```

A diferença entre os dois é o **modo de trabalho**, não o nível de inteligência. Nos dois casos, Lex usa o mesmo motor: Claude Sonnet 4.6 + conhecimento jurídico + contexto real.

---

## 2. Por que minuta não é o produto

A criação de uma petição não é tecnicamente difícil. Um LLM qualquer escreve uma petição inicial. O problema é que ela sai **genérica**: sem os fatos reais, sem a lei aplicável ao caso, sem o estilo do escritório.

```
O que LLMs genéricos fazem:
  → "Petição inicial de aposentadoria por tempo de contribuição"
  → Texto correto, fatos inventados, estilo neutro
  → Não serve para protocolar

O que Lex Cowork faz:
  → Processo aberto no PJe → partes, pedidos, histórico carregados
  → Área jurídica identificada → lei, requisitos, teses aplicadas
  → Acervo do advogado lido → estilo e cláusulas do próprio escritório
  → Petição real, assinável
```

**O produto não é a minuta. É o contexto que a torna real.**

---

## 3. Os três pilares do Cowork

```
CONTEXTO DO PROCESSO
  Partes, pedidos, histórico, documentos juntados
  Vem do PJe via Agent Loop (já está carregado)
  Injeta automaticamente na escrita

CONTEXTO DA LEI
  Requisitos, prazos, teses ativas para cada área
  Embutido no knowledge layer do Lex
  Garante que a peça seja tecnicamente correta

ESTILO DO ESCRITÓRIO
  Lex lê as peças anteriores do advogado
  Aprende voz, estrutura, cláusulas recorrentes
  Toda minuta soa como o advogado, não como IA
```

---

## 4. Superfícies de escrita

O Cowork funciona em três lugares. O contexto é sempre o mesmo — o que muda é onde o texto aparece.

### 4.1 Editor dentro do Lex
Resultado imediato, sem sair do app. Ideal para rascunhos rápidos e iteração com o agent.

```
Advogado no Lex:
"Faça uma petição de tutela de urgência para este processo"

Lex carrega contexto do PJe aberto →
Gera a petição no editor integrado →
Advogado revisa, pede ajustes, exporta
```

### 4.2 Word Add-in (Normaex Legal)
O advogado já está no Word. O Add-in traz o Lex para dentro da ferramenta que ele usa.

```
Normaex hoje (acadêmico) → Normaex Legal (jurídico)
  Mesma infraestrutura de Add-in
  Novos prompts e domínio jurídico
  Sidebar com chat + inserção direta no documento
```

A ponte entre Lex e o Add-in: Lex expõe um servidor local (`localhost:3333`). O Add-in chama `/context` e recebe os dados do processo aberto — sem o advogado copiar nada.

```
Word → Normaex sidebar → "Gerar petição inicial"
          ↓
     GET localhost:3333/context
          ↓
     Lex responde: processo, partes, pedidos
          ↓
     Claude gera a petição com dados reais
          ↓
     Word.run() insere no cursor
```

### 4.3 DOCX gerado para download
Para casos onde o advogado não usa o editor do Lex nem o Add-in. Lex gera um `.docx` formatado com cabeçalho, fonte e margens corretas — pronto para assinar.

---

## 5. Níveis de capacidade

### Nível 1 — Contexto + Escrita

**Auto-contexto do PJe**
Processo aberto na aba do PJe → partes, número, juiz, pedidos anteriores injetados automaticamente na geração. O advogado não precisa informar nada.

**Aprendizado de estilo**
Advogado anexa 3–5 peças antigas. Lex lê, identifica padrões de estrutura, linguagem e cláusulas. Toda nova peça sai na mesma voz.

**Biblioteca de cláusulas do acervo**
Lex indexa os documentos do workspace e extrai cláusulas reutilizáveis por categoria. "A cláusula de honorários que você usa em risco" → busca no acervo real e insere.

**Surface de escrita múltipla**
Editor no Lex, Word via Add-in, ou DOCX para download. O contexto é o mesmo nos três.

---

### Nível 2 — Qualidade e revisão

**Refinamento multi-turno**
Contexto persistente por documento aberto. "Endurece o argumento do § 3." "Adiciona pedido de antecipação." Cada mensagem melhora a versão anterior sem perder o fio.

**Conhecimento da lei embutido**
Para cada área (previdenciário, trabalhista, cível) Lex já conhece requisitos, prazos e teses ativas. A peça nasce tecnicamente correta, não só bem escrita.

**Checklist antes de protocolar**
Antes de exportar o final: partes corretas? Pedidos numerados? Valor da causa? Documentos citados existem? Lex atua como revisor jurídico automático.

---

### Nível 3 — Escala

**Geração em lote**
Uma tese, 20 clientes → 20 petições adaptadas individualmente. O que levaria dois dias vira 10 minutos.

**Busca semântica no acervo**
"Já fiz alguma ação sobre motorista e tempo especial?" — Lex busca por conteúdo dos documentos, não por nome de arquivo.

**Comparação de minutas**
"Compare esta petição com o modelo que ganhei em 2023." Lex aponta o que mudou, o que está faltando, o que pode ser melhorado.

---

## 6. Arquitetura técnica

```
electron/
  cowork/
    context-builder.ts   ← monta contexto: processo + lei + estilo
    style-learner.ts     ← lê acervo e aprende estilo do advogado
    clause-index.ts      ← indexa e busca cláusulas nos docs existentes
    doc-generator.ts     ← gera DOCX com formatação jurídica correta
    local-server.ts      ← localhost:3333 para bridge com Word Add-in

electron/knowledge/
  previdenciario/        ← contexto legal: requisitos, prazos, teses
  trabalhista/           ← (próxima área)
  civil/                 ← (próxima área)

normaex-legal/           ← repositório separado (Word Add-in)
  taskpane/
    app.ts               ← sidebar com chat Lex
    word-bridge.ts       ← Word.run() para inserir texto no doc
    context-client.ts    ← GET localhost:3333/context
```

---

## 7. Cowork vs. ferramentas atuais

```
Ferramentas hoje                 Lex Cowork
────────────────────             ──────────────────────
Geradores de petição genérica →  Petição baseada no processo real
Advogado digita tudo de novo  →  Contexto injetado automaticamente
Tom genérico de IA            →  Estilo aprendido do próprio advogado
Sem revisão                   →  Checklist antes de protocolar
Um documento por vez          →  Lote de 20 petições na mesma tese
Word separado do PJe          →  Add-in com ponte para o Lex

Proposta de valor:
"O Lex escreve como você, com os dados do processo, no lugar que você trabalha."
```

---

## 8. Roadmap

```
FASE 1 — Base (atual)
  Leitura de arquivos: .docx, .pdf, .txt
  Seleção de arquivo via dialog nativo
  Salvar documento via dialog nativo
  Escrita direta em arquivo existente

FASE 2 — Contexto inteligente
  Auto-contexto do PJe no editor
  Aprendizado de estilo (leitura do acervo)
  Refinamento multi-turno por documento
  Geração de DOCX formatado

FASE 3 — Word Add-in
  Normaex Legal: prompts jurídicos
  Servidor local localhost:3333
  Bridge Lex ↔ Word (contexto do processo)
  Inserção direta no cursor do Word

FASE 4 — Escala e inteligência
  Indexação semântica do acervo
  Biblioteca de cláusulas automática
  Geração em lote por tese
  Checklist jurídico de revisão
```
