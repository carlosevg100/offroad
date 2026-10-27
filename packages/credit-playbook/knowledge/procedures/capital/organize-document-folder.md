---
id: organize-document-folder
version: 2026.10.27-v1
maturity: implemented
title_pt: Organizar a pasta de documentos e dizer o que ela tem
title_en: Organize a Document Folder and Say What It Holds
role: intake_evidence
blueprint_stage: 2
owner_role: Autoria profissional da Offroad
effective_date: 2026-10-27
authorities: [CASA, DEF]
implementation_module: @offroad/financial-model
implementation_export: prepareDocumentFolderInventoryPacket
result_contract: document-folder-inventory-packet.v1
connected_states: [framed, partial, prepared_for_human_review]
persistence_mode: derived_on_demand
persistence_target: document-folder-inventory-packet.v1
unit_test_files: [packages/financial-model/src/document-folder-inventory.test.ts, packages/financial-model/src/document-folder-inventory-packet.test.ts, packages/financial-model/src/document-folder-inventory-premises.test.ts, packages/financial-model/src/document-folder-inventory-runs.test.ts, packages/financial-model/src/document-folder-inventory.properties.test.ts]
gold_case_ids: [inventory-item-by-item-matches-the-answer-key, counts-30-1-2-3-2-21, copy-found-by-hash, versions-resolved-none-deleted, amendment-is-the-text-in-force, seven-decision-findings-in-order-with-source, debt-is-130-not-140, unreadable-page-and-photo-not-invented, gaps-by-purpose-in-the-key-order, one-question-only-the-user-knows, no-numeric-analysis-nothing-validated, renaming-every-file-changes-nothing, misleading-names-do-not-move-the-version, later-draft-does-not-beat-the-audited, turn-2-updates-only-the-affected-rows, turn-2-page-7-read-and-semester-closes-month-by-month, turn-2-informed-fact-with-author-and-date, variation-organize-only, variation-for-the-debt-discussion, variation-empty-vault-no-decisions, variation-several-companies, unresolved-month-blocks-the-semester-sum, draft-amendment-changes-no-term, replaced-notice-is-history-not-a-deadline, same-hash-read-two-ways-is-declared, approved-amendment-is-not-in-force, tied-amendments-have-no-winner, later-cut-is-the-covenant-in-force, substitutes-of-one-hash-read-two-ways-are-suspended, text-only-tie-is-a-conflict, conflict-resolved-later-is-history, competing-originals-without-winner, position-tie-broken-by-version, covenant-without-its-limit-text-has-no-effect, two-covenants-in-one-amendment-are-a-conflict, recovered-covenant-joins-the-text-in-force, recovered-notice-does-not-revive-a-replaced-deadline, unread-predecessor-is-not-absent, future-amendment-is-not-current, unread-substitutive-clause-keeps-no-limit-in-force, page-copies-differing-in-the-debt-table-leave-the-page-unread, amendment-without-a-read-original-has-no-deadline, future-board-minutes-have-no-effect, concurrent-values-of-one-metric-are-a-conflict, side-by-side-is-for-budgets-only, future-position-blocks-the-debt-check, unreadable-original-blocks-the-text-in-force, update-after-the-reading-date-is-future, copy-with-its-own-conflict-does-not-complete-the-page, comparison-without-both-operands-is-withheld, update-not-read-shows-the-prior-as-history, partial-period-is-not-summed, draft-copy-does-not-fill-the-page, future-parent-statements-of-another-period-block-the-perimeter, recovered-page-read-against-another-page-leaves-the-row-partial, recovered-table-and-note-join-the-document, new-version-in-the-update-supersedes-the-prior-winner, equivalent-copies-in-another-order-agree, new-debt-position-passes-the-old-total-to-history, same-local-id-on-document-and-copy-keeps-both, local-ids-alone-are-not-a-reading-conflict, duplicate-of-the-ccb-reads-the-recovered-page, reading-date-makes-the-amendment-current, eliminated-amendment-does-not-split-identical-later-ones, small-exception-and-close-totals-are-shown-exactly, same-reference-of-another-entity-is-another-instrument, clause-amount-on-its-declared-scale, competing-originals-with-different-readings-have-no-winner, policy-compared-only-within-its-entity, registry-dated-after-the-reading-does-not-close-the-gap, subsidiary-forecast-does-not-resolve-the-company-gap, unused-limit-explains-only-part-of-the-difference, individual-audited-does-not-supersede-consolidated-draft, individual-forecast-does-not-close-consolidated-liquidity, individual-month-blocks-the-consolidated-semester, notice-deadline-followed-never-scheduled]
adversarial_case_ids: [tampered-envelope, free-result-in-request, fabricated-grant-in-result, document-declared-validated, leverage-in-the-answer, three-open-questions, content-on-the-unreadable-page, content-on-the-unreadable-photo, drawn-above-limit, substitute-for-a-legible-page, update-of-another-folder, informed-fact-without-a-question, reading-under-another-file-slot, amendment-selection-left-out, unreadable-page-read-through-a-section, leverage-and-validation-in-free-text, forbidden-text-in-a-sheet-name, paraphrased-ratio-and-advice-in-a-quote, expected-content-without-legible-source, substitute-figure-outside-its-pages, page-beyond-the-file, expected-source-beyond-the-file, reading-without-a-reference-date, reading-without-a-period, reading-without-an-entity, amendment-of-an-amendment, dateless-amendment, ratio-in-a-clause-that-is-not-its-limit, reading-without-page-or-section, copy-of-another-instrument, copy-of-a-lower-version, copy-of-another-period, sheet-in-dollars, figure-scale-at-odds-with-its-sheet, second-debt-table-from-a-copy, gathered-reading-above-the-limit, entity-label-above-the-limit, amendment-of-another-entity, clause-amount-at-odds-with-its-sheet, recovered-amount-at-odds-with-the-destination-sheet, subject-entity-with-a-parent, subject-entity-outside-the-registry, ratio-in-a-registry-name, financial-report-without-perimeter, record-read-in-another-scenario]
e2e_scenario_ids: [domain:inventory-item-by-item-matches-the-answer-key]
cost_eval_ids: [deterministic:no-model-calls]
task_specs: []
dependencies: []
reference_data_keys: []
calculation_ids: [document.folder_inventory]
templates: []
max_model_calls: 0
model_purpose: []
allowed_tools: []
consistency_run_ids: [organize-document-folder-2026-10-27-v1-consistency]
adversarial_run_ids: [organize-document-folder-2026-10-27-v1-adversarial]
review_ids: []
gold_run_ids: [organize-document-folder-2026-10-27-v1-gold]
---

# Objetivo
Dizer a quem subiu uma pasta com o que pode contar antes de qualquer análise: o que é cada arquivo, pelo conteúdo e nunca pelo nome, qual versão de cada documento vale, o que não foi lido e o que, na pasta, muda as decisões em curso da companhia, cada achado com o documento de origem e o efeito.

# Produto
Pacote de inventário da pasta: cada arquivo como uma linha, com o que é, entidade, período, versão e status, situação de leitura (lida, lida exceto páginas, ilegível, duplicada, superada, já no cofre) e os achados ancorados nele; o inventário por assunto (demonstrações, gerencial e orçamento, dívida, contratos, governança, carteira, ativos, outros) e, quando a pasta tem documentos de mais de uma empresa, por entidade antes do assunto; a árvore de versões, com a que vale e a superada mantida como histórico, sem apagar nenhuma; o aditamento lido com o contrato original como um texto vigente único; os achados que mudam as decisões em curso, em ordem de efeito; as lacunas por finalidade, com o motivo; no máximo duas perguntas, só sobre o que só a pessoa sabe. Num turno seguinte, só as linhas tocadas pelo que chegou mudam; o resto é preservado como estava, e o fato informado fica registrado com autoria e data.

# Quando ativar
- Joguei aqui a pasta do último ano. Organiza e me diz o que tem.
- Só organiza, não analisa ainda.
- O que tem nesses arquivos?
- Organiza o material para discutirmos a dívida.
- Subi tudo que o financeiro tinha. Dá uma olhada e me fala o que falta.

# Quando não ativar
- Montar a tabela de dívida, testar covenant, projetar ou comparar propostas são demandas próprias, que partem do inventário aceito.
- Montar o pacote para enviar a um banco ou a uma auditoria é outra demanda; esta só diz o que existe e qual versão vale.
- Validar um documento contra a fonte oficial não é feito aqui: presença não é confirmação.

# Inputs mínimos e substitutos
- Uma leitura tipada por arquivo, produzida pela extração a partir do conteúdo: hash do arquivo, tipo, descrição, entidade principal, período, versão e status (auditado, minuta, assinado, registrado, aprovado, revisão em trabalho, fechado, gerencial), numeração de versão quando o documento a traz, referência normalizada do instrumento e do instrumento que ele adita, páginas ilegíveis com o que o próprio documento diz que elas trazem, unidade por aba, números, cláusulas e observações, cada um com a página ou a aba de origem.
- O cadastro das entidades da companhia, com grupo e controladora.
- O cofre: documentos já no sistema, pelo hash e pela referência do instrumento.
- As decisões em curso do projeto, pelo tipo (plano de financiamento, projeto de investimento, discussão da dívida); sem elas, os achados aparecem por relevância geral.
- Num turno seguinte: as leituras do que chegou, a resposta da pessoa com autoria e data, e a base do inventário anterior pelo fingerprint.

# Sequência operacional
1. [human_judgment] Enquadrar :: Organizar só, organizar para algo, ou organizar para a discussão da dívida; quais decisões estão em curso | evidence: contexto do projeto e pedido
2. [deterministic] Identidade :: Duplicado exato pelo hash entre os arquivos; já no cofre pelo hash | evidence: hash de cada arquivo e do cofre
3. [deterministic] Versões :: Uma só precedência para todas as famílias, aplicada como filtro sobre a família inteira: critérios em ordem fixa (garantia: auditado, assinado ou registrado acima dos demais, minuta e revisão em trabalho abaixo; data da posição ou da vigência, quando a família tem data; número de versão). Um critério só é usado se todos os candidatos ainda de pé tiverem valor nele, e mantém os de valor mais alto; se algum candidato não tiver o valor, o filtro para e os candidatos restantes são um conflito declarado com as fontes. Só há vencedor se sobrar um. A data vem antes do número porque o número só ordena versões da mesma data. Orçamento aprovado e revisão em trabalho ficam lado a lado por regra da casa | evidence: leituras adotadas
4. [deterministic] Texto vigente :: Primeiro a leitura de cada instrumento é completada com as páginas recuperadas por substituto; só então a vigência é resolvida: o original pela mesma precedência (sem vencedor, instrumento sem texto vigente e conflito declarado), depois cada cláusula pelos aditamentos assinados ou registrados com vigência até a data da leitura. Aditamento com vigência posterior fica como texto futuro. Duas cláusulas do mesmo tipo e escopo no mesmo arquivo são conflito, salvo se disserem o mesmo. Equivalência exige todos os campos tipados e o texto citado. Predecessor em página não lida não é predecessor documentado: nada de elevou, reduziu ou ausência. Covenant sem o texto do limite citado é observação sem efeito | evidence: leituras adotadas
5. [deterministic] Leitura incompleta :: Página ou arquivo ilegível registrado com o que o documento diz que ali está, sem inventar conteúdo | evidence: legibilidade por página
6. [deterministic] Achados e conferências :: Cláusulas que restringem decisões, conflitos entre documentos, série mensal com mês faltando, unidades misturadas, total que soma limite não usado, mês contra o período | evidence: leituras adotadas
7. [deterministic] Ordenar e pedir :: Achados pelas decisões em curso, lacunas por finalidade, no máximo duas perguntas | evidence: decisões em curso adotadas
8. [deterministic] Atualizar :: No turno seguinte, só as linhas tocadas; fatos informados registrados com autoria e data | evidence: base anterior pelo fingerprint
9. [human_judgment] Devolver :: Tamanho e organização, o que importa, versões, o que não foi lido, o que falta e a pergunta | evidence: base autorizada, fontes e versões

# Cálculos determinísticos
- Nenhum índice, alavancagem, projeção ou recomendação é calculado. A única aritmética é a conferência de identidade que o método nomeia, exata em decimal.
- Total informado contra as linhas: soma dos saldos utilizados contra o total da tabela; quando as linhas somadas como contadas fecham com o total e uma linha entra pelo limite acima do saldo usado, a diferença é o limite não usado.
- Período contra os meses: soma do EBITDA dos balancetes mensais que valem, convertidos para reais pela unidade de cada aba, contra o EBITDA do gerencial do mesmo período; com mês faltando ou mês sem versão definida, a conferência não roda e o motivo é dito.
- Comparações sem conta: limite da política do conselho contra o covenant vigente; receita citada fora das demonstrações contra a bruta e a líquida das demonstrações auditadas do mesmo período.

# Julgamentos permitidos
- Dizer qual versão vale quando o conteúdo a distingue (auditada, numeração, data da posição).
- Ordenar os achados pelo efeito nas decisões em curso.
- Perguntar se uma minuta superada foi enviada a terceiros, e o perímetro quando há empresa fora do cadastro.

# Perguntas que mudam o trabalho
- A minuta das demonstrações foi enviada a algum banco? Se foi, vale mandar a versão auditada com uma nota sobre a diferença.
- Esta empresa, que não está no cadastro, entra no perímetro do trabalho?

# Red flags
- Classificar pelo nome do arquivo.
- Usar a minuta como versão vigente, ou ler a escritura sem o aditamento.
- Somar limite não utilizado como dívida.
- Inventar conteúdo da página ilegível ou da foto.
- Calcular índices, projetar ou recomendar sem pedido.
- Descartar versões em vez de registrá-las como histórico.
- Declarar documentos validados.

# Stop conditions
- Arquivo sem leitura adotada: o inventário não é montado e a lacuna é nomeada.
- Leitura com conteúdo numa página ou arquivo declarado ilegível, saldo acima do limite, substituto de página legível ou fora das suas páginas: recusados.
- Atualização que nomeia outra base, que derrubaria uma linha, mudaria uma linha não tocada ou perderia um achado sem o que o resolve: recusada.
- Seleções que deixam de fora um registro adotado na base (um aditamento, uma página) ou fora da ordem de chegada adotada: recusadas.
- Arquivo com página ilegível em que alguma leitura não diz a página, texto livre com índice medido, recomendação ou validação, e índice numa cláusula diferente do limite que ela fixa: recusados.
- Mês com versões sem vencedor: a conferência do período não roda; nenhuma das versões é somada.
- Só assinatura ou registro dão vigência; aprovado ou final, sozinhos, não. Original sem assinatura nem registro não tem texto vigente, e seus aditamentos ficam como histórico.
- Aditamentos aplicados pela própria data e numeração, nunca pela chegada; dois da mesma data e numeração com termos diferentes deixam a cláusula sem texto vigente, com o conflito declarado. Cada alteração é lida contra a cláusula que substitui; a substituída fica como histórico, sem efeito e sem prazo ativo.
- Hash lido de duas formas: todos os arquivos com esse hash ficam suspensos para qualquer uso (achados, conferências, versões, lacunas) até a leitura ser refeita.
- Conteúdo esperado de página ilegível só com fonte legível ancorada; leitura de substituto só nas páginas declaradas; toda página citada existe no arquivo.
- Guarda único: cada efeito (texto vigente por instrumento, verbo de mudança, prazo atual, achado com efeito, conferência numérica, página completa, comparação de receita ou de limite, perímetro) declara as suas dependências; para o que toca um instrumento, a cadeia inteira (todos os originais, todos os aditamentos, todas as páginas, todos os substitutos); para as conferências, todos os documentos e meses do período, todas as versões. Se qualquer dependência não estiver conhecida (página ou arquivo não lido, conflito, data posterior à leitura, inclusive pela data final quando falta a inicial, fonte ausente ou suspensa, versão sem vencedor), o efeito inteiro não sai e vira declaração com o estado e as fontes. Nada de efeito parcial nem de reafirmar o texto anterior. Conservador de propósito: o inventário diz o que é, e a análise espera a leitura completa. O estado de cada achado é o pior estado das suas dependências.
- Domínio suportado, recusado pelo nome antes do núcleo: toda leitura traz entidade, período com início e fim, data de referência tipada (fechamento, posição ou atualização) com a origem (declarada, mês declarado com o último dia, derivada do período, derivada do início da vigência) e status; a única exceção é o arquivo sem conteúdo legível, que fica como linha não lida e sem efeito. Aditamento só se liga diretamente a um original; aditamento de aditamento é recusado. Entidade fora do cadastro não é recusada: a linha fica, todo efeito que toca o arquivo é bloqueado e a pergunta de perímetro é feita.
- Dependências provadas por rastreamento: cada efeito é calculado sobre leituras observadas, que registram cada documento e página lidos; o guarda julga a união do lido com o declarado, e um efeito que leu documento não julgado é recusado. Data posterior à leitura vale pelo fim do período para documentos de números realizados, pelo início para termos e atos, e por data declarada ou atualização; a data derivada não adianta nem atrasa. Página recuperada só se completa com o substituto inteiramente conhecido. Atualização com leitura ausente mostra o inventário anterior como histórico identificado. Comparação com operando desconhecido ou ausente é retida inteira.
- A conferência do período só roda quando o período do gerencial é feito de meses completos, do primeiro ao último dia; período parcial dá not_run com o motivo. Página recuperada só entra se a cópia for assinada ou registrada e tiver força igual ou maior que a do original; minuta, aprovação ou versão final nunca herdam a assinatura do original, e a página fica não lida com a causa declarada. Documentos cuja existência habilita um efeito (por exemplo, demonstrações da controladora em outro período) são dependências julgadas do efeito.
- Página recuperada só vem de cópia do mesmo documento: mesmo instrumento, entidade, período e versão; cópia de outro instrumento, de outra entidade, de outro período ou de versão inferior é recusada pelo nome, e versão inferior nunca fornece texto à superior. A completude de cada página é julgada numa passada única, antes de qualquer efeito, depois de reunir todas as páginas recuperadas com as do próprio documento; cláusula lida de forma diferente entre páginas deixa a página sem leitura com o conflito declarado, e a linha e a guarda refletem esse estado final. Todo valor monetário está em reais: outra moeda, ou escala diferente da declarada para a mesma aba, é recusada; a conferência numérica confere moeda e unidade de cada operando antes de somar e não converte nada.
- A página recuperada entra inteira no documento antes do estado final e de qualquer efeito: cláusulas, números, observações e tabela de dívida, cada um citado na cópia que o traz; ler o conteúdo diretamente ou recuperá-lo por cópia compatível leva às mesmas conclusões. Conteúdo da página que diverge do resto do documento entra também, de modo que o conflito é do documento, e a página continua não lida na linha. Segunda tabela de dívida trazida por cópia é recusada pelo nome. Na atualização, uma nova versão registra a nova precedência da sua família: as linhas da família e as que dependem dela mudam; as demais ficam como estavam.
- Toda leitura é lida na forma canônica, com os itens em ordem estável, de modo que a ordem em que a extração os listou não muda nada; duas cópias com o mesmo conteúdo em outra ordem leem a página da mesma forma. Conteúdo reunido de uma cópia mantém a identidade da fonte (arquivo:item), sem colisão com o documento. Na atualização, todo achado que o inventário anterior afirmava e que deixa de valer passa a histórico, com vínculo ao arquivo chegado que o substitui ou resolve (versão ou posição posterior da mesma série, documento da mesma cadeia, cópia de página, cópia dos mesmos bytes); achado sem nada relacionado chegado nunca é descartado.
- Leituras do mesmo hash são comparadas pela forma canônica, sem ids locais; diferença só de ids locais não é conflito. Duplicado exato é ponteiro: usa a leitura final do original, inclusive páginas recuperadas, na linha, nas dependências e nas guardas, e muda junto com ele. Achado já resolvido continua resolvido sem exigir nova chegada; a passagem da data de leitura (documento que deixa de ser futuro) é transição própria, ligada ao documento que cruzou a data. Os limites de ids, textos e quantidades vêm de uma única fonte para entrada, conteúdo reunido e saída; leitura reunida acima do limite de uma leitura é recusada antes da execução.
- Equivalência de cláusulas só entre os aditamentos que sobrevivem à precedência: aditamento anterior eliminado nunca cria conflito entre cláusulas recentes idênticas. Valores no texto do método são exatos: milhões a partir de um milhão, mil a partir de mil, reais abaixo, com todas as casas que o valor tem; nada é arredondado. Fatos informados, com autoria e data, e perguntas respondidas persistem entre turnos a partir do inventário anterior. Uma companhia com controlada no mesmo grupo econômico é organizada por assunto, com a entidade em cada linha; a separação por entidade (cada empresa em sua partição, inclusive controladora e controlada) só se ativa quando a pasta tem mais de um grupo econômico ou empresa fora do cadastro, e o grupo econômico fica como atributo de cada linha.
- A chave de um instrumento é a entidade emissora com a referência: a mesma referência em outra entidade é outro instrumento, sem precedência, substituição de original ou aplicação de aditamento entre eles; aditamento de entidade diferente da do seu original é recusado. Todo valor monetário de item tipado (número, tabela de dívida, cláusula com valor) obedece à escala declarada para a sua aba; contradição ou valor sem escala é recusado.
- Originais concorrentes sem precedência demonstrada só são o mesmo texto se a leitura inteira for igual na forma canônica; com leituras diferentes, conflito sem vencedor, nunca desempate por id. Valor monetário recuperado por cópia é lido nas unidades declaradas do documento de destino; contradição é recusada. A política do conselho é comparada só com covenants de instrumentos da mesma entidade. Fechar uma lacuna é um efeito: série mensal (balancete do mês da mesma entidade), página (cópia compatível do mesmo documento), matrícula (do mesmo imóvel e da mesma entidade do laudo), perímetro (demonstrações auditadas da própria controlada no período) e projeção (fluxo da companhia analisada, que a entrada nomeia em `subjectEntityId`, consolidado quando o cadastro lhe dá controlada, que alcança a data da leitura) só se fecham com documento lido por inteiro, sem conflito e não posterior à leitura; fluxo só da controlada ou de empresa de outro grupo nunca fecha nem resolve a lacuna de liquidez da companhia; a mera presença não fecha.
- Conferência da tabela de dívida, linha a linha: o limite não utilizado explica a diferença só se as linhas contadas fecham com o total e toda linha contada acima do saldo entra pelo seu limite; o que sobra é declarado à parte como diferença sem causa identificada, sem conta além da identidade.
- A companhia analisada é nomeada na entrada (`subjectEntityId`): tem de estar no cadastro e não ter controladora no cadastro; ausente ou inválida é recusa nomeada no leitor. Toda regra que fala da companhia usa esse id, nunca a ordem do cadastro.
- Todo relatório financeiro (demonstrações, balancete, gerencial, orçamento, fluxo, tabela de dívida, carteira) declara o perímetro lido: individual, consolidado ou os dois no mesmo documento; contratos, atas, laudos e os demais não têm perímetro. Versões só se comparam no mesmo perímetro (individual nunca supera consolidado nem o contrário; o documento com os dois fica com o consolidado). A conferência do gerencial consolidado soma só meses consolidados, e mês só individual bloqueia com o motivo. Fluxo individual não fecha a liquidez consolidada da companhia. Nomes do cadastro (entidade, grupo, decisão, cofre) entram na voz do método e por isso são só nomes: letras, espaços, pontos de abreviação, hífen, apóstrofo e "&", sem dígito, sem outro símbolo e sem palavra econômica; fora disso, recusa nomeada.
- Preservação lado a lado só para orçamento; nenhuma soma mensal com mais de uma versão do mesmo mês sem vencedor demonstrado.
- Identidade e suspensão por hash valem para todos os arquivos, substitutos inclusive; duas cópias da mesma página com leituras diferentes deixam a página sem leitura. Cláusula recuperada entra antes da vigência e nunca reativa prazo ou obrigação substituídos.
- Resposta informada que não responde a uma pergunta feita: recusada.
- O pacote não calcula índice, não projeta, não recomenda, não valida documento, não envia nada a terceiros e não publica nem altera a base.

