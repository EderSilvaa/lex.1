# Lex Engine Integration Plan

Plano operacional para integrar o Lex Electron antigo ao fork Hermes,
transformando este repositorio no Lex Agent Engine local-first.

## Decisao De Arquitetura

```text
Lex Electron (Windows) = corpo do produto
Lex Engine / Hermes (WSL/Linux) = cerebro do agente
MCP Bridge local = sistema nervoso entre os dois
```

O produto final continua sendo um app desktop Lex. O Hermes nao aparece como
marca para o usuario final; ele e o motor interno.

## Modelo Mental

```text
Windows
  Lex Electron
    - chat visual
    - PJe, certificado, browser e arquivos Windows
    - licenca, trial, Supabase e comercial
    - privacidade/LGPD e cofre local
    - Brain TS
    - MCP server local com tools seguras

WSL/Ubuntu
  Lex Engine / Hermes
    - raciocinio e loop de agente
    - memoria e auto-skill creation
    - skills juridicas
    - scheduler/cron
    - gateway Telegram/Discord/etc. opcional
    - cliente MCP para chamar tools do Electron
```

## Principios

1. **Local-first:** Lex deve funcionar no PC do usuario.
2. **Agnostico de modelo:** Anthropic, OpenAI, OpenRouter, Nous, Gemini,
   Ollama/LM Studio/local e endpoints compativeis continuam possiveis.
3. **Hermes e a fonte de BYOK:** configuracao de modelo/chave vem do engine.
   O Electron pode exibir/editar essa configuracao, mas nao sera a fonte
   principal de verdade.
4. **Electron executa Windows:** PJe, certificado, dialogs, file picker e
   automacao de desktop ficam no Electron.
5. **Hermes nao controla Windows diretamente:** ele chama tools MCP.
6. **Auto-skills continuam:** Lex pode aprender workflows juridicos, mas skills
   novas herdam niveis de permissao.
7. **Acoes sensiveis exigem confirmacao:** protocolo, assinatura, envio,
   exclusao, pagamento e alteracao de dados nunca rodam no escuro.
8. **CLI e debug, chat visual e produto:** xterm pode existir como console, mas
   a interface principal sera chat normal no Electron.

## O Que Vem Do Lex Antigo

Importar para uma subpasta isolada primeiro:

```text
electron-app/
```

Nao misturar imports no motor Hermes ate o app antigo rodar isolado.

### Manter

| Superficie antiga | Destino |
| --- | --- |
| `src/renderer/` | UI base do Lex Desktop, adaptada para chat visual |
| `electron/main.ts`, `preload.ts` | casca Electron, IPC e janela |
| `electron/pje/` | executor Windows/PJe via MCP |
| `electron/skills/pje/` | primeiro como wrappers MCP, nao port Python |
| `electron/browser/` | manter apenas se for necessario para PJe/Windows |
| `electron/privacy/` | LGPD, consentimento, vault e audit log |
| `electron/auth/` | licenca, trial, Supabase/comercial |
| `electron/brain/` | manter TS e expor tools via MCP |
| `electron/datajud/` | manter credenciais no Electron; expor consulta segura |
| `electron/batch/` | hibrido: UI fica, estrategia pode virar skill |
| modelos/documentos juridicos | migrar gradualmente para `skills/legal/` |

### Desligar Ou Substituir

| Superficie antiga | Substituto |
| --- | --- |
| agent loop TS | Hermes `run_agent.py` / `agent/` |
| BYOK/provider TS | Hermes `~/.hermes/.env` + config/model commands |
| OS/browser generic skills | Hermes tools nativas |
| scheduler TS | Hermes `cron/` |
| plugins genericos TS | Hermes plugins/skills/MCP |
| router regex/intents | tool selection do Hermes |
| memoria generica TS | Hermes memory, exceto Brain como produto |

## MCP Bridge

MCP e a forma padrao da ponte local. Evitar criar protocolo HTTP proprio no
MVP se o MCP resolver.

```text
Hermes MCP client
  chama
Electron MCP server local
  executa tools Windows/PJe/Brain
```

### Primeiro MCP Server Do Electron

Nome sugerido:

```text
lex-desktop
```

Tools MVP:

