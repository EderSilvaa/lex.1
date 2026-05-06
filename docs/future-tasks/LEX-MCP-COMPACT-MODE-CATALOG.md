# Lex MCP Compact Mode - Catalogo de Implementacao

Data: 2026-04-30

## Objetivo

Reduzir consumo de tokens/API na integracao Lex Desktop + Lex Engine/Hermes sem perder qualidade juridica nem seguranca operacional no PJe.

A decisao de arquitetura foi conservadora:

- compactar respostas MCP por padrao nas tools mais usadas do fluxo PJe;
- manter JSON bruto disponivel sob demanda com `includeRaw=true` ou `includeDebug=true`;
- registrar aprendizado local no Brain;
- medir payloads globalmente em modo sombra, sem cortar nada automaticamente.

## Principios Mantidos

- Nenhuma acao sensivel no PJe sem confirmacao humana.
- Nao aceitar aviso/modal, abrir autos, baixar documento ou peticionar sem trava HITL.
- O bruto continua existindo quando for necessario diagnosticar tela nova, erro ou ambiguidade.
- O modo economico evita enviar contexto repetitivo ao modelo, mas nao remove sinais juridicos essenciais.

## Arquivos Alterados

### `scripts/lex-desktop-mcp-server.mjs`

Implementada a primeira camada de compact mode nas tools MCP/PJe.

Tools compactadas:

- `pje_inspecionar_contexto`
- `pje_preencher_numero`
- `pje_clicar_consultar`
- `pje_ler_resultados`
- `pje_abrir_resultado`

Tambem foi adicionado um medidor global de payload em modo sombra para todas as tools MCP registradas no servidor `lex-desktop`.

### `electron/observer/writer-brain.ts`

Melhorado o registro de seletores bem-sucedidos no Brain.

Antes, apenas um seletor principal podia ser registrado. Agora o writer aceita multiplos seletores vindos de campos como:

- `selector`
- `css`
- `css_selector`
- `target`
- `selectors[]`

Isso ajuda a Lex a reaproveitar caminhos conhecidos do PJe em consultas futuras.

## Compact Mode nas Tools PJe

As respostas padrao agora priorizam campos pequenos e acionaveis:

- `ok`
- `mode`
- `compactMode`
- `rawIncluded`
- `confidence`
- `discoveryRecommended`
- `state`
- `resumo`
- `warnings`
- `nextActions`
- candidatos compactos
- observacao/flows do Brain quando aplicavel

Campos caros ficam fora por padrao:

- JSON bruto completo
- arvore completa de acessibilidade
- HTML/texto bruto extenso
- screenshots/base64
- frames/tabelas grandes
- snippets longos

Para diagnostico, a chamada pode pedir:

```json
{
  "includeRaw": true
}
```

ou:

```json
{
  "includeDebug": true
}
```

## Politica de Discovery

O modelo deve evitar redescobrir a tela inteira quando ja houver informacao suficiente.

Fluxo recomendado:

1. Usar resposta compacta da tool PJe.
2. Se houver `brain.knownFlows`, preferir o fluxo conhecido.
3. Se `confidence=low`, `discoveryRecommended=true`, tela nova, erro ou ambiguidade, repetir com `includeRaw=true`.
4. Nao chamar tools grandes em loop sem uma razao clara.

## Brain e Flows

As tools PJe passaram a registrar observacoes operacionais compactas no Brain:

- `pje_preencher_numero`
- `pje_clicar_consultar`
- `pje_ler_resultados`
- `pje_abrir_resultado`

Essas observacoes usam `detectFlows=true` para permitir aprendizado local de fluxos conhecidos.

Na pratica, a Lex pode aprender que em uma tela PJe especifica:

- quais campos recebem o numero CNJ;
- qual botao executa a consulta;
- qual resultado foi aberto;
- quais seletores funcionaram.

## Medidor Global em Modo Sombra

Foi adicionado um wrapper global ao registro das tools MCP.

Ele mede:

- nome da tool;
- duracao;
- tamanho da resposta em caracteres (`textChars`);
- quantidade de partes de texto;
- se a resposta estava em `compactMode`;
- se incluiu `raw`;
- `confidence`;
- `discoveryRecommended`;
- maiores campos por tamanho.

Importante: o medidor nao corta, nao resume e nao altera o payload enviado ao Hermes. Ele apenas registra metricas.

Arquivo padrao de log:

```powershell
$env:LOCALAPPDATA\Lex\logs\mcp-payload-shadow.jsonl
```

Comando para observar:

```powershell
Get-Content "$env:LOCALAPPDATA\Lex\logs\mcp-payload-shadow.jsonl" -Tail 20
```

Variaveis uteis:

```powershell
$env:LEX_MCP_PAYLOAD_WARN_CHARS="8000"
$env:LEX_MCP_PAYLOAD_LOG_STDERR="1"
$env:LEX_MCP_PAYLOAD_SHADOW="0"
$env:LEX_MCP_PAYLOAD_LOG="C:\tmp\lex-mcp-payload.jsonl"
```

Significado:

- `LEX_MCP_PAYLOAD_WARN_CHARS`: limite para aviso no stderr.
- `LEX_MCP_PAYLOAD_LOG_STDERR`: mostra todas as medicoes no stderr.
- `LEX_MCP_PAYLOAD_SHADOW`: liga/desliga o medidor.
- `LEX_MCP_PAYLOAD_LOG`: muda o caminho do log JSONL.

## Validacoes Realizadas

Comandos executados com sucesso:

```powershell
node --check scripts/lex-desktop-mcp-server.mjs
npm run build
```

Resultado do build:

- TypeScript do Electron compilou.
- Assets foram copiados.
- Nenhum erro de build.

## Como Testar Manualmente

1. Reiniciar o Electron/Lex Desktop e o servidor MCP.
2. Abrir uma tela de consulta PJe.
3. Chamar `pje_inspecionar_contexto` sem `includeRaw`.
4. Verificar se retorna `compactMode: true` e `rawIncluded: false`.
5. Chamar `pje_preencher_numero` com `dryRun: true`.
6. Chamar `pje_clicar_consultar` com `dryRun: true`.
7. Chamar `pje_ler_resultados` apos a consulta.
8. Observar o log sombra:

```powershell
Get-Content "$env:LOCALAPPDATA\Lex\logs\mcp-payload-shadow.jsonl" -Tail 20
```

Se uma resposta vier com `confidence=low` ou `discoveryRecommended=true`, repetir somente essa chamada com:

```json
{
  "includeRaw": true
}
```

## O Que Nao Foi Feito Ainda

Nao foi implementado corte global automatico de payload.

Motivo: o PJe e instavel, e cortar bruto automaticamente pode esconder detalhes importantes como iframe inesperado, modal, aviso, tabela quebrada ou botao com label diferente.

A estrategia correta agora e observar dados reais primeiro. Depois, se algum campo aparecer consistentemente caro e seguro de reduzir, compactar esse ponto de forma especifica.

## Proximos Passos Recomendados

1. Rodar um fluxo PJe real com consulta de processo.
2. Coletar 10 a 30 linhas do `mcp-payload-shadow.jsonl`.
3. Identificar quais tools passam de 8k/12k caracteres.
4. Compactar apenas as fontes caras confirmadas.
5. Considerar um `debugId/rawRef` local no futuro, para salvar bruto em disco e mandar ao modelo apenas uma referencia.

