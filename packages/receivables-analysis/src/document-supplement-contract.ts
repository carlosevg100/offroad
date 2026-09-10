export const receivablesDocumentSupplementContractVersion = "2026.09.07-v1" as const;

const policyInputs = [
  ["MAX_ATRASO_DIAS", "/policy/maxDaysPastDue", "integer", "dias / days"],
  ["MAX_PRAZO_REMANESCENTE_DIAS", "/policy/maxRemainingTermDays", "integer", "dias / days"],
  ["MIN_SEASONING_DIAS", "/policy/minSeasoningDays", "integer", "dias / days"],
  ["EXIGIR_CEDIVEL", "/policy/requireAssignable", "boolean", "sim | não"],
  ["EXIGIR_LASTRO_VERIFICADO", "/policy/requireEvidenceVerified", "boolean", "sim | não"],
  ["REGRA_REGISTRO", "/policy/registrationRule", "registration_rule", "obrigatório | quando aplicável | não obrigatório"],
  ["EXCLUIR_DISPUTADOS", "/policy/excludeDisputed", "boolean", "sim | não"],
  ["EXCLUIR_PARTES_RELACIONADAS", "/policy/excludeRelatedParties", "boolean", "sim | não"],
  ["EXCLUIR_ONERADOS", "/policy/excludeEncumbered", "boolean", "sim | não"],
  ["SETORES_PERMITIDOS", "/policy/allowedDebtorSectors", "string_list", "separados por ; ou todos"],
  ["MAX_CONCENTRACAO_SACADO", "/policy/maxSingleDebtorShare", "percentage", "0% a 100%"],
  ["MAX_CONCENTRACAO_GRUPO", "/policy/maxDebtorGroupShare", "percentage", "0% a 100%"],
  ["MIN_CARTEIRA_ELEGIVEL", "/policy/minimumEligibleShare", "percentage", "0% a 100%"],
  ["MIN_COBERTURA_LASTRO", "/policy/minimumEvidenceCoverage", "percentage", "0% a 100%"],
  ["MIN_COBERTURA_REGISTRO", "/policy/minimumRegistrationCoverage", "percentage", "0% a 100%"],
  ["MAX_ATRASO_30", "/policy/maximumDelinquency30Share", "percentage", "0% a 100%"],
  ["MAX_DILUICAO", "/policy/maximumDilutionShare", "percentage", "0% a 100%"],
  ["MAX_RECOMPRA", "/policy/maximumRepurchaseShare", "percentage", "0% a 100%"],
  ["MIN_RECUPERACAO", "/policy/minimumRecoveryRate", "percentage", "0% a 100%"],
  ["MAX_DIVERGENCIA_CONTABIL", "/policy/maximumAccountingMismatchShare", "percentage", "0% a 100%"],
  ["MAX_DIVERGENCIA_CAIXA", "/policy/maximumCashMismatchShare", "percentage", "0% a 100%"],
  ["MIN_CAIXA_CONCILIADO", "/policy/minimumMappedCashShare", "percentage", "0% a 100%"],
  ["MIN_CAIXA_CONTA_VINCULADA", "/policy/minimumLinkedAccountCashShare", "percentage", "0% a 100%"],
] as const;

const structureInputs = [
  ["VALOR_LINHA", "/structure/requestedFacility", "money", "valor na moeda do caso"],
  ["ADVANCE_RATE", "/structure/advanceRate", "percentage", "0% a 100%"],
  ["OVERCOLLATERALIZATION_MIN", "/structure/requiredOvercollateralization", "multiple", "ex.: 1,25x"],
  ["SUBORDINACAO_MIN", "/structure/requiredSubordinationRate", "percentage", "0% a 100%"],
  ["SALDO_SENIOR", "/structure/actualSeniorAmount", "money", "valor na moeda do caso"],
  ["SALDO_MEZANINO", "/structure/actualMezzanineAmount", "money", "valor na moeda do caso"],
  ["SALDO_SUBORDINADO", "/structure/actualSubordinatedAmount", "money", "valor na moeda do caso"],
  ["RESERVA_PERCENTUAL", "/structure/reserveRate", "percentage", "0% a 100%"],
  ["WATERFALL_CAIXA_DISPONIVEL", "/structure/waterfall/availableCash", "money", "valor no período testado"],
  ["WATERFALL_SERVICING_FEE", "/structure/waterfall/servicingFeeDue", "money", "valor no período testado"],
  ["WATERFALL_JUROS_SENIOR", "/structure/waterfall/seniorInterestDue", "money", "valor no período testado"],
  ["WATERFALL_PRINCIPAL_SENIOR", "/structure/waterfall/seniorPrincipalDue", "money", "valor no período testado"],
  ["WATERFALL_RESERVA_INICIAL", "/structure/waterfall/reserveOpening", "money", "valor no período testado"],
  ["WATERFALL_MEZANINO", "/structure/waterfall/mezzanineDue", "money", "valor no período testado"],
] as const;

/** Public workbook contract for the deterministic R01 document adapter. The names are stable
 * machine fields, while the workbook template explains each one in the user's language. */
export const receivablesDocumentSupplementContract = {
  version: receivablesDocumentSupplementContractVersion,
  sheets: {
    cedent: {
      name: "CEDENTE",
      requiredHeaders: ["CEDENTE_ID", "RAZAO_SOCIAL", "PAPEL_SERVICING"],
    },
    titles: {
      name: "CARTEIRA",
      sourceHeaders: ["NUM_TITULO", "CNPJ_SACADO", "NOME_SACADO", "DT_EMISSAO", "DT_VENCIMENTO", "VLR_TITULO", "SITUACAO", "DT_PAGAMENTO", "VLR_PAGO"],
      requiredHeaders: [
        "NUM_TITULO", "SETOR_SACADO", "VLR_RECEBIDO_PERIODO", "SALDO_INADIMPLENTE", "RECUPERADO_PERIODO",
        "DILUICAO_PERIODO", "RECOMPRA_PERIODO", "SUBSTITUICAO_PERIODO", "CEDIVEL", "LASTRO_VERIFICADO",
        "REGISTRO", "ONUS", "DISPUTADO", "PARTE_RELACIONADA",
      ],
    },
    cashReceipts: {
      name: "RECEBIMENTOS",
      requiredHeaders: ["ID_RECEBIMENTO", "DATA_RECEBIMENTO", "VALOR_RECEBIMENTO", "NUM_TITULO", "CNPJ_SACADO", "CONTA_VINCULADA", "DUPLICADO_DE"],
    },
    accounting: {
      name: "CONTABIL",
      requiredHeaders: ["SALDO_CONTAS_A_RECEBER", "PROVISAO", "RECEBIMENTOS_PERIODO"],
    },
    policy: {
      name: "POLITICA",
      requiredHeaders: ["CAMPO", "VALOR"],
      inputs: policyInputs,
    },
    structure: {
      name: "ESTRUTURA",
      requiredHeaders: ["CAMPO", "VALOR"],
      inputs: structureInputs,
    },
  },
} as const;
