const { ActivityTypes } = require("@microsoft/agents-activity");
const { AgentApplication, MemoryStorage } = require("@microsoft/agents-hosting");
const axios = require("axios");
const fs = require("fs");
const path = require("path");
const config = require("./config");
const { registerEventHandler, dispatchEvent } = require("./eventMapper");
const { aguiUiToAdaptiveCard, adaptiveSubmitToAguiEvent } = require("./aguiAdapter");

// --- 1. Load Registry on Startup ---
let agentList = [];
const defaultBackendUrl = process.env.BACKEND_URL || "http://127.0.0.1:8000";

function loadAgentsFromJson() {
  try {
    const agentsPath = path.join(__dirname, "..", "agents.json");
    if (fs.existsSync(agentsPath)) {
      const data = JSON.parse(fs.readFileSync(agentsPath, "utf-8"));
      agentList = Array.isArray(data) ? data : [];
      console.log(`Agents loaded from agents.json: ${agentList.map((a) => a.name).join(", ")}`);
      return true;
    }
  } catch (err) {
    console.error("Could not load agents.json:", err.message);
  }
  return false;
}

function ensureFallbackAgent() {
  if (agentList.length > 0) {
    return;
  }

  // Keep local demo usable when no registry/JSON is available.
  agentList = [{ id: "default", name: "Default Backend", url: defaultBackendUrl }];
  console.warn(`Using fallback agent at ${defaultBackendUrl} (no registry found).`);
}

async function refreshRegistry() {
  try {
    console.log(`Fetching agents from ${config.agentRegistryUrl}...`);
    const { data } = await axios.get(config.agentRegistryUrl);
    agentList = Array.isArray(data) ? data : [];
    ensureFallbackAgent();
    console.log(`Registry loaded: ${agentList.map((a) => a.name).join(", ")}`);
  } catch (err) {
    console.error("Could not load agent registry:", err.message);
    // Try loading from JSON before fallback
    if (!loadAgentsFromJson()) {
      ensureFallbackAgent();
    }
  }
}

function getAgentList() {
  return agentList;
}

// Initial load: try JSON first, then HTTP registry, then fallback
loadAgentsFromJson() || refreshRegistry();

// --- 2A. Register Example Event Handlers ---
// Example: FinOps agent emits a "selectResource" event
registerEventHandler("agent:finops:selectResource", async (context, { agentId, data }) => {
  const resourceId = data.resourceId;
  const resourceName = data.resourceName;

  console.log(`[FinOps] Resource selected: ${resourceName} (${resourceId})`);

  // Update conversation state with the selection
  const conversationId = context.activity.conversation.id;
  const state = await readConversationState(conversationId);
  state.selectedResource = { id: resourceId, name: resourceName };
  await writeConversationState(conversationId, state);

  // Respond to user
  await context.sendActivity(
    `✅ **${resourceName}** selected (ID: \`${resourceId}\`). Analyzing optimization opportunities...`
  );
});

// Example: Snowflake agent emits a "queryResult" event
registerEventHandler("agent:snowflake:queryResult", async (context, { agentId, data }) => {
  const query = data.query;
  const rowCount = data.rowCount;

  console.log(`[Snowflake] Query executed: ${rowCount} rows returned`);

  const conversationId = context.activity.conversation.id;
  const state = await readConversationState(conversationId);
  state.lastQuery = { text: query, rowCount };
  await writeConversationState(conversationId, state);

  await context.sendActivity(
    `📊 Query executed successfully: **${rowCount}** rows returned\n\`\`\`${query}\`\`\``
  );
});

// Generic event handler: fallback for any "analyze" event across agents
registerEventHandler("*:analyze", async (context, { agentId, data }) => {
  const subject = data.subject || "unknown";
  console.log(`[AG-UI] Generic analyze event for: ${subject} from ${agentId}`);
  await context.sendActivity(`🔍 Analyzing **${subject}** via ${agentId}...`);
});

// --- 2. Setup Agent App ---
const storage = new MemoryStorage();
const agentApp = new AgentApplication({ storage });
const http = axios.create({ timeout: 8000 });

