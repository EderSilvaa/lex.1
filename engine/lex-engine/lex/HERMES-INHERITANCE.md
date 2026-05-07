# Heranca Tecnica do Hermes — Inventario Completo

Este documento mapeia tudo que o Lex_Engine herda do Hermes Agent (Nous Research):
ferramentas, plataformas de gateway, adaptadores LLM, ambientes de execucao,
features de plataforma, e comandos CLI. Para cada item, indica a relevancia
para o produto juridico Lex.

Use este documento como referencia ao decidir o que manter, desabilitar ou
extender em cada perfil de cliente (TJPA, advogado autonomo, empresa juridica).

## 1. Ferramentas (Tools) — ~50 tools em ~25 toolsets

### Nucleo essencial (todas as plataformas tem)

| Toolset | Tools | Arquivo |
| --- | --- | --- |
| `file` | `read_file`, `write_file`, `patch`, `search_files` | `tools/file_tools.py` |
| `web` / `search` | `web_search` (Exa, Firecrawl, Tavily, Parallel), `web_extract` | `tools/web_tools.py` |
| `terminal` | `terminal`, `process` | `tools/terminal_tool.py`, `tools/process_registry.py` |
| `code_execution` | `execute_code` (Python com RPC para tool calling) | `tools/code_execution_tool.py` |
| `skills` | `skills_list`, `skill_view`, `skill_manage` | `tools/skills_tool.py`, `tools/skill_manager_tool.py` |
| `memory` | `memory` (MEMORY.md, USER.md) | `tools/memory_tool.py` |
| `session_search` | `session_search` (FTS5 + LLM summarization) | `tools/session_search_tool.py` |
| `todo` | `todo` | `tools/todo_tool.py` |
| `clarify` | `clarify` (perguntas multi-choice ou abertas) | `tools/clarify_tool.py` |
| `cronjob` | `cronjob` (CRUD de jobs) | `tools/cronjob_tools.py` |
| `delegation` | `delegate_task` (subagente isolado) | `tools/delegate_tool.py` |
| `messaging` | `send_message` (envia para 17+ plataformas externas) | `tools/send_message_tool.py` |

### Tools opcionais por dominio

| Toolset | Tools | Uso |
| --- | --- | --- |
| `browser` | 12 tools (`browser_navigate`, `browser_click`, `browser_type`, `browser_scroll`, `browser_snapshot`, `browser_vision`, `browser_console`, `browser_cdp`, `browser_dialog`, `browser_back`, `browser_press`, `browser_get_images`) | Automacao de site (PJe, jurisprudencia, Diario Oficial). |
| `vision` | `vision_analyze` | OCR/analise de imagem em peticoes escaneadas, evidencias fotograficas. |
| `image_gen` | `image_generate` (Pollinations, Replicate, OpenRouter) | Gerar diagrama, organograma. Baixa prioridade juridica. |
| `tts` | `text_to_speech` (Edge free, ElevenLabs, OpenAI, xAI) | Leitura em audio de peca, acessibilidade. |
| `moa` | `mixture_of_agents` (multi-LLM via OpenRouter) | Roteiar consulta dificil para multiplos modelos. |
| `homeassistant` | `ha_list_entities`, `ha_get_state`, `ha_list_services`, `ha_call_service` | Smart home — fora de escopo Lex. |

### Tools por canal de mensageria

| Toolset | Tools | Uso |
| --- | --- | --- |
| `discord` | `discord`, `discord_admin` | Canal Discord — fora de escopo Lex. |
| `feishu_doc` | `feishu_doc_read` | Leitura de docs Feishu/Lark — uso institucional chines. |
| `feishu_drive` | `feishu_drive_list_comments`, `feishu_drive_list_comment_replies`, `feishu_drive_reply_comment`, `feishu_drive_add_comment` | Idem. |
| `yuanbao` | `yb_query_group_info`, `yb_query_group_members`, `yb_send_dm`, `yb_search_sticker`, `yb_send_sticker` | Mensageria Yuanbao (Tencent) — fora de escopo Lex. |
| `spotify` | `spotify_playback`, `spotify_devices`, `spotify_queue`, `spotify_search`, `spotify_playlists`, `spotify_albums`, `spotify_library` | Plugin Spotify — fora de escopo Lex. |

### Tools de pesquisa de modelo (RL)

