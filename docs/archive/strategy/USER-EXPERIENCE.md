# Lex - Experiência do Usuário

> Como o Lex transforma a rotina do advogado.

---

## 1. Quem é o Usuário

```
┌─────────────────────────────────────────────────────────────┐
│                    ADVOGADO(A) BRASILEIRO(A)                │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  • Trabalha com processos no PJe (Processo Judicial        │
│    Eletrônico)                                              │
│  • Gerencia dezenas a centenas de processos                │
│  • Precisa cumprir prazos rigorosos                        │
│  • Redige petições, contestações, recursos                 │
│  • Analisa documentos e decisões judiciais                 │
│  • Pesquisa jurisprudência para fundamentar teses          │
│                                                             │
│  DOR PRINCIPAL: Tempo gasto em tarefas repetitivas         │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. Rotina Atual (SEM Lex)

### Um dia típico do advogado:

```
08:00  ☐ Abre o PJe, faz login com certificado digital
       ☐ Verifica processos com movimentações novas
       ☐ Anota em planilha/agenda os prazos

09:00  ☐ Abre processo do cliente João
       ☐ Lê a petição inicial (15 páginas)
       ☐ Lê documentos anexos (30 páginas)
       ☐ Faz anotações em papel/Word

10:30  ☐ Começa a redigir contestação
       ☐ Abre template em branco no Word
       ☐ Copia dados do processo manualmente
       ☐ Pesquisa jurisprudência no Google/JusBrasil
       ☐ Redige fundamentação

12:00  ☐ Almoço (atrasado)

13:00  ☐ Continua contestação
       ☐ Revisa, formata, ajusta

15:00  ☐ Volta ao PJe para protocolar
       ☐ Navega até o processo
       ☐ Clica em "Nova Petição"
       ☐ Faz upload do arquivo
       ☐ Confere dados, confirma

15:30  ☐ Repete para próximo processo...

19:00  ☐ Ainda no escritório
       ☐ Estressado com prazos acumulados
```

### Problemas:

| Problema | Impacto |
|----------|---------|
| Login repetitivo | Perde tempo toda vez que sessão expira |
| Leitura manual | Horas lendo documentos longos |
| Cópia de dados | Erro ao copiar número do processo, nomes |
| Pesquisa dispersa | Abas infinitas, perde o foco |
| Redação do zero | Cada petição começa em branco |
| Navegação PJe | Sistema lento, muitos cliques |
| Controle de prazos | Medo de perder prazo, ansiedade |

---

## 3. Rotina COM Lex

### O mesmo dia, transformado:

```
08:00  ☐ Abre o Lex
       ☐ Lex mostra: "3 processos com movimentação hoje"
       ☐ Lex mostra: "2 prazos vencendo esta semana"

08:10  ☐ Clica no processo do cliente João
       ☐ Lex já mostra resumo: partes, pedidos, status
       ☐ "Lex, resuma a petição inicial"
       ☐ Lex: "O autor pede indenização de R$20mil por..."

08:20  ☐ "Lex, quais os pontos fracos do pedido?"
       ☐ Lex analisa e lista vulnerabilidades

08:30  ☐ "Lex, crie uma contestação focando em X e Y"
       ☐ Word abre com documento já estruturado
       ☐ Advogado revisa e ajusta (30 min vs 3 horas)

09:00  ☐ "Lex, protocola essa contestação"
       ☐ Lex: "Protocolado! Comprovante salvo."

09:05  ☐ Próximo processo...

12:00  ☐ Almoço no horário
       ☐ 4 processos resolvidos (vs 1 antes)

17:00  ☐ Dia produtivo encerrado
       ☐ Prazos em dia, sem estresse
```

---

## 4. Fluxos Principais

### 4.1 Monitoramento de Processos

```
┌─────────────────────────────────────────────────────────────┐
│                     TELA INICIAL DO LEX                     │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Bom dia, Dr. Carlos!                                       │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  🔔 ATENÇÃO HOJE                                     │   │
│  │                                                      │   │
│  │  • 3 processos com movimentação nova                │   │
│  │  • 1 prazo vence amanhã (Processo 123-45)          │   │
│  │  • 2 intimações pendentes de leitura                │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  📁 PROCESSOS RECENTES                               │   │
│  │                                                      │   │
│  │  João Silva vs Empresa XYZ     [Contestação pendente]│   │
│  │  Maria Santos vs Banco ABC     [Aguardando sentença] │   │
│  │  Pedro Lima vs Seguradora      [Recurso em prazo]   │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  💬 Como posso ajudar?                               │   │
│  │                                                      │   │
│  │  [____________________________________] [Enviar]    │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 4.2 Análise de Processo

