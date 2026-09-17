# Etapa 9: adoção contextual e hipóteses

O trabalho escolhe uma observação ou registra uma hipótese com finalidade, contexto,
interpretação completa, ator e motivo. Uma escolha não promove o dado a oficial.
Cada comando fixa a revisão anterior; concorrência retorna conflito, sem último escritor vencedor.

## Objetos e autoridade

`assumption_sets` identifica trabalho/finalidade/contexto. `adoption_decisions` conserva
contribuições; `assumption_versions` fixa o snapshot e SHA-256; a tabela privada
`assumption_version_items` normaliza referências imutáveis. A escrita ocorre somente pelas
RPCs `adopt_observation_for_work_v1` e `propose_assumption_revision_v1`, em transação com audit/outbox.
As três tabelas públicas têm RLS forçada e apenas SELECT para authenticated. O vínculo privado
é imutável e sem acesso direto; não tem ciclo de atualização próprio nem concede autoridade.

Leitura, comparação e cálculo revalidam trabalho, entidade, definição, observação e direitos
fixados e atuais da fonte. A retirada de read, derive ou store nega o derivado. Definição
contratual mantém contrato/âncora e não admite reinterpretar observação reportada como covenant.
O snapshot contém dados privados e não pode ser servido de cache sem essa revalidação.

## Integração

A rota `/[locale]/app/projects/[projectId]/basis` permite escolher fontes, registrar hipóteses,
reabrir revisões e comparar a revisão anterior. Identidade e definição são explícitas; o
comando de identidade reutiliza o identificador revisado no mesmo dossiê, sem inferir pelo nome.
O cálculo de alavancagem usa duas escolhas explícitas, contexto compatível e financial-core;
o resultado acompanha versão do motor, versão da base e fingerprint. É cálculo de trabalho,
sem publicação de método ou artefato aprovado.

`calculation_runs`, `structure_scenarios`, `scenario_versions` e `claim_decisions` possuem vínculo
não nulo com base/fingerprint. Produtores legados recebem referência `legacy_execution`, com
`inputAvailability=not_reconstructed`: não inventam inputs ausentes nem aprovação retroativa.
A alteração posterior do vínculo ou escopo é recusada. A adaptação institucional escolhe entre
todas as observações pela fonte explicitamente configurada; `.accepted` só lê snapshots antigos
sem coleção de observações, com validação de integridade e bloqueio de conflito legado.

## Verificação e riscos tratados

- `contextual_adoption.sql`: idempotência, CAS, orçamento/realizado, precisão, contribuição sem
  sobrescrita, contrato, imutabilidade, audit/outbox, membro sem grant e revogação da fonte.
- `contextual_adoption_dependencies.sql`: retirada de derive/store apesar de read vigente;
  identidade repetida não duplica e identidade conflitante não sobrescreve.
- `contextual_adoption_execution.sql`: produtores legados, vínculo explícito, fingerprint
  incorreto, histórico rotulado e negativa de leitura por membro sem concessão.
- `test-adoption-concurrency.py`: duas conexões reais na CI local observam lock e um único
  vencedor. Fixture exclusivamente no stack descartável local; nunca em produção.
- E2E `contextual-adoption.spec.ts`: cria identidade/definições/hipóteses pelo produto, calcula,
  revisa e reabre a versão anterior; screenshot desktop/mobile e ausência de overflow.
- Testes puros: escopo/fingerprint, leitura explícita independente de ranking, hipóteses,
  contexto monetário e repetição do resultado sob mesma base/versão do motor.

Limites explícitos: 256 escolhas por base; 25 observações por página; últimas 50 revisões no
seletor, com versões anteriores ainda endereçáveis por identidade. Falha de acesso nega a base
inteira, sem comparação parcial que exponha referência revogada. Futuras versões do motor
precisam conservar o executor da versão fixada; este incremento identifica a versão vigente,
sem afirmar um catálogo de executores históricos ainda inexistente.

As 18 lacunas gerais permanecem nos incrementos responsáveis. Auditoria ponta a ponta e
notificações são etapa 18; retenção por provedor, 16; expurgo/restore, 22. Trabalho sem companhia
é etapa 10 e não foi antecipado. Biblioteca profissional segue em autoria, sem publicação.

## Entrega em curso

Cinco migrações instaladas em staging/produção; 23 funções idênticas, SQL dos journals
idêntico por nome e 56 superfícies novas inventariadas. Produção tem zero linhas nos objetos
novos; nenhuma fixture foi criada. Advisors de segurança sem achados nos dois ambientes.
80 contratos SQL anteriores/adoção passaram em staging, mais dois novos contratos de
execução/direitos. `pnpm check` passou localmente. CI da PR, merge, implantação exata e
conciliação de segurança continuam obrigatórios antes de declarar a etapa concluída.
