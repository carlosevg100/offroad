# Caso 04: analista de investimentos da Prisma avaliando uma operação recebida

Versão 1.0, congelada em 4 de setembro de 2026. Maturidade: `specified`.
Lado provedor de capital. Fixture da operação recebida: Cogna (`packages/testing-fixtures/assets/cogna`),
release público de resultados mais um pedido simulado de debêntures. Fixture do mandato: a criar.

```yaml
case_id: gc04-analista-investimentos-prisma
title: Decidir se uma operação recebida merece aprofundamento, contra o mandato do fundo
real_world_trigger: >
  "Sou analista de investimentos na Prisma. Recebemos esta proposta de debêntures da Cogna com o
  release do trimestre. Meu PM quer saber se vale gastar tempo nisso."
user_function_lens: [credit_analyst, investor_portfolio_manager]
intent_envelope:
  routing_core:
    action: [levantar, extrair, reconciliar, analisar, comparar]
    object: [companhia: Cogna, operação recebida: debêntures, mandato: Prisma]
    desired_outcome: screening estruturado e recomendação de avançar, observar ou não priorizar
    decision: vale aprofundar
    audience: [analista (imediata), pm ou cio ou comitê (provável)]
    depth: preliminar
    continuity: nova
    work_responsibility: [producer, reviewer]
  execution_context:
    evidence_regime: recebida (declarações do originador) mais pública
    authority: leitura; mandato só se cadastrado e vigente; sem contato com a companhia
    sponsor_instruction: PM; "vale gastar tempo"
    jurisdiction: BR
    currency: BRL
    freshness: release 2T26; proposta datada
    language: pt-BR
expected_intent_families: [I01, I02, I04, I05, I10, I15, I16]
primary_work: [extrair e reconciliar, analisar, ler documento, mercado]
composition: avaliar oportunidade recebida contra mandato
required_depth_packs: [core.institutional-dcm, instrument.br-capital-markets, analysis.covenants, analysis.downside-sensitivities, jurisdiction.brazil]
```

## Inputs congelados

| Input | Origem | Regra |
| --- | --- | --- |
| Turno 1 | texto acima com os dois documentos anexados | hashes no manifesto |
| `01_Release_Resultados_2T26.pdf` | fixture pública | classe de informação: reportado pela companhia |
| `02_Pedido_Simulado_Debentures_2026.docx` | fixture sintética | classe de informação: declaração do originador; nunca fato até conciliar |
| Mandato da Prisma | fixture a criar em `packages/testing-fixtures/assets/prisma/mandate.json`, no formato `Mandate` de `packages/fund-mandate` (ticket, prazo, setores, instrumentos, garantias, geografias, teto de alavancagem, DSCR mínimo, ativo), com `Sourced` e data | chega no ramo "mandato cadastrado"; sem ele, o caso corre pelo ramo "mandato ausente" |
| Perfil profissional | `use_forms: [institutional_work]`, `professional_roles: [credit_analyst]`, `practice_areas: [private_credit, credit]`, `primary_objectives: [analyze_investments]` | orientação; nunca substitui o mandato |
| Source pack público | comparáveis de debêntures do setor (ANBIMA Data, snapshot datado) e cadastro CVM da companhia | com URL, data de aquisição, hash, versão, data-base e licença; a run não sai do pack |

## Comportamento esperado

**Primeira interação.** A plataforma não inventa o mandato nem o retorno mínimo. Diz: primeiro
reconstrói o que foi apresentado, separa declarações da companhia de informação comprovada e
verifica o que já basta para uma análise inicial; em paralelo, compara com o mandato aplicável se
ele estiver cadastrado e vigente; caso contrário, oferece selecionar ou enviar os critérios.

**Trabalho necessário:** inventariar documentos; reconstruir companhia e operação; conciliar
números da proposta com o release; analisar histórico e projeções; verificar uso dos recursos;
examinar fonte de pagamento; calcular alavancagem, cobertura e liquidez; testar downside; mapear
garantias; revisar estrutura e covenants propostos; comparar retorno proposto com risco e
mandato; identificar informações faltantes; preparar perguntas à companhia; separar falta de fit
de insuficiência de informação.

**Devolutiva:** resumo do deal; aderência e não aderência ao mandato, critério por critério;
números reconciliados; análise de crédito; retorno e sensibilidades; garantias e proteções;
riscos e mitigantes; red flags; informações necessárias; recomendação de avançar, manter em
observação ou não priorizar. A decisão fica com o investidor.

## Coverage exigida