const conversationStateKey = (conversationId) => `conversation/${conversationId}`;
const userStateKey = (userId) => `user/${userId}`;

async function readConversationState(conversationId) {
  if (!conversationId) return {};
  const stateKey = conversationStateKey(conversationId);
  const stateItems = await storage.read([stateKey]);
  return stateItems[stateKey] || {};
}

async function writeConversationState(conversationId, state) {
  if (!conversationId) return;
  const stateKey = conversationStateKey(conversationId);
  await storage.write({ [stateKey]: state });
}

async function readUserState(userId) {
  if (!userId) return {};
  const stateKey = userStateKey(userId);
  const stateItems = await storage.read([stateKey]);
  return stateItems[stateKey] || {};
}

async function writeUserState(userId, state) {
  if (!userId) return;
  const stateKey = userStateKey(userId);
  await storage.write({ [stateKey]: state });
}

async function clearConversationSelection(conversationId) {
  if (!conversationId) return;
  await storage.delete([conversationStateKey(conversationId)]);
}

async function clearUserSelection(userId) {
  if (!userId) return;
  await storage.delete([userStateKey(userId)]);
}

function findAgentByIndex(index) {
  return agentList[index];
}

function findAgentById(agentKey) {
  return agentList.find(
    (agent) => agent.id === agentKey || agent.name === agentKey || agent.url === agentKey
  );
}

async function setSelectionForConversation(conversationId, agent) {
  if (!agent || !conversationId) return null;
  const state = await readConversationState(conversationId);
  state.selectedAgentUrl = agent.url;
  state.selectedAgentName = agent.name;
  state.selectedAgentId = agent.id || agent.name || agent.url;
  await writeConversationState(conversationId, state);
  return { id: state.selectedAgentId, name: state.selectedAgentName, url: state.selectedAgentUrl };
}

async function setSelectionForConversationById(conversationId, agentId) {
  if (!agentList.length) {
    await refreshRegistry();
  }

  let agent = findAgentById(agentId);
  if (!agent) {
    await refreshRegistry();
    agent = findAgentById(agentId);
  }

  return setSelectionForConversation(conversationId, agent);
}

async function setSelectionForUserById(userId, agentId) {
  if (!agentList.length) {
    await refreshRegistry();
  }

  let agent = findAgentById(agentId);
  if (!agent) {
    await refreshRegistry();
    agent = findAgentById(agentId);
  }

  if (!agent || !userId) return null;
  const state = await readUserState(userId);
  state.selectedAgentUrl = agent.url;
  state.selectedAgentName = agent.name;
  state.selectedAgentId = agent.id || agent.name || agent.url;
  await writeUserState(userId, state);
  return { id: state.selectedAgentId, name: state.selectedAgentName, url: state.selectedAgentUrl };
}

async function getSelectionForConversation(conversationId) {
  const state = await readConversationState(conversationId);
  if (!state.selectedAgentUrl) return null;
  return {
    id: state.selectedAgentId,
    name: state.selectedAgentName,
    url: state.selectedAgentUrl,
  };
}

async function getSelectionForUser(userId) {
  const state = await readUserState(userId);
  if (!state.selectedAgentUrl) return null;
  return {
    id: state.selectedAgentId,
    name: state.selectedAgentName,
    url: state.selectedAgentUrl,
  };
}

// --- 3. Agent List Formatter (text-based menu) ---
function buildAgentMenuText() {
  let menu = "**Available Agents:**\n\n";
  agentList.forEach((agent, index) => {
    menu += `${index + 1}. **${agent.name}**\n`;
    if (agent.description) {
      menu += `   ${agent.description}\n`;
    }
  });
  menu += "\nType the number to select an agent.";
  return menu;
}

function toNormalizedText(value) {
  return (value || "").trim().toLowerCase();
}

function parseAgentSelectionInput(userText) {
  const selectionIndex = parseInt(userText, 10) - 1;
  if (!isNaN(selectionIndex) && selectionIndex >= 0) {
    return findAgentByIndex(selectionIndex);
  }
  return findAgentById(userText);
}

