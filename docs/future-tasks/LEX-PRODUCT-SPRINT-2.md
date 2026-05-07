# Lex Product Sprint 2 - Produto e interface unificada

Objetivo da sprint: transformar o Lex Desktop na superficie principal do produto,
sem matar o Console Lex. O usuario deve sentir que esta usando um unico produto:
status, PJe, arquivos, Brain, documentos e Console precisam conversar entre si.

## Norte

```text
Lex Desktop = centro de comando do produto
Console Lex = modo operador/avancado, ainda principal para automacao
Fluxos = caminho guiado para usuario nao tecnico
PJe/Browser = area operacional controlada
Arquivos = entrada e saida de documentos
Brain = memoria operacional, nao painel tecnico solto
Configuracoes = identidade, provedor, privacidade, canais e tribunal padrao
```

## Decisao de produto desta sprint

Nao vamos decidir agora se o produto final sera chat visual, terminal polido ou
hibrido. Nesta sprint, o Console continua como interface principal de comando.
O foco e fazer o Desktop parecer unificado ao redor dele.

## Fora de escopo

- remover o Console Lex;
- reconstruir o chat visual completo;
- peticionar/protocolar/assinar no PJe;
- automacao profunda de processo inteiro;
- trocar o motor Lex Engine/Hermes;
- criar instalador comercial final;
- refatorar monorepo inteiro.

## Estado atual observado

- Sidebar tem `Arquivos`, `Brain`, `Console`, `Lotes`, `Configuracoes`.
- `Chat` existe no HTML, mas esta escondido.
- Console Lex abre o motor via WSL e MCP `lex-desktop`.
- Status `Motor on/off` foi corrigido e nao deve travar o app.
- Fluxos do Console ja cobrem:
  - consultar processo PJe;
  - ler resultados;
  - abrir autos;
  - ler autos;
  - baixar documento atual;
  - analisar documento baixado;
  - resumo juridico.
- PJe ja foi provado em fluxo real no TJPA com HITL:
  - consulta por CNJ;
  - leitura de resultado;
  - abertura de autos com aviso/modal;
  - leitura de autos;
  - abertura/download de documento;
  - analise de documento.

## Resultado esperado da sprint

Ao abrir a Lex, o usuario deve entender:

1. qual tribunal/ambiente esta em uso;
2. se o motor, bridge, PJe/browser e provedor estao prontos;
3. qual proximo fluxo juridico pode executar;
4. onde entram documentos;
5. onde ficam resultados e historico;
6. quando uma acao e somente leitura, sensivel ou bloqueada.

## Task 1 - Inventario de superficies

Mapear cada area da UI e decidir seu papel no produto.

Areas:

- `Console`: comando e automacao guiada;
- `Arquivos`: documentos locais, downloads, PDFs e saidas;
- `Brain`: memoria operacional e aprendizado de fluxos;
- `Lotes`: producao em massa, ainda secundario;
- `Configuracoes`: perfil, provedor, privacidade, canais e tribunal padrao;
- `Conversas`: historico/sessoes;
- `Chat`: legado escondido, nao ativar sem desenho novo.

Entregas:

- [ ] tabela `area -> funcao -> usuario alvo -> status atual -> decisao`;
- [ ] marcar o que fica visivel para usuario comum;
- [ ] marcar o que fica como modo tecnico/suporte;
- [ ] listar strings ainda confusas: chat, terminal, engine, brain, lote.

Pronto quando:

- nenhuma area da UI existe sem papel claro no produto.

## Task 2 - Home operacional do Lex Desktop

Criar ou adaptar a primeira tela para ser um painel simples de trabalho.

Nao precisa ser landing page. Deve ser um painel util.

Blocos sugeridos:

- Status:
  - Motor;
  - Bridge/MCP;
  - Browser controlado;
  - PJe conectado/logado;
  - tribunal preferido/ativo;
  - provedor/modelo ativo;
  - ultimo erro relevante.
- Acoes rapidas:
  - Consultar processo;
  - Ler autos abertos;
  - Analisar documento;
  - Abrir Console Lex;
  - Abrir pasta de downloads/documentos.
- Contexto:
  - processo atual, se houver;
  - documento atual, se houver;
  - ultima acao PJe executada;
  - nivel HITL da proxima acao.

Entregas:

- [ ] decidir se a Home sera a propria aba Console com painel no topo ou uma nova
      area `Inicio`;
- [ ] criar wireframe textual;
- [ ] definir dados que ja existem e dados que faltam;
- [ ] nao depender de API lenta para renderizar a tela.

