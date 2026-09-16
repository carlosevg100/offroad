# Onda 4: abertura da etapa 5

Autorização: OK do fundador após o completion da etapa 3, em 16/09/2026. Escopo exclusivo: entidade e dossiê privado; etapas posteriores dependem de novo OK.

## Baseline observado

Main `5d73624cad869d17ad56eff3d3cab800acd44f64`, Quality 35127446387 aprovado. Consulta AWS em 16/09/2026: revisão 339, imagem `5d73624cad86`, 1/1, rollout completo, consumidor ativo, quatro alarmes OK. Observação limitada de operador, sem prova de permissões do papel OIDC nem certificação. Alarmes continuam sem ações de notificação.

Journals ao vivo mantêm as três migrações da etapa 3 nos carimbos conferidos no fechamento. Onze definições de funções de perfil de companhia, memória pública e contexto são idênticas entre ambientes. Nenhum DDL e nenhum dado de cliente foram alterados nesta abertura.

## Revisão da mudança prevista

Separar entidade pública comprovada de dossiê privado por organização. CNPJ comum não concede acesso a dossiês. Nome parecido gera candidato, nunca fusão. Identificadores e vínculos têm período e revisão; dados privados não são promovidos automaticamente ao catálogo público. Preservar `companies.id` e os consumidores atuais por adaptação autorizada. A autoridade permanece no avaliador PostgreSQL da etapa 3.

Controles afetados: isolamento de tenant, finalidade, barreiras, linhagem de identidade, não descoberta, auditoria e revogação. Antes do merge funcional serão exigidos testes de homônimos, isolamento com identificador público comum, vínculo datado, mudança de identificador revisada, negação sem grant e compatibilidade dos consumidores.

## Integridade e continuidade

As 63 evidências imutáveis/operacionais foram reconciliadas com o baseline e uma nova observação. Snapshot, contrato canônico, autoridade e fingerprint são renovados atomicamente. Inventário entregue da onda 3 arquivado em `history/wave-3-delivered-inventory.md`; revisão final e observação da onda 3 preservadas. As 18 lacunas permanecem com a mesma gravidade e responsabilidade. Esta abertura não comprova a implementação da etapa 5.
