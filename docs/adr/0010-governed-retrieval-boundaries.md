# ADR 0010: Fronteiras do retrieval governado

Status: accepted, implementação local aguardando validação do banco em CI

Data: 2026-08-24

Plano de referência: `docs/build/BULLETPROOF_EXECUTION_PLAN.md`

## Contexto

O pipeline já preserva documentos, âncoras, fatos reconciliados, cálculos determinísticos,
playbook, critérios estruturados de mandato e decisões de publicação. Uma busca vetorial única
sobre todo esse universo destruiria fronteiras importantes: poderia misturar organizações,
promover uma nota informal a critério de elegibilidade, tratar um precedente sem consentimento
como autorização ou usar orientação do playbook como evidência do case.

Retrieval deve reduzir o contexto entregue ao modelo sem se tornar uma nova fonte de verdade. A
qualidade da resposta continua dependente da evidência ancorada, dos motores determinísticos e dos
gates já existentes.

## Decisão

1. Existem quatro fontes separadas: evidência do case, House Playbook, notas abertas de mandatos e
   precedentes governados. Elas mantêm contratos, políticas e citações próprios.
2. Evidência do case é indexada somente a partir da camada determinística do parser. Cada chunk
   carrega organização, sessão, oportunidade, documento, versão, run, hash e âncora. Ela não recebe
   embedding e nunca cruza organização ou oportunidade.
3. O House Playbook é versionado e somente uma versão explicitamente aprovada governa uma run. Sua
   orientação pode instruir o redator, mas não pode ser citada como prova de um fato da empresa.
4. Critérios estruturados de mandato executam antes de qualquer recuperação semântica. Embeddings
   existem apenas para notas abertas dos fundos que já passaram pelos filtros duros. Sem um id de
   fundo permitido, nenhuma nota desse fundo pode ser recuperada.
5. Precedentes exigem, em toda leitura, autorização ativa para o propósito pedido, anonimização
   aprovada, governança aprovada e prazo válido. Revogar a autorização remove o precedente do
   resultado sem reconstruir o índice.
6. O worker é o único escritor do índice do case. A escrita exige a capability temporária do job e
   o hash SHA-256 exato do conteúdo. Usuários autenticados podem apenas ler seus chunks quando a
   política da própria oportunidade permitir.
7. A recuperação sempre devolve citação, score, versão do playbook e abstention explícito. A trilha
   de auditoria guarda somente hash da consulta e ids dos resultados, nunca consulta, passagem,
   documento ou valor financeiro.
8. A aplicação pública recebe somente lineage sem conteúdo. Identidades de fundos, passagens de
   notas e resultados completos permanecem no resultado privado do job.
9. Embeddings não substituem filtros, fatos, cálculos, reconciliação, parecer ou aprovação. Na
   ausência de contexto autorizado e relevante, o sistema se abstém.

## Consequências

- Não existe um índice vetorial global de documentos de clientes.
- A busca lexical ancorada é suficiente para cases e playbook; o único vetor desta fase pertence a
  notas abertas de mandatos já filtrados.
- Alterar a versão aprovada do playbook muda o fingerprint da análise.
- Um modelo nunca recebe notas de fundos excluídos pelo screening estruturado.
- O custo operacional cresce de forma controlada porque chunks são derivados uma vez por versão de
  documento e o retrieval é limitado por fonte e escopo.
- A migração e os testes de não interferência precisam ser reconstruídos do zero no CI antes de
  qualquer aplicação no banco de produção.