```
ADVOGADO: "Analise o processo 0001234-56"

LEX: Abrindo processo...

┌─────────────────────────────────────────────────────────────┐
│  PROCESSO 0001234-56.2026.8.14.0001                         │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  📋 RESUMO                                                  │
│  ─────────                                                  │
│  Classe: Procedimento Comum Cível                          │
│  Assunto: Indenização por Dano Moral                       │
│  Valor: R$ 20.000,00                                       │
│  Status: Aguardando contestação (prazo: 5 dias)            │
│                                                             │
│  👥 PARTES                                                  │
│  ─────────                                                  │
│  Autor: João da Silva (CPF: ***.456.789-**)                │
│  Réu: Empresa XYZ Ltda (seu cliente)                       │
│                                                             │
│  📄 PETIÇÃO INICIAL (Resumo IA)                            │
│  ─────────────────────────────                              │
│  O autor alega que foi cobrado indevidamente no valor      │
│  de R$ 5.000,00 e teve seu nome negativado. Pede:          │
│  • Declaração de inexistência do débito                    │
│  • Indenização por danos morais: R$ 20.000,00              │
│  • Exclusão do nome dos cadastros restritivos              │
│                                                             │
│  ⚠️ PONTOS DE ATENÇÃO                                      │
│  ────────────────────                                       │
│  • Autor não juntou comprovante da negativação             │
│  • Contrato anexado mostra cláusula de multa               │
│  • Prazo para contestar: 15/02/2026                        │
│                                                             │
│  [Ver documentos] [Criar contestação] [Ver movimentações]  │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 4.3 Criação de Documento

```
ADVOGADO: "Crie uma contestação alegando que a cobrança era devida"

LEX: Entendido! Vou criar a contestação com os seguintes argumentos:
     • Cobrança regular conforme contrato
     • Notificação prévia foi enviada
     • Ausência de prova do dano moral

     Abrindo Word para gerar o documento...

[Word abre com Add-in Lex]

┌─────────────────────────────────────────────────────────────┐
│  WORD + LEX ADD-IN                                          │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌──────────────────────────────────────────────────────┐  │
│  │                                                       │  │
│  │  EXCELENTÍSSIMO SENHOR DOUTOR JUIZ DE DIREITO DA     │  │
│  │  1ª VARA CÍVEL DA COMARCA DE BELÉM/PA                │  │
│  │                                                       │  │
│  │  Processo nº 0001234-56.2026.8.14.0001               │  │
│  │                                                       │  │
│  │  EMPRESA XYZ LTDA, pessoa jurídica de direito        │  │
│  │  privado, inscrita no CNPJ sob nº 12.345.678/0001-90,│  │
│  │  vem, respeitosamente, por seu advogado que esta     │  │
│  │  subscreve, apresentar CONTESTAÇÃO...                │  │
│  │                                                       │  │
│  │  I - SÍNTESE DA DEMANDA                              │  │
│  │  ...                                                  │  │
│  │                                                       │  │
│  │  II - PRELIMINARES                                   │  │
│  │  ...                                                  │  │
│  │                                                       │  │
│  │  III - DO MÉRITO                                     │  │
│  │  ...                                                  │  │
│  │                                                       │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                             │
│  [Painel Lex]                                              │
│  ┌────────────────┐                                        │
│  │ ✅ Documento    │                                        │
│  │    gerado       │                                        │
│  │                 │                                        │
│  │ [Salvar]       │                                        │
│  │ [Protocolar]   │                                        │
│  │ [Editar mais]  │                                        │
│  └────────────────┘                                        │
│                                                             │
└─────────────────────────────────────────────────────────────┘

ADVOGADO: [Revisa, faz pequenos ajustes, clica "Protocolar"]

LEX: Documento salvo! Protocolando no PJe...
     ✅ Protocolo realizado com sucesso!
     Número: 12345678
     Comprovante salvo em: Documentos/Lex/comprovantes/
```

### 4.4 Pesquisa Rápida

```
ADVOGADO: "Encontre jurisprudência sobre dano moral por negativação indevida"

