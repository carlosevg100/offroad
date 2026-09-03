# Disposição da auditoria independente de 02/09/2026

## Escopo da resposta

A auditoria congelou o commit `4251614`. O parecer abaixo compara os achados com o estado atual do
repositório e com a arquitetura definida no ADR 0020. Ele não transforma observações antigas em
verdades atuais sem nova verificação.

## Aceitos e já corrigidos neste ciclo

| Achado | Disposição | Correção |
| --- | --- | --- |
| P1-01, `stripNulls` destruía abstenção semântica | aceito | remoção do strip global; normalização de null apenas para campos opcionais no adapter OpenAI; testes de abstenção e provider alternativo |
| P2-06, testes SQL novos fora do CI | aceito | o workflow executa todos os arquivos de `supabase/tests/*.sql`, incluindo futuros testes |
| P2-10, fallback escolhia primeira organização | aceito | fallback removido; ausência do bootstrap falha fechado |
| Drift de identidade do produto | aceito | Constituição, README, orientação de agentes e ADR 0019 convergem para a plataforma especializada em DCM |

## Aceitos e ainda abertos

| Achado | Disposição | Próxima prova necessária |
| --- | --- | --- |
| P1-02, arquivos e histórico remoto de migrations divergem | aceito, confirmado novamente | cinco versões `20260825194419` a `20260825201341` existem nos dois bancos e faltam no repositório; `20260825203300` local é idêntica a production (`md5 354c71536ecce208e1fae95933a99b80`), enquanto staging guarda outro conteúdo sob o mesmo número. Restaurar as cinco fontes exatas e reconstruir/reparar staging antes de qualquer migration nova |
| P1-03, documento privado desliga executor especializado | válido no commit auditado; roteamento atual corrigido | concluir coverage map, replanejamento e outputs privados no mesmo projeto; o pipeline privado existente já recebe a rota canônica |
| P2-05, fixture importado em caminho de produção | aceito | retirar dependência de runtime e usar cassete explícito apenas em teste |
| P2-07, staging divergente e documentação contraditória | aceito | eleger staging como ensaio fiel ou removê-lo; provar status e histórico |
| P2-08, supply chain incompleta | aceito, parcialmente corrigido neste ciclo | CodeQL, dependency review, SBOM, scan de repositório e imagem e actions fixadas por SHA foram adicionados; alertas do Dependabot ainda dependem de configuração do GitHub |
| P2-09, merge sem revisão humana | aceito como risco de governança | exigir um revisor para mudanças protegidas quando houver segundo maintainer |
| P2-11, Market Graph sem dados | aceito como lacuna operacional | piloto manual de mandatos reais, política de recência, consentimento e responsável |

## Aceitos com ressalva

| Achado | Disposição |
| --- | --- |
| P2-04, demo sintética | o risco é válido; o estado atual já rotula o conteúdo como sintético, mas a rota e suas dependências ainda precisam ser removidas da superfície pública antes do lançamento |
| P3-12, grants duplicados | dívida técnica real, sem evidência de ampliação efetiva de privilégio; corrigir após a reconciliação de migrations |
| P3-13, pacotes cenográficos | revisar por reachability e custo de manutenção; não apagar por contagem de pacotes sem mapear consumidores |

## Ponto estratégico em que a auditoria é incompleta

O lender graph é um ativo importante e difícil de copiar, mas não deve ser tratado como a única
barreira nem como o primeiro produto isolado. A tese atual tem dois ativos cumulativos:

1. **Work graph de DCM:** procedimentos, decisões corrigidas, evidências, verificações, evals e
   padrões de trabalho específicos de dívida e estrutura de capital.
2. **Market graph:** mandatos, apetite, transações observadas, relações, recência e resultados de
   interações permitidas.

Começar apenas pelo lender graph produziria um diretório sem capacidade institucional de transformar
um problema em uma estrutura financiável. Começar apenas pelo work graph produziria análise sem
aderência ao mercado. A sequência correta é concluir uma vertical privada ponta a ponta e, em
paralelo, iniciar um lender graph pequeno, manual e real. Matching só é promovido quando os dois
lados têm qualidade mensurada.

## Regra de liberação

Nada passa a produção por existir no schema. Uma capacidade só muda de `specified` para
`production` com executor, persistência, interface, caso gold, caso adversarial, custo medido,
revisão financeira e evidência de tenant isolation.

## Achado adicional corrigido

O caso citado na seção de memória e IA era válido: a regra de aprovação também reconhecia
`não aprovo` e uma instrução negativa de contato como se fossem ações positivas. O roteador agora
intercepta negação antes das regras de commit e efeito externo; testes cobrem `Não aprovo essa
estrutura` e `Não envie o material ao Fundo Alfa`.