| Toolset | Tools | Uso |
| --- | --- | --- |
| `rl` | 10 tools (`rl_list_environments`, `rl_select_environment`, `rl_get_current_config`, `rl_edit_config`, `rl_start_training`, `rl_check_status`, `rl_stop_training`, `rl_get_results`, `rl_list_runs`, `rl_test_inference`) | Reinforcement Learning training — totalmente fora de escopo Lex. |

### Tool de extensao via MCP

| Toolset | Tools | Uso |
| --- | --- | --- |
| `mcp_call_tool` (dinamico) | Proxy para qualquer ferramenta exposta por servidor MCP externo | Plugar PJe-MCP, integracao com sistemas TJ, ferramentas externas sem reescrita. **Alta relevancia para Lex.** |

## 2. Toolsets de Plataforma

Cada plataforma de entrega tem seu proprio toolset que combina nucleo + tools especificas.

| Plataforma | Toolset | Notas |
| --- | --- | --- |
| CLI | `hermes-cli` | Tudo do core. |
| Cron | `hermes-cron` | Mesmo da CLI, mas gated por config. |
| ACP (editor) | `hermes-acp` | Sem audio, messaging, clarify UI. |
| API Server | `hermes-api-server` | OpenAI-compatible, sem clarify e send_message. |
| Telegram | `hermes-telegram` | Core completo. |
| Discord | `hermes-discord` | Core + discord, discord_admin. |
| WhatsApp | `hermes-whatsapp` | Core completo. |
| Slack | `hermes-slack` | Core completo. |
| Signal | `hermes-signal` | Core completo. |
| BlueBubbles (iMessage) | `hermes-bluebubbles` | Core completo. |
| Email | `hermes-email` | Core completo (IMAP/SMTP). |
| Mattermost | `hermes-mattermost` | Core completo. |
| Matrix | `hermes-matrix` | Core completo (decentralizado). |
| Home Assistant | `hermes-homeassistant` | Core + ha_* tools. |
| DingTalk | `hermes-dingtalk` | Core completo. |
| Feishu | `hermes-feishu` | Core + feishu_*. |
| Weixin | `hermes-weixin` | Core completo. |
| QQ Bot | `hermes-qqbot` | Core completo. |
| WeCom | `hermes-wecom` | Core completo. |
| WeCom Callback | `hermes-wecom-callback` | Self-built apps. |
| Yuanbao | `hermes-yuanbao` | Core + yb_*. |
| SMS (Twilio) | `hermes-sms` | Core completo. |
| Webhook | `hermes-webhook` | Core completo. |
| Gateway (geral) | `hermes-gateway` | Uniao de todas plataformas de messaging. |

Toolsets compostos (combinacoes de cenario): `debugging` (terminal + process + web + file), `safe` (web + vision + image_gen, sem terminal/code_execution).

## 3. Plataformas de Gateway — 16+ canais de entrega

Cada plataforma e um adaptador em `gateway/platforms/` que serve como "boca de saida" do agente.

| Categoria | Plataformas |
| --- | --- |
| Mensageria ocidental | Telegram, Discord, Slack, WhatsApp, Signal, Matrix, Mattermost, BlueBubbles (iMessage), Email, SMS (Twilio), Webhook |
| Mensageria asiatica | Feishu/Lark, DingTalk, WeCom, Weixin, QQ Bot, Yuanbao |
| Outros canais | Home Assistant, API Server (OpenAI-compatible), ACP (editores) |

**Relevancia Lex:**

- **Email, WhatsApp, Telegram** — perfis advogado/empresa.
- **API Server** — qualquer integracao de TI institucional (TJPA pode chamar a Lex como servico HTTP).
- **Webhook** — eventos de PJe, intimacao, prazo.
- **ACP** — relevante so se houver integracao com editor (vide secao 7).
- Demais canais (Discord, Slack, Yuanbao, etc.) — off por padrao.

## 4. Adaptadores LLM — 5 providers nativos

| Adaptador | Arquivo | Uso |
| --- | --- | --- |
| Anthropic (Claude) | `agent/anthropic_adapter.py` | Direct Messages API, OAuth, tool_use, extended thinking, prompt caching. |
| AWS Bedrock | `agent/bedrock_adapter.py` | Converse API + Bedrock Guardrails, dynamic model discovery. **Relevante para sobrania de dados (regiao br).** |
| Google Gemini Native | `agent/gemini_native_adapter.py` | API direta da Google. |
| Google Cloud Code | `agent/gemini_cloudcode_adapter.py` | Backend do Google Cloud Code Assist. |
| Codex Responses | `agent/codex_responses_adapter.py` | Backend do Codex. |

