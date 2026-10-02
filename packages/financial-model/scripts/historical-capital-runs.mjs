/** Test-only replay of ledger evaluations from their captured v24 source closure. */
import {readFileSync,mkdtempSync,rmSync} from 'node:fs';
import {createRequire} from 'node:module';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {historicalCapitalFixturePlugin} from '../../credit-playbook/scripts/historical-capital-fixture.mjs';
const root=resolve(fileURLToPath(new URL('../../..',import.meta.url)));
const {build}=createRequire(join(root,'apps/document-worker/package.json'))('esbuild');
let loaded;
export function loadHistoricalCapitalRuns(){return loaded??=load();}
async function load(){
 const release=JSON.parse(readFileSync(join(root,'packages/credit-playbook/knowledge/releases/compiled-executor-lock.json'))).releases[0];
 const temporary=mkdtempSync(join(tmpdir(),'offroad-historical-ledger-'));
 try{
  const outfile=join(temporary,'runs.mjs');
  await build({entryPoints:['historical-capital-fixture'],outfile,bundle:true,platform:'node',format:'esm',target:'node24',logLevel:'silent',plugins:[historicalCapitalFixturePlugin(root,release,join(temporary,'unused.cjs'),{includeV1Runs:true,useCapturedRuntime:true})]});
  const historical=await import(pathToFileURL(outfile));
  if(historical.fixtureFinancialCoreVersion!=='2026.09.20-v24')throw Error('historical_ledger_financial_version_mismatch');
  return historical;
 }finally{rmSync(temporary,{recursive:true,force:true});}
}
