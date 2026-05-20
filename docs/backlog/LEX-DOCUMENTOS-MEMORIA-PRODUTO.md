# Lex Documentos na Memoria - Ajuste de Produto

> **Atualizacao em 2026-05-13:** este documento define como transformar a
> logica tecnica de `RAG`, `memory` e `skills` em uma experiencia simples para
> advogado no Lex Desktop.

## Problema

Hoje o modelo mental tecnico esta certo, mas a experiencia de produto ainda esta
errada para o publico advogado.

O usuario nao deveria precisar entender:

- `skill`;
- `RAG`;
- `memory`;
- `SKILL.md`;
- pastas tecnicas;
- configuracao manual de referencia.

Para o advogado, a pergunta real e simples:

```text
Como eu ensino um documento importante para a Lex e faco ela lembrar dele depois?
```

## Objetivo

Criar uma superficie simples onde o usuario:

1. envia um documento;
2. diz para que ele serve;
3. escolhe quando a Lex deve usar aquilo;
4. salva;
5. passa a ver a Lex reutilizando esse material sem setup tecnico.

## Regra de produto

O produto nao deve expor `RAG`, `memory` ou `skill` como conceitos primarios.

O produto deve expor apenas:

- `Referencia`
- `Documento importante`
- `Regra do escritorio`
- `Procedimento interno`

Mapeamento interno:

- `Referencia` -> RAG documental
- `Regra do escritorio` -> memoria curta e prioridade de uso
- `Procedimento interno` -> skill ou prompt procedural

## Nome da feature na UI

Nome preferido:

- `Ensinar documento para a Lex`

Nomes secundarios aceitaveis:

- `Adicionar documento importante`
- `Adicionar referencia do escritorio`

Evitar:

- `Criar skill`
- `Salvar em memoria`
- `Indexar RAG`

## Modelo mental correto para o usuario

```text
Envio um documento -> explico quando usar -> a Lex consulta isso depois
```

Nao explicar:

```text
Envio um documento -> indexa em chunks -> injeta no prompt -> opcionalmente vira skill
```

## Fluxo proposto

### Entrada principal

Botao visivel em `Arquivos`, `Brain` ou `Documentos`:

- `Ensinar documento para a Lex`

### Passo 1 - Escolher arquivo

Texto da tela:

`Envie um documento que a Lex deve consultar novamente no futuro.`

Acoes:

- selecionar arquivo;
- arrastar e soltar;
- importar pasta, opcional em modo avancado.

Formatos iniciais:

- PDF
- DOCX
- TXT
- MD

### Passo 2 - Dizer para que serve

Pergunta principal:

`Para que a Lex deve usar este documento?`

Opcoes simples:

- `Referencia juridica`
- `Modelo do escritorio`
- `Procedimento interno`
- `Material de cliente`

Campo livre opcional:

`Descreva em uma frase quando a Lex deve consultar este material.`

Exemplos:

- `Use quando eu pedir algo sobre protocolo no TJPA`
- `Use como modelo base para contestacoes trabalhistas`
- `Use como referencia interna do escritorio para atendimento inicial`

### Passo 3 - Definir comportamento

Pergunta:

`Como a Lex deve tratar este material?`

Opcoes:

1. `Consultar quando o assunto aparecer`
2. `Priorizar este material nesse tema`
3. `Usar como procedimento padrao do escritorio`

Traducao interna:

- opcao 1 -> referencia documental normal
- opcao 2 -> referencia com peso alto
- opcao 3 -> referencia + camada procedural

### Passo 4 - Confidencialidade

Pergunta:

`Esse documento e interno ou sensivel?`

Opcoes:

- `Uso interno do escritorio`
- `Contem dados de cliente`
- `Pode ser usado sem restricao interna`

Objetivo:

- ajustar politicas de exibicao;
- limitar compartilhamento;
- reforcar trilha de auditoria;
- preparar politicas futuras de retencao e sincronizacao.

### Passo 5 - Confirmacao

Resumo mostrado ao usuario:

- nome do arquivo
- finalidade
- modo de uso
- nivel de confidencialidade

CTA principal:

- `Salvar e ensinar a Lex`

CTA secundario:

- `Cancelar`

## Comportamento apos salvar

Depois do salvamento, o produto deve fazer isso sem expor detalhes tecnicos:

