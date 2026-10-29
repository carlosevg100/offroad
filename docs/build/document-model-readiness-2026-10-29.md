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

Versões: classificador `2026.10.29-e1-v3`, extrator `2026.10.29-e3-v7`, gateway `2026.10.29-explicit-thinking-v5`. Não se reescrevem resultados nem executores publicados.

A avaliação v4 chegou a 122 chamadas aceitas antes de perder a continuidade da concessão; a retomada começou a avaliação de novo e revelou mais duas respostas cortadas em tabela comparativa densa, mesmo com teto de 16 mil tokens e raciocínio desligado. O resultado `4da4de3c-1431-479e-9f3f-f134efa506ba` foi encerrado como parcial, sem pontuação de aceitação. Na v5, o teto de 24 linhas concluiu os 13 passes de uma demonstração comparativa sem truncamento, por USD 0,601564. A verificação recusou 75 referências de célula que apontavam a espaçadores vazios: a instrução permitia derivar a coluna pela posição visual. Na v6, o modelo só pode copiar IDs impressos; tabela apresentada por linha é citada com precisão de linha, sem inventar sufixo de célula. Tabelas comparativas têm teto de 24 linhas e prosa/exportações esparsas têm 48. Cabeçalhos, sobreposição e âncoras permanecem; testes cobrem divisão sem perda/duplicação e a janela maior para células esparsas. Nenhum verificador foi afrouxado.

## Avaliação e configuração

Foi criada conta exclusiva com papel `evaluator`, sem associação a organizações de clientes, namespace próprio de avaliação e credencial somente no Secrets Manager. O transporte de avaliações foi aberto com exposição `internal`, pelo comando já existente e com registro do ato do fundador de 29/10/2026 nesta conversa. Não é uma liberação de método financeiro.

O role GitHub recebe leitura dos dois segredos necessários: avaliador e chave publicável. Seu vínculo OIDC foi restringido à `main` ou ao ambiente `intent-router-gold-main`, cujo GitHub permite apenas `main`. O acesso anterior a chaves de modelo, usado pelo workflow de revisão de código, não foi ampliado.

As correções são medidas antes da promoção no staging isolado, com outro avaliador e worker, credenciais diferentes, consumidor exclusivo de avaliações e os quatro atestados Anthropic da conta efetiva copiados sem alterar condições ou evidências. Nenhum documento de cliente foi copiado. Scripts clientes não recebem chave de provedor; somente o consumidor a mantém. O gabarito não entra no snapshot do modelo.

A primeira correção do classificador fez 8/8 tipos, 8/8 classes e 5/5 períodos em duas execuções independentes de Rede Horizonte; Nimbus fez 6/6 tipos e classes e 3/3 períodos. Fakeco revelou a confusão do resumo gerencial e motivou a distinção estrutural adicional. A versão final v3 fez 23/23 tipos, 23/23 classes e 13/13 períodos esperados nos três casos, sem erro com confiança alta; Fakeco avaliou os nove documentos com perfil esperado dentre onze fontes. O ledger registra USD 0,221128 em 24 chamadas, incluindo uma tentativa que não forneceu resposta aceita. Uma repetição posterior na mesma versão, já no consumidor AWS e com o parser consolidado, acertou 7/8 tipos e classes e 5/5 períodos em Rede Horizonte; o parecer de revisão limitada foi classificado como gerencial com confiança 0,62, portanto exige confirmação humana. Recibo `00d68caf-d65e-43d9-82a9-f2f2c84eddc5`; esse resultado também integra a evidência, sem selecionar somente a melhor corrida. A extração completa v6 é medida encadeada a essa classificação real, sem fornecer tipos, entidades ou períodos do gabarito ao extrator. Avaliações exploratórias interrompidas para corrigir truncamento permanecem parciais no ledger; não contam como aprovação.

Os relatórios de medição passam a usar os custos e chamadas do ledger como total, em vez de somar somente as respostas aceitas. O subtotal aceito permanece separado: ele não inclui tentativa inválida, reparo ou fallback fracassado.

## Executor isolado na AWS

