# Documentos: avaliação com modelos reais e correções

Estado: candidato. As medições usam o gateway e os módulos reais, com dados sintéticos e recibos no banco. Resultados parciais não são aprovados como qualidade do produto.

## O que os testes reais revelaram

A avaliação na versão de produção `18d00e7f53b7fb461878069b37cdb2e45a368646` alcançou o executor. A classificação pela política padrão foi recusada antes de qualquer chamada: `processing_resource_ineligible:schema_cache` na OpenAI. O atestado desse recurso não existe, conforme a revisão de condições de 21/09. Nenhum atestado foi inventado para abrir o caminho. Avaliação `7cf2a9d5-75ca-4d35-bcf5-1403dcd24db1`, custo zero.

Medir o mesmo classificador v1 usando somente a alternativa Anthropic já autorizada mostrou 6/8 tipos e classes corretos, 4/5 períodos corretos e dois erros com confiança >=0,8. Recibo `8975a11a-6c26-46c2-bcf7-c84c0964bc54`, USD 0,0989. Essa escolha foi exclusiva da avaliação, sem alterar a política de produção.

A extração padrão consumiu 8 mil tokens de resposta em raciocínio e não produziu o objeto de campos. Ao tentar a rota alternativa OpenAI, encontrou o mesmo recurso sem atestado. Recibo `4eead923-d987-45e5-a9f5-25c964a85228`, parcial, USD 0,178772 medidos em duas chamadas.

## Correções candidatas

- O classificador recebe os nomes e classes do catálogo canônico. Distingue a função documental, revisão limitada, memorial descritivo, resumo gerencial e balancete contábil. Período mensal não é data de emissão nem primeiro dia arbitrário do mês. Cabeçalhos de tabela integram a amostra limitada.
- Desacordo entre tipo e classe conserva a classe/rank canônicos, mas limita a confiança de roteamento a 0,79 e guarda a confiança original. Essa divergência exige revisão; não vira uma mudança silenciosa de precedência.
- Classificação e localização usam Sonnet 5 com alternativa Opus 5. Extração usa a mesma família autorizada. A OpenAI continua sujeita à recusa do recurso não atestado; não se alteram condições de tratamento ou isolamento para fazê-la passar.
- O adaptador agora envia `thinking: {type: "disabled"}` quando a tarefa pede raciocínio desligado. Omitir o parâmetro mantinha o raciocínio padrão de Sonnet 5. Exceções já existentes para Fable/Mythos são preservadas. A extração de campos, assim como os passes de linhas, pede leitura direta.
- O teste seguinte confirmou zero tokens de raciocínio, mas ainda encontrou resposta truncada em 8 mil tokens de campos. A janela inteira passa a 16 mil tokens; passes de linhas mantêm 4 mil. Cada chamada reserva esse teto antes do envio. Limites de gasto, quantidade de chamadas e duração continuam em vigor.

Versões: classificador `2026.10.29-e1-v3`, extrator `2026.10.29-e3-v4`, gateway `2026.10.29-explicit-thinking-v5`. Não se reescrevem resultados nem executores publicados.

## Avaliação e configuração

Foi criada conta exclusiva com papel `evaluator`, sem associação a organizações de clientes, namespace próprio de avaliação e credencial somente no Secrets Manager. O transporte de avaliações foi aberto com exposição `internal`, pelo comando já existente e com registro do ato do fundador de 29/10/2026 nesta conversa. Não é uma liberação de método financeiro.

O role GitHub recebe leitura dos dois segredos necessários: avaliador e chave publicável. Seu vínculo OIDC foi restringido à `main` ou ao ambiente `intent-router-gold-main`, cujo GitHub permite apenas `main`. O acesso anterior a chaves de modelo, usado pelo workflow de revisão de código, não foi ampliado.

As correções são medidas antes da promoção no staging isolado, com outro avaliador e worker, credenciais diferentes, consumidor exclusivo de avaliações e os quatro atestados Anthropic da conta efetiva copiados sem alterar condições ou evidências. Nenhum documento de cliente foi copiado. Scripts clientes não recebem chave de provedor; somente o consumidor a mantém. O gabarito não entra no snapshot do modelo.

A primeira correção do classificador fez 8/8 tipos, 8/8 classes e 5/5 períodos em duas execuções independentes de Rede Horizonte; Nimbus fez 6/6 tipos e classes e 3/3 períodos. Fakeco revelou a confusão do resumo gerencial e motivou a distinção estrutural adicional. A versão final v3 fez 23/23 tipos, 23/23 classes e 13/13 períodos esperados nos três casos, sem erro com confiança alta; Fakeco avaliou os nove documentos com perfil esperado dentre onze fontes. O ledger registra USD 0,221128 em 24 chamadas, incluindo uma tentativa que não forneceu resposta aceita. A extração completa ainda está em curso. Duas avaliações exploratórias interrompidas para corrigir truncamento permanecem parciais no ledger; não contam como aprovação.

Os relatórios de medição passam a usar os custos e chamadas do ledger como total, em vez de somar somente as respostas aceitas. O subtotal aceito permanece separado: ele não inclui tentativa inválida, reparo ou fallback fracassado.

## Gates e retorno

Regressão de conflito de classe falhou antes da correção. Testes focados, typecheck final, gate completo, manifestos, CI e promoção serão registrados com os resultados efetivos. Nenhuma migração de esquema. Não há nova fonte de dados, conclusão de crédito ou aprovação de R1/R2/R3.

Controles afetados: AI-01/AI-05/AI-08/AI-09, DOC-06/DOC-09/DOC-10 e CLOUD-01. Mantidos revisão humana, declarações de escala, separação entre fato e cálculo, autorização por arquivo e recusa de entrada não verificada. A classificação correta em um corpus não prova qualidade universal de documentos.

Retorno: pausar o transporte de avaliação pelo comando `private.release_governed_evaluation_transport_v1` e restaurar a imagem/commit anterior se o candidato for promovido e depois apresentar regressão. Não apagar recibos nem fontes. A credencial do avaliador não concede leitura de outros clientes.

Fontes de condições: [OpenAI, data controls](https://developers.openai.com/api/docs/guides/your-data), [Anthropic, thinking troubleshooting](https://platform.claude.com/docs/en/build-with-claude/thinking-troubleshooting) e `docs/security/provider-processing/2026-09-21/REVIEW.md`. O prazo do schema OpenAI continua sem prova suficiente; a rota autorizada usa os atestados já existentes.
