const { ActivityTypes } = require("@microsoft/agents-activity");
const { AgentApplication, MemoryStorage } = require("@microsoft/agents-hosting");
const axios = require("axios");
const config = require("./config");

// robust join: ensures exactly one slash
function buildEndpoint(base, path) {
  const p = path.startsWith("/") ? path : `/${path}`;
  return new URL(p, base).toString();
}
const ENDPOINT = buildEndpoint(config.backendUrl, config.backendPath);

// axios instance with a sensible timeout
const http = axios.create({
  timeout: 8000, // ms – adjust as you like
});

const storage = new MemoryStorage();
const agentApp = new AgentApplication({ storage });

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
    const { data } = await http.post(
      ENDPOINT,
      { prompt: userText },
      { headers: { "Content-Type": "application/json" } }
    );

    let answer;
    if (typeof data === "string") {
      answer = data;
    } else if (data && typeof data === "object") {
      answer =
        (typeof data.answer === "string" && data.answer) ||
        (typeof data.result === "string" && data.result) ||
        (typeof data.text === "string" && data.text) ||
        (typeof data.content === "string" && data.content) ||
        JSON.stringify(data);
    } else {
      answer = String(data);
    }

    // Include channel info in the normal response
    await context.sendActivity(`[${channelLabel}] ${answer}`);
  } catch (err) {
    console.error("backend call failed:", err?.message || err);

    // SIMPLE POC FALLBACK that also shows channel
    await context.sendActivity(
      `[${channelLabel}] Hello world! I received: "${userText}", but the backend service is not available.`
    );
  }
});

module.exports = { agentApp };