| Tool | Nivel | Descricao |
| --- | --- | --- |
| `lex.health` | 0 | status do desktop, versao, usuario, WSL/engine |
| `lex.confirm` | 2/3 | pede confirmacao visual no app |
| `brain.search` | 1 | busca memoria/fluxos do Brain TS |
| `brain.flows` | 1 | lista fluxos recorrentes detectados |
| `pje.status` | 1 | verifica se PJe/browser/sessao estao prontos |
| `pje.consultar_processo` | 1 | consulta read-only |
| `documento.analisar` | 1 | analisa arquivo selecionado/autorizado |
| `arquivo.selecionar` | 1 | abre file picker no Windows |

Tools posteriores:

| Tool | Nivel | Regra |
| --- | --- | --- |
| `pje.baixar_documentos` | 2 | confirmar destino e escopo |
| `documento.gerar_peticao` | 1/2 | gerar rascunho sem protocolar |
| `pje.protocolar_peticao` | 3 | sempre confirmacao desktop |
| `mensagem.enviar_cliente` | 3 | sempre confirmacao e preview |

## Niveis De Permissao

| Nivel | Tipo | Pode auto-criar skill? | Execucao |
| --- | --- | --- | --- |
| 0 | conhecimento/procedimento | sim | sem acesso externo |
| 1 | leitura controlada | sim, com escopo | pede arquivo/processo/autorizacao |
| 2 | acao reversivel | sim, mas revisa | confirmacao simples |
| 3 | acao juridica sensivel | nao auto-libera | confirmacao explicita no desktop |

Auto-skill creation do Hermes fica habilitada, mas as skills da Lex devem
declarar nivel e superficie de permissao.

## Chat Visual

Nao usar xterm como chat principal do produto.

```text
Produto:
  Chat React/Electron normal
  streaming
  anexos
  cards de processo
  botoes de aprovacao
  checklists

Debug:
  xterm opcional para logs, terminal e Hermes CLI
```

O chat visual chama o engine por uma interface controlada. Opcoes de transporte:

1. Subprocesso Hermes com stdout/eventos estruturados.
2. Gateway/API local do Hermes, se a superficie atual for suficiente.
3. Adaptador fino em Python para expor uma API local estavel ao Electron.

Decisao MVP: comecar pelo caminho mais simples que entregue streaming e
cancelamento sem mexer profundo no Hermes.

## Canais Externos

Hermes Gateway pode ser reaproveitado com marca Lex.

```text
Telegram/Discord/etc.
  -> Hermes Gateway
  -> Lex Engine
  -> MCP Bridge quando precisar do desktop
```

Politica:

- Telegram no MVP e viavel.
- WhatsApp oficial fica para fase posterior via Cloud API/relay.
- Acoes nivel 3 iniciadas por canal externo exigem confirmacao no desktop.
- O bot deve ser Lex, nao Hermes, para o usuario final.

## Fases De Integracao

### Fase 0 - Base Atual

Status: concluido.

- Fork Hermes criado.
- Persona Lex configurada.
- Skills `lex-legal-brief` e `pje-bridge` criadas.
- WSL/Ubuntu rodando.
- Anthropic BYOK funcionando.
- `TRIAGE.md` criado.

### Fase 1 - Importar Electron Sem Integrar

Objetivo: trazer o app antigo para este repo sem quebrar o engine.

Tarefas:

1. Criar `electron-app/`.
2. Copiar Lex Electron antigo para `electron-app/`.
3. Preservar package files dele dentro da subpasta.
4. Rodar install/build isolado.
5. Documentar conflitos de dependencias.
6. Nao conectar ao Hermes ainda.

Exit criteria:

- `electron-app` roda como app antigo.
- Nenhum arquivo do Hermes raiz e alterado.
- BYOK antigo ainda existe, mas marcado como legado.

### Fase 2 - Engine Status No Desktop

Objetivo: Electron detectar e mostrar estado do Lex Engine.

Tarefas:

1. Criar modulo `electron-app/electron/lex-engine/`.
2. Detectar WSL/Ubuntu.
3. Detectar `/home/eder/lex_engine` ou instalacao final.
4. Rodar `hermes status` e parsear saida minima.
5. Exibir tela "Lex Engine online/offline".
6. Adicionar botao "Abrir diagnostico".

Exit criteria:

- Desktop mostra provider/modelo/status sem usar provider-config antigo.
- Se WSL/Hermes faltar, UI mostra acao de reparo.

### Fase 3 - Chat Visual Chama Hermes

Objetivo: substituir chat por motor Hermes mantendo UI Electron.

Tarefas:

