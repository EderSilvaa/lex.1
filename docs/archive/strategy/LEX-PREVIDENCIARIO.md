# Lex Previdenciário
> Estratégia e visão do agente Lex aplicado ao Direito Previdenciário brasileiro.

---

## 1. Por que Previdenciário primeiro

O Direito Previdenciário é a especialização com maior volume de advogados e maior burocracia no Brasil. É o mercado mais estratégico após o PJe por três razões:

```
VOLUME
  Maior número de advogados especializados do país
  Demanda constante e crescente (população envelhecendo)
  Ticket médio alto: honorários sobre retroativo

BUROCRACIA
  Dois sistemas simultâneos: INSS administrativo + PJe judicial
  Cálculos complexos e sujeitos a erro humano
  Legislação que muda com frequência (EC 103/2019, IN INSS)

OPORTUNIDADE
  Ferramentas atuais são genéricas, sem inteligência de domínio
  INSS comete erros sistemáticos que advogados não identificam
  Retroativos grandes = alto valor por caso
```

---

## 2. Sistemas envolvidos

| Sistema | Função | Acesso |
|---|---|---|
| Meu INSS (gov.br) | Consulta de benefícios, protocolos, recursos | Login OAB ou certificado |
| CNIS | Histórico de contribuições do segurado | Via Meu INSS |
| SIABI | Benefícios por incapacidade, perícias | Via INSS interno |
| PJe / eProc / ESAJ | Ações judiciais previdenciárias | Certificado digital |
| INFBEN | Consulta de benefícios ativos | Via INSS |

---

## 3. Capacidades do Agent Previdenciário

### 3.1 Análise de CNIS — o diferencial imediato

O CNIS (Cadastro Nacional de Informações Sociais) é o histórico completo de contribuições do segurado. O INSS comete erros sistemáticos na leitura dele. O agent lê e cruza automaticamente:

```
Agent analisa CNIS e identifica:
  ✓ Vínculos empregatícios não computados
  ✓ Períodos de trabalho especial (insalubre/perigoso) não convertidos
  ✓ Contribuições como autônomo/MEI ignoradas
  ✓ Períodos de benefício que contam como carência (auxílio-doença, salário-maternidade)
  ✓ Lacunas que podem ser preenchidas com ação judicial
  ✓ Recolhimentos em atraso computáveis
```

**Impacto:** O que um advogado faz em 2-3 horas olhando linha por linha, o agent faz em segundos com mais precisão.

---

### 3.2 Calculadora de DIB — dinheiro na mesa

A DIB (Data de Início do Benefício) define o ponto de partida do retroativo. Um mês de diferença pode significar R$ 5.000 a mais ou a menos.

```
Agent calcula automaticamente:
  → Data em que o cliente adquiriu o direito ao benefício
  → Prescrição quinquenal: quanto perde por cada mês sem agir
  → Melhor estratégia: DIB administrativa vs DIB judicial
  → Simulação de valor retroativo total

Saída para o advogado:
  "Se entrar com ação hoje: retroativo de R$ 47.200
   Se esperar 6 meses: perde R$ 7.800 por prescrição quinquenal"
```

**Impacto comercial:** Argumento objetivo de urgência para o cliente fechar contrato.

---

### 3.3 Motor de Teses — jurisprudência aplicada ao caso

O agent cruza o perfil do cliente com as principais teses favoráveis ativas nos tribunais:

| Situação | Tese aplicável | Fundamento |
|---|---|---|
| Trabalho em ruído acima de 85dB antes de 1997 | Reconhecimento de especial sem PPP | STJ REsp repetitivo |
| Auxílio-doença negado com CID documentado | Laudo pericial vs CID | TNU |
| Aposentadoria negada por carência com período rural | Tempo rural sem contribuição | STF RE 505.902 |
| Contribuições como diarista não computadas | Vínculo de emprego doméstico | TRF |
| Trabalho especial em frigorífico | Agentes biológicos e frio | TNU |
| Pensão por morte cônjuge sem dependência econômica | Presunção de dependência | STJ |

O agent não só identifica a tese — adapta a argumentação ao caso concreto e cita o precedente mais recente favorável.

---

### 3.4 Planejamento Previdenciário Preditivo

Para clientes que ainda não se aposentaram, o agent modela cenários:

```
"Quando João vai poder se aposentar com o melhor benefício?"

Agent calcula todas as regras de transição (EC 103/2019):
  → Regra de pontos: quando atinge, valor estimado
  → Regra de idade progressiva: data e valor
  → Regra de pedágio 100%: se aplicável, quando
  → Aposentadoria especial: se tem atividade que qualifica

Resultado:
  "Pela regra de pontos: março/2027 → R$ 4.200/mês
   Pela regra de idade: setembro/2028 → R$ 4.850/mês
   Diferença de 18 meses de espera: +R$ 650/mês vitalício
   Ponto de equilíbrio: 87 meses (7,2 anos)"
```

---

### 3.5 Monitoramento Dual — INSS + PJe simultâneo

