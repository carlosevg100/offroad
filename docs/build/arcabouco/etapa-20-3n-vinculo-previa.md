# Etapa 20: 3N, vínculo corrente da prévia

## Contrato

`apps/web/src/app/[locale]/app/projects/[projectId]/preview/material/route.ts` relê `capital_project_artifacts` sob organização e projeto após baixar e verificar os bytes. Consulta apenas o tipo de arquivo e `preview_decision_contract`, exclui substituídos e usa o contrato mais recente. Arquivo fixado exige o mesmo SHA vinculado ao formato. Recibo legado exige ID, fingerprint e manifesto integral iguais aos usados para baixar o arquivo, além do vínculo atual. Um contrato novo que conserva o vínculo permite a entrega. Falha, ausência, alteração ou conteúdo inválido negam com 409 sem cabeçalhos de download ou fallback. A autoridade da revisão exata continua sendo a última checagem.

Preserva verificações iniciais, SHA/tamanho/caminho do objeto e gates do leitor. Sem DDL, novos grants, backfill, dependências, UI ou conteúdo profissional. DOCX permanece no contrato existente de revalidação da revisão.

## Eval

Vinte negativos falharam com 200 antes e passaram com 409 após: perda/desaparecimento do vínculo, erro/exceção de leitura para XLSX/PPTX fixados e legados; recibo substituído e conteúdo alterado no mesmo ID. Quatro positivos mantêm entrega quando contrato novo vincula os mesmos bytes. Três arquivos/65 testes PASS: rota, resolvedor de download governado e autoridade de revisão. Doubles mudam o estado durante Storage; não é alegação de corrida remota em produção. Revisão independente estática sem bloqueador.

## Segurança, riscos e operação

APP-02, APP-08, APP-11, DATA-03, DATA-09. Dados financeiros/derivados privados, sem log de conteúdo ou mudança de provedor. Abuso: entregar arquivo vinculado ao snapshot anterior após o contrato removê-lo. A segunda consulta nega esse caminho, sem substituir os controles iniciais.

Consultas e entrega HTTP não são operação atômica; alterações posteriores à consulta ainda pertencem à serialização/propagação de ponta a ponta da etapa 22. O 3N não fecha fontes legadas. Adaptadores e captura restantes seguem na etapa 20; 21–24 não iniciadas. Em incidente, conter a superfície e corrigir preservando a negação, sem remover a revalidação. Nenhuma migração para reverter.

CI, merge e publicação serão identificados no completion externo após verificação real.