1. Criar adaptador `LexEngineClient`.
2. Enviar mensagem para Hermes.
3. Receber resposta final.
4. Adicionar streaming se o caminho escolhido suportar.
5. Adicionar cancelamento.
6. Salvar transcript no formato atual ou migrado.

Exit criteria:

- Usuario conversa com Lex pelo Electron.
- Hermes responde com persona Lex.
- CLI continua funcionando para debug.

### Fase 4 - MCP Server Minimo No Electron

Objetivo: Hermes chamar ferramentas Windows seguras.

Tarefas:

1. Implementar MCP server `lex-desktop`.
2. Expor `lex.health`.
3. Expor `lex.confirm`.
4. Expor `brain.search` stub.
5. Expor `pje.status` stub/read-only.
6. Configurar Hermes `mcp_servers` para conectar ao Electron.

Exit criteria:

- Hermes ve tools `mcp_lex_desktop_*`.
- Uma pergunta no chat chama `lex.health` ou `pje.status`.
- Logs/auditoria registram a chamada.

### Fase 5 - Primeiro Fluxo Util

Objetivo: workflow juridico seguro sem PJe sensivel.

Fluxo recomendado:

```text
Analisar caso/documento
-> identificar lacunas
-> montar plano de peticao
-> gerar checklist de provas
```

Tarefas:

1. Conectar file picker do Electron.
2. Permitir leitura apenas de arquivo selecionado.
3. Chamar `documento.analisar`.
4. Alimentar `lex-legal-brief`.
5. Renderizar resultado em cards/checklist.

Exit criteria:

- Fluxo e util para advogado sem certificado/PJe.
- Nada irreversivel e executado.

### Fase 6 - PJe Read-Only

Objetivo: consultar PJe com seguranca pelo Electron.

Tarefas:

1. `pje.status` real.
2. `pje.abrir_processo` read-only.
3. `pje.consultar_processo`.
4. `pje.baixar_documentos` com confirmacao.
5. Normalizar resultado para o Hermes resumir.

Exit criteria:

- Lex consulta processo e resume movimentacoes/documentos.
- Certificado/browser continuam no Windows.

### Fase 7 - Desligar Infra Duplicada

Objetivo: remover ou isolar o agente TS antigo.

Tarefas:

1. Marcar `electron/agent` antigo como legacy.
2. Remover chamadas do renderer para agent TS.
3. Trocar provider-config antigo por status/config do Hermes.
4. Desligar scheduler/skills genericas antigas.
5. Manter Brain/Privacy/Auth/PJe.

Exit criteria:

- Nao ha dois cerebros decidindo.
- Hermes e unica fonte de raciocinio/modelo.

### Fase 8 - Canais

Objetivo: ativar canais Hermes com marca Lex.

Tarefas:

1. Telegram por escritorio.
2. Politica de permissao por canal.
3. Confirmacao desktop para nivel 3.
4. Alertas de prazo/rotina.
5. WhatsApp Cloud API fica para fase posterior.

## Ordem Recomendada Agora

1. Revisar e aprovar este plano.
2. Commitar `TRIAGE.md` + `INTEGRATION-PLAN.md`.
3. Decidir origem exata do Lex Electron antigo.
4. Importar em `electron-app/` sem integrar.
5. Criar tela/status do Lex Engine.
6. Fazer chat visual chamar Hermes.
7. Criar MCP server minimo.

## Anti-Objetivos

- Nao portar Hermes para Windows nativo agora.
- Nao usar xterm como chat principal do produto.
- Nao vender terminal/file access amplo como padrao.
- Nao portar PJe direto para Python no MVP.
- Nao manter BYOK antigo como fonte principal.
- Nao deletar `brain/` sem expor via MCP primeiro.
- Nao abrir gateway publico sem autenticacao/rede segura.

## Decisoes Pendentes

| Decisao | Recomendacao |
| --- | --- |
| Layout do Electron | `electron-app/` isolado inicialmente |
| Transporte chat Electron -> Hermes | testar subprocess/gateway antes de mexer profundo |
| MCP server | implementar no Electron, local-only |
| PJe | Electron executa, Hermes orquestra |
| Brain | TS via MCP |
| BYOK | Hermes oficial; Electron edita/exibe |
| WhatsApp | fase posterior, Cloud API oficial |

## Primeira Meta De Produto

```text
Abrir Lex Desktop
ver Lex Engine online
conversar no chat visual
anexar/selecionar documento
receber plano juridico com lacunas e checklist
```

Essa meta prova a nova arquitetura sem tocar em protocolo PJe sensivel.
