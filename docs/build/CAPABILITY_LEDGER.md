# Offroad Capability Ledger

Versão: 2026.09.07-v15

Baseline inspecionada: commit `f352d65`

Status: primeira classificação executável do produto atual

## Como ler

O ledger separa três perguntas diferentes:

- **availability:** existe em runtime (`live`), roda sem decidir (`shadow`), depende de fixture
  (`mocked`), existe apenas como contrato (`specified`) ou não existe (`absent`);
- **exposure:** está disponível para todos, apenas em preview allowlisted, somente internamente ou
  em nenhuma superfície;
- **quality maturity:** unsupported, specified, implemented, tested ou production.

Uma capacidade `live` não é automaticamente confiável para uso de cliente. Uma capacidade
`tested` num preview estreito não é `production`. Nenhuma capacidade analítica deste ledger está
autorizada para `customer_work`, `external_material` ou `external_action`.

A fonte executável é
`packages/release-governance/src/current-capability-ledger.ts`. O evaluator recusa ledger que tente
apresentar especificação como runtime, fixture como live, shadow como customer-facing ou qualidade
`production` sem execução controlada.

## Estado atual

| Capacidade | Availability | Exposure | Quality | Limite que importa |
| --- | --- | --- | --- | --- |
| Project workspace e memória | live | universal | tested | continuidade econômica G1-G8 não provada |
| Intake de formatos conhecidos | live | universal | implemented | data room arbitrário e corpus hostil não provados |
| Entendimento de data room arbitrário | specified | none | specified | sem E2E representativo |
| Intent Envelope semântico | shadow | internal | implemented | não decide a rota universal de produção |
| Resolução semântica de objetivo | shadow | internal | implemented | traduz composição em objetivo e mede divergência; não governa execução |
| Router semântico | live | allowlisted | tested | cinco composições do preview |
| Biblioteca de 80 TaskSpecs | specified | none | specified | allowlist não equivale a executor |
| Compiler do Caso 01 | live | allowlisted | tested | cadeia case-bound |
| Candidato universal de dispatch | shadow | internal | implemented | decisão all-or-nothing persistida; execução é invariavelmente desabilitada |
| Compiler universal objective-to-plan | specified | none | specified | ainda sem runtime |
| Especialistas do Caso 01 | live | allowlisted | tested | nove métodos, não runtime geral |
| Specialist Runtime geral | specified | none | specified | dispatch universal ainda ausente |
| Kernels financeiros determinísticos | live | internal | implemented | não formam modelo institucional integrado |
| Modelo institucional integrado | specified | none | specified | sem fechamento completo e drivers setoriais promovidos |
| DOCX básico do preview | live | allowlisted | tested | a planilha ad hoc foi bloqueada; DOCX não passou gate top-tier ou template fidelity |
| Fundação Office nativa governada | live | allowlisted | unsupported | A implementação fonte de PPTX e decision workbook está presente, mas a transição continua não registrada até existirem CI, merge e gate real; ambos permanecem internal-only e o workbook não é o modelo integrado |
| Suite de artifacts template-faithful | specified | none | specified | referências ainda não aprovadas |
| Verifier universal | specified | none | specified | gates atuais são estreitos |
| Matching com mandatos sintéticos | mocked | internal | implemented | sem base live suficiente |
| Rede live de mandatos e lenders | absent | none | unsupported | aquisição, consentimento e freshness inexistentes |
| Atualização incremental do Caso 01 | live | allowlisted | tested | provada somente dentro do preview |
| Fechamento governado e refresh R01 | live | internal | implemented | executa o case rail atual; o especialista R01 continua em sombra e sem uso externo |
| Continuidade longitudinal do projeto | specified | none | specified | não conecta análise, estrutura, materiais e capital |
| Gates de trust e assurance | live | internal | tested | current state e evidence population pendentes |
| Compatibilidade banco-worker no boot | live | internal | tested | primeiro rollout protegido estabilizado; mudança incompatível exige versão nova e mudança aditiva exige capacidade nominal |
| Assurance enterprise externa | absent | none | unsupported | sem pentest, SOC 2 ou ISO emitidos |
| Execution Brief específico | live | universal | implemented | compiler, histórico imutável e card estão ligados; somente G1 possui gate E2E |
| Live Work stream | live | universal | implemented | progresso seguro vem dos runs reais; eventos narrativos por frente ainda são estreitos |
| Premium decision workbench | specified | none | specified | UI atual não é a experiência-alvo |
| Regressão G1/Caso 01 | live | internal | tested | não é aceite longitudinal do fundador |
| Jornadas G2-G8 | specified | none | specified | contratos completos; work products e runtime ainda incompletos |

## Verdade executiva

O produto possui componentes reais, mas o endgame ainda não está pronto. O que está mais avançado
é um preview allowlisted do Caso 01, kernels financeiros isolados, persistência de projeto e gates
internos. Os maiores gaps que impedem uso sério amplo são:

1. compiler universal de intenção para plano;
2. document intelligence arbitrária com completude;
3. modelo financeiro institucional integrado;
4. artifacts nativos e template-faithful;
5. verifier universal;
6. continuidade longitudinal;
7. capital network com mandatos reais;
8. experiência de Execution Brief, Live Work e Workbench;
9. current state e evidência operacional dos controles de trust.

## Regra de atualização

Cada PR que muda uma capacidade deve atualizar o entry correspondente. A promoção exige evidência
no escopo exato. Se o runtime, a evidência ou a limitação mudarem, o fingerprint do ledger muda e o
release precisa reavaliar os gates aplicáveis.
