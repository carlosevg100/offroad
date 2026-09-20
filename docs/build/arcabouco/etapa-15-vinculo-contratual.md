# Etapa15: cálculo contratual e contribuição adotada

`reconcileCapitalContractAdoptions` recompõe os componentes de dívida líquida/EBITDA do
procedimento contratual e o índice sob a base adotada. O vínculo exige contexto idêntico,
estoque na data, EBITDA em12 meses, definição/versão/âncora e recibo da observação derivada
que foi selecionada. Origem fixa fingerprint do cálculo, instrumento, campo e fontes pais.
Recibos duplicados, autorreferentes ou substituídos são recusados. A comparação usa
financial-core sem tolerância; diferença inferior às casas exibidas continua divergência.

Esses registros devem ser obtidos por leitores autorizados: o domínio não autentica a
origem do chamador nem concede acesso pelos metadados. O executor17 conservará os inputs,
as relações de derivação e os direitos; fonte derivada precisa de suas relações persistidas.
O adaptador não cria observação, adoção ou permissão. Vínculo não certifica extração,
arredondamento contratual, aplicabilidade, waiver/cura ou consequência jurídica.

O texto das definições de numerador e denominador é comparado ao componente; o limite
confere a âncora do tier aplicável e seu valor. Direção máxima/mínima precisa ser compatível.
A diferença entre comparador estrito/inclusivo permanece explícita no índice adotado.
A interpretação jurídica da cláusula continua revisão humana, sem declaração automática
de inadimplemento. Esta composição cobre o modelo de dívida líquida/EBITDA e perímetros
parent/consolidated do executor existente; outras definições não recebem essa certificação.

Quinze testes novos exercitam alinhamento, divergência preservada, hipótese, ausência,
forja de versão/fonte/âncora/derivação, período LTM, direção, precisão, ano bissexto e
reprodução. Integração da entrega final e revisão independente seguem na15. Sem DDL.
