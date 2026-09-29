# Etapa 20 / 3I: revisão humana do conteúdo institucional

Status: bloqueado antes da promoção, pela linhagem do segundo setup. Nenhuma migração permanente aplicada. Não inicia etapas 21–24.

O resultado institucional que tem binding nativo é lido dos blocos imutáveis e comparado ao envelope persistido. O leitor retorna a revisão exata; cada resultado de comparação recebe sua própria validação. O resultado histórico sem binding conserva o contrato anterior. O contraponto legado de um resultado nativo e seus derivados ficam bloqueados para impedir recuperação da aprovação histórica.

A pessoa aprova, comenta, solicita ajustes ou revoga a aprovação sobre revisão, fingerprint e audiência exatos. A autoridade vem da sessão, do acesso ao trabalho e das responsabilidades vigentes no banco. Autoaprovação exige regra permitida e declaração explícita. Tentativa repetida após falha de conexão conserva commandId. O ato não publica nem envia materiais e não aprova outro formato ou versão.

Os downloads de financial-results fixam a revisão nativa. A cópia de um workbook em materiais resolve o binding pelo fingerprint exato, sem escolher o resultado mais recente. As duas rotas revalidam depois da renderização. Verificação de bytes e headers usam a mesma revisão; manifesto sem bytes permanece unpinned. Cálculo e hashes PT/EN não mudam.

## Verificação e revisão

- Contrato SQL novo em staging sob BEGIN/ROLLBACK: conteúdo íntegro, declaração obrigatória, replay único, aprovação, revogação, fingerprint divergente, derivado do ancestral legado bloqueado, fonte revogada e replay negado. Sem dados residuais.
- Testes de rotas e binding: 43 passaram; parser e ação: 13 passaram. Gate local completo: 44 tarefas passaram. A CI continua necessária.
- Revisão independente encontrou e fechou dois achados: aprovação herdada por derivado do ancestral legado e atribuição dos bytes à revisão errada. Sem bloqueador estático residual; promoção condicionada ao gate completo e às provas dinâmicas.
- O E2E institucional existente passa a cobrir aprovação do conteúdo, recarga e revogação. Todos os SQLs novos entram automaticamente no job de contratos. As corridas reais de revisão e captura permanecem gates.

## Segurança e recuperação

Controles afetados: IAM-05, APP-04, APP-11, AI-09, SDLC-08 e SDLC-10. Dados: conteúdo financeiro privado e metadados de revisão, sempre no tenant e trabalho autorizados. Abusos cobertos: troca de projeto/revisão, organização injetada, autoaprovação sem declaração, replay após revogação, ancestral como atalho e autoridade perdida durante renderização. Nenhum grant de cliente no helper de conteúdo; lookup público somente authenticated, com verificação de acesso no servidor.

Não reverter para leitores antigos que possam servir o contraponto legado bloqueado. Se o novo fluxo falhar, suspender a capacidade institucional e corrigir por migração aditiva; preservar revisões e atos imutáveis. Captura de catálogo, journal, tipos e funções efetivas somente depois da aplicação real. Fechamento exige CI, main, produção, web e worker no mesmo commit e comprovação de boot.

## Bloqueio descoberto no E2E de 29/09/2026

CI preliminar `36560374405`, commit `3f40e383`: Quality passou; todos os contratos SQL passaram, assim como oito corridas de autoridade de revisão e doze de projeção/leitura nativa. Banco recusou somente o snapshot antigo de `read_institutional_model_results_v1`, cuja captura corrigida está nesta branch. E2E: 43 passaram, 16 condicionais foram pulados e um falhou em duas tentativas. Aprovação explícita, recarga, revogação e os quatro downloads do primeiro resultado passaram; após adotar o segundo cálculo, não existe o link com revisão nativa exigido pelo teste (`institutional-setup.spec.ts:237`).

Diagnóstico estático confirmado por revisão independente: um novo setup recebe `parent_fingerprint` da configuração anteriormente aprovada. `institutional_configuration_capture_state_v1` recusa `initial_configuration` com pai como `parent_lineage_unclassified`; a ancestralidade e o fechamento não ficam provados, e o escritor v3 conserva o resultado com projeção inelegível. O draft 3I distingue nativo apenas pela existência do binding, portanto esse resultado prospectivo pode recuperar o caminho legado. A causa específica do recibo da CI não foi lida diretamente do banco efêmero; o sintoma foi reproduzido em ambas as tentativas e é consistente com essa cadeia no código.

Não reduzir a exigência do teste para aceitar o legado. Recomendação: antes do corte 3I, corrigir por migração aditiva a prova do setup com pai: validar o próprio snapshot, o pai exato, ausência de ambiguidade e a união das fontes; negar pai ausente ou sem prova. Separadamente, o leitor deve distinguir histórico sem captura de cálculo prospectivo inelegível e negar o fallback de aprovação/download do segundo. Repetir o E2E exigindo revisão nativa no segundo cálculo e os negativos de linhagem/revogação.

Alternativa segura: publicar apenas a contenção da leitura prospectiva inelegível e manter o recálculo governado indisponível até completar a prova. Não recomendada como fechamento de 3I, pois deixa a jornada interrompida.

Responsável: executor desta PR. Próxima ação: OK do fundador para antecipar essa dependência técnica dentro da etapa 20, conforme a regra de avisar antes de mudar a ordem. Nenhum DDL permanente, merge ou deploy deste incremento ocorreu. PR permanece explicitamente em draft bloqueado; não é completion.
