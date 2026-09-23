# Etapa 17 / 3L: integridade persistida R01

Hashes conferidos só pelo writer não bastam para autorizar continuidade por metadados. O armazenamento passa a validar o SHA-256 dos bytes comprimidos e do JSONB textual de patches e drafts. Os CHECKs validam também as linhas existentes; divergência bloqueia a migração, sem recalcular hash ou substituir conteúdo automaticamente.

As mutações de histórico preservam identidade de organização, sessão, trabalho, dataset, patch e revisão. A guarda adquire sessão e trabalho com `FOR UPDATE NOWAIT`; o trigger de fragmentos adota a mesma regra. Conflito produz `40001` e exige repetir a transação inteira. Um trigger por linha pode chegar com tuple já bloqueado: não pode esperar pela sessão que outro produtor segura antes de escrever nesse tuple. O produtor e os loaders conservam sua ordem; os loaders não ganham locks nas linhas de fragmentos ou histórico.

Conteúdo e hash coerentes podem mudar no armazenamento privado. Isso altera o snapshot de preparo; não atualiza um recibo antigo nem autoriza cálculo. Digest comprimido não prova conteúdo descomprimido, tamanho, schema ou significado profissional. Replay do preparador fixado, pins completos e comparação atual continuam requisitos do vínculo à execução.

DELETE e cascades existentes não são proibidos pela nova guarda. A ausência do pai durante um cascade não ressuscita histórico. As FKs restritivas de draft, refresh, run, job, resultado e recibo permanecem: não há um purge geral novo. A regressão demonstra exclusão permitida e negação de continuidade quando a evidência desaparece, além dos bloqueadores anteriores. Dados de teste existem somente no banco descartável da CI ou em transação de staging com rollback.

`r01_persisted_evidence_integrity.sql` cobre adulteração, identidade, alteração consistente, histórico incompleto, grants e exclusões. `test-r01-integrity-concurrency.py` disputa com o produtor RPC real e com o preparo, nas duas ordens, sem desligar guarda. Fixtures históricas passam a calcular hashes de seus próprios bytes; testes que antes adulteravam a linha para verificar o loader agora comprovam a negação anterior, na escrita.

TRUST-APP-01, TRUST-AI-01 e TRUST-SDLC-01. Não há nova concessão, captura de dado, chamada de provedor, mudança do método ou ativação R01. Catálogo, journal, validação dos CHECKs, CI completa, staging e deploy exato pertencem ao completion. Esta especificação não declara a etapa 17 concluída.

Referências: [cláusulas de lock do PostgreSQL 17](https://www.postgresql.org/docs/17/sql-select.html#SQL-FOR-UPDATE-SHARE) e [ordem de locks e deadlocks](https://www.postgresql.org/docs/17/explicit-locking.html).
