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

agentApp.onActivity(ActivityTypes.Message, async (context) => {
  const userText = context.activity?.text ?? "";

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

    await context.sendActivity(answer);
  } catch (err) {
    // Log for diagnostics
    console.error("backend call failed:", err?.message || err);

    // Heuristics for “backend offline / not responding”
    const status = err?.response?.status;
    const code = err?.code;

    const looksOffline =
      code === "ECONNREFUSED" ||
      code === "ENOTFOUND" ||
      code === "ETIMEDOUT" ||
      status === 502 ||
      status === 503 ||
      status === 504;

    if (looksOffline) {
      await context.sendActivity(
        "Message received, but the backend service is offline or not responding. Please try again later."
      );
    } else {
      await context.sendActivity(
        "Sorry, I couldn't process your request due to an internal error."
      );
    }
  }
});

module.exports = { agentApp };