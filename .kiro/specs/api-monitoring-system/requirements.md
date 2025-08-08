# Requirements Document

## Introduction

Este documento define os requisitos para um sistema de monitoramento e logging que detecte proativamente problemas com a API da OpenAI, especialmente API keys revogadas/expiradas, e forneça alertas e diagnósticos claros para facilitar a manutenção da extensão LEX.

## Requirements

### Requirement 1

**User Story:** Como desenvolvedor da extensão LEX, eu quero ser notificado imediatamente quando a API key da OpenAI for revogada ou expirar, para que eu possa corrigi-la rapidamente sem impactar os usuários.

#### Acceptance Criteria

1. WHEN a requisição para OpenAI retorna erro 401 (Unauthorized) THEN o sistema SHALL registrar o erro específico nos logs
2. WHEN uma API key é detectada como inválida THEN o sistema SHALL enviar uma notificação/alerta
3. WHEN ocorrem 3 ou mais falhas consecutivas de API THEN o sistema SHALL classificar como "API key provavelmente revogada"
4. IF a resposta da OpenAI contém "invalid_api_key" THEN o sistema SHALL marcar como "API key definitivamente inválida"

### Requirement 2

**User Story:** Como desenvolvedor, eu quero ter logs detalhados de todas as interações com a API da OpenAI, para que eu possa diagnosticar problemas rapidamente e monitorar o uso.

#### Acceptance Criteria

1. WHEN uma requisição é enviada para OpenAI THEN o sistema SHALL registrar timestamp, modelo usado, e tamanho da requisição
2. WHEN uma resposta é recebida THEN o sistema SHALL registrar status code, tempo de resposta, e tokens utilizados
3. WHEN ocorre um erro THEN o sistema SHALL registrar o erro completo com stack trace
4. IF o log exceder 1000 entradas THEN o sistema SHALL fazer rotação automática dos logs

### Requirement 3

**User Story:** Como usuário da extensão, eu quero receber mensagens de erro claras e acionáveis quando algo der errado com a IA, para que eu saiba o que fazer.

#### Acceptance Criteria

1. WHEN a API key está inválida THEN o sistema SHALL mostrar mensagem "API key inválida - contate o administrador"
2. WHEN há problemas de conectividade THEN o sistema SHALL mostrar "Problema de conexão - tente novamente"
3. WHEN a API está temporariamente indisponível THEN o sistema SHALL mostrar "Serviço temporariamente indisponível"
4. IF o erro é desconhecido THEN o sistema SHALL mostrar código do erro e sugerir contatar suporte

### Requirement 4

**User Story:** Como administrador do sistema, eu quero ter um dashboard simples para monitorar a saúde da API e ver estatísticas de uso, para que eu possa tomar decisões proativas.

#### Acceptance Criteria

1. WHEN acesso o dashboard THEN o sistema SHALL mostrar status atual da API (funcionando/com problemas)
2. WHEN visualizo estatísticas THEN o sistema SHALL mostrar número de requisições nas últimas 24h
3. WHEN há erros recentes THEN o sistema SHALL destacar os tipos de erro mais frequentes
4. IF a API key expira em menos de 7 dias THEN o sistema SHALL mostrar aviso de expiração

### Requirement 5

**User Story:** Como desenvolvedor, eu quero ter alertas automáticos via email ou webhook quando problemas críticos ocorrerem, para que eu possa reagir rapidamente mesmo quando não estou monitorando ativamente.

#### Acceptance Criteria

1. WHEN a taxa de erro excede 50% em 10 minutos THEN o sistema SHALL enviar alerta crítico
2. WHEN a API key é detectada como inválida THEN o sistema SHALL enviar alerta imediato
3. WHEN não há requisições bem-sucedidas por mais de 1 hora THEN o sistema SHALL enviar alerta de possível problema
4. IF múltiplos alertas do mesmo tipo ocorrem THEN o sistema SHALL agrupar em um único alerta para evitar spam

### Requirement 6

**User Story:** Como desenvolvedor, eu quero ter ferramentas de diagnóstico automático que testem a conectividade e validade da API key, para que eu possa verificar rapidamente se tudo está funcionando.

#### Acceptance Criteria

1. WHEN executo teste de diagnóstico THEN o sistema SHALL testar conectividade com OpenAI
2. WHEN testo a API key THEN o sistema SHALL fazer uma requisição mínima para validar
3. WHEN verifico configuração THEN o sistema SHALL validar todas as environment variables necessárias
4. IF algum teste falha THEN o sistema SHALL fornecer instruções específicas para correção