O previdenciário é o único ramo onde o mesmo caso existe em dois sistemas ao mesmo tempo. O agent monitora os dois e cruza as informações:

```
Cenário 1 — INSS defere durante ação judicial:
  Agent detecta: NB deferido administrativamente
  Agent alerta: "Dr. Silva, INSS deferiu o benefício do João Silva.
                 Quer encerrar a ação ou pedir diferenças retroativas?
                 A ação pode ter rendido DIB melhor que o INSS concedeu."

Cenário 2 — INSS não cumpre decisão judicial:
  Agent monitora prazo de 30 dias para implementação
  Se não cumpriu: "Prazo esgotou. Preparo pedido de multa
                   por descumprimento de ordem judicial?"

Cenário 3 — Perícia médica agendada:
  Agent lê agenda no SIABI
  Alert antecipado: "Perícia do João Silva em 15 dias.
                     Recomendo reunião preparatória com cliente."
```

---

### 3.6 Triagem Inteligente de Novos Clientes

O agent pode analisar um caso antes da consulta, com apenas o CPF do cliente:

```
Fluxo:
  1. Recepção coleta CPF do novo cliente
  2. Agent acessa Meu INSS + CNIS (com procuração)
  3. Em 2-3 minutos gera parecer preliminar:

     "Caso: João Silva — Aposentadoria negada por carência
      Situação: 141 contribuições computadas pelo INSS
      Problema identificado: 14 meses de vínculo em 2009 não aparecem
      Com os 14 meses: atinge carência mínima
      Probabilidade de êxito: Alta
      Retroativo estimado: R$ 62.000
      Honorários estimados: R$ 6.200 — R$ 12.400"

  4. Advogado entra na consulta já com os números
  5. Fecha contrato na hora
```

**Impacto:** Transforma a consulta inicial de exploratória em negociação com dados.

---

### 3.7 Varredura da Carteira — proatividade em escala

Quando sai uma nova decisão favorável (TNU, STJ, STF), o agent varre todos os clientes ativos:

```
Nova tese: STJ reconhece tempo especial para motoristas de ônibus

Agent varre carteira:
  → Identifica 23 clientes com histórico de transporte coletivo
  → Calcula impacto individual
  → Prioriza por valor de retroativo

Resultado para o advogado:
  "23 clientes se enquadram na nova tese do STJ.
   Retroativo total estimado: R$ 1,2 milhão.
   Top 5 casos urgentes por prescrição:
   1. Maria Santos — R$ 89k (perde R$ 1.4k/mês)
   2. José Ferreira — R$ 74k (perde R$ 1.2k/mês)
   ..."

Quer que eu prepare as petições para os 5 prioritários?"
```

Isso é **impossível fazer manualmente** com 200+ clientes. Com o agent, é automático.

---

## 4. Arquitetura técnica

```
electron/systems/
  administrative/
    inss/
      config.ts       ← URLs, fluxos de navegação do Meu INSS
      selectors.ts    ← elementos estáveis do portal INSS

electron/knowledge/
  previdenciario/
    beneficios.ts     ← tipos de benefício, requisitos, carências
    calculos.ts       ← DIB, RMI, fator previdenciário, regras de transição
    teses.ts          ← banco de teses ativas com precedentes
    prazos.ts         ← prescrição quinquenal, decadência, recursos
    ec103.ts          ← regras de transição da reforma da previdência
```

O `knowledge/` é o diferencial que nenhuma big tech vai construir para o Brasil — o saber jurídico previdenciário embutido no agente.

---

## 5. Posicionamento de mercado

```
Ferramentas hoje                 Lex Previdenciário
─────────────────                ──────────────────
Organizadores de documentos  →   Analisa e encontra dinheiro
Geradores de petição genérica →  Petição baseada no caso real
Lembrete de prazo            →   Calcula quanto perde por dia
Nenhum monitor automático    →   Monitora INSS + PJe 24h

Proposta de valor:
"O Lex encontra o dinheiro que o INSS escondeu."
```

---

## 6. Roadmap sugerido

```
FASE 1 — PJe (atual)
  Automação judicial básica
  Chat jurídico com Claude
  Vision para navegação

FASE 2 — INSS básico
  Acesso ao Meu INSS via Vision
  Leitura de CNIS
  Análise de indeferimento
  Identificação de tese aplicável

FASE 3 — Inteligência previdenciária
  Calculadora de DIB
  Motor de teses com banco atualizado
  Monitoramento dual INSS + PJe

FASE 4 — Escala
  Triagem automática de novos clientes
  Varredura de carteira por nova tese
  Planejamento previdenciário preditivo
```

---

## 7. Métrica de sucesso

O Lex Previdenciário deve ser medido por uma métrica simples:

> **Quanto dinheiro o agent encontrou para os clientes do escritório?**

Cada benefício reconhecido, cada retroativo recuperado, cada tese aplicada — é valor mensurável e direto. O advogado vê o retorno do produto em reais, não em horas economizadas.
