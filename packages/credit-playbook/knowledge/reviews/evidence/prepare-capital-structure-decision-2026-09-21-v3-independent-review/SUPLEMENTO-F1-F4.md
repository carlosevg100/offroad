# Revalidação independente de F1–F4

Agente Codex `/root/stage15_independent_review`, revisão por IA. Commit fixado `1cf05614bc19a7e3b1a29c966c5ba4cfe0af282e`. Parecer original permanece intacto. **F1–F4 estão corrigidos nos casos examinados; veredito global continua NÃO APTO por F5/F6.** Não é aprovação profissional, publicação ou atestação de completion.

Reexecutei meus próprios casos contra os blobs desse commit, pelo carregador de fonte fixada, sem usar os arquivos modificados da branch subsequente. Li o diff do kernel. Resultados:

- F1: curva de números-índice e curva mensal equivalente produzem101.50374356 com pro rata positivo; desapareceu a leitura de tabela nula.
- F2: antes do aniversário, cálculo e trace usam dezembro1% e fecham100.498756; faltar dezembro agora produz estado bloqueado/insufficient_evidence, sem DecimalError. A escolha de mês é compartilhada pelo caminho novo.
- F3: taxa0.1234567890123456, principal1 e camadas16casas conservam juros0.1234567890123456. O caminho novo não aplica o corte adicional a8casas.
- F4: amortização150 sobre saldo100 é recusada com `interest_amortization_exceeds_principal`; não é convertida para100.
- As21avaliações determinísticas registradas continuam passando no meu harness. Os cálculos próprios de orçamento, covenant, juros, negações de contexto/origem e recuperação delimitada do RPC também foram reexecutados.
- Comparei oito execuções diretas de v7 entre o commit original e este: saída inteira equivalente em todos os casos, incluindo precisão16 e amortização excedente com seus comportamentos históricos. Hash agregado antes/depois `51a4eafbaee5e7a5cc9e8ea4d9f20df6dc8d2d15098be508be369cc16a05a7d1`. Isso confirma preservação das amostras; não afirma exaustividade sobre todos os inputs.

O caso F5 de particionamento continua divergindo, como esperado neste incremento: um período101, dois períodos101.50374356. Resolver os quatro primeiros achados não autoriza consumir o cálculo de indexação como geral. F6 pertence à alteração posterior de proveniência e não foi revisado aqui.

Evidências: `REVALIDACAO-F1-F4.json`, `REVALIDACAO-F1-F4.log`, `revalidate-f1-f4-cases.ts`, `revalidate-f1-f4.mjs`, `PARIDADE-V7-F1-F4.json` e os dois `legacy-<commit>.json`. `SUPLEMENTO-F1-F4.json` fixa identidade, commit, hashes e escopo. O harness registra observações, incluindo F5 falho; exit0 não é aceite global.
