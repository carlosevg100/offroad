# Etapa 17/2B: revisão independente do núcleo fechado

Revisor: agente `stage17_authority_review`, distinto do implementador, em 22/09/2026. Escopo: comandos SQL, três migrações iniciais, persistência anterior, predicados usados e teste concorrente; depois, migração de direitos correntes e provas adicionais. Revisão somente leitura; não é execução de teste nem aprovação de conteúdo profissional.

## Achado e correção

P1: os direitos fixados exigiam read, mas os direitos correntes eram revalidados somente para process/store/derive. Retirar apenas read ainda permitia o commit. O implementador reproduziu a falha em staging para fonte direta e fonte de uma adoção, antes de corrigir.

A migração `execution_current_read_rights` adiciona read nos dois predicados existentes, incluindo dependências transitivas. Os mesmos testes passaram depois. As provas de dependência transitiva e retirada/troca de release depois do claim também passaram em staging. O revisor conferiu os deltas e as evidências e considerou o P1 corrigido.

O revisor pediu prova concorrente contra commit nas duas ordens e contra retirada de release. O harness foi ampliado; usa o recibo real de claim em memória e observa espera por lock entre duas conexões. Também foi corrigida a colisão de emails da fixture inicial com os testes anteriores da CI, renomeando o prefixo a11b- juntamente com os UUIDs. Nenhuma alteração de política foi feita para acomodar testes.

## Parecer e limite

O revisor não identificou outro bloqueio estático nos deltas, condicionado à correção de emails acima. Isso não substitui a execução do harness, CI, catálogo, journal ou implantação. Esses gates devem ter recibos próprios antes de merge e completion. A presença deste documento não atesta que passaram.

O núcleo permanece sem grants, produtor ou perfil operacional inserido. No incremento 3, engenharia de execução deve vincular o consumidor ao perfil efetivamente derivado e revisado, tratar renovação/aborto de lease e preservar a negação no transporte antes de qualquer egresso. O limite atual de 31 segundos cabe na lease de 60 segundos; esse fato não autoriza execução após expiração. R01 conserva seu motor até o adaptador específico. A ordem global de locks do legado não foi declarada corrigida.

Evidências locais da reprodução e execução SQL: `outputs/etapa-17-nucleo-2026-09-22` na raiz do workspace, especialmente READ-REVOCATION-BEFORE/AFTER, BASIS-READ-REVOCATION-BEFORE/AFTER e staging-execution_release_revocation.json. O relatório de entrega deve registrar os runs finais e carimbos reais dos ambientes.
