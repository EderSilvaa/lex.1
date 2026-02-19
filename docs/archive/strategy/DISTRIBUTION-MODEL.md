# Lex Distribution Model

> Estratégia de distribuição: SaaS multi-tenant vs White Label dedicado.
> Mesmo core, diferentes embalagens.

---

## 1. Visão Geral

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                             │
│   MODELO DE DISTRIBUIÇÃO LEX                                               │
│                                                                             │
│   ┌─────────────────────────────┐    ┌─────────────────────────────┐       │
│   │          SaaS               │    │       WHITE LABEL           │       │
│   │    "Usa o Lex"              │    │    "Tem o próprio"          │       │
│   ├─────────────────────────────┤    ├─────────────────────────────┤       │
│   │                             │    │                             │       │
│   │  • Multi-tenant             │    │  • Aparência exclusiva      │       │
│   │  • Marca Lex visível        │    │  • Marca Lex invisível      │       │
│   │  • app.lex.com.br           │    │  • Domínio próprio          │       │
│   │  • Planos padronizados      │    │  • Contrato customizado     │       │
│   │  • Self-service             │    │  • Onboarding dedicado      │       │
│   │                             │    │                             │       │
│   │  R$ 297 - 1.497/mês         │    │  R$ 2.997+/mês              │       │
│   │                             │    │                             │       │
│   │  80% dos clientes           │    │  20% dos clientes           │       │
│   │  20% da receita             │    │  80% da receita             │       │
│   │                             │    │                             │       │
│   └─────────────────────────────┘    └─────────────────────────────┘       │
│                                                                             │
│   MESMO CORE. MESMA ENGINE. DIFERENÇA É SÓ EMBALAGEM.                      │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Matriz de Features: SaaS vs White Label

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                             │
│   CAMADA              │  SaaS              │  WHITE LABEL                   │
│   ════════════════════╪════════════════════╪════════════════════════════    │
│                       │                    │                                │
│   CORE                │                    │                                │
│   ────                │                    │                                │
│   Agent Loop          │  ✓ Incluso         │  ✓ Incluso                     │
│   Skills PJe          │  ✓ Incluso         │  ✓ Incluso                     │
│   Prompt-Layer        │  ✓ Incluso         │  ✓ Incluso                     │
│   Rules Engine        │  ✓ Incluso         │  ✓ Incluso                     │
│   AI Handler          │  ✓ Incluso         │  ✓ Incluso                     │
│                       │                    │                                │
│   ════════════════════╪════════════════════╪════════════════════════════    │
│                       │                    │                                │
│   PERSONALIZAÇÃO      │                    │                                │
│   ──────────────      │                    │                                │
│   Nome do agente      │  ✓ Configurável    │  ✓ Configurável                │
│   Tom/Estilo          │  ✓ Configurável    │  ✓ Configurável                │
│   Especialidade       │  ✓ Configurável    │  ✓ Configurável                │
│   Políticas           │  ◐ Plano Pro+      │  ✓ Configurável                │
│   Vocabulário         │  ◐ Plano Pro+      │  ✓ Configurável                │
│   Templates output    │  ◐ Plano Pro+      │  ✓ Configurável                │
│   Hooks customizados  │  ✗ Não disponível  │  ✓ Configurável                │
│                       │                    │                                │
│   ════════════════════╪════════════════════╪════════════════════════════    │
│                       │                    │                                │
│   BRANDING            │                    │                                │
│   ────────            │                    │                                │
│   Nome do produto     │  ✗ "Lex" (fixo)    │  ✓ Customizável                │
│   Logo                │  ✗ Logo Lex        │  ✓ Logo próprio                │
│   Favicon             │  ✗ Favicon Lex     │  ✓ Favicon próprio             │
│   Cores               │  ◐ Accent apenas   │  ✓ Paleta completa             │
│   Splash screen       │  ✗ Lex             │  ✓ Própria                     │
│   "Powered by"        │  ✓ Sempre visível  │  ✗ Removido                    │
│                       │                    │                                │
│   ════════════════════╪════════════════════╪════════════════════════════    │
│                       │                    │                                │
│   INFRAESTRUTURA      │                    │                                │
│   ──────────────      │                    │                                │
│   Domínio             │  ✗ *.lex.com.br    │  ✓ Domínio próprio             │
│   Subdomínio          │  ✓ silva.lex.com   │  ✓ Ou subdomínio próprio       │
│   Email remetente     │  ✗ @lex.com.br     │  ✓ @escritorio.com.br          │
│   SSL/Certificado     │  ✗ *.lex.com.br    │  ✓ Próprio ou gerenciado       │
│                       │                    │                                │
│   ════════════════════╪════════════════════╪════════════════════════════    │
│                       │                    │                                │
│   INTEGRAÇÕES         │                    │                                │
│   ───────────         │                    │                                │
│   PJe                 │  ✓ Incluso         │  ✓ Incluso                     │
│   WhatsApp            │  ◐ Plano Pro+      │  ✓ Incluso                     │
│   Email               │  ✓ Incluso         │  ✓ Incluso                     │
│   Webhook             │  ✗ Não disponível  │  ✓ Incluso                     │
│   API                 │  ◐ Plano Business  │  ✓ Incluso                     │
│                       │                    │                                │
│   ════════════════════╪════════════════════╪════════════════════════════    │
│                       │                    │                                │
│   SUPORTE             │                    │                                │
│   ───────             │                    │                                │
│   Onboarding          │  ✗ Self-service    │  ✓ Dedicado                    │
│   Suporte             │  ◐ Email/Chat      │  ✓ Dedicado + SLA              │
│   Treinamento         │  ✗ Docs online     │  ✓ Sessões ao vivo             │
│   Account manager     │  ✗ Não             │  ✓ Sim                         │
│   SLA                 │  ✗ Não             │  ✓ 99.5%+                      │
│                       │                    │                                │
│   ════════════════════╪════════════════════╪════════════════════════════    │
│                       │                    │                                │
│   CONTRATO            │                    │                                │
│   ────────            │                    │                                │
│   Modelo              │  Click-through     │  Contrato formal               │
│   Fidelidade          │  Mensal            │  Anual                         │
│   Customização legal  │  Não               │  Negociável                    │
│   NDA                 │  Padrão            │  Customizado                   │
│                       │                    │                                │
└─────────────────────────────────────────────────────────────────────────────┘