**Relevancia Lex:** suporte multi-LLM e diferencial competitivo. Cliente que exige
soberania (LGPD, dados em regiao Brasil) pode escolher Bedrock; cliente que prefere
Claude/Gemini tem opcao. **Manter todos** ativos — custo operacional zero ate
serem usados.

## 5. Ambientes de Execucao — 6 backends

`tools/environments/`:

| Backend | Arquivo | Uso |
| --- | --- | --- |
| `local` | `local.py` | Host machine (default, mais rapido). |
| `docker` | `docker.py` | Container-based, isolamento maior. |
| `ssh` | `ssh.py` | Remote via SSH. |
| `modal` | `modal.py` | Modal cloud serverless. |
| `singularity` | `singularity.py` | HPC container. |
| `daytona` | `daytona.py` | Daytona dev environment. |
| (helper) | `file_sync.py` | Sync de arquivos para ambientes remotos. |

`terminal` e `execute_code` rodam em qualquer um deles transparentemente.

**Relevancia Lex:** **`docker`** e o que importa. Rodar OCR, processamento de PDF
e qualquer execucao de codigo em container isolado evita risco de comando shell
errado afetar host. Default deveria ser `docker` no perfil Lex.

## 6. Subsistemas / Features de Plataforma

### Memoria persistente

- `tools/memory_tool.py` — built-in memory (MEMORY.md, USER.md).
- `agent/memory_manager.py` — orquestra built-in + um plugin externo opcional.
- `agent/memory_provider.py` — ABC para integracao de plugins.
- `plugins/memory/` — Honcho AI integration + extensibilidade.

### Sessoes e historico

- `agent/trajectory.py` — session state e conversation history.
- `tools/session_search_tool.py` — busca FTS5 + sumarizacao por LLM.

### Compactacao e cache

- `agent/context_compressor.py` — compressao de contexto mid-turn.
- `agent/prompt_caching.py` — Anthropic prompt cache management.

### Cron / Scheduler

- `cron/scheduler.py` — file-based job scheduler com tick-based execution.
- `cron/jobs.py` — CRUD de jobs, parse cron expressions.

### Skills system (vide `lex/SKILLS-CATALOG-TJPA.md` e `lex/SKILLS-AUTOCREATE.md`)

- `tools/skills_tool.py` — listar e ver skills.
- `tools/skill_manager_tool.py` — CRUD de skills (auto-criacao pelo agente).
- `agent/skill_utils.py` — parsing, platform checks, env validation.
- `agent/skill_commands.py` — CLI commands para skills.

### Plugins

- `hermes_cli/plugins.py` (modulos `plugins_cmd.py`).
- Plugins atuais: `memory/` (Honcho), `spotify/`, `google_meet/`, `image_gen/`, `context_engine/`, `disk-cleanup/`.

### MCP (Model Context Protocol)

- `tools/mcp_tool.py` — dynamic tool discovery + registration de servidores MCP externos.
- `tools/mcp_oauth_manager.py`, `tools/mcp_oauth.py` — OAuth client para servidores MCP que exigem auth.
- `mcp_serve.py` — Lex_Engine como servidor MCP (expor tools para outros agentes).

### Insights / Analytics

- `agent/insights.py` — analytics de sessoes (tokens, custo, padroes de uso).
- `agent/usage_pricing.py` — cost estimation por provider/model.
- `agent/rate_limit_tracker.py` — token/request rate limiting.

### Safety & Security

- `agent/file_safety.py` — path validation, blocklist, sandboxing.
- `agent/shell_hooks.py` — pre/post-execution hooks para terminal.
- `agent/redact.py` — secret redaction em logs.
- `agent/credential_pool.py` — multi-source credential management.
- `tools/credential_files.py` — safe `.env` reading.
- `tools/skills_guard.py` — security scanner de skills criadas.

### Multimedia / Auxiliary

- `agent/auxiliary_client.py` — router para vision/compression LLM calls.
- `agent/image_gen_registry.py` — multi-provider image gen dispatch.

## 7. ACP Adapter — Integracao com Editores

`acp_adapter/` implementa o **Agent Client Protocol (ACP)**, criado pela equipe
do editor **Zed**. E o equivalente de "LSP para agentes": um protocolo
JSON-RPC sobre stdin/stdout que permite editores plugarem agentes de IA de
forma padronizada.

