# Etapa 20 / 3I: revisão humana do conteúdo institucional

Status: implementação em verificação. Nenhuma migração permanente aplicada. Não inicia etapas 21–24.

O resultado institucional que tem binding nativo é lido dos blocos imutáveis e comparado ao envelope persistido. O leitor retorna a revisão exata; cada resultado de comparação recebe sua própria validação. O resultado histórico sem binding conserva o contrato anterior. O contraponto legado de um resultado nativo e seus derivados ficam bloqueados para impedir recuperação da aprovação histórica.

A pessoa aprova, comenta, solicita ajustes ou revoga a aprovação sobre revisão, fingerprint e audiência exatos. A autoridade vem da sessão, do acesso ao trabalho e das responsabilidades vigentes no banco. Autoaprovação exige regra permitida e declaração explícita. Tentativa repetida após falha de conexão conserva commandId. O ato não publica nem envia materiais e não aprova outro formato ou versão.

Os downloads de financial-results fixam a revisão nativa. A cópia de um workbook em materiais resolve o binding pelo fingerprint exato, sem escolher o resultado mais recente. As duas rotas revalidam depois da renderização. Verificação de bytes e headers usam a mesma revisão; manifesto sem bytes permanece unpinned. Cálculo e hashes PT/EN não mudam.

## Verificação e revisão

- Contrato SQL novo em staging sob BEGIN/ROLLBACK: conteúdo íntegro, declaração obrigatória, replay único, aprovação, revogação, fingerprint divergente, derivado do ancestral legado bloqueado, fonte revogada e replay negado. Sem dados residuais.
- Testes de rotas e binding: 41 passaram; parser e ação: 13 passaram. Gate local completo: 44 tarefas passaram. A CI continua necessária.
- Revisão independente encontrou e fechou dois achados: aprovação herdada por derivado do ancestral legado e atribuição dos bytes à revisão errada. Sem bloqueador estático residual; promoção condicionada ao gate completo e às provas dinâmicas.
- O E2E institucional existente passa a cobrir aprovação do conteúdo, recarga e revogação. Todos os SQLs novos entram automaticamente no job de contratos. As corridas reais de revisão e captura permanecem gates.

## Segurança e recuperação

Controles afetados: IAM-05, APP-04, APP-11, AI-09, SDLC-08 e SDLC-10. Dados: conteúdo financeiro privado e metadados de revisão, sempre no tenant e trabalho autorizados. Abusos cobertos: troca de projeto/revisão, organização injetada, autoaprovação sem declaração, replay após revogação, ancestral como atalho e autoridade perdida durante renderização. Nenhum grant de cliente no helper de conteúdo; lookup público somente authenticated, com verificação de acesso no servidor.

Não reverter para leitores antigos que possam servir o contraponto legado bloqueado. Se o novo fluxo falhar, suspender a capacidade institucional e corrigir por migração aditiva; preservar revisões e atos imutáveis. Captura de catálogo, journal, tipos e funções efetivas somente depois da aplicação real. Fechamento exige CI, main, produção, web e worker no mesmo commit e comprovação de boot.
