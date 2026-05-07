import { runDiscovery } from "./lib/scorer.js";

const result = await runDiscovery();
console.log(`[run] Done: run #${result.runId}, found ${result.found}, scored ${result.scored}`);
