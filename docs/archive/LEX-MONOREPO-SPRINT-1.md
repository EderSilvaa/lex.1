# Lex Monorepo Sprint 1 - Unificacao tecnica do produto

> **Estado atual em 2026-05-09:** Sprint 1 avancou alem da importacao segura: o
> Engine importado em `engine/lex-engine` ja e o runtime padrao via `repo-wsl`,
> com `external-wsl` preservado como rollback. A arquitetura atual resumida esta
> em [`../CURRENT-ARCHITECTURE.md`](../CURRENT-ARCHITECTURE.md).

Objetivo da sprint: transformar a Lex em um produto tecnico unico, com Desktop e
Lex Engine evoluindo no mesmo repositorio canonico, sem quebrar o fluxo que ja
funciona hoje.

Esta sprint e fundacao. Nao e sprint de visual, nao e sprint de PJe novo e nao e
sprint de chat final.

## Norte

```text
Produto comercial = Lex Desktop
Motor inteligente = Lex Engine
Contrato = MCP/HTTP/JSON estruturado
Repositorio canonico = Lex monorepo
Console = interface operacional enquanto o produto final amadurece
Agora = workflow duravel para tarefas complexas
PJe = controlado pelo Desktop, nunca pelo Engine direto
```

## Problema que esta sprint resolve

Hoje existe confusao pratica entre:

- projeto Desktop atual: `lex-test1`;
- motor/fork Hermes: `lex_engine`;
- copia Windows do Engine;
- copia WSL do Engine;
- scripts de build/start separados;
- mudancas que as vezes precisam ser feitas nos dois lados;
- usuario/dev sem certeza de "onde editar" e "qual app esta rodando".

A sprint deve reduzir essa confusao sem tentar reescrever tudo.

## Fora de escopo

- redesenhar a UI inteira;
- remover o Console Lex;
- criar chat visual final;
- peticionar/protocolar/assinar no PJe;
- refatorar todo o Engine;
- empacotar instalador final;
- atualizar upstream Hermes;
- trocar provedor/modelo.

## Decisoes que precisam ficar explicitas

### Repositorio canonico

Decisao recomendada:

```text
lex-test1 / lex.1 vira o repositorio canonico do produto Lex.
lex_engine entra como camada engine dentro dele.
```

Motivo:

- o produto comercial e o Desktop;
- empacotamento, PJe, licenca, UI e permissao vivem no Electron;
- o Engine deve ser componente versionado do produto, nao um projeto mental
  separado.

### Pasta de trabalho durante a sprint

Durante esta sprint, a pasta que deve ficar aberta no IDE e:

```text
C:\Users\EDER\lex-test1
```

Motivo:

- este e o repositorio do produto Desktop;
- e onde esta o Git remoto `lex.1`;
- e onde a importacao do Engine sera revisada, commitada e enviada;
- evita editar sem querer a copia de fallback achando que esta editando o
  monorepo.

O projeto `lex_engine` atual continua existindo, mas como fallback operacional,
nao como pasta principal da sprint.

### Fallback obrigatorio

O `lex_engine` atual nao deve ser apagado, movido ou substituido nesta sprint.

Fallback mantido:

```text
C:\Users\EDER\lex_engine          # copia Windows atual do Engine
/home/eder/lex_engine             # copia WSL atual usada pelo Console
```

Regra historica inicial:

- importar o Engine para `lex-test1/engine/lex-engine/` nao muda o runtime;
- o Desktop continua usando `/home/eder/lex_engine` ate validarmos o novo modo;
- se a importacao ficar incompleta, o produto atual continua funcionando;
- se alguma integracao nova quebrar, voltamos para `LEX_ENGINE_MODE=external-wsl`;
- nenhuma etapa da Sprint 1 pode depender de deletar ou renomear o fallback.

Estado atual:

- `repo-wsl` e o padrao;
- `external-wsl` continua como rollback;
- `repo-wsl` carrega o projeto em
  `/mnt/c/Users/EDER/lex-test1/engine/lex-engine`;
- o fallback nao deve ser apagado enquanto o venv/dependencias ainda forem
  usados pelo launcher.

Pronto quando:

- conseguimos abrir a Lex e o Console mesmo que a pasta importada dentro do repo
  seja ignorada temporariamente.

### Forma de importar o Engine

Opcoes:

1. `engine/lex-engine/` como copia versionada.
2. `vendor/lex-engine/` como copia versionada.
3. Git submodule.
4. Git subtree.

