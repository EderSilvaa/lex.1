# LEX Extension - Migração para TypeScript

## 📋 Passo a Passo Completo

### 1. Instalar Dependências

```bash
npm install
```

### 2. Compilar TypeScript

```bash
# Build único
npm run build

# Build com watch (recompila automaticamente)
npm run build:watch

# Build de produção (com minificação)
npm run build:prod
```

### 3. Estrutura do Projeto

```
├── src/
│   ├── ts/           # Arquivos TypeScript
│   ├── js/           # Arquivos JavaScript originais (manter por enquanto)
│   └── html/         # Arquivos HTML
├── dist/             # Arquivos compilados (gerado automaticamente)
├── types/            # Definições de tipos TypeScript
├── tsconfig.json     # Configuração TypeScript
├── .eslintrc.json    # Configuração ESLint
└── package.json      # Dependências e scripts
```

### 4. Processo de Migração

#### Fase 1: Configuração ✅
- [x] Configurar TypeScript
- [x] Configurar ESLint
- [x] Criar tipos personalizados
- [x] Configurar build system

#### Fase 2: Conversão de Arquivos
- [x] `pdf-processor.js` → `pdf-processor.ts` (parcial)
- [ ] `openai-client.js` → `openai-client.ts`
- [ ] `document-detector.js` → `document-detector.ts`
- [ ] `content-simple.js` → `content-simple.ts`
- [ ] `background.js` → `background.ts`

#### Fase 3: Testes e Validação
- [ ] Testar funcionalidade completa
- [ ] Validar tipos
- [ ] Otimizar performance
- [ ] Documentar mudanças

### 5. Scripts Disponíveis

```bash
# Desenvolvimento
npm run dev          # Build + watch + servidor local
npm run build:watch  # Compilação contínua

# Produção
npm run build        # Build único
npm run build:prod   # Build otimizado

# Qualidade de código
npm run type-check   # Verificar tipos sem compilar
npm run lint         # Verificar código com ESLint

# Utilitários
npm run clean        # Limpar pasta dist
npm run serve        # Servidor local para testes
```

### 6. Benefícios da Migração

#### ✅ Já Implementado
- **Type Safety**: Detecção de erros em tempo de compilação
- **IntelliSense**: Autocompletar e documentação inline
- **Refactoring**: Renomeação segura de variáveis/métodos
- **Documentação**: Tipos servem como documentação viva

#### 🔄 Em Progresso
- **Modularização**: Sistema de imports/exports
- **Tree Shaking**: Remoção de código não utilizado
- **Source Maps**: Debug mais fácil

### 7. Exemplo de Uso

```typescript
import { PDFProcessor } from './pdf-processor';

const processor = new PDFProcessor();

// TypeScript garante que os tipos estão corretos
const result: PDFExtractionResult = await processor.extractTextFromPDF(
  pdfBlob, 
  {
    includeMetadata: true,
    maxPages: 10
  }
);

// Autocompletar funciona perfeitamente
console.log(result.stats.totalCharacters);
```

### 8. Próximos Passos

1. **Converter mais arquivos**: Migrar `openai-client.js` para TypeScript
2. **Implementar testes**: Adicionar testes unitários com Jest
3. **Otimizar build**: Configurar webpack para bundle otimizado
4. **CI/CD**: Configurar pipeline de build automático

### 9. Comandos Úteis

```bash
# Verificar se há erros de tipo
npm run type-check

# Compilar e testar
npm run build && node build.js

# Desenvolvimento com hot reload
npm run dev
```

### 10. Troubleshooting

#### Erro: "Cannot find module"
```bash
npm install
npm run build
```

#### Erro de tipos
```bash
npm run type-check
# Verificar arquivos .d.ts em /types/
```

#### Build falha
```bash
npm run clean
npm run build
```

## 🎯 Status Atual

- ✅ **Configuração**: TypeScript, ESLint, build system
- ✅ **Tipos**: Definições personalizadas para LEX
- 🔄 **Conversão**: PDFProcessor parcialmente convertido
- ⏳ **Pendente**: Outros arquivos JavaScript

A base está pronta! Agora é só continuar convertendo os arquivos um por um.