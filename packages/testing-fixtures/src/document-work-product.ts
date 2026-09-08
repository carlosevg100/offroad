// Synthetic source material used only by renderer and UI tests.
export const syntheticDocumentWorkProduct = {
  schemaVersion: "document-work-product.v1", job: "meeting", locale: "pt-BR", requestFingerprint: "a".repeat(64), inputFingerprint: "b".repeat(64), fingerprint: "c".repeat(64),
  status: "preliminary", calculationStatus: "not_performed", assessmentStatus: "preliminary_document_review",
  sections: ["company_context", "discussion_points", "meeting_questions"].map(key => ({key, title: `Seção ${key}`, observations: [{text: "Consentimento prévio é necessário.", citations: [{passageId: "source-1", quote: "Consentimento prévio é necessário."}]}]})),
  hypotheses: [{text: "A restrição pode afetar a alternativa considerada.", basisPassageIds: ["source-1"], question: "O consentimento já foi solicitado?"}],
  gaps: [{text: "Não há informação sobre o consentimento.", question: "Pode enviar a autorização?"}],
  sources: [{id: "source-1", documentId: "contrato", documentName: "Contrato sintético de financiamento.pdf", version: "1", hash: "d".repeat(64), anchor: "Página 3", text: "Consentimento prévio é necessário."}],
  coverage: {documentsConsidered: 1, omittedPassages: 2, limitations: ["Duas passagens não foram incluídas nesta análise."]},
};