Recomendacao para MVP:

```text
engine/lex-engine/ como copia versionada no monorepo
```

Motivo:

- mais simples para um dev solo;
- evita friccao de submodule;
- facilita editar Desktop + Engine no mesmo commit;
- depois podemos trocar para subtree se upstream/fork virar prioridade.

### Fronteira tecnica

Mesmo no monorepo:

- Desktop nao importa modulo Python interno do Engine;
- Engine nao mexe no PJe/Windows diretamente;
- comunicacao fica via MCP/HTTP/JSON;
- schemas compartilhados podem ir em `packages/shared`;
- scripts podem orquestrar os dois lados.

## Estrutura alvo MVP

```text
.
+-- apps/
|   +-- desktop/              # Electron/renderer atual no futuro
+-- engine/
|   +-- lex-engine/           # fork Hermes/Lex Engine importado
+-- packages/
|   +-- shared/               # schemas, tipos e contratos
|   +-- mcp-lex-desktop/      # opcional: MCP server separado depois
+-- docs/
+-- scripts/
+-- package.json
+-- README.md
```

### Estrutura transicional permitida

Para nao quebrar tudo na primeira etapa, podemos comecar assim:

```text
.
+-- electron/
+-- src/
+-- scripts/
+-- docs/
+-- engine/
|   +-- lex-engine/
+-- package.json
+-- README.md
```

Ou seja: primeiro importamos o Engine para `engine/lex-engine/` sem mover o
Desktop ainda. A reorganizacao para `apps/desktop/` fica para sprint futura.

## Task 1 - Inventario dos dois lados

Mapear o que existe no Desktop e no Engine antes de importar.

Desktop atual:

- Electron main/preload/renderer;
- bridge local;
- MCP tools `lex-desktop`;
- PJe/browser/Playwright;
- arquivos e documentos;
- Brain TypeScript;
- configuracoes/provedor/chaves;
- licenca/Supabase;
- build/dev scripts.

Engine atual:

- CLI Lex/Hermes;
- agente;
- skills;
- banner/skin;
- MCP client/server config;
- memoria/sessoes;
- setup;
- provedores/modelos;
- canais futuros.

Entregas:

- [x] tabela `modulo -> dono -> fica onde -> risco`;
- [x] listar arquivos/pastas que nao devem ser importados;
- [x] listar segredos e arquivos locais que devem ficar fora do Git;
- [x] listar scripts essenciais dos dois lados.

Pronto quando:

- sabemos exatamente o que importar e o que ignorar.

## Task 2 - Higiene de Git e ignore

Antes de copiar o Engine, garantir que o monorepo nao vai receber lixo local.

Checar:

- `.env`;
- chaves/API keys;
- `.venv`, `venv`, `__pycache__`;
- logs;
- sessoes;
- caches;
- downloads;
- node_modules;
- perfis Chrome;
- bancos locais sensiveis;
- arquivos de usuario/PJe.

Entregas:

- [x] revisar `.gitignore`;
- [x] criar ignore especifico para `engine/lex-engine`;
- [x] garantir que `git status` nao liste segredos;
- [x] documentar onde ficam configs locais.

Pronto quando:

- importar o Engine nao coloca chave, cache ou dado sensivel no Git.

## Task 3 - Importar Engine sem integrar

Copiar `lex_engine` para dentro do repositorio canonico sem mudar o
comportamento do Desktop.

Entrega:

- [x] criar `engine/lex-engine/`;
- [x] copiar arquivos fonte do Engine;
- [x] preservar licencas/avisos do fork;
- [x] nao copiar ambiente virtual, caches, logs, sessoes, `.env`, keys;
- [x] registrar origem/commit do Engine importado em um arquivo de manifesto.

Manifesto sugerido:

```text
engine/lex-engine/LEX_ENGINE_IMPORT.md
```

Conteudo:

- origem;
- data da importacao;
- commit/revisao se houver;
- decisao de licenca/atribuicao;
- arquivos excluidos;
- como atualizar no futuro.

Pronto quando:

- `git status` mostra o Engine importado de forma limpa e revisavel;
- Desktop ainda builda sem usar a copia importada.

## Task 4 - Scripts raiz para dev solo

Criar comandos claros para operar o produto todo.

Scripts desejados:

```text
npm run dev:desktop
npm run build:desktop
npm run engine:status
npm run engine:setup
npm run engine:console
npm run mcp:test
npm run product:doctor
```

Entregas:

