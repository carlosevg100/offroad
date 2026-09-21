# Etapa15: preparação contratual rastreável

`prepareCapitalContractEvidence` compõe os procedimentos existentes de juros/indexação e
reconciliação de definições de covenant. Recebe observações e fontes já lidas pelo caminho
autorizado; confere âncoras, versões, contexto, unidade monetária normalizada e termos
explícitos. Recusa defaults legados adicionados pelo parser. Retém inputs, convenções,
versões de cálculo e fingerprints. A saída é uma contribuição candidata: não muda a base
adotada, não certifica cumprimento de contrato e não concede acesso ou execução. Metadados
de proveniência não comprovam a extração correta nem substituem a política de acesso.

O ensaio independente encontrou dois limites no executor histórico v7: ordenação de
amortização/aniversário/cupom pelo nome em eventos simultâneos e leitura direta da taxa
mensal no caminho de aniversários posicionados. A entrada v8 exige uma ordem explícita
vinculada à fonte quando os eventos compartilham data, conserva essa convenção na saída
e no fingerprint, e usa o cálculo de variação por números índice já existente. A entrada
v7 e os snapshots publicados permanecem com sua semântica histórica para reprodução.
A nova composição não pode chamar a entrada legada por fallback.

Quatorze casos novos verificam juros100×10%=10, amortização100, dívida líquida200−50=150,
índice1,5, atualização100×1%=1, tratamento pago/capitalizado, ordem de eventos e recusas.
Ausência de amortização/EBITDA não vira zero. Onze casos legados de juros continuam.
Adoção contextual destas contribuições e inclusão no pacote final exigem ligação explícita;
revisão profissional independente e publicação humana não são substituídas por esses testes.
Sem DDL, dados reais ou chamadas de modelo.
