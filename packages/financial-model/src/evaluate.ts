import type {FinancialModel} from "./model";
import {columnLetter} from "./model";

/**
 * A small spreadsheet engine, for tests.
 *
 * The model's correctness lives in its formulas, and a test that only asserts a formula's
 * *text* proves nothing about its arithmetic — a flipped sign reads perfectly and produces a
 * DSCR that is negative in every year. So the test suite evaluates the workbook the way Excel
 * would, and asserts the numbers a credit professional would check: that the facility does not
 * amortise during grace, that debt service is a cash outflow, that coverage is CFADS over that
 * outflow, and that leverage falls as the loan pays down.
 *
 * It supports exactly the subset the model uses — arithmetic, comparisons, IF, MIN, MAX,
 * ROUNDUP, string literals, and cross-sheet references. Anything outside that throws rather
 * than guessing, because an engine that silently returns 0 for a construct it does not
 * understand would make the tests pass for the wrong reason.
 */

export type Grid = Map<string, string | number>;

const cellKey = (sheet: string, column: number, row: number) => `${sheet}!${columnLetter(column)}${row}`;

export function gridOf(model: FinancialModel, lang: "pt" | "en"): Grid {
  const grid: Grid = new Map();
  for (const sheet of model.sheets) {
    sheet.rows.forEach((row, rowIndex) => {
      row.cells.forEach((cell, columnIndex) => {
        const key = cellKey(sheet.name[lang], columnIndex, rowIndex + 1);
        if (cell.formula) grid.set(key, `=${cell.formula}`);
        else if (cell.value !== undefined && cell.value !== "") grid.set(key, cell.value);
      });
    });
  }
  return grid;
}

type Token = {kind: "number" | "string" | "ref" | "name" | "op"; text: string};

function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let index = 0;
  while (index < source.length) {
    const character = source[index]!;
    if (/\s/.test(character)) {
      index += 1;
      continue;
    }
    if (character === '"') {
      const end = source.indexOf('"', index + 1);
      if (end < 0) throw new Error(`unterminated string in: ${source}`);
      tokens.push({kind: "string", text: source.slice(index + 1, end)});
      index = end + 1;
      continue;
    }
    // A reference: optionally a quoted or bare sheet name, then $?COL$?ROW.
    const reference = /^(?:'([^']+)'|([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ0-9_ ]*))!\$?([A-Z]+)\$?(\d+)/.exec(source.slice(index));
    if (reference) {
      tokens.push({kind: "ref", text: `${reference[1] ?? reference[2]}!${reference[3]}${reference[4]}`});
      index += reference[0].length;
      continue;
    }
    const number = /^\d+(?:\.\d+)?/.exec(source.slice(index));
    if (number) {
      tokens.push({kind: "number", text: number[0]});
      index += number[0].length;
      continue;
    }
    const name = /^[A-Za-z][A-Za-z0-9.]*/.exec(source.slice(index));
    if (name) {
      tokens.push({kind: "name", text: name[0].toUpperCase()});
      index += name[0].length;
      continue;
    }
    const two = source.slice(index, index + 2);
    if (two === "<=" || two === ">=" || two === "<>") {
      tokens.push({kind: "op", text: two});
      index += 2;
      continue;
    }
    tokens.push({kind: "op", text: character});
    index += 1;
  }
  return tokens;
}