- [x] adicionar scripts no `package.json` ou `scripts/`;
- [x] comandos devem funcionar no Windows chamando WSL quando necessario;
- [x] erro deve explicar o problema, nao despejar stack gigante;
- [x] scripts nao devem exigir lembrar caminho `/home/eder/lex_engine`.

Pronto quando:

- um dev abre o repo e consegue iniciar Desktop + Engine sem lembrar a historia
  do projeto.

## Task 5 - Fixar caminho do Engine no Desktop

Hoje o Desktop aponta para `C:\Users\EDER\lex_engine` e `/home/eder/lex_engine`.
Na unificacao, precisamos de regra clara.

Fases:

1. Desktop continua usando WSL externo atual por compatibilidade.
2. Desktop detecta se existe `engine/lex-engine`.
3. Desktop mostra qual Engine esta em uso.
4. Futuramente, setup instala/sincroniza Engine para WSL automaticamente.

Entregas:

- [x] adicionar configuracao `LEX_ENGINE_MODE`;
- [x] modos possiveis:
  - `external-wsl`;
  - `repo-wsl`;
  - `repo-windows` como modo declarado, ainda bloqueado como runtime;
- [x] status mostra `Engine source`;
- [x] erro explica quando repo tem Engine mas WSL ainda nao esta preparado.
- [x] manter fallback `external-wsl` como padrao ate o fim da sprint.

Pronto quando:

- nao existe mais duvida se o app esta usando Engine externo ou Engine do repo.
- trocar para o Engine importado e voltar para o Engine externo e uma decisao de
  configuracao, nao uma operacao manual arriscada.

## Task 6 - Contratos compartilhados

Comecar `packages/shared` apenas com o minimo.

Contratos candidatos:

- `LexRuntimeStatus`;
- `PjeStatus`;
- `CurrentCaseContext`;
- niveis HITL;
- resposta padrao de tool;
- erros normalizados.

Entregas:

- [ ] criar `packages/shared` ou documentar porque ainda nao;
- [ ] evitar dependencia circular;
- [ ] usar JSON Schema ou TypeScript conforme fizer sentido;
- [ ] nao bloquear a sprint tentando tipar o mundo todo.

Pronto quando:

- Desktop e Engine tem nomes iguais para status, PJe e permissoes.

## Task 7 - Doctor do produto

Criar um diagnostico unico que diga se a Lex esta pronta.

Checagens:

- Node/npm;
- build Desktop;
- WSL/Ubuntu;
- Engine path;
- comando `hermes`/Lex Engine;
- MCP `lex-desktop`;
- bridge local;
- Chrome controlado;
- provedor/modelo/chave sem revelar segredo;
- permissao de arquivos.

Entregas:

- [x] `npm run product:doctor`;
- [x] saida curta:
  - OK;
  - aviso;
  - erro;
  - proxima acao;
- [x] nao vazar API key.

Pronto quando:

- antes de testar PJe, conseguimos saber se a instalacao esta saudavel.

## Task 8 - README de operacao local

Atualizar docs para a nova realidade.

Conteudo:

- como instalar dependencias;
- como iniciar Desktop;
- como verificar Engine;
- como abrir Console Lex;
- como testar MCP;
- onde configurar chave;
- onde ficam dados locais;
- como nao commitar segredos.

Entregas:

- [ ] README curto na raiz ou `docs/LOCAL-DEVELOPMENT.md`;
- [ ] link para manifesto do Engine;
- [ ] comandos atualizados.

Pronto quando:

- outro chat/dev consegue continuar sem depender da memoria desta conversa.

## Task 9 - Validacao sem mudar comportamento

Validar que a importacao nao quebrou o app.

Checks:

- [x] `npm run build`;
- [x] app inicia;
- [x] health responde;
- [ ] Console Lex abre;
- [x] `hermes mcp test lex-desktop` ou equivalente passa;
- [x] fluxo PJe nao precisa ser refeito completo, mas `pje_status` deve responder.
- [x] fallback externo ainda funciona depois da importacao.

Pronto quando:

- monorepo existe, mas o produto continua funcionando como antes.

## Task 10 - Promover Engine do repo para runtime principal

Depois da importacao segura, a proxima mudanca e fazer o Console Lex usar por
padrao o Engine versionado dentro do monorepo.

Estado antes da Task 10:

```text
Padrao atual: external-wsl
Runtime atual: /home/eder/lex_engine
Repo importado: engine/lex-engine
Repo via WSL: /mnt/c/Users/EDER/lex-test1/engine/lex-engine
```

