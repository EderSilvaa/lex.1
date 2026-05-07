---
name: lex-legal-brief
description: "Brazilian legal drafting workflow: transform facts, documents, claims, and procedural posture into a structured legal brief or petition plan."
version: 0.1.0
author: Lex
license: MIT
metadata:
  hermes:
    tags: [legal, brazil, drafting, litigation, pje, documents]
    related_skills: [pje-bridge]
---

# Lex Legal Brief

Use this skill when the user asks for legal analysis, a petition/recurso plan,
argument mapping, document review, or a first draft strategy for a Brazilian
case.

## When to Use

Use this skill for:

- Petitions, appeals, defenses, motions, notices, and legal memos.
- Turning process facts/documents into arguments.
- Identifying missing facts, evidence, deadlines, or procedural risks.
- Preparing a drafting outline before generating a final document.
- Reviewing a legal document for weak points, contradictions, or missing
  requests.

## When Not to Use

Do not use this as the final authority for:

- Filing anything in PJe.
- Confirming legal deadlines without source data.
- Inventing jurisprudence, citations, facts, or process movements.
- Acting without lawyer review.

Use `pje-bridge` when the next step requires consulting, opening, downloading,
or filing in PJe through the Windows Lex app.

## Workflow

1. Identify the area of law, procedural stage, parties, court, and goal.
2. Extract facts, documents, deadlines, claims, defenses, evidence, and gaps.
3. Ask for missing critical facts if the request is under-specified.
4. Build an argument map:
   - thesis
   - legal basis to verify
   - evidence
   - likely counterargument
   - risk
5. Produce a drafting plan before writing a final piece.
6. Mark every unverified legal authority or deadline as needing verification.

## Legal Accuracy Guardrails

- Do not add greetings or decorative text when the user asks for direct output.
- Do not cite case numbers, docket numbers, chambers, reporters, or precedent
  dates unless the source has been verified in the current task.
- If a legal rule is likely but not verified, say "verificar base legal" instead
  of stating it as final authority.
- For calculations, show the arithmetic and flag assumptions.
- Prefer "pedido a avaliar" when a claim depends on facts not provided.

## Brazilian Labor Notes

When handling Brazilian labor claims:

- Hours from 8h to 18h with 1h interval = 9 working hours per day.
- Monday through Saturday at 9 working hours/day = 54 working hours/week.
- The ordinary weekly limit is 44 hours, so this fact pattern indicates about
  10 overtime hours/week before checking collective rules, compensation, or
  banco de horas. Do not call it only 1 overtime hour/week.
- Timekeeping duty under CLT art. 74, §2 currently applies to establishments
  with more than 20 employees. Older "more than 10 employees" references need
  verification before use.
- For interval claims, ask whether the stated interval was actually enjoyed.
- For moral damages based only on lack of CTPS registration, label it as a
  strategic claim to evaluate because courts may reject automatic moral damage.

## Output Shape

Prefer this structure:

```markdown
## Objective

## Case Snapshot

## Missing Information

## Argument Map

## Evidence Checklist

## Draft Structure

## Risks And Verification

## Next Action
```

For short requests, answer directly but keep the same safety rules.
