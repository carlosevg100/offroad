# Etapa15: avaliações registradas do pacote integrado

O harness de suporte executa prepareCapitalProcedurePacket em21 casos: sete gold, oito adversariais e seis de consistência. Os casos gold verificam identidades de caixa por centavos inteiros, contrato e adoção, divergência preservada, enquadramento sem projeção, ausência de fonte, juros e amortização, e caixa negativo com saldo restrito preservado. Os adversariais negam adulteração, contexto divergente, referências estrangeiras, duplicidade, autoridade/resultado fabricados e termos omitidos. Consistência compara todos os bytes de saída em repetições sob os mesmos inputs.

Os registros JSON sob knowledge/reviews/runs contêm expectativas, resultados observados e fingerprints. capital-procedure-runs.test.ts reexecuta os mesmos casos na CI; diferença num registro ou resultado falha. O script record-capital-procedure-runs.mjs não grava recibos aprovados quando qualquer caso falha e omite commit quando há fontes locais não commitadas. Manifesto de publicação posterior fixa as fontes reais em main.

O compilador fixa esses recibos, substituindo evidências que eram apenas arquivos de testes. O procedimento conserva candidate/incomplete: execução numérica não comprova revisão independente, aprovação do fundador, direitos correntes ou publicação. A etapa15 só fecha após esses atos e seus gates.

Nenhuma migração, dado descartável em produção, chamada a modelo ou capacidade nova. Nove originais preservados. Limpeza: fixtures do pacote compartilhadas entre regressão e harness, sem duplicar sua montagem.
