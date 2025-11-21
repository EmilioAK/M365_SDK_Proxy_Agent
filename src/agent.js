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
    const response = await axios({
      method: 'post',
      url: ENDPOINT,
      data: {
        messages: [
          {
            role: "user",
            content: userText
          }
        ]
      },
      responseType: 'stream',
      headers: { "Content-Type": "application/json" }
    });

    let fullAnswer = "";

    // Process the stream
    await new Promise((resolve, reject) => {
      response.data.on('data', (chunk) => {
        const lines = chunk.toString().split('\n');
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const jsonStr = line.substring(6).trim();
              if (!jsonStr) continue;

              const event = JSON.parse(jsonStr);

              if (event.type === 'TEXT_MESSAGE_CONTENT') {
                fullAnswer += event.delta;
              } else if (event.type === 'RUN_FINISHED') {
                // Run is done
              }
            } catch (e) {
              console.error("Error parsing SSE event:", e);
            }
          }
        }
      });

      response.data.on('end', () => {
        resolve();
      });

      response.data.on('error', (err) => {
        reject(err);
      });
    });

    if (fullAnswer) {
      await context.sendActivity(fullAnswer);
    } else {
      await context.sendActivity("No response received from backend.");
    }

  } catch (err) {
    console.error("backend call failed:", err?.message || err);
    await context.sendActivity("Sorry, I couldn't generate a response right now.");
  }
});

module.exports = { agentApp };