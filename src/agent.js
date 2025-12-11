const { ActivityTypes } = require("@microsoft/agents-activity");
const { AgentApplication, MemoryStorage } = require("@microsoft/agents-hosting");
const { AIProjectClient } = require("@azure/ai-projects");
const { DefaultAzureCredential } = require("@azure/identity");
const config = require("./config");

const storage = new MemoryStorage();
const agentApp = new AgentApplication({ storage });

let agentsClient;

function getAgentsClient() {
  if (agentsClient) {
    return agentsClient;
  }

  if (!config.azureAiProjectConnectionString) {
    throw new Error(
      "Azure AI project connection string is not configured. Set AZURE_AI_PROJECT_CONNECTION_STRING (or AZURE_AI_PROJECT_ENDPOINT_STRING/AZURE_AI_ENDPOINT)."
    );
  }

  const options = {};
  if (config.azureAiApiVersion) {
    options.apiVersion = config.azureAiApiVersion;
  }

  const projectClient = new AIProjectClient(
    config.azureAiProjectConnectionString,
    new DefaultAzureCredential(),
    options
  );

  agentsClient = projectClient.agents;
  return agentsClient;
}

const activeRunStatuses = new Set(["queued", "in_progress", "cancelling"]);
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function extractMessageText(message) {
  if (!message?.content?.length) {
    return undefined;
  }

  const parts = message.content
    .filter((part) => part.type === "text" && part.text?.value)
    .map((part) => part.text.value.trim())
    .filter(Boolean);

  return parts.length ? parts.join("\n\n") : undefined;
}

async function waitForRunCompletion(client, initialRun) {
  let run = initialRun;
  const deadline = Date.now() + config.agentRunTimeoutMs;

  while (activeRunStatuses.has(run.status) && Date.now() < deadline) {
    await delay(config.agentRunPollIntervalMs);
    run = await client.runs.get(run.threadId, run.id);
  }

  return run;
}

async function getLatestAssistantReply(client, threadId) {
  const iterator = client.messages.list(threadId, { order: "desc" });
  for await (const message of iterator) {
    if (message.role !== "assistant") continue;
    const text = extractMessageText(message);
    if (text) return text;
  }
  return undefined;
}

async function runAgent(userText) {
  if (!config.azureAiAgentId) {
    throw new Error("Azure AI agent id is not configured. Set AZURE_AI_AGENT_ID.");
  }

  const client = getAgentsClient();
  const createdRun = await client.runs.createThreadAndRun(config.azureAiAgentId, {
    thread: {
      messages: [
        {
          role: "user",
          content: userText,
        },
      ],
    },
  });

  const finishedRun = await waitForRunCompletion(client, createdRun);

  if (activeRunStatuses.has(finishedRun.status)) {
    throw new Error("Agent run did not complete before the timeout window.");
  }

  if (finishedRun.status !== "completed") {
    if (finishedRun.status === "requires_action") {
      const requiredTools = finishedRun.requiredAction?.submitToolOutputs?.toolCalls || [];
      const toolSummary = requiredTools.map((tool) => tool.type).filter(Boolean).join(", ");
      return `The agent needs tool outputs to proceed${toolSummary ? ` (${toolSummary})` : ""}.`;
    }

    throw new Error(`Agent run ended with status ${finishedRun.status}`);
  }

  const reply = await getLatestAssistantReply(client, finishedRun.threadId);
  return reply || "The agent completed without returning a message.";
}

agentApp.onConversationUpdate("membersAdded", async (context) => {
  // optional welcome/log
});

agentApp.onActivity(ActivityTypes.Typing, async (context) => {
  // optional log
});

// Helper to make a nice label from channelId
function getChannelLabel(channelId) {
  switch (channelId) {
    case "msteams":
      return "Teams";
    case "directline":
      return "Web (Direct Line)";
    case "webchat":
      return "Web Chat";
    case "emulator":
      return "Bot Framework Emulator";
    default:
      return channelId || "unknown";
  }
}

agentApp.onActivity(ActivityTypes.Message, async (context) => {
  const userText = context.activity?.text ?? "";
  const channelId = context.activity?.channelId;
  const channelLabel = getChannelLabel(channelId);

  try {
    const answer = await runAgent(userText);
    await context.sendActivity(`[${channelLabel}] ${answer}`);
  } catch (err) {
    console.error("Azure AI agent call failed:", err?.message || err);

    const errorMessage = err?.message ? `(${err.message})` : "";
    await context.sendActivity(
      `[${channelLabel}] Sorry, I could not reach the Azure AI agent right now ${errorMessage}`.trim()
    );
  }
});

module.exports = { agentApp };