| Chave | Materialidade | Estado esperado |
| --- | --- | --- |
| o que a proposta declara versus o que o release comprova | bloqueante | covered, com a tabela declaração x prova |
| uso dos recursos | alta | covered pela proposta, marcado como declaração |
| fonte de pagamento e geração de caixa | bloqueante | covered pelo release |
| alavancagem, cobertura, liquidez | bloqueante | covered com definição explícita |
| estrutura proposta: prazo, amortização, indexador, garantias, covenants | bloqueante | covered pela proposta |
| aderência ao mandato, por critério | bloqueante | covered se mandato cadastrado; insufficient_evidence com pedido se ausente. Nunca not_applicable: o fit importa, só falta o mandato |
| retorno versus risco | alta | covered com sensibilidades |
| comparáveis de mercado | média | covered se o source pack tem; senão insufficient_evidence |
| downside | alta | covered |
| informação faltante para comitê | alta | listada com materialidade |

## Cálculos determinísticos

Conciliação proposta versus release (receita, EBITDA, dívida, caixa); alavancagem e cobertura
com a definição da proposta e com a definição de mercado, lado a lado; serviço da dívida
proposto sobre geração de caixa; DSCR por período; sensibilidades a CDI e a queda de EBITDA;
retorno all-in da debênture proposta; teste do mandato: ticket, prazo, alavancagem máxima, DSCR
mínimo, setor, instrumento, garantia, geografia, vigência.

## Achados esperados

Registrados em `expected/` com âncora. Incluem obrigatoriamente: pelo menos um número da
proposta que não concilia com o release (plantado no gold); a definição de alavancagem da
proposta mais favorável que a de mercado; o critério do mandato que não fecha; e uma informação
que a companhia precisa fornecer antes de qualquer comitê.

## Outputs

| Etapa | Forma | Conteúdo mínimo | Não pode conter |
| --- | --- | --- | --- |
| 1 | chat | o que será reconstruído; pedido de mandato só se ausente | retorno mínimo inventado; mandato presumido |
| 1 | artefatos | tabela declaração x prova, números reconciliados, fit por critério, red flags | número da proposta tratado como fato |
| 2 | artefato | perguntas à companhia e recomendação com os três caminhos | decisão vinculante; "aprovado" ou "reprovado" |

## Árvore conversacional exercitada nesta versão

- Raiz: turno 1 com os dois documentos.
- Mandato cadastrado e vigente: fit calculado critério a critério, com fonte e data de cada
  critério e divergências entre declarado e observado mostradas.
- Mandato ausente: a análise de crédito sai inteira; o fit fica `insufficient_evidence` com
  pedido explícito; nenhum critério é presumido a partir do perfil do analista.
- Envia documentos: o analista envia critérios em texto livre → registrados como mandato
  `self_declared` com data; fit recalculado.
- Pede justificativa: "por que a alavancagem da proposta é menor que a sua?" → duas definições
  lado a lado com as contas.
- Corrige inferência: "o PM quer isso para o comitê de quinta" → audiência e forma mudam.
- Muda objetivo: "na verdade quero comparar com a outra proposta que recebemos" → segunda
  operação entra como objeto; comparação lado a lado; `deferred` nesta versão até existir fixture.
- `deferred`: matching e introdução (não fazem sentido do lado provedor); monitoramento.

## Adversariais

| Mutação | Resposta esperada |
| --- | --- |
| proposta com EBITDA "ajustado" sem abertura dos ajustes | ajuste não aceito; alavancagem calculada nas duas bases; pedido de abertura |
| release de trimestre diferente do citado na proposta | período sinalizado; sem comparação até alinhar |
| mandato vencido (`valid_until` no passado) | fit não calculado; pede versão vigente |
| pedido "assuma o mandato padrão de private credit" | recusa: mandato é fato da organização, não default |
| proposta com cláusula de covenant referenciando definição inexistente | ambiguidade contratual sinalizada; encaminhada ao jurídico |
| duas propostas com o mesmo hash e nomes diferentes | deduplicadas por hash |

## Baseline

Generalista recebe os dois arquivos, o conteúdo do source pack, os critérios do mandato em texto e o turno; a Offroad fica limitada ao mesmo pack. Alpha esperado:
tabela declaração versus prova; número não conciliado encontrado; duas definições de alavancagem;
fit critério a critério com fonte; separação entre falta de fit e falta de informação.

## Painel de revisão

Analista de crédito de fundo (função encenada), banker de DCM (função oposta), fundador.

## Nunca

Inventar mandato, retorno mínimo ou apetite; tratar declaração do originador como fato; concluir
"aprovar" ou "reprovar"; contatar a companhia; usar o perfil do analista como critério de
investimento.
