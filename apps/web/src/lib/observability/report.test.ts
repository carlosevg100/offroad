import {afterEach, describe, expect, it, vi} from "vitest";

import {reportServerFailure} from "./report";

const captured = () => {
  const spy = vi.spyOn(console, "error").mockImplementation(() => {});
  return {
    spy,
    detail: () => spy.mock.calls.at(-1)?.[1] as Record<string, unknown> | undefined,
    line: () => JSON.stringify(spy.mock.calls.at(-1)),
  };
};

afterEach(() => vi.restoreAllMocks());

describe("a failure never carries the company's content out with it", () => {
  it("strips the value out of a Postgres message that quotes it", () => {
    // The shape that made this necessary. Postgres names the value that failed, and the value
    // is the company's money.
    const log = captured();
    reportServerFailure({
      step: "intake.save",
      error: {code: "22P02", message: 'invalid input syntax for type numeric: "48200000.55"'},
    });

    expect(log.detail()?.code).toBe("22P02");
    expect(log.line()).not.toContain("48200000.55");
  });

  it("strips a value quoted by a schema parse", () => {
    const log = captured();
    reportServerFailure({
      step: "case.brief",
      error: new Error('expected string, received "Rede Horizonte Alimentos S.A."'),
    });

    expect(log.line()).not.toContain("Rede Horizonte");
  });

  it("strips an email, an id and a token", () => {
    const log = captured();
    reportServerFailure({
      step: "auth.signup",
      error: {message: "user carlos@example.com with id 3f1b0c1e-2b7a-4d4e-9a1e-2c9f0a1b2c3d failed"},
      context: {token: "NOTAREALTOKEN".repeat(4)},
    });

    const line = log.line();
    expect(line).not.toContain("carlos@example.com");
    expect(line).not.toContain("3f1b0c1e-2b7a-4d4e-9a1e-2c9f0a1b2c3d");
    expect(line).not.toContain("NOTAREALTOKEN".repeat(4));
  });

  it("keeps what makes a failure diagnosable", () => {
    // Redaction that removed the code as well would trade one uselessness for another.
    const log = captured();
    reportServerFailure({step: "intake.reconcile", error: {code: "PGRST301", message: "JWT expired"}});

    const detail = log.detail();
    expect(detail?.step).toBe("intake.reconcile");
    expect(detail?.code).toBe("PGRST301");
    expect(String(detail?.message)).toContain("JWT expired");
  });

  it("survives an error that is not an object", () => {
    const log = captured();
    reportServerFailure({step: "intake.save", error: "boom"});
    expect(log.detail()?.message).toBe("boom");

    reportServerFailure({step: "intake.save"});
    expect(log.detail()?.message).toBeNull();
  });

  it("caps a message that arrives enormous", () => {
    // A driver that returns the offending row returns the whole row.
    const log = captured();
    reportServerFailure({step: "intake.save", error: {message: "x".repeat(5_000)}});
    expect(String(log.detail()?.message).length).toBeLessThanOrEqual(300);
  });

  it("reports under a stable step name rather than an interpolated one", () => {
    // The step is what groups failures together; interpolating input into it would produce one
    // group per company and no groups at all.
    const log = captured();
    reportServerFailure({step: "intake.save", error: {code: "23505"}});
    expect(log.detail()?.step).toBe("intake.save");
  });
});

describe("redaction that removed the diagnosis would trade one uselessness for another", () => {
  it("keeps the constraint name and drops the row value from the same message", () => {
    // Postgres quotes both. One is a constant that tells you what rule was broken, the other is
    // the company's content, and a rule that could not tell them apart would have to drop both.
    const log = captured();
    reportServerFailure({
      step: "intake.save",
      error: {
        code: "23514",
        message: 'new row for relation "intake_issues" violates check constraint "intake_issues_priority_check", failing row contains "Rede Horizonte Alimentos S.A."',
      },
    });

    const message = String(log.detail()?.message);
    expect(message).toContain("intake_issues_priority_check");
    expect(message).toContain("intake_issues");
    expect(message).not.toContain("Rede Horizonte");
  });
});