Legenda: ✓ Incluso/Sim  ✗ Não incluso  ◐ Parcial/Depende do plano
```

---

## 3. Estrutura Técnica

### 3.1 Tipos de Distribuição

```typescript
// core/config/distribution.ts

type DistributionMode = 'saas' | 'whitelabel';

interface DistributionConfig {
    mode: DistributionMode;
    tenant: string;

    // Branding varia conforme modo
    branding: SaaSBranding | WhiteLabelBranding;

    // Domínio
    domain: DomainConfig;

    // Limites de personalização
    customization: CustomizationLimits;

    // Plano/Licença
    plan: PlanConfig;
}
```

### 3.2 SaaS Branding (Limitado)

```typescript
// core/config/saas-branding.ts

interface SaaSBranding {
    mode: 'saas';

    // ═══════════════════════════════════════════════════════════════════
    // PODE MUDAR (via config)
    // ═══════════════════════════════════════════════════════════════════

    agentName: string;              // "Laura", "Duda", "Carlos"
    agentGender: 'female' | 'male' | 'neutral';
    accentColor: string;            // Cor de destaque apenas
    greeting: string;               // Saudação customizada

    // ═══════════════════════════════════════════════════════════════════
    // NÃO PODE MUDAR (sempre Lex)
    // ═══════════════════════════════════════════════════════════════════

    // productName: 'Lex'              // fixo, não exposto
    // logo: 'lex-logo.svg'            // fixo, não exposto
    // favicon: 'lex-favicon.ico'      // fixo, não exposto
    // poweredBy: true                 // sempre mostra
    // splashScreen: 'lex-splash'      // fixo
}

// Exemplo de config SaaS
const silvaConfig: SaaSBranding = {
    mode: 'saas',
    agentName: 'Laura',
    agentGender: 'female',
    accentColor: '#ed8936',
    greeting: 'Olá! Sou a Laura, assistente do Silva & Associados.'
};
```

### 3.3 White Label Branding (Completo)

```typescript
// core/config/whitelabel-branding.ts

interface WhiteLabelBranding {
    mode: 'whitelabel';

    // ═══════════════════════════════════════════════════════════════════
    // IDENTIDADE COMPLETA
    // ═══════════════════════════════════════════════════════════════════

    productName: string;            // "XYZ Legal AI", "JurisBot", etc.
    agentName: string;              // Nome do assistente
    agentGender: 'female' | 'male' | 'neutral';
    companyName: string;            // Nome do escritório/empresa
    tagline?: string;               // Slogan opcional

    // ═══════════════════════════════════════════════════════════════════
    // VISUAL COMPLETO
    // ═══════════════════════════════════════════════════════════════════

    logo: {
        light: string;              // Logo para fundo claro
        dark: string;               // Logo para fundo escuro
        icon: string;               // Ícone quadrado (favicon, app)
        horizontal?: string;        // Logo horizontal (header)
    };

    favicon: string;

    // Paleta completa
    colors: {
        primary: string;            // Cor principal
        primaryHover: string;       // Hover da cor principal
        secondary: string;          // Cor secundária
        accent: string;             // Cor de destaque

        background: string;         // Fundo geral
        surface: string;            // Fundo de cards
        surfaceHover: string;       // Hover de cards

        text: string;               // Texto principal
        textMuted: string;          // Texto secundário
        textInverse: string;        // Texto em fundo escuro

        border: string;             // Bordas
        divider: string;            // Divisores

        success: string;            // Sucesso
        warning: string;            // Alerta
        error: string;              // Erro
        info: string;               // Informação
    };

    // Tipografia
    fonts: {
        heading: string;            // Fonte de títulos
        body: string;               // Fonte de corpo
        mono: string;               // Fonte monospace
    };

    // ═══════════════════════════════════════════════════════════════════
    // SPLASH / LOADING
    // ═══════════════════════════════════════════════════════════════════

    splashScreen: {
        logo: string;
        tagline?: string;
        backgroundColor: string;
        textColor: string;
        spinnerColor: string;
    };

    // ═══════════════════════════════════════════════════════════════════
    // REMOÇÃO DE MENÇÕES AO LEX
    // ═══════════════════════════════════════════════════════════════════

    poweredBy: false;               // Nunca mostra "Powered by Lex"
    removeLexMentions: true;        // Remove TODAS as referências

    // Footer customizado
    footer: {
        copyright: string;          // "© 2026 XYZ Advocacia"
        links: Array<{
            label: string;
            url: string;
        }>;
    };
}

