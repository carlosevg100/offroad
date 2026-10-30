# Caso sintético do originador de FIDC

Os inputs vêm do caso de autoria de 29/10, separado dos métodos de produto. `input/credit.json` é entrada tipada para a prova matemática; `input/source-case.json` conserva os dados do caso; `expected/oracle.json` é o oráculo independente de autoria calculado em Python/Decimal. Os arquivos não são importados por código de produção.

Essas provas não começam nos PDFs nativos e não comprovam a extração pelo modelo. A aceitação de ponta a ponta deve usar somente os arquivos brutos de entrada, sem enviar expected/oracle nem os valores preparados para o executor.
