# Cobertura aberta de negócios: primeira integração executável

Data: 9 de setembro de 2026.
Status: implementação local candidata; não publicada, não promovida em produção.
Base local conhecida: main `75ec631`; branch `feat/open-business-planning`.

## Resultado observável

Uma descrição revisada fora do catálogo, como um modelo de negócio não catalogado, deixa de ser
convertida em informação desconhecida. O plano preserva a declaração, sua fonte e revisão e
explicita a necessidade de examinar sua aplicabilidade à análise. O comportamento está conectado
aos produtores reais de plano inicial e proposta revisada e à apresentação existente do plano.

Contextos informados para segmentos nomeados ficam em objetos separados. Um segmento não recebe
atributos de outro nem da companhia; os métodos conhecidos continuam exigindo todos os seus
predicados no mesmo objeto e em períodos compatíveis. A relação entre entidades e os critérios de
consolidação permanecem a confirmar, sem inferir propriedade, garantias ou acesso ao caixa.

Pacotes acima dos limites de apresentação geram pedido explícito de delimitação com contagens.
O fingerprint vincula o pacote completo; não há amostragem silenciosa de objetos nem queda do
plano inteiro por exceder os limites visuais.

## Frentes integradas

| Frente | Alteração | Onde |
|---|---|---|
| Contrato econômico | Descrições abertas até 500 caracteres, segmentos/unidades/projetos e dimensões adicionais de custos, giro, ativos, capex, regulação e drivers | `packages/agent-contracts/src/economic-context.ts` |
| Composição | Objetos caracterizados e necessidades locais de revisão, preservando métodos conhecidos e compatibilidade com planos v1 anteriores | `packages/dcm-specialization/src/economic-context.ts` |
| Fluxo do produto | Descrições revisadas preservadas, perímetros separados e tratamento de volume no produtor compartilhado dos planos | `apps/document-worker/src/governed-sector-planning.ts` |
| Experiência | Contexto e lacunas por objeto na interface existente, com regressão bilíngue | `apps/web/src/components/advisor/execution-brief-card.test.tsx` |
| Continuidade | Testes nos planos inicial, de continuação e de proposta revisada, incluindo invalidação após mudança material | `apps/document-worker/src/execution-brief*.test.ts` |

## Limites precisos desta entrega

- Não implementa novos modelos financeiros nem promove especialidades. Composição permanece
  `planning_only`; execução e efeitos externos continuam proibidos por esse contrato.
- As seis novas dimensões estão disponíveis no contrato e no compilador. A ingestão governada
  existente ainda entrega os sete campos anteriores. Sua expansão exige trabalho posterior na
  ontologia, projeção autorizada e fluxo de revisão; não foi simulada neste lote.
- Segmentos nomeados representam perímetros informados nas fontes. Nome não é identidade jurídica:
  unidades homônimas de fontes distintas permanecem separadas. Combinação entre documentos exige
  identificação explícita antes de análise consolidada.
- Testes de proposta usam persistência simulada. Não demonstram gravação real em banco, jornada
  autenticada, modelo real ou deploy. Não houve migração, nova flag ou alteração de permissão.
- O roteamento heurístico legado ainda não reconhece todas as formulações em inglês. O teste
  analítico usa intenção reconhecida e verifica o compilador; resolver o roteamento de forma geral
  continua parte da integração do planejador semântico.
- RT-04 e WFI-13 ficam em andamento. Requisitos completos de composição por tarefa, execução,
  métodos revisados e homologação permanecem pendentes. Nenhum critério final foi marcado aprovado.

## Validação e próximo corte

Testes focados já verificam declarações não catalogadas, segmentos distintos, fonte desatualizada,
quarentena, ausência de revisão, períodos, limites de tamanho, composição por objeto, novos campos,
compatibilidade v1, ordem dos inputs e fingerprints. A checagem completa Node 24 passou: lint, tipos, testes e build, 43/43 tarefas por etapa.
Contratos: 218 testes; especialização: 59; worker: 421; web: 415. Registro local:
`/private/tmp/offroad-open-business-check-final.log`. Revisão independente sem novo blocker.
A primeira tentativa no sandbox não concluiu o build; o diagnóstico confirmou DNS indisponível
para Google Fonts. A execução autorizada com acesso normal concluiu todos os gates locais.

Próximo corte integrado: levar caracterização confirmada por objeto ao registro de tarefas e
requisitos; propagar apenas bloqueios materiais aos dependentes; conectar essa seleção aos métodos
financeiros revisados e à geração consistente de materiais. Em paralelo, expandir a entrada e
revisão das novas dimensões com identidade explícita dos objetos. A homologação usa negócios novos
e atividades combinadas, sem transformar a amostra em lista de elegibilidade.
