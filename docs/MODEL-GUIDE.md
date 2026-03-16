# Guia de Modelos — LEX

Última atualização: Março 2026

## Uso Gratuito (OpenRouter)

A LEX pode ser usada **100% grátis** com modelos open-source via OpenRouter.
Basta criar uma chave gratuita em [openrouter.ai/keys](https://openrouter.ai/keys) e selecionar o provider **OpenRouter** nas configurações.

### Modelos Gratuitos Disponíveis

#### Vision (browser, screenshots, análise de imagem)

| Modelo | Parâmetros | Destaque |
|---|---|---|
| **Qwen2.5-VL 32B** | 32B | Melhor vision grátis — recomendado para browser |
| **Llama 4 Maverick** | 400B MoE | Vision potente, bom em tarefas complexas |
| **Gemma 3 27B** | 27B | Leve e rápido, boa qualidade de vision |
| **Mistral Small 3.1** | 24B | Rápido, multilingual, vision integrada |
| **Phi-4 Multimodal** | 14B | Compacto, vision da Microsoft |

#### Texto (agente, raciocínio, análise jurídica)

| Modelo | Parâmetros | Destaque |
|---|---|---|
| **Qwen3 235B** | 235B MoE | **Recomendado** — melhor modelo grátis para texto |
| **Qwen3 30B** | 30B MoE | Mais rápido que o 235B, boa qualidade |
| **DeepSeek V3** | 685B MoE | Excelente para coding e tarefas estruturadas |
| **DeepSeek R1** | 685B MoE | Especializado em raciocínio passo-a-passo |
| **Llama 3.3 70B** | 70B | Sólido para texto geral |

### Configuração Recomendada (Grátis)

- **Modelo do Agente:** Qwen3 235B (melhor) ou Qwen3 30B (mais rápido)
- **Modelo de Vision:** Qwen2.5-VL 32B
- **Custo:** R$ 0,00

---

## Uso Pago

Para máxima qualidade, a LEX suporta os melhores modelos pagos de cada provider.
Você usa sua própria chave (BYOK) — a LEX não cobra pela IA, apenas repassa o custo do provider.

### Anthropic (Claude)

| Modelo | Preço (1M tokens) | Uso ideal |
|---|---|---|
| **Claude Opus 4.6** | $15 in / $75 out | Máxima qualidade, tarefas complexas |
| **Claude Sonnet 4.6** | $3 in / $15 out | Melhor custo-benefício para uso diário |
| **Claude Haiku 4.5** | $0.80 in / $4 out | Rápido e barato — bom para agente |
| Claude 3.5 Sonnet | $3 in / $15 out | Compatibilidade com browser automation |
| Claude 3.5 Haiku | $0.25 in / $1.25 out | Ultra-barato para tarefas simples |

**Recomendado:** Haiku 4.5 para agente + Claude 3.5 Sonnet para browser

### OpenAI (GPT)

| Modelo | Preço (1M tokens) | Uso ideal |
|---|---|---|
| **GPT-4.1** | $2 in / $8 out | Melhor modelo geral da OpenAI |
| **GPT-4.1 Mini** | $0.40 in / $1.60 out | Rápido e barato — bom para agente |
| **o4-mini** | $1.10 in / $4.40 out | Raciocínio avançado (chain-of-thought) |
| GPT-4o | $2.50 in / $10 out | Legado — GPT-4.1 é superior |
| GPT-4o Mini | $0.15 in / $0.60 out | Legado — GPT-4.1 Mini é superior |

**Recomendado:** GPT-4.1 Mini para agente + GPT-4.1 Mini para browser

### Google AI (Gemini)

| Modelo | Preço (1M tokens) | Uso ideal |
|---|---|---|
| **Gemini 2.5 Pro** | $1.25 in / $10 out | Máxima qualidade, contexto enorme |
| **Gemini 2.5 Flash** | $0.15 in / $0.60 out | Rápido e barato — melhor custo Google |
| Gemini 2.0 Flash | $0.10 in / $0.40 out | Ultra-barato, bom para tarefas simples |

**Recomendado:** Gemini 2.5 Flash para agente e browser

### Groq (Ultra-rápido)

| Modelo | Preço (1M tokens) | Uso ideal |
|---|---|---|
| **Llama 4 Scout** | $0.11 in / $0.34 out | Vision rápida, muito barato |
| **Llama 3.3 70B** | $0.59 in / $0.79 out | Texto rápido, boa qualidade |

**Destaque:** Groq tem a menor latência de todos os providers — respostas quase instantâneas.

### OpenRouter (Pagos)

Todos os modelos acima também estão disponíveis via OpenRouter com uma única chave:

| Modelo | Preço (1M tokens) |
|---|---|
| Claude Sonnet 4.6 | $3 in / $15 out |
| Claude Haiku 4.5 | $0.80 in / $4 out |
| GPT-4.1 | $2 in / $8 out |
| GPT-4.1 Mini | $0.40 in / $1.60 out |

**Vantagem:** Uma chave só para acessar modelos de múltiplos providers.

---

## Como Escolher

### Prioridade: Custo Zero
OpenRouter + Qwen3 235B (texto) + Qwen2.5-VL (vision)

### Prioridade: Melhor Qualidade
Anthropic + Sonnet 4.6 (agente) + Claude 3.5 Sonnet (browser)

### Prioridade: Velocidade
Groq + Llama 3.3 70B (texto) + Llama 4 Scout (vision)

### Prioridade: Custo-Benefício (pago)
Google AI + Gemini 2.5 Flash (agente e browser) — ~$0.15/1M tokens

---

## Onde Obter Chaves

| Provider | Link | Gratuito? |
|---|---|---|
| OpenRouter | [openrouter.ai/keys](https://openrouter.ai/keys) | Sim (modelos :free) |
| Anthropic | [console.anthropic.com](https://console.anthropic.com/settings/keys) | Não (créditos iniciais) |
| OpenAI | [platform.openai.com](https://platform.openai.com/api-keys) | Não (créditos iniciais) |
| Google AI | [aistudio.google.com](https://aistudio.google.com/app/apikey) | Sim (tier gratuito generoso) |
| Groq | [console.groq.com](https://console.groq.com/keys) | Sim (rate-limited) |
