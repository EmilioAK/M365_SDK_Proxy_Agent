// agent.js
const { ActivityTypes } = require("@microsoft/agents-activity");
const { AgentApplication, MemoryStorage } = require("@microsoft/agents-hosting");
const axios = require("axios");
const { v4: uuidv4 } = require("uuid");
const config = require("./config");

// Robust join: ensures exactly one slash
function buildEndpoint(base, path) {
  const p = path.startsWith("/") ? path : `/${path}`;
  return new URL(p, base).toString();
}

const ENDPOINT = buildEndpoint(config.backendUrl, config.backendPath);

const storage = new MemoryStorage();
const agentApp = new AgentApplication({ storage });

agentApp.onConversationUpdate("membersAdded", async (context) => {
  // Optional welcome/log
});

agentApp.onActivity(ActivityTypes.Typing, async (context) => {
  // Optional log
});

/**
 * Call an AG-UI compatible backend using the standard HTTP/SSE reference:
 * - POST body is RunAgentInput
 * - Headers: Content-Type: application/json, Accept: text/event-stream
 * - Response: SSE stream of JSON-encoded AG-UI events
 */
async function runAguiAgent(userText, context) {
  const activity = context.activity ?? {};

  // Use the Teams conversation id as threadId so all messages in a chat
  // share the same AG-UI thread.
  const threadId =
    activity.conversation?.id ||
    activity.conversation?.name ||
    uuidv4();

  // New run for each user message
  const runId = uuidv4();

  // Minimal AG-UI RunAgentInput (see docs: threadId, runId, state, messages, tools, context, forwardedProps)
  // https://docs.ag-ui.com/sdk/js/core/types#runagentinput
  const runInput = {
    threadId,
    runId,
    // No parentRunId for now; you can persist last runId per thread and set it here later.
    state: {},            // Placeholder state – can be wired up to real state management later
    messages: [
      {
        id: `user-${runId}`,
        role: "user",
        content: userText ?? "",
        name: activity.from?.name,
      },
    ],
    tools: [],            // No tools for now
    context: [],          // No extra context for now
    forwardedProps: {
      channelId: activity.channelId,
      conversationId: activity.conversation?.id,
      locale: activity.locale,
    },
  };

  const response = await axios.post(ENDPOINT, runInput, {
    headers: {
      "Content-Type": "application/json",
      // Standard AG-UI HTTP client uses SSE with this Accept header
      // https://docs.ag-ui.com/sdk/js/client/http-agent
      Accept: "text/event-stream",
    },
    responseType: "stream",
  });

  return new Promise((resolve, reject) => {
    const stream = response.data;

    let buffer = "";
    const assistantMessages = new Map(); // messageId -> text
    let lastAssistantMessageId = null;
    let finalResult = undefined;
    let sawRunError = false;

    stream.on("data", (chunk) => {
      buffer += chunk.toString("utf8");

      // Normalize line endings and split on SSE event delimiter (blank line)
      const parts = buffer.replace(/\r\n/g, "\n").split("\n\n");
      buffer = parts.pop() ?? "";

      for (const rawEvent of parts) {
        const trimmed = rawEvent.trim();
        if (!trimmed) continue;

        // Parse SSE fields; we only care about `data:` lines.
        const lines = trimmed.split("\n");
        let dataPayload = "";

        for (const line of lines) {
          if (!line || line.startsWith(":")) continue; // comment / heartbeat
          const idx = line.indexOf(":");
          if (idx === -1) continue;

          const field = line.slice(0, idx).trim();
          const value = line.slice(idx + 1).trimStart();

          if (field === "data") {
            if (dataPayload) dataPayload += "\n";
            dataPayload += value;
          }
        }

        if (!dataPayload) continue;

        let event;
        try {
          event = JSON.parse(dataPayload);
        } catch (err) {
          console.warn("Failed to parse AG-UI event JSON:", err);
          continue;
        }

        handleAguiEvent(event);
      }
    });

    stream.on("end", () => {
      const answer = buildFinalAnswer();
      if (!answer && sawRunError) {
        return resolve("Sorry, the agent reported an error while handling your request.");
      }
      if (!answer) {
        return resolve("Sorry, I couldn't generate a response right now.");
      }
      resolve(answer);
    });

    stream.on("error", (err) => {
      reject(err);
    });

    function handleAguiEvent(event) {
      if (!event || typeof event !== "object") return;

      const type = event.type;

      switch (type) {
        // Lifecycle
        case "RUN_STARTED":
          // You could log runId/threadId here if needed
          break;

        case "RUN_FINISHED":
          if ("result" in event) {
            finalResult = event.result;
          }
          break;

        case "RUN_ERROR":
          sawRunError = true;
          console.error("AG-UI run error:", event.message, event.code);
          break;

        // Text message events
        case "TEXT_MESSAGE_START": {
          const { messageId, role } = event;
          if (!messageId) break;

          // Only accumulate assistant messages (role may be omitted; default is assistant per spec)
          if (role && role !== "assistant") break;

          if (!assistantMessages.has(messageId)) {
            assistantMessages.set(messageId, "");
          }
          lastAssistantMessageId = messageId;
          break;
        }

        case "TEXT_MESSAGE_CONTENT": {
          const { messageId, delta } = event;
          if (!messageId || typeof delta !== "string" || !delta) break;

          if (!assistantMessages.has(messageId)) {
            assistantMessages.set(messageId, "");
          }
          assistantMessages.set(
            messageId,
            assistantMessages.get(messageId) + delta
          );
          lastAssistantMessageId = messageId;
          break;
        }

        case "TEXT_MESSAGE_END":
          // Nothing special needed; we already accumulated content
          break;

        // Convenience event that expands to START / CONTENT / END in the AG-UI client
        // We treat it as a simple text stream for now.
        case "TEXT_MESSAGE_CHUNK": {
          const { messageId, delta } = event;
          const id = messageId || lastAssistantMessageId;
          if (!id || typeof delta !== "string" || !delta) break;

          if (!assistantMessages.has(id)) {
            assistantMessages.set(id, "");
          }
          assistantMessages.set(id, assistantMessages.get(id) + delta);
          lastAssistantMessageId = id;
          break;
        }

        // Other event types (tools, state, activity, etc.) are ignored for now.
        default:
          break;
      }
    }

    function buildFinalAnswer() {
      // Prefer the last assistant message we saw
      if (lastAssistantMessageId && assistantMessages.has(lastAssistantMessageId)) {
        return assistantMessages.get(lastAssistantMessageId);
      }

      // Otherwise, if the AG-UI run result is a string, use that
      if (typeof finalResult === "string") {
        return finalResult;
      }

      // Fallback: try some common patterns before stringifying
      if (finalResult && typeof finalResult === "object") {
        if (typeof finalResult.answer === "string") return finalResult.answer;
        if (typeof finalResult.text === "string") return finalResult.text;
        if (typeof finalResult.content === "string") return finalResult.content;
        if (typeof finalResult.result === "string") return finalResult.result;
        try {
          return JSON.stringify(finalResult);
        } catch {
          return "";
        }
      }

      return "";
    }
  });
}

agentApp.onActivity(ActivityTypes.Message, async (context) => {
  const userText = context.activity?.text ?? "";

  try {
    const answer = await runAguiAgent(userText, context);
    await context.sendActivity(answer);
  } catch (err) {
    console.error("AG-UI backend call failed:", err?.message || err);
    await context.sendActivity(
      "Sorry, I couldn't generate a response right now."
    );
  }
});

module.exports = { agentApp };