# Etapa 21 : diagnóstico do run final e isolamento das avaliações

Registro do run [37350576844](https://github.com/carlosevg100/offroad/actions/runs/37350576844), job Database `111900113827`. O log do job concluído foi lido pela API enquanto os demais jobs continuavam. Este documento registra falhas e a correção de organização do eval; não é completion.

## Fixtures comprometidas antes dos contratos gerais

O passo de captura do catálogo executava também `scripts/ci/test-artifact-roundtrip-concurrency.py`, antes de `Run all database contract tests`. Cada `setup(number)` desse script confirma sua preparação com `COMMIT`, necessário às duas sessões reais. A prova não termina em rollback: os namespaces `a541…`, `a542…` e `a543…` e a base institucional auxiliar continuam no banco descartável.

O primeiro erro do run, `advisor_semantic_dag_activation.sql:235`, recebeu um job `case_analysis` da organização `a5410000-0000-4000-9000-000000000001`, criado pelo primeiro setup da race. Outros contratos de claim receberam o mesmo job; avaliações de ancestry e de dependências também encontraram linhas auxiliares persistidas. As três races haviam passado, mas sua posição contaminava os contratos executados depois.

A correção definida mantém as races no PostgreSQL real do mesmo stack e as executa como última avaliação do job Database. Depois delas só há parada dos processos e destruição do stack com `supabase stop --no-backup`; nenhum contrato SQL ou SDK consome suas fixtures. Não é necessário um banco adicional quando essa ordem está garantida. As provas sequenciais da etapa 21 permanecem antes dos contratos gerais, com rollback.

A revisão do script confirmou que a segunda race cancela somente sua própria tarefa pendente antes de a terceira pedir um lease; a terceira encerra ou mata sua sessão leitora no `finally`. Não há worker geral em execução no job Database. O fim do stack, inclusive em falha, elimina as linhas comprometidas; não se tenta apagar recibos imutáveis ou alterar grants para facilitar limpeza.

## Negativa de outra família sem produtor preparado

O SDK do preview terminou com `preview_storage_other_family_fixture_required`, na prova `capital_preview_storage_job_authority_actual.sql:28–29`. O helper procurava uma allocation global com `content_kind <> 'preview_body'`, mas nenhuma estava disponível depois da limpeza das avaliações anteriores. A negativa dependia de resíduo alheio em vez de preparar sua própria base.

A correção definida prepara uma allocation de outra família pelo produtor legítimo e entrega sua identidade explícita à prova. A negativa continua exigindo que a autoridade do preview a recuse. A ausência da fixture não se transforma em PASS, e o guard de produção não muda.

## Alcance da verificação

Os checkers de inventário, os journals de produção e staging e os 73 corpos da etapa 21 já passaram na conferência após aplicação. As falhas deste run são de composição do harness, identificadas por erros reais; a validação do novo ordenamento e da nova fixture depende do próximo run completo. Nenhuma DDL, política, carimbo ou condição de acesso foi alterada para resolver essas falhas.