| Arquivo | Responsabilidade |
| --- | --- |
| `acp_adapter/server.py` | Servidor ACP — expoe Lex_Engine como agente compatível. |
| `acp_adapter/entry.py` | Entry point CLI (`hermes acp` ou `python -m acp_adapter.entry`). |
| `acp_adapter/auth.py` | Authentication flow ACP. |
| `acp_adapter/permissions.py` | Bridge de aprovacao (modal no editor para tool calls perigosas). |
| `acp_adapter/session.py` | Gerenciamento de sessoes (load, fork, resume). |
| `acp_adapter/tools.py` | Mapeamento de tools para ACP tool descriptors. |
| `acp_adapter/events.py` | Stream de eventos para o editor. |

**Capacidades expostas:** prompt, autenticacao, multi-sessoes, fork de sessao,
resume, troca de modelo em runtime, MCP servers configuraveis por sessao,
content blocks (texto, imagem, audio, embed de recurso).

**Quem fala ACP hoje:** Zed (criador do protocolo). Outros editores via bridge
(`acp-bridge`) ou plugins experimentais.

**Relevancia Lex:**

- **Para o produto juridico atual:** **baixa**. Advogado nao usa Zed.
- **Futuro 1:** plugin "Lex como copiloto" em editor de petica (LaTeX/Typst) —
  o adapter ja esta pronto.
- **Futuro 2:** federacao com outros agentes ACP-compativeis.
- **Risco de manter ativo:** baixo. So inicializa quando alguem roda `hermes acp`
  explicitamente. Nao vaza tools nem comportamento pra usuario final por acidente.

**Recomendacao:** manter no repositorio (upstream Hermes), nao documentar
como feature Lex na v1.

## 8. Comandos CLI — `hermes <subcomando>`

### Conversa e sessoes

| Comando | Uso |
| --- | --- |
| `hermes` / `hermes chat` | Interactive CLI chat. |
| `hermes sessions browse` | Curses-based session picker com search. |
| `hermes acp` | Run as ACP server (editor integration). |

### Gateway e servico

| Comando | Uso |
| --- | --- |
| `hermes gateway` | Run gateway em foreground. |
| `hermes gateway start` / `stop` / `status` | Manage gateway service. |
| `hermes gateway install` / `uninstall` | Install/uninstall systemd service. |

### Configuracao e setup

| Comando | Uso |
| --- | --- |
| `hermes setup` | Interactive setup wizard. |
| `hermes doctor` | Check dependencies + config health. |
| `hermes config` | Edit config.yaml. |
| `hermes status` | Show component status. |
| `hermes logout` | Clear stored auth. |

### Cron

| Comando | Uso |
| --- | --- |
| `hermes cron` | Manage cron jobs. |
| `hermes cron list` | List scheduled jobs. |
| `hermes cron status` | Check scheduler status. |

### Memoria / Honcho (legacy)

| Comando | Uso |
| --- | --- |
| `hermes honcho setup` | Configure Honcho integration. |
| `hermes honcho status` | Show config status. |
| `hermes honcho sessions` | List session mappings. |
| `hermes honcho map <name>` | Map current dir. |
| `hermes honcho peer` | Set peer names (user, AI, reasoning). |
| `hermes honcho mode [hybrid|honcho|local]` | Switch memory mode. |
| `hermes honcho tokens` | Token budget settings. |
| `hermes honcho identity` | AI identity seed file. |
| `hermes honcho migrate` | Migration guide. |

### Modelo / provider

| Comando | Uso |
| --- | --- |
| `hermes model` | Interactive model picker. |
| `hermes model set <name>` | Switch model. |
| `hermes version` | Show version + release date. |
| `hermes update` | Update to latest. |
| `hermes uninstall` | Uninstall Lex_Engine. |

### Skills e tools

| Comando | Uso |
| --- | --- |
| `hermes skills` | Interactive TUI para enable/disable skills. |
| `hermes tools` | Interactive TUI para select/configure toolsets. |

### Plugins e logs

| Comando | Uso |
| --- | --- |
| `hermes plugins` / `hermes plugins install` | Plugin management. |
| `hermes logs` | Show agent/error logs. |

## 9. Leitura Estrategica para a Lex

Dividindo as ~50 tools em quatro grupos pelo papel no produto Lex:

### Grupo A — Nucleo essencial

| Tools/features | Justificativa |
| --- | --- |
| `file`, `web`, `terminal` (com `docker` como default), `execute_code`, `skills`, `memory`, `session_search`, `todo`, `clarify`, `cronjob`, `delegate_task`, `mcp_call_tool` | Sao a base do agente. Manter ativo em todos os perfis. |

### Grupo B — Util em perfis amplos