Estado alvo:

```text
Padrao novo: repo-wsl
Runtime novo: /mnt/c/Users/EDER/lex-test1/engine/lex-engine
Fallback preservado: external-wsl -> /home/eder/lex_engine
```

Por que fazer:

- todas as alteracoes de Engine passam a ficar dentro do repo canonico;
- Desktop e Engine podem ser commitados juntos;
- reduz o risco de editar `lex_engine` antigo achando que editou o produto;
- deixa o produto mais perto de um instalador/entrega unica.

Riscos:

- o comando global `hermes` pode continuar carregando pacote instalado a partir
  do fallback antigo, mesmo com `cd` no Engine importado;
- o Engine importado pode depender de arquivos/configs que ficaram fora da copia;
- caminhos em `/mnt/c/...` podem ser mais lentos no WSL;
- se o usuario tiver `.env` apenas no fallback, o repo-wsl pode ficar sem chave;
- scripts upstream podem assumir `/home/eder/lex_engine`.
- nesta fase, `repo-wsl` usa o Python/venv saudavel do fallback
  (`/home/eder/lex_engine/venv/bin/python`) para executar o launcher do repo.

Plano de migracao:

1. Rodar console em modo opt-in:

```powershell
$env:LEX_ENGINE_MODE='repo-wsl'
npm run dev:desktop
```

2. Abrir Console Lex e testar perguntas simples:

```text
responda apenas: Lex repo online
qual sua fonte de runtime?
liste suas skills juridicas disponiveis sem executar nenhuma acao
```

3. Testar MCP sem PJe sensivel:

```text
npm run mcp:test
```

4. Testar uma tool read-only:

```text
Use lex_health e me diga qual Engine source aparece.
```

5. Testar fluxo PJe leve:

```text
Use pje_status. Nao clique em nada.
```

6. Validar se o `hermes` realmente esta usando o repo importado:

```text
No banner/status, confirmar Projeto:
/mnt/c/Users/EDER/lex-test1/engine/lex-engine
```

7. Se tudo passar, trocar o padrao do Desktop de `external-wsl` para `repo-wsl`.

8. Depois da troca, repetir:

```text
npm run build
npm run engine:status
npm run product:doctor
npm run mcp:test
```

9. Manter instrucao de rollback:

```powershell
$env:LEX_ENGINE_MODE='external-wsl'
npm run dev:desktop
```

Entregas:

- [x] `repo-wsl` testado manualmente no Console Lex;
- [x] `lex_health` mostra `engineSource=repo-wsl`;
- [x] `pje_status` responde em modo read-only;
- [x] Desktop inicia com `repo-wsl` sem env manual;
- [x] `external-wsl` segue funcionando como fallback;
- [x] docs explicam como alternar os modos;
- [x] nenhum segredo copiado para `engine/lex-engine`.

Pronto quando:

- o runtime principal da Lex vem do monorepo;
- voltar para `/home/eder/lex_engine` exige so trocar configuracao;
- o usuario nao precisa saber que existem duas pastas no dia a dia.

## Ordem recomendada

1. Task 1 - Inventario dos dois lados.
2. Task 2 - Higiene de Git e ignore.
3. Task 3 - Importar Engine sem integrar.
4. Task 4 - Scripts raiz para dev solo.
5. Task 5 - Fixar caminho do Engine no Desktop.
6. Task 7 - Product doctor.
7. Task 8 - README local.
8. Task 9 - Validacao.
9. Task 10 - Promover Engine do repo para runtime principal.
10. Task 6 - Shared contracts, apenas se nao travar a sprint.

## Primeiro lote recomendado

```text
Lote 1:
1. Inventario
2. Gitignore/higiene
3. Importar Engine para engine/lex-engine
4. Manifesto de importacao
5. Build do Desktop sem comportamento novo
```

Este lote da o maior ganho: para de existir "projeto de la" e "projeto de ca".

## Criterio final da Sprint 1

Sprint 1 fica concluida quando:

- repositorio canonico tem Desktop e Engine versionados;
- o Engine importado nao trouxe segredos/caches/dados locais;
- existe manifesto de origem do Engine;
- `lex_engine` externo continua preservado como fallback;
- o Desktop informa qual fonte de Engine esta usando;
- scripts basicos na raiz explicam como operar;
- Desktop ainda funciona;
- Console Lex ainda abre;
- bridge/MCP continua respondendo;
- README explica a nova arquitetura;
- tudo esta commitado e enviado para o GitHub.
