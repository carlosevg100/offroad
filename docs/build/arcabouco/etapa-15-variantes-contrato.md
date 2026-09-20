# Etapa15: representação tipada de variantes e ausência

Um campo requerido com valor nulo é diferente de um campo opcional. O contrato agora descreve
ambos sem converter dado ausente em zero. `union` declara pelo menos duas variantes completas;
objetos e arrays continuam exigindo filhos tipados. Não há tipo any ou objeto opaco.
Variantes duplicadas são rejeitadas mesmo com ordem diferente de campos ou enumerações.
O executor ainda valida as regras semânticas e discriminadores com seu schema: esta mudança
é um contrato de compilação, não um validador substituto da entrada no runtime.

Nomes de campo descrevem dados reais, como id e asOf; nomes de componentes mantêm o contrato
anterior. Campos de protótipo são negados. O hash diferencia optional, null e mudanças de
variante, e o compilador corrente recebe nova versão. Hashes de contratos legados são mantidos;
manifestos correntes mudam pelo compilador e fontes. Snapshots e pins R01 não são reescritos.

Nove testes novos e os testes existentes do compilador verificam essa fronteira. Nenhum grant,
DDL, tool, rota ou publicação é criado. O registro de executores com seus contratos de origem
continua obrigatório; compilar não é publicar, aprovar conteúdo ou executar. Execução na17.
