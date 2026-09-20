/** Build-only: neither exported from the package nor imported by the worker. */
import {readFileSync, readdirSync} from "node:fs";
import {resolve, relative, join} from "node:path";
import {methodDataContractSchema, componentVersionSchema} from "./method-component";
import {readReleasedMethodLock} from "./released-method-lock";
import {loadMethodLibrary} from "./procedure-markdown";
import {adaptLegacyMethodDocument, compileProcedureComposition, methodContentHash, pinMethodSources, componentCompilerVersion, type CompilerSource} from "./procedure-compiler";

export function buildMethodManifest(repositoryRoot: string) {
  const root = resolve(repositoryRoot);
  const packageRoot = join(root, "packages/credit-playbook");
  const source = (path: string): CompilerSource => ({path, content: readFileSync(join(root, path), "utf8")});
  const compilerSources = ["method-component.ts", "procedure-compiler.ts", "procedure-contract.ts", "procedure-markdown.ts", "build-method-manifest.ts", "review-record.ts", "released-method-lock.ts"].map((name) => source(`packages/credit-playbook/src/${name}`));
  compilerSources.push(source("pnpm-lock.yaml"), source("tsconfig.base.json"));
  const compiler = {version: componentCompilerVersion, sources: pinMethodSources(compilerSources), hash: methodContentHash(pinMethodSources(compilerSources))};
  const released = readReleasedMethodLock(root).releases;
  const library = loadMethodLibrary(join(packageRoot, "knowledge/procedures"));
  const routing = library.methods.flatMap((method) => {
    const implementation = method.procedure.implementation;
    if (!implementation || !method.frontmatter.required_depth_pack_ids.length || !method.frontmatter.task_specs.length) return [];
    return [{procedure: {id: method.procedure.id, version: method.procedure.version, maturity: method.procedure.maturity}, taskIds: [...method.frontmatter.task_specs].sort(), requiredPackIds: [...method.frontmatter.required_depth_pack_ids].sort(), bindingPriority: method.frontmatter.binding_priority, executor: implementation.executor, resultContract: implementation.resultContract, sourcePath: method.sourcePath, sourceHash: method.sourceHash}];
  });
  const capabilities = library.methods.flatMap(({frontmatter: fm}) => {
    if (fm.capability_availability === undefined) return [];
    return fm.task_specs.map((taskId) => ({taskId, executorKey: `${fm.implementation_module}#${fm.implementation_export}`, executorVersion: fm.version, procedure: {id: fm.id, version: fm.version}, availability: fm.capability_availability, exposure: fm.capability_exposure, allowedUses: fm.capability_allowed_uses, allowedEvidenceRegimes: fm.capability_allowed_evidence_regimes, allowedDataClasses: fm.capability_allowed_data_classes, allowedSourceClasses: fm.capability_allowed_source_classes, allowedProviderIds: fm.capability_allowed_provider_ids, allowedToolIds: fm.capability_allowed_tool_ids, providerRequired: fm.capability_provider_required, maximumEffect: fm.capability_maximum_effect, allowlistedTenantIds: [], allowlistedProjectIds: []}));
  });
  const approvals = library.methods.filter((method) => method.procedure.maturity === "production").map(({procedure: p}) => ({procedure: {id: p.id, version: p.version}, approvedBy: p.owner.approvedBy, approvedAt: p.owner.approvedAt, approvalSource: p.owner.approvalSource}));
  const executorSourceClosures: Record<string, ReturnType<typeof pinMethodSources>> = {};
  for (const release of released) {
    if (!library.methods.some((method) => method.procedure.id === release.provenance.procedure.id && method.procedure.version === release.provenance.procedure.version)) throw new Error("published_method_document_missing");
  }
  const registeredCapitalExecutors = [
    {path: "packages/financial-model/contracts/capital-decision-delivery.json", exportName: "prepareCapitalDecisionDelivery"},
    {path: "packages/financial-model/contracts/capital-contract-preparation.json", exportName: "prepareCapitalContractEvidence"},
  ].map(registration => {
    const contracts = JSON.parse(source(registration.path).content);
    if (contracts.schemaVersion !== "method-executor-contracts.v1" || contracts.executor?.module !== "@offroad/financial-model"
      || contracts.executor?.exportName !== registration.exportName) throw new Error("capital_executor_registration_mismatch");
    return {...contracts.executor, version: componentVersionSchema.parse(contracts.executor.version),
      inputContractHash: methodContentHash(methodDataContractSchema.parse(contracts.inputs)),
      outputContractHash: methodContentHash(methodDataContractSchema.parse(contracts.outputs)),
      sources: [...packageClosure("@offroad/financial-model", root), registration.path,
        "packages/financial-model/scripts/generate-capital-contracts.mjs"].map(source)};
  });
  const provenance = library.methods.map((method) => {
    const release = released.find((entry) => entry.provenance.procedure.id === method.procedure.id && entry.provenance.procedure.version === method.procedure.version);
    if (release) {
      if (method.sourceHash !== release.provenance.source.hash) throw new Error("published_method_requires_new_version");
      const matching = (entry: {procedure: {id: string; version: string}}) => entry.procedure.id === method.procedure.id && entry.procedure.version === method.procedure.version;
      if (methodContentHash(routing.filter(matching)) !== methodContentHash(release.routing)
        || methodContentHash(capabilities.filter(matching)) !== methodContentHash(release.capabilities)
        || methodContentHash(approvals.find(matching)) !== methodContentHash(release.approval)) throw new Error("published_method_policy_mismatch");
      executorSourceClosures[release.provenance.executor.sourceClosureHash] = release.executorSources;
      return release.provenance;
    }
    if (method.composition) return compileProcedureComposition(method, method.composition, {compilerSources, executors: registeredCapitalExecutors, evidence: []});
    const adapted = adaptLegacyMethodDocument(method);
    const implementation = method.procedure.implementation;
    const evidencePaths = new Set(method.procedure.reviews.map((review) => `packages/credit-playbook/${review.recordPath}`));
    for (const runs of Object.values(method.procedure.testRuns)) for (const run of runs) evidencePaths.add(`packages/credit-playbook/knowledge/reviews/runs/${run}/run.json`);
    if (implementation) for (const file of implementation.evaluation.unitTestFiles) evidencePaths.add(file);
    const evidence = evidencePaths.size ? pinMethodSources([...evidencePaths].sort().map(source)) : [];
    const executorSources = implementation ? packageClosure(implementation.executor.module.split("/").slice(0, 2).join("/"), root).map(source) : [];
    const executorPins = executorSources.length ? pinMethodSources(executorSources) : [];
    const closureHash = methodContentHash(executorPins);
    if (executorPins.length) executorSourceClosures[closureHash] = executorPins;
    const executor = implementation ? {...implementation.executor, sourceClosureHash: closureHash} : null;
    const payload = {schemaVersion: adapted.schemaVersion, procedure: {id: method.procedure.id, version: method.procedure.version, maturity: method.procedure.maturity}, source: adapted.source, compiler, adapterHash: adapted.adapterHash, compositionStatus: adapted.compositionStatus, grantsExecution: false, pendingContent: adapted.pendingContent, executor, evidence};
    return {...payload, manifestHash: methodContentHash(payload)};
  });
  return {routing, capabilities, approvals, provenance, executorSourceClosures};
}