1. guardar o arquivo no contexto local do escritorio;
2. indexar o conteudo para busca futura;
3. registrar a descricao de uso;
4. se o modo for `procedimento padrao`, gerar uma camada procedural interna;
5. mostrar feedback de que a Lex aprendeu o material.

Mensagem de sucesso sugerida:

`Pronto. A Lex vai consultar este documento quando ele for relevante.`

Mensagens alternativas:

- `Documento adicionado a memoria da Lex.`
- `A Lex aprendeu quando usar este material.`

## Como isso aparece depois para o usuario

Quando a Lex reutilizar o documento, ela deve explicar em linguagem simples:

- `Usei o documento "Manual TJPA" como referencia nesta resposta.`
- `Priorizei o modelo interno do escritorio para montar esta minuta.`
- `Consultei o procedimento salvo para este tipo de tarefa.`

Evitar:

- `Recuperei chunks do RAG`
- `Carreguei a skill X`
- `Injetei memoria cross-session`

## Estrutura conceitual por baixo dos panos

### Caso 1 - Documento grande de referencia

Exemplo:

- manual de 97 paginas;
- apostila interna;
- regulamento;
- guia operacional.

Tratamento:

- arquivo inteiro preservado;
- indexacao para busca por trechos;
- sem resumir tudo dentro de uma skill;
- skill opcional apenas como "regra de uso do documento".

### Caso 2 - Modelo do escritorio

Exemplo:

- peticao base;
- contestacao padrao;
- modelo de contrato.

Tratamento:

- indexacao documental;
- classificacao por tipo;
- prioridade alta em tarefas parecidas;
- possibilidade de virar procedimento reutilizavel.

### Caso 3 - Procedimento interno

Exemplo:

- como protocolar em determinado tribunal;
- como montar checklist interno;
- como revisar uma peca antes de enviar.

Tratamento:

- referencia documental;
- mais camada procedural;
- possivel skill auto-gerada ou guiada.

## Microcopy recomendada

### Botao

- `Ensinar documento para a Lex`

### Titulo do modal

- `Adicionar documento importante`

### Subtitulo

- `A Lex vai usar este material como referencia nas proximas tarefas relacionadas.`

### Campo de descricao

- `Explique em uma frase quando este documento deve ser usado`

### Opcoes de uso

- `Consultar quando relevante`
- `Priorizar neste tema`
- `Usar como procedimento do escritorio`

### Feedback final

- `Documento salvo. A Lex passa a considerar esse material nas proximas respostas.`

## Lugares onde a feature pode morar

Ordem preferida:

1. `Arquivos`
2. `Documentos`
3. `Brain`, apenas se Brain deixar de parecer painel tecnico

Recomendacao:

Nao colocar a entrada principal dentro de uma area com nome excessivamente
tecnico.

## Modo simples vs modo avancado

### Modo simples

Visivel por padrao para advogado:

- subir arquivo;
- descrever uso;
- escolher prioridade;
- salvar.

### Modo avancado

Visivel apenas para operador, suporte ou admin:

- ver origem interna do material;
- ver se virou referencia, memoria ou procedimento;
- reprocessar indexacao;
- editar instrucoes de uso;
- revisar trilha de auditoria.

## Fora de escopo inicial

- edicao manual de `SKILL.md`;
- expor categorias tecnicas;
- expor estrutura de pastas;
- deixar o usuario escolher entre `RAG`, `memory` e `skill`;
- explicacoes de arquitetura na tela principal.

## Resultado esperado

Ao final deste ajuste, o advogado deve sentir:

```text
Nao precisei configurar nada tecnico.
Eu apenas ensinei um documento para a Lex.
Agora ela sabe quando consultar esse material.
```

## Criterios de pronto

- o usuario consegue ensinar um documento sem ver jargao tecnico;
- o fluxo cabe em um modal ou wizard curto;
- um documento grande pode ser salvo sem virar uma skill gigante;
- a Lex consegue justificar depois que usou aquele material;
- a camada tecnica continua existindo por baixo dos panos, mas nao aparece como
  requisito de uso.

## Sugestao de entrega incremental

### Fase 1

- upload de documento;
- descricao de uso;
- indexacao local;
- mensagem de sucesso;
- recuperacao futura no chat/agente.

### Fase 2

- prioridade por tema;
- tag `interno/confidencial`;
- tela "Documentos ensinados para a Lex".

### Fase 3

- geracao procedural para documentos do tipo `procedimento interno`;
- revisao/edicao de instrucoes de uso;
- auditoria e explicacao de por que um documento foi usado.
