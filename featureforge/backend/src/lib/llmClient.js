// Which LLM actually powers plan generation: Claude by default (needs
// ANTHROPIC_API_KEY and real internet access), or a local Ollama model
// when LLM_PROVIDER=ollama is set in .env — needs `ollama serve` running
// locally with a model pulled ahead of time, but nothing else: no API
// key, no internet, once that's set up. See OLLAMA_SETUP.md.
//
// Every stream's request is built identically either way (promptBuilder.js
// is shared by both), so this file is a thin dispatcher, not a second
// place business logic lives — routes/features.js imports planFeature/
// planFeatureStream from here instead of importing a provider directly,
// so it never needs to know or care which one actually answered.
import * as claudeProvider from "./claudeClient.js";
import * as ollamaProvider from "./ollamaClient.js";

export function currentProvider() {
  return process.env.LLM_PROVIDER === "ollama" ? "ollama" : "claude";
}

function activeProvider() {
  return currentProvider() === "ollama" ? ollamaProvider : claudeProvider;
}

export function planFeature(...args) {
  return activeProvider().planFeature(...args);
}

export function planFeatureStream(...args) {
  return activeProvider().planFeatureStream(...args);
}