// Exemplo de config White Label
const xyzConfig: WhiteLabelBranding = {
    mode: 'whitelabel',

    productName: 'XYZ Legal AI',
    agentName: 'Alex',
    agentGender: 'male',
    companyName: 'Advocacia XYZ',
    tagline: 'Inteligência Jurídica Corporativa',

    logo: {
        light: '/assets/xyz-logo-dark.svg',
        dark: '/assets/xyz-logo-light.svg',
        icon: '/assets/xyz-icon.svg',
        horizontal: '/assets/xyz-logo-horizontal.svg'
    },

    favicon: '/assets/xyz-favicon.ico',

    colors: {
        primary: '#1a365d',
        primaryHover: '#2c5282',
        secondary: '#2b6cb0',
        accent: '#38a169',

        background: '#f7fafc',
        surface: '#ffffff',
        surfaceHover: '#edf2f7',

        text: '#1a202c',
        textMuted: '#718096',
        textInverse: '#ffffff',

        border: '#e2e8f0',
        divider: '#edf2f7',

        success: '#38a169',
        warning: '#d69e2e',
        error: '#e53e3e',
        info: '#3182ce'
    },

    fonts: {
        heading: 'Inter, sans-serif',
        body: 'Inter, sans-serif',
        mono: 'JetBrains Mono, monospace'
    },

    splashScreen: {
        logo: '/assets/xyz-splash.svg',
        tagline: 'Carregando...',
        backgroundColor: '#1a365d',
        textColor: '#ffffff',
        spinnerColor: '#38a169'
    },

    poweredBy: false,
    removeLexMentions: true,

    footer: {
        copyright: '© 2026 Advocacia XYZ. Todos os direitos reservados.',
        links: [
            { label: 'Termos de Uso', url: '/termos' },
            { label: 'Privacidade', url: '/privacidade' },
            { label: 'Suporte', url: '/suporte' }
        ]
    }
};
```

### 3.4 Configuração de Domínio

```typescript
// core/config/domain.ts

type DomainConfig = SaaSDomain | WhiteLabelDomain;

interface SaaSDomain {
    mode: 'saas';
    type: 'subdomain';

    // Padrão: {tenant}.lex.com.br
    subdomain: string;              // "silva", "xyz", "defensoria"
    baseDomain: 'lex.com.br';       // Fixo

    // Resultado: silva.lex.com.br
}

interface WhiteLabelDomain {
    mode: 'whitelabel';
    type: 'custom';

    // Domínio completo do cliente
    domain: string;                 // "legal.xyzadvocacia.com.br"

    // SSL
    ssl: {
        type: 'managed' | 'custom';
        // managed: Lex gerencia via Let's Encrypt
        // custom: Cliente fornece certificado

        certificate?: string;       // Se custom
        privateKey?: string;        // Se custom
    };

    // Configurações DNS necessárias
    dnsConfig: {
        cname: string;              // Para onde apontar
        txtVerification: string;    // TXT record para verificação
    };
}
```

### 3.5 Limites de Customização

```typescript
// core/config/customization-limits.ts

interface CustomizationLimits {
    // ═══════════════════════════════════════════════════════════════════
    // PROMPT-LAYER
    // ═══════════════════════════════════════════════════════════════════
    promptLayer: {
        identity: boolean;          // SaaS: ✓  WL: ✓
        behavior: boolean;          // SaaS: ✓  WL: ✓
        specialization: boolean;    // SaaS: ✓  WL: ✓
        policies: boolean;          // SaaS: ◐  WL: ✓
        glossary: boolean;          // SaaS: ◐  WL: ✓
        outputTemplates: boolean;   // SaaS: ◐  WL: ✓
        hooks: boolean;             // SaaS: ✗  WL: ✓
        customBlocks: boolean;      // SaaS: ✗  WL: ✓
    };

    // ═══════════════════════════════════════════════════════════════════
    // RULES ENGINE
    // ═══════════════════════════════════════════════════════════════════
    rulesEngine: {
        basicRules: boolean;        // SaaS: ✓  WL: ✓
        advancedRules: boolean;     // SaaS: ◐  WL: ✓
        customConditions: boolean;  // SaaS: ✗  WL: ✓
        customActions: boolean;     // SaaS: ✗  WL: ✓
    };

    // ═══════════════════════════════════════════════════════════════════
    // TEMPLATES
    // ═══════════════════════════════════════════════════════════════════
    templates: {
        outputFormats: boolean;     // SaaS: ✓  WL: ✓
        documentTemplates: number;  // SaaS: 5  WL: ilimitado (-1)
        emailTemplates: boolean;    // SaaS: ✗  WL: ✓
        uploadCustom: boolean;      // SaaS: ✗  WL: ✓
    };

    // ═══════════════════════════════════════════════════════════════════
    // INTEGRAÇÕES
    // ═══════════════════════════════════════════════════════════════════
    integrations: {
        pje: boolean;               // SaaS: ✓  WL: ✓
        whatsapp: boolean;          // SaaS: ◐  WL: ✓
        email: boolean;             // SaaS: ✓  WL: ✓
        webhook: boolean;           // SaaS: ✗  WL: ✓
        api: boolean;               // SaaS: ◐  WL: ✓
        customIntegrations: boolean;// SaaS: ✗  WL: ✓
    };

    // ═══════════════════════════════════════════════════════════════════
    // ANALYTICS
    // ═══════════════════════════════════════════════════════════════════
    analytics: {
        basic: boolean;             // SaaS: ✓  WL: ✓
        advanced: boolean;          // SaaS: ◐  WL: ✓
        export: boolean;            // SaaS: ✗  WL: ✓
        customDashboard: boolean;   // SaaS: ✗  WL: ✓
    };
}

