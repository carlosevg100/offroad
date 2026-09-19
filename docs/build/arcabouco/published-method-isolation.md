# Versões executáveis de métodos publicados

Correção autorizada antes da etapa 15, complementando a 13 e antecipando somente o
isolamento de executores da 17. Não introduz continuidade, Temporal, novos métodos ou
aprovação profissional. O R01 mantém o manifesto
`17ee80ac7cd3ac22b8c0d5d90893cf89ad67eb129ad1fe1b6f26aa3b73d6d090`.

## Fonte e execução

`packages/credit-playbook/knowledge/releases/method-release-lock.json` vincula identidade,
commit de main, manifesto, arquivo de fontes por hash e hash do executor reconstruído.
O snapshot é um artefato gerado de preservação, não um segundo lugar de autoria. Contém
os 79 arquivos fixados pelo manifesto e o grafo real de 123 módulos do executor, incluindo
as versões exatas de Decimal e Zod. O código de cálculo aprovado continua em financial-core.
Novas alterações são escritas nos pacotes canônicos; não se edita um snapshot publicado.

O build reconstrói o executor com esbuild 0.28.2, sem resolver dependências atuais ou buscar
código pela rede. Confere snapshot, pins, commit e hash do resultado. As únicas importações
externas do artefato são do módulo nativo node:crypto. A imagem leva o arquivo CJS produzido.
O loader confere seu hash antes de carregá-lo; versão ausente ou adulterada é negada.
Os caminhos analítico e interno usam o mesmo executor, incluindo validação e readiness.
A identidade resolvida pelo banco precisa corresponder à registrada na imagem.

O gerador conserva o manifesto publicado e usa o compilador atual somente para candidatos.
Mudar o documento publicado exige nova versão. Acrescentar cálculo independente, alterar
compilador de autoria ou atualizar a árvore atual não substitui o executor já aprovado.
A CI confere os bytes originais contra o commit em main e proíbe remover ou reescrever
uma entrada publicada. Não existe fallback para a última versão disponível.

## Segurança e manutenção

APP-11, AI-08 e SDLC-02/04/10: integridade e reprodução de método, sem nova autorização
para dados, ferramentas ou efeitos externos. Os gates de acesso e pausa no banco continuam
obrigatórios. Hashes não substituem a autoridade de main, revisão e proteção da implantação.
O loader lê somente arquivos da imagem; dados de cliente nunca selecionam caminhos de disco.
Esta separação preserva versão; não é sandbox para executar código não confiável.

Dependências preservadas continuam sujeitas a vulnerabilidades. Uma correção material requer
novo artefato e nova versão revisada, com a avaliação correspondente; não se altera a entrada
anterior. Se uma falha grave tornar uma versão imprópria, pausar a capacidade existente pelo
controle do banco e publicar substituição pelo contrato da 14. Manter snapshot e histórico.
Esse risco acompanha os gates de publicação e execução das etapas 15/17 e a operação da 18.
Os alarmes sem destinatário permanecem no incremento 18; esta correção não declara resolvê-los.

## Verificação e publicação

- Regressão da adição de arquivo não utilizado e da mudança de compilador mantém R01.
- Documento adulterado, identidade duplicada, snapshot alterado, artefato alterado ou ausente
  e versão não registrada são recusados.
- Duas reconstruções produzem bytes idênticos. Os casos paramétricos existentes mantêm
  resultados byte a byte; schemas da versão recusam entrada e saída inválidas.
- Testes do worker cobrem os dois consumidores; build da imagem verifica boot e empacotamento.
- CI integral e preview precedem merge. Web e worker precisam ser comprovados no SHA de main.
- Não há DDL, migração, reaplicação ou mudança no manifesto/ato humano instalado. A conferência
  ao vivo dos ambientes e os contratos de pin/retirada em staging integram o completion.

Rollback: republicar a imagem anterior comprovada e seu conjunto completo de artefatos;
nunca substituir silenciosamente um arquivo ou o hash do método no banco. A etapa só fecha
com CI, merge e prova de implantação registrados no completion externo da correção.
