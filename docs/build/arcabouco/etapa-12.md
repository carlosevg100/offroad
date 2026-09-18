# Etapa 12: cofre e publicação humana

O cofre mantém entrada, versões imutáveis, pedido de revisão e ato de publicação separados.
`vault_scopes` integra a raiz organizacional ao registro canônico de recursos. Criar uma
entrada concede colaboração revogável; gestão não implica publicação. O administrador do
cliente designa leitores e publicadores no produto, por grants canônicos e sem intervenção
obrigatória da Offroad. As barreiras e a identidade vigente continuam sendo a autoridade.

A revisão fixa a versão, o fingerprint, a finalidade, o trabalho opcional, a justificativa
e a publicação anterior. Publicar exige pessoa autenticada com alçada explícita e verifica
novamente versão, audiência e direitos atuais. O lock organizacional serializa a publicação
com alterações de autoridade. Repetir o mesmo ato é idempotente; uma retirada não pode ser
ressuscitada por retry. Uma versão candidata posterior não substitui o conteúdo publicado.

As fontes e adoções são referências, sem copiar bytes. `vault_source_dependencies` fixa os
direitos de origem. Diretivas derivadas preservam dependências ao revisar, mesmo quando a
lista recebida as omite. Uma nova referência humana a uma fonte pode fixar a licença atual,
sem alterar a versão antiga. Exportação exige finalidade compatível e operação `export`.
O fingerprint do template referenciado impede uso de definição alterada desde a revisão.

## Interface e transição

`app/vault` oferece candidatos, publicados, revisão, nova versão, histórico, retirada e
designação de publicadores. Cada trabalho recupera referências publicadas autorizadas;
rascunhos só aparecem quando a pessoa pede candidatos e tem a alçada necessária. Busca e
listas são paginadas. O registro de publicação permite retirar referência cujos direitos
expiraram sem revelar seu conteúdo. Nenhum novo conteúdo do cofre é enviado a modelos ou
incorporado a jobs antes do contrato de execução das etapas 17/18.

Os 28 documentos históricos de produção receberam versões candidatas com proveniência,
sem atribuir autor humano ao importador e sem fabricar ato de publicação. O playbook
`2026.08.24-v2` conservou os oito trechos no catálogo original, como candidato de plataforma:
a migração de agosto era sua única aprovação. A elegibilidade agora exige aprovação humana.
Essa biblioteca global não é copiada para cada tenant nem confundida com release executável;
sua publicação de método pertence às etapas 13/14. O método de recebíveis aprovado pelo
fundador usa seu registro próprio, preservado. `organization_methodologies`, sem consumidor,
continua congelada; templates existentes são configurações explícitas de identidade visual,
não atos de publicação no cofre. Nenhum desses caminhos cria `vault_publications`.

## Verificação da implementação

- `human_vault_publication.sql`: criador e worker sem publicação, gestor sem alçada,
  versão exata, revisão vencida, finalidade fixada, retirada e revogação do criador.
- `vault_scope_isolation.sql`: restrição de trabalho, leitor sem candidatos e workspace errado.
- `vault_export_authority.sql`: finalidade não substitui operação, licença fixada, nova revisão,
  revogação em busca e retirada por recibo sem conteúdo. Falha reproduzida antes da correção.
- `vault_derived_rights.sql`: derive obrigatório e restrição herdada apesar de omissão.
- `vault_legacy_publication_evidence.sql`: aprovação por migração não é humana; bytes preservados.
- `rls_non_interference.sql`: catálogo, grants, acesso direto e recuperação antiga sob as barreiras.
- `test-vault-publication-concurrency.py`: duas sessões reais observam lock e rejeição da segunda revisão.
- `vault-publication.spec.ts`: duas pessoas criam, revisam, designam publicador, publicam e retiram
  pela interface; candidata nova não altera a versão lida. Capturas desktop/mobile.
- `vault.test.ts` e `access-policy/contract.test.ts`: limites da entrada, identidade da revisão,
  finalidade e separação entre gestão e publicação. Catálogos PT/EN e mensagens cliente verificados.

As cinco migrações têm SQL idêntico nos journals dos dois ambientes. Produção:
`20260918105943`, `20260918105947`, `20260918105952`, `20260918105956`, `20260918111441`.
Staging: `20260918102152`, `20260918102750`, `20260918104550`, `20260918105110`, `20260918111340`.
O catálogo de etapa zero inclui 77 superfícies novas e os checkers passaram nos dois ambientes.
92 contratos SQL passaram em staging, sem fixtures persistidas. O advisor de segurança está
sem lints nos dois ambientes. CI da implementação, publicação web/worker e revisão visual
serão registradas no fechamento; este documento não declara esses gates concluídos.

## Riscos e incrementos responsáveis

Etapa 13/14: contrato de procedimento e publicação de métodos com conteúdo aprovado pelo fundador.
Etapa 16: elegibilidade real de provedor/modelo/recurso, sem requisito de retenção zero.
Etapas 17/18: fixar referências do cofre no manifesto de execução e propagar retirada aos
consumidores persistentes, caches e jobs. A consulta atual revalida autoridade a cada leitura.
Etapa 18: completar destino operacional dos alarmes AWS, que hoje têm estado OK sem ação.
Etapa 23: auditoria e revogação de ponta a ponta. Nenhum desses riscos é tratado como resolvido
pela existência da tela ou por um registro no banco.

Controles: autorização mínima e segregação de funções; isolamento de tenant; proveniência e
integridade; direitos de uso; auditoria sem conteúdo. Não há provedor novo, coleta de telemetria
nova nem dados descartáveis em produção. Contenção: retirar publicação ou revogar grant;
histórico imutável permanece. Não reverter migrações apagando os atos humanos.

A escrita direta de `service_role` nas duas tabelas de playbook foi revogada. O teste negativo
nega reativação da aprovação e alteração de trechos; o teste completo de recuperação por
capability passou novamente em staging. A leitura do worker permanece no comando limitado.
