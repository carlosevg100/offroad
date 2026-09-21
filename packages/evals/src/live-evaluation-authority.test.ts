import {readFileSync, readdirSync} from "node:fs";
import {fileURLToPath} from "node:url";
import {runInNewContext} from "node:vm";
import ts from "typescript";
import {describe, expect, it, vi} from "vitest";
import {requireGovernedEvaluationTransport} from "./live-evaluation-authority";

const guard = "requireGovernedEvaluationTransport";
const factories = new Set(["createAnthropicAdapter", "createOpenAIAdapter"]);
const parse = (text: string) => ts.createSourceFile("entry.ts", text, ts.ScriptTarget.Latest, true);
function inspect(text: string) {
  const root = parse(text), bindings = new Set<string>(), failures: string[] = [], statements = new Set<string>();
  let trustedGuard = false;
  for (const node of root.statements) {
    if (!ts.isImportDeclaration(node) || !ts.isStringLiteral(node.moduleSpecifier)) continue;
    const module = node.moduleSpecifier.text;
    const named = node.importClause?.namedBindings;
    if (/^(@anthropic-ai\/sdk|openai)(\/|$)/.test(module)) failures.push("direct SDK import");
    if (module.startsWith("@offroad/model-gateway")) {
      if (!named || !ts.isNamedImports(named)) { failures.push("unresolved gateway import"); continue; }
      for (const item of named.elements) if (factories.has((item.propertyName ?? item.name).text)) bindings.add(item.name.text);
    }
    if (module === "../src/live-evaluation-authority" && named && ts.isNamedImports(named)) {
      trustedGuard = named.elements.some(item => !item.propertyName && item.name.text === guard);
    }
  }
  function visit(node: ts.Node) {
    if (ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword
      || ts.isIdentifier(node.expression) && node.expression.text === "require")) {
      const argument = node.arguments[0]?.getText(root);
      const approvedLocal = node.expression.kind === ts.SyntaxKind.ImportKeyword && (
        argument === 'new URL("../../../apps/document-worker/src/agent-operation-brief.ts",import.meta.url).href'
        || argument === "path" && text.includes('const path=pathToFileURL(resolve(dirname(fileURLToPath(import.meta.url)),"../../../apps/document-worker/src/document-work-source-review.ts")).href;')
        || /^workerPath\("(document-work-selection|document-work-source-review|document-work-product)"\)$/.test(argument ?? "")
          && text.includes('const workerPath=(name:string)=>pathToFileURL(resolve(dirname(fileURLToPath(import.meta.url)),`../../../apps/document-worker/src/${name}.ts`)).href;')
      );
      if (!approvedLocal) failures.push("unreviewed dynamic import/require");
    }
    if (ts.isIdentifier(node) && bindings.has(node.text) && !ts.isImportSpecifier(node.parent)) {
      if (!ts.isCallExpression(node.parent) || node.parent.expression !== node) failures.push("factory alias/escape");
      else {
        let statement: ts.Node = node.parent;
        while (statement.parent && !ts.isSourceFile(statement.parent) && !ts.isBlock(statement.parent)) statement = statement.parent;
        const parent = statement.parent;
        const siblings: readonly ts.Statement[] = parent && (ts.isSourceFile(parent) || ts.isBlock(parent)) ? parent.statements : [];
        const previous = siblings[siblings.indexOf(statement as ts.Statement) - 1];
        const direct = previous && ts.isExpressionStatement(previous) && ts.isCallExpression(previous.expression)
          && ts.isIdentifier(previous.expression.expression) && previous.expression.expression.text === guard && previous.expression.arguments.length === 0;
        if (!trustedGuard || !direct) failures.push("unguarded factory");
        for (let ancestor: ts.Node | undefined = statement; ancestor; ancestor = ancestor.parent) {
          if (ts.isTryStatement(ancestor)) failures.push("catchable containment");
        }
        statements.add(statement.getText(root));
      }
    }
    if (ts.isIdentifier(node) && node.text === guard && !ts.isImportSpecifier(node.parent)
      && !(ts.isCallExpression(node.parent) && node.parent.expression === node)) failures.push("guard shadow/escape");
    ts.forEachChild(node, visit);
  }
  visit(root);
  return {failures, statements, bindings};
}
const directory = new URL("../scripts/", import.meta.url);
const entries = readdirSync(directory).filter(name => name.endsWith(".ts")).map(name => ({name, text: readFileSync(new URL(name, directory), "utf8")}));
const live = entries.filter(entry => inspect(entry.text).bindings.size > 0);

