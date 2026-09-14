# Revalidação do conteúdo do inventário: onda 1

Baseline remota revalidada em 14/09/2026: `8bdc26d9df96af713d2769599bb0fdd5234eb6d0`. Baseline anterior: `b2e389757995859cf6a0b250e051d83ba0b53163`. Esta revisão registra arquitetura observada em código e limites das consultas; não declara remediação ou auditoria de produção.

## Mudanças de conteúdo preparadas

| Objeto | Mudança e fonte |
|---|---|
| Avaliações documentais | `document-work-product-live.yml` e `document-work-product-continuation.yml` entram como evidências; ampliam os fluxos existentes GitHub→Secrets Manager/Anthropic/OpenAI e a identidade de avaliação OIDC. Não criam outra role nem outro provedor. A continuação usa Anthropic e artefato de execução anterior; somente o workflow principal usa OpenAI. |
| Scanner de CI | `documentary-scanner.yml` e `start-documentary-scanner.sh`: duas entradas de supply chain, Ubuntu packages e ClamAV definitions; fluxos de aquisição separados e identidade local `ID-CI-CLAMD`. Execução incorporada ao sistema GitHub/runner já existente. Script exige freshclam e controles sintéticos, preserva AppArmor e loopback; não foi executado nesta revisão. |
| Diagnóstico de worker | `verify-worker-boot-flag.py` e workflow de deploy: novo fluxo `FLOW-GITHUB-WORKER-DIAGNOSTICS`. O script retorna sucesso quando a leitura AWS está indisponível; apenas contradição de flag reprova. Uma etapa verde não equivale a boot comprovado. |
| Worker | `main.ts`, `config.ts` e task definition revalidados: flag documental, montagem de marca, inspeção de render, jobs de proposta/research/case-fit e logging de chamadas. São ampliações do worker existente, sem identidade/serviço externo adicional. |
| 1A | Gap `SG-CREATOR-RESIDUAL-AUTHORITY`, com a definição SQL histórica de autoridade por criador. Continua pendente de reprodução e correção. |
| 1B | Gap `SG-PROJECT-MEMBERSHIP-READ`, com helpers SQL de projetos e intake; registra backfill automático de criador/administrador e administração pelo cliente como direção aprovada, não implementação existente. |
| 1C | Gap `SG-PROFILE-ANALYTICAL-DEPTH`, com três fontes de prompts. Constata instrução no código; não inventa diferença empírica de respostas. |
| Provedores | Ação do gap orientada à etapa 16: termos atuais, não treinamento e retenção limitada; retenção zero como possibilidade comercial futura. Flags de configuração não provam termos de conta ou estado live. |

Resultado do conteúdo: 41 evidências, 6 ambientes, 8 sistemas, 8 armazenamentos, 28 fluxos, 12 identidades, 19 fornecedores e 21 gaps. Não foram adicionadas certificações ou claims de remediação. Relações canônicas de entidades/gaps foram atualizadas junto das declarações.

## Observação nova, datada e limitada

Arquivo preparado no worktree: `docs/security/evidence/aws-worker-rollout-diagnostics-2026-09-14.json`.

- Coleta: `2026-09-14T21:41:19.418739Z`.
- Coletor: `codex-read-only-github-observation`, versão `1`, principal `repository automation using the existing local GitHub session`.
- SHA-256: `2ca8cf4f4f6e243d06ec0fabcb7cfc4505d331a4fc92e9e145f106e755d9e715`.
- `freshness: wave_bound`, `waveId: wave-1`, `validThrough: null`; não foi estendida a observação humana antiga.
- GitHub API consultada novamente: último deploy retornado `34551966644`, commit `da3157b74ea93b49212774d0337931567ec695b7`, concluído com sucesso em 11/09.
- Log específico do passo de boot: `bootProof: unavailable_aws_read`, flag e timestamp nulos.
- AWS CLI local: `sts get-caller-identity` retorna `NoCredentials`. Isso não significa IAM deny.
- Sem políticas IAM, receipts de simulação ou inventário live atual do ECS, o gap permanece aberto. Nenhum secret, payload de cliente ou log bruto de worker foi incluído no JSON.

## Limite desta entrega

Conteúdo e fonte de observação preparados em `.worktrees/wave1-security-inventory`. O agente principal finaliza contrato de revisão por onda, hashes da baseline, fingerprint integral, testes, renderização, CI e publicação. Contrato, hashes, fingerprint e renderização foram concluídos nesta PR. `pnpm check` passou em Node24, com188 testes de release-governance e43 tarefas de build aprovadas. A revisão independente não encontrou bypass novo. CI remota, merge e deploys continuam necessários; esta nota não é completion da Etapa0.
