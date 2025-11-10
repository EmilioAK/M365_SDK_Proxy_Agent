const { ActivityTypes } = require("@microsoft/agents-activity");
const { AgentApplication, MemoryStorage } = require("@microsoft/agents-hosting");
const axios = require("axios");

const BACKEND_URL = process.env.BACKEND_URL || "http://127.0.0.1:8000";
const BACKEND_PATH = process.env.BACKEND_PATH || "/chat";

// Define storage and application
const storage = new MemoryStorage();
const agentApp = new AgentApplication({ storage });

// Optional welcome
agentApp.onConversationUpdate("membersAdded", async (context) => {
  // await context.sendActivity(`Hi there! I'm an agent to chat with you.`);
  console.log("membersAdded:", context.activity.membersAdded?.map(m => m.id));
});

// Optional typing log
agentApp.onActivity(ActivityTypes.Typing, async (context) => {
  console.log("typing from:", context.activity.from?.id);
});

// Proxy: take user text → call backend → send backend text
agentApp.onActivity(ActivityTypes.Message, async (context) => {
  const userText = context.activity?.text ?? "";
  console.log("user message:", userText);

  try {
    const { data } = await axios.post(
      `${BACKEND_URL}${BACKEND_PATH}`,
      { prompt: userText },
      { headers: { "Content-Type": "application/json" } }
    );

    let answer;
    if (typeof data === "string") {
      answer = data;
    } else if (data && typeof data === "object") {
      if (typeof data.answer === "string" && data.answer) {
        answer = data.answer;
      } else if (typeof data.result === "string" && data.result) {
        answer = data.result;
      } else if (typeof data.text === "string" && data.text) {
        answer = data.text;
      } else if (typeof data.content === "string" && data.content) {
        answer = data.content;
      } else {
        answer = JSON.stringify(data);
      }
    } else {
      answer = String(data);
    }

    console.log("backend answer (first 120):", String(answer).slice(0, 120));
    await context.sendActivity(answer);
  } catch (err) {
    console.error("backend call failed:", err?.message || err);
    await context.sendActivity("Sorry, I couldn't generate a response right now.");
  }
});

module.exports = { agentApp };