describe("historical live evaluation containment", () => {
  it("denies execution without an environment opt-out", () => {
    expect(() => requireGovernedEvaluationTransport()).toThrow("live_evaluation_requires_worker_retention_authority");
  });
  it("checks every script for real provider construction without the trusted barrier", () => {
    expect(live).toHaveLength(9);
    for (const entry of entries) expect(inspect(entry.text).failures, entry.name).toEqual([]);
  });
  for (const entry of live) it(`stops before any provider constructor in ${entry.name}`, () => {
    const result = inspect(entry.text), construct = vi.fn(() => { throw new Error("provider constructed"); });
    for (const statement of result.statements) {
      const code = ts.transpile(`${guard}();\n${statement}`, {target: ts.ScriptTarget.ES2022});
      const context = {[guard]: requireGovernedEvaluationTransport, createModelGateway: construct,
        ...Object.fromEntries([...result.bindings].map(name => [name, construct]))};
      expect(() => runInNewContext(code, context)).toThrow("live_evaluation_requires_worker_retention_authority");
      expect(construct).not.toHaveBeenCalled();
    }
  });
  const imports = `import {createOpenAIAdapter as make} from "@offroad/model-gateway";\nimport {${guard}} from "../src/live-evaluation-authority";\n`;
  it.each([
    ["missing barrier", "const adapter = make();"],
    ["conditional barrier", `if (allowed) ${guard}(); const adapter = make();`],
    ["guard after constructor", `const adapter = make(); ${guard}();`],
    ["aliased factory", `const bypass = make; const adapter = bypass();`],
    ["swallowed denial", `try { ${guard}(); const adapter = make(); } catch {}`],
    ["shadowed guard", `function f(${guard}: () => void) { ${guard}(); const adapter = make(); }`],
  ])("detects %s", (_name, body) => expect(inspect(imports + body).failures.length).toBeGreaterThan(0));
  it.each([
    'const {createOpenAIAdapter}=await import("@offroad/model-gateway"); createOpenAIAdapter();',
    'const SDK=await import("openai"); new SDK.default();',
    'const SDK=require("openai"); new SDK();',
    'const SDK=await import(moduleName); new SDK.default();',
  ])("detects unreviewed dynamic provider loading: %s", text => expect(inspect(text).failures).toContain("unreviewed dynamic import/require"));
  it("detects direct SDK imports", () => expect(inspect('import OpenAI from "openai"; new OpenAI();').failures).toContain("direct SDK import"));
  it("preserves the baseline offline return before containment", () => {
    const source = parse(readFileSync(fileURLToPath(new URL("run-gold-baseline.ts", directory)), "utf8"));
    const main = source.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === "main") as ts.FunctionDeclaration;
    const statements = main.body!.statements;
    const dry = statements.findIndex(node => ts.isIfStatement(node) && node.expression.getText(source) === "dryRun");
    const barrier = statements.findIndex(node => ts.isExpressionStatement(node) && node.getText(source) === `${guard}();`);
    expect(dry).toBeGreaterThan(-1); expect(barrier).toBeGreaterThan(dry);
    const branch = statements[dry] as ts.IfStatement;
    const log = vi.fn();
    runInNewContext(`(function() { ${branch.getText(source)}; throw new Error("reached live path"); })()`, {dryRun: true, console: {log}});
    expect(log).toHaveBeenCalledWith("dry run: no model called");
  });
});
