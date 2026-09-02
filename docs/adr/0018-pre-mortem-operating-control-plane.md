# ADR 0018: Pre-mortem como control plane executável

Status: accepted

Data: 2026-09-01

## Contexto

O risco central do Offroad não é apenas uma resposta ruim. É o produto parecer institucional sem
ter provado competência, usar estado desatualizado, misturar tenants, liberar material incoerente,
agir sem autoridade ou esconder horas de analista atrás de uma interface de software. Um checklist
ou um quality score permitiria que controles fortes compensassem numericamente uma falha fatal.

Já existiam peças corretas: Evidence Ledger, cálculo determinístico, retrieval segregado, DAGs
tipados, orçamento de modelos, autorização por destinatário e rollout em duas ondas. Faltava um
contrato único que impedisse a liberação quando qualquer uma dessas provas estivesse ausente.

## Decisão

1. Qualidade operacional é um conjunto de gates, não uma média. Falha explosiva nunca é compensada
   por outro indicador.
2. Toda competência é acreditada por escopo e etapa: `Represent`, `Analyze`, `Recommend`,
   `Structure` ou `External release`. Os estados são `unsupported`, `specified`, `implemented`,
   `tested` e `production`.
3. `production` exige procedimento canônico, implementação identificada, responsável, gold cases,
   casos adversariais, zero finding crítico aberto e pelo menos vinte casos reais distintos dentro
   da validade. Evals sintéticos não contam como casos reais.
4. O uso de um caso é separado em `preliminary`, `internal_decision`, `external_material` e
   `external_action`. Cada nível exige competência e controles próprios.
5. Claim material exige fonte, entidade, período e validade. Cálculo crítico exige implementação
   determinística e conciliação. Gap material exige razão e próxima ação.
6. Recomendação interna exige mandato, alternativas, downside e incerteza explícita. Material
   externo exige consistência cruzada, atualidade e aprovação. Ação externa exige mandato de
   mercado atual, fit explicável e autorização exata para conteúdo e destinatários.
7. Alteração de evidência invalida transitivamente fatos, cálculos, claims, artefatos, aprovações e
   matching dependentes. Aprovação não sobrevive a mudança no que aprovou.
8. Intervenção humana é evento mensurável por caso, tarefa, causa e minutos. Mudança manual de
   estado canônico exige revisão. Trabalho recorrente de correção não pode ser apresentado como
   automação.
9. O gateway recebe classe de dado e finalidade em toda chamada. Quando a fiscalização estiver
   ativa, cada candidato primário, shadow ou fallback precisa de registro de garantia do provedor
   vigente, com treinamento proibido, finalidade e classe permitidas e `no_store` para dado não
   público. Ausência, expiração ou fallback incompatível falham antes da chamada.
10. Garantia de provedor é dado operacional fornecido pela Offroad, nunca uma verdade hard-coded
    sobre contrato de vendor. Ativação depende de DPA/ZDR/base legal reais.
11. Promoção a `active` mantém duas ondas disjuntas de dez casos reais e aprovação externa, mas
    passa a exigir também aprovação explícita deste control plane.
12. Competência não concede autoridade. Mesmo uma capacidade em produção não executa contato,
    distribuição, negociação, underwriting ou fechamento sem o gate específico do caso.

## Consequências

- `@offroad/release-governance` concentra acreditação, gate de uso, invalidação e economia humana.
- `@offroad/model-gateway` concentra a política de dados de Anthropic/OpenAI e impede fallback
  permissivo quando a fiscalização estiver ativa.
- Os contratos são puros e testáveis sem rede, banco ou API paga.
- Persistir snapshots, acreditações e intervenções no ledger imutável continua sendo uma fatia de
  banco separada; até lá eles não podem ser apresentados como histórico operacional já capturado.
- DPA/ZDR, SSO/MFA/SCIM, revisão externa de segurança, restauração de backup e corpus institucional
  não passam a existir por causa deste ADR. Continuam dependências explícitas de produção.
