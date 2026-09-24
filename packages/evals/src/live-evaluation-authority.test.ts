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

/**
 * Every way a script can name a provider key: a property or element read (`process.env.X_API_KEY`,
 * `env["X_API_KEY"]`, an alias of process.env included), a destructured binding, or any string or
 * template text that carries the name (a computed read, `Reflect.get`). Comments are not code.
 */
const providerKey = /_API_KEY$/;
function providerKeyReads(text: string): string[] {
  const root = parse(text), reads: string[] = [];
  const literal = (node: ts.Node | undefined): string | null =>
    node && (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) ? node.text : null;
  function visit(node: ts.Node) {
    if (ts.isPropertyAccessExpression(node) && providerKey.test(node.name.text)) reads.push(node.getText(root));
    if (ts.isElementAccessExpression(node) && providerKey.test(literal(node.argumentExpression) ?? "")) reads.push(node.getText(root));
    if (ts.isBindingElement(node) && ts.isObjectBindingPattern(node.parent)) {
      const name = node.propertyName ?? node.name;
      if ((ts.isIdentifier(name) || ts.isStringLiteral(name)) && providerKey.test(name.text)) reads.push(node.getText(root));
    }
    if ((ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node))
      && node.text.includes("_API_KEY")) reads.push(node.getText(root));
    ts.forEachChild(node, visit);
  }
  visit(root);
  return [...new Set(reads)];
}

/** Names imported from the model gateway: a converted script may keep its constants, never a factory. */
function gatewayImports(text: string): string[] {
  return parse(text).statements.flatMap((node) => {
    if (!ts.isImportDeclaration(node) || !ts.isStringLiteral(node.moduleSpecifier) || !node.moduleSpecifier.text.startsWith("@offroad/model-gateway")) return [];
    const named = node.importClause?.namedBindings;
    return named && ts.isNamedImports(named) ? named.elements.map((item) => (item.propertyName ?? item.name).text) : ["<namespace or default>"];
  });
}
function importsFrom(text: string, module: string): string[] {
  return parse(text).statements.flatMap((node) => {
    if (!ts.isImportDeclaration(node) || !ts.isStringLiteral(node.moduleSpecifier) || node.moduleSpecifier.text !== module) return [];
    const named = node.importClause?.namedBindings;
    return named && ts.isNamedImports(named) ? named.elements.map((item) => item.propertyName ? `${item.propertyName.text} as ${item.name.text}` : item.name.text) : ["<namespace or default>"];
  });
}
function identifiers(text: string): Set<string> {
  const root = parse(text), names = new Set<string>();
  const visit = (node: ts.Node) => { if (ts.isIdentifier(node)) names.add(node.text); ts.forEachChild(node, visit); };
  visit(root);
  return names;
}

const directory = new URL("../scripts/", import.meta.url);
const files = readdirSync(directory);
const entries = files.filter(name => name.endsWith(".ts")).map(name => ({name, text: readFileSync(new URL(name, directory), "utf8")}));
const live = entries.filter(entry => inspect(entry.text).bindings.size > 0);
/**
 * The scripts that still construct a provider and stay contained until their family moves to the
 * governed transport. A converted script leaves this list in the same change that proves its path.
 */
const contained = [
  "continue-document-work-product-live.ts",
  "run-advisor-response-live.ts",
  "run-document-work-product-live.ts",
  "run-executive-synthesis-live.ts",
  "run-intent-router-gold.ts",
];