async function handleListCommand(context, conversationId, userAadId) {
  await clearConversationSelection(conversationId);
  if (userAadId) {
    await clearUserSelection(userAadId);
  }

  if (agentList.length === 0) {
    await context.sendActivity("No agents available. Refreshing...");
    loadAgentsFromJson() || (await refreshRegistry());
  }

  if (agentList.length > 0) {
    await context.sendActivity(buildAgentMenuText());
  } else {
    await context.sendActivity("No agents found.");
  }
}

async function handleSwitchCommand(context, conversationId, userAadId) {
  await clearConversationSelection(conversationId);
  if (userAadId) {
    await clearUserSelection(userAadId);
  }
  await context.sendActivity(buildAgentMenuText());
}

function mapBackendResponse(data, selectedAgentId) {
  if (typeof data === "string") {
    return { answer: data, card: null };
  }

  if (data && typeof data === "object") {
    if (data.card) {
      return { answer: data.text || "Card sent", card: data.card };
    }

    if (data.aguiUi) {
      return {
        answer: data.text || data.aguiUi.title || "Card sent",
        card: aguiUiToAdaptiveCard(data.aguiUi, { agentId: selectedAgentId }),
      };
    }

    return {
      answer: data.answer || data.result || data.content || JSON.stringify(data),
      card: null,
    };
  }

  return { answer: String(data), card: null };
}

async function tryHandleCardSubmitAsMessage(context, conversationId, userAadId) {
  const cardEvent = adaptiveSubmitToAguiEvent(context.activity.value, {
    channelId: context.activity.channelId,
    conversationId,
    userAadId,
  });

  if (!cardEvent) {
    return false;
  }

  const currentSelection = await getSelectionForConversation(conversationId);
  const resolvedAgentId = cardEvent.agentId || currentSelection?.id || "unknown";
  console.log(
    `[Card Action via Message] eventType: ${cardEvent.type}, agentId: ${resolvedAgentId}`,
    cardEvent.payload
  );
  await dispatchEvent(context, cardEvent.type, resolvedAgentId, cardEvent.payload);
  return true;
}

// --- 4. Interaction Logic ---
agentApp.onActivity(ActivityTypes.Message, async (context) => {
  const userText = context.activity.text ? context.activity.text.trim() : "";
  const commandText = toNormalizedText(userText);
  const conversationId = context.activity.conversation.id;
  const userAadId = context.activity.from?.aadObjectId || null;

  // Playground sends Action.Submit as message activities with payload in activity.value.
  if (await tryHandleCardSubmitAsMessage(context, conversationId, userAadId)) {
    return;
  }

  // Define a state key unique to this conversation.
  let state = await readConversationState(conversationId);
  const userSelection = userAadId ? await getSelectionForUser(userAadId) : null;

  if (commandText === "list") {
    await handleListCommand(context, conversationId, userAadId);
    return;
  }

  // CHECK: Do we have a selected agent yet?
  if (!state.selectedAgentUrl) {
    // If the user picked an agent in the tab (user-level), inherit it for this conversation.
    if (userSelection) {
      await setSelectionForConversation(conversationId, userSelection);
      state = await readConversationState(conversationId);
    }

    // logic: Is the user trying to make a selection? (e.g. typing "1", "2" or agent id)
    const agent = parseAgentSelectionInput(userText);

    if (agent) {
      const selected = await setSelectionForConversation(conversationId, agent);
      if (userAadId) {
        await setSelectionForUserById(userAadId, agent.id || agent.name || agent.url);
      }
      await context.sendActivity(`**Connected to ${selected.name}**. \n\nHow can I help you?\n\n(Type "list" to switch agents)`);
      return;
    }

    // NO SELECTION: Show the menu
    if (agentList.length === 0) {
      await context.sendActivity("System: No agents found. Type 'list' to refresh and see available agents.");
      return;
    }

    let menu = "**Please select an agent:**\n\n";
    agentList.forEach((agent, index) => {
      menu += `${index + 1}. ${agent.name}\n`;
    });
    menu += "\n*Or type 'list' for interactive agent selector*";

    await context.sendActivity(menu);
    return; // Stop here, wait for next message (the selection)
  }

  // If user-level selection differs from conversation state, sync it.
  if (
    userSelection &&
    (state.selectedAgentId !== userSelection.id || state.selectedAgentUrl !== userSelection.url)
  ) {
    await setSelectionForConversation(conversationId, userSelection);
    state = await readConversationState(conversationId);
    await context.sendActivity(`**Switched to ${state.selectedAgentName}**.`);
  }

  // --- 5. Proxy Logic (User has already selected an agent) ---

  // "switch" command: clear selection and show menu
  if (commandText === "switch") {
    await handleSwitchCommand(context, conversationId, userAadId);
    return;
  }

  // Forward to the SPECIFIC agent url saved in state
  try {
    const targetUrl = new URL("/chat", state.selectedAgentUrl).toString();

    const { data } = await http.post(
      targetUrl,
      { prompt: userText },
      { headers: { "Content-Type": "application/json" } }
    );

    const { answer, card } = mapBackendResponse(data, state.selectedAgentId);

    // If backend sent a card, inject event mappers and send as attachment
    if (card) {
      const enrichedCard = injectEventMappers(card, state.selectedAgentId);
      await context.sendActivity({
        type: "message",
        text: answer,
        attachments: [
          {
            contentType: "application/vnd.microsoft.card.adaptive",
            content: enrichedCard,
          },
        ],
      });
    } else {
      // Send simple text response
      await context.sendActivity(`[${state.selectedAgentName}] ${answer}`);
    }
  } catch (err) {
    await context.sendActivity(`[System] Error contacting ${state.selectedAgentName}: ${err.message}`);
  }
});

