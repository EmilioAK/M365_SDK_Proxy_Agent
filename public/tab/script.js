const statusEl = document.getElementById("status");
const agentsEl = document.getElementById("agents");

let conversationId = null;
let selectedAgentId = null;

function setStatus(message, tone = "info") {
  statusEl.textContent = message;
  statusEl.className = `status ${tone}`;
}

function highlightSelected() {
  const buttons = agentsEl.querySelectorAll("button.agent");
  buttons.forEach((btn) => {
    const isSelected = btn.dataset.agentId === selectedAgentId;
    btn.classList.toggle("selected", isSelected);
  });
}

function getConversationIdFromQuery() {
  const params = new URLSearchParams(window.location.search);
  return params.get("conversationId");
}

async function loadContext() {
  conversationId = getConversationIdFromQuery();

  if (!window.microsoftTeams || !window.microsoftTeams.app) {
    return;
  }

  try {
    await window.microsoftTeams.app.initialize();
    const context = await window.microsoftTeams.app.getContext();
    conversationId =
      conversationId ||
      context?.chat?.id ||
      context?.channel?.id ||
      context?.conversation?.id ||
      null;
  } catch (err) {
    console.warn("Could not initialize Teams SDK:", err);
  }
}

async function loadAgents() {
  try {
    const res = await fetch("/api/agents");
    if (!res.ok) {
      throw new Error(`Request failed with status ${res.status}`);
    }
    const { agents } = await res.json();

    if (!Array.isArray(agents) || agents.length === 0) {
      setStatus("No agents found in the registry.", "error");
      agentsEl.innerHTML = "";
      return;
    }

    agentsEl.innerHTML = "";
    agents.forEach((agent) => {
      const button = document.createElement("button");
      const id = agent.id || agent.name || agent.url;
      button.className = "agent";
      button.dataset.agentId = id;
      button.innerHTML = `
        <span class="agent-name">${agent.name || id}</span>
        <span class="agent-meta">${agent.id ? agent.id : agent.url}</span>
      `;
      button.addEventListener("click", () => selectAgent(id));
      agentsEl.appendChild(button);
    });

    setStatus("Pick an agent to route your chat.", "info");
    highlightSelected();
  } catch (err) {
    console.error(err);
    setStatus(`Could not load agents: ${err.message}`, "error");
  }
}

async function loadCurrentSelection() {
  if (!conversationId) return;
  try {
    const res = await fetch(`/api/selection?conversationId=${encodeURIComponent(conversationId)}`);
    if (!res.ok) {
      throw new Error(`Request failed with status ${res.status}`);
    }

    const { selection } = await res.json();
    selectedAgentId = selection?.id || null;
    highlightSelected();

    if (selection) {
      setStatus(`Currently connected to ${selection.name || selection.id}.`, "success");
    }
  } catch (err) {
    console.warn("Could not load current selection:", err);
  }
}

async function selectAgent(agentId) {
  if (!conversationId) {
    setStatus("Missing conversation id. Open this tab in Teams.", "error");
    return;
  }

  setStatus("Switching agent…", "info");

  try {
    const res = await fetch("/api/select-agent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conversationId, agentId }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || `Request failed with status ${res.status}`);
    }

    const { selection } = await res.json();
    selectedAgentId = selection?.id || agentId;
    highlightSelected();
    setStatus(`Now connected to ${selection?.name || agentId}.`, "success");
  } catch (err) {
    console.error(err);
    setStatus(`Could not switch agent: ${err.message}`, "error");
  }
}

async function init() {
  await loadContext();

  if (!conversationId) {
    setStatus("Open this tab in Teams to capture the chat context.", "error");
    return;
  }

  await loadAgents();
  await loadCurrentSelection();
}

init();