Os ensaios longos usam uma tarefa Fargate exclusiva, com o código candidato conferido por SHA-256 sobre a imagem existente do worker. O consumidor técnico recusa a URL de produção antes de autenticar, confere a organização no contrato canônico verificado e aceita somente as famílias `measure-classification` e `measure-extraction`. Ele não importa o dispatcher de trabalhos de clientes e não tem role de tarefa. As credenciais de staging são injetadas pelo cofre; o artefato de código fica privado, com bloqueio público, criptografia e expiração em sete dias. Não contém documentos nem segredos.

A tarefa tem prazo finito de 180 minutos e encerramento forçado aos 185, suficiente para o ensaio sequencial completo de 243 passes. O orçamento por avaliação e a reserva de cada chamada continuam conferidos pelo banco. A saída da sessão usa escopo local, sem invalidar outras sessões. A primeira inicialização falhou por conferir um campo inexistente no objeto de claim, antes de qualquer chamada de modelo. O helper tipado agora confere o contrato carregado pela função canônica, com typecheck e testes de configuração. Nenhuma execução interrompida é contada como aprovada.

## Último defeito encontrado pelo ensaio amplo

A execução completa v6 concluiu a medição dos oito documentos, mas um dos 243 passes falhou: a enumeração de uma tabela no memorial ainda usava teto de 4 mil tokens. Sonnet e Opus atingiram esse teto. O ledger preserva 244 chamadas e USD 7,4229; o resultado não representa leitura completa. Nimbus v6 concluiu 31/31 passes e Fakeco v6, 15/15.

A v7 limita o passe de tabela a três linhas, repete o cabeçalho em cada grupo e concede o teto declarado de 16 mil tokens. A instância global de cada linha continua sendo determinada pelo código. Dois testes novos falharam antes da correção: um expõe o lote sem limite, outro mostra que reiniciar o índice do modelo em cada trecho unia duas linhas distintas. Agora células de uma mesma linha compartilham a identidade da fonte, mesmo quando o modelo reinicia ou muda seu número. O scanner linear de sufixos malformados continua aprovado. Extrator: 63 testes de fonte aprovados. Os três casos são repetidos com modelo real na v7 antes da promoção.

A medição ampla v6 teve recall material 62,41% e precisão 61,36% contra o gabarito ponta a ponta de Rede Horizonte, que também inclui valores derivados e leituras de negócio. Isso impede chamar a análise completa de pronta. O replay somente do pós-processamento v7 sobre as respostas v6, conservando os perfis realmente usados, chegou a 70,92% de recall; não é uma nova medição do modelo. Não se alterou o gabarito para aumentar a nota. Nimbus v6 teve recall material 87,50% e precisão 90,20%. Esses limites permanecem declarados, além da prova de referência documental abaixo; não são aprovação de R1/R2/R3 nem de análise universal.

## Prova de referência dentro do orçamento de produção

O ensaio dedicado v6 `96ad06f1-a7ed-4be1-ab2c-792d06017b32` leu a demonstração comparativa em 13/13 passes, USD 0,612393. Produziu 114 candidatos: 112 com âncora confirmada e dois marcados como não confirmados por paráfrase ou qualificação não literal. Nenhum foi adotado automaticamente. Incluindo conservadoramente as oito classificações da rodada anterior, foram 21 chamadas e USD 0,71901, abaixo das 50 chamadas e USD 3,15 de um documento. Isso comprova a referência e o envelope desse documento; não transforma a métrica global acima em aprovação. Recibo e impressão do resultado em `evidence/document-extraction-production-envelope-2026-10-29.json`.

## Orçamento e conclusão verdadeira do documento

O gate completo recusou a antiga dotação: a reserva do caminho de oito chamadas atingiu USD 1,8883766, acima de 1,60. Com reparo e alternativa elegível, o caminho medido chega a 2,8247434; mais 10%, arredondado para cinco centavos, define o teto de 3,15 por documento. O lote fica limitado a USD 30, suficiente para oito documentos com seus tetos e 3,10 da análise. O teto anterior por lote era 25. São 50 chamadas por documento e 500 por lote; os demais tipos de trabalho mantêm no máximo oito. O teto mensal e a reserva de cada tentativa continuam obrigatórios; trabalhos existentes conservam a dotação que já receberam.

