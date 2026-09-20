# Etapa15: vínculo entre schemas reais e manifesto

O schema de entrada é projetado no modo input: campo com default não se torna obrigatório
por engano. O de saída descreve o objeto validado. Objetos permanecem fechados e completos;
arrays declaram filhos, variantes são tipadas, null e ausência são diferentes. Ref, interseção,
objeto opaco e número flutuante genérico são recusados nessa projeção estrutural.

O contrato estrutural não substitui Zod: limites, refinements, formatos e literais continuam
validados no executor. O artefato gerado inclui os schemas JSON integrais e a CI exige igualdade
com os schemas de origem. Alterar o arquivo gerado sozinho não passa. Comando de geração:
`node packages/financial-model/scripts/generate-capital-contracts.mjs` sob Node24.

O build registra somente @offroad/financial-model#prepareCapitalDecisionDelivery na versão
explícita. A autoria precisa declarar contratos idênticos aos registrados. Compilação fixa
arquivos do pacote e dependências first-party, lock, artifact de contratos e gerador. Não há
ciclo de dependência playbook -> model em runtime: build lê artefato verificado e bytes.
O gerador usa o bundler já instalado no worker, sem dependência externa nova.

Dez casos novos: cinco da projeção estrutural, dois da aderência ao executor real e três da
compilação com registro real, hash incompatível e export inventado. Candidata sintética de
compilação vive somente em diretório temporário de teste; não modifica o procedimento real.
R01 publicado conserva snapshot e pins. Conteúdo profissional, composição real e aprovação
seguem na15. Nenhuma execução ou publicação é concedida por este registro.