// --- 5. Adaptive Card / Event Handler (onInvoke) ---
agentApp.onActivity(ActivityTypes.Invoke, async (context) => {
  const activity = context.activity;

  // Pattern 1: teams.agui.event - indicates it's a mapped AG-UI event
  if (activity.name === "teams.agui.event") {
    const { eventType, agentId, data } = activity.value || {};
    console.log(`[Event Mapper] Received AG-UI event: ${eventType} from ${agentId}`, data);

    // Dispatch to the registered event handler
    await dispatchEvent(context, eventType, agentId, data);

    // Always respond to invoke activities
    return context.sendActivity({
      id: activity.id,
      type: ActivityTypes.InvokeResponse,
      value: { status: 200, body: { processed: true } },
    });
  }

  // Pattern 2: adaptiveCard/action - standard Adaptive Card action
  if (activity.name === "adaptiveCard/action") {
    const { action, agentId, eventType, ...payload } = activity.value || {};
    console.log(`[Adaptive Card] Action: ${action} from agent ${agentId}`, payload);

    // If eventType is in the card data, dispatch it
    if (eventType) {
      await dispatchEvent(context, eventType, agentId, payload);
    } else {
      // Fallback: send a generic action message
      await context.sendActivity(`[Card Action] ${action} from ${agentId}`);
    }

    return context.sendActivity({
      id: activity.id,
      type: ActivityTypes.InvokeResponse,
      value: { status: 200, body: { action_processed: true } },
    });
  }

  // Unknown invoke - return 404
  console.warn(`[Invoke] Unknown activity name: ${activity.name}`);
  return context.sendActivity({
    id: activity.id,
    type: ActivityTypes.InvokeResponse,
    value: { status: 404, body: { error: "Unknown invoke activity" } },
  });
});

// --- 6. Adaptive Card Helpers ---
/**
 * Inject event mapping data into Adaptive Card actions
 * Transforms Action.Submit buttons to include eventType and agentId for AG-UI routing
 */
function injectEventMappers(card, agentId) {
  if (!card) return card;

  if (card.actions && Array.isArray(card.actions)) {
    card.actions = card.actions.map((action) => ({
      ...action,
      data: {
        ...action.data,
        agentId,
        eventType: action.data?.eventType || `agent:${agentId}:action`,
      },
    }));
  }

  return card;
}

module.exports = {
  agentApp,
  refreshRegistry,
  getAgentList,
  setSelectionForConversationById,
  setSelectionForUserById,
  getSelectionForConversation,
  getSelectionForUser,
};
