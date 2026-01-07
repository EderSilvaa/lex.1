# Checklist de Pré-Lançamento (MVP Desktop)

Este documento reúne os pontos críticos para garantir um lançamento suave do Lex Desktop, cobrindo distribuição, monitoramento e experiência do usuário.

## 1. Distribuição e Instalação

### [ ] Hospedagem do Instalador
- [ ] Configurar repositório GitHub para releases.
- [ ] Testar link de download direto (ex: `github.com/.../Lex-Setup-latest.exe`).
- [ ] *(Opcional)* Criar link curto (bit.ly) para facilitar o compartilhamento.

### [ ] Experiência de Instalação ("SmartScreen")
Como não temos certificado EV (ainda), o Windows Defender vai alertar o usuário.
- [ ] Criar aviso na Landing Page ou logo abaixo do botão de download:
  > *"Se aparecer o aviso 'Windows protegeu seu PC', clique em 'Mais informações' e depois 'Executar mesmo assim'. Isso ocorre porque somos um software novo."*
- [ ] Testar a instalação em um PC "limpo" (sem Node.js/DevTools instalados).

### [ ] Auto-Updater
- [ ] Gerar versão `0.0.1`.
- [ ] Instalar em outro PC.
- [ ] Gerar versão `0.0.2`, publicar no GitHub.
- [ ] Abrir o app `0.0.1` e verificar se ele atualiza sozinho. **(CRÍTICO)**

## 2. Monitoramento e Telemetria

Diferente da web, se o app fechar na cara do usuário, você não fica sabendo.

### [ ] Rastreamento de Erros (Crash Reporting)
- [ ] Integrar **Sentry** ou similar (plano free serve).
- [ ] Capturar erros não tratados (`uncaughtException`, `unhandledRejection`).
- [ ] Capturar falhas de renderização (tela branca).

### [ ] Métricas de Uso (Analytics)
- [ ] Capturar evento "App Opened" (saber DAU - Daily Active Users).
- [ ] Identificar versão do App (saber se o auto-update está funcionando).
- [ ] Identificar Versão do Windows (ajuda a debugar problemas específicos).
- *Ferramentas Sugeridas*: PostHog (tem free tier generoso), Mixpanel, ou simples log no Supabase.

## 3. Marketing (Landing Page)

Deve ser um projeto separado (hospedagem Web normal).

### [ ] Página de Vendas
- [ ] Headline clara: "O Navegador Inteligente para Advogados".
- [ ] Botão de Download em destaque.
- [ ] Screenshots do app rodando (mostre o PJe com a sidebar do Lex).
- [ ] Requisitos Mínimos (Windows 10/11).

## 4. Segurança e Performance

### [ ] Configurações de Compilação
- [ ] Remover `console.log` com dados sensíveis de produção.
- [ ] Verificar se Chaves de API (Supabase/OpenAI) **NÃO** estão hardcoded no código client-side (usar Edge Functions sempre).

### [ ] Antivírus
- [ ] Submeter o `.exe` no [VirusTotal](https://www.virustotal.com/) para ver se algum antivírus está dando falso positivo.

## Resumo do Plano de Ação

1.  **Hoje**: Configurar Sentry (Erros) e Analytics básico.
2.  **Amanhã**: Testar fluxo de Auto-Update `v0.0.1` -> `v0.0.2`.
3.  **Fim de Semana**: Criar Landing Page simples (Carrd/Wix/Vercel).
4.  **Lançamento**: Publicar link e avisar usuários sobre o SmartScreen.