// Config para SaaS Starter
const saasStarterLimits: CustomizationLimits = {
    promptLayer: {
        identity: true,
        behavior: true,
        specialization: true,
        policies: false,
        glossary: false,
        outputTemplates: false,
        hooks: false,
        customBlocks: false
    },
    rulesEngine: {
        basicRules: true,
        advancedRules: false,
        customConditions: false,
        customActions: false
    },
    templates: {
        outputFormats: true,
        documentTemplates: 5,
        emailTemplates: false,
        uploadCustom: false
    },
    integrations: {
        pje: true,
        whatsapp: false,
        email: true,
        webhook: false,
        api: false,
        customIntegrations: false
    },
    analytics: {
        basic: true,
        advanced: false,
        export: false,
        customDashboard: false
    }
};

// Config para White Label
const whiteLabelLimits: CustomizationLimits = {
    promptLayer: {
        identity: true,
        behavior: true,
        specialization: true,
        policies: true,
        glossary: true,
        outputTemplates: true,
        hooks: true,
        customBlocks: true
    },
    rulesEngine: {
        basicRules: true,
        advancedRules: true,
        customConditions: true,
        customActions: true
    },
    templates: {
        outputFormats: true,
        documentTemplates: -1, // ilimitado
        emailTemplates: true,
        uploadCustom: true
    },
    integrations: {
        pje: true,
        whatsapp: true,
        email: true,
        webhook: true,
        api: true,
        customIntegrations: true
    },
    analytics: {
        basic: true,
        advanced: true,
        export: true,
        customDashboard: true
    }
};
```

---

## 4. Planos e Pricing

### 4.1 Planos SaaS

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                             │
│   PLANOS SaaS                                                               │
│                                                                             │
│   ╔═══════════════════════════════════════════════════════════════════════╗│
│   ║   STARTER           PRO               BUSINESS                        ║│
│   ║   R$ 297/mês        R$ 697/mês        R$ 1.497/mês                    ║│
│   ╠═══════════════════════════════════════════════════════════════════════╣│
│   ║                                                                       ║│
│   ║   USUÁRIOS                                                            ║│
│   ║   ────────                                                            ║│
│   ║   2 usuários        10 usuários       25 usuários                     ║│
│   ║                                                                       ║│
│   ║   PROCESSOS MONITORADOS                                               ║│
│   ║   ─────────────────────                                               ║│
│   ║   50 processos      200 processos     500 processos                   ║│
│   ║                                                                       ║│
│   ║   DOCUMENTOS/MÊS                                                      ║│
│   ║   ──────────────                                                      ║│
│   ║   20 docs           100 docs          300 docs                        ║│
│   ║                                                                       ║│
│   ║   ÁREAS DE ATUAÇÃO                                                    ║│
│   ║   ────────────────                                                    ║│
│   ║   1 área            3 áreas           Todas                           ║│
│   ║                                                                       ║│
│   ║   PERSONALIZAÇÃO                                                      ║│
│   ║   ──────────────                                                      ║│
│   ║   ✓ Nome agente     ✓ Nome agente     ✓ Nome agente                   ║│
│   ║   ✓ Cor accent      ✓ Cor accent      ✓ Cor accent                    ║│
│   ║   ✓ Comportamento   ✓ Comportamento   ✓ Comportamento                 ║│
│   ║   ✗ Políticas       ✓ Políticas       ✓ Políticas                     ║│
│   ║   ✗ Vocabulário     ✓ Vocabulário     ✓ Vocabulário                   ║│
│   ║   ✗ Templates       ✓ Templates       ✓ Templates                     ║│
│   ║                                                                       ║│
│   ║   INTEGRAÇÕES                                                         ║│
│   ║   ───────────                                                         ║│
│   ║   ✓ PJe             ✓ PJe             ✓ PJe                           ║│
│   ║   ✓ Email           ✓ Email           ✓ Email                         ║│
│   ║   ✗ WhatsApp        ✓ WhatsApp        ✓ WhatsApp                      ║│
│   ║   ✗ API             ✗ API             ✓ API                           ║│
│   ║                                                                       ║│
│   ║   SUPORTE                                                             ║│
│   ║   ───────                                                             ║│
│   ║   Email             Email + Chat      Email + Chat + Prioridade       ║│
│   ║   (48h)             (24h)             (4h)                            ║│
│   ║                                                                       ║│
│   ╠═══════════════════════════════════════════════════════════════════════╣│
│   ║                                                                       ║│
│   ║   Todos os planos:                                                    ║│
│   ║   • Domínio: {tenant}.lex.com.br                                     ║│
│   ║   • Mostra "Powered by Lex"                                          ║│
│   ║   • Logo Lex                                                          ║│
│   ║   • Self-service (sem onboarding dedicado)                           ║│
│   ║   • Contrato mensal, cancela quando quiser                           ║│
│   ║                                                                       ║│
│   ╚═══════════════════════════════════════════════════════════════════════╝│
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 4.2 Planos White Label

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                             │
│   PLANOS WHITE LABEL                                                        │
│                                                                             │
│   ╔═══════════════════════════════════════════════════════════════════════╗│
│   ║   ENTERPRISE                        ENTERPRISE PLUS                   ║│
│   ║   R$ 2.997/mês                      R$ 5.997/mês                      ║│
│   ║   + Setup R$ 4.997                  + Setup R$ 9.997                  ║│
│   ║   (contrato anual)                  (contrato anual)                  ║│
│   ╠═══════════════════════════════════════════════════════════════════════╣│
│   ║                                                                       ║│
│   ║   USUÁRIOS                                                            ║│
│   ║   ────────                                                            ║│
│   ║   50 usuários                       Ilimitado                         ║│
│   ║                                                                       ║│
│   ║   PROCESSOS MONITORADOS                                               ║│
│   ║   ─────────────────────                                               ║│
│   ║   1.000 processos                   Ilimitado                         ║│
│   ║                                                                       ║│
│   ║   DOCUMENTOS/MÊS                                                      ║│
│   ║   ──────────────                                                      ║│
│   ║   500 docs                          Ilimitado                         ║│
│   ║                                                                       ║│
│   ║   ÁREAS DE ATUAÇÃO                                                    ║│
│   ║   ────────────────                                                    ║│
│   ║   Todas                             Todas                             ║│
│   ║                                                                       ║│
│   ║   BRANDING                                                            ║│
│   ║   ────────                                                            ║│
│   ║   ✓ Nome produto próprio            ✓ Nome produto próprio            ║│
│   ║   ✓ Logo próprio                    ✓ Logo próprio                    ║│
│   ║   ✓ Paleta completa                 ✓ Paleta completa                 ║│
│   ║   ✓ Domínio próprio                 ✓ Múltiplos domínios              ║│
│   ║   ✓ Remove "Lex"                    ✓ Remove "Lex"                    ║│
│   ║   ✓ Splash própria                  ✓ Splash própria                  ║│
│   ║   1 marca                           Múltiplas marcas                  ║│
│   ║                                                                       ║│
│   ║   PERSONALIZAÇÃO                                                      ║│
│   ║   ──────────────                                                      ║│
│   ║   ✓ Tudo do SaaS Business +         ✓ Tudo do Enterprise +            ║│
│   ║   ✓ Hooks customizados              ✓ Hooks customizados              ║│
│   ║   ✓ Rules avançadas                 ✓ Rules avançadas                 ║│
│   ║   ✓ Templates ilimitados            ✓ Templates ilimitados            ║│
│   ║                                                                       ║│
│   ║   INTEGRAÇÕES                                                         ║│
│   ║   ───────────                                                         ║│
│   ║   ✓ Todas do SaaS +                 ✓ Todas do Enterprise +           ║│
│   ║   ✓ Webhook                         ✓ Webhook                         ║│
│   ║   ✓ API (10k req/mês)               ✓ API ilimitada                   ║│
│   ║   ✗ Integrações custom              ✓ Integrações custom              ║│
│   ║                                                                       ║│
│   ║   SUPORTE                                                             ║│
│   ║   ───────                                                             ║│
│   ║   ✓ Onboarding dedicado             ✓ Onboarding dedicado             ║│
│   ║   ✓ Account manager                 ✓ Customer Success dedicado       ║│
│   ║   ✓ Suporte prioritário (2h)        ✓ Suporte 24/7 (30min)            ║│
│   ║   ✓ Treinamento (2 sessões)         ✓ Treinamento ilimitado           ║│
│   ║   ✓ SLA 99.5%                       ✓ SLA 99.9%                       ║│
│   ║                                                                       ║│
│   ║   CONTRATO                                                            ║│
│   ║   ────────                                                            ║│
│   ║   Anual                             Anual                             ║│
│   ║   NDA customizado                   NDA customizado                   ║│
│   ║   ✗ Revenda                         ✓ Direito de revenda              ║│
│   ║                                                                       ║│
│   ╚═══════════════════════════════════════════════════════════════════════╝│
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 4.3 Tabela de Preços Consolidada

```typescript
// core/plans/pricing.ts

