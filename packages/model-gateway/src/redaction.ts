/**
 * Minimization before content leaves the perimeter (P1 plan §13.3/§13.5):
 * identifiers of natural persons are masked unless they are the object of the
 * extraction. CNPJs are never masked (companies are the subject of the case).
 * The masks keep the shape so anchors/quotes still match after normalization is
 * applied on both sides by the verifier.
 */
export type RedactionOptions = {
  cpf?: boolean;
  email?: boolean;
  phone?: boolean;
};

const defaults: Required<RedactionOptions> = {cpf: true, email: true, phone: false};

const cpfPattern = /\b(\d{3})\.(\d{3})\.(\d{3})-(\d{2})\b/g;
const cpfDigitsPattern = /(?<![\d.])(\d{3})(\d{3})(\d{3})(\d{2})(?![\d.-])/g;
const emailPattern = /\b[\w.+-]+@[\w-]+(?:\.[\w-]+)+\b/g;
const phonePattern = /\b(?:\+55\s?)?(?:\(?\d{2}\)?\s?)?9?\d{4}-\d{4}\b/g;

export function redactPersonalIdentifiers(text: string, options: RedactionOptions = {}): {text: string; counts: Record<keyof RedactionOptions, number>} {
  const settings = {...defaults, ...options};
  const counts = {cpf: 0, email: 0, phone: 0};
  let output = text;
  if (settings.cpf) {
    output = output.replace(cpfPattern, (_m, a: string) => {
      counts.cpf += 1;
      return `${a}.***.***-**`;
    });
    output = output.replace(cpfDigitsPattern, (match: string, a: string) => {
      // 11-digit runs are only masked when they validate as a CPF, so amounts stay intact
      if (!isValidCpf(match)) return match;
      counts.cpf += 1;
      return `${a}********`;
    });
  }
  if (settings.email) {
    output = output.replace(emailPattern, () => {
      counts.email += 1;
      return "[email]";
    });
  }
  if (settings.phone) {
    output = output.replace(phonePattern, () => {
      counts.phone += 1;
      return "[telefone]";
    });
  }
  return {text: output, counts};
}

export function isValidCpf(digits: string): boolean {
  if (!/^\d{11}$/.test(digits) || /^(\d)\1{10}$/.test(digits)) return false;
  const calc = (length: number) => {
    let sum = 0;
    for (let i = 0; i < length; i += 1) sum += Number(digits[i]) * (length + 1 - i);
    const rest = (sum * 10) % 11;
    return rest === 10 ? 0 : rest;
  };
  return calc(9) === Number(digits[9]) && calc(10) === Number(digits[10]);
}