/** Hash the complete first-party package dependency closure and lockfile, not only an export stub. */
function packageClosure(moduleName: string, root: string): string[] {
  const paths = new Set<string>(["pnpm-lock.yaml", "tsconfig.base.json"]);
  const seen = new Set<string>();
  const walk = (directory: string) => {
    for (const entry of readdirSync(directory, {withFileTypes: true})) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts") && !entry.name.endsWith(".generated.ts")) paths.add(relative(root, path));
    }
  };
  const visit = (name: string) => {
    if (seen.has(name)) return;
    if (!/^@offroad\/[a-z][a-z0-9-]+$/.test(name)) throw new Error(`invalid package ${name}`);
    seen.add(name);
    const directory = join(root, "packages", name.slice("@offroad/".length));
    const file = join(directory, "package.json");
    paths.add(relative(root, file));
    const pkg = JSON.parse(readFileSync(file, "utf8")) as {dependencies?: Record<string, string>};
    walk(join(directory, "src"));
    for (const dependency of Object.keys(pkg.dependencies ?? {}).sort()) if (dependency.startsWith("@offroad/")) visit(dependency);
  };
  visit(moduleName);
  return [...paths].sort();
}

export function renderMethodManifest(repositoryRoot: string): string {
  const projection = buildMethodManifest(repositoryRoot);
  return "// GENERATED by pnpm --filter @offroad/credit-playbook manifest:generate. Do not edit.\n" +
    Object.entries({specialistMethodRuntimeManifest: projection.routing, specialistTaskCapabilityRuntimeManifest: projection.capabilities, specialistMethodApprovalManifest: projection.approvals, procedureBuildProvenance: projection.provenance, procedureExecutorSourceClosures: projection.executorSourceClosures}).map(([name, value]) => `export const ${name} = ${JSON.stringify(value, null, 2)} as const;\n`).join("\n");
}