interface Plan {
    id: string;
    name: string;
    mode: 'saas' | 'whitelabel';

    pricing: {
        monthly: number;            // R$/mês
        annual: number;             // R$/mês (pagamento anual)
        setup: number;              // Taxa única de setup
    };

    limits: {
        users: number;              // -1 = ilimitado
        processes: number;
        documentsPerMonth: number;
        aiTokensPerMonth: number;
        apiRequestsPerMonth: number;
        areas: number;              // -1 = todas
    };

    features: CustomizationLimits;

    support: {
        channels: ('email' | 'chat' | 'phone' | 'dedicated')[];
        responseTime: string;       // "48h", "24h", "4h", "2h", "30min"
        sla: number | null;         // 99.5, 99.9, null
        onboarding: 'self' | 'assisted' | 'dedicated';
        training: 'docs' | 'webinar' | 'custom';
    };
}

const PLANS: Plan[] = [
    // SaaS Plans
    {
        id: 'saas-starter',
        name: 'Starter',
        mode: 'saas',
        pricing: {
            monthly: 297,
            annual: 247,        // ~17% desconto
            setup: 0
        },
        limits: {
            users: 2,
            processes: 50,
            documentsPerMonth: 20,
            aiTokensPerMonth: 100000,
            apiRequestsPerMonth: 0,
            areas: 1
        },
        features: saasStarterLimits,
        support: {
            channels: ['email'],
            responseTime: '48h',
            sla: null,
            onboarding: 'self',
            training: 'docs'
        }
    },
    {
        id: 'saas-pro',
        name: 'Pro',
        mode: 'saas',
        pricing: {
            monthly: 697,
            annual: 577,
            setup: 0
        },
        limits: {
            users: 10,
            processes: 200,
            documentsPerMonth: 100,
            aiTokensPerMonth: 300000,
            apiRequestsPerMonth: 0,
            areas: 3
        },
        features: saasProLimits,
        support: {
            channels: ['email', 'chat'],
            responseTime: '24h',
            sla: null,
            onboarding: 'self',
            training: 'docs'
        }
    },
    {
        id: 'saas-business',
        name: 'Business',
        mode: 'saas',
        pricing: {
            monthly: 1497,
            annual: 1247,
            setup: 0
        },
        limits: {
            users: 25,
            processes: 500,
            documentsPerMonth: 300,
            aiTokensPerMonth: 500000,
            apiRequestsPerMonth: 5000,
            areas: -1
        },
        features: saasBusinessLimits,
        support: {
            channels: ['email', 'chat'],
            responseTime: '4h',
            sla: null,
            onboarding: 'assisted',
            training: 'webinar'
        }
    },

    // White Label Plans
    {
        id: 'whitelabel-enterprise',
        name: 'Enterprise',
        mode: 'whitelabel',
        pricing: {
            monthly: 2997,
            annual: 2497,
            setup: 4997
        },
        limits: {
            users: 50,
            processes: 1000,
            documentsPerMonth: 500,
            aiTokensPerMonth: 1000000,
            apiRequestsPerMonth: 10000,
            areas: -1
        },
        features: whiteLabelLimits,
        support: {
            channels: ['email', 'chat', 'phone', 'dedicated'],
            responseTime: '2h',
            sla: 99.5,
            onboarding: 'dedicated',
            training: 'custom'
        }
    },
    {
        id: 'whitelabel-enterprise-plus',
        name: 'Enterprise Plus',
        mode: 'whitelabel',
        pricing: {
            monthly: 5997,
            annual: 4997,
            setup: 9997
        },
        limits: {
            users: -1,
            processes: -1,
            documentsPerMonth: -1,
            aiTokensPerMonth: -1,
            apiRequestsPerMonth: -1,
            areas: -1
        },
        features: whiteLabelPlusLimits,
        support: {
            channels: ['email', 'chat', 'phone', 'dedicated'],
            responseTime: '30min',
            sla: 99.9,
            onboarding: 'dedicated',
            training: 'custom'
        }
    }
];
```

---

## 5. Exemplos Visuais

### 5.1 SaaS: Silva & Associados (Pro)

```
┌─────────────────────────────────────────────────────────────────┐
│  🏛️ Lex                                    silva.lex.com.br    │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  👩‍💼 Laura                                              │   │
│  │                                                         │   │
│  │  Olá! Sou a Laura, assistente do Silva & Associados.   │   │
│  │  Como posso ajudar você hoje?                          │   │
│  │                                                         │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  💬 Digite sua mensagem...                              │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ─────────────────────────────────────────────────────────────  │
│  Powered by Lex | Termos | Privacidade              [Pro Plan] │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘

