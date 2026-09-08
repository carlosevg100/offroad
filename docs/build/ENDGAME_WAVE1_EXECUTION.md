# Execução do endgame: primeira onda

Data: 7 de setembro de 2026. Baseline: `b6da2876d86cf63a6a17bd4bc855b6c4a1e41698`.

O fundador autorizou execução planejada e agentes em paralelo, preservando a visão completa para
companhias/CFOs, assessores/bankers e investidores. A intenção determina o trabalho; público não
vira regra de autorização, rota separada ou um produto menor.

## Resultado desta onda

A primeira entrega corrige fundamentos visíveis de confiança: apresentação numérica, acesso a
toda a revisão e recuperação de comandos. Em paralelo, trata achados de segurança delimitados e
reconcilia o programa com código já integrado. Não declara o workspace premium nem o endgame prontos.

| Frente | Escopo e aceite | Limite |
| --- | --- | --- |
| UX-03 | Decimais exatos por locale; identificação e anchors preservados; todas as linhas, colunas e lacunas acessíveis; síntese existente visível | Não inventa moeda, escala ou qualidade da análise |
| UX-04 | Texto preservado até confirmação; pending sempre liberado; retry idempotente; proteção contra envio concorrente | Não muda autorização nem aceita edição de versão obsoleta |
| SEC-02 | Triagem de alertas existentes, correções semânticas e regressões dos caminhos afetados | Alerta não equivale automaticamente a exploração; não há dismissals automáticos |
| CTRL-01/02 | Board com vínculos válidos a capabilities, baseline atual e cinco pacotes UX com aceite | Reconciliação não concede uso externo nem comprova operação em produção |

Cada frente usa branch isolada. O integrador revisa diffs, resultados e limitações, inclui a
evidência correspondente e só entrega após os checks requeridos. Uma correção local não conta como
deploy, e um deploy não conta como homologação do produto completo.

## Sequência seguinte

1. **Estados e navegação (UX-01/02).** Definir a projeção do estado real, mantendo separados tarefa
   terminada, cobertura disponível, revisão e entrega utilizável. Integrar shell persistente e
   inspector de fontes, com superfícies progressivas e os tokens institucionais existentes.
2. **Uma jornada útil completa para cada público.** Companhia/CFO: necessidade de capital até
   alternativas fundamentadas; assessor/banker: preparação de reunião até material revisável;
   investidor: revisão de oportunidade até síntese interna rastreável. São três jornadas de aceite
   sobre o mesmo motor, sem conceder autoridade pelo cargo nem simular executores ausentes.
3. **Fechar dependências do runtime e dos dados.** Resolver contexto autorizado, terminal,
   capability/executor, preflight, despacho persistente, quarentena e evidência. Pacotes de expertise
   entram junto com a jornada que precisa deles, usando procedimentos versionados e oráculos
   independentes. Não esperar completar todos os instrumentos para validar um trabalho real.
4. **Integrar decisão, modelo e material.** Fonte, premissa, cenário, cálculo e artefato compartilham
   identidade econômica e invalidam descendentes quando algo muda. Workbook e memo têm contratos
   próprios; concluir PPTX não comprova nenhum deles.
5. **Homologar por jornada (UX-05 e JNY).** Revisão de domínio, fonte recuperável, matemática,
   qualidade visual, acessibilidade, continuidade e falhas. A jornada só avança no ledger com a
   evidência do ambiente e escopo efetivamente testados.

Os pacotes UX são trabalho transversal de R1. Sua posição não muda a ordem econômica canônica nem
permite pular uma dependência de segurança. Preparação visual e correções de confiabilidade podem
ocorrer enquanto dependências do motor ainda estão sendo construídas.

## Controles que começam antes de R7

SEC-04/05 e PRD-01 continuam donos do aceite amplo enterprise. Entretanto, a preparação abaixo
começa na fundação; esses itens não podem ser adiados até a certificação:

- Acesso privilegiado: inventariar acessos efetivos, MFA e segregação; registrar lacunas em SEC-01/02.
- Recuperação: definir perda e tempo toleráveis, isolamento de staging e ensaio de restauração antes
  de ampliar uso. Configuração de backup sem restauração medida não é evidência suficiente.
- Custos e latência: instrumentação por família de trabalho desde os primeiros executores, somente
  com metadados permitidos. Não registrar documentos, valores financeiros ou credenciais.
- Segurança de documentos: persistência do receipt, identidade dos bytes, limites, isolamento e
  recuperação precisam de prova operacional; scanner mock não promove quarentena.
- Evidência: roots confiáveis, IAM/environment e coletores devem ser verificados antes de executar
  ou aceitar gates pagos. O run histórico do router permanece invalidado para promoção.

## Critérios para o produto premium

A referência é o trabalho que o usuário consegue concluir, não uma promessa de superar concorrentes.

- Entender objetivo e receber um plano proporcional sem preencher uma taxonomia.
- Encontrar conclusão, fonte e limitação no contexto de uma mesma decisão.
- Editar premissa ou responder a uma pergunta sem reconstruir o projeto.
- Retomar uma falha sem perder conteúdo ou duplicar efeitos.
- Abrir material existente, revisá-lo e distinguir versão preliminar de versão autorizada.
- Operar por teclado e em larguras diferentes, com foco, contraste e controles compreensíveis.
- Receber linguagem financeira precisa em pt-BR e en-US, sem jargão interno do runtime.

A superioridade relativa às referências exige avaliação comparável de tarefas reais. Nenhum mockup,
contagem de testes ou checklist substitui essa avaliação.

## Continuidade e prova

A fonte executável de estado é `packages/release-governance/src/current-endgame-program.ts`; sua
vista é `docs/build/ENDGAME_PROGRAM_BOARD.md`. O Capability Ledger separa disponibilidade, maturidade
e uso permitido. BUILD_STATE, ACCEPTANCE_EVIDENCE e handoff registram entregas e limites por PR.

Ao retomar: verificar main, branches e checks atuais; ler o topo desses registros e os bloqueadores
do board; conservar trabalho local anterior. Não tratar o diretório antigo em branch de preview
como a versão integrada mais recente.
