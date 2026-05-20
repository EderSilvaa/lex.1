# Lex Memoria Entre Sessoes - Estado Atual

> **Atualizacao em 2026-05-13:** este documento resume como a memoria entre
> sessoes esta hoje no Lex, o que veio do Hermes herdado e onde ainda existe
> duplicacao ou estado transicional.

## Resposta curta

Sim, a Lex ja tem memoria entre sessoes.

Mas hoje essa memoria existe em mais de uma camada:

- memoria local do Lex Desktop;
- sessao e memoria do Hermes/Lex Engine herdado;
- Brain como memoria operacional separada.

Entao a capacidade existe, mas a fonte de verdade ainda nao parece 100%
consolidada em um unico lugar.

## O que herdamos do Hermes

O Hermes herdado traz memoria persistente real, nao apenas contexto em RAM.

Pontos principais:

- `SessionDB` em SQLite para guardar sessoes e permitir busca posterior;
- restauracao de sessoes apos restart;
- sistema de `memory providers` plugaveis;
- integracao com session search e fluxo do agente.

Referencias:

- [engine/lex-engine/AGENTS.md](../../engine/lex-engine/AGENTS.md)
- [engine/lex-engine/acp_adapter/session.py](../../engine/lex-engine/acp_adapter/session.py)

## Evidencia concreta no Hermes

### Session store

O repositorio do Engine documenta:

- `hermes_state.py` como `SessionDB`
- sessao persistida em SQLite com busca FTS5

Referencia:

- [engine/lex-engine/AGENTS.md](../../engine/lex-engine/AGENTS.md)

### Restauracao apos restart

O adaptador ACP do Hermes afirma explicitamente:

- sessoes ficam em memoria para acesso rapido;
- tambem sao persistidas no `SessionDB`;
- sobrevivem a restart do processo;
- podem ser restauradas do banco.

Referencia:

- [engine/lex-engine/acp_adapter/session.py](../../engine/lex-engine/acp_adapter/session.py)

## O que o Lex Desktop tem hoje

Mesmo antes da unificacao completa com o Hermes, o Lex ja possui memoria local
persistente propria.

Arquivo principal:

- [electron/agent/memory.ts](../../electron/agent/memory.ts)

Essa memoria local guarda:

- processos recentes;
- interacoes anteriores;
- aprendizados;
- preferencias;
- dados do usuario;
- fatos cross-session.

Persistencia atual:

- arquivo `lex-agent-memory.json`;
- armazenamento criptografado.

## O que o Brain faz nesse desenho

O Brain nao e a mesma coisa que memoria curta de conversa.

Pelo desenho atual do produto, o Brain e a memoria operacional da Lex:

- fluxos descobertos;
- passos de RPA;
- evidencias de tela;
- variacoes por tribunal;
- historico de sucesso e falha;
- relacao entre caso, processo, documento e acao.

O Hermes atua em cima do Brain:

- pergunta o que ja se sabe;
- identifica lacunas;
- decide se explora ou executa;
- transforma sucesso em skill;
- explica o que esta acontecendo;
- chama o Electron quando precisa agir.

Referencia:

- [docs/future-tasks/LEX-HERMES-INTEGRATION-PLAN.md](./LEX-HERMES-INTEGRATION-PLAN.md)

## Como entender a memoria hoje

### Camada 1 - Memoria local do Lex

Funcao:

- continuidade pratica do app;
- preferencias;
- historico recente;
- fatos persistentes simples.

Estado:

- existe;
- funciona;
- esta no Desktop.

### Camada 2 - Memoria/sessoes do Hermes

Funcao:

- historico mais nativo do Engine;
- sessao persistida;
- busca entre sessoes;
- possivel uso de providers de memoria mais sofisticados.

Estado:

- herdado;
- existe no Engine;
- ainda nao parece ser a unica fonte de verdade do produto.

### Camada 3 - Brain

Funcao:

- memoria operacional;
- experiencia de execucao;
- aprendizado de fluxos;
- conhecimento observacional sobre o PJe e o trabalho executado.

Estado:

- existe;
- esta integrado ao Lex;
- ja conversa com o Hermes via MCP em partes relevantes.

## Sinal de unificacao ja existente

O CLI do Lex foi desenhado para compartilhar o mesmo `userDataDir` do Electron
quando possivel.

Isso sugere a intencao de manter `brain` e `sessions` alinhados no mesmo PC.

Referencia:

- [electron/cli/user-data.ts](../../electron/cli/user-data.ts)

## Leitura honesta do estado atual

Se a pergunta for:

`A Lex lembra entre sessoes hoje?`

Resposta:

- sim.

Se a pergunta for:

`Essa memoria entre sessoes ja esta totalmente centralizada no Hermes herdado?`

Resposta:

- ainda nao parece totalmente.

Se a pergunta for:

`Estamos em um estado final de arquitetura de memoria?`

Resposta:

- nao;
- parece um estado hibrido/transicional.

## Diagnostico de produto

Hoje o usuario final provavelmente nao percebe a separacao interna, porque a
experiencia de continuidade ja pode existir.

Mas para arquitetura e produto, ainda e importante distinguir:

- memoria de conversa;
- memoria de fatos;
- memoria operacional;
- memoria documental;
- skill como memoria procedural.

Essas camadas ainda nao parecem completamente consolidadas numa unica narrativa
de produto.

## Risco atual

O principal risco nao e "nao ter memoria".

O principal risco e:

- duplicar informacao em camadas diferentes;
- ter comportamento inconsistente entre Desktop e Engine;
- dificultar governanca, privacidade e auditoria;
- confundir qual componente deve lembrar o que.

## Direcao recomendada

### Regra simples

Definir uma responsabilidade clara por camada:

- `Hermes` -> memoria conversacional e raciocinio entre sessoes
- `Brain` -> memoria operacional e de execucao
- `RAG documental` -> memoria de documentos
- `skills` -> memoria procedural

### O que evitar

- o mesmo fato salvo em memoria local, Brain e skill sem criterio;
- duas fontes de verdade para preferencia do usuario;
- sessoes do Engine e sessoes do Desktop divergindo sem ponte clara.

## Proposta de linguagem de produto

Para o usuario final, nao expor "memoria entre sessoes" como detalhe tecnico.

O produto deveria comunicar apenas:

- `A Lex lembra do seu contexto`
- `A Lex aprende com documentos e fluxos anteriores`
- `A Lex pode reutilizar procedimentos do escritorio`

Por baixo dos panos:

- Hermes, Brain, RAG e skills continuam separados.

## Perguntas em aberto

- Qual camada sera a fonte de verdade para preferencias do usuario?
- Qual camada sera a fonte de verdade para historico conversacional?
- O `memory.ts` local sera mantido, reduzido ou absorvido pelo Hermes?
- Havera sincronizacao explicita entre memoria do Engine e memoria do Desktop?
- Como diferenciar memoria institucional do escritorio e memoria pessoal do advogado?

## Conclusao

Hoje a Lex ja tem memoria entre sessoes, e parte disso vem sim do Hermes
herdado.

Mas o estado atual ainda parece ser:

```text
memoria funcional = sim
memoria unificada = ainda nao totalmente
arquitetura final = transicional
```

Isso nao e um problema insolvel. Na verdade, a base ja existe. O proximo passo
e reduzir duplicacao e deixar claro:

- quem lembra conversas;
- quem lembra documentos;
- quem lembra fluxos;
- quem lembra procedimentos.
