import {createCapitalBodyReadHandler, capitalBodyReadServerConfigFromEnvironment} from "../../../apps/document-worker/src/capital-body-read-handler.ts";
// Built-in deployment credentials stay in this server entry, never worker/web env.
Deno.serve(createCapitalBodyReadHandler(capitalBodyReadServerConfigFromEnvironment(name => Deno.env.get(name))));
