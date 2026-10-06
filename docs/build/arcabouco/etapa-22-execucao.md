# Etapa 22: auditoria, retenção e revogação

Autorizada pelo fundador em 06/10/2026. Baseline publicada: main `90e3c7d248cb4ba604a4519fd08239054b28f14a`; etapa 21 concluída. Esta etapa permanece aberta até os gates e a publicação completa.

1. **Contratos e barreiras.** `end_to_end_revocation_and_retention`: registros privados `revocation_runs`, `revocation_targets`, `retention_rules`, `legal_holds`, `retention_actions` e identidade física imutável `artifact_export_object_identities`. Os cinco RPCs administrativos do roteiro derivam contexto atual do administrador. Nenhuma projeção ampla por membership; nenhum prazo automático para documentos de clientes. Expiração é negada no ponto de uso, independentemente da fila. Auditoria é append-only e a exportação tem allowlist sem metadata financeira. Hold nunca concede leitura.
2. **Consumidores e recibos.** `apps/document-worker/src/retention-worker.ts`: planejamento e execução limitada por leases, tentativas e destino; Storage API para exclusão e comprovação física de ausência; hold verificado no banco e na fronteira de destruição; transporte e prova de auditoria em armazenamento separado. Todo destino começa pendente; nenhum recibo é inferido de uma intenção ou de um ACK de outro destino. Revogação de uma pessoa não apaga dados compartilhados autorizados para outras pessoas.
3. **Verificação e publicação.** SQL transacional, testes do worker, navegador e corridas reais; negação entre busca/leitura/chamada/escrita/download, restauração sem ressurreição, alarmes e políticas de armazenamento. Migration journals e catálogo conferidos nos dois ambientes, CI main verde, web/worker no mesmo merge SHA e completion de seis itens.

## Decisão sobre os recibos Office

O recibo continua imutável e com uma FK de identidade exata. A FK passa da metadata efêmera do Storage para um ledger privado com o mesmo object ID, tenant, path, SHA-256 e tamanho. O backfill conserva os bytes históricos dos recibos; novos registros exigem objeto real e identidade exata. Exclusão posterior dos bytes não remove nem reescreve o recibo. O teste SQL prova o contrato de FK; a exclusão física só será declarada por teste da API e recibo do worker.

## Critérios e limites

- Os seis destinos controlados são `authority_outbox`, `search`, `cache`, `jobs`, `artifacts` e `storage`. O status só pode ser completo com os seis recibos. Limpeza atrasada dispara alarme e não reabre autoridade.
- Regras de retenção referem um recurso, uma revisão e uma evidência contratual opaca. Nenhum conteúdo de contrato ou documento vai para o log.
- Hold conserva o objeto, sem restaurar acesso, execução, divulgação ou revisão.
- Dados e contas sintéticos somente no CI local ou transação revertida em staging; produção recebe schema/configuração e verificações sem fixtures.
- Telas administrativas aguardam tenant que as exija. Office nativo e intercâmbio entre organizações permanecem posteriores. A cópia já baixada por uma pessoa não é apagável remotamente.
- O fundador dá OK por onda e aprova conteúdo profissional do procedimento. Não há pedido novo de recertificação manual ou retenção zero.
