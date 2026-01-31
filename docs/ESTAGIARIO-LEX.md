# Estagiário Lex - Especificação

> Agente que atua como estagiário jurídico: busca informações, prepara documentos, e executa ações com supervisão do advogado.

---

## 3 Níveis de Interação

| Nível | Exemplo |
|-------|---------|
| **Conversa Natural** | "Lex, prepara uma contestação pro processo que tô olhando" |
| **Comandos Diretos** | "Protocolar petição.pdf no processo 0801234-56" |
| **Tarefas Agendadas** | "Amanhã às 9h, verifica todos os meus processos" |

---

## Níveis de Autonomia

| Tarefa | Autonomia | HITL |
|--------|-----------|------|
| Ler/resumir documento | ✅ Automático | - |
| Pesquisar jurisprudência | ✅ Automático | - |
| Escrever petição | ⚠️ Gera draft | Revisão |
| Protocolar | ❌ Executa | Confirmação |

---

## Skills Necessárias

### PJe (Automação via Playwright CDP)
- `pje_extrair` - Extrai dados da página atual
- `pje_movimentacoes` - Lista movimentações
- `pje_protocolar` - Protocola petição (com HITL)

### Documentos
- `doc_gerar` - Gera petição em Word
- `doc_resumir` - Resume documento PDF

### Scheduler (Nível 3)
- Jobs persistentes
- Triggers por hora ou evento
- Notificações Windows/Push

---

## Fluxo Exemplo

```
Advogado: "Lex, prepara uma manifestação pro processo que tô vendo"

1. Lex detecta página do PJe via CDP
2. Extrai: número, partes, última movimentação
3. Gera documento Word com estrutura
4. Abre Word para revisão
5. Advogado revisa, ajusta
6. "Lex, protocola"
7. [HITL] "Confirma protocolar?"
8. Protocola no PJe
9. "Protocolado! Número: 123456"
```

---

*Versão: 1.0 - Janeiro 2026*