describe("historical live evaluation containment", () => {
  it("denies execution without an environment opt-out", () => {
    expect(() => requireGovernedEvaluationTransport()).toThrow("live_evaluation_requires_worker_retention_authority");
  });
  it("checks every script for real provider construction without the trusted barrier", () => {
    expect(live.map(entry => entry.name).sort()).toEqual(contained);
    for (const entry of entries) expect(inspect(entry.text).failures, entry.name).toEqual([]);
  });
  it("reads every file under scripts as a TypeScript entry, so no script escapes these rules by its extension", () => {
    expect(files.filter(name => !name.endsWith(".ts"))).toEqual([]);
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
});

describe("provider keys in evaluation scripts", () => {
  it("are read by no script outside the contained five", () => {
    for (const entry of entries) if (!contained.includes(entry.name)) expect(providerKeyReads(entry.text), entry.name).toEqual([]);
  });
  it.each([
    ["a property read", "const key = process.env.ANTHROPIC_API_KEY;"],
    ["an element read", 'const key = process.env["OPENAI_API_KEY"];'],
    ["a template element read", "const key = process.env[`OPENAI_API_KEY`];"],
    ["a destructured read", "const {ANTHROPIC_API_KEY} = process.env;"],
    ["a renamed destructured read", "const {OPENAI_API_KEY: key} = process.env;"],
    ["a read through an alias of the environment", "const env = process.env; const key = env.PERPLEXITY_API_KEY;"],
    ["a computed name", "const key = process.env[`${provider.toUpperCase()}_API_KEY`];"],
    ["a reflective read", 'const key = Reflect.get(process.env, "FIRECRAWL_API_KEY");'],
  ])("detects %s", (_label, text) => expect(providerKeyReads(text).length).toBeGreaterThan(0));
  it("ignores comments and unrelated environment reads", () => {
    expect(providerKeyReads("// ANTHROPIC_API_KEY is never read here\nconst url = process.env.SUPABASE_URL;")).toEqual([]);
  });
});

describe("the baseline through the governed transport", () => {
  const baseline = entries.find(entry => entry.name === "run-gold-baseline.ts")!;
  const client = readFileSync(fileURLToPath(new URL("./governed-transport.ts", import.meta.url)), "utf8");

  it("imports the governed transport client and no gateway factory, guard or provider key", () => {
    expect(importsFrom(baseline.text, "../src/governed-transport")).toEqual(expect.arrayContaining(["requestGovernedEvaluation", "readGovernedTransportEnvironment"]));
    expect(gatewayImports(baseline.text).filter(name => !/^[a-z][A-Za-z]*$/.test(name) || name.startsWith("create"))).toEqual([]);
    expect(importsFrom(baseline.text, "../src/live-evaluation-authority")).toEqual([]);
    const names = identifiers(baseline.text);
    for (const name of ["createModelGateway", "createAnthropicAdapter", "createOpenAIAdapter", guard]) expect(names.has(name), name).toBe(false);
    expect(providerKeyReads(baseline.text)).toEqual([]);
    expect(inspect(baseline.text)).toMatchObject({failures: [], bindings: new Set()});
  });

  it("keeps the client itself free of any adapter, gateway, SDK or provider key", () => {
    expect(gatewayImports(client)).toEqual(["modelGatewayVersion"]);
    expect(inspect(client).failures).toEqual([]);
    const names = identifiers(client);
    for (const name of ["createModelGateway", "createAnthropicAdapter", "createOpenAIAdapter"]) expect(names.has(name), name).toBe(false);
    expect(providerKeyReads(client)).toEqual([]);
  });

  it("preserves the baseline offline return before the governed request", () => {
    const source = parse(baseline.text);
    const main = source.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === "main") as ts.FunctionDeclaration;
    const statements = main.body!.statements;
    const dry = statements.findIndex(node => ts.isIfStatement(node) && node.expression.getText(source) === "dryRun");
    const request = statements.findIndex(node => node.getText(source).includes("requestGovernedEvaluation("));
    const environment = statements.findIndex(node => node.getText(source).includes("readGovernedTransportEnvironment("));
    expect(dry).toBeGreaterThan(-1);
    expect(request).toBeGreaterThan(dry);
    expect(environment).toBeGreaterThan(dry);
    const branch = statements[dry] as ts.IfStatement;
    const log = vi.fn();
    runInNewContext(`(function() { ${branch.getText(source)}; throw new Error("reached live path"); })()`, {dryRun: true, console: {log}});
    expect(log).toHaveBeenCalledWith("dry run: no model called");
  });
});

describe("the extraction, classification and probe measurements through the governed transport", () => {
  const converted = ["measure-extraction.ts", "measure-classification.ts", "probe-structured-output.ts"]
    .map(name => [name, entries.find(entry => entry.name === name)!] as const);

  it.each(converted)("%s imports the governed transport client and no gateway factory, product model caller, guard or provider key", (_name, script) => {
    expect(importsFrom(script.text, "../src/governed-transport")).toEqual(expect.arrayContaining(["governedEvaluationEvidence", "requestGovernedEvaluation", "readGovernedTransportEnvironment"]));
    expect(gatewayImports(script.text).filter(name => !/^[a-z][A-Za-z]*$/.test(name) || name.startsWith("create"))).toEqual([]);
    expect(importsFrom(script.text, "../src/live-evaluation-authority")).toEqual([]);
    const names = identifiers(script.text);
    // The worker runs the extractor and the classifier over the snapshot; the script only parses, reads back and scores.
    for (const name of ["createModelGateway", "createAnthropicAdapter", "createOpenAIAdapter", "createClassifier", "extractDocument", guard]) expect(names.has(name), name).toBe(false);
    expect(providerKeyReads(script.text)).toEqual([]);
    expect(inspect(script.text)).toMatchObject({failures: [], bindings: new Set()});
  });

  it.each(converted)("%s returns from its dry run before the environment is read or anything is requested", (_name, script) => {
    const source = parse(script.text);
    const main = source.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === "main") as ts.FunctionDeclaration;
    const statements = main.body!.statements;
    const dry = statements.findIndex(node => ts.isIfStatement(node) && node.expression.getText(source) === "dryRun");
    const request = statements.findIndex(node => node.getText(source).includes("requestGovernedEvaluation("));
    const environment = statements.findIndex(node => node.getText(source).includes("readGovernedTransportEnvironment("));
    expect(dry).toBeGreaterThan(-1);
    expect(request).toBeGreaterThan(dry);
    expect(environment).toBeGreaterThan(dry);
    // Nothing before the dry return names the transport, and the dry branch itself returns before anything live.
    for (const node of statements.slice(0, dry + 1)) expect(node.getText(source)).not.toMatch(/requestGovernedEvaluation|readGovernedTransportEnvironment|governedEvaluationEvidence/);
    const branch = statements[dry] as ts.IfStatement;
    const log = vi.fn();
    runInNewContext(`(function() { ${branch.getText(source)}; throw new Error("reached live path"); })()`, {dryRun: true, console: {log}});
    expect(log).toHaveBeenCalledWith("dry run: no model called");
  });
});