CARACTERÍSTICAS:
• Logo Lex no header
• Domínio: silva.lex.com.br
• "Powered by Lex" no footer
• Agente: Laura (nome customizado)
• Cor accent: laranja (customizada)
• Comportamento/Tom: configurado via Prompt-Layer
```

### 5.2 White Label: Advocacia XYZ (Enterprise)

```
┌─────────────────────────────────────────────────────────────────┐
│  [XYZ LOGO]  XYZ Legal AI          legal.xyzadvocacia.com.br   │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  🤖 Alex                                                │   │
│  │                                                         │   │
│  │  Bom dia. Sou Alex, assistente jurídico da XYZ         │   │
│  │  Advocacia. Em que posso auxiliar?                     │   │
│  │                                                         │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  💬 Digite sua mensagem...                              │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ─────────────────────────────────────────────────────────────  │
│  © 2026 Advocacia XYZ | Termos | Privacidade | Suporte         │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘

CARACTERÍSTICAS:
• Logo XYZ (próprio)
• Nome do produto: "XYZ Legal AI"
• Domínio: legal.xyzadvocacia.com.br
• NENHUMA menção ao Lex
• Footer customizado
• Paleta de cores completa (azul/verde)
• Agente: Alex
```

---

## 6. Fluxo de Build e Deploy

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                             │
│   PIPELINE DE BUILD                                                         │
│                                                                             │
│   ┌─────────────────────────────────────────────────────────────────────┐  │
│   │                           CORE                                       │  │
│   │                     (repositório único)                              │  │
│   │                                                                      │  │
│   │   • Agent Loop          • Skills           • Prompt-Layer           │  │
│   │   • Rules Engine        • AI Handler       • UI Components          │  │
│   │                                                                      │  │
│   └─────────────────────────────────────────────────────────────────────┘  │
│                                    │                                        │
│                    ┌───────────────┴───────────────┐                       │
│                    │                               │                       │
│                    ▼                               ▼                       │
│   ┌─────────────────────────────┐   ┌─────────────────────────────┐       │
│   │        SaaS BUILD           │   │     WHITE LABEL BUILD       │       │
│   ├─────────────────────────────┤   ├─────────────────────────────┤       │
│   │                             │   │                             │       │
│   │  npm run build:saas         │   │  npm run build:whitelabel   │       │
│   │                             │   │  --tenant=xyz               │       │
│   │  • Branding Lex embutido    │   │                             │       │
│   │  • Config carregada em      │   │  • Branding injetado em     │       │
│   │    runtime (API)            │   │    build-time               │       │
│   │  • Multi-tenant             │   │  • Config embutida          │       │
│   │  • Um artefato              │   │  • Single-tenant            │       │
│   │                             │   │  • Artefato por cliente     │       │
│   └─────────────────────────────┘   └─────────────────────────────┘       │
│                    │                               │                       │
│                    ▼                               ▼                       │
│   ┌─────────────────────────────┐   ┌─────────────────────────────┐       │
│   │        DEPLOY SaaS          │   │    DEPLOY WHITE LABEL       │       │
│   ├─────────────────────────────┤   ├─────────────────────────────┤       │
│   │                             │   │                             │       │
│   │  • 1 instância              │   │  • 1 instância por cliente  │       │
│   │  • Tenant via subdomain     │   │  • Domínio customizado      │       │
│   │  • Config via API           │   │  • Config embutida          │       │
│   │                             │   │                             │       │
│   │  app.lex.com.br             │   │  legal.xyzadvocacia.com.br  │       │
│   │  ├── silva.lex.com.br       │   │  app.outroescritorio.com    │       │
│   │  ├── xyz.lex.com.br         │   │  ...                        │       │
│   │  └── defensoria.lex.com.br  │   │                             │       │
│   │                             │   │                             │       │
│   └─────────────────────────────┘   └─────────────────────────────┘       │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 6.1 Scripts de Build

```json
// package.json

