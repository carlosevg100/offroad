type DocumentFirstProgressInput = {
  objectiveSelected: boolean;
  briefAnswered: number;
  briefTotal: number;
  documentsUploaded: number;
  minimumSatisfied: number;
  minimumTotal: number;
  idealSatisfied: number;
  idealTotal: number;
  reviewReady: boolean;
};

function ratio(completed: number, total: number): number {
  if (total <= 0) return 0;
  return Math.min(1, Math.max(0, completed / total));
}

/**
 * Progress for the guided, document-first journey.
 *
 * Every point corresponds to work that actually exists: a declared objective, answered request
 * fields, received documents, requirements discharged by evidence and a review-ready case. There
 * is deliberately no minimum floor, so a new journey starts at zero instead of displaying an
 * invented percentage.
 */
export function documentFirstProgress(input: DocumentFirstProgressInput): number {
  const objective = input.objectiveSelected ? 10 : 0;
  const request = ratio(input.briefAnswered, input.briefTotal) * 30;
  const received = input.documentsUploaded > 0 ? 10 : 0;
  const minimum = ratio(input.minimumSatisfied, input.minimumTotal) * 30;
  const ideal = ratio(input.idealSatisfied, input.idealTotal) * 10;
  const review = input.reviewReady ? 10 : 0;

  return Math.min(100, Math.round(objective + request + received + minimum + ideal + review));
}

