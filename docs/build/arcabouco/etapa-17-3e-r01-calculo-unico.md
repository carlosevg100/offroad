# Etapa 17 / 3E: um cálculo R01, duas projeções

`buildReceivablesVertical` calculava R01 no shadow e `releaseReceivablesSpecialistAnalysis` o calculava novamente para montar a apresentação liberada. Igualdade de fingerprint não provava uma única execução. Este incremento elimina o segundo cálculo e preserva os bytes do método publicado, seu readiness e os quality checks.

O resultado shadow é congelado recursivamente e associado, em uma WeakMap privada do módulo, à cópia dos inputs usados. A projeção liberada exige esse mesmo objeto emitido localmente e inputs iguais, incluindo fase de preparação, detecção e montagem. JSON carregado ou copiado não é recibo de cálculo. Mudança de dados é recusada; não dispara recálculo oculto. Política, binding de método, integridade do artefato, tenant declarado, escopo e dataset continuam conferidos na projeção; o banco conserva as verificações atuais de publicação e acesso.

`case-analysis.ts` passa o resultado já calculado. A antiga função privada capaz de executar nos dois modos é substituída por `calculateShadow`; a função de release apenas projeta o resultado existente. O objeto publicado mantém formato, método, versão, evidências, checks e fingerprints anteriores. Não há DDL, migração, grants, novos RPCs, mudança da release ou alteração do motor.

## Limite e continuidade

O vínculo local evita recálculo e substituição dentro do processo; não comprova proveniência SQL nem concede acesso. A cópia dos inputs permanece em memória enquanto seu shadow estiver vivo, sem cache global de entradas, persistência adicional ou telemetria de conteúdo. Não se mede redução de latência em produção a partir da contagem de chamadas no teste.

`execution_r01_provenance_unavailable` e claims capital-only permanecem. A engenharia de execução deve completar, no próximo vínculo do incremento 3, o recibo persistido de preparação com escopo/fragmentos, patches, mapa de valores e referências autoritativas, antes de autorizar a fila. Confirmar origem especialmente em project_context e user_confirmation: texto de sourceId/anchor e suppliedBy não serve como autoridade. Nenhuma mudança na ordem das etapas, início da 18 ou ativação de clientes.

## Verificação

Oito testes novos provam uma única chamada real ao motor para as duas projeções/replay, bytes iguais ao artefato publicado, recusa de clone/forja, alteração de montagem/fase/detecção, cópias equivalentes de inputs, artefato adulterado e pausa sem recálculo. A regressão anterior, os casos R01 publicados, capital integrado e navegação permanecem gates. Completion registra CI, merge, web/worker no mesmo commit e journals sem mudança; este documento não antecipa esses resultados.

TRUST-APP-01, TRUST-AI-01, TRUST-SDLC-01. Revisão independente estática sem bloqueio; nenhum dado/provedor/efeito novo. Rollback da imagem restaura o código anterior, sem banco a desfazer. A prova durável de revogação, retry e contabilidade R01 continua no vínculo SQL; não inferir sua conclusão deste recibo local.