{
    "scripts": {
        "build": "npm run build:saas",

        "build:saas": "vite build --mode saas",

        "build:whitelabel": "node scripts/build-whitelabel.js",

        "build:whitelabel:xyz": "npm run build:whitelabel -- --tenant=xyz",
        "build:whitelabel:outro": "npm run build:whitelabel -- --tenant=outro"
    }
}
```

```typescript
// scripts/build-whitelabel.js

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const tenant = process.argv.find(a => a.startsWith('--tenant='))?.split('=')[1];

if (!tenant) {
    console.error('Uso: npm run build:whitelabel -- --tenant=<tenant-id>');
    process.exit(1);
}

// Carrega config do tenant
const configPath = path.join(__dirname, '../config/tenants', `${tenant}.json`);
const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));

// Injeta variáveis de ambiente
process.env.VITE_TENANT_ID = tenant;
process.env.VITE_DISTRIBUTION_MODE = 'whitelabel';
process.env.VITE_PRODUCT_NAME = config.branding.productName;
process.env.VITE_AGENT_NAME = config.branding.agentName;
// ... outras variáveis

// Roda build
execSync('vite build --mode whitelabel', { stdio: 'inherit' });

// Copia assets customizados
const assetsDir = path.join(__dirname, '../config/tenants', tenant, 'assets');
if (fs.existsSync(assetsDir)) {
    fs.cpSync(assetsDir, path.join(__dirname, '../dist/assets'), { recursive: true });
}

console.log(`✅ Build completo para tenant: ${tenant}`);
```

---

## 7. Matriz de Decisão: Quando Oferecer Cada Um

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                             │
│   QUANDO OFERECER CADA MODELO                                              │
│                                                                             │
│   PERFIL DO CLIENTE               │  RECOMENDAÇÃO                          │
│   ────────────────────────────────┼──────────────────────────────────────   │
│                                   │                                        │
│   Advogado autônomo               │  SaaS Starter                          │
│   1-2 pessoas                     │  • Custo baixo                         │
│   Orçamento limitado              │  • Self-service                        │
│   Não liga para marca             │  • Começa rápido                       │
│                                   │                                        │
│   ──────────────────────────────────────────────────────────────────────   │
│                                   │                                        │
│   Escritório pequeno/médio        │  SaaS Pro                              │
│   3-10 pessoas                    │  • Mais features                       │
│   Quer personalização             │  • Prompt-Layer completo               │
│   Aceita marca Lex                │  • WhatsApp incluso                    │
│                                   │                                        │
│   ──────────────────────────────────────────────────────────────────────   │
│                                   │                                        │
│   Escritório médio/grande         │  SaaS Business                         │
│   10-25 pessoas                   │  • API disponível                      │
│   Precisa de API                  │  • Suporte prioritário                 │
│   Volume maior                    │  • Mais limites                        │
│                                   │                                        │
│   ──────────────────────────────────────────────────────────────────────   │
│                                   │                                        │
│   Escritório grande               │  White Label Enterprise                │
│   25-50 pessoas                   │  • Marca própria                       │
│   QUER marca própria              │  • Domínio próprio                     │
│   Budget disponível               │  • Onboarding dedicado                 │
│   Imagem é importante             │  • SLA garantido                       │
│                                   │                                        │
│   ──────────────────────────────────────────────────────────────────────   │
│                                   │                                        │
│   Rede de escritórios             │  White Label Enterprise Plus           │
│   Franquia jurídica               │  • Múltiplas marcas                    │
│   50+ pessoas                     │  • Ilimitado                           │
│   Departamento jurídico           │  • Customer Success                    │
│   Quer revender                   │  • Pode sublicenciar                   │
│                                   │                                        │
│   ──────────────────────────────────────────────────────────────────────   │
│                                   │                                        │
│   LegalTech / Startup             │  Contrato especial                     │
│   Quer integrar no produto        │  • API dedicada                        │
│   deles                           │  • Revenue share                       │
│                                   │  • Co-branding possível                │
│                                   │                                        │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 8. Projeção de Receita

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                             │
│   PROJEÇÃO 12 MESES                                                         │
│                                                                             │
│   ╔═══════════════════════════════════════════════════════════════════════╗│
│   ║                                                                       ║│
│   ║   MÊS 1-3: LANÇAMENTO                                                ║│
│   ║   ───────────────────────                                             ║│
│   ║                                                                       ║│
│   ║   SaaS Starter:    15 × R$ 297  =  R$  4.455                         ║│
│   ║   SaaS Pro:         5 × R$ 697  =  R$  3.485                         ║│
│   ║   SaaS Business:    1 × R$ 1.497 = R$  1.497                         ║│
│   ║   White Label:      0                                                 ║│
│   ║                                                                       ║│
│   ║   MRR: R$ 9.437                                                      ║│
│   ║                                                                       ║│
│   ╠═══════════════════════════════════════════════════════════════════════╣│
│   ║                                                                       ║│
│   ║   MÊS 4-6: CRESCIMENTO                                               ║│
│   ║   ────────────────────────                                            ║│
│   ║                                                                       ║│
│   ║   SaaS Starter:    40 × R$ 297  =  R$ 11.880                         ║│
│   ║   SaaS Pro:        15 × R$ 697  =  R$ 10.455                         ║│
│   ║   SaaS Business:    5 × R$ 1.497 = R$  7.485                         ║│
│   ║   WL Enterprise:    2 × R$ 2.997 = R$  5.994                         ║│
│   ║   Setup WL:         2 × R$ 4.997 = R$  9.994 (one-time)              ║│
│   ║                                                                       ║│
│   ║   MRR: R$ 35.814                                                     ║│
│   ║                                                                       ║│
│   ╠═══════════════════════════════════════════════════════════════════════╣│
│   ║                                                                       ║│
│   ║   MÊS 7-12: ESCALA                                                   ║│
│   ║   ────────────────────                                                ║│
│   ║                                                                       ║│
│   ║   SaaS Starter:   100 × R$ 297  =  R$ 29.700                         ║│
│   ║   SaaS Pro:        40 × R$ 697  =  R$ 27.880                         ║│
│   ║   SaaS Business:   15 × R$ 1.497 = R$ 22.455                         ║│
│   ║   WL Enterprise:    8 × R$ 2.997 = R$ 23.976                         ║│
│   ║   WL Ent. Plus:     2 × R$ 5.997 = R$ 11.994                         ║│
│   ║                                                                       ║│
│   ║   MRR: R$ 116.005                                                    ║│
│   ║                                                                       ║│
│   ╠═══════════════════════════════════════════════════════════════════════╣│
│   ║                                                                       ║│
│   ║   RESUMO ANO 1                                                        ║│
│   ║   ────────────                                                        ║│
│   ║                                                                       ║│
│   ║   Clientes SaaS:        155 (80%)                                    ║│
│   ║   Clientes White Label:  10 (20%)                                    ║│
│   ║                                                                       ║│
│   ║   Receita SaaS:         ~R$ 480.000 (35%)                            ║│
│   ║   Receita White Label:  ~R$ 420.000 (30%)                            ║│
│   ║   Setup fees:           ~R$ 100.000 (7%)                             ║│
│   ║   Excedentes/Consumo:   ~R$ 100.000 (7%)                             ║│
│   ║   Serviços adicionais:  ~R$ 100.000 (7%)                             ║│
│   ║                                                                       ║│
│   ║   ARR Final: ~R$ 1.400.000                                           ║│
│   ║                                                                       ║│
│   ╚═══════════════════════════════════════════════════════════════════════╝│
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘

Observação: White Label representa 20% dos clientes mas ~50% da receita recorrente.
Isso é típico de modelos B2B - poucos clientes grandes, muitos clientes pequenos.
```