export function evaluate(grid: Grid, key: string, seen = new Set<string>()): string | number {
  const raw = grid.get(key);
  if (raw === undefined) return 0;
  if (typeof raw === "number") return raw;
  if (!raw.startsWith("=")) return raw;
  if (seen.has(key)) throw new Error(`circular reference at ${key}`);

  const tokens = tokenize(raw.slice(1));
  let position = 0;
  const nextSeen = new Set(seen).add(key);

  const peek = () => tokens[position];
  const take = () => tokens[position++];

  const parseComparison = (): string | number => {
    let left = parseSum();
    const operator = peek();
    if (operator?.kind === "op" && ["=", "<", ">", "<=", ">=", "<>"].includes(operator.text)) {
      take();
      const right = parseSum();
      switch (operator.text) {
        case "=": return left === right ? 1 : 0;
        case "<>": return left !== right ? 1 : 0;
        case "<": return Number(left) < Number(right) ? 1 : 0;
        case ">": return Number(left) > Number(right) ? 1 : 0;
        case "<=": return Number(left) <= Number(right) ? 1 : 0;
        default: return Number(left) >= Number(right) ? 1 : 0;
      }
    }
    return left;
  };

  function parseSum(): string | number {
    let left = parseProduct();
    for (;;) {
      const operator = peek();
      if (operator?.kind !== "op" || (operator.text !== "+" && operator.text !== "-")) return left;
      take();
      const right = parseProduct();
      left = operator.text === "+" ? Number(left) + Number(right) : Number(left) - Number(right);
    }
  }

  function parseProduct(): string | number {
    let left = parseUnary();
    for (;;) {
      const operator = peek();
      if (operator?.kind !== "op" || (operator.text !== "*" && operator.text !== "/")) return left;
      take();
      const right = parseUnary();
      left = operator.text === "*" ? Number(left) * Number(right) : Number(right) === 0 ? 0 : Number(left) / Number(right);
    }
  }

  function parseUnary(): string | number {
    const token = peek();
    if (token?.kind === "op" && token.text === "-") {
      take();
      return -Number(parseUnary());
    }
    return parseAtom();
  }

  function parseAtom(): string | number {
    const token = take();
    if (!token) throw new Error(`unexpected end of formula: ${raw}`);
    if (token.kind === "number") return Number(token.text);
    if (token.kind === "string") return token.text;
    if (token.kind === "ref") return evaluate(grid, token.text, nextSeen);
    if (token.kind === "op" && token.text === "(") {
      const value = parseComparison();
      const close = take();
      if (close?.text !== ")") throw new Error(`expected ) in: ${raw}`);
      return value;
    }
    if (token.kind === "name") {
      const open = take();
      if (open?.text !== "(") throw new Error(`expected ( after ${token.text} in: ${raw}`);
      const args: (string | number)[] = [];
      if (peek()?.text !== ")") {
        args.push(parseComparison());
        while (peek()?.text === ",") {
          take();
          args.push(parseComparison());
        }
      }
      const close = take();
      if (close?.text !== ")") throw new Error(`expected ) in: ${raw}`);

      switch (token.text) {
        case "IF": return Number(args[0]) !== 0 ? args[1] ?? 0 : args[2] ?? 0;
        case "MIN": return Math.min(...args.map(Number));
        case "MAX": return Math.max(...args.map(Number));
        case "ROUNDUP": {
          const factor = 10 ** Number(args[1] ?? 0);
          return Math.ceil(Number(args[0]) * factor) / factor;
        }
        default:
          throw new Error(`unsupported function ${token.text} in: ${raw}`);
      }
    }
    throw new Error(`unexpected token ${token.text} in: ${raw}`);
  }

  const result = parseComparison();
  if (position !== tokens.length) throw new Error(`trailing tokens in: ${raw}`);
  return result;
}

/** Reads one row of a sheet across the projected columns. */
export function rowValues(model: FinancialModel, grid: Grid, lang: "pt" | "en", sheetKey: string, rowKey: string): number[] {
  const sheet = model.sheets.find((entry) => entry.key === sheetKey);
  if (!sheet) throw new Error(`unknown sheet ${sheetKey}`);
  const rowIndex = sheet.rows.findIndex((row) => row.key === rowKey);
  if (rowIndex < 0) throw new Error(`unknown row ${sheetKey}.${rowKey}`);
  const horizon = model.periods.length - 1;
  return Array.from({length: horizon}, (_, index) =>
    Number(evaluate(grid, cellKey(sheet.name[lang], 2 + index, rowIndex + 1))),
  );
}