LEX: Pesquisando nos tribunais...

┌─────────────────────────────────────────────────────────────┐
│  JURISPRUDÊNCIA ENCONTRADA                                  │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  1. STJ - REsp 1.234.567/SP                                │
│     "A simples negativação indevida gera dano moral        │
│      in re ipsa, dispensando prova do prejuízo."           │
│     Valor médio: R$ 10.000 a R$ 15.000                     │
│     [Copiar ementa] [Ver inteiro teor]                     │
│                                                             │
│  2. TJPA - Apelação 0009876-54.2025                        │
│     "Ausência de notificação prévia configura ato          │
│      ilícito passível de indenização."                     │
│     Valor arbitrado: R$ 8.000                              │
│     [Copiar ementa] [Ver inteiro teor]                     │
│                                                             │
│  3. TJPA - Apelação 0005432-10.2024                        │
│     "Comprovada a regularidade da cobrança, afasta-se      │
│      a pretensão indenizatória."                           │
│     Resultado: Improcedente                                │
│     [Copiar ementa] [Ver inteiro teor]                     │
│                                                             │
│  💡 SUGESTÃO: O item 3 pode ser útil para sua defesa!     │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 5. Impacto na Rotina

### 5.1 Tempo Economizado

| Tarefa | Sem Lex | Com Lex | Economia |
|--------|---------|---------|----------|
| Verificar movimentações | 30 min/dia | 2 min | **93%** |
| Ler e analisar processo | 2 horas | 15 min | **87%** |
| Redigir contestação | 3-4 horas | 30-60 min | **80%** |
| Pesquisar jurisprudência | 1 hora | 5 min | **92%** |
| Protocolar petição | 15 min | 1 min | **93%** |
| **TOTAL por processo** | **~7 horas** | **~1 hora** | **85%** |

### 5.2 Qualidade do Trabalho

```
ANTES (sem Lex):
─────────────────
• Petições genéricas, pouco personalizadas
• Jurisprudência desatualizada ou mal selecionada
• Erros de digitação em dados do processo
• Formatação inconsistente
• Prazos perdidos por esquecimento

DEPOIS (com Lex):
─────────────────
• Petições específicas para cada caso
• Jurisprudência relevante e atualizada
• Dados extraídos automaticamente (sem erros)
• Formatação padronizada profissional
• Alertas automáticos de prazos
```

### 5.3 Capacidade de Atendimento

```
ANTES:
──────
• 1 advogado gerencia ~50 processos ativos
• Capacidade limitada pelo tempo de leitura/redação
• Recusa novos clientes por falta de tempo

DEPOIS:
───────
• 1 advogado pode gerenciar ~150 processos ativos
• Tempo focado em estratégia e relacionamento
• Aceita mais clientes, aumenta receita
```

### 5.4 Qualidade de Vida

```
ANTES:                          DEPOIS:
───────                         ───────
😰 Ansiedade com prazos         😌 Alertas automáticos
😫 Horas extras frequentes      🏠 Horário regular
😤 Trabalho repetitivo          🧠 Trabalho estratégico
😩 Fim de semana no escritório  👨‍👩‍👧 Tempo com família
😵 Burnout                       💪 Satisfação profissional
```

---

## 6. Jornada do Usuário

### Semana 1: Descoberta

```
Dia 1:
• Advogado instala o Lex
• Faz login no PJe pela primeira vez
• Lex salva a sessão

Dia 2:
• Abre Lex, já está logado!
• Experimenta: "Lex, liste meus processos"
• Fica impressionado com o resumo automático

Dia 3-5:
• Usa Lex para consultas rápidas
• Ainda redige petições manualmente
• Começa a confiar na ferramenta
```

### Semana 2: Adoção

```
• Pede primeiro documento para Lex criar
• Surpreso com a qualidade
• Faz ajustes mínimos
• Protocola pelo Lex

"Isso me economizou 2 horas!"
```

### Mês 1: Integração

```
• Lex vira ferramenta principal
• Não abre mais PJe diretamente
• Todos os documentos passam pelo Lex
• Indica para colegas

"Não sei como vivia sem isso"
```

### Mês 3: Transformação

```
• Aceita 30% mais clientes
• Sai do escritório no horário
• Foca em audiências e estratégia
• Lex cuida do operacional

"Meu escritório mudou completamente"
```

---

## 7. Cenários de Uso Real

### Cenário 1: Prazo Urgente

