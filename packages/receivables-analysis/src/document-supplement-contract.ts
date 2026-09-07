export const receivablesDocumentSupplementContractVersion = "2026.09.07-v1" as const;

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
  },
} as const;
