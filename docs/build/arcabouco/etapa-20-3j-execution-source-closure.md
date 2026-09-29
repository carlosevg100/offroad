# Etapa 20 / 3J: fontes de resultados de execução

## Problema e correção

A reprodução em staging retirou somente `read` da fonte de uma observação adotada. O resultado antigo continha zero fontes no manifesto e continuava legível e revisável. O fechamento passa a resolver as referências imutáveis da execução: fontes diretas, versão da base, decisão, observação, definições e referências reconhecidas no snapshot. Cada par versão/licença permanece distinto; referência ausente recusa o fechamento.

A autoridade de leitura exige conta ativa, trabalho, recursos/dossiês, direitos fixados e atuais de leitura/armazenamento e dependências transitivas. Não depende de licença para recalcular, lease, publicação atual do motor ou cabeça atual da base. A referência do artefato confere execução, trabalho e fingerprints do recibo. Ancestrais e fontes adicionais dos derivados entram na mesma verificação. O resultado bruto e a projeção obedecem à mesma autoridade.

Novas projeções registram todas as fontes. Revisões históricas mantêm o manifesto original e são protegidas pela closure derivada dos registros fixados, sem fabricar captura retrospectiva. O construtor antigo só é aceito para replay quando manifesto, blocos e links continuam exatamente iguais. Replay idêntico requer leitura; criar derivado novo requer também `derive`, tanto por ancestral de artefato quanto por referência direta à execução.

O dossiê nulo de definição não é um escopo organizacional autorizado: o comando exige dossiê e conserva `dossier_reference`; a FK permite nulo após exclusão. Referência órfã é recusada. Hash nulo de fonte histórica é preservado como nulo; não representa prova de bytes. Fontes diretas continuam conferindo o hash declarado no contrato.

O primeiro run da CI revelou um contrato antigo que confundia leitura com autorização de recalcular. A migração aditiva `20260929163005_execution_result_read_freshness` preserva `inputsCurrent` e separa a autorização para entregar bytes. O recibo imutável distingue os quatro estados de leitura/atualidade; a métrica existente só considera verificação com entradas atuais. Restauração de direitos registra nova leitura sem sobrescrever a histórica. A checagem final também recusa perda de atualidade durante a gravação do recibo.

## Implementação

- Migração `execution_result_source_closure`: quatro helpers privados, sem grants de cliente, e substituição literal dos leitores, produtor e escritor comum.
- `supabase/tests/execution_artifact_source_closure.sql`: fontes apenas na base, histórico omisso, replay, notas, resultado bruto, derivados e revogação de leitura/derivação.
- `supabase/tests/execution_artifact_closure_references.sql`: três origens, duas licenças da mesma versão, referências standalone e expiração da licença fixada apesar de licença atual ampla.
- `scripts/ci/test-execution-source-closure-concurrency.py`: quatro interleavings reais de leitura/revisão e revogação; exige banco local descartável e integra o job database.

## Evidência e estado

Ensaios transacionais em staging chegaram à exceção sentinela obrigatória de rollback para as duas suítes novas, recuperação de artefato e protocolo geral de artefatos. Journal sem entrada do preflight, helpers ausentes, fixtures ausentes e hash da função original conferidos após rollback. O primeiro ensaio revelou comparação de hash nulo e a regressão revelou ordem de validação de alvo inexistente; ambos corrigidos antes de qualquer instalação permanente.

Gate local `pnpm check` passou. Staging recebeu `20260929160225_execution_result_source_closure`, SQL MD5 `cc1e0202ce64689e8737273cf47dbcdd`. As duas suítes novas e recuperação passaram também sobre a instalação; security advisors zero. Concorrência, CI final, produção, catálogos, merge e deployments continuam pendentes. Este documento não declara completion.

## Segurança e operação

Controles IAM-05, APP-04, APP-11, AI-09 e SDLC-08/10. Dados: fontes, observações, premissas, cálculos e notas privadas do trabalho; nenhum novo provedor, envio externo, credencial, retenção ou conteúdo em telemetria. Conta é protegida antes da política, com NOWAIT para evitar inversão; direitos e prazos são rechecados após esperas. Recusa tardia no resultado bruto desfaz também o recibo de leitura otimista. Revisor independente: `stage17_authority_review`.

Rollback não restaura o vazamento: uma falha exige correção aditiva ou contenção de leitura/projeção. Não alterar manifestos históricos, recibos, números ou journals para obter passagem. Uma projeção recusada mantém o resultado original e o motivo observável; recuperação continua sendo comando explícito.

A retirada da liberação automática por recibo e a interface de revisão humana do resultado vêm no incremento seguinte, conforme reagrupamento aprovado. Etapas 21–24 não iniciadas.
