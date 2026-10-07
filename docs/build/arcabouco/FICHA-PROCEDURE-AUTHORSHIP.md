# Procedimentos derivados das fichas C02, C03, C04 e C32

Referência vigente: `outputs/fichas-ensaio-2026-10/` no acervo do projeto. Estudo genérico, caso de calibração, conversa turno a turno e oráculo são o gabarito. O programa anterior é apenas cobertura; o namespace de seus casos não define estes quatro.

| Ficha | Autoria canônica | Decisão profissional central |
| --- | --- | --- |
| C02 | `packages/credit-playbook/knowledge/procedures/capital/compare-financing-proposals.md` | Mesmo fluxo/curva para custo; caixa, cláusulas, garantia, firmeza e prazo antes de preferência; sem nota ponderada. |
| C03 | `packages/credit-playbook/knowledge/procedures/capital/analyze-relative-debt-cost.md` | Normalizar instrumentos e data; distinguir diferencial observado de resíduo e explicação de causalidade; testar economia da ação. |
| C04 | `packages/credit-playbook/knowledge/procedures/capital/assess-debt-capacity.md` | Analisar projeto antes de funding; separar limite de tamanho de viabilidade de um perfil por todas as datas/cenários. |
| C32, estudo seção 2 | `packages/credit-playbook/knowledge/procedures/capital/analyze-investment-project.md` | Fluxo incremental, manutenção, imposto, rampa e giro de partida; não fazer, adiar e alternativa comercial são comparações reais. |
| C32, composição | `packages/credit-playbook/knowledge/candidates/capital/prepare-capital-structure-decision-2026.10.07-v5.md` | Investimento primeiro, companhia com/sem projeto e financiamento depois; horizonte até o último pagamento. |

Os quatro novos documentos são autoria profissional em `draft`, compilados no contrato de procedimento. A composição permanece explicitamente incompleta até haver ligação a motores, contratos e avaliações reais. Não têm executor, TaskSpec ou aprovação e não podem rodar em staging ou produção. Os números sintéticos dos exemplos não são defaults nem fontes de mercado.

A v5 permanece no acervo de candidatos porque a biblioteca vigente exige o documento exato da v4 publicada. Alterar a v4 por dentro quebraria reprodutibilidade. A nova composição será ligada aos motores e publicada sob nova versão depois de sua própria avaliação e liberação; a aprovação anterior não se transfere. Esta etapa entrega autoria, não afirma execução pela interface.

O teto de C04 não pode ser anunciado como dívida viável sem passar também pelo caixa e perfil. C04 termina em 2031 e C32 financeiro em 2028; calibração nesses intervalos exige teste adicional até a amortização final. Juros não pagos capitalizam somente sob convenção contratual adotada; giro perdido com fornecedor não recebe valor zero por omissão.

Verificação automática: `packages/credit-playbook/src/ficha-procedure-authoring.test.ts` compila cada autoria, confere a dependência do investimento e nega execução/aprovação herdada; o hash do documento v4 permanece igual ao da release publicada. Ensaios de conteúdo, motores e interface terão provas próprias, além dessa verificação estrutural.
