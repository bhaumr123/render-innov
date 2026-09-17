// Shared defaults for every local-Ollama caller (the self-improvement
// agent in selfImprove.js, and the offline plan-generation provider in
// ollamaClient.js). One place for these two lines so they can't quietly
// drift apart if only one caller gets updated.
export const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || "http://localhost:11434";
export const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "llama3.1";
