# ADR 0021: Atlas intent-driven para compilação de workflows

Status: accepted  
Data: 2026-09-04

## Contexto

As seis portas de entrada e os DAGs associados provaram a fundação do sistema, mas ainda agregam
trabalhos muito diferentes sob rótulos amplos. A tentativa de detalhar jornadas por persona também
produz uma distorção: cargo não determina intenção. Analyst, VP, MD, CFO ou investidor podem pedir
o mesmo trabalho, e uma mesma pessoa pode alternar entre produção, revisão e decisão.

Além disso, nem todo trabalho é company-led ou precisa avançar até uma transação. O usuário pode
querer analisar uma cláusula, reconciliar um modelo, testar uma waterfall, pesquisar mercado,
revisar um material ou avaliar aderência de uma oportunidade.

## Decisão

A unidade de routing passa a ser o `Intent Envelope`, composto por ação, objetos, resultado
desejado, decisão, responsabilidade no trabalho, instrução do sponsor, audiência, estágio, regime
de evidência, inputs, restrições, autoridade, profundidade, recência, continuidade, jurisdição,
idioma e urgência.

O sistema:

1. identifica uma ou mais famílias do Atlas;
2. resolve somente os objetos necessários;
3. ativa depth packs aplicáveis;
4. compila coverage requirements;
5. seleciona TaskSpecs permitidas e suas dependências;
6. executa trabalho possível antes de perguntar;
7. pergunta somente lacunas que alteram uma decisão ou output;
8. apresenta resultados e artefatos adequados à audiência; e
9. replaneja branches sem perder trabalho ainda válido.

Personas e funções permanecem essenciais para descobrir cobertura, procedimentos, padrões de
revisão e casos de teste. Elas não são rotas de runtime e não limitam a resposta. Perfil ajuda;
intenção comanda.

As seis entradas atuais continuam como atalhos de interface e compatibilidade. Elas não são a
taxonomia completa nem a futura chave exclusiva do compiler.

## Fonte funcional

O contrato completo vive em `docs/product/CANONICAL_INTENT_WORKFLOW_ATLAS.md`. O Atlas é subordinado
à Constituição e generaliza `PRODUCT_WORKFLOW.md`, que continua governando a rota company-led de
preparação de operação quando ela for ativada.

## Consequências

- `CapitalProjectJob` deixa de ser suficiente como representação universal da intenção.
- O router por regex atual torna-se compatibilidade transitória, não arquitetura-alvo.
- Projetos podem existir sem companhia quando outro objeto basta para o trabalho.
- TaskSpecs continuam sendo a allowlist determinística; o planner não inventa capacidades.
- Coverage é compilada por decisão, não por um checklist universal.
- Output e interação variam por audiência e responsabilidade, preservando a mesma verdade econômica.
- A implementação exige contratos versionados, migração compatível e casos gold antes de substituir
  o routing de produção.

## Não decidido por esta ADR

- schema físico e migrations;
- modelo ou fornecedor usado na classificação;
- política comercial e packaging;
- promoção automática de qualquer família a produção;
- mudança dos gates de autorização e efeitos externos.