Pronto quando:

- o usuario abre a Lex e sabe o estado do sistema sem precisar digitar nada.

## Task 3 - Status unificado

Substituir mensagens soltas por um modelo unico de status.

Status minimo:

```text
Motor: on/off/verificando
Bridge: on/off
MCP: lex-desktop pronto/indisponivel
Browser: conectado/desconectado
PJe: login/consulta/autos/documento/fora do ar/desconhecido
Tribunal: TJPA/TRT8/etc
Provedor: Anthropic/OpenAI/OpenRouter/local
Modelo: nome curto
```

Entregas:

- [ ] criar contrato `LexRuntimeStatus`;
- [ ] reaproveitar `lex-engine-status`, `/health` e `pje_status`;
- [ ] separar status rapido de diagnostico profundo;
- [ ] cachear ultimo status bom para nao piscar `off` durante reload;
- [ ] mostrar erro humano, nao stack trace.

Pronto quando:

- reiniciar o app nao faz o usuario achar que perdeu o PJe se o Chrome continua
  aberto;
- status rapido nao trava a UI.

## Task 4 - Fluxos guiados no Desktop

Transformar o seletor `Fluxos` em uma experiencia mais vendavel, sem abandonar o
Console.

Fluxos MVP:

- Consultar processo por numero CNJ;
- Consultar por nome da parte;
- Consultar por advogado/OAB;
- Ler resultados;
- Abrir autos com confirmacao;
- Ler autos em modo somente leitura;
- Baixar documento atual;
- Analisar documento;
- Resumir documento juridico.

Entregas:

- [ ] desenhar painel/command palette de fluxos;
- [ ] cada fluxo deve ter:
  - objetivo;
  - campos necessarios;
  - acao que sera enviada ao Console;
  - nivel HITL;
  - resultado esperado;
  - fallback.
- [ ] permitir revisar prompt antes de enviar, pelo menos nos fluxos sensiveis;
- [ ] manter atalho de envio direto para usuario avancado.

Pronto quando:

- advogado nao tecnico consegue iniciar um fluxo sem decorar prompt nem nome de
  tool.

## Task 5 - Area de caso/processo atual

Criar um conceito de "contexto atual" dentro do Desktop.

Contexto atual pode conter:

- numero CNJ;
- tribunal;
- partes;
- classe;
- orgao julgador;
- URL/aba PJe atual;
- documento atual;
- caminho local do PDF baixado;
- ultima movimentacao lida;
- lacunas.

Entregas:

- [ ] definir estrutura `CurrentCaseContext`;
- [ ] preencher a partir de `pje_ler_resultados`, `pje_ler_autos` e documento
      baixado;
- [ ] exibir resumo em painel pequeno;
- [ ] botao para enviar contexto ao Console Lex;
- [ ] botao para limpar contexto.

Pronto quando:

- a Lex sabe "qual processo estamos olhando" sem depender apenas da memoria do
  chat/terminal.

## Task 6 - Arquivos como entrada e saida do fluxo juridico

Unificar Arquivos com o fluxo do Console.

Problemas atuais:

- Arquivos ainda fala em "Enviar ao Chat";
- documento baixado pelo PJe pode abrir em aba PDF antes de virar arquivo local;
- analise de documento precisa saber qual PDF usar.

Entregas:

- [ ] renomear `Enviar ao Chat` para algo compativel com Console/Fluxos;
- [ ] criar acao `Analisar com Lex`;
- [ ] quando houver PDF baixado/atual, oferecer abrir em Arquivos;
- [ ] registrar documento atual no contexto do processo;
- [ ] indicar se PDF tem texto extraivel ou precisa OCR futuro.

Pronto quando:

- o usuario baixa ou seleciona um PDF e entende como pedir analise sem voltar
  para comando cru.

## Task 7 - Brain como memoria visivel, nao painel tecnico

O Brain deve aparecer como "memoria operacional da Lex", nao como dashboard de
debug.

Entregas:

- [ ] separar modo usuario e modo tecnico;
- [ ] mostrar:
  - fluxos aprendidos;
  - tribunal mais usado;
  - ultima observacao PJe;
  - seletores problemáticos apenas em modo tecnico;
  - sugestoes de proxima melhoria.
- [ ] permitir buscar conhecimento do Brain e enviar ao Console;
- [ ] manter export/debug acessivel, mas menos central.

Pronto quando:

- o usuario entende que o Brain ajuda a Lex a lembrar caminhos e padroes, sem
  parecer uma tela de logs solta.

