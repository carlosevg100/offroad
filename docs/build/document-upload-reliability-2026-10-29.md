# Envio de documentos: correção de continuidade

Estado: candidato, sem liberação ou afirmação de qualidade universal.

## Problemas reproduzidos

1. Seleção de 31 arquivos enviava somente 20, sem aviso sobre os outros 11.
2. Exceção de rede em um arquivo abandonava os seguintes e podia deixar a interface ocupada.
3. Resposta perdida do registro podia apagar um arquivo cujo registro havia sido confirmado no servidor.
4. Na conversa, uma falha parcial impedia iniciar o processamento dos arquivos registrados.

## Comportamento corrigido

Todo arquivo é considerado, um de cada vez. Recusas e falhas trazem o nome do arquivo. O reenvio usa a deduplicação já autorizada no mesmo escopo. A interface não abre envios concorrentes e limpa o seletor ao terminar. O registro incerto é recuperado por identidade, organização, escopo, caminho e hash; sem confirmação, preserva o objeto privado; duplicidade confirmada permite remover o novo objeto temporário. Os arquivos registrados seguem ao processamento mesmo com falha de outro arquivo.

O primeiro envio na tela de início também preserva o trabalho criado: arquivos recebidos avançam mesmo com falha parcial, os nomes que falharam aparecem e a pessoa pode continuar no mesmo projeto. Uma falha de transporte na criação repete a mesma chave; confirmação da criação impede criar outro trabalho por novo clique. A interface libera o estado ocupado e limpa o seletor mesmo em exceção.

## Evidência

- Três regressões iniciais falharam antes da correção: 20/31 arquivos, exceção no segundo envio e exceção no segundo registro.
- 44 verificações focadas de regras, duplicidade, falha isolada, recusa e resposta incerta passaram após a correção.
- Verificação TypeScript da aplicação passou.
- `document-upload-reliability.spec.ts`: prova integrada nova com Storage/registro/fila reais em serviços locais e falha de Storage controlada pelo navegador, além de perda da resposta depois do registro confirmado e verificação da permanência dos objetos no Storage. Executada na CI; os registros e a recuperação da resposta perdida passaram, mas a primeira configuração do ensaio usava o caminho de fixture, sem fila. Este host não tem Docker; a CI fornece a pilha isolada.
- `pnpm check` completo passou no commit `b704c3e399357a0cb2678f60b3a67f3fdb9a2105`: lint, typecheck, testes e build, com 44 pacotes em cada etapa. A aplicação teve 1.683 testes aprovados, incluindo 44 testes das regras e recuperação de upload. A primeira tentativa em ambiente restrito falhou no IPC do executor `tsx`; a prova final foi executada com esse recurso local permitido.
- A primeira prova de navegador da PR #963 não disparou o envio: zero fontes e nenhum pedido de Storage/registro no traço. O ensaio atribuía arquivos diretamente ao input HTML logo após recarregar a página. Passou a usar o botão e o seletor real, como a jornada existente, comprovando que o manipulador da interface está ativo antes da escolha. As exigências de 30/31 registros, hashes, fila, resposta perdida e reenvio são preservadas. Nova prova de CI pendente; nenhuma dispensa do gate.

A segunda execução de navegador registrou os 30 documentos e preservou o objeto da resposta perdida. A exigência de fila detectou uma configuração incorreta do ensaio: a organização local nova estava no caminho determinístico, que não cria jobs. O caso passa a habilitar o pipeline e o estado shadow somente nessa organização sintética local antes do upload, preservando a exigência de jobs e todos os controles. Nova CI pendente.

A tentativa seguinte recusou corretamente a alteração direta de rollout (`rollout_update_requires_release_decision`). O ensaio passa a usar o comando de transição para shadow, que não exige atestado de caso real, sem remover triggers, falsificar coortes ou abrir liberação externa. A prova exige jobs para os 30 documentos distintos registrados. O orçamento dos jobs completos de CI acompanha a correção da PR #964 (60 minutos; checks e limites de testes preservados).

Quatro regressões unitárias cobrem continuidade do primeiro envio, seleção apenas de duplicatas, nenhum arquivo registrado e recusa/exceção do início de processamento. A prova de navegador também cobre o primeiro envio parcial e a continuação sem segundo projeto. A integração final será verificada no candidato consolidado.

## Segurança, dados e retorno

Mesmo comando autenticado, escopo e políticas; nenhuma nova autorização. Nenhuma migração. Nenhum método financeiro ou seu manifesto muda. Não há chamada a provedor de modelo neste teste nem transferência a terceiros. Dados de teste não entram em produção. Mantidos limite por arquivo, quarentena, scanner, limites contra exaustão e revisão das extrações. Um registro incerto pode deixar bytes privados sem registro: a correção prefere reconciliação posterior a apagar uma fonte possivelmente confirmada. A limpeza automática desse caso não foi implementada por este candidato.

Controles afetados: proteção documental DOC-01/DOC-02/DOC-03 e continuidade da aplicação. Regressões negativas mantêm recusa de executável/arquivo vazio/arquivo acima do limite, isolamento e deduplicação existentes. Para retornar, reverter o candidato; objetos e registros existentes continuam compatíveis.

## Alcance

Esta correção remove falhas concretas da entrada. Não comprova extração de qualquer documento, não publica R1/R2/R3 e não abre fonte comercial de dados. Essas frentes exigem seus próprios casos e gates.