# Outputs
- schemaVersion (string, required): Versão do pacote | values: document-folder-inventory-packet.v1
- status (enum, required): Suficiência do pacote | values: framed, partial, prepared_for_human_review
- result (object, required): Inventário com linhas, grupos, famílias de versão, textos vigentes, achados, conferências, lacunas, perguntas, fatos informados e acompanhamentos
- readings (object, required): Tamanho e organização, o que importa para as decisões em curso, versões, o que não foi lido, o que falta e as perguntas; no turno seguinte, só o que mudou
- exclusions (array, required): Cálculo de índice, projeção, recomendação, validação de documento, distribuição a terceiros
- grantsExecution (boolean, required): Sempre falso
- grantsPublication (boolean, required): Sempre falso
- fingerprint (string, required): Hash do pacote

# Exemplos
## Bom
- Organizei os 30 arquivos por assunto: demonstrações, gerencial e orçamento, dívida, contratos, governança, carteira, ativos. Um é cópia exata de outro, três foram substituídos por versões posteriores e dois já estavam no sistema. O que importa para o que está em discussão: o covenant da debênture é o do aditamento de 2023, que elevou de 2,75x para 3,0x e criou a exceção de R$ 15 milhões; a ata de março fixa política de no máximo 2,5x; a comparação com os covenants fica para quando a página 7 da CCB for lida, porque ela pode trazer limite; o contrato com a rede A, 32% da carteira, veda a cessão; o contrato de embalagem renova sozinho e o aviso precisa sair até 2 de outubro; a dívida em junho é de R$ 130 milhões, não R$ 140 milhões, porque a tabela soma o limite da conta garantida sem uso; a auditada de 2025 vale sobre a minuta; o caixa da controlada só sobe por dividendo ou mútuo. Não consegui ler a página 7 da CCB nem a foto da nota. Para o plano de financiamento faltam o balancete de março, a página 7 legível, a matrícula do imóvel e uma projeção atualizada. A minuta foi enviada a algum banco?
## Ruim
- "A pasta contém 30 arquivos: demonstrações, balancetes, contratos e outros. Todos foram organizados em pastas por tipo." (lista pelo nome, não resolve versões, não vê o aditamento nem a vedação de cessão)
- "As demonstrações mais recentes indicam EBITDA de R$ 54,8 milhões; a dívida é de R$ 140 milhões e o covenant de 2,75x, o que dá alavancagem de 2,1x. Todos os documentos foram validados." (usa a minuta, soma limite, lê a escritura sem o aditamento, calcula sem pedido e declara validado)

# Testes
## Unit
- packages/financial-model/src/document-folder-inventory.test.ts: núcleo contra a chave da ficha, nomes trocados, empates sem critério, total que não fecha, aditamento sem original, atualização seletiva e suas recusas.
- packages/financial-model/src/document-folder-inventory-packet.test.ts e packages/financial-model/src/document-folder-inventory-premises.test.ts: leitor adotado sobre duas bases, pacote e ida e volta das premissas.
## Gold
- inventory-item-by-item-matches-the-answer-key, counts-30-1-2-3-2-21, copy-found-by-hash, versions-resolved-none-deleted, amendment-is-the-text-in-force, seven-decision-findings-in-order-with-source, debt-is-130-not-140, unreadable-page-and-photo-not-invented, gaps-by-purpose-in-the-key-order, one-question-only-the-user-knows, no-numeric-analysis-nothing-validated, renaming-every-file-changes-nothing, misleading-names-do-not-move-the-version, later-draft-does-not-beat-the-audited, turn-2-updates-only-the-affected-rows, turn-2-page-7-read-and-semester-closes-month-by-month, turn-2-informed-fact-with-author-and-date, variation-organize-only, variation-for-the-debt-discussion, variation-empty-vault-no-decisions, variation-several-companies, unresolved-month-blocks-the-semester-sum, draft-amendment-changes-no-term, replaced-notice-is-history-not-a-deadline, same-hash-read-two-ways-is-declared, approved-amendment-is-not-in-force, tied-amendments-have-no-winner, later-cut-is-the-covenant-in-force, substitutes-of-one-hash-read-two-ways-are-suspended, text-only-tie-is-a-conflict, conflict-resolved-later-is-history, competing-originals-without-winner, position-tie-broken-by-version, covenant-without-its-limit-text-has-no-effect, two-covenants-in-one-amendment-are-a-conflict, recovered-covenant-joins-the-text-in-force, recovered-notice-does-not-revive-a-replaced-deadline, unread-predecessor-is-not-absent, future-amendment-is-not-current, unread-substitutive-clause-keeps-no-limit-in-force, page-copies-differing-in-the-debt-table-leave-the-page-unread, amendment-without-a-read-original-has-no-deadline, future-board-minutes-have-no-effect, concurrent-values-of-one-metric-are-a-conflict, side-by-side-is-for-budgets-only, future-position-blocks-the-debt-check, unreadable-original-blocks-the-text-in-force, update-after-the-reading-date-is-future, copy-with-its-own-conflict-does-not-complete-the-page, comparison-without-both-operands-is-withheld, update-not-read-shows-the-prior-as-history, partial-period-is-not-summed, draft-copy-does-not-fill-the-page, future-parent-statements-of-another-period-block-the-perimeter, recovered-page-read-against-another-page-leaves-the-row-partial, recovered-table-and-note-join-the-document, new-version-in-the-update-supersedes-the-prior-winner, equivalent-copies-in-another-order-agree, new-debt-position-passes-the-old-total-to-history, same-local-id-on-document-and-copy-keeps-both, local-ids-alone-are-not-a-reading-conflict, duplicate-of-the-ccb-reads-the-recovered-page, reading-date-makes-the-amendment-current, eliminated-amendment-does-not-split-identical-later-ones, small-exception-and-close-totals-are-shown-exactly, same-reference-of-another-entity-is-another-instrument, clause-amount-on-its-declared-scale, competing-originals-with-different-readings-have-no-winner, policy-compared-only-within-its-entity, registry-dated-after-the-reading-does-not-close-the-gap, subsidiary-forecast-does-not-resolve-the-company-gap, unused-limit-explains-only-part-of-the-difference, individual-audited-does-not-supersede-consolidated-draft, individual-forecast-does-not-close-consolidated-liquidity, individual-month-blocks-the-consolidated-semester, notice-deadline-followed-never-scheduled
## Adversarial
- Base adulterada, resultado livre no pedido, concessão fabricada, documento declarado validado, alavancagem na resposta, três perguntas abertas, conteúdo em página ilegível, conteúdo em foto ilegível, saldo acima do limite, substituto de página legível, atualização de outra pasta, resposta sem pergunta, leitura sob outro arquivo, seleção do aditamento omitida, página ilegível lida por aba, alavancagem e validação em texto livre, índice em cláusula fora do seu limite, texto proibido em nome de aba, página fora do arquivo, fonte esperada fora do arquivo, índice e conselho parafraseados em citação, conteúdo esperado sem fonte legível, figura de substituto fora das suas páginas, leitura sem página nem aba e registro lido em outro cenário são recusados.
## Aceitação
- Reproduzir a chave do inventário da ficha C09 item a item.
- Executar a conversa da ficha C09 turno a turno pela interface real, com a extração real dos 30 arquivos; guardar plano, leituras, inventário, resposta, custo e latência.

# Evidência
## Hierarquia
- Leitura do conteúdo de cada arquivo pela extração, com página ou aba; cofre; cadastro societário; decisões em curso do projeto; resposta da pessoa, registrada como informada.
- Ficha C09 e sua chave (inventario_gabarito.py) como calibração independente, nunca como dado de outra companhia. Regra da cópia exata: mesmo hash é mesmo conteúdo, então a cópia herda a leitura do original; a linha nomeia o original e mostra o grupo econômico como entidade ("Aurora", como na chave), porque a leitura completa está na linha do original. Duas leituras diferentes do mesmo hash são conflito declarado e deixam o pacote parcial.
## Regras
- Nenhum valor de calibração vira parâmetro de produção.
- Cada achado abre até o arquivo e a página ou aba de origem; cada leitura abre até a sua adoção.

# Limites declarados
- O método confia na tipagem da extração: uma medição tipada como cláusula de covenant, com o mesmo índice no texto citado, entra no texto vigente como limite. Separar limite de medição é trabalho da extração e da sua revisão.
- A demanda só é atendida depois da aprovação profissional deste conteúdo e da aceitação com extração real e conversa pela interface.

# Aprovação profissional e publicação governada
Conteúdo profissional pendente de aprovação do fundador para esta versão. Revisão técnica independente separada da autoria. Publicação e ativação seguem os atos de operador já existentes; nada neste documento concede execução.

# Narrativa
## N1. A decisão que organiza o trabalho
Quem sobe uma pasta quer saber com o que pode contar antes de qualquer análise e se há algo ali que muda o que está em discussão. A organização só tem valor se lê pelo conteúdo, separa o que vale do que foi superado e encontra no meio da pasta a cláusula que muda a decisão.

## N2. Árvore de decisão
- Só organiza: inventário, versões, leituras incompletas e conflitos; as cláusulas ficam como observação de cada documento, sem a seção sobre decisões.
- Com decisão em curso: achados ordenados pelo efeito nela; lacunas pelo que ela precisa.
- Sem decisão em curso: achados por relevância geral (versões, restrições contratuais, políticas aprovadas); lacunas para os usos prováveis (análise de dívida, projeção, material para bancos).
- Para discutir a dívida: documentos de dívida no topo e a árvore de versões dos instrumentos em destaque.
- Várias empresas: com mais de um grupo econômico ou empresa fora do cadastro, por entidade antes do assunto (cada empresa em sua partição), e pergunta de perímetro para a que não está no cadastro. Companhia com controlada do mesmo grupo: por assunto, com a entidade em cada linha. Decisão do responsável técnico (27 out 2026): a separação por entidade vale entre empresas de grupos econômicos diferentes ou fora do cadastro; controladora e controlada do mesmo grupo são organizadas por assunto com a entidade em cada linha, como a calibração da ficha faz com a Aurora e a Aurora Logística.

## N3. Suficiência por conclusão
- Para o inventário: a leitura de cada arquivo; sem ela, nada é montado.
- Para dizer qual versão vale: o status ou a numeração lidos no conteúdo; sem eles, as versões ficam lado a lado sem vencedor.
- Para os achados de decisão: as decisões em curso do projeto. O que faltar vira lacuna declarada.

## N4. Voz e três níveis de afirmação
Fato (o que cada documento diz, com a página), leitura (o que isso muda para a decisão em curso) e recomendação (o que pedir) separados. Sem veredito binário, sem cálculo que não foi pedido e sem declarar validado o que só está presente.

# Template
## T1. Uma leitura útil, com evidência aprofundável
1. Uma linha com o tamanho do que chegou e como ficou organizado.
2. O que encontrei que importa, em ordem de efeito, cada achado com o documento e o que ele muda.
3. Versões: o que vale e o que foi superado, sem apagar.
4. O que não consegui ler.
5. O que falta, por finalidade, com o motivo.
6. No máximo uma ou duas perguntas.

## T2. Peças
Inventário navegável por assunto, com filtro por situação; árvore de versões. Fica em silêncio: índices, projeções e opinião sobre a companhia.

# Regra
## R1. Conteúdo antes do nome
O nome do arquivo é mostrado e nunca lido. Trocar todos os nomes não muda o inventário.

## R2. Versões sem apagar
A versão superada fica como histórico ao lado da que vale; orçamento aprovado e revisão em trabalho ficam lado a lado sem escolha.

## R3. Texto vigente e voz
Só documento assinado ou registrado tem texto vigente; achados e prazos vêm do texto vigente, e cada alteração é comparada com a cláusula que substitui. A voz do método sai só de modelos fechados sobre dados tipados (datas, valores, índices, tipos, cadastro); o que o documento diz sai só como citação, com o arquivo e a página ou aba de onde veio. O filtro de palavras na entrada é defesa adicional, não a garantia.

## R4. Atualização seletiva
O que chega depois muda só as linhas que toca; o resto é preservado byte a byte, e o fato informado é registrado com autoria e data.

# Qualidade
## Q1. Teste do MD
Cada arquivo foi lido pelo conteúdo? A versão que vale foi dita e a superada mantida? O aditamento foi lido com a escritura? O limite não usado ficou fora da dívida? O ilegível foi dito sem inventar? Os achados estão em ordem de efeito e com origem? A pergunta é só o que só a pessoa sabe? Um MD de mercado assinaria?

## Q2. Verificação
Corridas gold, adversarial e de consistência reexecutadas a cada versão; revisão técnica independente; aprovação de conteúdo registrada; conversa real pela interface antes de declarar a demanda atendida.

# Fundamentação profissional
## Conteúdo e nome
"Versão final" e "cópia de cópia" não dizem o que o arquivo é. Cabeçalho, parecer, assinaturas, registro, numeração do aditamento e rodapé de versão dizem.

## Texto vigente
O texto que obriga a companhia costuma ser o original somado aos aditamentos. Ler a escritura sozinha dá o covenant errado.

## Presença e confirmação
Um documento presente na pasta não está validado; minuta não é auditada; uma página ilegível pode conter justamente a cláusula relevante.

