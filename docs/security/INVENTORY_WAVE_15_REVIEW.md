# Onda 15: isolamento de executores publicados

Revisão da mudança material autorizada antes da etapa 15. Complementa a etapa 13 e
antecipa somente o isolamento por release da 17. Baseline observada em 19/09/2026:
`d694951b11b6733a218b6c1b2037267784c7c815`. Quality 35462667545, Security
35462667618 e worker 35462667508 aprovados. ECS 377, commit exato, 1/1, saudável.

As 195 referências anteriores foram resolvidas nesta baseline, sem reduzir os controles
ou as 18 lacunas gerais. Inventário anterior preservado em
`history/wave-14-delivered-inventory.md`. Cadência por onda e por mudança material mantida.
A coleta é leitura operacional, não avaliação independente de IAM ou certificação.

Produção e staging conservam o manifesto R01 e a aprovação originais. Journals com 357 e
371 versões, respectivamente. Três definições de publicação/referência/retirada idênticas.
Nenhum DDL, fixture em produção, novo método aprovado ou chamada a modelo. Os quatro alarmes
estão OK e ainda sem destinatários; a correção permanece atribuída à etapa 18.

Risco desta mudança: conservar apenas manifesto com executor mutável daria falsa reprodução.
O desenho vincula arquivo de fontes, toolchain, hash do artefato e identidade usada pelo worker.
As provas da implementação entrarão no inventário de fechamento depois de integradas em main;
esta abertura não declara os novos controles entregues. APP-11, AI-08, SDLC-02/04/10 aplicáveis.
Dependências congeladas exigem revisão de vulnerabilidades e nova versão quando corrigidas.
