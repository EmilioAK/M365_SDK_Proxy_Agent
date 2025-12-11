const azureAiProjectConnectionString =
  process.env.AZURE_AI_PROJECT_CONNECTION_STRING ||
  process.env.AZURE_AI_PROJECT_ENDPOINT_STRING ||
  process.env.AZURE_AI_ENDPOINT;

const parseNumber = (value, fallback) => {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const config = {
  azureAiProjectConnectionString,
  azureAiAgentId: process.env.AZURE_AI_AGENT_ID,
  azureAiApiVersion: process.env.AZURE_AI_API_VERSION,
  agentRunTimeoutMs: parseNumber(process.env.AGENT_RUN_TIMEOUT_MS, 30000),
  agentRunPollIntervalMs: parseNumber(process.env.AGENT_RUN_POLL_INTERVAL_MS, 1000),
};

module.exports = config;
