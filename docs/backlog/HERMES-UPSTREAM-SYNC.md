# Sync com Hermes upstream (Nous Research)

**Status:** procedimento de referência (não é tarefa — é como puxar atualizações
quando vale a pena).

## Contexto

O `engine/lex-engine/` é uma cópia vendored do
[hermes-agent](https://github.com/NousResearch/hermes-agent) da Nous Research,
adaptada para o produto Lex. A Nous lança releases com frequência (novos
providers de modelo, gateways de mensageria, bug fixes, ferramentas).

Esta nota documenta como **monitorar e trazer pontualmente** o que vale a pena,
sem rebase pesado.

## Remote configurado

Já adicionei localmente (não vai pro `origin`, é config do seu `.git/config`):

```bash
git remote add hermes-upstream https://github.com/NousResearch/hermes-agent.git
git fetch hermes-upstream
```

Se precisar adicionar de novo em outra máquina, são esses dois comandos.

## Checagem periódica (mensal, por exemplo)

```bash
git fetch hermes-upstream
git log --oneline hermes-upstream/main --since="1 month ago"
```

Ou olhar https://github.com/NousResearch/hermes-agent/releases pra ver as
release notes formatadas.

## Trazer algo pontual (NÃO faça `git pull` cego)

O Hermes está em subdiretório (`engine/lex-engine/`); o repo deles tem outra
estrutura (raiz). Pull direto vira bagunça. O caminho é cirúrgico:

```bash
# 1. Veja o que mudou no arquivo específico
git diff hermes-upstream/main..HEAD -- :^engine/lex-engine -- <arquivo-no-upstream>
# ou: git show hermes-upstream/main:<caminho-no-upstream>

# 2. Copie o conteúdo desejado para engine/lex-engine/<mesmo-caminho>
git show hermes-upstream/main:agent/providers/novo.py > engine/lex-engine/agent/providers/novo.py

# 3. Ajuste imports/paths se necessário, type-check, commit
```

## Cuidado com arquivos customizados

Estes arquivos foram modificados pela Lex e podem conflitar com updates do
upstream. Se uma release nova mexer neles, reconciliar manualmente:

- `hermes_cli/commands.py` — traduzido para PT-BR com framing jurídico
- `cli.py` — texto do `/help` traduzido (header, dicas, "Comandos de Skills")

(Atualizar esta lista conforme novos arquivos forem customizados.)

## Critério: o que vale a pena trazer

| Vale | Não vale |
|---|---|
| Novo provider de modelo (NIM, MiMo, etc.) | Refactor de CLI/skin |
| Novo gateway de mensageria | Mudança puramente estrutural |
| Bug fix em delegate / cron / MCP / OAuth | Features experimentais sem uso jurídico |
| Melhorias de performance/segurança | Quebra de API que exigiria muita adaptação |
| Skills novas relevantes pro jurídico | Skills de outros domínios (gaming, etc.) |

## Versão atual

Lido de `engine/lex-engine/pyproject.toml`: **hermes-agent 0.11.0** (importada na
adoção). Releases locais documentadas em `engine/lex-engine/RELEASE_v*.md`
(v0.7-v0.9 estão no repo; v0.10 e v0.11 vieram nas atualizações posteriores).
