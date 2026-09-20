# Etapa15: contrato completo da preparação contratual

`capital-contract-output.ts` valida integralmente a saída dos executores compostos: não há
JSON opaco para os cálculos, fontes, convenções, cenários ou lacunas. O preparo conserva
inputs e versões e continua sendo candidato, sem mutação da base ou aprovação.

A geração de contratos produz `capital-contract-preparation.json` a partir dos schemas
efetivos de entrada e saída. O registro de engenharia aceita apenas o export conhecido,
confere os contratos e fixa o fechamento transitivo do pacote e do gerador. Constantes
inteiras, como os12 meses de EBITDA LTM, conservam seu schema integral; a projeção estrutural
é integer e não autoriza valores fracionários ou números monetários binários.

Seis testes novos rodam na CI; quatorze regressões da preparação e a reprodução de R01
continuam. A fixture sintética é compartilhada com o eval integrado do procedimento.
Registro não é publicação: autoria final, revisão independente, aprovação específica e
comando auditado da14 permanecem necessários antes de fechar a15. Sem DDL ou dados reais.
