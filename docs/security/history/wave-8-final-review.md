# Conciliação da entrega da onda 8

PR 647 entregue em `75f3dc70aa90b8ab33b9e9afb299fbf809db8761`; main Quality 35254486464, Security 35254486454 e worker 35254486802 passaram. Vercel Production 6508719804 e ECS 356 executam o commit exato.
As pontes 645 e 646 foram publicadas antes dos produtores. Cinco migrações instaladas em
staging e produção conservam SQL idêntico por nome, com 23 funções em paridade, 56 superfícies
inventariadas e 336 versões de arquivos cobertas pelo journal de produção. As tabelas novas
permaneceram sem linhas em produção; nenhum dado descartável foi criado.

82 contratos passaram no schema de staging e no replay completo da CI. A concorrência real
com duas sessões prova um único vencedor. As 32 jornadas E2E passaram, incluindo reabertura
da base antiga e repetição do cálculo com fingerprint igual. Capturas desktop/mobile foram
inspecionadas. Negativos sem sessão em produção e advisors de segurança foram conferidos.

O inventário exige 126 evidências, 15 novas para adoção, histórico, direitos, concorrência,
matemática e instalação. Hashes foram resolvidos no commit entregue, a observação AWS foi
renovada e o renderer confiável valida o fingerprint canônico. Um teste recusa a omissão de
cada evidência nova. As 18 lacunas gerais permanecem abertas, sem alteração de severidade.
Login administrativo não comprova permissão IAM da role de execução. Alarmes OK não comprovam
notificação; essa pendência permanece na etapa 18.

Hipóteses não se publicam e adoção não cria fato oficial. Base e motor vigentes são fixados;
a conservação de executores históricos será comprovada na etapa 17. Biblioteca profissional,
trabalho sem companhia e ensaios com usuários não foram antecipados. Etapa 10 depende de OK.
O completion externo registra os gates e o deploy desta própria conciliação.

A inspeção da captura móvel da implementação detectou sobreposição temporária da barra
lateral durante sua transição de largura, apesar do teste de largura útil ter passado.
Esta conciliação sincroniza barra e coluna em 58px nesse escopo e adiciona ao E2E a
asserção geométrica de não sobreposição e presença do título no viewport. A CI e a
nova captura desta PR precisam passar antes do merge; o recibo final externo registra
seus resultados e o deploy. Nenhum gate ou timeout foi relaxado.

Na primeira execução de Security em main, o CodeQL completou as 105 consultas e enviou
os resultados, mas atingiu o limite ao compactar sua base. A repetição apenas desse job
no mesmo commit passou (run 35254486454, tentativa 2), sem alteração de configuração.