| Tools/features | Quando ativar |
| --- | --- |
| `browser` (12 tools) | Automacao PJe, jurisprudencia, Diario Oficial. Perfil empresa principalmente. |
| `vision_analyze` | OCR avancado, peticoes escaneadas. Todos os perfis. |
| `text_to_speech` | Acessibilidade, leitura de peca em audio. Opcional. |
| `mixture_of_agents` | Consulta dificil que justifica custo de multi-LLM. Empresa. |
| Email, WhatsApp, Telegram (gateway) | Atendimento via canal preferido. Autonomo/empresa. |
| API Server | Integracao TI institucional. TJPA e empresa. |

### Grupo C — Especifico de canal/integracao (off por padrao)

| Tools/features | Ligar quando |
| --- | --- |
| Discord, Slack, BlueBubbles, Mattermost, Matrix | Cliente especifico que ja usa. |
| Feishu, Yuanbao, WeCom, Weixin, QQ Bot, DingTalk | Cliente chines (irrelevante mercado br). |
| Home Assistant | Smart home pessoal. |
| Spotify (plugin) | Pessoal. |
| ACP adapter | Plugin futuro de editor para escritorios tech. |

### Grupo D — Fora de escopo Lex

| Tools/features | Acao |
| --- | --- |
| RL training (10 tools) | Totalmente fora — Lex nao e plataforma de pesquisa em ML. Pode tirar do build. |
| Yuanbao, Weixin, QQ Bot | Mercado chines. Tirar do build. |
| Spotify, Google Meet (plugins) | Pessoal. Nao instalar. |
| Image generation | Baixa relevancia juridica. Off por padrao. |

## 10. Pontos Fortes Herdados Sem Esforco

1. **Multi-LLM nativo** — Lex pode rodar em Claude, Gemini, Bedrock, Codex sem reescrita.
2. **Multi-canal** — qualquer canal de atendimento ja tem adaptador.
3. **Sandboxes de execucao** — terminal/codigo em container Docker isola comandos.
4. **MCP cliente** — qualquer servidor MCP externo (PJe-MCP, integracao TJ) pluga sem codigo novo.
5. **Skills auto-criadas** — feature de aprendizado continuo (vide `lex/SKILLS-AUTOCREATE.md`).
6. **Agendamento cron** — prazos processuais, monitoramento de Diario Oficial.
7. **Sessoes persistentes + busca** — historico processual interrogavel.
8. **OAuth/credenciais multi-fonte** — integracao com Bedrock IAM, GCP, Azure.
9. **Insights/custo** — fundamental para precificar uso institucional.
10. **Prompt caching Anthropic** — reduz custo significativamente em uso recorrente.

## 11. Pontos a Resolver para o Produto Juridico

1. **Curadoria pesada** — 50+ tools no system prompt e caro em tokens. Perfil Lex
   provavelmente roda com ~15. Filtrar agressivamente via toolsets nomeados.
2. **`execute_code` e `terminal`** dao poder demais para usuario juridico nao-tecnico.
   Off por padrao no perfil "usuario final"; ativar so em "admin/dev".
3. **`send_message` para 17 plataformas** vira risco de exfiltracao em produto
   juridico. Restringir destinos por allowlist por tenant.
4. **`delegate_task` e `mixture_of_agents`** consomem creditos sem visibilidade.
   Implementar orcamento por sessao.
5. **Skills compartilhadas entre tenants** — vide `lex/SKILLS-AUTOCREATE.md` secao 4
   (isolamento por tenant).
6. **Honcho/memoria externa** — pode vazar dados se mal configurada. Manter local
   por padrao no perfil TJPA; opcional em outros.

## 12. Resumo Executivo

O Lex_Engine herda do Hermes uma arquitetura de agente **altamente modular e
madura**: 50+ ferramentas, 16+ canais de mensageria, 5 adaptadores LLM, 6 backends
de execucao, sistema de skills auto-evolutivo, scheduler cron, MCP cliente,
memoria persistente, e CLI completo com ~30 subcomandos.

**Para o produto Lex juridico**, o trabalho nao e construir features novas —
e curar agressivamente o que ja existe e adicionar camadas de governanca
(multi-tenant, aprovacao humana, auditoria) onde o Hermes assume um unico
usuario tecnico.

A heranca tecnica e o maior atalho do projeto: a base que tomaria 12-18 meses
construir do zero ja esta pronta. O custo dela e disciplina constante de
curadoria, para que a Lex apresente apenas o que faz sentido juridicamente
e nao o ferramental completo de pesquisa em IA do Hermes.