```
SITUAÇÃO:
Advogado descobre às 16h que tem prazo vencendo às 23:59

SEM LEX:
• Pânico
• Lê processo correndo
• Redige petição apressada
• Erros de digitação
• Protocola às 23:45 suando frio

COM LEX:
• 16:00 - "Lex, analisa processo 123 urgente"
• 16:05 - Lex mostra resumo e pontos-chave
• 16:10 - "Cria contestação padrão"
• 16:30 - Revisa documento gerado
• 16:45 - "Protocola"
• 16:46 - ✅ Feito. Vai tomar café.
```

### Cenário 2: Cliente Novo

```
SITUAÇÃO:
Cliente liga: "Fui processado, pode me ajudar?"

SEM LEX:
• Pede número do processo
• Acessa PJe manualmente
• Lê tudo (1-2 horas)
• Liga de volta para cliente
• Marca reunião para semana seguinte

COM LEX:
• Pede número do processo
• "Lex, analisa processo 456"
• Em 2 minutos tem o resumo
• Ainda na ligação: "Entendi. É um caso de X.
  Você tem boa chance porque Y.
  Honorários seriam Z. Aceita?"
• Cliente impressionado, fecha na hora
```

### Cenário 3: Preparação de Audiência

```
SITUAÇÃO:
Audiência amanhã às 9h, advogado precisa revisar caso

SEM LEX:
• Noite anterior lendo 200 páginas
• Anotações em papel
• Chega cansado na audiência
• Esquece pontos importantes

COM LEX:
• "Lex, me prepara para audiência do processo 789"
• Lex gera briefing:
  - Resumo do caso
  - Pontos fortes/fracos
  - Perguntas sugeridas para testemunhas
  - Jurisprudência relevante
• Advogado lê 5 páginas
• Chega preparado e descansado
```

---

## 8. Diferenciais do Lex

### O que o Lex faz que outros não fazem:

```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│  1. ACESSO REAL AO PJE                                      │
│     Não é consulta de API. Opera dentro do sistema real.   │
│     Vê o que o advogado vê. Faz o que o advogado faz.      │
│                                                             │
│  2. CONTEXTO COMPLETO                                       │
│     Lê TODOS os documentos do processo.                    │
│     Entende a história, não só metadados.                  │
│                                                             │
│  3. AÇÃO, NÃO SÓ INFORMAÇÃO                                │
│     Não apenas "aqui estão os dados".                      │
│     Mas "protocolei sua petição, aqui o comprovante".      │
│                                                             │
│  4. INTEGRAÇÃO COM WORD                                     │
│     Documento vai pro Word do advogado.                    │
│     Ele edita no ambiente que conhece.                     │
│     Não precisa aprender ferramenta nova.                  │
│                                                             │
│  5. HUMAN-IN-THE-LOOP                                       │
│     Advogado sempre no controle.                           │
│     Lex sugere, advogado decide.                           │
│     Certificado digital continua seguro.                   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 9. Métricas de Sucesso

### Para o Advogado:

| Métrica | Meta |
|---------|------|
| Tempo por processo | -70% |
| Processos gerenciados | +100% |
| Prazos perdidos | 0 |
| Satisfação | 9+/10 |

### Para o Lex:

| Métrica | Meta |
|---------|------|
| Retenção mensal | >90% |
| NPS | >70 |
| Processos/usuário/mês | >30 |
| Documentos gerados/mês | >50 |

---

## 10. Resumo Visual

```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│                    A TRANSFORMAÇÃO LEX                      │
│                                                             │
│  ┌─────────────────┐         ┌─────────────────┐           │
│  │     ANTES       │         │     DEPOIS      │           │
│  │                 │         │                 │           │
│  │  😰 Estresse    │   ───▶  │  😌 Controle    │           │
│  │  ⏰ Horas extras│         │  🏠 Vida pessoal│           │
│  │  📋 50 processos│         │  📋 150 processos│          │
│  │  ✍️ Tudo manual │         │  🤖 Automatizado│           │
│  │  😱 Prazos      │         │  ✅ Alertas     │           │
│  │                 │         │                 │           │
│  └─────────────────┘         └─────────────────┘           │
│                                                             │
│         "Lex: Seu tempo de volta, sua advocacia            │
│                    no próximo nível"                        │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

*Documento criado em: Janeiro 2026*
*Versão: 1.0*
