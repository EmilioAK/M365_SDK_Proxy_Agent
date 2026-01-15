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
    console.log(`Registry loaded: ${agentList.map(a => a.name).join(", ")}`);
  } catch (err) {
    console.error("Could not load agent registry:", err.message);
  }
}

// Initial fetch
refreshRegistry();

// --- 2. Setup Agent App ---
const storage = new MemoryStorage();
const agentApp = new AgentApplication({ storage });
const http = axios.create({ timeout: 8000 });

// --- 3. Interaction Logic ---
agentApp.onActivity(ActivityTypes.Message, async (context) => {
  const userText = context.activity.text ? context.activity.text.trim() : "";
  
  // Define a state key unique to this conversation
  const stateKey = `conversation/${context.activity.conversation.id}`;
  const stateItems = await storage.read([stateKey]);
  let state = stateItems[stateKey] || {};

  // CHECK: Do we have a selected agent yet?
  if (!state.selectedAgentUrl) {
    
    // logic: Is the user trying to make a selection? (e.g. typing "1", "2")
    const selectionIndex = parseInt(userText) - 1;
    
    if (!isNaN(selectionIndex) && agentList[selectionIndex]) {
      // VALID SELECTION: Save it to state
      const selected = agentList[selectionIndex];
      state.selectedAgentUrl = selected.url;
      state.selectedAgentName = selected.name;
      
      // Save state
      await storage.write({ [stateKey]: state });
      
      await context.sendActivity(`**Connected to ${selected.name}**. \n\nHow can I help you?`);
      return; 
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
    await storage.delete([stateKey]);
    await context.sendActivity("Agent selection cleared.");
    // Force the menu to show immediately by calling yourself (optional) or just wait for next input
    return;
  }

  // Forward to the SPECIFIC agent url saved in state
  try {
    // Determine target endpoint (assumes agent listens on /chat or root, adjusting for your specific backend)
    // Based on your registry, the URL is "http://127.0.0.1:8000"
    // We append "/chat" or similar if your backend requires it, otherwise use raw.
    // Assuming backend needs strict URL + path:
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

module.exports = { agentApp };