# Composição tipada
```offroad-procedure
{
  "schemaVersion": "procedure-composition.v1",
  "authoringStatus": "ready_for_review",
  "pendingContent": [],
  "budget": {
    "maxModelCalls": 0,
    "maxDurationMs": 31000,
    "maxCostMinorUnits": 0,
    "currency": "BRL"
  },
  "allowedTools": [],
  "maximumEffect": "none",
  "components": [
    {
      "id": "document-folder-inventory.request-framing",
      "version": "2026.10.27-v1",
      "kind": "narrative",
      "title": "Enquadramento profissional da organização da pasta",
      "inputs": {
        "id": "document-folder-inventory.framing-input",
        "version": "2026.10.27-v1",
        "value": {
          "type": "object",
          "fields": {
            "question": {
              "required": true,
              "value": {
                "type": "string"
              }
            }
          }
        }
      },
      "outputs": {
        "id": "document-folder-inventory.framing-output",
        "version": "2026.10.27-v1",
        "value": {
          "type": "object",
          "fields": {
            "scope": {
              "required": true,
              "value": {
                "type": "string"
              }
            },
            "gaps": {
              "required": true,
              "value": {
                "type": "array",
                "items": {
                  "type": "string"
                }
              }
            }
          }
        }
      },
      "dependencies": [],
      "tools": [],
      "effect": "none",
      "rights": {
        "inheritSourceRestrictions": true,
        "purposes": [
          "decision_support"
        ],
        "sourceClasses": [
          "authorized_context"
        ]
      },
      "competencies": [
        "financial_analysis",
        "capital_structure"
      ],
      "invariants": [
        "law",
        "contractual_definition",
        "traceability",
        "verification",
        "access_barriers",
        "deterministic_financial_math"
      ],
      "overridePoints": [],
      "budget": {
        "maxModelCalls": 0,
        "maxDurationMs": 1000,
        "maxCostMinorUnits": 0,
        "currency": "BRL"
      },
      "evidence": [],
      "text": "Narrativa\nN1. A decisão que organiza o trabalho\nQuem sobe uma pasta quer saber com o que pode contar antes de qualquer análise e se há algo ali que muda o que está em discussão. A organização só tem valor se lê pelo conteúdo, separa o que vale do que foi superado e encontra no meio da pasta a cláusula que muda a decisão.\n\nN2. Árvore de decisão\n- Só organiza: inventário, versões, leituras incompletas e conflitos; as cláusulas ficam como observação de cada documento, sem a seção sobre decisões.\n- Com decisão em curso: achados ordenados pelo efeito nela; lacunas pelo que ela precisa.\n- Sem decisão em curso: achados por relevância geral (versões, restrições contratuais, políticas aprovadas); lacunas para os usos prováveis (análise de dívida, projeção, material para bancos).\n- Para discutir a dívida: documentos de dívida no topo e a árvore de versões dos instrumentos em destaque.\n- Várias empresas: com mais de um grupo econômico ou empresa fora do cadastro, por entidade antes do assunto (cada empresa em sua partição), e pergunta de perímetro para a que não está no cadastro. Companhia com controlada do mesmo grupo: por assunto, com a entidade em cada linha. Decisão do responsável técnico (27 out 2026): a separação por entidade vale entre empresas de grupos econômicos diferentes ou fora do cadastro; controladora e controlada do mesmo grupo são organizadas por assunto com a entidade em cada linha, como a calibração da ficha faz com a Aurora e a Aurora Logística.\n\nN3. Suficiência por conclusão\n- Para o inventário: a leitura de cada arquivo; sem ela, nada é montado.\n- Para dizer qual versão vale: o status ou a numeração lidos no conteúdo; sem eles, as versões ficam lado a lado sem vencedor.\n- Para os achados de decisão: as decisões em curso do projeto. O que faltar vira lacuna declarada.\n\nN4. Voz e três níveis de afirmação\nFato (o que cada documento diz, com a página), leitura (o que isso muda para a decisão em curso) e recomendação (o que pedir) separados. Sem veredito binário, sem cálculo que não foi pedido e sem declarar validado o que só está presente."
    },
    {
      "id": "document-folder-inventory.packet",
      "version": "2026.10.27-v1",
      "kind": "rule",
      "title": "Organizar a pasta pelo conteúdo e dizer o que muda as decisões em curso",
      "authority": "house",
      "statement": "Ler cada arquivo pelo conteúdo e nunca pelo nome, identificar cópias pelo hash e suspender o hash lido de duas formas, resolver versões só por critério de conteúdo e sem apagar nenhuma, ler os aditamentos assinados ou registrados com o original como texto vigente único, comparando cada alteração com a que substitui, registrar o que não foi lido por página sem inventar conteúdo, ordenar os achados pelas decisões em curso com o documento de origem e o texto citado à parte, pedir as lacunas pela finalidade e no máximo duas perguntas, e no turno seguinte mudar só as linhas tocadas, sem calcular índice, sem projetar, sem recomendar, sem validar documento, sem enviar nada a terceiros e sem adotar ou publicar por cálculo.",
      "executor": {
        "module": "@offroad/financial-model",
        "exportName": "prepareDocumentFolderInventoryPacket",
        "version": "2026.10.27-v1"
      },
      "inputs": {
        "id": "document-folder-inventory-packet-input",
        "version": "2026.10.27-v1",
        "value": {
          "type": "object",
          "fields": {
            "schemaVersion": {
              "required": true,
              "value": {
                "type": "enum",
                "values": [
                  "document-folder-inventory-packet-input.v1"
                ]
              }
            },
            "question": {
              "required": true,
              "value": {
                "type": "string"
              }
            },
            "mode": {
              "required": false,
              "value": {
                "type": "enum",
                "values": [
                  "organize",
                  "organize_only",
                  "organize_for_debt"
                ]
              }
            },
            "analysis": {
              "required": true,
              "value": {
                "type": "object",
                "fields": {
                  "base": {
                    "required": true,
                    "value": {
                      "type": "object",
                      "fields": {
                        "envelope": {
                          "required": true,
                          "value": {
                            "type": "object",
                            "fields": {
                              "canonical": {
                                "required": true,
                                "value": {
                                  "type": "string"
                                }
                              },
                              "fingerprint": {
                                "required": true,
                                "value": {
                                  "type": "string"
                                }
                              }
                            }
                          }
                        },
                        "scope": {
                          "required": true,
                          "value": {
                            "type": "object",
                            "fields": {
                              "workId": {
                                "required": true,
                                "value": {
                                  "type": "string"
                                }
                              },
                              "purpose": {
                                "required": true,
                                "value": {
                                  "type": "string"
                                }
                              },
                              "versionId": {
                                "required": true,
                                "value": {
                                  "type": "string"
                                }
                              }
                            }
                          }
                        },
                        "entityId": {
                          "required": true,
                          "value": {
                            "type": "string"
                          }
                        },
                        "perimeter": {
                          "required": true,
                          "value": {
                            "type": "string"
                          }
                        },
                        "currency": {
                          "required": true,
                          "value": {
                            "type": "string"
                          }
                        },
                        "openingDate": {
                          "required": true,
                          "value": {
                            "type": "date"
                          }
                        },
                        "endDate": {
                          "required": true,
                          "value": {
                            "type": "date"
                          }
                        },
                        "numericInterpretations": {
                          "required": false,
                          "value": {
                            "type": "array",
                            "items": {
                              "type": "object",
                              "fields": {
                                "id": {
                                  "required": true,
                                  "value": {
                                    "type": "string"
                                  }
                                },
                                "mode": {
                                  "required": true,
                                  "value": {
                                    "type": "object",
                                    "fields": {
                                      "decisionId": {
                                        "required": true,
                                        "value": {
                                          "type": "string"
                                        }
                                      },
                                      "definitionVersionId": {
                                        "required": true,
                                        "value": {
                                          "type": "string"
                                        }
                                      },
                                      "definitionKind": {
                                        "required": true,
                                        "value": {
                                          "type": "enum",
                                          "values": [
                                            "reported",
                                            "managerial",
                                            "contractual"
                                          ]
                                        }
                                      }
                                    }
                                  }
                                },
                                "members": {
                                  "required": true,
                                  "value": {
                                    "type": "object",
                                    "fields": {
                                      "decisionId": {
                                        "required": true,
                                        "value": {
                                          "type": "string"
                                        }
                                      },
                                      "definitionVersionId": {
                                        "required": true,
                                        "value": {
                                          "type": "string"
                                        }
                                      },
                                      "definitionKind": {
                                        "required": true,
                                        "value": {
                                          "type": "enum",
                                          "values": [
                                            "reported",
                                            "managerial",
                                            "contractual"
                                          ]
                                        }
                                      }
                                    }
                                  }
                                }
                              }
                            }
                          }
                        },
                        "analysisId": {
                          "required": true,
                          "value": {
                            "type": "string"
                          }
                        },
                        "scenario": {
                          "required": true,
                          "value": {
                            "type": "string"
                          }
                        },
                        "subjectEntityId": {
                          "required": true,
                          "value": {
                            "type": "object",
                            "fields": {
                              "decisionId": {
                                "required": true,
                                "value": {
                                  "type": "union",
                                  "variants": [
                                    {
                                      "type": "string"
                                    },
                                    {
                                      "type": "null"
                                    }
                                  ]
                                }
                              },
                              "definitionVersionId": {
                                "required": true,
                                "value": {
                                  "type": "string"
                                }
                              },
                              "definitionKind": {
                                "required": true,
                                "value": {
                                  "type": "enum",
                                  "values": [
                                    "reported",
                                    "managerial",
                                    "contractual"
                                  ]
                                }
                              },
                              "missingReason": {
                                "required": true,
                                "value": {
                                  "type": "union",
                                  "variants": [
                                    {
                                      "type": "string"
                                    },
                                    {
                                      "type": "null"
                                    }
                                  ]
                                }
                              }
                            }
                          }
                        },
                        "entities": {
                          "required": true,
                          "value": {
                            "type": "array",
                            "items": {
                              "type": "object",
                              "fields": {
                                "id": {
                                  "required": true,
                                  "value": {
                                    "type": "string"
                                  }
                                },
                                "value": {
                                  "required": true,
                                  "value": {
                                    "type": "object",
                                    "fields": {
                                      "decisionId": {
                                        "required": true,
                                        "value": {
                                          "type": "union",
                                          "variants": [
                                            {
                                              "type": "string"
                                            },
                                            {
                                              "type": "null"
                                            }
                                          ]
                                        }
                                      },
                                      "definitionVersionId": {
                                        "required": true,
                                        "value": {
                                          "type": "string"
                                        }
                                      },
                                      "definitionKind": {
                                        "required": true,
                                        "value": {
                                          "type": "enum",
                                          "values": [
                                            "reported",
                                            "managerial",
                                            "contractual"
                                          ]
                                        }
                                      },
                                      "missingReason": {
                                        "required": true,
                                        "value": {
                                          "type": "union",
                                          "variants": [
                                            {
                                              "type": "string"
                                            },
                                            {
                                              "type": "null"
                                            }
                                          ]
                                        }
                                      }
                                    }
                                  }
                                }
                              }
                            }
                          }
                        },
                        "decisions": {
                          "required": true,
                          "value": {
                            "type": "array",
                            "items": {
                              "type": "object",
                              "fields": {
                                "id": {
                                  "required": true,
                                  "value": {
                                    "type": "string"
                                  }
                                },
                                "value": {
                                  "required": true,
                                  "value": {
                                    "type": "object",
                                    "fields": {
                                      "decisionId": {
                                        "required": true,
                                        "value": {
                                          "type": "union",
                                          "variants": [
                                            {
                                              "type": "string"
                                            },
                                            {
                                              "type": "null"
                                            }
                                          ]
                                        }
                                      },
                                      "definitionVersionId": {
                                        "required": true,
                                        "value": {
                                          "type": "string"
                                        }
                                      },
                                      "definitionKind": {
                                        "required": true,
                                        "value": {
                                          "type": "enum",
                                          "values": [
                                            "reported",
                                            "managerial",
                                            "contractual"
                                          ]
                                        }
                                      },
                                      "missingReason": {
                                        "required": true,
                                        "value": {
                                          "type": "union",
                                          "variants": [
                                            {
                                              "type": "string"
                                            },
                                            {
                                              "type": "null"
                                            }
                                          ]
                                        }
                                      }
                                    }
                                  }
                                }
                              }
                            }
                          }
                        },
                        "vault": {
                          "required": true,
                          "value": {
                            "type": "array",
                            "items": {
                              "type": "object",
                              "fields": {
                                "id": {
                                  "required": true,
                                  "value": {
                                    "type": "string"
                                  }
                                },
                                "value": {
                                  "required": true,
                                  "value": {
                                    "type": "object",
                                    "fields": {
                                      "decisionId": {
                                        "required": true,
                                        "value": {
                                          "type": "union",
                                          "variants": [
                                            {
                                              "type": "string"
                                            },
                                            {
                                              "type": "null"
                                            }
                                          ]
                                        }
                                      },
                                      "definitionVersionId": {
                                        "required": true,
                                        "value": {
                                          "type": "string"
                                        }
                                      },
                                      "definitionKind": {
                                        "required": true,
                                        "value": {
                                          "type": "enum",
                                          "values": [
                                            "reported",
                                            "managerial",
                                            "contractual"
                                          ]
                                        }
                                      },
                                      "missingReason": {
                                        "required": true,
                                        "value": {
                                          "type": "union",
                                          "variants": [
                                            {
                                              "type": "string"
                                            },
                                            {
                                              "type": "null"
                                            }
                                          ]
                                        }
                                      }
                                    }
                                  }
                                }
                              }
                            }
                          }
                        },
                        "files": {
                          "required": true,
                          "value": {
                            "type": "array",
                            "items": {
                              "type": "object",
                              "fields": {
                                "id": {
                                  "required": true,
                                  "value": {
                                    "type": "string"
                                  }
                                },
                                "value": {
                                  "required": true,
                                  "value": {
                                    "type": "object",
                                    "fields": {
                                      "decisionId": {
                                        "required": true,
                                        "value": {
                                          "type": "union",
                                          "variants": [
                                            {
                                              "type": "string"
                                            },
                                            {
                                              "type": "null"
                                            }
                                          ]
                                        }
                                      },
                                      "definitionVersionId": {
                                        "required": true,
                                        "value": {
                                          "type": "string"
                                        }
                                      },
                                      "definitionKind": {
                                        "required": true,
                                        "value": {
                                          "type": "enum",
                                          "values": [
                                            "reported",
                                            "managerial",
                                            "contractual"
                                          ]
                                        }
                                      },
                                      "missingReason": {
                                        "required": true,
                                        "value": {
                                          "type": "union",
                                          "variants": [
                                            {
                                              "type": "string"
                                            },
                                            {
                                              "type": "null"
                                            }
                                          ]
                                        }
                                      }
                                    }
                                  }
                                }
                              }
                            }
                          }
                        }
                      }
                    }
                  },
                  "update": {
                    "required": true,
                    "value": {
                      "type": "union",
                      "variants": [
                        {
                          "type": "object",
                          "fields": {
                            "envelope": {
                              "required": true,
                              "value": {
                                "type": "object",
                                "fields": {
                                  "canonical": {
                                    "required": true,
                                    "value": {
                                      "type": "string"
                                    }
                                  },
                                  "fingerprint": {
                                    "required": true,
                                    "value": {
                                      "type": "string"
                                    }
                                  }
                                }
                              }
                            },
                            "scope": {
                              "required": true,
                              "value": {
                                "type": "object",
                                "fields": {
                                  "workId": {
                                    "required": true,
                                    "value": {
                                      "type": "string"
                                    }
                                  },
                                  "purpose": {
                                    "required": true,
                                    "value": {
                                      "type": "string"
                                    }
                                  },
                                  "versionId": {
                                    "required": true,
                                    "value": {
                                      "type": "string"
                                    }
                                  }
                                }
                              }
                            },
                            "entityId": {
                              "required": true,
                              "value": {
                                "type": "string"
                              }
                            },
                            "perimeter": {
                              "required": true,
                              "value": {
                                "type": "string"
                              }
                            },
                            "currency": {
                              "required": true,
                              "value": {
                                "type": "string"
                              }
                            },
                            "openingDate": {
                              "required": true,
                              "value": {
                                "type": "date"
                              }
                            },
                            "endDate": {
                              "required": true,
                              "value": {
                                "type": "date"
                              }
                            },
                            "numericInterpretations": {
                              "required": false,
                              "value": {
                                "type": "array",
                                "items": {
                                  "type": "object",
                                  "fields": {
                                    "id": {
                                      "required": true,
                                      "value": {
                                        "type": "string"
                                      }
                                    },
                                    "mode": {
                                      "required": true,
                                      "value": {
                                        "type": "object",
                                        "fields": {
                                          "decisionId": {
                                            "required": true,
                                            "value": {
                                              "type": "string"
                                            }
                                          },
                                          "definitionVersionId": {
                                            "required": true,
                                            "value": {
                                              "type": "string"
                                            }
                                          },
                                          "definitionKind": {
                                            "required": true,
                                            "value": {
                                              "type": "enum",
                                              "values": [
                                                "reported",
                                                "managerial",
                                                "contractual"
                                              ]
                                            }
                                          }
                                        }
                                      }
                                    },
                                    "members": {
                                      "required": true,
                                      "value": {
                                        "type": "object",
                                        "fields": {
                                          "decisionId": {
                                            "required": true,
                                            "value": {
                                              "type": "string"
                                            }
                                          },
                                          "definitionVersionId": {
                                            "required": true,
                                            "value": {
                                              "type": "string"
                                            }
                                          },
                                          "definitionKind": {
                                            "required": true,
                                            "value": {
                                              "type": "enum",
                                              "values": [
                                                "reported",
                                                "managerial",
                                                "contractual"
                                              ]
                                            }
                                          }
                                        }
                                      }
                                    }
                                  }
                                }
                              }
                            },
                            "analysisId": {
                              "required": true,
                              "value": {
                                "type": "string"
                              }
                            },
                            "scenario": {
                              "required": true,
                              "value": {
                                "type": "string"
                              }
                            },
                            "priorFingerprint": {
                              "required": true,
                              "value": {
                                "type": "object",
                                "fields": {
                                  "decisionId": {
                                    "required": true,
                                    "value": {
                                      "type": "union",
                                      "variants": [
                                        {
                                          "type": "string"
                                        },
                                        {
                                          "type": "null"
                                        }
                                      ]
                                    }
                                  },
                                  "definitionVersionId": {
                                    "required": true,
                                    "value": {
                                      "type": "string"
                                    }
                                  },
                                  "definitionKind": {
                                    "required": true,
                                    "value": {
                                      "type": "enum",
                                      "values": [
                                        "reported",
                                        "managerial",
                                        "contractual"
                                      ]
                                    }
                                  },
                                  "missingReason": {
                                    "required": true,
                                    "value": {
                                      "type": "union",
                                      "variants": [
                                        {
                                          "type": "string"
                                        },
                                        {
                                          "type": "null"
                                        }
                                      ]
                                    }
                                  }
                                }
                              }
                            },
                            "files": {
                              "required": true,
                              "value": {
                                "type": "array",
                                "items": {
                                  "type": "object",
                                  "fields": {
                                    "id": {
                                      "required": true,
                                      "value": {
                                        "type": "string"
                                      }
                                    },
                                    "value": {
                                      "required": true,
                                      "value": {
                                        "type": "object",
                                        "fields": {
                                          "decisionId": {
                                            "required": true,
                                            "value": {
                                              "type": "union",
                                              "variants": [
                                                {
                                                  "type": "string"
                                                },
                                                {
                                                  "type": "null"
                                                }
                                              ]
                                            }
                                          },
                                          "definitionVersionId": {
                                            "required": true,
                                            "value": {
                                              "type": "string"
                                            }
                                          },
                                          "definitionKind": {
                                            "required": true,
                                            "value": {
                                              "type": "enum",
                                              "values": [
                                                "reported",
                                                "managerial",
                                                "contractual"
                                              ]
                                            }
                                          },
                                          "missingReason": {
                                            "required": true,
                                            "value": {
                                              "type": "union",
                                              "variants": [
                                                {
                                                  "type": "string"
                                                },
                                                {
                                                  "type": "null"
                                                }
                                              ]
                                            }
                                          }
                                        }
                                      }
                                    }
                                  }
                                }
                              }
                            },
                            "informed": {
                              "required": true,
                              "value": {
                                "type": "array",
                                "items": {
                                  "type": "object",
                                  "fields": {
                                    "id": {
                                      "required": true,
                                      "value": {
                                        "type": "string"
                                      }
                                    },
                                    "value": {
                                      "required": true,
                                      "value": {
                                        "type": "object",
                                        "fields": {
                                          "decisionId": {
                                            "required": true,
                                            "value": {
                                              "type": "union",
                                              "variants": [
                                                {
                                                  "type": "string"
                                                },
                                                {
                                                  "type": "null"
                                                }
                                              ]
                                            }
                                          },
                                          "definitionVersionId": {
                                            "required": true,
                                            "value": {
                                              "type": "string"
                                            }
                                          },
                                          "definitionKind": {
                                            "required": true,
                                            "value": {
                                              "type": "enum",
                                              "values": [
                                                "reported",
                                                "managerial",
                                                "contractual"
                                              ]
                                            }
                                          },
                                          "missingReason": {
                                            "required": true,
                                            "value": {
                                              "type": "union",
                                              "variants": [
                                                {
                                                  "type": "string"
                                                },
                                                {
                                                  "type": "null"
                                                }
                                              ]
                                            }
                                          }
                                        }
                                      }
                                    }
                                  }
                                }
                              }
                            }
                          }
                        },
                        {
                          "type": "null"
                        }
                      ]
                    }
                  }
                }
              }
            }
          }
        }
      },
      "outputs": {
        "id": "document-folder-inventory-packet-output",
        "version": "2026.10.27-v1",
        "value": {
          "type": "object",
          "fields": {
            "schemaVersion": {
              "required": true,
              "value": {
                "type": "enum",
                "values": [
                  "document-folder-inventory-packet.v1"
                ]
              }
            },
            "executorVersion": {
              "required": true,
              "value": {
                "type": "enum",
                "values": [
                  "2026.10.27-v1"
                ]
              }
            },
            "question": {
              "required": true,
              "value": {
                "type": "string"
              }
            },
            "mode": {
              "required": true,
              "value": {
                "type": "enum",
                "values": [
                  "organize",
                  "organize_only",
                  "organize_for_debt"
                ]
              }
            },
            "basisFingerprint": {
              "required": true,
              "value": {
                "type": "string"
              }
            },
            "scope": {
              "required": true,
              "value": {
                "type": "object",
                "fields": {
                  "workId": {
                    "required": true,
                    "value": {
                      "type": "string"
                    }
                  },
                  "purpose": {
                    "required": true,
                    "value": {
                      "type": "string"
                    }
                  },
                  "versionId": {
                    "required": true,
                    "value": {
                      "type": "string"
                    }
                  }
                }
              }
            },
            "entityId": {
              "required": true,
              "value": {
                "type": "string"
              }
            },
            "result": {
              "required": true,
              "value": {
                "type": "object",
                "fields": {
                  "schemaVersion": {
                    "required": true,
                    "value": {
                      "type": "enum",
                      "values": [
                        "adopted-document-folder-inventory.v1"
                      ]
                    }
                  },
                  "version": {
                    "required": true,
                    "value": {
                      "type": "enum",
                      "values": [
                        "2026.10.27-v1"
                      ]
                    }
                  },
                  "scope": {
                    "required": true,
                    "value": {
                      "type": "object",
                      "fields": {
                        "workId": {
                          "required": true,
                          "value": {
                            "type": "string"
                          }
                        },
                        "purpose": {
                          "required": true,
                          "value": {
                            "type": "string"
                          }
                        },
                        "versionId": {
                          "required": true,
                          "value": {
                            "type": "string"
                          }
                        }
                      }
                    }
                  },
                  "analysisId": {
                    "required": true,
                    "value": {
                      "type": "string"
                    }
                  },
                  "entityId": {
                    "required": true,
                    "value": {
                      "type": "string"
                    }
                  },
                  "perimeter": {
                    "required": true,
                    "value": {
                      "type": "string"
                    }
                  },
                  "currency": {
                    "required": true,
                    "value": {
                      "type": "string"
                    }
                  },
                  "basisFingerprint": {
                    "required": true,
                    "value": {
                      "type": "string"
                    }
                  },
                  "base": {
                    "required": true,
                    "value": {
                      "type": "object",
                      "fields": {
                        "analysisId": {
                          "required": true,
                          "value": {
                            "type": "string"
                          }
                        },
                        "basisFingerprint": {
                          "required": true,
                          "value": {
                            "type": "string"
                          }
                        },
                        "inventoryFingerprint": {
                          "required": true,
                          "value": {
                            "type": "union",
                            "variants": [
                              {
                                "type": "string"
                              },
                              {
                                "type": "null"
                              }
                            ]
                          }
                        }
                      }
                    }
                  },
                  "update": {
                    "required": true,
                    "value": {
                      "type": "union",
                      "variants": [
                        {
                          "type": "object",
                          "fields": {
                            "analysisId": {
                              "required": true,
                              "value": {
                                "type": "string"
                              }
                            },
                            "basisFingerprint": {
                              "required": true,
                              "value": {
                                "type": "string"
                              }
                            },
                            "inventoryFingerprint": {
                              "required": true,
                              "value": {
                                "type": "union",
                                "variants": [
                                  {
                                    "type": "string"
                                  },
                                  {
                                    "type": "null"
                                  }
                                ]
                              }
                            }
                          }
                        },
                        {
                          "type": "null"
                        }
                      ]
                    }
                  },
                  "inventory": {
                    "required": true,
                    "value": {
                      "type": "union",
                      "variants": [
                        {
                          "type": "object",
                          "fields": {
                            "schemaVersion": {
                              "required": true,
                              "value": {
                                "type": "enum",
                                "values": [
                                  "document-folder-inventory.v1"
                                ]
                              }
                            },
                            "version": {
                              "required": true,
                              "value": {
                                "type": "enum",
                                "values": [
                                  "2026.10.27-v1"
                                ]
                              }
                            },
                            "asOf": {
                              "required": true,
                              "value": {
                                "type": "date"
                              }
                            },
                            "mode": {
                              "required": true,
                              "value": {
                                "type": "enum",
                                "values": [
                                  "organize",
                                  "organize_only",
                                  "organize_for_debt"
                                ]
                              }
                            },
                            "partitionByEntity": {
                              "required": true,
                              "value": {
                                "type": "boolean"
                              }
                            },
                            "rows": {
                              "required": true,
                              "value": {
                                "type": "array",
                                "items": {
                                  "type": "object",
                                  "fields": {
                                    "fileId": {
                                      "required": true,
                                      "value": {
                                        "type": "string"
                                      }
                                    },
                                    "fileName": {
                                      "required": true,
                                      "value": {
                                        "type": "string"
                                      }
                                    },
                                    "sha256": {
                                      "required": true,
                                      "value": {
                                        "type": "string"
                                      }
                                    },
                                    "order": {
                                      "required": true,
                                      "value": {
                                        "type": "integer"
                                      }
                                    },
                                    "partition": {
                                      "required": true,
                                      "value": {
                                        "type": "union",
                                        "variants": [
                                          {
                                            "type": "string"
                                          },
                                          {
                                            "type": "null"
                                          }
                                        ]
                                      }
                                    },
                                    "economicGroup": {
                                      "required": true,
                                      "value": {
                                        "type": "union",
                                        "variants": [
                                          {
                                            "type": "string"
                                          },
                                          {
                                            "type": "null"
                                          }
                                        ]
                                      }
                                    },
                                    "group": {
                                      "required": true,
                                      "value": {
                                        "type": "enum",
                                        "values": [
                                          "statements",
                                          "management",
                                          "debt",
                                          "contracts",
                                          "governance",
                                          "receivables",
                                          "assets",
                                          "other"
                                        ]
                                      }
                                    },
                                    "groupLabel": {
                                      "required": true,
                                      "value": {
                                        "type": "string"
                                      }
                                    },
                                    "kind": {
                                      "required": true,
                                      "value": {
                                        "type": "enum",
                                        "values": [
                                          "annual_financial_statements",
                                          "auditor_management_letter",
                                          "trial_balance",
                                          "management_report",
                                          "budget",
                                          "cash_flow_forecast",
                                          "debt_schedule",
                                          "debenture_indenture",
                                          "bank_credit_note",
                                          "development_bank_financing",
                                          "customer_contract",
                                          "supplier_contract",
                                          "board_minutes",
                                          "shareholders_minutes",
                                          "receivables_aging",
                                          "appraisal_report",
                                          "property_registry",
                                          "institutional_presentation",
                                          "invoice",
                                          "unidentified"
                                        ]
                                      }
                                    },
                                    "description": {
                                      "required": true,
                                      "value": {
                                        "type": "string"
                                      }
                                    },
                                    "entity": {
                                      "required": true,
                                      "value": {
                                        "type": "string"
                                      }
                                    },
                                    "period": {
                                      "required": true,
                                      "value": {
                                        "type": "string"
                                      }
                                    },
                                    "version": {
                                      "required": true,
                                      "value": {
                                        "type": "string"
                                      }
                                    },
                                    "status": {
                                      "required": true,
                                      "value": {
                                        "type": "union",
                                        "variants": [
                                          {
                                            "type": "enum",
                                            "values": [
                                              "audited",
                                              "draft",
                                              "signed",
                                              "registered",
                                              "approved",
                                              "working_revision",
                                              "closed",
                                              "management",
                                              "final",
                                              "outdated",
                                              "marketing",
                                              "image"
                                            ]
                                          },
                                          {
                                            "type": "null"
                                          }
                                        ]
                                      }
                                    },
                                    "situation": {
                                      "required": true,
                                      "value": {
                                        "type": "object",
                                        "fields": {
                                          "read": {
                                            "required": true,
                                            "value": {
                                              "type": "enum",
                                              "values": [
                                                "complete",
                                                "partial",
                                                "unreadable",
                                                "conflicted"
                                              ]
                                            }
                                          },
                                          "unreadablePages": {
                                            "required": true,
                                            "value": {
                                              "type": "array",
                                              "items": {
                                                "type": "integer"
                                              }
                                            }
                                          },
                                          "pagesFrom": {
                                            "required": true,
                                            "value": {
                                              "type": "array",
                                              "items": {
                                                "type": "object",
                                                "fields": {
                                                  "page": {
                                                    "required": true,
                                                    "value": {
                                                      "type": "integer"
                                                    }
                                                  },
                                                  "fileId": {
                                                    "required": true,
                                                    "value": {
                                                      "type": "string"
                                                    }
                                                  },
                                                  "sha256": {
                                                    "required": true,
                                                    "value": {
                                                      "type": "string"
                                                    }
                                                  }
                                                }
                                              }
                                            }
                                          },
                                          "duplicateOf": {
                                            "required": true,
                                            "value": {
                                              "type": "union",
                                              "variants": [
                                                {
                                                  "type": "string"
                                                },
                                                {
                                                  "type": "null"
                                                }
                                              ]
                                            }
                                          },
                                          "supersededBy": {
                                            "required": true,
                                            "value": {
                                              "type": "union",
                                              "variants": [
                                                {
                                                  "type": "object",
                                                  "fields": {
                                                    "fileId": {
                                                      "required": true,
                                                      "value": {
                                                        "type": "string"
                                                      }
                                                    },
                                                    "reason": {
                                                      "required": true,
                                                      "value": {
                                                        "type": "enum",
                                                        "values": [
                                                          "audited_over_draft",
                                                          "higher_assurance",
                                                          "later_version",
                                                          "later_position"
                                                        ]
                                                      }
                                                    }
                                                  }
                                                },
                                                {
                                                  "type": "null"
                                                }
                                              ]
                                            }
                                          },
                                          "sideBySideWith": {
                                            "required": true,
                                            "value": {
                                              "type": "array",
                                              "items": {
                                                "type": "string"
                                              }
                                            }
                                          },
                                          "inVault": {
                                            "required": true,
                                            "value": {
                                              "type": "union",
                                              "variants": [
                                                {
                                                  "type": "string"
                                                },
                                                {
                                                  "type": "null"
                                                }
                                              ]
                                            }
                                          }
                                        }
                                      }
                                    },
                                    "situationLabel": {
                                      "required": true,
                                      "value": {
                                        "type": "string"
                                      }
                                    },
                                    "findingIds": {
                                      "required": true,
                                      "value": {
                                        "type": "array",
                                        "items": {
                                          "type": "string"
                                        }
                                      }
                                    },
                                    "validated": {
                                      "required": true,
                                      "value": {
                                        "type": "boolean"
                                      }
                                    }
                                  }
                                }
                              }
                            },
                            "groups": {
                              "required": true,
                              "value": {
                                "type": "array",
                                "items": {
                                  "type": "object",
                                  "fields": {
                                    "partition": {
                                      "required": true,
                                      "value": {
                                        "type": "union",
                                        "variants": [
                                          {
                                            "type": "string"
                                          },
                                          {
                                            "type": "null"
                                          }
                                        ]
                                      }
                                    },
                                    "group": {
                                      "required": true,
                                      "value": {
                                        "type": "enum",
                                        "values": [
                                          "statements",
                                          "management",
                                          "debt",
                                          "contracts",
                                          "governance",
                                          "receivables",
                                          "assets",
                                          "other"
                                        ]
                                      }
                                    },
                                    "label": {
                                      "required": true,
                                      "value": {
                                        "type": "string"
                                      }
                                    },
                                    "fileIds": {
                                      "required": true,
                                      "value": {
                                        "type": "array",
                                        "items": {
                                          "type": "string"
                                        }
                                      }
                                    }
                                  }
                                }
                              }
                            },
                            "families": {
                              "required": true,
                              "value": {
                                "type": "array",
                                "items": {
                                  "type": "object",
                                  "fields": {
                                    "id": {
                                      "required": true,
                                      "value": {
                                        "type": "string"
                                      }
                                    },
                                    "basis": {
                                      "required": true,
                                      "value": {
                                        "type": "enum",
                                        "values": [
                                          "period",
                                          "position",
                                          "instrument"
                                        ]
                                      }
                                    },
                                    "resolution": {
                                      "required": true,
                                      "value": {
                                        "type": "enum",
                                        "values": [
                                          "audited_over_draft",
                                          "higher_assurance",
                                          "later_version",
                                          "later_position",
                                          "side_by_side",
                                          "unresolved",
                                          "effective_text",
                                          "same_text"
                                        ]
                                      }
                                    },
                                    "prevails": {
                                      "required": true,
                                      "value": {
                                        "type": "array",
                                        "items": {
                                          "type": "string"
                                        }
                                      }
                                    },
                                    "superseded": {
                                      "required": true,
                                      "value": {
                                        "type": "array",
                                        "items": {
                                          "type": "string"
                                        }
                                      }
                                    },
                                    "sideBySide": {
                                      "required": true,
                                      "value": {
                                        "type": "array",
                                        "items": {
                                          "type": "string"
                                        }
                                      }
                                    },
                                    "highlighted": {
                                      "required": true,
                                      "value": {
                                        "type": "boolean"
                                      }
                                    }
                                  }
                                }
                              }
                            },
                            "effectiveTexts": {
                              "required": true,
                              "value": {
                                "type": "array",
                                "items": {
                                  "type": "object",
                                  "fields": {
                                    "instrumentRef": {
                                      "required": true,
                                      "value": {
                                        "type": "string"
                                      }
                                    },
                                    "entityId": {
                                      "required": true,
                                      "value": {
                                        "type": "string"
                                      }
                                    },
                                    "fileIds": {
                                      "required": true,
                                      "value": {
                                        "type": "array",
                                        "items": {
                                          "type": "string"
                                        }
                                      }
                                    },
                                    "clauses": {
                                      "required": true,
                                      "value": {
                                        "type": "array",
                                        "items": {
                                          "type": "object",
                                          "fields": {
                                            "type": {
                                              "required": true,
                                              "value": {
                                                "type": "string"
                                              }
                                            },
                                            "fileId": {
                                              "required": true,
                                              "value": {
                                                "type": "string"
                                              }
                                            },
                                            "clauseId": {
                                              "required": true,
                                              "value": {
                                                "type": "string"
                                              }
                                            }
                                          }
                                        }
                                      }
                                    },
                                    "knowledge": {
                                      "required": true,
                                      "value": {
                                        "type": "enum",
                                        "values": [
                                          "known",
                                          "future",
                                          "unread",
                                          "missing_source",
                                          "conflict"
                                        ]
                                      }
                                    },
                                    "conflicts": {
                                      "required": true,
                                      "value": {
                                        "type": "array",
                                        "items": {
                                          "type": "object",
                                          "fields": {
                                            "type": {
                                              "required": true,
                                              "value": {
                                                "type": "string"
                                              }
                                            },
                                            "fileIds": {
                                              "required": true,
                                              "value": {
                                                "type": "array",
                                                "items": {
                                                  "type": "string"
                                                }
                                              }
                                            }
                                          }
                                        }
                                      }
                                    },
                                    "unread": {
                                      "required": true,
                                      "value": {
                                        "type": "array",
                                        "items": {
                                          "type": "object",
                                          "fields": {
                                            "type": {
                                              "required": true,
                                              "value": {
                                                "type": "string"
                                              }
                                            },
                                            "fileIds": {
                                              "required": true,
                                              "value": {
                                                "type": "array",
                                                "items": {
                                                  "type": "string"
                                                }
                                              }
                                            }
                                          }
                                        }
                                      }
                                    },
                                    "future": {
                                      "required": true,
                                      "value": {
                                        "type": "array",
                                        "items": {
                                          "type": "object",
                                          "fields": {
                                            "fileId": {
                                              "required": true,
                                              "value": {
                                                "type": "string"
                                              }
                                            },
                                            "from": {
                                              "required": true,
                                              "value": {
                                                "type": "date"
                                              }
                                            }
                                          }
                                        }
                                      }
                                    }
                                  }
                                }
                              }
                            },
                            "findings": {
                              "required": true,
                              "value": {
                                "type": "array",
                                "items": {
                                  "type": "object",
                                  "fields": {
                                    "id": {
                                      "required": true,
                                      "value": {
                                        "type": "string"
                                      }
                                    },
                                    "code": {
                                      "required": true,
                                      "value": {
                                        "type": "enum",
                                        "values": [
                                          "duplicate",
                                          "draft_superseded",
                                          "version_superseded",
                                          "position_superseded",
                                          "versions_side_by_side",
                                          "versions_unresolved",
                                          "series_gap",
                                          "mixed_units",
                                          "stale_forecast",
                                          "total_includes_unused_limit",
                                          "total_difference_unexplained",
                                          "total_not_recomposed",
                                          "amended_original",
                                          "amendment_in_force",
                                          "amendment_superseded",
                                          "amendment_not_in_force",
                                          "amendment_conflict",
                                          "amendment_future",
                                          "amendment_without_original",
                                          "clause_unread",
                                          "effect_blocked",
                                          "substitute_not_binding",
                                          "clause_future",
                                          "figure_conflict",
                                          "instrument_not_in_force",
                                          "instrument_superseded",
                                          "instrument_conflict",
                                          "instrument_future",
                                          "clause_superseded",
                                          "clause_conflict",
                                          "clause_not_in_force",
                                          "reading_conflict",
                                          "substitute_conflict",
                                          "page_unreadable",
                                          "file_unreadable",
                                          "clause",
                                          "observation",
                                          "subsidiary_in_consolidated",
                                          "appraisal_without_registry",
                                          "figure_basis_differs"
                                        ]
                                      }
                                    },
                                    "anchor": {
                                      "required": true,
                                      "value": {
                                        "type": "string"
                                      }
                                    },
                                    "sources": {
                                      "required": true,
                                      "value": {
                                        "type": "array",
                                        "items": {
                                          "type": "object",
                                          "fields": {
                                            "fileId": {
                                              "required": true,
                                              "value": {
                                                "type": "string"
                                              }
                                            },
                                            "page": {
                                              "required": true,
                                              "value": {
                                                "type": "union",
                                                "variants": [
                                                  {
                                                    "type": "integer"
                                                  },
                                                  {
                                                    "type": "null"
                                                  }
                                                ]
                                              }
                                            },
                                            "section": {
                                              "required": true,
                                              "value": {
                                                "type": "union",
                                                "variants": [
                                                  {
                                                    "type": "string"
                                                  },
                                                  {
                                                    "type": "null"
                                                  }
                                                ]
                                              }
                                            }
                                          }
                                        }
                                      }
                                    },
                                    "statement": {
                                      "required": true,
                                      "value": {
                                        "type": "string"
                                      }
                                    },
                                    "topic": {
                                      "required": true,
                                      "value": {
                                        "type": "union",
                                        "variants": [
                                          {
                                            "type": "enum",
                                            "values": [
                                              "debt_covenant",
                                              "debt_policy",
                                              "receivables_assignment",
                                              "supplier_contract",
                                              "debt_position",
                                              "statements_version",
                                              "group_perimeter"
                                            ]
                                          },
                                          {
                                            "type": "null"
                                          }
                                        ]
                                      }
                                    },
                                    "effect": {
                                      "required": true,
                                      "value": {
                                        "type": "union",
                                        "variants": [
                                          {
                                            "type": "enum",
                                            "values": [
                                              "binding_limit",
                                              "policy_limit",
                                              "collateral_restriction",
                                              "deadline",
                                              "figure_correction",
                                              "version_conflict",
                                              "perimeter"
                                            ]
                                          },
                                          {
                                            "type": "null"
                                          }
                                        ]
                                      }
                                    },
                                    "decisionStatement": {
                                      "required": true,
                                      "value": {
                                        "type": "union",
                                        "variants": [
                                          {
                                            "type": "string"
                                          },
                                          {
                                            "type": "null"
                                          }
                                        ]
                                      }
                                    },
                                    "knowledge": {
                                      "required": true,
                                      "value": {
                                        "type": "enum",
                                        "values": [
                                          "known",
                                          "future",
                                          "unread",
                                          "missing_source",
                                          "conflict"
                                        ]
                                      }
                                    },
                                    "quoted": {
                                      "required": true,
                                      "value": {
                                        "type": "union",
                                        "variants": [
                                          {
                                            "type": "object",
                                            "fields": {
                                              "fileId": {
                                                "required": true,
                                                "value": {
                                                  "type": "string"
                                                }
                                              },
                                              "page": {
                                                "required": true,
                                                "value": {
                                                  "type": "union",
                                                  "variants": [
                                                    {
                                                      "type": "integer"
                                                    },
                                                    {
                                                      "type": "null"
                                                    }
                                                  ]
                                                }
                                              },
                                              "section": {
                                                "required": true,
                                                "value": {
                                                  "type": "union",
                                                  "variants": [
                                                    {
                                                      "type": "string"
                                                    },
                                                    {
                                                      "type": "null"
                                                    }
                                                  ]
                                                }
                                              },
                                              "text": {
                                                "required": true,
                                                "value": {
                                                  "type": "string"
                                                }
                                              }
                                            }
                                          },
                                          {
                                            "type": "null"
                                          }
                                        ]
                                      }
                                    },
                                    "changes": {
                                      "required": true,
                                      "value": {
                                        "type": "union",
                                        "variants": [
                                          {
                                            "type": "array",
                                            "items": {
                                              "type": "object",
                                              "fields": {
                                                "type": {
                                                  "required": true,
                                                  "value": {
                                                    "type": "string"
                                                  }
                                                },
                                                "current": {
                                                  "required": true,
                                                  "value": {
                                                    "type": "boolean"
                                                  }
                                                },
                                                "before": {
                                                  "required": true,
                                                  "value": {
                                                    "type": "union",
                                                    "variants": [
                                                      {
                                                        "type": "object",
                                                        "fields": {
                                                          "fileId": {
                                                            "required": true,
                                                            "value": {
                                                              "type": "string"
                                                            }
                                                          },
                                                          "page": {
                                                            "required": true,
                                                            "value": {
                                                              "type": "union",
                                                              "variants": [
                                                                {
                                                                  "type": "integer"
                                                                },
                                                                {
                                                                  "type": "null"
                                                                }
                                                              ]
                                                            }
                                                          },
                                                          "section": {
                                                            "required": true,
                                                            "value": {
                                                              "type": "union",
                                                              "variants": [
                                                                {
                                                                  "type": "string"
                                                                },
                                                                {
                                                                  "type": "null"
                                                                }
                                                              ]
                                                            }
                                                          },
                                                          "text": {
                                                            "required": true,
                                                            "value": {
                                                              "type": "string"
                                                            }
                                                          }
                                                        }
                                                      },
                                                      {
                                                        "type": "null"
                                                      }
                                                    ]
                                                  }
                                                },
                                                "after": {
                                                  "required": true,
                                                  "value": {
                                                    "type": "object",
                                                    "fields": {
                                                      "fileId": {
                                                        "required": true,
                                                        "value": {
                                                          "type": "string"
                                                        }
                                                      },
                                                      "page": {
                                                        "required": true,
                                                        "value": {
                                                          "type": "union",
                                                          "variants": [
                                                            {
                                                              "type": "integer"
                                                            },
                                                            {
                                                              "type": "null"
                                                            }
                                                          ]
                                                        }
                                                      },
                                                      "section": {
                                                        "required": true,
                                                        "value": {
                                                          "type": "union",
                                                          "variants": [
                                                            {
                                                              "type": "string"
                                                            },
                                                            {
                                                              "type": "null"
                                                            }
                                                          ]
                                                        }
                                                      },
                                                      "text": {
                                                        "required": true,
                                                        "value": {
                                                          "type": "string"
                                                        }
                                                      }
                                                    }
                                                  }
                                                }
                                              }
                                            }
                                          },
                                          {
                                            "type": "null"
                                          }
                                        ]
                                      }
                                    },
                                    "status": {
                                      "required": true,
                                      "value": {
                                        "type": "enum",
                                        "values": [
                                          "open",
                                          "resolved"
                                        ]
                                      }
                                    },
                                    "resolvedBy": {
                                      "required": true,
                                      "value": {
                                        "type": "array",
                                        "items": {
                                          "type": "string"
                                        }
                                      }
                                    }
                                  }
                                }
                              }
                            },
                            "decisionFindings": {
                              "required": true,
                              "value": {
                                "type": "union",
                                "variants": [
                                  {
                                    "type": "array",
                                    "items": {
                                      "type": "object",
                                      "fields": {
                                        "rank": {
                                          "required": true,
                                          "value": {
                                            "type": "integer"
                                          }
                                        },
                                        "findingId": {
                                          "required": true,
                                          "value": {
                                            "type": "string"
                                          }
                                        },
                                        "decisionIds": {
                                          "required": true,
                                          "value": {
                                            "type": "array",
                                            "items": {
                                              "type": "string"
                                            }
                                          }
                                        },
                                        "effect": {
                                          "required": true,
                                          "value": {
                                            "type": "enum",
                                            "values": [
                                              "binding_limit",
                                              "policy_limit",
                                              "collateral_restriction",
                                              "deadline",
                                              "figure_correction",
                                              "version_conflict",
                                              "perimeter"
                                            ]
                                          }
                                        },
                                        "statement": {
                                          "required": true,
                                          "value": {
                                            "type": "string"
                                          }
                                        },
                                        "sources": {
                                          "required": true,
                                          "value": {
                                            "type": "array",
                                            "items": {
                                              "type": "object",
                                              "fields": {
                                                "fileId": {
                                                  "required": true,
                                                  "value": {
                                                    "type": "string"
                                                  }
                                                },
                                                "page": {
                                                  "required": true,
                                                  "value": {
                                                    "type": "union",
                                                    "variants": [
                                                      {
                                                        "type": "integer"
                                                      },
                                                      {
                                                        "type": "null"
                                                      }
                                                    ]
                                                  }
                                                },
                                                "section": {
                                                  "required": true,
                                                  "value": {
                                                    "type": "union",
                                                    "variants": [
                                                      {
                                                        "type": "string"
                                                      },
                                                      {
                                                        "type": "null"
                                                      }
                                                    ]
                                                  }
                                                }
                                              }
                                            }
                                          }
                                        }
                                      }
                                    }
                                  },
                                  {
                                    "type": "null"
                                  }
                                ]
                              }
                            },
                            "generalFindings": {
                              "required": true,
                              "value": {
                                "type": "union",
                                "variants": [
                                  {
                                    "type": "array",
                                    "items": {
                                      "type": "object",
                                      "fields": {
                                        "rank": {
                                          "required": true,
                                          "value": {
                                            "type": "integer"
                                          }
                                        },
                                        "findingId": {
                                          "required": true,
                                          "value": {
                                            "type": "string"
                                          }
                                        },
                                        "effect": {
                                          "required": true,
                                          "value": {
                                            "type": "enum",
                                            "values": [
                                              "binding_limit",
                                              "policy_limit",
                                              "collateral_restriction",
                                              "deadline",
                                              "figure_correction",
                                              "version_conflict",
                                              "perimeter"
                                            ]
                                          }
                                        },
                                        "statement": {
                                          "required": true,
                                          "value": {
                                            "type": "string"
                                          }
                                        }
                                      }
                                    }
                                  },
                                  {
                                    "type": "null"
                                  }
                                ]
                              }
                            },
                            "identityChecks": {
                              "required": true,
                              "value": {
                                "type": "array",
                                "items": {
                                  "type": "object",
                                  "fields": {
                                    "id": {
                                      "required": true,
                                      "value": {
                                        "type": "string"
                                      }
                                    },
                                    "kind": {
                                      "required": true,
                                      "value": {
                                        "type": "enum",
                                        "values": [
                                          "reported_total",
                                          "period_against_months"
                                        ]
                                      }
                                    },
                                    "fileIds": {
                                      "required": true,
                                      "value": {
                                        "type": "array",
                                        "items": {
                                          "type": "string"
                                        }
                                      }
                                    },
                                    "status": {
                                      "required": true,
                                      "value": {
                                        "type": "enum",
                                        "values": [
                                          "matches",
                                          "differs",
                                          "not_run"
                                        ]
                                      }
                                    },
                                    "reported": {
                                      "required": true,
                                      "value": {
                                        "type": "union",
                                        "variants": [
                                          {
                                            "type": "string"
                                          },
                                          {
                                            "type": "null"
                                          }
                                        ]
                                      }
                                    },
                                    "recomposed": {
                                      "required": true,
                                      "value": {
                                        "type": "union",
                                        "variants": [
                                          {
                                            "type": "string"
                                          },
                                          {
                                            "type": "null"
                                          }
                                        ]
                                      }
                                    },
                                    "currency": {
                                      "required": true,
                                      "value": {
                                        "type": "string"
                                      }
                                    },
                                    "reason": {
                                      "required": true,
                                      "value": {
                                        "type": "union",
                                        "variants": [
                                          {
                                            "type": "string"
                                          },
                                          {
                                            "type": "null"
                                          }
                                        ]
                                      }
                                    }
                                  }
                                }
                              }
                            },
                            "gaps": {
                              "required": true,
                              "value": {
                                "type": "array",
                                "items": {
                                  "type": "object",
                                  "fields": {
                                    "id": {
                                      "required": true,
                                      "value": {
                                        "type": "string"
                                      }
                                    },
                                    "need": {
                                      "required": true,
                                      "value": {
                                        "type": "enum",
                                        "values": [
                                          "monthly_series",
                                          "reading_substitute",
                                          "real_collateral",
                                          "group_perimeter",
                                          "liquidity_projection"
                                        ]
                                      }
                                    },
                                    "item": {
                                      "required": true,
                                      "value": {
                                        "type": "string"
                                      }
                                    },
                                    "why": {
                                      "required": true,
                                      "value": {
                                        "type": "string"
                                      }
                                    },
                                    "quoted": {
                                      "required": true,
                                      "value": {
                                        "type": "union",
                                        "variants": [
                                          {
                                            "type": "object",
                                            "fields": {
                                              "fileId": {
                                                "required": true,
                                                "value": {
                                                  "type": "string"
                                                }
                                              },
                                              "page": {
                                                "required": true,
                                                "value": {
                                                  "type": "union",
                                                  "variants": [
                                                    {
                                                      "type": "integer"
                                                    },
                                                    {
                                                      "type": "null"
                                                    }
                                                  ]
                                                }
                                              },
                                              "section": {
                                                "required": true,
                                                "value": {
                                                  "type": "union",
                                                  "variants": [
                                                    {
                                                      "type": "string"
                                                    },
                                                    {
                                                      "type": "null"
                                                    }
                                                  ]
                                                }
                                              },
                                              "text": {
                                                "required": true,
                                                "value": {
                                                  "type": "string"
                                                }
                                              }
                                            }
                                          },
                                          {
                                            "type": "null"
                                          }
                                        ]
                                      }
                                    },
                                    "purposes": {
                                      "required": true,
                                      "value": {
                                        "type": "array",
                                        "items": {
                                          "type": "string"
                                        }
                                      }
                                    },
                                    "findingId": {
                                      "required": true,
                                      "value": {
                                        "type": "union",
                                        "variants": [
                                          {
                                            "type": "string"
                                          },
                                          {
                                            "type": "null"
                                          }
                                        ]
                                      }
                                    },
                                    "conditional": {
                                      "required": true,
                                      "value": {
                                        "type": "boolean"
                                      }
                                    },
                                    "status": {
                                      "required": true,
                                      "value": {
                                        "type": "enum",
                                        "values": [
                                          "open",
                                          "resolved"
                                        ]
                                      }
                                    },
                                    "resolvedBy": {
                                      "required": true,
                                      "value": {
                                        "type": "array",
                                        "items": {
                                          "type": "string"
                                        }
                                      }
                                    }
                                  }
                                }
                              }
                            },
                            "questions": {
                              "required": true,
                              "value": {
                                "type": "array",
                                "items": {
                                  "type": "object",
                                  "fields": {
                                    "id": {
                                      "required": true,
                                      "value": {
                                        "type": "string"
                                      }
                                    },
                                    "text": {
                                      "required": true,
                                      "value": {
                                        "type": "string"
                                      }
                                    },
                                    "fileIds": {
                                      "required": true,
                                      "value": {
                                        "type": "array",
                                        "items": {
                                          "type": "string"
                                        }
                                      }
                                    },
                                    "findingId": {
                                      "required": true,
                                      "value": {
                                        "type": "union",
                                        "variants": [
                                          {
                                            "type": "string"
                                          },
                                          {
                                            "type": "null"
                                          }
                                        ]
                                      }
                                    },
                                    "status": {
                                      "required": true,
                                      "value": {
                                        "type": "enum",
                                        "values": [
                                          "open",
                                          "answered"
                                        ]
                                      }
                                    },
                                    "answeredBy": {
                                      "required": true,
                                      "value": {
                                        "type": "union",
                                        "variants": [
                                          {
                                            "type": "string"
                                          },
                                          {
                                            "type": "null"
                                          }
                                        ]
                                      }
                                    }
                                  }
                                }
                              }
                            },
                            "informed": {
                              "required": true,
                              "value": {
                                "type": "array",
                                "items": {
                                  "type": "object",
                                  "fields": {
                                    "id": {
                                      "required": true,
                                      "value": {
                                        "type": "string"
                                      }
                                    },
                                    "questionId": {
                                      "required": true,
                                      "value": {
                                        "type": "string"
                                      }
                                    },
                                    "statement": {
                                      "required": true,
                                      "value": {
                                        "type": "string"
                                      }
                                    },
                                    "author": {
                                      "required": true,
                                      "value": {
                                        "type": "string"
                                      }
                                    },
                                    "date": {
                                      "required": true,
                                      "value": {
                                        "type": "date"
                                      }
                                    },
                                    "origin": {
                                      "required": true,
                                      "value": {
                                        "type": "enum",
                                        "values": [
                                          "informed"
                                        ]
                                      }
                                    }
                                  }
                                }
                              }
                            },
                            "followUps": {
                              "required": true,
                              "value": {
                                "type": "array",
                                "items": {
                                  "type": "union",
                                  "variants": [
                                    {
                                      "type": "object",
                                      "fields": {
                                        "kind": {
                                          "required": true,
                                          "value": {
                                            "type": "enum",
                                            "values": [
                                              "notice_deadline"
                                            ]
                                          }
                                        },
                                        "date": {
                                          "required": true,
                                          "value": {
                                            "type": "date"
                                          }
                                        },
                                        "fileId": {
                                          "required": true,
                                          "value": {
                                            "type": "string"
                                          }
                                        },
                                        "clauseId": {
                                          "required": true,
                                          "value": {
                                            "type": "string"
                                          }
                                        },
                                        "decisionIds": {
                                          "required": true,
                                          "value": {
                                            "type": "array",
                                            "items": {
                                              "type": "string"
                                            }
                                          }
                                        },
                                        "scheduled": {
                                          "required": true,
                                          "value": {
                                            "type": "boolean"
                                          }
                                        }
                                      }
                                    },
                                    {
                                      "type": "object",
                                      "fields": {
                                        "kind": {
                                          "required": true,
                                          "value": {
                                            "type": "enum",
                                            "values": [
                                              "effective_text"
                                            ]
                                          }
                                        },
                                        "instrumentRef": {
                                          "required": true,
                                          "value": {
                                            "type": "string"
                                          }
                                        },
                                        "entityId": {
                                          "required": true,
                                          "value": {
                                            "type": "string"
                                          }
                                        },
                                        "fileIds": {
                                          "required": true,
                                          "value": {
                                            "type": "array",
                                            "items": {
                                              "type": "string"
                                            }
                                          }
                                        }
                                      }
                                    }
                                  ]
                                }
                              }
                            },
                            "counts": {
                              "required": true,
                              "value": {
                                "type": "object",
                                "fields": {
                                  "files": {
                                    "required": true,
                                    "value": {
                                      "type": "integer"
                                    }
                                  },
                                  "duplicates": {
                                    "required": true,
                                    "value": {
                                      "type": "integer"
                                    }
                                  },
                                  "incompleteReadings": {
                                    "required": true,
                                    "value": {
                                      "type": "integer"
                                    }
                                  },
                                  "superseded": {
                                    "required": true,
                                    "value": {
                                      "type": "integer"
                                    }
                                  },
                                  "inVault": {
                                    "required": true,
                                    "value": {
                                      "type": "integer"
                                    }
                                  },
                                  "withFinding": {
                                    "required": true,
                                    "value": {
                                      "type": "integer"
                                    }
                                  },
                                  "pageSubstitutes": {
                                    "required": true,
                                    "value": {
                                      "type": "integer"
                                    }
                                  }
                                }
                              }
                            },
                            "readingConflicts": {
                              "required": true,
                              "value": {
                                "type": "array",
                                "items": {
                                  "type": "object",
                                  "fields": {
                                    "sha256": {
                                      "required": true,
                                      "value": {
                                        "type": "union",
                                        "variants": [
                                          {
                                            "type": "string"
                                          },
                                          {
                                            "type": "null"
                                          }
                                        ]
                                      }
                                    },
                                    "page": {
                                      "required": true,
                                      "value": {
                                        "type": "union",
                                        "variants": [
                                          {
                                            "type": "integer"
                                          },
                                          {
                                            "type": "null"
                                          }
                                        ]
                                      }
                                    },
                                    "fileIds": {
                                      "required": true,
                                      "value": {
                                        "type": "array",
                                        "items": {
                                          "type": "string"
                                        }
                                      }
                                    }
                                  }
                                }
                              }
                            },
                            "update": {
                              "required": true,
                              "value": {
                                "type": "union",
                                "variants": [
                                  {
                                    "type": "object",
                                    "fields": {
                                      "priorFingerprint": {
                                        "required": true,
                                        "value": {
                                          "type": "string"
                                        }
                                      },
                                      "rowsUpdated": {
                                        "required": true,
                                        "value": {
                                          "type": "array",
                                          "items": {
                                            "type": "string"
                                          }
                                        }
                                      },
                                      "rowsAdded": {
                                        "required": true,
                                        "value": {
                                          "type": "array",
                                          "items": {
                                            "type": "string"
                                          }
                                        }
                                      },
                                      "rowsPreserved": {
                                        "required": true,
                                        "value": {
                                          "type": "integer"
                                        }
                                      },
                                      "findingsResolved": {
                                        "required": true,
                                        "value": {
                                          "type": "array",
                                          "items": {
                                            "type": "string"
                                          }
                                        }
                                      },
                                      "findingsAdded": {
                                        "required": true,
                                        "value": {
                                          "type": "array",
                                          "items": {
                                            "type": "string"
                                          }
                                        }
                                      },
                                      "gapsResolved": {
                                        "required": true,
                                        "value": {
                                          "type": "array",
                                          "items": {
                                            "type": "string"
                                          }
                                        }
                                      },
                                      "questionsAnswered": {
                                        "required": true,
                                        "value": {
                                          "type": "array",
                                          "items": {
                                            "type": "string"
                                          }
                                        }
                                      }
                                    }
                                  },
                                  {
                                    "type": "null"
                                  }
                                ]
                              }
                            }
                          }
                        },
                        {
                          "type": "null"
                        }
                      ]
                    }
                  },
                  "priorInventory": {
                    "required": true,
                    "value": {
                      "type": "union",
                      "variants": [
                        {
                          "type": "object",
                          "fields": {
                            "schemaVersion": {
                              "required": true,
                              "value": {
                                "type": "enum",
                                "values": [
                                  "document-folder-inventory.v1"
                                ]
                              }
                            },
                            "version": {
                              "required": true,
                              "value": {
                                "type": "enum",
                                "values": [
                                  "2026.10.27-v1"
                                ]
                              }
                            },
                            "asOf": {
                              "required": true,
                              "value": {
                                "type": "date"
                              }
                            },
                            "mode": {
                              "required": true,
                              "value": {
                                "type": "enum",
                                "values": [
                                  "organize",
                                  "organize_only",
                                  "organize_for_debt"
                                ]
                              }
                            },
                            "partitionByEntity": {
                              "required": true,
                              "value": {
                                "type": "boolean"
                              }
                            },
                            "rows": {
                              "required": true,
                              "value": {
                                "type": "array",
                                "items": {
                                  "type": "object",
                                  "fields": {
                                    "fileId": {
                                      "required": true,
                                      "value": {
                                        "type": "string"
                                      }
                                    },
                                    "fileName": {
                                      "required": true,
                                      "value": {
                                        "type": "string"
                                      }
                                    },
                                    "sha256": {
                                      "required": true,
                                      "value": {
                                        "type": "string"
                                      }
                                    },
                                    "order": {
                                      "required": true,
                                      "value": {
                                        "type": "integer"
                                      }
                                    },
                                    "partition": {
                                      "required": true,
                                      "value": {
                                        "type": "union",
                                        "variants": [
                                          {
                                            "type": "string"
                                          },
                                          {
                                            "type": "null"
                                          }
                                        ]
                                      }
                                    },
                                    "economicGroup": {
                                      "required": true,
                                      "value": {
                                        "type": "union",
                                        "variants": [
                                          {
                                            "type": "string"
                                          },
                                          {
                                            "type": "null"
                                          }
                                        ]
                                      }
                                    },
                                    "group": {
                                      "required": true,
                                      "value": {
                                        "type": "enum",
                                        "values": [
                                          "statements",
                                          "management",
                                          "debt",
                                          "contracts",
                                          "governance",
                                          "receivables",
                                          "assets",
                                          "other"
                                        ]
                                      }
                                    },
                                    "groupLabel": {
                                      "required": true,
                                      "value": {
                                        "type": "string"
                                      }
                                    },
                                    "kind": {
                                      "required": true,
                                      "value": {
                                        "type": "enum",
                                        "values": [
                                          "annual_financial_statements",
                                          "auditor_management_letter",
                                          "trial_balance",
                                          "management_report",
                                          "budget",
                                          "cash_flow_forecast",
                                          "debt_schedule",
                                          "debenture_indenture",
                                          "bank_credit_note",
                                          "development_bank_financing",
                                          "customer_contract",
                                          "supplier_contract",
                                          "board_minutes",
                                          "shareholders_minutes",
                                          "receivables_aging",
                                          "appraisal_report",
                                          "property_registry",
                                          "institutional_presentation",
                                          "invoice",
                                          "unidentified"
                                        ]
                                      }
                                    },
                                    "description": {
                                      "required": true,
                                      "value": {
                                        "type": "string"
                                      }
                                    },
                                    "entity": {
                                      "required": true,
                                      "value": {
                                        "type": "string"
                                      }
                                    },
                                    "period": {
                                      "required": true,
                                      "value": {
                                        "type": "string"
                                      }
                                    },
                                    "version": {
                                      "required": true,
                                      "value": {
                                        "type": "string"
                                      }
                                    },
                                    "status": {
                                      "required": true,
                                      "value": {
                                        "type": "union",
                                        "variants": [
                                          {
                                            "type": "enum",
                                            "values": [
                                              "audited",
                                              "draft",
                                              "signed",
                                              "registered",
                                              "approved",
                                              "working_revision",
                                              "closed",
                                              "management",
                                              "final",
                                              "outdated",
                                              "marketing",
                                              "image"
                                            ]
                                          },
                                          {
                                            "type": "null"
                                          }
                                        ]
                                      }
                                    },
                                    "situation": {
                                      "required": true,
                                      "value": {
                                        "type": "object",
                                        "fields": {
                                          "read": {
                                            "required": true,
                                            "value": {
                                              "type": "enum",
                                              "values": [
                                                "complete",
                                                "partial",
                                                "unreadable",
                                                "conflicted"
                                              ]
                                            }
                                          },
                                          "unreadablePages": {
                                            "required": true,
                                            "value": {
                                              "type": "array",
                                              "items": {
                                                "type": "integer"
                                              }
                                            }
                                          },
                                          "pagesFrom": {
                                            "required": true,
                                            "value": {
                                              "type": "array",
                                              "items": {
                                                "type": "object",
                                                "fields": {
                                                  "page": {
                                                    "required": true,
                                                    "value": {
                                                      "type": "integer"
                                                    }
                                                  },
                                                  "fileId": {
                                                    "required": true,
                                                    "value": {
                                                      "type": "string"
                                                    }
                                                  },
                                                  "sha256": {
                                                    "required": true,
                                                    "value": {
                                                      "type": "string"
                                                    }
                                                  }
                                                }
                                              }
                                            }
                                          },
                                          "duplicateOf": {
                                            "required": true,
                                            "value": {
                                              "type": "union",
                                              "variants": [
                                                {
                                                  "type": "string"
                                                },
                                                {
                                                  "type": "null"
                                                }
                                              ]
                                            }
                                          },
                                          "supersededBy": {
                                            "required": true,
                                            "value": {
                                              "type": "union",
                                              "variants": [
                                                {
                                                  "type": "object",
                                                  "fields": {
                                                    "fileId": {
                                                      "required": true,
                                                      "value": {
                                                        "type": "string"
                                                      }
                                                    },
                                                    "reason": {
                                                      "required": true,
                                                      "value": {
                                                        "type": "enum",
                                                        "values": [
                                                          "audited_over_draft",
                                                          "higher_assurance",
                                                          "later_version",
                                                          "later_position"
                                                        ]
                                                      }
                                                    }
                                                  }
                                                },
                                                {
                                                  "type": "null"
                                                }
                                              ]
                                            }
                                          },
                                          "sideBySideWith": {
                                            "required": true,
                                            "value": {
                                              "type": "array",
                                              "items": {
                                                "type": "string"
                                              }
                                            }
                                          },
                                          "inVault": {
                                            "required": true,
                                            "value": {
                                              "type": "union",
                                              "variants": [
                                                {
                                                  "type": "string"
                                                },
                                                {
                                                  "type": "null"
                                                }
                                              ]
                                            }
                                          }
                                        }
                                      }
                                    },
                                    "situationLabel": {
                                      "required": true,
                                      "value": {
                                        "type": "string"
                                      }
                                    },
                                    "findingIds": {
                                      "required": true,
                                      "value": {
                                        "type": "array",
                                        "items": {
                                          "type": "string"
                                        }
                                      }
                                    },
                                    "validated": {
                                      "required": true,
                                      "value": {
                                        "type": "boolean"
                                      }
                                    }
                                  }
                                }
                              }
                            },
                            "groups": {
                              "required": true,
                              "value": {
                                "type": "array",
                                "items": {
                                  "type": "object",
                                  "fields": {
                                    "partition": {
                                      "required": true,
                                      "value": {
                                        "type": "union",
                                        "variants": [
                                          {
                                            "type": "string"
                                          },
                                          {
                                            "type": "null"
                                          }
                                        ]
                                      }
                                    },
                                    "group": {
                                      "required": true,
                                      "value": {
                                        "type": "enum",
                                        "values": [
                                          "statements",
                                          "management",
                                          "debt",
                                          "contracts",
                                          "governance",
                                          "receivables",
                                          "assets",
                                          "other"
                                        ]
                                      }
                                    },
                                    "label": {
                                      "required": true,
                                      "value": {
                                        "type": "string"
                                      }
                                    },
                                    "fileIds": {
                                      "required": true,
                                      "value": {
                                        "type": "array",
                                        "items": {
                                          "type": "string"
                                        }
                                      }
                                    }
                                  }
                                }
                              }
                            },
                            "families": {
                              "required": true,
                              "value": {
                                "type": "array",
                                "items": {
                                  "type": "object",
                                  "fields": {
                                    "id": {
                                      "required": true,
                                      "value": {
                                        "type": "string"
                                      }
                                    },
                                    "basis": {
                                      "required": true,
                                      "value": {
                                        "type": "enum",
                                        "values": [
                                          "period",
                                          "position",
                                          "instrument"
                                        ]
                                      }
                                    },
                                    "resolution": {
                                      "required": true,
                                      "value": {
                                        "type": "enum",
                                        "values": [
                                          "audited_over_draft",
                                          "higher_assurance",
                                          "later_version",
                                          "later_position",
                                          "side_by_side",
                                          "unresolved",
                                          "effective_text",
                                          "same_text"
                                        ]
                                      }
                                    },
                                    "prevails": {
                                      "required": true,
                                      "value": {
                                        "type": "array",
                                        "items": {
                                          "type": "string"
                                        }
                                      }
                                    },
                                    "superseded": {
                                      "required": true,
                                      "value": {
                                        "type": "array",
                                        "items": {
                                          "type": "string"
                                        }
                                      }
                                    },
                                    "sideBySide": {
                                      "required": true,
                                      "value": {
                                        "type": "array",
                                        "items": {
                                          "type": "string"
                                        }
                                      }
                                    },
                                    "highlighted": {
                                      "required": true,
                                      "value": {
                                        "type": "boolean"
                                      }
                                    }
                                  }
                                }
                              }
                            },
                            "effectiveTexts": {
                              "required": true,
                              "value": {
                                "type": "array",
                                "items": {
                                  "type": "object",
                                  "fields": {
                                    "instrumentRef": {
                                      "required": true,
                                      "value": {
                                        "type": "string"
                                      }
                                    },
                                    "entityId": {
                                      "required": true,
                                      "value": {
                                        "type": "string"
                                      }
                                    },
                                    "fileIds": {
                                      "required": true,
                                      "value": {
                                        "type": "array",
                                        "items": {
                                          "type": "string"
                                        }
                                      }
                                    },
                                    "clauses": {
                                      "required": true,
                                      "value": {
                                        "type": "array",
                                        "items": {
                                          "type": "object",
                                          "fields": {
                                            "type": {
                                              "required": true,
                                              "value": {
                                                "type": "string"
                                              }
                                            },
                                            "fileId": {
                                              "required": true,
                                              "value": {
                                                "type": "string"
                                              }
                                            },
                                            "clauseId": {
                                              "required": true,
                                              "value": {
                                                "type": "string"
                                              }
                                            }
                                          }
                                        }
                                      }
                                    },
                                    "knowledge": {
                                      "required": true,
                                      "value": {
                                        "type": "enum",
                                        "values": [
                                          "known",
                                          "future",
                                          "unread",
                                          "missing_source",
                                          "conflict"
                                        ]
                                      }
                                    },
                                    "conflicts": {
                                      "required": true,
                                      "value": {
                                        "type": "array",
                                        "items": {
                                          "type": "object",
                                          "fields": {
                                            "type": {
                                              "required": true,
                                              "value": {
                                                "type": "string"
                                              }
                                            },
                                            "fileIds": {
                                              "required": true,
                                              "value": {
                                                "type": "array",
                                                "items": {
                                                  "type": "string"
                                                }
                                              }
                                            }
                                          }
                                        }
                                      }
                                    },
                                    "unread": {
                                      "required": true,
                                      "value": {
                                        "type": "array",
                                        "items": {
                                          "type": "object",
                                          "fields": {
                                            "type": {
                                              "required": true,
                                              "value": {
                                                "type": "string"
                                              }
                                            },
                                            "fileIds": {
                                              "required": true,
                                              "value": {
                                                "type": "array",
                                                "items": {
                                                  "type": "string"
                                                }
                                              }
                                            }
                                          }
                                        }
                                      }
                                    },
                                    "future": {
                                      "required": true,
                                      "value": {
                                        "type": "array",
                                        "items": {
                                          "type": "object",
                                          "fields": {
                                            "fileId": {
                                              "required": true,
                                              "value": {
                                                "type": "string"
                                              }
                                            },
                                            "from": {
                                              "required": true,
                                              "value": {
                                                "type": "date"
                                              }
                                            }
                                          }
                                        }
                                      }
                                    }
                                  }
                                }
                              }
                            },
                            "findings": {
                              "required": true,
                              "value": {
                                "type": "array",
                                "items": {
                                  "type": "object",
                                  "fields": {
                                    "id": {
                                      "required": true,
                                      "value": {
                                        "type": "string"
                                      }
                                    },
                                    "code": {
                                      "required": true,
                                      "value": {
                                        "type": "enum",
                                        "values": [
                                          "duplicate",
                                          "draft_superseded",
                                          "version_superseded",
                                          "position_superseded",
                                          "versions_side_by_side",
                                          "versions_unresolved",
                                          "series_gap",
                                          "mixed_units",
                                          "stale_forecast",
                                          "total_includes_unused_limit",
                                          "total_difference_unexplained",
                                          "total_not_recomposed",
                                          "amended_original",
                                          "amendment_in_force",
                                          "amendment_superseded",
                                          "amendment_not_in_force",
                                          "amendment_conflict",
                                          "amendment_future",
                                          "amendment_without_original",
                                          "clause_unread",
                                          "effect_blocked",
                                          "substitute_not_binding",
                                          "clause_future",
                                          "figure_conflict",
                                          "instrument_not_in_force",
                                          "instrument_superseded",
                                          "instrument_conflict",
                                          "instrument_future",
                                          "clause_superseded",
                                          "clause_conflict",
                                          "clause_not_in_force",
                                          "reading_conflict",
                                          "substitute_conflict",
                                          "page_unreadable",
                                          "file_unreadable",
                                          "clause",
                                          "observation",
                                          "subsidiary_in_consolidated",
                                          "appraisal_without_registry",
                                          "figure_basis_differs"
                                        ]
                                      }
                                    },
                                    "anchor": {
                                      "required": true,
                                      "value": {
                                        "type": "string"
                                      }
                                    },
                                    "sources": {
                                      "required": true,
                                      "value": {
                                        "type": "array",
                                        "items": {
                                          "type": "object",
                                          "fields": {
                                            "fileId": {
                                              "required": true,
                                              "value": {
                                                "type": "string"
                                              }
                                            },
                                            "page": {
                                              "required": true,
                                              "value": {
                                                "type": "union",
                                                "variants": [
                                                  {
                                                    "type": "integer"
                                                  },
                                                  {
                                                    "type": "null"
                                                  }
                                                ]
                                              }
                                            },
                                            "section": {
                                              "required": true,
                                              "value": {
                                                "type": "union",
                                                "variants": [
                                                  {
                                                    "type": "string"
                                                  },
                                                  {
                                                    "type": "null"
                                                  }
                                                ]
                                              }
                                            }
                                          }
                                        }
                                      }
                                    },
                                    "statement": {
                                      "required": true,
                                      "value": {
                                        "type": "string"
                                      }
                                    },
                                    "topic": {
                                      "required": true,
                                      "value": {
                                        "type": "union",
                                        "variants": [
                                          {
                                            "type": "enum",
                                            "values": [
                                              "debt_covenant",
                                              "debt_policy",
                                              "receivables_assignment",
                                              "supplier_contract",
                                              "debt_position",
                                              "statements_version",
                                              "group_perimeter"
                                            ]
                                          },
                                          {
                                            "type": "null"
                                          }
                                        ]
                                      }
                                    },
                                    "effect": {
                                      "required": true,
                                      "value": {
                                        "type": "union",
                                        "variants": [
                                          {
                                            "type": "enum",
                                            "values": [
                                              "binding_limit",
                                              "policy_limit",
                                              "collateral_restriction",
                                              "deadline",
                                              "figure_correction",
                                              "version_conflict",
                                              "perimeter"
                                            ]
                                          },
                                          {
                                            "type": "null"
                                          }
                                        ]
                                      }
                                    },
                                    "decisionStatement": {
                                      "required": true,
                                      "value": {
                                        "type": "union",
                                        "variants": [
                                          {
                                            "type": "string"
                                          },
                                          {
                                            "type": "null"
                                          }
                                        ]
                                      }
                                    },
                                    "knowledge": {
                                      "required": true,
                                      "value": {
                                        "type": "enum",
                                        "values": [
                                          "known",
                                          "future",
                                          "unread",
                                          "missing_source",
                                          "conflict"
                                        ]
                                      }
                                    },
                                    "quoted": {
                                      "required": true,
                                      "value": {
                                        "type": "union",
                                        "variants": [
                                          {
                                            "type": "object",
                                            "fields": {
                                              "fileId": {
                                                "required": true,
                                                "value": {
                                                  "type": "string"
                                                }
                                              },
                                              "page": {
                                                "required": true,
                                                "value": {
                                                  "type": "union",
                                                  "variants": [
                                                    {
                                                      "type": "integer"
                                                    },
                                                    {
                                                      "type": "null"
                                                    }
                                                  ]
                                                }
                                              },
                                              "section": {
                                                "required": true,
                                                "value": {
                                                  "type": "union",
                                                  "variants": [
                                                    {
                                                      "type": "string"
                                                    },
                                                    {
                                                      "type": "null"
                                                    }
                                                  ]
                                                }
                                              },
                                              "text": {
                                                "required": true,
                                                "value": {
                                                  "type": "string"
                                                }
                                              }
                                            }
                                          },
                                          {
                                            "type": "null"
                                          }
                                        ]
                                      }
                                    },
                                    "changes": {
                                      "required": true,
                                      "value": {
                                        "type": "union",
                                        "variants": [
                                          {
                                            "type": "array",
                                            "items": {
                                              "type": "object",
                                              "fields": {
                                                "type": {
                                                  "required": true,
                                                  "value": {
                                                    "type": "string"
                                                  }
                                                },
                                                "current": {
                                                  "required": true,
                                                  "value": {
                                                    "type": "boolean"
                                                  }
                                                },
                                                "before": {
                                                  "required": true,
                                                  "value": {
                                                    "type": "union",
                                                    "variants": [
                                                      {
                                                        "type": "object",
                                                        "fields": {
                                                          "fileId": {
                                                            "required": true,
                                                            "value": {
                                                              "type": "string"
                                                            }
                                                          },
                                                          "page": {
                                                            "required": true,
                                                            "value": {
                                                              "type": "union",
                                                              "variants": [
                                                                {
                                                                  "type": "integer"
                                                                },
                                                                {
                                                                  "type": "null"
                                                                }
                                                              ]
                                                            }
                                                          },
                                                          "section": {
                                                            "required": true,
                                                            "value": {
                                                              "type": "union",
                                                              "variants": [
                                                                {
                                                                  "type": "string"
                                                                },
                                                                {
                                                                  "type": "null"
                                                                }
                                                              ]
                                                            }
                                                          },
                                                          "text": {
                                                            "required": true,
                                                            "value": {
                                                              "type": "string"
                                                            }
                                                          }
                                                        }
                                                      },
                                                      {
                                                        "type": "null"
                                                      }
                                                    ]
                                                  }
                                                },
                                                "after": {
                                                  "required": true,
                                                  "value": {
                                                    "type": "object",
                                                    "fields": {
                                                      "fileId": {
                                                        "required": true,
                                                        "value": {
                                                          "type": "string"
                                                        }
                                                      },
                                                      "page": {
                                                        "required": true,
                                                        "value": {
                                                          "type": "union",
                                                          "variants": [
                                                            {
                                                              "type": "integer"
                                                            },
                                                            {
                                                              "type": "null"
                                                            }
                                                          ]
                                                        }
                                                      },
                                                      "section": {
                                                        "required": true,
                                                        "value": {
                                                          "type": "union",
                                                          "variants": [
                                                            {
                                                              "type": "string"
                                                            },
                                                            {
                                                              "type": "null"
                                                            }
                                                          ]
                                                        }
                                                      },
                                                      "text": {
                                                        "required": true,
                                                        "value": {
                                                          "type": "string"
                                                        }
                                                      }
                                                    }
                                                  }
                                                }
                                              }
                                            }
                                          },
                                          {
                                            "type": "null"
                                          }
                                        ]
                                      }
                                    },
                                    "status": {
                                      "required": true,
                                      "value": {
                                        "type": "enum",
                                        "values": [
                                          "open",
                                          "resolved"
                                        ]
                                      }
                                    },
                                    "resolvedBy": {
                                      "required": true,
                                      "value": {
                                        "type": "array",
                                        "items": {
                                          "type": "string"
                                        }
                                      }
                                    }
                                  }
                                }
                              }
                            },
                            "decisionFindings": {
                              "required": true,
                              "value": {
                                "type": "union",
                                "variants": [
                                  {
                                    "type": "array",
                                    "items": {
                                      "type": "object",
                                      "fields": {
                                        "rank": {
                                          "required": true,
                                          "value": {
                                            "type": "integer"
                                          }
                                        },
                                        "findingId": {
                                          "required": true,
                                          "value": {
                                            "type": "string"
                                          }
                                        },
                                        "decisionIds": {
                                          "required": true,
                                          "value": {
                                            "type": "array",
                                            "items": {
                                              "type": "string"
                                            }
                                          }
                                        },
                                        "effect": {
                                          "required": true,
                                          "value": {
                                            "type": "enum",
                                            "values": [
                                              "binding_limit",
                                              "policy_limit",
                                              "collateral_restriction",
                                              "deadline",
                                              "figure_correction",
                                              "version_conflict",
                                              "perimeter"
                                            ]
                                          }
                                        },
                                        "statement": {
                                          "required": true,
                                          "value": {
                                            "type": "string"
                                          }
                                        },
                                        "sources": {
                                          "required": true,
                                          "value": {
                                            "type": "array",
                                            "items": {
                                              "type": "object",
                                              "fields": {
                                                "fileId": {
                                                  "required": true,
                                                  "value": {
                                                    "type": "string"
                                                  }
                                                },
                                                "page": {
                                                  "required": true,
                                                  "value": {
                                                    "type": "union",
                                                    "variants": [
                                                      {
                                                        "type": "integer"
                                                      },
                                                      {
                                                        "type": "null"
                                                      }
                                                    ]
                                                  }
                                                },
                                                "section": {
                                                  "required": true,
                                                  "value": {
                                                    "type": "union",
                                                    "variants": [
                                                      {
                                                        "type": "string"
                                                      },
                                                      {
                                                        "type": "null"
                                                      }
                                                    ]
                                                  }
                                                }
                                              }
                                            }
                                          }
                                        }
                                      }
                                    }
                                  },
                                  {
                                    "type": "null"
                                  }
                                ]
                              }
                            },
                            "generalFindings": {
                              "required": true,
                              "value": {
                                "type": "union",
                                "variants": [
                                  {
                                    "type": "array",
                                    "items": {
                                      "type": "object",
                                      "fields": {
                                        "rank": {
                                          "required": true,
                                          "value": {
                                            "type": "integer"
                                          }
                                        },
                                        "findingId": {
                                          "required": true,
                                          "value": {
                                            "type": "string"
                                          }
                                        },
                                        "effect": {
                                          "required": true,
                                          "value": {
                                            "type": "enum",
                                            "values": [
                                              "binding_limit",
                                              "policy_limit",
                                              "collateral_restriction",
                                              "deadline",
                                              "figure_correction",
                                              "version_conflict",
                                              "perimeter"
                                            ]
                                          }
                                        },
                                        "statement": {
                                          "required": true,
                                          "value": {
                                            "type": "string"
                                          }
                                        }
                                      }
                                    }
                                  },
                                  {
                                    "type": "null"
                                  }
                                ]
                              }
                            },
                            "identityChecks": {
                              "required": true,
                              "value": {
                                "type": "array",
                                "items": {
                                  "type": "object",
                                  "fields": {
                                    "id": {
                                      "required": true,
                                      "value": {
                                        "type": "string"
                                      }
                                    },
                                    "kind": {
                                      "required": true,
                                      "value": {
                                        "type": "enum",
                                        "values": [
                                          "reported_total",
                                          "period_against_months"
                                        ]
                                      }
                                    },
                                    "fileIds": {
                                      "required": true,
                                      "value": {
                                        "type": "array",
                                        "items": {
                                          "type": "string"
                                        }
                                      }
                                    },
                                    "status": {
                                      "required": true,
                                      "value": {
                                        "type": "enum",
                                        "values": [
                                          "matches",
                                          "differs",
                                          "not_run"
                                        ]
                                      }
                                    },
                                    "reported": {
                                      "required": true,
                                      "value": {
                                        "type": "union",
                                        "variants": [
                                          {
                                            "type": "string"
                                          },
                                          {
                                            "type": "null"
                                          }
                                        ]
                                      }
                                    },
                                    "recomposed": {
                                      "required": true,
                                      "value": {
                                        "type": "union",
                                        "variants": [
                                          {
                                            "type": "string"
                                          },
                                          {
                                            "type": "null"
                                          }
                                        ]
                                      }
                                    },
                                    "currency": {
                                      "required": true,
                                      "value": {
                                        "type": "string"
                                      }
                                    },
                                    "reason": {
                                      "required": true,
                                      "value": {
                                        "type": "union",
                                        "variants": [
                                          {
                                            "type": "string"
                                          },
                                          {
                                            "type": "null"
                                          }
                                        ]
                                      }
                                    }
                                  }
                                }
                              }
                            },
                            "gaps": {
                              "required": true,
                              "value": {
                                "type": "array",
                                "items": {
                                  "type": "object",
                                  "fields": {
                                    "id": {
                                      "required": true,
                                      "value": {
                                        "type": "string"
                                      }
                                    },
                                    "need": {
                                      "required": true,
                                      "value": {
                                        "type": "enum",
                                        "values": [
                                          "monthly_series",
                                          "reading_substitute",
                                          "real_collateral",
                                          "group_perimeter",
                                          "liquidity_projection"
                                        ]
                                      }
                                    },
                                    "item": {
                                      "required": true,
                                      "value": {
                                        "type": "string"
                                      }
                                    },
                                    "why": {
                                      "required": true,
                                      "value": {
                                        "type": "string"
                                      }
                                    },
                                    "quoted": {
                                      "required": true,
                                      "value": {
                                        "type": "union",
                                        "variants": [
                                          {
                                            "type": "object",
                                            "fields": {
                                              "fileId": {
                                                "required": true,
                                                "value": {
                                                  "type": "string"
                                                }
                                              },
                                              "page": {
                                                "required": true,
                                                "value": {
                                                  "type": "union",
                                                  "variants": [
                                                    {
                                                      "type": "integer"
                                                    },
                                                    {
                                                      "type": "null"
                                                    }
                                                  ]
                                                }
                                              },
                                              "section": {
                                                "required": true,
                                                "value": {
                                                  "type": "union",
                                                  "variants": [
                                                    {
                                                      "type": "string"
                                                    },
                                                    {
                                                      "type": "null"
                                                    }
                                                  ]
                                                }
                                              },
                                              "text": {
                                                "required": true,
                                                "value": {
                                                  "type": "string"
                                                }
                                              }
                                            }
                                          },
                                          {
                                            "type": "null"
                                          }
                                        ]
                                      }
                                    },
                                    "purposes": {
                                      "required": true,
                                      "value": {
                                        "type": "array",
                                        "items": {
                                          "type": "string"
                                        }
                                      }
                                    },
                                    "findingId": {
                                      "required": true,
                                      "value": {
                                        "type": "union",
                                        "variants": [
                                          {
                                            "type": "string"
                                          },
                                          {
                                            "type": "null"
                                          }
                                        ]
                                      }
                                    },
                                    "conditional": {
                                      "required": true,
                                      "value": {
                                        "type": "boolean"
                                      }
                                    },
                                    "status": {
                                      "required": true,
                                      "value": {
                                        "type": "enum",
                                        "values": [
                                          "open",
                                          "resolved"
                                        ]
                                      }
                                    },
                                    "resolvedBy": {
                                      "required": true,
                                      "value": {
                                        "type": "array",
                                        "items": {
                                          "type": "string"
                                        }
                                      }
                                    }
                                  }
                                }
                              }
                            },
                            "questions": {
                              "required": true,
                              "value": {
                                "type": "array",
                                "items": {
                                  "type": "object",
                                  "fields": {
                                    "id": {
                                      "required": true,
                                      "value": {
                                        "type": "string"
                                      }
                                    },
                                    "text": {
                                      "required": true,
                                      "value": {
                                        "type": "string"
                                      }
                                    },
                                    "fileIds": {
                                      "required": true,
                                      "value": {
                                        "type": "array",
                                        "items": {
                                          "type": "string"
                                        }
                                      }
                                    },
                                    "findingId": {
                                      "required": true,
                                      "value": {
                                        "type": "union",
                                        "variants": [
                                          {
                                            "type": "string"
                                          },
                                          {
                                            "type": "null"
                                          }
                                        ]
                                      }
                                    },
                                    "status": {
                                      "required": true,
                                      "value": {
                                        "type": "enum",
                                        "values": [
                                          "open",
                                          "answered"
                                        ]
                                      }
                                    },
                                    "answeredBy": {
                                      "required": true,
                                      "value": {
                                        "type": "union",
                                        "variants": [
                                          {
                                            "type": "string"
                                          },
                                          {
                                            "type": "null"
                                          }
                                        ]
                                      }
                                    }
                                  }
                                }
                              }
                            },
                            "informed": {
                              "required": true,
                              "value": {
                                "type": "array",
                                "items": {
                                  "type": "object",
                                  "fields": {
                                    "id": {
                                      "required": true,
                                      "value": {
                                        "type": "string"
                                      }
                                    },
                                    "questionId": {
                                      "required": true,
                                      "value": {
                                        "type": "string"
                                      }
                                    },
                                    "statement": {
                                      "required": true,
                                      "value": {
                                        "type": "string"
                                      }
                                    },
                                    "author": {
                                      "required": true,
                                      "value": {
                                        "type": "string"
                                      }
                                    },
                                    "date": {
                                      "required": true,
                                      "value": {
                                        "type": "date"
                                      }
                                    },
                                    "origin": {
                                      "required": true,
                                      "value": {
                                        "type": "enum",
                                        "values": [
                                          "informed"
                                        ]
                                      }
                                    }
                                  }
                                }
                              }
                            },
                            "followUps": {
                              "required": true,
                              "value": {
                                "type": "array",
                                "items": {
                                  "type": "union",
                                  "variants": [
                                    {
                                      "type": "object",
                                      "fields": {
                                        "kind": {
                                          "required": true,
                                          "value": {
                                            "type": "enum",
                                            "values": [
                                              "notice_deadline"
                                            ]
                                          }
                                        },
                                        "date": {
                                          "required": true,
                                          "value": {
                                            "type": "date"
                                          }
                                        },
                                        "fileId": {
                                          "required": true,
                                          "value": {
                                            "type": "string"
                                          }
                                        },
                                        "clauseId": {
                                          "required": true,
                                          "value": {
                                            "type": "string"
                                          }
                                        },
                                        "decisionIds": {
                                          "required": true,
                                          "value": {
                                            "type": "array",
                                            "items": {
                                              "type": "string"
                                            }
                                          }
                                        },
                                        "scheduled": {
                                          "required": true,
                                          "value": {
                                            "type": "boolean"
                                          }
                                        }
                                      }
                                    },
                                    {
                                      "type": "object",
                                      "fields": {
                                        "kind": {
                                          "required": true,
                                          "value": {
                                            "type": "enum",
                                            "values": [
                                              "effective_text"
                                            ]
                                          }
                                        },
                                        "instrumentRef": {
                                          "required": true,
                                          "value": {
                                            "type": "string"
                                          }
                                        },
                                        "entityId": {
                                          "required": true,
                                          "value": {
                                            "type": "string"
                                          }
                                        },
                                        "fileIds": {
                                          "required": true,
                                          "value": {
                                            "type": "array",
                                            "items": {
                                              "type": "string"
                                            }
                                          }
                                        }
                                      }
                                    }
                                  ]
                                }
                              }
                            },
                            "counts": {
                              "required": true,
                              "value": {
                                "type": "object",
                                "fields": {
                                  "files": {
                                    "required": true,
                                    "value": {
                                      "type": "integer"
                                    }
                                  },
                                  "duplicates": {
                                    "required": true,
                                    "value": {
                                      "type": "integer"
                                    }
                                  },
                                  "incompleteReadings": {
                                    "required": true,
                                    "value": {
                                      "type": "integer"
                                    }
                                  },
                                  "superseded": {
                                    "required": true,
                                    "value": {
                                      "type": "integer"
                                    }
                                  },
                                  "inVault": {
                                    "required": true,
                                    "value": {
                                      "type": "integer"
                                    }
                                  },
                                  "withFinding": {
                                    "required": true,
                                    "value": {
                                      "type": "integer"
                                    }
                                  },
                                  "pageSubstitutes": {
                                    "required": true,
                                    "value": {
                                      "type": "integer"
                                    }
                                  }
                                }
                              }
                            },
                            "readingConflicts": {
                              "required": true,
                              "value": {
                                "type": "array",
                                "items": {
                                  "type": "object",
                                  "fields": {
                                    "sha256": {
                                      "required": true,
                                      "value": {
                                        "type": "union",
                                        "variants": [
                                          {
                                            "type": "string"
                                          },
                                          {
                                            "type": "null"
                                          }
                                        ]
                                      }
                                    },
                                    "page": {
                                      "required": true,
                                      "value": {
                                        "type": "union",
                                        "variants": [
                                          {
                                            "type": "integer"
                                          },
                                          {
                                            "type": "null"
                                          }
                                        ]
                                      }
                                    },
                                    "fileIds": {
                                      "required": true,
                                      "value": {
                                        "type": "array",
                                        "items": {
                                          "type": "string"
                                        }
                                      }
                                    }
                                  }
                                }
                              }
                            },
                            "update": {
                              "required": true,
                              "value": {
                                "type": "union",
                                "variants": [
                                  {
                                    "type": "object",
                                    "fields": {
                                      "priorFingerprint": {
                                        "required": true,
                                        "value": {
                                          "type": "string"
                                        }
                                      },
                                      "rowsUpdated": {
                                        "required": true,
                                        "value": {
                                          "type": "array",
                                          "items": {
                                            "type": "string"
                                          }
                                        }
                                      },
                                      "rowsAdded": {
                                        "required": true,
                                        "value": {
                                          "type": "array",
                                          "items": {
                                            "type": "string"
                                          }
                                        }
                                      },
                                      "rowsPreserved": {
                                        "required": true,
                                        "value": {
                                          "type": "integer"
                                        }
                                      },
                                      "findingsResolved": {
                                        "required": true,
                                        "value": {
                                          "type": "array",
                                          "items": {
                                            "type": "string"
                                          }
                                        }
                                      },
                                      "findingsAdded": {
                                        "required": true,
                                        "value": {
                                          "type": "array",
                                          "items": {
                                            "type": "string"
                                          }
                                        }
                                      },
                                      "gapsResolved": {
                                        "required": true,
                                        "value": {
                                          "type": "array",
                                          "items": {
                                            "type": "string"
                                          }
                                        }
                                      },
                                      "questionsAnswered": {
                                        "required": true,
                                        "value": {
                                          "type": "array",
                                          "items": {
                                            "type": "string"
                                          }
                                        }
                                      }
                                    }
                                  },
                                  {
                                    "type": "null"
                                  }
                                ]
                              }
                            }
                          }
                        },
                        {
                          "type": "null"
                        }
                      ]
                    }
                  },
                  "gaps": {
                    "required": true,
                    "value": {
                      "type": "array",
                      "items": {
                        "type": "object",
                        "fields": {
                          "operand": {
                            "required": true,
                            "value": {
                              "type": "string"
                            }
                          },
                          "reason": {
                            "required": true,
                            "value": {
                              "type": "string"
                            }
                          }
                        }
                      }
                    }
                  },
                  "bindings": {
                    "required": true,
                    "value": {
                      "type": "array",
                      "items": {
                        "type": "object",
                        "fields": {
                          "operand": {
                            "required": true,
                            "value": {
                              "type": "string"
                            }
                          },
                          "decisionId": {
                            "required": true,
                            "value": {
                              "type": "union",
                              "variants": [
                                {
                                  "type": "string"
                                },
                                {
                                  "type": "null"
                                }
                              ]
                            }
                          },
                          "interpretationDecisionIds": {
                            "required": true,
                            "value": {
                              "type": "array",
                              "items": {
                                "type": "string"
                              }
                            }
                          }
                        }
                      }
                    }
                  },
                  "contributions": {
                    "required": true,
                    "value": {
                      "type": "array",
                      "items": {
                        "type": "object",
                        "fields": {
                          "decisionId": {
                            "required": true,
                            "value": {
                              "type": "string"
                            }
                          },
                          "slotKey": {
                            "required": true,
                            "value": {
                              "type": "string"
                            }
                          },
                          "kind": {
                            "required": true,
                            "value": {
                              "type": "enum",
                              "values": [
                                "observation",
                                "hypothesis"
                              ]
                            }
                          },
                          "fieldPath": {
                            "required": true,
                            "value": {
                              "type": "string"
                            }
                          },
                          "dimensions": {
                            "required": true,
                            "value": {
                              "type": "object",
                              "fields": {
                                "entityId": {
                                  "required": true,
                                  "value": {
                                    "type": "union",
                                    "variants": [
                                      {
                                        "type": "string"
                                      },
                                      {
                                        "type": "null"
                                      }
                                    ]
                                  }
                                },
                                "perimeter": {
                                  "required": true,
                                  "value": {
                                    "type": "union",
                                    "variants": [
                                      {
                                        "type": "string"
                                      },
                                      {
                                        "type": "null"
                                      }
                                    ]
                                  }
                                },
                                "periodStart": {
                                  "required": true,
                                  "value": {
                                    "type": "union",
                                    "variants": [
                                      {
                                        "type": "date"
                                      },
                                      {
                                        "type": "null"
                                      }
                                    ]
                                  }
                                },
                                "periodEnd": {
                                  "required": true,
                                  "value": {
                                    "type": "union",
                                    "variants": [
                                      {
                                        "type": "date"
                                      },
                                      {
                                        "type": "null"
                                      }
                                    ]
                                  }
                                },
                                "currency": {
                                  "required": true,
                                  "value": {
                                    "type": "union",
                                    "variants": [
                                      {
                                        "type": "string"
                                      },
                                      {
                                        "type": "null"
                                      }
                                    ]
                                  }
                                },
                                "unit": {
                                  "required": true,
                                  "value": {
                                    "type": "union",
                                    "variants": [
                                      {
                                        "type": "string"
                                      },
                                      {
                                        "type": "null"
                                      }
                                    ]
                                  }
                                },
                                "scale": {
                                  "required": true,
                                  "value": {
                                    "type": "union",
                                    "variants": [
                                      {
                                        "type": "string"
                                      },
                                      {
                                        "type": "null"
                                      }
                                    ]
                                  }
                                },
                                "scenario": {
                                  "required": true,
                                  "value": {
                                    "type": "union",
                                    "variants": [
                                      {
                                        "type": "string"
                                      },
                                      {
                                        "type": "null"
                                      }
                                    ]
                                  }
                                },
                                "definitionVersionId": {
                                  "required": true,
                                  "value": {
                                    "type": "union",
                                    "variants": [
                                      {
                                        "type": "string"
                                      },
                                      {
                                        "type": "null"
                                      }
                                    ]
                                  }
                                }
                              }
                            }
                          },
                          "value": {
                            "required": true,
                            "value": {
                              "type": "union",
                              "variants": [
                                {
                                  "type": "object",
                                  "fields": {
                                    "type": {
                                      "required": true,
                                      "value": {
                                        "type": "enum",
                                        "values": [
                                          "number"
                                        ]
                                      }
                                    },
                                    "value": {
                                      "required": true,
                                      "value": {
                                        "type": "decimal_string"
                                      }
                                    }
                                  }
                                },
                                {
                                  "type": "object",
                                  "fields": {
                                    "type": {
                                      "required": true,
                                      "value": {
                                        "type": "enum",
                                        "values": [
                                          "text"
                                        ]
                                      }
                                    },
                                    "value": {
                                      "required": true,
                                      "value": {
                                        "type": "string"
                                      }
                                    }
                                  }
                                },
                                {
                                  "type": "object",
                                  "fields": {
                                    "type": {
                                      "required": true,
                                      "value": {
                                        "type": "enum",
                                        "values": [
                                          "date"
                                        ]
                                      }
                                    },
                                    "value": {
                                      "required": true,
                                      "value": {
                                        "type": "date"
                                      }
                                    }
                                  }
                                },
                                {
                                  "type": "object",
                                  "fields": {
                                    "type": {
                                      "required": true,
                                      "value": {
                                        "type": "enum",
                                        "values": [
                                          "boolean"
                                        ]
                                      }
                                    },
                                    "value": {
                                      "required": true,
                                      "value": {
                                        "type": "boolean"
                                      }
                                    }
                                  }
                                },
                                {
                                  "type": "object",
                                  "fields": {
                                    "type": {
                                      "required": true,
                                      "value": {
                                        "type": "enum",
                                        "values": [
                                          "list"
                                        ]
                                      }
                                    },
                                    "value": {
                                      "required": true,
                                      "value": {
                                        "type": "array",
                                        "items": {
                                          "type": "string"
                                        }
                                      }
                                    }
                                  }
                                }
                              ]
                            }
                          },
                          "observationId": {
                            "required": true,
                            "value": {
                              "type": "union",
                              "variants": [
                                {
                                  "type": "string"
                                },
                                {
                                  "type": "null"
                                }
                              ]
                            }
                          },
                          "referenceValue": {
                            "required": true,
                            "value": {
                              "type": "union",
                              "variants": [
                                {
                                  "type": "union",
                                  "variants": [
                                    {
                                      "type": "object",
                                      "fields": {
                                        "type": {
                                          "required": true,
                                          "value": {
                                            "type": "enum",
                                            "values": [
                                              "number"
                                            ]
                                          }
                                        },
                                        "value": {
                                          "required": true,
                                          "value": {
                                            "type": "decimal_string"
                                          }
                                        }
                                      }
                                    },
                                    {
                                      "type": "object",
                                      "fields": {
                                        "type": {
                                          "required": true,
                                          "value": {
                                            "type": "enum",
                                            "values": [
                                              "text"
                                            ]
                                          }
                                        },
                                        "value": {
                                          "required": true,
                                          "value": {
                                            "type": "string"
                                          }
                                        }
                                      }
                                    },
                                    {
                                      "type": "object",
                                      "fields": {
                                        "type": {
                                          "required": true,
                                          "value": {
                                            "type": "enum",
                                            "values": [
                                              "date"
                                            ]
                                          }
                                        },
                                        "value": {
                                          "required": true,
                                          "value": {
                                            "type": "date"
                                          }
                                        }
                                      }
                                    },
                                    {
                                      "type": "object",
                                      "fields": {
                                        "type": {
                                          "required": true,
                                          "value": {
                                            "type": "enum",
                                            "values": [
                                              "boolean"
                                            ]
                                          }
                                        },
                                        "value": {
                                          "required": true,
                                          "value": {
                                            "type": "boolean"
                                          }
                                        }
                                      }
                                    },
                                    {
                                      "type": "object",
                                      "fields": {
                                        "type": {
                                          "required": true,
                                          "value": {
                                            "type": "enum",
                                            "values": [
                                              "list"
                                            ]
                                          }
                                        },
                                        "value": {
                                          "required": true,
                                          "value": {
                                            "type": "array",
                                            "items": {
                                              "type": "string"
                                            }
                                          }
                                        }
                                      }
                                    }
                                  ]
                                },
                                {
                                  "type": "null"
                                }
                              ]
                            }
                          },
                          "referenceDimensions": {
                            "required": true,
                            "value": {
                              "type": "union",
                              "variants": [
                                {
                                  "type": "object",
                                  "fields": {
                                    "entityId": {
                                      "required": true,
                                      "value": {
                                        "type": "union",
                                        "variants": [
                                          {
                                            "type": "string"
                                          },
                                          {
                                            "type": "null"
                                          }
                                        ]
                                      }
                                    },
                                    "perimeter": {
                                      "required": true,
                                      "value": {
                                        "type": "union",
                                        "variants": [
                                          {
                                            "type": "string"
                                          },
                                          {
                                            "type": "null"
                                          }
                                        ]
                                      }
                                    },
                                    "periodStart": {
                                      "required": true,
                                      "value": {
                                        "type": "union",
                                        "variants": [
                                          {
                                            "type": "date"
                                          },
                                          {
                                            "type": "null"
                                          }
                                        ]
                                      }
                                    },
                                    "periodEnd": {
                                      "required": true,
                                      "value": {
                                        "type": "union",
                                        "variants": [
                                          {
                                            "type": "date"
                                          },
                                          {
                                            "type": "null"
                                          }
                                        ]
                                      }
                                    },
                                    "currency": {
                                      "required": true,
                                      "value": {
                                        "type": "union",
                                        "variants": [
                                          {
                                            "type": "string"
                                          },
                                          {
                                            "type": "null"
                                          }
                                        ]
                                      }
                                    },
                                    "unit": {
                                      "required": true,
                                      "value": {
                                        "type": "union",
                                        "variants": [
                                          {
                                            "type": "string"
                                          },
                                          {
                                            "type": "null"
                                          }
                                        ]
                                      }
                                    },
                                    "scale": {
                                      "required": true,
                                      "value": {
                                        "type": "union",
                                        "variants": [
                                          {
                                            "type": "string"
                                          },
                                          {
                                            "type": "null"
                                          }
                                        ]
                                      }
                                    },
                                    "scenario": {
                                      "required": true,
                                      "value": {
                                        "type": "union",
                                        "variants": [
                                          {
                                            "type": "string"
                                          },
                                          {
                                            "type": "null"
                                          }
                                        ]
                                      }
                                    },
                                    "definitionVersionId": {
                                      "required": true,
                                      "value": {
                                        "type": "union",
                                        "variants": [
                                          {
                                            "type": "string"
                                          },
                                          {
                                            "type": "null"
                                          }
                                        ]
                                      }
                                    }
                                  }
                                },
                                {
                                  "type": "null"
                                }
                              ]
                            }
                          },
                          "definitionKind": {
                            "required": true,
                            "value": {
                              "type": "enum",
                              "values": [
                                "reported",
                                "managerial",
                                "contractual"
                              ]
                            }
                          },
                          "actorId": {
                            "required": true,
                            "value": {
                              "type": "string"
                            }
                          },
                          "reason": {
                            "required": true,
                            "value": {
                              "type": "string"
                            }
                          }
                        }
                      }
                    }
                  },
                  "status": {
                    "required": true,
                    "value": {
                      "type": "enum",
                      "values": [
                        "complete",
                        "base_only",
                        "missing_inputs"
                      ]
                    }
                  },
                  "derivedDependencies": {
                    "required": true,
                    "value": {
                      "type": "array",
                      "items": {
                        "type": "object",
                        "fields": {
                          "result": {
                            "required": true,
                            "value": {
                              "type": "string"
                            }
                          },
                          "decisionIds": {
                            "required": true,
                            "value": {
                              "type": "array",
                              "items": {
                                "type": "string"
                              }
                            }
                          }
                        }
                      }
                    }
                  },
                  "classification": {
                    "required": true,
                    "value": {
                      "type": "enum",
                      "values": [
                        "working_hypothesis",
                        "working_selection"
                      ]
                    }
                  },
                  "exclusions": {
                    "required": true,
                    "value": {
                      "type": "array",
                      "items": {
                        "type": "enum",
                        "values": [
                          "ratio_calculation",
                          "projection",
                          "recommendation",
                          "document_validation",
                          "third_party_distribution",
                          "credit_approval"
                        ]
                      }
                    }
                  },
                  "grantsExecution": {
                    "required": true,
                    "value": {
                      "type": "boolean"
                    }
                  },
                  "grantsPublication": {
                    "required": true,
                    "value": {
                      "type": "boolean"
                    }
                  },
                  "fingerprint": {
                    "required": true,
                    "value": {
                      "type": "string"
                    }
                  }
                }
              }
            },
            "readings": {
              "required": true,
              "value": {
                "type": "union",
                "variants": [
                  {
                    "type": "object",
                    "fields": {
                      "opening": {
                        "required": true,
                        "value": {
                          "type": "object",
                          "fields": {
                            "files": {
                              "required": true,
                              "value": {
                                "type": "integer"
                              }
                            },
                            "groups": {
                              "required": true,
                              "value": {
                                "type": "array",
                                "items": {
                                  "type": "string"
                                }
                              }
                            },
                            "duplicates": {
                              "required": true,
                              "value": {
                                "type": "integer"
                              }
                            },
                            "superseded": {
                              "required": true,
                              "value": {
                                "type": "integer"
                              }
                            },
                            "inVault": {
                              "required": true,
                              "value": {
                                "type": "integer"
                              }
                            }
                          }
                        }
                      },
                      "decisionFindings": {
                        "required": true,
                        "value": {
                          "type": "union",
                          "variants": [
                            {
                              "type": "array",
                              "items": {
                                "type": "object",
                                "fields": {
                                  "rank": {
                                    "required": true,
                                    "value": {
                                      "type": "integer"
                                    }
                                  },
                                  "statement": {
                                    "required": true,
                                    "value": {
                                      "type": "string"
                                    }
                                  },
                                  "decisionIds": {
                                    "required": true,
                                    "value": {
                                      "type": "array",
                                      "items": {
                                        "type": "string"
                                      }
                                    }
                                  },
                                  "sources": {
                                    "required": true,
                                    "value": {
                                      "type": "array",
                                      "items": {
                                        "type": "object",
                                        "fields": {
                                          "fileId": {
                                            "required": true,
                                            "value": {
                                              "type": "string"
                                            }
                                          },
                                          "page": {
                                            "required": true,
                                            "value": {
                                              "type": "union",
                                              "variants": [
                                                {
                                                  "type": "integer"
                                                },
                                                {
                                                  "type": "null"
                                                }
                                              ]
                                            }
                                          },
                                          "section": {
                                            "required": true,
                                            "value": {
                                              "type": "union",
                                              "variants": [
                                                {
                                                  "type": "string"
                                                },
                                                {
                                                  "type": "null"
                                                }
                                              ]
                                            }
                                          }
                                        }
                                      }
                                    }
                                  }
                                }
                              }
                            },
                            {
                              "type": "null"
                            }
                          ]
                        }
                      },
                      "generalFindings": {
                        "required": true,
                        "value": {
                          "type": "union",
                          "variants": [
                            {
                              "type": "array",
                              "items": {
                                "type": "object",
                                "fields": {
                                  "rank": {
                                    "required": true,
                                    "value": {
                                      "type": "integer"
                                    }
                                  },
                                  "statement": {
                                    "required": true,
                                    "value": {
                                      "type": "string"
                                    }
                                  }
                                }
                              }
                            },
                            {
                              "type": "null"
                            }
                          ]
                        }
                      },
                      "versions": {
                        "required": true,
                        "value": {
                          "type": "array",
                          "items": {
                            "type": "object",
                            "fields": {
                              "familyId": {
                                "required": true,
                                "value": {
                                  "type": "string"
                                }
                              },
                              "resolution": {
                                "required": true,
                                "value": {
                                  "type": "string"
                                }
                              },
                              "prevails": {
                                "required": true,
                                "value": {
                                  "type": "array",
                                  "items": {
                                    "type": "string"
                                  }
                                }
                              },
                              "superseded": {
                                "required": true,
                                "value": {
                                  "type": "array",
                                  "items": {
                                    "type": "string"
                                  }
                                }
                              },
                              "sideBySide": {
                                "required": true,
                                "value": {
                                  "type": "array",
                                  "items": {
                                    "type": "string"
                                  }
                                }
                              },
                              "highlighted": {
                                "required": true,
                                "value": {
                                  "type": "boolean"
                                }
                              }
                            }
                          }
                        }
                      },
                      "documentary": {
                        "required": true,
                        "value": {
                          "type": "array",
                          "items": {
                            "type": "object",
                            "fields": {
                              "findingId": {
                                "required": true,
                                "value": {
                                  "type": "string"
                                }
                              },
                              "fileId": {
                                "required": true,
                                "value": {
                                  "type": "string"
                                }
                              },
                              "page": {
                                "required": true,
                                "value": {
                                  "type": "union",
                                  "variants": [
                                    {
                                      "type": "integer"
                                    },
                                    {
                                      "type": "null"
                                    }
                                  ]
                                }
                              },
                              "section": {
                                "required": true,
                                "value": {
                                  "type": "union",
                                  "variants": [
                                    {
                                      "type": "string"
                                    },
                                    {
                                      "type": "null"
                                    }
                                  ]
                                }
                              },
                              "text": {
                                "required": true,
                                "value": {
                                  "type": "string"
                                }
                              }
                            }
                          }
                        }
                      },
                      "notRead": {
                        "required": true,
                        "value": {
                          "type": "array",
                          "items": {
                            "type": "object",
                            "fields": {
                              "fileId": {
                                "required": true,
                                "value": {
                                  "type": "string"
                                }
                              },
                              "pages": {
                                "required": true,
                                "value": {
                                  "type": "union",
                                  "variants": [
                                    {
                                      "type": "array",
                                      "items": {
                                        "type": "integer"
                                      }
                                    },
                                    {
                                      "type": "null"
                                    }
                                  ]
                                }
                              },
                              "statement": {
                                "required": true,
                                "value": {
                                  "type": "string"
                                }
                              }
                            }
                          }
                        }
                      },
                      "gaps": {
                        "required": true,
                        "value": {
                          "type": "array",
                          "items": {
                            "type": "object",
                            "fields": {
                              "item": {
                                "required": true,
                                "value": {
                                  "type": "string"
                                }
                              },
                              "why": {
                                "required": true,
                                "value": {
                                  "type": "string"
                                }
                              },
                              "purposes": {
                                "required": true,
                                "value": {
                                  "type": "array",
                                  "items": {
                                    "type": "string"
                                  }
                                }
                              },
                              "conditional": {
                                "required": true,
                                "value": {
                                  "type": "boolean"
                                }
                              }
                            }
                          }
                        }
                      },
                      "questions": {
                        "required": true,
                        "value": {
                          "type": "array",
                          "items": {
                            "type": "string"
                          }
                        }
                      },
                      "update": {
                        "required": true,
                        "value": {
                          "type": "union",
                          "variants": [
                            {
                              "type": "object",
                              "fields": {
                                "rowsUpdated": {
                                  "required": true,
                                  "value": {
                                    "type": "array",
                                    "items": {
                                      "type": "string"
                                    }
                                  }
                                },
                                "rowsAdded": {
                                  "required": true,
                                  "value": {
                                    "type": "array",
                                    "items": {
                                      "type": "string"
                                    }
                                  }
                                },
                                "rowsPreserved": {
                                  "required": true,
                                  "value": {
                                    "type": "integer"
                                  }
                                },
                                "newFindings": {
                                  "required": true,
                                  "value": {
                                    "type": "array",
                                    "items": {
                                      "type": "object",
                                      "fields": {
                                        "statement": {
                                          "required": true,
                                          "value": {
                                            "type": "string"
                                          }
                                        },
                                        "quoted": {
                                          "required": true,
                                          "value": {
                                            "type": "union",
                                            "variants": [
                                              {
                                                "type": "object",
                                                "fields": {
                                                  "fileId": {
                                                    "required": true,
                                                    "value": {
                                                      "type": "string"
                                                    }
                                                  },
                                                  "page": {
                                                    "required": true,
                                                    "value": {
                                                      "type": "union",
                                                      "variants": [
                                                        {
                                                          "type": "integer"
                                                        },
                                                        {
                                                          "type": "null"
                                                        }
                                                      ]
                                                    }
                                                  },
                                                  "section": {
                                                    "required": true,
                                                    "value": {
                                                      "type": "union",
                                                      "variants": [
                                                        {
                                                          "type": "string"
                                                        },
                                                        {
                                                          "type": "null"
                                                        }
                                                      ]
                                                    }
                                                  },
                                                  "text": {
                                                    "required": true,
                                                    "value": {
                                                      "type": "string"
                                                    }
                                                  }
                                                }
                                              },
                                              {
                                                "type": "null"
                                              }
                                            ]
                                          }
                                        }
                                      }
                                    }
                                  }
                                },
                                "identityChecks": {
                                  "required": true,
                                  "value": {
                                    "type": "array",
                                    "items": {
                                      "type": "object",
                                      "fields": {
                                        "id": {
                                          "required": true,
                                          "value": {
                                            "type": "string"
                                          }
                                        },
                                        "status": {
                                          "required": true,
                                          "value": {
                                            "type": "enum",
                                            "values": [
                                              "matches",
                                              "differs",
                                              "not_run"
                                            ]
                                          }
                                        },
                                        "reported": {
                                          "required": true,
                                          "value": {
                                            "type": "union",
                                            "variants": [
                                              {
                                                "type": "string"
                                              },
                                              {
                                                "type": "null"
                                              }
                                            ]
                                          }
                                        },
                                        "recomposed": {
                                          "required": true,
                                          "value": {
                                            "type": "union",
                                            "variants": [
                                              {
                                                "type": "string"
                                              },
                                              {
                                                "type": "null"
                                              }
                                            ]
                                          }
                                        }
                                      }
                                    }
                                  }
                                },
                                "informed": {
                                  "required": true,
                                  "value": {
                                    "type": "array",
                                    "items": {
                                      "type": "object",
                                      "fields": {
                                        "statement": {
                                          "required": true,
                                          "value": {
                                            "type": "string"
                                          }
                                        },
                                        "author": {
                                          "required": true,
                                          "value": {
                                            "type": "string"
                                          }
                                        },
                                        "date": {
                                          "required": true,
                                          "value": {
                                            "type": "date"
                                          }
                                        }
                                      }
                                    }
                                  }
                                },
                                "stillOpen": {
                                  "required": true,
                                  "value": {
                                    "type": "array",
                                    "items": {
                                      "type": "string"
                                    }
                                  }
                                }
                              }
                            },
                            {
                              "type": "null"
                            }
                          ]
                        }
                      },
                      "historical": {
                        "required": true,
                        "value": {
                          "type": "union",
                          "variants": [
                            {
                              "type": "object",
                              "fields": {
                                "inventoryFingerprint": {
                                  "required": true,
                                  "value": {
                                    "type": "string"
                                  }
                                },
                                "reason": {
                                  "required": true,
                                  "value": {
                                    "type": "enum",
                                    "values": [
                                      "update_not_read"
                                    ]
                                  }
                                }
                              }
                            },
                            {
                              "type": "null"
                            }
                          ]
                        }
                      },
                      "numericAnalysis": {
                        "required": true,
                        "value": {
                          "type": "enum",
                          "values": [
                            "none"
                          ]
                        }
                      },
                      "documentsValidated": {
                        "required": true,
                        "value": {
                          "type": "boolean"
                        }
                      }
                    }
                  },
                  {
                    "type": "null"
                  }
                ]
              }
            },
            "gaps": {
              "required": true,
              "value": {
                "type": "array",
                "items": {
                  "type": "object",
                  "fields": {
                    "operand": {
                      "required": true,
                      "value": {
                        "type": "string"
                      }
                    },
                    "reason": {
                      "required": true,
                      "value": {
                        "type": "string"
                      }
                    }
                  }
                }
              }
            },
            "status": {
              "required": true,
              "value": {
                "type": "enum",
                "values": [
                  "framed",
                  "partial",
                  "prepared_for_human_review"
                ]
              }
            },
            "exclusions": {
              "required": true,
              "value": {
                "type": "array",
                "items": {
                  "type": "enum",
                  "values": [
                    "ratio_calculation",
                    "projection",
                    "recommendation",
                    "document_validation",
                    "third_party_distribution"
                  ]
                }
              }
            },
            "grantsExecution": {
              "required": true,
              "value": {
                "type": "boolean"
              }
            },
            "grantsPublication": {
              "required": true,
              "value": {
                "type": "boolean"
              }
            },
            "fingerprint": {
              "required": true,
              "value": {
                "type": "string"
              }
            }
          }
        }
      },
      "dependencies": [
        {
          "id": "document-folder-inventory.request-framing",
          "version": "2026.10.27-v1"
        }
      ],
      "tools": [],
      "effect": "none",
      "rights": {
        "inheritSourceRestrictions": true,
        "purposes": [
          "decision_support"
        ],
        "sourceClasses": [
          "authorized_context"
        ]
      },
      "competencies": [
        "financial_analysis",
        "capital_structure"
      ],
      "invariants": [
        "law",
        "contractual_definition",
        "traceability",
        "verification",
        "access_barriers",
        "deterministic_financial_math"
      ],
      "overridePoints": [],
      "budget": {
        "maxModelCalls": 0,
        "maxDurationMs": 30000,
        "maxCostMinorUnits": 0,
        "currency": "BRL"
      },
      "evidence": [
        "packages/credit-playbook/knowledge/reviews/runs/organize-document-folder-2026-10-27-v1-gold/run.json",
        "packages/credit-playbook/knowledge/reviews/runs/organize-document-folder-2026-10-27-v1-adversarial/run.json",
        "packages/credit-playbook/knowledge/reviews/runs/organize-document-folder-2026-10-27-v1-consistency/run.json"
      ]
    }
  ]
}
```
