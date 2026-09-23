# Etapa 17 / 3I: recibo privado e preparo sob limite

`r01-preparation-execution.ts` repete o pacote técnico fixado e executa readiness do motor publicado em thread terminável, sem credenciais, com limites de memória, tempo e bytes. Só devolve entrada após igualdade com a entrada validada pelo método. História adulterada, versão ausente, insuficiência e cancelamento não viram cálculo. Isso ainda é uma condição necessária; não é permissão.

`private.r01_preparation_receipts` registra a afirmação do worker e o snapshot que o banco recarrega: identidades derivadas de job/capability, tentativa, preparador e motor, histórico, respostas, fontes/direitos e entrada canônica. O hash do snapshot SQL usa JSONB::text e não é confundido com o hash canônico da entrada financeira. Recibo imutável, tenant composto, RLS forçada, auditoria sem conteúdo e nenhum grant público. A recusa de execução R01 permanece intacta.

Adoção sem binding dimensional continua negada. `asserted_value` já é normalizado; scale registra a origem, sem nova multiplicação. Não há publicação de parâmetro profissional ou concessão nova pela mera existência do recibo.

Os testes compartilham setup sintético de fontes e o perfil R01, sem duplicar os dados. A prova compara o perfil compartilhado com a derivação independente. JSON de teste novo fica em `packages/testing-fixtures`. A migração também ajusta a volatilidade do helper de hash e os casts de inicialização apontados pelo lint do 3H, sem reescrever migração aplicada.

TRUST-APP-01, TRUST-AI-01, TRUST-SDLC-01. Antes de ligar request/claim: serialização da pausa e revogação, predicado corrente eficiente sem retransmitir blobs, replay independente obrigatório, vínculo completo das fontes e compatibilidade dimensional. Acesso por job não significa suficiência profissional. Nenhum wrapper público ou consumidor deste recibo é habilitado aqui. Migração em ambos ambientes, SQL real, revisão, CI e deploy são requisitos do completion; testes locais não os substituem.
