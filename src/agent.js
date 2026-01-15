const { ActivityTypes } = require("@microsoft/agents-activity");
const { AgentApplication, MemoryStorage } = require("@microsoft/agents-hosting");
const axios = require("axios");
const config = require("./config");

// --- 1. Load Registry on Startup ---
let agentList = [];

async function refreshRegistry() {
  try {
    console.log(`Fetching agents from ${config.agentRegistryUrl}...`);
    const { data } = await axios.get(config.agentRegistryUrl);
    agentList = Array.isArray(data) ? data : [];
    console.log(`Registry loaded: ${agentList.map((a) => a.name).join(", ")}`);
  } catch (err) {
    console.error("Could not load agent registry:", err.message);
  }
}

function getAgentList() {
  return agentList;
}

// Initial fetch
refreshRegistry();

// --- 2. Setup Agent App ---
const storage = new MemoryStorage();
const agentApp = new AgentApplication({ storage });
const http = axios.create({ timeout: 8000 });

const conversationStateKey = (conversationId) => `conversation/${conversationId}`;

async function readConversationState(conversationId) {
  const stateKey = conversationStateKey(conversationId);
  const stateItems = await storage.read([stateKey]);
  return stateItems[stateKey] || {};
}

async function writeConversationState(conversationId, state) {
  const stateKey = conversationStateKey(conversationId);
  await storage.write({ [stateKey]: state });
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
  if (!agent) return null;
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

async function getSelectionForConversation(conversationId) {
  const state = await readConversationState(conversationId);
  if (!state.selectedAgentUrl) return null;
  return {
    id: state.selectedAgentId,
    name: state.selectedAgentName,
    url: state.selectedAgentUrl,
  };
}

// --- 3. Interaction Logic ---
agentApp.onActivity(ActivityTypes.Message, async (context) => {
  const userText = context.activity.text ? context.activity.text.trim() : "";
  const conversationId = context.activity.conversation.id;

  // Define a state key unique to this conversation
  let state = await readConversationState(conversationId);

  // CHECK: Do we have a selected agent yet?
  if (!state.selectedAgentUrl) {
    // logic: Is the user trying to make a selection? (e.g. typing "1", "2")
    const selectionIndex = parseInt(userText) - 1;

    if (!isNaN(selectionIndex)) {
      const agent = findAgentByIndex(selectionIndex);
      if (agent) {
        const selected = await setSelectionForConversation(conversationId, agent);
        await context.sendActivity(`**Connected to ${selected.name}**. \n\nHow can I help you?`);
        return;
      }
    }

    // NO SELECTION: Show the menu
    if (agentList.length === 0) {
      await context.sendActivity("System: No agents found in registry. Trying to refresh...");
      await refreshRegistry();
      return;
    }

    let menu = "**Please select an agent by typing the number:**\n\n";
    agentList.forEach((agent, index) => {
      menu += `${index + 1}. ${agent.name}\n`;
    });

    await context.sendActivity(menu);
    return; // Stop here, wait for next message (the selection)
  }

  // --- 4. Proxy Logic (User has already selected an agent) ---

  // Optional: "Switch" command to go back to menu
  if (userText.toLowerCase() === "switch") {
    await storage.delete([conversationStateKey(conversationId)]);
    await context.sendActivity("Agent selection cleared.");
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

    // Handle response format
    let answer;
    if (typeof data === "string") answer = data;
    else if (data && typeof data === "object") {
      answer = data.answer || data.result || data.content || JSON.stringify(data);
    } else {
      answer = String(data);
    }

    await context.sendActivity(`[${state.selectedAgentName}] ${answer}`);
  } catch (err) {
    await context.sendActivity(`[System] Error contacting ${state.selectedAgentName}: ${err.message}`);
  }
});

module.exports = {
  agentApp,
  refreshRegistry,
  getAgentList,
  setSelectionForConversationById,
  getSelectionForConversation,
};
