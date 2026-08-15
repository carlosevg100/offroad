# Risk Register

| ID | Risco | Probabilidade | Impacto | Controle atual | Próxima ação | Owner |
|---|---|---:|---:|---|---|---|
| R-001 | conflito de marca/nome digital | média | crítico | identidade centralizada; site `noindex` | clearance jurídico e registral antes de launch | Executivo/Jurídico |
| R-002 | ato regulado apresentado como simples software | média | crítico | limite operacional explícito; ativação futura bloqueada | matriz jurisdição-instrumento-ato-parceiro | Jurídico/Compliance |
| R-003 | vazamento cross-tenant | média | crítico | RLS/foreign keys compostas planejadas como gate | pgTAP e non-interference desde B3 | Security/Data |
| R-004 | LLM criar fato ou número material | média | crítico | evidence compiler e math core determinístico definidos | contracts/evals antes de agente com dados reais | AI/Credit |
| R-005 | arquivo hostil executar no pipeline | média | crítico | quarentena/sandbox como condição B4 | threat model + hostile fixture suite | Security/Platform |
| R-006 | telemetria capturar dado financeiro/PII | média | alto | providers ainda não integrados; allowlist obrigatória | schema registry e negative tests em B12 | Data/Privacy |
| R-007 | dependência de providers sem portabilidade | média | alto | adapters e boundaries definidos | ADR por integração e fixture explícito | Architecture |
| R-008 | repositório vazio sem base para PR | alta | médio | branch orphan de trabalho; sem push | bootstrap aprovado de `main` e ruleset | Engineering |
| R-009 | domínio apontado antes de clearance/QA | baixa | alto | projeto Vercel existe apenas em preview protegido; DNS permanece intacto | aprovar preview e clearance antes de produção/DNS | Product/Platform |
| R-010 | design parecer cópia da Forward/Tier 1 | baixa | alto | tokens do Blueprint e composição product-first original | visual regression + review de originalidade | Design |
| R-011 | complexidade excessiva antes do wedge | média | alto | execução por gates e vertical slice | manter scope de cada PR verificável | Product/TPM |
| R-012 | custos externos sem budget | média | médio | criação paga exige cost confirmation | registrar budget e alertas por provider | Finance/Platform |
| R-013 | adotar dependências recém-publicadas antes da janela de observação | baixa | alto | lockfile fixo; gate padrão aprovado; filtro adicional marcou 22 artefatos com menos de 24 horas | revalidar após a janela ou fixar versões anteriores auditadas antes do primeiro commit | Security/Engineering |
