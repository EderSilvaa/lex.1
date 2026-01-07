# Guia de Distribuição e Publicação (Electron)

Este guia explica como transformar o código fonte do Lex Desktop em um aplicativo instalável e como entregá-lo aos usuários.

## 1. Gerar o Instalador (Build)

Para criar o arquivo `.exe` (Windows):

```bash
npm run electron:build
```

O arquivo gerado estará na pasta `dist/` com um nome similar a `Lex Setup 1.0.0.exe`.

## 2. Hospedagem e Download

Diferente de um site, o app roda localmente. Você precisa apenas hospedar o **arquivo instalador**.

### Opção A: GitHub Releases (Recomendada para Início)
O `electron-builder` já vem configurado para usar o GitHub como servidor de atualizações.
1.  Crie um repositório público (ou privado com token de acesso) no GitHub.
2.  Configure o `package.json` (veja seção Configuração abaixo).
3.  Publique uma Draft Release no GitHub e faça upload do `.exe`.

### Opção B: AWS S3 / DigitalOcean Spaces
Armazenamento de objetos simples.
1.  Crie um bucket público.
2.  Suba o arquivo `.exe` e o arquivo `latest.yml` (gerado no build).
3.  O app lerá o `latest.yml` para saber se há atualizações.

## 3. Atualizações Automáticas (Auto-Update)

O Lex usa a biblioteca `electron-updater`. O fluxo é:

1.  Você corrige um bug e muda a versão no `package.json` (ex: `1.0.0` -> `1.0.1`).
2.  Gera um novo build (`npm run electron:build`).
3.  Sobe os novos arquivos (`.exe` e `latest.yml`) para o servidor (GitHub ou S3).
4.  Quando o usuário abrir o Lex antigo, ele baixa a atualização em background e instala no próximo reinício.

## 4. Code Signing (Assinatura Digital)

Para evitar alertas de segurança do Windows ("SmartScreen") ou macOS ("Gatekeeper"), o executável precisa ser assinado.

### Windows (EV Code Signing Certificate)
*   **Custo**: ~$300/ano.
*   **Fornecedores**: Sectigo, DigiCert.
*   **Sem certificado**: O usuário verá uma tela azul "Windows protegueu seu PC" e terá que clicar em "Mais informações -> Executar mesmo assim".

### Configuração no `package.json`

Para ativar a publicação no GitHub, adicione:

```json
"build": {
  "appId": "com.lex.desktop",
  "publish": [
    {
      "provider": "github",
      "owner": "SEU_USUARIO_GITHUB",
      "repo": "NOME_DO_REPO"
    }
  ],
  "win": {
    "target": "nsis",
    "icon": "build/icon.ico"
  }
}
```

## Resumo do Fluxo de Lançamento

1.  Desenvolver e Testar (`npm run electron:dev`).
2.  Atualizar versão (`npm version patch`).
3.  Buildar (`npm run electron:build`).
4.  Publicar (Upload do `.exe` para o GitHub Releases).
5.  Usuários recebem update automaticamente.