## Task 8 - Configuracoes unificadas

Concentrar tudo que define comportamento da Lex.

Campos importantes:

- perfil do usuario;
- OAB/cargo;
- tribunal padrao;
- provedor/modelo;
- chave API;
- privacidade;
- canais;
- nivel de autonomia/HITL;
- caminho do Lex Engine;
- modo local/WSL.

Entregas:

- [ ] revisar textos da tela de Configuracoes;
- [ ] criar status visual de provedor/modelo sem expor chave;
- [ ] deixar tribunal padrao alimentando os fluxos PJe;
- [ ] adicionar/planejar nivel de autonomia:
  - somente leitura;
  - navegacao reversivel;
  - download/acesso com confirmacao;
  - atos processuais bloqueados.

Pronto quando:

- configuracoes deixam claro como a Lex trabalha e onde esta o limite de
  permissao.

## Task 9 - Conversas e sessoes

Decidir o papel da lista `Conversas` enquanto o Console for principal.

Opcoes:

- manter como historico do Console;
- renomear para `Historico`;
- guardar fluxos/casos recentes;
- esconder temporariamente se confundir.

Entregas:

- [ ] decidir nome;
- [ ] vincular conversa a processo/documento quando existir;
- [ ] mostrar horario e tipo de fluxo;
- [ ] evitar que clique em conversa abra chat antigo quebrado.

Pronto quando:

- historico ajuda o usuario a retomar trabalho, nao parece sobra do chat antigo.

## Task 10 - Decisao controlada sobre Chat visual

Nao implementar o chat final ainda. Mapear criterios.

Criterios para reativar chat visual:

- nao conflitar com Console;
- usar Lex Engine por baixo;
- suportar streaming ou resposta final clara;
- saber exibir tool calls de forma amigavel;
- ter HITL no Desktop;
- nao esconder erros de PJe;
- nao duplicar memoria/sessao com o Console.

Possiveis caminhos:

1. Console continua principal e chat fica para depois.
2. Chat simples para analise de documento, Console para automacao.
3. Chat vira camada principal e Console vira modo avancado.
4. Hibrido: chat normal + painel de execucao tipo terminal/trace.

Pronto quando:

- temos uma decisao escrita do que precisa estar pronto antes do chat voltar.

## Task 11 - Teste de jornada vendavel

Criar roteiro de produto, nao apenas teste tecnico.

Demo esperada:

1. Abrir Lex Desktop.
2. Ver status pronto.
3. Escolher tribunal/processo.
4. Consultar processo via fluxo guiado.
5. Ler resultados.
6. Abrir autos com HITL.
7. Baixar/abrir documento atual.
8. Analisar documento.
9. Ver contexto do caso atualizado.
10. Salvar/exportar resumo.

Entregas:

- [ ] roteiro em 5 minutos;
- [ ] roteiro em 15 minutos;
- [ ] lista de falhas aceitaveis e fallback;
- [ ] checklist de seguranca.

Pronto quando:

- a Lex consegue ser demonstrada como produto unificado, mesmo com o Console
  ainda sendo o motor visivel.

## Ordem recomendada

1. Task 1 - Inventario de superficies.
2. Task 3 - Status unificado.
3. Task 2 - Home operacional.
4. Task 4 - Fluxos guiados.
5. Task 5 - Contexto de caso/processo atual.
6. Task 6 - Arquivos integrados ao fluxo.
7. Task 8 - Configuracoes unificadas.
8. Task 9 - Conversas/sessoes.
9. Task 7 - Brain como memoria visivel.
10. Task 10 - Decisao sobre chat visual.
11. Task 11 - Teste de jornada vendavel.

## Primeiro lote recomendado

Para evitar sprint grande demais, comecar por:

```text
Lote 1:
1. Inventario de superficies
2. Status unificado
3. Home operacional simples
4. Fluxos guiados como painel acima/ao lado do Console
```

Este lote ja deixa a Lex mais produto sem mexer no motor, sem reativar chat e
sem correr risco no PJe.

## Criterio final da Sprint 2

Sprint 2 fica concluida quando:

- o Desktop tem uma primeira tela/painel de produto;
- status do motor/PJe/browser/provedor e claro;
- Console Lex continua funcional;
- fluxos guiados reduzem dependencia de prompt manual;
- processo/documento atual aparecem como contexto;
- Arquivos e Configuracoes usam linguagem compativel com o Console;
- Brain tem papel compreensivel;
- existe roteiro demonstravel de ponta a ponta;
- build passa e app reinicia.

