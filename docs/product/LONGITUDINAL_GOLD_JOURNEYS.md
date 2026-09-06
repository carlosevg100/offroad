# Jornadas gold longitudinais G1-G8

Versão: 2026.09.06-v1

Status: contratos completos e validados; reference work products e runtime universal pendentes

## O que mudou

G1-G8 deixaram de ser descrições de alto nível. A fonte executável em
`packages/evals/src/longitudinal-journeys.ts` define, para cada jornada:

- objetivo e famílias de intenção;
- sequência de estados e transições permitidas;
- superfície que o usuário vê em cada estado;
- objetos, outputs e evidências obrigatórios;
- regra de perguntas e checkpoints;
- variantes de idioma, responsabilidade, regime de evidência e disponibilidade de dados;
- adversariais de tenant, documento, provider e efeito externo;
- os 14 gates de qualidade, segurança e sobrevivência;
- comportamentos proibidos.

Persona continua sendo cobertura de teste, não regra de roteamento. A mesma pessoa pode iniciar
qualquer jornada conforme intenção, contexto, objeto, decisão, responsabilidade e autoridade do
turno.

## Contratos

| Jornada | Estágios | Execution Brief específico | Resultado terminal |
| --- | ---: | --- | --- |
| G1 Banker | 10 | RI/CVM, companhia, setor, forecast, estrutura de capital e material de reunião | estruturar, continuar ou fechar |
| G2 CFO | 10 | informação gerencial, forecast, diagnóstico, opções e board paper | registrar decisão e preparar próximo branch |
| G3 Assessor/recebíveis | 8 | reconciliação, tape, eligibility, waterfall, estrutura, teaser e matching | capital screen permissionado |
| G4 Investidor | 8 | underwriting, retorno, downside, garantias, covenants, diligência e IC memo | decisão registrada pelo investidor |
| G5 Contrato | 7 | versão vigente, defined terms, cross-references, cálculo/waterfall e issue list | resposta citada e atualização localizada |
| G6 Atualização | 5 | delta, dependências afetadas, reuse, recomputação e artifact diff | novo snapshot sem apagar histórico |
| G7 Project finance | 7 | risco técnico, contratos, sources/uses, drawdown, waterfall, ratios e bankability | material e capital map |
| G8 Mercado | 8 | anonymous screen, mandato, freshness, shortlist, disclosure e autorização | introdução qualificada e feedback |

## Regra de experiência

Toda jornada começa por compreender o pedido e alinhar somente o que muda o trabalho. Antes de
pesquisa, leitura material, modelagem ou geração de arquivo, o usuário recebe um Execution Brief
específico. O plano mostra o que será pesquisado, estudado, reconciliado, calculado e entregue. Não
mostra raciocínio privado, nomes de agentes ou linguagem de runtime.

Depois da aprovação, `Live Work` projeta progresso real e descobertas; `Workbench` organiza verdade,
modelo, cenários, findings e alternativas; `Artifact Review` permite revisar arquivos; checkpoints
registram escolhas e autoridade. Um novo documento ou premissa atualiza somente descendentes.

## O que os contratos ainda não provam

- que o universal compiler consegue instanciar todos os grafos;
- que cada TaskSpec possui procedure e executor promovidos;
- que arbitrary documents atingem recall e completude;
- que modelos e artifacts atingem qualidade top-tier;
- que G1-G8 funcionam na interface real;
- que o produto supera o benchmark generalista;
- que qualquer jornada está pronta para cliente.

O status permanece `specified`. A próxima promoção exige reference work products de G1 e G2,
bindings executáveis, fixtures declaradas, E2E longitudinal, adversariais, benchmark e evidência de
revisão.
