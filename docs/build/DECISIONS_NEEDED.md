# Decisions Needed

Não há bloqueio para B0/B1 local. As decisões abaixo só precisam ser tomadas no gate indicado.

| ID | Gate | Questão | Recomendação | Impacto se adiada | Ação do usuário |
|---|---|---|---|---|---|
| D-001 | B1/B14 | O nome Offroad Capital está liberado nos mercados-alvo? | concluir busca jurídica, registral, domínio e handles antes de indexar ou anunciar | preview interno continua; lançamento público permanece bloqueado | indicar responsável e registrar parecer/clearance |
| D-002 | B2 | A única organização Supabase disponível, `Mr. Pickles`, receberá o projeto e a região será `sa-east-1`? | decisão concluída: development criado em São Paulo por US$ 10/mês | nenhum | concluído em 2026-08-14 |
| D-003 | B4 | Originais confidenciais ficam em Supabase Storage ou storage/worker isolado em `sa-east-1`? | interface de storage agora; originais production em worker isolado quando threat model/DPA exigirem | pipeline usa somente fixtures e interfaces | aprovar residência, custo e modelo operacional |
| D-004 | B10 | Quem conduz cada ato market-facing e qual parceiro regulado participa? | bloquear envio real até existir matriz instrumento-ato-parceiro aprovada | discovery pode ser construído; ativação real não | jurídico/regulatório aprova matriz e contratos |
| D-005 | B12 | Quais planos pagos de Sentry/PostHog são autorizados? | projetos separados por ambiente, replay off, budgets explícitos | adapters e schemas podem avançar localmente | aprovar fornecedor, plano, DPA e budget |
| D-006 | B14 | O domínio `offroad.capital` será delegado para DNS da Vercel ou continuará no GoDaddy? | decisão operacional: manter GoDaddy como registrar/DNS e apontar records mínimos à Vercel | domínio anexado, mas parking continua até a edição DNS | concluir login e alteração dos records |
| D-007 | B14 | Como criar `main` no repositório vazio sem violar o fluxo PR-only? | decisão concluída: commit raiz vazio em `main`; implementação segue por PR | nenhum | concluído em 2026-08-14 |