---

## 9. Resumo Executivo

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                             │
│   DISTRIBUIÇÃO LEX                                                          │
│   ════════════════                                                          │
│                                                                             │
│   ┌─────────────────────────────────────────────────────────────────────┐  │
│   │                           CORE                                       │  │
│   │                      (único, imutável)                               │  │
│   └─────────────────────────────────────────────────────────────────────┘  │
│                                    │                                        │
│          ┌─────────────────────────┴─────────────────────────┐             │
│          │                                                   │             │
│          ▼                                                   ▼             │
│   ┌─────────────────────────┐               ┌─────────────────────────┐   │
│   │         SaaS            │               │      WHITE LABEL        │   │
│   │   "Usa o Lex"           │               │    "Tem o próprio"      │   │
│   ├─────────────────────────┤               ├─────────────────────────┤   │
│   │                         │               │                         │   │
│   │  ✓ Prompt-Layer         │               │  ✓ Tudo do SaaS +       │   │
│   │  ✓ Nome do agente       │               │  ✓ Nome do PRODUTO      │   │
│   │  ✓ Comportamento        │               │  ✓ Logo próprio         │   │
│   │  ◐ Cor accent           │               │  ✓ Domínio próprio      │   │
│   │                         │               │  ✓ Paleta completa      │   │
│   │  ✗ Logo próprio         │               │  ✓ Remove "Lex"         │   │
│   │  ✗ Domínio próprio      │               │  ✓ Deploy dedicado      │   │
│   │  ✗ Remove "Lex"         │               │                         │   │
│   │                         │               │                         │   │
│   │  R$ 297-1.497/mês       │               │  R$ 2.997-5.997/mês     │   │
│   │  80% clientes           │               │  20% clientes           │   │
│   │  35% receita            │               │  50% receita            │   │
│   │                         │               │                         │   │
│   └─────────────────────────┘               └─────────────────────────┘   │
│                                                                             │
│   ═══════════════════════════════════════════════════════════════════════  │
│                                                                             │
│   PRINCÍPIOS:                                                               │
│                                                                             │
│   1. MESMO CORE → Zero dívida técnica                                      │
│   2. DIFERENÇA É EMBALAGEM → Config/branding, não código                   │
│   3. SaaS PARA VOLUME → Muitos clientes pequenos                           │
│   4. WHITE LABEL PARA RECEITA → Poucos clientes grandes                    │
│   5. PERSONALIZAÇÃO VIA PROMPT-LAYER → Não via código                      │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

*Documento criado em: Janeiro 2026*
*Versão: 1.0*