A migração nova foi ensaiada com rollback nos dois bancos, comparando o corpo esperado byte a byte e as permissões, o modo de segurança e `search_path`. Aplicada em staging `20261029163547` e produção `20261029163644`, SQL MD5 `fbe6f5ca3f5c0e105089b3f3dd8ad2a6`, corpo instalado `b38c2e66bb9244df4d23fe6b8f66c706` nos dois. Orçamentos acima dos novos tetos são recusados. Avisos de segurança: zero. Tipos regenerados refletem funções já instaladas e PostgREST 14.15; a migração não cria endpoint. A imagem anterior continua impondo sua dotação até o deploy do candidato.

Dois testes reproduziram um defeito independente: leitura com trecho falho terminava como documento concluído. Agora os candidatos válidos permanecem propostas e a falha é registrada como `extraction_incomplete`, sem conclusão nem repetição automática de todos os trechos pagos. O pipeline passa a `f2-2026.10.29`, permitindo reconstrução sob o novo contrato quando houver novo processamento. Testes focados: worker 41/41, constantes 7/7, web 7/7. Evidência em `evidence/document-processing-budget-2026-10-29.json`.

O ensaio completo E3 é amplo e mede o extrator isoladamente; ele não usa os tetos de um job de produção nem aplica o desvio de grandes bases tabulares para a leitura determinística. Seu sucesso não prova que qualquer arquivo caiba no envelope econômico. A prova integrada de navegador e a análise dos recibos de produção continuam necessárias.

A suíte completa seguinte encontrou dois timeouts de cinco segundos sob concorrência, sem divergência de conteúdo: compilação/exportação do term sheet nativo e reconstrução dos cabeçalhos da base Vertentes. Isolados, passaram (15/15 de roundtrip e o ensaio de cabeçalhos). O worker passa a dois processos de teste simultâneos, como a suíte de avaliações já faz; os ensaios de compilação nativa e o cabeçalho da base grande recebem prazo próprio de 30 segundos. Assertions, casos, testes de isolamento e etapas de compilação permanecem. A prova definitiva continua sendo o gate completo, sem selecionar apenas os testes favoráveis.

A primeira CI do candidato recusou a divergência entre a função instalada e seu snapshot de conferência: a migração havia sido aplicada, mas a cópia ainda tinha 16/160/1,60/8 e teto 25. A cópia foi recapturada de `pg_get_functiondef` em produção, revisada (somente os cinco valores econômicos mudam) e fixada no manifesto com SHA-256 `4b8258c5a35315620dfaf551e591b108a3dcf58d80ae1b684191dfa4db0312de`. São 8.516 bytes; o verificador offline cobre 122 funções. Os recibos históricos foram preservados e a captura nova foi acrescentada com sua origem. Nenhuma migração aplicada foi editada e nenhum checker foi afrouxado. A CI inteira precisa repetir no novo commit.

## Gates e retorno

Regressões de conflito de classe, conclusão de leitura parcial, tamanho de lote e identidade de linha falharam antes das respectivas correções. O gate completo v7 passou: 44 tarefas em cada etapa; web 1.687 testes, worker 2.485 (uma pré-checagem condicional pulada), avaliações 298 e extração 63 testes de fonte. Locks publicados e catálogos/consumidores aprovados. CI, medições v7 restantes e promoção continuam pendentes. Migração `20261029163644_document_processing_budget_headroom.sql`, descrita abaixo; nenhuma tabela, assinatura, permissão ou política foi alterada. Não há nova fonte de dados, conclusão de crédito ou aprovação de R1/R2/R3.

Controles afetados: AI-01/AI-05/AI-08/AI-09, DOC-06/DOC-09/DOC-10 e CLOUD-01. Mantidos revisão humana, declarações de escala, separação entre fato e cálculo, autorização por arquivo e recusa de entrada não verificada. A classificação correta em um corpus não prova qualidade universal de documentos.

Retorno: pausar o transporte de avaliação pelo comando `private.release_governed_evaluation_transport_v1` e restaurar a imagem/commit anterior se o candidato for promovido e depois apresentar regressão. Não apagar recibos nem fontes. A credencial do avaliador não concede leitura de outros clientes.

Fontes de condições: [OpenAI, data controls](https://developers.openai.com/api/docs/guides/your-data), [Anthropic, thinking troubleshooting](https://platform.claude.com/docs/en/build-with-claude/thinking-troubleshooting) e `docs/security/provider-processing/2026-09-21/REVIEW.md`. O prazo do schema OpenAI continua sem prova suficiente; a rota autorizada usa os atestados já existentes.
