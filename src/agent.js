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

const storage = new MemoryStorage();
const agentApp = new AgentApplication({ storage });

agentApp.onConversationUpdate("membersAdded", async (context) => {
  // optional welcome/log
});

agentApp.onActivity(ActivityTypes.Typing, async (context) => {
  // optional log
});

agentApp.onActivity(ActivityTypes.Message, async (context) => {
  const userText = context.activity?.text ?? "";
  try {
    const { data } = await axios.post(
      ENDPOINT,
      { prompt: userText },
      { headers: { "Content-Type": "application/json" } }
    );

    let answer;
    if (typeof data === "string") answer = data;
    else if (data && typeof data === "object") {
      answer =
        (typeof data.answer === "string" && data.answer) ||
        (typeof data.result === "string" && data.result) ||
        (typeof data.text === "string" && data.text) ||
        (typeof data.content === "string" && data.content) ||
        JSON.stringify(data);
    } else {
      answer = String(data);
    }

    await context.sendActivity(answer);
  } catch (err) {
    console.error("backend call failed:", err?.message || err);
    await context.sendActivity("Sorry, I couldn't generate a response right now.");
  }
});

module.exports = { agentApp };