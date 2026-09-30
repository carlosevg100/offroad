# Etapa 20: 3M: revalidação de produtos de trabalho e prévias

## Contrato e escopo

Antes da resposta com bytes, `work-products/[fingerprint]/[format]/route.ts` e os dois caminhos de `preview/material/route.ts` releem o ID exato por `renderedRevisionStillAuthorized`. A releitura ocorre depois da geração/leitura do Storage, da conferência de bytes e do acesso ao projeto. O helper existente compara identidade, manifesto, hash, número, audiência, liberação e atualidade; fonte restrita, aprovação revogada, ausência ou erro de leitura negam a entrega. A negação usa resposta genérica sem cache nem cabeçalhos do arquivo; nenhum fallback de recibo é tentado depois dela.

Preservados escopo de organização/projeto, vinculação ao manifesto de leitura, renderer, template, direito atual no leitor SQL, SHA/tamanho/caminho do objeto e vínculo inicial do contrato da prévia. Sem migração, privilégio, componente ou efeito externo novo. Não modifica cálculo, conteúdo, versão ou histórico.

## Eval

Nos dois arquivos `route.test.ts`, dez casos novos reproduziram HTTP 200 antes da mudança, mantendo acesso ao projeto: fontes revogadas para DOCX/PDF do produto e DOCX/XLSX/PPTX da prévia; aprovação revogada para DOCX/PDF e XLSX/PPTX; recibo legado inacessível após Storage. Após correção, quatro arquivos/64 testes PASS, incluindo os 16 casos do helper e o resolvedor de download governado. Os doubles mudam a resposta de autoridade entre obtenção dos bytes e entrega: esta é prova automatizada de integração da rota, não reprodução remota ou corrida real de transações SQL.

Revisão independente: sem achados bloqueantes; ver limites abaixo. CI completa e publicação ainda pendentes neste registro de implementação; completion externo encerra a entrega com IDs reais.

## Segurança e riscos

Controles APP-02, APP-08, APP-11, DATA-03 e DATA-09. Dados financeiros e derivados continuam privados, sem logging de conteúdo. Abuso coberto: conservar bytes obtidos antes da revogação e entregá-los com autorização antiga. Falha de revalidação nega a entrega.

A releitura não forma transação distribuída com a resposta HTTP: bytes já entregues não podem ser recolhidos. Serialização e propagação completas seguem na etapa 22. O 3M não comprova fechamento das fontes dos produtores legados; captura e adaptadores restantes continuam na etapa 20. O binding do contrato da prévia continua conferido antes do Storage; uma alteração concorrente desse contrato exige tratamento no incremento correspondente de adaptadores, antes de encerrar a etapa 20. Não declarar essa corrida resolvida aqui.

Rollback operacional: desabilitar a superfície afetada se necessário e publicar correção preservando a negação; não voltar a entregar sem revalidação. Sem DDL para reverter. Nenhuma etapa 21–24 iniciada.
